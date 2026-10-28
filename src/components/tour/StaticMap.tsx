// A tour as a still map, drawn on the server: Natural Earth's land (world-atlas, public domain), Qloo's heatmap as
// soft dots, the route (straight for a drive, along the globe for a flight) and the numbered stops. For the places a
// live map doesn't suit: the landing page's examples, the info pages, and the PDF deck a headless browser prints.
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land from "world-atlas/land-50m.json";
import { arc } from "@/core/tour/geo";

export interface StaticStop {
  name: string;
  lat: number;
  lon: number;
  hidden: boolean;
  leg?: "drive" | "fly";
}

const topology = land as unknown as Topology<{ land: GeometryCollection }>;
const LAND = feature(topology, topology.objects.land);
/** Blue to pink, as on the live map: more fans is pinker. */
const COLOR = (w: number) => (w > 0.8 ? "#ff4f7e" : w > 0.6 ? "#be46dc" : w > 0.35 ? "#4336ff" : "#8f86ff");

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
  const inView = (x: number, y: number) => x > -20 && y > -20 && x < width + 20 && y < height + 20;
  const dots = points.flatMap(([lat, lon, w]) => {
    if (w < 0.2) return [];
    const [x, y] = at(lon, lat);
    return inView(x, y) ? [{ x, y, w }] : [];
  });
  const r = Math.max(2.5, Math.min(14, Math.sqrt((width * height) / Math.max(1, dots.length)) * 0.5));
  const legs = stops.slice(1).map((s, i) => {
    const from = stops[i];
    const line = s.leg === "fly" ? arc(from, s, 24) : [[from.lon, from.lat], [s.lon, s.lat]];
    return { fly: s.leg === "fly", d: "M" + line.map(([lon, lat]) => at(lon, lat).map((v) => v.toFixed(1)).join(",")).join("L") };
  });
  const id = label.replace(/[^a-z0-9]/gi, "").slice(0, 24) || "map";

  return (
    <svg className="hl-staticmap" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <defs>
        <filter id={`blur-${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={r * 0.55} />
        </filter>
      </defs>
      <rect width={width} height={height} fill="#dcdcf5" />
      <path d={path(LAND) ?? ""} fill="#f7f7fa" stroke="#e4e3f2" strokeWidth={0.8} />
      <g filter={`url(#blur-${id})`}>
        {dots.map((d, i) => (
          <circle key={i} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={(r * (0.7 + d.w * 0.6)).toFixed(1)} fill={COLOR(d.w)} fillOpacity={0.08 + d.w * 0.4} />
        ))}
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
