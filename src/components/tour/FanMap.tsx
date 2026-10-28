"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { MapPin, Star } from "lucide-react";
import { hexPath } from "@/core/tour/hex";
import type { MapCity } from "@/core/tour/types";
import { people } from "./format";

export type { MapCity };

const TILE_COLORS = ["#4336ff", "#ff7a45", "#8b5cf6", "#ff4f7e", "#12a594"];

type Box = [number, number, number, number];
const overlaps = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/**
 * Callouts for the strongest cities, each above its city, skipping any that would cover a callout already placed or
 * another stop's marker. In map units: `w` × `h` is a callout's size, `r` a marker's radius.
 */
function placeCallouts(cities: MapCity[], max: number, w: number, h: number, r: number) {
  const markers = cities.filter((c) => c.stop).map((c): [string, Box] => [c.id, [c.x - r, c.y - r, c.x + r, c.y + r]]);
  const taken: Box[] = [];
  const out: MapCity[] = [];
  const order = [...cities].sort((a, b) => Number(!!b.stop) - Number(!!a.stop) || b.heat - a.heat);
  for (const c of order) {
    if (out.length >= max) break;
    const box: Box = [c.x - w / 2, c.y - h - 20, c.x + w / 2, c.y - 8];
    if (box[0] < 0 || box[2] > 975 || box[1] < 0) continue;
    if (taken.some((t) => overlaps(box, t)) || markers.some(([id, m]) => id !== c.id && overlaps(box, m))) continue;
    taken.push(box);
    out.push(c);
  }
  return out;
}

/**
 * Fan Heat on a hexagon map of the US: tiles light up where the act's audience over-indexes (Qloo heatmap), the hottest
 * in pink; tour stops are numbered; callouts name the strongest cities. Works by pointer and keyboard.
 */
export function FanMap({
  tiles,
  heat = [],
  cities,
  active,
  onActive,
  compact = false,
  label,
  markerLabel = "Stop",
}: {
  tiles: [number, number][];
  heat?: [number, number, number][];
  cities: MapCity[];
  active?: string;
  onActive?: (id: string | undefined) => void;
  compact?: boolean;
  label: string;
  /** What a numbered marker is, for its name and tooltip: a tour stop unless said otherwise. */
  markerLabel?: string;
}) {
  const [hover, setHover] = useState<string>();
  const focused = cities.find((c) => c.id === (hover ?? active));
  const base = useMemo(() => hexPath(tiles), [tiles]);
  const levels = useMemo(() => [1, 2, 3, 4, 5, 6].map((l) => hexPath(heat.filter((h) => h[2] === l).map(([c, r]) => [c, r] as [number, number]))), [heat]);
  const stops = cities.filter((c) => c.stop);
  const callouts = useMemo(
    () => placeCallouts(cities.filter((c) => c.stop || c.hidden), compact ? 3 : 5, compact ? 250 : 170, compact ? 74 : 56, compact ? 17 : 13),
    [cities, compact],
  );
  const toggle = (id: string) => onActive?.(active === id ? undefined : id);

  return (
    <div className={`hl-hexmap ${compact ? "compact" : ""}`}>
      <svg viewBox="0 0 975 610" role="img" aria-label={label}>
        <path className="hl-hex-base" d={base} />
        {levels.map((d, i) => (d ? <path key={i} className={`hl-hex hl-hex-${i + 1}`} d={d} /> : null))}
        {stops.map((c) => (
          <g
            key={c.id}
            className={`hl-stop ${c.hidden ? "lime" : ""} ${focused?.id === c.id ? "on" : ""}`}
            {...(compact
              ? {}
              : {
                  role: "button",
                  tabIndex: 0,
                  "aria-label": `${markerLabel} ${c.stop}: ${c.name}, ${c.state}, Fan Heat ${c.heat}${c.hidden ? ", hidden market" : ""}`,
                  onMouseEnter: () => setHover(c.id),
                  onMouseLeave: () => setHover(undefined),
                  onFocus: () => setHover(c.id),
                  onBlur: () => setHover(undefined),
                  onClick: () => toggle(c.id),
                  onKeyDown: (e: KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(c.id);
                    }
                  },
                })}
          >
            <circle cx={c.x} cy={c.y} r={compact ? 17 : 13} />
            <text x={c.x} y={c.y}>
              {c.stop}
            </text>
          </g>
        ))}
      </svg>
      <div className="hl-callouts" aria-hidden>
        {callouts.map((c, i) => (
          <div key={c.id} className="hl-callout" style={{ left: `${(c.x / 975) * 100}%`, top: `${(c.y / 610) * 100}%` }}>
            <span className="hl-callout-icon" style={{ background: c.hidden ? "#efff8a" : TILE_COLORS[i % TILE_COLORS.length], color: c.hidden ? "#262a3f" : "#fff" }}>
              {c.hidden ? <Star size={compact ? 16 : 14} /> : <MapPin size={compact ? 16 : 14} />}
            </span>
            <span>
              <small>{c.name}</small>
              <b>Fan Heat {c.heat}</b>
            </span>
          </div>
        ))}
        {focused && !compact && (
          <div className="hl-map-tip" style={{ left: `${(focused.x / 975) * 100}%`, top: `${(focused.y / 610) * 100}%` }}>
            <b>
              {focused.name}, {focused.state}
            </b>
            Fan Heat {focused.heat} of 100{focused.hidden ? " · hidden market" : ""}
            <br />
            {focused.stop ? `${markerLabel} ${focused.stop} · ` : ""}metro {people(focused.population)}
          </div>
        )}
      </div>
    </div>
  );
}

/** The key under a map: the colour scale, hot spots and the numbered markers (tour stops, unless said otherwise). */
export function MapLegend({ marker = "Tour stop" }: { marker?: string }) {
  return (
    <div className="hl-legend" aria-hidden>
      <span>
        Fewer fans
        <span className="hl-legend-scale">
          {[1, 2, 3, 4, 5].map((l) => (
            <i key={l} className={`l${l}`} />
          ))}
        </span>
        More fans
      </span>
      <span>
        <i className="hl-legend-hot" /> Hot spot
      </span>
      <span>
        <i className="hl-legend-stop" /> {marker}
      </span>
    </div>
  );
}
