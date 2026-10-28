import { newActId } from "@/core/tour/named";
import { TourError, planInput, type TourStage, type Plan } from "@/core/tour/types";
import { planTour } from "@/platform/tour/agent";
import { browserOf, errorResponse, forbidden, fromOurPages, NO_STORE, visitorOf } from "@/platform/tour/http";
import { keepSaved, removeSaved } from "@/platform/tour/saved";
import { claimPlanSlot, getPlan, recentPlanFor, savePlan } from "@/platform/tour/store";
import { rememberAct } from "@/platform/tour/tracker";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * What a new plan means for the visitor's tours: it goes on Saved (in place of the plan it changes, when it's a
 * change), and the act's choices are remembered for its next tour. Logged, never thrown: the plan is already made.
 */
async function keep(owner: string, plan: Plan, parent?: Plan) {
  try {
    if (parent && parent.id !== plan.id) await removeSaved(owner, parent.id);
    await keepSaved(owner, plan.id);
    const r = plan.request;
    await rememberAct(owner, plan.act, {
      where: r.where,
      stops: r.stops,
      homeCityId: r.homeCityId,
      categories: r.categories,
      focus: r.focus,
      avoid: r.avoid,
      excludeBrandIds: r.excludeBrandIds,
      excludeCityIds: r.excludeCityIds,
    });
  } catch (error) {
    console.error("Couldn't keep a plan with the visitor's tours:", error);
  }
}

/**
 * Makes a plan. The answer streams as newline-delimited JSON: one line per stage as the agent reaches it, then the
 * plan's ID (or an error). The same request within a day returns the plan already made. A change to a plan (its
 * parent) is the same tour: it keeps the tour's ID, so where each venue and sponsor stands carries over.
 */
export async function POST(request: Request) {
  if (!fromOurPages(request)) return forbidden();
  let input, owner: string, parent: Plan | undefined;
  try {
    const text = await request.text();
    if (text.length > 4000) throw new TourError("body_size", "This request is too large.", 413);
    const parsed = planInput.safeParse(JSON.parse(text));
    if (!parsed.success) throw new TourError("validation", parsed.error.issues[0]?.message ?? "Check the request.");
    // An act Qloo doesn't know is known by its name.
    input = parsed.data.newAct ? { ...parsed.data, actId: newActId(parsed.data.newAct.name) } : parsed.data;
    owner = await browserOf();
    parent = input.parentId ? await getPlan(input.parentId) : undefined;
    const reuse = await recentPlanFor(input);
    if (reuse) {
      await keep(owner, reuse, parent);
      return Response.json({ planId: reuse.id, reused: true }, { headers: NO_STORE });
    }
    await claimPlanSlot(await visitorOf(request));
  } catch (error) {
    return errorResponse(error);
  }
  const encoder = new TextEncoder();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]);
  const body = new ReadableStream({
    async start(controller) {
      const send = (line: { stage?: TourStage; planId?: string; error?: string }) => controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      try {
        const plan = await planTour(input, { onStage: (stage) => send({ stage }), signal });
        if (parent) plan.rootId = parent.rootId ?? parent.id;
        await savePlan(plan);
        await keep(owner, plan, parent);
        send({ planId: plan.id });
      } catch (error) {
        const e = error instanceof TourError ? error : undefined;
        if (!e) console.error("Plan failed:", error);
        send({ error: e?.message ?? (signal.aborted ? "That took too long, so it was stopped. Please try again." : "Afinlo couldn't finish this plan. Nothing was invented; please try again.") });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { ...NO_STORE, "Content-Type": "application/x-ndjson" } });
}
