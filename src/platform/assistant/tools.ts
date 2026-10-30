// The assistant's tools: remembering what the user tells it, finding an act in Qloo, where its fans are in the world,
// planning a tour, and the user's tours with what each needs next. Every answer reaches the model as fenced data; an
// error comes back as text it can act on. Planning a tour is the same agent the brief runs (planTour), with the same
// limits, and the tour opens as a full workspace.
import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { TasteError } from "@/core/taste/types";
import { REGIONS, whereLabel } from "@/core/tour/regions";
import { newActId } from "@/core/tour/named";
import { nextUp } from "@/core/tour/next";
import {
  MAX_SKIPPED_CITIES,
  MAX_TURNED_DOWN_BRANDS,
  planInput,
  sponsorCategory,
  TourError,
  type ArtistProfile,
  type AssistantCard,
  type AssistantEvent,
  type Plan,
  type TourStage,
} from "@/core/tour/types";
import { citiesIn } from "@/core/tour/world";
import type { QlooClient } from "../taste/qloo";
import { areaNamed } from "../manager/tools";
import { planTour } from "../tour/agent";
import { data } from "../tour/model";
import { searchActs } from "../tour/qloo";
import { keepSaved, savedResults } from "../tour/saved";
import { scanWorld } from "../tour/scan";
import { claimPlanSlot, reusablePlan, savePlan } from "../tour/store";
import { actMemory, rememberAct, tourOf, tracksFor } from "../tour/tracker";
import { matchCity, type Writer } from "../tour/writer";
import { addToProfile } from "./profile";

/** One message to the assistant: who's asking, what's known about them, and what it makes for them. */
export interface AssistantDesk {
  /** The browser asking (its visitor cookie), and the visitor its plan limit counts against. */
  browser: string;
  visitor: string;
  profile: ArtistProfile;
  /** The user's tours, briefly, for the prompt. */
  tours: { planId: string; act: string; area?: string; shows: number }[];
  client: QlooClient;
  /** The pitch writer for tours it plans: the default (AI or template) unless a test gives one. */
  writer?: Writer;
  signal: AbortSignal;
  emit: (event: AssistantEvent) => void;
  made: AssistantCard[];
  toolCalls: number;
}

/** How many lookups the assistant may make for one message. */
export const ASSISTANT_TOOL_BUDGET = 12;

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const qlooIdArg = z.string().regex(UUID);

function make<S extends z.ZodObject>(desk: AssistantDesk, def: { name: string; description: string; schema: S; label: (input: z.infer<S>) => string; run: (input: z.infer<S>) => Promise<unknown> | unknown }) {
  return tool(
    async (input: z.infer<S>) => {
      if (desk.toolCalls >= ASSISTANT_TOOL_BUDGET) return "This message's lookups are used up. Answer from what you have, and say what you couldn't check.";
      desk.toolCalls++;
      desk.emit({ kind: "tool", label: def.label(input) });
      try {
        const out = await def.run(input);
        return data(`afinlo:${def.name}`, typeof out === "string" ? out : JSON.stringify(out));
      } catch (error) {
        if (desk.signal.aborted) throw error;
        return `That didn't work: ${error instanceof TourError || error instanceof TasteError ? error.message : "the lookup failed. Try once more, or answer without it."}`;
      }
    },
    { name: def.name, description: def.description, schema: def.schema },
  ) as unknown as StructuredToolInterface;
}

/** A planning stage, as the user sees it while the tour is made. */
function stageText(s: TourStage) {
  switch (s.stage) {
    case "resolving":
      return `Finding ${s.act} in Qloo`;
    case "cities":
      return `Reading Qloo's map of the fans across ${s.count} cities`;
    case "fallback":
      return `Little data for this act alone: reading acts like it (${s.similar.slice(0, 3).join(", ")})`;
    case "predicting":
      return `Predicting from ${s.from.join(", ")}`;
    case "dna":
      return "Reading who the fans are";
    case "sponsors":
      return "Finding the brands these fans love";
    case "support":
      return "Finding openers whose fans overlap";
    case "scoring":
      return "Scoring the cities and routing the tour";
    case "local":
      return `Finding venues in ${s.cities.join(", ")}`;
    case "writing":
      return "Writing the pitch";
  }
}

const cardId = () => crypto.randomUUID().slice(0, 8);
const routeOf = (plan: Pick<Plan, "route" | "cities">) => plan.route.flatMap((r) => plan.cities.find((c) => c.id === r.cityId) ?? []);

