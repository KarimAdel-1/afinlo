// The tour agent, as a LangGraph graph: resolve the act → read its signal (its own heatmap, or acts like it when
// that's empty) → in parallel, its Fan DNA, the brands its fans love and its support acts → score cities, route and
// sponsors in plain code → local spots and sponsor evidence for the route → write the pitch pack. Qloo picks every
// result; the code scores; the language model only writes (src/platform/tour/writer.ts).
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { TasteTrace } from "@/core/taste/types";
import { whereLabel, type Where } from "@/core/tour/regions";
import { planRoute, proofOf, routeRules, scoreCities, scoreSponsors, strongestIn, type BrandResult, type HeatCell } from "@/core/tour/scoring";
import { newActId, newActOf } from "@/core/tour/named";
import { cellsIn, citiesIn, locationOf } from "@/core/tour/world";
import {
  TourError,
  planInput,
  SPONSOR_CATEGORIES,
  type Act,
  type CityHeat,
  type FanDNA,
  type TourStage,
  type LocalSpot,
  type Plan,
  type PlanEntity,
  type PlanInput,
  type PlanRequest,
  type Proof,
  type Sponsor,
  type SupportAct,
} from "@/core/tour/types";
import type { QlooClient } from "../taste/qloo";
import { actById, audienceTags, brands as qlooBrands, demographics, qlooClient, heatCells, loves, namedActs, placesNear, sharedTags, similarActs, TRANSPORT, VENUE_TAGS } from "./qloo";
import { heatPoints, keepCities } from "@/core/tour/geo";
import { newPlanId } from "./store";
import { defaultWriter, type Writer } from "./writer";

const replace = <T>(fallback: () => T) => Annotation<T>({ reducer: (_old: T, next: T) => next, default: fallback });
const State = Annotation.Root({
  request: replace<PlanRequest>(() => ({ actId: "", stops: 7, categories: [], excludeCityIds: [], focus: "balanced" })),
  act: replace<Act | undefined>(() => undefined),
  /** For an act Qloo doesn't know, the acts named as like it. */
  named: replace<Act[]>(() => []),
  basis: replace<Plan["signal"]["basis"]>(() => "act"),
  similar: replace<(PlanEntity & { affinity: number; comedian: boolean })[]>(() => []),
  signalIds: replace<string[]>(() => []),
  cells: replace<HeatCell[]>(() => []),
  fanDna: replace<FanDNA>(() => ({ tags: [], loves: [] })),
  brands: replace<BrandResult[]>(() => []),
  supportActs: replace<SupportAct[]>(() => []),
  cities: replace<CityHeat[]>(() => []),
  route: replace<Plan["route"]>(() => []),
  proof: replace<Proof | undefined>(() => undefined),
  sponsors: replace<Sponsor[]>(() => []),
  localSpots: replace<LocalSpot[]>(() => []),
  pitch: replace<Plan["pitch"] | undefined>(() => undefined),
  notes: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
});
type S = typeof State.State;
/** The act together with the three acts whose audiences overlap most: the fallback signal. */
const wideSignal = (s: S) => [...new Set([...s.signalIds, ...s.similar.slice(0, 3).map((p) => p.id)])];
/** Whose Qloo data the plan is from, as the plan and the writer show it: the acts standing in, or the acts named. */
const signalOf = (s: S): Plan["signal"] => ({
  basis: s.basis,
  similar:
    s.basis === "named"
      ? s.named.map(({ id, name, kind, disambiguation, popularity, image }) => ({ id, name, type: kind, disambiguation: disambiguation || undefined, popularity, image }))
      : s.similar.slice(0, 4).map(({ id, name, type, disambiguation, popularity, image }) => ({ id, name, type, disambiguation, popularity, image })),
});

export interface AgentDeps {
  client?: QlooClient;
  writer?: Writer;
  onStage?: (stage: TourStage) => void;
  signal?: AbortSignal;
}

