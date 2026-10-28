// A tour's own state: where each venue and sponsor stands, and what's remembered about each act for its next tour.
// It's kept per browser, by its visitor cookie, like the tours on Home. Plans themselves never change; a tour's state
// is kept under its first plan's ID, so it carries through every change to the plan.
import { db, now } from "@/lib/db";
import type { Act, ActMemory, Plan, Track } from "@/core/tour/types";

/** The tour a plan belongs to. */
export const tourOf = (plan: Pick<Plan, "id" | "rootId">) => plan.rootId ?? plan.id;

type Row = { tour_id: string; kind: Track["kind"]; item_id: string; city_id: string | null; status: string; note: string; updated_at: string };
const track = (r: Row): Track => ({ kind: r.kind, itemId: r.item_id, ...(r.city_id ? { cityId: r.city_id } : {}), status: r.status, note: r.note, updatedAt: r.updated_at });

/** Every venue and sponsor status the browser has set on these tours. */
export async function tracksFor(browser: string | undefined, tourIds: string[]): Promise<Map<string, Track[]>> {
  const out = new Map<string, Track[]>(tourIds.map((id) => [id, []]));
  if (!browser || !tourIds.length) return out;
  const rows = await db()
    .prepare("SELECT tour_id, kind, item_id, city_id, status, note, updated_at FROM tour_statuses WHERE visitor = ? AND tour_id = ANY(?)")
    .all<Row>(browser, tourIds);
  for (const r of rows) out.get(r.tour_id)?.push(track(r));
  return out;
}

export async function setTrack(browser: string, tourId: string, t: Omit<Track, "updatedAt">) {
  const at = now();
  await db()
    .prepare(
      "INSERT INTO tour_statuses (visitor, tour_id, kind, item_id, city_id, status, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (visitor, tour_id, kind, item_id) DO UPDATE SET city_id = EXCLUDED.city_id, status = EXCLUDED.status, note = EXCLUDED.note, updated_at = EXCLUDED.updated_at",
    )
    .run(browser, tourId, t.kind, t.itemId, t.cityId ?? null, t.status, t.note, at);
  return at;
}

type ActRow = { act: string; prefs: string; updated_at: string };
export interface RememberedAct {
  act: Act;
  memory: ActMemory;
  updatedAt: string;
}

/** The acts this browser has toured, newest first, with what's remembered about each. */
export async function rememberedActs(browser: string | undefined): Promise<RememberedAct[]> {
  if (!browser) return [];
  const rows = await db().prepare("SELECT act, prefs, updated_at FROM tour_acts WHERE visitor = ? ORDER BY updated_at DESC").all<ActRow>(browser);
  return rows.map((r) => ({ act: JSON.parse(r.act) as Act, memory: JSON.parse(r.prefs) as ActMemory, updatedAt: r.updated_at }));
}

export async function actMemory(browser: string | undefined, actId: string): Promise<ActMemory | undefined> {
  if (!browser) return undefined;
  const row = await db().prepare("SELECT prefs FROM tour_acts WHERE visitor = ? AND act_id = ?").get<{ prefs: string }>(browser, actId);
  return row ? (JSON.parse(row.prefs) as ActMemory) : undefined;
}

/**
 * Remembers an act and what's been decided for it: the latest tour's choices, and every no (a sponsor category, a
 * brand, a city), kept until it's taken back.
 */
export async function rememberAct(browser: string, act: Act, change: ActMemory, options: { replace?: boolean } = {}) {
  const before = (await actMemory(browser, act.id)) ?? {};
  const union = (a?: string[], b?: string[]) => (a || b ? [...new Set([...(a ?? []), ...(b ?? [])])] : undefined);
  const memory: ActMemory = options.replace
    ? { ...before, ...change }
    : {
        ...before,
        ...change,
        avoid: union(before.avoid, change.avoid) as ActMemory["avoid"],
        excludeBrandIds: union(before.excludeBrandIds, change.excludeBrandIds),
        excludeCityIds: union(before.excludeCityIds, change.excludeCityIds),
      };
  await db()
    .prepare(
      "INSERT INTO tour_acts (visitor, act_id, act, prefs, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (visitor, act_id) DO UPDATE SET act = EXCLUDED.act, prefs = EXCLUDED.prefs, updated_at = EXCLUDED.updated_at",
    )
    .run(browser, act.id, JSON.stringify(act), JSON.stringify(memory), now());
  return memory;
}
