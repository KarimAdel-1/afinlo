import { z } from "zod";
import { TourError } from "@/core/tour/types";
import { bodyOf, browserOf, errorResponse, forbidden, fromOurPages, NO_STORE } from "@/platform/tour/http";
import { addSaved, isPlanId } from "@/platform/tour/saved";
import { getPlan } from "@/platform/tour/store";

export const runtime = "nodejs";
const Body = z.object({ id: z.string().max(60) }).strict();

/** Keeps a tour someone shared (or an example) with this browser's tours. */
export async function POST(request: Request) {
  if (!fromOurPages(request)) return forbidden();
  try {
    const parsed = Body.safeParse(await bodyOf(request, 500));
    if (!parsed.success || !isPlanId(parsed.data.id)) throw new TourError("validation", "That isn't an Afinlo tour.");
    if (!(await getPlan(parsed.data.id))) throw new TourError("missing", "That tour doesn't exist.", 404);
    await addSaved(await browserOf(), parsed.data.id);
    return Response.json({ saved: true }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
