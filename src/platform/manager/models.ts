// The team's models: each role's model and reasoning effort from MODELS (one table for every model call Afinlo makes),
// as LangChain chat models on OpenAI's Responses API. Nothing is stored at OpenAI, and each role keeps one prompt cache
// key, so its long system prompt is billed at the cached rate after the first call.
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AIMessage } from "@langchain/core/messages";
import type { ChatGeneration, LLMResult } from "@langchain/core/outputs";
import { setting } from "@/lib/settings";
import { MODELS } from "../tour/model";
import type { Models, Role } from "./graph";
import type { Usage } from "./usage";

/**
 * The most each role writes in one call, its reasoning included: room for its longest proper answer (the manager routes
 * in a few lines; a sponsor pitch is under 170 words; the promoter writes up to three posts) and little more, so a call
 * that rambles is cut off rather than billed.
 */
const MAX_TOKENS: Record<Role, number> = { manager: 800, route: 1200, venues: 1200, sponsors: 2000, promoter: 2000, summary: 400, assistant: 1500 };


export function openAiModels(onUsage?: (role: Role, usage: Usage) => void): Models {
  const made = new Map<Role, BaseChatModel>();
  return (role) => {
    let model = made.get(role);
    if (!model) {
      model = new ChatOpenAI({
        model: MODELS[role].model,
        apiKey: setting("OPENAI_API_KEY"),
        useResponsesApi: true,
        reasoning: { effort: MODELS[role].effort },
        maxTokens: MAX_TOKENS[role],
        zdrEnabled: true,
        promptCacheKey: `afinlo-${role}`,
        maxRetries: 1,
        timeout: 45_000,
        callbacks: onUsage && [
          {
            handleLLMEnd: (out: LLMResult) => {
              const u = ((out.generations[0]?.[0] as ChatGeneration | undefined)?.message as AIMessage | undefined)?.usage_metadata;
              if (u) onUsage(role, { input: u.input_tokens ?? 0, cached: u.input_token_details?.cache_read ?? 0, output: u.output_tokens ?? 0 });
            },
          },
        ],
      });
      made.set(role, model);
    }
    return model;
  };
}
