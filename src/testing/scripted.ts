// A chat model for tests that answers from a script: each call takes the next reply, a message or a function of the
// messages it was sent (to check them, or to answer from them). It records every call, with the tool choice it was
// bound with, so a test can see what each agent was shown and allowed.
import { BaseChatModel, type BaseChatModelCallOptions } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";

type Reply = AIMessage | string | ((messages: BaseMessage[]) => AIMessage | string);

export class ScriptedModel extends BaseChatModel {
  calls: { messages: BaseMessage[]; toolChoice?: unknown }[] = [];
  constructor(
    private script: Reply[],
    private label = "model",
  ) {
    super({});
  }
  _llmType() {
    return "scripted";
  }
  // Bound tools change nothing in the script; the tool choice is kept with each call.
  bindTools(_tools: unknown[], kwargs?: Partial<BaseChatModelCallOptions>) {
    return this.withConfig({ tool_choice: kwargs?.tool_choice } as Partial<BaseChatModelCallOptions>) as never;
  }
  async _generate(messages: BaseMessage[], options: this["ParsedCallOptions"]): Promise<ChatResult> {
    this.calls.push({ messages, toolChoice: (options as { tool_choice?: unknown }).tool_choice });
    const next = this.script.shift();
    if (next === undefined) throw new Error(`The ${this.label}'s script ran out at call ${this.calls.length}.`);
    const reply = typeof next === "function" ? next(messages) : next;
    const message = typeof reply === "string" ? new AIMessage(reply) : reply;
    return { generations: [{ text: typeof message.content === "string" ? message.content : "", message }] };
  }
  get left() {
    return this.script.length;
  }
}

let n = 0;
/** A model reply that calls tools: [name, args] pairs, each with its own call ID. */
export const calls = (...list: [string, Record<string, unknown>][]) => new AIMessage({ content: "", tool_calls: list.map(([name, args]) => ({ name, args, id: `call_${++n}`, type: "tool_call" as const })) });
