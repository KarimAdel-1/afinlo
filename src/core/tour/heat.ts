// How Qloo's heatmap is drawn, so the drawing stays true to the cells, on both maps: the live one (MapLibre, in the
// browser) and the still one (SVG, on the server). Qloo's cells are geohash boxes on a regular grid, and a cell's
// colour comes from its own strength, on one scale for both maps. The live map blurs the cells into a field. The blur
// is sized to the grid, and the field is calibrated so that how hot a place looks doesn't change with the zoom, the
// latitude or how many cells are near it. Its scale is anchored at the act's hottest places (heatLevels). Zoomed in
// past where a blur can span the grid, the cells show as the boxes they are (heatApart).
// Pure, and small enough for the browser.

/** The size of Qloo's cells, in degrees. */
export interface HeatGrid {
  dLat: number;
  dLon: number;
}

/** Geohash boxes of length 3 to 6, in degrees, as [latitude, longitude]. Qloo answers the world in 3s, a region in 4s, a country in 5s. */
const GEOHASH: [number, number][] = [
  [1.40625, 1.40625],
  [0.17578125, 0.3515625],
  [0.0439453125, 0.0439453125],
  [0.0054931640625, 0.010986328125],
];

/** The grid a map's points lie on: the closest spacing between their rows and between their columns, matched to a geohash length. */
export function heatGrid(points: [number, number, number][]): HeatGrid {
  const gap = (values: number[]) => {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    let min = Infinity;
    // Points are rounded to 0.01°, so anything closer is the same row.
    for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] > 0.005) min = Math.min(min, sorted[i] - sorted[i - 1]);
    return min;
  };
  const lat = gap(points.map((p) => p[0])),
    lon = gap(points.map((p) => p[1]));
  const miss = ([a, b]: [number, number]) => (Number.isFinite(lat) ? Math.abs(Math.log(lat / a)) : 0) + (Number.isFinite(lon) ? Math.abs(Math.log(lon / b)) : 0);
  const [dLat, dLon] = GEOHASH.reduce((best, g) => (miss(g) < miss(best) ? g : best), GEOHASH[1]);
  return { dLat, dLon };
}

/** The box of the grid a point falls in, as [south, west, north, east]: the cell Qloo measured. */
export function cellBox(lat: number, lon: number, grid: HeatGrid): [number, number, number, number] {
  const south = Math.floor((lat + 90) / grid.dLat) * grid.dLat - 90,
    west = Math.floor((lon + 180) / grid.dLon) * grid.dLon - 180;
  return [south, west, south + grid.dLat, west + grid.dLon];
}

/** A cell's density on both maps: its strength (0–1) squared, so most of the map stays clear and colour gathers where the fans are. */
export const cellDensity = (w: number) => w * w;

/** Density to colour, from clear to hot, as [density, [red, green, blue, alpha]]: the landing page's blue, light to deep. */
export const HEAT_RAMP: [number, [number, number, number, number]][] = [
  [0, [143, 134, 255, 0]],
  [0.12, [143, 134, 255, 0.32]],
  [0.35, [98, 86, 255, 0.5]],
  [0.6, [67, 54, 255, 0.64]],
  [0.82, [47, 34, 230, 0.74]],
  [1, [30, 23, 168, 0.86]],
];

/** The ramp's colour at a density, as the live map blends it. */
export function heatColor(density: number): [number, number, number, number] {
  const d = Math.min(1, Math.max(0, density));
  const i = HEAT_RAMP.findIndex(([at]) => at >= d);
  if (i <= 0) return HEAT_RAMP[0][1];
  const [d0, c0] = HEAT_RAMP[i - 1],
    [d1, c1] = HEAT_RAMP[i];
  const t = (d - d0) / (d1 - d0);
  return c0.map((v, k) => v + (c1[k] - v) * t) as [number, number, number, number];
}

// The live map.

/**
 * The live map's points, as [latitude, longitude, density, stretch]: each cell's centre, its density, and how much
 * taller than at the equator Mercator draws it, less one.
 */
