"use client";

import { Car, CalendarCheck, Plane, X } from "lucide-react";
import { areaOf } from "@/core/tour/regions";
import { VENUE_LABELS, type CityHeat, type Plan, type VenueStatus } from "@/core/tour/types";
import { people } from "../format";
import { Receipts } from "../Receipts";
import { Heat } from "./parts";
import type { TourActions } from "./TourView";

/** Why this route, then the route stop by stop, with how each is reached. Changes to it are the tour team's to make. */
export function PlanTab({
  plan,
  routeCities,
  active,
  onActive,
  actions,
  running,
}: {
  plan: Plan;
  routeCities: CityHeat[];
  active?: string;
  onActive: (id?: string) => void;
  actions: TourActions;
  running: boolean;
}) {
  const top = plan.cities[0];
  const hidden = plan.cities.filter((c) => c.hidden);

  return (
    <>
      {/* Why this route, in plain words: its fans against the obvious route's, and what the two terms mean. */}
      <section className="hl-card hl-glance" aria-labelledby="hl-glance-title">
        <h2 id="hl-glance-title">Why this route</h2>
        {plan.proof ? (
          <>
            {/* Said as it came out: Fan Heat is relative affinity, not a count of fans, and the route can tie or lose. */}
            <p>
              {plan.proof.route > plan.proof.biggest
                ? `On average, its cities score higher on Fan Heat for ${plan.act.name} than a tour of the ${plan.proof.biggestCities.length} biggest cities in ${plan.area ?? "the area"} would.`
                : plan.proof.route === plan.proof.biggest
                  ? `On average, its cities score the same on Fan Heat for ${plan.act.name} as a tour of the ${plan.proof.biggestCities.length} biggest cities in ${plan.area ?? "the area"} would.`
                  : `On average, its cities score lower on Fan Heat for ${plan.act.name} than a tour of the ${plan.proof.biggestCities.length} biggest cities in ${plan.area ?? "the area"} would: the route also weighs spacing, travel and any cities you asked for.`}
            </p>
            <div className="hl-compare">
              <span>This route</span>
              <span className="hl-compare-bar" aria-hidden>
                <i style={{ width: `${plan.proof.route}%` }} />
              </span>
              <b>{plan.proof.route}</b>
              <span>The biggest cities</span>
              <span className="hl-compare-bar muted" aria-hidden>
                <i style={{ width: `${plan.proof.biggest}%` }} />
              </span>
              <b>{plan.proof.biggest}</b>
            </div>
            <small className="hl-glance-note">The biggest cities: {plan.proof.biggestCities.join(", ")}.</small>
          </>
        ) : (
          <p>Its cities are where {plan.act.name}&apos;s fans gather most, kept a show&apos;s distance apart.</p>
        )}
        <div className="hl-glance-facts">
          {top && (
            <div>
              <small>Fans gather most in</small>
              <b>{top.name}</b>
              <span>{areaOf(top)}</span>
            </div>
          )}
          <div>
            <small>Hidden markets</small>
            <b>{hidden.length || "None"}</b>
            <span>{hidden.length ? `Strong cities most tours skip: ${hidden.slice(0, 3).map((c) => c.name).join(", ")}` : "No smaller city stood out"}</span>
          </div>
        </div>
        <p className="hl-glance-key">
          <b>Fan Heat</b> (0–100) is how strongly the act&apos;s fans gather in a city compared with the area&apos;s other cities, from Qloo&apos;s taste data. It isn&apos;t ticket sales.
        </p>
      </section>

      <section aria-labelledby="hl-route-title">
        <div className="hl-section-head">
          <h2 id="hl-route-title">The route</h2>
          <p>
            In order, keeping travel short. Each bar is the city&apos;s Fan Heat; lavender marks a hidden market. Distances are straight-line estimates, not road routes. Hover a stop to find it
            on the map.
          </p>
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
                    // An estimate: the straight-line distance, and the way it would likely be travelled, not a road route.
                    <div className="hl-leg" title="Straight-line distance; the mode is a likely guess from the distance and the border, not a booked route.">
                      {r.mode === "fly" ? <Plane size={14} aria-hidden /> : <Car size={14} aria-hidden />}≈{r.legKm.toLocaleString("en-US")} km, likely a {r.mode === "fly" ? "flight" : "drive"}
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
                    {/* Its Fan Heat, and what to do with it, in the card: the route stays one card a stop. */}
                    <div className="hl-stop-side">
                      <Heat value={c.heat} hidden={c.hidden} />
                      <div className="hl-stop-actions">
                        <button type="button" onClick={() => actions.goTo("book", c.id)}>
                          <CalendarCheck size={13} aria-hidden /> {booked ? VENUE_LABELS[booked.status as VenueStatus] : "Venues"}
                        </button>
                        <button
                          type="button"
                          disabled={running}
                          aria-label={`Skip ${c.name}`}
                          title="Plan the tour again without this city"
                          onClick={() => {
                            void actions.remember({ excludeCityIds: [c.id] });
                            actions.rerun({ excludeCityIds: [...plan.request.excludeCityIds, c.id] });
                          }}
                        >
                          <X size={13} aria-hidden /> Skip
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="hl-hint">No route: Qloo has no location data for this act here.</p>
        )}
      </section>

      <Receipts traces={plan.traces} what="tour" note="Qloo chose every city, brand, act and place. Plain code scored them (Fan Heat, Sponsor Fit, the route). Nothing here was chosen by a language model." />
    </>
  );
}
