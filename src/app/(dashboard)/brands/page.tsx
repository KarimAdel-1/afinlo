import type { Metadata } from "next";
import { BrandFlow } from "@/components/tour/BrandFlow";
import { PageHead } from "@/components/tour/PageHead";
import "@/components/tour/base.css";
import type { BrandMatch } from "@/core/tour/types";
import { setting } from "@/lib/settings";
import { landTiles, topCityMarkers } from "@/platform/tour/map";
import { exampleMatches } from "@/platform/tour/store";

export const metadata: Metadata = {
  title: "For brands",
  description: "Enter a brand: Afinlo finds the artists and comedians whose fans love it, and the cities where both audiences are strongest.",
};

export default async function BrandsPage() {
  const examples = await exampleMatches<BrandMatch>("brand").catch(() => []);
  const ex = examples[0];
  return (
    <div className="hl hl-flow">
      <PageHead title="Find acts for your brand">
        Enter a brand. Afinlo finds the artists and comedians whose fans love it, and the cities where both audiences are strongest.
      </PageHead>
      <BrandFlow
        qloo={!!setting("QLOO_API_KEY")}
        tiles={landTiles().tiles}
        picks={examples.length ? examples.slice(0, 3).map((e) => e.brand.name) : ["Liquid Death", "Patagonia", "Red Bull"]}
        example={ex && { id: ex.id, name: ex.brand.name, heat: ex.heat, cities: topCityMarkers(ex.cities) }}
      />
    </div>
  );
}
