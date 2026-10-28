// The language model's two jobs, neither of which chooses a result: the writer turns scored Qloo facts
// into the pitch pack, and the planner turns a refinement message into new filters. The writer sees only the facts and
// their IDs, and its output is checked: an unknown ID or an invented money figure sends the plan to the plain template
// instead.
import { z } from "zod";
import { setting } from "@/lib/settings";
import { placeOf, US } from "@/core/tour/regions";
import { SPONSOR_CATEGORIES, sponsorCategory, type CityHeat, type Plan, type PitchPack, type PlanRequest, type SponsorCategory } from "@/core/tour/types";
import { citiesIn } from "@/core/tour/world";
import { askJson, data, DATA_RULE, MODELS } from "./model";

export type WriterFacts = Pick<Plan, "act" | "fanDna" | "sponsors" | "supportActs" | "signal"> & { route: CityHeat[]; stops: number };

const pitchSchema = z
  .object({
    headline: z.string().max(140),
    audience: z.string().max(500),
    markets: z.string().max(500),
    ask: z.string().max(400),
    tourBrief: z.string().max(900),
    cityNotes: z.array(z.object({ cityId: z.string(), note: z.string().max(220) }).strict()).max(12),
    emails: z.array(z.object({ brandId: z.string(), subject: z.string().max(140), body: z.string().max(1800) }).strict()).max(3),
  })
  .strict();

const audienceLine = (f: WriterFacts) => {
  const d = f.fanDna.demographics;
  const age = d ? [...d.age].sort((a, b) => b.skew - a.skew)[0] : undefined;
  const lean = d ? (d.gender.male > 0.1 ? "leans male" : d.gender.female > 0.1 ? "leans female" : "is evenly split") : "";
  return [
    f.fanDna.tags.length ? `Fans who love ${f.fanDna.tags.slice(0, 3).map((t) => t.name.toLowerCase()).join(", ")}` : `${f.act.name}'s audience`,
    age && age.skew > 0 ? `skewing ${age.band}` : "",
    lean ? `and the audience ${lean}` : "",
  ]
    .filter(Boolean)
    .join(", ") + ".";
};

/** The pitch pack in plain sentences from the facts alone: used when the AI writer isn't configured or fails a check. */
export function templatePitch(f: WriterFacts): PitchPack {
  const hidden = f.route.filter((c) => c.hidden);
  const top = f.sponsors.slice(0, 3);
  const cityName = (id: string) => f.route.find((c) => c.id === id)?.name ?? "";
  return {
    headline: `${f.act.name}: a ${f.stops}-city run built around where the fans are`,
    audience: audienceLine(f),
    markets: hidden.length
      ? `Strongest outside the usual big markets: ${hidden.map((c) => c.name).join(", ")}. Plus ${f.route.filter((c) => !c.hidden).slice(0, 3).map((c) => c.name).join(", ")}.`
      : `Strongest in ${f.route.slice(0, 4).map((c) => c.name).join(", ")}.`,
    ask: top.length ? `A tour partnership with ${top.map((s) => s.brand.name).join(", ")}: brands this audience already loves, according to Qloo.` : "",
    tourBrief: `${f.route.map((c) => c.name).join(" → ")}. Cities are ranked by where ${f.act.name}'s audience over-indexes (Qloo taste data), not by ticket demand: a starting point for the promoter to validate.`,
    cityNotes: f.route.map((c) => ({
      cityId: c.id,
      note: c.hidden ? `Hidden market: Fan Heat ${c.heat}, outside the area's biggest metros.` : `Fan Heat ${c.heat}.`,
    })),
    emails: top.map((s) => ({
      brandId: s.brand.id,
      subject: `${f.act.name} × ${s.brand.name}: tour partnership`,
      body: [
        `Hi ${s.brand.name} partnerships team,`,
        `${f.act.name} is planning a ${f.stops}-city run. Qloo's taste data ranks ${s.brand.name} #${s.qlooRank} among the brands this audience loves${s.strongestIn.length ? `, and your own audience is strongest in ${s.strongestIn.map(cityName).filter(Boolean).join(" and ")}, both on the route` : ""}.`,
        audienceLine(f),
        `Would you be open to a conversation about a partnership on this tour?`,
        `Best,`,
        `${f.act.name}'s team`,
      ].join("\n\n"),
    })),
    writer: "template",
  };
}

