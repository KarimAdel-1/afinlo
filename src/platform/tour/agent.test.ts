// The tour agent against a fixture Qloo shaped like the live hackathon API (26 Oct 2026): every result in a plan
// traces back to a Qloo response, thin data falls back honestly, and failures never turn into invented results.
// Proves behavior, not the quality of Qloo's data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newActId } from "@/core/tour/named";
import { WORLD_CITIES } from "@/core/tour/world";
import { km } from "@/core/tour/scoring";
import { ACT, BRANDS, fixtureQloo, PLACE, SIMILAR, THIN, usCity } from "@/testing/qloo";
import { TourError, type TourStage } from "@/core/tour/types";
import { planTour } from "./agent";
import { makeCityGuide } from "./city";
import { scanWorld } from "./scan";
import { checkPitch, matchCity, templatePitch } from "./writer";

const city = usCity;
const fixture = fixtureQloo;
const writer = async (f: Parameters<typeof templatePitch>[0]) => templatePitch(f);

test("every city, brand, support act and place in a plan comes from Qloo; the stages are real and in order", async () => {
  const stages: TourStage[] = [];
  const plan = await planTour({ actId: ACT, stops: 4 }, { client: fixture(), writer, onStage: (s) => stages.push(s) });
  assert.equal(plan.act.name, "Fixture Star");
  assert.equal(plan.signal.basis, "act");
  assert.deepEqual(stages.map((s) => s.stage).filter((s, i, a) => a.indexOf(s) === i), ["resolving", "cities", "dna", "sponsors", "support", "scoring", "local", "writing"].filter((s) => stages.some((x) => x.stage === s)));
  assert.ok(stages.findIndex((s) => s.stage === "scoring") > stages.findIndex((s) => s.stage === "sponsors"));
  // Grounding.
  assert.ok(plan.route.length === 4 && plan.route.every((r) => WORLD_CITIES.some((c) => c.id === r.cityId) && plan.cities.some((c) => c.id === r.cityId)));
  assert.ok(plan.sponsors.length && plan.sponsors.every((s) => BRANDS.some((b) => b.id === s.brand.id)));
  assert.ok(plan.supportActs.every((s) => SIMILAR.includes(s.act.id)));
  assert.ok(plan.localSpots.every((s) => [1, 2, 3, 4].map(PLACE).includes(s.place.id)));
  assert.ok(!plan.localSpots.some((s) => /Airport/.test(s.place.name)), "no airports as activation spots");
  assert.ok(plan.localSpots.some((s) => s.kind === "venue"));
  assert.deepEqual(plan.supportActs[0].shared, ["Red Dirt"], "region tags aren't 'shared taste'");
  assert.equal(plan.cities[0].name, "Nashville");
  assert.ok(plan.cities.find((c) => c.name === "Asheville")!.hidden);
  assert.ok(!plan.cities.find((c) => c.name === "New York")!.hidden);
  assert.deepEqual(plan.fanDna.tags.map((t) => t.name), ["Rowdy", "country"]);
  assert.equal(plan.fanDna.loves.length, 4);
  assert.ok(plan.fanDna.demographics!.age.some((a) => a.band === "30–34"));
  // A brand's strongest cities come from its own heatmap and lie on the route.
  const top = plan.sponsors[0];
  assert.ok(top.strongestIn.length && top.strongestIn.every((id) => plan.route.some((r) => r.cityId === id)));
  assert.equal(plan.pitch.writer, "template");
  assert.ok(plan.pitch.emails.every((e) => plan.sponsors.slice(0, 3).some((s) => s.brand.id === e.brandId)));
  assert.equal(checkPitch({ ...plan.pitch, cityNotes: plan.pitch.cityNotes, emails: plan.pitch.emails }, { ...plan, route: plan.route.map((r) => plan.cities.find((c) => c.id === r.cityId)!), stops: 4 }), undefined, "the template passes the writer's own checks");
  assert.ok(plan.traces.length > 10 && plan.traces.every((t) => !JSON.stringify(t).includes("fixture-only")), "traces never hold the key");
});

