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
  /** Qloo doesn't know this act: everything about its fans is predicted from the acts named as like it. */
  predicted?: boolean;
}
/** An act Qloo doesn't know yet, and the 2–3 acts in Qloo named as like it. */
export interface NewAct {
  name: string;
  comedian: boolean;
  /** Qloo IDs of the acts it's like. */
  like: string[];
}
export const newAct = z
  .object({
    name: z.string().trim().min(2).max(80),
    comedian: z.boolean().default(false),
    like: z.array(qlooId).min(2).max(3),
  })
  .strict();
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
  /** An act Qloo doesn't know (its actId is then from newActId), and the acts it's like. */
  newAct?: NewAct;
  /** Where the tour goes. Absent on plans from before tours went worldwide: the United States. */
  where?: Where;
  homeCityId?: string;
  stops: number;
  categories: SponsorCategory[];
  /** Sponsor categories the act won't take (alcohol, say): their brands are left out. */
  avoid?: SponsorCategory[];
  excludeCityIds: string[];
  /** Cities the tour must include, whatever their score. */
  includeCityIds?: string[];
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
  /**
   * Whose Qloo signal the plan uses: the act's own; acts like it, when the act's own data is thin; or, for an act Qloo
   * doesn't know, the acts named as like it ("named", in `similar`).
   */
  signal: { basis: "act" | "similar" | "named"; similar: PlanEntity[] };
  fanDna: FanDNA;
  /** Qloo's heatmap for the real map: [latitude, longitude, weight 0–1], the stronger half of the cells. */
  heatPoints?: [number, number, number][];
  /** The area's name, as the plan shows it ("Europe", "Germany and Austria"). */
  area?: string;
  /** The candidate cities with data, strongest first (at most 80, and every stop). */
  cities: CityHeat[];
  route: RouteStop[];
  /** The route against the area's biggest cities. Absent on plans made before it was worked out. */
  proof?: Proof;
  sponsors: Sponsor[];
  supportActs: SupportAct[];
  localSpots: LocalSpot[];
  pitch: PitchPack;
  notes: string[];
  traces: TasteTrace[];
  durationMs: number;
  example?: boolean;
}
/**
 * The proof that the route is worth more than the obvious one: its average Fan Heat against that of what a booker with
 * no taste data would play, the area's biggest cities (as many as the route has stops), from the same Qloo heatmap.
 */
export interface Proof {
  /** The route's average Fan Heat. */
  route: number;
  /** The biggest cities' average Fan Heat. */
  biggest: number;
  /** The biggest cities, biggest first, by name. */
  biggestCities: string[];
}
export type TourStage =
  | { stage: "resolving"; act: string }
  | { stage: "dna" }
  | { stage: "cities"; count: number }
  | { stage: "fallback"; similar: string[] }
  | { stage: "predicting"; from: string[] }
  | { stage: "sponsors" }
  | { stage: "support" }
  | { stage: "scoring" }
  | { stage: "local"; cities: string[] }
  | { stage: "writing" };

/** The tour manager's specialists. */
export const SPECIALISTS = ["route", "venues", "sponsors", "promoter"] as const;
export type Specialist = (typeof SPECIALISTS)[number];
export const SPECIALIST_LABELS: Record<Specialist, string> = { route: "Route planner", venues: "Venue booker", sponsors: "Sponsor scout", promoter: "Promoter" };

/** Something a specialist wrote for the user to send: a pitch to a brand, a hold request to a venue, a post for a city. */
export interface AgentDraft {
  type: "pitch" | "hold" | "post";
  /** Who it's for, by name, and its ID in the tour (a brand, a venue, a city). */
  to: string;
  toId: string;
  language: string;
  subject?: string;
  body: string;
}
/** The tour workspace's tabs, which the tour team can open. */
export const TOUR_TABS = ["plan", "book", "fund", "promote", "next"] as const;
export type TourTab = (typeof TOUR_TABS)[number];
export const TOUR_TAB_LABELS: Record<TourTab, string> = { plan: "Plan", book: "Book", fund: "Fund", promote: "Promote", next: "Next up" };

