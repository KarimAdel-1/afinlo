// The numbers, in plain code: the same Qloo results always give the same plan. Pure.
import { km } from "./geo";
import type { Where } from "./regions";
import spending from "./spending.json";
import { countryAt, WORLD_CITIES, type WorldCity } from "./world";
import type { CityHeat, Confidence, Proof, RouteStop, Sponsor } from "./types";

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
/** In the world view, how many cells a city's country counts as in its Fan Heat, and the world in a country's. */
export const LEAN_ON_COUNTRY = 1;
export const LEAN_ON_WORLD = 3;

/** Each country's GDP per head (World Bank, via Natural Earth; scripts/world-spending.mts). */
const GDP_PER_HEAD: Record<string, number> = spending.gdpPerHead;
export const SPENDING_SOURCE = spending.source;
const MEDIAN_GDP = Object.values(GDP_PER_HEAD).sort((a, b) => a - b)[Math.floor(Object.keys(GDP_PER_HEAD).length / 2)];

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

/**
 * Mean affinity and count of the cells near each city. Cities with no cells nearby have no data.
 *
 * In the world view, Qloo's cells are about 150 km across and a city has only a few, so one odd cell could make it hot
 * (for Morgan Wallen, Karachi's one cell scores like London's). There a city counts only its own country's cells, none
 * across a border, and leans on its country: the mean of all the country's cells counts as one more of the city's
 * (LEAN_ON_COUNTRY), and the world's mean as three more of a country's (LEAN_ON_WORLD), for a country with few cells.
 */
export function cityAffinity<C extends { lat: number; lon: number; country?: string }>(cells: HeatCell[], cities: C[], world = false) {
  const radiusKm = world ? WORLD_RADIUS_KM : CITY_RADIUS_KM;
  const countryOf = new Map(world ? cells.map((c) => [c, countryAt(c)]) : []);
  const byCountry = new Map<string, number[]>();
  for (const [c, iso] of countryOf) if (iso) byCountry.set(iso, [...(byCountry.get(iso) ?? []), c.affinity]);
  const everywhere = world && cells.length ? mean(cells.map((c) => c.affinity)) : 0;
  const lean = new Map([...byCountry].map(([iso, v]) => [iso, (v.length * mean(v) + LEAN_ON_WORLD * everywhere) / (v.length + LEAN_ON_WORLD)]));
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
    for (let b = Math.floor(city.lat) - reach; b <= Math.floor(city.lat) + reach; b++)
      for (const c of bands.get(b) ?? []) if (km(city, c) <= radiusKm && (!world || countryOf.get(c) === city.country)) near.push(c);
    if (!near.length) return [];
    const own = near.reduce((s, c) => s + c.affinity, 0);
    const country = world ? lean.get(city.country!) : undefined;
    const affinity = country === undefined ? own / near.length : (own + LEAN_ON_COUNTRY * country) / (near.length + LEAN_ON_COUNTRY);
    return [{ city, affinity, cells: near.length }];
  });
}

/**
 * A city's market size, on a log scale: its people or, across the world, what they can spend (its people times its
 * country's GDP per head). From one country to the next, that differs far more than how many people live there:
 * Dhaka has half as many people again as London, and a fifteenth of what they spend.
 */
const marketOf = (city: WorldCity, world: boolean) => Math.log(city.population * (world ? (GDP_PER_HEAD[city.country] ?? MEDIAN_GDP) : 1));

/** Values less than this far apart, relative to the largest, don't tell candidates apart. */
const FLAT_SPREAD = 0.05;
/**
 * Whether values barely differ, or there's only one: a score relative to the others then says nothing about which is
 * stronger, so it isn't given as if it did.
 */
export const isFlat = (values: number[]) => {
  if (values.length < 2) return true;
  const max = Math.max(...values),
    min = Math.min(...values);
  return max - min <= FLAT_SPREAD * Math.max(Math.abs(max), 1e-9);
};
/** 0–100 against the others; the middle, 50, when they barely differ, rather than a 100 that would claim a lead. */
const scale = (v: number, min: number, max: number) => (isFlat([min, max]) ? 50 : (100 * (v - min)) / (max - min));

/** How many of an area's cities with data are its obvious markets: its biggest, up to 10, a third of them at most. */
export const obviousCount = (cities: number) => Math.min(10, Math.max(1, Math.floor(cities / 3)));

/**
 * Fan Heat for every candidate city with data. Heat is the city's mean affinity, scaled 0–100 against this act's other
 * cities in the area. The obvious markets are the area's biggest cities; hidden markets are the strongest of the rest.
 * The tour score leans on heat and weighs market size a little (log scale), so a strong mid-size city can beat a
 * lukewarm giant. `world` is the world view: Qloo's world cells, read as cityAffinity says, and market size as
 * spending.
 */
