import type { ReactNode } from "react";
import { Dock } from "@/components/tour/Dock";
import "@/components/tour/base.css";
import "@/components/tour/dashboard.css";

/** The dashboard: every page but the website's, with the dock down the left. Nothing needs an account. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="af2-site hl-app">
      <Dock />
      <main id="main-content" className="hl-app-main">
        {children}
      </main>
    </div>
  );
}
