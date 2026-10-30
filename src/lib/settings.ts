// The server's settings, from the environment (.env.local in development, the host's settings in production). Each
// has one meaning and, where it can, a default. A value that doesn't fit throws with a message naming it.

const QLOO_ORIGINS = ["https://hackathon.api.qloo.com", "https://api.qloo.com", "https://staging.api.qloo.com"];

const text = (value: string | undefined) => value || undefined;
const flag = (value: string | undefined) => value === "1" || value === "true";
const count = (fallback: number) => (value: string | undefined, name: string) => {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a whole number above 0.`);
  return n;
};
const address = (value: string | undefined, name: string) => {
  if (!value) return undefined;
  if (!/^https?:\/\/[^\s/]+/.test(value)) throw new Error(`${name} must be an http(s) address.`);
  return value.replace(/\/+$/, "");
};

const SETTINGS = {
  /** Postgres: plans, the Qloo cache, the limits, and what each browser keeps. */
  DATABASE_URL: text,
  /** Qloo's API key. Server only. */
  QLOO_API_KEY: text,
  /** The Qloo origin the key was issued for. */
  QLOO_BASE_URL: (value: string | undefined, name: string) => {
    const origin = (value || QLOO_ORIGINS[0]).replace(/\/+$/, "");
    if (!QLOO_ORIGINS.includes(origin)) throw new Error(`${name} must be one of ${QLOO_ORIGINS.join(", ")}.`);
    return origin;
  },
  /** OpenAI's API key. Optional: without it, the pitch and emails are templates. */
  OPENAI_API_KEY: text,
  /** New plans the whole server makes in 24 hours. */
  DAILY_PLANS: count(300),
  /** New plans one visitor can make in an hour. */
  HOURLY_PLANS: count(8),
  /** Messages to tour managers the whole server answers in 24 hours. */
  DAILY_CHAT: count(600),
  /** Messages to tour managers one visitor can send in an hour. */
  HOURLY_CHAT: count(30),
  /** The Chrome or Edge that prints decks as PDF (default: the usual install places). */
  PDF_BROWSER: text,
  /** The public address, when a proxy in front shows the server another origin. */
  PUBLIC_URL: address,
  /** Trust the visitor address a proxy in front reports (X-Forwarded-For). */
  TRUST_PROXY: flag,
};

export type SettingName = keyof typeof SETTINGS;

export function setting<K extends SettingName>(name: K): ReturnType<(typeof SETTINGS)[K]> {
  return SETTINGS[name](process.env[name]?.trim(), name) as ReturnType<(typeof SETTINGS)[K]>;
}
