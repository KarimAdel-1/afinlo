// A stop's city guide: the venues this audience loves near the city, local businesses to pitch as partners for the
// night (bars, breweries, restaurants, clothing stores), and other places fans love there. Qloo picks every place;
// nothing is written by a model. Made once per stop, then kept with the plan (store.ts).
import type { TasteTrace } from "@/core/taste/types";
import { TourError, type CityGuide, type CityPlace, type Plan } from "@/core/tour/types";
import type { QlooClient } from "../taste/qloo";
import { qlooClient, LEAD_TAGS, NOT_PUBLIC, placesNear, TRANSPORT, VENUE_FALLBACK_TAGS, VENUE_TAGS } from "./qloo";

export async function makeCityGuide(plan: Plan, cityId: string, deps: { client?: QlooClient; signal?: AbortSignal } = {}): Promise<CityGuide> {
  const city = plan.route.some((r) => r.cityId === cityId) ? plan.cities.find((c) => c.id === cityId) : undefined;
  if (!city) throw new TourError("not_on_route", "That city isn't on this tour.", 404);
  const client = deps.client ?? qlooClient();
  const traces: TasteTrace[] = [];
  // The same signal the plan used: the act's own, or the act with the acts like it when its own data is thin.
  const ids = plan.signal.basis === "similar" ? [plan.act.id, ...plan.signal.similar.map((s) => s.id)] : [plan.act.id];
  const ask = (tag: string | undefined, take: number) => placesNear(client, ids, city, { tag, take }, traces, deps.signal);
  const answers = await Promise.allSettled([
    ask(plan.act.comedian ? VENUE_TAGS.comedy : VENUE_TAGS.music, 6),
    ask(LEAD_TAGS.bars, 4),
    ask(LEAD_TAGS.breweries, 3),
    ask(LEAD_TAGS.food, 4),
    ask(LEAD_TAGS.clothing, 3),
    ask(undefined, 12),
  ]);
  deps.signal?.throwIfAborted();
  if (answers.every((a) => a.status === "rejected")) throw new TourError("qloo_places", `Qloo's place data didn't answer for ${city.name}. Please try again shortly.`, 502);
  const useful = (places: CityPlace[]) => places.filter((p) => !TRANSPORT.test(p.name) && !NOT_PUBLIC.test(p.kind ?? ""));
  const [tagged, bars, breweries, food, clothing, loved] = answers.map((a) => (a.status === "fulfilled" ? useful(a.value) : []));
  // Qloo tags few venues in some cities (Berlin, Cairo): then live music and event venues too.
  let venues = tagged;
  for (const tag of VENUE_FALLBACK_TAGS) {
    if (venues.length >= 3) break;
    const more = await ask(tag, 6).then(useful, () => []);
    venues = [...venues, ...more.filter((p) => !venues.some((v) => v.id === p.id))];
  }

  // Each place appears once, in the first list it belongs to.
  const seen = new Set<string>();
  const once = (places: CityPlace[]) =>
    places.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  const notes: string[] = [];
  if (answers[0].status === "rejected") notes.push("Qloo's venue data didn't answer for this city, so there are no venues here. Try again shortly.");
  if (answers.slice(1, 5).every((a) => a.status === "rejected")) notes.push("Qloo's local business data didn't answer for this city, so there are no sponsor leads here.");
  return {
    planId: plan.id,
    cityId,
    createdAt: new Date().toISOString(),
    venues: once(venues),
    leads: once([...bars, ...breweries, ...food, ...clothing]).sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0)),
    loved: once(loved).slice(0, 8),
    notes,
    traces,
  };
}
