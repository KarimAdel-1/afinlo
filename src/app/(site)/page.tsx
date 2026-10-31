import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Dna, Handshake, Map as MapIcon, Plus, Send } from "lucide-react";
import { HeroLines } from "@/components/site/HeroLines";
import "@/components/tour/base.css";
import { HowOnScroll } from "@/components/tour/HowOnScroll";
import { PHOTOS } from "@/components/tour/photos";
import { examplePlans } from "@/platform/tour/store";
import { howStory } from "@/platform/tour/story";

export const metadata: Metadata = {
  title: { absolute: "Afinlo — find your real fans, get paid to reach them" },
  description:
    "Afinlo shows any artist or comedian where their real fans are and which brands those fans love, then drafts the sponsor pitch. Every result comes from Qloo's taste data.",
};

const FAQ = [
  ["Is Fan Heat the same as ticket demand?", "No. Fan Heat is audience taste affinity: where people who love this act over-index, according to Qloo. It's a better starting point for routing and sponsor outreach, which a promoter still validates with ticketing data."],
  ["Where does the data come from?", "Every act, brand, venue and support act comes from Qloo's Taste AI, with its Qloo ID, and where an act's fans are comes from Qloo's heatmap. The cities themselves, and their sizes, are Natural Earth's. Afinlo's own code scores the results; the language model only writes the pitch."],
  ["Does Afinlo use personal data?", "No. Qloo's data is aggregate taste data about audiences, never about individuals, and Afinlo doesn't ask for or store personal information. There's no sign-in."],
  ["What if Qloo knows little about an act?", "Afinlo says so. When an act has no location data of its own, the plan is estimated from acts with overlapping audiences and labelled that way. When there's nothing to go on, it says it can't tell rather than guessing."],
  ["Why not just ask a chatbot?", "A chatbot has no data on where a particular act's fans are, so it tends to name the biggest cities and the best-known brands. Afinlo asks Qloo, which knows what each act's audience loves and where it over-indexes: every venue and brand in a tour carries the Qloo ID it came from, and every city's Fan Heat comes from Qloo's heatmap."],
  ["Can a brand say yes to a pitch?", "Afinlo finds brands whose customers are these fans and drafts the outreach. It doesn't claim a brand will sponsor, and it never sends anything for you."],
] as const;

