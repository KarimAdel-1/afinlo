// Where tours go, and what a tour needs next: the areas Qloo is asked about, regions, the map's points, Next up. Pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { arc, flightPath, heatPoints, keepCities } from "./geo";
import { FOLLOW_UP_DAYS, nextUp } from "./next";
import { placeOf, REGIONS, US, where, whereKey, whereLabel, WORLD } from "./regions";
import type { CityHeat, Plan, Track } from "./types";
import { cellsIn, citiesIn, countryAt, countryBox, locationOf, mergeBoxes, nearestCity, WORLD_CITIES, WORLD_LOCATION } from "./world";

test("an area is one shape for Qloo: a region's box, one country's box, or several countries' boxes merged where they touch", () => {
  assert.equal(locationOf({ kind: "region", region: "uk-ireland" }), "POLYGON((-11 49.8, 2 49.8, 2 59, -11 59, -11 49.8))");
  const usBox = countryBox("US")!;
  assert.ok(usBox[0] > -130 && usBox[3] < 52, `the US box leaves out Hawaii and Alaska: ${usBox}`);
  assert.match(locationOf(US), /^POLYGON\(\(/);
  assert.match(locationOf({ kind: "countries", countries: ["DE", "AT"] }), /^POLYGON\(\(/, "neighbours become one box");
  assert.match(locationOf({ kind: "countries", countries: ["GB", "JP"] }), /^MULTIPOLYGON\(\(\(.*\)\), \(\(.*\)\)\)$/, "far apart, two");
  assert.deepEqual(mergeBoxes([[0, 0, 2, 2], [1, 1, 3, 3], [10, 10, 11, 11]]), [[0, 0, 3, 3], [10, 10, 11, 11]]);
  assert.ok(citiesIn({ kind: "region", region: "mena" }).some((c) => c.name === "Cairo"));
  assert.ok(citiesIn({ kind: "region", region: "europe" }).some((c) => c.name === "London"), "a European tour takes in London");
});

test("where a tour goes reads plainly, and only real places are accepted", () => {
  assert.equal(whereLabel({ kind: "region", region: "latin-america" }), "Latin America");
  assert.equal(whereLabel({ kind: "countries", countries: ["DE", "AT"] }), "Germany and Austria");
  assert.equal(whereLabel({ kind: "countries", countries: ["DE", "AT", "CH"] }), "Germany, Austria and Switzerland");
  assert.equal(whereKey({ kind: "countries", countries: ["AT", "DE"] }), whereKey({ kind: "countries", countries: ["DE", "AT"] }), "the same countries in any order are the same tour");
  assert.ok(where.safeParse({ kind: "countries", countries: ["EG"] }).success);
  assert.ok(!where.safeParse({ kind: "countries", countries: ["ZZ"] }).success, "no cities there");
  assert.ok(!where.safeParse({ kind: "countries", countries: [] }).success);
  assert.ok(!where.safeParse({ kind: "region", region: "atlantis" }).success);
  assert.ok(REGIONS.every((r) => r.box[0] < r.box[2] && r.box[1] < r.box[3]));
  assert.equal(placeOf({ name: "Nashville", state: "Tennessee", country: "US" }), "Nashville, Tennessee");
  assert.equal(placeOf({ name: "Manchester", state: "Manchester", country: "GB" }), "Manchester, United Kingdom");
  assert.equal(placeOf({ name: "Denver", state: "Colorado" }), "Denver, Colorado", "a plan from before tours went worldwide");
});

test("the map draws the stronger half of Qloo's cells; flights follow the globe", () => {
  const cells = [
    { lat: 51.5, lon: -0.1, affinity: 1 },
    { lat: 51.6, lon: -0.2, affinity: 0.4 },
    { lat: 10, lon: -30, affinity: 0.9 },
  ];
  assert.deepEqual(heatPoints(cells), [[51.5, -0.1, 1], [10, -30, 0.8]]);
  const flight = arc({ lat: 40.7, lon: -74 }, { lat: 51.5, lon: -0.1 });
  assert.ok(Math.abs(flight[0][0] + 74) < 1e-6 && Math.abs(flight[0][1] - 40.7) < 1e-6);
  assert.ok(Math.abs(flight.at(-1)![0] + 0.1) < 1e-6 && Math.abs(flight.at(-1)![1] - 51.5) < 1e-6);
  assert.ok(Math.max(...flight.map(([, lat]) => lat)) > 51.5, "a great circle bows toward the pole");
  const pacific = arc({ lat: 35.7, lon: 139.7 }, { lat: 37.8, lon: -122.4 });
  assert.ok(pacific.every((p, i) => !i || Math.abs(p[0] - pacific[i - 1][0]) < 30), "no jump across the antimeridian");
  // The maps show one world, with edges. A flight whose great circle crosses an edge (Los Angeles to Sydney, over the
  // Pacific) is drawn across the map instead, from one stop to the other; every other flight is its great circle.
  const la = { lat: 34.1, lon: -118.2 },
    sydney = { lat: -33.9, lon: 151.2 };
  const across = flightPath(la, sydney);
  assert.ok(across.every(([lon, lat]) => lon >= -180 && lon <= 180 && lat >= -85 && lat <= 85), "it stays on the map");
  assert.deepEqual(across[0], [la.lon, la.lat]);
  assert.deepEqual(across.at(-1), [sydney.lon, sydney.lat]);
  assert.ok(across.every((p, i) => !i || Math.abs(p[0] - across[i - 1][0]) < 30), "one curve, no jump from edge to edge");
  assert.ok(Math.max(...across.map(([, lat]) => lat)) > la.lat, "bowed upward, like the other flights");
  assert.deepEqual(flightPath({ lat: 40.7, lon: -74 }, { lat: 51.5, lon: -0.1 }), flight, "a flight that stays on the map is its great circle");
  const many = Array.from({ length: 100 }, (_, i) => ({ id: `c${i}` }) as CityHeat);
  assert.equal(keepCities(many, [{ cityId: "c95", legKm: 0 }]).length, 81, "the strongest 80, and every stop");
});

test("the map shows every cell in the tour's area, rural ones far from a city included, and none from its neighbours", () => {
  const cell = (lat: number, lon: number) => ({ lat, lon, affinity: 0.9 });
  const kentucky = cell(37.25, -83.19),
    montana = cell(47, -109),
    miami = cell(25.77, -80.19),
    tijuana = cell(32.52, -117.02),
    sanDiego = cell(32.75, -117.15),
    easter = cell(-27.12, -109.35),
    atlantic = cell(40, -40);
  assert.ok(nearestCity(kentucky).km > 100 && nearestCity(montana).km > 100, "rural: more than 100 km from any city of 90,000");
  const northAmerica = { kind: "region", region: "north-america" } as const,
    latinAmerica = { kind: "region", region: "latin-america" } as const;
  const all = [kentucky, montana, miami, tijuana, sanDiego, easter, atlantic];
  assert.deepEqual(cellsIn(all, northAmerica), [kentucky, montana, miami, sanDiego]);
  assert.deepEqual(cellsIn(all, latinAmerica), [tijuana], "Miami and San Diego are the US's; Easter Island is too far from any city to tour");
  assert.equal(nearestCity({ lat: 51.51, lon: -0.13 }).city.name, "London");
});

test("Next up: a venue for every stop, the best sponsors pitched, a follow-up after five days, a reply when they answer", () => {
  const plan = {
    route: [{ cityId: "a", legKm: 0 }, { cityId: "b", legKm: 100 }, { cityId: "c", legKm: 200 }],
    cities: ["a", "b", "c"].map((id) => ({ id, name: id.toUpperCase() })),
    sponsors: ["s1", "s2", "s3", "s4"].map((id, i) => ({ brand: { id, name: `Brand ${i + 1}` }, fit: 90 - i })),
  } as unknown as Plan;
  const now = Date.parse("2026-10-27T12:00:00Z");
  const days = (n: number) => new Date(now - n * 86_400_000).toISOString();
  const fresh = nextUp(plan, [], { now });
  assert.deepEqual(fresh.tasks.map((t) => t.id), ["venue:a", "venue:b", "venue:c", "pitch:s1", "pitch:s2", "pitch:s3"], "three pitches at a time");
  assert.deepEqual(fresh.progress, { stops: 3, venuesConfirmed: 0, sponsors: 4, pitchesSent: 0, signed: 0 });
  // A brand the act turned down after the plan was made isn't pitched, or counted among the ones to pitch.
  const without = nextUp(plan, [], { now, turnedDown: ["s1"] });
  assert.deepEqual(without.tasks.filter((t) => t.kind === "pitch").map((t) => t.id), ["pitch:s2", "pitch:s3", "pitch:s4"]);
  assert.equal(without.progress.sponsors, 3);
  const tracks: Track[] = [
    { kind: "venue", itemId: "v1", cityId: "a", status: "confirmed", note: "", updatedAt: days(1) },
    { kind: "venue", itemId: "v2", cityId: "b", status: "hold", note: "", updatedAt: days(1) },
    { kind: "venue", itemId: "v3", cityId: "c", status: "asked", note: "", updatedAt: days(1) },
    { kind: "sponsor", itemId: "s1", status: "sent", note: "", updatedAt: days(FOLLOW_UP_DAYS + 1) },
    { kind: "sponsor", itemId: "s2", status: "sent", note: "", updatedAt: days(1) },
    { kind: "sponsor", itemId: "s3", status: "replied", note: "", updatedAt: days(1) },
    { kind: "sponsor", itemId: "s4", status: "signed", note: "", updatedAt: days(1) },
  ];
  const later = nextUp(plan, tracks, { now });
  assert.deepEqual(later.tasks.map((t) => t.id), ["follow:s1", "reply:s3", "confirm:b"], "overdue first, then the hold to confirm; an asked venue and a fresh pitch wait");
  assert.match(later.tasks[0].detail, /6 days ago/);
  assert.deepEqual(later.progress, { stops: 3, venuesConfirmed: 1, sponsors: 4, pitchesSent: 4, signed: 1 });
});

test("a world tour has the whole world as its area: one shape for Qloo, every city, every country's fans", () => {
  assert.ok(where.safeParse({ kind: "world" }).success);
  assert.ok(!where.safeParse({ kind: "world", countries: ["US"] }).success, "nothing else with it");
  assert.equal(whereLabel(WORLD), "the world");
  assert.equal(whereKey(WORLD), "w");
  assert.equal(locationOf(WORLD), WORLD_LOCATION);
  assert.equal(citiesIn(WORLD).length, WORLD_CITIES.length);
  const tokyo = { lat: 35.68, lon: 139.69 },
    pacific = { lat: 0, lon: -150 };
  assert.deepEqual(cellsIn([tokyo, pacific], WORLD), [tokyo], "Tokyo is in; the open Pacific isn't");
  assert.deepEqual([countryAt(tokyo), countryAt(pacific)], ["JP", undefined], "a point is its nearest city's country, and the open sea no one's");
});
