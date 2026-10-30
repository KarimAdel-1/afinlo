"use client";

import { useState } from "react";
import { BookOpen, Clapperboard, ExternalLink, Podcast, Sparkles, Tv, type LucideIcon } from "lucide-react";
import type { CityGuide, CityPlace, Plan } from "@/core/tour/types";
import { Avatar } from "../Avatar";
import { GuideWait, PlaceLine, StopPicker } from "./BookTab";
import type { GuideState } from "./state";

/** What these fans love elsewhere, as a way to reach them: what it is, and the one thing to do with it. */
const LOVE: Record<string, { icon: LucideIcon; kind: string; action: string }> = {
  Podcast: { icon: Podcast, kind: "A podcast they listen to", action: "Pitch an interview" },
  TV: { icon: Tv, kind: "A show they watch", action: "Reference it in a clip, or buy an ad slot" },
  Film: { icon: Clapperboard, kind: "A film they love", action: "Use it in content, or host a screening" },
  Book: { icon: BookOpen, kind: "A book they read", action: "Post a reading list, or hold a store event" },
};

/** An age group's lean, in words: Qloo gives it from −1 (far fewer than the average audience) to 1 (far more). */
const lean = (skew: number) =>
  skew >= 0.25 ? "Much more likely" : skew >= 0.08 ? "More likely" : skew > -0.08 ? "About average" : skew > -0.25 ? "Less likely" : "Much less likely";

/** How many places each list shows before "Show all". */
const PLACES_FIRST = 5;

/**
 * Reaching the fans, as four plain questions: who they are, how to reach them, which acts to share a bill with, and
 * which places to work with in each city. All from Qloo, about the audience as a whole.
 */
