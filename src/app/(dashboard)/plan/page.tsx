import type { Metadata } from "next";
import { Brief } from "@/components/tour/Brief";
import "@/components/tour/base.css";
import "@/components/tour/tour.css";
import "@/components/tour/brief.css";
import { qlooId } from "@/core/tour/types";
import { setting } from "@/lib/settings";
import { actById, qlooClient } from "@/platform/tour/qloo";
import { examplePlans } from "@/platform/tour/store";

export const metadata: Metadata = {
  title: "New tour",
  description: "Choose an artist or comedian, see where their fans are anywhere in the world, say what matters, and Afinlo plans the tour.",
};

export default async function NewTourPage({ searchParams }: PageProps<"/plan">) {
  const { q, act: actId } = await searchParams;
  // An act chosen elsewhere (an act's page, a brand's matches) starts the brief at where to tour.
  const id = qlooId.safeParse(actId);
  const act = id.success ? await actById(qlooClient(), id.data, []).catch(() => undefined) : undefined;
  const examples = await examplePlans().catch(() => []);
  return <Brief qloo={!!setting("QLOO_API_KEY")} initialQuery={typeof q === "string" ? q.slice(0, 80) : ""} initialAct={act} picks={examples.slice(0, 4).map((e) => e.act.name)} />;
}