const MONEY = /[$€£]\s?\d|\d+(\.\d+)?\s?(k|m|million|thousand)\b|\d+\s?%/i;

/** Rejects writer output that names IDs it wasn't given or states money or percentages the facts don't contain. */
export function checkPitch(p: z.infer<typeof pitchSchema>, f: WriterFacts): string | undefined {
  // City IDs are lower case (us-nashville) on worldwide plans and Qloo's upper-case UUIDs on older ones: compared either way.
  const cities = new Set(f.route.map((c) => c.id.toLowerCase()));
  const brands = new Set(f.sponsors.slice(0, 3).map((s) => s.brand.id));
  if (p.cityNotes.some((n) => !cities.has(n.cityId.toLowerCase()))) return "a city outside the route";
  if (p.emails.some((e) => !brands.has(e.brandId.toUpperCase()))) return "a brand that isn't a top sponsor";
  const text = [p.headline, p.audience, p.markets, p.ask, p.tourBrief, ...p.cityNotes.map((n) => n.note), ...p.emails.flatMap((e) => [e.subject, e.body])].join("\n");
  if (MONEY.test(text)) return "a money figure or percentage";
  return undefined;
}

export type Writer = (facts: WriterFacts, signal?: AbortSignal) => Promise<PitchPack>;

const openAiWriter: Writer = async (f, signal) => {
  const facts = {
    act: { name: f.act.name, comedian: f.act.comedian, description: f.act.description },
    signalBasis: f.signal.basis === "similar" ? `estimated from similar acts: ${f.signal.similar.map((s) => s.name).join(", ")}` : "the act's own Qloo data",
    audience: { tasteTags: f.fanDna.tags.map((t) => t.name), demographics: f.fanDna.demographics, alsoLoves: f.fanDna.loves.map((l) => `${l.label}: ${l.entity.name}`) },
    route: f.route.map((c) => ({ cityId: c.id, name: placeOf(c), fanHeat: c.heat, hiddenMarket: c.hidden, bigMetro: c.obvious })),
    sponsors: f.sponsors.slice(0, 3).map((s) => ({
      brandId: s.brand.id,
      name: s.brand.name,
      qlooRank: s.qlooRank,
      fit: s.fit,
      categories: s.brand.categories,
      strongestIn: s.strongestIn.map((id) => f.route.find((c) => c.id === id)?.name).filter(Boolean),
    })),
    supportActs: f.supportActs.slice(0, 3).map((s) => s.act.name),
    stops: f.stops,
  };
  const result = await askJson(
    MODELS.writer,
    `You write the sponsor pitch pack for Afinlo, a tour and sponsorship agent. Qloo has already chosen and scored every city, brand and act; use only those, by their IDs, and only the facts given. Fan Heat is audience taste affinity, not ticket demand: never claim sales, attendance, follower counts, prices, fees or deal sizes, and use no money figures or percentages. Brands are prospects whose customers overlap with the fans; never say a brand has agreed to anything or will pay. Write plainly and specifically, like a good booking agent. One email per sponsor, addressed to its partnerships team, under 170 words, ending with a simple ask for a conversation. City notes: one short line each on why the city is on the route, using its Fan Heat and whether it's a hidden market. ${DATA_RULE} Return the requested JSON.`,
    data("facts", JSON.stringify(facts)),
    pitchSchema,
    "pitch_pack",
    { maxTokens: 2600, signal },
  );
  const problem = checkPitch(result, f);
  if (problem) {
    const fallback = templatePitch(f);
    return { ...fallback, tourBrief: `${fallback.tourBrief} (The AI writer's draft mentioned ${problem}, so this plain version is shown instead.)` };
  }
  return {
    ...result,
    cityNotes: result.cityNotes.map((n) => ({ ...n, cityId: f.route.find((c) => c.id.toLowerCase() === n.cityId.toLowerCase())!.id })),
    emails: result.emails.map((e) => ({ ...e, brandId: e.brandId.toUpperCase() })),
    writer: "openai",
    model: MODELS.writer,
  };
};

