import type { Metadata } from "next";
import { AssistantChat } from "@/components/tour/AssistantChat";
import { NewTourCard, TourCards, type TourCard } from "@/components/tour/HomeView";
import "@/components/tour/base.css";
import "@/components/tour/tour.css";
import "@/components/tour/home.css";
import { nextUp } from "@/core/tour/next";
import { getProfile } from "@/platform/assistant/profile";
import type { Plan } from "@/core/tour/types";
import { knownBrowser } from "@/platform/tour/http";
import { savedResults } from "@/platform/tour/saved";
import { rememberedActs, tourOf, tracksFor } from "@/platform/tour/tracker";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

const titleOf = (p: Pick<Plan, "route" | "area">) => `${p.route.length}-stop tour${p.area ? ` of ${p.area}` : ""}`;
const routeOf = (p: Pick<Plan, "route" | "cities">) => p.route.map((r) => p.cities.find((c) => c.id === r.cityId)?.name).filter((n): n is string => !!n);

/** Home: the assistant, the way in to everything; then the browser's tours, one click away. */
export default async function HomePage() {
  const owner = await knownBrowser();
  const [plans, acts, profile] = await Promise.all([savedResults(owner), rememberedActs(owner), getProfile(owner)]);
  const tracks = await tracksFor(owner, plans.map((p) => tourOf(p.plan)));
  // Brands an act has said no to aren't pitched on any of its tours.
  const turnedDown = new Map(acts.map((a) => [a.act.id, a.memory.excludeBrandIds ?? []]));
  const tours: TourCard[] = plans.map(({ plan, savedAt }) => ({
    id: plan.id,
    act: { name: plan.act.name, image: plan.act.image },
    title: titleOf(plan),
    route: routeOf(plan),
    progress: nextUp(plan, tracks.get(tourOf(plan)) ?? [], { turnedDown: turnedDown.get(plan.act.id) }).progress,
    savedAt,
  }));

  return (
    <div className="hl hl-flow hl-home">
      <AssistantChat hasTours={!!tours.length} name={profile.name} />
      {!!tours.length && (
        <section className="hl-home-block hl-home-tours" aria-labelledby="hl-tours-title">
          <div className="hl-section-head">
            <h2 id="hl-tours-title">Your tours</h2>
          </div>
          <div className="hl-tourgrid">
            <TourCards tours={tours} />
            <NewTourCard />
          </div>
        </section>
      )}
    </div>
  );
}
