"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUp, Check, Compass, Globe2, Handshake, ListChecks, LoaderCircle, Megaphone, Mic, MicOff, RefreshCw, Route as RouteIcon, Sprout, Users, Warehouse, type LucideIcon } from "lucide-react";
import type { AssistantCard, AssistantEvent, AssistantMessage } from "@/core/tour/types";
import { streamAssistant } from "./client";
import { Mascot } from "./Mascot";

/** What the assistant does, as buttons in the message box: each starts it. */
const ACTIONS: { icon: LucideIcon; label: string; say: string; tours?: boolean }[] = [
  { icon: RouteIcon, label: "Plan a tour", say: "I want to plan a tour." },
  { icon: Globe2, label: "Where are my fans?", say: "Where in the world are my fans?" },
  { icon: Sprout, label: "I'm just starting out", say: "I'm a new artist without many fans yet. Can I still go on tour?" },
  { icon: ListChecks, label: "What's next?", say: "What should I do next on my tours?", tours: true },
];
/** Under the box: what a tour covers, each a question about how Afinlo does it. */
const TOPICS: { icon: LucideIcon; label: string; say: string }[] = [
  { icon: RouteIcon, label: "Route", say: "How do you choose a tour's cities and their order?" },
  { icon: Warehouse, label: "Venues", say: "How do you find venues for a tour?" },
  { icon: Handshake, label: "Sponsors", say: "How do you find sponsors, and what do you send them?" },
  { icon: Users, label: "Fans", say: "What can you tell me about an act's fans?" },
  { icon: Megaphone, label: "Promotion", say: "How do you help promote the shows?" },
];
/** What floats beside the mascot: a hello, and something to ask. */
const BUBBLES = ["Where are my fans?", "Plan my first tour!"];

