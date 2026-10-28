// The numbers, in plain code: the same Qloo results always give the same plan. Pure.
import { km } from "./geo";
import { WORLD_CITIES, type WorldCity } from "./world";
import type { Act, CityHeat, Confidence, MatchedAct, PairCity, RouteStop, SharedCity, Sponsor } from "./types";

export { km };

/** A heatmap cell from Qloo: a small area and how strongly the signal's audience over-indexes there (0–1). */
export interface HeatCell {
  lat: number;
  lon: number;
  affinity: number;
}

/** How far from a city's centre its heatmap cells count: about a metro area. */
export const CITY_RADIUS_KM = 45;
/** For the world view, where Qloo's cells are about 150 km across, a city counts the cells of its wider area. */
export const WORLD_RADIUS_KM = 120;

/** Mean affinity and count of the cells near each city. Cities with no cells nearby have no data. */
export function cityAffinity<C extends { lat: number; lon: number }>(cells: HeatCell[], cities: C[], radiusKm = CITY_RADIUS_KM) {
  // Cells by whole degree of latitude, so each city looks only at the bands it can reach.
  const bands = new Map<number, HeatCell[]>();
  for (const c of cells) {
    const band = Math.floor(c.lat);
    const list = bands.get(band);
    if (list) list.push(c);
    else bands.set(band, [c]);
  }
  const reach = Math.ceil(radiusKm / 111);
  return cities.flatMap((city) => {
    const near: HeatCell[] = [];
    for (let b = Math.floor(city.lat) - reach; b <= Math.floor(city.lat) + reach; b++) for (const c of bands.get(b) ?? []) if (km(city, c) <= radiusKm) near.push(c);
    return near.length ? [{ city, affinity: near.reduce((s, c) => s + c.affinity, 0) / near.length, cells: near.length }] : [];
  });
}

const scale = (v: number, min: number, max: number) => (max > min ? (100 * (v - min)) / (max - min) : 100);

/** How many of an area's cities with data are its obvious markets: its biggest, up to 10, a third of them at most. */
export const obviousCount = (cities: number) => Math.min(10, Math.max(1, Math.floor(cities / 3)));

/**
 * Fan Heat for every candidate city with data. Heat is the city's mean affinity, scaled 0–100 against this act's other
 * cities in the area. The obvious markets are the area's biggest cities; hidden markets are the strongest of the rest.
 * The tour score leans on heat and weighs market size a little (log scale), so a strong mid-size city can beat a
 * lukewarm giant.
 */
export function scoreCities(cells: HeatCell[], options: { basis: "act" | "similar"; cities: WorldCity[]; radiusKm?: number }): CityHeat[] {
  const rows = cityAffinity(cells, options.cities, options.radiusKm);
  if (!rows.length) return [];
  const affinities = rows.map((r) => r.affinity);
  const minA = Math.min(...affinities),
    maxA = Math.max(...affinities);
  const logs = rows.map((r) => Math.log(r.city.population));
  const minP = Math.min(...logs),
    maxP = Math.max(...logs);
  const biggest = new Set([...rows].sort((a, b) => b.city.population - a.city.population).slice(0, obviousCount(rows.length)).map((r) => r.city.id));
  const scored = rows.map((r) => {
    const heat = Math.round(scale(r.affinity, minA, maxA));
    const size = scale(Math.log(r.city.population), minP, maxP);
    const confidence: Confidence = options.basis === "similar" ? (r.cells >= 6 ? "medium" : "low") : r.cells >= 6 ? "high" : r.cells >= 3 ? "medium" : "low";
    return {
      id: r.city.id,
      name: r.city.name,
      state: r.city.admin1,
      country: r.city.country,
      lat: r.city.lat,
      lon: r.city.lon,
      population: r.city.population,
      obvious: biggest.has(r.city.id),
      affinity: Number(r.affinity.toFixed(4)),
      cells: r.cells,
      heat,
      hidden: false,
      tourScore: Math.round(0.75 * heat + 0.25 * size),
      confidence,
    };
  });
  scored.sort((a, b) => b.heat - a.heat || b.population - a.population);
  markHidden(scored);
  return scored;
}

