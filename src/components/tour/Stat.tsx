import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** One row of a dashboard's statistics: a coloured icon tile, a small label and the value. */
export function Stat({ icon: Icon, color, ink, label, children }: { icon: LucideIcon; color: string; ink?: boolean; label: string; children: ReactNode }) {
  return (
    <li>
      <span style={{ background: color, color: ink ? "#262a3f" : "#fff" }} aria-hidden>
        <Icon size={20} />
      </span>
      <div style={{ minWidth: 0 }}>
        <small>{label}</small>
        <b>{children}</b>
      </div>
    </li>
  );
}
