// The tour manager and its team, with scripted models against the fixture Qloo: the manager hands work to the right
// specialists (several at once when a message needs several), each sees only its task and answers from its tools,
// a change is only a proposal, drafts are checked, statuses and "no"s are kept, the limits hold, and the conversation
// is remembered, folded when long, and mended when a turn is cut short. Proves the orchestration, not the quality of a
// real model's words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemorySaver } from "@langchain/langgraph";
import { isAIMessage, isHumanMessage, isToolMessage, type AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ManagerEvent, Plan } from "@/core/tour/types";
import { testBrowser, testDatabase } from "@/testing/database";
import { ACT, fixtureQloo } from "@/testing/qloo";
import { calls, ScriptedModel } from "@/testing/scripted";
import { planTour } from "../tour/agent";
import { actMemory, tourOf, tracksFor } from "../tour/tracker";
import { draftsFor, keepProspects, prospectsFor } from "../tour/work";
import { templatePitch } from "../tour/writer";
import { askManager, managerHistory, TurnFailed } from "./chat";
import { LIMITS, type Role } from "./graph";
import { TOOL_BUDGET } from "./tools";

testDatabase();

let made: Plan | undefined;
/** The fixture act's tour, under an ID of the test's own. */
async function tour(): Promise<Plan> {
  made ??= await planTour({ actId: ACT, stops: 4 }, { client: fixtureQloo(), writer: async (f) => templatePitch(f) });
  return { ...made, id: `pl_test_${Math.random().toString(36).slice(2, 10)}` };
}

async function ask(plan: Plan, message: string, scripts: Partial<Record<Role, ScriptedModel>>, options: { browser?: string; saver?: MemorySaver; signal?: AbortSignal } = {}) {
  const events: ManagerEvent[] = [];
  const out = await askManager(
    { plan, browser: options.browser ?? testBrowser(), message, signal: options.signal ?? AbortSignal.timeout(30_000), emit: (e) => events.push(e) },
    { models: (role) => scripts[role] ?? new ScriptedModel([], role), checkpointer: options.saver ?? new MemorySaver(), client: fixtureQloo() },
  );
  return { ...out, events };
}
const results = (messages: BaseMessage[]) => messages.filter((m) => isToolMessage(m)).map((m) => String(m.content));
const system = (m: ScriptedModel, i: number) => String(m.calls.at(i)!.messages[0].content);
const stopOf = (plan: Plan, i: number) => plan.cities.find((c) => c.id === plan.route[i].cityId)!;

test("the manager hands a question to the right specialist, who answers from its tools; its answer is the reply", async () => {
  const plan = await tour();
  const stop = stopOf(plan, 1);
  // One call: the manager routes, and isn't asked again only to repeat the answer.
  const manager = new ScriptedModel([calls(["ask_route_planner", { task: `Why is ${stop.name} on the route?` }])], "manager");
  const route = new ScriptedModel(
    [
      calls(["city_details", { city: stop.name }]),
      (messages) => {
        const answer = results(messages).join();
        assert.match(answer, /<data source="afinlo:city_details"/, "tool answers reach the model as fenced data");
        assert.match(answer, /why: Stop 2, with Fan Heat/, "in compact text, not JSON");
        return `${stop.name} is stop 2, with Fan Heat ${stop.heat}.`;
      },
    ],
    "route",
  );
  const out = await ask(plan, `Why ${stop.name}?`, { manager, route });
  assert.equal(out.reply, `${stop.name} is stop 2, with Fan Heat ${stop.heat}.`);
  assert.deepEqual(out.agents, ["route"]);
  assert.deepEqual(out.cards, []);
  // The specialist sees only its task: its own prompt, and the manager's words for it.
  const first = route.calls[0].messages;
  assert.equal(first.length, 2);
  assert.match(String(first[0].content), /^You are the route planner/);
  assert.equal(String(first[1].content), `Why is ${stop.name} on the route?`);
  assert.match(system(manager, 0), /<data source="tour"/, "the tour reaches the manager as data");
  assert.deepEqual(out.events.map((e) => e.kind), ["ask", "tool", "answered"]);
  assert.equal(manager.left + route.left, 0);
});

