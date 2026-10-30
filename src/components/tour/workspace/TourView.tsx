"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, BadgeCheck, Bookmark, BookmarkCheck, CalendarCheck, Download, Handshake, Link2, ListChecks, LoaderCircle, Megaphone, Route as RouteIcon, X } from "lucide-react";
import { nextUp } from "@/core/tour/next";
import type { ActMemory, TourStage, Plan, PlanInput, Track } from "@/core/tour/types";
import { AgentTrace } from "../AgentTrace";
import { Avatar } from "../Avatar";
import { postJson, streamPlan } from "../client";
import { TourMap, type MapSpot, type MapStop } from "../TourMap";
import { BookTab } from "./BookTab";
import type { Draft } from "./drafts";
import { FundTab } from "./FundTab";
import { NextTab } from "./NextTab";
import { DraftDialog } from "./parts";
import { PlanTab } from "./PlanTab";
import { PromoteTab } from "./PromoteTab";
import { TeamChat } from "./TeamChat";
import { useGuides, useTracks } from "./state";

export type Tab = "plan" | "book" | "fund" | "promote" | "next";
/** The tabs. The tour team isn't one: it's at the foot of every tab (TeamChat). */
const TABS: { id: Tab; label: string; icon: typeof RouteIcon }[] = [
  { id: "plan", label: "Plan", icon: RouteIcon },
  { id: "book", label: "Book", icon: CalendarCheck },
  { id: "fund", label: "Fund", icon: Handshake },
  { id: "promote", label: "Promote", icon: Megaphone },
  { id: "next", label: "Next up", icon: ListChecks },
];

/** What a tab hands back up: a draft to show, a status to record. */
export interface TourActions {
  openDraft: (draft: Draft, done?: { label: string; run: () => void }) => void;
  setTrack: (kind: Track["kind"], itemId: string, status: string, cityId?: string) => void;
  statusOf: (kind: Track["kind"], itemId: string) => Track | undefined;
  /** How far a stop's booking has got: its venue furthest along (confirmed, then on hold, then asked). */
  venueFor: (cityId: string) => Track | undefined;
  goTo: (tab: Tab, stop?: string) => void;
  rerun: (change: Partial<PlanInput>) => void;
  /** Points the map at a place in the list (a venue, a partner), or at none. */
  pointAt: (placeId?: string) => void;
  /** Says no to a brand or city for this act's next tours. */
  remember: (add: { excludeBrandIds?: string[]; excludeCityIds?: string[] }) => Promise<void>;
}

/**
 * A tour, as a workspace: the plan on the left in five tabs (the route, booking the venues, funding it with sponsors,
 * reaching the fans, what to do next), the real map on the right, following whichever stop is in hand, and the tour
 * team's message bar at the foot of every tab.
 */
