// The What it does page's two diagrams, drawn on the server: who the crowd is, and a real map of the cities. Illustrative,
// like the page's other examples: the country's shape is Natural Earth's (world-atlas), the cities are examples.
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import countries from "world-atlas/countries-50m.json";

const topology = countries as unknown as Topology<{ countries: GeometryCollection }>;
const UNITED_STATES = { type: "GeometryCollection" as const, geometries: topology.objects.countries.geometries.filter((c) => String(c.id) === "840") };
const COUNTRY = feature(topology, UNITED_STATES);

const TASTES = ["Music", "Travel", "Film", "Style", "Food"];

/** The fan in the middle, and five of the things they love around them. */
export function CrowdOrbit() {
  const c = 220;
  const ring = 112;
  const tags = 168;
  const at = (i: number, r: number) => {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  return (
    <svg className="af3-orbit" viewBox="0 0 440 440" aria-hidden>
      <circle cx={c} cy={c} r={ring} fill="none" stroke="rgb(255 255 255 / 0.4)" strokeDasharray="3 7" />
      <circle cx={c} cy={c} r={46} fill="rgb(255 255 255 / 0.08)" stroke="rgb(255 255 255 / 0.65)" />
      <circle cx={c} cy={c - 11} r={11} fill="#fff" />
      <path d={`M${c - 20} ${c + 22}a20 18 0 0 1 40 0z`} fill="#fff" />
      {TASTES.map((t, i) => {
        const [x, y] = at(i, ring);
        const [tx, ty] = at(i, tags);
        return (
          <g key={t}>
            <line x1={x} y1={y} x2={tx} y2={ty} stroke="rgb(255 255 255 / 0.4)" />
            <circle className="af3-orbit-dot" style={{ animationDelay: `${i * 0.5}s` }} cx={x} cy={y} r={9} fill="#fff" />
            <rect x={tx - 50} y={ty - 22} width={100} height={44} rx={22} fill="#3a2ee8" stroke="rgb(255 255 255 / 0.75)" />
            <text x={tx} y={ty + 6} textAnchor="middle" fill="#fff" fontSize={18} fontWeight={500}>
              {t}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const CITIES = [
  { name: "Portland", lon: -122.68, lat: 45.52 },
  { name: "Chicago", lon: -87.63, lat: 41.88 },
  { name: "Austin", lon: -97.74, lat: 30.27 },
];

/** The United States with three cities on it, labelled. */
export function CitiesMap() {
  const width = 720;
  const height = 440;
  const projection = geoMercator().fitExtent(
    [
      [10, 16],
      [width - 10, height - 16],
    ],
    {
      type: "MultiPoint",
      coordinates: [
        [-125, 49],
        [-67, 25],
      ],
    },
  );
  projection.clipExtent([
    [0, 0],
    [width, height],
  ]);
  const path = geoPath(projection);
  return (
    <svg className="af3-map" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <path d={path(COUNTRY) ?? ""} fill="#fff" stroke="#d9d7f3" strokeWidth={1} />
      {CITIES.map((city) => {
        const [x, y] = projection([city.lon, city.lat]) ?? [0, 0];
        const label = city.name.length * 9 + 50;
        return (
          <g key={city.name} transform={`translate(${x} ${y})`}>
            <rect x={-18} y={-20} width={label} height={40} rx={20} fill="#fff" stroke="#c9c6ee" />
            <circle r={8} fill="#4336ff" />
            <text x={16} y={6} fill="#262a3f" fontSize={17} fontWeight={500}>
              {city.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
