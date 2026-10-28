// Public storage: the Qloo response cache, finished plans (with their city guides and PDF decks), brand
// matches and co-headliner pairings, and the public rate limits. Nobody signs in, so none of it belongs to anyone;
// each is reachable only by its unguessable ID. Which tours each browser keeps, and where their venues and sponsors
// stand, is in saved.ts and tracker.ts.
import { randomBytes } from "node:crypto";
import { db, now, transaction } from "@/lib/db";
import { setting } from "@/lib/settings";
import { US, whereKey } from "@/core/tour/regions";
import { TourError, type CityGuide, type Plan } from "@/core/tour/types";
import type { QlooCache } from "../taste/qloo";

const DAY = 24 * 3600_000;

/** Qloo responses kept for 24 hours, shared by every visitor: the same question never spends quota twice in a day. */
export const qlooCache: QlooCache = {
  async get(key) {
    const row = await db().prepare("SELECT value, expires_at FROM qloo_cache WHERE key = ?").get<{ value: string; expires_at: string }>(key);
    if (!row || row.expires_at < now()) return undefined;
    return JSON.parse(row.value);
  },
  async set(key, value) {
    await db()
      .prepare("INSERT INTO qloo_cache (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at")
      .run(key, JSON.stringify(value), new Date(Date.now() + DAY).toISOString());
  },
};

/** 16 random bytes: a share link can't be guessed or enumerated. */
export const newPlanId = () => "pl_" + randomBytes(16).toString("base64url");

export async function savePlan(plan: Plan) {
  await db()
    .prepare(
      "INSERT INTO tour_plans (id, act_id, act_name, plan, example, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET plan = EXCLUDED.plan, example = EXCLUDED.example",
    )
    .run(plan.id, plan.act.id, plan.act.name, JSON.stringify(plan), plan.example ? 1 : 0, plan.parentId ?? null, plan.createdAt);
}

export async function getPlan(id: string): Promise<Plan | undefined> {
  if (!/^pl_[A-Za-z0-9_-]{20,40}$/.test(id)) return undefined;
  const row = await db().prepare("SELECT plan FROM tour_plans WHERE id = ?").get<{ plan: string }>(id);
  return row ? (JSON.parse(row.plan) as Plan) : undefined;
}

const sorted = (v?: string[]) => [...(v ?? [])].sort();
const requestKey = (r: Plan["request"]) =>
  JSON.stringify([r.actId, whereKey(r.where ?? US), r.homeCityId ?? "", r.stops, sorted(r.categories), sorted(r.avoid), sorted(r.excludeCityIds), sorted(r.excludeBrandIds), r.focus]);

/** A plan made for exactly this request in the last 24 hours, if any: reused instead of asking Qloo again. */
export async function recentPlanFor(request: Plan["request"]): Promise<Plan | undefined> {
  const rows = await db()
    .prepare("SELECT plan FROM tour_plans WHERE act_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 25")
    .all<{ plan: string }>(request.actId, new Date(Date.now() - DAY).toISOString());
  return rows.map((r) => JSON.parse(r.plan) as Plan).find((p) => requestKey(p.request) === requestKey(request));
}

/** A stop's city guide, once it's been made. */
export async function getCityGuide(planId: string, cityId: string): Promise<CityGuide | undefined> {
  const row = await db().prepare("SELECT guide FROM tour_city_guides WHERE plan_id = ? AND city_id = ?").get<{ guide: string }>(planId, cityId);
  return row ? (JSON.parse(row.guide) as CityGuide) : undefined;
}

export async function saveCityGuide(guide: CityGuide) {
  await db()
    .prepare("INSERT INTO tour_city_guides (plan_id, city_id, guide, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (plan_id, city_id) DO NOTHING")
    .run(guide.planId, guide.cityId, JSON.stringify(guide), guide.createdAt);
}

/** A plan's PDF deck, once it's been rendered. A plan never changes, so neither does its deck. */
export async function getDeck(planId: string): Promise<Buffer | undefined> {
  return (await db().prepare("SELECT pdf FROM tour_decks WHERE plan_id = ?").get<{ pdf: Buffer }>(planId))?.pdf;
}

export async function saveDeck(planId: string, pdf: Buffer) {
  await db().prepare("INSERT INTO tour_decks (plan_id, pdf, created_at) VALUES (?, ?, ?) ON CONFLICT (plan_id) DO NOTHING").run(planId, pdf, now());
}

