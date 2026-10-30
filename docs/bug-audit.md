# Bug audit

A review of the whole codebase (at commit `c926ff4`) for bugs and features that don't fully work. Every item below was
checked against the code, and where possible reproduced, before it went on the list. Each one has its fix and the
test that now covers it. Line numbers in "Where" are from `c926ff4`, before the fixes.

**Before:** `npm run typecheck` and `npm run lint` clean, `npm test` 50 of 50 passing.
**After:** typecheck, lint and `npm run build` clean, `npm test` 57 of 57 passing. Each new test was run against the old
code to check that it fails there.

| # | Problem | Severity | Status |
|---|---|---|---|
| 1 | Applying a change can move you onto another tour, losing your venue and sponsor statuses and the team conversation | High | Fixed |
| 2 | "Not for us" and "Forget them" silently fail for acts Qloo doesn't know | Medium | Fixed |
| 3 | "New tour" from the Acts page loses an act Qloo doesn't know | Medium | Fixed |
| 4 | Ticking more than 8 "Never pitch" categories breaks plan creation | Medium | Fixed |
| 5 | A long memory of skipped cities or turned-down brands eventually blocks new tours for that act | Medium | Fixed |
| 6 | The tour team's "4 specialist answers per message" limit isn't enforced | Medium | Fixed |
| 7 | A typed change can't add a city or bring a skipped one back | Medium | Fixed, then removed |
| 8 | Next up and Home keep asking you to pitch brands you turned down | Low | Fixed |
| 9 | The remembered home city is never restored in the brief | Low | Fixed |
| 10 | Behind a proxy, anyone can dodge the per-visitor limits with a fake `X-Forwarded-For` | Medium | Fixed |
| 11 | Expired Qloo cache rows are never deleted | Low | Fixed |
| 12 | The tour team's cards are never cleared when old turns are summarized | Low | Fixed |
| 13 | A database problem shows up as "Qloo did not respond successfully", with the real cause logged nowhere | Medium | Fixed |
| 14 | Zoomed in on a stop, the fan map breaks into dots that look like hot spots | Low | Fixed |
| 15 | The live map scrolls sideways forever, and a world tour's flight across the Pacific leaves one edge and comes back at the other | Low | Fixed |

---

## 1. Applying a change can move you onto another tour

**Where:** [plan/route.ts:53-57](../src/app/api/tour/plan/route.ts), `recentPlanFor` in
[store.ts:62-67](../src/platform/tour/store.ts)

**What happened:** a change to a tour (Longer, Skip this city, a team proposal) is sent as a new request with
`parentId`. Before planning, the route looks for any plan made in the last 24 hours with the same request and reuses
it. That lookup ignored which tour the plan belongs to. If someone else (or you, in another tour) had made the same
request from scratch, you were sent to *their* plan. Its tour ID is different, so:

- every venue and sponsor status you'd set disappeared (they're stored under the tour ID),
- the tour team conversation started over (the thread is keyed by the tour ID),
- the Plan tab's promise "Where each venue and sponsor stands carries over" was broken.

**Example:** visitor A plans Morgan Wallen, 9 shows, with the default choices. Visitor B opens the 7-show Morgan
Wallen example, marks two venues as on hold, and clicks "Longer: 9 stops". B's request now matches A's, so B lands
on A's plan, and the two holds are gone.

**Fix:** a new `reusablePlan(request, parent)` in [store.ts](../src/platform/tour/store.ts), used by the plan route.
When the plan it finds belongs to a different tour than the parent, it saves a copy under the parent's tour (new ID,
`parentId`, `rootId`, never an example). This is as fast as before and costs no Qloo or OpenAI calls.

**Test:** "a change stays on its tour…" in [store.test.ts](../src/platform/tour/store.test.ts).

## 2. "Not for us" and "Forget them" silently fail for acts Qloo doesn't know

**Where:** [acts/[actId]/memory/route.ts:33](../src/app/api/tour/acts/[actId]/memory/route.ts)

