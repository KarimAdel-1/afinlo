// What each request spends on the model: every call's tokens, summed by role for the request, logged on one line and
// kept in tour_model_usage. So consumption is measured per call, per agent and per request, rather than guessed.
import { db, now } from "@/lib/db";
import { MODELS } from "../tour/model";

/** Tokens one model call used: in (of them, served from OpenAI's cache, and written to it) and out (reasoning included). */
export interface Usage {
  input: number;
  cached: number;
  written: number;
  output: number;
}
/** Where the tokens went: the Home assistant, a tour's team, or a new plan's pitch. */
export type Surface = "assistant" | "tour" | "plan";
type Role = keyof typeof MODELS;

/** Standard rates per million tokens (OpenAI's pricing page, 28 Oct 2026): in, in from the cache, out. */
export const PRICE: Record<string, [number, number, number]> = { "gpt-6-luna": [0.1, 0.01, 0.5], "gpt-6.1-sol": [2, 0.1, 10] };
/** A cache write costs this many times the input rate (the default 30-minute lifetime). */
const WRITE = 1.25;
export function costOf(model: string, u: Usage) {
  const [input, cached, output] = PRICE[model] ?? PRICE["gpt-6-luna"];
  return ((u.input - u.cached - u.written) * input + u.cached * cached + u.written * WRITE * input + u.output * output) / 1e6;
}

/**
 * tour_model_usage's written column, for a database that made the table before the column existed; once per process. A
 * login that doesn't own the table can't run this and needs the column added for it: if it's still missing, the insert
 * fails and says so.
 */
let writtenColumn: Promise<unknown> | undefined;
const addWrittenColumn = () => (writtenColumn ??= db().prepare("ALTER TABLE tour_model_usage ADD COLUMN IF NOT EXISTS written INTEGER NOT NULL DEFAULT 0").run().catch(() => {}));

/** A request's meter: `add` each call's usage as it ends; `save` once the request is done. */
export function usageMeter(surface: Surface, visitor?: string) {
  const roles = new Map<Role, Usage & { calls: number }>();
  const meter = {
    add(role: Role, u: Usage) {
      const r = roles.get(role) ?? { calls: 0, input: 0, cached: 0, written: 0, output: 0 };
      roles.set(role, { calls: r.calls + 1, input: r.input + u.input, cached: r.cached + u.cached, written: r.written + u.written, output: r.output + u.output });
    },
    /** The request's totals, and each role's. */
    totals() {
      const by = [...roles].map(([role, u]) => ({ role, model: MODELS[role].model, ...u, costUsd: costOf(MODELS[role].model, u) }));
      const sum = (k: "calls" | "input" | "cached" | "written" | "output" | "costUsd") => by.reduce((a, r) => a + r[k], 0);
      return { calls: sum("calls"), input: sum("input"), cached: sum("cached"), written: sum("written"), output: sum("output"), costUsd: sum("costUsd"), by };
    },
    /** Logs the request on one line and keeps it, never failing the request it measured. */
    async save() {
      const t = meter.totals();
      if (!t.calls) return;
      const roleLine = t.by.map((r) => `${r.role} ${r.calls}×`).join(", ");
      console.info(`[tokens] ${surface}: ${t.calls} calls (${roleLine}), in ${t.input} (cached ${t.cached}, written ${t.written}), out ${t.output}, $${t.costUsd.toFixed(5)}`);
      try {
        await addWrittenColumn();
        const at = now();
        for (const r of t.by)
          await db()
            .prepare("INSERT INTO tour_model_usage (at, surface, visitor, role, model, calls, input, cached, written, output, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .run(at, surface, visitor ?? null, r.role, r.model, r.calls, r.input, r.cached, r.written, r.output, r.costUsd);
      } catch (error) {
        console.error("Couldn't record the model usage:", error);
      }
    },
  };
  return meter;
}