/** Hidden markets, in cities sorted by heat: the strongest outside the biggest metros, in the top third of heat. */
function markHidden(sorted: CityHeat[]) {
  if (!sorted.length) return;
  const cut = Math.max(60, sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 3))].heat);
  let hidden = 0;
  for (const c of sorted)
    if (!c.obvious && c.heat >= cut && c.confidence !== "low" && hidden < 6) {
      c.hidden = true;
      hidden++;
    }
}

/**
 * Cities where two audiences meet, best first: each one's Fan Heat, and both together as their geometric mean, so a
 * city scores high only when both audiences are strong there.
 */
export function sharedCities(a: CityHeat[], b: CityHeat[]): SharedCity[] {
  const other = new Map(b.map((c) => [c.id, c.heat]));
  return a
    .flatMap((c) => {
      const heat = other.get(c.id);
      return heat === undefined ? [] : [{ cityId: c.id, a: c.heat, b: heat, together: Math.round(Math.sqrt(c.heat * heat)) }];
    })
    .sort((x, y) => y.together - x.together || y.a + y.b - (x.a + x.b));
}

const CONFIDENCE: Confidence[] = ["low", "medium", "high"];

/**
 * The cities for a double bill: every city both acts have data for, with each act's Fan Heat; its heat is the two
 * together (their geometric mean). The tour score and hidden markets follow from that heat, as for one act.
 */
export function pairCities(a: CityHeat[], b: CityHeat[]): PairCity[] {
  const other = new Map(b.map((c) => [c.id, c]));
  const rows = a.flatMap((c) => (other.has(c.id) ? [{ c, o: other.get(c.id)! }] : []));
  if (!rows.length) return [];
  const logs = rows.map(({ c }) => Math.log(c.population));
  const minP = Math.min(...logs),
    maxP = Math.max(...logs);
  const out: PairCity[] = rows.map(({ c, o }) => {
    const heat = Math.round(Math.sqrt(c.heat * o.heat));
    return {
      ...c,
      affinity: Number(Math.sqrt(c.affinity * o.affinity).toFixed(4)),
      cells: Math.min(c.cells, o.cells),
      heat,
      a: c.heat,
      b: o.heat,
      hidden: false,
      tourScore: Math.round(0.75 * heat + 0.25 * scale(Math.log(c.population), minP, maxP)),
      confidence: CONFIDENCE[Math.min(CONFIDENCE.indexOf(c.confidence), CONFIDENCE.indexOf(o.confidence))],
    };
  });
  out.sort((x, y) => y.heat - x.heat || y.population - x.population);
  markHidden(out);
  return out;
}

/** How alike two acts' maps are: of the cities either is strong in (Fan Heat 60+), the share both are strong in. */
export function mapOverlap(a: CityHeat[], b: CityHeat[], strong = 60) {
  const sa = new Set(a.filter((c) => c.heat >= strong).map((c) => c.id));
  const sb = new Set(b.filter((c) => c.heat >= strong).map((c) => c.id));
  const either = new Set([...sa, ...sb]);
  return either.size ? [...sa].filter((id) => sb.has(id)).length / either.size : 0;
}

/**
 * Brand Fit, 0–100, for the acts a brand's audience loves: like Sponsor Fit, Qloo's affinity scaled against the other
 * acts, times a size weight (household names are the hardest to book and the least distinctive). Duplicates merged.
 */
export function scoreActs(found: { act: Act; affinity: number }[]): Omit<MatchedAct, "shared">[] {
  const unique = [...found].sort((x, y) => y.affinity - x.affinity).filter((f, i, all) => all.findIndex((g) => g.act.id === f.act.id) === i);
  if (!unique.length) return [];
  const affinities = unique.map((f) => f.affinity);
  const min = Math.min(...affinities),
    max = Math.max(...affinities);
  return unique
    .map((f, i) => {
      const tier = tierOf(f.act.popularity);
      return { act: f.act, affinity: f.affinity, qlooRank: i + 1, tier, fit: Math.round((40 + 0.6 * scale(f.affinity, min, max)) * TIER_WEIGHT[tier]) };
    })
    .sort((x, y) => y.fit - x.fit || x.qlooRank - y.qlooRank);
}

