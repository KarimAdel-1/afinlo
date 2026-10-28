// What a market's people can spend, for sizing a world tour's cities: each country's GDP per head, from Natural Earth's
// countries (public domain, naturalearthdata.com; the World Bank's figures, 2019 for most). Writes
// src/core/tour/spending.json, for the countries in the city list. Run again only to change the figures:
//   curl -L -o countries.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
//   npx tsx scripts/world-spending.mts countries.geojson

import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("Give the path to Natural Earth's ne_50m_admin_0_countries.geojson.");

/** Places in the city list that Natural Earth counts as part of a country, whose figure they take. */
const PART_OF: Record<string, string> = { GP: "FR", MQ: "FR", RE: "FR", GI: "GB" };

const features: { properties: Record<string, unknown> }[] = JSON.parse(readFileSync(file, "utf8")).features;
// A code can name a country and its small territories too (AU for Ashmore and Cartier): the country is the biggest.
const figures = new Map<string, { perHead: number; year: number; people: number }>();
for (const { properties: p } of features) {
  const iso = String(p.ISO_A2_EH === "-99" ? p.ISO_A2 : p.ISO_A2_EH);
  const gdp = Number(p.GDP_MD),
    people = Number(p.POP_EST);
  if (iso !== "-99" && gdp > 0 && people > (figures.get(iso)?.people ?? 0)) figures.set(iso, { perHead: Math.round((gdp * 1e6) / people), year: Number(p.GDP_YEAR), people });
}

const cities: { country: string }[] = JSON.parse(readFileSync("src/core/tour/world.json", "utf8")).cities;
const countries = [...new Set(cities.map((c) => c.country))].sort();
const missing = countries.filter((iso) => !figures.has(iso) && !figures.has(PART_OF[iso]));
if (missing.length) throw new Error(`No figure for ${missing.join(", ")}: add them to PART_OF.`);
const gdpPerHead = Object.fromEntries(countries.map((iso) => [iso, (figures.get(iso) ?? figures.get(PART_OF[iso])!).perHead]));
const years = countries.map((iso) => (figures.get(iso) ?? figures.get(PART_OF[iso])!).year);

writeFileSync(
  "src/core/tour/spending.json",
  JSON.stringify({
    source: `Natural Earth countries (ne_50m_admin_0_countries), public domain: GDP per head, the World Bank's figures for ${Math.min(...years)}–${Math.max(...years)}, ${years.filter((y) => y === 2019).length} of ${years.length} countries for 2019`,
    gdpPerHead,
  }) + "\n",
);
console.log(`${countries.length} countries; years ${Math.min(...years)}–${Math.max(...years)}`);
