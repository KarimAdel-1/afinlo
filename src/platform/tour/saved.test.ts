// The tours on Home: each browser keeps its own list, newest first, and never sees another's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIXTURE_ACT_ID, testBrowser, testDatabase } from "@/testing/database";
import type { BrandMatch, Pairing, Plan } from "@/core/tour/types";
import { addSaved, removeSaved, savedKind, savedResults } from "./saved";
import { newMatchId, newPlanId, saveMatch, savePlan } from "./store";

testDatabase();

const ACT = { id: FIXTURE_ACT_ID, name: "Fixture Star", kind: "artist", description: "", disambiguation: "", comedian: false };

async function aPlan(): Promise<Plan> {
  const plan = { id: newPlanId(), createdAt: new Date().toISOString(), act: ACT, sponsors: [], cities: [], route: [] } as unknown as Plan;
  await savePlan(plan);
  return plan;
}
async function aMatch(): Promise<BrandMatch> {
  const match = { id: newMatchId("brand"), createdAt: new Date().toISOString(), brand: { id: "B1", name: "Fixture Soda" }, acts: [] } as unknown as BrandMatch;
  await saveMatch("brand", match, `test-${match.id}`);
  return match;
}
async function aPairing(): Promise<Pairing> {
  const pairing = { id: newMatchId("pair"), createdAt: new Date().toISOString(), a: ACT, b: { ...ACT, name: "Fixture Friend" }, route: [], cities: [] } as unknown as Pairing;
  await saveMatch("pair", pairing, `test-${pairing.id}`);
  return pairing;
}
const ids = (results: Awaited<ReturnType<typeof savedResults>>) =>
  results.map((r) => (r.kind === "plan" ? r.plan.id : r.kind === "brand" ? r.match.id : r.pairing.id));
const tick = () => new Promise((r) => setTimeout(r, 5));

test("each browser sees only what it made, newest first; making it again moves it back to the top", async () => {
  const [a, b] = [testBrowser(), testBrowser()];
  const [plan, match, other, pairing] = [await aPlan(), await aMatch(), await aPlan(), await aPairing()];
  await addSaved(a, plan.id);
  await tick();
  await addSaved(a, match.id);
  await addSaved(b, other.id);
  await tick();
  await addSaved(b, pairing.id);
  assert.deepEqual(ids(await savedResults(a)), [match.id, plan.id]);
  assert.deepEqual(ids(await savedResults(b)), [pairing.id, other.id], "B sees only its own");
  assert.deepEqual(await savedResults(undefined), [], "no browser, no list");

  await tick();
  await addSaved(a, plan.id);
  assert.deepEqual(ids(await savedResults(a)), [plan.id, match.id], "once each, the newest first");

  await removeSaved(b, plan.id);
  assert.equal((await savedResults(a)).length, 2, "B can't take A's off");
  await removeSaved(a, plan.id);
  assert.deepEqual(ids(await savedResults(a)), [match.id]);
});

test("only our own result IDs are kept", async () => {
  const browser = testBrowser();
  assert.equal(savedKind(newPlanId()), "plan");
  assert.equal(savedKind(newMatchId("brand")), "brand");
  assert.equal(savedKind(newMatchId("pair")), "pair");
  assert.equal(savedKind("pl_short"), undefined);
  assert.equal(savedKind("../../etc/passwd"), undefined);
  await addSaved(browser, "xx_AAAAAAAAAAAAAAAAAAAAAAAA");
  assert.deepEqual(await savedResults(browser), []);
  await addSaved(browser, newPlanId());
  assert.deepEqual(await savedResults(browser), [], "an ID with no result behind it is left out");
});
