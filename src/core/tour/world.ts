// The candidate tour cities worldwide (Natural Earth, src/core/tour/world.json; built by
// scripts/world-cities.mts) and how an area is asked of Qloo's heatmap: a region as its bounding box,
// countries as boxes around their cities, the whole world as one box for the first look. For the server: the list is
// too big to send to a browser. Pure.
import worldFile from "./world.json";
import { km } from "./geo";
import { countriesOf, regionById, type Box, type Where } from "./regions";


export interface WorldCity {
  /** Stable and readable: the country code and the city's name, as in gb-manchester. */
  id: string;
  name: string;
  /** State, province or region, in Natural Earth's words. */
  admin1: string;
  /** ISO 3166-1 alpha-2 (XK for Kosovo). */
  country: string;
  lat: number;
  lon: number;
  /** Natural Earth's metro-area estimate. */
  population: number;
}

export const WORLD_CITIES: WorldCity[] = worldFile.cities;
export const WORLD_SOURCE = worldFile.source;
export const cityById = (id: string) => WORLD_CITIES.find((c) => c.id === id);

export function citiesIn(w: Where) {
  const set = new Set(countriesOf(w));
  return WORLD_CITIES.filter((c) => set.has(c.country));
}

const polygon = ([w, s, e, n]: Box) => `((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;

/**
 * A box around a country's cities, a little wider than them. Cities more than 5,000 km from its biggest city (Hawaii,
 * overseas departments) are left out of the box, so one far island doesn't stretch it across an ocean.
 */
export function countryBox(iso: string): Box | undefined {
  const cities = WORLD_CITIES.filter((c) => c.country === iso);
  if (!cities.length) return undefined;
  const main = cities.reduce((a, b) => (b.population > a.population ? b : a));
  const near = cities.filter((c) => km(c, main) <= 5000);
  return [
    Math.max(-180, Math.floor(Math.min(...near.map((c) => c.lon)) - 1)),
    Math.max(-85, Math.floor(Math.min(...near.map((c) => c.lat)) - 1)),
    Math.min(180, Math.ceil(Math.max(...near.map((c) => c.lon)) + 1)),
    Math.min(85, Math.ceil(Math.max(...near.map((c) => c.lat)) + 1)),
  ];
}

const overlap = (a: Box, b: Box) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const union = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** Boxes that touch become one, so the shape Qloo gets never overlaps itself. */
export function mergeBoxes(boxes: Box[]): Box[] {
  const out = [...boxes];
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++)
      for (let j = i + 1; j < out.length && !merged; j++)
        if (overlap(out[i], out[j])) {
          out[i] = union(out[i], out[j]);
          out.splice(j, 1);
          merged = true;
        }
  }
  return out;
}

/** The whole world, for the first look at where an act's fans are. Qloo answers it with coarser cells. */
export const WORLD_LOCATION = `POLYGON${polygon([-179, -60, 179, 75])}`;

/** The area, as the WKT shape Qloo's heatmap takes (filter.location): one request covers all of it. */
export function locationOf(w: Where): string {
  if (w.kind === "region") return `POLYGON${polygon(regionById(w.region).box)}`;
  const boxes = mergeBoxes(
    w.countries.flatMap((iso) => {
      const box = countryBox(iso);
      return box ? [box] : [];
    }),
  );
  return boxes.length === 1 ? `POLYGON${polygon(boxes[0])}` : `MULTIPOLYGON(${boxes.map(polygon).join(", ")})`;
}
