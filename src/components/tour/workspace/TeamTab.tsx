"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, FileText, LoaderCircle, Route as RouteIcon, Sparkles } from "lucide-react";
import { SPECIALIST_LABELS, type ManagerCard, type ManagerEvent, type ManagerMessage, type Plan, type Track } from "@/core/tour/types";
import { streamChat } from "../client";
import type { TourActions } from "./TourView";

const DRAFT_KIND = { pitch: "Pitch", hold: "Hold request", post: "Post" } as const;

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
 * The tour's team, to talk to: a manager who hands each question to its specialists (the route planner, venue booker,
 * sponsor scout and promoter) and replies from what they found in the tour's Qloo data. A change comes back to apply,
 * a draft to open and send, a status as set. The conversation is kept for this browser, through every change.
 */
export function TeamTab({ plan, actions, onTrack }: { plan: Plan; actions: TourActions; onTrack: (t: Omit<Track, "updatedAt">) => void }) {
  const [messages, setMessages] = useState<ManagerMessage[]>([]);
  const [summary, setSummary] = useState("");
  const [state, setState] = useState<{ status: "loading" | "ready" } | { status: "off"; note: string }>({ status: "loading" });
  const [text, setText] = useState("");
  const [steps, setSteps] = useState<string[]>();
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

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
    end.current?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [messages, steps]);

  const send = async (message: string) => {
    const said = message.trim();
    if (!said || steps) return;
    setText("");
    setError("");
    setMessages((v) => [...v, { role: "user", text: said }]);
    setSteps([]);
    try {
      const answer = await streamChat(plan.id, said, (e) => setSteps((v) => [...(v ?? []), stepOf(e)]));
      for (const card of answer.cards) if (card.kind === "status") onTrack(card.track);
      setMessages((v) => [...v, { role: "assistant", text: answer.reply, agents: answer.agents, cards: answer.cards }]);
    } catch (e) {
      setError((e as Error).message);
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
          <button type="button" className="hl-button hl-button-small" onClick={() => actions.rerun(c.request)}>
            Apply
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
    <section className="hl-team" aria-labelledby="hl-team-title">
      <div className="hl-section-head">
        <h2 id="hl-team-title">Your tour team</h2>
        <p>Ask anything about this tour. The manager hands it to the route planner, venue booker, sponsor scout or promoter, who answer from the tour&apos;s Qloo data.</p>
      </div>

      {state.status === "off" && <p className="hl-note">{state.note}</p>}
      {state.status === "loading" && (
        <p className="hl-hint hl-wait">
          <LoaderCircle size={16} className="hl-spin" aria-hidden /> Opening the conversation…
        </p>
      )}

      {state.status === "ready" && (
        <div className="hl-team-log" role="log" aria-live="polite">
          {summary && <p className="hl-hint">Earlier: {summary}</p>}
          {!messages.length && !steps && (
            <div className="hl-picks-row">
              {suggestions(plan).map((s) => (
                <button key={s} type="button" className="hl-chip-button" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
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
      )}

      <form
        className="hl-team-ask"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <label htmlFor="hl-team-input" className="hl-visually-hidden">
          A message to the tour team
        </label>
        <textarea
          id="hl-team-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
          placeholder={state.status === "off" ? "The team isn't available" : "Ask the team, or tell it what to change"}
          rows={2}
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
