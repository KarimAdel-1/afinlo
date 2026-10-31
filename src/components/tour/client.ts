// Browser helpers for the app's own API.
import type { AssistantCard, AssistantEvent, ManagerCard, ManagerEvent, PlanInput, Specialist, TourContext, TourStage } from "@/core/tour/types";

export async function postJson<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "That didn't work. Please try again.");
  return json as T;
}

/** Starts a plan and reports each stage as the agent reaches it. Resolves with the plan's ID. */
export async function streamPlan(input: PlanInput & { parentId?: string }, onStage: (s: TourStage) => void): Promise<string> {
  const res = await fetch("/api/tour/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  // A plan already made for this request comes back at once, as plain JSON.
  if (res.headers.get("content-type")?.includes("application/json")) {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "That didn't work. Please try again.");
    return json.planId as string;
  }
  if (!res.ok || !res.body) throw new Error("Afinlo couldn't start this. Please try again.");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop()!;
    for (const line of lines.filter(Boolean)) {
      const event = JSON.parse(line) as { stage?: TourStage; planId?: string; error?: string };
      if (event.stage) onStage(event.stage);
      if (event.error) throw new Error(event.error);
      if (event.planId) return event.planId;
    }
    if (done) throw new Error("The connection closed before it finished. Please try again.");
  }
}

/** A message to the assistant on Home, reporting what it does as it happens. Resolves with the reply and the tours it made. */
export async function streamAssistant(chat: string, message: string, onEvent: (e: AssistantEvent) => void): Promise<{ reply: string; cards: AssistantCard[] }> {
  const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, chat }) });
  if (res.headers.get("content-type")?.includes("application/json")) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "The assistant couldn't answer. Please try again.");
  if (!res.ok || !res.body) throw new Error("The assistant couldn't start. Please try again.");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop()!;
    for (const line of lines.filter(Boolean)) {
      const event = JSON.parse(line) as { event?: AssistantEvent; reply?: { reply: string; cards: AssistantCard[] }; error?: string };
      if (event.event) onEvent(event.event);
      if (event.error) throw new Error(event.error);
      if (event.reply) return event.reply;
    }
    if (done) throw new Error("The connection closed before the assistant answered. Please try again.");
  }
}

/** A message to a tour's manager, reporting what the team does as it happens. Resolves with the reply and what it made. */
export async function streamChat(
  planId: string,
  message: string,
  onEvent: (e: ManagerEvent) => void,
  context?: TourContext,
): Promise<{ reply: string; agents: Specialist[]; cards: ManagerCard[] }> {
  const res = await fetch(`/api/tour/plan/${planId}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, ...(context ? { context } : {}) }) });
  if (res.headers.get("content-type")?.includes("application/json")) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "The team couldn't answer. Please try again.");
  if (!res.ok || !res.body) throw new Error("The team couldn't start. Please try again.");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop()!;
    for (const line of lines.filter(Boolean)) {
      const event = JSON.parse(line) as { event?: ManagerEvent; reply?: { reply: string; agents: Specialist[]; cards: ManagerCard[] }; error?: string; cards?: ManagerCard[] };
      if (event.event) onEvent(event.event);
      // A reply that didn't finish still brings what the team saved before it stopped.
      if (event.error) throw Object.assign(new Error(event.error), { cards: event.cards ?? [] });
      if (event.reply) return event.reply;
    }
    if (done) throw new Error("The connection closed before the team answered. Please try again.");
  }
}

export function stageLabel(s: TourStage): string {
  switch (s.stage) {
    case "resolving":
      return `Resolving ${s.act} in Qloo`;
    case "cities":
      return `Scanning ${s.count} candidate cities with Qloo's heatmap`;
    case "fallback":
      return `Thin data for this act: estimating from acts like it (${s.similar.slice(0, 3).join(", ")})`;
    case "predicting":
      return `Not in Qloo yet: predicting from ${s.from.join(", ")}`;
    case "dna":
      return "Building the Fan DNA: taste, demographics, what fans love elsewhere";
    case "sponsors":
      return "Matching the brands these fans love";
    case "support":
      return "Finding support acts with overlapping audiences";
    case "scoring":
      return "Scoring Fan Heat, the route and Sponsor Fit (plain code, no AI)";
    case "local":
      return `Finding venues and local spots in ${s.cities.join(", ")}`;
    case "writing":
      return "Writing the pitch pack";
  }
}
