// The assistant on Home, with a scripted model against the fixture Qloo: it remembers what the user tells it, finds the
// act, plans the tour (the same agent as the brief) and returns it as a card to open, with the tour on the user's list;
// a new artist is planned from the acts they sound like; the conversation is kept. Proves the orchestration, not the
// quality of a real model's words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemorySaver } from "@langchain/langgraph";
import { isToolMessage, type BaseMessage } from "@langchain/core/messages";
import { db } from "@/lib/db";
import { testBrowser, testDatabase } from "@/testing/database";
import { ACT, fixtureQloo, SIMILAR } from "@/testing/qloo";
import { calls, ScriptedModel } from "@/testing/scripted";
import type { AssistantEvent } from "@/core/tour/types";
import { savedResults } from "../tour/saved";
import { getPlan } from "../tour/store";
import { templatePitch } from "../tour/writer";
import { askAssistant, assistantChats, assistantHistory, deleteAssistantChat } from "./chat";
import { getProfile } from "./profile";

testDatabase();

const results = (messages: BaseMessage[]) => messages.filter((m) => isToolMessage(m)).map((m) => String(m.content));
const writer = async (f: Parameters<typeof templatePitch>[0]) => templatePitch(f);

test("the assistant learns about the user, finds the act and plans the tour, which comes back to open", async () => {
  const browser = testBrowser();
  const saver = new MemorySaver();
  const model = new ScriptedModel([
    calls(["remember_about_user", { name: "Fixture Star", role: "artist", basedIn: "Nashville", goals: ["a first headline tour"] }], ["find_act", { name: "Fixture Star" }]),
    (messages) => {
      assert.match(results(messages).join(), new RegExp(ACT), "the act's Qloo ID, from Qloo");
      return calls(["plan_tour", { actId: ACT, area: "United States", shows: 4 }]);
    },
    (messages) => {
      assert.match(results(messages).at(-1)!, /shownToTheUser/);
      return "Your 4-show tour is ready below.";
    },
  ]);
  const events: AssistantEvent[] = [];
  const out = await askAssistant(
    { browser, visitor: `v:${browser}`, chat: "chat-one", message: "I'm Fixture Star from Nashville. Plan my first tour.", signal: AbortSignal.timeout(30_000), emit: (e) => events.push(e) },
    { model, checkpointer: saver, client: fixtureQloo(), writer },
  );
  assert.equal(out.reply, "Your 4-show tour is ready below.");
  assert.equal(out.cards.length, 1);
  const card = out.cards[0];
  assert.equal(card.route.length, 4);
  assert.ok(await getPlan(card.planId), "the tour is saved");
  assert.ok((await savedResults(browser)).some((s) => s.plan.id === card.planId), "and on the user's list");
  assert.deepEqual([(await getProfile(browser)).basedIn, (await getProfile(browser)).goals], ["Nashville", ["a first headline tour"]], "what they said is remembered");
  assert.ok(events.some((e) => /Scoring the cities/.test(e.label)), "the plan's stages are shown as it's made");
  // The system prompt carries what's known; the conversation and its card are kept.
  const history = await assistantHistory(browser, "chat-one", { checkpointer: saver });
  assert.deepEqual(history.map((m) => m.role), ["user", "assistant"]);
  assert.equal(history[1].cards?.[0].planId, card.planId);

  const next = new ScriptedModel([
    (messages) => {
      assert.match(String(messages[0].content), /"basedIn":"Nashville"/, "the next conversation starts from what's known");
      return "Hello again.";
    },
  ]);
  await askAssistant({ browser, visitor: `v:${browser}`, chat: "chat-two", message: "Hi, what can you do?", signal: AbortSignal.timeout(30_000) }, { model: next, checkpointer: saver, client: fixtureQloo(), writer });
  // A thanks needs no model: a scripted model with nothing to say would fail if asked.
  const thanks = await askAssistant({ browser, visitor: `v:${browser}`, chat: "chat-two", message: "Thanks!", signal: AbortSignal.timeout(30_000) }, { model: new ScriptedModel([]), checkpointer: saver, client: fixtureQloo(), writer });
  assert.match(thanks.reply, /You're welcome/);
  // Each chat is its own conversation, listed newest first under its first message; a deleted one goes.
  assert.deepEqual((await assistantHistory(browser, "chat-two", { checkpointer: saver })).map((m) => m.text), ["Hi, what can you do?", "Hello again.", "Thanks!", thanks.reply]);
  assert.deepEqual((await assistantChats(browser, { checkpointer: saver })).map((c) => [c.id, c.title]), [["chat-two", "Hi, what can you do?"], ["chat-one", "I'm Fixture Star from Nashville. Plan my first tour."]]);
  await deleteAssistantChat(browser, "chat-two");
  assert.deepEqual((await assistantChats(browser, { checkpointer: saver })).map((c) => c.id), ["chat-one"]);
});

test("a new artist Qloo doesn't know is planned from the acts they sound like, and an unknown area is a clear answer", async () => {
  const browser = testBrowser();
  const model = new ScriptedModel([
    calls(["plan_tour", { newAct: { name: "The Unsigned", comedian: false, like: SIMILAR.slice(0, 2) }, area: "Atlantis" }]),
    (messages) => {
      assert.match(results(messages).at(-1)!, /^That didn't work: "Atlantis" isn't an area Afinlo tours/);
      return calls(["plan_tour", { newAct: { name: "The Unsigned", comedian: false, like: SIMILAR.slice(0, 2) }, area: "the United States", shows: 3 }]);
    },
    "Planned from the acts you sound like.",
  ]);
  const out = await askAssistant({ browser, visitor: `v:${browser}`, chat: "chat-new", message: "I'm new. Plan a tour.", signal: AbortSignal.timeout(30_000) }, { model, checkpointer: new MemorySaver(), client: fixtureQloo(), writer });
  const plan = (await getPlan(out.cards[0].planId))!;
  try {
    assert.equal(plan.act.name, "The Unsigned");
    assert.equal(plan.signal.basis, "named", "predicted from the acts named");
  } finally {
    await db().prepare("DELETE FROM tour_plans WHERE id = ?").run(plan.id);
  }
});
