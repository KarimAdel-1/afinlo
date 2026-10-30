// The acts a browser has toured: a "no" is kept for an act Qloo doesn't know, and a new brief for it starts from the
// acts it was named as like. Its made-up ID never goes to Qloo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { testBrowser, testDatabase } from "@/testing/database";
import { ACT, fixtureQloo, SIMILAR } from "@/testing/qloo";
import { newActOf } from "@/core/tour/named";
import { actToRemember, briefStart } from "./acts";
import { planTour } from "./agent";
import { addSaved } from "./saved";
import { savePlan } from "./store";
import { rememberAct } from "./tracker";
import { templatePitch } from "./writer";

testDatabase();

const newAct = { name: "The Unsigned", comedian: false, like: [SIMILAR[0], SIMILAR[1]] };
const unsigned = newActOf(newAct);
const asksAbout = (seen: URL[], id: string) => seen.some((u) => [...u.searchParams.values()].some((v) => v.includes(id)));

test("the act a no is kept for: as the browser remembers it, as its tour shows it, and only otherwise from Qloo", async () => {
  const seen: URL[] = [];
  const client = fixtureQloo({ seen });
  const browser = testBrowser();
  await rememberAct(browser, unsigned, {});
  assert.equal((await actToRemember(browser, unsigned.id, { client }))?.name, "The Unsigned", "remembered");
  assert.equal((await actToRemember(testBrowser(), unsigned.id, { plan: { act: unsigned }, client }))?.name, "The Unsigned", "from the tour it was said on");
  assert.ok(!seen.length, "Qloo is never asked about a made-up ID");
  assert.equal((await actToRemember(testBrowser(), ACT, { plan: { act: unsigned }, client }))?.name, "Fixture Star", "another act's tour doesn't stand in");
  assert.equal(seen.length, 1);
});

test("a new brief for an act Qloo doesn't know starts from the acts it was named as like; for one it knows, from Qloo", async () => {
  const browser = testBrowser();
  const plan = await planTour({ actId: SIMILAR[2], newAct, stops: 3 }, { client: fixtureQloo(), writer: async (f) => templatePitch(f) });
  await savePlan(plan);
  await addSaved(browser, plan.id);
  await rememberAct(browser, plan.act, {});
  try {
    const seen: URL[] = [];
    const start = await briefStart(browser, plan.act.id, { client: fixtureQloo({ seen }) });
    assert.equal(start.act?.name, "The Unsigned");
    assert.ok(start.act?.predicted);
    assert.deepEqual(start.like?.map((a) => a.name), ["Opener 1", "Opener 2"]);
    assert.ok(!asksAbout(seen, plan.act.id), "Qloo is only asked about the acts it's like");

    // Remembered, but with no tour of it here to say which acts it's like: the brief starts from its name.
    const other = testBrowser();
    await rememberAct(other, plan.act, {});
    assert.deepEqual(await briefStart(other, plan.act.id, { client: fixtureQloo() }), { query: "The Unsigned" });

    assert.equal((await briefStart(browser, ACT, { client: fixtureQloo() })).act?.name, "Fixture Star");
  } finally {
    await db().prepare("DELETE FROM tour_plans WHERE id = ?").run(plan.id);
  }
});
