// The tour team's tools: typed lookups over the tour's own data and Qloo, and the few things the team may do (set a
// status, remember a "no", propose a change, save a draft). This is how the agents see the tour: every city, brand,
// venue and number they name comes from one of these answers, which reach the model as fenced data. A change to the
// tour is only ever a proposal: the user applies it, and the planner makes a new version.
import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { COUNTRY_NAMES, placeOf, REGIONS, where as whereSchema, whereLabel, type Where } from "@/core/tour/regions";
import { signalIdsOf } from "@/core/tour/named";
import { km, routeRules, scoreSponsors, strongestIn } from "@/core/tour/scoring";
import {
  PITCH_LABELS,
  PITCH_STATUSES,
  planInput,
  SPONSOR_CATEGORIES,
  sponsorCategory,
  TourError,
  VENUE_LABELS,
  VENUE_STATUSES,
  type AgentDraft,
  type ManagerCard,
  type PitchStatus,
  type PlanRequest,
  type Specialist,
  type SponsorCategory,
  type VenueStatus,
} from "@/core/tour/types";
import { whyCity } from "@/core/tour/why";
import { locationOf } from "@/core/tour/world";
import { brands as qlooBrands, heatCells } from "../tour/qloo";
import { data } from "../tour/model";
import { rememberAct, setTrack } from "../tour/tracker";
import { MONEY } from "../tour/writer";
import { areaCityNamed, brandNamed, cardId, cityNamed, guideFor, named, routeOf, type Desk } from "./desk";

/** How many tool calls the whole team may make for one message. */
export const TOOL_BUDGET = 10;

type Tool = StructuredToolInterface;

/**
 * A tool for `agent`: it counts against the turn's budget, says what it's doing, and answers as a fenced data block. An
 * error comes back as text the agent can act on (look something up first, use another name), never as a crash.
 */
function make<S extends z.ZodObject>(
  desk: Desk,
  agent: Specialist | "manager",
  def: { name: string; description: string; schema: S; label: (input: z.infer<S>) => string; run: (input: z.infer<S>) => Promise<unknown> | unknown },
): Tool {
  return tool(
    async (input: z.infer<S>) => {
      if (desk.toolCalls >= TOOL_BUDGET) return "The team has used this message's lookups. Answer from what you have, and say what you couldn't check.";
      desk.toolCalls++;
      desk.emit({ kind: "tool", agent, label: def.label(input) });
      try {
        const out = await def.run(input);
        return data(`afinlo:${def.name}`, typeof out === "string" ? out : JSON.stringify(out));
      } catch (error) {
        if (desk.signal.aborted) throw error;
        return `That didn't work: ${error instanceof TourError ? error.message : "the lookup failed. Try once more, or answer without it."}`;
      }
    },
    { name: def.name, description: def.description, schema: def.schema },
  ) as unknown as Tool;
}

/** Records something for the user to see under the reply. */
function keep(desk: Desk, by: Specialist | "manager", card: ManagerCard) {
  desk.made.push({ by, card });
  return card;
}

const cityArg = z.string().min(2).max(80).describe("A city's name, as the tour names it (a state or country may follow a comma).");
const statusOf = (desk: Desk, kind: "venue" | "sponsor", itemId: string) => desk.tracks.find((t) => t.kind === kind && t.itemId === itemId);

function stopNamed(desk: Desk, name: string) {
  const city = cityNamed(desk.plan, name);
  if (!city || !desk.plan.route.some((r) => r.cityId === city.id)) throw new TourError("not_a_stop", `${name} isn't a stop on this tour. The stops are ${routeOf(desk.plan).map((c) => c.name).join(", ")}.`);
  return city;
}

// Shared.

