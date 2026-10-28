import { errorResponse, forbidden, fromOurPages } from "@/platform/tour/http";
import { renderPdf } from "@/platform/tour/pdf";
import { getDeck, getPlan, saveDeck } from "@/platform/tour/store";

export const runtime = "nodejs";
export const maxDuration = 90;

/** The plan's pitch deck as a PDF: printed from the deck page the first time, then kept with the plan. */
export async function GET(request: Request, ctx: RouteContext<"/api/tour/plan/[id]/pdf">) {
  if (!fromOurPages(request)) return forbidden();
  const plan = await getPlan((await ctx.params).id);
  if (!plan) return Response.json({ error: "That plan doesn't exist." }, { status: 404 });
  let pdf = await getDeck(plan.id);
  if (!pdf) {
    try {
      // The server prints its own deck page over loopback (Next sets PORT to the port it listens on). The address never
      // comes from the request: its Host header could point the browser anywhere, and the PDF is kept for everyone.
      pdf = await renderPdf(`http://127.0.0.1:${process.env.PORT ?? 3001}/deck/${plan.id}`);
      await saveDeck(plan.id, pdf);
    } catch (error) {
      return errorResponse(error);
    }
  }
  const name = plan.act.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "afinlo";
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}-pitch-deck.pdf"`, "Cache-Control": "private, max-age=3600" },
  });
}
