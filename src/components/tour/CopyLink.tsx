"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";

/** Copies this page's address, to share a result. */
export function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="hl-button hl-button-quiet hl-button-small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      <Link2 size={15} aria-hidden /> {copied ? "Copied" : "Copy link"}
    </button>
  );
}
