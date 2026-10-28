import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calculator, Check, Database, PenLine, RefreshCw, Search, TrendingUp } from "lucide-react";
import { Avatar } from "@/components/tour/Avatar";
import "@/components/tour/base.css";
import { PHOTOS } from "@/components/tour/photos";
import { categoryOf, ringDash, TIER } from "@/components/tour/sponsors";
import { planStops, StaticMap } from "@/components/tour/StaticMap";
import "@/components/tour/tour.css";
import { COUNTRY_NAMES } from "@/core/tour/regions";
import { CITY_RADIUS_KM, DRIVE_KM, MIN_GAP_KM, TIER_WEIGHT } from "@/core/tour/scoring";
import { WORLD_CITIES, WORLD_SOURCE } from "@/core/tour/world";
import { examplePlans } from "@/platform/tour/store";

export const metadata: Metadata = {
  title: "How it works",
  description: "How Afinlo turns Qloo's taste data into a sponsor-ready tour plan: the agent loop, every Qloo call, and how each number is computed.",
};

const STEPS = [
  { icon: Search, title: "You brief it", text: "An artist or comedian, where to tour (a region or countries, from a first look at where the fans are worldwide), and what matters." },
  { icon: Database, title: "Qloo tools", text: "Resolve the act, Fan DNA, the heatmap, brands, support acts, local spots. Up to four requests at a time.", tone: "qloo" },
  { icon: Calculator, title: "Scorers", text: "Plain TypeScript: Fan Heat, hidden markets, the route, Sponsor Fit. Same input, same output.", tone: "code" },
  { icon: PenLine, title: "Writer", text: "The pitch, booking requests and follow-ups are drafted from the scored results. With a language model connected, it writes them, and its draft is checked." },
  { icon: RefreshCw, title: "Refine", text: "Ask for a change. The planner turns it into new filters and the agent plans again." },
];

const CALLS = [
  ["Resolve the act", "GET /search (artists, then people)", "The act's Qloo entity; you confirm the exact one."],
  ["Fan DNA", "GET /v2/insights: urn:tag, urn:demographics, film, TV, podcast and book", "Taste tags, the audience's age and gender skew, what fans love elsewhere."],
  ["Where in the world", "GET /v2/insights: urn:heatmap, filter.location = the whole world", "About 3,000 cells of 150 km: the countries and regions where the fans are, for choosing where to tour."],
  ["Fan Heat", "GET /v2/insights: urn:heatmap, filter.location = the region, or boxes around the countries", "Thousands of cells, from 5 km in one country to 40 km across a region: how strongly the audience over-indexes there."],
  ["Sponsor match", "GET /v2/insights: urn:entity:brand, signal.location = the tour's area, one call per category tag", "Brands this audience loves there, with their Qloo affinity and category tags."],
  ["Sponsor evidence", "GET /v2/insights: urn:heatmap for each top brand", "Where each brand's own audience is strongest along the route."],
  ["Support acts", "GET /v2/insights: urn:entity:artist, then /v2/insights/compare", "Acts with overlapping audiences, and the taste both crowds share."],
  ["Venues and partners", "GET /v2/insights: urn:entity:place, filter.location = POINT near each stop", "Music venues or comedy clubs, local businesses to partner with, and places fans love, within 20 km, pinned on the map."],
];

