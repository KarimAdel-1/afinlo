import type { TasteTrace } from "@/core/taste/types";

/** Every Qloo request behind a result: what was asked, what came back, how long it took. */
export function Receipts({ traces, what, note }: { traces: TasteTrace[]; what: string; note: string }) {
  return (
    <section className="hl-block hl-receipts">
      <details>
        <summary>
          The {traces.length} Qloo requests behind this {what}
        </summary>
        <p className="hl-hint">{note}</p>
        <div className="hl-table">
          <table>
            <thead>
              <tr>
                <th>Tool</th>
                <th>Request</th>
                <th>Results</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((t, i) => (
                <tr key={i}>
                  <td>{t.tool}</td>
                  <td>
                    <code>
                      {t.endpoint}{" "}
                      {Object.entries(t.parameters)
                        .filter(([k]) => k !== "take")
                        .map(([k, v]) => `${k}=${v.length > 48 ? v.slice(0, 45) + "…" : v}`)
                        .join(" ")}
                    </code>
                  </td>
                  <td>{t.status === "ok" ? t.count : `failed${t.error ? `: ${t.error}` : ""}`}</td>
                  <td>{t.cached ? "cache" : `${t.durationMs} ms`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
