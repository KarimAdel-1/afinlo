import { z } from "zod";
import { cityId, TourError, qlooId, sponsorCategory } from "@/core/tour/types";
import { bodyOf, browserOf, errorResponse, forbidden, fromOurPages, knownBrowser, NO_STORE } from "@/platform/tour/http";
import { actById, qlooClient } from "@/platform/tour/qloo";
import { actMemory, rememberAct } from "@/platform/tour/tracker";

export const runtime = "nodejs";

/** What Afinlo remembers about an act here: the brief starts from it. */
export async function GET(_request: Request, ctx: RouteContext<"/api/tour/acts/[actId]/memory">) {
  const id = qlooId.safeParse((await ctx.params).actId);
  if (!id.success) return Response.json({ memory: null }, { headers: NO_STORE });
  return Response.json({ memory: (await actMemory(await knownBrowser(), id.data)) ?? null }, { headers: NO_STORE });
}

const list = (item: z.ZodType<string>) => z.array(item).max(40).optional();
const Body = z
  .object({
    add: z.object({ excludeBrandIds: list(qlooId), excludeCityIds: list(cityId), avoid: z.array(sponsorCategory).max(14).optional() }).strict().default({}),
    remove: z.object({ excludeBrandIds: list(qlooId), excludeCityIds: list(cityId), avoid: z.array(sponsorCategory).max(14).optional() }).strict().default({}),
  })
  .strict();

/** A no to remember for the act's next tours (a brand, a city, a sponsor category), or one taken back. */
export async function POST(request: Request, ctx: RouteContext<"/api/tour/acts/[actId]/memory">) {
  if (!fromOurPages(request)) return forbidden();
  try {
    const id = qlooId.safeParse((await ctx.params).actId);
    const parsed = Body.safeParse(await bodyOf(request, 4000));
    if (!id.success || !parsed.success) throw new TourError("validation", "Check the request.");
    const owner = await browserOf();
    const before = await actMemory(owner, id.data);
    const act = await actById(qlooClient(), id.data, []);
    if (!act) throw new TourError("act_missing", "Qloo doesn't know that act.", 404);
    const { add, remove } = parsed.data;
    const minus = (have: string[] | undefined, take: string[] | undefined) => (have ?? []).filter((v) => !take?.includes(v));
    const memory = await rememberAct(
      owner,
      act,
      {
        excludeBrandIds: [...new Set([...minus(before?.excludeBrandIds, remove.excludeBrandIds), ...(add.excludeBrandIds ?? [])])],
        excludeCityIds: [...new Set([...minus(before?.excludeCityIds, remove.excludeCityIds), ...(add.excludeCityIds ?? [])])],
        avoid: [...new Set([...minus(before?.avoid, remove.avoid), ...(add.avoid ?? [])])] as NonNullable<typeof before>["avoid"],
      },
      { replace: true },
    );
    return Response.json({ memory }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