function routeOverview(desk: Desk, agent: Specialist) {
  return make(desk, agent, {
    name: "route_overview",
    description: "The tour at a glance: the act, the area, every stop in order with its Fan Heat and how it's reached, and the route against the area's biggest cities.",
    schema: z.object({}),
    label: () => "Reading the route",
    run: () => {
      const p = desk.plan;
      const route = routeOf(p);
      const name = (id?: string) => (id ? (p.cities.find((c) => c.id === id)?.name ?? areaCityNamed(p, id)?.name ?? id) : undefined);
      return {
        act: p.act.name,
        kind: p.act.comedian ? "comedian" : "musician",
        fansFrom: p.signal.basis === "act" ? "the act's own Qloo data" : `${p.signal.basis === "named" ? "predicted from" : "estimated from"} ${p.signal.similar.map((s) => s.name).join(", ")}`,
        area: p.area ?? "the United States",
        shows: p.route.length,
        focus: p.request.focus === "hidden" ? "hidden markets first" : "the strongest cities, big or small",
        startsFrom: name(p.request.homeCityId) ?? "wherever makes the shortest tour",
        km: p.route.reduce((s, r) => s + r.legKm, 0),
        flights: p.route.filter((r) => r.mode === "fly").length,
        againstTheBiggestCities: p.proof && { routeFanHeat: p.proof.route, biggestCitiesFanHeat: p.proof.biggest, biggestCities: p.proof.biggestCities },
        stops: p.route.map((r, i) => {
          const c = route.find((x) => x.id === r.cityId)!;
          return { stop: i + 1, city: placeOf(c), fanHeat: c.heat, hiddenMarket: c.hidden, metro: c.population, legKm: r.legKm, leg: r.mode ?? (i ? "drive" : "start") };
        }),
        leftOut: p.request.excludeCityIds.map(name),
        askedFor: (p.request.includeCityIds ?? []).map(name),
      };
    },
  });
}

/** Saves a draft for the user, after the same checks the pitch writer's drafts pass. */
function saveDraft(desk: Desk, agent: Specialist, type: AgentDraft["type"]) {
  const what = { pitch: "a pitch email to a brand's partnerships team", hold: "a hold request email to a venue", post: "a post for the act's fans in a city" }[type];
  return make(desk, agent, {
    name: "save_draft",
    description: `Saves ${what} for the user to copy and send. It's checked first: if it's refused, fix what the answer says and save again.`,
    schema: z.object({
      to: z.string().min(2).max(120).describe(type === "pitch" ? "The brand." : type === "hold" ? "The venue." : "The stop's city."),
      language: z.string().min(2).max(40).describe("The language it's written in, in English (Spanish, Arabic)."),
      subject: z.string().max(140).optional().describe(type === "post" ? "Leave out." : "The email's subject line."),
      body: z.string().min(20).max(4000),
    }),
    label: (d) => `Saving a draft for ${d.to}`,
    run: (d) => {
      const target =
        type === "pitch"
          ? brandNamed(desk, d.to)
          : type === "hold"
            ? named(
                [...desk.guides.values()].flatMap((g) => g.venues),
                d.to,
              )
            : (() => {
                const c = cityNamed(desk.plan, d.to);
                return c && desk.plan.route.some((r) => r.cityId === c.id) ? c : undefined;
              })();
      if (!target)
        throw new TourError(
          "draft_target",
          type === "pitch" ? `${d.to} isn't one of this tour's brands: pitch a sponsor from sponsor_list, or a brand found with more_brands.` : type === "hold" ? `${d.to} isn't a venue you've looked up: find it with stop_venues first.` : `${d.to} isn't a stop on this tour.`,
        );
      const text = `${d.subject ?? ""}\n${d.body}`;
      const money = text.match(MONEY);
      if (money) return `Refused: it has a money figure or percentage ("${money[0]}"). Drafts never state fees, prices or numbers the tour's data doesn't have. Rewrite it without and save again.`;
      if (/<\/?data\b/i.test(text)) return "Refused: it quotes a data block. Write it in plain words and save again.";
      if (type !== "post" && !d.subject?.trim()) return "Refused: an email needs a subject line. Add one and save again.";
      const max = type === "post" ? 700 : 1800;
      if (d.body.length > max) return `Refused: it's ${d.body.length} characters. Keep it under ${max} and save again.`;
      keep(desk, agent, { id: cardId(), kind: "draft", draft: { type, to: target.name, toId: target.id, language: d.language, ...(d.subject ? { subject: d.subject.trim() } : {}), body: d.body.trim() } });
      return `Saved: the user sees the draft for ${target.name} under the reply.`;
    },
  });
}

