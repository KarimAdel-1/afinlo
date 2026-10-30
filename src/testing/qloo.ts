// A fixture Qloo shaped like the live hackathon API (26 Oct 2026), for tests: one country singer with a heatmap across
// the American South, a comedian Qloo has no map for, three openers, four brands, and places near any city.
import { WORLD_CITIES } from "@/core/tour/world";
import { QlooClient } from "@/platform/taste/qloo";

export const ACT = "AAAAAAAA-0000-4000-8000-000000000001",
  THIN = "AAAAAAAA-0000-4000-8000-000000000002";
export const SIMILAR = ["BBBBBBBB-0000-4000-8000-000000000001", "BBBBBBBB-0000-4000-8000-000000000002", "BBBBBBBB-0000-4000-8000-000000000003"];
export const BRANDS = [
  { id: "CCCCCCCC-0000-4000-8000-000000000001", name: "Yee Yee Apparel", tags: ["urn:tag:genre:brand:fashion"], pop: 0.95, aff: 0.97 },
  { id: "CCCCCCCC-0000-4000-8000-000000000002", name: "Ole Smoky Distillery", tags: ["urn:tag:genre:brand:wine_and_spirits:spirits"], pop: 0.92, aff: 0.95 },
  { id: "CCCCCCCC-0000-4000-8000-000000000003", name: "Ram Trucks", tags: ["urn:tag:genre:brand:automotive"], pop: 0.999, aff: 0.9 },
  { id: "CCCCCCCC-0000-4000-8000-000000000004", name: "Durango Boots", tags: ["urn:tag:genre:brand:fashion:footwear"], pop: 0.85, aff: 0.88 },
];
export const PLACE = (n: number) => `DDDDDDDD-0000-4000-8000-00000000000${n}`;
export const usCity = (name: string) => WORLD_CITIES.find((c) => c.name === name && c.country === "US")!;
const cellsAround = (names: [string, number][]) =>
  names.flatMap(([name, affinity]) =>
    Array.from({ length: 6 }, (_, i) => ({ location: { latitude: usCity(name).lat + (i % 3) * 0.04, longitude: usCity(name).lon + Math.floor(i / 3) * 0.04 }, query: { affinity } })),
  );

export function fixtureQloo(options: { failBrands?: boolean; seen?: URL[] } = {}) {
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
      // A search by name finds the fixture act, as an artist.
      if (url.pathname === "/search")
        return Response.json({
          results: /fixture/i.test(p.get("query") ?? "") && p.get("types") === "urn:entity:artist" ? [{ entity_id: ACT, name: "Fixture Star", types: ["urn:entity:artist"], popularity: 0.97, properties: { short_description: "A country singer." } }] : [],
        });
      if (url.pathname === "/entities") {
        const id = p.get("entity_ids");
        const opener = SIMILAR.indexOf(id ?? "");
        if (opener >= 0) return Response.json({ results: [{ entity_id: id, name: `Opener ${opener + 1}`, subtype: "urn:entity:artist", popularity: 0.9, properties: { short_description: "A singer." } }] });
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
