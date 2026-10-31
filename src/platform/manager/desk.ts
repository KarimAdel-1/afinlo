// One turn of a tour's conversation with its manager: the tour as it stands, whose browser is asking, and what the team
// makes in the turn (a change to apply, drafts, statuses, "no"s), for the tools to read and add to. Built for each
// message and dropped after it; what lasts is in the conversation's checkpoint and in the tour's own tables.
import { randomUUID } from "node:crypto";
import { citiesIn } from "@/core/tour/world";
import { US } from "@/core/tour/regions";
import type { ActMemory, CityGuide, CityHeat, ManagerCard, ManagerEvent, Plan, Specialist, Sponsor, TourContext, Track } from "@/core/tour/types";
import type { QlooClient } from "../taste/qloo";
import { makeCityGuide } from "../tour/city";
import { getCityGuide, saveCityGuide } from "../tour/store";
import { tourOf } from "../tour/tracker";
import { matchCity } from "../tour/writer";

/** A brand a specialist found in Qloo during the turn, beyond the plan's sponsors: one it may pitch. */
export interface FoundBrand {
  id: string;
  name: string;
  fit: number;
  tier: Sponsor["tier"];
}

export interface Desk {
  plan: Plan;
  /** The tour the plan is a version of: its statuses and conversation are kept under it. */
  tourId: string;
  /** The browser asking (its visitor cookie): it owns the tour's statuses and what's remembered about the act. */
  browser: string;
  tracks: Track[];
  memory?: ActMemory;
  client: QlooClient;
  signal: AbortSignal;
  emit: (event: ManagerEvent) => void;
  /** What the team made this turn, by whom. */
  made: { by: Specialist | "manager"; card: ManagerCard }[];
  /** Tool calls the team has made this turn, against the turn's budget. */
  toolCalls: number;
  found: Map<string, FoundBrand>;
  guides: Map<string, CityGuide>;
  /** What the user has on screen as they send the message: the tab, and the stop in hand. */
  context?: TourContext;
}

/** The turn's desk; `found` is what the team found for the tour in earlier messages (kept in tour_prospects), to pitch now. */
export function openDesk(input: Pick<Desk, "plan" | "browser" | "tracks" | "memory" | "client" | "signal" | "emit" | "context"> & { found?: FoundBrand[] }): Desk {
  const { found = [], ...rest } = input;
  return { ...rest, tourId: tourOf(input.plan), made: [], toolCalls: 0, found: new Map(found.map((b) => [b.id, b])), guides: new Map() };
}

export const cardId = () => randomUUID().slice(0, 8);

/** The route's cities, in order. */
export const routeOf = (plan: Plan) => plan.route.map((r) => plan.cities.find((c) => c.id === r.cityId)).filter((c): c is CityHeat => !!c);

/** A city named by a specialist, among the tour's cities with Qloo data (the strongest 80, and every stop). */
export function cityNamed(plan: Plan, name: string): CityHeat | undefined {
  const byId = plan.cities.find((c) => c.id === name.trim().toLowerCase());
  return byId ?? plan.cities.find((c) => c.id === matchCity(name, plan.cities));
}

/** Any candidate city in the tour's area, by name: a start or a city to add need not have made the strongest 80. */
export function areaCityNamed(plan: Plan, name: string) {
  const area = citiesIn(plan.request.where ?? US).map((c) => ({ ...c, state: c.admin1 }));
  const id = area.find((c) => c.id === name.trim().toLowerCase())?.id ?? matchCity(name, area);
  return area.find((c) => c.id === id);
}

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The thing in `items` a name means: by ID, then the exact name, then a name that starts with it or contains it. */
export function named<T extends { id: string; name: string }>(items: T[], name: string): T | undefined {
  const n = norm(name);
  if (!n) return undefined;
  return (
    items.find((i) => i.id.toLowerCase() === name.trim().toLowerCase()) ??
    items.find((i) => norm(i.name) === n) ??
    items.find((i) => norm(i.name).startsWith(n)) ??
    items.find((i) => n.length >= 4 && norm(i.name).includes(n))
  );
}

/** A brand named by the sponsor scout: one of the plan's sponsors, or one it found in Qloo this turn. */
export function brandNamed(desk: Desk, name: string): { id: string; name: string; sponsor?: Sponsor } | undefined {
  const sponsor = named(
    desk.plan.sponsors.map((s) => ({ id: s.brand.id, name: s.brand.name, sponsor: s })),
    name,
  );
  return sponsor ?? named([...desk.found.values()], name);
}

/** A stop's city guide (its venues, local partners and loved places): kept with the plan, made the first time. */
export async function guideFor(desk: Desk, cityId: string): Promise<CityGuide> {
  const kept = desk.guides.get(cityId) ?? (await getCityGuide(desk.plan.id, cityId));
  if (kept) {
    desk.guides.set(cityId, kept);
    return kept;
  }
  const guide = await makeCityGuide(desk.plan, cityId, { client: desk.client, signal: desk.signal });
  await saveCityGuide(guide);
  desk.guides.set(cityId, guide);
  return guide;
}
