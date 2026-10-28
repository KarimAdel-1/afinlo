// The co-headliner finder: two acts in, the cities where both audiences are strong, what the two crowds share, and a
// double-bill route. Qloo answers for each act (its map) and for the pair (compare); plain code combines them. No
// language model.
import type { TasteTrace } from "@/core/taste/types";
import { US } from "@/core/tour/regions";
import { mapOverlap, pairCities, planRoute, scoreCities } from "@/core/tour/scoring";
import { citiesIn } from "@/core/tour/world";
import { TourError, pairInput, type TourStage, type Pairing, type PairInput } from "@/core/tour/types";
import type { QlooClient } from "../taste/qloo";
import { pairTiles } from "./map";
import { actById, qlooClient, heatCells, sharedTags } from "./qloo";
import { newMatchId } from "./store";

/** The same two acts in either order are the same question. */
export const pairRequestKey = (r: Pairing["request"]) => JSON.stringify([...[r.aId, r.bId].sort(), r.stops]);

export async function runPairing(input: PairInput, deps: { client?: QlooClient; onStage?: (s: TourStage) => void; signal?: AbortSignal } = {}): Promise<Pairing> {
  const started = Date.now();
  const request = pairInput.parse(input);
  const client = deps.client ?? qlooClient();
  const stage = deps.onStage ?? (() => {});
  const signal = deps.signal;
  const traces: TasteTrace[] = [];
  const notes: string[] = [];

  const [a, b] = await Promise.all([actById(client, request.aId, traces, signal), actById(client, request.bId, traces, signal)]);
  if (!a || !b) throw new TourError("act_missing", "Qloo doesn't know one of those acts. Search again and pick one of the matches.", 404);
  stage({ stage: "pair", a: a.name, b: b.name });
  const mapOf = (id: string, name: string) =>
    heatCells(client, [id], traces, signal).catch((error) => {
      if (signal?.aborted) throw error;
      notes.push(`Qloo's location data didn't answer for ${name}.`);
      return [];
    });
  const [cellsA, cellsB, shared] = await Promise.all([mapOf(a.id, a.name), mapOf(b.id, b.name), sharedTags(client, a.id, b.id, traces, signal, 6).catch(() => [])]);
  const citiesA = scoreCities(cellsA, { basis: "act", cities: citiesIn(US) }),
    citiesB = scoreCities(cellsB, { basis: "act", cities: citiesIn(US) });
  for (const [act, cities] of [[a, citiesA], [b, citiesB]] as const)
    if (!cities.length) notes.push(`Qloo has no location data for ${act.name}, so there are no cities the two share. Try an act with more data.`);

  stage({ stage: "route" });
  const cities = pairCities(citiesA, citiesB);
  return {
    id: newMatchId("pair"),
    createdAt: new Date().toISOString(),
    request,
    a,
    b,
    heat: pairTiles(cellsA, cellsB),
    cities,
    route: planRoute(cities, { stops: request.stops, focus: "balanced" }),
    shared,
    overlap: Number(mapOverlap(citiesA, citiesB).toFixed(3)),
    notes,
    traces,
    durationMs: Date.now() - started,
  };
}
