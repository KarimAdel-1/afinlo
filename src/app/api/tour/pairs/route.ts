import { TourError, pairInput, type Pairing } from "@/core/tour/types";
import { bodyOf, browserOf, errorResponse, forbidden, fromOurPages, NO_STORE, streamStages, visitorOf } from "@/platform/tour/http";
import { pairRequestKey, runPairing } from "@/platform/tour/pairs";
import { keepSaved } from "@/platform/tour/saved";
import { claimPlanSlot, recentMatch, saveMatch } from "@/platform/tour/store";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Pairs two acts for a double bill. Streams the stages; the same pair within a day returns the pairing made. Either way it goes on Saved. */
export async function POST(request: Request) {
  if (!fromOurPages(request)) return forbidden();
  let input, owner;
  try {
    const parsed = pairInput.safeParse(await bodyOf(request, 1000));
    if (!parsed.success) throw new TourError("validation", parsed.error.issues[0]?.message ?? "Check the request.");
    input = parsed.data;
    owner = await browserOf();
    const reuse = await recentMatch<Pairing>("pair", pairRequestKey(input));
    if (reuse) {
      await keepSaved(owner, reuse.id);
      return Response.json({ id: reuse.id, reused: true }, { headers: NO_STORE });
    }
    await claimPlanSlot(await visitorOf(request));
  } catch (error) {
    return errorResponse(error);
  }
  return streamStages(request, async (onStage, signal) => {
    const pairing = await runPairing(input, { onStage, signal });
    await saveMatch("pair", pairing, pairRequestKey(pairing.request));
    await keepSaved(owner, pairing.id);
    return pairing.id;
  });
}
