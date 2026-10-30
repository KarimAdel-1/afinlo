import { z } from "zod";
import { TourError, type AssistantEvent } from "@/core/tour/types";
import { setting } from "@/lib/settings";
import { askAssistant, assistantHistory } from "@/platform/assistant/chat";
import { bodyOf, browserOf, errorResponse, forbidden, fromOurPages, knownBrowser, NO_STORE, visitorOf } from "@/platform/tour/http";
import { claimChatSlot } from "@/platform/tour/store";

export const runtime = "nodejs";
export const maxDuration = 120;
const Body = z.object({ message: z.string().trim().min(1).max(1000) }).strict();
const NEEDS_KEY = "The assistant needs an OpenAI API key, which isn't set on this server yet. Plan a tour with New tour instead.";

/** This browser's conversation with the assistant so far. */
export async function GET(request: Request) {
  if (!fromOurPages(request)) return forbidden();
  try {
    if (!setting("OPENAI_API_KEY")) return Response.json({ ready: false, error: NEEDS_KEY, messages: [] }, { headers: NO_STORE });
    const browser = await knownBrowser();
    return Response.json({ ready: true, messages: browser ? await assistantHistory(browser) : [] }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * A message to the assistant. The answer streams as newline-delimited JSON: what it's doing as it happens (a plan's
 * stages included), then the reply with the tours it made, or an error. Planning a tour can take most of a minute.
 */
export async function POST(request: Request) {
  if (!fromOurPages(request)) return forbidden();
  let browser: string, visitor: string, message: string;
  try {
    const parsed = Body.safeParse(await bodyOf(request, 2000));
    if (!parsed.success) throw new TourError("validation", "Write a message to the assistant.");
    message = parsed.data.message;
    if (!setting("OPENAI_API_KEY")) throw new TourError("openai_not_configured", NEEDS_KEY, 503);
    browser = await browserOf();
    visitor = await visitorOf(request);
    await claimChatSlot(visitor);
  } catch (error) {
    return errorResponse(error);
  }
  const encoder = new TextEncoder();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]);
  const body = new ReadableStream({
    async start(controller) {
      const send = (line: { event?: AssistantEvent; reply?: unknown; error?: string }) => controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      try {
        send({ reply: await askAssistant({ browser, visitor, message, signal, emit: (event) => send({ event }) }) });
      } catch (error) {
        const e = error instanceof TourError ? error : undefined;
        if (!e && !signal.aborted) console.error("The assistant failed:", error);
        send({ error: e?.message ?? (signal.aborted ? "That took too long, so it was stopped. Please try again." : "The assistant couldn't answer that. Please try again.") });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { ...NO_STORE, "Content-Type": "application/x-ndjson" } });
}