// The route planner.

const areaNamed = (text: string): Where | undefined => {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (/^(the )?(whole )?world( tour)?$|^everywhere$|^worldwide$/.test(norm(text))) return { kind: "world" };
  const region = REGIONS.find((r) => norm(r.label) === norm(text) || r.id === text.trim().toLowerCase());
  if (region) return { kind: "region", region: region.id };
  const country = (name: string) => Object.keys(COUNTRY_NAMES).find((iso) => norm(COUNTRY_NAMES[iso]) === norm(name) || iso.toLowerCase() === name.trim().toLowerCase());
  const whole = country(text);
  const isos = whole ? [whole] : text.split(/,|\band\b|&/i).map((p) => country(p));
  const parsed = whereSchema.safeParse({ kind: "countries", countries: isos });
  return isos.every(Boolean) && parsed.success ? parsed.data : undefined;
};

function routeTools(desk: Desk): Tool[] {
  const p = desk.plan;
  const detail = (c: NonNullable<ReturnType<typeof cityNamed>>) => {
    const stops = routeOf(p);
    const nearest = stops.filter((s) => s.id !== c.id).sort((a, b) => Math.hypot(a.lat - c.lat, a.lon - c.lon) - Math.hypot(b.lat - c.lat, b.lon - c.lon))[0];
    return {
      city: placeOf(c),
      fanHeat: c.heat,
      qlooAffinity: c.affinity,
      qlooCells: c.cells,
      confidence: c.confidence,
      hiddenMarket: c.hidden,
      oneOfTheBiggestMarkets: c.obvious,
      metro: c.population,
      tourScore: c.tourScore,
      rankByFanHeat: p.cities.indexOf(c) + 1,
      stop: p.route.findIndex((r) => r.cityId === c.id) + 1 || null,
      nearestStop: nearest?.name,
      why: whyCity(p, c),
    };
  };
  return [
    routeOverview(desk, "route"),
    make(desk, "route", {
      name: "city_details",
      description: "One city: its Fan Heat and what's behind it (Qloo's affinity and cells), its tour score, and why it is or isn't on the route.",
      schema: z.object({ city: cityArg }),
      label: ({ city }) => `Looking at ${city}`,
      run: ({ city }) => {
        const c = cityNamed(p, city);
        if (!c) {
          const inArea = areaCityNamed(p, city);
          return inArea
            ? `${placeOf(inArea)} is in the tour's area, but not among the ${p.cities.length} strongest cities for this act in Qloo's heatmap, so its fans there are fewer or Qloo has little data near it.`
            : `${city} isn't a candidate city in ${p.area ?? "the tour's area"}.`;
        }
        return detail(c);
      },
    }),
    make(desk, "route", {
      name: "cities_off_route",
      description: "The strongest cities that aren't on the route, strongest first, with why each isn't.",
      schema: z.object({ limit: z.number().int().min(1).max(10).default(6) }),
      label: () => "Checking the strong cities off the route",
      run: ({ limit }) =>
        p.cities
          .filter((c) => !p.route.some((r) => r.cityId === c.id))
          .slice(0, limit)
          .map((c) => ({ city: placeOf(c), fanHeat: c.heat, hiddenMarket: c.hidden, tourScore: c.tourScore, why: whyCity(p, c) })),
    }),
    make(desk, "route", {
      name: "propose_change",
      description:
        "Proposes a change to the tour for the user to apply: the number of shows, cities to skip or add, where it starts, hidden markets first, or another area. Nothing changes until the user applies it; the planner then makes a new version of the tour from Qloo's data.",
      schema: z.object({
        shows: z.number().int().min(3).max(12).optional(),
        skip: z.array(cityArg).max(6).optional().describe("Cities to leave out."),
        add: z.array(cityArg).max(4).optional().describe("Cities the tour must include."),
        startFrom: z.string().max(80).optional().describe('A city in the area to start from, or "anywhere".'),
        focus: z.enum(["balanced", "hidden"]).optional().describe('"hidden" puts hidden markets first.'),
        area: z.string().max(120).optional().describe('Another area: a region ("Europe"), countries ("Germany and Austria"), or "the world" for a world tour.'),
      }),
      label: () => "Drafting a change to the route",
      run: (c) => {
        const r = p.request;
        const area = c.area ? areaNamed(c.area) : undefined;
        if (c.area && !area) throw new TourError("area", `"${c.area}" isn't an area Afinlo tours. Name a region (${REGIONS.map((x) => x.label).join(", ")}) or countries.`);
        const resolve = (names: string[] | undefined, within: "plan" | "area") =>
          (names ?? []).map((n) => {
            const found = within === "plan" ? (cityNamed(p, n) ?? areaCityNamed(p, n)) : areaCityNamed(p, n);
            if (!found) throw new TourError("city", `${n} isn't a candidate city in ${p.area ?? "the tour's area"}.`);
            return found;
          });
        const skip = area ? [] : resolve(c.skip, "plan");
        const add = area ? [] : resolve(c.add, "plan");
        const start = c.startFrom && !/^any/i.test(c.startFrom.trim()) && !area ? resolve([c.startFrom], "area")[0] : undefined;
        const ids = (list: { id: string }[]) => list.map((x) => x.id);
        const next: PlanRequest & { parentId: string } = {
          ...r,
          ...(c.shows ? { stops: c.shows } : {}),
          ...(c.focus ? { focus: c.focus } : {}),
          // A new area starts afresh: the old area's cities don't apply there.
          ...(area
            ? { where: area, excludeCityIds: [], includeCityIds: undefined, homeCityId: undefined }
            : {
                excludeCityIds: [...new Set([...r.excludeCityIds.filter((id) => !ids(add).includes(id)), ...ids(skip)])],
                includeCityIds: [...new Set([...(r.includeCityIds ?? []).filter((id) => !ids(skip).includes(id)), ...ids(add)])],
                homeCityId: c.startFrom ? start?.id : r.homeCityId,
              }),
          parentId: p.id,
        };
        if (!planInput.safeParse(next).success) throw new TourError("change", "That change doesn't make a valid tour. Try fewer cities.");
        // A city added next to a stop takes that stop's place: shows stay a set distance apart.
        const gap = routeRules(p.request.where, next.stops).gapKm;
        const displaced = routeOf(p).filter((s) => !ids(skip).includes(s.id) && !ids(add).includes(s.id) && add.some((a) => km(a, s) < gap));
        const summary = [
          c.shows && c.shows !== r.stops && `${c.shows} shows`,
          skip.length && `skip ${skip.map((x) => x.name).join(", ")}`,
          add.length && `add ${add.map((x) => x.name).join(", ")}${displaced.length ? ` (${displaced.map((x) => x.name).join(", ")} makes way: shows stay ${gap} km apart)` : ""}`,
          c.startFrom && (start ? `start in ${start.name}` : "start wherever is shortest"),
          c.focus && c.focus !== r.focus && (c.focus === "hidden" ? "hidden markets first" : "the strongest cities first"),
          area && `tour ${whereLabel(area)} instead`,
        ].filter(Boolean);
        if (!summary.length) return "That's how the tour already is: nothing to change.";
        keep(desk, "route", { id: cardId(), kind: "change", summary: summary.join(" · "), request: next });
        return `Proposed: ${summary.join("; ")}. The user applies it from the chat; nothing has changed yet. A city added must have Qloo data to be routed.`;
      },
    }),
  ];
}

