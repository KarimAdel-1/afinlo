// The candidate tour cities, worldwide: every city of 90,000 people or more in Natural Earth's populated places
// (public domain, naturalearthdata.com), one per metro area. A city within 45 km of a bigger one in the same country is
// part of it, the same radius Fan Heat counts Qloo's heatmap cells in. Writes src/core/tour/world.json (the
// cities, for the server) and countries.json (their names, small enough for the browser). Run again only to change
// the list:
//   curl -L -o places.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson
//   npx tsx scripts/world-cities.mts places.geojson

import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("Give the path to Natural Earth's ne_10m_populated_places_simple.geojson.");

const MIN_POPULATION = 90_000;
const SAME_METRO_KM = 45;
/** Natural Earth's names where a shorter or more usual one reads better. */
const NAMES: Record<string, string> = {
  US: "United States",
  CD: "DR Congo",
  CG: "Republic of the Congo",
  HK: "Hong Kong",
  MO: "Macau",
  BS: "Bahamas",
  GM: "Gambia",
  SZ: "Eswatini",
  TL: "Timor-Leste",
  GW: "Guinea-Bissau",
  CW: "Curaçao",
  GP: "Guadeloupe",
  MQ: "Martinique",
  RE: "Réunion",
  XK: "Kosovo",
};
/** Countries Natural Earth gives no ISO code. Somaliland's cities are left out rather than placed in a country. */
const CODES: Record<string, string> = { KOS: "XK" };

interface Place {
  name: string;
  ascii: string;
  admin1: string;
  country: string;
  countryName: string;
  lat: number;
  lon: number;
  population: number;
}

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const slug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const features: { properties: Record<string, unknown> }[] = JSON.parse(readFileSync(file, "utf8")).features;
const places: Place[] = features.flatMap(({ properties: p }) => {
  const iso = p.iso_a2 === "-99" ? CODES[String(p.adm0_a3)] : String(p.iso_a2);
  if (!iso || Number(p.pop_max) < MIN_POPULATION) return [];
  return [
    {
      name: String(p.name).replace(/\s+/g, " ").trim(),
      ascii: String(p.nameascii || p.name),
      admin1: String(p.adm1name ?? ""),
      country: iso,
      countryName: NAMES[iso] ?? String(p.adm0name),
      lat: Number(Number(p.latitude).toFixed(4)),
      lon: Number(Number(p.longitude).toFixed(4)),
      population: Number(p.pop_max),
    },
  ];
});

// Biggest first, so a metro keeps its main city.
places.sort((a, b) => b.population - a.population);
const kept: Place[] = [];
for (const p of places) if (!kept.some((k) => k.country === p.country && km(k, p) < SAME_METRO_KM)) kept.push(p);

const ids = new Set<string>();
const cities = kept.map((p) => {
  let id = `${p.country.toLowerCase()}-${slug(p.ascii)}`;
  if (ids.has(id)) id = `${id}-${slug(p.admin1)}`;
  for (let n = 2; ids.has(id); n++) id = `${p.country.toLowerCase()}-${slug(p.ascii)}-${n}`;
  ids.add(id);
  return { id, name: p.name, admin1: p.admin1, country: p.country, lat: p.lat, lon: p.lon, population: p.population };
});
const countries = Object.fromEntries([...new Map(kept.map((p) => [p.country, p.countryName])).entries()].sort((a, b) => a[1].localeCompare(b[1])));

writeFileSync(
  "src/core/tour/world.json",
  JSON.stringify(
    {
      source: {
        cities: "Natural Earth populated places (ne_10m_populated_places_simple), public domain",
        population: "Natural Earth's metro-area estimate (pop_max)",
        rule: `Cities of ${MIN_POPULATION.toLocaleString("en-US")}+ people; a city within ${SAME_METRO_KM} km of a bigger one in the same country counts as part of it`,
      },
      cities,
    },
    null,
    0,
  ),
);
writeFileSync("src/core/tour/countries.json", JSON.stringify(countries, null, 1) + "\n");
console.log(`${cities.length} cities in ${Object.keys(countries).length} countries`);
