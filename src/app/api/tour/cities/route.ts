import { areaOf, where } from "@/core/tour/regions";
import { citiesIn } from "@/core/tour/world";
import { NO_STORE } from "@/platform/tour/http";

export const runtime = "nodejs";

/** The cities of a tour's area, biggest first: for choosing where the tour starts. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const parsed = where.safeParse(q.get("region") ? { kind: "region", region: q.get("region") } : { kind: "countries", countries: (q.get("countries") ?? "").split(",").filter(Boolean) });
  if (!parsed.success) return Response.json({ cities: [] }, { headers: NO_STORE });
  const cities = citiesIn(parsed.data)
    .sort((a, b) => b.population - a.population)
    .slice(0, 400)
    .map((c) => ({ id: c.id, name: c.name, area: areaOf({ state: c.admin1, country: c.country }) }));
  return Response.json({ cities }, { headers: { "Cache-Control": "public, max-age=86400" } });
}
