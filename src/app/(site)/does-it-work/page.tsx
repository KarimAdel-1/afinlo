import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import "@/components/tour/base.css";
import { PHOTOS } from "@/components/tour/photos";
import { planStops, StaticMap } from "@/components/tour/StaticMap";
import { examplePlans } from "@/platform/tour/store";

export const metadata: Metadata = {
  title: "Does it work?",
  description: "The evidence behind Afinlo: what it can't do without Qloo, how specific its plans are, and a backtest against public listener data.",
};

interface Backtest {
  generatedAt: string;
  method: string;
  // `recorded` is every city written down (a miss when it can't be matched); older results called the matched ones `actual`.
  acts: { act: string; source: string; checkedAt: string; recorded?: string[]; actual?: string[]; afinlo: string[]; baseline?: string[]; afinloHits: number; baselineHits?: number }[];
  summary: { acts: number; afinloHitRate: number; baselineHitRate?: number };
}

function backtest(): Backtest | undefined {
  const file = path.join(process.cwd(), "docs/evaluation/backtest-results.json");
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Backtest;
  } catch {
    return undefined;
  }
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

const METHOD = [
  ["Record the real cities", "For 10 acts, note the top cities on their public streaming profile, with the source and date, before running anything."],
  ["Ask Afinlo", "Take each act's top 10 cities by fan base: Fan Heat weighted by market size."],
  ["Take the biggest cities", "What a booker with no taste data would play: the 10 biggest cities, the same for every act."],
  ["Publish both", "Count how many of each act's real top 5 US cities appear in each top 10, whatever the numbers are."],
];

