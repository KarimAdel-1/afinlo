// The tour team against the live model: seven messages each on three example tours, every reply checked against the
// tour's own data, so a change to a prompt or a model is measured rather than guessed. The checks:
//   - the right specialist answered (or none, for small talk);
//   - the reply names no city of the tour's area that isn't one of its candidates, and no money figure;
//   - a change asked for comes back as a change to apply, and a draft as a draft, in the language asked.
// Prints each message's time and cost, and writes docs/evaluation/manager-eval.json. Needs OPENAI_API_KEY; the whole
// run costs a few cents. Its conversations are removed afterwards.
//   npm run eval

import { writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");
const { setting } = await import("../src/lib/settings");
if (!setting("OPENAI_API_KEY")) {
  console.log("Set OPENAI_API_KEY in .env.local first: the eval talks to the live model.");
  process.exit(0);
}
const { askManager } = await import("../src/platform/manager/chat");
const { openAiModels } = await import("../src/platform/manager/models");
const { MODELS } = await import("../src/platform/tour/model");
const { examplePlans, getPlan } = await import("../src/platform/tour/store");
const { MONEY } = await import("../src/platform/tour/writer");
const { citiesIn } = await import("../src/core/tour/world");
const { US } = await import("../src/core/tour/regions");
const { db, closeDb } = await import("../src/lib/db");
type Plan = NonNullable<Awaited<ReturnType<typeof getPlan>>>;
type Specialist = "route" | "venues" | "sponsors" | "promoter";

/** Standard rates per million tokens (OpenAI's pricing page, 28 Oct 2026): in, in from the cache, out. */
const PRICE: Record<string, [number, number, number]> = { "gpt-6-luna": [0.1, 0.01, 0.5], "gpt-6.1-sol": [2, 0.1, 10] };
const ACTS = ["Morgan Wallen", "Khruangbin", "Bad Bunny"];

interface Expect {
  agent: Specialist | "none";
  card?: "change" | "draft";
  stops?: number;
  language?: string;
  mentions?: string;
}
function conversation(plan: Plan): { say: string; expect: Expect }[] {
  const at = (i: number) => plan.cities.find((c) => c.id === plan.route[i].cityId)!.name;
  const off = plan.cities.find((c) => !plan.route.some((r) => r.cityId === c.id))!.name;
  const sponsor = plan.sponsors[0].brand.name;
  return [
    { say: `Why is ${at(1)} on the route?`, expect: { agent: "route", mentions: at(1) } },
    { say: `Why isn't ${off} on the route?`, expect: { agent: "route", mentions: off } },
    { say: `Make it ${plan.route.length + 1} shows`, expect: { agent: "route", card: "change", stops: plan.route.length + 1 } },
    { say: "Which sponsors fit this tour best, and why?", expect: { agent: "sponsors", mentions: sponsor } },
    { say: `Write the pitch to ${sponsor} in Spanish`, expect: { agent: "sponsors", card: "draft", language: "Spanish" } },
    { say: "Who are the fans, and what else do they love?", expect: { agent: "promoter" } },
    { say: "Thanks, that's all for now.", expect: { agent: "none" } },
  ];
}

/** Cities of the tour's area named in a text that aren't among its candidates: the ones a model would have made up. */
function strayCities(plan: Plan, text: string) {
  const known = new Set([...plan.cities.map((c) => c.name), ...(plan.proof?.biggestCities ?? [])]);
  return citiesIn(plan.request.where ?? US)
    .filter((c) => c.name.length > 3 && !known.has(c.name))
    .filter((c) => new RegExp(`(?<![\\w.] )(?<!^)\\b${c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text))
    .map((c) => c.name);
}

const browser = `evalmanager${Date.now().toString(36)}`.slice(0, 24);
const report = [];
let spent = 0;
for (const act of ACTS) {
  const summary = (await examplePlans()).find((p) => p.act.name === act);
  const plan = summary && (await getPlan(summary.id));
  if (!plan) {
    console.log(`${act}: no example tour; run npm run examples first.`);
    continue;
  }
  console.log(`\n${act} · ${plan.area}`);
  const messages = [];
  for (const { say, expect } of conversation(plan)) {
    let cost = 0;
    const models = openAiModels((role, u) => {
      const [inP, cachedP, outP] = PRICE[MODELS[role].model] ?? PRICE["gpt-6-luna"];
      cost += ((u.input - u.cached) * inP + u.cached * cachedP + u.output * outP) / 1e6;
    });
    const started = Date.now();
    const checks: { check: string; pass: boolean; detail?: string }[] = [];
    try {
      const out = await askManager({ plan, browser, message: say, signal: AbortSignal.timeout(90_000) }, { models });
      const ms = Date.now() - started;
      const all = [out.reply, ...out.cards.flatMap((c) => (c.kind === "draft" ? [c.draft.subject ?? "", c.draft.body] : []))].join("\n");
      checks.push(expect.agent === "none" ? { check: "no specialist needed", pass: !out.agents.length, detail: out.agents.join(", ") } : { check: `the ${expect.agent} specialist answered`, pass: out.agents.includes(expect.agent), detail: out.agents.join(", ") });
      const stray = strayCities(plan, out.reply);
      checks.push({ check: "no city outside the tour", pass: !stray.length, detail: stray.join(", ") });
      const money = all.match(MONEY);
      checks.push({ check: "no money figure", pass: !money, detail: money?.[0] });
      if (expect.mentions) checks.push({ check: `names ${expect.mentions}`, pass: out.reply.includes(expect.mentions) });
      if (expect.card === "change") {
        const change = out.cards.find((c) => c.kind === "change");
        checks.push({ check: `a change to ${expect.stops} shows`, pass: change?.kind === "change" && change.request.stops === expect.stops, detail: change?.kind === "change" ? change.summary : "no change" });
      }
      if (expect.card === "draft") {
        const draft = out.cards.find((c) => c.kind === "draft");
        checks.push({ check: `a draft in ${expect.language}`, pass: draft?.kind === "draft" && draft.draft.language.toLowerCase().includes(expect.language!.toLowerCase()), detail: draft?.kind === "draft" ? `${draft.draft.type} for ${draft.draft.to}` : "no draft" });
      }
      spent += cost;
      const ok = checks.every((c) => c.pass);
      console.log(`  ${ok ? "pass" : "FAIL"} ${(ms / 1000).toFixed(1)}s $${cost.toFixed(4)} · ${say}${ok ? "" : `\n       ${checks.filter((c) => !c.pass).map((c) => `${c.check}${c.detail ? ` (${c.detail})` : ""}`).join("; ")}`}`);
      messages.push({ say, reply: out.reply, agents: out.agents, cards: out.cards.map((c) => c.kind), ms, costUsd: Number(cost.toFixed(5)), checks });
    } catch (error) {
      console.log(`  FAIL · ${say}: ${(error as Error).message}`);
      messages.push({ say, error: (error as Error).message, checks: [{ check: "answered", pass: false }] });
    }
  }
  report.push({ act, area: plan.area, planId: plan.id, messages });
}

const all = report.flatMap((r) => r.messages);
const passed = all.filter((m) => m.checks.every((c) => c.pass)).length;
const times = all.flatMap((m) => ("ms" in m && m.ms ? [m.ms] : []));
const summary = { messages: all.length, passed, failed: all.length - passed, averageSeconds: Number((times.reduce((a, b) => a + b, 0) / Math.max(1, times.length) / 1000).toFixed(1)), totalCostUsd: Number(spent.toFixed(4)) };
console.log(`\n${summary.passed} of ${summary.messages} messages passed every check · ${summary.averageSeconds}s on average · $${summary.totalCostUsd} in all`);
writeFileSync("docs/evaluation/manager-eval.json", JSON.stringify({ generatedAt: new Date().toISOString(), models: MODELS, summary, tours: report }, null, 2) + "\n");

// The eval's conversations and anything they left on the tours go.
for (const t of ["checkpoint_writes", "checkpoint_blobs", "checkpoints"]) await db().prepare(`DELETE FROM ${t} WHERE thread_id LIKE ?`).run(`%:${browser}`);
for (const t of ["tour_statuses", "tour_acts", "tour_chat_usage"]) await db().prepare(`DELETE FROM ${t} WHERE visitor = ?`).run(browser);
await closeDb();
