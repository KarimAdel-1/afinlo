// The other tools against a fixture Qloo shaped like the live hackathon API (26 Oct 2026): the brand match,
// the co-headliner pairing and a stop's city guide. Every act, city and place comes from a Qloo response; pictures
// are only ever Qloo's own; thin data is said, never filled in. Proves behavior, not the quality of Qloo's data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WORLD_CITIES } from "@/core/tour/world";
import { TourError, type Plan } from "@/core/tour/types";
import { QlooClient } from "../taste/qloo";
import { brandRequestKey, runBrandMatch } from "./brands";
import { makeCityGuide } from "./city";
import { pairRequestKey, runPairing } from "./pairs";

const BRAND = "CCCCCCCC-0000-4000-8000-000000000001";
const A = "AAAAAAAA-0000-4000-8000-000000000001",
  B = "AAAAAAAA-0000-4000-8000-000000000002",
  NOMAP = "AAAAAAAA-0000-4000-8000-000000000003";
const ARTISTS = ["BBBBBBBB-0000-4000-8000-000000000001", "BBBBBBBB-0000-4000-8000-000000000002"];
const COMIC = "BBBBBBBB-0000-4000-8000-000000000003";
const PLACE = (n: number) => `DDDDDDDD-0000-4000-8000-00000000000${n}`;
const city = (name: string) => WORLD_CITIES.find((c) => c.name === name && c.country === "US")!;
const cellsAround = (names: [string, number][]) =>
  names.flatMap(([name, affinity]) =>
    Array.from({ length: 6 }, (_, i) => ({ location: { latitude: city(name).lat + (i % 3) * 0.04, longitude: city(name).lon + Math.floor(i / 3) * 0.04 }, query: { affinity } })),
  );
const MAPS: Record<string, [string, number][]> = {
  [BRAND]: [["Austin", 0.99], ["Nashville", 0.9], ["Denver", 0.7]],
  [ARTISTS[0]]: [["Austin", 0.98], ["Denver", 0.95], ["Nashville", 0.5]],
  [ARTISTS[1]]: [["Nashville", 0.99], ["Austin", 0.6]],
  [COMIC]: [["Denver", 0.99], ["Austin", 0.9]],
  [A]: [["Austin", 0.99], ["Denver", 0.95], ["Nashville", 0.9], ["Omaha", 0.6]],
  [B]: [["Denver", 0.99], ["Austin", 0.97], ["Omaha", 0.92], ["Nashville", 0.5]],
};

function fixture(seen: URL[] = []) {
  return new QlooClient({
    key: "fixture-only",
    wait: async () => {},
    fetcher: async (u) => {
      const url = new URL(String(u));
      seen.push(url);
      const p = url.searchParams;
      const type = p.get("filter.type");
      const signal = p.get("signal.interests.entities") ?? "";
      const ok = (results: unknown) => Response.json({ success: true, results });
      if (url.pathname === "/entities") {
        const id = p.get("entity_ids");
        if (id === BRAND)
          return Response.json({
            results: [{ entity_id: BRAND, name: "Fixture Soda", subtype: "urn:entity:brand", properties: { short_description: "A soda.", image: { url: "https://images.qloo.com/i/soda.jpg" } }, tags: [{ id: "urn:tag:genre:brand:food_and_beverage:drinks", name: "Drinks" }] }],
          });
        if (id === A || id === B || id === NOMAP)
          return Response.json({ results: [{ entity_id: id, name: id === A ? "Act A" : id === B ? "Act B" : "Act Without Map", subtype: "urn:entity:artist", popularity: 0.95, properties: { short_description: "A band.", image: { url: "https://evil.example/x.jpg" } } }] });
        return Response.json({ results: [] });
      }
      if (type === "urn:heatmap") return ok({ heatmap: MAPS[signal] ? cellsAround(MAPS[signal]) : [] });
      if (type === "urn:entity:artist")
        return ok({ entities: ARTISTS.map((id, i) => ({ entity_id: id, name: `Artist ${i + 1}`, subtype: "urn:entity:artist", popularity: 0.9, query: { affinity: 0.95 - i / 10 }, properties: { image: { url: `https://images.qloo.com/i/a${i}.jpg` } } })) });
      if (type === "urn:entity:person" && p.get("filter.tags") === "urn:tag:genre:person:comedian")
        return ok({ entities: [{ entity_id: COMIC, name: "Comic One", subtype: "urn:entity:person", popularity: 0.8, query: { affinity: 0.9 } }] });
      if (url.pathname === "/v2/insights/compare") return Response.json({ results: { tags: [{ name: "Psychedelic", subtype: "urn:tag:genre:music" }, { name: "United States", subtype: "urn:tag:region:qloo" }] } });
      if (type === "urn:entity:place") {
        const tag = p.get("filter.tags") ?? "";
        // The same bar comes back for "bars" and for "any place"; an airport too, which never shows.
        const places = tag.includes("music_venue")
          ? [{ id: PLACE(1), name: "The Basement" }]
          : tag.includes("bar")
            ? [{ id: PLACE(2), name: "Honky Tonk" }]
            : tag
              ? []
              : [{ id: PLACE(2), name: "Honky Tonk" }, { id: PLACE(3), name: "International Airport" }, { id: PLACE(4), name: "Riverfront Park" }];
        return ok({ entities: places.map((x) => ({ entity_id: x.id, name: x.name, subtype: "urn:entity:place", query: { affinity: 0.9 }, properties: { address: "1 Main St", website: "javascript:alert(1)", business_rating: 4.5, primary_genre: { name: "Live music bar" } } })) });
      }
      return new Response(null, { status: 404 });
    },
  });
}

