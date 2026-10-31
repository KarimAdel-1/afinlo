// What actually goes to OpenAI, offline: the real ChatOpenAI with a fetch that captures the request and answers itself,
// so nothing is sent or spent. Checks the fixed part carries its cache breakpoint, the changing part doesn't, one-off
// calls skip the cache, and the reply's cache reads and writes reach the meter, its cost and tour_model_usage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HumanMessage } from "@langchain/core/messages";
import { db } from "@/lib/db";
import { testBrowser, testDatabase } from "@/testing/database";
import { openAiModels } from "./models";
import { changingPart, fixedPart, textOf, withNote } from "./prompt";
import { costOf, usageMeter, type Usage } from "./usage";

testDatabase();
process.env.OPENAI_API_KEY ??= "not-a-real-key";

function offline() {
  const bodies: Record<string, unknown>[] = [];
  const fetch = async (_url: unknown, init?: { body?: unknown }) => {
    bodies.push(JSON.parse(String(init?.body)));
    const usage = { input_tokens: 2000, input_tokens_details: { cached_tokens: 1200, cache_write_tokens: 300 }, output_tokens: 5, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 2005 };
    const output = [{ type: "message", id: "msg_1", status: "completed", role: "assistant", content: [{ type: "output_text", text: "Hello.", annotations: [] }] }];
    return new Response(JSON.stringify({ id: "resp_1", object: "response", created_at: 0, status: "completed", model: "gpt-6-luna", output, usage }), { headers: { "content-type": "application/json" } });
  };
  return { bodies, fetch: fetch as unknown as typeof globalThis.fetch };
}

test("the fixed part goes out with its cache breakpoint, the changing part without, under the role's cache key", async () => {
  const { bodies, fetch } = offline();
  const used: Usage[] = [];
  const reply = await openAiModels((_role, u) => used.push(u), { fetch })("route").invoke([fixedPart("The fixed part."), changingPart("The tour."), new HumanMessage("Hi")]);
  assert.equal(textOf(reply), "Hello.");
  const [body] = bodies as { input: { role: string }[]; prompt_cache_key: string; prompt_cache_options?: unknown }[];
  assert.deepEqual(body.input[0], { type: "message", role: "developer", content: [{ type: "input_text", text: "The fixed part.", prompt_cache_breakpoint: { mode: "explicit" } }] });
  assert.equal(body.input[1].role, "developer");
  assert.doesNotMatch(JSON.stringify(body.input[1]), /prompt_cache_breakpoint/);
  assert.equal(body.prompt_cache_key, "afinlo-route");
  assert.equal(body.prompt_cache_options, undefined, "agents stay on implicit mode, which caches their loops step to step");
  assert.deepEqual(used, [{ input: 2000, cached: 1200, written: 300, output: 5 }]);
});

test("the summarizer neither reads nor writes the cache", async () => {
  const { bodies, fetch } = offline();
  await openAiModels(undefined, { fetch })("summary").invoke([new HumanMessage("Fold this.")]);
  const [body] = bodies as { prompt_cache_key: string; prompt_cache_options?: unknown }[];
  assert.deepEqual(body.prompt_cache_options, { mode: "explicit" });
  assert.equal(body.prompt_cache_key, "afinlo-summary");
});

test("a note joins the user's latest message for the call, leaving the conversation as it was", () => {
  const messages = [new HumanMessage({ id: "a", content: "First" }), new HumanMessage({ id: "b", content: "Second" })];
  const noted = withNote(messages, "the note");
  assert.deepEqual(noted.map((m) => [m.id, textOf(m)]), [["a", "First"], ["b", "Second\n\nthe note"]]);
  assert.equal(textOf(messages[1]), "Second");
  assert.equal(withNote(messages, ""), messages);
});

test("cache writes are charged at their rate, counted by role and kept", async () => {
  // Per million on GPT-6 Luna: 400,000 plain at $0.10, 500,000 read at $0.01, 100,000 written at $0.125, 10,000 out at $0.50.
  assert.equal(Number(costOf("gpt-6-luna", { input: 1e6, cached: 5e5, written: 1e5, output: 1e4 }).toFixed(6)), 0.0625);
  const visitor = testBrowser();
  const meter = usageMeter("tour", visitor);
  meter.add("route", { input: 2000, cached: 1200, written: 300, output: 5 });
  meter.add("route", { input: 2000, cached: 1500, written: 0, output: 5 });
  assert.equal(meter.totals().written, 300);
  await meter.save();
  const row = await db().prepare("SELECT calls, cached, written FROM tour_model_usage WHERE visitor = ?").get(visitor);
  assert.deepEqual(row, { calls: 2, cached: 2700, written: 300 });
});