test("a change is only a proposal: the route planner builds the next request, and the tour stays as it is", async () => {
  const plan = await tour();
  const skip = stopOf(plan, 2);
  const manager = new ScriptedModel([calls(["ask_route_planner", { task: `Make it 5 shows and skip ${skip.name}.` }])]);
  const route = new ScriptedModel([
    calls(["propose_change", { shows: 5, skip: ["Atlantis"] }]),
    (messages) => {
      assert.match(results(messages).at(-1)!, /^That didn't work: Atlantis isn't a candidate city/);
      return calls(["propose_change", { shows: 5, skip: [skip.name] }]);
    },
    "Proposed: 5 shows, without it.",
  ]);
  const out = await ask(plan, `5 shows, no ${skip.name}`, { manager, route });
  assert.equal(out.reply, "Proposed: 5 shows, without it.\n\nThe change is ready to apply below.", "the reply says what's below it");
  assert.equal(out.cards.length, 1);
  const card = out.cards[0];
  assert.ok(card.kind === "change");
  assert.equal(card.summary, `5 shows · skip ${skip.name}`);
  assert.equal(card.request.stops, 5);
  assert.ok(card.request.excludeCityIds.includes(skip.id));
  assert.equal(card.request.parentId, plan.id, "applied, it's a new version of this tour");
  assert.equal(plan.request.stops, 4, "the tour itself didn't change");

  // A city added next to a stop takes its place, and the proposal says so.
  const stop = stopOf(plan, 0);
  const near = { ...stop, id: "us-testville", name: "Testville", lat: stop.lat + 0.3 };
  const again = await ask({ ...plan, cities: [...plan.cities, near] }, "Add Testville", {
    manager: new ScriptedModel([calls(["ask_route_planner", { task: "Add Testville." }])]),
    route: new ScriptedModel([calls(["propose_change", { add: ["Testville"] }]), "Proposed."]),
  });
  const added = again.cards[0];
  assert.ok(added?.kind === "change");
  assert.equal(added.summary, `add Testville (${stop.name} makes way: shows stay 150 km apart)`);
  assert.deepEqual(added.request.includeCityIds, ["us-testville"]);

  // A compound change to another area keeps every part of it, resolved in the new area, and what isn't supported yet
  // is said, not implied.
  const moved = await ask(plan, "Move this to Europe, start in Berlin, keep six shows, and avoid flights.", {
    manager: new ScriptedModel([calls(["ask_route_planner", { task: "Move the tour to Europe, start in Berlin, play Berlin, 6 shows, no flights." }])]),
    route: new ScriptedModel([calls(["propose_change", { area: "Europe", add: ["Berlin"], startFrom: "Berlin", shows: 6, notSupported: ["no flights"] }]), "Proposed: Europe from Berlin."]),
  });
  const europe = moved.cards[0];
  assert.ok(europe?.kind === "change");
  assert.deepEqual(europe.request.where, { kind: "region", region: "europe" });
  assert.deepEqual([europe.request.stops, europe.request.homeCityId, europe.request.includeCityIds], [6, "de-berlin", ["de-berlin"]]);
  assert.equal(europe.summary, "tour Europe instead · 6 shows · add Berlin · start from Berlin (not supported yet, so not applied: no flights)");
});

test("a message that needs two specialists goes to both at once, and the reply is both answers", async () => {
  const plan = await tour();
  const manager = new ScriptedModel([calls(["ask_sponsor_scout", { task: "Which sponsors fit best?" }], ["ask_promoter", { task: "Who are the fans?" }])]);
  const sponsors = new ScriptedModel([calls(["sponsor_list", {}]), (m) => (assert.match(results(m).join(), /Yee Yee Apparel/), "Yee Yee Apparel fits best.")]);
  const promoter = new ScriptedModel([calls(["fan_dna", {}]), (m) => (assert.match(results(m).join(), /Rowdy/), "Rowdy country fans.")]);
  const out = await ask(plan, "Who should sponsor, and who are the fans?", { manager, sponsors, promoter });
  assert.deepEqual([...out.agents].sort(), ["promoter", "sponsors"]);
  assert.equal(out.reply, "Yee Yee Apparel fits best.\n\nRowdy country fans.");
  assert.equal(out.events.filter((e) => e.kind === "ask").length, 2);
  assert.equal(manager.left, 0);
});