/** The browser's speech-to-text, where there is one (Chrome, Edge, Safari): just what the mic uses. */
interface Dictation {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
const dictation = () => {
  const w = window as unknown as { SpeechRecognition?: new () => Dictation; webkitSpeechRecognition?: new () => Dictation };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
/** Whether the browser has speech-to-text never changes while the page is open. */
const noChange = () => () => {};

/**
 * Home's assistant: the way in to Afinlo. It gets to know the user, finds the act in Qloo, shows where its fans are and
 * plans the tour, which comes back as a card to open; it also goes through the user's tours. Fresh, it greets by name
 * when it knows one, with its mascot and what it can do; the conversation is kept for this browser.
 */
export function AssistantChat({ hasTours, name }: { hasTours: boolean; name?: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [state, setState] = useState<{ status: "loading" | "ready" } | { status: "off"; note: string; retry?: boolean }>({ status: "loading" });
  const [text, setText] = useState("");
  const [steps, setSteps] = useState<string[]>();
  const [error, setError] = useState("");
  // The mic shows only where the browser can turn speech into text: never on the server, known once in a browser.
  const canDictate = useSyncExternalStore(
    noChange,
    () => !!dictation(),
    () => false,
  );
  const [listening, setListening] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<Dictation | null>(null);

  // The conversation so far; asked again from "Try again" when it couldn't be loaded.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/assistant")
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { ready?: boolean; error?: string; messages?: AssistantMessage[] };
        if (cancelled) return;
        if (!r.ok) return setState({ status: "off", note: "The assistant couldn't load your conversation.", retry: true });
        if (!body.ready) return setState({ status: "off", note: body.error ?? "The assistant isn't available right now." });
        setMessages(body.messages ?? []);
        setState({ status: "ready" });
      })
      .catch(() => !cancelled && setState({ status: "off", note: "The assistant couldn't be reached.", retry: true }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  useEffect(() => () => recognition.current?.stop(), []);

  useEffect(() => {
    if (messages.length || steps) end.current?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [messages, steps]);

  const send = async (message: string) => {
    const said = message.trim();
    if (!said || steps || state.status !== "ready") return;
    recognition.current?.stop();
    setText("");
    setError("");
    setMessages((v) => [...v, { role: "user", text: said }]);
    setSteps([]);
    try {
      const answer = await streamAssistant(said, (e: AssistantEvent) => setSteps((v) => [...(v ?? []), e.label]));
      setMessages((v) => [...v, { role: "assistant", text: answer.reply, ...(answer.cards.length ? { cards: answer.cards } : {}) }]);
      // A tour it planned goes on the list below too.
      if (answer.cards.length) router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSteps(undefined);
      input.current?.focus();
    }
  };

  const dictate = () => {
    if (listening) return recognition.current?.stop();
    const Recognition = dictation();
    if (!Recognition) return;
    const r = new Recognition();
    const before = text.trim();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const heard = Array.from(e.results, (result) => result[0]?.transcript ?? "").join("");
      setText(before ? `${before} ${heard}` : heard);
    };
    r.onend = r.onerror = () => {
      setListening(false);
      input.current?.focus();
    };
    recognition.current = r;
    setListening(true);
    r.start();
  };

  const tour = (c: AssistantCard) => (
    <div key={c.id} className="hl-assist-tour">
      <span className="hl-assist-tour-icon" aria-hidden>
        <Compass size={18} />
      </span>
      <span>
        <b>{c.title}</b>
        <small>
          {c.route.slice(0, 5).join(" → ")}
          {c.route.length > 5 ? ` +${c.route.length - 5}` : ""}
        </small>
      </span>
      <button type="button" className="hl-button hl-button-small" onClick={() => router.push(`/tour/${c.planId}`)}>
        Open the tour <ArrowRight size={15} aria-hidden />
      </button>
    </div>
  );

  const ready = state.status === "ready";
  // The welcome (greeting, mascot, topics) stays until the conversation starts, loaded or not.
  const fresh = !messages.length && !steps;
  const first = name?.trim().split(/\s+/)[0];
  const actions = ACTIONS.filter((a) => !a.tours || hasTours);
  return (
    <section className={`hl-assist${fresh ? " fresh" : ""}`} aria-labelledby="hl-assist-title">
      <div className="hl-assist-hero">
        <h1 id="hl-assist-title">
          <span>Hi {first ?? "there"},</span> ready to plan <br />
          your next tour?
        </h1>
      </div>

      {fresh && (
        <div className="hl-assist-stage">
          {BUBBLES.map((b, i) => (
            <button key={b} type="button" className={`hl-assist-bubble b${i + 1}`} disabled={!ready} onClick={() => void send(b)}>
              {b}
            </button>
          ))}
          <Mascot />
        </div>
      )}

      {state.status === "off" && (
        <p className="hl-note">
          {state.note}{" "}
          {state.retry && (
            <button type="button" className="hl-linkish" onClick={() => (setState({ status: "loading" }), setAttempt((n) => n + 1))}>
              <RefreshCw size={14} aria-hidden /> Try again
            </button>
          )}
        </p>
      )}

      {(!!messages.length || steps) && (
        <div className="hl-assist-log" role="log" aria-live="polite">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <p key={i} className="hl-team-msg user">
                {m.text}
              </p>
            ) : (
              <div key={i} className="hl-team-msg">
                <p>{m.text}</p>
                {!!m.cards?.length && <div className="hl-team-cards">{m.cards.map(tour)}</div>}
              </div>
            ),
          )}
          {steps && (
            <ol className="hl-team-steps" aria-label="What the assistant is doing">
              {[...(steps.length ? steps : ["Reading your message"])].map((s, i, all) => (
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
        className="hl-assist-box"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <div className="hl-assist-box-top">
          <span>
            Powered by Qloo&apos;s taste data: where an act&apos;s fans really are
          </span>
          <Link href="/plan" className="hl-assist-box-link">
            Prefer a form? <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
        <div className="hl-assist-box-main">
          <div className="hl-assist-input">
            <label htmlFor="hl-assist-input" className="hl-visually-hidden">
              A message to Afinlo
            </label>
            <textarea
              ref={input}
              id="hl-assist-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(text);
                }
              }}
              placeholder={state.status === "off" ? "The assistant isn't available" : listening ? "Listening…" : "Tell me about your act, or ask for a tour…"}
              rows={fresh ? 3 : 2}
              maxLength={1000}
              disabled={!ready || !!steps}
              autoFocus
            />
          </div>
          <div className="hl-assist-box-foot">
            <div className="hl-assist-actions">
              {actions.map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.label} type="button" disabled={!ready || !!steps} onClick={() => void send(a.say)}>
                    <Icon size={16} aria-hidden /> {a.label}
                  </button>
                );
              })}
            </div>
            <div className="hl-assist-send">
              {canDictate && (
                <button
                  type="button"
                  className={`hl-assist-mic${listening ? " on" : ""}`}
                  disabled={!ready || !!steps}
                  onClick={dictate}
                  aria-pressed={listening}
                  aria-label={listening ? "Stop dictating" : "Dictate a message"}
                  title={listening ? "Stop dictating" : "Dictate a message"}
                >
                  {listening ? <MicOff size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
                </button>
              )}
              <button type="submit" className="hl-assist-go" disabled={!ready || !!steps || !text.trim()} aria-label="Send">
                {steps ? <LoaderCircle size={18} className="hl-spin" aria-hidden /> : <ArrowUp size={20} aria-hidden />}
              </button>
            </div>
          </div>
        </div>
      </form>

      {fresh && (
        <ul className="hl-assist-topics" aria-label="Ask about">
          {TOPICS.map((t) => {
            const Icon = t.icon;
            return (
              <li key={t.label}>
                <button type="button" onClick={() => void send(t.say)}>
                  <Icon size={16} aria-hidden /> {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
