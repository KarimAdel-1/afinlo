// The fan map's drawing (heat.ts), checked against MapLibre's heat kernel worked out here: true to Qloo's cells at every
// zoom and latitude, never all one colour, and anchored at the act's hottest places. Pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boxPaint, cellBox, heatApart, heatBoxes, heatColor, heatGrid, heatIntensity, heatLevels, heatPaint, heatRadius, heatSpots, HEAT_RAMP, stretchFix, type HeatGrid } from "./heat";

const GH3 = { dLat: 1.40625, dLon: 1.40625 };
const GH4 = { dLat: 0.17578125, dLon: 0.3515625 };
const GH5 = { dLat: 0.0439453125, dLon: 0.0439453125 };
type Point = [number, number, number];

/** Cells on Qloo's grid as heatPoints gives them (centres rounded to 0.01°): `rows` × `cols` from a corner, each its strength. */
function field(grid: HeatGrid, south: number, west: number, rows: number, cols: number, strength: (row: number, col: number) => number): Point[] {
  const [s0, w0] = cellBox(south, west, grid);
  const out: Point[] = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const w = strength(i, j);
      if (w > 0) out.push([Math.round((s0 + (i + 0.5) * grid.dLat) * 100) / 100, Math.round((w0 + (j + 0.5) * grid.dLon) * 100) / 100, w]);
    }
  return out;
}
const centre = (grid: HeatGrid, south: number, west: number, row: number, col: number) => {
  const [s0, w0] = cellBox(south, west, grid);
  return { lat: s0 + (row + 0.5) * grid.dLat, lon: w0 + (col + 0.5) * grid.dLon };
};

/** The density MapLibre's heat layer draws at a place, at one of the zooms the paint is set at: every point's kernel, summed. */
function drawn(points: Point[], grid: HeatGrid, zoom: number, at: { lat: number; lon: number }, levels = heatLevels(points, grid)) {
  const size = 512 * 2 ** zoom;
  const px = (lat: number, lon: number) => [((lon + 180) / 360) * size, (0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)) * size];
  const r = heatRadius(grid, zoom),
    intensity = heatIntensity(grid, zoom) * levels[zoom * 2];
  const [x0, y0] = px(at.lat, at.lon);
  let sum = 0;
  for (const [lat, lon, density, stretch] of heatSpots(points, grid)) {
    const [x, y] = px(lat, lon);
    sum += density * stretchFix(grid, zoom, stretch) * intensity * (1 / Math.sqrt(2 * Math.PI)) * Math.exp((-4.5 * ((x - x0) ** 2 + (y - y0) ** 2)) / r ** 2);
  }
  return sum;
}
const flat = (n = 45) => Array.from({ length: n }, () => 1);

test("the map knows Qloo's grid from the points: geohash 4 for a region, 5 for a country, 3 for the world", () => {
  assert.deepEqual(heatGrid(field(GH4, 36, -90, 6, 6, () => 1)), GH4);
  assert.deepEqual(heatGrid(field(GH5, 51.3, -0.5, 6, 6, () => 1)), GH5);
  assert.deepEqual(heatGrid(field(GH3, -30, -70, 6, 6, () => 1)), GH3);
  assert.deepEqual(heatGrid([[10, 10, 1]]), GH4, "one point: a region's grid");
  // Rounded to 0.01°, a cell's centre still falls in its own box.
  const [s, w] = cellBox(36, -90, GH5);
  for (const [lat, lon] of field(GH5, 36, -90, 4, 4, () => 1)) {
    const [south, west] = cellBox(lat, lon, GH5);
    assert.ok(Math.abs((south - s) / GH5.dLat - Math.round((south - s) / GH5.dLat)) < 1e-6 && Math.abs((west - w) / GH5.dLon - Math.round((west - w) / GH5.dLon)) < 1e-6);
  }
  const [spot] = heatSpots([[36.09, -89.82, 0.5]], GH4);
  const [south, west, north, east] = cellBox(36.09, -89.82, GH4);
  assert.deepEqual(spot.slice(0, 3), [(south + north) / 2, (west + east) / 2, 0.25], "a point at its cell's centre, with its density");
});