/** The writer to use: the AI writer when OpenAI is configured, otherwise the plain template. */
export const defaultWriter = (): Writer => (setting("OPENAI_API_KEY") ? openAiWriter : async (f) => templatePitch(f));

const norm = (s: string) => s.toLowerCase().replace(/^st.?s/, "saint ").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "").trim();
/** A city named in a message, among these cities: by name, and by state or country when given ("Portland, OR"). */
export function matchCity(name: string, cities: { id: string; name: string; state?: string; country?: string }[]) {
  const [first, rest] = name.split(",").map((p) => p.trim());
  const n = norm(first);
  const named = cities.filter((c) => norm(c.name) === n);
  const where = rest?.toLowerCase();
  return (where ? named.find((c) => c.state?.toLowerCase().startsWith(where.slice(0, 4)) || c.country?.toLowerCase() === where) : undefined)?.id ?? named[0]?.id;
}

const refineSchema = z
  .object({
    categories: z.array(sponsorCategory).max(3),
    stops: z.number().int().min(3).max(12),
    excludeCities: z.array(z.string().max(80)).max(10),
    homeCity: z.string().max(80),
    focus: z.enum(["balanced", "hidden"]),
    reply: z.string().max(300),
  })
  .strict();

/**
 * The planner: reads a refinement ("only beverage brands", "swap Denver for something closer", "make it six cities")
 * and returns the new filters. It can only choose from the app's own categories and candidate cities.
 */
export async function planRefinement(message: string, plan: Plan, signal?: AbortSignal): Promise<{ request: PlanRequest; reply: string }> {
  const routeNames = plan.route.map((r) => plan.cities.find((c) => c.id === r.cityId)?.name).filter(Boolean);
  // The cities it may name: the plan's own (strongest first), and for home, any city in the tour's area.
  const area = citiesIn(plan.request.where ?? US);
  const nameOf = (id?: string) => plan.cities.find((c) => c.id === id)?.name ?? area.find((c) => c.id === id)?.name;
  const r = await askJson(
    MODELS.planner,
    `You adjust an Afinlo tour plan's filters from the user's message. Keep every filter the message doesn't change. categories: keys from the allowed list only. excludeCities and homeCity: names from the candidate city list only (homeCity empty when not given). focus is 'hidden' when the user wants lesser-known or less obvious markets. reply: one sentence saying what will change. ${DATA_RULE}`,
    [
      data(
        "current",
        JSON.stringify({
          categories: plan.request.categories,
          stops: plan.request.stops,
          focus: plan.request.focus,
          route: routeNames,
          excluded: plan.request.excludeCityIds.map(nameOf).filter(Boolean),
          home: nameOf(plan.request.homeCityId) ?? "",
        }),
      ),
      data("allowed_categories", JSON.stringify(Object.fromEntries(Object.entries(SPONSOR_CATEGORIES).map(([k, v]) => [k, v.label])))),
      data("candidate_cities", plan.cities.map((c) => c.name).join(", ")),
      data("message", message),
    ].join("\n"),
    refineSchema,
    "plan_change",
    { maxTokens: 500, signal },
  );
  const homeCities = area.map((c) => ({ ...c, state: c.admin1 }));
  const ids = (names: string[]) => names.map((n) => matchCity(n, plan.cities)).filter((id): id is string => !!id);
  return {
    request: {
      ...plan.request,
      categories: [...new Set(r.categories as SponsorCategory[])],
      stops: r.stops,
      excludeCityIds: [...new Set([...plan.request.excludeCityIds, ...ids(r.excludeCities)])],
      homeCityId: r.homeCity ? (matchCity(r.homeCity, homeCities) ?? plan.request.homeCityId) : plan.request.homeCityId,
      focus: r.focus,
    },
    reply: r.reply,
  };
}
