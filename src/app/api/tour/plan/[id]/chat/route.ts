import { z } from "zod";
import { TourError, type ManagerCard, type ManagerEvent } from "@/core/tour/types";
import { setting } from "@/lib/settings";
import { askManager, managerHistory, TurnFailed } from "@/platform/manager/chat";
import { bodyOf, browserOf, errorResponse, forbidden, fromOurPages, knownBrowser, NO_STORE, visitorOf } from "@/platform/tour/http";
import { claimChatSlot, getPlan } from "@/platform/tour/store";

export const runtime = "nodejs";
export const maxDuration = 90;
const Body = z.object({ message: z.string().trim().min(1).max(1000) }).strict();
const NEEDS_KEY = "The tour team needs an OpenAI API key, which isn't set on this server yet. Everything else in the tour works without it.";

/** The tour's conversation with its manager so far, for this browser. */
export async function GET(request: Request, { params }: RouteContext<"/api/tour/plan/[id]/chat">) {
  if (!fromOurPages(request)) return forbidden();
  try {
    const plan = await getPlan((await params).id);
    if (!plan) throw new TourError("plan_missing", "That tour doesn't exist.", 404);
    if (!setting("OPENAI_API_KEY")) return Response.json({ ready: false, error: NEEDS_KEY, messages: [] }, { headers: NO_STORE });
    const browser = await knownBrowser();
    const history = browser ? await managerHistory(plan, browser) : { messages: [], summary: "" };
    return Response.json({ ready: true, ...history }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * A message to the tour's manager. The answer streams as newline-delimited JSON: what the team is doing as it happens
 * (who it asked, what each looked up), then the reply with what the team made (a change to apply, drafts, statuses),
 * or an error. At most a minute.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/tour/plan/[id]/chat">) {
  if (!fromOurPages(request)) return forbidden();
  let plan, browser: string, message: string;
  try {
    const parsed = Body.safeParse(await bodyOf(request, 2000));
    if (!parsed.success) throw new TourError("validation", "Write a message to the team.");
    message = parsed.data.message;
    plan = await getPlan((await params).id);
    if (!plan) throw new TourError("plan_missing", "That tour doesn't exist.", 404);
    if (!setting("OPENAI_API_KEY")) throw new TourError("openai_not_configured", NEEDS_KEY, 503);
    browser = await browserOf();
    await claimChatSlot(await visitorOf(request));
  } catch (error) {
    return errorResponse(error);
  }
  const encoder = new TextEncoder();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
  const body = new ReadableStream({
    async start(controller) {
      const send = (line: { event?: ManagerEvent; reply?: unknown; error?: string; cards?: ManagerCard[] }) => controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      try {
        const answer = await askManager({ plan, browser, message, signal, emit: (event) => send({ event }) });
        send({ reply: answer });
      } catch (error) {
        // What the team saved before the reply failed stays saved, and the user is told so, with it shown.
        const made = error instanceof TurnFailed ? error.made : [];
        const cause = error instanceof TurnFailed ? error.cause : error;
        const e = cause instanceof TourError ? cause : undefined;
        if (!e && !signal.aborted) console.error("The tour manager failed:", cause);
        const why = e?.message ?? (signal.aborted ? "That took longer than a minute, so it was stopped." : "The team couldn't finish its reply.");
        const saved = made.filter((c) => c.kind === "status" || c.kind === "memory" || c.kind === "draft");
        const kept = saved.length ? ` What it saved before stopping stays saved: ${saved.map((c) => (c.kind === "draft" ? `a draft for ${c.draft.to}` : c.text)).join("; ")}.` : " Nothing was saved this time.";
        send({ error: `${why}${kept} Please try again.`, ...(made.length ? { cards: made } : {}) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { ...NO_STORE, "Content-Type": "application/x-ndjson" } });
}