test("drafts are checked: a money figure is refused and rewritten, and the saved draft is the user's to send", async () => {
  const plan = await tour();
  const brand = plan.sponsors[0].brand;
  const manager = new ScriptedModel([calls(["ask_sponsor_scout", { task: `Write the ${brand.name} pitch in Spanish.` }])]);
  const sponsors = new ScriptedModel([
    calls(["save_draft", { to: brand.name, language: "Spanish", subject: "Gira", body: "Hola, ofrecemos un paquete de $50,000 para la gira de Fixture Star." }]),
    (m) => {
      assert.match(results(m).at(-1)!, /Refused: it has a money figure or percentage/);
      return calls(["save_draft", { to: "Nike", language: "Spanish", subject: "Gira", body: "Hola equipo de alianzas, hablemos de la gira." }]);
    },
    (m) => {
      assert.match(results(m).at(-1)!, /Nike isn't one of this tour's brands/);
      return calls(["save_draft", { to: brand.name, language: "Spanish", subject: "La gira de Fixture Star", body: "Hola equipo de alianzas: los fans de Fixture Star aman su marca. ¿Hablamos?" }]);
    },
    "Saved the Spanish pitch.",
  ]);
  const out = await ask(plan, `Pitch ${brand.name} in Spanish`, { manager, sponsors });
  assert.equal(out.reply, "Saved the Spanish pitch.\n\nThe draft is below, to edit and send.");
  assert.equal(out.cards.length, 1);
  const card = out.cards[0];
  assert.ok(card.kind === "draft");
  assert.deepEqual([card.draft.type, card.draft.toId, card.draft.language], ["pitch", brand.id, "Spanish"]);
  assert.doesNotMatch(card.draft.body, /\$/);
});

test("statuses and no's last: a pitch's status is set on the tour, and a no is remembered for the act's next tours", async () => {
  const plan = await tour();
  const browser = testBrowser();
  const sponsor = plan.sponsors[0];
  const manager = new ScriptedModel([calls(["remember_no", { kind: "category", name: "alcohol" }], ["ask_sponsor_scout", { task: `Mark the ${sponsor.brand.name} pitch as sent.` }]), "Done."]);
  const sponsors = new ScriptedModel([calls(["set_sponsor_status", { brand: sponsor.brand.name, status: "sent" }]), "Marked as sent."]);
  const out = await ask(plan, `Never alcohol. I sent ${sponsor.brand.name}.`, { manager, sponsors }, { browser });
  const tracks = (await tracksFor(browser, [plan.id])).get(plan.id)!;
  assert.equal(tracks.find((t) => t.itemId === sponsor.brand.id)?.status, "sent");
  assert.deepEqual((await actMemory(browser, plan.act.id))?.avoid, ["alcohol"]);
  assert.deepEqual(out.cards.map((c) => c.kind).sort(), ["memory", "status"]);
});

