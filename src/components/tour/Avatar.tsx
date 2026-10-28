"use client";

import { useState } from "react";
import Image from "next/image";
import { tileColor } from "./format";

/**
 * An act's or brand's picture from Qloo, in a rounded tile; its initial on a steady colour when Qloo has no picture
 * or it doesn't load. `size` is the largest the tile is drawn, in CSS pixels, so the server sends a small image.
 * A logo (`fit="contain"`) is shown whole on white; a photo fills the tile.
 */
export function Avatar({ name, image, size = 48, fit = "cover" }: { name: string; image?: string; size?: number; fit?: "cover" | "contain" }) {
  const [failed, setFailed] = useState(false);
  const show = !!image && !failed;
  return (
    <span className={`hl-tile ${show ? `has-image ${fit}` : ""}`} style={show ? undefined : { background: tileColor(name) }} aria-hidden>
      {show ? <Image src={image} alt="" fill sizes={`${size}px`} onError={() => setFailed(true)} /> : name.charAt(0)}
    </span>
  );
}
