// The US map behind Fan Heat: hexagon tiles over the US Census Bureau's state boundaries (us-atlas, public domain,
// pre-projected to Albers USA). An act's Qloo heatmap cells colour the tiles they fall in. City markers use the same
// projection. No map tiles or outside requests: the page stays within its own content policy.
import { geoAlbersUsa } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import atlas from "us-atlas/states-albers-10m.json";
import { hexAt, hexCenter, hexPositions } from "@/core/tour/hex";
import type { HeatCell } from "@/core/tour/scoring";
import type { CityHeat, MapCity, Plan } from "@/core/tour/types";

// us-atlas's projected files use exactly this projection (see its README).
const projection = geoAlbersUsa().scale(1300).translate([487.5, 305]);
const topology = atlas as unknown as Topology<{ states: GeometryCollection; nation: GeometryCollection }>;

type Ring = number[][];
const inRing = (x: number, y: number, ring: Ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

let land: { tiles: [number, number][]; keys: Set<string> } | undefined;
/** The hexagons that cover US land, as [column, row]: computed once, then kept. */
export function landTiles() {
  if (!land) {
    const nation = feature(topology, topology.objects.nation);
    const polygons = nation.features.flatMap((f) =>
      f.geometry.type === "MultiPolygon" ? (f.geometry.coordinates as Ring[][]) : f.geometry.type === "Polygon" ? [f.geometry.coordinates as Ring[]] : [],
    );
    const boxes = polygons.map((rings) => {
      const xs = rings[0].map((p) => p[0]),
        ys = rings[0].map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    });
    const onLand = (x: number, y: number) =>
      polygons.some((rings, k) => {
        const [x0, y0, x1, y1] = boxes[k];
        return x >= x0 && x <= x1 && y >= y0 && y <= y1 && inRing(x, y, rings[0]) && !rings.slice(1).some((hole) => inRing(x, y, hole));
      });
    const tiles = hexPositions().filter(([col, row]) => onLand(...hexCenter(col, row)));
    land = { tiles, keys: new Set(tiles.map(([c, r]) => `${c},${r}`)) };
  }
  return land;
}

/** Where a place falls on the map, in its coordinates; undefined outside the projection (it covers the US). */
export function onMap(lat: number, lon: number): [number, number] | undefined {
  const p = projection([lon, lat]);
  return p ? [Number(p[0].toFixed(1)), Number(p[1].toFixed(1))] : undefined;
}

/** A plan's cities as map markers, numbered by their place on the route. */
export function mapCities(plan: Pick<Plan, "cities" | "route">): MapCity[] {
  const stops = new Map(plan.route.map((r, i) => [r.cityId, i + 1]));
  return plan.cities.flatMap((c) => {
    const p = onMap(c.lat, c.lon);
    return p
      ? [{ id: c.id, name: c.name, state: c.state, x: p[0], y: p[1], heat: c.heat, hidden: c.hidden, confidence: c.confidence, population: c.population, stop: stops.get(c.id) }]
      : [];
  });
}

// Where each level starts, as a share of the act's tiles ranked from weakest: most of the map stays light, colour
// gathers where the fans are, and the top 4% are the hot spots (level 6).
const LEVELS = [0.45, 0.65, 0.8, 0.9, 0.96];

/** The top cities of a ranking (a brand's strongest cities) as numbered map markers. */
export function topCityMarkers(cities: CityHeat[], n = 5): MapCity[] {
  return mapCities({ cities, route: cities.slice(0, n).map((c) => ({ cityId: c.id, legKm: 0 })) }).filter((c) => c.stop);
}

/**
 * Qloo heatmap cells as map tiles: each land tile takes the strongest cell inside it, and tiles are graded 1–6 by rank
 * among this act's tiles (see LEVELS). Returns [column, row, level].
 */
export function heatTiles(cells: HeatCell[]): [number, number, number][] {
  return grade([...strongestPerTile(cells)]);
}

/**
 * Two audiences on the map (a double bill): each act's tiles are ranked on their own, and a tile both have is graded by
 * the two ranks together (their geometric mean), so the darkest tiles are where both audiences are strong.
 */
export function pairTiles(a: HeatCell[], b: HeatCell[]): [number, number, number][] {
  const sa = shares(a),
    sb = shares(b);
  return grade([...sa].flatMap(([key, s]) => (sb.has(key) ? [[key, Math.sqrt(s * sb.get(key)!)] as [string, number]] : [])));
}

/** The strongest cell's affinity in each land tile, by "column,row". */
function strongestPerTile(cells: HeatCell[]) {
  const { keys } = landTiles();
  const best = new Map<string, number>();
  for (const c of cells) {
    const p = projection([c.lon, c.lat]);
    if (!p) continue;
    const key = hexAt(p[0], p[1]).join(",");
    if (keys.has(key)) best.set(key, Math.max(best.get(key) ?? -1, c.affinity));
  }
  return best;
}

/** Each tile's rank among the act's tiles, as a share from 0 (weakest) to 1. */
function shares(cells: HeatCell[]) {
  const ranked = [...strongestPerTile(cells)].sort((x, y) => x[1] - y[1]);
  return new Map(ranked.map(([key], rank) => [key, rank / Math.max(1, ranked.length - 1)]));
}

/** Tiles graded 1–6 by their rank among themselves (see LEVELS). */
function grade(tiles: [string, number][]): [number, number, number][] {
  const ranked = [...tiles].sort((x, y) => x[1] - y[1]);
  return ranked.map(([key], rank) => {
    const [col, row] = key.split(",").map(Number);
    const share = rank / Math.max(1, ranked.length);
    return [col, row, 1 + LEVELS.filter((l) => share >= l).length];
  });
}
