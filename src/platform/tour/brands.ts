// For brands: a brand in, the artists and comedians whose fans love it out, with the cities where both
// audiences are strong. Qloo picks the brand, the acts and every map; plain code scores Brand Fit and the shared
// cities. No language model.
import type { TasteTrace } from "@/core/taste/types";
import { US } from "@/core/tour/regions";
import { scoreActs, scoreCities, sharedCities } from "@/core/tour/scoring";
import { citiesIn } from "@/core/tour/world";
import { brandMatchInput, TourError, type BrandMatch, type BrandMatchInput, type TourStage } from "@/core/tour/types";
import type { QlooClient } from "../taste/qloo";
import { heatTiles } from "./map";
import { actsForBrand, brandById, qlooClient, heatCells } from "./qloo";
import { newMatchId } from "./store";

/** How many of the best-matched acts get their own map compared with the brand's. */
const MAPPED = 8;

export const brandRequestKey = (r: BrandMatch["request"]) => JSON.stringify([r.brandId, r.acts]);

export async function runBrandMatch(input: BrandMatchInput, deps: { client?: QlooClient; onStage?: (s: TourStage) => void; signal?: AbortSignal } = {}): Promise<BrandMatch> {
  const started = Date.now();
  const request = brandMatchInput.parse(input);
  const client = deps.client ?? qlooClient();
  const stage = deps.onStage ?? (() => {});
  const signal = deps.signal;
  const traces: TasteTrace[] = [];
  const notes: string[] = [];

  const brand = await brandById(client, request.brandId, traces, signal);
  if (!brand) throw new TourError("brand_missing", "Qloo doesn't know that brand. Search again and pick one of the matches.", 404);
  stage({ stage: "resolving", act: brand.name });
  stage({ stage: "acts", kinds: request.acts });
  const failed = (what: string) => (error: unknown) => {
    if (signal?.aborted) throw error;
    notes.push(`Qloo's ${what} didn't answer for ${brand.name}.`);
    return [];
  };
  const [cells, musicians, comedians] = await Promise.all([
    heatCells(client, [brand.id], traces, signal).catch(failed("location data")),
    request.acts === "comedy" ? [] : actsForBrand(client, brand.id, "music", traces, signal).catch(failed("artist data")),
    request.acts === "music" ? [] : actsForBrand(client, brand.id, "comedy", traces, signal).catch(failed("comedian data")),
  ]);
  const cities = scoreCities(cells, { basis: "act", cities: citiesIn(US) });
  const scored = scoreActs([...musicians, ...comedians]);
  if (!scored.length) throw new TourError("no_acts", `Qloo returned no ${request.acts === "comedy" ? "comedians" : request.acts === "music" ? "artists" : "acts"} for ${brand.name}'s audience. Try ${request.acts === "both" ? "another brand" : "both kinds of act"}.`, 404);

  // Each of the best-matched acts' own map, against the brand's: where both audiences are strong.
  const mapped = scored.slice(0, MAPPED);
  stage({ stage: "overlap", count: mapped.length });
  const actCities = await Promise.all(mapped.map((m) => heatCells(client, [m.act.id], traces, signal).then((c) => scoreCities(c, { basis: "act", cities: citiesIn(US) }), () => [])));
  if (!cities.length) notes.push(`Qloo has no location data for ${brand.name}, so the cities where both audiences are strong can't be shown.`);
  return {
    id: newMatchId("brand"),
    createdAt: new Date().toISOString(),
    request,
    brand,
    heat: heatTiles(cells),
    cities,
    acts: scored.slice(0, 12).map((m, i) => ({ ...m, shared: i < MAPPED && cities.length ? sharedCities(cities, actCities[i]).slice(0, 3) : [] })),
    notes,
    traces,
    durationMs: Date.now() - started,
  };
}
