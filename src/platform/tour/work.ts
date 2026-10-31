// A tour's lasting work beyond its plan: the brands its team found in Qloo (prospects) and the drafts it wrote. Kept per
// browser and tour, as statuses are, so the next message, the Fund tab and a reload all have them, and a conversation
// folding into its summary loses none of it.
import { randomUUID } from "node:crypto";
import { db, now } from "@/lib/db";
import type { AgentDraft, Prospect, SavedDraft } from "@/core/tour/types";

/** Keeps brands the team found for a tour; one found again keeps its first finding. */
export async function keepProspects(browser: string, tourId: string, prospects: Omit<Prospect, "foundAt">[]) {
  const at = now();
  for (const p of prospects)
    await db()
      .prepare(
        "INSERT INTO tour_prospects (visitor, tour_id, brand_id, name, fit, tier, category, found_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (visitor, tour_id, brand_id) DO NOTHING",
      )
      .run(browser, tourId, p.id, p.name, p.fit, p.tier, p.category, at);
}

/** The brands the team found for a tour, best fit first. */
export async function prospectsFor(browser: string | undefined, tourId: string): Promise<Prospect[]> {
  if (!browser) return [];
  const rows = await db()
    .prepare("SELECT brand_id, name, fit, tier, category, found_at FROM tour_prospects WHERE visitor = ? AND tour_id = ? ORDER BY fit DESC, found_at")
    .all<{ brand_id: string; name: string; fit: number; tier: Prospect["tier"]; category: Prospect["category"]; found_at: string }>(browser, tourId);
  return rows.map((r) => ({ id: r.brand_id, name: r.name, fit: r.fit, tier: r.tier, category: r.category, foundAt: r.found_at }));
}

/** Keeps a draft with the tour, and the version it was written for; returns its ID. */
export async function keepDraft(browser: string, tourId: string, planId: string, draft: AgentDraft) {
  const id = randomUUID().slice(0, 12);
  await db().prepare("INSERT INTO tour_drafts (id, visitor, tour_id, plan_id, draft, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, browser, tourId, planId, JSON.stringify(draft), now());
  return id;
}

/** A tour's drafts, the newest first. */
export async function draftsFor(browser: string | undefined, tourId: string, limit = 50): Promise<SavedDraft[]> {
  if (!browser) return [];
  const rows = await db()
    .prepare("SELECT id, plan_id, draft, created_at FROM tour_drafts WHERE visitor = ? AND tour_id = ? ORDER BY created_at DESC LIMIT ?")
    .all<{ id: string; plan_id: string; draft: string; created_at: string }>(browser, tourId, limit);
  return rows.map((r) => ({ id: r.id, planId: r.plan_id, createdAt: r.created_at, draft: JSON.parse(r.draft) as AgentDraft }));
}
