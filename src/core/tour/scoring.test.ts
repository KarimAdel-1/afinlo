// The scoring rules. Pure: no Qloo, no model, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNTRY_NAMES, REGIONS, US } from "./regions";
import { cityAffinity, CITY_RADIUS_KM, DRIVE_KM, km, legMode, mapOverlap, MIN_GAP_KM, obviousCount, pairCities, planRoute, routeKm, scoreActs, scoreCities, scoreSponsors, sharedCities, strongestIn, type HeatCell } from "./scoring";
import { citiesIn, WORLD_CITIES } from "./world";

const city = (name: string, country = "US") => WORLD_CITIES.find((c) => c.name === name && c.country === country)!;
const usCities = citiesIn(US);
/** A few cells around a city, all with one affinity. */
const around = (name: string, affinity: number, n = 6, country = "US"): HeatCell[] =>
  Array.from({ length: n }, (_, i) => ({ lat: city(name, country).lat + (i % 3) * 0.05, lon: city(name, country).lon + Math.floor(i / 3) * 0.05, affinity }));
const us = (cells: HeatCell[], basis: "act" | "similar" = "act") => scoreCities(cells, { basis, cities: usCities });

test("the candidate cities are the world's, one per metro, each in a country and a touring region", () => {
  assert.ok(WORLD_CITIES.length > 2500);
  assert.ok(Object.keys(COUNTRY_NAMES).length > 150);
  assert.equal(new Set(WORLD_CITIES.map((c) => c.id)).size, WORLD_CITIES.length, "ids are unique");
  assert.ok(WORLD_CITIES.every((c) => /^[a-z]{2}-[a-z0-9-]+$/.test(c.id) && c.population >= 90_000 && c.country in COUNTRY_NAMES));
  const regional = new Set<string>(REGIONS.flatMap((r) => [...r.countries]));
  assert.deepEqual(Object.keys(COUNTRY_NAMES).filter((iso) => !regional.has(iso)), [], "every country is in a region");
  assert.ok(city("Houston").lat < 30.5 && city("Houston").lon < -95, "Houston, Texas, not Houston in Missouri");
  assert.ok(city("Manchester", "GB") && city("Cairo", "EG") && city("Tokyo", "JP") && city("Buenos Aires", "AR"));
  assert.ok(Math.round(km(city("New York"), city("Los Angeles"))) > 3900);
  const metro = WORLD_CITIES.filter((c) => c.country === "US");
  assert.ok(metro.every((a) => metro.every((b) => a === b || km(a, b) >= 45)), "no two cities of a country share a metro");
});

test("Fan Heat comes from the cells near each city; cities without cells have no data rather than zero", () => {
  const cells = [...around("Nashville", 0.98), ...around("New York", 0.9), { lat: 0, lon: 0, affinity: 1 }];
  const rows = cityAffinity(cells, usCities);
  assert.deepEqual(rows.map((r) => r.city.name).sort(), ["Nashville", "New York"]);
  assert.ok(rows.every((r) => r.cells === 6));
  const far = { lat: city("Albuquerque").lat + (CITY_RADIUS_KM + 5) / 111, lon: city("Albuquerque").lon, affinity: 1 };
  assert.equal(cityAffinity([far], [city("Albuquerque")]).length, 0, "a cell outside the radius doesn't count");
  assert.equal(cityAffinity([far], [city("Albuquerque")], 120).length, 1, "a wider radius, for the world's coarser cells, does");
});

