"use client";

import Link from "next/link";
import { BookOpen, Clapperboard, ExternalLink, Podcast, Sparkles, Tv, Users, type LucideIcon } from "lucide-react";
import type { Plan } from "@/core/tour/types";
import { Avatar } from "../Avatar";
import { GuideWait, PlaceLine, StopPicker } from "./BookTab";
import type { GuideState } from "./state";

const LOVE: Record<string, { icon: LucideIcon; idea: (name: string) => string }> = {
  Podcast: { icon: Podcast, idea: (n) => `Pitch ${n} for an interview: its listeners are these fans.` },
  TV: { icon: Tv, idea: (n) => `Fans of ${n} are this audience: a clip, a reference, an ad slot.` },
  Film: { icon: Clapperboard, idea: (n) => `${n} is a shared reference for this crowd: content and screenings.` },
  Book: { icon: BookOpen, idea: (n) => `Readers of ${n} overlap with these fans: a reading list post, a store event.` },
};

/** Reaching the fans: who they are, what else they love (channels to reach them), acts to share a bill with, and local places. */
export function PromoteTab({ plan, stop, onStop, guide, reload }: { plan: Plan; stop?: string; onStop: (id: string) => void; guide?: GuideState; reload: (id: string) => void }) {
  const d = plan.fanDna.demographics;
  const city = plan.cities.find((c) => c.id === stop);
  const ages = d ? [...d.age].sort((a, b) => b.skew - a.skew) : [];
  return (
    <>
      <div className="hl-section-head">
        <h2>Reach the fans</h2>
        <p>Qloo&apos;s view of the audience as a whole, never of a person, and where else these fans spend their attention.</p>
      </div>

      <section className="hl-card" aria-labelledby="hl-who-title">
        <h3 id="hl-who-title" className="hl-card-title">
          Who they are
        </h3>
        <div className="hl-tags">
          {plan.fanDna.tags.length ? (
            plan.fanDna.tags.map((t) => (
              <span key={t.id} className="hl-chip">
                {t.name}
              </span>
            ))
          ) : (
            <span className="hl-hint">Qloo returned no taste tags.</span>
          )}
        </div>
        {d && (
          <div className="hl-skews">
            {d.age.map((a) => (
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
            <p className="hl-hint">
              Skews {ages[0]?.band ?? "evenly"} against Qloo&apos;s average audience, and{" "}
              {d.gender.male > 0.1 ? "leans male" : d.gender.female > 0.1 ? "leans female" : "is evenly split by gender"}.
            </p>
          </div>
        )}
      </section>

      {!!plan.fanDna.loves.length && (
        <section aria-labelledby="hl-loves-title">
          <div className="hl-section-head">
            <h2 id="hl-loves-title">Where else they are</h2>
            <p>What these fans love most in other parts of their lives: the channels to reach them.</p>
          </div>
          <ul className="hl-channels">
            {plan.fanDna.loves.map((l) => {
              const kind = LOVE[l.label] ?? { icon: Sparkles, idea: (n: string) => `${n} is a favourite of this crowd.` };
              const Icon = kind.icon;
              return (
                <li key={l.label} className="hl-card">
                  <span className="hl-channel-icon" aria-hidden>
                    <Icon size={18} />
                  </span>
                  <div>
                    <small>{l.label}</small>
                    <b>{l.entity.name}</b>
                    <p>{kind.idea(l.entity.name)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!!plan.supportActs.length && (
        <section aria-labelledby="hl-openers-title">
          <div className="hl-section-head">
            <h2 id="hl-openers-title">Share the bill</h2>
            <p>Acts whose fans overlap with this audience, from Qloo: openers who bring the right crowd.</p>
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
          <Link className="hl-linkish" href="/co-headline">
            <Users size={14} aria-hidden /> Plan a double bill with another act
          </Link>
        </section>
      )}

      <section aria-labelledby="hl-local-title">
        <div className="hl-section-head">
          <h2 id="hl-local-title">In each city</h2>
          <p>Local businesses these fans love, as partners for the night, and the places they go: for posters, pop-ups and content.</p>
        </div>
        <StopPicker plan={plan} stop={stop} onStop={onStop} />
        {city && (
          <div className="hl-card hl-stopcard">
            <GuideWait guide={guide} city={city.name} retry={() => reload(city.id)} />
            {guide?.status === "ready" && (
              <div className="hl-local">
                <div>
                  <h3 className="hl-card-title">Partners for the night</h3>
                  {guide.guide.leads.length ? (
                    <ul className="hl-placelist">
                      {guide.guide.leads.map((p) => (
                        <li key={p.id}>
                          <b>{p.name}</b>
                          <PlaceLine place={p} />
                          {p.website && (
                            <a href={p.website} target="_blank" rel="noopener noreferrer">
                              <ExternalLink size={13} aria-hidden /> Website
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hl-hint">Qloo has no local businesses for these fans in {city.name}.</p>
                  )}
                </div>
                <div>
                  <h3 className="hl-card-title">Where these fans go</h3>
                  {guide.guide.loved.length ? (
                    <ul className="hl-placelist">
                      {guide.guide.loved.map((p) => (
                        <li key={p.id}>
                          <b>{p.name}</b>
                          <PlaceLine place={p} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hl-hint">No other places came back for {city.name}.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
