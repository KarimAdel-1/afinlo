import Image from "next/image";
import Link from "next/link";
import { AlarmClock, ArrowRight, CalendarCheck, MessageSquareReply, Plus, Send } from "lucide-react";
import type { Progress, Task } from "@/core/tour/next";
import { tileColor } from "./format";

export interface TourCard {
  id: string;
  act: { name: string; image?: string };
  title: string;
  route: string[];
  progress: Progress;
  savedAt?: string;
  example?: boolean;
  /** For an example: its sponsors and distance, in place of progress nobody has made. */
  facts?: string;
}
export interface TourTask extends Task {
  planId: string;
  act: string;
}

const ICON = { venue: CalendarCheck, confirm: CalendarCheck, pitch: Send, follow: AlarmClock, reply: MessageSquareReply };
const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" });

/** What needs doing across every tour, the most pressing first. */
export function TodayList({ tasks }: { tasks: TourTask[] }) {
  return (
    <ol className="hl-tasks">
      {tasks.map((t) => {
        const Icon = ICON[t.kind];
        const href = `/tour/${t.planId}?tab=${t.tab}${t.cityId ? `&stop=${encodeURIComponent(t.cityId)}` : ""}`;
        return (
          <li key={`${t.planId}:${t.id}`} className={t.overdue ? "late" : ""}>
            <Link href={href}>
              <span className="hl-task-icon" aria-hidden>
                <Icon size={18} />
              </span>
              <span className="hl-task-text">
                <b>{t.title}</b>
                <small>
                  {t.act} · {t.detail}
                </small>
              </span>
              <ArrowRight size={16} aria-hidden />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/** A tour as a card: the act's photo, where it goes, and how far it's got. */
export function TourCards({ tours }: { tours: TourCard[] }) {
  return (
    <ul className="hl-tourcards">
      {tours.map((t) => {
        const booked = t.progress.stops ? Math.round((100 * t.progress.venuesConfirmed) / t.progress.stops) : 0;
        return (
          <li key={t.id}>
            <Link href={`/tour/${t.id}`} className="hl-tourcard">
              <span className="hl-tourcard-cover" style={t.act.image ? undefined : { background: tileColor(t.act.name) }}>
                {t.act.image && <Image src={t.act.image} alt="" fill sizes="(max-width: 700px) 92vw, 360px" />}
                <span className="hl-tourcard-shade" />
                <span className="hl-tourcard-name">
                  <b>{t.act.name}</b>
                  <small>{t.title}</small>
                </span>
                {t.example && <span className="hl-tourcard-tag">Example</span>}
              </span>
              <span className="hl-tourcard-body">
                <span className="hl-tourcard-route">{t.route.slice(0, 4).join(" → ")}{t.route.length > 4 ? ` +${t.route.length - 4}` : ""}</span>
                {t.example ? (
                  <span className="hl-tourcard-meta">
                    <span>{t.facts}</span>
                    <span className="hl-tourcard-open">Open</span>
                  </span>
                ) : (
                  <>
                    <span className="hl-tourcard-meter" aria-label={`${t.progress.venuesConfirmed} of ${t.progress.stops} venues confirmed`}>
                      <span style={{ width: `${booked}%` }} />
                    </span>
                    <span className="hl-tourcard-meta">
                      <span>
                        {t.progress.venuesConfirmed}/{t.progress.stops} venues · {t.progress.pitchesSent} pitches out
                        {t.progress.signed ? ` · ${t.progress.signed} signed` : ""}
                      </span>
                      {t.savedAt && <span>{DAY.format(new Date(t.savedAt))}</span>}
                    </span>
                  </>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function NewTourCard() {
  return (
    <Link href="/plan" className="hl-newtour">
      <span aria-hidden>
        <Plus size={22} />
      </span>
      <b>New tour</b>
      <small>Any artist or comedian, anywhere in the world</small>
    </Link>
  );
}
