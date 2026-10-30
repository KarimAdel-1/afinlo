// A browser's conversation with the assistant: one message in, the reply and the tours it made out, and the
// conversation so far for the page. Kept in LangGraph's Postgres checkpointer under the browser, so it survives a
// reload, like the tour teams' conversations.
import { randomUUID } from "node:crypto";
import { HumanMessage, isAIMessage, isHumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AssistantCard, AssistantEvent, AssistantMessage } from "@/core/tour/types";
import type { QlooClient } from "../taste/qloo";
import { checkpointer } from "../manager/chat";
import { textOf, thisTurn } from "../manager/graph";
import { openAiModels } from "../manager/models";
import { qlooClient } from "../tour/qloo";
import { savedResults } from "../tour/saved";
import type { Writer } from "../tour/writer";
import { assistantGraph } from "./graph";
import { getProfile } from "./profile";

export interface AssistantDeps {
  model?: BaseChatModel;
  checkpointer?: BaseCheckpointSaver;
  client?: QlooClient;
  writer?: Writer;
}

const threadOf = (browser: string) => `assistant:${browser}`;

/** One message to the assistant: its reply, and the tours it planned or showed. */
export async function askAssistant(
  input: { browser: string; visitor: string; message: string; signal: AbortSignal; emit?: (event: AssistantEvent) => void },
  deps: AssistantDeps = {},
): Promise<{ reply: string; cards: AssistantCard[] }> {
  const [profile, saved] = await Promise.all([getProfile(input.browser), savedResults(input.browser, 10)]);
  const desk = {
    browser: input.browser,
    visitor: input.visitor,
    profile,
    tours: saved.map(({ plan }) => ({ planId: plan.id, act: plan.act.name, area: plan.area, shows: plan.route.length })),
    client: deps.client ?? qlooClient(),
    writer: deps.writer,
    signal: input.signal,
    emit: input.emit ?? (() => {}),
    made: [] as AssistantCard[],
    toolCalls: 0,
  };
  const graph = assistantGraph(desk, deps.model ?? openAiModels()("assistant"), deps.checkpointer ?? (await checkpointer()));
  const out = await graph.invoke(
    { messages: [new HumanMessage({ content: input.message, id: randomUUID() })] },
    { configurable: { thread_id: threadOf(input.browser) }, signal: input.signal, recursionLimit: 30 },
  );
  return { reply: textOf(thisTurn(out.messages).at(-1)), cards: desk.made };
}

/** The conversation as the page shows it: the user's messages and the assistant's replies, each with its tours. */
export async function assistantHistory(browser: string, deps: Pick<AssistantDeps, "checkpointer"> = {}): Promise<AssistantMessage[]> {
  const saved = await (deps.checkpointer ?? (await checkpointer())).getTuple({ configurable: { thread_id: threadOf(browser) } });
  const values = (saved?.checkpoint.channel_values ?? {}) as { messages?: BaseMessage[]; cards?: (AssistantCard & { turn: string })[] };
  const out: AssistantMessage[] = [];
  let turn = "";
  for (const m of values.messages ?? []) {
    if (isHumanMessage(m)) {
      out.push({ role: "user", text: textOf(m) });
      turn = m.id ?? "";
    } else if (isAIMessage(m) && !m.tool_calls?.length) {
      const cards = (values.cards ?? []).filter((c) => c.turn === turn).map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== "turn")) as AssistantCard);
      out.push({ role: "assistant", text: textOf(m), ...(cards.length ? { cards } : {}) });
    }
  }
  return out;
}
