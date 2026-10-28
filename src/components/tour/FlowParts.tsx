"use client";

import type { Ref } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, type LucideIcon } from "lucide-react";
import type { TourStage, MapCity } from "@/core/tour/types";
import { AgentTrace } from "./AgentTrace";
import { FanMap } from "./FanMap";

/** The steps of a flow, the current one marked. */
export function StepBar({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="hl-stepbar" aria-label="Steps">
      {steps.map((label, i) => (
        <li key={label} className={i === at ? "on" : i < at ? "done" : ""} aria-current={i === at ? "step" : undefined}>
          <span aria-hidden>{i < at ? <Check size={14} /> : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

/** The agent at work: its real stages as they arrive over a map filling in; on failure, what to do next. */
export function RunPanel({
  headingRef,
  title,
  waiting,
  stages,
  running,
  error,
  tiles,
  onBack,
  onRetry,
}: {
  headingRef: Ref<HTMLHeadingElement>;
  title: string;
  waiting: string;
  stages: TourStage[];
  running: boolean;
  error: string;
  tiles: [number, number][];
  onBack: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="hl-panel" aria-labelledby="hl-step">
      <h2 id="hl-step" ref={headingRef} tabIndex={-1}>
        {error ? "That stopped" : title}
      </h2>
      <p>{error ? "Nothing was saved. Try again, or change the choices." : waiting}</p>
      <AgentTrace stages={stages} running={running} />
      {error && (
        <p className="hl-error" role="alert">
          {error}
        </p>
      )}
      {error ? (
        <div className="hl-cta">
          <button type="button" className="hl-button hl-button-quiet" onClick={onBack}>
            <ArrowLeft size={18} aria-hidden /> Change the choices
          </button>
          <button type="button" className="hl-button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : (
        <div className="hl-scan">
          <FanMap tiles={tiles} cities={[]} compact label="The map of the United States that Afinlo is filling in" />
        </div>
      )}
    </section>
  );
}

/** What a flow gives back, for the side of the page. */
export function GetsPanel({ items }: { items: [LucideIcon, string, string][] }) {
  return (
    <div className="hl-panel">
      <h2>What you get</h2>
      <ul className="hl-gets">
        {items.map(([Icon, title, text]) => (
          <li key={title}>
            <span>
              <Icon size={20} aria-hidden />
            </span>
            <div>
              <b>{title}</b>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A finished example to open, with its map. */
export function ExampleCard({ href, title, tiles, heat, cities }: { href: string; title: string; tiles: [number, number][]; heat?: [number, number, number][]; cities: MapCity[] }) {
  return (
    <Link className="hl-example-card" href={href}>
      <b>
        {title}
        <span>
          Open <ArrowRight size={14} aria-hidden />
        </span>
      </b>
      <FanMap tiles={tiles} heat={heat} cities={cities} compact label={title} />
    </Link>
  );
}
