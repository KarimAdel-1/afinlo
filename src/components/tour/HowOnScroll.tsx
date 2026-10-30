"use client";

// How it works, on the landing page: the steps scroll past on the left, and on the right the step being read runs its
// piece of the app in a loop, on one real tour's data (platform/tour/story.ts). GSAP's ScrollTrigger ties the handover
// between steps to the scroll position, set up for each screen shape.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, ArrowUp, Check, Copy, LoaderCircle, MousePointer2, Search, Sparkles } from "lucide-react";
import { gsap } from "@/components/site/gsap";
import type { HowStory } from "@/platform/tour/story";
import { Avatar } from "./Avatar";
import { MapLoop } from "./MapLoop";
import { CLEAR_S, reelDelay, REEL_S } from "./reel";
import { RING } from "./sponsors";
import { part, useLoop } from "./useLoop";

/** Card above the text, on a tall narrow screen; base.css has the same rule. Anything else keeps the two side by side. */
const STACKED = "(max-width: 860px) and (min-height: 560px)";
/** Starts fast and settles, for anything that fills. */
const settle = (p: number) => 1 - (1 - p) ** 3;
const typed = (text: string, progress: number) => text.slice(0, Math.round(progress * text.length));

/** A score out of 100 as a ring, as on the Fund tab, filled by `p` from 0 to 1. */
function Ring({ value, p }: { value: number; p: number }) {
  return (
    <div className="hl-ring small">
      <svg viewBox="0 0 58 58">
        <circle className="track" cx="29" cy="29" r="24" />
        <circle className="value" cx="29" cy="29" r="24" strokeDasharray={`${(p * value * RING) / 100} ${RING}`} />
      </svg>
      <b>{Math.round(p * value)}</b>
    </div>
  );
}

function SearchStep({ active, story }: { active: boolean; story: HowStory }) {
  const t = useLoop(active, 8600);
  const text = typed(story.actName, part(t, 400, 1500));
  const typing = t >= 400 && t < 1500;
  const loading = t >= 1500 && t < 2400;
  const open = t >= 2400;
  const near = part(t, 3100, 3800);
  const picked = t >= 3900;
  return (
    <div className="hl-how-card pad" style={{ opacity: 1 - part(t, 8000, 8500) }}>
      <div className={`hl-how-field${text ? " on" : ""}`}>
        {loading ? <LoaderCircle size={20} className="hl-spin" /> : <Search size={20} />}
        <span className={text ? "" : "empty"}>
          {text || "An artist or comedian"}
          {typing && <i className="hl-how-caret" />}
        </span>
        <span className="hl-button">
          <span>Plan a tour</span>
          <ArrowRight size={18} />
        </span>
      </div>
      <ul className="hl-how-rows">
        {story.results.map((r, i) => (
          <li key={r.id} className={`hl-result-row${picked && i === 0 ? " on" : ""}`} style={{ opacity: open ? 1 : 0, transform: open ? "none" : "translateY(-8px)", transitionDelay: open ? `${i * 110}ms` : "0ms" }}>
            <Avatar name={r.name} image={r.image} size={52} />
            <span style={{ minWidth: 0 }}>
              <b>{r.name}</b>
              <small>{r.about}</small>
            </span>
            <ArrowRight size={18} />
          </li>
        ))}
      </ul>
      <MousePointer2 className={`hl-how-cursor${picked ? " down" : ""}`} size={24} style={{ opacity: near > 0 ? 1 : 0, left: `${82 - near * 34}%`, top: `${86 - near * 50}%` }} />
    </div>
  );
}