export function heatSpots(points: [number, number, number][], grid = heatGrid(points)): [number, number, number, number][] {
  return points.map(([lat, lon, w]) => {
    const [south, west, north, east] = cellBox(lat, lon, grid);
    const middle = (south + north) / 2;
    return [middle, (west + east) / 2, cellDensity(w), 1 / Math.max(0.2, Math.cos((middle * Math.PI) / 180)) - 1];
  });
}

/** MapLibre's heat kernel is a Gaussian a third of its radius wide, peaking at weight × intensity × this. */
const GAUSS = 1 / Math.sqrt(2 * Math.PI);
/** The blur's radius, in cells across: wide enough that neighbours blend into an even field (a region's cells are twice as wide as tall). */
const SPREAD = 1.5;
/** MapLibre draws heat on a quarter-size texture: a smaller blur shows the texture's pixels as stripes. */
const MIN_RADIUS = 20;
/** Past this, a point's blur would reach off-screen tiles, which MapLibre doesn't draw. */
const MAX_RADIUS = 128;
/** Where the hottest places sit on the scale (heatLevels): near the top, short of its last colour. */
const TOP = 0.85;
/** The zooms the paint is set at, every half level; MapLibre interpolates between them. */
const ZOOMS = Array.from({ length: 45 }, (_, i) => i / 2);
const PER_DEGREE = (zoom: number) => (512 * 2 ** zoom) / 360;
/** The grid's spacing in pixels at a zoom, at the equator, as [across, down]. */
const spacing = (grid: HeatGrid, zoom: number) => [grid.dLon * PER_DEGREE(zoom), grid.dLat * PER_DEGREE(zoom)];

/** The blur's radius in pixels at a zoom, for a grid. */
export const heatRadius = (grid: HeatGrid, zoom: number) => Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, SPREAD * spacing(grid, zoom)[0]));

/** A row of kernels `s` pixels apart, summed where one of them peaks. The kernel is a Gaussian, so a grid's sum is its row's times its column's. */
function line(r: number, s: number) {
  let sum = 0;
  for (let i = -Math.ceil((2 * r) / s); i <= Math.ceil((2 * r) / s); i++) sum += Math.exp((-4.5 * (i * s) ** 2) / r ** 2);
  return sum;
}

/** The intensity that makes an even field of cells of density 1 draw density 1 at a zoom, at the equator. */
export function heatIntensity(grid: HeatGrid, zoom: number) {
  const r = heatRadius(grid, zoom),
    [sx, sy] = spacing(grid, zoom);
  return 1 / (GAUSS * line(r, sx) * line(r, sy));
}

/**
 * What a point's weight is multiplied by at a zoom, for how much taller than at the equator Mercator draws its cell
 * (`stretch`, as heatSpots gives it). Taller rows put fewer of them under each blur. While neighbouring rows' blurs
 * overlap, that loses all of the stretch; zoomed in, where each point's blur stands alone, it loses nothing.
 */
export function stretchFix(grid: HeatGrid, zoom: number, stretch: number) {
  const r = heatRadius(grid, zoom),
    sy = spacing(grid, zoom)[1];
  return line(r, sy) / line(r, sy * (1 + stretch));
}
/** The stretches the weight is set at: from the equator (0) to 78° (4); MapLibre interpolates between them. */
const STRETCHES = [0, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2.5, 4];

/** How many of the points heatLevels works the density out at: enough for a steady 95th percentile. */
const SAMPLE = 1500;

/**
 * How much to brighten the heat at each zoom (every half level) so the act's hottest places sit near the top of the
 * scale: TOP over the 95th percentile of the density MapLibre will draw at the points. Zoomed out, the blur is wider than
 * Qloo's cells. It averages each place with its weaker neighbours and with the empty land and sea between cities, so a
 * continent would look paler than its cities are. Affinity ranks places within the area, so the scale is the act's
 * own. The density is MapLibre's Gaussian sum, worked out on the grid at a sample of the points; where the blur spans
 * many cells, on a coarser grid of their averages.
 */