export const routeKm = (route: RouteStop[]) => route.reduce((s, r) => s + r.legKm, 0);
/** Longer than this is a flight; a tour drives the rest (a day's drive between shows). */
export const DRIVE_KM = 650;
/** The closest two stops can be: about a promoter's radius clause. */
export const MIN_GAP_KM = 150;
/** Countries no road or tunnel joins to their neighbours: a leg in or out of one crosses the sea. */
const ISLANDS = new Set(["IE", "IS", "CY", "MT", "JP", "TW", "PH", "ID", "LK", "MV", "AU", "NZ", "FJ", "PG", "NC", "PF", "GU", "CU", "JM", "DO", "HT", "PR", "TT", "BB", "BS", "CW", "GP", "MQ", "MG", "MU", "CV", "KM", "RE", "BH"]);
/** Countries of many islands: a long leg inside one is a flight too. */
const ARCHIPELAGOS = new Set(["JP", "PH", "ID", "NZ", "GR"]);
/**
 * A drive up to a day's distance, otherwise a flight; a leg across the sea (into or out of an island country, or a long
 * hop inside an archipelago) is a flight whatever its length.
 */
export function legMode(legKm: number, from?: { country?: string }, to?: { country?: string }): "drive" | "fly" {
  if (legKm > DRIVE_KM) return "fly";
  const a = from?.country,
    b = to?.country;
  if (a && b && a !== b && (ISLANDS.has(a) || ISLANDS.has(b))) return "fly";
  // Britain drives only through the tunnel, to France and Belgium.
  if (a && b && a !== b && (a === "GB" || b === "GB") && !["FR", "BE"].includes(a === "GB" ? b : a)) return "fly";
  if (a && a === b && ARCHIPELAGOS.has(a) && legKm > 300) return "fly";
  return "drive";
}

/**
 * The tour: the best `stops` cities by tour score (or by heat, when the focus is hidden markets), at least two of them
 * hidden when there are any, ordered to keep travel short: from home when there is one (or from whichever stop gives
 * the shortest tour), nearest city next, then with any crossings taken out. Each leg says whether it's a drive or a
 * flight.
 */
export function planRoute(
  cities: CityHeat[],
  options: { stops: number; homeCityId?: string; excludeCityIds?: string[]; focus?: "balanced" | "hidden" },
): RouteStop[] {
  return orderStops(cities, options);
}

function orderStops(
  cities: CityHeat[],
  options: { stops: number; homeCityId?: string; excludeCityIds?: string[]; focus?: "balanced" | "hidden" },
): RouteStop[] {
  const pool = cities.filter((c) => !options.excludeCityIds?.includes(c.id));
  const order = [...pool].sort((a, b) =>
    options.focus === "hidden" ? Number(b.hidden) - Number(a.hidden) || b.heat - a.heat : b.tourScore - a.tourScore || b.heat - a.heat,
  );
  // No two stops in one market: a city near a stronger stop is left out, as promoters' radius clauses would.
  const apart = (c: CityHeat, others: CityHeat[]) => others.every((o) => o === c || km(o, c) >= MIN_GAP_KM);
  const chosen: CityHeat[] = [];
  for (const c of order) if (chosen.length < options.stops && apart(c, chosen)) chosen.push(c);
  const hiddenLeft = order.filter((c) => c.hidden && !chosen.includes(c));
  while (chosen.filter((c) => c.hidden).length < Math.min(2, pool.filter((c) => c.hidden).length) && hiddenLeft.length) {
    const next = hiddenLeft.shift()!;
    // The weakest stop that isn't a hidden market makes way, if the hidden market is far enough from the rest.
    const weakest = chosen.findLastIndex((c) => !c.hidden && apart(next, chosen.filter((o) => o !== c)));
    if (weakest < 0) continue;
    chosen[weakest] = next;
  }
  if (!chosen.length) return [];
  const home = pool.find((c) => c.id === options.homeCityId) ?? WORLD_CITIES.find((c) => c.id === options.homeCityId);
  // Nearest next city from a start; from home when there is one, otherwise from whichever stop gives the shortest tour.
  const sweep = (start: { lat: number; lon: number }) => {
    const left = [...chosen];
    const order: CityHeat[] = [];
    let at = start;
    while (left.length) {
      let best = 0;
      for (let i = 1; i < left.length; i++) if (km(at, left[i]) < km(at, left[best])) best = i;
      const next = left.splice(best, 1)[0];
      order.push(next);
      at = next;
    }
    return untangle(order, home);
  };
  const legs = (order: CityHeat[]): RouteStop[] =>
    order.map((c, i) => {
      const from = i ? order[i - 1] : home;
      const legKm = from ? Math.round(km(from, c)) : 0;
      return { cityId: c.id, legKm, ...(legKm ? { mode: legMode(legKm, from, c) } : {}) };
    });
  if (home) return legs(sweep(home));
  return chosen.map((c) => legs(sweep(c))).reduce((best, r) => (routeKm(r) < routeKm(best) ? r : best));
}