export function PromoteTab({ plan, stop, onStop, guide, reload }: { plan: Plan; stop?: string; onStop: (id: string) => void; guide?: GuideState; reload: (id: string) => void }) {
  const d = plan.fanDna.demographics;
  const city = plan.cities.find((c) => c.id === stop);
  const ages = d ? [...d.age].sort((a, b) => b.skew - a.skew) : [];
  const gender = d && (d.gender.male > 0.1 ? "more men than women" : d.gender.female > 0.1 ? "more women than men" : "as many women as men");
  const most = ages[0] && ages[0].skew > 0 ? ages[0].band : undefined;
  const parts = [
    { id: "hl-who", label: "Who they are", show: true },
    { id: "hl-reach", label: "How to reach them", show: !!plan.fanDna.loves.length },
    { id: "hl-bill", label: "Acts to tour with", show: !!plan.supportActs.length },
    { id: "hl-local", label: "Local partners", show: true },
  ].filter((p) => p.show);

  return (
    <>
      <div className="hl-section-head">
        <h2>Reach the fans</h2>
        <p>Who the fans are, where to reach them, and who to work with. From Qloo, about the audience as a whole, never a person.</p>
      </div>
      <nav className="hl-jump" aria-label="On this tab">
        {parts.map((p) => (
          <a key={p.id} href={`#${p.id}`}>
            {p.label}
          </a>
        ))}
      </nav>

      <section id="hl-who" className="hl-card" aria-labelledby="hl-who-title">
        <h3 id="hl-who-title" className="hl-card-title">
          Who they are
        </h3>
        {(most || gender) && (
          <p className="hl-fan-line">
            {plan.act.name}&apos;s fans are {most ? `most often ${most}` : "of every age"}
            {gender ? `, and ${gender}` : ""}.
          </p>
        )}
        {!!plan.fanDna.tags.length && (
          <>
            <small className="hl-small-label">What they&apos;re into</small>
            <div className="hl-tags">
              {plan.fanDna.tags.map((t) => (
                <span key={t.id} className="hl-chip">
                  {t.name}
                </span>
              ))}
            </div>
          </>
        )}
        {d && (
          <div className="hl-skews">
            <small className="hl-small-label">Each age group, against the average audience</small>
            {d.age.map((a) => (
              <div className="hl-skew words" key={a.band}>
                <span>{a.band}</span>
                <span className="hl-skew-track" aria-hidden>
                  <span className={a.skew < 0 ? "neg" : ""} style={a.skew >= 0 ? { left: "50%", width: `${Math.min(50, a.skew * 50)}%` } : { right: "50%", width: `${Math.min(50, -a.skew * 50)}%` }} />
                </span>
                <b>{lean(a.skew)}</b>
              </div>
            ))}
          </div>
        )}
        {!plan.fanDna.tags.length && !d && <p className="hl-hint">Qloo has no profile of this audience yet.</p>}
      </section>

      {!!plan.fanDna.loves.length && (
        <section id="hl-reach" aria-labelledby="hl-reach-title">
          <div className="hl-section-head">
            <h2 id="hl-reach-title">How to reach them</h2>
            <p>What these fans love besides music, and how to use it.</p>
          </div>
          <ul className="hl-channels">
            {plan.fanDna.loves.map((l) => {
              const kind = LOVE[l.label] ?? { icon: Sparkles, kind: "Something they love", action: "A shared reference for posts" };
              const Icon = kind.icon;
              return (
                <li key={l.label} className="hl-card">
                  <span className="hl-channel-icon" aria-hidden>
                    <Icon size={18} />
                  </span>
                  <div>
                    <small>{kind.kind}</small>
                    <b>{l.entity.name}</b>
                    <p>{kind.action}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!!plan.supportActs.length && (
        <section id="hl-bill" aria-labelledby="hl-bill-title">
          <div className="hl-section-head">
            <h2 id="hl-bill-title">Acts to tour with</h2>
            <p>Openers whose fans are much like these: they bring the right crowd.</p>
          </div>
          <ul className="hl-openers">
            {plan.supportActs.map((s) => (
              <li key={s.act.id}>
                <Avatar name={s.act.name} image={s.act.image} size={44} />
                <div style={{ minWidth: 0 }}>
                  <b>{s.act.name}</b>
                  <small>{s.shared.length ? `Both crowds like ${s.shared.join(", ")}` : "Overlapping audience"}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="hl-local" aria-labelledby="hl-local-title">
        <div className="hl-section-head">
          <h2 id="hl-local-title">Local partners</h2>
          <p>Pick a stop to see the places these fans love there.</p>
        </div>
        <StopPicker plan={plan} stop={stop} onStop={onStop} />
        {city && (
          <div className="hl-card hl-stopcard">
            <GuideWait guide={guide} city={city.name} retry={() => reload(city.id)} />
            {guide?.status === "ready" && <CityPlaces key={city.id} city={city.name} guide={guide.guide} />}
          </div>
        )}
      </section>
    </>
  );
}

/** A stop's two lists: businesses to partner with for the night, and places for posters, content and meet-ups. */
function CityPlaces({ city, guide }: { city: string; guide: Pick<CityGuide, "leads" | "loved"> }) {
  return (
    <div className="hl-local">
      <Places title="Businesses to partner with" hint="Bars, cafés and shops for a pre-show, a pop-up or a co-promotion." empty={`Qloo has no local businesses for these fans in ${city}.`} places={guide.leads} links />
      <Places title="Where fans hang out" hint="Places for posters, content and meet-ups." empty={`No other places came back for ${city}.`} places={guide.loved} />
    </div>
  );
}

function Places({ title, hint, empty, places, links = false }: { title: string; hint: string; empty: string; places: CityPlace[]; links?: boolean }) {
  const [all, setAll] = useState(false);
  return (
    <div>
      <h3 className="hl-card-title">{title}</h3>
      <p className="hl-hint hl-places-hint">{hint}</p>
      {places.length ? (
        <>
          <ul className="hl-placelist compact">
            {places.slice(0, all ? undefined : PLACES_FIRST).map((p) => (
              <li key={p.id} title={p.address}>
                <b>{p.name}</b>
                <PlaceLine place={p} short />
                {links && p.website && (
                  <a href={p.website} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={13} aria-hidden /> Website
                  </a>
                )}
              </li>
            ))}
          </ul>
          {places.length > PLACES_FIRST && (
            <button type="button" className="hl-linkish hl-show-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
              {all ? "Show fewer" : `Show all ${places.length}`}
            </button>
          )}
        </>
      ) : (
        <p className="hl-hint">{empty}</p>
      )}
    </div>
  );
}
