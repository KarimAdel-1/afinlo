// Builds the one-click examples: a real tour for each act below, in the part of the world its fans are
// strongest, saved and marked as an example, so a judge sees full results instantly. With a language model
// configured, each pitch is written by the AI writer; without one, it uses the plain template (run this again once
// the key is in).
//   npm run examples
//   npm run examples -- "Phoebe Bridgers=uk-ireland" "John Mulaney" "Bad Bunny=world"   (other acts; a region, or world, after =)

process.loadEnvFile(".env.local");
const { planTour } = await import("../src/platform/tour/agent");
const { qlooClient, searchActs } = await import("../src/platform/tour/qloo");
const { savePlan } = await import("../src/platform/tour/store");
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
const custom = process.argv.slice(2).map((a) => a.split("=") as [string, string?]);
const acts = custom.length ? custom : DEFAULT;
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
  const where = region === "world" ? ({ kind: "world" } as const) : ({ kind: "region", region: regionId.parse(region) } as const);
  const plan = await planTour({ actId: act.id, where, stops: 7 }, { client });
  plan.example = true;
  await savePlan(plan);
  const route = plan.route.map((r) => plan.cities.find((c) => c.id === r.cityId)!.name).join(" → ");
  console.log(
    `${act.name} (${plan.area}): /tour/${plan.id} (${((Date.now() - started) / 1000).toFixed(1)}s, ${plan.traces.length} Qloo calls, writer: ${plan.pitch.writer})\n  ${route}\n  sponsors: ${plan.sponsors.slice(0, 4).map((s) => s.brand.name).join(", ")}${plan.notes.length ? `\n  notes: ${plan.notes.join(" ")}` : ""}`,
  );
}
await closeDb();