function FansStep({ active, story }: { active: boolean; story: HowStory }) {
  const t = useLoop(active, 12000);
  return (
    <div className="hl-how-card pad">
      <div className="hl-how-map">
        <MapLoop points={story.points} area={story.cities} t={t} active={active} label={`Qloo's heatmap of ${story.actName}'s fans in ${story.area}`} />
      </div>
      <ul className="hl-how-list" style={{ opacity: 1 - part(t, 11200, 11800) }}>
        {story.cities.map((c, i) => {
          const on = t >= 700 + i * 450;
          return (
            <li key={c.name} style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(10px)" }}>
              <Avatar name={c.name} size={48} />
              <span style={{ minWidth: 0 }}>
                <b>{c.name}</b>
                <small>{c.country}</small>
              </span>
              {c.hidden && <em className="s-2">Hidden market</em>}
              <Ring value={c.heat} p={settle(part(t, 800 + i * 450, 1800 + i * 450))} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RouteStep({ active, story }: { active: boolean; story: HowStory }) {
  // In time with the map: a row comes up as the camera reaches its stop.
  const t = useLoop(active, REEL_S * 1000);
  const shown = t >= CLEAR_S * 1000 ? 0 : story.route.filter((_, i) => t >= reelDelay(i, story.route.length) * 1000).length;
  return (
    <div className="hl-how-card pad">
      <div className="hl-how-map">
        <MapLoop points={story.points} stops={story.mapStops} t={t} active={active} label={`${story.actName}'s tour of ${story.area}, over Qloo's heatmap`} />
      </div>
      <div className="hl-how-window">
        <ul className="hl-how-list" style={{ "--shown": shown } as CSSProperties}>
          {story.route.map((s, i) => {
            const at = reelDelay(i, story.route.length) * 1000;
            return (
              <li key={s.name} style={{ opacity: i < shown ? 1 : 0 }}>
                <span className={`hl-tile hl-how-number${s.hidden ? " lime" : ""}`}>{i + 1}</span>
                <span style={{ minWidth: 0 }}>
                  <b>{s.name}</b>
                  <small>{s.leg}</small>
                </span>
                {s.hidden && <em className="s-2">Hidden market</em>}
                <Ring value={s.heat} p={settle(part(t, at, at + 800))} />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

const VENUE_STEPS = ["To contact", "Asked", "On hold", "Confirmed"];
function VenuesStep({ active, story }: { active: boolean; story: HowStory }) {
  const t = useLoop(active, 11000);
  const stage = (i: number) => [1200, 2200, 3200].filter((at) => t >= at + i * 1300).length;
  const confirmed = story.venues.filter((_, i) => stage(i) === 3).length;
  return (
    <div className="hl-how-card pad" style={{ opacity: 1 - part(t, 10400, 10900) }}>
      <h4 className="hl-how-head">
        <b>
          {confirmed}/{story.stops}
        </b>{" "}
        venues confirmed
      </h4>
      <ul className="hl-how-list">
        {story.venues.map((v, i) => (
          <li key={v.id}>
            <Avatar name={v.name} image={v.image} size={48} />
            <span style={{ minWidth: 0 }}>
              <b>{v.name}</b>
              <small>{v.city}</small>
            </span>
            <em className={`s-${stage(i)}`}>{VENUE_STEPS[stage(i)]}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SponsorsStep({ active, story }: { active: boolean; story: HowStory }) {
  const t = useLoop(active, 14000);
  const body = story.email?.body.slice(0, 250) ?? "";
  return (
    <div className="hl-how-card pad" style={{ opacity: 1 - part(t, 13400, 13900) }}>
      <ul className="hl-how-sponsors">
        {story.sponsors.map((s, i) => {
          const p = part(t, 300 + i * 500, 1200 + i * 500);
          return (
            <li key={s.id}>
              <Avatar name={s.name} image={s.image} size={44} fit="contain" />
              <span style={{ minWidth: 0 }}>
                <b>{s.name}</b>
                <small>{s.category}</small>
              </span>
              <Ring value={s.fit} p={settle(p)} />
            </li>
          );
        })}
      </ul>
      {story.email && (
        <div className="hl-how-draft" style={{ opacity: t >= 2600 ? 1 : 0 }}>
          <small>To {story.email.to}&apos;s partnerships team</small>
          <b>{story.email.subject}</b>
          <p>{typed(body, part(t, 3000, 9000))}</p>
          <span className={`hl-how-copy${t >= 10000 ? " on" : ""}`}>
            {t >= 10000 ? <Check size={15} /> : <Copy size={15} />} {t >= 10000 ? "Copied" : "Copy"}
          </span>
        </div>
      )}
    </div>
  );
}

function TeamStep({ active, story }: { active: boolean; story: HowStory }) {
  const t = useLoop(active, 16000);
  const first = `Why is ${story.ask.city} on the route?`;
  const shows = story.stops + 1;
  const second = `Make it ${shows} shows`;
  const writing = t < 1500 ? typed(first, part(t, 300, 1400)) : t >= 6400 && t < 7500 ? typed(second, part(t, 6400, 7400)) : "";
  const step = (label: string, from: number, done: number) =>
    t >= from && (
      <li>
        {t >= done ? <Check size={15} /> : <LoaderCircle size={15} className="hl-spin" />} {label}
      </li>
    );
  return (
    <div className="hl-how-card pad" style={{ opacity: 1 - part(t, 15300, 15900) }}>
      <div className="hl-how-chat">
        {t >= 1500 && <p className="user">{first}</p>}
        {t >= 1700 && (
          <ol>
            {step("Asking the route planner", 1700, 2600)}
            {step(`Looking up ${story.ask.city}`, 2600, 3300)}
          </ol>
        )}
        {t >= 3400 && <p>{typed(story.ask.reply, part(t, 3400, 5400))}</p>}
        {t >= 7500 && <p className="user">{second}</p>}
        {t >= 8000 && <ol>{step("Asking the route planner", 8000, 9100)}</ol>}
        {t >= 9200 && (
          <div className="hl-how-change">
            <Sparkles size={18} />
            <span>
              <b>A change to apply</b>
              <small>{shows} shows, for you to approve</small>
            </span>
            <em className={t >= 11500 ? "on" : ""}>{t >= 11500 ? "Applied" : "Apply"}</em>
          </div>
        )}
      </div>
      <div className={`hl-how-ask${writing ? " on" : ""}`}>
        <span className={writing ? "" : "empty"}>{writing || "Ask your tour team"}</span>
        <i>
          <ArrowUp size={16} />
        </i>
      </div>
    </div>
  );
}

/** The share of a step, either side of the point where it hands over, that the crossfade takes. */
const BLEND = 0.2;

export function HowOnScroll({ story, steps }: { story: HowStory; steps: { title: string; text: string }[] }) {
  // The panels showing: one, or two while they cross over. They run their loops while they show, so neither jumps.
  const [[low, high], setShowing] = useState([0, 0]);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!box.current || !list.current) return;
    const rows = gsap.utils.toArray<HTMLElement>("[data-step]", list.current);
    const cards = gsap.utils.toArray<HTMLElement>(".hl-how-panel", box.current);
    const count = rows.length;
    const follow = (progress: number) => {
      const at = progress * count;
      const next: [number, number] = [Math.max(0, Math.floor(at - BLEND)), Math.min(count - 1, Math.floor(at + BLEND))];
      setShowing((now) => (now[0] === next[0] && now[1] === next[1] ? now : next));
    };
    // Rebuilt whenever the screen crosses one of these, and put back as it was when it does.
    const screens = gsap.matchMedia();
    screens.add({ stacked: STACKED, sideBySide: `not all and ${STACKED}` }, (context) => {
      const { stacked } = context.conditions as { stacked: boolean };
      // The line a step crosses to hand over: mid-screen, or when stacked, the middle of the space under the card.
      const line = stacked ? "top 76%" : "top 50%";
      const end = stacked ? "bottom 76%" : "bottom 50%";
      const travel = stacked ? 22 : 56;
      gsap.set(cards.slice(1), { autoAlpha: 0, y: travel, scale: 0.97 });
      gsap.set(rows.slice(1), { opacity: 0.16, y: travel });
      const handover = gsap.timeline({ defaults: { ease: "power1.inOut", duration: BLEND * 2 }, scrollTrigger: { trigger: list.current, start: line, end, scrub: true, onUpdate: (self) => follow(self.progress) } });
      for (let i = 1; i < count; i++) {
        const at = i - BLEND;
        handover
          .to(cards[i - 1], { autoAlpha: 0, y: -travel, scale: 0.97 }, at)
          .to(cards[i], { autoAlpha: 1, y: 0, scale: 1 }, at)
          .to(rows[i - 1], { opacity: 0.16, y: -travel }, at)
          .to(rows[i], { opacity: 1, y: 0 }, at);
      }
      // The timeline spans every step, so scroll position and step line up.
      handover.set({}, {}, count);
      // The card itself rises into place as the section comes up.
      gsap.fromTo(box.current!.querySelector(".hl-how-stage"), { y: travel * 1.6, opacity: 0 }, { y: 0, opacity: 1, ease: "none", scrollTrigger: { trigger: box.current, start: stacked ? "top 95%" : "top 88%", end: stacked ? "top 60%" : "top 45%", scrub: true } });
    });
    return () => screens.revert();
  }, []);

  const showing = (i: number) => low <= i && i <= high;
  const panels = [
    <SearchStep key="search" active={showing(0)} story={story} />,
    <FansStep key="fans" active={showing(1)} story={story} />,
    <RouteStep key="route" active={showing(2)} story={story} />,
    <VenuesStep key="venues" active={showing(3)} story={story} />,
    <SponsorsStep key="sponsors" active={showing(4)} story={story} />,
    <TeamStep key="team" active={showing(5)} story={story} />,
  ];

  return (
    <div ref={box} className="hl hl-how">
      <div ref={list}>
        {steps.map((s) => (
          <div key={s.title} className="hl-how-step" data-step>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </div>
        ))}
      </div>
      <div className="hl-how-stage" aria-hidden="true">
        {panels.map((panel, i) => (
          <div key={panel.key} className="hl-how-panel" data-active={showing(i)}>
            {panel}
          </div>
        ))}
      </div>
    </div>
  );
}
