// A tour as a still map, drawn on the server: Natural Earth's land (world-atlas, public domain), Qloo's heatmap as soft
// dots in the live map's colours, the route (straight for a drive, along the globe for a flight) and the numbered
// stops. For the places a live map doesn't suit: the landing page's examples, the info pages, and the PDF deck a
// headless browser prints.
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
/** Colour steps: each dot takes the nearest, and the dots of one step are drawn as one shape. */
const STEPS = 16;

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
  // A dot for each of Qloo's cells, about the size of its box, in its own colour. Where the map is too small to show every
  // cell, a dot stands for the strongest of the cells under it. The strongest are drawn last, so no weaker dot covers them.
  const grid = heatGrid(points);
  const dots = new Map<string, { x: number; y: number; r: number; w: number }>();
  for (const [lat, lon, w] of points) {
    if (cellDensity(w) < 0.03) continue;
    const [south, west, north, east] = cellBox(lat, lon, grid);
    const [x0, y0] = at(west, north),
      [x1, y1] = at(east, south);
    if (x1 < -20 || y1 < -20 || x0 > width + 20 || y0 > height + 20) continue;
    const r = Math.max(2, Math.min(14, 0.7 * Math.sqrt((x1 - x0) * (y1 - y0)))),
      x = (x0 + x1) / 2,
      y = (y0 + y1) / 2;
    const key = `${Math.round(x / r)},${Math.round(y / r)}`;
    if ((dots.get(key)?.w ?? -1) < w) dots.set(key, { x, y, r, w });
  }
  const steps = new Map<number, string>();
  for (const d of [...dots.values()].sort((a, b) => a.w - b.w)) {
    const step = Math.max(1, Math.round(cellDensity(d.w) * STEPS));
    const r = d.r.toFixed(1);
    steps.set(step, (steps.get(step) ?? "") + `M${(d.x - d.r).toFixed(1)} ${d.y.toFixed(1)}a${r} ${r} 0 1 0 ${(2 * d.r).toFixed(1)} 0a${r} ${r} 0 1 0 ${(-2 * d.r).toFixed(1)} 0`);
  }
  const shapes = [...steps].sort((a, b) => a[0] - b[0]).map(([step, d]) => {
    const [r, g, b, a] = heatColor(step / STEPS);
    return { d, fill: `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`, opacity: a };
  });
  const sizes = [...dots.values()].map((d) => d.r);
  const blur = sizes.length ? (sizes.reduce((a, b) => a + b, 0) / sizes.length) * 0.55 : 1;
  const legs = stops.slice(1).map((s, i) => {
    const from = stops[i];
    const line = s.leg === "fly" ? flightPath(from, s, 24) : [[from.lon, from.lat], [s.lon, s.lat]];
    return { fly: s.leg === "fly", d: "M" + line.map(([lon, lat]) => at(lon, lat).map((v) => v.toFixed(1)).join(",")).join("L") };
  });
  const id = label.replace(/[^a-z0-9]/gi, "").slice(0, 24) || "map";

  return (
    <svg className="hl-staticmap" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <defs>
        <filter id={`blur-${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={blur.toFixed(2)} />
        </filter>
      </defs>
      <rect width={width} height={height} fill="#dcdcf5" />
      <path d={path(LAND) ?? ""} fill="#f7f7fa" stroke="#e4e3f2" strokeWidth={0.8} />
      <g filter={`url(#blur-${id})`}>
        {shapes.map((p, i) => p.d && <path key={i} d={p.d} fill={p.fill} fillOpacity={p.opacity.toFixed(2)} />)}
      </g>
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
            <circle r={numbered ? 10.5 : 5} fill={s.hidden ? "#efff8a" : "#262a3f"} stroke="#fff" strokeWidth={2.5} />
            {numbered && (
              <text textAnchor="middle" dy="0.36em" fontSize={10.5} fontWeight={700} fill={s.hidden ? "#3f4a00" : "#fff"} fontFamily="var(--font-display), sans-serif">
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