test("an even field draws its own density at every zoom and latitude: zooming or a northern city doesn't change the colour", () => {
  for (const [grid, zooms] of [
    [GH4, [3, 5, 7, 9]],
    [GH5, [6, 8, 10]],
    [GH3, [1, 3]],
  ] as const)
    for (const lat of [0, 30, 55]) {
      // Wide enough that the blur at the lowest zoom sees nothing past the field's edge.
      const reach = (deg: number) => 2 * Math.ceil((2.5 * heatRadius(grid, zooms[0])) / ((deg * 512 * 2 ** zooms[0]) / 360)) + 3;
      const rows = reach(grid.dLat / Math.cos((lat * Math.PI) / 180)),
        cols = reach(grid.dLon);
      const south = lat - (rows / 2) * grid.dLat,
        west = -90 - (cols / 2) * grid.dLon;
      const points = field(grid, south, west, rows, cols, () => 0.8);
      for (const zoom of zooms) {
        const d = drawn(points, grid, zoom, centre(grid, south, west, Math.floor(rows / 2), Math.floor(cols / 2)), flat());
        assert.ok(Math.abs(d - 0.64) < 0.05, `${JSON.stringify(grid)} at ${lat}° and zoom ${zoom}: ${d.toFixed(3)}, not 0.64`);
      }
    }
});

test("the drawing keeps Qloo's order and never turns a whole region the top colour", () => {
  // Strength rising west to east across a region, at a region's zoom: each column draws hotter than the one before.
  const points = field(GH4, 34, -95, 30, 40, (_, col) => 0.3 + (0.7 * col) / 39);
  const levels = heatLevels(points, GH4);
  const row = [8, 12, 16, 20, 24, 28, 32].map((col) => drawn(points, GH4, 6, centre(GH4, 34, -95, 15, col), levels));
  assert.ok(row.every((d, i) => !i || d > row[i - 1]), `rising: ${row.map((d) => d.toFixed(2)).join(" ")}`);
  // A hot city in a region of mixed strengths, as Qloo's ranks are: the city reads in the hot colours (density 0.82 up,
  // purple to pink) and the region below them, at every zoom.
  const mixed = (r: number, c: number) => 0.2 + 0.6 * ((((Math.sin(r * 12.9898 + c * 78.233) * 43758.5453) % 1) + 1) % 1);
  const city = field(GH4, 34, -95, 60, 60, (r, c) => (Math.hypot(r - 30, (c - 30) * 2) < 10 ? 1 : mixed(r, c)));
  const cityLevels = heatLevels(city, GH4);
  for (const zoom of [4, 6, 8]) {
    const hot = drawn(city, GH4, zoom, centre(GH4, 34, -95, 30, 30), cityLevels),
      warm = drawn(city, GH4, zoom, centre(GH4, 34, -95, 10, 10), cityLevels);
    assert.ok(hot >= 0.82, `zoom ${zoom}: the city draws ${hot.toFixed(2)}, short of the hot colours`);
    assert.ok(warm < 0.6, `zoom ${zoom}: the region draws ${warm.toFixed(2)}, among the hot colours`);
  }
});

test("zoomed out, the scale is anchored at the act's hottest places, so a continent isn't paler than its cities", () => {
  // Hot cities, five cells across, far apart on an empty continent.
  const points = field(GH4, -40, -80, 300, 160, (r, c) => (r % 40 < 5 && c % 25 < 5 ? 1 : 0));
  const levels = heatLevels(points, GH4);
  const city = centre(GH4, -40, -80, 82, 52);
  const plain = drawn(points, GH4, 2.5, city, flat());
  const anchored = drawn(points, GH4, 2.5, city, levels);
  assert.ok(plain < 0.5, `without the anchor the blur averages the cities into the empty land: ${plain.toFixed(2)}`);
  assert.ok(Math.abs(anchored - 0.85) < 0.12, `anchored, the cities read near the top: ${anchored.toFixed(2)}`);
  assert.ok(levels.every((l) => l >= 0.5 && l <= 6), "within bounds");
  assert.ok(Math.abs(drawn(points, GH4, 7, city, levels) - 0.85) < 0.12, "and close in, the same");
});

