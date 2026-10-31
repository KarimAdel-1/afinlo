"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

/** Opens the browser's print dialog, where the deck can also be saved as a PDF; with `auto`, as soon as the page is ready. */
export function PrintButton({ auto = false }: { auto?: boolean }) {
  useEffect(() => {
    if (!auto) return;
    let waiting = true;
    const ready = () => document.fonts.ready.then(() => waiting && window.print());
    if (document.readyState === "complete") void ready();
    else window.addEventListener("load", ready, { once: true });
    return () => {
      waiting = false;
      window.removeEventListener("load", ready);
    };
  }, [auto]);
  return (
    <button type="button" className="hl-button hl-button-quiet hl-button-small" onClick={() => window.print()}>
      <Printer size={15} aria-hidden /> Print or save as PDF
    </button>
  );
}
