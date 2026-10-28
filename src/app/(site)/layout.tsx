import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/** The website: the tour and sponsorship agent, how it works, and whether it works. No sign-in. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="af2-site flex flex-1 flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
