// The tour manager and its team as LangGraph graphs. The manager is a supervisor that hands work out through tools, one
// per specialist, the pattern LangGraph's multi-agent supervisors use: its tool calls fan out to the specialists in
// parallel (Send), each specialist's answer comes back as that tool's result, and the manager replies from what they
// found. Each specialist is its own small graph, a ReAct loop (think, use tools, think) with its own prompt, tools and
// model, that sees only its task, so the manager's context stays short. The manager's conversation is checkpointed,
// and older turns fold into a running summary.
import { Annotation, END, MessagesAnnotation, Send, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, HumanMessage, isAIMessage, isHumanMessage, isToolMessage, RemoveMessage, SystemMessage, ToolMessage, type BaseMessage, type ToolCall } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { withoutUnsupportedClaims } from "@/core/tour/claims";
import { courtesyOf } from "@/core/tour/courtesy";
import { SPECIALIST_LABELS, SPECIALISTS, type ManagerCard, type Specialist } from "@/core/tour/types";
import { data } from "../tour/model";
import type { Desk } from "./desk";
import { changingPart, fixedPart, textOf, withNote } from "./prompt";
import { MANAGER_FIXED, managerTour, screenNote, specialistFixed, specialistTour, SUMMARY_PROMPT, TEAM } from "./team";
import { managerTools, teamTools } from "./tools";

/** Whose model it is: the manager's, a specialist's, the summarizer's, or the assistant's on Home. */
export type Role = "manager" | Specialist | "summary" | "assistant";
export type Models = (role: Role) => BaseChatModel;

export const LIMITS = {
  /** Specialist answers the manager may ask for in one message. */
  asks: 4,
  /** Rounds of handing out work in one message before the manager must reply. */
  rounds: 3,
  /** Model calls a specialist makes for one task; the last answers without tools. */
  steps: 4,
  /** Turns kept once a conversation has more than `foldAt`; older ones fold into the summary. */
  keep: 3,
  foldAt: 5,
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

/** The current turn: the user's last message and what followed it. */
export const thisTurn = (messages: BaseMessage[]) => messages.slice(Math.max(0, messages.findLastIndex((m) => isHumanMessage(m))));
export const agentOf = (tool: string) => SPECIALISTS.find((a) => TEAM[a].handoff === tool);
const callsOf = (m: BaseMessage | undefined) => (m && isAIMessage(m) ? ((m as AIMessage).tool_calls ?? []) : []);

/** How much of an earlier message a model reads again: enough to know what was asked and answered. */
const EARLIER_CHARS = 600;
const shortened = (text: string) => (text.length > EARLIER_CHARS ? `${text.slice(0, EARLIER_CHARS)}…` : text);

/**
 * What a model reads of the conversation: the current turn in full, and the latest `earlier` messages before it as
 * what was said, each cut to EARLIER_CHARS. Earlier turns' tool calls, tool results and reasoning stay in the
 * checkpoint but aren't sent again: the replies carry what they found, and resending them would make every message
 * cost more than the last.
 */
export function contextOf(messages: BaseMessage[], earlier = 6): BaseMessage[] {
  const start = Math.max(0, messages.findLastIndex((m) => isHumanMessage(m)));
  const said = messages.slice(0, start).flatMap((m): BaseMessage[] => {
    if (isHumanMessage(m)) return [new HumanMessage({ id: m.id, content: shortened(textOf(m)) })];
    const text = isAIMessage(m) && !callsOf(m).length ? textOf(m).trim() : "";
    return text ? [new AIMessage({ id: m.id, content: shortened(text) })] : [];
  });
  return [...said.slice(-earlier), ...messages.slice(start)];
}

/** The manager's words for a thanks or a hello, which need no model. */
const COURTESY = {
  thanks: "You're welcome. Ask me anything about the tour whenever you need.",
  hello: "Hi! Ask me about this tour's route, venues, sponsors or fans, or for a change to it.",
};
/** A tool answer's words for the manager about what was shown, which the user's copy of the answer leaves out. */
const SHOWN = /\n\n\[Shown to the user below the reply: [^\]]*\.\]$/;
/** What the team made this turn, in a line under the reply. */
function madeLine(made: Desk["made"]) {
  const kinds = made.map((m) => m.card.kind);
  const drafts = kinds.filter((k) => k === "draft").length;
  return [kinds.includes("change") ? "The change is ready to apply below." : "", drafts ? (drafts > 1 ? `The ${drafts} drafts are below, to edit and send.` : "The draft is below, to edit and send.") : ""].filter(Boolean).join(" ");
}

