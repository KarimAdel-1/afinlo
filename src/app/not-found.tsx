import Link from "next/link";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/** An address that leads nowhere: the website's frame, and the way back. */
export default function NotFound() {
  return (
    <div className="af2-site flex flex-1 flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="af2-simple-hero">
          <h1>This page isn&apos;t here.</h1>
          <p>It may have moved, or the link may be incomplete.</p>
          <Link className="af2-button" href="/">
            Back to Afinlo
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
