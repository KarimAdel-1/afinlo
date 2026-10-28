"use client";

import { Check, LoaderCircle } from "lucide-react";
import type { TourStage } from "@/core/tour/types";
import { stageLabel } from "./client";

/** The agent's real progress, one line per stage as the server reaches it. No simulated percentages. */
export function AgentTrace({ stages, running }: { stages: TourStage[]; running: boolean }) {
  if (!stages.length && !running) return null;
  const last = stages.at(-1);
  return (
    <div role="status" aria-live="polite">
      <ol className="hl-stages">
        {stages.map((s, i) => {
          const current = running && i === stages.length - 1;
          return (
            <li key={i} className={current ? "current" : "done"}>
              <span aria-hidden>{current ? <LoaderCircle size={16} className="hl-spin" /> : <Check size={16} />}</span>
              {stageLabel(s)}
            </li>
          );
        })}
        {running && !stages.length && (
          <li className="current">
            <span aria-hidden>
              <LoaderCircle size={16} className="hl-spin" />
            </span>
            Starting the agent
          </li>
        )}
      </ol>
      <span className="hl-visually-hidden">{last ? stageLabel(last) : ""}</span>
    </div>
  );
}
