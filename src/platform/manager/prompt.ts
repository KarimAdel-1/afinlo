// An agent's instructions as two developer messages: the fixed part, the same for every user and tour, ending at an
// explicit cache breakpoint so it's read from OpenAI's cache at a tenth of the price; then the part that changes
// (the tour, the user, the summary), whose end is the implicit boundary.
import { HumanMessage, isHumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";

export const textOf = (m: BaseMessage | undefined) => (!m ? "" : typeof m.content === "string" ? m.content : m.text);

export const fixedPart = (text: string) => new SystemMessage({ content: [{ type: "text", text, prompt_cache_breakpoint: { mode: "explicit" } } as { type: "text"; text: string }] });

export const changingPart = (text: string) => new SystemMessage(text);

/**
 * The messages with a note added to the user's latest one, for the model call only (it isn't saved): what changes
 * every message goes last, so everything before it stays cacheable.
 */
export function withNote(messages: BaseMessage[], note: string): BaseMessage[] {
  const at = messages.findLastIndex((m) => isHumanMessage(m));
  if (at < 0 || !note) return messages;
  const out = [...messages];
  out[at] = new HumanMessage({ id: messages[at].id, content: `${textOf(messages[at])}\n\n${note}` });
  return out;
}
