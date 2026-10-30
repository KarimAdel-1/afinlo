// The tour manager and its team as LangGraph graphs. The manager is a supervisor that hands work out through tools, one
// per specialist, the pattern LangGraph's multi-agent supervisors use: its tool calls fan out to the specialists in
// parallel (Send), each specialist's answer comes back as that tool's result, and the manager replies from what they
// found. Each specialist is its own small graph, a ReAct loop (think, use tools, think) with its own prompt, tools and
// model, that sees only its task, so the manager's context stays short. The manager's conversation is checkpointed,
// and older turns fold into a running summary.
import { Annotation, END, MessagesAnnotation, Send, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { HumanMessage, isAIMessage, isHumanMessage, isToolMessage, RemoveMessage, SystemMessage, ToolMessage, type AIMessage, type BaseMessage, type ToolCall } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { SPECIALIST_LABELS, SPECIALISTS, type ManagerCard, type Specialist } from "@/core/tour/types";
import { data } from "../tour/model";
import type { Desk } from "./desk";
import { managerPrompt, specialistPrompt, SUMMARY_PROMPT, TEAM } from "./team";
import { managerTools, teamTools } from "./tools";

/** Whose model it is: the manager's, a specialist's, or the summarizer's. */
export type Role = "manager" | Specialist | "summary";
export type Models = (role: Role) => BaseChatModel;

export const LIMITS = {
  /** Specialist answers the manager may ask for in one message. */
  asks: 4,
  /** Rounds of handing out work in one message before the manager must reply. */
  rounds: 3,
  /** Model calls a specialist makes for one task; the last answers without tools. */
  steps: 4,
  /** Turns kept word for word once a conversation has more than `foldAt`; older ones fold into the summary. */
  keep: 6,
  foldAt: 10,
};

type TurnCard = ManagerCard & { turn: string };
export const ManagerState = Annotation.Root({
  ...MessagesAnnotation.spec,
  summary: Annotation<string>({ reducer: (_old, next) => next, default: () => "" }),
  /**
   * What the team made, each with its turn (the ID of the user's message it answered). `{ keep }` keeps only those
   * turns' cards: the others' turns have folded into the summary, where nothing shows their cards.
   */
  cards: Annotation<TurnCard[], TurnCard[] | { keep: string[] }>({
    reducer: (a, b) => (Array.isArray(b) ? [...a, ...b] : a.filter((c) => b.keep.includes(c.turn))),
    default: () => [],
  }),
});
type State = typeof ManagerState.State;

export const textOf = (m: BaseMessage | undefined) => (!m ? "" : typeof m.content === "string" ? m.content : m.text);
/** The current turn: the user's last message and what followed it. */
export const thisTurn = (messages: BaseMessage[]) => messages.slice(Math.max(0, messages.findLastIndex((m) => isHumanMessage(m))));
export const agentOf = (tool: string) => SPECIALISTS.find((a) => TEAM[a].handoff === tool);
const callsOf = (m: BaseMessage | undefined) => (m && isAIMessage(m) ? ((m as AIMessage).tool_calls ?? []) : []);

const describe = (card: ManagerCard) =>
  card.kind === "change" ? `a change to apply (${card.summary})` : card.kind === "draft" ? `a draft ${card.draft.type === "post" ? "post" : "email"} for ${card.draft.to}` : card.text;

/** A specialist for one task: its model and tools in a loop until it answers, the last of LIMITS.steps calls without tools. */
export function specialist(agent: Specialist, desk: Desk, model: BaseChatModel) {
  const tools = teamTools(agent, desk);
  const prompt = specialistPrompt(agent, desk.plan);
  const free = model.bindTools!(tools);
  const answer = model.bindTools!(tools, { tool_choice: "none" });
  const think = async (s: typeof MessagesAnnotation.State) => {
    const last = s.messages.filter((m) => isAIMessage(m)).length >= LIMITS.steps - 1;
    const system = new SystemMessage(last ? `${prompt} You've done all the lookups this task allows: answer now from what you found.` : prompt);
    return { messages: [await (last ? answer : free).invoke([system, ...s.messages], { signal: desk.signal })] };
  };
  return new StateGraph(MessagesAnnotation)
    .addNode("think", think)
    .addNode("tools", new ToolNode(tools, { handleToolErrors: true }))
    .addEdge(START, "think")
    .addConditionalEdges("think", (s) => (callsOf(s.messages.at(-1)).length ? "tools" : END), ["tools", END])
    .addEdge("tools", "think")
    .compile({ checkpointer: false, name: agent });
}

/** The manager's graph for one turn of the conversation, over the turn's desk. */
export function managerGraph(desk: Desk, models: Models, checkpointer?: BaseCheckpointSaver) {
  const own = managerTools(desk);
  const handoffs = SPECIALISTS.map((a) => ({
    name: TEAM[a].handoff,
    description: TEAM[a].does,
    schema: z.object({ task: z.string().min(3).max(1200).describe("What to find out or do, standing on its own: the cities, brands, venues and language by name.") }),
  }));
  const model = models("manager");
  const free = model.bindTools!([...handoffs, ...own]);
  const reply = model.bindTools!([...handoffs, ...own], { tool_choice: "none" });

  // Before the manager reads the conversation: a turn cut short (the time ran out mid-way) can leave tool calls without
  // answers, and those messages go, so the conversation stays well formed; a long conversation's older turns fold into
  // the summary.
  const fold = async (s: State) => {
    const answered = new Set(s.messages.flatMap((m) => (isToolMessage(m) ? [m.tool_call_id] : [])));
    const broken = s.messages.filter((m) => callsOf(m).some((c) => !answered.has(c.id!)));
    const brokenCalls = new Set(broken.flatMap((m) => callsOf(m).map((c) => c.id)));
    const drop = [...broken, ...s.messages.filter((m) => isToolMessage(m) && brokenCalls.has(m.tool_call_id))];
    const kept = s.messages.filter((m) => !drop.includes(m));
    const starts = kept.flatMap((m, i) => (isHumanMessage(m) ? [i] : []));
    const update: { messages: BaseMessage[]; summary?: string; cards?: { keep: string[] } } = { messages: drop.map((m) => new RemoveMessage({ id: m.id! })) };
    if (starts.length > LIMITS.foldAt) {
      const old = kept.slice(0, starts[starts.length - LIMITS.keep]);
      const transcript = old.flatMap((m) => (isHumanMessage(m) ? [`User: ${textOf(m)}`] : isAIMessage(m) && !callsOf(m).length ? [`Manager: ${textOf(m)}`] : [])).join("\n");
      const folded = await models("summary").invoke([new SystemMessage(SUMMARY_PROMPT), new HumanMessage(data("conversation", `${s.summary ? `Earlier summary: ${s.summary}\n\n` : ""}${transcript}`))], { signal: desk.signal });
      update.summary = textOf(folded).slice(0, 1500);
      update.messages.push(...old.map((m) => new RemoveMessage({ id: m.id! })));
      update.cards = { keep: kept.slice(old.length).flatMap((m) => (isHumanMessage(m) ? [m.id!] : [])) };
    }
    return update;
  };

  const manage = async (s: State) => {
    const turn = thisTurn(s.messages);
    const asked = turn.filter((m) => isToolMessage(m) && agentOf(m.name ?? "")).length;
    const rounds = turn.filter((m) => callsOf(m).length).length;
    const last = asked >= LIMITS.asks || rounds >= LIMITS.rounds;
    const prompt = managerPrompt(desk.plan, s.summary);
    const system = new SystemMessage(last ? `${prompt}\n\nThe team has done all it can for this message: reply to the user now.` : prompt);
    return { messages: [await (last ? reply : free).invoke([system, ...s.messages], { signal: desk.signal })] };
  };

  // The manager's tool calls, each to its node: a specialist, or the manager's own tools. No calls: the reply is done.
  // Specialists take at most LIMITS.asks tasks a message, however many one round hands out; the rest are answered
  // without them, so every call still has its answer.
  const dispatch = (s: State) => {
    const calls = callsOf(s.messages.at(-1));
    if (!calls.length) return "collect";
    let left = LIMITS.asks - thisTurn(s.messages).filter((m) => isToolMessage(m) && agentOf(m.name ?? "")).length;
    return calls.map((call) => {
      const agent = agentOf(call.name);
      return !agent ? new Send("own", { call }) : left-- > 0 ? new Send(agent, { call }) : new Send("unasked", { call });
    });
  };

  const ask = (agent: Specialist) => async (input: unknown) => {
    const { call } = input as { call: ToolCall };
    const task = String(call.args.task ?? "");
    desk.emit({ kind: "ask", agent, task });
    const from = desk.made.length;
    let answer: string;
    try {
      const out = await specialist(agent, desk, models(agent)).invoke({ messages: [new HumanMessage(task)] }, { signal: desk.signal, recursionLimit: 2 * LIMITS.steps + 2 });
      answer = textOf(out.messages.at(-1)).trim() || "(No answer.)";
    } catch (error) {
      if (desk.signal.aborted) throw error;
      console.error(`The ${agent} specialist failed:`, error);
      answer = `The ${SPECIALIST_LABELS[agent].toLowerCase()} couldn't finish this task.`;
    }
    // The manager learns for certain what the user will see, whatever the specialist's words say.
    const made = desk.made.slice(from).filter((m) => m.by === agent).map((m) => describe(m.card));
    desk.emit({ kind: "answered", agent });
    return { messages: [new ToolMessage({ tool_call_id: call.id!, name: call.name, content: made.length ? `${answer}\n\n[Shown to the user below the reply: ${made.join("; ")}.]` : answer })] };
  };

  const ownTools = async (input: unknown) => {
    const { call } = input as { call: ToolCall };
    const t = own.find((x) => x.name === call.name);
    const content = t ? String(await t.invoke(call.args)) : `There's no tool called ${call.name}.`;
    return { messages: [new ToolMessage({ tool_call_id: call.id!, name: call.name, content })] };
  };

  // A handoff past the limit. Marked as an error, so it isn't counted among the specialists who answered.
  const unasked = async (input: unknown) => {
    const { call } = input as { call: ToolCall };
    const content = "Not asked: the team has taken all the tasks it can for this message. Reply from what you have, and say what's still open.";
    return { messages: [new ToolMessage({ tool_call_id: call.id!, name: call.name, content, status: "error" })] };
  };

  const collect = (s: State) => {
    const turn = s.messages.findLast((m) => isHumanMessage(m))?.id ?? "";
    return desk.made.length ? { cards: desk.made.map(({ card }) => ({ ...card, turn })) } : {};
  };

  const graph = new StateGraph(ManagerState)
    .addNode("fold", fold)
    .addNode("manager", manage)
    .addNode("route", ask("route"))
    .addNode("venues", ask("venues"))
    .addNode("sponsors", ask("sponsors"))
    .addNode("promoter", ask("promoter"))
    .addNode("own", ownTools)
    .addNode("unasked", unasked)
    .addNode("collect", collect)
    .addEdge(START, "fold")
    .addEdge("fold", "manager")
    .addConditionalEdges("manager", dispatch, ["route", "venues", "sponsors", "promoter", "own", "unasked", "collect"])
    .addEdge("route", "manager")
    .addEdge("venues", "manager")
    .addEdge("sponsors", "manager")
    .addEdge("promoter", "manager")
    .addEdge("own", "manager")
    .addEdge("unasked", "manager")
    .addEdge("collect", END);
  return graph.compile({ checkpointer, name: "tour-manager" });
}
