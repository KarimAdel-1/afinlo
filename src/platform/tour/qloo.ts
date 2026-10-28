// The tour agent's Qloo tools: resolve an act, read its audience (taste tags, demographics, cross-domain loves), map where
// it over-indexes (heatmap), and find brands, support acts and local spots. Every result keeps its Qloo ID. Calls go
// through the shared client (timeouts, bounded retries, traces) and the 24-hour cache.
import { z } from "zod";
import type { TasteTrace } from "@/core/taste/types";
import type { Act, Brand, CityPlace, PlanEntity } from "@/core/tour/types";
import type { BrandResult, HeatCell } from "@/core/tour/scoring";
import { QlooClient, safeImage, website } from "../taste/qloo";
import { qlooCache } from "./store";

/** At most `limit` requests in flight: the agent's parallel stages stay gentle on an API with unpublished limits. */
export function limited(fetcher: typeof fetch, limit: number): typeof fetch {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async (...args) => {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await fetcher(...args);
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}
const shared = limited((...args) => fetch(...args), 4);
export const qlooClient = () => new QlooClient({ cache: qlooCache, fetcher: shared });

const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const ID = z.string().regex(/^[0-9a-fA-F-]{36}$/);
const tagIds = (v: unknown) => list(v).map((t) => str(record(t).id || record(t).tag_id, 200)).filter((id) => id.startsWith("urn:tag:"));

/** An entity as a plan shows it. Undefined when Qloo's record lacks an ID or name. */
export function planEntity(v: unknown): PlanEntity | undefined {
  const r = record(v);
  const id = ID.safeParse(r.entity_id);
  const type = str(r.subtype) || str(list(r.types)[0]) || str(r.type);
  if (!id.success || !str(r.name)) return undefined;
  return {
    id: id.data.toUpperCase(),
    name: str(r.name, 200),
    type: type.replace("urn:entity:", ""),
    disambiguation: str(r.disambiguation, 200) || undefined,
    popularity: num(r.popularity),
    image: safeImage(record(record(r.properties).image).url),
  };
}

const entities = (body: unknown) => {
  const results = record(body).results;
  return list(Array.isArray(results) ? results : record(results).entities);
};
const COMEDY = /\b(comedian|comedy|stand-?up|comic)\b/i;
function toAct(v: unknown, kind?: Act["kind"]): Act | undefined {
  const e = planEntity(v);
  if (!e) return undefined;
  const r = record(v),
    p = record(r.properties);
  const description = str(p.short_description || p.description, 400);
  return {
    id: e.id,
    name: e.name,
    kind: kind ?? (e.type === "person" ? "person" : "artist"),
    description,
    disambiguation: e.disambiguation && e.disambiguation !== e.name ? e.disambiguation : "",
    popularity: e.popularity,
    comedian: COMEDY.test(description) || tagIds(r.tags).some((t) => /comed/.test(t)),
    image: e.image,
  };
}

/** Acts matching a name, as artists and as people (some comedians are only people in Qloo), for the user to confirm. */
export async function searchActs(client: QlooClient, query: string, traces: TasteTrace[], signal?: AbortSignal): Promise<Act[]> {
  const found: Act[] = [];
  for (const [type, kind] of [["urn:entity:artist", "artist"], ["urn:entity:person", "person"]] as const) {
    const body = await client.request("qloo_search", "/search", { query, types: type, take: "6" }, traces, signal);
    for (const v of entities(body)) {
      const act = toAct(v, kind);
      if (act && !found.some((f) => f.id === act.id || (f.name === act.name && f.description === act.description))) found.push(act);
    }
  }
  // Exact name matches first; otherwise Qloo's order.
  const exact = (a: Act) => (a.name.toLowerCase() === query.trim().toLowerCase() ? 0 : 1);
  return found.sort((a, b) => exact(a) - exact(b)).slice(0, 8);
}

export async function actById(client: QlooClient, id: string, traces: TasteTrace[], signal?: AbortSignal): Promise<Act | undefined> {
  const body = await client.request("qloo_entities", "/entities", { entity_ids: id }, traces, signal);
  return toAct(entities(body)[0]);
}

function toBrand(v: unknown): Brand | undefined {
  const e = planEntity(v);
  if (!e) return undefined;
  const r = record(v),
    p = record(r.properties);
  return { ...e, description: str(p.short_description || p.description, 400), categories: tagIds(r.tags).filter((t) => t.startsWith("urn:tag:genre:brand:")) };
}

/** Brands matching a name, for the visitor to confirm. Exact name matches first. */
export async function searchBrands(client: QlooClient, query: string, traces: TasteTrace[], signal?: AbortSignal): Promise<Brand[]> {
  const body = await client.request("qloo_search", "/search", { query, types: "urn:entity:brand", take: "8" }, traces, signal);
  const found = entities(body).flatMap((v) => toBrand(v) ?? []);
  const exact = (b: Brand) => (b.name.toLowerCase() === query.trim().toLowerCase() ? 0 : 1);
  return found.sort((a, b) => exact(a) - exact(b));
}

export async function brandById(client: QlooClient, id: string, traces: TasteTrace[], signal?: AbortSignal): Promise<Brand | undefined> {
  const body = await client.request("qloo_entities", "/entities", { entity_ids: id }, traces, signal);
  const brand = toBrand(entities(body)[0]);
  return brand?.type.startsWith("brand") ? brand : undefined;
}

/** Comedians, as Qloo tags people. */
export const COMEDIAN_TAG = "urn:tag:genre:person:comedian";

/** The acts a brand's audience over-indexes for: musicians (artists) or comedians (people Qloo tags as comedians). */
export async function actsForBrand(client: QlooClient, brandId: string, kind: "music" | "comedy", traces: TasteTrace[], signal?: AbortSignal): Promise<{ act: Act; affinity: number }[]> {
  const params: Record<string, string> =
    kind === "music"
      ? { "filter.type": "urn:entity:artist", "signal.interests.entities": brandId, take: "10" }
      : { "filter.type": "urn:entity:person", "filter.tags": COMEDIAN_TAG, "signal.interests.entities": brandId, take: "10" };
  return (await insightEntities(client, params, traces, signal)).flatMap((v) => {
    const act = toAct(v, kind === "music" ? "artist" : "person");
    const affinity = num(record(record(v).query).affinity);
    return act && affinity !== undefined ? [{ act: kind === "comedy" ? { ...act, comedian: true } : act, affinity }] : [];
  });
}

/**
 * Where the signal's audience over-indexes: Qloo's heatmap cells, in an area given as a WKT shape (a region's box,
 * countries' boxes, the world) or, by default, across the United States. Qloo sizes the cells to the area: about 5 km
 * for one country, 40 km for a region, 150 km for the world.
 */
export async function heatCells(client: QlooClient, ids: string[], traces: TasteTrace[], signal?: AbortSignal, location?: string): Promise<HeatCell[]> {
  const start = traces.length;
  const area: Record<string, string> = location ? { "filter.location": location } : { "filter.location.query": "United States" };
  const body = await client.request("qloo_heatmap", "/v2/insights", { "filter.type": "urn:heatmap", "signal.interests.entities": ids.join(","), ...area, take: "10" }, traces, signal);
  const cells = list(record(record(body).results).heatmap).flatMap((c) => {
    const loc = record(record(c).location),
      q = record(record(c).query);
    const lat = num(loc.latitude),
      lon = num(loc.longitude),
      affinity = num(q.affinity);
    return lat !== undefined && lon !== undefined && affinity !== undefined ? [{ lat, lon, affinity }] : [];
  });
  traces[start].count = cells.length;
  return cells;
}

const insightEntities = async (client: QlooClient, params: Record<string, string>, traces: TasteTrace[], signal?: AbortSignal) => {
  const start = traces.length;
  const body = await client.request("qloo_recommend", "/v2/insights", params, traces, signal);
  const out = entities(body);
  traces[start].count = out.length;
  return out;
};

/**
 * Brands this audience loves, with their Qloo brand genre tags; one request per requested category. With the tour's
 * area as a location signal, Qloo leans toward the brands of the audience there (Anghami and Deezer MENA for a
 * Middle East tour).
 */
export async function brands(client: QlooClient, ids: string[], categoryTags: string[], traces: TasteTrace[], signal?: AbortSignal, location?: string): Promise<BrandResult[]> {
  const requests = categoryTags.length ? categoryTags.map((tag) => ({ "filter.tags": tag, take: "12" })) : [{ take: "30" }];
  const near: Record<string, string> = location ? { "signal.location": location } : {};
  const out: BrandResult[] = [];
  for (const extra of requests) {
    for (const v of await insightEntities(client, { "filter.type": "urn:entity:brand", "signal.interests.entities": ids.join(","), ...near, ...extra }, traces, signal)) {
      const e = planEntity(v);
      const affinity = num(record(record(v).query).affinity);
      if (!e || affinity === undefined || out.some((b) => b.id === e.id)) continue;
      out.push({ id: e.id, name: e.name, affinity, popularity: e.popularity, image: e.image, tags: tagIds(record(v).tags).filter((t) => t.startsWith("urn:tag:genre:brand:")) });
    }
  }
  return out.sort((a, b) => b.affinity - a.affinity);
}

/** Taste tags Qloo associates with the audience (limited to music-related tag kinds, which are the most telling). */
export async function audienceTags(client: QlooClient, ids: string[], traces: TasteTrace[], signal?: AbortSignal) {
  const start = traces.length;
  const body = await client.request(
    "qloo_taste_tags",
    "/v2/insights",
    { "filter.type": "urn:tag", "signal.interests.entities": ids.join(","), "filter.parents.types": "urn:entity:artist", take: "12" },
    traces,
    signal,
  );
  const tags = list(record(record(body).results).tags).flatMap((t) => {
    const id = str(record(t).tag_id || record(t).id, 200),
      name = str(record(t).name, 80).trim();
    return id.startsWith("urn:tag:") && name ? [{ id, name }] : [];
  });
  traces[start].count = tags.length;
  // Qloo sometimes returns the same word under two tag kinds.
  return tags.filter((t, i) => tags.findIndex((x) => x.name.toLowerCase() === t.name.toLowerCase()) === i).slice(0, 10);
}

const AGE_LABELS: Record<string, string> = {
  "24_and_younger": "Under 25",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55+",
};
/** Aggregate age and gender skews of the audience, relative to Qloo's average. About the audience, not anyone in it. */
export async function demographics(client: QlooClient, ids: string[], traces: TasteTrace[], signal?: AbortSignal) {
  const start = traces.length;
  const body = await client.request("qloo_demographics", "/v2/insights", { "filter.type": "urn:demographics", "signal.interests.entities": ids.join(",") }, traces, signal);
  const q = record(record(list(record(record(body).results).demographics)[0]).query);
  const age = record(q.age),
    gender = record(q.gender);
  const bands = Object.keys(AGE_LABELS).flatMap((k) => (num(age[k]) !== undefined ? [{ band: AGE_LABELS[k], skew: num(age[k])! }] : []));
  traces[start].count = bands.length;
  const male = num(gender.male),
    female = num(gender.female);
  return bands.length && male !== undefined && female !== undefined ? { age: bands, gender: { male, female } } : undefined;
}

const LOVES: [string, string][] = [
  ["urn:entity:movie", "Film"],
  ["urn:entity:tv_show", "TV"],
  ["urn:entity:podcast", "Podcast"],
  ["urn:entity:book", "Book"],
];
/** The audience's top pick in other domains: one film, show, podcast and book. */
export async function loves(client: QlooClient, ids: string[], traces: TasteTrace[], signal?: AbortSignal) {
  const out: { label: string; entity: PlanEntity }[] = [];
  for (const [type, label] of LOVES) {
    const found = await insightEntities(client, { "filter.type": type, "signal.interests.entities": ids.join(","), take: "1" }, traces, signal).catch(() => []);
    const top = planEntity(found[0]);
    if (top) out.push({ label, entity: top });
  }
  return out;
}

/** Acts whose audiences overlap with this one: for support slots and, when the act's own data is thin, as its signal. */
export async function similarActs(client: QlooClient, act: Act, traces: TasteTrace[], signal?: AbortSignal): Promise<(PlanEntity & { affinity: number; comedian: boolean })[]> {
  const params: Record<string, string> = { "filter.type": "urn:entity:artist", "signal.interests.entities": act.id, "filter.exclude.entities": act.id, take: "10" };
  return (await insightEntities(client, params, traces, signal)).flatMap((v) => {
    const e = planEntity(v);
    const affinity = num(record(record(v).query).affinity);
    const description = str(record(record(v).properties).short_description || record(record(v).properties).description, 400);
    return e && affinity !== undefined && e.id !== act.id ? [{ ...e, affinity, comedian: COMEDY.test(description) }] : [];
  });
}

/**
 * Co-headliners to suggest: the acts whose audiences overlap most with this one's, of the same kind (comedians for a
 * comedian, as Qloo tags people; artists otherwise), strongest overlap first.
 */
export async function pairSuggestions(client: QlooClient, act: Act, traces: TasteTrace[], signal?: AbortSignal): Promise<Act[]> {
  const params: Record<string, string> = act.comedian
    ? { "filter.type": "urn:entity:person", "filter.tags": COMEDIAN_TAG, "signal.interests.entities": act.id, "filter.exclude.entities": act.id, take: "8" }
    : { "filter.type": "urn:entity:artist", "signal.interests.entities": act.id, "filter.exclude.entities": act.id, take: "8" };
  return (await insightEntities(client, params, traces, signal)).flatMap((v) => {
    const found = toAct(v, act.comedian ? "person" : "artist");
    return found && found.id !== act.id ? [act.comedian ? { ...found, comedian: true } : found] : [];
  });
}

/** Taste tags two audiences share (Qloo compare), without the region tags every US act shares: at most `max`. */
export async function sharedTags(client: QlooClient, a: string, b: string, traces: TasteTrace[], signal?: AbortSignal, max = 3) {
  const start = traces.length;
  const body = await client.request("qloo_compare", "/v2/insights/compare", { "a.signal.interests.entities": a, "b.signal.interests.entities": b, take: "8" }, traces, signal);
  const tags = list(record(record(body).results).tags).flatMap((t) => {
    const name = str(record(t).name, 60).trim(),
      kind = str(record(t).subtype || record(t).type, 120);
    return name && !kind.includes(":region") ? [name] : [];
  });
  traces[start].count = tags.length;
  return [...new Set(tags)].slice(0, max);
}

/** A Qloo place: what it is (its primary genre, else a category tag), where, and its rating and price level. */
function toPlace(v: unknown): CityPlace | undefined {
  const e = planEntity(v);
  if (!e) return undefined;
  const r = record(v),
    p = record(r.properties),
    at = record(r.location);
  const category = list(r.tags)
    .map(record)
    .find((t) => str(t.tag_id || t.id, 200).startsWith("urn:tag:category:place:"));
  const lat = num(at.lat),
    lon = num(at.lon);
  return {
    ...e,
    address: str(p.address, 200) || e.disambiguation,
    kind: str(record(p.primary_genre).name, 60) || str(category?.name, 60) || undefined,
    website: website(p.website),
    rating: num(p.business_rating),
    priceLevel: num(p.price_level),
    affinity: num(record(r.query).affinity),
    ...(lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : {}),
  };
}

/** Places within 20 km of a city's centre that this audience loves; with a tag, only that kind (venues, bars, shops). */
export async function placesNear(
  client: QlooClient,
  ids: string[],
  city: { lat: number; lon: number },
  options: { tag?: string; take?: number },
  traces: TasteTrace[],
  signal?: AbortSignal,
): Promise<CityPlace[]> {
  const params: Record<string, string> = {
    "filter.type": "urn:entity:place",
    "signal.interests.entities": ids.join(","),
    "filter.location": `POINT(${city.lon.toFixed(4)} ${city.lat.toFixed(4)})`,
    "filter.location.radius": "20000",
    take: String(options.take ?? 4),
  };
  if (options.tag) params["filter.tags"] = options.tag;
  return (await insightEntities(client, params, traces, signal)).flatMap((v) => toPlace(v) ?? []);
}

/** Getting there, not going out: airports, stations and car parks aren't venues or ideas. */
export const TRANSPORT = /\b(airport|station|terminal|parking|interstate)\b/i;
/** Kinds of place that aren't somewhere to meet fans or find a partner: schools, homes, bases, hospitals, offices. */
export const NOT_PUBLIC = /\b(school|military|base|housing|apartments?|residential|assisted living|nursing|senior living|care home|rehab|hospital|clinic|medical|church|government|police|prison|cemetery|funeral|office|recruiting)\b/i;

export const VENUE_TAGS = { music: "urn:tag:setting:qloo:music_venue", comedy: "urn:tag:genre:place:comedy_club" } as const;
/** Where Qloo tags few places as music venues or comedy clubs (Berlin, Cairo), live music and event venues next. */
export const VENUE_FALLBACK_TAGS = ["urn:tag:genre:place:live_music_venue", "urn:tag:genre:place:event_venue"] as const;
/** Kinds of local business a show can partner with, as Qloo place tags. */
export const LEAD_TAGS = {
  bars: "urn:tag:category:place:bar",
  breweries: "urn:tag:category:place:brewery",
  food: "urn:tag:genre:place:restaurant",
  clothing: "urn:tag:category:place:clothing_store",
} as const;
