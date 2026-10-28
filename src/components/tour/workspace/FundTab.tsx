"use client";

import Link from "next/link";
import { Ban, Download, Eye, LoaderCircle, MapPin, Send, TrendingUp } from "lucide-react";
import { PITCH_LABELS, PITCH_STATUSES, type Plan, type PitchStatus } from "@/core/tour/types";
import { daysSince, FOLLOW_UP_DAYS } from "@/core/tour/next";
import { Avatar } from "../Avatar";
import { categoryOf, ringDash, TIER } from "../sponsors";
import { followUpDraft, sponsorDraft } from "./drafts";
import { StatusSelect } from "./parts";
import type { TourActions } from "./TourView";

/** Funding the tour: the brands these fans love, ranked by Sponsor Fit, each with its pitch and where it stands. */
export function FundTab({ plan, turnedDown, actions, deck }: { plan: Plan; turnedDown: string[]; actions: TourActions; deck: { busy: boolean; download: () => void } }) {
  const sponsors = plan.sponsors.filter((s) => !turnedDown.includes(s.brand.id));
  const city = (id: string) => plan.cities.find((c) => c.id === id)?.name;
  return (
    <>
      <div className="hl-section-head">
        <h2>Find the money</h2>
        <p>Brands these fans already love, ranked by Sponsor Fit: Qloo&apos;s affinity, the categories you chose and brand size. Prospects to pitch, not deals.</p>
      </div>

      <section className="hl-card hl-deckcard" aria-label="Pitch deck">
        <div>
          <b>The pitch deck</b>
          <small>Five pages for a brand: the map, the audience, the markets, the brands these fans love, the partnership.</small>
        </div>
        <div className="hl-actions-inline">
          <Link className="hl-button hl-button-quiet hl-button-small" href={`/deck/${plan.id}`}>
            <Eye size={15} aria-hidden /> Preview
          </Link>
          <button type="button" className="hl-button hl-button-small" onClick={deck.download} disabled={deck.busy}>
            {deck.busy ? <LoaderCircle size={15} className="hl-spin" aria-hidden /> : <Download size={15} aria-hidden />} PDF
          </button>
        </div>
      </section>

      {sponsors.length ? (
        <ul className="hl-pitches">
          {sponsors.map((s) => {
            const t = actions.statusOf("sponsor", s.brand.id);
            const status = (t?.status ?? "to_send") as PitchStatus;
            const days = t ? daysSince(t.updatedAt) : 0;
            const late = status === "sent" && days >= FOLLOW_UP_DAYS;
            const cat = categoryOf(s.brand.categories);
            return (
              <li key={s.brand.id} className={`hl-pitch-card s-${status}`}>
                <div className="hl-pitch-top">
                  <Avatar name={s.brand.name} image={s.brand.image} size={48} fit="contain" />
                  <div style={{ minWidth: 0 }}>
                    <h3>{s.brand.name}</h3>
                    <small>
                      {cat ?? "Brand"} · {TIER[s.tier]}
                    </small>
                  </div>
                  <div className="hl-ring small" role="img" aria-label={`Sponsor Fit ${s.fit} of 100`}>
                    <svg viewBox="0 0 58 58">
                      <circle className="track" cx="29" cy="29" r="24" />
                      <circle className="value" cx="29" cy="29" r="24" strokeDasharray={ringDash(s.fit)} />
                    </svg>
                    <b>{s.fit}</b>
                  </div>
                </div>
                <ul className="hl-evidence">
                  <li>
                    <TrendingUp size={15} aria-hidden /> The #{s.qlooRank} brand for this audience in Qloo
                  </li>
                  {!!s.strongestIn.length && (
                    <li>
                      <MapPin size={15} aria-hidden /> Its own fans are strongest in {s.strongestIn.map(city).filter(Boolean).join(" and ")}
                    </li>
                  )}
                </ul>
                <div className="hl-pitch-foot">
                  <StatusSelect value={status} options={PITCH_STATUSES} labels={PITCH_LABELS} label={`Where the pitch to ${s.brand.name} stands`} onChange={(v) => actions.setTrack("sponsor", s.brand.id, v)} />
                  {late ? (
                    <button type="button" className="hl-button hl-button-small" onClick={() => actions.openDraft(followUpDraft(plan, s, days), { label: "Mark as followed up", run: () => actions.setTrack("sponsor", s.brand.id, "sent") })}>
                      <Send size={14} aria-hidden /> Follow up
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`hl-button hl-button-small${status === "to_send" ? "" : " hl-button-quiet"}`}
                      onClick={() => actions.openDraft(sponsorDraft(plan, s), status === "to_send" ? { label: "Mark as sent", run: () => actions.setTrack("sponsor", s.brand.id, "sent") } : undefined)}
                    >
                      <Send size={14} aria-hidden /> {status === "to_send" ? "Pitch" : "The pitch"}
                    </button>
                  )}
                  <button type="button" className="hl-quiet-link" title="Never suggest this brand for this act again" onClick={() => void actions.remember({ excludeBrandIds: [s.brand.id] })}>
                    <Ban size={14} aria-hidden /> Not for us
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="hl-hint">No sponsor matches in this tour.{plan.request.categories.length ? " Try other categories." : ""}</p>
      )}
      {!!turnedDown.length && plan.sponsors.some((s) => turnedDown.includes(s.brand.id)) && (
        <p className="hl-hint">Brands you said no to are hidden here and left out of {plan.act.name}&apos;s next tours.</p>
      )}

      <section className="hl-card hl-onepager" aria-labelledby="hl-one-title">
        <h2 id="hl-one-title">{plan.pitch.headline}</h2>
        <dl>
          <dt>The audience</dt>
          <dd>{plan.pitch.audience}</dd>
          <dt>The markets</dt>
          <dd>{plan.pitch.markets}</dd>
          {plan.pitch.ask && (
            <>
              <dt>The ask</dt>
              <dd>{plan.pitch.ask}</dd>
            </>
          )}
          <dt>The tour</dt>
          <dd>{plan.pitch.tourBrief}</dd>
        </dl>
      </section>
    </>
  );
}
