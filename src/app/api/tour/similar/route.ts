import { z } from "zod";
import { TourError, qlooId } from "@/core/tour/types";
import { allow, errorResponse, forbidden, fromOurPages, NO_STORE, visitorOf } from "@/platform/tour/http";
import { actById, qlooClient, pairSuggestions } from "@/platform/tour/qloo";

export const runtime = "nodejs";
const Body = z.object({ actId: qlooId }).strict();

/** Co-headliners to suggest for an act: the acts whose audiences overlap most with its own, from Qloo. Public. */
export async function POST(request: Request) {
  if (!fromOurPages(request)) return forbidden();
  try {
    if (!allow("search", await visitorOf(request), { count: 40, seconds: 300 })) throw new TourError("search_limit", "That's a lot of searches. Please wait a moment.", 429);
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) throw new TourError("validation", "Choose an act first.");
    const client = qlooClient();
    const act = await actById(client, parsed.data.actId, [], request.signal);
    if (!act) throw new TourError("act_missing", "Qloo doesn't know that act.", 404);
    return Response.json({ acts: await pairSuggestions(client, act, [], request.signal) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
