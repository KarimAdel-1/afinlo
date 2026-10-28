// Why a city is or isn't on a tour, in plain words, from the same rules that made the route (scoring.ts): what the
// route planner tells the user, worked out here rather than guessed by a model. Pure.
import { countryName } from "./regions";
import { hottestCity, hottestMarket, km, routeRules } from "./scoring";
import type { CityHeat, Plan } from "./types";

const scoreLine = "Tour score is three parts Fan Heat to one part market size";

/** Why `city` is on this plan's route, or why not. */
export function whyCity(plan: Pick<Plan, "cities" | "route" | "request">, city: CityHeat): string {
  const stops = plan.route.map((r) => plan.cities.find((c) => c.id === r.cityId)).filter((c): c is CityHeat => !!c);
  const at = stops.indexOf(city);
  const hidden = plan.request.focus === "hidden";
  const rules = routeRules(plan.request.where, plan.request.stops);
  const pool = plan.cities.filter((c) => !plan.request.excludeCityIds.includes(c.id));
  if (at >= 0) {
    const hottest = hottestCity(pool);
    let reason = `its tour score, ${city.tourScore}, is among the area's best`;
    if (plan.request.includeCityIds?.includes(city.id)) reason = "it was asked for by name";
    else if (city === hottestMarket(pool, rules.gapKm))
      reason = hottest && hottest !== city ? `it's the biggest stage in the act's hottest market, around ${hottest.name} (Fan Heat ${hottest.heat}), which every tour plays` : "it's the act's hottest market, which every tour plays";
    else if (city.hidden && stops.filter((c) => c !== city).every((c) => c.tourScore >= city.tourScore)) reason = "every tour keeps at least two hidden markets, and it's one of the strongest";
    else if (hidden) reason = "this tour puts hidden markets first, and it's among the strongest";
    return `Stop ${at + 1}, with Fan Heat ${city.heat}${city.hidden ? " (a hidden market)" : ""}: ${reason}.`;
  }
  if (plan.request.excludeCityIds.includes(city.id)) return "The tour leaves it out, as asked.";
  const near = stops.map((s) => ({ s, d: km(s, city) })).sort((a, b) => a.d - b.d)[0];
  if (near && near.d < rules.gapKm)
    return `It's ${Math.round(near.d)} km from ${near.s.name}, a stop on the route. Shows are kept at least ${rules.gapKm} km apart, so two don't compete for the same fans.`;
  const same = stops.filter((s) => s.country === city.country).length;
  if (rules.perCountry && same >= rules.perCountry)
    return `${countryName(city.country ?? "US")} already has ${same} of the stops, and a world tour gives one country at most ${rules.perCountry}.`;
  if (hidden && !city.hidden) return `This tour puts hidden markets first, and ${city.obvious ? "it's one of the area's biggest markets" : "it isn't one of the hidden markets"}.`;
  const weakest = [...stops].sort((a, b) => a.tourScore - b.tourScore)[0];
  if (weakest && city.tourScore <= weakest.tourScore)
    return `Its tour score, ${city.tourScore}, is below every stop's: the lowest on the route is ${weakest.name}, at ${weakest.tourScore}. ${scoreLine}.`;
  // Scored above a stop and not near one: it made way for a city asked for by name, or for a hidden market.
  if (plan.request.includeCityIds?.length) return `The cities asked for by name come first, and it was next in line, with a tour score of ${city.tourScore}.`;
  return `Every tour keeps at least two hidden markets, and one took its place. Its tour score is ${city.tourScore}. ${scoreLine}.`;
}
