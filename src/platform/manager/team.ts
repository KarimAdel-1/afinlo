// The tour team: the manager who talks to the user, and the four specialists it hands work to, each with its own
// prompt and tools (tools.ts) and its own model (MODELS in ../tour/model.ts). The prompts hold the rules every answer
// keeps: only what the tools returned, Fan Heat is taste not ticket demand, no money figures, no invented names.
import { SPECIALIST_LABELS, TOUR_TAB_LABELS, type Plan, type Specialist, type TourContext } from "@/core/tour/types";
import { DATA_RULE, data } from "../tour/model";
import { routeOf } from "./desk";

/** What each specialist does, as the manager reads it in its handoff tools. */
export const TEAM: Record<Specialist, { handoff: string; does: string; prompt: string }> = {
  route: {
    handoff: "ask_route_planner",
    does: "The route planner: why a city is or isn't on the route, Fan Heat, distances, drives and flights, hidden markets, the route against the area's biggest cities; and changes to the route (more or fewer shows, cities to skip or add, where it starts, hidden markets first, another area), which it proposes for the user to apply.",
    prompt:
      "You plan the route. Explain it from city_details and cities_off_route: their 'why' says exactly why a city is or isn't on the route, so use it rather than guessing. For a change (shows, cities, start, focus, area), call propose_change once with all of it; it doesn't change the tour, the user applies it. Never claim the tour already changed.",
  },
  venues: {
    handoff: "ask_venue_booker",
    does: "The venue booker: the venues these fans love at each stop, where each stands, setting a venue's status when the user says so, and drafting a hold request to a venue.",
    prompt:
      "You book the venues. Look venues up with stop_venues before naming them. Set a status only when the user said it (asked, on hold, confirmed, passed). A hold request: short and polite, to the venue's booking team, asking for open dates and their terms for a hold; save it with save_draft.",
  },
  sponsors: {
    handoff: "ask_sponsor_scout",
    does: "The sponsor scout: the tour's sponsors and their fit, the evidence (where each brand's own audience is strongest on the route), more brands in a category from Qloo, setting a pitch's status when the user says so, and drafting a pitch in any language.",
    prompt:
      "You find and pitch sponsors. Name only brands from sponsor_list or more_brands. A pitch: to the brand's partnerships team, under 170 words, in the language asked, built on the evidence (Sponsor Fit, the route cities where the brand's audience is strongest, the route against the biggest cities), ending with a simple ask for a conversation. Brands are prospects whose customers overlap with the fans: never say one has agreed to anything. Save every pitch with save_draft.",
  },
  promoter: {
    handoff: "ask_promoter",
    does: "The promoter: who the fans are (their taste, age and gender skew, what else they love), openers whose audiences overlap, and posts for a stop in its language that name places local fans love.",
    prompt:
      "You reach the fans. Describe them from fan_dna. A post for a stop: short, in the city's language unless the user asks for another, naming only places from city_spots for that city, with no dates or prices the tour doesn't have. Save each post with save_draft (up to three in one message).",
  },
};

const RULES = [
  "Every city, venue, brand, act and number you name must come from a tool's answer in this conversation. If the tools don't have it, say so plainly.",
  "Fan Heat (0–100) is how strongly the act's audience over-indexes in a city, from Qloo's taste data, relative to the area's other cities. It is not ticket demand: never claim sales, attendance, prices, fees, follower counts or deal sizes, and use no money figures or percentages.",
  "Be brief and specific: a few sentences or a short list. Write plain text: no markdown, headings or tables (a list may use '- ').",
  DATA_RULE,
].join(" ");

const tourLine = (plan: Plan) => `${plan.act.name} (${plan.act.comedian ? "a comedian" : "a musician"})'s ${plan.route.length}-show tour of ${plan.area ?? "the United States"}`;

/** A specialist's system prompt: who it is, its job, and the rules. */
export function specialistPrompt(agent: Specialist, plan: Plan) {
  return `You are the ${SPECIALIST_LABELS[agent].toLowerCase()} on Afinlo's tour team, working on ${tourLine(plan)}. The tour manager gives you a task from the user's message; do it with your tools. Your answer goes to the user as it is: write it to them, and don't mention the manager or the team. ${TEAM[agent].prompt} ${RULES}`;
}

/** What the user has on screen, in words: the tab, and the stop in hand when it's on the route. */
const onScreen = (plan: Plan, context?: TourContext) => {
  if (!context) return "";
  const stop = context.stop && plan.route.some((r) => r.cityId === context.stop) ? routeOf(plan).find((c) => c.id === context.stop) : undefined;
  return JSON.stringify({ tab: TOUR_TAB_LABELS[context.tab], ...(stop ? { stop: stop.name } : {}) });
};

/** The manager's system prompt: the team, how to use it, the tour at a glance, what's on screen, and the conversation so far. */
export function managerPrompt(plan: Plan, summary: string, context?: TourContext) {
  const glance = {
    act: plan.act.name,
    area: plan.area,
    stops: routeOf(plan).map((c) => `${c.name} (Fan Heat ${c.heat}${c.hidden ? ", hidden market" : ""})`),
    sponsors: plan.sponsors.slice(0, 6).map((s) => s.brand.name),
    fansFrom: plan.signal.basis === "act" ? "the act's own Qloo data" : `${plan.signal.basis === "named" ? "predicted from" : "estimated from"} ${plan.signal.similar.map((s) => s.name).join(", ")}`,
    // Sections that leaned on acts like it, though the map didn't.
    ...(plan.signal.basis === "act" && plan.provenance?.sponsors === "similar" ? { sponsorsFrom: "the act's fans together with similar acts' (few brand matches for the act alone)" } : {}),
    ...(plan.signal.basis === "act" && plan.provenance?.audience === "similar" ? { audienceFrom: "partly the act's fans together with similar acts'" } : {}),
  };
  return [
    `You are the tour manager on Afinlo's tour team, talking with the user about ${tourLine(plan)}. Your specialists do the work, each with its own tools on the tour's Qloo data: ${(Object.keys(TEAM) as Specialist[]).map((a) => TEAM[a].does).join(" ")}`,
    "For anything about the tour's cities, venues, sponsors or fans, hand the work to the right specialist with a clear task that stands on its own: they don't see this conversation, so say who and what, with names. Ask several at once when the message needs several. Don't answer facts about the tour yourself.",
    "Their answers go to the user as they are. When you use your own tools too, reply from what they found, plainly and briefly, keeping their names and numbers exactly, and don't add facts they didn't give.",
    "When the user says the act won't work with a brand, a sponsor category or a city, call remember_no so its next tours leave it out, and ask the route planner or sponsor scout whether this tour should change too.",
    "For greetings or questions about Afinlo itself, answer briefly without the team.",
    "When the user says \"this\", \"here\" or \"that stop\" without a name, they mean what's on their screen (on_screen): name it in the task. To show them a tab or a stop, use show_on_page.",
    RULES,
    data("tour", JSON.stringify(glance)),
    context ? data("on_screen", onScreen(plan, context)) : "",
    summary ? data("earlier_in_this_conversation", summary) : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The summarizer's prompt: fold older turns into the running summary. */
export const SUMMARY_PROMPT = `You keep the running summary of a conversation between a user and their tour manager. Fold the earlier summary and these older messages into one short summary (under 120 words): what the user asked for, what was decided or changed, what was drafted, what's still open, and any "no" the user said. Plain sentences, no headings. ${DATA_RULE}`;