// The venue booker.

function venueTools(desk: Desk): Tool[] {
  return [
    routeOverview(desk, "venues"),
    make(desk, "venues", {
      name: "stop_venues",
      description: "The venues these fans love near a stop, from Qloo, with where each stands for this tour.",
      schema: z.object({ city: cityArg }),
      label: ({ city }) => `Finding venues in ${city}`,
      run: async ({ city }) => {
        const c = stopNamed(desk, city);
        const guide = await guideFor(desk, c.id);
        return {
          city: placeOf(c),
          venues: guide.venues.map((v) => ({ venue: v.name, id: v.id, kind: v.kind, address: v.address, rating: v.rating, fansAffinity: v.affinity, status: VENUE_LABELS[(statusOf(desk, "venue", v.id)?.status ?? "to_contact") as VenueStatus] })),
          notes: guide.notes,
        };
      },
    }),
    make(desk, "venues", {
      name: "set_venue_status",
      description: "Records where a venue stands for a stop (asked, on hold, confirmed, passed). Only when the user says so.",
      schema: z.object({ city: cityArg, venue: z.string().min(2).max(120), status: z.enum(VENUE_STATUSES), note: z.string().max(300).optional() }),
      label: ({ venue }) => `Updating ${venue}`,
      run: async ({ city, venue, status, note }) => {
        const c = stopNamed(desk, city);
        const v = named((await guideFor(desk, c.id)).venues, venue);
        if (!v) throw new TourError("venue", `${venue} isn't among ${c.name}'s venues: list them with stop_venues.`);
        await setTrack(desk.browser, desk.tourId, { kind: "venue", itemId: v.id, cityId: c.id, status, note: note ?? "" });
        desk.tracks = [...desk.tracks.filter((t) => !(t.kind === "venue" && t.itemId === v.id)), { kind: "venue", itemId: v.id, cityId: c.id, status, note: note ?? "", updatedAt: new Date().toISOString() }];
        keep(desk, "venues", { id: cardId(), kind: "status", text: `${v.name}, ${c.name}: ${VENUE_LABELS[status]}`, track: { kind: "venue", itemId: v.id, cityId: c.id, status, note: note ?? "" } });
        return `${v.name} in ${c.name} is now "${VENUE_LABELS[status]}".`;
      },
    }),
    saveDraft(desk, "venues", "hold"),
  ];
}

