"use client";

import { useCallback, useRef, useState } from "react";
import type { CityGuide, Track } from "@/core/tour/types";

/** Where each venue and sponsor stands, saved as it changes: shown at once, put back if the save fails. */
export function useTracks(planId: string, initial: Track[]) {
  const [tracks, setTracks] = useState(initial);
  const [error, setError] = useState("");
  const statusOf = (kind: Track["kind"], itemId: string) => tracks.find((t) => t.kind === kind && t.itemId === itemId);
  const set = async (kind: Track["kind"], itemId: string, status: string, cityId?: string, note = "") => {
    const before = tracks;
    const next: Track = { kind, itemId, status, note, updatedAt: new Date().toISOString(), ...(cityId ? { cityId } : {}) };
    setTracks((v) => [...v.filter((t) => !(t.kind === kind && t.itemId === itemId)), next]);
    setError("");
    const res = await fetch("/api/tour/track", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, kind, itemId, status, note, ...(cityId ? { cityId } : {}) }),
    }).catch(() => undefined);
    if (!res?.ok) {
      setTracks(before);
      setError(((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "That didn't save. Please try again.");
    }
  };
  /** A status already saved elsewhere (by the tour team): shown, not saved again. */
  const saved = (t: Omit<Track, "updatedAt">) => setTracks((v) => [...v.filter((x) => !(x.kind === t.kind && x.itemId === t.itemId)), { ...t, updatedAt: new Date().toISOString() }]);
  return { tracks, statusOf, set, saved, error };
}

export type GuideState = { status: "loading" } | { status: "ready"; guide: Omit<CityGuide, "traces"> & { requests: number } } | { status: "error"; error: string };

/** A stop's venues, partners and loved places, fetched the first time the stop is opened, then kept. */
export function useGuides(planId: string) {
  const [guides, setGuides] = useState<Record<string, GuideState>>({});
  const asked = useRef(new Set<string>());
  const load = useCallback(
    async (cityId: string, retry = false) => {
      if (asked.current.has(cityId) && !retry) return;
      asked.current.add(cityId);
      setGuides((g) => ({ ...g, [cityId]: { status: "loading" } }));
      try {
        const res = await fetch(`/api/tour/plan/${planId}/city/${cityId}`);
        const body = (await res.json().catch(() => ({}))) as { guide?: Extract<GuideState, { status: "ready" }>["guide"]; error?: string };
        if (!res.ok || !body.guide) throw new Error(body.error ?? "Qloo's place data didn't answer. Please try again.");
        setGuides((g) => ({ ...g, [cityId]: { status: "ready", guide: body.guide! } }));
      } catch (e) {
        setGuides((g) => ({ ...g, [cityId]: { status: "error", error: (e as Error).message } }));
      }
    },
    [planId],
  );
  return { guides, load };
}