export function assistantTools(desk: AssistantDesk): StructuredToolInterface[] {
  return [
    make(desk, {
      name: "remember_about_user",
      description: "Saves what the user just told you about themselves or their act, for this and every later conversation. Only what they said.",
      schema: z.object({
        name: z.string().max(80).optional().describe("Their name or stage name."),
        role: z.enum(["artist", "comedian", "manager", "agent", "other"]).optional(),
        act: z.string().max(80).optional().describe("The act they're planning for."),
        actId: qlooIdArg.optional().describe("The act's Qloo ID, from find_act."),
        soundsLike: z.array(z.string().max(80)).max(5).optional().describe("Acts they say they sound like."),
        basedIn: z.string().max(80).optional(),
        stage: z.string().max(200).optional().describe("How far along they are, in their words."),
        goals: z.array(z.string().max(160)).max(6).optional(),
        limits: z.array(z.string().max(160)).max(6).optional().describe("Limits to plan around: budget, travel, dates."),
        notes: z.string().max(400).optional(),
      }),
      label: () => "Noting what you told me",
      run: async (learned) => {
        desk.profile = await addToProfile(desk.browser, { ...learned, actId: learned.actId?.toUpperCase() });
        return "Saved.";
      },
    }),
    make(desk, {
      name: "find_act",
      description: "Finds an artist or comedian in Qloo by name: the matches, with their Qloo IDs, to plan from or to name as acts someone sounds like.",
      schema: z.object({ name: z.string().min(2).max(80) }),
      label: ({ name }) => `Looking for ${name} in Qloo`,
      run: async ({ name }) => {
        const acts = await searchActs(desk.client, name, [], desk.signal);
        if (!acts.length) return `Qloo has no act called ${name}. If they're new, ask which 2 or 3 well-known acts they sound like, and plan from those.`;
        return acts.slice(0, 6).map((a) => ({ id: a.id, name: a.name, kind: a.comedian ? "comedian" : a.kind, about: (a.description || a.disambiguation).slice(0, 160) }));
      },
    }),
    make(desk, {
      name: "fans_worldwide",
      description: "Where an act's fans are around the world, from Qloo: the strongest countries (each with its strongest city) and touring regions. For an act Qloo doesn't know, from the acts it sounds like.",
      schema: z.object({
        actId: qlooIdArg.optional().describe("The act's Qloo ID, from find_act."),
        newAct: z
          .object({ name: z.string().min(2).max(80), comedian: z.boolean(), like: z.array(qlooIdArg).min(2).max(3).describe("Qloo IDs of the acts it sounds like.") })
          .optional()
          .describe("An act Qloo doesn't know."),
      }),
      label: () => "Mapping where the fans are",
      run: async ({ actId, newAct }) => {
        if (!actId && !newAct) throw new TourError("act", "Find the act with find_act first, or name the acts it sounds like.");
        const scan = await scanWorld(newAct ? { newAct } : { actId: actId! }, { client: desk.client, signal: desk.signal });
        return {
          act: scan.act.name,
          from: scan.basis === "act" ? "the act's own Qloo data" : `${scan.basis === "named" ? "predicted from" : "estimated from"} ${scan.similar.join(", ")}`,
          countries: scan.countries.slice(0, 6).map((c) => ({ country: c.name, fanHeat: c.heat, strongestCity: c.top.name })),
          regions: scan.regions.slice(0, 4).map((r) => ({ region: r.label, fanHeat: r.heat })),
        };
      },
    }),
    make(desk, {
      name: "plan_tour",
      description:
        "Plans a tour with Afinlo's tour agent: Qloo finds where the fans are, the route is scored and ordered, and the sponsors, venues and pitch come with it. It opens as a full tour for the user, shown below your reply. Takes up to a minute.",
      schema: z.object({
        actId: qlooIdArg.optional().describe("The act's Qloo ID, from find_act."),
        newAct: z
          .object({ name: z.string().min(2).max(80), comedian: z.boolean(), like: z.array(qlooIdArg).min(2).max(3).describe("Qloo IDs of 2 or 3 acts it sounds like, from find_act.") })
          .optional()
          .describe("For an act Qloo doesn't know: planned from the acts it sounds like."),
        area: z.string().min(2).max(160).describe(`Where: "the world", a region (${REGIONS.map((r) => r.label).join(", ")}), or countries by name.`),
        shows: z.number().int().min(3).max(12).optional().describe("How many shows (7 if not said)."),
        focus: z.enum(["balanced", "hidden"]).optional().describe('"hidden" puts lesser-known markets first.'),
        startIn: z.string().max(80).optional().describe("A city in the area the tour starts from."),
        sponsors: z.array(sponsorCategory).max(3).optional().describe("Sponsor categories to pitch; leave out for all."),
        neverPitch: z.array(sponsorCategory).max(14).optional().describe("Sponsor categories the act won't work with."),
      }),
      label: () => "Planning the tour",
      run: async (input) => {
        const where = areaNamed(input.area);
        if (!where) throw new TourError("area", `"${input.area}" isn't an area Afinlo tours. Use "the world", a region (${REGIONS.map((r) => r.label).join(", ")}) or countries by name.`);
        const actId = input.newAct ? newActId(input.newAct.name) : input.actId?.toUpperCase();
        if (!actId) throw new TourError("act", "Find the act with find_act first, or plan a new act from the acts it sounds like (newAct).");
        const home = input.startIn ? matchCity(input.startIn, citiesIn(where).map((c) => ({ ...c, state: c.admin1 }))) : undefined;
        if (input.startIn && !home) throw new TourError("city", `${input.startIn} isn't a city in ${whereLabel(where)}.`);
        // What the act has said no to carries into the plan, as it does from the brief.
        const memory = await actMemory(desk.browser, actId);
        const categories = input.sponsors ?? [];
        const parsed = planInput.safeParse({
          actId,
          newAct: input.newAct,
          where,
          homeCityId: home,
          stops: input.shows ?? 7,
          focus: input.focus ?? "balanced",
          categories,
          avoid: [...new Set([...(input.neverPitch ?? []), ...(memory?.avoid ?? [])])].filter((c) => !categories.includes(c)),
          excludeBrandIds: (memory?.excludeBrandIds ?? []).slice(-MAX_TURNED_DOWN_BRANDS),
          excludeCityIds: (memory?.excludeCityIds ?? []).slice(-MAX_SKIPPED_CITIES),
        });
        if (!parsed.success) throw new TourError("plan", parsed.error.issues[0]?.message ?? "That isn't a tour Afinlo can plan.");
        let plan = await reusablePlan(parsed.data);
        if (!plan) {
          await claimPlanSlot(desk.visitor);
          plan = await planTour(parsed.data, { client: desk.client, writer: desk.writer, signal: desk.signal, onStage: (s) => desk.emit({ kind: "tool", label: stageText(s) }) });
          await savePlan(plan);
        }
        await keepSaved(desk.browser, plan.id);
        const r = plan.request;
        await rememberAct(desk.browser, plan.act, { where: r.where, stops: r.stops, homeCityId: r.homeCityId, categories: r.categories, focus: r.focus, avoid: r.avoid, excludeBrandIds: r.excludeBrandIds, excludeCityIds: r.excludeCityIds }).catch((error) =>
          console.error("Couldn't remember the act's choices:", error),
        );
        const route = routeOf(plan);
        desk.made.push({ id: cardId(), kind: "tour", planId: plan.id, title: `${plan.act.name}: ${route.length}-stop tour of ${plan.area ?? whereLabel(where)}`, route: route.map((c) => c.name) });
        return {
          shownToTheUser: "a card to open the tour, below your reply",
          act: plan.act.name,
          area: plan.area,
          fansFrom: plan.signal.basis === "act" ? "the act's own Qloo data" : `${plan.signal.basis === "named" ? "predicted from" : "estimated from"} ${plan.signal.similar.map((s) => s.name).join(", ")}`,
          route: route.map((c) => ({ city: c.name, fanHeat: c.heat, hiddenMarket: c.hidden })),
          againstTheBiggestCities: plan.proof && { routeFanHeat: plan.proof.route, biggestCitiesFanHeat: plan.proof.biggest },
          topSponsors: plan.sponsors.slice(0, 3).map((s) => s.brand.name),
          notes: plan.notes,
        };
      },
    }),
    make(desk, {
      name: "my_tours",
      description: "The user's tours, newest first, with how far each has got and what each needs next.",
      schema: z.object({}),
      label: () => "Going through your tours",
      run: async () => {
        const saved = await savedResults(desk.browser, 10);
        if (!saved.length) return "They have no tours yet.";
        const tracks = await tracksFor(desk.browser, saved.map((s) => tourOf(s.plan)));
        return saved.map(({ plan }) => {
          const { tasks, progress } = nextUp(plan, tracks.get(tourOf(plan)) ?? []);
          return { planId: plan.id, act: plan.act.name, area: plan.area, shows: plan.route.length, venuesConfirmed: progress.venuesConfirmed, pitchesOut: progress.pitchesSent, signed: progress.signed, next: tasks.slice(0, 3).map((t) => t.title) };
        });
      },
    }),
    make(desk, {
      name: "show_tour",
      description: "Shows one of the user's tours below your reply, to open: after my_tours, when they want to go to it.",
      schema: z.object({ planId: z.string().max(40) }),
      label: () => "Finding the tour",
      run: async ({ planId }) => {
        const found = (await savedResults(desk.browser, 50)).find((s) => s.plan.id === planId);
        if (!found) throw new TourError("tour", "That isn't one of their tours: look them up with my_tours.");
        const route = routeOf(found.plan);
        desk.made.push({ id: cardId(), kind: "tour", planId, title: `${found.plan.act.name}: ${route.length}-stop tour of ${found.plan.area ?? "the United States"}`, route: route.map((c) => c.name) });
        return "Shown below your reply.";
      },
    }),
  ];
}
