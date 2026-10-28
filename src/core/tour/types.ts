// Afinlo: where an act's fans are, which brands they love, and a sponsor-ready tour plan. Shared types and input
// contracts. Every act, city, brand, place and support act in a plan carries the Qloo ID it came from; the numbers are
// computed by plain code (src/core/tour/scoring.ts), and the language model only plans and writes.
import { z } from "zod";
import type { TasteTrace } from "@/core/taste/types";
import { where, type Where } from "./regions";

export const qlooId = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
  .transform((v) => v.toUpperCase());

/** A city: one from the world list (gb-manchester), or a Qloo locality on plans from before it went worldwide. */
export const cityId = z.union([qlooId, z.string().regex(/^[a-z]{2}-[a-z0-9-]{1,80}$/)]);

/** Sponsor categories, each a Qloo brand genre tag. */
export const SPONSOR_CATEGORIES = {
  drinks: { label: "Drinks", tag: "urn:tag:genre:brand:food_and_beverage:drinks" },
  alcohol: { label: "Beer, wine & spirits", tag: "urn:tag:genre:brand:wine_and_spirits" },
  food: { label: "Food", tag: "urn:tag:genre:brand:food_and_beverage:food" },
  fashion: { label: "Fashion", tag: "urn:tag:genre:brand:fashion" },
  footwear: { label: "Footwear", tag: "urn:tag:genre:brand:fashion:footwear" },
  beauty: { label: "Health & beauty", tag: "urn:tag:genre:brand:health_and_beauty" },
  tech: { label: "Tech & electronics", tag: "urn:tag:genre:brand:electronics" },
  gaming: { label: "Gaming", tag: "urn:tag:genre:brand:electronics:gaming" },
  instruments: { label: "Music gear", tag: "urn:tag:genre:brand:electronics:music_instruments" },
  auto: { label: "Automotive", tag: "urn:tag:genre:brand:automotive" },
  travel: { label: "Travel", tag: "urn:tag:genre:brand:travel" },
  apps: { label: "Apps", tag: "urn:tag:genre:brand:mobile_app" },
  retail: { label: "Retail", tag: "urn:tag:genre:brand:retail" },
  media: { label: "Media", tag: "urn:tag:genre:brand:entertainment:media" },
} as const;
export type SponsorCategory = keyof typeof SPONSOR_CATEGORIES;
export const sponsorCategory = z.enum(Object.keys(SPONSOR_CATEGORIES) as [SponsorCategory, ...SponsorCategory[]]);

