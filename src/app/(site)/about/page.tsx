import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import "@/components/tour/base.css";
import { PHOTOS } from "@/components/tour/photos";

export const metadata: Metadata = {
  title: "About",
  description: "Afinlo is a tour and sponsorship agent, built for the Qloo Agentic Hackathon.",
};

export default function AboutPage() {
  return (
    <>
      <section className="af2-simple-hero af2-about-hero">
        <h1>
          Agents that know
          <br />
          what people love.
        </h1>
        <p>
          Independent musicians and comedians often choose tour cities by instinct, and pitch the same handful of famous brands as everyone else. Their real fans, and
          the brands those fans already love, are often somewhere else.
        </p>
        <Link className="af2-button" href="/plan">
          Plan a tour
          <ArrowRight size={16} aria-hidden />
        </Link>
      </section>

      <section className="af2-section af2-manifesto">
        <div>
          <h2>
            Afinlo
            <br />
            finds them.
          </h2>
        </div>
        <div>
          <p className="af2-big-copy">An AI agent that reads an act&apos;s audience through Qloo&apos;s Taste AI, and turns it into a tour route and a sponsor pitch.</p>
          <p>
            Where the fans over-index, what else they love, which brands they buy: Qloo answers each question, and Afinlo turns the answers into a plan a manager can
            send the same day.
          </p>
        </div>
      </section>

      <section className="af2-section af2-about-photo">
        <Image src={PHOTOS.team.src} alt={PHOTOS.team.alt} fill sizes="(max-width: 700px) 100vw, 1080px" />
        <div>
          <h2>
            Made for the people
            <br />
            who put on the show.
          </h2>
          <p>The acts on the road, and everyone who books, routes and pays for the tour.</p>
        </div>
      </section>

      <section className="af2-section af2-use-principles">
        {[
          ["01", "Promoters and venues.", "They lose money on a show in the wrong city. Fan Heat shows where an act's audience over-indexes."],
          ["02", "Booking agents and managers.", "Sponsor outreach is slow, manual and generic. The pitch pack drafts the one-pager and the emails."],
          ["03", "Comedians and independent artists.", "They tour constantly and rarely have data on where their fans are. Afinlo maps it from Qloo."],
        ].map(([n, title, text]) => (
          <article key={n}>
            <span>{n}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <section className="af2-section af2-roadmap">
        <div>
          <h2>How it&apos;s built.</h2>
        </div>
        <div>
          <p>
            Afinlo is an agent grounded in real cultural data: a LangGraph graph that calls Qloo&apos;s API for every result,
            scores the results in plain code, and uses a language model only to write the pitch and to turn a typed change into new filters. The source is open under the Apache 2.0 licence.
          </p>
          <p>
            It was built in October 2026 for the{" "}
            <a href="https://qloo.devpost.com" target="_blank" rel="noopener noreferrer" className="af2-text-link">
              Qloo Agentic Hackathon
            </a>
            , whose challenge is agents that only work because they know what people love. Afinlo is independent: it uses Qloo&apos;s API, and it isn&apos;t a Qloo
            product.
          </p>
        </div>
      </section>

      <section className="af2-section af2-roadmap">
        <div>
          <h2>Data and privacy.</h2>
        </div>
        <div>
          <p>
            Qloo&apos;s data is aggregate taste data about audiences. Afinlo doesn&apos;t ask for, infer or store anything about individuals, there&apos;s no sign-in, and it
            never contacts a brand for you.
          </p>
          <p>Plans are saved so their link can be shared, and can be reached only by that link.</p>
        </div>
      </section>

      <section className="af2-closing">
        <div>
          <h2>
            Bring the act.
            <br />
            We&apos;ll find the fans.
          </h2>
          <p>Search an artist or comedian. The plan takes under a minute, and there&apos;s no sign-up.</p>
          <Link className="af2-button" href="/plan">
            Plan a tour
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
        <div className="af2-closing-art">
          <div className="hl-closing-photo">
            <Image src={PHOTOS.meeting.src} alt={PHOTOS.meeting.alt} fill sizes="(max-width: 700px) 90vw, 420px" />
          </div>
        </div>
      </section>
    </>
  );
}
