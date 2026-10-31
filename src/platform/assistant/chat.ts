// A browser's conversations with the assistant: one message in, the reply and the tours it made out; a conversation so
// far for the page; and the list of them, newest first. Each is a thread in LangGraph's Postgres checkpointer under the
// browser, so it survives a reload, like the tour teams' conversations; tour_assistant_chats lists them.
import { randomUUID } from "node:crypto";
import { HumanMessage, isAIMessage, isHumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AssistantCard, AssistantChatSummary, AssistantEvent, AssistantMessage } from "@/core/tour/types";
import { db, now } from "@/lib/db";
import type { QlooClient } from "../taste/qloo";
import { checkpointer } from "../manager/chat";
import { textOf, thisTurn } from "../manager/graph";
import { openAiModels } from "../manager/models";
import { usageMeter } from "../manager/usage";
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

/** A chat's ID, as the page makes one for each new chat. */
export const CHAT_ID = /^[a-z0-9-]{6,40}$/;
/** A browser's one conversation from before it could have several: its thread had no chat ID. */
const LEGACY = "legacy";
const threadOf = (browser: string, chat: string) => (chat === LEGACY ? `assistant:${browser}` : `assistant:${browser}:${chat}`);
const titleOf = (message: string) => (message.length > 70 ? `${message.slice(0, 69).trimEnd()}…` : message);

/** One message to the assistant: its reply, and the tours it planned or showed. */
export async function askAssistant(
  input: { browser: string; visitor: string; chat: string; message: string; signal: AbortSignal; emit?: (event: AssistantEvent) => void },
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
  // The chat goes on the history from its first message, titled by it; a later one moves it to the top.
  await db()
    .prepare("INSERT INTO tour_assistant_chats (visitor, id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (visitor, id) DO UPDATE SET updated_at = excluded.updated_at")
    .run(input.browser, input.chat, titleOf(input.message), now(), now());
  // Every model call's tokens, logged and kept once the message is done, answered or not.
  const meter = usageMeter("assistant", input.browser);
  const graph = assistantGraph(desk, deps.model ?? openAiModels(meter.add)("assistant"), deps.checkpointer ?? (await checkpointer()));
  try {
    const out = await graph.invoke(
      { messages: [new HumanMessage({ content: input.message, id: randomUUID() })] },
      { configurable: { thread_id: threadOf(input.browser, input.chat) }, signal: input.signal, recursionLimit: 30 },
    );
    return { reply: textOf(thisTurn(out.messages).at(-1)), cards: desk.made };
  } finally {
    await meter.save();
  }
}

/** A conversation as the page shows it: the user's messages and the assistant's replies, each with its tours. */
export async function assistantHistory(browser: string, chat: string, deps: Pick<AssistantDeps, "checkpointer"> = {}): Promise<AssistantMessage[]> {
  const saved = await (deps.checkpointer ?? (await checkpointer())).getTuple({ configurable: { thread_id: threadOf(browser, chat) } });
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

/**
 * The browser's conversations, the latest first. A conversation from before there were several joins the list the first
 * time it's asked for, titled by its first message.
 */
export async function assistantChats(browser: string, deps: Pick<AssistantDeps, "checkpointer"> = {}): Promise<AssistantChatSummary[]> {
  const list = () =>
    db()
      .prepare("SELECT id, title, updated_at FROM tour_assistant_chats WHERE visitor = ? ORDER BY updated_at DESC LIMIT 50")
      .all<{ id: string; title: string; updated_at: string }>(browser);
  let rows = await list();
  if (!rows.length) {
    const saver = deps.checkpointer ?? (await checkpointer());
    const old = await saver.getTuple({ configurable: { thread_id: threadOf(browser, LEGACY) } });
    const first = ((old?.checkpoint.channel_values ?? {}) as { messages?: BaseMessage[] }).messages?.find((m) => isHumanMessage(m));
    if (first) {
      const at = old!.checkpoint.ts || now();
      await db()
        .prepare("INSERT INTO tour_assistant_chats (visitor, id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
        .run(browser, LEGACY, titleOf(textOf(first)), at, at);
      rows = await list();
    }
  }
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
}

/** Deletes one of the browser's conversations: off the list, and its thread from the checkpointer. */
export async function deleteAssistantChat(browser: string, chat: string) {
  // The checkpointer's tables are made the first time it's used.
  await checkpointer();
  await db().prepare("DELETE FROM tour_assistant_chats WHERE visitor = ? AND id = ?").run(browser, chat);
  for (const table of ["checkpoint_writes", "checkpoint_blobs", "checkpoints"]) await db().prepare(`DELETE FROM ${table} WHERE thread_id = ?`).run(threadOf(browser, chat));
}
