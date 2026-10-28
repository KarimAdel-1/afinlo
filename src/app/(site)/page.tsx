import type { Metadata } from "next";
import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Dna, Handshake, Map as MapIcon, MapPin, Plus, Search, Send, Sparkles } from "lucide-react";
import "@/components/tour/base.css";
import { PHOTOS } from "@/components/tour/photos";
import { planStops, StaticMap } from "@/components/tour/StaticMap";
import { examplePlans } from "@/platform/tour/store";

export const metadata: Metadata = {
  title: { absolute: "Afinlo — find your real fans, get paid to reach them" },
  description:
    "Afinlo shows any artist or comedian where their real fans are and which brands those fans love, then drafts the sponsor pitch. Every result comes from Qloo's taste data.",
};

const FAQ = [
  ["Is Fan Heat the same as ticket demand?", "No. Fan Heat is audience taste affinity: where people who love this act over-index, according to Qloo. It's a better starting point for routing and sponsor outreach, which a promoter still validates with ticketing data."],
  ["Where does the data come from?", "Every act, city, brand, venue and support act comes from Qloo's Taste AI, with its Qloo ID. City sizes are Natural Earth metro estimates. Afinlo's own code scores the results; the language model only writes the pitch."],
  ["Does Afinlo use personal data?", "No. Qloo's data is aggregate taste data about audiences, never about individuals, and Afinlo doesn't ask for or store personal information. There's no sign-in."],
  ["What if Qloo knows little about an act?", "Afinlo says so. When an act has no location data of its own, the plan is estimated from acts with overlapping audiences and labelled that way. When there's nothing to go on, it says it can't tell rather than guessing."],
  ["Why not just ask a chatbot?", "A chatbot has no data on where a particular act's fans are, so it tends to name the biggest cities and the best-known brands. Afinlo asks Qloo, which knows what each act's audience loves and where it over-indexes: every city, venue and brand in a tour carries the Qloo ID it came from."],
  ["Can a brand say yes to a pitch?", "Afinlo finds brands whose customers are these fans and drafts the outreach. It doesn't claim a brand will sponsor, and it never sends anything for you."],
] as const;

export default async function HomePage() {
  const examples = await examplePlans().catch(() => []);
  const hero = examples[0];
  // The hero shows the first example; the grid shows the others when there are enough.
  const grid = examples.length > 4 ? examples.slice(1, 5) : examples.slice(0, 4);

  return (
    <>
      <section className="af2-home-hero">
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
          <div className="hl hl-home-search">
            <Form action="/plan" role="search">
              <Search size={20} aria-hidden />
              <label htmlFor="hl-home-act" className="hl-visually-hidden">
                An artist or comedian
              </label>
              <input id="hl-home-act" name="q" placeholder="An artist or comedian" autoComplete="off" maxLength={80} minLength={2} required />
              <button className="hl-button" type="submit">
                <span>Plan a tour</span>
                <ArrowRight size={18} aria-hidden />
              </button>
            </Form>
            {!!examples.length && (
              <div className="hl-picks">
                {examples.map((e) => (
                  <Link key={e.id} className="hl-pick" href={`/tour/${e.id}`}>
                    <i className={e.act.comedian ? "comic" : ""} aria-hidden />
                    {e.act.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="af2-hero-stage">
          <div className="af2-hero-note af2-hero-note-left">
            <MapPin size={21} />
            <span>
              <b>Where the fans really are.</b>
              <small>Hidden markets, city by city.</small>
            </span>
          </div>
          <div className="hl hl-hero-map">
            <StaticMap points={hero?.heatPoints} stops={hero ? planStops(hero) : []} width={640} height={420} label={hero ? `${hero.act.name}'s tour of ${hero.area ?? "the United States"}, over Qloo's heatmap of the fans` : "World map"} />
          </div>
          <div className="af2-hero-note af2-hero-note-right">
            <Sparkles size={21} />
            <span>
              <b>Who will want to sponsor.</b>
              <small>Brands these fans already love.</small>
            </span>
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

      {grid.length > 1 && (
        <section className="af2-section">
          <div className="af2-section-title">
            <h2>Every act gets its own map.</h2>
            <p>The same question, asked for different acts. These are real Afinlo plans, straight from Qloo&apos;s data.</p>
          </div>
          <div className="hl hl-minimaps">
            {grid.map((e) => (
              <Link key={e.id} className="hl-minimap" href={`/tour/${e.id}`}>
                <b>
                  {e.act.name}
                  <span>
                    Open the tour <ArrowRight size={14} aria-hidden />
                  </span>
                </b>
                <StaticMap points={e.heatPoints} stops={planStops(e)} width={420} height={270} numbered={false} label={`${e.act.name}'s tour of ${e.area ?? "the United States"}, over Qloo's heatmap`} />
              </Link>
            ))}
          </div>
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
