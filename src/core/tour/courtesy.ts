// Messages that ask nothing, a thanks, a goodbye or a hello, answered without a model: a model call would only say the
// same, at the price of a whole prompt. A yes, an ok or a "go ahead" isn't one of them: it answers a question the
// assistant asked, so the model reads it. Pure.

const THANKS = /^(?:(?:thanks?(?: (?:a lot|so much))?|thank you(?: (?:so much|very much))?|thx|ty|cheers|much appreciated|that'?s (?:all|it)(?: for now)?|that is all|all good|nothing else|bye|goodbye|see you(?: later)?|have a good (?:one|day|night))[\s!.,]*)+$/i;
const HELLO = /^(?:(?:hi|hello|hey|hiya|good (?:morning|afternoon|evening))(?: there)?[\s!.,]*)+$/i;

/** What a message that asks nothing is: a thanks (or goodbye), a hello, or neither. */
export function courtesyOf(message: string): "thanks" | "hello" | undefined {
  const m = message.trim();
  return THANKS.test(m) ? "thanks" : HELLO.test(m) ? "hello" : undefined;
}
