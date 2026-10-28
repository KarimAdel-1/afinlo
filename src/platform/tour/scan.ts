// The first look at an act's fans, worldwide: one Qloo heatmap for the whole world (its cells are about 150 km
// across), scored on every city in the list, then summed up by country and by touring region. The brief opens
// on it, so a manager picks where to tour from where the fans are. When Qloo has no map for the act, the acts with the
// most overlapping audiences stand in, and the scan says so.
import type { TasteTrace } from "@/core/taste/types";
import { countryName, REGIONS, type RegionId } from "@/core/tour/regions";
import { heatPoints } from "@/core/tour/geo";
import { scoreCities, WORLD_RADIUS_KM } from "@/core/tour/scoring";
import { TourError, type Act, type CityHeat } from "@/core/tour/types";
import { WORLD_CITIES, WORLD_LOCATION } from "@/core/tour/world";
import type { QlooClient } from "../taste/qloo";
import { actById, qlooClient, heatCells, similarActs } from "./qloo";

export interface WorldScan {
  act: Act;
  basis: "act" | "similar";
  /** The acts standing in, when the act has no map of its own. */
  similar: string[];
  points: [number, number, number][];
  /** Countries by their fans: the mean Fan Heat of their three strongest cities. */
  countries: { iso: string; name: string; heat: number; cities: number; top: { id: string; name: string; heat: number; lat: number; lon: number } }[];
  regions: { id: RegionId; label: string; heat: number; countries: string[] }[];
  traces: TasteTrace[];
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

/** The world scan's summary, from the cities' Fan Heat. Pure. */
export function summarize(cities: CityHeat[]): Pick<WorldScan, "countries" | "regions"> {
  const byCountry = new Map<string, CityHeat[]>();
  for (const c of cities) {
    const list = byCountry.get(c.country!) ?? [];
    list.push(c);
    byCountry.set(c.country!, list);
  }
  const countries = [...byCountry.entries()]
    .map(([iso, list]) => {
      const best = [...list].sort((a, b) => b.heat - a.heat);
      const top = best[0];
      return { iso, name: countryName(iso), heat: Math.round(mean(best.slice(0, 3).map((c) => c.heat))), cities: list.length, top: { id: top.id, name: top.name, heat: top.heat, lat: top.lat, lon: top.lon } };
    })
    .sort((a, b) => b.heat - a.heat || b.cities - a.cities);
  // A region by all its cities with data, so one hot city doesn't light up a continent; its countries listed by heat,
  // a little in favour of the ones with more cities (Egypt before Gibraltar).
  const weight = (c: (typeof countries)[number]) => c.heat * Math.log(2 + c.cities);
  const regions = REGIONS.map((r) => {
    const set = new Set<string>(r.countries);
    const all = cities.filter((c) => set.has(c.country!));
    return {
      id: r.id,
      label: r.label,
      heat: Math.round(mean(all.map((c) => c.heat))),
      countries: countries
        .filter((c) => set.has(c.iso))
        .sort((a, b) => weight(b) - weight(a))
        .map((c) => c.iso),
    };
  })
    .filter((r) => r.countries.length)
    .sort((a, b) => b.heat - a.heat);
  return { countries, regions };
}

export async function scanWorld(actId: string, deps: { client?: QlooClient; signal?: AbortSignal } = {}): Promise<WorldScan> {
  const client = deps.client ?? qlooClient();
  const traces: TasteTrace[] = [];
  const act = await actById(client, actId, traces, deps.signal);
  if (!act) throw new TourError("act_missing", "Qloo doesn't know that act. Search again and pick one of the matches.", 404);
  let basis: WorldScan["basis"] = "act";
  let similar: string[] = [];
  let cells = await heatCells(client, [act.id], traces, deps.signal, WORLD_LOCATION).catch(() => []);
  if (!cells.length) {
    const like = (await similarActs(client, act, traces, deps.signal).catch(() => [])).slice(0, 4);
    if (like.length) {
      cells = await heatCells(client, [act.id, ...like.map((a) => a.id)], traces, deps.signal, WORLD_LOCATION).catch(() => []);
      basis = "similar";
      similar = like.map((a) => a.name);
    }
  }
  const cities = scoreCities(cells, { basis, cities: WORLD_CITIES, radiusKm: WORLD_RADIUS_KM });
  return { act, basis, similar, points: heatPoints(cells), ...summarize(cities), traces };
}
