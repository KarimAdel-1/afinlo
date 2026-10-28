// How a sponsor match is described: its category, its size, and the ring that shows its Sponsor Fit.
import { SPONSOR_CATEGORIES, type Sponsor, type SponsorCategory } from "@/core/tour/types";

export const TIER: Record<Sponsor["tier"], string> = { household: "Household name", established: "Established brand", niche: "Niche brand" };

/** The most specific sponsor category a brand's Qloo tags fall in. */
export function categoryOf(tags: string[]) {
  const matches = (Object.entries(SPONSOR_CATEGORIES) as [SponsorCategory, (typeof SPONSOR_CATEGORIES)[SponsorCategory]][]).filter(([, c]) => tags.some((t) => t === c.tag || t.startsWith(c.tag + ":")));
  return matches.sort((a, b) => b[1].tag.length - a[1].tag.length)[0]?.[1].label;
}

/** The circumference of a Sponsor Fit ring (radius 24), and the dash that fills it to `fit` out of 100. */
export const RING = 2 * Math.PI * 24;
export const ringDash = (fit: number) => `${(Math.max(0, Math.min(100, fit)) / 100) * RING} ${RING}`;
