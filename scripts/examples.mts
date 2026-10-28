// Builds the one-click examples: a real tour for each act below, in the part of the world its fans are
// strongest, saved and marked as an example, so a judge sees full results instantly. With a language model
// configured, each pitch is written by the AI writer; without one, it uses the plain template (run this again once
// the key is in). Brand matches and co-headliner pairings are rebuilt with --matches.
//   npm run examples
//   npm run examples -- --matches
//   npm run examples -- "Phoebe Bridgers=uk-ireland" "John Mulaney"   (other acts; a region after =)

process.loadEnvFile(".env.local");
const { planTour } = await import("../src/platform/tour/agent");
const { brandRequestKey, runBrandMatch } = await import("../src/platform/tour/brands");
const { pairRequestKey, runPairing } = await import("../src/platform/tour/pairs");
const { qlooClient, searchActs, searchBrands } = await import("../src/platform/tour/qloo");
const { saveMatch, savePlan } = await import("../src/platform/tour/store");
const { regionId } = await import("../src/core/tour/regions");
const { closeDb } = await import("../src/lib/db");

/** Chosen for range: a country star with hidden markets, a touring comedian, an indie band big in Europe, a Latin
 *  superstar, an Australian band, and an Egyptian rapper. Each region is where Qloo's world map puts its fans. */
const DEFAULT: [string, string][] = [
  ["Morgan Wallen", "north-america"],
  ["Taylor Tomlinson", "north-america"],
  ["Khruangbin", "europe"],
  ["Bad Bunny", "latin-america"],
  ["Glass Beams", "oceania"],
  ["Wegz", "mena"],
];
const BRANDS = ["Liquid Death", "Patagonia"];
const PAIRS: [string, string][] = [
  ["Khruangbin", "Glass Beams"],
  ["Taylor Tomlinson", "Nikki Glaser"],
];
const args = process.argv.slice(2);
const matches = args.includes("--matches");
const custom = args.filter((a) => !a.startsWith("--")).map((a) => a.split("=") as [string, string?]);
const acts = custom.length ? custom : matches ? [] : DEFAULT;
const client = qlooClient();

const findAct = async (name: string) => {
  const found = await searchActs(client, name, []);
  return found.find((a) => a.name.toLowerCase() === name.toLowerCase()) ?? found[0];
};

for (const [name, region = "north-america"] of acts) {
  const act = await findAct(name);
  if (!act) {
    console.warn(`${name}: not found in Qloo, skipped.`);
    continue;
  }
  const started = Date.now();
  const plan = await planTour({ actId: act.id, where: { kind: "region", region: regionId.parse(region) }, stops: 7 }, { client });
  plan.example = true;
  await savePlan(plan);
  const route = plan.route.map((r) => plan.cities.find((c) => c.id === r.cityId)!.name).join(" → ");
  console.log(
    `${act.name} (${plan.area}): /tour/${plan.id} (${((Date.now() - started) / 1000).toFixed(1)}s, ${plan.traces.length} Qloo calls, writer: ${plan.pitch.writer})\n  ${route}\n  sponsors: ${plan.sponsors.slice(0, 4).map((s) => s.brand.name).join(", ")}${plan.notes.length ? `\n  notes: ${plan.notes.join(" ")}` : ""}`,
  );
}

if (matches) {
  for (const name of BRANDS) {
    const brand = (await searchBrands(client, name, [])).find((b) => b.name.toLowerCase() === name.toLowerCase());
    if (!brand) {
      console.warn(`${name}: no brand by that name in Qloo, skipped.`);
      continue;
    }
    const match = await runBrandMatch({ brandId: brand.id }, { client });
    match.example = true;
    await saveMatch("brand", match, brandRequestKey(match.request));
    console.log(`${brand.name}: /brands/${match.id} (${match.traces.length} Qloo calls)\n  acts: ${match.acts.slice(0, 5).map((m) => m.act.name).join(", ")}`);
  }
  for (const [first, second] of PAIRS) {
    const [a, b] = [await findAct(first), await findAct(second)];
    if (!a || !b) {
      console.warn(`${first} + ${second}: not found in Qloo, skipped.`);
      continue;
    }
    const pairing = await runPairing({ aId: a.id, bId: b.id }, { client });
    pairing.example = true;
    await saveMatch("pair", pairing, pairRequestKey(pairing.request));
    console.log(`${a.name} + ${b.name}: /co-headline/${pairing.id} (${pairing.traces.length} Qloo calls, overlap ${Math.round(pairing.overlap * 100)}%)\n  route: ${pairing.route.map((r) => pairing.cities.find((c) => c.id === r.cityId)?.name).join(" → ")}`);
  }
}
await closeDb();
