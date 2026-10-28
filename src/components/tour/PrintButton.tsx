"use client";

import { Printer } from "lucide-react";

/** Opens the browser's print dialog, where the deck can also be saved as a PDF. */
export function PrintButton() {
  return (
    <button type="button" className="hl-button hl-button-quiet hl-button-small" onClick={() => window.print()}>
      <Printer size={15} aria-hidden /> Print or save as PDF
    </button>
  );
}
