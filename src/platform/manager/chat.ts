// A tour's conversation with its manager: one message in, the team's reply and what it made out, and the conversation
// so far for the page. It's kept per browser and tour in LangGraph's Postgres checkpointer, so it survives a reload
// and carries through every change to the tour.
import { randomUUID } from "node:crypto";
import { HumanMessage, isAIMessage, isHumanMessage, isToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { db } from "@/lib/db";
import { setting } from "@/lib/settings";
import type { ManagerCard, ManagerEvent, ManagerMessage, Plan, Specialist } from "@/core/tour/types";
import type { QlooClient } from "../taste/qloo";
import { qlooClient } from "../tour/qloo";
import { prospectsFor } from "../tour/work";
import { actMemory, tourOf, tracksFor } from "../tour/tracker";
import { openDesk } from "./desk";
import { agentOf, managerGraph, textOf, thisTurn, type Models } from "./graph";
import { openAiModels } from "./models";
import { usageMeter } from "./usage";

export interface ManagerDeps {
  models?: Models;
  checkpointer?: BaseCheckpointSaver;
  client?: QlooClient;
}

let saver: Promise<BaseCheckpointSaver> | undefined;
/**
 * The conversations' checkpointer (the tour teams' and the assistant's). Its tables are made the first time; once
 * they're there, that step is skipped.
 */
export function checkpointer(): Promise<BaseCheckpointSaver> {
  saver ??= (async () => {
    const s = PostgresSaver.fromConnString(setting("DATABASE_URL")!);
    const there = await db().prepare("SELECT to_regclass('checkpoint_migrations') AS t").get<{ t: string | null }>();
    if (!there?.t) await s.setup();
    return s;
  })().catch((error) => {
    saver = undefined;
    throw error;
  });
  return saver;
}

/** One conversation per browser and tour (not per version: a change to the tour keeps talking in the same thread). */
const threadOf = (plan: Pick<Plan, "id" | "rootId">, browser: string) => `tour:${tourOf(plan)}:${browser}`;

/** The specialists asked in these messages (a handoff past the limit, marked as an error, wasn't). */
const agentsIn = (messages: BaseMessage[]) => [...new Set(messages.flatMap((m) => (isToolMessage(m) && m.status !== "error" && agentOf(m.name ?? "") ? [agentOf(m.name ?? "")!] : [])))];

/**
 * A message whose reply didn't finish (the model failed, the time ran out), with what the team had already made: its
 * statuses and "no"s are saved as they're made, so the user is told they stand rather than that nothing changed.
 */
export class TurnFailed extends Error {
  constructor(
    readonly cause: unknown,
    readonly made: ManagerCard[],
  ) {
    super(cause instanceof Error ? cause.message : "The turn failed.");
  }
}

/** One message to the tour's manager: the reply, the specialists it asked, and what they made for the user. */
export async function askManager(
  input: { plan: Plan; browser: string; message: string; signal: AbortSignal; emit?: (event: ManagerEvent) => void },
  deps: ManagerDeps = {},
): Promise<{ reply: string; agents: Specialist[]; cards: ManagerCard[] }> {
  const { plan, browser } = input;
  const tourId = tourOf(plan);
  // The brands the team found for this tour in earlier messages come back, so they can be pitched now.
  const [tracks, memory, found] = await Promise.all([tracksFor(browser, [tourId]).then((t) => t.get(tourId) ?? []), actMemory(browser, plan.act.id), prospectsFor(browser, tourId)]);
  const desk = openDesk({ plan, browser, tracks, memory, found, client: deps.client ?? qlooClient(), signal: input.signal, emit: input.emit ?? (() => {}) });
  // Every model call's tokens, by role, logged and kept once the message is done, answered or not.
  const meter = usageMeter("tour", browser);
  const graph = managerGraph(desk, deps.models ?? openAiModels(meter.add), deps.checkpointer ?? (await checkpointer()));
  try {
    const out = await graph.invoke(
      { messages: [new HumanMessage({ content: input.message, id: randomUUID() })] },
      { configurable: { thread_id: threadOf(plan, browser) }, signal: input.signal, recursionLimit: 40 },
    );
    const turn = thisTurn(out.messages);
    return { reply: textOf(turn.at(-1)), agents: agentsIn(turn), cards: desk.made.map((m) => m.card) };
  } catch (error) {
    throw new TurnFailed(error, desk.made.map((m) => m.card));
  } finally {
    await meter.save();
  }
}

/** The conversation as the page shows it: the user's messages and the manager's replies, each with what it made. */
export function historyOf(messages: BaseMessage[], cards: (ManagerCard & { turn: string })[]): ManagerMessage[] {
  const out: ManagerMessage[] = [];
  let turn = "";
  let asked: BaseMessage[] = [];
  for (const m of messages) {
    if (isHumanMessage(m)) {
      out.push({ role: "user", text: textOf(m) });
      turn = m.id ?? "";
      asked = [];
    } else if (isToolMessage(m)) asked.push(m);
    else if (isAIMessage(m) && !m.tool_calls?.length) {
      const made = cards.filter((c) => c.turn === turn).map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== "turn")) as ManagerCard);
      out.push({ role: "assistant", text: textOf(m), agents: agentsIn(asked), ...(made.length ? { cards: made } : {}) });
    }
  }
  return out;
}

/** The conversation so far, and the summary of what's been folded away. */
export async function managerHistory(plan: Plan, browser: string, deps: Pick<ManagerDeps, "checkpointer"> = {}): Promise<{ messages: ManagerMessage[]; summary: string }> {
  const saved = await (deps.checkpointer ?? (await checkpointer())).getTuple({ configurable: { thread_id: threadOf(plan, browser) } });
  const values = (saved?.checkpoint.channel_values ?? {}) as { messages?: BaseMessage[]; cards?: (ManagerCard & { turn: string })[]; summary?: string };
  return { messages: historyOf(values.messages ?? [], values.cards ?? []), summary: values.summary ?? "" };
}
