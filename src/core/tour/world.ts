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

let bands: Map<number, WorldCity[]> | undefined;
/** The candidate city nearest a point, anywhere in the world, and how far it is. */
export function nearestCity(p: { lat: number; lon: number }): { city: WorldCity; km: number } {
  if (!bands) {
    bands = new Map();
    for (const c of WORLD_CITIES) {
      const b = Math.floor(c.lat);
      const list = bands.get(b);
      if (list) list.push(c);
      else bands.set(b, [c]);
    }
  }
  let city = WORLD_CITIES[0],
    best = Infinity;
  // Bands of latitude outward from the point's own: one `ring` degrees off is at least (ring - 1) × 111 km away.
  for (let ring = 0, home = Math.floor(p.lat); ring <= 180 && (ring - 1) * 111 <= best; ring++)
    for (const b of ring ? [home - ring, home + ring] : [home])
      for (const c of bands.get(b) ?? []) {
        const d = km(p, c);
        if (d < best) {
          best = d;
          city = c;
        }
      }
  return { city, km: best };
}

/** Past this far from any city, a cell is a remote island or open land no tour reaches. */
const REACH_KM = 500;

/** The country a point of Qloo's map is in: its nearest city's. None for a remote island or open land. */
export function countryAt(p: { lat: number; lon: number }): string | undefined {
  const { city, km } = nearestCity(p);
  return km <= REACH_KM ? city.country : undefined;
}

/**
 * Qloo's cells inside an area. A cell belongs to the country of its nearest city, so the neighbours a region's box
 * takes in are left out, and the area's rural cells, far from its cities, stay in.
 */
export function cellsIn<C extends { lat: number; lon: number }>(cells: C[], w: Where): C[] {
  const set = new Set(countriesOf(w));
  return cells.filter((c) => set.has(countryAt(c) ?? ""));
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
  if (w.kind === "world") return WORLD_LOCATION;
  if (w.kind === "region") return `POLYGON${polygon(regionById(w.region).box)}`;
  const boxes = mergeBoxes(
    w.countries.flatMap((iso) => {
      const box = countryBox(iso);
      return box ? [box] : [];
    }),
  );
  return boxes.length === 1 ? `POLYGON${polygon(boxes[0])}` : `MULTIPOLYGON(${boxes.map(polygon).join(", ")})`;
}