test("the limits hold: the team's lookups run out, a specialist's last step and the manager's last round can't call tools", async () => {
  const plan = await tour();
  const four = Array.from({ length: 4 }, () => ["route_overview", {}] as [string, Record<string, unknown>]);
  const route = new ScriptedModel([
    calls(...four),
    calls(...four),
    calls(...four),
    (m) => {
      assert.equal(results(m).filter((r) => /used this message's lookups/.test(r)).length, 12 - TOOL_BUDGET);
      return "Here's the route.";
    },
  ]);
  await ask(plan, "The route?", { manager: new ScriptedModel([calls(["ask_route_planner", { task: "Give the route." }]), "Here."]), route });
  assert.equal(route.calls.length, LIMITS.steps);
  assert.equal(route.calls.at(-1)!.toolChoice, "none", "its last step can't call tools");
  assert.match(system(route, -1), /answer now/);

  const manager = new ScriptedModel([...Array.from({ length: LIMITS.rounds }, () => calls(["act_memory", {}])), "Finally, the reply."]);
  const out = await ask(plan, "Remember anything?", { manager });
  assert.equal(out.reply, "Finally, the reply.");
  assert.equal(manager.calls.at(-1)!.toolChoice, "none");
  assert.match(system(manager, -1), /reply to the user now/);
});

test("one round can't hand out more than the message's tasks: the rest are answered without a specialist", async () => {
  const plan = await tour();
  const handoffs = ["ask_route_planner", "ask_venue_booker", "ask_sponsor_scout", "ask_promoter", "ask_route_planner", "ask_venue_booker"];
  const manager = new ScriptedModel([
    calls(...handoffs.map((name, i) => [name, { task: `Task ${i + 1}.` }] as [string, Record<string, unknown>])),
    (messages) => {
      const answers = results(messages);
      assert.equal(answers.length, handoffs.length, "every call has its answer");
      assert.equal(answers.filter((a) => /^Not asked/.test(a)).length, handoffs.length - LIMITS.asks);
      return "Here's what the team found.";
    },
  ]);
  const team = Object.fromEntries((["route", "venues", "sponsors", "promoter"] as const).map((r) => [r, new ScriptedModel([`The ${r} answer.`], r)]));
  const out = await ask(plan, "Everything, twice.", { manager, ...team });
  assert.equal(Object.values(team).reduce((n, m) => n + m.calls.length, 0), LIMITS.asks, "only as many specialists as the limit");
  assert.deepEqual([...out.agents].sort(), ["promoter", "route", "sponsors", "venues"]);
  assert.equal(manager.calls.at(-1)!.toolChoice, "none", "and the manager replies");
});

test("the conversation is remembered across messages, and older turns fold into a summary once it's long", async () => {
  const plan = await tour();
  const browser = testBrowser();
  const saver = new MemorySaver();
  // The first message makes a card; once its turn folds into the summary, the card goes too.
  await ask(plan, "Message 1", { manager: new ScriptedModel([calls(["remember_no", { kind: "city", name: stopOf(plan, 0).name }]), "Reply 1"]) }, { browser, saver });
  for (let i = 2; i <= LIMITS.foldAt; i++)
    await ask(plan, `Message ${i}`, { manager: new ScriptedModel([(m) => (assert.ok(m.some((x) => x.content === `Reply ${i - 1}`), "the last reply is remembered"), `Reply ${i}`)]) }, { browser, saver });
  const cardsNow = async () => ((await saver.getTuple({ configurable: { thread_id: `tour:${plan.id}:${browser}` } }))?.checkpoint.channel_values as { cards: unknown[] }).cards;
  assert.equal((await cardsNow()).length, 1);
  const last = LIMITS.foldAt + 1;
  const summary = new ScriptedModel([(m) => (assert.match(String(m.at(-1)!.content), /User: Message 1\n/), "The user asked ten things.")]);
  const manager = new ScriptedModel([
    (m) => {
      assert.equal(m.filter((x) => isHumanMessage(x)).length, LIMITS.keep, "only the latest turns");
      assert.match(String(m[0].content), /The user asked ten things\./, "and the summary of the rest");
      return `Reply ${last}`;
    },
  ]);
  await ask(plan, `Message ${last}`, { manager, summary }, { browser, saver });
  const history = await managerHistory(plan, browser, { checkpointer: saver });
  assert.equal(history.summary, "The user asked ten things.");
  assert.deepEqual(
    history.messages.filter((m) => m.role === "user").map((m) => m.text),
    Array.from({ length: LIMITS.keep }, (_, i) => `Message ${last - LIMITS.keep + 1 + i}`),
  );
  assert.equal(history.messages.at(-1)!.text, `Reply ${last}`);
  assert.deepEqual(await cardsNow(), [], "the folded turn's card is gone with it");
});

test("a turn cut short leaves no broken messages: its unanswered handoffs are dropped before the next turn", async () => {
  const plan = await tour();
  const browser = testBrowser();
  const saver = new MemorySaver();
  const stop = new AbortController();
  const route = new ScriptedModel([
    () => {
      stop.abort();
      throw new Error("The user left.");
    },
  ]);
  await assert.rejects(ask(plan, "Plan it all.", { manager: new ScriptedModel([calls(["ask_route_planner", { task: "Everything." }])]), route }, { browser, saver, signal: stop.signal }));
  const manager = new ScriptedModel([
    (m) => {
      const answered = new Set(m.flatMap((x) => (isToolMessage(x) ? [x.tool_call_id] : [])));
      assert.ok(m.every((x) => !isAIMessage(x) || ((x as AIMessage).tool_calls ?? []).every((c) => answered.has(c.id!))), "no tool call is left unanswered");
      return "Back again.";
    },
  ]);
  const out = await ask(plan, "Are you there?", { manager }, { browser, saver });
  assert.equal(out.reply, "Back again.");
});

test("earlier turns reach the model as what was said, a specialist's answer is the reply, and a thanks needs no model", async () => {
  const plan = await tour();
  const stop = stopOf(plan, 1);
  const browser = testBrowser();
  const saver = new MemorySaver();
  // The manager hands the question out once: the planner's answer is the reply, without a second manager call, and
  // its unsupported claim is left out.
  const manager = new ScriptedModel(
    [
      calls(["ask_route_planner", { task: `Why is ${stop.name} on the route?` }]),
      (messages) => {
        // The first turn's handoff and the planner's answer aren't sent again: only what was said.
        assert.equal(messages.filter((m) => isToolMessage(m)).length, 0);
        assert.equal(messages.filter((m) => isAIMessage(m) && (m as AIMessage).tool_calls?.length).length, 0);
        assert.deepEqual(messages.slice(1).map((m) => (isHumanMessage(m) ? "user" : "ai")), ["user", "ai", "user"]);
        return "Knoxville has the highest Fan Heat.";
      },
    ],
    "manager",
  );
  const route = new ScriptedModel([() => `${stop.name} is stop 2. Nike has agreed to sponsor it.`], "route");
  const first = await ask(plan, `Why ${stop.name}?`, { manager, route }, { browser, saver });
  assert.equal(first.reply, `${stop.name} is stop 2.\n\n(I left out a figure or claim that Qloo's data doesn't support.)`);
  assert.deepEqual(first.agents, ["route"]);
  const second = await ask(plan, "Which stop is strongest?", { manager }, { browser, saver });
  assert.equal(second.reply, "Knoxville has the highest Fan Heat.");
  // A thanks is answered without any model: a scripted model with nothing to say would fail if asked.
  const thanks = await ask(plan, "Thanks, that's all for now.", { manager: new ScriptedModel([], "manager") }, { browser, saver });
  assert.match(thanks.reply, /You're welcome/);
  assert.deepEqual(thanks.agents, []);
  // What the page shows is the reply as it was checked.
  const { messages: history } = await managerHistory(plan, browser, { checkpointer: saver });
  assert.match(history[1].text, /left out a figure/);
  assert.doesNotMatch(history[1].text, /Nike/);
  assert.equal(manager.left + route.left, 0);
});

test("a reply that fails after something was saved says what was saved, rather than that nothing changed", async () => {
  const plan = await tour();
  const browser = testBrowser();
  const manager = new ScriptedModel([
    calls(["remember_no", { kind: "category", name: "alcohol" }]),
    () => {
      throw new Error("The model is down.");
    },
  ]);
  await assert.rejects(ask(plan, "Never alcohol.", { manager }, { browser }), (e: unknown) => {
    assert.ok(e instanceof TurnFailed);
    assert.deepEqual(e.made.map((c) => c.kind), ["memory"]);
    return true;
  });
  assert.deepEqual((await actMemory(browser, plan.act.id))?.avoid, ["alcohol"], "and it is saved");
});

test("a brand found for the tour in one message can be pitched in the next, and the draft is kept with the tour", async () => {
  const plan = await tour();
  const browser = testBrowser();
  const tourId = tourOf(plan);
  // As more_brands keeps what it finds.
  await keepProspects(browser, tourId, [{ id: "BBBBBBBB-0000-4000-8000-000000000042", name: "Found Later Co", fit: 71, tier: "niche", category: "drinks" }]);
  const manager = new ScriptedModel([calls(["ask_sponsor_scout", { task: "Pitch Found Later Co." }])]);
  const sponsors = new ScriptedModel([
    calls(["sponsor_list", {}]),
    (m) => {
      assert.match(results(m).join(), /foundEarlier[\s\S]*Found Later Co/, "the brand found earlier is listed to pitch");
      return calls(["save_draft", { to: "Found Later Co", language: "English", subject: "A tour partnership", body: "Hi Found Later Co partnerships team: these fans love your brand. Could we talk about the tour?" }]);
    },
    "Saved the pitch.",
  ]);
  const out = await ask(plan, "Pitch Found Later Co", { manager, sponsors }, { browser });
  assert.equal(out.cards[0]?.kind, "draft");
  const kept = await draftsFor(browser, tourId);
  assert.deepEqual(kept.map((d) => [d.draft.to, d.planId]), [["Found Later Co", plan.id]], "kept with the tour and the version it was written for");
  assert.equal((await prospectsFor(browser, tourId))[0].name, "Found Later Co");
});
