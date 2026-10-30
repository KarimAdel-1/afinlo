"use client";

import { useEffect, useState } from "react";

/** How far through its loop an animation is, in milliseconds, about 30 times a second, so scrolling keeps the frames it needs. It runs while `active`. */
export function useLoop(active: boolean, length: number) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const started = performance.now();
    let shown = 0;
    let frame = requestAnimationFrame(function tick(now) {
      if (now - shown >= 32) {
        shown = now;
        setT(Math.max(0, now - started) % length);
      }
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      setT(0);
    };
  }, [active, length]);
  return t;
}

/** How far `t` is from `from` to `to`, from 0 to 1. */
export const part = (t: number, from: number, to: number) => Math.max(0, Math.min(1, (t - from) / (to - from)));
