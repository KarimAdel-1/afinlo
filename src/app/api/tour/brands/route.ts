import { brandMatchInput, TourError, type BrandMatch } from "@/core/tour/types";
import { brandRequestKey, runBrandMatch } from "@/platform/tour/brands";
import { bodyOf, browserOf, errorResponse, forbidden, fromOurPages, NO_STORE, streamStages, visitorOf } from "@/platform/tour/http";
import { keepSaved } from "@/platform/tour/saved";
import { claimPlanSlot, recentMatch, saveMatch } from "@/platform/tour/store";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Finds the acts whose fans love a brand. Streams the stages; the same request within a day returns the match made. Either way it goes on Saved. */
export async function POST(request: Request) {
  if (!fromOurPages(request)) return forbidden();
  let input, owner;
  try {
    const parsed = brandMatchInput.safeParse(await bodyOf(request, 1000));
    if (!parsed.success) throw new TourError("validation", parsed.error.issues[0]?.message ?? "Check the request.");
    input = parsed.data;
    owner = await browserOf();
    const reuse = await recentMatch<BrandMatch>("brand", brandRequestKey(input));
    if (reuse) {
      await keepSaved(owner, reuse.id);
      return Response.json({ id: reuse.id, reused: true }, { headers: NO_STORE });
    }
    await claimPlanSlot(await visitorOf(request));
  } catch (error) {
    return errorResponse(error);
  }
  return streamStages(request, async (onStage, signal) => {
    const match = await runBrandMatch(input, { onStage, signal });
    await saveMatch("brand", match, brandRequestKey(match.request));
    await keepSaved(owner, match.id);
    return match.id;
  });
}
