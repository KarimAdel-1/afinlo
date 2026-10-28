// The backtest (its method is on the Does it work? page): do the cities Afinlo ranks as an act's biggest fan
// bases include the cities where people actually listen? For each act in docs/evaluation/backtest.json
// whose real top cities have been recorded (by hand, from its public streaming profile, with source and date), count
// how many of its top 5 US cities appear in Afinlo's top 10, and in the top 10 of what a booker would pick with no
// taste data: the biggest cities. Writes docs/evaluation/backtest-results.json, which the Does it work? page
// shows. The ranking rule below was fixed before any result was seen; don't tune it on the acts you report.
//   npm run backtest

import { readFileSync, writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");
const { planTour } = await import("../src/platform/tour/agent");
const { qlooClient, searchActs } = await import("../src/platform/tour/qloo");
const { matchCity, templatePitch } = await import("../src/platform/tour/writer");
const { US } = await import("../src/core/tour/regions");
const { citiesIn } = await import("../src/core/tour/world");
const { closeDb } = await import("../src/lib/db");

interface Input {
  acts: { act: string; source: string; checkedAt: string; topCities: string[] }[];
}
const input = JSON.parse(readFileSync("docs/evaluation/backtest.json", "utf8")) as Input;
const ready = input.acts.filter((a) => a.topCities.length >= 3 && a.source && a.checkedAt);
if (!ready.length) {
  console.log("No act has its real top cities recorded yet. Fill topCities, source and checkedAt in docs/evaluation/backtest.json.");
  process.exit(0);
}
const client = qlooClient();
const usCities = citiesIn(US).map((c) => ({ ...c, state: c.admin1 }));
const name = (id: string) => usCities.find((c) => c.id === id)?.name ?? id;
// Without taste data, a booker plays the biggest cities: the same for every act.
const biggest = [...usCities].sort((a, b) => b.population - a.population).slice(0, 10).map((c) => c.id);
const rows = [];
for (const a of ready) {
  const act = (await searchActs(client, a.act, [])).find((x) => x.name.toLowerCase() === a.act.toLowerCase());
  if (!act) {
    console.warn(`${a.act}: not found in Qloo, skipped.`);
    continue;
  }
  const plan = await planTour({ actId: act.id, where: US, stops: 7 }, { client, writer: async (f) => templatePitch(f) });
  // Fan base: market size, scaled up to 1.5× by how strongly the audience over-indexes there (fixed rule).
  const fanBase = [...plan.cities].sort((x, y) => y.population * (0.5 + y.heat / 200) - x.population * (0.5 + x.heat / 200)).slice(0, 10).map((c) => c.id);
  const actual = a.topCities.slice(0, 5).map((c) => matchCity(c, usCities)).filter((id): id is string => !!id);
  const row = {
    act: a.act,
    source: a.source,
    checkedAt: a.checkedAt,
    actual: actual.map(name),
    afinlo: fanBase.map(name),
    afinloHits: actual.filter((id) => fanBase.includes(id)).length,
    baseline: biggest.map(name),
    baselineHits: actual.filter((id) => biggest.includes(id)).length,
  };
  rows.push(row);
  console.log(`${a.act}: Afinlo ${row.afinloHits}/${actual.length}, biggest cities ${row.baselineHits}/${actual.length}`);
}
const total = rows.reduce((s, r) => s + r.actual.length, 0);
writeFileSync(
  "docs/evaluation/backtest-results.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      method:
        "For each act, its real top US listener cities were recorded by hand from its public streaming profile (source and date shown). A hit is a real top-5 city that appears in the system's top 10. Afinlo's top 10 ranks its US cities with data by market size × (0.5 + Fan Heat / 200); the baseline is the 10 biggest US cities, what a booker without taste data would play.",
      acts: rows,
      summary: {
        acts: rows.length,
        afinloHitRate: total ? rows.reduce((s, r) => s + r.afinloHits, 0) / total : 0,
        baselineHitRate: total ? rows.reduce((s, r) => s + r.baselineHits, 0) / total : 0,
      },
    },
    null,
    1,
  ) + "\n",
);
console.log("Written docs/evaluation/backtest-results.json");
await closeDb();
