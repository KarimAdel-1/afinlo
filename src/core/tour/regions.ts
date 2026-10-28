// Where a tour can go: every country in the city list, grouped into touring regions. Small enough for the
// browser (the cities themselves are in world.ts, for the server). Pure.
import { z } from "zod";
import countries from "./countries.json";

export const COUNTRY_NAMES: Record<string, string> = countries;
export const countryName = (iso: string) => COUNTRY_NAMES[iso] ?? iso;

/** Where a state or province says more than the country: big federal countries, as people name their cities. */
const BY_STATE = new Set(["US", "CA", "AU", "BR", "MX", "IN"]);
/** "Nashville, Tennessee", "Manchester, United Kingdom". */
export function placeOf(c: { name: string; state?: string; country?: string }) {
  // Plans from before tours went worldwide have only US cities, with their state.
  if (!c.country) return c.state ? `${c.name}, ${c.state}` : c.name;
  return `${c.name}, ${BY_STATE.has(c.country) && c.state ? c.state : countryName(c.country)}`;
}
/** The second line under a city's name: its state where that's how people say it, else its country. */
export const areaOf = (c: { state?: string; country?: string }) => (!c.country || (BY_STATE.has(c.country) && c.state) ? (c.state ?? "") : countryName(c.country));

export type Box = readonly [west: number, south: number, east: number, north: number];

export const REGIONS = [
  { id: "north-america", label: "North America", box: [-125, 24, -60, 55], countries: ["US", "CA"] },
  {
    id: "latin-america",
    label: "Latin America",
    box: [-118, -56, -34, 33],
    countries: ["MX", "GT", "BZ", "SV", "HN", "NI", "CR", "PA", "CU", "DO", "HT", "JM", "PR", "TT", "BB", "BS", "CW", "GP", "MQ", "CO", "VE", "EC", "PE", "BO", "BR", "PY", "UY", "AR", "CL", "GY", "SR"],
  },
  { id: "uk-ireland", label: "UK and Ireland", box: [-11, 49.8, 2, 59], countries: ["GB", "IE"] },
  {
    id: "europe",
    label: "Europe",
    box: [-11, 35, 45, 64],
    // A European tour usually takes in the UK and Ireland too.
    countries: ["GB", "IE", "FR", "DE", "ES", "PT", "IT", "NL", "BE", "LU", "CH", "AT", "DK", "SE", "NO", "FI", "IS", "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "HR", "SI", "RS", "BA", "ME", "MK", "AL", "XK", "MD", "UA", "BY", "LT", "LV", "EE", "RU", "TR", "CY", "MT", "GI"],
  },
  {
    id: "mena",
    label: "Middle East and North Africa",
    box: [-17, 12, 63, 42],
    countries: ["MA", "DZ", "TN", "LY", "EG", "SD", "SA", "AE", "QA", "KW", "BH", "OM", "YE", "JO", "LB", "SY", "IQ", "IR", "IL", "PS"],
  },
  {
    id: "africa",
    label: "Sub-Saharan Africa",
    box: [-18, -35, 52, 16],
    countries: ["NG", "GH", "KE", "ZA", "ET", "TZ", "UG", "SN", "CI", "CM", "AO", "ZM", "ZW", "MZ", "MG", "CD", "CG", "RW", "MW", "SO", "SS", "ML", "NE", "BF", "TD", "GN", "BJ", "TG", "SL", "LR", "MR", "NA", "BW", "LS", "SZ", "GA", "GQ", "ER", "DJ", "CF", "BI", "GM", "GW", "CV", "KM", "MU", "RE"],
  },
  { id: "central-asia", label: "Central Asia and the Caucasus", box: [40, 35, 90, 55], countries: ["KZ", "UZ", "TM", "KG", "TJ", "AZ", "GE", "AM"] },
  { id: "south-asia", label: "South Asia", box: [60, 5, 98, 37], countries: ["IN", "PK", "BD", "LK", "NP", "AF", "BT", "MV"] },
  { id: "east-asia", label: "East Asia", box: [100, 18, 146, 50], countries: ["CN", "JP", "KR", "KP", "TW", "HK", "MO", "MN"] },
  { id: "southeast-asia", label: "Southeast Asia", box: [92, -11, 141, 24], countries: ["TH", "VN", "PH", "ID", "MY", "SG", "KH", "LA", "MM", "BN", "TL"] },
  { id: "oceania", label: "Australia and the Pacific", box: [112, -48, 179, -8], countries: ["AU", "NZ", "PG", "FJ", "NC", "PF", "GU"] },
] as const satisfies readonly { id: string; label: string; box: Box; countries: readonly string[] }[];

export type RegionId = (typeof REGIONS)[number]["id"];
export const regionId = z.enum(REGIONS.map((r) => r.id) as [RegionId, ...RegionId[]]);
export const regionById = (id: RegionId) => REGIONS.find((r) => r.id === id)!;

export const countryCode = z.string().refine((iso) => iso in COUNTRY_NAMES, "Afinlo doesn't have cities in that country.");
/** Where a tour goes: a region, or a few countries. */
export const where = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("region"), region: regionId }).strict(),
  z.object({ kind: z.literal("countries"), countries: z.array(countryCode).min(1).max(8) }).strict(),
]);
export type Where = z.infer<typeof where>;
/** Plans from before tours went worldwide toured the United States. */
export const US: Where = { kind: "countries", countries: ["US"] };

export const countriesOf = (w: Where): string[] => (w.kind === "region" ? [...regionById(w.region).countries] : [...w.countries]);
/** "North America", "the United Kingdom", "Germany and Austria". */
export function whereLabel(w: Where) {
  if (w.kind === "region") return regionById(w.region).label;
  const names = w.countries.map(countryName);
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
/** Two plans go to the same place: for reusing a plan made for the same request. */
export const whereKey = (w: Where) => (w.kind === "region" ? `r:${w.region}` : `c:${[...w.countries].sort().join(",")}`);