test("a brand match: acts and comedians from Qloo, ranked by Brand Fit, with the cities both audiences share", async () => {
  const seen: URL[] = [];
  const stages: string[] = [];
  const match = await runBrandMatch({ brandId: BRAND }, { client: fixture(seen), onStage: (s) => stages.push(s.stage) });
  assert.equal(match.brand.name, "Fixture Soda");
  assert.equal(match.brand.image, "https://images.qloo.com/i/soda.jpg");
  assert.deepEqual(match.brand.categories, ["urn:tag:genre:brand:food_and_beverage:drinks"]);
  assert.deepEqual(stages, ["resolving", "acts", "overlap"]);
  assert.deepEqual(match.acts.map((m) => m.act.id).sort(), [...ARTISTS, COMIC].sort(), "every act comes from Qloo");
  assert.equal(match.acts.find((m) => m.act.id === COMIC)!.act.comedian, true);
  assert.ok(match.acts.every((m) => m.fit >= 0 && m.fit <= 100));
  // Artist 1's fans and the brand's are both strongest in Austin; Artist 2's are in Nashville.
  const shared = (id: string) => match.acts.find((m) => m.act.id === id)!.shared.map((s) => WORLD_CITIES.find((c) => c.id === s.cityId)!.name);
  assert.equal(shared(ARTISTS[0])[0], "Austin");
  assert.equal(shared(ARTISTS[1])[0], "Nashville");
  assert.equal(match.cities[0].name, "Austin");
  assert.ok(match.heat?.length, "the brand's map");
  assert.ok(seen.some((u) => u.searchParams.get("filter.tags") === "urn:tag:genre:person:comedian"), "comedians are asked for by Qloo's comedian tag");
  assert.equal(brandRequestKey(match.request), JSON.stringify([BRAND, "both"]));
});

test("a brand match for artists only never asks for comedians; an unknown brand is a clear error", async () => {
  const seen: URL[] = [];
  const match = await runBrandMatch({ brandId: BRAND, acts: "music" }, { client: fixture(seen) });
  assert.ok(match.acts.every((m) => !m.act.comedian));
  assert.ok(!seen.some((u) => u.searchParams.get("filter.type") === "urn:entity:person"));
  // An act's ID isn't a brand's.
  await assert.rejects(() => runBrandMatch({ brandId: A }, { client: fixture() }), (e) => e instanceof TourError && e.status === 404);
});

test("a pairing: the cities both crowds are strong in, a double-bill route, shared taste, and only Qloo's pictures", async () => {
  const stages: string[] = [];
  const pair = await runPairing({ aId: A, bId: B, stops: 3 }, { client: fixture(), onStage: (s) => stages.push(s.stage) });
  assert.deepEqual(stages, ["pair", "route"]);
  assert.deepEqual(pair.cities.slice(0, 2).map((c) => c.name), ["Austin", "Denver"], "the cities strong for both come first");
  assert.equal(pair.cities.find((c) => c.name === "Nashville")!.heat, 0, "strong for one act only isn't a double-bill city");
  assert.equal(pair.route.length, 3);
  assert.ok(pair.route.every((r) => pair.cities.some((c) => c.id === r.cityId)));
  assert.deepEqual(pair.shared, ["Psychedelic"], "region tags aren't shared taste");
  assert.ok(pair.overlap > 0 && pair.overlap <= 1);
  assert.equal(pair.a.image, undefined, "a picture that isn't Qloo's is never shown");
  assert.equal(pairRequestKey(pair.request), pairRequestKey({ aId: B, bId: A, stops: 3 }), "the same two acts in either order are the same question");
  await assert.rejects(() => runPairing({ aId: A, bId: A }, { client: fixture() }));
});

test("a pairing with an act Qloo has no map for says so, and invents no shared cities", async () => {
  const pair = await runPairing({ aId: A, bId: NOMAP }, { client: fixture() });
  assert.equal(pair.cities.length, 0);
  assert.equal(pair.route.length, 0);
  assert.ok(pair.notes.some((n) => /no location data for Act Without Map/.test(n)), pair.notes.join(" | "));
});

test("a city guide: venues, sponsor leads and loved places from Qloo, each once, for stops on the route only", async () => {
  const nashville = city("Nashville");
  const plan = {
    id: "pl_fixturefixturefixture00",
    act: { id: A, name: "Act A", kind: "artist", description: "", disambiguation: "", comedian: false },
    signal: { basis: "act", similar: [] },
    cities: [{ ...nashville, affinity: 0.9, cells: 6, heat: 100, hidden: true, tourScore: 90, confidence: "high" }],
    route: [{ cityId: nashville.id, legKm: 0 }],
  } as unknown as Plan;
  const guide = await makeCityGuide(plan, nashville.id, { client: fixture() });
  assert.deepEqual(guide.venues.map((p) => p.name), ["The Basement"]);
  assert.deepEqual(guide.leads.map((p) => p.name), ["Honky Tonk"]);
  assert.deepEqual(guide.loved.map((p) => p.name), ["Riverfront Park"], "the bar shows once, and no airport");
  assert.equal(guide.venues[0].kind, "Live music bar");
  assert.equal(guide.venues[0].rating, 4.5);
  assert.equal(guide.venues[0].website, undefined, "only plain web addresses");
  assert.ok(guide.traces.length >= 5 && guide.traces.every((t) => !JSON.stringify(t).includes("fixture-only")));
  await assert.rejects(() => makeCityGuide(plan, city("Denver").id, { client: fixture() }), (e) => e instanceof TourError && e.status === 404);
});
