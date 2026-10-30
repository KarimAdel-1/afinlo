// What the real map draws, worked out once on the server: Qloo's heatmap as weighted points, the cities a plan keeps,
// and the route as lines that curve along the globe for flights. Pure, and small enough for the browser.
import type { HeatCell } from "./scoring";
import type { CityHeat, RouteStop } from "./types";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Great-circle distance in kilometres. */
export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r,
    dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * The stronger half of Qloo's cells as [latitude, longitude, weight 0–1]: Qloo's affinity is a rank across the area
 * (half the cells are above 0.5), so the weaker half would only grey the map.
 */
export function heatPoints(cells: HeatCell[]): [number, number, number][] {
  return cells.filter((c) => c.affinity >= 0.5).map((c) => [r2(c.lat), r2(c.lon), r2((c.affinity - 0.5) * 2)]);
}

/** A plan keeps its strongest 80 cities with data (and every stop): enough to rank and swap, not the whole region. */
export function keepCities(cities: CityHeat[], route: RouteStop[]): CityHeat[] {
  const stops = new Set(route.map((r) => r.cityId));
  return cities.filter((c, i) => i < 80 || stops.has(c.id));
}

/** Points along the great circle from a to b: a flight drawn as it flies. A drive is a straight line. */
export function arc(a: { lat: number; lon: number }, b: { lat: number; lon: number }, steps = 32): [number, number][] {
  const rad = Math.PI / 180;
  const [φ1, λ1, φ2, λ2] = [a.lat * rad, a.lon * rad, b.lat * rad, b.lon * rad];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d < 1e-6) return [[a.lon, a.lat]];
  const out: [number, number][] = [];
  let lastLon = a.lon;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d),
      B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    let lon = Math.atan2(y, x) / rad;
    // Keep the line continuous across the antimeridian (the map wraps).
    while (lon - lastLon > 180) lon -= 360;
    while (lon - lastLon < -180) lon += 360;
    lastLon = lon;
    out.push([lon, Math.atan2(z, Math.sqrt(x * x + y * y)) / rad]);
  }
  return out;
}

/**
 * A flight as the maps draw it. The maps show one world, with edges: a great circle that crosses an edge (out in the
 * Pacific, Los Angeles to Sydney) would leave at one side and come back at the other. Such a flight is drawn as a curve
 * across the map instead, from one stop to the other, bowed upward like the rest. Every other flight is its great circle.
 * Only the drawing changes: a leg's distance is still the great circle's.
 */
export function flightPath(a: { lat: number; lon: number }, b: { lat: number; lon: number }, steps = 32): [number, number][] {
  const great = arc(a, b, steps);
  if (great.every(([lon]) => lon >= -180 && lon <= 180)) return great;
  // A quadratic curve in longitude and latitude, its middle lifted off the straight line by a sixth of its length.
  const dLon = b.lon - a.lon,
    dLat = b.lat - a.lat,
    length = Math.hypot(dLon, dLat);
  const [nLon, nLat] = dLon >= 0 ? [-dLat / length, dLon / length] : [dLat / length, -dLon / length];
  const lift = length / 6;
  const c = { lon: (a.lon + b.lon) / 2 + nLon * lift, lat: Math.min(80, Math.max(-80, (a.lat + b.lat) / 2 + nLat * lift)) };
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return [(1 - t) ** 2 * a.lon + 2 * (1 - t) * t * c.lon + t ** 2 * b.lon, (1 - t) ** 2 * a.lat + 2 * (1 - t) * t * c.lat + t ** 2 * b.lat];
  });
}
