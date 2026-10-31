// A tour as a still map, drawn on the server: Natural Earth's land (world-atlas, public domain), Qloo's heatmap as a
// smooth field in the live map's colours, the route (straight for a drive, along the globe for a flight) and the numbered
// stops. For the places a live map doesn't suit: the landing page's examples, the info pages, and the PDF deck a
// headless browser prints.
import { deflateSync } from "node:zlib";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land from "world-atlas/land-50m.json";
import { flightPath } from "@/core/tour/geo";
import { cellBox, cellDensity, heatColor, heatGrid } from "@/core/tour/heat";

export interface StaticStop {
  name: string;
  lat: number;
  lon: number;
  hidden: boolean;
  leg?: "drive" | "fly";
}

const topology = land as unknown as Topology<{ land: GeometryCollection }>;
const LAND = feature(topology, topology.objects.land);
/** The heat image's pixels per unit of the map: a blur needs few, and few keep the page small. */
const HEAT_SCALE = 0.5;
/** Where the hottest places sit on the colour scale, as on the live map: near the top, short of its last colour. */
const HEAT_TOP = 0.85;

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
/** A PNG chunk: its length, type, data and checksum. */
function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = CRC[(crc ^ byte) & 255] ^ (crc >>> 8);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, body.length + 4);
  return out;
}

/**
 * Qloo's cells as one smooth field, as the live map's heat layer draws them: each cell a Gaussian weighted by its density,
 * added up, and coloured from the same scale. An image rather than vector shapes, so a blur prints the same everywhere.
 */
function heatImage(cells: { x: number; y: number; sigma: number; density: number }[], width: number, height: number) {
  const w = Math.ceil(width * HEAT_SCALE),
    h = Math.ceil(height * HEAT_SCALE);
  const field = new Float32Array(w * h);
  for (const c of cells) {
    const sigma = c.sigma * HEAT_SCALE,
      reach = Math.ceil(sigma * 3),
      cx = c.x * HEAT_SCALE,
      cy = c.y * HEAT_SCALE;
    for (let y = Math.max(0, Math.floor(cy - reach)); y < Math.min(h, cy + reach); y++)
      for (let x = Math.max(0, Math.floor(cx - reach)); x < Math.min(w, cx + reach); x++) field[y * w + x] += c.density * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma * sigma));
  }
  const lit = Array.from(field).filter((v) => v > 0).sort((a, b) => a - b);
  const top = lit[Math.floor(lit.length * 0.98)] ?? 1;
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = heatColor(Math.pow(Math.min(1, field[y * w + x] / top), 0.65) * HEAT_TOP);
      rows.set([Math.round(r), Math.round(g), Math.round(b), Math.round(a * 255)], y * (w * 4 + 1) + 1 + x * 4);
    }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head.set([8, 6], 8);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

export function StaticMap({
  points = [],
  stops = [],
  width = 640,
  height = 400,
  label,
  numbered = true,
}: {
  points?: [number, number, number][];
  stops?: StaticStop[];
  width?: number;
  height?: number;
  label: string;
  numbered?: boolean;
}) {
  // The frame takes in the stops and where the fans are strongest, so a tour is seen in its region.
  const strong = points.filter((p) => p[2] > 0.7);
  const frame = [...stops.map((s) => [s.lon, s.lat]), ...strong.map(([lat, lon]) => [lon, lat])];
  const projection = geoMercator();
  const pad = Math.round(Math.min(width, height) * 0.14);
  if (frame.length > 1) projection.fitExtent([[pad, pad], [width - pad, height - pad]], { type: "MultiPoint", coordinates: frame });
  else projection.scale(width * 1.2).center((frame[0] as [number, number]) ?? [0, 20]).translate([width / 2, height / 2]);
  // Never closer than a region: one stop or a tight cluster still shows its surroundings.
  if (projection.scale() > width * 6) projection.scale(width * 6);
  projection.clipExtent([[0, 0], [width, height]]);
  const path = geoPath(projection);
  const at = (lon: number, lat: number) => projection([lon, lat]) ?? [-99, -99];
  // Each of Qloo's cells, as wide as its box or the blur a small map needs to read as a field.
  const grid = heatGrid(points);
  const cells = points.flatMap(([lat, lon, w]) => {
    const density = cellDensity(w);
    if (density < 0.02) return [];
    const [south, west, north, east] = cellBox(lat, lon, grid);
    const [x0, y0] = at(west, north),
      [x1, y1] = at(east, south);
    if (x1 < -60 || y1 < -60 || x0 > width + 60 || y0 > height + 60) return [];
    return [{ x: (x0 + x1) / 2, y: (y0 + y1) / 2, sigma: Math.max(Math.min(width, height) * 0.016, 0.8 * Math.sqrt((x1 - x0) * (y1 - y0))), density }];
  });
  const heat = cells.length ? heatImage(cells, width, height) : undefined;
  const legs = stops.slice(1).map((s, i) => {
    const from = stops[i];
    const line = s.leg === "fly" ? flightPath(from, s, 24) : [[from.lon, from.lat], [s.lon, s.lat]];
    return { fly: s.leg === "fly", d: "M" + line.map(([lon, lat]) => at(lon, lat).map((v) => v.toFixed(1)).join(",")).join("L") };
  });

  return (
    <svg className="hl-staticmap" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <rect width={width} height={height} fill="#dcdcf5" />
      <path d={path(LAND) ?? ""} fill="#f7f7fa" stroke="#e4e3f2" strokeWidth={0.8} />
      {heat && <image href={heat} width={width} height={height} preserveAspectRatio="none" />}
      {legs.map((l, i) => (
        <g key={i}>
          <path d={l.d} fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" opacity={0.85} />
          <path d={l.d} fill="none" stroke="#262a3f" strokeWidth={2.2} strokeLinecap="round" strokeDasharray={l.fly ? "4 5" : undefined} />
        </g>
      ))}
      {stops.map((s, i) => {
        const [x, y] = at(s.lon, s.lat);
        return (
          <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
            <circle r={numbered ? 10.5 : 5} fill={s.hidden ? "#e0ddfa" : "#262a3f"} stroke={s.hidden ? "#4336ff" : "#fff"} strokeWidth={2.5} />
            {numbered && (
              <text textAnchor="middle" dy="0.36em" fontSize={10.5} fontWeight={700} fill={s.hidden ? "#4336ff" : "#fff"} fontFamily="var(--font-display), sans-serif">
                {i + 1}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** A plan's stops, for the still map. */
export function planStops(plan: { route: { cityId: string; mode?: "drive" | "fly" }[]; cities: { id: string; name: string; lat: number; lon: number; hidden: boolean }[] }): StaticStop[] {
  return plan.route.flatMap((r) => {
    const c = plan.cities.find((x) => x.id === r.cityId);
    return c ? [{ name: c.name, lat: c.lat, lon: c.lon, hidden: c.hidden, leg: r.mode }] : [];
  });
}
