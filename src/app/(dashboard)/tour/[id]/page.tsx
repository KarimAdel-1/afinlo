import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TourView, type Tab } from "@/components/tour/workspace/TourView";
import "@/components/tour/base.css";
import "@/components/tour/tour.css";
import { setting } from "@/lib/settings";
import { cityById } from "@/core/tour/world";
import { knownBrowser } from "@/platform/tour/http";
import { savedResults } from "@/platform/tour/saved";
import { getPlan } from "@/platform/tour/store";
import { actMemory, tourOf, tracksFor } from "@/platform/tour/tracker";

const TABS: Tab[] = ["plan", "book", "fund", "promote", "next"];

export async function generateMetadata({ params }: PageProps<"/tour/[id]">): Promise<Metadata> {
  const plan = await getPlan((await params).id);
  return plan
    ? { title: `${plan.act.name}${plan.area ? ` · ${plan.area}` : ""}`, description: plan.pitch.headline, robots: { index: false } }
    : { title: "Tour not found", robots: { index: false } };
}

export default async function TourPage({ params, searchParams }: PageProps<"/tour/[id]">) {
  const plan = await getPlan((await params).id);
  if (!plan) notFound();
  const { tab, stop } = await searchParams;
  const owner = await knownBrowser();
  const [tracks, memory, saved] = await Promise.all([
    tracksFor(owner, [tourOf(plan)]).then((m) => m.get(tourOf(plan)) ?? []),
    actMemory(owner, plan.act.id),
    savedResults(owner).then((all) => all.some((s) => s.kind === "plan" && s.plan.id === plan.id)),
  ]);
  const homeCity = plan.request.homeCityId ? (plan.cities.find((c) => c.id === plan.request.homeCityId) ?? cityById(plan.request.homeCityId)) : undefined;
  return (
    <TourView
      plan={plan}
      tracks={tracks}
      memory={memory}
      saved={saved}
      ai={!!setting("OPENAI_API_KEY")}
      home={homeCity && { name: homeCity.name, lat: homeCity.lat, lon: homeCity.lon }}
      initialTab={TABS.find((t) => t === tab) ?? "plan"}
      initialStop={typeof stop === "string" && plan.route.some((r) => r.cityId === stop) ? stop : undefined}
    />
  );
}
