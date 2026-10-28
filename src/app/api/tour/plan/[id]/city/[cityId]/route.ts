import { TourError } from "@/core/tour/types";
import { makeCityGuide } from "@/platform/tour/city";
import { allow, errorResponse, forbidden, fromOurPages, visitorOf } from "@/platform/tour/http";
import { getCityGuide, getPlan, saveCityGuide } from "@/platform/tour/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A stop's venues, local partners and places fans love, from Qloo: made the first time it's asked for, then kept. */
export async function GET(request: Request, ctx: RouteContext<"/api/tour/plan/[id]/city/[cityId]">) {
  if (!fromOurPages(request)) return forbidden();
  try {
    const { id, cityId } = await ctx.params;
    const plan = await getPlan(id);
    if (!plan) throw new TourError("plan_missing", "That tour doesn't exist.", 404);
    let guide = await getCityGuide(plan.id, cityId);
    if (!guide) {
      if (!allow("guide", await visitorOf(request), { count: 60, seconds: 3600 })) throw new TourError("guide_limit", "You've opened a lot of cities in the last hour. Please wait a little.", 429);
      guide = await makeCityGuide(plan, cityId, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]) });
      await saveCityGuide(guide);
    }
    const { traces, ...rest } = guide;
    return Response.json({ guide: { ...rest, requests: traces.length } }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    return errorResponse(error);
  }
}
