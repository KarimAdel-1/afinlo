# Devpost submission draft: Afinlo

Fill the bracketed parts before submitting. Don't add numbers that haven't been measured. Nothing can change after the deadline (30 Oct, 11:45 pm ET), so the description has to match what the live demo does.

**Tagline:** Find your real fans. Get paid to reach them.

**Try it:** [public URL] · no sign-up · open an example tour on Home (*Khruangbin* in Europe, *Bad Bunny* in Latin America, *Wegz* in the Middle East and North Africa), then plan a tour for an act you know.

**Code:** [public repository URL] · Apache 2.0

## The problem

Independent musicians and comedians pick tour cities by instinct and pitch the same famous brands as everyone else. A general chatbot can't fix that: it has no data on where a particular act's audience is, so it names the biggest cities and the best-known brands.

## What it does

Afinlo is an AI tour manager that knows your fans. Tell it which artist or comedian is touring and where, anywhere in the world.

1. **The brief.** Find the act in Qloo. Afinlo maps where its fans are across the world, from one Qloo heatmap, and ranks the regions and countries. Then pick a region or countries, how many shows, big cities or hidden markets first, where the tour starts, which sponsor categories to pitch and which never to.
2. **The tour,** as a workspace: the plan in five tabs beside a real map (Qloo's heatmap as a heat layer, the route, numbered stops).
   - **Plan:** the route stop by stop, each with its Fan Heat and how it's reached (a drive up to 650 km, a flight beyond). No two stops are within 150 km, as a promoter's radius clause would have it. The strong cities left off the route are shown too, with quick changes: shorter, longer, hidden markets first, skip a city.
   - **Book:** in each city, the music venues or comedy clubs these fans love, each with a drafted hold request and where it stands.
   - **Fund:** the brands these fans love, ranked by Sponsor Fit, each with its evidence and a drafted pitch, and a five-page PDF deck.
   - **Promote:** who the fans are (taste, age and gender skew), the podcasts, shows, books and films they love, openers whose fans overlap, and local partners in each city.
   - **Next up:** what to do now, in order: a venue for every stop, a pitch for the best sponsors, a follow-up when a pitch has had no answer for five days.
3. **It remembers.** Each act's choices and every no (a sponsor category, a brand, a city) carry into its next tour.

## Why it only works with Qloo

Every city, venue, brand and act in a tour comes from Qloo, with its Qloo ID, and every tour lists its Qloo requests under Receipts: 20–30 per tour, plus 6–8 for each stop opened. Afinlo uses Qloo's search; heatmaps of the world, a region or chosen countries; taste tags and demographics; and brand, artist and place insights filtered by location and compare. Plain code scores the answers, so the same Qloo answers always give the same plan. Without Qloo there is no tour: a failed request shows as failed, and nothing is invented.

[Backtest result, when measured: "Against public listener-city data for N acts, X% of each act's real top-5 cities were in Afinlo's top 10, versus Y% for the biggest cities." Method on the Does it work? page.]

## How we built it

- **Agent:** a LangGraph graph. It resolves the act, then reads its signal: its own Qloo heatmap or, when its data is thin, acts with overlapping audiences, labelled as such. Fan DNA, brands and support acts run in parallel, then scoring, local spots and brand heatmaps, then the writer. At most four Qloo requests are in flight, with a 24-hour server-side cache.
- **Scoring,** in plain TypeScript and unit-tested: Fan Heat per city from Qloo's heatmap cells, hidden markets, routing with drives and flights, and Sponsor Fit from Qloo affinity, category and brand size.
- **The world:** 2,737 cities of 90,000 people or more in 184 countries (Natural Earth), one per metro, grouped into 11 touring regions. Each area is asked of Qloo as one shape.
- **The map:** MapLibre GL with OpenFreeMap's vector tiles, served through our own server.
- **Writing:** [If a model is connected: a language model writes the pitch and the emails and turns a typed change ("swap Denver for somewhere near Seattle") into filters. Its drafts are checked, and one that names a city or brand outside the plan, or states a money figure, is replaced by a template. If no model is connected: the pitch, hold requests and follow-ups are drafted as templates from the plan's facts.]
- **Stack:** Next.js 16, TypeScript, PostgreSQL, LangGraph, MapLibre GL. [Hosted on Vercel.]

## What we built during the hackathon

[Confirm and complete; the rules ask a project that existed before 30 Sep to say how it was significantly updated. During the submission period (30 Sep – 30 Oct 2026) we built the tour agent: the brief, the tour workspace and its map, the scoring, the venue, sponsor and promotion tools, Next up, what it remembers about each act, and the website. If any part existed before 30 Sep, say what it was.]

## Business

- **Who pays:** booking agents and managers (pitch packs for a roster), mid-size promoters and venues (routing confidence and local sponsor leads). Artists and comedians get a free plan that feeds the funnel.
- **Model (hypothesis, to test):** a Pro subscription for managers, agency seats, and a take rate on sponsorship deals sourced through Afinlo.
- **Wedge:** comedians and independent musicians, who tour constantly, often sell podcast sponsorships already, and have few tools.
- **Moat (over time):** outcome data: which cities sold and which pitches converted.

## Challenges and what we learned

- Qloo's data varies by act. Some comedians have no location data, so we built the "acts like you" fallback and label it everywhere, instead of guessing.
- Heatmap cells aren't cities, and the strongest affinity can sit in tiny towns, so Afinlo scores real tour markets: one city per metro, and no two stops within 150 km.
- Affinity is a rank within the area asked about, so cities are only compared within one query: each tour's area is one heatmap.
- Qloo tags few venues in some cities (Berlin, Cairo), so Afinlo falls back to live-music and event venues there, and says so when there are none.

## Limits

Fan Heat is taste affinity, not ticket demand. A sponsor match means a brand's customers love the act, not that it will sponsor. Demographics are aggregate: Afinlo uses no personal data and sends nothing on anyone's behalf.

## What's next

Outcome tracking (which cities sold, which pitches converted), and a brand-side view where brands find the acts whose fans match theirs.

## Built with

Qloo Taste AI · LangGraph · Next.js · TypeScript · PostgreSQL · MapLibre GL · OpenFreeMap · Natural Earth [· OpenAI, if connected] [· Vercel]
