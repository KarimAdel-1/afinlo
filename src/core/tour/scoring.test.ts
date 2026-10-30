// The scoring rules. Pure: no Qloo, no model, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNTRY_NAMES, REGIONS, US } from "./regions";
import { cityAffinity, CITY_RADIUS_KM, DRIVE_KM, km, legMode, MIN_GAP_KM, obviousCount, planRoute, proofOf, routeKm, routeRules, scoreCities, scoreSponsors, strongestIn, WORLD_GAP_KM, type HeatCell } from "./scoring";
import type { CityHeat } from "./types";
import { citiesIn, WORLD_CITIES } from "./world";
import { whyCity } from "./why";

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
  assert.equal(cityAffinity([far], [city("Albuquerque")], true).length, 1, "the world view's wider radius, for its coarser cells, does");
});

test("the world view: a city counts its own country's cells and leans on its country's, and its market is what its people spend", () => {
  // Across a border: San Diego's fans aren't Tijuana's.
  const border = [...around("San Diego", 0.95), ...around("Tijuana", 0.3, 3, "MX").map((c) => ({ ...c, lat: c.lat - 0.3 }))];
  const tijuana = (world: boolean) => cityAffinity(border, [city("Tijuana", "MX")], world)[0].affinity;
  assert.ok(tijuana(false) > 0.6, "read as a metro, Tijuana takes in San Diego's cells");
  assert.ok(tijuana(true) < 0.4, "in the world view, only Mexico's");
  // One hot cell in a country of cool ones: Karachi's one cell beats London's two, but Pakistan's many pull it back.
  const cells = [...around("Karachi", 0.77, 1, "PK"), ...around("Lahore", 0.3, 6, "PK"), ...around("Rawalpindi", 0.35, 6, "PK"), ...around("London", 0.74, 2, "GB"), ...around("Manchester", 0.6, 6, "GB")];
  const pair = [city("Karachi", "PK"), city("London", "GB")];
  const [karachi, london] = cityAffinity(cells, pair, true);
  assert.ok(cityAffinity(cells, pair)[0].affinity > cityAffinity(cells, pair)[1].affinity, "cell for cell, Karachi is hotter");
  assert.ok(karachi.affinity < london.affinity - 0.05, "leaning on its country, it isn't");
  // As hot as each other: what their people spend makes London the bigger market, though Dhaka has more people.
  const even = [...around("London", 0.8, 3, "GB"), ...around("Dhaka", 0.8, 3, "BD"), ...around("Nashville", 0.9, 3)];
  const three = [city("London", "GB"), city("Dhaka", "BD"), city("Nashville")];
  const score = (world: boolean, name: string) => scoreCities(even, { basis: "act", cities: three, world }).find((c) => c.name === name)!;
  assert.equal(score(true, "London").heat, score(true, "Dhaka").heat);
  assert.ok(score(true, "London").tourScore > score(true, "Dhaka").tourScore);
  assert.ok(score(false, "Dhaka").tourScore > score(false, "London").tourScore, "by people alone, Dhaka would be the bigger market");
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
  // Hidden markets first: every stop but the act's hottest market (here New York), which every tour plays.
  const hidden = planRoute(cities, { stops: 3, focus: "hidden" });
  assert.ok(hidden.some((r) => r.cityId === city("New York").id));
  assert.ok(hidden.every((r) => r.cityId === city("New York").id || cities.find((c) => c.id === r.cityId)!.hidden));
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

test("the proof: the route's Fan Heat against the area's biggest cities, as many as it has stops", () => {
  const scored = us([...around("Nashville", 0.99), ...around("Knoxville", 0.98), ...around("Omaha", 0.96), ...around("New York", 0.6), ...around("Los Angeles", 0.55), ...around("Chicago", 0.62), ...around("Boise", 0.5)]);
  const at = (n: string) => scored.find((c) => c.name === n)!;
  const route = planRoute(scored, { stops: 3 });
  const proof = proofOf(scored, route)!;
  assert.deepEqual(proof.biggestCities, ["New York", "Los Angeles", "Chicago"], "the biggest by metro, as many as the route has stops");
  assert.equal(proof.biggest, Math.round((at("New York").heat + at("Los Angeles").heat + at("Chicago").heat) / 3));
  assert.equal(proof.route, Math.round(route.reduce((s, r) => s + scored.find((c) => c.id === r.cityId)!.heat, 0) / route.length));
  assert.ok(proof.route > proof.biggest + 30, `the hot mid-size cities beat the lukewarm giants: ${proof.route} against ${proof.biggest}`);
  const obvious = proofOf(scored, ["New York", "Los Angeles", "Chicago"].map((n) => ({ cityId: at(n).id, legKm: 0 })))!;
  assert.equal(obvious.route, obvious.biggest, "a route of the biggest cities is no better than them");
  assert.equal(proofOf(scored, []), undefined);
});

test("a city the tour must include is on the route whatever its score, and never swapped out", () => {
  const scored = us([...around("Nashville", 0.99), ...around("Knoxville", 0.98), ...around("Omaha", 0.96), ...around("New York", 0.6), ...around("Chicago", 0.62), ...around("Boise", 0.5)]);
  const at = (n: string) => scored.find((c) => c.name === n)!;
  const names = (ids: { cityId: string }[]) => ids.map((r) => scored.find((c) => c.id === r.cityId)!.name).sort();
  const plain = planRoute(scored, { stops: 3 });
  assert.ok(!names(plain).includes("Boise"), "the weakest city isn't on the route by itself");
  const asked = planRoute(scored, { stops: 3, includeCityIds: [at("Boise").id] });
  assert.ok(names(asked).includes("Boise") && asked.length === 3, "asked for, it is, and the rest fill in");
  assert.ok(!names(planRoute(scored, { stops: 3, includeCityIds: [at("Boise").id], excludeCityIds: [at("Boise").id] })).includes("Boise"), "a city also left out stays out");
  assert.equal(planRoute(scored, { stops: 2, includeCityIds: [at("Boise").id, at("New York").id, at("Chicago").id] }).length, 2, "never more stops than asked for");
});

test("why a city is or isn't on the route, from the rules that made it", () => {
  const scored = us([...around("Nashville", 0.99), ...around("Knoxville", 0.98), ...around("Omaha", 0.96), ...around("New York", 0.6), ...around("Chicago", 0.62), ...around("Boise", 0.5)]);
  const at = (n: string) => scored.find((c) => c.name === n)!;
  const request = { actId: "a", stops: 3, categories: [], excludeCityIds: [at("Chicago").id], focus: "balanced" as const };
  const route = planRoute(scored, request);
  const plan = { cities: scored, route, request };
  const onRoute = scored.find((c) => route[0].cityId === c.id)!;
  assert.match(whyCity(plan, onRoute), /^Stop 1, with Fan Heat \d+/);
  assert.equal(whyCity(plan, at("Chicago")), "The tour leaves it out, as asked.");
  assert.match(whyCity(plan, at("Boise")), /below every stop's: the lowest on the route is .+, at \d+/);
  const near = whyCity({ ...plan, cities: [...scored, { ...at("Nashville"), id: "us-murfreesboro", name: "Murfreesboro", lat: 35.85, lon: -86.39, tourScore: 99 }] }, { ...at("Nashville"), id: "us-murfreesboro", name: "Murfreesboro", lat: 35.85, lon: -86.39, tourScore: 99 });
  assert.match(near, /km from Nashville, a stop on the route/);
});

/** A city as scoring gives it, for routes built by hand. */
const made = (id: string, lat: number, lon: number, heat: number, tourScore: number, country = "US", population = 1_000_000): CityHeat => ({
  id,
  name: id,
  state: "",
  country,
  lat,
  lon,
  population,
  obvious: false,
  affinity: heat / 100,
  cells: 6,
  heat,
  hidden: false,
  tourScore,
  confidence: "high",
});

test("every tour plays the act's hottest market, on that market's biggest stage", () => {
  // Bad Bunny in Latin America, in small: the hottest fans are in a small city, with a bigger one in the same market,
  // and bigger cities elsewhere, nearly as hot, outscore both.
  const cities = [
    made("mayaguez", 18.2, -67.14, 100, 86, "PR", 291_000),
    made("san-juan", 18.47, -66.11, 93, 88, "PR", 2_500_000),
    made("mexico-city", 19.43, -99.13, 98, 98),
    made("bogota", 4.71, -74.07, 97, 97),
    made("lima", -12.05, -77.04, 97, 96),
  ];
  const names = (stops: number, options: Partial<Parameters<typeof planRoute>[1]> = {}) => planRoute(cities, { stops, ...options }).map((r) => r.cityId).sort();
  assert.deepEqual(names(3), ["bogota", "mexico-city", "san-juan"], "the market's best tour score plays, not its hottest town");
  assert.deepEqual(names(3, { includeCityIds: ["mayaguez"] }), ["bogota", "mayaguez", "mexico-city"], "a city asked for in that market stands for it");
  assert.ok(!names(3, { excludeCityIds: ["mayaguez", "san-juan"] }).includes("san-juan"), "a market left out stays out");
  const plan = { cities, route: planRoute(cities, { stops: 3 }), request: { actId: "a", stops: 3, categories: [], excludeCityIds: [], focus: "balanced" as const } };
  assert.match(whyCity(plan, cities[1]), /biggest stage in the act's hottest market, around mayaguez \(Fan Heat 100\)/);
});

test("a world tour spreads out: shows far apart, no country with more than its share unless only it has fans", () => {
  const rules = routeRules({ kind: "world" }, 8);
  assert.deepEqual([rules.gapKm, rules.perCountry], [WORLD_GAP_KM, 2]);
  assert.deepEqual(routeRules({ kind: "region", region: "europe" }, 8), { gapKm: MIN_GAP_KM }, "a region keeps the usual rules");
  const world = [
    made("new-york", 40.71, -74, 99, 99),
    made("chicago", 41.88, -87.63, 98, 98),
    made("los-angeles", 34.05, -118.24, 97, 97),
    made("philadelphia", 39.95, -75.17, 97, 96),
    made("toronto", 43.65, -79.38, 90, 90, "CA"),
    made("london", 51.51, -0.13, 88, 88, "GB"),
  ];
  const stops = planRoute(world, { stops: 4, gapKm: rules.gapKm, perCountry: 2 }).map((r) => world.find((c) => c.id === r.cityId)!);
  assert.deepEqual(stops.map((c) => c.id).sort(), ["chicago", "london", "new-york", "toronto"]);
  assert.ok(stops.every((a) => stops.every((b) => a === b || km(a, b) >= WORLD_GAP_KM)), "every two shows at least 400 km apart");
  const onlyUs = world.filter((c) => c.country === "US");
  assert.equal(planRoute(onlyUs, { stops: 3, gapKm: rules.gapKm, perCountry: 2 }).length, 3, "fans in one country only: the cap gives way, and the tour keeps its shows");
});