test("an act with no heatmap is estimated from similar acts, labelled, and never high confidence", async () => {
  const seen: URL[] = [];
  const plan = await planTour({ actId: THIN, stops: 3 }, { client: fixture({ seen }), writer });
  assert.equal(plan.signal.basis, "similar");
  assert.equal(plan.act.comedian, true);
  assert.ok(plan.notes.some((n) => /estimated from acts with overlapping audiences/.test(n)));
  const combined = seen.find((u) => u.searchParams.get("filter.type") === "urn:heatmap" && u.searchParams.get("signal.interests.entities")!.includes(","));
  assert.ok(combined, "a combined signal: the act and its similar acts");
  assert.ok(plan.cities.length && plan.cities.every((c) => c.confidence !== "high"));
  assert.ok(seen.some((u) => u.searchParams.get("filter.tags") === "urn:tag:genre:place:comedy_club"), "comedians get comedy clubs");
});

test("when Qloo's brand data fails there are no sponsors, a plain note, and nothing invented", async () => {
  const plan = await planTour({ actId: ACT, stops: 3 }, { client: fixture({ failBrands: true }), writer });
  assert.equal(plan.sponsors.length, 0);
  assert.ok(plan.notes.some((n) => /didn't answer|no sponsor/i.test(n)), plan.notes.join(" | "));
  assert.equal(plan.pitch.emails.length, 0);
  assert.ok(plan.route.length, "the rest of the plan still stands");
});

test("categories become one Qloo brand request each, and only brands in them remain", async () => {
  const seen: URL[] = [];
  const plan = await planTour({ actId: ACT, stops: 3, categories: ["auto", "alcohol"] }, { client: fixture({ seen }), writer });
  const brandCalls = seen.filter((u) => u.searchParams.get("filter.type") === "urn:entity:brand");
  assert.deepEqual([...new Set(brandCalls.map((u) => u.searchParams.get("filter.tags")))].sort(), ["urn:tag:genre:brand:automotive", "urn:tag:genre:brand:wine_and_spirits"]);
  // Two brands is a thin result, so the agent also asked with similar acts' audiences; it found no more and kept the act's own.
  assert.equal(brandCalls[0].searchParams.get("signal.interests.entities"), ACT);
  assert.deepEqual(plan.sponsors.map((s) => s.brand.name).sort(), ["Ole Smoky Distillery", "Ram Trucks"]);
});

test("an unknown act is a clear error, and the writer's checks catch invented IDs and money", async () => {
  await assert.rejects(() => planTour({ actId: "99999999-9999-4999-8999-999999999999" }, { client: fixture(), writer }), (e) => e instanceof TourError && e.status === 404);
  const plan = await planTour({ actId: ACT, stops: 3 }, { client: fixture(), writer });
  const facts = { ...plan, route: plan.route.map((r) => plan.cities.find((c) => c.id === r.cityId)!), stops: 3 };
  const base = { headline: "h", audience: "a", markets: "m", ask: "a", tourBrief: "t", cityNotes: [], emails: [] };
  assert.match(checkPitch({ ...base, emails: [{ brandId: "CCCCCCCC-0000-4000-8000-999999999999", subject: "s", body: "b" }] }, facts)!, /brand/);
  assert.match(checkPitch({ ...base, cityNotes: [{ cityId: city("Miami").id, note: "n" }] }, facts)!, /city/);
  assert.match(checkPitch({ ...base, ask: "A $50,000 package" }, facts)!, /money/);
  assert.match(checkPitch({ ...base, ask: "Reach 2 million fans" }, facts)!, /count/);
  assert.match(checkPitch({ ...base, ask: "Nike has agreed to sponsor the Tokyo show" }, facts)!, /agreed/);
  assert.equal(checkPitch({ ...base, headline: "A 7-city run" }, facts), undefined);
  const us = WORLD_CITIES.filter((c) => c.country === "US").map((c) => ({ ...c, state: c.admin1 }));
  assert.equal(matchCity("St. Louis", us), city("St. Louis").id);
  assert.equal(matchCity("Portland, Maine", us), WORLD_CITIES.find((c) => c.name === "Portland" && c.admin1 === "Maine")?.id ?? matchCity("Portland", us));
  assert.equal(matchCity("Nashville, TN", us), city("Nashville").id);
  assert.equal(matchCity("Atlantis", us), undefined);
  assert.equal(matchCity("Manchester, GB", WORLD_CITIES), WORLD_CITIES.find((c) => c.name === "Manchester" && c.country === "GB")!.id, "by country, abroad");
});

test("an act Qloo doesn't know is planned from the acts named as like it, and says it's predicted", async () => {
  const seen: URL[] = [];
  const newAct = { name: "The Unsigned", comedian: false, like: [SIMILAR[0], SIMILAR[1]] };
  const stages: TourStage[] = [];
  const plan = await planTour({ actId: SIMILAR[2], newAct, stops: 4 }, { client: fixture({ seen }), writer, onStage: (s) => stages.push(s) });
  assert.equal(plan.act.name, "The Unsigned");
  assert.ok(plan.act.predicted);
  assert.equal(plan.act.id, newActId("the  unsigned "), "known by its name, whatever ID the request carried");
  assert.equal(plan.signal.basis, "named");
  assert.deepEqual(plan.signal.similar.map((a) => a.name), ["Opener 1", "Opener 2"]);
  assert.ok(stages.some((s) => s.stage === "predicting"));
  // Qloo only ever hears about the named acts: the new act's made-up ID never reaches it.
  const heat = seen.find((u) => u.searchParams.get("filter.type") === "urn:heatmap");
  assert.equal(heat?.searchParams.get("signal.interests.entities"), `${SIMILAR[0]},${SIMILAR[1]}`);
  assert.ok(!seen.some((u) => [...u.searchParams.values()].some((v) => v.includes(plan.act.id))), "never asks Qloo about the made-up ID");
  assert.ok(plan.route.length && plan.sponsors.length, "a route and sponsors from the named acts' fans");
  assert.ok(plan.cities.every((c) => c.confidence !== "high"), "never high confidence");
  assert.match(plan.notes.join(" "), /predicted from the acts named as like it: Opener 1, Opener 2/);
  assert.ok(plan.supportActs.every((a) => !newAct.like.includes(a.act.id)), "the named acts aren't suggested as its openers");
  // Its first look at the world and a stop's city guide come from the named acts too.
  const asked: URL[] = [];
  const scan = await scanWorld({ newAct }, { client: fixture({ seen: asked }) });
  assert.equal(scan.basis, "named");
  assert.deepEqual(scan.similar, ["Opener 1", "Opener 2"]);
  assert.ok(scan.act.predicted && scan.points.length);
  await makeCityGuide(plan, plan.route[0].cityId, { client: fixture({ seen: asked }) });
  const places = asked.filter((u) => u.searchParams.get("filter.type") === "urn:entity:place");
  assert.ok(places.length && places.every((u) => u.searchParams.get("signal.interests.entities") === `${SIMILAR[0]},${SIMILAR[1]}`));
  assert.ok(!asked.some((u) => [...u.searchParams.values()].some((v) => v.includes(plan.act.id))));
  // One named act Qloo doesn't know: a clear error, nothing planned.
  await assert.rejects(
    () => planTour({ actId: ACT, newAct: { ...newAct, like: [SIMILAR[0], "99999999-9999-4999-8999-999999999999"] }, stops: 4 }, { client: fixture(), writer }),
    (e) => e instanceof TourError && e.status === 404,
  );
});

test("a world tour: one Qloo map of the whole world, the cities read from further out, the shows spread apart", async () => {
  const seen: URL[] = [];
  const plan = await planTour({ actId: ACT, where: { kind: "world" }, stops: 4 }, { client: fixture({ seen }), writer });
  assert.equal(plan.area, "the world");
  assert.match(seen.find((u) => u.searchParams.get("filter.type") === "urn:heatmap")!.searchParams.get("filter.location")!, /^POLYGON\(\(-179 -60/);
  const stops = plan.route.map((r) => plan.cities.find((c) => c.id === r.cityId)!);
  assert.equal(stops.length, 4, "the fixture's fans are all in one country, so the cap gives way");
  assert.ok(stops.every((a) => stops.every((b) => a === b || km(a, b) >= 400)), "shows at least 400 km apart");
  assert.ok(plan.heatPoints?.length && plan.proof);
});