export function TourView({
  plan,
  tracks: initialTracks,
  home,
  memory,
  saved: initiallySaved,
  initialTab = "plan",
  initialStop,
}: {
  plan: Plan;
  tracks: Track[];
  home?: { name: string; lat: number; lon: number };
  memory?: ActMemory;
  saved: boolean;
  initialTab?: Tab;
  initialStop?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [stop, setStop] = useState<string | undefined>(initialStop ?? plan.route[0]?.cityId);
  const [active, setActive] = useState<string>();
  const [activeSpot, setActiveSpot] = useState<string>();
  const [draft, setDraft] = useState<{ draft: Draft; done?: { label: string; run: () => void } }>();
  const [copied, setCopied] = useState(false);
  const [deck, setDeck] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [run, setRun] = useState<{ stages: TourStage[]; error?: string }>();
  const [saved, setSaved] = useState(initiallySaved);
  const [turnedDown, setTurnedDown] = useState<string[]>(memory?.excludeBrandIds ?? []);
  const { tracks, statusOf, set, saved: savedTrack, error: trackError } = useTracks(plan.id, initialTracks);
  const { guides, load } = useGuides(plan.id);

  const city = (id: string) => plan.cities.find((c) => c.id === id);
  const routeCities = plan.route.map((r) => city(r.cityId)).filter((c): c is Plan["cities"][number] => !!c);
  const totalKm = plan.route.reduce((s, r) => s + r.legKm, 0);
  const flights = plan.route.filter((r) => r.mode === "fly").length;
  const { tasks, progress } = useMemo(() => nextUp(plan, tracks, { turnedDown }), [plan, tracks, turnedDown]);

  // The stop in hand loads its places when a tab needs them.
  useEffect(() => {
    if ((tab === "book" || tab === "promote") && stop) void load(stop);
  }, [tab, stop, load]);

  // The tab and stop stay in the address, so a link opens where it was shared from.
  useEffect(() => {
    const q = new URLSearchParams();
    if (tab !== "plan") q.set("tab", tab);
    if ((tab === "book" || tab === "promote") && stop && stop !== plan.route[0]?.cityId) q.set("stop", stop);
    const url = `${location.pathname}${q.size ? `?${q}` : ""}`;
    if (url !== `${location.pathname}${location.search}`) history.replaceState(null, "", url);
  }, [tab, stop, plan.route]);

  const stops: MapStop[] = useMemo(
    () =>
      plan.route.flatMap((r) => {
        const c = city(r.cityId);
        return c ? [{ id: c.id, name: c.name, lat: c.lat, lon: c.lon, hidden: c.hidden, leg: r.mode, detail: `Fan Heat ${c.heat}${c.hidden ? " · hidden market" : ""}` }] : [];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan],
  );
  const guide = stop ? guides[stop] : undefined;
  const spots: MapSpot[] = useMemo(() => {
    if (guide?.status !== "ready" || (tab !== "book" && tab !== "promote")) return [];
    const places = tab === "book" ? guide.guide.venues : [...guide.guide.leads, ...guide.guide.loved];
    return places.flatMap((p) => (p.lat !== undefined && p.lon !== undefined ? [{ id: p.id, name: p.name, detail: p.kind, lat: p.lat, lon: p.lon }] : []));
  }, [guide, tab]);
  const stopCity = stop ? city(stop) : undefined;
  const focus = (tab === "book" || tab === "promote") && stopCity ? { lat: stopCity.lat, lon: stopCity.lon, zoom: 10.5 } : undefined;

  const actions: TourActions = {
    openDraft: (d, done) => setDraft({ draft: d, done }),
    setTrack: (kind, itemId, status, cityId) => void set(kind, itemId, status, cityId),
    statusOf,
    venueFor: (cityId) => {
      const order = ["confirmed", "hold", "asked"];
      return tracks
        .filter((t) => t.kind === "venue" && t.cityId === cityId && order.includes(t.status))
        .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))[0];
    },
    goTo: (t, s) => {
      setTab(t);
      if (s) setStop(s);
      window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    },
    rerun: (change) => void rerun(change),
    pointAt: setActiveSpot,
    remember: async (add) => {
      if (add.excludeBrandIds) setTurnedDown((v) => [...new Set([...v, ...add.excludeBrandIds!])]);
      await postJson(`/api/tour/acts/${plan.act.id}/memory`, { add, planId: plan.id }).catch(() => undefined);
    },
  };

  async function rerun(change: Partial<PlanInput>) {
    setRun({ stages: [] });
    try {
      const id = await streamPlan({ ...plan.request, ...change, parentId: plan.id } as PlanInput, (s) => setRun((r) => ({ stages: [...(r?.stages ?? []), s] })));
      router.push(`/tour/${id}${tab !== "plan" ? `?tab=${tab}` : ""}`);
    } catch (e) {
      setRun((r) => ({ stages: r?.stages ?? [], error: (e as Error).message }));
    }
  }
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  const downloadDeck = async () => {
    setDeck({ busy: true });
    try {
      const res = await fetch(`/api/tour/plan/${plan.id}/pdf`);
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The deck couldn't be made. Please try again.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${plan.act.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "afinlo"}-pitch-deck.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDeck({ busy: false });
    } catch (e) {
      setDeck({ busy: false, error: (e as Error).message });
    }
  };
  const save = async () => {
    const res = await fetch("/api/tour/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: plan.id }) }).catch(() => undefined);
    if (res?.ok) setSaved(true);
  };

  return (
    <div className="hl hl-tour">
      <div className="hl-tour-side">
        <header className="hl-tour-head">
          <Link className="hl-back" href="/home">
            <ArrowLeft size={16} aria-hidden /> Your tours
          </Link>
          <div className="hl-tour-id">
            <Avatar name={plan.act.name} image={plan.act.image} size={56} />
            <div style={{ minWidth: 0 }}>
              <h1>{plan.act.name}</h1>
              <p>
                {plan.route.length}-stop tour{plan.area ? ` of ${plan.area}` : ""}
                {totalKm ? ` · ${totalKm.toLocaleString("en-US")} km` : ""}
                {flights ? ` · ${flights} ${flights === 1 ? "flight" : "flights"}` : ""}
              </p>
            </div>
          </div>
          {/* Whose data it is and how far the tour has got, on one line. */}
          <div className="hl-tour-meta">
            <div className="hl-tour-chips">
              {plan.signal.basis === "act" ? (
                <span className="hl-chip hl-chip-good">
                  <BadgeCheck size={14} aria-hidden /> From {plan.act.name}&apos;s own Qloo data
                </span>
              ) : plan.signal.basis === "named" ? (
                <span className="hl-chip hl-chip-warn">
                  <AlertTriangle size={14} aria-hidden /> Predicted from {plan.signal.similar.map((a) => a.name).join(", ")}
                </span>
              ) : (
                <span className="hl-chip hl-chip-warn">
                  <AlertTriangle size={14} aria-hidden /> Estimated from similar acts
                </span>
              )}
              {plan.example && <span className="hl-chip hl-chip-blue">Example</span>}
            </div>
            <div className="hl-tour-progress" aria-label="Progress">
              <span>
                <b>
                  {progress.venuesConfirmed}/{progress.stops}
                </b>{" "}
                venues confirmed
              </span>
              <span>
                <b>
                  {progress.pitchesSent}/{progress.sponsors}
                </b>{" "}
                pitches out
              </span>
              <span>
                <b>{progress.signed}</b> signed
              </span>
            </div>
          </div>
          <div className="hl-tour-actions">
            <button type="button" className="hl-button hl-button-quiet hl-button-small" onClick={() => void copyLink()}>
              <Link2 size={15} aria-hidden /> {copied ? "Copied" : "Share"}
            </button>
            <button type="button" className="hl-button hl-button-quiet hl-button-small" onClick={() => void downloadDeck()} disabled={deck.busy}>
              {deck.busy ? <LoaderCircle size={15} className="hl-spin" aria-hidden /> : <Download size={15} aria-hidden />} {deck.busy ? "Preparing…" : "Pitch deck"}
            </button>
            {saved ? (
              <span className="hl-saved-flag">
                <BookmarkCheck size={15} aria-hidden /> In your tours
              </span>
            ) : (
              <button type="button" className="hl-button hl-button-small" onClick={() => void save()}>
                <Bookmark size={15} aria-hidden /> Save to your tours
              </button>
            )}
          </div>
          {deck.error && (
            <p className="hl-note" role="alert">
              <AlertTriangle size={16} aria-hidden /> {deck.error}{" "}
              <Link href={`/deck/${plan.id}`} style={{ textDecoration: "underline" }}>
                Open the deck
              </Link>
            </p>
          )}
        </header>

        <nav className="hl-tabs" aria-label="Tour">
          {TABS.map((t) => {
            const Icon = t.icon;
            const count = t.id === "next" ? tasks.length : 0;
            return (
              <button key={t.id} type="button" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
                <Icon size={16} aria-hidden /> {t.label}
                {!!count && <span className="hl-tab-count">{count}</span>}
              </button>
            );
          })}
        </nav>

        {trackError && (
          <p className="hl-error" role="alert">
            {trackError}
          </p>
        )}
        {!!plan.notes.length && tab === "plan" && (
          <div className="hl-notes">
            {plan.notes.map((n) => (
              <p className="hl-note" key={n}>
                <AlertTriangle size={16} aria-hidden /> {n}
              </p>
            ))}
          </div>
        )}

        <div className="hl-tour-body">
          {tab === "plan" && <PlanTab plan={plan} routeCities={routeCities} active={active} onActive={setActive} actions={actions} running={!!run && !run.error} />}
          {tab === "book" && <BookTab plan={plan} stop={stop} onStop={setStop} guide={guide} reload={(id) => void load(id, true)} actions={actions} />}
          {tab === "fund" && <FundTab plan={plan} turnedDown={turnedDown} actions={actions} deck={{ busy: deck.busy, download: () => void downloadDeck() }} />}
          {tab === "promote" && <PromoteTab plan={plan} stop={stop} onStop={setStop} guide={guide} reload={(id) => void load(id, true)} />}
          {tab === "next" && <NextTab plan={plan} tasks={tasks} progress={progress} actions={actions} />}
        </div>
      </div>

      <div className="hl-tour-map">
        <TourMap
          points={plan.heatPoints}
          stops={stops}
          home={home}
          spots={spots}
          active={active}
          activeSpot={activeSpot}
          onActive={setActive}
          onSelect={(id) => {
            setStop(id);
            if (tab === "plan" || tab === "fund" || tab === "next") setTab("book");
          }}
          focus={focus}
          label={`Map of ${plan.act.name}'s tour: Qloo's heatmap of where the fans are, and the route`}
        />
        <div className="hl-map-key" aria-hidden>
          {plan.signal.basis === "named" && (
            <>
              <b>Predicted</b>
              <span className="hl-map-key-sep" />
            </>
          )}
          <span className="hl-map-key-heat">Fewer fans</span>
          <span className="hl-map-key-grad" />
          <span className="hl-map-key-heat">More fans</span>
          <span className="hl-map-key-sep" />
          <span className="hl-pin mini">1</span> Stop
          <span className="hl-pin mini lime">2</span> Hidden market
        </div>
      </div>

      {run && (
        <div className="hl-replan" role="dialog" aria-label="Changing the plan">
          <div className="hl-replan-card">
            <h2>{run.error ? "That didn't work" : "Changing the plan"}</h2>
            <p>{run.error ?? "Afinlo is planning again with your change. Qloo's answers are cached, so it's quick."}</p>
            <AgentTrace stages={run.stages} running={!run.error} />
            {run.error && (
              <button type="button" className="hl-button hl-button-quiet hl-button-small" onClick={() => setRun(undefined)}>
                <X size={15} aria-hidden /> Close
              </button>
            )}
          </div>
        </div>
      )}
      <TeamChat plan={plan} actions={actions} onTrack={savedTrack} />
      {draft && <DraftDialog draft={draft.draft} done={draft.done} onClose={() => setDraft(undefined)} />}
    </div>
  );
}
