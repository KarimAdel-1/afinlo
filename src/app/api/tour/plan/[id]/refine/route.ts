import { z } from "zod";
import { TourError } from "@/core/tour/types";
import { setting } from "@/lib/settings";
import { allow, errorResponse, forbidden, fromOurPages, NO_STORE, visitorOf } from "@/platform/tour/http";
import { getPlan } from "@/platform/tour/store";
import { planRefinement } from "@/platform/tour/writer";

export const runtime = "nodejs";
const Body = z.object({ message: z.string().trim().min(2).max(400) }).strict();

/**
 * The planner: turns a message ("only beverage brands", "make it 5 cities") into the next request's filters. The
 * browser then runs that request as a new plan linked to this one.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/tour/plan/[id]/refine">) {
  if (!fromOurPages(request)) return forbidden();
  try {
    const plan = await getPlan((await params).id);
    if (!plan) throw new TourError("plan_missing", "That plan doesn't exist.", 404);
    if (!setting("OPENAI_API_KEY")) throw new TourError("openai_not_configured", "Refining by message needs OpenAI, which isn't configured on this server yet. The filters above work without it.", 503);
    if (!allow("refine", await visitorOf(request), { count: 20, seconds: 600 })) throw new TourError("refine_limit", "Please wait a moment before the next change.", 429);
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) throw new TourError("validation", "Write what you'd like to change.");
    const { request: next, reply } = await planRefinement(parsed.data.message, plan, request.signal);
    return Response.json({ request: { ...next, parentId: plan.id }, reply }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
