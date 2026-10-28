import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, Database, Layers, Route, Users } from "lucide-react";
import { Avatar } from "@/components/tour/Avatar";
import { CopyLink } from "@/components/tour/CopyLink";
import { FanMap, MapLegend } from "@/components/tour/FanMap";
import { seconds } from "@/components/tour/format";
import { Receipts } from "@/components/tour/Receipts";
import { Stat } from "@/components/tour/Stat";
import "@/components/tour/base.css";
import type { Act, PairCity, Pairing } from "@/core/tour/types";
import { landTiles, mapCities } from "@/platform/tour/map";
import { getMatch } from "@/platform/tour/store";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The markets one act carries in a pairing, with its Fan Heat in each. */
function Brings({ act, cities, heat }: { act: Act; cities: PairCity[]; heat: (c: PairCity) => number }) {
  return (
    <div>
      <b>
        <Avatar name={act.name} image={act.image} size={32} /> {act.name}
      </b>
      <p>{cities.length ? cities.map((c) => `${c.name} ${heat(c)}`).join(" · ") : "No market of its own here: the two are strong in the same places."}</p>
    </div>
  );
}

export async function generateMetadata({ params }: PageProps<"/co-headline/[id]">): Promise<Metadata> {
  const pair = await getMatch<Pairing>("pair", (await params).id);
  return pair
    ? { title: `${pair.a.name} + ${pair.b.name} · Double bill`, description: `Where ${pair.a.name}'s and ${pair.b.name}'s audiences are both strong, from Qloo.`, robots: { index: false } }
    : { title: "Not found", robots: { index: false } };
}

