import type { Metadata } from "next";
import { AssistantChat } from "@/components/tour/AssistantChat";
import "@/components/tour/base.css";
import "@/components/tour/tour.css";
import "@/components/tour/home.css";
import { getProfile } from "@/platform/assistant/profile";
import { knownBrowser } from "@/platform/tour/http";
import { savedResults } from "@/platform/tour/saved";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

/** Home: the assistant alone, the way in to everything. The chat open is in the address (?chat=). */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ chat?: string | string[] }> }) {
  const owner = await knownBrowser();
  const [{ chat }, tours, profile] = await Promise.all([searchParams, savedResults(owner, 1), getProfile(owner)]);
  const open = typeof chat === "string" && /^[a-z0-9-]{6,40}$/.test(chat) ? chat : undefined;
  return (
    <div className="hl hl-flow hl-home">
      <AssistantChat hasTours={!!tours.length} name={profile.name} chat={open} />
    </div>
  );
}
