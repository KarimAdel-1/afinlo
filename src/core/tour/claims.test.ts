// What Afinlo's words never claim (claims.ts): money, audience or sales counts, and anyone having agreed, in the ways
// they're usually written, and none of the figures Afinlo does state (Fan Heat, stops, distances, ranks). Pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { unsupportedClaim, withoutUnsupportedClaims } from "./claims";

test("unsupported claims are caught however they're written", () => {
  const claims: [string, RegExp][] = [
    ["Nike has agreed to sponsor our Tokyo show for 50000 USD, with 9000 attendees guaranteed.", /money/],
    ["A package of 50000 USD.", /money/],
    ["USD 50k for the run.", /money/],
    ["A €20,000 activation.", /money/],
    ["Worth 2 million dollars.", /money/],
    ["They spend 30% more on vinyl.", /money/],
    ["Un patrocinio de 5000 dólares.", /money/],
    ["Expect 9000 attendees a night.", /count/],
    ["It has 1.2m monthly listeners.", /count/],
    ["Every show sold out last year.", /count/],
    ["About 4,000 people will attend.", /count/],
    ["Esperamos 3000 asistentes.", /count/],
    ["Nike has agreed to sponsor the tour.", /agreed/],
    ["Red Bull is already on board.", /agreed/],
    ["The venue has confirmed the date.", /agreed/],
    ["A full house, guaranteed.", /agreed/],
    ["Spotify ha confirmado su apoyo.", /agreed/],
    ["La marque a accepté le partenariat.", /agreed/],
  ];
  for (const [text, kind] of claims) assert.match(unsupportedClaim(text) ?? "none", kind, text);
});

test("the figures Afinlo does state aren't claims", () => {
  for (const text of [
    "Nashville has Fan Heat 92, a hidden market.",
    "A 12-stop tour, 2,205 km in all.",
    "Ranked #3 among the brands this audience loves.",
    "The fans skew 25–34 against Qloo's average audience.",
    "Fan Heat isn't guaranteed ticket demand.",
    "Would you be open to a conversation about a partnership?",
    "Una gira de 7 ciudades por España.",
  ])
    assert.equal(unsupportedClaim(text), undefined, text);
});

test("a reply keeps everything but the sentences that claim too much, and says so", () => {
  const reply = "Austin is the strongest stop. Nike has agreed to sponsor it! Fan Heat there is 94.\n- Denver: 9000 attendees\n- Boise: a hidden market";
  const out = withoutUnsupportedClaims(reply);
  assert.equal(out.removed, 2);
  assert.match(out.text, /^Austin is the strongest stop\. Fan Heat there is 94\./);
  assert.doesNotMatch(out.text, /Nike|9000/);
  assert.match(out.text, /Boise: a hidden market/);
  assert.match(out.text, /left out a figure or claim/);
  assert.deepEqual(withoutUnsupportedClaims("Nothing to remove here."), { text: "Nothing to remove here.", removed: 0 });
  // What's left keeps every word: a mark inside "U.S." or "4.5" doesn't end a sentence.
  const kept = withoutUnsupportedClaims("The 4-show U.S. tour has a Fan Heat of 4.5 at St. Louis. Tickets cost $40. Open it below.");
  assert.equal(kept.text, "The 4-show U.S. tour has a Fan Heat of 4.5 at St. Louis. Open it below.\n\n(I left out a figure or claim that Qloo's data doesn't support.)");
});