export default async function HowItWorks() {
  const examples = await examplePlans().catch(() => []);
  const ex = examples.find((e) => e.heatPoints?.length) ?? examples[0];
  const sponsorEx = examples.find((e) => e.sponsors.length >= 3) ?? ex;

  return (
    <>
      <section className="af2-simple-hero af2-process-hero">
        <h1>
          Qloo picks. Code scores.
          <br />
          The AI writes.
        </h1>
        <p>
          Afinlo is an agent built with LangGraph. Qloo answers every question about the audience, plain code turns those answers into scores, and a language
          model writes the pitch from the scored results. The model never chooses a city, a brand, a venue or an act, and it can&apos;t add one.
        </p>
        <div className="hl hl-hero-actions">
          <Link className="af2-button" href="/plan">
            Plan a tour
            <ArrowRight size={16} aria-hidden />
          </Link>
          <Link className="af2-button af2-button-secondary" href="/does-it-work">
            Does it work?
          </Link>
        </div>
      </section>

      <section className="af2-section">
        <div className="af2-section-title">
          <h2>One plan, five steps.</h2>
          <p>Each plan runs the same steps in order, and every step streams to the page as it happens, so you can watch the agent work.</p>
        </div>
        <ol className="hl hl-pipeline">
          {STEPS.map(({ icon: Icon, title, text, tone }, i) => (
            <li key={title} className={`hl-pipe ${tone ?? ""}`}>
              <span aria-hidden>
                <Icon size={22} />
              </span>
              <h3>
                {i + 1}. {title}
              </h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="af2-section af2-feature-story">
        <div className="af2-feature-copy">
          <h2>Fan Heat finds the hidden cities.</h2>
          <p>
            Afinlo knows {WORLD_CITIES.length.toLocaleString("en-US")} cities in {Object.keys(COUNTRY_NAMES).length} countries. For each in the tour&apos;s area, Fan
            Heat is the mean affinity of the Qloo heatmap cells within {CITY_RADIUS_KM} km of its centre, scaled against the act&apos;s other cities there: 100 is the
            act&apos;s strongest city. Compare cities within a tour, not across tours.
          </p>
          <ul>
            <li>
              <Check size={17} aria-hidden />A hidden market is a city outside the area&apos;s biggest metros (its ten largest, or a third of its cities with data when
              there are fewer than 30) whose Fan Heat is in the act&apos;s top third, and at least 60, with enough data to trust.
            </li>
            <li>
              <Check size={17} aria-hidden />
              The route takes the best cities by tour score (Fan Heat, weighted three to one against market size on a log scale), keeps at least two hidden markets when
              there are any, never puts two stops within {MIN_GAP_KM} km (a promoter&apos;s radius clause), and orders them to keep travel short. A leg up to{" "}
              {DRIVE_KM} km is a drive, a longer one a flight.
            </li>
            <li>
              <Check size={17} aria-hidden />
              Confidence is high when a city has six or more heatmap cells from the act&apos;s own data, lower with fewer, and never high when the plan is estimated from
              similar acts.
            </li>
          </ul>
        </div>
        <div className="af2-feature-art">
          <figure className="hl hl-art hl-art-map">
            <StaticMap points={ex?.heatPoints} stops={ex ? planStops(ex) : []} width={560} height={400} label={ex ? `${ex.act.name}'s tour of ${ex.area ?? "the United States"}, over Qloo's heatmap` : "World map"} />
          </figure>
        </div>
      </section>

      <section className="af2-section af2-feature-story af2-feature-reverse">
        <div className="af2-feature-copy">
          <h2>Sponsor Fit ranks the brands.</h2>
          <p>
            Sponsor Fit starts from Qloo&apos;s affinity of this audience for each brand, scaled against the other brands, then weighted by brand size: household names ×
            {TIER_WEIGHT.household} (hardest to land, least distinctive), established brands ×{TIER_WEIGHT.established}, niche brands ×{TIER_WEIGHT.niche}.
          </p>
          <ul>
            <li>
              <Check size={17} aria-hidden />
              With categories chosen, only brands carrying those Qloo category tags remain.
            </li>
            <li>
              <Check size={17} aria-hidden />
              Each top brand&apos;s own Qloo heatmap shows where its fans are strongest along the route.
            </li>
            <li>
              <Check size={17} aria-hidden />
              These weights are Afinlo&apos;s judgment, not Qloo&apos;s.
            </li>
          </ul>
        </div>
        <div className="af2-feature-art">
          {sponsorEx?.sponsors.length ? (
            <div className="hl hl-art-stack">
              {sponsorEx.sponsors.slice(0, 3).map((s) => (
                <article key={s.brand.id} className="hl-sponsor">
                  <div className="hl-sponsor-head">
                    <Avatar name={s.brand.name} image={s.brand.image} size={48} fit="contain" />
                    <div style={{ minWidth: 0 }}>
                      <h3>{s.brand.name}</h3>
                      <small>
                        {categoryOf(s.brand.categories) ?? "Brand"} · {TIER[s.tier]}
                      </small>
                    </div>
                    <div className="hl-ring" role="img" aria-label={`Sponsor Fit ${s.fit} of 100`}>
                      <svg viewBox="0 0 58 58">
                        <circle className="track" cx="29" cy="29" r="24" />
                        <circle className="value" cx="29" cy="29" r="24" strokeDasharray={ringDash(s.fit)} />
                      </svg>
                      <b>{s.fit}</b>
                    </div>
                  </div>
                  <ul className="hl-evidence">
                    <li>
                      <TrendingUp size={16} aria-hidden /> The #{s.qlooRank} brand for {sponsorEx.act.name}&apos;s audience in Qloo
                    </li>
                  </ul>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="af2-section">
        <div className="af2-section-title">
          <h2>Every Qloo call.</h2>
          <p>
            A plan takes about 20 to 30 Qloo requests. Each response is cached for 24 hours, and an identical request made within a day reuses the plan, so repeated
            questions don&apos;t spend Qloo&apos;s quota. Each plan&apos;s receipts list every request.
          </p>
        </div>
        <ol className="hl hl-calls">
          {CALLS.map(([step, call, use]) => (
            <li key={step}>
              <h3>{step}</h3>
              <code>{call}</code>
              <p>{use}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="af2-section af2-technology">
        <div>
          <h2>What the AI does, and the checks on it.</h2>
          <p>The writer sees only the scored results and their Qloo IDs. It writes; it never decides what&apos;s in the plan.</p>
        </div>
        <ul>
          <li>
            <b>Every draft is checked.</b>
            <small>A draft is rejected if it names a city or brand outside the plan, or states a money figure or percentage.</small>
          </li>
          <li>
            <b>A rejected draft is replaced.</b>
            <small>A plain template writes the pitch instead, and the plan says so.</small>
          </li>
          <li>
            <b>The planner chooses from fixed lists.</b>
            <small>Turning a message like “only beverage brands” into filters, it can only pick Afinlo&apos;s own categories and cities.</small>
          </li>
          <li>
            <b>When Qloo knows little, Afinlo says so.</b>
            <small>
              An act with no location data of its own is planned from the acts whose audiences overlap most, and labelled “estimated from similar acts”. If that
              isn&apos;t enough either, the plan says Afinlo can&apos;t tell. A Qloo request that fails is shown as failed.
            </small>
          </li>
        </ul>
      </section>

      <section className="af2-section af2-manifesto">
        <div>
          <h2>What Afinlo doesn&apos;t claim.</h2>
        </div>
        <div>
          <p className="af2-big-copy">Fan Heat is taste affinity, not ticket demand.</p>
          <p>
            A sponsor match means the brand&apos;s customers love this act, not that the brand will pay. Demographics describe an audience in aggregate, never a person.
            Afinlo uses no personal data and sends nothing on your behalf.
          </p>
        </div>
      </section>

      <section className="af2-section af2-roadmap">
        <div>
          <h2>Sources.</h2>
        </div>
        <div>
          <p>Taste data: Qloo Taste AI (the hackathon API), through every request in each plan&apos;s receipts.</p>
          <p>Cities: {WORLD_SOURCE.cities}. {WORLD_SOURCE.rule}.</p>
          <p>Market sizes: {WORLD_SOURCE.population}.</p>
          <p>Map: OpenFreeMap vector tiles, from OpenStreetMap data, drawn with MapLibre.</p>
        </div>
      </section>

      <section className="af2-closing">
        <div>
          <h2>
            See it on an act
            <br />
            you know.
          </h2>
          <p>Search an artist or comedian. The plan takes under a minute, and there&apos;s no sign-up.</p>
          <Link className="af2-button" href="/plan">
            Plan a tour
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
        <div className="af2-closing-art">
          <div className="hl-closing-photo">
            <Image src={PHOTOS.planner.src} alt={PHOTOS.planner.alt} fill sizes="(max-width: 700px) 90vw, 420px" />
          </div>
        </div>
      </section>
    </>
  );
}