test("hidden markets are strong cities outside the area's biggest; confidence follows the evidence", () => {
  const cells = [...around("Nashville", 0.99), ...around("Asheville", 0.97), ...around("New York", 0.95), ...around("Chicago", 0.7), ...around("Omaha", 0.6, 2)];
  const scored = us(cells);
  assert.equal(scored[0].name, "Nashville");
  assert.equal(scored[0].heat, 100);
  assert.equal(scored.at(-1)!.heat, 0);
  const by = (n: string) => scored.find((c) => c.name === n)!;
  assert.equal(by("New York").obvious, true, "the area's biggest city is an obvious market");
  assert.equal(by("New York").hidden, false, "and never hidden");
  assert.equal(by("Nashville").hidden, true);
  assert.equal(by("Asheville").hidden, true);
  assert.equal(by("Nashville").country, "US");
  assert.equal(by("Omaha").confidence, "low");
  assert.equal(by("Nashville").confidence, "high");
  assert.equal(us(cells, "similar")[0].confidence, "medium", "estimated from similar acts is never high confidence");
  assert.deepEqual(us([]), []);
  // Across a region, the obvious markets are its biggest cities with data: ten, or a third of them when there are fewer than 30.
  const europe = scoreCities(
    ["Paris|FR", "Berlin|DE", "Madrid|ES", "Rome|IT", "Lisbon|PT", "Gent|BE", "Leipzig|DE", "Porto|PT", "Lyon|FR", "Milan|IT", "Hamburg|DE", "Munich|DE", "Valencia|ES", "Seville|ES", "Bologna|IT", "Bordeaux|FR", "Dresden|DE", "Krakow|PL", "Vienna|AT", "Prague|CZ", "Budapest|HU", "Warsaw|PL", "Athens|GR", "Brussels|BE", "Amsterdam|NL", "Rotterdam|NL", "Copenhagen|DK", "Stockholm|SE", "Oslo|NO", "Helsinki|FI", "Zurich|CH"]
      .map((p) => p.split("|"))
      .filter(([n, c]) => city(n, c))
      .flatMap(([n, c], i) => around(n, 0.99 - i / 100, 6, c)),
    { basis: "act", cities: WORLD_CITIES.filter((c) => ["FR", "DE", "ES", "IT", "PT", "BE", "PL", "AT", "CZ", "HU", "GR", "NL", "DK", "SE", "NO", "FI", "CH"].includes(c.country)) },
  );
  assert.ok(europe.length >= 24);
  assert.equal(europe.filter((c) => c.obvious).length, obviousCount(europe.length));
  assert.equal(obviousCount(300), 10);
  assert.equal(obviousCount(4), 1);
  assert.ok(europe.find((c) => c.name === "Paris")?.obvious);
  assert.ok(!europe.find((c) => c.name === "Gent")?.obvious);
});

