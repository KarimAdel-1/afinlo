import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, Database, Map as MapIcon, MapPin, Star, TrendingUp, Users } from "lucide-react";
import { Avatar } from "@/components/tour/Avatar";
import { CopyLink } from "@/components/tour/CopyLink";
import { FanMap, MapLegend } from "@/components/tour/FanMap";
import { people, seconds } from "@/components/tour/format";
import { Receipts } from "@/components/tour/Receipts";
import { Stat } from "@/components/tour/Stat";
import { categoryOf, ringDash } from "@/components/tour/sponsors";
import "@/components/tour/base.css";
import type { BrandMatch, Sponsor } from "@/core/tour/types";
import { landTiles, topCityMarkers } from "@/platform/tour/map";
import { getMatch } from "@/platform/tour/store";

const ACT_TIER: Record<Sponsor["tier"], string> = { household: "Household name", established: "Established act", niche: "Rising act" };
const KINDS: Record<BrandMatch["request"]["acts"], string> = { both: "Artists and comedians", music: "Artists", comedy: "Comedians" };

export async function generateMetadata({ params }: PageProps<"/brands/[id]">): Promise<Metadata> {
  const match = await getMatch<BrandMatch>("brand", (await params).id);
  return match
    ? { title: `${match.brand.name} · Acts for the brand`, description: `The artists and comedians whose fans love ${match.brand.name}, from Qloo.`, robots: { index: false } }
    : { title: "Not found", robots: { index: false } };
}

export default async function BrandMatchPage({ params }: PageProps<"/brands/[id]">) {
  const match = await getMatch<BrandMatch>("brand", (await params).id);
  if (!match) notFound();
  const { brand } = match;
  const city = (id: string) => match.cities.find((c) => c.id === id);
  const top = match.cities[0];
  const category = categoryOf(brand.categories);

  return (
    <div className="hl hl-result">
      <header className="hl-result-hero">
        <div className="hl-result-id">
          <Avatar name={brand.name} image={brand.image} size={84} fit="contain" />
          <div style={{ minWidth: 0 }}>
            <h1>{brand.name}</h1>
            <p>{brand.description || `The acts whose fans love ${brand.name}, from Qloo.`}</p>
            <div className="hl-chipline">
              {category && <span className="hl-chip">{category}</span>}
              <span className="hl-chip">{KINDS[match.request.acts]}</span>
              {match.example && <span className="hl-chip hl-chip-blue">Example</span>}
            </div>
          </div>
        </div>
        <div className="hl-actions">
          <CopyLink />
          <Link className="hl-button hl-button-small" href="/brands">
            Another brand <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </header>

      {!!match.notes.length && (
        <div className="hl-notes">
          {match.notes.map((n) => (
            <p className="hl-note" key={n}>
              <AlertTriangle size={16} aria-hidden /> {n}
            </p>
          ))}
        </div>
      )}

      <section className="hl-dash" aria-labelledby="hl-brand-title">
        <div className="hl-dash-side">
          <h2 id="hl-brand-title">Where its fans are</h2>
          <p className="hl-dash-sub">From Qloo&apos;s heatmap: where {brand.name}&apos;s audience over-indexes.</p>
          {top && (
            <div className="hl-dash-big">
              <span>Strongest city</span>
              <strong>{top.name}</strong>
              <p>
                {top.state} · metro {people(top.population)}
              </p>
            </div>
          )}
          <ul className="hl-dash-stats">
            <Stat icon={MapIcon} color="#4336ff" label="Cities with fan data">
              {match.cities.length}
            </Stat>
            <Stat icon={Users} color="#ff4f7e" label="Acts whose fans love it">
              {match.acts.length}
            </Stat>
            <Stat icon={Star} color="#efff8a" ink label="Best fit">
              {match.acts[0]?.act.name ?? "None"}
            </Stat>
            <Stat icon={Database} color="#262a3f" label="Qloo requests">
              {match.traces.length} · {seconds(match.durationMs)}
            </Stat>
          </ul>
        </div>
        <div className="hl-dash-map">
          {match.cities.length ? (
            <>
              <FanMap tiles={landTiles().tiles} heat={match.heat} cities={topCityMarkers(match.cities)} markerLabel="Top city" label={`Where ${brand.name}'s fans are, from Qloo's heatmap`} />
              <MapLegend marker="Top city" />
            </>
          ) : (
            <p className="hl-hint">Qloo has no location data for this brand yet, so there&apos;s no map. Afinlo doesn&apos;t guess.</p>
          )}
        </div>
      </section>

      <section className="hl-block" aria-labelledby="hl-acts-title">
        <div className="hl-block-head">
          <div>
            <h2 id="hl-acts-title">Acts whose fans love {brand.name}</h2>
            <p>Ranked by Brand Fit: Qloo&apos;s affinity of the brand&apos;s audience for each act, weighed by the act&apos;s reach. Acts to approach, not deals.</p>
          </div>
        </div>
        <div className="hl-sponsors">
          {match.acts.map((m) => (
            <article key={m.act.id} className="hl-sponsor">
              <div className="hl-sponsor-head">
                <Avatar name={m.act.name} image={m.act.image} size={48} />
                <div style={{ minWidth: 0 }}>
                  <h3>{m.act.name}</h3>
                  <small>
                    {m.act.comedian ? "Comedian" : "Artist"} · {ACT_TIER[m.tier]}
                  </small>
                </div>
                <div className="hl-ring" role="img" aria-label={`Brand Fit ${m.fit} of 100`}>
                  <svg viewBox="0 0 58 58">
                    <circle className="track" cx="29" cy="29" r="24" />
                    <circle className="value" cx="29" cy="29" r="24" strokeDasharray={ringDash(m.fit)} />
                  </svg>
                  <b>{m.fit}</b>
                </div>
              </div>
              <ul className="hl-evidence">
                <li>
                  <TrendingUp size={16} aria-hidden /> The #{m.qlooRank} act for this brand&apos;s audience in Qloo
                </li>
                {!!m.shared.length && (
                  <li>
                    <MapPin size={16} aria-hidden /> Both audiences are strong in{" "}
                    {m.shared
                      .map((s) => city(s.cityId)?.name)
                      .filter(Boolean)
                      .join(", ")}
                  </li>
                )}
              </ul>
              <div className="hl-sponsor-foot">
                <span>{m.shared[0] ? `Together ${m.shared[0].together} in ${city(m.shared[0].cityId)?.name}` : "No shared map"}</span>
                <Link href={`/plan?act=${m.act.id}`}>
                  Plan a tour <ArrowRight size={14} aria-hidden />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <Receipts
        traces={match.traces}
        what="match"
        note="Qloo chose the brand, every act and every map. Plain code scored Brand Fit and the shared cities. No AI wrote or chose anything here."
      />
    </div>
  );
}