// The sponsor scout.

function sponsorTools(desk: Desk): Tool[] {
  const p = desk.plan;
  const route = routeOf(p);
  const nameOf = (id: string) => route.find((c) => c.id === id)?.name ?? id;
  const tagOf = (c: SponsorCategory) => SPONSOR_CATEGORIES[c].tag;
  const labelsOf = (tags: string[]) => (Object.keys(SPONSOR_CATEGORIES) as SponsorCategory[]).filter((k) => tags.some((t) => t.startsWith(tagOf(k)))).map((k) => SPONSOR_CATEGORIES[k].label);
  return [
    routeOverview(desk, "sponsors"),
    make(desk, "sponsors", {
      name: "sponsor_list",
      description: "The tour's sponsors from Qloo, best fit first: Sponsor Fit, size, the route cities where the brand's own audience is strongest, and where each pitch stands.",
      schema: z.object({ category: sponsorCategory.optional() }),
      label: ({ category }) => (category ? `Reading the ${SPONSOR_CATEGORIES[category].label.toLowerCase()} sponsors` : "Reading the sponsors"),
      run: ({ category }) =>
        p.sponsors
          .filter((s) => !category || s.brand.categories.some((t) => t.startsWith(tagOf(category))))
          .map((s) => ({
            brand: s.brand.name,
            id: s.brand.id,
            sponsorFit: s.fit,
            qlooRank: s.qlooRank,
            size: s.tier,
            categories: labelsOf(s.brand.categories),
            strongestOnRoute: s.strongestIn.map(nameOf),
            pitch: PITCH_LABELS[(statusOf(desk, "sponsor", s.brand.id)?.status ?? "to_send") as PitchStatus],
          })),
    }),
    make(desk, "sponsors", {
      name: "more_brands",
      description: "Asks Qloo for more brands these fans love in a category, beyond the tour's sponsors, scored the same way.",
      schema: z.object({ category: sponsorCategory }),
      label: ({ category }) => `Asking Qloo for ${SPONSOR_CATEGORIES[category].label.toLowerCase()} brands`,
      run: async ({ category }) => {
        const found = await qlooBrands(desk.client, signalIdsOf(p), [tagOf(category)], [], desk.signal, p.request.where ? locationOf(p.request.where) : undefined);
        const no = new Set([...(p.request.excludeBrandIds ?? []), ...(desk.memory?.excludeBrandIds ?? []), ...p.sponsors.map((s) => s.brand.id)]);
        const avoid = [...(p.request.avoid ?? []), ...(desk.memory?.avoid ?? [])].map(tagOf);
        const scored = scoreSponsors(found, { categoryTags: [tagOf(category)], avoidTags: avoid, excludeBrandIds: [...no], basis: p.signal.basis === "act" ? "act" : "similar" }).slice(0, 8);
        for (const s of scored) desk.found.set(s.brand.id, { id: s.brand.id, name: s.brand.name, fit: s.fit, tier: s.tier });
        return scored.length ? scored.map((s) => ({ brand: s.brand.name, id: s.brand.id, sponsorFit: s.fit, size: s.tier })) : `Qloo found no more ${SPONSOR_CATEGORIES[category].label.toLowerCase()} brands for these fans.`;
      },
    }),
    make(desk, "sponsors", {
      name: "brand_strength",
      description: "Where a brand's own audience is strongest along the route, from the brand's Qloo heatmap: the evidence for a pitch.",
      schema: z.object({ brand: z.string().min(2).max(120) }),
      label: ({ brand }) => `Mapping ${brand}'s audience`,
      run: async ({ brand }) => {
        const b = brandNamed(desk, brand);
        if (!b) throw new TourError("brand", `${brand} isn't one of this tour's brands.`);
        if (b.sponsor?.strongestIn.length) return { brand: b.name, strongestOnRoute: b.sponsor.strongestIn.map(nameOf) };
        const cells = await heatCells(desk.client, [b.id], [], desk.signal, p.request.where ? locationOf(p.request.where) : undefined);
        const strongest = strongestIn(cells, route, p.request.where?.kind === "world").map(nameOf);
        return strongest.length ? { brand: b.name, strongestOnRoute: strongest } : `Qloo has no location data for ${b.name} along this route.`;
      },
    }),
    make(desk, "sponsors", {
      name: "set_sponsor_status",
      description: "Records where a pitch to a brand stands (sent, replied, signed, passed). Only when the user says so.",
      schema: z.object({ brand: z.string().min(2).max(120), status: z.enum(PITCH_STATUSES), note: z.string().max(300).optional() }),
      label: ({ brand }) => `Updating ${brand}`,
      run: async ({ brand, status, note }) => {
        const b = brandNamed(desk, brand);
        if (!b) throw new TourError("brand", `${brand} isn't one of this tour's brands.`);
        await setTrack(desk.browser, desk.tourId, { kind: "sponsor", itemId: b.id, status, note: note ?? "" });
        desk.tracks = [...desk.tracks.filter((t) => !(t.kind === "sponsor" && t.itemId === b.id)), { kind: "sponsor", itemId: b.id, status, note: note ?? "", updatedAt: new Date().toISOString() }];
        keep(desk, "sponsors", { id: cardId(), kind: "status", text: `${b.name}: ${PITCH_LABELS[status]}`, track: { kind: "sponsor", itemId: b.id, status, note: note ?? "" } });
        return `The pitch to ${b.name} is now "${PITCH_LABELS[status]}".`;
      },
    }),
    saveDraft(desk, "sponsors", "pitch"),
  ];
}

