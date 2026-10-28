"use client";

import { useState } from "react";
import { Car, CalendarCheck, LoaderCircle, Plane, Sparkles, Star, X } from "lucide-react";
import { areaOf } from "@/core/tour/regions";
import { SPONSOR_CATEGORIES, VENUE_LABELS, type CityHeat, type Plan, type SponsorCategory, type VenueStatus } from "@/core/tour/types";
import { people, seconds } from "../format";
import { postJson } from "../client";
import { Receipts } from "../Receipts";
import { Heat } from "./parts";
import type { TourActions } from "./TourView";

/** The route, stop by stop, with how each is reached; the strong cities not on it; and the plan's quick changes. */
export function PlanTab({
  plan,
  routeCities,
  active,
  onActive,
  actions,
  ai,
  running,
}: {
  plan: Plan;
  routeCities: CityHeat[];
  active?: string;
  onActive: (id?: string) => void;
  actions: TourActions;
  ai: boolean;
  running: boolean;
}) {
  const [message, setMessage] = useState("");
  const [asking, setAsking] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const top = plan.cities[0];
  const hidden = plan.cities.filter((c) => c.hidden);
  const onRoute = new Set(plan.route.map((r) => r.cityId));
  const strongOff = plan.cities.filter((c) => !onRoute.has(c.id)).slice(0, 8);
  const cached = plan.traces.filter((t) => t.cached).length;

  const ask = async () => {
    if (message.trim().length < 2) return;
    setAsking(true);
    setError("");
    try {
      const r = await postJson<{ request: Plan["request"]; reply: string }>(`/api/tour/plan/${plan.id}/refine`, { message });
      setReply(r.reply);
      actions.rerun(r.request);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(false);
    }
  };

  return (
    <>
      <section className="hl-card hl-summary" aria-label="Where the fans are">
        {plan.proof && (
          <div className="hl-summary-proof">
            <small>Against the biggest cities</small>
            <b>
              Fan Heat {plan.proof.route} vs {plan.proof.biggest}
            </b>
            <span>
              This route&apos;s average, and that of the {plan.proof.biggestCities.length} biggest cities in {plan.area ?? "the area"}: {plan.proof.biggestCities.join(", ")}.
            </span>
          </div>
        )}
        {top && (
          <div>
            <small>Strongest city</small>
            <b>{top.name}</b>
            <span>
              {areaOf(top)} · Fan Heat {top.heat}
            </span>
          </div>
        )}
        <div>
          <small>Hidden markets</small>
          <b>{hidden.length || "None"}</b>
          <span>{hidden.length ? hidden.slice(0, 3).map((c) => c.name).join(", ") : "No smaller city stood out"}</span>
        </div>
        <div>
          <small>From Qloo</small>
          <b>{plan.cities.length} cities</b>
          <span>
            {plan.traces.length} requests{cached ? `, ${cached} cached` : ""} · {seconds(plan.durationMs)}
          </span>
        </div>
      </section>

      <section aria-labelledby="hl-route-title">
        <div className="hl-section-head">
          <h2 id="hl-route-title">The route</h2>
          <p>Ordered to keep travel short, with no two stops in the same market. Hover a stop to find it on the map.</p>
        </div>
        {plan.route.length ? (
          <ol className="hl-stops">
            {plan.route.map((r, i) => {
              const c = routeCities.find((x) => x.id === r.cityId);
              if (!c) return null;
              const booked = actions.venueFor(c.id);
              return (
                <li key={r.cityId} className={active === c.id ? "on" : ""} onMouseEnter={() => onActive(c.id)} onMouseLeave={() => onActive(undefined)}>
                  {!!r.legKm && (
                    <div className="hl-leg">
                      {r.mode === "fly" ? <Plane size={14} aria-hidden /> : <Car size={14} aria-hidden />}
                      {r.legKm.toLocaleString("en-US")} km {r.mode === "fly" ? "flight" : "drive"}
                      {i === 0 && plan.request.homeCityId ? " from home" : ""}
                    </div>
                  )}
                  <div className="hl-stop">
                    <span className={`hl-stop-n${c.hidden ? " lime" : ""}`} aria-hidden>
                      {i + 1}
                    </span>
                    <div className="hl-stop-main">
                      <h3>
                        {c.name}
                        {c.hidden && <span className="hl-mini lime">Hidden market</span>}
                      </h3>
                      <small>
                        {areaOf(c)} · metro {people(c.population)}
                        {c.confidence === "low" ? " · little data" : ""}
                      </small>
                    </div>
                    <Heat value={c.heat} hidden={c.hidden} />
                  </div>
                  <div className="hl-stop-actions">
                    <button type="button" onClick={() => actions.goTo("book", c.id)}>
                      <CalendarCheck size={14} aria-hidden /> {booked ? VENUE_LABELS[booked.status as VenueStatus] : "Venues"}
                    </button>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => {
                        void actions.remember({ excludeCityIds: [c.id] });
                        actions.rerun({ excludeCityIds: [...plan.request.excludeCityIds, c.id] });
                      }}
                    >
                      <X size={14} aria-hidden /> Skip this city
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="hl-hint">No route: Qloo has no location data for this act here.</p>
        )}
      </section>

      {!!strongOff.length && (
        <section aria-labelledby="hl-also-title">
          <div className="hl-section-head">
            <h2 id="hl-also-title">Also strong</h2>
            <p>Cities with these fans that aren&apos;t on the route: for a longer tour, or a second leg.</p>
          </div>
          <ul className="hl-also">
            {strongOff.map((c) => (
              <li key={c.id} onMouseEnter={() => onActive(c.id)} onMouseLeave={() => onActive(undefined)}>
                <span>
                  <b>{c.name}</b>
                  <small>{areaOf(c)}</small>
                </span>
                {c.hidden && <Star size={14} className="hl-also-star" aria-label="Hidden market" />}
                <Heat value={c.heat} hidden={c.hidden} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="hl-card" aria-labelledby="hl-change-title">
        <div className="hl-section-head">
          <h2 id="hl-change-title">Change the plan</h2>
          <p>Afinlo plans again with the change. Where each venue and sponsor stands carries over.</p>
        </div>
        <div className="hl-refine-chips">
          {plan.request.focus !== "hidden" ? (
            <button type="button" disabled={running} onClick={() => actions.rerun({ focus: "hidden" })}>
              Hidden markets first
            </button>
          ) : (
            <button type="button" disabled={running} onClick={() => actions.rerun({ focus: "balanced" })}>
              Balanced: big and hidden markets
            </button>
          )}
          {plan.request.stops > 4 && (
            <button type="button" disabled={running} onClick={() => actions.rerun({ stops: plan.request.stops - 2 })}>
              Shorter: {plan.request.stops - 2} stops
            </button>
          )}
          {plan.request.stops < 12 && (
            <button type="button" disabled={running} onClick={() => actions.rerun({ stops: Math.min(12, plan.request.stops + 2) })}>
              Longer: {Math.min(12, plan.request.stops + 2)} stops
            </button>
          )}
          {(["drinks", "fashion", "tech"] as SponsorCategory[])
            .filter((c) => !plan.request.categories.includes(c))
            .map((c) => (
              <button key={c} type="button" disabled={running} onClick={() => actions.rerun({ categories: [c] })}>
                Only {SPONSOR_CATEGORIES[c].label.toLowerCase()} sponsors
              </button>
            ))}
          {!!plan.request.categories.length && (
            <button type="button" disabled={running} onClick={() => actions.rerun({ categories: [] })}>
              Sponsors in every category
            </button>
          )}
        </div>
        {ai && (
          <form
            className="hl-refine-form"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <label htmlFor="hl-refine" className="hl-visually-hidden">
              Describe a change
            </label>
            <input id="hl-refine" value={message} maxLength={400} onChange={(e) => setMessage(e.target.value)} placeholder="Or say it: “swap Denver for somewhere near Seattle”" disabled={asking || running} />
            <button className="hl-button" disabled={asking || running || message.trim().length < 2}>
              {asking ? <LoaderCircle size={16} className="hl-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />} Change
            </button>
          </form>
        )}
        {reply && <p className="hl-hint">{reply}</p>}
        {error && (
          <p className="hl-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <Receipts traces={plan.traces} what="tour" note="Qloo chose every city, brand, act and place. Plain code scored them (Fan Heat, Sponsor Fit, the route). Nothing here was chosen by a language model." />
    </>
  );
}
