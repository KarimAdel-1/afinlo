"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { gsap, ScrollTrigger } from "./gsap";

/**
 * Eased wheel scrolling on the website's pages, by Lenis on GSAP's clock, so ScrollTrigger's animations move with it
 * frame for frame. Touch screens keep their own scrolling.
 */
export function SmoothScroll() {
  useEffect(() => {
    // Lenis turns itself down for the system's reduced-motion setting unless told otherwise.
    const lenis = new Lenis({ anchors: true, lerp: 0.1, respectReducedMotion: false });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (seconds: number) => lenis.raf(seconds * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);
  return null;
}
