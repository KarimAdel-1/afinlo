// An act Qloo doesn't know yet, toured from the acts named as like it. Pure, and small enough for the browser.
import type { Act, NewAct, Plan } from "./types";

/**
 * A stable ID for an act Qloo doesn't know, from its name, shaped like Qloo's IDs: the same act always gets the same ID,
 * so what's remembered about it (its "no"s, where it tours) carries to its next tour.
 */
export function newActId(name: string): string {
  // cyrb128: four 32-bit hashes of the name, as 32 hex digits.
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < key.length; i++) {
    const k = key.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1].map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("").toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The act as a plan shows it: its name and kind, marked predicted. */
export function newActOf(act: Pick<NewAct, "name" | "comedian">): Act {
  return { id: newActId(act.name), name: act.name.trim(), kind: act.comedian ? "person" : "artist", description: "", disambiguation: "", comedian: act.comedian, predicted: true };
}

/**
 * The Qloo IDs a plan's signal is made of: the act's own; the act with the acts standing in, when its data is thin;
 * or, for an act Qloo doesn't know, only the acts named as like it.
 */
export function signalIdsOf(plan: Pick<Plan, "act" | "signal">): string[] {
  const others = plan.signal.similar.map((s) => s.id);
  return plan.signal.basis === "named" ? others : plan.signal.basis === "similar" ? [plan.act.id, ...others] : [plan.act.id];
}
