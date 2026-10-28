"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import { Dialog } from "../Dialog";
import type { Draft } from "./drafts";

/** A status as a compact select, coloured by where it stands. */
export function StatusSelect<S extends string>({
  value,
  options,
  labels,
  onChange,
  label,
}: {
  value: S;
  options: readonly S[];
  labels: Record<S, string>;
  onChange: (v: S) => void;
  label: string;
}) {
  return (
    <select className={`hl-status-pill s-${value}`} value={value} aria-label={label} onChange={(e) => onChange(e.target.value as S)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {labels[o]}
        </option>
      ))}
    </select>
  );
}

/** An email, ready to send: edit it, copy it, or open it in the mail app; then mark what happened. */
export function DraftDialog({ draft, onClose, done }: { draft: Draft; onClose: () => void; done?: { label: string; run: () => void } }) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Dialog
      title={`Email to ${draft.to}`}
      subtitle="Drafted from this tour's Qloo results. Edit it before you send."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="hl-button hl-button-quiet hl-button-small" onClick={() => void copy()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
          </button>
          <a className="hl-button hl-button-quiet hl-button-small" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
            <Mail className="size-4" /> Open in email
          </a>
          {done && (
            <button
              type="button"
              className="hl-button hl-button-small"
              onClick={() => {
                done.run();
                onClose();
              }}
            >
              <Check className="size-4" /> {done.label}
            </button>
          )}
        </>
      }
    >
      <label htmlFor="hl-draft-subject">
        Subject
      </label>
      <input id="hl-draft-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
      <label htmlFor="hl-draft-body">
        Message
      </label>
      <textarea id="hl-draft-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
    </Dialog>
  );
}

/** "Fan Heat 91" as a small bar and number. */
export function Heat({ value, hidden }: { value: number; hidden?: boolean }) {
  return (
    <span className={`hl-heat${hidden ? " lime" : ""}`} title={`Fan Heat ${value} of 100`}>
      <span className="hl-heat-bar" aria-hidden>
        <span style={{ width: `${Math.max(6, value)}%` }} />
      </span>
      <b>{value}</b>
    </span>
  );
}
