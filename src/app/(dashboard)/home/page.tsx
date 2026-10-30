import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { ArrowRight, Plus, Search } from "lucide-react";
import { NewTourCard, TodayList, TourCards, type TourCard, type TourTask } from "@/components/tour/HomeView";
import { PageHead } from "@/components/tour/PageHead";
import "@/components/tour/base.css";
import "@/components/tour/tour.css";
import "@/components/tour/home.css";
import { nextUp } from "@/core/tour/next";
import type { Plan } from "@/core/tour/types";
import { knownBrowser } from "@/platform/tour/http";
import { savedResults } from "@/platform/tour/saved";
import { examplePlans } from "@/platform/tour/store";
import { rememberedActs, tourOf, tracksFor } from "@/platform/tour/tracker";

export const metadata: Metadata = { title: "Your tours", robots: { index: false } };

const titleOf = (p: Pick<Plan, "route" | "area">) => `${p.route.length}-stop tour${p.area ? ` of ${p.area}` : ""}`;
const routeOf = (p: Pick<Plan, "route" | "cities">) => p.route.map((r) => p.cities.find((c) => c.id === r.cityId)?.name).filter((n): n is string => !!n);

/** Home: what needs doing across the tours, then the tours themselves; for a first visit, a start and the examples. */
export default async function HomePage() {
  const owner = await knownBrowser();
  const [plans, examples, acts] = await Promise.all([savedResults(owner), examplePlans().catch(() => []), rememberedActs(owner)]);
  const tracks = await tracksFor(owner, plans.map((p) => tourOf(p.plan)));
  // Brands an act has said no to aren't pitched on any of its tours.
  const turnedDown = new Map(acts.map((a) => [a.act.id, a.memory.excludeBrandIds ?? []]));
  const next = (plan: Plan) => nextUp(plan, tracks.get(tourOf(plan)) ?? [], { turnedDown: turnedDown.get(plan.act.id) });
  const tours: TourCard[] = plans.map(({ plan, savedAt }) => ({
    id: plan.id,
    act: { name: plan.act.name, image: plan.act.image },
    title: titleOf(plan),
    route: routeOf(plan),
    progress: next(plan).progress,
    savedAt,
  }));
  const tasks: TourTask[] = plans
    .flatMap(({ plan }) => next(plan).tasks.map((t) => ({ ...t, planId: plan.id, act: plan.act.name })))
    .sort((a, b) => Number(!!b.overdue) - Number(!!a.overdue))
    .slice(0, 6);
  const mine = new Set(plans.map((p) => p.plan.id));
  const shown = examples.filter((e) => !mine.has(e.id));
  const exampleCards: TourCard[] = shown.map((e) => ({
    id: e.id,
    act: { name: e.act.name, image: e.act.image },
    title: titleOf(e),
    route: routeOf(e),
    progress: nextUp(e, []).progress,
    example: true,
    facts: `${e.route.reduce((s, r) => s + r.legKm, 0).toLocaleString("en-US")} km · ${e.sponsors.length} sponsors`,
  }));

  return (
    <div className="hl hl-flow hl-home">
      <PageHead
        title="Your tours"
        actions={
          <Link className="hl-button" href="/plan">
            <Plus size={18} aria-hidden /> New tour
          </Link>
        }
      >
        {tours.length ? `${tours.length} ${tours.length === 1 ? "tour" : "tours"}${tasks.length ? `, ${tasks.length} ${tasks.length === 1 ? "thing" : "things"} to do next` : ""}.` : "Plan a tour for any artist or comedian, anywhere in the world: where their fans are, the venues, the sponsors."}
      </PageHead>

      {!tours.length && (
        <section className="hl-card hl-start" aria-label="Plan a tour">
          <h2>Who&apos;s going on tour?</h2>
          <Form action="/plan" role="search" className="hl-big-search">
            <Search size={22} aria-hidden />
            <label htmlFor="hl-home-act" className="hl-visually-hidden">
              An artist or comedian
            </label>
            <input id="hl-home-act" name="q" placeholder="An artist or comedian" autoComplete="off" maxLength={80} minLength={2} required />
            <button className="hl-button" type="submit">
              Plan a tour <ArrowRight size={17} aria-hidden />
            </button>
          </Form>
        </section>
      )}

      {!!tasks.length && (
        <section className="hl-home-block" aria-labelledby="hl-today-title">
          <div className="hl-section-head">
            <h2 id="hl-today-title">Next up</h2>
            <p>Across your tours, what needs you first.</p>
          </div>
          <TodayList tasks={tasks} />
        </section>
      )}

      {!!tours.length && (
        <section className="hl-home-block" aria-labelledby="hl-tours-title">
          <div className="hl-section-head">
            <h2 id="hl-tours-title">Tours</h2>
          </div>
          <div className="hl-tourgrid">
            <TourCards tours={tours} />
            <NewTourCard />
          </div>
        </section>
      )}

      {!!exampleCards.length && (
        <section className="hl-home-block" aria-labelledby="hl-examples-title">
          <div className="hl-section-head">
            <h2 id="hl-examples-title">Examples</h2>
            <p>Real tours from Qloo&apos;s data, to open and explore.</p>
          </div>
          <TourCards tours={exampleCards} />
        </section>
      )}
    </div>
  );
}
