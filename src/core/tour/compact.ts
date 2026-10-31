// A tool's answer as a model reads it: compact text instead of JSON. A list of records becomes a small table (the
// fields named once, then a line per record), empty fields go, nested objects are indented, and long lists and texts
// are cut with a note saying so. Every value kept is the original, word for word: only JSON's quotes, braces and
// repeated field names go, which is most of a list's tokens. Pure.

const MAX_ROWS = 20;
const MAX_TEXT = 500;

const empty = (v: unknown) =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length);
const scalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

/** A value on one line: long text cut, and quoted when it holds the separator. */
function cell(v: unknown, separator = ","): string {
  if (typeof v !== "string") return String(v);
  const text = (v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT)}…` : v).replace(/\s*\n\s*/g, " ");
  return text.includes(separator) || text.includes('"') ? JSON.stringify(text) : text;
}

/** The fields of a list of records whose values are all scalars, so it can be a table; otherwise nothing. */
function tableFields(list: unknown[]): string[] | undefined {
  if (list.length < 2 || !list.every((r) => r && typeof r === "object" && !Array.isArray(r))) return undefined;
  const fields: string[] = [];
  for (const r of list as Record<string, unknown>[])
    for (const [k, v] of Object.entries(r)) {
      // A short list of words (a brand's categories, a stop's strongest cities) fits in a cell.
      if (!scalar(v) && !(Array.isArray(v) && v.every((x) => typeof x === "string"))) return undefined;
      if (!empty(v) && !fields.includes(k)) fields.push(k);
    }
  return fields.length ? fields : undefined;
}

const tableCell = (v: unknown) => (empty(v) ? "" : Array.isArray(v) ? cell(v.join("; ")) : cell(v));

function lines(value: unknown, indent: string, key?: string): string[] {
  const label = key === undefined ? "" : `${key}: `;
  if (scalar(value)) return [`${indent}${label}${cell(value, "\n")}`];
  if (Array.isArray(value)) {
    const items = value.filter((v) => !empty(v));
    const shown = items.slice(0, MAX_ROWS);
    const more = items.length > shown.length ? [`${indent}  … ${items.length - shown.length} more`] : [];
    const name = key ?? "items";
    const fields = tableFields(shown);
    if (fields) return [`${indent}${name}[${items.length}] (${fields.join(", ")}):`, ...shown.map((r) => `${indent}  ${fields.map((f) => tableCell((r as Record<string, unknown>)[f])).join(", ")}`), ...more];
    if (shown.every(scalar)) return [`${indent}${name}[${items.length}]: ${shown.map((v) => cell(v)).join(", ")}${more.length ? ", …" : ""}`];
    return [
      `${indent}${name}[${items.length}]:`,
      ...shown.flatMap((v) => {
        const item = lines(v, `${indent}    `);
        return item.length ? [`${indent}  - ${item[0].trimStart()}`, ...item.slice(1)] : [];
      }),
      ...more,
    ];
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => !empty(v));
  const inner = key === undefined ? indent : `${indent}  `;
  return [...(key === undefined ? [] : [`${indent}${key}:`]), ...entries.flatMap(([k, v]) => lines(v, inner, k))];
}

/** A tool's answer, compact, within `maxChars`. Text that isn't JSON is only cut to length. */
export function compactResult(result: unknown, maxChars = 4000): string {
  const text = typeof result === "string" ? result : scalar(result) ? cell(result, "\n") : lines(result, "").join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n… (cut: ${text.length - maxChars} more characters)` : text;
}