/** Brand matches and co-headliner pairings, shared by ID like plans. */
export type MatchKind = "brand" | "pair";
const MATCH_PREFIX: Record<MatchKind, string> = { brand: "bm_", pair: "co_" };
export const newMatchId = (kind: MatchKind) => MATCH_PREFIX[kind] + randomBytes(16).toString("base64url");

export async function saveMatch(kind: MatchKind, result: { id: string; createdAt: string; example?: boolean }, requestKey: string) {
  await db()
    .prepare("INSERT INTO tour_matches (id, kind, request_key, result, example, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET result = EXCLUDED.result, example = EXCLUDED.example")
    .run(result.id, kind, requestKey, JSON.stringify(result), result.example ? 1 : 0, result.createdAt);
}

export async function getMatch<T>(kind: MatchKind, id: string): Promise<T | undefined> {
  if (!new RegExp(`^${MATCH_PREFIX[kind]}[A-Za-z0-9_-]{20,40}$`).test(id)) return undefined;
  const row = await db().prepare("SELECT result FROM tour_matches WHERE id = ? AND kind = ?").get<{ result: string }>(id, kind);
  return row ? (JSON.parse(row.result) as T) : undefined;
}

/** A result made for exactly this request in the last 24 hours, if any: reused instead of asking Qloo again. */
export async function recentMatch<T>(kind: MatchKind, requestKey: string): Promise<T | undefined> {
  const row = await db()
    .prepare("SELECT result FROM tour_matches WHERE kind = ? AND request_key = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1")
    .get<{ result: string }>(kind, requestKey, new Date(Date.now() - DAY).toISOString());
  return row ? (JSON.parse(row.result) as T) : undefined;
}

/** The newest examples of a kind, oldest first, for the one-click examples. */
export async function exampleMatches<T>(kind: MatchKind): Promise<T[]> {
  const rows = await db()
    .prepare("SELECT DISTINCT ON (request_key) result, created_at FROM tour_matches WHERE kind = ? AND example = 1 ORDER BY request_key, created_at DESC")
    .all<{ result: string; created_at: string }>(kind);
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((r) => JSON.parse(r.result) as T);
}

/** The newest example plan for each example act, for the one-click examples. */
export async function examplePlans(): Promise<Pick<Plan, "id" | "act" | "cities" | "sponsors" | "route" | "heatPoints" | "area" | "traces">[]> {
  const rows = await db()
    .prepare("SELECT DISTINCT ON (act_id) plan FROM tour_plans WHERE example = 1 ORDER BY act_id, created_at DESC")
    .all<{ plan: string }>();
  return rows
    .map((r) => JSON.parse(r.plan) as Plan)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(({ id, act, cities, sponsors, route, heatPoints, area, traces }) => ({ id, act, cities, sponsors, route, heatPoints, area, traces }));
}

/**
 * Public limits on new plans, brand matches and co-headliner pairings, counted together: each visitor gets a few an
 * hour, and the server a daily total, so an open demo can't run up the Qloo quota or the model bill. Checked and
 * recorded in one transaction.
 */
export async function claimPlanSlot(visitor: string) {
  return transaction(async (d) => {
    await d.prepare("SELECT pg_advisory_xact_lock(hashtext('tour-usage'))").get();
    await d.prepare("DELETE FROM tour_usage WHERE created_at < ?").run(new Date(Date.now() - DAY).toISOString());
    const day = await d.prepare("SELECT COUNT(*) AS n FROM tour_usage").get<{ n: number }>();
    if ((day?.n ?? 0) >= setting("DAILY_PLANS"))
      throw new TourError("daily_limit", "Afinlo has made all the new plans it can today. The examples still work; please try again tomorrow.", 429);
    const hour = await d
      .prepare("SELECT COUNT(*) AS n FROM tour_usage WHERE visitor = ? AND created_at > ?")
      .get<{ n: number }>(visitor, new Date(Date.now() - 3600_000).toISOString());
    if ((hour?.n ?? 0) >= setting("HOURLY_PLANS"))
      throw new TourError("hourly_limit", "You've made several plans in the last hour. Please wait a little before the next one.", 429);
    await d.prepare("INSERT INTO tour_usage (visitor, created_at) VALUES (?, ?)").run(visitor, now());
  });
}