export default async function DoesItWork() {
  const examples = await examplePlans().catch(() => []);
  // How alike are different acts' routes? The share of route cities two plans have in common, averaged over pairs.
  const routes = examples.map((e) => new Set(e.route.map((r) => r.cityId)));
  const pairs: number[] = [];
  for (let i = 0; i < routes.length; i++)
    for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i],
        b = routes[j];
      const shared = [...a].filter((id) => b.has(id)).length;
      pairs.push(shared / new Set([...a, ...b]).size);
    }
  const overlap = pairs.length ? pairs.reduce((s, v) => s + v, 0) / pairs.length : undefined;
  const hiddenShare = examples.length ? examples.reduce((s, e) => s + e.route.filter((r) => e.cities.find((c) => c.id === r.cityId)?.hidden).length / Math.max(1, e.route.length), 0) / examples.length : undefined;
  const requests = examples.length ? Math.round(examples.reduce((s, e) => s + e.traces.length, 0) / examples.length) : undefined;
  const results = backtest();

  return (
    <>
      <section className="af2-simple-hero af2-process-hero">
        <h1>
          The evidence, including
          <br />
          what isn&apos;t proven yet.
        </h1>
        <p>
          The hackathon asks for two things: that the product doesn&apos;t work without Qloo, and that Qloo makes it better than a generic AI. Here is what we can show
          for each, and how we measured it.
        </p>
      </section>

      <section className="af2-section af2-manifesto">
        <div>
          <h2>Without Qloo, there is no plan.</h2>
        </div>
        <div>
          <p className="af2-big-copy">Every brand, venue and support act in a plan comes from a Qloo response, with its Qloo ID, and every city&apos;s Fan Heat from Qloo&apos;s heatmap.</p>
          <p>
            Each plan lists the requests behind it. If Qloo doesn&apos;t answer, Afinlo shows no cities or sponsors rather than asking the language model to fill in.
            The model only writes the pitch from what Qloo returned, and its draft is checked against the plan.
          </p>
        </div>
      </section>

      <section className="af2-section">
        <div className="af2-section-title">
          <h2>Every act gets its own map.</h2>
          <p>
            {examples.length
              ? `Measured live from the ${examples.length} example tours on this site, across ${new Set(examples.map((e) => e.area)).size} parts of the world.`
              : "Measured from the example tours once they've been made."}
          </p>
        </div>
        <div className="hl hl-proofs">
          <div className="hl-proof blue">
            <strong>{overlap !== undefined ? pct(overlap) : "—"}</strong>
            <h3>of route cities in common</h3>
            <p>On average, between two different acts&apos; tours.</p>
          </div>
          <div className="hl-proof lime">
            <strong>{hiddenShare !== undefined ? pct(hiddenShare) : "—"}</strong>
            <h3>of tour stops are hidden markets</h3>
            <p>Strong cities outside each area&apos;s biggest metros.</p>
          </div>
          <div className="hl-proof">
            <strong>{requests ?? "—"}</strong>
            <h3>Qloo requests behind each plan</h3>
            <p>On average. Each plan&apos;s receipts list every one.</p>
          </div>
        </div>
        {examples.length > 1 && (
          <div className="hl hl-minimaps" style={{ marginTop: 16 }}>
            {examples.slice(0, 4).map((e) => (
              <Link key={e.id} className="hl-minimap" href={`/tour/${e.id}`}>
                <b>
                  {e.act.name}
                  <span>
                    Open the tour <ArrowRight size={14} aria-hidden />
                  </span>
                </b>
                <StaticMap points={e.heatPoints} stops={planStops(e)} width={420} height={270} numbered={false} label={`${e.act.name}'s tour of ${e.area ?? "the United States"}, over Qloo's heatmap`} />
                {e.proof && (
                  <small>
                    Fan Heat {e.proof.route} on the route · {e.proof.biggest} in the {e.proof.biggestCities.length} biggest cities
                  </small>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="af2-section">
        <div className="af2-section-title">
          <h2>Backtest against where people actually listen.</h2>
          <p>The method is fixed before anything runs, and both numbers are published, whatever they are.</p>
        </div>
        <ol className="hl hl-steps4">
          {METHOD.map(([title, text], i) => (
            <li key={title}>
              <span aria-hidden>{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
        {results ? (
          <>
            <div className="hl hl-proofs" style={{ marginTop: 16 }}>
              <div className="hl-proof blue">
                <strong>{pct(results.summary.afinloHitRate)}</strong>
                <h3>Afinlo</h3>
                <p>of the real top-5 cities found in its top 10.</p>
              </div>
              <div className="hl-proof">
                <strong>{results.summary.baselineHitRate !== undefined ? pct(results.summary.baselineHitRate) : "—"}</strong>
                <h3>Biggest cities</h3>
                <p>The same measure, with no Qloo data.</p>
              </div>
              <div className="hl-proof lime">
                <strong>{results.summary.acts}</strong>
                <h3>acts measured</h3>
                <p>On {results.generatedAt.slice(0, 10)}.</p>
              </div>
            </div>
            <div className="hl hl-result-table">
              <div className="hl-table">
                <table>
                  <thead>
                    <tr>
                      <th>Act</th>
                      <th>Real top cities (source)</th>
                      <th>Afinlo</th>
                      <th>Biggest cities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.acts.map((a) => (
                      <tr key={a.act}>
                        <td>{a.act}</td>
                        <td>
                          {(a.recorded ?? a.actual ?? []).join(", ")}
                          <br />
                          {a.source}, {a.checkedAt}
                        </td>
                        <td>
                          {a.afinloHits} of {(a.recorded ?? a.actual ?? []).length}
                        </td>
                        <td>{a.baselineHits !== undefined ? `${a.baselineHits} of ${(a.recorded ?? a.actual ?? []).length}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hl-hint">{results.method}</p>
            </div>
          </>
        ) : (
          <div className="hl hl-pending">
            <Clock size={26} aria-hidden />
            <div>
              <b>Not measured yet.</b>
              <p>
                The backtest needs the listener cities collected by hand from public profiles (no scraping). Until they&apos;re in, there is no number here, and we
                won&apos;t publish one we didn&apos;t measure.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="af2-section af2-technology">
        <div>
          <h2>What this doesn&apos;t show.</h2>
          <p>The limits of the evidence, stated plainly.</p>
        </div>
        <ul>
          <li>
            <b>Fan Heat is taste affinity, not ticket sales.</b>
            <small>A promoter still validates a route with ticketing data.</small>
          </li>
          <li>
            <b>A sponsor match isn&apos;t a sponsorship.</b>
            <small>It means a brand&apos;s customers love the act, not that the brand will pay.</small>
          </li>
          <li>
            <b>Streaming cities favour the biggest metros.</b>
            <small>So the backtest tests the fan-base ranking, not hidden markets.</small>
          </li>
          <li>
            <b>A handful of acts is a pilot.</b>
            <small>It isn&apos;t proof for every act. Some acts have little Qloo data, and their plans are labelled.</small>
          </li>
        </ul>
      </section>

      <section className="af2-closing">
        <div>
          <h2>
            Try it on an act
            <br />
            you know.
          </h2>
          <p>You know where your favourite act&apos;s fans are. See whether Afinlo agrees.</p>
          <Link className="af2-button" href="/plan">
            Plan a tour
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
        <div className="af2-closing-art">
          <div className="hl-closing-photo">
            <Image src={PHOTOS.fan.src} alt={PHOTOS.fan.alt} fill sizes="(max-width: 700px) 90vw, 420px" />
          </div>
        </div>
      </section>
    </>
  );
}
