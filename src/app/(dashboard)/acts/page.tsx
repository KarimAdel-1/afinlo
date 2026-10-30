import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Avatar } from "@/components/tour/Avatar";
import { PageHead } from "@/components/tour/PageHead";
import "@/components/tour/base.css";
import "@/components/tour/tour.css";
import "@/components/tour/home.css";
import { whereLabel } from "@/core/tour/regions";
import { SPONSOR_CATEGORIES } from "@/core/tour/types";
import { knownBrowser } from "@/platform/tour/http";
import { savedResults } from "@/platform/tour/saved";
import { rememberedActs } from "@/platform/tour/tracker";

export const metadata: Metadata = { title: "Acts", robots: { index: false } };

/** The acts toured from here, each with what Afinlo remembers for its next tour, and its tours. */
export default async function ActsPage() {
  const owner = await knownBrowser();
  const [acts, saved] = await Promise.all([rememberedActs(owner), savedResults(owner)]);
  const toursOf = (actId: string) => saved.flatMap((s) => (s.plan.act.id === actId ? [s.plan] : []));
  return (
    <div className="hl hl-flow hl-home">
      <PageHead
        title="Acts"
        actions={
          <Link className="hl-button" href="/plan">
            <Plus size={18} aria-hidden /> New tour
          </Link>
        }
      >
        Every act you&apos;ve toured, and what Afinlo remembers for the next tour: where it went, and what it said no to.
      </PageHead>
      {acts.length ? (
        <ul className="hl-acts">
          {acts.map(({ act, memory }) => {
            const tours = toursOf(act.id);
            const remembered = [
              memory.where && whereLabel(memory.where),
              memory.stops && `${memory.stops} shows`,
              memory.focus === "hidden" && "Hidden markets first",
              ...(memory.avoid ?? []).map((c) => `No ${SPONSOR_CATEGORIES[c].label.toLowerCase()}`),
              memory.excludeBrandIds?.length && `${memory.excludeBrandIds.length} ${memory.excludeBrandIds.length === 1 ? "brand" : "brands"} turned down`,
              memory.excludeCityIds?.length && `${memory.excludeCityIds.length} ${memory.excludeCityIds.length === 1 ? "city" : "cities"} skipped`,
            ].filter((v): v is string => typeof v === "string");
            return (
              <li key={act.id} className="hl-card hl-actcard">
                <div className="hl-actcard-top">
                  <Avatar name={act.name} image={act.image} size={60} />
                  <div style={{ minWidth: 0 }}>
                    <h2>{act.name}</h2>
                    <small>
                      {act.comedian ? "Comedian" : "Artist"} · {tours.length} {tours.length === 1 ? "tour" : "tours"}
                    </small>
                  </div>
                </div>
                {!!remembered.length && (
                  <ul aria-label="What Afinlo remembers">
                    {remembered.map((r) => (
                      <li key={r} className="hl-chip">
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="hl-actcard-foot">
                  <Link className="hl-button hl-button-small" href={`/plan?act=${act.id}`}>
                    <Plus size={15} aria-hidden /> New tour
                  </Link>
                  {tours[0] && (
                    <Link className="hl-button hl-button-quiet hl-button-small" href={`/tour/${tours[0].id}`}>
                      Latest tour <ArrowRight size={15} aria-hidden />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="hl-card hl-empty">
          <h2>No acts yet</h2>
          <p>Plan a tour, and its act shows up here with what Afinlo learns about it.</p>
          <div className="hl-actions-inline">
            <Link className="hl-button" href="/plan">
              <Plus size={17} aria-hidden /> Plan a tour
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
