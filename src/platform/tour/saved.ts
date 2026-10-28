// The tours on Home: every tour plan, brand match and co-headliner pairing a browser has made, newest first. Nobody
// signs in, so each browser keeps its own list, by its visitor cookie. The results themselves are public, reachable
// by their unguessable ID.
import { db, now } from "@/lib/db";
import type { BrandMatch, Pairing, Plan } from "@/core/tour/types";

export type SavedKind = "plan" | "brand" | "pair";
export type SavedResult =
  | { kind: "plan"; savedAt: string; plan: Plan }
  | { kind: "brand"; savedAt: string; match: BrandMatch }
  | { kind: "pair"; savedAt: string; pairing: Pairing };

const KIND_OF: Record<string, SavedKind> = { pl_: "plan", bm_: "brand", co_: "pair" };
export const savedKind = (id: string): SavedKind | undefined => (/^(pl|bm|co)_[A-Za-z0-9_-]{20,40}$/.test(id) ? KIND_OF[id.slice(0, 3)] : undefined);

/** Adds a result to the browser's list, or moves it back to the top when it's there already. */
export async function addSaved(browser: string, id: string) {
  const kind = savedKind(id);
  if (!kind) return;
  await db()
    .prepare("INSERT INTO tour_saved (visitor, item_id, kind, saved_at) VALUES (?, ?, ?, ?) ON CONFLICT (visitor, item_id) DO UPDATE SET saved_at = EXCLUDED.saved_at")
    .run(browser, id, kind, now());
}

/** addSaved() for a run that's finished: the result is already made, so a failure here is logged rather than thrown. */
export const keepSaved = (browser: string, id: string) => addSaved(browser, id).catch((error) => console.error("Couldn't add a result to the browser's tours:", error));

/** Takes a result off the browser's list. The result itself stays, at its link. */
export async function removeSaved(browser: string, id: string) {
  await db().prepare("DELETE FROM tour_saved WHERE visitor = ? AND item_id = ?").run(browser, id);
}

type Row = { item_id: string; kind: SavedKind; saved_at: string };

/** The browser's list, newest first, each with its result. A browser that hasn't made anything yet has none. */
export async function savedResults(browser: string | undefined, limit = 200): Promise<SavedResult[]> {
  if (!browser) return [];
  const rows = await db()
    .prepare("SELECT item_id, kind, saved_at FROM tour_saved WHERE visitor = ? ORDER BY saved_at DESC LIMIT ?")
    .all<Row>(browser, limit);
  const planIds = rows.filter((r) => r.kind === "plan").map((r) => r.item_id);
  const matchIds = rows.filter((r) => r.kind !== "plan").map((r) => r.item_id);
  const [plans, matches] = await Promise.all([
    planIds.length ? db().prepare("SELECT id, plan AS value FROM tour_plans WHERE id = ANY(?)").all<{ id: string; value: string }>(planIds) : [],
    matchIds.length ? db().prepare("SELECT id, result AS value FROM tour_matches WHERE id = ANY(?)").all<{ id: string; value: string }>(matchIds) : [],
  ]);
  const found = new Map([...plans, ...matches].map((r) => [r.id, r.value]));
  return rows.flatMap((r): SavedResult[] => {
    const value = found.get(r.item_id);
    if (!value) return [];
    const result = JSON.parse(value);
    return r.kind === "plan"
      ? [{ kind: "plan", savedAt: r.saved_at, plan: result as Plan }]
      : r.kind === "brand"
        ? [{ kind: "brand", savedAt: r.saved_at, match: result as BrandMatch }]
        : [{ kind: "pair", savedAt: r.saved_at, pairing: result as Pairing }];
  });
}
