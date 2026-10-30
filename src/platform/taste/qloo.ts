// Qloo transport and response normalization. Keys never enter a URL, browser bundle or trace.
import { createHash } from "node:crypto";
import { z } from "zod";
import { setting } from "@/lib/settings";
import {
  CATEGORIES,
  categoryOfType,
  entityId,
  GEOGRAPHIC,
  QLOO_TYPES,
  TasteError,
  type Category,
  type TasteEntity,
  type TasteTag,
  type TasteTrace,
} from "@/core/taste/types";

const object = z.record(z.string(), z.unknown());
const record = (v: unknown): Record<string, unknown> =>
  object.safeParse(v).success ? (v as Record<string, unknown>) : {};
const str = (v: unknown, max = 1200) =>
  typeof v === "string" ? v.slice(0, max) : "";
const finite = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
/** An image URL only when it's Qloo's own, over HTTPS: nothing else from a response is shown as an image. */
export const safeImage = (v: unknown): string | undefined => {
  try {
    const u = new URL(str(v));
    return u.protocol === "https:" && /(^|\.)qloo\.com$/.test(u.hostname)
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
};
// External identifiers Qloo returns, as source pages. Only plain IDs are accepted, so no URL comes from free text.
const SOURCES: {
  key: string;
  label: string;
  categories: Category[];
  url: (id: string) => string | undefined;
}[] = [
  {
    key: "imdb",
    label: "IMDb",
    categories: ["movie", "tv_show", "artist"],
    url: (id) =>
      /^tt\d+$/.test(id)
        ? `https://www.imdb.com/title/${id}/`
        : /^nm\d+$/.test(id)
          ? `https://www.imdb.com/name/${id}/`
          : undefined,
  },
  {
    key: "spotify",
    label: "Spotify",
    categories: ["artist"],
    url: (id) =>
      /^[A-Za-z0-9]{22}$/.test(id)
        ? `https://open.spotify.com/artist/${id}`
        : undefined,
  },
  {
    key: "goodreads",
    label: "Goodreads",
    categories: ["book"],
    url: (id) =>
      /^\d+$/.test(id) ? `https://www.goodreads.com/book/show/${id}` : undefined,
  },
  {
    key: "letterboxd",
    label: "Letterboxd",
    categories: ["movie"],
    url: (id) =>
      /^[a-z0-9-]+$/.test(id) ? `https://letterboxd.com/film/${id}/` : undefined,
  },
  {
    key: "wikidata",
    label: "Wikidata",
    categories: [...CATEGORIES],
    url: (id) =>
      /^q\d+$/i.test(id)
        ? `https://www.wikidata.org/wiki/${id.toUpperCase()}`
        : undefined,
  },
];
/** A web address only when it's plain HTTP(S): never a script or another scheme. */
export const website = (v: unknown): string | undefined => {
  try {
    const u = new URL(str(v, 500));
    return u.protocol === "https:" || u.protocol === "http:"
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
};
function sourceLinks(
  r: Record<string, unknown>,
  p: Record<string, unknown>,
  category: Category,
) {
  // Search puts external IDs in properties as objects; insights puts them at the top level as lists.
  const external = { ...record(p.external), ...record(r.external) };
  const links: { label: string; url: string }[] = [];
  const site =
    category === "place" ? website(p.website) : category === "brand" ? website(p.official_site) : undefined;
  if (site) links.push({ label: "Website", url: site });
  for (const s of SOURCES) {
    if (!s.categories.includes(category)) continue;
    const v = external[s.key];
    const url = s.url(str(record(Array.isArray(v) ? v[0] : v).id, 80));
    if (url) links.push({ label: s.label, url });
  }
  return links.slice(0, 3);
}
function normalizeEntity(value: unknown): TasteEntity | undefined {
  const r = record(value),
    p = record(r.properties),
    q = record(r.query);
  const id = entityId.safeParse(r.entity_id);
  // Insights responses name the type in `subtype`; search responses list it in `types`.
  const category = categoryOfType(
    str(r.subtype) || str(Array.isArray(r.types) ? r.types[0] : "") || str(r.type),
  );
  if (!id.success || !category || !str(r.name)) return;
  const tags = (Array.isArray(r.tags) ? r.tags : [])
    .flatMap((v) => {
      const t = record(v);
      const tagId = str(t.id || t.tag_id, 200);
      return tagId.startsWith("urn:tag:")
        ? [{ id: tagId, name: str(t.name, 120) }]
        : [];
    })
    .slice(0, 16);
  return {
    id: id.data,
    name: str(r.name, 200),
    category,
    description: str(p.description || p.short_description),
    disambiguation: str(r.disambiguation, 200),
    image: safeImage(record(p.image).url),
    tags,
    affinity: finite(q.affinity),
    popularity: finite(r.popularity),
    links: sourceLinks(r, p, category),
  };
}
/** Somewhere to keep successful responses, so a repeated request doesn't spend Qloo quota (the app's cache). */
export interface QlooCache {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
}
export interface QlooOptions {
  key?: string;
  base?: string;
  fetcher?: typeof fetch;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  cache?: QlooCache;
}
export class QlooClient {
  private readonly key: string;
  private readonly base: string;
  private readonly fetcher: typeof fetch;
  private readonly wait: NonNullable<QlooOptions["wait"]>;
  private readonly cache?: QlooCache;
  constructor(options: QlooOptions = {}) {
    this.cache = options.cache;
    this.key = options.key ?? setting("QLOO_API_KEY") ?? "";
    this.base = options.base ?? setting("QLOO_BASE_URL");
    const u = new URL(this.base);
    if (
      u.protocol !== "https:" ||
      ![
        "api.qloo.com",
        "hackathon.api.qloo.com",
        "staging.api.qloo.com",
      ].includes(u.hostname) ||
      u.port ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      !["", "/"].includes(u.pathname)
    )
      throw new TasteError(
        "qloo_configuration",
        "Use an approved Qloo API origin.",
        503,
      );
    this.fetcher = options.fetcher ?? fetch;
    this.wait =
      options.wait ??
      (async (ms, signal) => {
        const { setTimeout } = await import("node:timers/promises");
        await setTimeout(ms, undefined, { signal });
      });
  }
  async request(
    tool: TasteTrace["tool"],
    endpoint: string,
    parameters: Record<string, string>,
    traces: TasteTrace[],
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!this.key)
      throw new TasteError(
        "qloo_not_configured",
        "Connect Qloo to use taste discovery. Add QLOO_API_KEY to the server environment.",
        503,
      );
    const started = Date.now();
    const trace: TasteTrace = {
      tool,
      endpoint,
      parameters,
      at: new Date().toISOString(),
      durationMs: 0,
      count: 0,
      status: "error",
    };
    traces.push(trace);
    // The cache key never includes the credential: only the endpoint and its parameters, in a stable order.
    const cacheKey = this.cache
      ? createHash("sha256").update(endpoint + "?" + new URLSearchParams(Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b))).toString()).digest("hex")
      : "";
    try {
      // The cache saves quota, nothing more: when it can't be read, Qloo is asked; when it can't be written, Qloo's
      // answer still goes back. Either way it's logged, and never reported as Qloo failing.
      if (this.cache) {
        const kept = await this.cache.get(cacheKey).catch((error) => void console.error("Couldn't read the Qloo cache:", error));
        if (kept !== undefined) {
          trace.status = "ok";
          trace.cached = true;
          return kept;
        }
      }
      const url = new URL(endpoint, this.base);
      url.search = new URLSearchParams(parameters).toString();
      for (let attempt = 0; attempt < 3; attempt++) {
        const timeout = AbortSignal.timeout(12_000);
        const response = await this.fetcher(url, {
          headers: { "X-Api-Key": this.key, Accept: "application/json" },
          cache: "no-store",
          redirect: "error",
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
        trace.requestId =
          response.headers.get("x-request-id")?.slice(0, 120) || undefined;
        if (
          (response.status === 429 || response.status >= 500) &&
          attempt < 2
        ) {
          const retry = response.headers.get("retry-after");
          const seconds = Number(retry);
          const delay =
            retry && !Number.isFinite(seconds)
              ? Date.parse(retry) - Date.now()
              : seconds * 1000;
          await response.body?.cancel();
          await this.wait(
            Math.min(
              4000,
              Math.max(300 * 2 ** attempt, Number.isFinite(delay) ? delay : 0),
            ),
            signal,
          );
          continue;
        }
        if (response.status === 404 && tool === "qloo_search") {
          trace.status = "ok";
          return { results: [] };
        }
        if (response.status === 400) {
          // Qloo names the parameter it rejected; an unknown place is the one a person can fix.
          const body = record(await response.json().catch(() => ({})));
          const errors = Array.isArray(body.errors) ? body.errors : [];
          if (errors.some((e) => str(record(e).path).startsWith("filter.location")))
            throw new TasteError(
              "qloo_location",
              "Qloo couldn't find that location. Try a city or neighborhood name, such as “London”.",
              400,
            );
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          throw new TasteError(
            "qloo_unavailable",
            response.status === 401 || response.status === 403
              ? "Qloo rejected the API key or this endpoint is not included in its access. Check the key and Qloo origin."
              : response.status === 400
                ? "Qloo could not match these filters. Check the location and selected interests."
                : "Qloo is temporarily unavailable. Try again shortly; no substitute recommendations were generated.",
            response.status === 429 ? 429 : 502,
          );
        }
        const body = await response.json();
        if (record(body).success === false)
          throw new TasteError(
            "qloo_rejected",
            "Qloo could not complete this query. Refine the profile or filters.",
            502,
          );
        trace.status = "ok";
        await this.cache?.set(cacheKey, body).catch((error) => console.error("Couldn't keep a Qloo answer in the cache:", error));
        return body;
      }
    } catch (error) {
      // What went wrong stays in the server's log; the visitor gets the plain message.
      if (!(error instanceof TasteError) && !signal?.aborted) console.error(`Qloo ${endpoint} failed:`, error);
      const safe =
        error instanceof TasteError
          ? error
          : new TasteError(
              "qloo_connection",
              signal?.aborted
                ? "Discovery was cancelled."
                : "Qloo did not respond successfully. Please retry.",
              502,
            );
      trace.error = safe.message;
      throw safe;
    } finally {
      trace.durationMs = Date.now() - started;
    }
  }
  async entities(
    tool: "qloo_search" | "qloo_recommend" | "qloo_rank",
    endpoint: string,
    params: Record<string, string>,
    traces: TasteTrace[],
    signal?: AbortSignal,
  ): Promise<TasteEntity[]> {
    const start = traces.length;
    const body = record(
      await this.request(tool, endpoint, params, traces, signal),
    );
    const results = Array.isArray(body.results)
      ? body.results
      : record(body.results).entities;
    if (!Array.isArray(results)) {
      traces[start].status = "error";
      traces[start].error = "Invalid entity response.";
      throw new TasteError(
        "qloo_contract",
        "Qloo returned an unexpected response. No recommendations were produced.",
        502,
      );
    }
    const entities = results
      .map(normalizeEntity)
      .filter((e): e is TasteEntity => !!e);
    if (results.length && !entities.length) {
      traces[start].status = "error";
      traces[start].error = "Unrecognized entities.";
      throw new TasteError(
        "qloo_contract",
        "Qloo returned entities Afinlo could not validate.",
        502,
      );
    }
    traces[start].count = entities.length;
    return entities;
  }
  search(
    query: string,
    category: Category,
    traces: TasteTrace[],
    signal?: AbortSignal,
  ) {
    return this.entities(
      "qloo_search",
      "/search",
      { query, types: QLOO_TYPES[category], take: "10" },
      traces,
      signal,
    );
  }
  recommend(
    seeds: string[],
    excluded: string[],
    category: Category,
    location: string,
    traces: TasteTrace[],
    signal?: AbortSignal,
  ) {
    if (!seeds.length)
      throw new TasteError(
        "no_taste_signals",
        "Add at least one confirmed interest before discovering matches.",
      );
    const params: Record<string, string> = {
      "filter.type": QLOO_TYPES[category],
      "signal.interests.entities": seeds.join(","),
      "filter.exclude.entities": [...new Set([...seeds, ...excluded])].join(
        ",",
      ),
      take: "8",
    };
    if (location && GEOGRAPHIC.includes(category)) {
      params["filter.location.query"] = location;
      params["filter.location.radius"] = "0";
    }
    return this.entities(
      "qloo_recommend",
      "/v2/insights",
      params,
      traces,
      signal,
    );
  }
  /**
   * Ranks a business's own shortlist (its offerings' entities, one category) against a customer's taste: entity and/or
   * tag signals, with `filter.results.entities` limiting Qloo to the shortlist. Entities Qloo has no data for are
   * simply absent from the result.
   */
  rank(
    signals: { entities: string[]; tags: string[] },
    shortlist: string[],
    category: Category,
    traces: TasteTrace[],
    signal?: AbortSignal,
  ) {
    if (!signals.entities.length && !signals.tags.length)
      throw new TasteError(
        "no_taste_signals",
        "Add at least one confirmed interest before matching.",
      );
    if (!shortlist.length) return Promise.resolve([]);
    const params: Record<string, string> = {
      "filter.type": QLOO_TYPES[category],
      "filter.results.entities": shortlist.join(","),
      take: String(Math.min(50, shortlist.length)),
    };
    if (signals.entities.length)
      params["signal.interests.entities"] = signals.entities.join(",");
    if (signals.tags.length)
      params["signal.interests.tags"] = signals.tags.join(",");
    return this.entities("qloo_rank", "/v2/insights", params, traces, signal);
  }
  /** Qloo tags matching a word or phrase ("jazz", "film noir"), for interests that are a genre rather than a title. */
  async searchTags(
    query: string,
    traces: TasteTrace[],
    signal?: AbortSignal,
  ): Promise<TasteTag[]> {
    const start = traces.length;
    const body = record(
      await this.request(
        "qloo_tag_search",
        "/v2/tags",
        { "filter.query": query, take: "8" },
        traces,
        signal,
      ),
    );
    const tags = record(body.results).tags;
    if (!Array.isArray(tags)) {
      traces[start].status = "error";
      traces[start].error = "Invalid tags response.";
      throw new TasteError(
        "qloo_contract",
        "Qloo returned an unexpected tag search response.",
        502,
      );
    }
    const result = tags.flatMap((v) => {
      const t = record(v);
      const id = str(t.tag_id || t.id, 200);
      return id.startsWith("urn:tag:") && str(t.name)
        ? [{ id, name: str(t.name, 120), type: str(t.type, 120) || undefined }]
        : [];
    });
    traces[start].count = result.length;
    return result;
  }
  /**
   * Tags associated with the seeds, limited to tags used by the seeds' own categories. Unfiltered, the hackathon API
   * returned unrelated tags (hotel ratings for a band) all at affinity 1 (live check, 26 Oct 2026).
   */
  async tags(
    seeds: string[],
    traces: TasteTrace[],
    signal?: AbortSignal,
    categories: Category[] = [],
  ): Promise<TasteTag[]> {
    const start = traces.length;
    const parameters: Record<string, string> = {
      "filter.type": "urn:tag",
      "signal.interests.entities": seeds.join(","),
      take: "12",
    };
    if (categories.length)
      parameters["filter.parents.types"] = [
        ...new Set(categories.map((c) => QLOO_TYPES[c])),
      ].join(",");
    const body = record(
      await this.request(
        "qloo_taste_tags",
        "/v2/insights",
        parameters,
        traces,
        signal,
      ),
    );
    const tags = record(body.results).tags;
    if (!Array.isArray(tags)) {
      traces[start].status = "error";
      traces[start].error = "Invalid tags response.";
      throw new TasteError(
        "qloo_contract",
        "Qloo returned an unexpected taste analysis response.",
        502,
      );
    }
    const result = tags.flatMap((v) => {
      const t = record(v);
      const id = str(t.tag_id || t.id);
      return id.startsWith("urn:tag:") && str(t.name)
        ? [
            {
              id,
              name: str(t.name, 120),
              affinity: finite(record(t.query).affinity),
            },
          ]
        : [];
    });
    traces[start].count = result.length;
    return result;
  }
}
