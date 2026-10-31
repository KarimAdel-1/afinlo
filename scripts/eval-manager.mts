// The tour team against the live model: seven messages each on three example tours, every reply checked against the
// tour's own data, so a change to a prompt or a model is measured rather than guessed. The checks:
//   - the right specialist answered (or none, for small talk);
//   - the reply and its drafts name no city anywhere in the world that isn't one of the tour's candidates, and claim
//     nothing the data can't support (money, audience or sales counts, someone having agreed: src/core/tour/claims.ts);
//   - a change asked for comes back as a change to apply, and a draft as a draft, written in the language asked (read
//     from its text, not its label).
// Every message gets the 60 seconds the chat route allows. Prints each message's time and cost, and writes
// docs/evaluation/manager-eval.json with the full replies, drafts and changes. A failed check, or a tour or message
// that couldn't run, fails the command (exit code 1). Needs OPENAI_API_KEY; the whole run costs a few cents. Its
// conversations are removed afterwards.
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
const { unsupportedClaim } = await import("../src/core/tour/claims");
const { WORLD_CITIES } = await import("../src/core/tour/world");
const { db, closeDb } = await import("../src/lib/db");
type Plan = NonNullable<Awaited<ReturnType<typeof getPlan>>>;
type Specialist = "route" | "venues" | "sponsors" | "promoter";

const { costOf } = await import("../src/platform/manager/usage");
const ACTS = ["Morgan Wallen", "Khruangbin", "Bad Bunny"];
/** The chat route's own limit for a message (src/app/api/tour/plan/[id]/chat/route.ts). */
const TIMEOUT_MS = 60_000;

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

/** Every candidate city's name, worldwide, for spotting the ones a model made up. */
const WORLD_NAMES = new Set(WORLD_CITIES.filter((c) => c.name.length > 3).map((c) => c.name));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** City names that are also everyday words: not counted where they open a sentence ("Nice to meet you"). */
const EVERYDAY = new Set(["Nice", "Reading", "Mobile", "Split", "Bath", "Mary", "Hail", "Flint", "Buffalo", "Phoenix", "Providence", "Nancy", "Oral", "Cork", "Stoke", "Perm"]);

/**
 * Cities named in a text, anywhere in the world, that aren't among the tour's candidates: the ones a model would have
 * made up. The tour's own names (its act, brands, acts and places) are taken out first, so "Victoria's Secret" isn't a
 * city.
 */
