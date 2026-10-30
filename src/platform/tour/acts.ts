// The acts a browser has toured, as what's remembered about them needs them: the act a "no" is kept for, and where a
// new brief for one starts. An act Qloo doesn't know has a made-up ID (named.ts) that never goes to Qloo: it's known
// from what the browser kept, and its fans from the acts it was named as like.
import type { Act, Plan } from "@/core/tour/types";
import type { QlooClient } from "../taste/qloo";
import { actById, namedActs, qlooClient } from "./qloo";
import { savedResults } from "./saved";
import { rememberedAct } from "./tracker";

/** The act to keep a "no" for: as this browser remembers it, or as the tour it was said on shows it; otherwise from Qloo. */
export async function actToRemember(browser: string, actId: string, deps: { plan?: Pick<Plan, "act">; client?: QlooClient } = {}): Promise<Act | undefined> {
  const known = (await rememberedAct(browser, actId)) ?? (deps.plan?.act.id === actId ? deps.plan.act : undefined);
  return known ?? actById(deps.client ?? qlooClient(), actId, []);
}

/**
 * Where a brief for an act chosen elsewhere (the Acts page, a brand's matches) starts: an act Qloo knows, from Qloo; an
 * act it doesn't, with the acts it was named as like on this browser's latest tour of it, or failing that, by name.
 */
export async function briefStart(browser: string | undefined, actId: string, deps: { client?: QlooClient } = {}): Promise<{ act?: Act; like?: Act[]; query?: string }> {
  const client = deps.client ?? qlooClient();
  const kept = await rememberedAct(browser, actId);
  if (!kept?.predicted) return { act: await actById(client, actId, []).catch(() => undefined) };
  const tour = (await savedResults(browser)).find((s) => s.plan.act.id === actId && s.plan.request.newAct)?.plan;
  const like = tour?.request.newAct && (await namedActs(client, tour.request.newAct.like, []).catch(() => undefined));
  return like ? { act: kept, like } : { query: kept.name };
}
