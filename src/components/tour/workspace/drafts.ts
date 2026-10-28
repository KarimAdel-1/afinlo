// The emails a tour sends, drafted from the plan's own facts: a hold request to a venue, a pitch to a sponsor (the
// plan's written one when there is one), and a follow-up. Plain templates, so they work with no AI model; nothing in
// them goes beyond what Qloo and the scores say. Pure.
import { placeOf } from "@/core/tour/regions";
import type { CityHeat, CityPlace, Plan, Sponsor } from "@/core/tour/types";

export interface Draft {
  to: string;
  subject: string;
  body: string;
}

const team = (plan: Plan) => `${plan.act.name}'s team`;
const tourLine = (plan: Plan) => `a ${plan.route.length}-city tour${plan.area ? ` of ${plan.area}` : ""}`;

export function venueDraft(plan: Plan, city: CityHeat, venue: CityPlace): Draft {
  return {
    to: venue.name,
    subject: `Hold request: ${plan.act.name} in ${city.name}`,
    body: [
      `Hi ${venue.name} team,`,
      `${plan.act.name} is routing ${tourLine(plan)}, and ${city.name} is one of the strongest markets for their audience: Fan Heat ${city.heat} of 100 in Qloo's taste data${city.hidden ? ", a city most tours pass by" : ""}. ${venue.name} is one of the places these fans love there.`,
      `We'd like to ask about open dates for a show at ${venue.name}. Could you share your calendar and your terms for a hold?`,
      `Thanks,`,
      team(plan),
    ].join("\n\n"),
  };
}

export function sponsorDraft(plan: Plan, sponsor: Sponsor): Draft {
  const written = plan.pitch.emails.find((e) => e.brandId === sponsor.brand.id);
  if (written) return { to: sponsor.brand.name, subject: written.subject, body: written.body };
  const strongest = sponsor.strongestIn.map((id) => plan.cities.find((c) => c.id === id)?.name).filter(Boolean);
  return {
    to: sponsor.brand.name,
    subject: `${plan.act.name} × ${sponsor.brand.name}: tour partnership`,
    body: [
      `Hi ${sponsor.brand.name} partnerships team,`,
      `${plan.act.name} is planning ${tourLine(plan)}. Qloo's taste data ranks ${sponsor.brand.name} #${sponsor.qlooRank} among the brands this audience loves${strongest.length ? `, and your own audience is strongest in ${strongest.join(" and ")}, both on the route` : ""}.`,
      `The route: ${plan.route.map((r) => plan.cities.find((c) => c.id === r.cityId)?.name).filter(Boolean).join(", ")}.`,
      `Would you be open to a conversation about a partnership on this tour?`,
      `Best,`,
      team(plan),
    ].join("\n\n"),
  };
}

export function followUpDraft(plan: Plan, sponsor: Sponsor, days: number): Draft {
  return {
    to: sponsor.brand.name,
    subject: `Following up: ${plan.act.name} × ${sponsor.brand.name}`,
    body: [
      `Hi ${sponsor.brand.name} partnerships team,`,
      `Following up on my note from ${days === 1 ? "yesterday" : `${days} days ago`} about a partnership on ${plan.act.name}'s tour${plan.area ? ` of ${plan.area}` : ""}. Qloo's taste data puts ${sponsor.brand.name} among the brands this audience loves most, and the route is set: ${plan.route
        .map((r) => {
          const c = plan.cities.find((x) => x.id === r.cityId);
          return c ? placeOf(c) : "";
        })
        .filter(Boolean)
        .slice(0, 4)
        .join("; ")}.`,
      `Happy to send the deck, or find twenty minutes to talk it through.`,
      `Best,`,
      team(plan),
    ].join("\n\n"),
  };
}