// The promoter.

function promoterTools(desk: Desk): Tool[] {
  const p = desk.plan;
  return [
    routeOverview(desk, "promoter"),
    make(desk, "promoter", {
      name: "fan_dna",
      description: "Who the fans are, from Qloo: their taste, their age and gender skew, what else they love, and support acts whose audiences overlap.",
      schema: z.object({}),
      label: () => "Reading the Fan DNA",
      run: () => ({
        taste: p.fanDna.tags.map((t) => t.name),
        demographics: p.fanDna.demographics && { ageSkew: p.fanDna.demographics.age.map((a) => ({ ages: a.band, skew: a.skew })), gender: p.fanDna.demographics.gender },
        alsoLove: p.fanDna.loves.map((l) => ({ kind: l.label, name: l.entity.name })),
        openers: p.supportActs.map((s) => ({ act: s.act.name, sharedTaste: s.shared })),
      }),
    }),
    make(desk, "promoter", {
      name: "city_spots",
      description: "Places these fans love near a stop, from Qloo: bars, shops and spots for posts, meet-ups and pop-ups.",
      schema: z.object({ city: cityArg }),
      label: ({ city }) => `Finding spots in ${city}`,
      run: async ({ city }) => {
        const c = stopNamed(desk, city);
        const guide = await guideFor(desk, c.id);
        return { city: placeOf(c), country: c.country, loved: guide.loved.map((x) => ({ name: x.name, kind: x.kind })), localPartners: guide.leads.map((x) => ({ name: x.name, kind: x.kind })) };
      },
    }),
    saveDraft(desk, "promoter", "post"),
  ];
}

