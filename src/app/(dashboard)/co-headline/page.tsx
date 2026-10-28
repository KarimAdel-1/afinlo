import type { Metadata } from "next";
import { PageHead } from "@/components/tour/PageHead";
import { PairFlow } from "@/components/tour/PairFlow";
import "@/components/tour/base.css";
import type { Pairing } from "@/core/tour/types";
import { setting } from "@/lib/settings";
import { landTiles, mapCities } from "@/platform/tour/map";
import { examplePlans, exampleMatches } from "@/platform/tour/store";

export const metadata: Metadata = {
  title: "Find a co-headliner",
  description: "Two acts in: Afinlo shows where both audiences are strong, what the crowds share, and a double-bill route, from Qloo.",
};

export default async function CoHeadlinePage() {
  const [pairs, plans] = await Promise.all([exampleMatches<Pairing>("pair").catch(() => []), examplePlans().catch(() => [])]);
  const ex = pairs[0];
  return (
    <div className="hl hl-flow">
      <PageHead title="Find a co-headliner">Two acts in: Afinlo shows where both audiences are strong, what the two crowds share, and a double-bill route.</PageHead>
      <PairFlow
        qloo={!!setting("QLOO_API_KEY")}
        tiles={landTiles().tiles}
        picks={plans.slice(0, 3).map((p) => p.act.name)}
        example={ex && { id: ex.id, name: `${ex.a.name} + ${ex.b.name}`, heat: ex.heat, cities: mapCities(ex).filter((c) => c.stop) }}
      />
    </div>
  );
}