export function heatLevels(points: [number, number, number][], grid = heatGrid(points)): number[] {
  const spots = heatSpots(points, grid);
  if (!spots.length) return ZOOMS.map(() => 1);
  const rows = spots.map(([lat]) => Math.floor((lat + 90) / grid.dLat)),
    cols = spots.map(([, lon]) => Math.floor((lon + 180) / grid.dLon));
  let top = Infinity,
    left = Infinity,
    bottom = -Infinity,
    right = -Infinity;
  for (let i = 0; i < spots.length; i++) {
    top = Math.min(top, rows[i]);
    bottom = Math.max(bottom, rows[i]);
    left = Math.min(left, cols[i]);
    right = Math.max(right, cols[i]);
  }
  // The cells' densities on the grid, `f` cells to a slot each way for a very large area; then coarser grids of their
  // averages, two slots by two.
  const f = Math.max(1, Math.ceil(Math.sqrt(((bottom - top + 1) * (right - left + 1)) / 2e6)));
  const row = (i: number) => Math.floor((rows[i] - top) / f),
    col = (i: number) => Math.floor((cols[i] - left) / f);
  const grids = [{ h: Math.floor((bottom - top) / f) + 1, w: Math.floor((right - left) / f) + 1, v: new Float32Array(0) }];
  grids[0].v = new Float32Array(grids[0].h * grids[0].w);
  for (let i = 0; i < spots.length; i++) grids[0].v[row(i) * grids[0].w + col(i)] += spots[i][2] / (f * f);
  while (grids.length < 12 && (grids.at(-1)!.h > 1 || grids.at(-1)!.w > 1)) {
    const { h, w, v } = grids.at(-1)!;
    const H = Math.ceil(h / 2),
      W = Math.ceil(w / 2),
      out = new Float32Array(H * W);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[(r >> 1) * W + (c >> 1)] += v[r * w + c] / 4;
    grids.push({ h: H, w: W, v: out });
  }
  const sample = Array.from({ length: Math.min(SAMPLE, spots.length) }, (_, k) => Math.floor((k * spots.length) / Math.min(SAMPLE, spots.length)));
  const weights = (sigma: number) => {
    const n = Math.ceil(3 * sigma),
      out = Array.from({ length: 2 * n + 1 }, (_, i) => Math.exp(-((i - n) ** 2) / (2 * sigma * sigma)));
    return { n, out, sum: out.reduce((a, b) => a + b, 0) };
  };
  // Zooms where the blur spans the same share of a cell (as it does while it grows with the zoom) or less than a fifth of
  // one (zoomed right in) come out the same.
  const done = new Map<string, number>();
  return ZOOMS.map((zoom) => {
    const sigma = heatRadius(grid, zoom) / 3,
      [sx, sy] = spacing(grid, zoom);
    // The blur in slots across, and the coarsest grid on which it still spans a few slots.
    const across = sigma / (sx * f),
      key = across < 0.2 ? "point" : across.toFixed(3);
    if (done.has(key)) return done.get(key)!;
    const level = Math.max(0, Math.min(grids.length - 1, Math.floor(Math.log2(across / 1.5))));
    const { h, w, v } = grids[level],
      scale = 2 ** level;
    const wx = weights(across / scale);
    const at = sample.map((i) => {
      // Down, rows are taller (so the blur spans fewer) the further the point is from the equator.
      const wy = weights(sigma / (sy * (1 + spots[i][3]) * f * scale));
      const r0 = row(i) >> level,
        c0 = col(i) >> level;
      let sum = 0;
      for (let dr = -wy.n; dr <= wy.n; dr++) {
        const r = r0 + dr;
        if (r < 0 || r >= h) continue;
        let across = 0;
        for (let dc = -wx.n; dc <= wx.n; dc++) {
          const c = c0 + dc;
          if (c >= 0 && c < w) across += wx.out[dc + wx.n] * v[r * w + c];
        }
        sum += wy.out[dr + wy.n] * across;
      }
      return sum / (wx.sum * wy.sum);
    });
    at.sort((a, b) => a - b);
    done.set(key, Math.min(6, Math.max(0.5, TOP / Math.max(1e-3, at[Math.floor(0.95 * (at.length - 1))]))));
    return done.get(key)!;
  });
}

