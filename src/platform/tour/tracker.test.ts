// A tour's state (where each venue and sponsor stands) and what's remembered about an act belong to the browser that
// set them, carry through changes to the plan, and are never seen by another.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIXTURE_ACT_ID, testBrowser, testDatabase } from "@/testing/database";
import type { Act } from "@/core/tour/types";
import { actMemory, rememberAct, rememberedActs, setTrack, tourOf, tracksFor } from "./tracker";

testDatabase();

const ACT: Act = { id: FIXTURE_ACT_ID, name: "Fixture Star", kind: "artist", description: "", disambiguation: "", comedian: false };
const BRAND = "CCCCCCCC-0000-4000-8000-000000000001";
const VENUE = "DDDDDDDD-0000-4000-8000-000000000001";

test("a tour keeps its first plan's ID through every change", () => {
  assert.equal(tourOf({ id: "pl_first" }), "pl_first");
  assert.equal(tourOf({ id: "pl_changed", rootId: "pl_first" }), "pl_first");
});

test("statuses belong to their browser, and a change replaces them", async () => {
  const [a, b] = [testBrowser(), testBrowser()];
  await setTrack(a, "pl_tour1", { kind: "venue", itemId: VENUE, cityId: "gb-london", status: "hold", note: "" });
  await setTrack(a, "pl_tour1", { kind: "sponsor", itemId: BRAND, status: "sent", note: "Spoke to Dana" });
  const mine = (await tracksFor(a, ["pl_tour1"])).get("pl_tour1")!;
  assert.deepEqual(
    mine.map((t) => [t.kind, t.status, t.cityId ?? null]).sort(),
    [
      ["sponsor", "sent", null],
      ["venue", "hold", "gb-london"],
    ],
  );
  assert.equal(mine.find((t) => t.kind === "sponsor")!.note, "Spoke to Dana");
  assert.deepEqual((await tracksFor(b, ["pl_tour1"])).get("pl_tour1"), [], "another browser sees nothing");
  assert.deepEqual((await tracksFor(undefined, ["pl_tour1"])).get("pl_tour1"), [], "no browser, nothing");

  await setTrack(a, "pl_tour1", { kind: "sponsor", itemId: BRAND, status: "signed", note: "" });
  assert.equal((await tracksFor(a, ["pl_tour1"])).get("pl_tour1")!.find((t) => t.kind === "sponsor")!.status, "signed");
});

test("what's remembered about an act: the latest tour's choices, and every no until it's taken back", async () => {
  const browser = testBrowser();
  await rememberAct(browser, ACT, { where: { kind: "region", region: "europe" }, stops: 6, avoid: ["alcohol"] });
  await rememberAct(browser, ACT, { stops: 8, excludeBrandIds: [BRAND], excludeCityIds: ["gb-london"] });
  const memory = await actMemory(browser, ACT.id);
  assert.deepEqual(memory?.where, { kind: "region", region: "europe" });
  assert.equal(memory?.stops, 8, "the latest choice");
  assert.deepEqual(memory?.avoid, ["alcohol"], "a no stays");
  assert.deepEqual(memory?.excludeBrandIds, [BRAND]);
  await rememberAct(browser, ACT, { excludeBrandIds: [] }, { replace: true });
  assert.deepEqual((await actMemory(browser, ACT.id))?.excludeBrandIds, [], "until it's taken back");
  assert.deepEqual((await rememberedActs(browser)).map((r) => r.act.name), ["Fixture Star"]);
  assert.equal(await actMemory(testBrowser(), ACT.id), undefined, "another browser remembers nothing");
});