export function scoreCities(cells: HeatCell[], options: { basis: "act" | "similar"; cities: WorldCity[]; world?: boolean }): CityHeat[] {
  const world = options.world ?? false;
  const rows = cityAffinity(cells, options.cities, world);
  if (!rows.length) return [];
  const affinities = rows.map((r) => r.affinity);
  const minA = Math.min(...affinities),
    maxA = Math.max(...affinities);
  const logs = rows.map((r) => marketOf(r.city, world));
  const minP = Math.min(...logs),
    maxP = Math.max(...logs);
  const biggest = new Set([...rows].sort((a, b) => b.city.population - a.city.population).slice(0, obviousCount(rows.length)).map((r) => r.city.id));
  // Affinities that barely differ give every city the same middling heat, and low confidence: the data doesn't rank them.
  const flat = isFlat(affinities);
  const scored = rows.map((r) => {
    const heat = Math.round(scale(r.affinity, minA, maxA));
    const size = scale(marketOf(r.city, world), minP, maxP);
    const confidence: Confidence = flat ? "low" : options.basis === "similar" ? (r.cells >= 6 ? "medium" : "low") : r.cells >= 6 ? "high" : r.cells >= 3 ? "medium" : "low";
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
 * The route against the area's biggest cities with data, as many as it has stops: both as average Fan Heat. `cities`
 * is every scored candidate, not just the ones a plan keeps, so the biggest cities are the area's own.
 */
export function proofOf(cities: CityHeat[], route: RouteStop[]): Proof | undefined {
  const stops = route.flatMap((r) => cities.find((c) => c.id === r.cityId) ?? []);
  if (!stops.length) return undefined;
  const biggest = [...cities].sort((a, b) => b.population - a.population).slice(0, stops.length);
  const average = (list: CityHeat[]) => Math.round(list.reduce((s, c) => s + c.heat, 0) / list.length);
  return { route: average(stops), biggest: average(biggest), biggestCities: biggest.map((c) => c.name) };
}

export const routeKm = (route: RouteStop[]) => route.reduce((s, r) => s + r.legKm, 0);
/** Longer than this is a flight; a tour drives the rest (a day's drive between shows). */
export const DRIVE_KM = 650;
/** The closest two stops can be: about a promoter's radius clause. */
export const MIN_GAP_KM = 150;
/** A world tour spreads out: shows at least this far apart, so two stops are two markets on a continent's scale. */
export const WORLD_GAP_KM = 400;

/**
 * The route's rules for an area: how far apart its shows are, and how many one country gets. A world tour gives no
 * country more than a quarter of its shows (two at least), so it goes where the fans are around the world.
 */
export function routeRules(w: Where | undefined, stops: number): { gapKm: number; perCountry?: number } {
  return w?.kind === "world" ? { gapKm: WORLD_GAP_KM, perCountry: Math.max(2, Math.ceil(stops / 4)) } : { gapKm: MIN_GAP_KM };
}

/**
 * The act's hottest market: the city with the most Fan Heat and the cities within a show's spacing of it, and of those
 * the one with the best tour score. A booker plays the market's biggest stage, which isn't always its hottest town.
 */
export function hottestMarket(cities: CityHeat[], gapKm = MIN_GAP_KM): CityHeat | undefined {
  const hottest = hottestCity(cities);
  return hottest && cities.filter((c) => km(c, hottest) < gapKm).sort((a, b) => b.tourScore - a.tourScore || b.heat - a.heat)[0];
}

/** The city where the act's fans are hottest: the most Fan Heat, and the bigger city on a tie. */
export const hottestCity = (cities: CityHeat[]) =>
  cities.reduce<CityHeat | undefined>((best, c) => (!best || c.heat > best.heat || (c.heat === best.heat && c.population > best.population) ? c : best), undefined);

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

/** What a route is asked for. `gapKm` and `perCountry` come from routeRules for the area. */
export interface RouteOptions {
  stops: number;
  homeCityId?: string;
  excludeCityIds?: string[];
  includeCityIds?: string[];
  focus?: "balanced" | "hidden";
  /** The closest two stops can be: MIN_GAP_KM, or wider for a world tour. */
  gapKm?: number;
  /** The most stops one country gets, while the route can be filled otherwise. */
  perCountry?: number;
}

/**
 * The tour: the cities asked for by name, then the act's hottest market (every tour plays it), then the best of the rest
 * by tour score (or by heat, when the focus is hidden markets) up to `stops`, at least two of them hidden when there are
 * any, ordered to keep travel short: from home when there is one (or from whichever stop gives the shortest tour),
 * nearest city next, then with any crossings taken out. Each leg says whether it's a drive or a flight.
 */
export function planRoute(cities: CityHeat[], options: RouteOptions): RouteStop[] {
  return orderStops(cities, options);
}

function orderStops(cities: CityHeat[], options: RouteOptions): RouteStop[] {
  const gap = options.gapKm ?? MIN_GAP_KM;
  const cap = options.perCountry ?? Infinity;
  const pool = cities.filter((c) => !options.excludeCityIds?.includes(c.id));
  const order = [...pool].sort((a, b) =>
    options.focus === "hidden" ? Number(b.hidden) - Number(a.hidden) || b.heat - a.heat : b.tourScore - a.tourScore || b.heat - a.heat,
  );
  // No two stops in one market: a city near a stronger stop is left out, as promoters' radius clauses would.
  const apart = (c: CityHeat, others: CityHeat[]) => others.every((o) => o === c || km(o, c) >= gap);
  // The cities asked for come first, whatever their score, each once; then the act's hottest market, unless one asked
  // for is in it. (What couldn't be honoured is reported by requestedCheck.)
  const asked = [...new Set(options.includeCityIds ?? [])].flatMap((id) => pool.find((c) => c.id === id) ?? []);
  const anchor = hottestMarket(pool, gap);
  const must = [...asked, ...(anchor && !asked.includes(anchor) && apart(anchor, asked) ? [anchor] : [])].slice(0, options.stops);
  const chosen: CityHeat[] = [...must];
  const room = (c: CityHeat, without?: CityHeat) => chosen.filter((o) => o !== without && o.country === c.country).length < cap;
  for (const c of order) if (chosen.length < options.stops && !chosen.includes(c) && apart(c, chosen) && room(c)) chosen.push(c);
  // Too few countries with fans for the cap: the rest of the route fills in without it.
  for (const c of order) if (chosen.length < options.stops && !chosen.includes(c) && apart(c, chosen)) chosen.push(c);
  const hiddenLeft = order.filter((c) => c.hidden && !chosen.includes(c));
  while (chosen.filter((c) => c.hidden).length < Math.min(2, pool.filter((c) => c.hidden).length) && hiddenLeft.length) {
    const next = hiddenLeft.shift()!;
    // The weakest stop that isn't a hidden market (or asked for, or the hottest market) makes way, if the hidden market
    // is far enough from the rest and its country has room.
    const weakest = chosen.findLastIndex((c) => !c.hidden && !must.includes(c) && apart(next, chosen.filter((o) => o !== c)) && room(next, c));
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

/**
 * How the cities asked for by name fared: those with no Qloo data for the act (or left out by the user), those that
 * didn't fit in the shows, and pairs closer than the usual spacing, kept because they were asked for. So a plan never
 * drops a requirement without saying so.
 */
export function requestedCheck(cities: CityHeat[], route: RouteStop[], options: Pick<RouteOptions, "includeCityIds" | "excludeCityIds" | "gapKm">) {
  const asked = [...new Set(options.includeCityIds ?? [])];
  const gap = options.gapKm ?? MIN_GAP_KM;
  const onRoute = new Set(route.map((r) => r.cityId));
  const known = (id: string) => cities.some((c) => c.id === id) && !options.excludeCityIds?.includes(id);
  const kept = asked.filter((id) => onRoute.has(id)).map((id) => cities.find((c) => c.id === id)!);
  const close: [CityHeat, CityHeat, number][] = [];
  for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) if (km(kept[i], kept[j]) < gap) close.push([kept[i], kept[j], Math.round(km(kept[i], kept[j]))]);
  return { noData: asked.filter((id) => !known(id)), cut: asked.filter((id) => known(id) && !onRoute.has(id)), close, gap };
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
 * brands in a requested category stay) and a brand-size weight. It ranks how well a brand's customers overlap with the
 * fans, among these brands: not whether the brand sponsors tours, has budget, or would say yes. Duplicates by name are merged (Qloo can return the
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
      // Fit compares brands for this audience: with one brand, or brands Qloo matched about equally, there's nothing to
      // compare, so it isn't confident.
      const confidence: Confidence = isFlat(affinities) ? "low" : options.basis === "similar" ? "medium" : b.affinity >= 0.85 ? "high" : "medium";
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
export function strongestIn(cells: HeatCell[], route: CityHeat[], world = false): string[] {
  return cityAffinity(cells, route, world)
    .sort((a, b) => b.affinity - a.affinity)
    .slice(0, 2)
    .map((r) => r.city.id);
}