export default async function HomePage() {
  const examples = await examplePlans().catch(() => []);
  // How it works follows one tour from the search to the outreach.
  const tour = examples.find((e) => e.act.name === "Khruangbin") ?? examples[0];
  const story = tour && (await howStory(tour));

  return (
    <>
      <section className="af2-home-hero">
        <HeroLines />
        <div className="af2-hero-copy">
          <h1>
            Find your real fans.
            <br />
            Get paid to reach them.
          </h1>
          <p>
            Enter an artist or comedian. Afinlo finds the cities where their audience over-indexes and the brands those fans already love, then drafts the
            sponsor pitch. Every result comes from Qloo&apos;s taste data.
          </p>
          <div className="af2-hero-actions">
            <Link className="af2-button" href="/plan">
              Plan a tour
              <ArrowRight size={18} aria-hidden />
            </Link>
            {/* Down to the section below when it's there; it needs the example tours. */}
            <a className="af2-button af2-button-secondary" href={story ? "#how-it-works" : "/how-it-works"}>
              How it works
            </a>
          </div>
        </div>
      </section>

      <section className="af2-section af2-bento-section">
        <div className="af2-section-title">
          <h2>
            A few Qloo signals.
            <br />A whole tour of possibility.
          </h2>
        </div>
        <div className="af2-bento">
          <article className="af2-bento-build">
            <Dna size={32} />
            <div>
              <h3>Know the crowd.</h3>
              <p>Fan DNA: the audience&apos;s taste, its age and gender skew, and what these fans love in film, TV, podcasts and books.</p>
            </div>
          </article>
          <article className="af2-bento-connect">
            <MapIcon size={32} />
            <div>
              <h3>Find the hidden cities.</h3>
              <p>Fan Heat scores the cities of any country or region by where the audience over-indexes, so a strong mid-size city can beat a lukewarm giant.</p>
            </div>
          </article>
          <div className="af2-bento-portrait">
            <Image src={PHOTOS.portrait.src} alt={PHOTOS.portrait.alt} fill sizes="(max-width: 700px) 50vw, 280px" />
          </div>
          <div className="af2-bento-life">
            <Image src={PHOTOS.fan.src} alt={PHOTOS.fan.alt} fill sizes="(max-width: 700px) 50vw, 230px" />
          </div>
          <article className="af2-bento-learn">
            <Handshake size={30} />
            <div>
              <h3>Pitch the right brands.</h3>
              <p>Brands these fans already love, with the evidence a sponsor wants to see.</p>
            </div>
          </article>
          <article className="af2-bento-control">
            <Send size={30} />
            <div>
              <h3>Send it today.</h3>
              <p>A one-pager and an email for each sponsor, drafted from Qloo&apos;s results.</p>
            </div>
          </article>
        </div>
      </section>

      {tour && story && (
        <section className="af2-section" id="how-it-works">
          <div className="af2-section-title">
            <h2>How it works.</h2>
            <p>
              Follow one tour, {story.actName}&apos;s in {story.area}, from the search to the outreach.
            </p>
          </div>
          <HowOnScroll
            story={story}
            steps={[
              { title: "Name the act.", text: "Search any artist or comedian, and confirm the match from Qloo. Not in Qloo yet? Name two or three acts like them, and the tour is planned from their fans and labelled as predicted." },
              { title: "See where the fans are.", text: "Qloo's heatmap scores every city in the area by how strongly this act's fans stand out: its Fan Heat. Strong cities outside the biggest metros are hidden markets." },
              {
                title: "Get the route.",
                text: `The best cities by Fan Heat and market size, ordered to keep travel short.${tour.proof ? ` Here, Fan Heat ${tour.proof.route} on the route, against ${tour.proof.biggest} in the ${tour.proof.biggestCities.length} biggest cities.` : ""}`,
              },
              { title: "Book the venues.", text: "In each city, the music venues or comedy clubs these fans love, each with a drafted hold request and where it stands." },
              { title: "Fund the tour.", text: "The brands these fans love, ranked by Sponsor Fit, each with its evidence and a drafted pitch. Afinlo never sends anything for you." },
              { title: "Ask your tour team.", text: "A manager and four specialists work from the tour's data. They explain why a city is on the route, propose changes you apply in a click, and draft the outreach." },
            ]}
          />
        </section>
      )}

      <section className="af2-section af2-editorial">
        <div className="af2-editorial-photo">
          <Image src={PHOTOS.editorial.src} alt={PHOTOS.editorial.alt} fill sizes="(max-width: 700px) 90vw, 550px" />
          <span>Plan around the people who already love you.</span>
        </div>
        <div className="af2-editorial-copy">
          <h2>
            Different acts.
            <br />
            Different fans.
            <br />
            One first step.
          </h2>
          <p>Whoever books the tour or pitches the sponsor, the first step is the same: know where the fans are, and what they already love.</p>
          <div className="af2-use-list">
            {["Comedians and indie artists", "Booking agents and managers", "Promoters and venues", "Brands and sponsors"].map((who, i) => (
              <Link href="/plan" key={who}>
                <span>0{i + 1}</span>
                {who}
                <ArrowRight size={18} />
              </Link>
            ))}
          </div>
          <Link className="af2-text-link" href="/how-it-works">
            See how it works
            <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <section className="af2-section af2-start-band">
        <div>
          <h2>
            Bring the act.
            <br />
            We&apos;ll find the fans.
          </h2>
        </div>
        <div>
          <p>Search an artist or comedian, confirm the match, and watch the agent work. A plan takes under a minute, and there&apos;s no sign-up.</p>
          <Link href="/plan" className="af2-text-link">
            Plan a tour
            <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <section className="af2-section af2-faq" id="faq">
        <h2>What the numbers mean, and what they don&apos;t.</h2>
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>
              {q}
              <Plus size={20} aria-hidden />
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
    </>
  );
}
