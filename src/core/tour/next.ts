// What needs doing on a tour, and how far along it is, from the plan and where each venue and sponsor stands. The
// rules a tour manager keeps in their head: every stop needs a confirmed venue; the best sponsors get a pitch; a pitch
// with no answer after five days gets a follow-up; an answer gets a reply. Pure.
import type { Plan, Track } from "./types";

export interface Task {
  /** Stable, for React keys and for linking to the thing itself. */
  id: string;
  kind: "venue" | "confirm" | "pitch" | "follow" | "reply";
  title: string;
  detail: string;
  /** Where in the tour it's done. */
  tab: "book" | "fund";
  cityId?: string;
  brandId?: string;
  /** Waiting longer than it should: shown first. */
  overdue?: boolean;
}
export interface Progress {
  stops: number;
  venuesConfirmed: number;
  sponsors: number;
  pitchesSent: number;
  signed: number;
}

/** The sponsors a tour pitches first: the plan's top six by Sponsor Fit. */
export const PITCH_FIRST = 6;
/** Days a pitch waits for an answer before it's time to follow up. */
export const FOLLOW_UP_DAYS = 5;

const DAY = 86_400_000;
/** Whole days since a moment: for "sent 6 days ago". */
export const daysSince = (iso: string, now = Date.now()) => Math.floor((now - Date.parse(iso)) / DAY);

export function nextUp(plan: Pick<Plan, "route" | "cities" | "sponsors">, tracks: Track[], now = Date.now()): { tasks: Task[]; progress: Progress } {
  const city = (id: string) => plan.cities.find((c) => c.id === id);
  const venues = tracks.filter((t) => t.kind === "venue");
  const pitch = (brandId: string) => tracks.find((t) => t.kind === "sponsor" && t.itemId === brandId);
  const tasks: Task[] = [];

  let confirmed = 0;
  for (const stop of plan.route) {
    const name = city(stop.cityId)?.name ?? "this stop";
    const here = venues.filter((v) => v.cityId === stop.cityId);
    if (here.some((v) => v.status === "confirmed")) {
      confirmed++;
      continue;
    }
    const held = here.find((v) => v.status === "hold");
    if (held)
      tasks.push({ id: `confirm:${stop.cityId}`, kind: "confirm", title: `Confirm the date in ${name}`, detail: "A venue is holding it for you.", tab: "book", cityId: stop.cityId });
    else if (!here.some((v) => v.status === "asked"))
      tasks.push({ id: `venue:${stop.cityId}`, kind: "venue", title: `Find a venue in ${name}`, detail: "Afinlo has the venues these fans love there.", tab: "book", cityId: stop.cityId });
  }

  const top = plan.sponsors.slice(0, PITCH_FIRST);
  let sent = 0,
    signed = 0;
  for (const s of top) {
    const t = pitch(s.brand.id);
    const status = t?.status ?? "to_send";
    if (status !== "to_send" && status !== "passed") sent++;
    if (status === "signed") signed++;
    if (status === "to_send" && tasks.filter((x) => x.kind === "pitch").length < 3)
      tasks.push({ id: `pitch:${s.brand.id}`, kind: "pitch", title: `Send the pitch to ${s.brand.name}`, detail: `Sponsor Fit ${s.fit}: the email is drafted.`, tab: "fund", brandId: s.brand.id });
    if (status === "sent" && t) {
      const days = Math.floor((now - Date.parse(t.updatedAt)) / DAY);
      if (days >= FOLLOW_UP_DAYS)
        tasks.push({ id: `follow:${s.brand.id}`, kind: "follow", title: `Follow up with ${s.brand.name}`, detail: `Sent ${days} days ago, no answer yet.`, tab: "fund", brandId: s.brand.id, overdue: true });
    }
    if (status === "replied") tasks.push({ id: `reply:${s.brand.id}`, kind: "reply", title: `Reply to ${s.brand.name}`, detail: "They answered your pitch.", tab: "fund", brandId: s.brand.id, overdue: true });
  }

  // Overdue first, then holds to confirm, then the rest in route and Sponsor Fit order.
  const rank = (t: Task) => (t.overdue ? 0 : t.kind === "confirm" ? 1 : 2);
  tasks.sort((a, b) => rank(a) - rank(b));
  return { tasks, progress: { stops: plan.route.length, venuesConfirmed: confirmed, sponsors: top.length, pitchesSent: sent, signed } };
}
