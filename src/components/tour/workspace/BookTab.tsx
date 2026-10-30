"use client";

import { ExternalLink, LoaderCircle, Mail, Mic2, Music2, RefreshCw, Star } from "lucide-react";
import { areaOf } from "@/core/tour/regions";
import { VENUE_LABELS, VENUE_STATUSES, type CityPlace, type Plan, type VenueStatus } from "@/core/tour/types";
import { venueDraft } from "./drafts";
import { StatusSelect } from "./parts";
import type { GuideState } from "./state";
import type { TourActions } from "./TourView";

/** The stops as tabs; the one in hand loads its places. Shared by Book and Promote. */
export function StopPicker({ plan, stop, onStop, mark }: { plan: Plan; stop?: string; onStop: (id: string) => void; mark?: (cityId: string) => string | undefined }) {
  return (
    <div className="hl-stoppick" role="tablist" aria-label="Stops">
      {plan.route.map((r, i) => {
        const c = plan.cities.find((x) => x.id === r.cityId);
        if (!c) return null;
        const m = mark?.(c.id);
        return (
          <button key={c.id} type="button" role="tab" aria-selected={stop === c.id} onClick={() => onStop(c.id)}>
            <span className={`hl-stop-n small${c.hidden ? " lime" : ""}`} aria-hidden>
              {i + 1}
            </span>
            {c.name}
            {m && <span className={`hl-dot s-${m}`} aria-label={VENUE_LABELS[m as VenueStatus]} />}
          </button>
        );
      })}
    </div>
  );
}

export function GuideWait({ guide, city, retry }: { guide?: GuideState; city: string; retry: () => void }) {
  if (!guide || guide.status === "loading")
    return (
      <p className="hl-hint hl-wait">
        <LoaderCircle size={16} className="hl-spin" aria-hidden /> Asking Qloo about {city}…
      </p>
    );
  if (guide.status === "error")
    return (
      <div className="hl-error" role="alert">
        {guide.error}{" "}
        <button type="button" className="hl-linkish" onClick={retry}>
          <RefreshCw size={14} aria-hidden /> Try again
        </button>
      </div>
    );
  return null;
}

/** What a place is, where, and its rating. `short` leaves out the address (it's in the row's tooltip). */
export function PlaceLine({ place, short = false }: { place: CityPlace; short?: boolean }) {
  return (
    <small>
      {[place.kind, short ? undefined : place.address].filter(Boolean).join(" · ")}
      {place.rating ? (
        <span className="hl-rating">
          <Star size={12} aria-hidden /> {place.rating.toFixed(1)}
        </span>
      ) : null}
    </small>
  );
}

/** Booking the tour: for each stop, the venues these fans love there, where each stands, and a hold request. */
export function BookTab({ plan, stop, onStop, guide, reload, actions }: { plan: Plan; stop?: string; onStop: (id: string) => void; guide?: GuideState; reload: (id: string) => void; actions: TourActions }) {
  const city = plan.cities.find((c) => c.id === stop);
  const Icon = plan.act.comedian ? Mic2 : Music2;
  return (
    <>
      <div className="hl-section-head">
        <h2>Book the venues</h2>
        <p>{plan.act.comedian ? "Comedy clubs" : "Music venues"} these fans love in each city, from Qloo. Ask for a hold, then mark where each one stands.</p>
      </div>
      <StopPicker plan={plan} stop={stop} onStop={onStop} mark={(id) => actions.venueFor(id)?.status} />
      {city && (
        <section className="hl-card hl-stopcard" aria-label={`Venues in ${city.name}`}>
          <div className="hl-stopcard-head">
            <div>
              <h3>{city.name}</h3>
              <small>
                {areaOf(city)} · Fan Heat {city.heat}
                {city.hidden ? " · hidden market" : ""}
              </small>
            </div>
          </div>
          <GuideWait guide={guide} city={city.name} retry={() => reload(city.id)} />
          {guide?.status === "ready" &&
            (guide.guide.venues.length ? (
              <ul className="hl-venues">
                {guide.guide.venues.map((v) => {
                  const t = actions.statusOf("venue", v.id);
                  const status = (t?.status ?? "to_contact") as VenueStatus;
                  return (
                    <li key={v.id} className={`hl-venue s-${status}`} onMouseEnter={() => actions.pointAt(v.id)} onMouseLeave={() => actions.pointAt(undefined)}>
                      <span className="hl-venue-icon" aria-hidden>
                        <Icon size={18} />
                      </span>
                      <div className="hl-venue-main">
                        <b>{v.name}</b>
                        <PlaceLine place={v} />
                        <div className="hl-venue-links">
                          <button
                            type="button"
                            onClick={() =>
                              actions.openDraft(venueDraft(plan, city, v), status === "to_contact" ? { label: "Mark as asked", run: () => actions.setTrack("venue", v.id, "asked", city.id) } : undefined)
                            }
                          >
                            <Mail size={14} aria-hidden /> Hold request
                          </button>
                          {v.website && (
                            <a href={v.website} target="_blank" rel="noopener noreferrer">
                              <ExternalLink size={14} aria-hidden /> Website
                            </a>
                          )}
                        </div>
                      </div>
                      <StatusSelect value={status} options={VENUE_STATUSES} labels={VENUE_LABELS} label={`Where ${v.name} stands`} onChange={(s) => actions.setTrack("venue", v.id, s, city.id)} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="hl-hint">Qloo has no venues tagged for these fans in {city.name} yet. Afinlo doesn&apos;t guess one.</p>
            ))}
          {guide?.status === "ready" && !!guide.guide.notes.length && guide.guide.notes.map((n) => <p key={n} className="hl-hint">{n}</p>)}
        </section>
      )}
    </>
  );
}
