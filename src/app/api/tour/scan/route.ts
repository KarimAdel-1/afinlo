import { z } from "zod";
import { TourError, qlooId } from "@/core/tour/types";
import { allow, bodyOf, errorResponse, forbidden, fromOurPages, NO_STORE, visitorOf } from "@/platform/tour/http";
import { scanWorld } from "@/platform/tour/scan";

export const runtime = "nodejs";
export const maxDuration = 60;
const Body = z.object({ actId: qlooId }).strict();

/** Where an act's fans are, worldwide: the first step of a tour's brief. One Qloo heatmap, cached for a day. */
export async function POST(request: Request) {
  if (!fromOurPages(request)) return forbidden();
  try {
    const parsed = Body.safeParse(await bodyOf(request, 300));
    if (!parsed.success) throw new TourError("validation", "Choose an act first.");
    if (!allow("scan", await visitorOf(request), { count: 30, seconds: 3600 })) throw new TourError("scan_limit", "You've looked up a lot of acts in the last hour. Please wait a little.", 429);
    const scan = await scanWorld(parsed.data.actId, { signal: request.signal });
    const { traces, ...rest } = scan;
    return Response.json({ ...rest, requests: traces.length }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