export interface Act {
  id: string;
  name: string;
  /** Qloo's entity type: musicians are artists; some comedians exist only as people. */
  kind: "artist" | "person";
  description: string;
  disambiguation: string;
  popularity?: number;
  comedian: boolean;
  /** The act's photo from Qloo (images.qloo.com), when it has one. */
  image?: string;
}
/** A Qloo entity named in a plan (a brand, place, film, artist), with only what the plan shows. */
export interface PlanEntity {
  id: string;
  name: string;
  /** Qloo's type, without the urn:entity: prefix. */
  type: string;
  disambiguation?: string;
  popularity?: number;
  /** Its image from Qloo (images.qloo.com), when it has one: a photo, a logo, a cover. */
  image?: string;
}
export interface FanDNA {
  /** Taste tags Qloo associates with the act's audience. */
  tags: { id: string; name: string }[];
  /** Aggregate skews, relative to Qloo's average audience (−1 to 1). Never about a person. */
  demographics?: { age: { band: string; skew: number }[]; gender: { male: number; female: number } };
  /** What these fans love in other domains: Qloo's top results by category. */
  loves: { label: string; entity: PlanEntity }[];
}
export type Confidence = "high" | "medium" | "low";
export interface CityHeat {
  id: string;
  name: string;
  /** Its state, province or region. */
  state: string;
  /** ISO country code. Absent on plans from before tours went worldwide: those are all in the United States. */
  country?: string;
  lat: number;
  lon: number;
  population: number;
  obvious: boolean;
  /** Mean Qloo heatmap affinity of the cells within the city's radius (0–1). */
  affinity: number;
  cells: number;
  /** 0–100, relative to this act's other candidate cities. */
  heat: number;
  /** A strong city outside the area's biggest metros. */
  hidden: boolean;
  /** 0–100: heat, weighted a little by market size, for routing. */
  tourScore: number;
  confidence: Confidence;
}
/** A city as the map shows it: where it falls on the 975 × 610 map, its Fan Heat, and its place on the tour. */
export interface MapCity {
  id: string;
  name: string;
  state: string;
  x: number;
  y: number;
  heat: number;
  hidden: boolean;
  confidence: Confidence;
  population: number;
  /** Position on the tour, from 1, if it's a stop. */
  stop?: number;
}
export interface RouteStop {
  cityId: string;
  /** Distance from the previous stop (or from home), by air; 0 for a first stop with no home. */
  legKm: number;
  /** How the leg is travelled: a drive up to a day's distance, otherwise a flight. Absent with no leg. */
  mode?: "drive" | "fly";
}
export interface Sponsor {
  brand: PlanEntity & { categories: string[] };
  /** Qloo's affinity of this audience for the brand. */
  affinity: number;
  /** Position among the brands Qloo returned for this audience, from 1. */
  qlooRank: number;
  /** Afinlo's 0–100 fit: normalized affinity × category match × brand-size weight. */
  fit: number;
  tier: "household" | "established" | "niche";
  /** The act's route cities where this brand's own audience is strongest (from the brand's Qloo heatmap). */
  strongestIn: string[];
  confidence: Confidence;
}
export interface SupportAct {
  act: PlanEntity;
  affinity: number;
  /** Taste tags both audiences share (Qloo compare). */
  shared: string[];
}
/** A place from Qloo near a city: a venue, a local business, somewhere fans love. */
export interface CityPlace extends PlanEntity {
  address?: string;
  /** What it is, in Qloo's words (Live music bar, Clothing store). */
  kind?: string;
  website?: string;
  /** Its rating out of 5, and price level 1–4, as Qloo reports them. */
  rating?: number;
  priceLevel?: number;
  /** How strongly this audience over-indexes for it (0–1). */
  affinity?: number;
  /** Where it is, from Qloo: for its pin on the map. */
  lat?: number;
  lon?: number;
}
export interface LocalSpot {
  cityId: string;
  place: CityPlace;
  kind: "venue" | "spot";
}
/** A stop's city guide: where to play, local businesses to pitch, and what fans love there. All from Qloo. */
export interface CityGuide {
  planId: string;
  cityId: string;
  createdAt: string;
  venues: CityPlace[];
  /** Local businesses these fans love (bars, breweries, restaurants, shops): sponsor leads for the night. */
  leads: CityPlace[];
  /** Other places fans love here: ideas for content, meet-ups and pop-ups. */
  loved: CityPlace[];
  notes: string[];
  traces: TasteTrace[];
}
export interface PitchEmail {
  brandId: string;
  subject: string;
  body: string;
}
export interface PitchPack {
  headline: string;
  audience: string;
  markets: string;
  ask: string;
  tourBrief: string;
  cityNotes: { cityId: string; note: string }[];
  emails: PitchEmail[];
  /** Who wrote the words: the AI writer, or a plain template when it isn't available. */
  writer: "openai" | "template";
  model?: string;
}
export interface PlanRequest {
  actId: string;
  /** Where the tour goes. Absent on plans from before tours went worldwide: the United States. */
  where?: Where;
  homeCityId?: string;
  stops: number;
  categories: SponsorCategory[];
  /** Sponsor categories the act won't take (alcohol, say): their brands are left out. */
  avoid?: SponsorCategory[];
  excludeCityIds: string[];
  /** Brands the act has turned down: never suggested again. */
  excludeBrandIds?: string[];
  focus: "balanced" | "hidden";
}
export interface Plan {
  id: string;
  parentId?: string;
  /** The tour this plan is a version of: its first plan's ID. Absent on a first plan (the tour is the plan itself). */
  rootId?: string;
  createdAt: string;
  request: PlanRequest;
  act: Act;
  /** Whose Qloo signal the plan uses: the act's own, or acts like it when the act's own data is thin. */
  signal: { basis: "act" | "similar"; similar: PlanEntity[] };
  fanDna: FanDNA;
  /** Qloo's heatmap for the real map: [latitude, longitude, weight 0–1], the stronger half of the cells. */
  heatPoints?: [number, number, number][];
  /** The area's name, as the plan shows it ("Europe", "Germany and Austria"). */
  area?: string;
  /** The candidate cities with data, strongest first (at most 80, and every stop). */
  cities: CityHeat[];
  route: RouteStop[];
  sponsors: Sponsor[];
  supportActs: SupportAct[];
  localSpots: LocalSpot[];
  pitch: PitchPack;
  notes: string[];
  traces: TasteTrace[];
  durationMs: number;
  example?: boolean;
}
/** A brand as Afinlo shows it, from Qloo: its picture, its Qloo brand genre tags. */
export interface Brand extends PlanEntity {
  description: string;
  categories: string[];
}
/** An act whose fans love a brand, and the cities where both audiences are strong. */
export interface MatchedAct {
  act: Act;
  /** Qloo's affinity of the brand's audience for the act. */
  affinity: number;
  /** Position among the acts Qloo returned for the brand's audience, from 1. */
  qlooRank: number;
  /** Afinlo's 0–100 Brand Fit: normalized affinity × a size weight (the act's reach). */
  fit: number;
  tier: Sponsor["tier"];
  /** Up to three cities where both audiences are strong, best first. Empty when Qloo has no map for the act. */
  shared: SharedCity[];
}
/** A city where two audiences meet: each one's Fan Heat there, and both together (their geometric mean). */
export interface SharedCity {
  cityId: string;
  a: number;
  b: number;
  together: number;
}
export interface BrandMatch {
  id: string;
  createdAt: string;
  request: { brandId: string; acts: "both" | "music" | "comedy" };
  brand: Brand;
  /** The brand's own audience on the map's hexagon tiles, like a plan's. */
  heat?: [number, number, number][];
  /** Where the brand's audience over-indexes: Fan Heat for the brand. */
  cities: CityHeat[];
  acts: MatchedAct[];
  notes: string[];
  traces: TasteTrace[];
  durationMs: number;
  example?: boolean;
}
/** A city for a double bill: both acts' Fan Heat, and together. */
export interface PairCity extends CityHeat {
  a: number;
  b: number;
}
export interface Pairing {
  id: string;
  createdAt: string;
  request: { aId: string; bId: string; stops: number };
  a: Act;
  b: Act;
  /** Both audiences on the map: tiles strong for both are darkest. */
  heat?: [number, number, number][];
  /** Cities both acts have data for, by Fan Heat together (heat is the together score). */
  cities: PairCity[];
  route: RouteStop[];
  /** Taste tags both crowds share (Qloo compare). */
  shared: string[];
  /** How alike the two maps are: of the cities either act is strong in (Fan Heat 60+), the share both are. */
  overlap: number;
  notes: string[];
  traces: TasteTrace[];
  durationMs: number;
  example?: boolean;
}

