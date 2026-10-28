import { z } from "zod";
import { TourError } from "@/core/tour/types";
import { allow, errorResponse, forbidden, fromOurPages, NO_STORE, visitorOf } from "@/platform/tour/http";
import { qlooClient, searchActs, searchBrands } from "@/platform/tour/qloo";

export const runtime = "nodejs";
const Body = z.object({ query: z.string().trim().min(2, "Type at least two letters.").max(80), type: z.enum(["act", "brand"]).default("act") }).strict();

/** Acts (or brands) matching a name, from Qloo, for the visitor to pick the exact one. Public. */
export async function POST(request: Request) {
  if (!fromOurPages(request)) return forbidden();
  try {
    const visitor = await visitorOf(request);
    if (!allow("search", visitor, { count: 40, seconds: 300 })) throw new TourError("search_limit", "That's a lot of searches. Please wait a moment.", 429);
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) throw new TourError("validation", parsed.error.issues[0]?.message ?? "Check the search.");
    const { query, type } = parsed.data;
    if (type === "brand") return Response.json({ brands: await searchBrands(qlooClient(), query, [], request.signal) }, { headers: NO_STORE });
    return Response.json({ acts: await searchActs(qlooClient(), query, [], request.signal) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
