"use client";

import { AlarmClock, ArrowRight, CalendarCheck, CheckCircle2, MessageSquareReply, Send } from "lucide-react";
import { daysSince, type Progress, type Task } from "@/core/tour/next";
import type { Plan } from "@/core/tour/types";
import { followUpDraft, sponsorDraft } from "./drafts";
import type { TourActions } from "./TourView";

const ICON = { venue: CalendarCheck, confirm: CalendarCheck, pitch: Send, follow: AlarmClock, reply: MessageSquareReply };

/** What to do next on this tour, in order, each a click from done. */
export function NextTab({ plan, tasks, progress, actions }: { plan: Plan; tasks: Task[]; progress: Progress; actions: TourActions }) {
  const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
  const act = (t: Task) => {
    const sponsor = plan.sponsors.find((s) => s.brand.id === t.brandId);
    if (t.kind === "pitch" && sponsor) return actions.openDraft(sponsorDraft(plan, sponsor), { label: "Mark as sent", run: () => actions.setTrack("sponsor", sponsor.brand.id, "sent") });
    if (t.kind === "follow" && sponsor) {
      const sent = actions.statusOf("sponsor", sponsor.brand.id);
      const days = sent ? daysSince(sent.updatedAt) : 5;
      return actions.openDraft(followUpDraft(plan, sponsor, days), { label: "Mark as followed up", run: () => actions.setTrack("sponsor", sponsor.brand.id, "sent") });
    }
    actions.goTo(t.tab, t.cityId);
  };
  return (
    <>
      <div className="hl-section-head">
        <h2>Next up</h2>
        <p>Afinlo keeps track: every stop needs a venue, the best sponsors get a pitch, and a pitch with no answer after five days gets a follow-up.</p>
      </div>
      <section className="hl-card hl-progress" aria-label="How far the tour has got">
        <div>
          <small>Venues confirmed</small>
          <b>
            {progress.venuesConfirmed} of {progress.stops}
          </b>
          <span className="hl-meter" aria-hidden>
            <span style={{ width: `${pct(progress.venuesConfirmed, progress.stops)}%` }} />
          </span>
        </div>
        <div>
          <small>Pitches out</small>
          <b>
            {progress.pitchesSent} of {progress.sponsors}
          </b>
          <span className="hl-meter" aria-hidden>
            <span style={{ width: `${pct(progress.pitchesSent, progress.sponsors)}%` }} />
          </span>
        </div>
        <div>
          <small>Sponsors signed</small>
          <b>{progress.signed}</b>
          <span className="hl-meter lime" aria-hidden>
            <span style={{ width: `${pct(progress.signed, progress.sponsors)}%` }} />
          </span>
        </div>
      </section>
      {tasks.length ? (
        <ol className="hl-tasks">
          {tasks.map((t) => {
            const Icon = ICON[t.kind];
            return (
              <li key={t.id} className={t.overdue ? "late" : ""}>
                <button type="button" onClick={() => act(t)}>
                  <span className="hl-task-icon" aria-hidden>
                    <Icon size={18} />
                  </span>
                  <span className="hl-task-text">
                    <b>{t.title}</b>
                    <small>{t.detail}</small>
                  </span>
                  <ArrowRight size={16} aria-hidden />
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="hl-card hl-alldone">
          <CheckCircle2 size={28} aria-hidden />
          <b>Nothing waiting</b>
          <p>Every stop has a confirmed venue, and every pitch is out or answered.</p>
        </div>
      )}
    </>
  );
}
