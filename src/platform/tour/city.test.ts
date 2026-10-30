// A stop's city guide against a fixture Qloo shaped like the live hackathon API (26 Oct 2026): every place comes from
// a Qloo response, each appears once, and only for a stop on the route. Proves behavior, not the quality of Qloo's data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WORLD_CITIES } from "@/core/tour/world";
import { TourError, type Plan } from "@/core/tour/types";
import { QlooClient } from "../taste/qloo";
import { makeCityGuide } from "./city";

const A = "AAAAAAAA-0000-4000-8000-000000000001";
const PLACE = (n: number) => `DDDDDDDD-0000-4000-8000-00000000000${n}`;
const city = (name: string) => WORLD_CITIES.find((c) => c.name === name && c.country === "US")!;

function fixture() {
  return new QlooClient({
    key: "fixture-only",
    wait: async () => {},
    fetcher: async (u) => {
      const url = new URL(String(u));
      const p = url.searchParams;
      if (p.get("filter.type") === "urn:entity:place") {
        const tag = p.get("filter.tags") ?? "";
        // The same bar comes back for "bars" and for "any place"; an airport too, which never shows.
        const places = tag.includes("music_venue")
          ? [{ id: PLACE(1), name: "The Basement" }]
          : tag.includes("bar")
            ? [{ id: PLACE(2), name: "Honky Tonk" }]
            : tag
              ? []
              : [{ id: PLACE(2), name: "Honky Tonk" }, { id: PLACE(3), name: "International Airport" }, { id: PLACE(4), name: "Riverfront Park" }];
        return Response.json({ success: true, results: { entities: places.map((x) => ({ entity_id: x.id, name: x.name, subtype: "urn:entity:place", query: { affinity: 0.9 }, properties: { address: "1 Main St", website: "javascript:alert(1)", business_rating: 4.5, primary_genre: { name: "Live music bar" } } })) } });
      }
      return new Response(null, { status: 404 });
    },
  });
}

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