export type TourStage =
  | { stage: "resolving"; act: string }
  | { stage: "dna" }
  | { stage: "cities"; count: number }
  | { stage: "fallback"; similar: string[] }
  | { stage: "sponsors" }
  | { stage: "support" }
  | { stage: "scoring" }
  | { stage: "local"; cities: string[] }
  | { stage: "writing" }
  | { stage: "acts"; kinds: "both" | "music" | "comedy" }
  | { stage: "overlap"; count: number }
  | { stage: "pair"; a: string; b: string }
  | { stage: "route" };

/** Where a sponsor pitch stands on a tour. */
export const PITCH_STATUSES = ["to_send", "sent", "replied", "signed", "passed"] as const;
export type PitchStatus = (typeof PITCH_STATUSES)[number];
export const PITCH_LABELS: Record<PitchStatus, string> = { to_send: "To send", sent: "Sent", replied: "Replied", signed: "Signed", passed: "Passed" };

/** Where a venue stands for a stop on a tour. */
export const VENUE_STATUSES = ["to_contact", "asked", "hold", "confirmed", "passed"] as const;
export type VenueStatus = (typeof VENUE_STATUSES)[number];
export const VENUE_LABELS: Record<VenueStatus, string> = { to_contact: "To contact", asked: "Asked", hold: "On hold", confirmed: "Confirmed", passed: "Passed" };
/** One thing being worked on in a tour: a venue being booked, a sponsor being pitched. */
export interface Track {
  kind: "venue" | "sponsor";
  itemId: string;
  /** The stop a venue is for. */
  cityId?: string;
  status: string;
  note: string;
  updatedAt: string;
}
export const trackInput = z.discriminatedUnion("kind", [
  z.object({ planId: z.string().max(40), kind: z.literal("venue"), itemId: qlooId, cityId, status: z.enum(VENUE_STATUSES), note: z.string().max(500).default("") }).strict(),
  z.object({ planId: z.string().max(40), kind: z.literal("sponsor"), itemId: qlooId, status: z.enum(PITCH_STATUSES), note: z.string().max(500).default("") }).strict(),
]);

/** What Afinlo remembers about an act for its next tour: where it went, and what it said no to. */
export interface ActMemory {
  where?: Where;
  stops?: number;
  homeCityId?: string;
  categories?: SponsorCategory[];
  avoid?: SponsorCategory[];
  excludeCityIds?: string[];
  excludeBrandIds?: string[];
  focus?: "balanced" | "hidden";
}

export const brandMatchInput = z
  .object({ brandId: qlooId, acts: z.enum(["both", "music", "comedy"]).default("both") })
  .strict();
export type BrandMatchInput = z.input<typeof brandMatchInput>;

export const pairInput = z
  .object({ aId: qlooId, bId: qlooId, stops: z.number().int().min(3).max(12).default(7) })
  .strict()
  .refine((v) => v.aId !== v.bId, "Choose two different acts.");
export type PairInput = z.input<typeof pairInput>;

export const planInput = z
  .object({
    actId: qlooId,
    where: where.default({ kind: "countries", countries: ["US"] }),
    homeCityId: cityId.optional(),
    stops: z.number().int().min(3).max(12).default(7),
    categories: z.array(sponsorCategory).max(3).default([]),
    avoid: z.array(sponsorCategory).max(8).default([]),
    excludeCityIds: z.array(cityId).max(20).default([]),
    excludeBrandIds: z.array(qlooId).max(40).default([]),
    focus: z.enum(["balanced", "hidden"]).default("balanced"),
    parentId: z.string().max(40).optional(),
  })
  .strict();
export type PlanInput = z.input<typeof planInput>;

export class TourError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "TourError";
  }
}