/** Where the user is in the tour as they send a message: the tab, and the stop in hand. */
export interface TourContext {
  tab: TourTab;
  /** A stop's city ID. */
  stop?: string;
}

/**
 * What the tour manager's team did in a turn besides the reply: a change to the tour (applied at once, with the request
 * it came from to go back to), a draft, a status set, a "no" remembered for the act's next tours, a part of the tour to
 * show.
 */
export type ManagerCard =
  | { id: string; kind: "change"; summary: string; request: PlanRequest & { parentId: string }; undo?: PlanRequest }
  | { id: string; kind: "draft"; draft: AgentDraft }
  | { id: string; kind: "status"; text: string; track: Omit<Track, "updatedAt"> }
  | { id: string; kind: "memory"; text: string }
  | { id: string; kind: "show"; text: string; tab: TourTab; cityId?: string };
/** A message in a tour's conversation with its manager, as the page shows it. */
export interface ManagerMessage {
  role: "user" | "assistant";
  text: string;
  /** The specialists the manager asked for this answer. */
  agents?: Specialist[];
  cards?: ManagerCard[];
}
/** What the tour manager is doing, as it happens: for the page to show while it works. */
export type ManagerEvent =
  | { kind: "ask"; agent: Specialist; task: string }
  | { kind: "tool"; agent: Specialist | "manager"; label: string }
  | { kind: "answered"; agent: Specialist };

/**
 * What Afinlo's assistant knows about the person it's talking to, gathered in conversation and kept for this browser:
 * every field is what they said, in their words.
 */
export interface ArtistProfile {
  /** Their name, or the name they perform under. */
  name?: string;
  role?: "artist" | "comedian" | "manager" | "agent" | "other";
  /** The act they're planning for, and its ID: Qloo's, or newActId() for an act Qloo doesn't know. */
  act?: string;
  actId?: string;
  /** Acts they say they sound like. */
  soundsLike?: string[];
  basedIn?: string;
  /** Where they are in their career, as they put it ("a few hundred monthly listeners"). */
  stage?: string;
  goals?: string[];
  /** Limits to plan around ("no flights", "weekends only", "a small budget"). */
  limits?: string[];
  notes?: string;
}
export const artistProfile = z
  .object({
    name: z.string().max(80),
    role: z.enum(["artist", "comedian", "manager", "agent", "other"]),
    act: z.string().max(80),
    actId: qlooId,
    soundsLike: z.array(z.string().max(80)).max(5),
    basedIn: z.string().max(80),
    stage: z.string().max(200),
    goals: z.array(z.string().max(160)).max(6),
    limits: z.array(z.string().max(160)).max(6),
    notes: z.string().max(400),
  })
  .partial();

/** What the assistant made in a turn besides its reply: a tour it planned, to open. */
export type AssistantCard = { id: string; kind: "tour"; planId: string; title: string; route: string[] };
/** A message in the assistant's conversation, as the page shows it. */
export interface AssistantMessage {
  role: "user" | "assistant";
  text: string;
  cards?: AssistantCard[];
}
/** What the assistant is doing, as it happens. */
export type AssistantEvent = { kind: "tool"; label: string };

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

/** The most skipped cities and turned-down brands a plan request carries; an act's memory keeps that many, the newest. */
export const MAX_SKIPPED_CITIES = 20;
export const MAX_TURNED_DOWN_BRANDS = 40;

export const planInput = z
  .object({
    actId: qlooId,
    newAct: newAct.optional(),
    where: where.default({ kind: "countries", countries: ["US"] }),
    homeCityId: cityId.optional(),
    stops: z.number().int().min(3).max(12).default(7),
    categories: z.array(sponsorCategory).max(3).default([]),
    // Any of the categories: the brief lets the act rule out every one.
    avoid: z.array(sponsorCategory).max(Object.keys(SPONSOR_CATEGORIES).length).default([]),
    excludeCityIds: z.array(cityId).max(MAX_SKIPPED_CITIES).default([]),
    includeCityIds: z.array(cityId).max(6).optional(),
    excludeBrandIds: z.array(qlooId).max(MAX_TURNED_DOWN_BRANDS).default([]),
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
