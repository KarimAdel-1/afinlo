// How much of each agent's prompt OpenAI can cache for everyone: its tool definitions and fixed instructions, which must
// reach 1,024 tokens for the cache to take them at all. Counted with OpenAI's o200k tokenizer, without calling anything:
// OpenAI's own count came out 120 to 150 lower on 31 Oct 2026, so each should clear 1,024 by that much and more.
//   npx tsx scripts/cache-prefix.mts
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import { Tiktoken } from "js-tiktoken/lite";
import o200k from "js-tiktoken/ranks/o200k_base";
import { SPECIALISTS, type Plan } from "../src/core/tour/types";
import { assistantTools, type AssistantDesk } from "../src/platform/assistant/tools";
import { ASSISTANT_FIXED } from "../src/platform/assistant/graph";
import type { Desk } from "../src/platform/manager/desk";
import { HANDOFFS } from "../src/platform/manager/graph";
import { MANAGER_FIXED, specialistFixed } from "../src/platform/manager/team";
import { managerTools, teamTools } from "../src/platform/manager/tools";

const MARGIN = 1200;
const encoder = new Tiktoken(o200k);
// Tools are only described here, never run, so the desks can be empty; two different tours show they don't depend on it.
const tour = (id: string) => ({ plan: { id, act: { name: id }, route: [], cities: [], sponsors: [] } as unknown as Plan }) as unknown as Desk;
const home = { profile: {}, tours: [] } as unknown as AssistantDesk;
const rendered = (tools: unknown[]) => JSON.stringify(tools.map((t) => convertToOpenAITool(t as never)));

const agents: { name: string; tools: (desk: Desk) => string; fixed: string }[] = [
  { name: "assistant", tools: () => rendered(assistantTools(home)), fixed: ASSISTANT_FIXED },
  { name: "manager", tools: (desk) => rendered([...HANDOFFS, ...managerTools(desk)]), fixed: MANAGER_FIXED },
  ...SPECIALISTS.map((agent) => ({ name: agent, tools: (desk: Desk) => rendered(teamTools(agent, desk)), fixed: specialistFixed(agent) })),
];

let short = false;
for (const { name, tools, fixed } of agents) {
  const definitions = tools(tour("one"));
  const shared = definitions === tools(tour("two"));
  const [t, f] = [encoder.encode(definitions).length, encoder.encode(fixed).length];
  if (t + f < MARGIN || !shared) short = true;
  console.log(`${name.padEnd(10)} tools ${String(t).padStart(5)}  fixed ${String(f).padStart(5)}  together ${String(t + f).padStart(5)}${shared ? "" : "  TOOLS CHANGE WITH THE TOUR"}`);
}
if (short) process.exitCode = 1;
