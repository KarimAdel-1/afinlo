// Messages that ask nothing, a thanks, a goodbye or a hello, and the questions Home's topic chips ask, answered without
// a model: a model call would only say the same, at the price of a whole prompt. A yes, an ok or a "go ahead" isn't one
// of them: it answers a question the assistant asked, so the model reads it. Pure.

const THANKS = /^(?:(?:thanks?(?: (?:a lot|so much))?|thank you(?: (?:so much|very much))?|thx|ty|cheers|much appreciated|that'?s (?:all|it)(?: for now)?|that is all|all good|nothing else|bye|goodbye|see you(?: later)?|have a good (?:one|day|night))[\s!.,]*)+$/i;
const HELLO = /^(?:(?:hi|hello|hey|hiya|good (?:morning|afternoon|evening))(?: there)?[\s!.,]*)+$/i;

/** What a message that asks nothing is: a thanks (or goodbye), a hello, or neither. */
export function courtesyOf(message: string): "thanks" | "hello" | undefined {
  const m = message.trim();
  return THANKS.test(m) ? "thanks" : HELLO.test(m) ? "hello" : undefined;
}

/** Home's topic chips: what each asks, and the answer. */
export const HOW_IT_WORKS = {
  route: {
    say: "How do you choose a tour's cities and their order?",
    answer: "I score the area's cities from Qloo's taste data: Fan Heat, how strongly the act's fans gather in a city, counts three parts to one part market size. The route takes the best scores that are far enough apart, always plays the act's hottest market, and runs in the order that makes the shortest trip. Tell me the act and where, and I'll plan it.",
  },
  venues: {
    say: "How do you find venues for a tour?",
    answer: "For each stop, I ask Qloo which venues these fans love near that city, and keep track of where each one stands for the tour. The tour's team can draft a hold request asking a venue for open dates and its terms, for you to edit and send.",
  },
  sponsors: {
    say: "How do you find sponsors, and what do you send them?",
    answer: "I ask Qloo which brands the act's fans love and rank them by Sponsor Fit: how well a brand's customers overlap with the fans. That's overlap, not a sign a brand will say yes. The tour's team drafts a pitch in any language, built on where the brand's own audience is strongest along the route, for you to edit and send.",
  },
  fans: {
    say: "What can you tell me about an act's fans?",
    answer: "From Qloo's taste data: where they gather around the world, their taste, how they skew by age and gender, what else they love, and which acts share their audience. Name an act and I'll show you where its fans are.",
  },
  promotion: {
    say: "How do you help promote the shows?",
    answer: "The tour's promoter writes short posts for each stop, in the city's language unless you ask for another, naming places local fans love. They're drafts for you to edit and post. It also suggests openers whose audiences overlap with the act's.",
  },
};

/** The answer to a question a topic chip asks, if that's what this is. */
export const howItWorks = (message: string) => Object.values(HOW_IT_WORKS).find((t) => t.say === message.trim())?.answer;