test("the route: the best cities, two hidden markets, never two in one market, drives and flights, from home, around exclusions", () => {
  const cells = [
    ...around("New York", 0.99), ...around("Los Angeles", 0.985), ...around("Chicago", 0.98), ...around("Philadelphia", 0.975),
    ...around("Dallas", 0.97), ...around("Asheville", 0.988), ...around("Albuquerque", 0.987), ...around("Omaha", 0.9),
  ];
  const cities = us(cells);
  const route = planRoute(cities, { stops: 4 });
  assert.equal(route.length, 4);
  const names = route.map((r) => cities.find((c) => c.id === r.cityId)!.name);
  assert.ok(route.filter((r) => cities.find((c) => c.id === r.cityId)!.hidden).length >= 2, `two hidden markets: ${names}`);
  assert.equal(route[0].legKm, 0, "no home: the first stop has no leg");
  assert.equal(route[0].mode, undefined);
  for (const r of route.slice(1)) assert.equal(r.mode, r.legKm > DRIVE_KM ? "fly" : "drive", "a leg over a day's drive is a flight");
  const stops = route.map((r) => cities.find((c) => c.id === r.cityId)!);
  assert.ok(stops.every((a) => stops.every((b) => a === b || km(a, b) >= MIN_GAP_KM)), "no two stops share a market");

  // Over the sea is a flight, however short: Dublin to Liverpool doesn't drive; London to Paris has the tunnel.
  assert.equal(legMode(220, { country: "IE" }, { country: "GB" }), "fly");
  assert.equal(legMode(344, { country: "GB" }, { country: "FR" }), "drive");
  assert.equal(legMode(497, { country: "NL" }, { country: "GB" }), "fly", "Amsterdam to Manchester crosses the North Sea");
  assert.equal(legMode(570, { country: "PH" }, { country: "PH" }), "fly", "a long hop between islands");
  assert.equal(legMode(200, { country: "PH" }, { country: "PH" }), "drive");

  // Two hot cities 50 km apart: only one makes the tour.
  const near = scoreCities([...around("Amsterdam", 0.99, 6, "NL"), ...around("The Hague", 0.985, 6, "NL"), ...around("Brussels", 0.95, 6, "BE"), ...around("Paris", 0.9, 6, "FR")], {
    basis: "act",
    cities: WORLD_CITIES.filter((c) => ["NL", "BE", "FR"].includes(c.country)),
  });
  const pair = planRoute(near, { stops: 3 }).map((r) => near.find((c) => c.id === r.cityId)!.name);
  assert.ok(!(pair.includes("Amsterdam") && pair.includes("The Hague")), `Amsterdam and The Hague are one market: ${pair}`);

  // Without a home, the start is whichever stop makes the shortest tour, and the route never doubles back.
  const line = us([...around("New York", 0.99), ...around("Denver", 0.98), ...around("Chicago", 0.97), ...around("Los Angeles", 0.96)]);
  const sweep = planRoute(line, { stops: 4 }).map((r) => line.find((c) => c.id === r.cityId)!.name);
  assert.ok(sweep.join() === "New York,Chicago,Denver,Los Angeles" || sweep.join() === "Los Angeles,Denver,Chicago,New York", `coast to coast: ${sweep}`);

  const excluded = planRoute(cities, { stops: 4, excludeCityIds: [city("New York").id] });
  assert.ok(!excluded.some((r) => r.cityId === city("New York").id));
  // Home needn't be a stop: from Kansas City (no data here), the first leg is from home to the nearest stop.
  const fromHome = planRoute(cities, { stops: 3, homeCityId: city("Kansas City").id });
  assert.ok(fromHome[0].legKm > 0, "the first leg is from home");
  // Nearest first, then crossings taken out: never longer than going to the nearest stop first and on from there.
  const stopsFromHome = fromHome.map((r) => cities.find((c) => c.id === r.cityId)!);
  const greedy = [...stopsFromHome].sort((x, y) => km(city("Kansas City"), x) - km(city("Kansas City"), y));
  const greedyKm = greedy.reduce((sum, c, i) => sum + km(i ? greedy[i - 1] : city("Kansas City"), c), 0);
  assert.ok(routeKm(fromHome) <= greedyKm + 3, "no longer than nearest-first");
  assert.equal(routeKm(fromHome), fromHome.reduce((s, r) => s + r.legKm, 0));
  const hidden = planRoute(cities, { stops: 2, focus: "hidden" });
  assert.ok(hidden.every((r) => cities.find((c) => c.id === r.cityId)!.hidden));
});

test("Sponsor Fit merges duplicates, keeps only requested categories, leaves out what the act said no to, and weighs size", () => {
  const brands = [
    { id: "A", name: "Fjällräven", affinity: 0.95, popularity: 0.95, tags: ["urn:tag:genre:brand:fashion"] },
    { id: "B", name: "fjällräven", affinity: 0.94, popularity: 0.95, tags: ["urn:tag:genre:brand:fashion"] },
    { id: "C", name: "Giant Co", affinity: 0.95, popularity: 0.999, tags: ["urn:tag:genre:brand:fashion:footwear"] },
    { id: "D", name: "Tiny Tea", affinity: 0.8, popularity: 0.5, tags: ["urn:tag:genre:brand:food_and_beverage:drinks"] },
    { id: "E", name: "Big Beer", affinity: 0.9, popularity: 0.95, tags: ["urn:tag:genre:brand:wine_and_spirits:beer"] },
  ];
  const all = scoreSponsors(brands, { basis: "act" });
  assert.deepEqual(all.map((s) => s.brand.name), ["Fjällräven", "Giant Co", "Big Beer", "Tiny Tea"], "a tie goes to Qloo's own order");
  assert.equal(all[0].fit, 100);
  assert.ok(all.find((s) => s.brand.name === "Giant Co")!.fit < all[0].fit, "same affinity, but a household name is weighted down");
  assert.ok(all.every((s) => s.fit >= 0 && s.fit <= 100));
  const fashion = scoreSponsors(brands, { basis: "act", categoryTags: ["urn:tag:genre:brand:fashion"] });
  assert.deepEqual(fashion.map((s) => s.brand.name), ["Fjällräven", "Giant Co"], "a subcategory counts for its parent");
  assert.deepEqual(scoreSponsors(brands, { basis: "act", categoryTags: ["urn:tag:genre:brand:automotive"] }), []);
  const sober = scoreSponsors(brands, { basis: "act", avoidTags: ["urn:tag:genre:brand:wine_and_spirits"], excludeBrandIds: ["D"] });
  assert.deepEqual(sober.map((s) => s.brand.name), ["Fjällräven", "Giant Co"], "no alcohol, and not the brand turned down");
});