export function teamTools(agent: Specialist, desk: Desk): Tool[] {
  return { route: routeTools, venues: venueTools, sponsors: sponsorTools, promoter: promoterTools }[agent](desk);
}

/** The manager's own tools: what's remembered about the act, and remembering a "no" for its next tours. */
export function managerTools(desk: Desk): Tool[] {
  const p = desk.plan;
  const cityName = (id: string) => p.cities.find((c) => c.id === id)?.name ?? areaCityNamed(p, id)?.name ?? id;
  return [
    make(desk, "manager", {
      name: "act_memory",
      description: "What Afinlo remembers about this act from earlier tours: the brands, sponsor categories and cities it said no to.",
      schema: z.object({}),
      label: () => "Checking what's remembered",
      run: () => {
        const m = desk.memory ?? {};
        return {
          brandsTurnedDown: (m.excludeBrandIds ?? []).map((id) => p.sponsors.find((s) => s.brand.id === id)?.brand.name ?? "a brand from an earlier tour"),
          neverPitch: (m.avoid ?? []).map((c) => SPONSOR_CATEGORIES[c].label),
          citiesLeftOut: (m.excludeCityIds ?? []).map(cityName),
        };
      },
    }),
    make(desk, "manager", {
      name: "remember_no",
      description: "Remembers that the act said no to a brand, a sponsor category or a city, so its next tours leave it out. Only when the user says so.",
      schema: z.object({ kind: z.enum(["brand", "category", "city"]), name: z.string().min(2).max(120) }),
      label: ({ name }) => `Remembering no to ${name}`,
      run: async ({ kind, name }) => {
        let change: Parameters<typeof rememberAct>[2], what: string;
        if (kind === "brand") {
          const b = brandNamed(desk, name);
          if (!b) throw new TourError("brand", `${name} isn't one of this tour's brands.`);
          change = { excludeBrandIds: [b.id] };
          what = b.name;
        } else if (kind === "category") {
          const key = (Object.keys(SPONSOR_CATEGORIES) as SponsorCategory[]).find((k) => k === name || SPONSOR_CATEGORIES[k].label.toLowerCase().includes(name.toLowerCase()));
          if (!key) throw new TourError("category", `"${name}" isn't a sponsor category. They are: ${Object.values(SPONSOR_CATEGORIES).map((c) => c.label).join(", ")}.`);
          change = { avoid: [key] };
          what = SPONSOR_CATEGORIES[key].label.toLowerCase();
        } else {
          const c = cityNamed(p, name) ?? areaCityNamed(p, name);
          if (!c) throw new TourError("city", `${name} isn't a city in ${p.area ?? "the tour's area"}.`);
          change = { excludeCityIds: [c.id] };
          what = c.name;
        }
        desk.memory = await rememberAct(desk.browser, p.act, change);
        keep(desk, "manager", { id: cardId(), kind: "memory", text: `${p.act.name}'s next tours leave out ${what}.` });
        return `Remembered: ${p.act.name}'s next tours leave out ${what}. This tour is unchanged unless a change is proposed and applied.`;
      },
    }),
  ];
}
