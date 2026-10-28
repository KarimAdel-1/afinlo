// The tour agent against a fixture Qloo shaped like the live hackathon API (26 Oct 2026): every result in a plan
// traces back to a Qloo response, thin data falls back honestly, and failures never turn into invented results.
// Proves behavior, not the quality of Qloo's data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WORLD_CITIES } from "@/core/tour/world";
import { TourError, type TourStage } from "@/core/tour/types";
import { QlooClient } from "../taste/qloo";
import { planTour } from "./agent";
import { checkPitch, matchCity, templatePitch } from "./writer";

const ACT = "AAAAAAAA-0000-4000-8000-000000000001",
  THIN = "AAAAAAAA-0000-4000-8000-000000000002";
const SIMILAR = ["BBBBBBBB-0000-4000-8000-000000000001", "BBBBBBBB-0000-4000-8000-000000000002", "BBBBBBBB-0000-4000-8000-000000000003"];
const BRANDS = [
  { id: "CCCCCCCC-0000-4000-8000-000000000001", name: "Yee Yee Apparel", tags: ["urn:tag:genre:brand:fashion"], pop: 0.95, aff: 0.97 },
  { id: "CCCCCCCC-0000-4000-8000-000000000002", name: "Ole Smoky Distillery", tags: ["urn:tag:genre:brand:wine_and_spirits:spirits"], pop: 0.92, aff: 0.95 },
  { id: "CCCCCCCC-0000-4000-8000-000000000003", name: "Ram Trucks", tags: ["urn:tag:genre:brand:automotive"], pop: 0.999, aff: 0.9 },
  { id: "CCCCCCCC-0000-4000-8000-000000000004", name: "Durango Boots", tags: ["urn:tag:genre:brand:fashion:footwear"], pop: 0.85, aff: 0.88 },
];
const PLACE = (n: number) => `DDDDDDDD-0000-4000-8000-00000000000${n}`;
const city = (name: string) => WORLD_CITIES.find((c) => c.name === name && c.country === "US")!;
const cellsAround = (names: [string, number][]) =>
  names.flatMap(([name, affinity]) =>
    Array.from({ length: 6 }, (_, i) => ({ location: { latitude: city(name).lat + (i % 3) * 0.04, longitude: city(name).lon + Math.floor(i / 3) * 0.04 }, query: { affinity } })),
  );

function fixture(options: { failBrands?: boolean; seen?: URL[] } = {}) {
  return new QlooClient({
    key: "fixture-only",
    wait: async () => {},
    fetcher: async (u) => {
      const url = new URL(String(u));
      options.seen?.push(url);
      const p = url.searchParams;
      const type = p.get("filter.type");
      const signal = p.get("signal.interests.entities") ?? "";
      const ok = (results: unknown) => Response.json({ success: true, results });
      if (url.pathname === "/entities") {
        const id = p.get("entity_ids");
        if (id !== ACT && id !== THIN) return Response.json({ results: [] });
        return Response.json({ results: [{ entity_id: id, name: id === ACT ? "Fixture Star" : "Thin Comic", subtype: "urn:entity:artist", popularity: 0.97, properties: { short_description: id === ACT ? "A country singer." : "A stand-up comedian." } }] });
      }
      if (type === "urn:heatmap") {
        if (signal === THIN) return ok({ heatmap: [] });
        if (BRANDS.some((b) => b.id === signal)) return ok({ heatmap: cellsAround([["Asheville", 0.99], ["Nashville", 0.8]]) });
        return ok({ heatmap: cellsAround([["Nashville", 0.99], ["Asheville", 0.98], ["Charlotte", 0.97], ["New York", 0.9], ["Chicago", 0.85], ["Omaha", 0.7]]) });
      }
      if (type === "urn:entity:artist")
        return ok({ entities: SIMILAR.map((id, i) => ({ entity_id: id, name: `Opener ${i + 1}`, subtype: "urn:entity:artist", popularity: 0.9, query: { affinity: 0.9 - i / 10 }, properties: { short_description: signal.startsWith(THIN) ? "A stand-up comedian." : "A singer." } })) });
      if (type === "urn:entity:brand") {
        if (options.failBrands) return new Response(null, { status: 500 });
        const tag = p.get("filter.tags");
        return ok({
          entities: BRANDS.filter((b) => !tag || b.tags.some((t) => t.startsWith(tag))).map((b) => ({ entity_id: b.id, name: b.name, subtype: "urn:entity:brand", popularity: b.pop, query: { affinity: b.aff }, tags: b.tags.map((id) => ({ id, name: id })) })),
        });
      }
      if (type === "urn:tag") return ok({ tags: [{ tag_id: "urn:tag:style:qloo:rowdy", name: "Rowdy" }, { tag_id: "urn:tag:genre:music:country", name: "country" }] });
      if (type === "urn:demographics") return ok({ demographics: [{ query: { age: { "24_and_younger": -0.2, "25_to_29": 0.1, "30_to_34": 0.3, "35_to_44": 0.1, "45_to_54": -0.3, "55_and_older": -0.4 }, gender: { male: -0.6, female: 0.6 } } }] });
      if (type && ["urn:entity:movie", "urn:entity:tv_show", "urn:entity:podcast", "urn:entity:book"].includes(type))
        return ok({ entities: [{ entity_id: "EEEEEEEE-0000-4000-8000-000000000001", name: `Top ${type.slice(11)}`, subtype: type }] });
      if (url.pathname === "/v2/insights/compare") return Response.json({ results: { tags: [{ name: "Red Dirt", subtype: "urn:tag:genre:music" }, { name: "United States", subtype: "urn:tag:region:qloo" }] } });
      if (type === "urn:entity:place") {
        const venue = p.has("filter.tags");
        return ok({ entities: [1, 2].map((n) => ({ entity_id: PLACE(venue ? n : n + 2), name: venue ? `Venue ${n}` : n === 1 ? "Charlotte Douglas International Airport" : "Boot Barn", subtype: "urn:entity:place", properties: { address: "1 Main St" } })) });
      }
      return new Response(null, { status: 404 });
    },
  });
}
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
  assert.match(checkPitch({ ...base, ask: "Reach 2 million fans" }, facts)!, /money/);
  assert.equal(checkPitch({ ...base, headline: "A 7-city run" }, facts), undefined);
  const us = WORLD_CITIES.filter((c) => c.country === "US").map((c) => ({ ...c, state: c.admin1 }));
  assert.equal(matchCity("St. Louis", us), city("St. Louis").id);
  assert.equal(matchCity("Portland, Maine", us), WORLD_CITIES.find((c) => c.name === "Portland" && c.admin1 === "Maine")?.id ?? matchCity("Portland", us));
  assert.equal(matchCity("Nashville, TN", us), city("Nashville").id);
  assert.equal(matchCity("Atlantis", us), undefined);
  assert.equal(matchCity("Manchester, GB", WORLD_CITIES), WORLD_CITIES.find((c) => c.name === "Manchester" && c.country === "GB")!.id, "by country, abroad");
});
