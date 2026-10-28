// What every public request shares: it must come from the app's own pages, it has a visitor (for the
// limits) and errors come back as plain JSON. Nobody signs in, so the visitor is a random cookie, or the address
// when a trusted proxy reports it.
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { setting } from "@/lib/settings";
import { TasteError } from "@/core/taste/types";
import { TourError, type TourStage } from "@/core/tour/types";

export const NO_STORE = { "Cache-Control": "private, no-store" };
const VISITOR = "hl_visitor";

/** Same-origin only. Behind a proxy the server can see another address than the one the browser sends. */
export function fromOurPages(request: Request) {
  const origin = request.headers.get("origin");
  const publicUrl = setting("PUBLIC_URL");
  const allowed = [new URL(request.url).origin, ...(publicUrl ? [new URL(publicUrl).origin] : [])];
  return !(origin && !allowed.includes(origin)) && request.headers.get("sec-fetch-site") !== "cross-site";
}

const browserId = (value: string | undefined) => (value && /^[A-Za-z0-9_-]{16,40}$/.test(value) ? value : undefined);

/** This browser: a random id kept in a cookie for a year, set the first time it's needed. For route handlers. */
export async function browserOf() {
  const jar = await cookies();
  let id = browserId(jar.get(VISITOR)?.value);
  if (!id) {
    id = randomBytes(12).toString("base64url");
    jar.set(VISITOR, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 365 * 86400 });
  }
  return id;
}

/** This browser's id, if it has one yet. For pages, which can't set cookies. */
export async function knownBrowser() {
  return browserId((await cookies()).get(VISITOR)?.value);
}

/** The visitor, for the limits: their address behind a trusted proxy, otherwise this browser. */
export async function visitorOf(request: Request) {
  const id = await browserOf();
  const address = setting("TRUST_PROXY") ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined;
  return address ? `ip:${address}` : `v:${id}`;
}

const hits: Map<string, number[]> = ((globalThis as unknown as { __hits?: Map<string, number[]> }).__hits ??= new Map());
/** Everyone together, per action, so a flood from many browsers is capped too. */
const ALL_VISITORS = 300;

/**
 * Counts a request towards a limit: `limit.count` per visitor in `limit.seconds`, and a cap for all visitors together.
 * In memory, per server. False when either is reached.
 */
export function allow(action: string, visitor: string, limit: { count: number; seconds: number }, at = Date.now()) {
  const span = limit.seconds * 1000;
  const windows = [
    { key: `${action}|${visitor}`, max: limit.count },
    { key: action, max: ALL_VISITORS },
  ].map((w) => ({ ...w, recent: (hits.get(w.key) ?? []).filter((t) => at - t < span) }));
  if (windows.some((w) => w.recent.length >= w.max)) return false;
  for (const w of windows) hits.set(w.key, [...w.recent, at]);
  if (hits.size > 50_000) for (const [key, times] of hits) if (!times.some((t) => at - t < 86_400_000)) hits.delete(key);
  return true;
}

export function errorResponse(error: unknown) {
  const e =
    error instanceof TourError || error instanceof TasteError
      ? error
      : error instanceof SyntaxError
        ? new TourError("json", "Send valid JSON.")
        : new TourError("internal", "Afinlo couldn't finish that. Please try again.", 500);
  if (!(error instanceof TourError || error instanceof TasteError || error instanceof SyntaxError)) console.error("Request failed:", error);
  return Response.json({ error: e.message, code: e.code }, { status: e.status, headers: NO_STORE });
}

export const forbidden = () => Response.json({ error: "Use Afinlo to make this request." }, { status: 403, headers: NO_STORE });

/** A JSON request body, refused past `max` characters. */
export async function bodyOf(request: Request, max = 4000): Promise<unknown> {
  const text = await request.text();
  if (text.length > max) throw new TourError("body_size", "This request is too large.", 413);
  return JSON.parse(text);
}

/**
 * Runs an agent and streams its progress as newline-delimited JSON: one line per stage as it's reached, then the
 * result's ID, or an error. A run is stopped after 110 seconds, or when the visitor leaves.
 */
export function streamStages(request: Request, run: (onStage: (stage: TourStage) => void, signal: AbortSignal) => Promise<string>) {
  const encoder = new TextEncoder();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]);
  const body = new ReadableStream({
    async start(controller) {
      const send = (line: { stage?: TourStage; id?: string; error?: string }) => controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      try {
        send({ id: await run((stage) => send({ stage }), signal) });
      } catch (error) {
        const e = error instanceof TourError ? error : undefined;
        if (!e) console.error("Run failed:", error);
        send({ error: e?.message ?? (signal.aborted ? "That took too long, so it was stopped. Please try again." : "Afinlo couldn't finish this. Nothing was invented; please try again.") });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { ...NO_STORE, "Content-Type": "application/x-ndjson" } });
}
