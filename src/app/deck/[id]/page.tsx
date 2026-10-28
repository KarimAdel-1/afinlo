import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, MapPin, TrendingUp } from "lucide-react";
import { Avatar } from "@/components/tour/Avatar";
import { planStops, StaticMap } from "@/components/tour/StaticMap";
import { people } from "@/components/tour/format";
import { PrintButton } from "@/components/tour/PrintButton";
import { categoryOf, ringDash, TIER } from "@/components/tour/sponsors";
import "@/components/tour/base.css";
import "@/components/tour/deck.css";
import { placeOf } from "@/core/tour/regions";
import type { Plan } from "@/core/tour/types";
import { getPlan } from "@/platform/tour/store";

export async function generateMetadata({ params }: PageProps<"/deck/[id]">): Promise<Metadata> {
  const plan = await getPlan((await params).id);
  return { title: plan ? `${plan.act.name} · Pitch deck` : "Deck not found", robots: { index: false } };
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const PAGES = 5;

function PageFoot({ plan, n }: { plan: Plan; n: number }) {
  return (
    <footer className="deck-foot">
      <span>
        {plan.act.name} · Tour partnership · {DATE.format(new Date(plan.createdAt))}
      </span>
      <span>
        {n} / {PAGES}
      </span>
    </footer>
  );
}

/**
 * A plan as a sponsor pitch deck: five A4 landscape pages, made to be sent to a brand. The server prints this page to
 * PDF (src/platform/tour/pdf.ts); it can also be printed from the browser.
 */
export default async function DeckPage({ params }: PageProps<"/deck/[id]">) {
  const plan = await getPlan((await params).id);
  if (!plan) notFound();
  const city = (id: string) => plan.cities.find((c) => c.id === id);
  const route = plan.route.flatMap((r) => {
    const c = city(r.cityId);
    return c ? [{ ...c, legKm: r.legKm }] : [];
  });
  const hiddenOnRoute = route.filter((c) => c.hidden).length;
  const totalKm = plan.route.reduce((s, r) => s + r.legKm, 0);

  return (
    <div className="hl deck">
      <div className="deck-bar">
        <Link className="hl-button hl-button-quiet hl-button-small" href={`/tour/${plan.id}`}>
          <ArrowLeft size={15} aria-hidden /> Back to the tour
        </Link>
        <div className="deck-bar-actions">
          <PrintButton />
          <a className="hl-button hl-button-small" href={`/api/tour/plan/${plan.id}/pdf`}>
            <Download size={15} aria-hidden /> Download PDF
          </a>
        </div>
      </div>

      <div className="deck-pages">
        <section className="deck-page deck-cover">
          <div className="deck-cover-copy">
            <Avatar name={plan.act.name} image={plan.act.image} size={128} />
            <h1>{plan.act.name}</h1>
            <p className="deck-headline">{plan.pitch.headline}</p>
            <ul className="deck-facts">
              <li>
                <b>{route.length}</b> cities
              </li>
              <li>
                <b>{hiddenOnRoute}</b> hidden {hiddenOnRoute === 1 ? "market" : "markets"}
              </li>
              <li>
                <b>{totalKm.toLocaleString("en-US")}</b> km
              </li>
            </ul>
          </div>
          <div className="deck-cover-map">
            <StaticMap points={plan.heatPoints} stops={planStops(plan)} width={620} height={440} label={`Where ${plan.act.name}'s fans are, with the tour's stops`} />
          </div>
          <PageFoot plan={plan} n={1} />
        </section>

        <section className="deck-page">
          <h2>The audience</h2>
          <p className="deck-lead">{plan.pitch.audience}</p>
          <div className="deck-cols">
            <div>
              <h3>Their taste</h3>
              <div className="hl-tags">
                {plan.fanDna.tags.slice(0, 10).map((t) => (
                  <span key={t.id} className="hl-chip">
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h3>Age, against Qloo&apos;s average audience</h3>
              {plan.fanDna.demographics ? (
                <div className="hl-skews">
                  {plan.fanDna.demographics.age.map((a) => (
                    <div className="hl-skew" key={a.band}>
                      <span>{a.band}</span>
                      <span className="hl-skew-track" aria-hidden>
                        <span className={a.skew < 0 ? "neg" : ""} style={a.skew >= 0 ? { left: "50%", width: `${Math.min(50, a.skew * 50)}%` } : { right: "50%", width: `${Math.min(50, -a.skew * 50)}%` }} />
                      </span>
                      <b>
                        {a.skew > 0 ? "+" : ""}
                        {a.skew.toFixed(2)}
                      </b>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hl-hint">Qloo returned no demographics for this audience.</p>
              )}
            </div>
            <div>
              <h3>What they also love</h3>
              <ul className="deck-loves">
                {plan.fanDna.loves.map((l) => (
                  <li key={l.label}>
                    <small>{l.label}</small>
                    <b>{l.entity.name}</b>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <PageFoot plan={plan} n={2} />
        </section>

        <section className="deck-page">
          <h2>Where the fans are</h2>
          <p className="deck-lead">{plan.pitch.markets}</p>
          <ol className="deck-route">
            {route.map((c, i) => (
              <li key={c.id}>
                <span className={c.hidden ? "lime" : ""}>{i + 1}</span>
                <div>
                  <b>
                    {placeOf(c)}
                  </b>
                  <small>
                    Fan Heat {c.heat} · metro {people(c.population)}
                    {c.hidden ? " · hidden market" : ""}
                  </small>
                  <div className={`hl-bar ${c.hidden ? "lime" : ""}`}>
                    <span style={{ width: `${Math.max(4, c.heat)}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="deck-note">
            Fan Heat is where this audience over-indexes, from Qloo&apos;s heatmap: 100 is the act&apos;s strongest city. Hidden markets are strong cities outside the 10
            largest US metros.
          </p>
          <PageFoot plan={plan} n={3} />
        </section>

        <section className="deck-page">
          <h2>Brands these fans already love</h2>
          <p className="deck-lead">The brands Qloo finds this audience over-indexes for, the company a partner would be in.</p>
          <div className="deck-brands">
            {plan.sponsors.slice(0, 6).map((s) => (
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
                    <TrendingUp size={16} aria-hidden /> The #{s.qlooRank} brand for this audience in Qloo
                  </li>
                  {!!s.strongestIn.length && (
                    <li>
                      <MapPin size={16} aria-hidden /> Its own fans are strongest in{" "}
                      {s.strongestIn
                        .map((id) => city(id)?.name)
                        .filter(Boolean)
                        .join(" and ")}
                    </li>
                  )}
                </ul>
              </article>
            ))}
          </div>
          <PageFoot plan={plan} n={4} />
        </section>

        <section className="deck-page deck-ask">
          <h2>The partnership</h2>
          {plan.pitch.ask && <p className="deck-lead">{plan.pitch.ask}</p>}
          <div className="deck-cols deck-cols-2">
            <div>
              <h3>The tour</h3>
              <p>{plan.pitch.tourBrief}</p>
            </div>
            {!!plan.supportActs.length && (
              <div>
                <h3>On the bill</h3>
                <ul className="hl-openers">
                  {plan.supportActs.slice(0, 3).map((s) => (
                    <li key={s.act.id}>
                      <Avatar name={s.act.name} image={s.act.image} size={48} />
                      <div style={{ minWidth: 0 }}>
                        <b>{s.act.name}</b>
                        <small>{s.shared.length ? `Both crowds like ${s.shared.join(", ")}` : "An overlapping audience"}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <p className="deck-close">Let&apos;s talk about what a partnership on this tour could look like.</p>
          <p className="deck-note">
            Audience data from Qloo&apos;s taste AI, about the audience as a whole and never a person. Fan Heat is taste affinity, not ticket demand. The brands listed are
            brands this audience loves, not partners. Made with Afinlo.
          </p>
          <PageFoot plan={plan} n={5} />
        </section>
      </div>
    </div>
  );
}
