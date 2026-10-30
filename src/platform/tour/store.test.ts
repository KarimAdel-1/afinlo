// Public storage: a change to a tour stays on that tour even when another tour made the same plan first, and the Qloo
// cache clears out what's expired.
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { testDatabase } from "@/testing/database";
import { ACT, fixtureQloo } from "@/testing/qloo";
import { planTour } from "./agent";
import { getPlan, newPlanId, qlooCache, reusablePlan, savePlan } from "./store";
import { tourOf } from "./tracker";
import { templatePitch } from "./writer";

testDatabase();

test("expired Qloo answers are deleted, and fresh ones kept", async () => {
  await db().prepare("INSERT INTO qloo_cache (key, value, expires_at) VALUES (?, ?, ?)").run("test-expired", "{}", new Date(Date.now() - 1000).toISOString());
  await qlooCache.set("test-fresh", { ok: true });
  assert.equal(await db().prepare("SELECT key FROM qloo_cache WHERE key = 'test-expired'").get(), undefined);
  assert.deepEqual(await qlooCache.get("test-fresh"), { ok: true });
  await db().prepare("DELETE FROM qloo_cache WHERE key LIKE 'test-%'").run();
});

test("a change stays on its tour: the same plan made on another tour is copied onto this one, not opened", async () => {
  const made = await planTour({ actId: ACT, stops: 4 }, { client: fixtureQloo(), writer: async (f) => templatePitch(f) });
  // Someone else's tour, made from scratch with the request a change is about to ask for (an example, say).
  const theirs = { ...made, id: newPlanId(), request: { ...made.request, stops: 5 }, example: true };
  await savePlan(theirs);
  // This tour, two versions in, and its change to five shows.
  const first = { ...made, id: newPlanId() };
  const mine = { ...made, id: newPlanId(), parentId: first.id, rootId: first.id };
  await Promise.all([savePlan(first), savePlan(mine)]);
  const change = { ...mine.request, stops: 5 };

  const next = (await reusablePlan(change, mine))!;
  assert.notEqual(next.id, theirs.id, "not the other tour's plan");
  assert.equal(tourOf(next), first.id, "on this tour, so its statuses and conversation carry over");
  assert.equal(next.parentId, mine.id);
  assert.deepEqual(next.route, theirs.route, "the plan already made, without planning again");
  assert.ok(!next.example, "a copy of an example isn't an example");
  assert.equal((await getPlan(next.id))?.rootId, first.id, "and it's saved");
  assert.equal((await reusablePlan(change, next))?.id, next.id, "on its own tour, a plan is reused as it is");
  assert.equal((await reusablePlan(change))?.id, next.id, "and a new tour reuses the newest");
  assert.equal(await reusablePlan({ ...change, stops: 6 }, mine), undefined, "nothing made for that request: plan it");
});