const fix = (v: number) => Number(v.toPrecision(4));
const RAMP = ["interpolate", ["linear"], ["heatmap-density"], ...HEAT_RAMP.flatMap(([d, [r, g, b, a]]) => [d, `rgba(${r},${g},${b},${a})`])];

/**
 * The zoom past which the blur, at its widest, no longer spans Qloo's grid. Drawn as blurs from there, the cells would
 * stand apart as dots, each looking like a hot spot when it's an area 5 to 150 km across. So over the next zoom level
 * the live map fades the blur out and the cells in, as the boxes they are (heatBoxes).
 */
export const heatApart = (grid: HeatGrid) => fix(Math.log2(MAX_RADIUS / SPREAD / spacing(grid, 0)[0]));

/** How strongly the heat shows at a zoom, however it's drawn: close in, the streets and venues matter more. */
const closeIn = (zoom: number) => 0.9 - 0.55 * Math.min(1, Math.max(0, (zoom - 9) / 4));
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** An opacity by zoom: closeIn, times `share` (0–1) of it at each zoom. */
function fade(share: (zoom: number) => number, apart: number, most = 1) {
  const zooms = [...new Set([...ZOOMS, apart, apart + 1].map(fix))].sort((a, b) => a - b);
  return ["interpolate", ["linear"], ["zoom"], ...zooms.flatMap((z) => [z, Math.round(1000 * most * closeIn(z) * share(z)) / 1000])];
}

/** The live map's heat layer paint, for the points heatSpots gives (with `density` and `stretch`) and their heatLevels. */
export function heatPaint(grid: HeatGrid, levels: number[] = ZOOMS.map(() => 1)) {
  const apart = heatApart(grid);
  return {
    "heatmap-weight": [
      "interpolate",
      ["linear"],
      ["zoom"],
      ...ZOOMS.flatMap((z) => [z, ["*", ["get", "density"], ["interpolate", ["linear"], ["get", "stretch"], ...STRETCHES.flatMap((k) => [k, fix(stretchFix(grid, z, k))])]]]),
    ],
    "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], ...ZOOMS.flatMap((z) => [z, fix(heatRadius(grid, z))])],
    "heatmap-intensity": ["interpolate", ["exponential", 2], ["zoom"], ...ZOOMS.flatMap((z, i) => [z, fix(heatIntensity(grid, z) * levels[i])])],
    "heatmap-color": RAMP,
    "heatmap-opacity": fade((z) => clamp(apart + 1 - z), apart),
  };
}

/** Qloo's cells as the boxes they are, for the live map zoomed in: each cell's outline, [longitude, latitude], and its density. */
export function heatBoxes(points: [number, number, number][], grid = heatGrid(points)): { density: number; ring: [number, number][] }[] {
  return points.map(([lat, lon, w]) => {
    const [south, west, north, east] = cellBox(lat, lon, grid);
    return { density: cellDensity(w), ring: [[west, south], [east, south], [east, north], [west, north], [west, south]] };
  });
}

/**
 * The paint for heatBoxes: each box its own colour, on the scale both maps share (as the still map colours its cells),
 * fading in where the blur fades out. Lighter than the blur: a box covers a whole area evenly, streets included.
 */
export function boxPaint(grid: HeatGrid) {
  const apart = heatApart(grid);
  return {
    "fill-color": ["interpolate", ["linear"], ["get", "density"], ...HEAT_RAMP.flatMap(([d, [r, g, b, a]]) => [d, `rgba(${r},${g},${b},${a})`])],
    "fill-opacity": fade((z) => clamp(z - apart), apart, 0.45),
  };
}
