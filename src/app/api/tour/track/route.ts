import { TourError, trackInput } from "@/core/tour/types";
import { bodyOf, browserOf, errorResponse, forbidden, fromOurPages, NO_STORE } from "@/platform/tour/http";
import { getPlan } from "@/platform/tour/store";
import { setTrack, tourOf } from "@/platform/tour/tracker";
import { prospectsFor } from "@/platform/tour/work";

export const runtime = "nodejs";

/**
 * Where a venue or a sponsor stands on a tour (asked, on hold, confirmed; sent, replied, signed), for this browser.
 * Only the plan's own sponsors (and brands its team found for it) and stops.
 */
export async function PUT(request: Request) {
  if (!fromOurPages(request)) return forbidden();
  try {
    const parsed = trackInput.safeParse(await bodyOf(request, 1500));
    if (!parsed.success) throw new TourError("validation", parsed.error.issues[0]?.message ?? "Check the request.");
    const t = parsed.data;
    const plan = await getPlan(t.planId);
    if (!plan) throw new TourError("plan_missing", "That tour doesn't exist.", 404);
    const browser = await browserOf();
    // A sponsor is one of the plan's, or a brand the tour's team found for it (kept in tour_prospects).
    if (t.kind === "sponsor" && !plan.sponsors.some((s) => s.brand.id === t.itemId) && !(await prospectsFor(browser, tourOf(plan))).some((p) => p.id === t.itemId))
      throw new TourError("not_a_sponsor", "That brand isn't one of this tour's sponsors.", 404);
    if (t.kind === "venue" && !plan.route.some((r) => r.cityId === t.cityId)) throw new TourError("not_on_route", "That city isn't on this tour.", 404);
    const updatedAt = await setTrack(browser, tourOf(plan), { kind: t.kind, itemId: t.itemId, cityId: t.kind === "venue" ? t.cityId : undefined, status: t.status, note: t.note ?? "" });
    return Response.json({ updatedAt }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
