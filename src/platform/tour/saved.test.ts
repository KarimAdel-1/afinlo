// The tours on Home: each browser keeps its own list, newest first, and never sees another's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIXTURE_ACT_ID, testBrowser, testDatabase } from "@/testing/database";
import type { Plan } from "@/core/tour/types";
import { addSaved, isPlanId, removeSaved, savedResults } from "./saved";
import { newPlanId, savePlan } from "./store";

testDatabase();

const ACT = { id: FIXTURE_ACT_ID, name: "Fixture Star", kind: "artist", description: "", disambiguation: "", comedian: false };

async function aPlan(): Promise<Plan> {
  const plan = { id: newPlanId(), createdAt: new Date().toISOString(), act: ACT, sponsors: [], cities: [], route: [] } as unknown as Plan;
  await savePlan(plan);
  return plan;
}
const ids = (results: Awaited<ReturnType<typeof savedResults>>) => results.map((r) => r.plan.id);
const tick = () => new Promise((r) => setTimeout(r, 5));

test("each browser sees only what it made, newest first; making it again moves it back to the top", async () => {
  const [a, b] = [testBrowser(), testBrowser()];
  const [plan, second, other] = [await aPlan(), await aPlan(), await aPlan()];
  await addSaved(a, plan.id);
  await tick();
  await addSaved(a, second.id);
  await addSaved(b, other.id);
  assert.deepEqual(ids(await savedResults(a)), [second.id, plan.id]);
  assert.deepEqual(ids(await savedResults(b)), [other.id], "B sees only its own");
  assert.deepEqual(await savedResults(undefined), [], "no browser, no list");

  await tick();
  await addSaved(a, plan.id);
  assert.deepEqual(ids(await savedResults(a)), [plan.id, second.id], "once each, the newest first");

  await removeSaved(b, plan.id);
  assert.equal((await savedResults(a)).length, 2, "B can't take A's off");
  await removeSaved(a, plan.id);
  assert.deepEqual(ids(await savedResults(a)), [second.id]);
});

test("only our own plan IDs are kept", async () => {
  const browser = testBrowser();
  assert.ok(isPlanId(newPlanId()));
  assert.ok(!isPlanId("pl_short"));
  assert.ok(!isPlanId("bm_AAAAAAAAAAAAAAAAAAAAAAAA"), "not another kind of result");
  assert.ok(!isPlanId("../../etc/passwd"));
  await addSaved(browser, "xx_AAAAAAAAAAAAAAAAAAAAAAAA");
  assert.deepEqual(await savedResults(browser), []);
  await addSaved(browser, newPlanId());
  assert.deepEqual(await savedResults(browser), [], "an ID with no plan behind it is left out");
});
