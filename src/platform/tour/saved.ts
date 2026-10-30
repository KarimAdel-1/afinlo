// The tours on Home: every tour plan a browser has made or kept, newest first. Nobody signs in, so each browser keeps
// its own list, by its visitor cookie. The plans themselves are public, reachable by their unguessable ID.
import { db, now } from "@/lib/db";
import type { Plan } from "@/core/tour/types";

export interface SavedResult {
  savedAt: string;
  plan: Plan;
}

/** A plan's ID, as newPlanId() makes them: nothing else goes on a browser's list. */
export const isPlanId = (id: string) => /^pl_[A-Za-z0-9_-]{20,40}$/.test(id);

/** Adds a plan to the browser's list, or moves it back to the top when it's there already. */
export async function addSaved(browser: string, id: string) {
  if (!isPlanId(id)) return;
  await db()
    .prepare("INSERT INTO tour_saved (visitor, item_id, kind, saved_at) VALUES (?, ?, 'plan', ?) ON CONFLICT (visitor, item_id) DO UPDATE SET saved_at = EXCLUDED.saved_at")
    .run(browser, id, now());
}

/** addSaved() for a run that's finished: the plan is already made, so a failure here is logged rather than thrown. */
export const keepSaved = (browser: string, id: string) => addSaved(browser, id).catch((error) => console.error("Couldn't add a plan to the browser's tours:", error));

/** Takes a plan off the browser's list. The plan itself stays, at its link. */
export async function removeSaved(browser: string, id: string) {
  await db().prepare("DELETE FROM tour_saved WHERE visitor = ? AND item_id = ?").run(browser, id);
}

/** The browser's tours, newest first, each with its plan. A browser that hasn't made anything yet has none. */
export async function savedResults(browser: string | undefined, limit = 200): Promise<SavedResult[]> {
  if (!browser) return [];
  // Only plans: a database from before may still list other kinds of result.
  const rows = await db()
    .prepare("SELECT item_id, saved_at FROM tour_saved WHERE visitor = ? AND kind = 'plan' ORDER BY saved_at DESC LIMIT ?")
    .all<{ item_id: string; saved_at: string }>(browser, limit);
  const plans = rows.length ? await db().prepare("SELECT id, plan FROM tour_plans WHERE id = ANY(?)").all<{ id: string; plan: string }>(rows.map((r) => r.item_id)) : [];
  const found = new Map(plans.map((r) => [r.id, r.plan]));
  return rows.flatMap((r) => {
    const plan = found.get(r.item_id);
    return plan ? [{ savedAt: r.saved_at, plan: JSON.parse(plan) as Plan }] : [];
  });
}