**What happened:** the memory endpoint looked the act up in Qloo by its ID before saving. An act Qloo doesn't know
has a made-up ID ([named.ts](../src/core/tour/named.ts)), so Qloo found nothing and the endpoint answered 404. The
page swallows that error ([TourView.tsx](../src/components/tour/workspace/TourView.tsx)), so:

- In Fund, "Not for us" hid the brand, but nothing was saved. It came back on reload and in the act's next tour.
- In the brief, "Forget them" did nothing.

It also sent the made-up ID to Qloo, which [agent.test.ts](../src/platform/tour/agent.test.ts) says must never
happen.

**Fix:** `actToRemember` in the new [acts.ts](../src/platform/tour/acts.ts) uses the act this browser already
remembers. Failing that, it uses the act from the plan the request came from: the Fund tab now sends `planId`. It
asks Qloo only as a last resort.

**Test:** "the act a no is kept for…" in [acts.test.ts](../src/platform/tour/acts.test.ts), which checks that Qloo is
never asked. Also checked end to end against a running build: the call that used to return 404 now returns 200 and
saves the memory.

## 3. "New tour" from the Acts page loses an act Qloo doesn't know

**Where:** [plan/page.tsx:20](../src/app/(dashboard)/plan/page.tsx)

**What happened:** the Acts page links to `/plan?act=<id>`. The plan page resolved that ID with Qloo, which fails for
a made-up ID. The brief then opened on an empty "Who's going on tour?" search, and the act was lost. It also sent the
made-up ID to Qloo.

**Fix:** `briefStart` in [acts.ts](../src/platform/tour/acts.ts). For an act this browser remembers as one Qloo
doesn't know, it takes the acts it was named as like from its latest tour in Saved, looks up those real IDs in Qloo,
and the brief opens on "Where to?" with both (a new `initialLike` prop on `Brief`). With no such tour, the search
starts with the act's name. Acts Qloo knows work as before.

**Test:** "a new brief for an act Qloo doesn't know…" in [acts.test.ts](../src/platform/tour/acts.test.ts). The
by-name fallback was also checked against a running build.

## 4. Ticking more than 8 "Never pitch" categories breaks plan creation

**Where:** [types.ts:433](../src/core/tour/types.ts) (`avoid: z.array(sponsorCategory).max(8)`) against the 14
buttons in [Brief.tsx](../src/components/tour/Brief.tsx)

**What happened:** the brief let you tick any number of the 14 categories, but the plan request only accepted 8. Tick
9 and "Plan the tour" failed with `Too big: expected array to have <=8 items` (reproduced). Because "Never pitch" is
remembered, every later brief for that act started broken too.

**Fix:** `planInput` accepts up to the number of categories (14).

**Test:** the last assertion of "an act's memory keeps as many no's as a plan can carry…" in
[tracker.test.ts](../src/platform/tour/tracker.test.ts).

## 5. A long memory of skipped cities or turned-down brands eventually blocks new tours

**Where:** `rememberAct` in [tracker.ts:58-75](../src/platform/tour/tracker.ts); the brief sent the whole lists from
[Brief.tsx:183-184](../src/components/tour/Brief.tsx); the limits are in [types.ts:434-436](../src/core/tour/types.ts)

