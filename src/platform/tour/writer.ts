// The pitch pack's writer, which chooses no result: it turns scored Qloo facts into the deck's text and the sponsor
// emails. It sees only the facts and their IDs, and its output is checked: an unknown ID or an invented money figure
// sends the plan to the plain template instead. (Changes to a tour are the tour team's: src/platform/manager.)
import { z } from "zod";
import { setting } from "@/lib/settings";
import { unsupportedClaim } from "@/core/tour/claims";
import { placeOf } from "@/core/tour/regions";
import type { CityHeat, Plan, PitchPack } from "@/core/tour/types";
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

/**
 * The audience in a sentence. Qloo's demographics are skews against its average audience, not shares: "skewing male"
 * says more men than usual, not more men than women, so they're described that way.
 */
const audienceLine = (f: WriterFacts) => {
  const d = f.fanDna.demographics;
  const age = d ? [...d.age].sort((a, b) => b.skew - a.skew)[0] : undefined;
  const lean = d ? (d.gender.male > 0.1 ? "male" : d.gender.female > 0.1 ? "female" : "") : "";
  const skews = [age && age.skew > 0 ? age.band : "", lean].filter(Boolean);
  return [
    f.fanDna.tags.length ? `Fans who love ${f.fanDna.tags.slice(0, 3).map((t) => t.name.toLowerCase()).join(", ")}` : `${f.act.name}'s audience`,
    skews.length ? `skewing ${skews.join(" and ")} against Qloo's average audience` : "",
  ]
    .filter(Boolean)
    .join(", ") + ".";
};

/** The pitch pack in plain sentences from the facts alone: used when the AI writer isn't configured or fails a check. */
export function templatePitch(f: WriterFacts): PitchPack {
  const hidden = f.route.filter((c) => c.hidden);
  const top = f.sponsors.slice(0, 3);
  const cityName = (id: string) => f.route.find((c) => c.id === id)?.name ?? "";
  // The route as made, which can be shorter than the shows asked for.
  const shows = f.route.length;
  return {
    headline: `${f.act.name}: a ${shows}-city run built around where the fans are`,
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
        `${f.act.name} is planning a ${shows}-city run. Qloo's taste data ranks ${s.brand.name} #${s.qlooRank} among the brands this audience loves${s.strongestIn.length ? `, and your own audience is strongest in ${s.strongestIn.map(cityName).filter(Boolean).join(" and ")}, both on the route` : ""}.`,
        audienceLine(f),
        `Would you be open to a conversation about a partnership on this tour?`,
        `Best,`,
        `${f.act.name}'s team`,
      ].join("\n\n"),
    })),
    writer: "template",
  };
}

/**
 * Rejects writer output that names IDs it wasn't given, or claims what the facts can't support (unsupportedClaim):
 * money, audience or sales counts, or a brand having agreed to anything.
 */
export function checkPitch(p: z.infer<typeof pitchSchema>, f: WriterFacts): string | undefined {
  // City IDs are lower case (us-nashville) on worldwide plans and Qloo's upper-case UUIDs on older ones: compared either way.
  const cities = new Set(f.route.map((c) => c.id.toLowerCase()));
  const brands = new Set(f.sponsors.slice(0, 3).map((s) => s.brand.id));
  if (p.cityNotes.some((n) => !cities.has(n.cityId.toLowerCase()))) return "a city outside the route";
  if (p.emails.some((e) => !brands.has(e.brandId.toUpperCase()))) return "a brand that isn't a top sponsor";
  const text = [p.headline, p.audience, p.markets, p.ask, p.tourBrief, ...p.cityNotes.map((n) => n.note), ...p.emails.flatMap((e) => [e.subject, e.body])].join("\n");
  return unsupportedClaim(text);
}

export type Writer = (facts: WriterFacts, signal?: AbortSignal) => Promise<PitchPack>;

const openAiWriter: Writer = async (f, signal) => {
  const facts = {
    act: { name: f.act.name, comedian: f.act.comedian, description: f.act.description },
    signalBasis:
      f.signal.basis === "similar"
        ? `estimated from similar acts: ${f.signal.similar.map((s) => s.name).join(", ")}`
        : f.signal.basis === "named"
          ? `predicted from the acts named as like it (the act isn't in Qloo yet): ${f.signal.similar.map((s) => s.name).join(", ")}`
          : "the act's own Qloo data",
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
    // The route as made: the shows asked for may not all have found a city.
    shows: f.route.length,
  };
  const result = await askJson(
    MODELS.writer,
    `You write the sponsor pitch pack for Afinlo, a tour and sponsorship agent. Qloo has already chosen and scored every city, brand and act; use only those, by their IDs, and only the facts given. Fan Heat is audience taste affinity, not ticket demand: never claim sales, attendance, follower counts, prices, fees or deal sizes, and use no money figures or percentages. Demographics are skews against Qloo's average audience, not shares of this one. Brands are prospects whose customers overlap with the fans; never say a brand has agreed to anything or will pay. Write plainly and specifically, like a good booking agent. One email per sponsor, addressed to its partnerships team, under 170 words, ending with a simple ask for a conversation. City notes: one short line each on why the city is on the route, using its Fan Heat and whether it's a hidden market. ${DATA_RULE} Return the requested JSON.`,
    data("facts", JSON.stringify(facts)),
    pitchSchema,
    "pitch_pack",
    { maxTokens: 2600, signal, role: "writer" },
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
    model: MODELS.writer.model,
  };
};

/**
 * The writer to use: the AI writer when OpenAI is configured, otherwise the plain template. When OpenAI fails (an
 * outage, the credit runs out), the plan still gets made, with the template and a note saying so.
 */
export const defaultWriter = (): Writer =>
  setting("OPENAI_API_KEY")
    ? async (f, signal) => {
        try {
          return await openAiWriter(f, signal);
        } catch (error) {
          if (signal?.aborted) throw error;
          console.error("The AI writer failed, so the plan uses the template:", error);
          const plain = templatePitch(f);
          return { ...plain, tourBrief: `${plain.tourBrief} (The AI writer didn't answer, so this plain version is shown instead.)` };
        }
      }
    : async (f) => templatePitch(f);

const norm = (s: string) => s.toLowerCase().replace(/^st.?s/, "saint ").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "").trim();
/** A city named in a message, among these cities: by name, and by state or country when given ("Portland, OR"). */
export function matchCity(name: string, cities: { id: string; name: string; state?: string; country?: string }[]) {
  const [first, rest] = name.split(",").map((p) => p.trim());
  const n = norm(first);
  const named = cities.filter((c) => norm(c.name) === n);
  const where = rest?.toLowerCase();
  return (where ? named.find((c) => c.state?.toLowerCase().startsWith(where.slice(0, 4)) || c.country?.toLowerCase() === where) : undefined)?.id ?? named[0]?.id;
}
