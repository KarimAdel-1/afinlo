// Afinlo's assistant on Home, as a LangGraph graph: one agent that gets to know the user, finds the act, shows where
// its fans are and plans the tour, in a loop of thinking and using its tools (tools.ts). Its conversation is
// checkpointed per browser; a turn cut short is mended before the next, and only the latest turns go to the model.
import { Annotation, END, MessagesAnnotation, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, isAIMessage, isHumanMessage, isToolMessage, RemoveMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { withoutUnsupportedClaims } from "@/core/tour/claims";
import { courtesyOf } from "@/core/tour/courtesy";
import type { AssistantCard } from "@/core/tour/types";
import { contextOf, textOf, thisTurn } from "../manager/graph";
import { data, DATA_RULE } from "../tour/model";
import { assistantTools, type AssistantDesk } from "./tools";

export const ASSISTANT_LIMITS = {
  /** Model calls for one message; the last answers without tools. */
  steps: 6,
  /** Earlier messages the model reads again, the latest, as what was said (contextOf); the profile keeps the rest. */
  earlier: 6,
};

export const AssistantState = Annotation.Root({
  ...MessagesAnnotation.spec,
  /** The tours the assistant planned or showed, each with its turn (the ID of the user's message it answered). */
  cards: Annotation<(AssistantCard & { turn: string })[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
});
type State = typeof AssistantState.State;

const callsOf = (m: BaseMessage | undefined) => (m && isAIMessage(m) ? ((m as AIMessage).tool_calls ?? []) : []);

/** The assistant's system prompt: what Afinlo is, what it can do, how to get to know the user, the rules, and what it knows. */
export function assistantPrompt(desk: Pick<AssistantDesk, "profile" | "tours">) {
  const known = Object.keys(desk.profile).length ? data("about_the_user", JSON.stringify(desk.profile)) : "You don't know anything about the user yet.";
  return [
    "You are Afinlo's assistant, for artists, comedians and the people who manage them. Afinlo finds where an act's fans are in Qloo's taste data, plans a tour around them, and lines up the venues, sponsors and promotion.",
    "With your tools you can: get to know the user and remember it (remember_about_user); find an act in Qloo (find_act); show where its fans are around the world (fans_worldwide); plan a tour (plan_tour), which opens as a full workspace with the route, venues, sponsors, promotion and a tour team of its own; and go through the user's tours and what each needs next (my_tours, show_tour). Inside a tour, its team books venues, pitches sponsors in any language and writes posts.",
    "Get to know them as you go. When you don't know who they are or what they're after, ask: one or two short questions at a time, never a form. Remember what's useful (their name, the act, who they sound like, where they're based, how far along they are, their goals and limits) with remember_about_user, without announcing it.",
    "A new act with few fans yet, or one Qloo doesn't know, can still tour: ask which 2 or 3 well-known acts they sound like, find those with find_act, and plan from them (newAct). Say plainly that the plan is predicted from those acts' fans.",
    "To plan you need the act and where. If they don't know where, look with fans_worldwide and suggest the strongest region or countries. Shows are 7 unless they say. Then plan: don't ask them to confirm every detail. After planning, say in two or three lines what the tour is and why, and that it's ready to open below.",
    "Asked what to do next, use my_tours and name the most pressing tasks.",
    "Every act, city, brand and number you name must come from a tool's answer in this conversation. Fan Heat (0–100) is how strongly an act's fans gather somewhere, from Qloo's taste data: it isn't ticket demand. Never state money figures, prices, fees, sales or follower counts.",
    "Be brief and warm: a few sentences or a short list. Plain text: no markdown headings or tables (a list may use '- ').",
    DATA_RULE,
    known,
    desk.tours.length ? data("their_tours", JSON.stringify(desk.tours)) : "They have no tours yet.",
  ].join("\n\n");
}

/** The assistant's graph for one message, over the message's desk. */
export function assistantGraph(desk: AssistantDesk, model: BaseChatModel, checkpointer?: BaseCheckpointSaver) {
  const tools = assistantTools(desk);
  const free = model.bindTools!(tools);
  const answer = model.bindTools!(tools, { tool_choice: "none" });

  // A turn cut short (the time ran out mid-way) can leave tool calls without answers: those messages go, so the
  // conversation stays well formed.
  const mend = (s: State) => {
    const answered = new Set(s.messages.flatMap((m) => (isToolMessage(m) ? [m.tool_call_id] : [])));
    const broken = s.messages.filter((m) => callsOf(m).some((c) => !answered.has(c.id!)));
    const brokenCalls = new Set(broken.flatMap((m) => callsOf(m).map((c) => c.id)));
    const drop = [...broken, ...s.messages.filter((m) => isToolMessage(m) && brokenCalls.has(m.tool_call_id))];
    return drop.length ? { messages: drop.map((m) => new RemoveMessage({ id: m.id! })) } : {};
  };

  const think = async (s: State) => {
    // A thanks or a hello, and nothing else yet: no model needed.
    const turn = thisTurn(s.messages);
    const courtesy = turn.length === 1 ? courtesyOf(textOf(turn[0])) : undefined;
    if (courtesy) {
      const first = desk.profile.name?.trim().split(/\s+/)[0];
      return { messages: [new AIMessage(courtesy === "thanks" ? "You're welcome! I'm here whenever you want to plan the next step." : `Hi${first ? ` ${first}` : ""}! Tell me about your act, or ask me to plan a tour.`)] };
    }
    const last = thisTurn(s.messages).filter((m) => isAIMessage(m)).length >= ASSISTANT_LIMITS.steps - 1;
    const recent = contextOf(s.messages, ASSISTANT_LIMITS.earlier);
    const prompt = assistantPrompt(desk);
    const system = new SystemMessage(last ? `${prompt}\n\nYou've done all the lookups this message allows: answer now from what you found.` : prompt);
    return { messages: [await (last ? answer : free).invoke([system, ...recent], { signal: desk.signal })] };
  };

  // The tours it made, and the reply without any sentence claiming what the data can't support.
  const collect = (s: State) => {
    const turn = s.messages.findLast((m) => isHumanMessage(m))?.id ?? "";
    const reply = s.messages.at(-1);
    const checked = withoutUnsupportedClaims(textOf(reply));
    return {
      ...(desk.made.length ? { cards: desk.made.map((card) => ({ ...card, turn })) } : {}),
      ...(checked.removed && reply?.id ? { messages: [new AIMessage({ id: reply.id, content: checked.text })] } : {}),
    };
  };

  return new StateGraph(AssistantState)
    .addNode("mend", mend)
    .addNode("think", think)
    .addNode("tools", new ToolNode(tools, { handleToolErrors: true }))
    .addNode("collect", collect)
    .addEdge(START, "mend")
    .addEdge("mend", "think")
    .addConditionalEdges("think", (s) => (callsOf(s.messages.at(-1)).length ? "tools" : "collect"), ["tools", "collect"])
    .addEdge("tools", "think")
    .addEdge("collect", END)
    .compile({ checkpointer, name: "afinlo-assistant" });
}
