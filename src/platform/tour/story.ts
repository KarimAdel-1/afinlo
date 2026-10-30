// The landing page's How it works follows one example tour through the app. This is that tour's real data, cut down to
// what each step shows: Qloo's search results, its strongest cities, venues and sponsors, a drafted pitch, and why a
// stop is on the route, in the words the route planner's tool gives.
import { whyCity } from "@/core/tour/why";
import { countryName, placeOf } from "@/core/tour/regions";
import { categoryOf } from "@/components/tour/sponsors";
import { planStops, type StaticStop } from "@/components/tour/StaticMap";
import type { Act } from "@/core/tour/types";
import { QlooClient } from "../taste/qloo";
import { searchActs } from "./qloo";
import { qlooCache, type examplePlans } from "./store";

type Example = Awaited<ReturnType<typeof examplePlans>>[number];

export interface HowStory {
  actName: string;
  area: string;
  results: { id: string; name: string; image?: string; about: string }[];
  points: [number, number, number][];
  mapStops: StaticStop[];
  cities: { name: string; country: string; heat: number; hidden: boolean; lat: number; lon: number }[];
  route: { name: string; leg: string; heat: number; hidden: boolean }[];
  stops: number;
  venues: { id: string; name: string; city: string; image?: string }[];
  sponsors: { id: string; name: string; image?: string; fit: number; category: string }[];
  email?: { to: string; subject: string; body: string };
  ask: { city: string; reply: string };
}

/** This runs while the page is built, and a no-store request there would make the whole page render on every visit. */
const buildClient = () => new QlooClient({ cache: qlooCache, fetcher: (input, init) => fetch(input, { ...init, cache: undefined }) });

const kindOf = (a: Act) => (a.comedian ? "Comedian" : a.kind === "person" ? "Person" : "Artist");

export async function howStory(plan: Example): Promise<HowStory> {
  // A search for the act, as the brief makes it. Rows Qloo describes come first, as they tell the acts apart.
  const found = await searchActs(buildClient(), plan.act.name, []).catch(() => []);
  const rows = [...(found.length ? found : [plan.act])].sort((a, b) => Number(!a.description) - Number(!b.description)).slice(0, 3);
  const stops = plan.route.flatMap((r) => plan.cities.find((c) => c.id === r.cityId) ?? []);
  const top = plan.sponsors.slice(0, 3);
  const email = plan.pitch.emails.find((e) => e.brandId.toUpperCase() === top[0]?.brand.id.toUpperCase());
  const asked = stops.find((c) => c.hidden) ?? stops[0];
  return {
    actName: plan.act.name,
    area: plan.area ?? "the United States",
    results: rows.map((a) => ({ id: `${a.id}-${a.kind}`, name: a.name, image: a.image, about: [kindOf(a), a.description].filter(Boolean).join(" · ").slice(0, 120) })),
    points: plan.heatPoints ?? [],
    mapStops: planStops(plan),
    cities: [...plan.cities].sort((a, b) => b.heat - a.heat).slice(0, 3).map((c) => ({ name: c.name, country: countryName(c.country ?? "US"), heat: c.heat, hidden: c.hidden, lat: c.lat, lon: c.lon })),
    route: stops.map((c, i) => {
      const { legKm, mode } = plan.route[i];
      return { name: c.name, leg: legKm && mode ? `${mode === "fly" ? "Flight" : "Drive"}, ${legKm.toLocaleString("en-US")} km` : "First show", heat: c.heat, hidden: c.hidden };
    }),
    stops: stops.length,
    venues: plan.localSpots
      .filter((s) => s.kind === "venue")
      .slice(0, 4)
      .map((s) => {
        const city = plan.cities.find((c) => c.id === s.cityId);
        return { id: s.place.id, name: s.place.name, city: city ? placeOf(city) : "", image: s.place.image };
      }),
    sponsors: top.map((s) => ({ id: s.brand.id, name: s.brand.name, image: s.brand.image, fit: s.fit, category: categoryOf(s.brand.categories) ?? "Brand" })),
    email: email && top[0] ? { to: top[0].brand.name, subject: email.subject, body: email.body } : undefined,
    ask: { city: asked?.name ?? "", reply: asked ? whyCity(plan, asked) : "" },
  };
}
