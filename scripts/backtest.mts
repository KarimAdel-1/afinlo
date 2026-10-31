// The backtest (its method is on the Does it work? page): do the cities Afinlo ranks as an act's biggest fan
// bases include the cities where people actually listen? For each act in docs/evaluation/backtest.json
// whose real top cities have been recorded (by hand, from its public streaming profile, with source and date), count
// how many of its top 5 US cities appear in Afinlo's top 10, and in the top 10 of what a booker would pick with no
// taste data: the biggest cities. Writes docs/evaluation/backtest-results.json, which the Does it work? page
// shows. The ranking rules below were fixed before any result was seen; don't tune them on the acts you report.
//
// What it does and doesn't establish:
//   - It ranks every US candidate city with Qloo data (the full scored set, not a plan's kept 80), from the act's own
//     heatmap, as the planner scores it.
//   - Every recorded city counts: one that matches no Afinlo city, or has no Qloo data, is a miss and is listed, so the
//     denominators are the recorded cities, not the ones that happened to match.
//   - Two rankings are reported. "Fan base" (market size × Fan Heat) asks where the audience is: audience geography.
//     "Tour score" is the rule the route is chosen by: whether the planner's own ordering finds them. Neither is a
//     test of an itinerary's feasibility or commercial value.
//   npm run backtest

import { readFileSync, writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");
const { heatCells, qlooClient, searchActs } = await import("../src/platform/tour/qloo");
const { matchCity } = await import("../src/platform/tour/writer");
const { scoreCities } = await import("../src/core/tour/scoring");
const { US } = await import("../src/core/tour/regions");
const { citiesIn, locationOf } = await import("../src/core/tour/world");
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
const candidates = citiesIn(US);
const usCities = candidates.map((c) => ({ ...c, state: c.admin1 }));
const name = (id: string) => usCities.find((c) => c.id === id)?.name ?? id;
// Without taste data, a booker plays the biggest cities: the same for every act.
const biggest = [...usCities].sort((a, b) => b.population - a.population).slice(0, 10).map((c) => c.id);
interface Row {
  act: string;
  source: string;
  checkedAt: string;
  recorded: string[];
  matched: number;
  unmatched: string[];
  noData: string[];
  candidatesWithData: number;
  afinlo: string[];
  afinloHits: number;
  tourScore: string[];
  tourScoreHits: number;
  baseline: string[];
  baselineHits: number;
}
const rows: Row[] = [];
let failed = 0;
for (const a of ready) {
  const act = (await searchActs(client, a.act, [])).find((x) => x.name.toLowerCase() === a.act.toLowerCase());
  if (!act) {
    console.warn(`${a.act}: FAIL, not found in Qloo.`);
    failed++;
    continue;
  }
  // The full scored candidate set, from the act's own heatmap, as the planner scores it.
  const cells = await heatCells(client, [act.id], [], undefined, locationOf(US));
  const scored = scoreCities(cells, { basis: "act", cities: candidates });
  const top = (rank: (c: (typeof scored)[number]) => number) => [...scored].sort((x, y) => rank(y) - rank(x)).slice(0, 10).map((c) => c.id);
  // Fan base: market size, scaled up to 1.5× by how strongly the audience over-indexes there (fixed rule).
  const fanBase = top((c) => c.population * (0.5 + c.heat / 200));
  const tourScore = top((c) => c.tourScore);
  const recorded = a.topCities.slice(0, 5);
  const mapped = recorded.map((city) => ({ city, id: matchCity(city, usCities) }));
  const withData = new Set(scored.map((c) => c.id));
  const hits = (list: string[]) => mapped.filter((m) => m.id && list.includes(m.id)).length;
  const row: Row = {
    act: a.act,
    source: a.source,
    checkedAt: a.checkedAt,
    recorded,
    // Coverage: how many recorded cities are Afinlo cities, and how many of those Qloo has data for.
    matched: mapped.filter((m) => m.id).length,
    unmatched: mapped.filter((m) => !m.id).map((m) => m.city),
    noData: mapped.filter((m) => m.id && !withData.has(m.id)).map((m) => m.city),
    candidatesWithData: scored.length,
    afinlo: fanBase.map(name),
    afinloHits: hits(fanBase),
    tourScore: tourScore.map(name),
    tourScoreHits: hits(tourScore),
    baseline: biggest.map(name),
    baselineHits: hits(biggest),
  };
  rows.push(row);
  console.log(`${a.act}: fan base ${row.afinloHits}/${recorded.length}, tour score ${row.tourScoreHits}/${recorded.length}, biggest cities ${row.baselineHits}/${recorded.length} (${row.matched} matched, ${row.noData.length} without data)`);
}
const total = rows.reduce((s, r) => s + r.recorded.length, 0);
const rate = (k: "afinloHits" | "tourScoreHits" | "baselineHits") => (total ? rows.reduce((s, r) => s + r[k], 0) / total : 0);
writeFileSync(
  "docs/evaluation/backtest-results.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      method:
        "For each act, its real top US listener cities were recorded by hand from its public streaming profile (source and date shown). A hit is a recorded top-5 city that appears in the system's top 10; every recorded city counts, so one Afinlo can't match or has no Qloo data for is a miss. Afinlo ranks every US candidate city with Qloo data from the act's own heatmap: by fan base (market size × (0.5 + Fan Heat / 200)), which tests audience geography, and by tour score, the rule the route is chosen by. The baseline is the 10 biggest US cities, what a booker without taste data would play. This is not a test of an itinerary's feasibility or commercial value.",
      acts: rows,
      summary: {
        acts: rows.length,
        actsNotRun: failed,
        recordedCities: total,
        matchedCities: rows.reduce((s, r) => s + r.matched, 0),
        afinloHitRate: rate("afinloHits"),
        tourScoreHitRate: rate("tourScoreHits"),
        baselineHitRate: rate("baselineHits"),
      },
    },
    null,
    1,
  ) + "\n",
);
console.log("Written docs/evaluation/backtest-results.json");
await closeDb();
if (failed) process.exitCode = 1;
