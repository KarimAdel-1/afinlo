"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Check, ChevronDown, ChevronUp, Eye, FileText, LoaderCircle, MessagesSquare, Route as RouteIcon, Sparkles, Undo2 } from "lucide-react";
import { SPECIALIST_LABELS, type ManagerCard, type ManagerEvent, type ManagerMessage, type Plan, type TourContext, type Track } from "@/core/tour/types";
import { streamChat } from "../client";
import type { TourActions } from "./TourView";

const DRAFT_KIND = { pitch: "Pitch", hold: "Hold request", post: "Post" } as const;

/** Whether a plan was made from this change's request: the same shows, area, start, cities and focus. */
const sameRequest = (plan: Plan, r: Plan["request"]) => {
  const p = plan.request;
  const ids = (a?: string[]) => [...(a ?? [])].sort().join();
  return p.stops === r.stops && JSON.stringify(p.where) === JSON.stringify(r.where) && p.homeCityId === r.homeCityId && p.focus === r.focus && ids(p.includeCityIds) === ids(r.includeCityIds) && ids(p.excludeCityIds) === ids(r.excludeCityIds);
};

/** A step the team is on, in words. */
function stepOf(e: ManagerEvent) {
  if (e.kind === "ask") return `${SPECIALIST_LABELS[e.agent]}: ${e.task.length > 90 ? `${e.task.slice(0, 88)}…` : e.task}`;
  if (e.kind === "tool") return `${e.agent === "manager" ? "Manager" : SPECIALIST_LABELS[e.agent]}: ${e.label}`;
  return `${SPECIALIST_LABELS[e.agent]} answered`;
}

/** What to try first, from this tour's own cities and sponsors. */
function suggestions(plan: Plan) {
  const name = (id?: string) => plan.cities.find((c) => c.id === id)?.name;
  const off = plan.cities.find((c) => !plan.route.some((r) => r.cityId === c.id));
  const brand = plan.sponsors[0]?.brand.name;
  return [
    name(plan.route[1]?.cityId) && `Why is ${name(plan.route[1]?.cityId)} on the route?`,
    off && `Why isn't ${off.name} on the route?`,
    plan.route.length < 12 && `Make it ${plan.route.length + 1} shows`,
    brand && `Draft the pitch to ${brand}`,
    "Who are the fans, and what else do they love?",
  ].filter((s): s is string => !!s);
}

/**
 * The tour's team, always at hand: a message bar at the foot of the tour, on every tab, that opens into the
 * conversation. The manager hands each message to its specialists (the route planner, venue booker, sponsor scout and
 * promoter) and replies from what they found in the tour's Qloo data. A change comes back to apply, a draft to open and
 * send, a status as set. Closed, the bar says what the team is doing and when it has replied. The conversation is kept
 * for this browser, through every change to the tour.
 */