export default async function PairingPage({ params }: PageProps<"/co-headline/[id]">) {
  const pair = await getMatch<Pairing>("pair", (await params).id);
  if (!pair) notFound();
  const { a, b } = pair;
  const city = (id: string) => pair.cities.find((c) => c.id === id);
  const stopOf = new Map(pair.route.map((r, i) => [r.cityId, i + 1]));
  const both = pair.cities.filter((c) => c.a >= 60 && c.b >= 60);
  const best = pair.cities[0];
  const totalKm = pair.route.reduce((s, r) => s + r.legKm, 0);
  // Who carries which market: strong for one act and not the other.
  const brings = (mine: (c: PairCity) => number, theirs: (c: PairCity) => number) =>
    pair.cities
      .filter((c) => mine(c) >= 70 && theirs(c) < 50)
      .sort((x, y) => mine(y) - mine(x))
      .slice(0, 4);
  const aBrings = brings((c) => c.a, (c) => c.b),
    bBrings = brings((c) => c.b, (c) => c.a);

  return (
    <div className="hl hl-result">
      <header className="hl-result-hero">
        <div className="hl-result-id">
          <span className="hl-pair-tiles">
            <Avatar name={a.name} image={a.image} size={84} />
            <Avatar name={b.name} image={b.image} size={84} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h1>
              {a.name} + {b.name}
            </h1>
            <p>A double bill from both audiences&apos; Qloo data: where they&apos;re strong together, what the two crowds share, and the route.</p>
            <div className="hl-chipline">
              <span className="hl-chip hl-chip-blue">Map overlap {pct(pair.overlap)}</span>
              <span className="hl-chip">
                {both.length} {both.length === 1 ? "city" : "cities"} strong for both
              </span>
              <span className="hl-chip">{pair.request.stops}-city double bill</span>
              {pair.example && <span className="hl-chip hl-chip-blue">Example</span>}
            </div>
          </div>
        </div>
        <div className="hl-actions">
          <CopyLink />
          <Link className="hl-button hl-button-quiet hl-button-small" href={`/plan?act=${a.id}`}>
            Plan {a.name}&apos;s tour
          </Link>
          <Link className="hl-button hl-button-quiet hl-button-small" href={`/plan?act=${b.id}`}>
            Plan {b.name}&apos;s tour
          </Link>
          <Link className="hl-button hl-button-small" href="/co-headline">
            Another pairing <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </header>

      {!!pair.notes.length && (
        <div className="hl-notes">
          {pair.notes.map((n) => (
            <p className="hl-note" key={n}>
              <AlertTriangle size={16} aria-hidden /> {n}
            </p>
          ))}
        </div>
      )}

      <section className="hl-dash" aria-labelledby="hl-pair-title">
        <div className="hl-dash-side">
          <h2 id="hl-pair-title">Where both crowds are</h2>
          <p className="hl-dash-sub">Both acts&apos; Qloo heatmaps: the darkest tiles are strong for both.</p>
          {best && (
            <div className="hl-dash-big">
              <span>Best city together</span>
              <strong>{best.name}</strong>
              <p>
                {a.name} {best.a} · {b.name} {best.b}
              </p>
            </div>
          )}
          <ul className="hl-dash-stats">
            <Stat icon={Users} color="#4336ff" label="Strong for both (Fan Heat 60+)">
              {both.length ? `${both.length} · ${both.slice(0, 2).map((c) => c.name).join(", ")}` : "None"}
            </Stat>
            <Stat icon={Layers} color="#ff4f7e" label="Map overlap">
              {pct(pair.overlap)} of their strong cities
            </Stat>
            <Stat icon={Route} color="#ff7a45" label="Double-bill route">
              {pair.route.length} cities · {totalKm.toLocaleString("en-US")} km
            </Stat>
            <Stat icon={Database} color="#262a3f" label="Qloo requests">
              {pair.traces.length} · {seconds(pair.durationMs)}
            </Stat>
          </ul>
        </div>
        <div className="hl-dash-map">
          {pair.cities.length ? (
            <>
              <FanMap tiles={landTiles().tiles} heat={pair.heat} cities={mapCities(pair)} label={`Where ${a.name}'s and ${b.name}'s audiences are both strong`} />
              <MapLegend />
            </>
          ) : (
            <p className="hl-hint">There are no cities both acts have Qloo data for, so there&apos;s no shared map. Afinlo doesn&apos;t guess.</p>
          )}
        </div>
      </section>

      {!!pair.cities.length && (
        <section className="hl-block" aria-labelledby="hl-together-title">
          <div className="hl-block-head">
            <div>
              <h2 id="hl-together-title">Best cities for the double bill</h2>
              <p>
                Each act&apos;s Fan Heat, and the two together: a city scores high only when both crowds are strong there. Numbered cities are on the route.
              </p>
            </div>
            <div className="hl-pair-key" aria-hidden>
              <span className="a" /> {a.name}
              <span className="b" /> {b.name}
            </div>
          </div>
          <ol className="hl-rank">
            {pair.cities.slice(0, 12).map((c, i) => (
              <li key={c.id}>
                <span className="hl-rank-n">{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <span className="hl-rank-name">
                    <em>
                      {c.name}, {c.state}
                    </em>
                    {stopOf.has(c.id) && <span className={`hl-badge ${c.hidden ? "lime" : ""}`}>{stopOf.get(c.id)}</span>}
                    {c.hidden && <span className="hl-mini lime">Hidden market</span>}
                  </span>
                  <div className="hl-pairbars" title={`${a.name} ${c.a}, ${b.name} ${c.b}`}>
                    <span className="a" style={{ width: `${Math.max(3, c.a)}%` }} />
                    <span className="b" style={{ width: `${Math.max(3, c.b)}%` }} />
                  </div>
                </div>
                <span className="hl-rank-heat">{c.heat}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="hl-two">
        <section className="hl-block" aria-labelledby="hl-share-title">
          <div className="hl-block-head">
            <div>
              <h2 id="hl-share-title">What the crowds share</h2>
              <p>Taste both audiences over-index for, from Qloo&apos;s compare.</p>
            </div>
          </div>
          {pair.shared.length ? (
            <div className="hl-tags">
              {pair.shared.map((t) => (
                <span key={t} className="hl-chip">
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="hl-hint">Qloo&apos;s compare returned no shared taste for these two.</p>
          )}
        </section>
        <section className="hl-block" aria-labelledby="hl-brings-title">
          <div className="hl-block-head">
            <div>
              <h2 id="hl-brings-title">What each one brings</h2>
              <p>Cities where one act is strong (70+) and the other isn&apos;t (under 50): who carries which market.</p>
            </div>
          </div>
          <div className="hl-brings">
            <Brings act={a} cities={aBrings} heat={(c) => c.a} />
            <Brings act={b} cities={bBrings} heat={(c) => c.b} />
          </div>
        </section>
      </div>

      {!!pair.route.length && (
        <section className="hl-block" aria-labelledby="hl-proute-title">
          <div className="hl-block-head">
            <div>
              <h2 id="hl-proute-title">The double-bill route</h2>
              <p>
                {pair.route.length} cities, {totalKm.toLocaleString("en-US")} km by air: the best cities for both, ordered to keep the drives short.
              </p>
            </div>
          </div>
          <ol className="hl-timeline">
            {pair.route.map((r, i) => {
              const c = city(r.cityId);
              if (!c) return null;
              return (
                <li key={r.cityId}>
                  <span className={c.hidden ? "lime" : ""} aria-hidden>
                    {i + 1}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <h3>
                      {c.name}
                      <small>
                        {c.state} · together {c.heat} · {a.name} {c.a} · {b.name} {c.b}
                        {r.legKm ? ` · ${r.legKm} km` : ""}
                      </small>
                      {c.hidden && <span className="hl-mini lime">Hidden market</span>}
                    </h3>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <Receipts
        traces={pair.traces}
        what="pairing"
        note="Qloo answered for each act (its map) and for the pair (compare). Plain code combined them: the shared cities, the overlap and the route. No AI wrote or chose anything here."
      />
    </div>
  );
}