/** 2-opt: reverses any stretch of the route that makes it cross itself, until none does. The start stays put. */
function untangle(order: CityHeat[], home?: { lat: number; lon: number }) {
  const path = [...order];
  const at = (i: number) => (i < 0 ? home : path[i]);
  for (let improved = true, rounds = 0; improved && rounds < 50; rounds++) {
    improved = false;
    for (let i = home ? 0 : 1; i < path.length - 1; i++)
      for (let j = i + 1; j < path.length; j++) {
        const before = at(i - 1),
          after = path[j + 1];
        const now = (before ? km(before, path[i]) : 0) + (after ? km(path[j], after) : 0);
        const swapped = (before ? km(before, path[j]) : 0) + (after ? km(path[i], after) : 0);
        if (swapped < now - 0.5) {
          path.splice(i, j - i + 1, ...path.slice(i, j + 1).reverse());
          improved = true;
        }
      }
  }
  return path;
}


/** A brand as Qloo returned it for this audience, before scoring. */
export interface BrandResult {
  id: string;
  name: string;
  affinity: number;
  popularity?: number;
  image?: string;
  /** Its Qloo brand genre tag IDs. */
  tags: string[];
}

export const tierOf = (popularity = 0.9): Sponsor["tier"] => (popularity >= 0.995 ? "household" : popularity >= 0.9 ? "established" : "niche");
/** Household names are the hardest to land and the least distinctive; niche brands sponsor less. A heuristic. */
export const TIER_WEIGHT: Record<Sponsor["tier"], number> = { household: 0.8, established: 1, niche: 0.9 };

/**
 * Sponsor Fit, 0–100: Qloo's affinity scaled against the other brands for this audience, times category match (only
 * brands in a requested category stay) and a brand-size weight. Duplicates by name are merged (Qloo can return the
 * same brand twice).
 */
export function scoreSponsors(
  brands: BrandResult[],
  options: { categoryTags?: string[]; avoidTags?: string[]; excludeBrandIds?: string[]; basis: "act" | "similar" },
): Omit<Sponsor, "strongestIn">[] {
  const seen = new Set<string>();
  const unique = brands.filter((b) => {
    const key = b.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const within = (tags: string[], wanted: string[]) => tags.some((t) => wanted.some((w) => t === w || t.startsWith(w + ":")));
  const wanted = options.categoryTags ?? [];
  const avoid = options.avoidTags ?? [];
  // What the act has said no to (a category, a brand) is never suggested.
  const inCategory = unique.filter(
    (b) => (!wanted.length || within(b.tags, wanted)) && !(avoid.length && within(b.tags, avoid)) && !options.excludeBrandIds?.includes(b.id),
  );
  if (!inCategory.length) return [];
  const affinities = inCategory.map((b) => b.affinity);
  const min = Math.min(...affinities),
    max = Math.max(...affinities);
  return inCategory
    .map((b) => {
      const tier = tierOf(b.popularity);
      // The floor keeps the least-matched brand above zero: it's still one Qloo found for this audience.
      const fit = Math.round((40 + 0.6 * scale(b.affinity, min, max)) * TIER_WEIGHT[tier]);
      const confidence: Confidence = options.basis === "similar" ? "medium" : b.affinity >= 0.85 ? "high" : "medium";
      return {
        brand: { id: b.id, name: b.name, type: "brand", popularity: b.popularity, image: b.image, categories: b.tags },
        affinity: b.affinity,
        qlooRank: unique.indexOf(b) + 1,
        fit,
        tier,
        confidence,
      };
    })
    .sort((a, b) => b.fit - a.fit || a.qlooRank - b.qlooRank);
}

/** The route cities where a brand's own audience is strongest, from the brand's heatmap: at most two. */
export function strongestIn(cells: HeatCell[], route: CityHeat[]): string[] {
  return cityAffinity(cells, route)
    .sort((a, b) => b.affinity - a.affinity)
    .slice(0, 2)
    .map((r) => r.city.id);
}