export function TeamChat({ plan, actions, onTrack, context }: { plan: Plan; actions: TourActions; onTrack: (t: Omit<Track, "updatedAt">) => void; context?: TourContext }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ManagerMessage[]>([]);
  const [summary, setSummary] = useState("");
  const [state, setState] = useState<{ status: "loading" | "ready" } | { status: "off"; note: string }>({ status: "loading" });
  const [text, setText] = useState("");
  const [steps, setSteps] = useState<string[]>();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  // Whether it's open when a reply arrives, for the reply's "new" flag.
  const openNow = useRef(open);
  useEffect(() => {
    openNow.current = open;
  }, [open]);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/tour/plan/${plan.id}/chat`)
      .then((r) => r.json())
      .then((body: { ready?: boolean; error?: string; messages?: ManagerMessage[]; summary?: string }) => {
        if (cancelled) return;
        if (!body.ready) return setState({ status: "off", note: body.error ?? "The tour team isn't available right now." });
        setMessages(body.messages ?? []);
        setSummary(body.summary ?? "");
        setState({ status: "ready" });
      })
      .catch(() => !cancelled && setState({ status: "off", note: "The tour team couldn't be reached. Please reload the page." }));
    return () => {
      cancelled = true;
    };
  }, [plan.id]);

  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open, messages, steps]);

  const show = (v: boolean) => {
    setOpen(v);
    if (v) setUnread(false);
  };

  const send = async (message: string) => {
    const said = message.trim();
    if (!said || steps) return;
    setText("");
    setError("");
    setMessages((v) => [...v, { role: "user", text: said }]);
    setSteps([]);
    show(true);
    try {
      // What's on screen goes with the message, so "draft this" or "why here?" is about what the user is looking at.
      const answer = await streamChat(plan.id, said, (e) => setSteps((v) => [...(v ?? []), stepOf(e)]), context);
      for (const card of answer.cards) if (card.kind === "status") onTrack(card.track);
      // The team opened a tab, or a stop, for the user: the page goes there.
      const shown = answer.cards.findLast((c) => c.kind === "show");
      if (shown?.kind === "show") actions.goTo(shown.tab, shown.cityId);
      setMessages((v) => [...v, { role: "assistant", text: answer.reply, agents: answer.agents, cards: answer.cards }]);
      // A draft written, or brands found, are kept with the tour: the Fund tab lists them once the page catches up.
      if (answer.cards.some((c) => c.kind === "draft") || answer.agents.includes("sponsors")) router.refresh();
      if (!openNow.current) setUnread(true);
    } catch (e) {
      // What the team saved before the reply failed is applied and shown with the error, so the page matches the tour.
      const cards = (e as { cards?: ManagerCard[] }).cards ?? [];
      for (const card of cards) if (card.kind === "status") onTrack(card.track);
      if (cards.length) setMessages((v) => [...v, { role: "assistant", text: (e as Error).message, cards }]);
      else setError((e as Error).message);
      if (!openNow.current) setUnread(true);
    } finally {
      setSteps(undefined);
    }
  };

  const card = (c: ManagerCard) => {
    if (c.kind === "change")
      return (
        <div key={c.id} className="hl-team-card">
          <RouteIcon size={16} aria-hidden />
          <span>
            <b>A change to the tour</b>
            <small>{c.summary}</small>
          </span>
          {/* A change made for an earlier version would bring that version's choices back over this one's: it's shown,
              not applied. Ask again to have it made for this version. */}
          {c.request.parentId === plan.id ? (
            <button type="button" className="hl-button hl-button-small" onClick={() => actions.rerun(c.request)}>
              Apply
            </button>
          ) : plan.parentId === c.request.parentId && sameRequest(plan, c.request) ? (
            // This version is the change, applied: Undo goes back to the version it was made from, which is kept.
            <button type="button" className="hl-button hl-button-quiet hl-button-small" onClick={() => router.push(`/tour/${c.request.parentId}`)}>
              <Undo2 size={14} aria-hidden /> Undo
            </button>
          ) : (
            <small className="hl-team-card-note" title="The tour has changed since. Ask again to have this change made for the version you're looking at.">
              Made for an earlier version
            </small>
          )}
        </div>
      );
    if (c.kind === "show")
      return (
        <div key={c.id} className="hl-team-card">
          <Eye size={16} aria-hidden />
          <span>
            <b>Opened for you</b>
            <small>{c.text}</small>
          </span>
          <button type="button" className="hl-button hl-button-quiet hl-button-small" onClick={() => actions.goTo(c.tab, c.cityId)}>
            Go there
          </button>
        </div>
      );
    if (c.kind === "draft")
      return (
        <div key={c.id} className="hl-team-card">
          <FileText size={16} aria-hidden />
          <span>
            <b>
              {DRAFT_KIND[c.draft.type]} for {c.draft.to}
            </b>
            <small>{c.draft.language}</small>
          </span>
          <button type="button" className="hl-button hl-button-quiet hl-button-small" onClick={() => actions.openDraft({ to: c.draft.to, subject: c.draft.subject ?? `Post for ${c.draft.to}`, body: c.draft.body })}>
            Open
          </button>
        </div>
      );
    return (
      <div key={c.id} className="hl-team-card quiet">
        {c.kind === "status" ? <Check size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
        <span>
          <small>{c.text}</small>
        </span>
      </div>
    );
  };

  return (
    <section
      className={`hl hl-teamchat${open ? " open" : ""}`}
      aria-label="Your tour team"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          show(false);
          input.current?.focus();
        }
      }}
    >
      {open && (
        <div className="hl-teamchat-panel" id="hl-teamchat-panel">
          <div className="hl-teamchat-head">
            <span className="hl-teamchat-icon" aria-hidden>
              <MessagesSquare size={16} />
            </span>
            <span>
              <b>Your tour team</b>
              <small>A manager and four specialists, working from this tour&apos;s Qloo data</small>
            </span>
          </div>
          <div className="hl-team-log" role="log" aria-live="polite">
            {state.status === "off" && <p className="hl-note">{state.note}</p>}
            {state.status === "loading" && (
              <p className="hl-hint hl-wait">
                <LoaderCircle size={16} className="hl-spin" aria-hidden /> Opening the conversation…
              </p>
            )}
            {summary && <p className="hl-hint">Earlier: {summary}</p>}
            {state.status === "ready" && !messages.length && !steps && (
              <>
                <p className="hl-hint">Ask about the route, venues, sponsors or fans, or tell the team what to change. It drafts emails and posts too.</p>
                <div className="hl-picks-row">
                  {suggestions(plan).map((s) => (
                    <button key={s} type="button" className="hl-chip-button" onClick={() => void send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <p key={i} className="hl-team-msg user">
                  {m.text}
                </p>
              ) : (
                <div key={i} className="hl-team-msg">
                  {!!m.agents?.length && <small>{m.agents.map((a) => SPECIALIST_LABELS[a]).join(" · ")}</small>}
                  <p>{m.text}</p>
                  {!!m.cards?.length && <div className="hl-team-cards">{m.cards.map(card)}</div>}
                </div>
              ),
            )}
            {steps && (
              <ol className="hl-team-steps" aria-label="What the team is doing">
                {[...(steps.length ? steps : ["Manager: reading your message"])].map((s, i, all) => (
                  <li key={i}>
                    {i === all.length - 1 ? <LoaderCircle size={14} className="hl-spin" aria-hidden /> : <Check size={14} aria-hidden />} {s}
                  </li>
                ))}
              </ol>
            )}
            {error && (
              <p className="hl-error" role="alert">
                {error}
              </p>
            )}
            <div ref={end} />
          </div>
        </div>
      )}

      {/* Closed: what the team is doing, or that it has replied. */}
      {!open && (steps || unread) && (
        <button type="button" className="hl-teamchat-status" onClick={() => show(true)}>
          {steps ? <LoaderCircle size={14} className="hl-spin" aria-hidden /> : <span className="hl-teamchat-dot" aria-hidden />}
          {steps ? (steps.at(-1) ?? "Manager: reading your message") : error ? "The team couldn't answer. Show" : "The team replied. Show the reply"}
        </button>
      )}

      <form
        className="hl-team-ask"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <button
          type="button"
          className="hl-teamchat-toggle"
          aria-expanded={open}
          aria-controls="hl-teamchat-panel"
          aria-label={open ? "Hide the conversation" : "Show the conversation"}
          title={open ? "Hide the conversation" : "Show the conversation"}
          onClick={() => show(!open)}
        >
          {open ? <ChevronDown size={18} aria-hidden /> : <ChevronUp size={18} aria-hidden />}
          {unread && !open && <span className="hl-teamchat-dot" aria-hidden />}
        </button>
        <label htmlFor="hl-team-input" className="hl-visually-hidden">
          A message to the tour team
        </label>
        <textarea
          ref={input}
          id="hl-team-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
          placeholder={state.status === "off" ? "The tour team isn't available" : "Ask your tour team…"}
          rows={1}
          maxLength={1000}
          disabled={state.status !== "ready" || !!steps}
        />
        <button type="submit" className="hl-button" disabled={state.status !== "ready" || !!steps || !text.trim()} aria-label="Send">
          {steps ? <LoaderCircle size={18} className="hl-spin" aria-hidden /> : <ArrowUp size={18} aria-hidden />}
        </button>
      </form>
    </section>
  );
}