**What happened:** every "no" (Skip this city, Not for us, `remember_no`, each plan's own skips) was added to the act's
memory forever, but a plan request accepts at most 20 skipped cities and 40 turned-down brands. Once the memory passed
either limit, every new tour for that act failed with `Too big: expected array to have <=20 items` (reproduced). Skips
from tours of other parts of the world counted towards the limit too.

**Fix:** the limits are now named constants (`MAX_SKIPPED_CITIES`, `MAX_TURNED_DOWN_BRANDS` in
[types.ts](../src/core/tour/types.ts)). `rememberAct` keeps at most that many of each, the newest, and the brief
trims memories that were saved over the limit before this fix.

**Test:** "an act's memory keeps as many no's as a plan can carry…" in
[tracker.test.ts](../src/platform/tour/tracker.test.ts).

## 6. The tour team's "4 specialist answers per message" limit isn't enforced

**Where:** `manage` and `dispatch` in [graph.ts:104-118](../src/platform/manager/graph.ts)

**What happened:** `LIMITS.asks` (4) was only checked before the manager's *next* call. A single round could hand out
any number of tasks in parallel, and a second round could add up to 3 more. Each specialist can make up to 4 model
calls, so one message could run far more model calls than the limits say, at real cost.

**Fix:** `dispatch` sends only as many specialist tasks as the message has left. Each handoff over the limit goes to
a new `unasked` node, which answers it, so the conversation stays well formed. The answer tells the manager to reply
from what it has, and is marked `status: "error"` so it isn't counted among the specialists who answered
([chat.ts](../src/platform/manager/chat.ts)).

**Test:** "one round can't hand out more than the message's tasks…" in
[manager.test.ts](../src/platform/manager/manager.test.ts).

## 7. A typed change can't add a city or bring a skipped one back

**Where:** `planRefinement` in [writer.ts:160-215](../src/platform/tour/writer.ts)

**What happened:** the refine schema had no way to add a city, and skipped cities were always merged with the old
ones. So "put Denver back" was silently ignored, and so was the input's own placeholder example, "swap Denver for
somewhere near Seattle" ([PlanTab.tsx](../src/components/tour/workspace/PlanTab.tsx)). Only the Denver half of the
swap could happen, even though plans already support cities asked for by name (`includeCityIds`).

**Fix:** the planner's schema and prompt gain `includeCities`, and the prompt now shows the cities already asked for.
Mapping the answer to the next request is now a pure, exported `refinedRequest`. A city to add can be any city in the
area; it joins `includeCityIds` and leaves `excludeCityIds`. A city skipped stops being asked for. Every other earlier
"no" is kept, as before.

**Test:** "a typed change can skip a city, add one, or bring a skipped one back…" in
[agent.test.ts](../src/platform/tour/agent.test.ts).

**Later:** the whole "Change the plan" box was removed from the Plan tab, typed change and quick buttons alike, along
with its `/refine` endpoint, `planRefinement`, `refinedRequest` and that test. Changes to a tour are now asked of the
tour team, whose route planner proposes them (`propose_change`) for the user to apply.

## 8. Next up and Home keep asking you to pitch brands you turned down

**Where:** `nextUp` in [next.ts:57](../src/core/tour/next.ts), called from
[TourView.tsx:89](../src/components/tour/workspace/TourView.tsx) and
[home/page.tsx:33-37](../src/app/(dashboard)/home/page.tsx)

**What happened:** after "Not for us", the Fund tab hid the brand, but Next up still listed "Send the pitch to
&lt;brand&gt;", Home listed it too, and "pitches out" still counted it among the six to pitch. Clicking the task opened
a pitch to a brand you'd rejected.

**Fix:** `nextUp(plan, tracks, { now, turnedDown })` skips the act's turned-down brands, and the six to pitch first
come from the rest. The tour page passes what's been turned down, and Home passes each act's memory.

**Test:** the `turnedDown` case in "Next up…" in [world.test.ts](../src/core/tour/world.test.ts).

## 9. The remembered home city is never restored in the brief

**Where:** [Brief.tsx:113-121](../src/components/tour/Brief.tsx)

**What happened:** each new plan saves its home city in the act's memory. The brief restored the area, shows, focus
and categories from memory, but not the home city, so it was saved and never used.

**Fix:** the brief restores it. It's only used while it's in the chosen area, which the brief already checked.

**Test:** none (a one-line UI state change; the build checks its types).

## 10. Behind a proxy, anyone can dodge the per-visitor limits with a fake `X-Forwarded-For`

**Where:** `visitorOf` in [http.ts:42](../src/platform/tour/http.ts)

**What happened:** with `TRUST_PROXY=1`, the visitor was the *first* address in `X-Forwarded-For`. A typical proxy
(nginx's `$proxy_add_x_forwarded_for`, most load balancers) *appends* the real address to whatever the client sent.
That made the first entry the client's own words, so a random value per request got around the hourly limits on plans
and chat.

**Fix:** use the last address, the one the trusted proxy added. On Vercel the header holds a single address, so
nothing changes there.

**Test:** none (`visitorOf` needs a Next.js request context for its cookie).

## 11. Expired Qloo cache rows are never deleted

**Where:** `qlooCache` in [store.ts:15-26](../src/platform/tour/store.ts)

**What happened:** expired rows were only skipped on read and overwritten when the same request was made again.
Nothing deleted them, so `qloo_cache` grew with every distinct request, heatmaps included (each plan makes about 30).
On a public demo with a small Postgres (Neon's free tier is 0.5 GB), that eventually fills the database.

**Fix:** while writing to the cache, expired rows are deleted, at most once an hour per server. If the delete fails,
it's logged and the Qloo answer is unaffected.

**Test:** "expired Qloo answers are deleted, and fresh ones kept" in
[store.test.ts](../src/platform/tour/store.test.ts).

## 12. The tour team's cards are never cleared when old turns are summarized

**Where:** the `cards` channel in [graph.ts:38](../src/platform/manager/graph.ts) and `fold` in
[graph.ts:86-102](../src/platform/manager/graph.ts)

**What happened:** once a conversation passes 10 turns, older messages are summarized and removed, but the cards made
in those turns (drafts of up to 4,000 characters, change requests) stayed in the checkpoint forever. Nothing could
show them any more, since `historyOf` only shows cards for turns it still has. Every turn that made a card wrote the
whole growing list again.

**Fix:** the `cards` reducer also accepts `{ keep: turnIds }`, and `fold` sends it, with the turns it keeps, whenever
it summarizes.

**Test:** the card assertions in "the conversation is remembered across messages, and older turns fold…" in
[manager.test.ts](../src/platform/manager/manager.test.ts).

## 13. A database problem shows up as "Qloo did not respond successfully"

**Where:** `QlooClient.request` in [taste/qloo.ts](../src/platform/taste/qloo.ts)

**What happened:** found later, while setting the app up with a placeholder `DATABASE_URL`. Every Qloo request reads
and writes the Qloo cache, which lives in Postgres. When the database failed, that error was caught with Qloo's own
errors and reported as "Qloo did not respond successfully. Please retry." The real cause was logged nowhere. So a
search failed with a Qloo error even though Qloo was answering (checked: a 200 with results).

**Fix:** a failed cache read is treated as a miss and a failed write is skipped. Both are logged, and neither fails
the request. Any other unexpected failure now logs its real cause in the server's terminal. Visitors still see the
plain message.

**Test:** [taste/qloo.test.ts](../src/platform/taste/qloo.test.ts).

## 14. Zoomed in on a stop, the fan map breaks into dots

**Where:** `heatRadius` and `heatPaint` in [heat.ts](../src/core/tour/heat.ts), drawn by
[TourMap.tsx](../src/components/tour/TourMap.tsx)

**What happened:** the live map blurs each of Qloo's cells into a soft spot sized to the grid, but MapLibre caps the
blur at 128 px. Zoomed out, neighbouring spots merge into one field. Zoomed in, the cells grow to hundreds of pixels
while the blur stays at 128, so they stand apart as dots. The Book and Promote tabs zoom to a stop (zoom 10.5), so
region and world tours, whose cells are 20 × 40 km and 150 km across, always showed it. The code knew the blurs would
"stand alone" there. The result is misleading, though: each dot looks like a hot spot when it's a whole area.

**Fix:** a new `heatApart(grid)` gives the zoom where the blur stops spanning the grid. Over the next zoom level, the
map fades the blur out and fades in the cells as the boxes they are (`heatBoxes`, `boxPaint`). Each box is coloured
on the scale both maps share and is lighter than the blur, so streets and venues stay readable. Zoomed out, nothing
changes.

**Test:** "zoomed in past where the blur can span the grid…" in [heat.test.ts](../src/core/tour/heat.test.ts). It
uses the test file's model of MapLibre's heat kernel to show the dots past that zoom and the even field before it,
then checks the cross-fade and the boxes. Also checked by eye on the Khruangbin example's Istanbul stop.

## 15. The live map scrolls sideways forever, and Pacific flights wrap around its edges

**Where:** the map's options in [TourMap.tsx](../src/components/tour/TourMap.tsx); flights drawn with `arc` there and
in [MapLoop.tsx](../src/components/tour/MapLoop.tsx) and [StaticMap.tsx](../src/components/tour/StaticMap.tsx)

**What happened:** found by using the app. The live map drew copies of the world on both sides, so it could be dragged
sideways forever, showing Australia again and again. A world tour's flight from Los Angeles to Australia was drawn as
its great circle, west across the Pacific. On a map framed on the Atlantic, that flight left at one edge and came back
in at the other.

**Fix:**
- The live map shows one world with edges (`renderWorldCopies: false`), and MapLibre then stops it panning past them.
  An explicit `maxBounds` of ±180° isn't used: MapLibre 6 wraps 180° to −180°, reads the world as zero wide, and fails
  to start.
- The new `flightPath` in [geo.ts](../src/core/tour/geo.ts) draws a flight as its great circle unless that would cross
  an edge. Such a flight is drawn as a curve across the map from one stop to the other, bowed upward like the rest.
  All three maps use it. Only the drawing changes: a leg's distance is still the great circle's.
- When the map couldn't start, it said it needed WebGL whatever the cause. It now logs the real error in the
  browser's console.

**Test:** the edge cases in "the map draws the stronger half of Qloo's cells; flights follow the globe" in
[world.test.ts](../src/core/tour/world.test.ts). Also checked by eye on a 12-stop world tour: the Los Angeles to
Australia flight is drawn across the map, and dragging the map stops at its edges.

---

## Noted, not changed

These are real but small, or a change of behaviour that's yours to decide, so they're left as they are.

- **The same specialist asked twice in one round** (`ask` in [graph.ts](../src/platform/manager/graph.ts)): each
  answer's "[Shown to the user…]" note lists both tasks' cards, because cards are matched by specialist. The cards
  the user sees are still right.
- **One tool budget across parallel specialists** ([tools.ts](../src/platform/manager/tools.ts)): when two run at
  once, one can use up the other's lookups. This is by design: the budget is per message.
- **Prompt caching** ([team.ts](../src/platform/manager/team.ts)): each specialist's system prompt starts with the
  tour's own line, so the part shared across tours is short. Putting the fixed role text first would let more of it be
  cached. Not measured, and it changes the prompts, so it's left for an `npm run eval` run.
- **A turn that's cut short** leaves the user's message in the history with no reply after it. Arguably right: it
  shows what was asked.
- **`remember_no` from the team** doesn't hide the brand in Fund until the page is reloaded (the card has no brand
  ID).
- **Sponsor statuses for brands found with `more_brands`** are saved but shown nowhere except the chat card, since
  Fund lists only the plan's own sponsors.

## Files changed

- **New:** [acts.ts](../src/platform/tour/acts.ts), [acts.test.ts](../src/platform/tour/acts.test.ts),
  [store.test.ts](../src/platform/tour/store.test.ts), this file.
- **Changed:**
  - core: [types.ts](../src/core/tour/types.ts), [next.ts](../src/core/tour/next.ts)
  - platform: [tracker.ts](../src/platform/tour/tracker.ts), [store.ts](../src/platform/tour/store.ts),
    [writer.ts](../src/platform/tour/writer.ts), [http.ts](../src/platform/tour/http.ts),
    [graph.ts](../src/platform/manager/graph.ts), [chat.ts](../src/platform/manager/chat.ts)
  - routes and pages: [plan/route.ts](../src/app/api/tour/plan/route.ts),
    [memory/route.ts](../src/app/api/tour/acts/[actId]/memory/route.ts),
    [plan/page.tsx](../src/app/(dashboard)/plan/page.tsx), [home/page.tsx](../src/app/(dashboard)/home/page.tsx)
  - components: [Brief.tsx](../src/components/tour/Brief.tsx),
    [TourView.tsx](../src/components/tour/workspace/TourView.tsx)
  - tests: [world.test.ts](../src/core/tour/world.test.ts), [tracker.test.ts](../src/platform/tour/tracker.test.ts),
    [agent.test.ts](../src/platform/tour/agent.test.ts), [manager.test.ts](../src/platform/manager/manager.test.ts)
