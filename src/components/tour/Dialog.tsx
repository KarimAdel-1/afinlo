"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** A window over the page: a title, its content, and buttons at the bottom. Escape or ✕ closes it. */
export function Dialog({ title, subtitle, onClose, children, footer }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="hl hl-dialog" onClose={onClose}>
      <div className="hl-dialog-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button type="button" className="hl-dialog-close" aria-label="Close" onClick={() => ref.current?.close()}>
          <X size={20} aria-hidden />
        </button>
      </div>
      <div className="hl-dialog-body">{children}</div>
      {footer && <div className="hl-dialog-foot">{footer}</div>}
    </dialog>
  );
}