function strayCities(plan: Plan, text: string) {
  const known = new Set([...plan.cities.map((c) => c.name), ...(plan.proof?.biggestCities ?? [])]);
  const names = [...known, plan.act.name, ...plan.sponsors.map((s) => s.brand.name), ...plan.supportActs.map((s) => s.act.name), ...plan.fanDna.loves.map((l) => l.entity.name), ...plan.localSpots.map((s) => s.place.name)];
  let rest = text;
  for (const n of names.filter((n) => n.length > 2).sort((a, b) => b.length - a.length)) rest = rest.replace(new RegExp(escape(n), "g"), " ");
  const found = new Set<string>();
  // Runs of capitalised words, each run's every span tried as a name ("New York", "São Paulo", "Ho Chi Minh City").
  for (const m of rest.matchAll(/(^|[.!?:]\s+|\n\s*|[-•]\s+)?((?:\p{Lu}[\p{L}'’.-]*)(?:\s+(?:\p{Lu}[\p{L}'’.-]*|de|del|la|el|do|da|am|upon))*)/gu)) {
    const words = m[2].split(/\s+/);
    const opens = m[1] !== undefined || m.index === 0;
    for (let i = 0; i < words.length; i++)
      for (let j = Math.min(words.length, i + 4); j > i; j--) {
        const name = words.slice(i, j).join(" ").replace(/[.'’]+$/, "");
        if (i === 0 && j === 1 && opens && EVERYDAY.has(name)) continue;
        if (WORLD_NAMES.has(name) && !known.has(name)) found.add(name);
      }
  }
  return [...found];
}

/** Common words of each language a draft may be asked in: a text is in the language whose words it uses most. */
const STOPWORDS: Record<string, string[]> = {
  english: ["the", "and", "of", "to", "for", "with", "your", "our", "we", "is", "are", "this", "on", "tour"],
  spanish: ["el", "la", "los", "las", "de", "que", "y", "en", "para", "con", "una", "por", "su", "nuestro", "nuestra", "gira", "es"],
  french: ["le", "la", "les", "de", "des", "et", "en", "pour", "avec", "une", "votre", "notre", "est", "tournée"],
  german: ["der", "die", "das", "und", "mit", "für", "eine", "ihre", "unsere", "ist", "tour", "wir"],
  portuguese: ["o", "a", "os", "as", "de", "que", "e", "em", "para", "com", "uma", "sua", "nossa", "turnê"],
  italian: ["il", "la", "gli", "di", "che", "e", "per", "con", "una", "vostro", "nostro", "è", "tour"],
};
function languageOf(text: string) {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const scores = Object.entries(STOPWORDS).map(([lang, list]) => [lang, words.filter((w) => list.includes(w)).length] as const);
  return scores.sort((a, b) => b[1] - a[1])[0][0];
}

interface Message {
  say: string;
  reply?: string;
  agents?: string[];
  cards?: unknown[];
  ms?: number;
  costUsd?: number;
  error?: string;
  checks: { check: string; pass: boolean; detail?: string }[];
}
const browser = `evalmanager${Date.now().toString(36)}`.slice(0, 24);
const report: { act: string; area?: string; planId?: string; messages: Message[] }[] = [];
let spent = 0;
const tokens = { input: 0, cached: 0, written: 0, output: 0 };
let expected = 0;
for (const act of ACTS) {
  const summary = (await examplePlans()).find((p) => p.act.name === act);
  const plan = summary && (await getPlan(summary.id));
  // Every tour's seven messages count, run or not: a missing example tour fails the eval rather than shrinking it.
  expected += 7;
  if (!plan) {
    console.log(`${act}: FAIL, no example tour; run npm run examples first.`);
    report.push({ act, messages: Array.from({ length: 7 }, (_, i) => ({ say: `(message ${i + 1})`, error: "no example tour", checks: [{ check: "the example tour exists", pass: false }] })) });
    continue;
  }
  console.log(`\n${act} · ${plan.area}`);
  const messages: Message[] = [];
  for (const { say, expect } of conversation(plan)) {
    let cost = 0;
    const models = openAiModels((role, u) => {
      cost += costOf(MODELS[role].model, u);
      for (const k of ["input", "cached", "written", "output"] as const) tokens[k] += u[k];
    });
    const started = Date.now();
    const checks: { check: string; pass: boolean; detail?: string }[] = [];
    try {
      const out = await askManager({ plan, browser, message: say, signal: AbortSignal.timeout(TIMEOUT_MS) }, { models });
      const ms = Date.now() - started;
      const all = [out.reply, ...out.cards.flatMap((c) => (c.kind === "draft" ? [c.draft.subject ?? "", c.draft.body] : []))].join("\n");
      checks.push(expect.agent === "none" ? { check: "no specialist needed", pass: !out.agents.length, detail: out.agents.join(", ") } : { check: `the ${expect.agent} specialist answered`, pass: out.agents.includes(expect.agent), detail: out.agents.join(", ") });
      const stray = strayCities(plan, all);
      checks.push({ check: "no city outside the tour", pass: !stray.length, detail: stray.join(", ") });
      const claim = unsupportedClaim(all);
      checks.push({ check: "no unsupported claim", pass: !claim, detail: claim });
      const raw = all.match(/\b0\.\d{2,}\b/)?.[0];
      checks.push({ check: "no raw Qloo score", pass: !raw, detail: raw });
      if (expect.mentions) checks.push({ check: `names ${expect.mentions}`, pass: out.reply.includes(expect.mentions) });
      if (expect.card === "change") {
        const change = out.cards.find((c) => c.kind === "change");
        checks.push({ check: `a change to ${expect.stops} shows`, pass: change?.kind === "change" && change.request.stops === expect.stops, detail: change?.kind === "change" ? change.summary : "no change" });
      }
      if (expect.card === "draft") {
        const draft = out.cards.find((c) => c.kind === "draft");
        const written = draft?.kind === "draft" ? languageOf(`${draft.draft.subject ?? ""}\n${draft.draft.body}`) : undefined;
        checks.push({ check: `a draft written in ${expect.language}`, pass: written === expect.language!.toLowerCase(), detail: draft?.kind === "draft" ? `${draft.draft.type} for ${draft.draft.to}, reads as ${written}` : "no draft" });
      }
      spent += cost;
      const ok = checks.every((c) => c.pass);
      console.log(`  ${ok ? "pass" : "FAIL"} ${(ms / 1000).toFixed(1)}s $${cost.toFixed(4)} · ${say}${ok ? "" : `\n       ${checks.filter((c) => !c.pass).map((c) => `${c.check}${c.detail ? ` (${c.detail})` : ""}`).join("; ")}`}`);
      // The cards in full: the drafts' text and the changes' requests, so a reader can judge them, not only count them.
      messages.push({ say, reply: out.reply, agents: out.agents, cards: out.cards, ms, costUsd: Number(cost.toFixed(5)), checks });
    } catch (error) {
      console.log(`  FAIL · ${say}: ${(error as Error).message}`);
      messages.push({ say, error: (error as Error).message, checks: [{ check: "answered", pass: false }] });
    }
  }
  report.push({ act, area: plan.area, planId: plan.id, messages });
}

const all = report.flatMap((r) => r.messages);
const passed = all.filter((m) => m.checks.every((c) => c.pass)).length;
const times = all.flatMap((m) => (m.ms ? [m.ms] : []));
const summary = { expected, messages: all.length, passed, failed: Math.max(expected, all.length) - passed, averageSeconds: Number((times.reduce((a, b) => a + b, 0) / Math.max(1, times.length) / 1000).toFixed(1)), totalCostUsd: Number(spent.toFixed(4)) };
console.log(`\n${summary.passed} of ${summary.expected} messages passed every check · ${summary.averageSeconds}s on average · $${summary.totalCostUsd} in all`);
console.log(`tokens: in ${tokens.input} (cached ${tokens.cached}, written ${tokens.written}), out ${tokens.output}`);
writeFileSync("docs/evaluation/manager-eval.json", JSON.stringify({ generatedAt: new Date().toISOString(), models: MODELS, summary, tours: report }, null, 2) + "\n");

// The eval's conversations and anything they left on the tours go.
for (const t of ["checkpoint_writes", "checkpoint_blobs", "checkpoints"]) await db().prepare(`DELETE FROM ${t} WHERE thread_id LIKE ?`).run(`%:${browser}`);
for (const t of ["tour_statuses", "tour_acts", "tour_chat_usage", "tour_drafts", "tour_prospects"]) await db().prepare(`DELETE FROM ${t} WHERE visitor = ?`).run(browser);
await closeDb();
// Any failure, or fewer messages than expected, fails the command, so a release can be gated on it.
if (summary.failed > 0 || all.length < expected) process.exitCode = 1;