test("zoomed in past where the blur can span the grid, the cells show as the boxes they are, not as dots", () => {
  /** An `interpolate` over the zoom, worked out at a zoom. */
  const atZoom = (expr: unknown[], zoom: number) => {
    const stops = expr.slice(3) as number[];
    for (let i = 2; i < stops.length; i += 2)
      if (zoom <= stops[i]) return stops[i - 1] + ((stops[i + 1] - stops[i - 1]) * (zoom - stops[i - 2])) / (stops[i] - stops[i - 2]);
    return stops.at(-1)!;
  };
  for (const grid of [GH3, GH4, GH5]) {
    const apart = heatApart(grid);
    const points = field(grid, 30, -100, 5, 5, () => 0.8);
    const cell = centre(grid, 30, -100, 2, 2),
      next = centre(grid, 30, -100, 2, 3);
    const between = { lat: cell.lat, lon: (cell.lon + next.lon) / 2 };
    // Up to it, neighbouring blurs still make one field; a zoom past it, the blur alone would leave gaps: dots.
    const before = Math.floor(apart * 2) / 2,
      past = Math.ceil((apart + 1) * 2) / 2;
    assert.ok(drawn(points, grid, before, between) > 0.8 * drawn(points, grid, before, cell), `${grid.dLat}: one field up to it`);
    assert.ok(drawn(points, grid, past, between) < 0.5 * drawn(points, grid, past, cell), `${grid.dLat}: the blur alone leaves dots past it`);
    // So over that zoom the blur fades out and the boxes in.
    const blur = heatPaint(grid)["heatmap-opacity"],
      boxes = boxPaint(grid)["fill-opacity"];
    assert.ok(atZoom(blur, apart) > 0 && atZoom(blur, apart + 1) === 0);
    assert.ok(atZoom(boxes, apart) === 0 && atZoom(boxes, apart + 1) > 0);
    assert.ok(atZoom(blur, apart - 2) > 0 && atZoom(boxes, apart - 2) === 0, "zoomed out, only the blur");
    // Each box is its cell, in its own density.
    const box = heatBoxes(points, grid)[0];
    const [south, west, north, east] = cellBox(points[0][0], points[0][1], grid);
    assert.deepEqual(box.ring, [[west, south], [east, south], [east, north], [west, north], [west, south]]);
    assert.equal(box.density, 0.8 * 0.8);
  }
});

test("both maps share one colour scale, and the live map's paint is set every half zoom level", () => {
  assert.deepEqual(heatColor(0), HEAT_RAMP[0][1]);
  assert.deepEqual(heatColor(1), HEAT_RAMP.at(-1)![1]);
  assert.deepEqual(heatColor(0.35), HEAT_RAMP[2][1]);
  const alphas = Array.from({ length: 21 }, (_, i) => heatColor(i / 20)[3]);
  assert.ok(alphas.every((a, i) => !i || a >= alphas[i - 1]), "hotter is never fainter");
  const paint = heatPaint(GH4) as Record<string, unknown[]>;
  const stops = (expr: unknown[]) => expr.slice(3).filter((_, i) => i % 2 === 0) as number[];
  for (const name of ["heatmap-weight", "heatmap-radius", "heatmap-intensity"]) {
    assert.equal(paint[name][0], "interpolate");
    assert.deepEqual(stops(paint[name]), Array.from({ length: 45 }, (_, i) => i / 2), name);
  }
  const radii = paint["heatmap-radius"].slice(3).filter((_, i) => i % 2 === 1) as number[];
  assert.ok(radii.every((r, i) => r >= 20 && r <= 128 && (!i || r >= radii[i - 1])), "the blur grows with the zoom, within MapLibre's limits");
  assert.equal(paint["heatmap-color"].length, 3 + HEAT_RAMP.length * 2);
});
