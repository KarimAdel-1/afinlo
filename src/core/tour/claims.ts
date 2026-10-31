// What Afinlo's words never claim, whoever writes them: no money, no audience, ticket or sales counts, and no brand,
// venue or promoter agreeing to anything. Qloo's data supports none of these, so a sentence stating one is either
// refused (a draft is rewritten), replaced (the pitch pack falls back to its template) or left out (a chat reply).
// Pattern-based: it catches the usual ways of saying them, in English and some Spanish and French, not every way. Pure.

/** Money: a currency sign, code or word with a number, or a percentage. */
export const MONEY = new RegExp(
  [
    String.raw`[$€£¥₹]\s?\d`,
    String.raw`\b\d[\d,.]*\s?(k|m|bn)?\s?(usd|eur|gbp|aed|sar|egp|qar|kwd|jpy|cad|aud|inr|mxn|brl|chf)\b`,
    String.raw`\b(usd|eur|gbp|aed|sar|egp|qar|kwd|jpy|cad|aud|inr|mxn|brl|chf)\s?\d`,
    String.raw`\b\d[\d,.]*\s?(k|m|bn|thousand|million|billion|mil|millones?)?\s?(dollars?|euros?|pounds?|dirhams?|riyals?|pesos?|reais|francs?|d[oó]lares)\b`,
    String.raw`\b\d+([.,]\d+)?\s?%`,
    String.raw`\b\d+([.,]\d+)?\s?(per ?cent|percent|por ciento|pour ?cent)\b`,
  ].join("|"),
  "i",
);

/** How many people: attendance, tickets, sales, followers, streams. */
export const COUNTS = new RegExp(
  [
    String.raw`\b\d[\d,.]*\s?(k|m|thousand|million|mil|millones?)?\s?(attendees|tickets?|ticket sales|fans|followers|listeners|monthly listeners|streams|views|subscribers|guests|spectators|asistentes|entradas|seguidores|billets|spectateurs)\b`,
    String.raw`\bsold[ -]out\b`,
    String.raw`\b\d[\d,.]*\s?(k|thousand)?\s?(people\s+)?(will\s+)?(attend|turn up|show up)\b`,
  ].join("|"),
  "i",
);

/** Someone having agreed: a brand, venue or promoter committed, signed, confirmed or guaranteeing something. */
export const COMMITMENT = new RegExp(
  [
    String.raw`\b(has|have|had)\s+(already\s+)?(agreed|committed|signed( on)?|pledged|promised|confirmed (that|their|its|a|the))\b`,
    String.raw`\b(is|are)\s+(already\s+)?(sponsoring|on board|committed|confirmed as)\b`,
    String.raw`(?<!(not|n't|no|never|cannot|can't)\s+)\bguarantee[sd]?\b`,
    String.raw`\b(ha|han)\s+(aceptado|confirmado|firmado)\b`,
    // Not \b at the end: é isn't a word character to a regex without the u flag.
    String.raw`\b(a|ont)\s+(accept|confirm|sign)[ée](?![a-z])`,
  ].join("|"),
  "i",
);

/** What kind of unsupported claim a text makes, in words, or nothing. */
export function unsupportedClaim(text: string): string | undefined {
  if (MONEY.test(text)) return "a money figure or percentage";
  if (COUNTS.test(text)) return "an audience, ticket or sales count";
  if (COMMITMENT.test(text)) return "a claim that someone has agreed or committed";
  return undefined;
}

/**
 * A reply with the sentences that make unsupported claims left out, and a short note saying so; unchanged when it has
 * none. Lines (a list's items) and sentences are judged one by one, so the rest of the reply stands.
 */
export function withoutUnsupportedClaims(text: string): { text: string; removed: number } {
  let removed = 0;
  const lines = text.split("\n").map((line) => {
    const sentences = line.match(/[^.!?]+[.!?]*(\s+|$)/g) ?? [line];
    const kept = sentences.filter((s) => {
      if (!unsupportedClaim(s)) return true;
      removed++;
      return false;
    });
    return kept.join("").trimEnd();
  });
  if (!removed) return { text, removed };
  const body = lines.filter((line, i) => line.trim() || (i > 0 && lines[i - 1].trim())).join("\n").trim();
  const note = "(I left out a figure or claim that Qloo's data doesn't support.)";
  return { text: body ? `${body}\n\n${note}` : note, removed };
}
