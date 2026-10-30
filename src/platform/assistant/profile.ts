// What the assistant knows about the person it's talking to (ArtistProfile), kept per browser like everything else:
// nobody signs in. Gathered a little at a time in conversation; each new answer is added to what's there.
import { db, now } from "@/lib/db";
import type { ArtistProfile } from "@/core/tour/types";

export async function getProfile(browser: string | undefined): Promise<ArtistProfile> {
  if (!browser) return {};
  const row = await db().prepare("SELECT profile FROM tour_profiles WHERE visitor = ?").get<{ profile: string }>(browser);
  return row ? (JSON.parse(row.profile) as ArtistProfile) : {};
}

/** Adds what was just learned. A list grows (each item once, the newest kept); any other field is replaced. */
export async function addToProfile(browser: string, learned: ArtistProfile): Promise<ArtistProfile> {
  const before = await getProfile(browser);
  const merge = (a?: string[], b?: string[]) => (a || b ? [...new Set([...(a ?? []), ...(b ?? [])])].slice(-6) : undefined);
  const profile: ArtistProfile = {
    ...before,
    ...Object.fromEntries(Object.entries(learned).filter(([, v]) => v !== undefined && v !== "")),
    soundsLike: merge(before.soundsLike, learned.soundsLike)?.slice(-5),
    goals: merge(before.goals, learned.goals),
    limits: merge(before.limits, learned.limits),
  };
  await db()
    .prepare("INSERT INTO tour_profiles (visitor, profile, updated_at) VALUES (?, ?, ?) ON CONFLICT (visitor) DO UPDATE SET profile = EXCLUDED.profile, updated_at = EXCLUDED.updated_at")
    .run(browser, JSON.stringify(profile), now());
  return profile;
}