const describe = (card: ManagerCard) =>
  card.kind === "change" ? `a change to apply (${card.summary})` : card.kind === "draft" ? `a draft ${card.draft.type === "post" ? "post" : "email"} for ${card.draft.to}` : card.text;

/** A specialist for one task: its model and tools in a loop until it answers, the last of LIMITS.steps calls without tools. */
export function specialist(agent: Specialist, desk: Desk, model: BaseChatModel) {
  const tools = teamTools(agent, desk);
  const fixed = fixedPart(specialistFixed(agent));
  const free = model.bindTools!(tools);
  const answer = model.bindTools!(tools, { tool_choice: "none" });
  const think = async (s: typeof MessagesAnnotation.State) => {
    const last = s.messages.filter((m) => isAIMessage(m)).length >= LIMITS.steps - 1;
    // The end-of-budget note goes last, so everything before it is still read from the cache.
    const note = last ? [changingPart("You've done all the lookups this task allows: answer now from what you found.")] : [];
    return { messages: [await (last ? answer : free).invoke([fixed, changingPart(specialistTour(desk.plan)), ...s.messages, ...note], { signal: desk.signal })] };
  };
  return new StateGraph(MessagesAnnotation)
    .addNode("think", think)
    .addNode("tools", new ToolNode(tools, { handleToolErrors: true }))
    .addEdge(START, "think")
    .addConditionalEdges("think", (s) => (callsOf(s.messages.at(-1)).length ? "tools" : END), ["tools", END])
    .addEdge("tools", "think")
    .compile({ checkpointer: false, name: agent });
}

/** The manager's handoff tools, one per specialist. */
export const HANDOFFS = SPECIALISTS.map((a) => ({
  name: TEAM[a].handoff,
  description: TEAM[a].does,
  schema: z.object({ task: z.string().min(3).max(1200).describe("What to find out or do, standing on its own: the cities, brands, venues and language by name.") }),
}));

/** The manager's graph for one turn of the conversation, over the turn's desk. */
export function managerGraph(desk: Desk, models: Models, checkpointer?: BaseCheckpointSaver) {
  const own = managerTools(desk);
  const model = models("manager");
  const free = model.bindTools!([...HANDOFFS, ...own]);
  const reply = model.bindTools!([...HANDOFFS, ...own], { tool_choice: "none" });
  const fixed = fixedPart(MANAGER_FIXED);

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
    // A thanks or a hello, and nothing else yet: no model needed.
    const courtesy = turn.length === 1 ? courtesyOf(textOf(turn[0])) : undefined;
    if (courtesy) return { messages: [new AIMessage(COURTESY[courtesy])] };
    // The work went to specialists alone, and each answered: their answers, written for the user, are the reply, so the
    // manager isn't called again only to say them in other words. Its own tools (a "no" remembered) still get a reply.
    const handed = callsOf(turn.findLast((m) => isAIMessage(m)));
    const answers = handed.map((c) => turn.find((m) => isToolMessage(m) && m.tool_call_id === c.id) as ToolMessage | undefined);
    if (handed.length && handed.every((c) => agentOf(c.name)) && answers.every((a) => a && a.status !== "error")) {
      const said = answers.map((a) => textOf(a).replace(SHOWN, "").trim()).filter(Boolean);
      return { messages: [new AIMessage([...said, madeLine(desk.made)].filter(Boolean).join("\n\n"))] };
    }
    const asked = turn.filter((m) => isToolMessage(m) && agentOf(m.name ?? "")).length;
    const rounds = turn.filter((m) => callsOf(m).length).length;
    const last = asked >= LIMITS.asks || rounds >= LIMITS.rounds;
    const messages = withNote(contextOf(s.messages), screenNote(desk.plan, desk.context));
    // The end-of-budget note goes last, so everything before it is still read from the cache.
    const note = last ? [changingPart("The team has done all it can for this message: reply to the user now.")] : [];
    return { messages: [await (last ? reply : free).invoke([fixed, changingPart(managerTour(desk.plan, s.summary)), ...messages, ...note], { signal: desk.signal })] };
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

  // The reply as the user sees it: what the team made, and the reply itself without any sentence claiming what the
  // data can't support (money, audience or sales counts, someone having agreed).
  const collect = (s: State) => {
    const turn = s.messages.findLast((m) => isHumanMessage(m))?.id ?? "";
    const reply = s.messages.at(-1);
    const checked = withoutUnsupportedClaims(textOf(reply));
    return {
      ...(desk.made.length ? { cards: desk.made.map(({ card }) => ({ ...card, turn })) } : {}),
      ...(checked.removed && reply?.id ? { messages: [new AIMessage({ id: reply.id, content: checked.text })] } : {}),
    };
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
