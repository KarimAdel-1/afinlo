"use client";

import Link from "next/link";

/** A page that couldn't load: try it again, or go back to the start. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="af2-site flex flex-1 flex-col">
      <section className="af2-simple-hero" style={{ marginTop: 20 }}>
        <h1>Let&apos;s try that again.</h1>
        <p>This page couldn&apos;t load. Try again, or go back to the start.</p>
        <button type="button" className="af2-button" onClick={reset}>
          Try again
        </button>{" "}
        <Link className="af2-button af2-button-secondary" href="/">
          Back to Afinlo
        </Link>
      </section>
    </main>
  );
}