test("a brand's strongest route cities come from its own heatmap", () => {
  const cities = us([...around("Austin", 0.9), ...around("Denver", 0.95), ...around("Seattle", 0.92)]);
  const brandCells = [...around("Seattle", 0.99), ...around("Austin", 0.8), ...around("Miami", 1)];
  assert.deepEqual(strongestIn(brandCells, cities).map((id) => cities.find((c) => c.id === id)!.name), ["Seattle", "Austin"]);
});

test("two audiences meet where both are strong: shared cities, a double bill's heat and hidden markets, and map overlap", () => {
  const a = us([...around("Nashville", 0.99), ...around("Asheville", 0.95), ...around("New York", 0.9), ...around("Omaha", 0.5)]);
  const b = us([...around("Asheville", 0.99), ...around("New York", 0.95), ...around("Nashville", 0.6), ...around("Omaha", 0.55)]);
  const shared = sharedCities(a, b);
  const name = (id: string) => WORLD_CITIES.find((c) => c.id === id)!.name;
  assert.deepEqual(shared.map((s) => name(s.cityId)), ["Asheville", "New York", "Nashville", "Omaha"], "a city strong for one act only ranks below one strong for both");
  assert.deepEqual(shared[0], { cityId: city("Asheville").id, a: 92, b: 100, together: 96 });
  const pair = pairCities(a, b);
  assert.deepEqual(pair.map((c) => [c.name, c.heat]), [["Asheville", 96], ["New York", 86], ["Nashville", 33], ["Omaha", 0]]);
  assert.equal(pair.find((c) => c.name === "Asheville")!.hidden, true);
  assert.equal(pair.find((c) => c.name === "Nashville")!.hidden, false, "strong for one act isn't a hidden market for the pair");
  assert.equal(pair.find((c) => c.name === "New York")!.hidden, false, "an obvious metro is never hidden");
  assert.equal(planRoute(pair, { stops: 2 }).length, 2, "a double bill routes like one act");
  assert.equal(Number(mapOverlap(a, b).toFixed(3)), 0.667, "two of the three cities either is strong in");
  assert.equal(mapOverlap(a, []), 0);
});

test("Brand Fit merges duplicate acts, scales Qloo's affinity, weighs reach, and stays within 0–100", () => {
  const act = (id: string, popularity: number) => ({ id, name: `Act ${id}`, kind: "artist" as const, description: "", disambiguation: "", popularity, comedian: false });
  const scored = scoreActs([
    { act: act("1", 0.999), affinity: 0.95 },
    { act: act("2", 0.95), affinity: 0.9 },
    { act: act("1", 0.999), affinity: 0.7 },
    { act: act("3", 0.5), affinity: 0.8 },
  ]);
  assert.deepEqual(scored.map((s) => [s.act.id, s.fit, s.tier, s.qlooRank]), [["1", 80, "household", 1], ["2", 80, "established", 2], ["3", 36, "niche", 3]]);
  assert.ok(scored.every((s) => s.fit >= 0 && s.fit <= 100));
  assert.deepEqual(scoreActs([]), []);
});