/** Runs the agent for one request and returns the finished plan (not yet saved). */
export async function planTour(input: PlanInput, deps: AgentDeps = {}): Promise<Plan> {
  const started = Date.now();
  const parsed = planInput.parse(input);
  const request: PlanRequest = {
    // An act Qloo doesn't know is known by its name, so its memory carries from tour to tour.
    actId: parsed.newAct ? newActId(parsed.newAct.name) : parsed.actId,
    newAct: parsed.newAct,
    where: parsed.where,
    homeCityId: parsed.homeCityId,
    stops: parsed.stops,
    categories: parsed.categories,
    avoid: parsed.avoid,
    excludeCityIds: parsed.excludeCityIds,
    includeCityIds: parsed.includeCityIds,
    excludeBrandIds: parsed.excludeBrandIds,
    focus: parsed.focus,
  };
  // The area: its candidate cities, and the one shape Qloo's heatmap is asked about.
  const area: Where = parsed.where;
  const candidates = citiesIn(area);
  if (!candidates.length) throw new TourError("no_cities", "Afinlo has no cities in that area yet. Choose another country or region.");
  const location = locationOf(area);
  const client = deps.client ?? qlooClient();
  const writer = deps.writer ?? defaultWriter();
  const stage = deps.onStage ?? (() => {});
  const signal = deps.signal;
  const traces: TasteTrace[] = [];

  const resolve = async (s: S): Promise<Partial<S>> => {
    if (s.request.newAct) {
      const named = await namedActs(client, s.request.newAct.like, traces, signal);
      if (!named) throw new TourError("act_missing", "Qloo doesn't know one of the acts you named. Search again and pick one of the matches.", 404);
      const act = newActOf(s.request.newAct);
      stage({ stage: "resolving", act: act.name });
      return { act, named };
    }
    const act = await actById(client, s.request.actId, traces, signal);
    if (!act) throw new TourError("act_missing", "Qloo doesn't know that act. Search again and pick one of the matches.", 404);
    stage({ stage: "resolving", act: act.name });
    return { act };
  };

  // The act's own heatmap; if Qloo has none, a combined signal from the acts whose audiences overlap most. An act Qloo
  // doesn't know has only the acts named as like it.
  const readSignal = async (s: S): Promise<Partial<S>> => {
    const act = s.act!;
    stage({ stage: "cities", count: candidates.length });
    if (s.named.length) {
      const ids = s.named.map((a) => a.id);
      stage({ stage: "predicting", from: s.named.map((a) => a.name) });
      const [cells, similar] = await Promise.all([
        heatCells(client, ids, traces, signal, location).catch((error) => {
          if (signal?.aborted) throw error;
          return [];
        }),
        similarActs(client, ids, traces, signal).catch(() => []),
      ]);
      const names = s.named.map((a) => a.name).join(", ");
      return { cells, signalIds: ids, similar, basis: "named", notes: [`Qloo doesn't know ${act.name} yet, so everything here is predicted from the acts named as like it: ${names}.`] };
    }
    let own: HeatCell[] = [];
    const notes: string[] = [];
    try {
      own = await heatCells(client, [act.id], traces, signal, location);
    } catch (error) {
      if (signal?.aborted) throw error;
      notes.push(`Qloo's location data didn't answer for ${act.name}.`);
    }
    const similar = await similarActs(client, [act.id], traces, signal).catch(() => []);
    if (own.length) return { cells: own, signalIds: [act.id], similar, basis: "act", notes };
    const proxies = similar.slice(0, 4);
    if (!proxies.length) return { cells: [], signalIds: [act.id], similar, basis: "act", notes };
    stage({ stage: "fallback", similar: proxies.map((p) => p.name) });
    const ids = [act.id, ...proxies.map((p) => p.id)];
    const cells = await heatCells(client, ids, traces, signal, location).catch(() => []);
    return {
      cells,
      signalIds: ids,
      similar,
      basis: "similar",
      notes: [...notes, `Qloo has no location data for ${act.name} alone, so where the fans are is estimated from acts with overlapping audiences: ${proxies.map((p) => p.name).join(", ")}.`],
    };
  };

  const dna = async (s: S): Promise<Partial<S>> => {
    stage({ stage: "dna" });
    // Each part of the profile is optional: a part Qloo can't answer for the act is asked of the act with acts like
    // it, and a part still unanswered is left out, never filled in.
    const wide = wideSignal(s);
    const ask = async <T,>(get: (ids: string[]) => Promise<T>, empty: (v: T) => boolean): Promise<T | undefined> => {
      const first = await get(s.signalIds).catch(() => undefined);
      if (first !== undefined && !empty(first)) return first;
      return wide.length > s.signalIds.length ? get(wide).catch(() => first) : first;
    };
    const [tags, demo, love] = await Promise.all([
      ask((ids) => audienceTags(client, ids, traces, signal), (v) => !v.length),
      ask((ids) => demographics(client, ids, traces, signal), (v) => !v),
      ask((ids) => loves(client, ids, traces, signal), (v) => !v.length),
    ]);
    return { fanDna: { tags: tags ?? [], demographics: demo, loves: love ?? [] } };
  };

  const sponsors = async (s: S): Promise<Partial<S>> => {
    stage({ stage: "sponsors" });
    const tags = s.request.categories.map((c) => SPONSOR_CATEGORIES[c].tag);
    let failed = false;
    let found = await qlooBrands(client, s.signalIds, tags, traces, signal, location).catch((error) => {
      if (signal?.aborted) throw error;
      failed = true;
      return [] as BrandResult[];
    });
    // A thin or failed brand signal for the act alone: widen to the acts like it, and say so.
    const wide = wideSignal(s);
    if (found.length < 3 && wide.length > s.signalIds.length) {
      const wider = await qlooBrands(client, wide, tags, traces, signal, location).catch(() => [] as BrandResult[]);
      if (wider.length > found.length) {
        found = wider;
        const why = failed ? `Qloo's brand search didn't answer for ${s.act!.name} alone` : `Qloo has few brand matches for ${s.act!.name} alone`;
        return { brands: found, notes: [`${why}, so sponsors are brands loved by ${s.act!.name}'s audience together with audiences of similar acts (${s.similar.slice(0, 3).map((p) => p.name).join(", ")}).`] };
      }
    }
    if (!found.length && traces.some((t) => t.tool === "qloo_recommend" && t.parameters["filter.type"] === "urn:entity:brand" && t.status === "error"))
      return { brands: [], notes: ["Qloo's brand data didn't answer for this audience, so this plan has no sponsor matches. Try again shortly."] };
    return { brands: found };
  };

  const support = async (s: S): Promise<Partial<S>> => {
    stage({ stage: "support" });
    // Support slots suit smaller acts with overlapping audiences; a comedian's opener is a comedian when Qloo has some.
    const smaller = s.similar.filter((a) => a.popularity === undefined || s.act!.popularity === undefined || a.popularity <= s.act!.popularity + 0.001);
    const comics = smaller.filter((a) => a.comedian);
    const pool = (s.act!.comedian && comics.length >= 2 ? comics : smaller).slice(0, 4);
    // An act Qloo doesn't know is compared through the acts named as like it.
    const me = s.basis === "named" ? s.signalIds.join(",") : s.act!.id;
    const shared = await Promise.all(pool.map((a) => sharedTags(client, me, a.id, traces, signal).catch(() => [])));
    return { supportActs: pool.map((a, i) => ({ act: { id: a.id, name: a.name, type: a.type, disambiguation: a.disambiguation, popularity: a.popularity, image: a.image }, affinity: a.affinity, shared: shared[i] })) };
  };

  const score = async (s: S): Promise<Partial<S>> => {
    stage({ stage: "scoring" });
    // Fan Heat from other acts' fans is never high confidence, whether Qloo or the user chose the acts.
    const basis = s.basis === "act" ? "act" : "similar";
    // A world tour reads Qloo's coarser world cells its own way, and spreads its shows across countries.
    const rules = routeRules(area, s.request.stops);
    const cities = scoreCities(s.cells, { basis, cities: candidates, world: area.kind === "world" });
    const route = planRoute(cities, {
      gapKm: rules.gapKm,
      perCountry: rules.perCountry,
      stops: s.request.stops,
      homeCityId: s.request.homeCityId,
      excludeCityIds: s.request.excludeCityIds,
      includeCityIds: s.request.includeCityIds,
      focus: s.request.focus,
    });
    const scored = scoreSponsors(s.brands, {
      categoryTags: s.request.categories.map((c) => SPONSOR_CATEGORIES[c].tag),
      avoidTags: (s.request.avoid ?? []).map((c) => SPONSOR_CATEGORIES[c].tag),
      excludeBrandIds: s.request.excludeBrandIds,
      basis,
    });
    const notes: string[] = [];
    if (!cities.length) notes.push(`Qloo has no location data for ${s.act!.name} or acts like it in ${whereLabel(area)} yet, so Afinlo can't say where the fans are there. It won't guess.`);
    if (!scored.length) notes.push(s.request.categories.length ? "No brands in those categories came back for this audience. Try other categories." : "Qloo returned no brands for this audience.");
    return { cities, route, proof: proofOf(cities, route), sponsors: scored.map((x) => ({ ...x, strongestIn: [] })), notes };
  };

  // For the route's top cities: venues and spots fans love; for the top sponsors: where the brand's own audience is
  // strongest along the route.
  const local = async (s: S): Promise<Partial<S>> => {
    const routeCities = s.route.map((r) => s.cities.find((c) => c.id === r.cityId)!).filter(Boolean);
    const top = [...routeCities].sort((a, b) => b.heat - a.heat).slice(0, 3);
    if (top.length) stage({ stage: "local", cities: top.map((c) => c.name) });
    const venueTag = s.act!.comedian ? VENUE_TAGS.comedy : VENUE_TAGS.music;
    const spots: LocalSpot[] = [];
    for (const city of top) {
      const [venues, places] = await Promise.all([
        placesNear(client, s.signalIds, city, { tag: venueTag }, traces, signal).catch(() => []),
        placesNear(client, s.signalIds, city, {}, traces, signal).catch(() => []),
      ]);
      for (const v of venues.slice(0, 2)) spots.push({ cityId: city.id, place: v, kind: "venue" });
      // Activation ideas, not transport: airports, stations and car parks are left out.
      const useful = places.filter((p) => !venues.some((v) => v.id === p.id) && !TRANSPORT.test(p.name));
      for (const p of useful.slice(0, 3)) spots.push({ cityId: city.id, place: p, kind: "spot" });
    }
    const sponsors = [...s.sponsors];
    await Promise.all(
      sponsors.slice(0, 4).map(async (sp, i) => {
        const cells = await heatCells(client, [sp.brand.id], traces, signal, location).catch(() => []);
        sponsors[i] = { ...sp, strongestIn: strongestIn(cells, routeCities, area.kind === "world") };
      }),
    );
    return { localSpots: spots, sponsors };
  };

  const write = async (s: S): Promise<Partial<S>> => {
    stage({ stage: "writing" });
    const routeCities = s.route.map((r) => s.cities.find((c) => c.id === r.cityId)!).filter(Boolean);
    const pitch = await writer(
      { act: s.act!, fanDna: s.fanDna, sponsors: s.sponsors, supportActs: s.supportActs, signal: signalOf(s), route: routeCities, stops: s.request.stops },
      signal,
    );
    return { pitch };
  };

  const graph = new StateGraph(State)
    .addNode("resolve", resolve)
    .addNode("readSignal", readSignal)
    .addNode("dna", dna)
    .addNode("findSponsors", sponsors)
    .addNode("support", support)
    .addNode("score", score)
    .addNode("local", local)
    .addNode("write", write)
    .addEdge(START, "resolve")
    .addEdge("resolve", "readSignal")
    .addEdge("readSignal", "dna")
    .addEdge("readSignal", "findSponsors")
    .addEdge("readSignal", "support")
    .addEdge(["dna", "findSponsors", "support"], "score")
    .addEdge("score", "local")
    .addEdge("local", "write")
    .addEdge("write", END)
    .compile();

  const s = await graph.invoke({ request }, { signal, recursionLimit: 30 });
  return {
    id: newPlanId(),
    parentId: parsed.parentId,
    createdAt: new Date().toISOString(),
    request,
    act: s.act!,
    signal: signalOf(s),
    fanDna: s.fanDna,
    heatPoints: heatPoints(cellsIn(s.cells, area)),
    area: whereLabel(area),
    cities: keepCities(s.cities, s.route),
    route: s.route,
    proof: s.proof,
    sponsors: s.sponsors.slice(0, 12),
    supportActs: s.supportActs,
    localSpots: s.localSpots,
    pitch: s.pitch!,
    notes: s.notes,
    traces,
    durationMs: Date.now() - started,
  };
}
