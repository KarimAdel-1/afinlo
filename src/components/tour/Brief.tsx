"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Globe2, LoaderCircle, MapPin, Search, Sparkles, X } from "lucide-react";
import { newActOf } from "@/core/tour/named";
import { regionById, whereLabel, type RegionId, type Where } from "@/core/tour/regions";
import { MAX_SKIPPED_CITIES, MAX_TURNED_DOWN_BRANDS, SPONSOR_CATEGORIES, type Act, type ActMemory, type TourStage, type SponsorCategory } from "@/core/tour/types";
import { AgentTrace } from "./AgentTrace";
import { Avatar } from "./Avatar";
import { postJson, streamPlan } from "./client";
import { TourMap } from "./TourMap";

type Step = "act" | "where" | "shape" | "build";
const STEPS: [Step, string][] = [
  ["act", "Who"],
  ["where", "Where"],
  ["shape", "What matters"],
  ["build", "The tour"],
];
interface Scan {
  basis: "act" | "similar" | "named";
  similar: string[];
  points: [number, number, number][];
  countries: { iso: string; name: string; heat: number; cities: number; top: { id: string; name: string; heat: number; lat: number; lon: number } }[];
  regions: { id: RegionId; label: string; heat: number; countries: string[] }[];
}
const kindOf = (a: Act) => (a.comedian ? "Comedian" : a.kind === "person" ? "Person" : "Artist");
/** Where the tour goes, as the brief names it on its own. */
const areaName = (w: Where) => (w.kind === "world" ? "The whole world" : whereLabel(w));
const about = (a: Act) => [a.disambiguation, a.description].filter(Boolean).join(" · ").slice(0, 220) || "No description in Qloo";
const CATS = Object.entries(SPONSOR_CATEGORIES) as [SponsorCategory, (typeof SPONSOR_CATEGORIES)[SponsorCategory]][];

/** The map's view of a region: its box's centre, zoomed to fit it. */
function viewOf(region: RegionId) {
  const [w, s, e, n] = regionById(region).box;
  const span = Math.max(e - w, (n - s) * 1.6);
  return { lat: (s + n) / 2, lon: (w + e) / 2, zoom: Math.max(1.2, Math.min(5.2, Math.log2(360 / span) + 0.4)) };
}

/**
 * A new tour, as a brief: who's touring (from Qloo), where (from a first look at where their fans are, worldwide),
 * and what matters (length, focus, home, sponsors to pitch and never pitch). Afinlo remembers each act's answers.
 */
export function Brief({ qloo, initialQuery = "", initialAct, initialLike, picks }: { qloo: boolean; initialQuery?: string; initialAct?: Act; initialLike?: Act[]; picks: string[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialAct ? "where" : "act");
  const [query, setQuery] = useState(initialQuery);
  const [matches, setMatches] = useState<Act[]>();
  const [searching, setSearching] = useState(false);
  const [act, setAct] = useState<Act | undefined>(initialAct);
  // An act Qloo doesn't know: being named, and the acts it's like once it is.
  const [naming, setNaming] = useState(false);
  const [like, setLike] = useState<Act[]>(initialLike ?? []);
  const [scan, setScan] = useState<Scan>();
  const [scanError, setScanError] = useState("");
  const [area, setArea] = useState<Where>();
  const [countryQuery, setCountryQuery] = useState("");
  const [stops, setStops] = useState(7);
  const [focus, setFocus] = useState<"balanced" | "hidden">("balanced");
  const [home, setHome] = useState("");
  const [homes, setHomes] = useState<{ id: string; name: string; area: string }[]>([]);
  const [categories, setCategories] = useState<SponsorCategory[]>([]);
  const [avoid, setAvoid] = useState<SponsorCategory[]>([]);
  const [memory, setMemory] = useState<ActMemory>();
  const [stages, setStages] = useState<TourStage[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const asked = useRef("");
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef(step);

  useEffect(() => {
    if (shown.current !== step) heading.current?.focus();
    shown.current = step;
  }, [step]);

  const search = async (q: string) => {
    const term = q.trim();
    if (term.length < 2 || term === asked.current) return;
    asked.current = term;
    setSearching(true);
    setError("");
    try {
      const { acts } = await postJson<{ acts: Act[] }>("/api/tour/search", { query: term });
      if (asked.current === term) setMatches(acts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };
  useEffect(() => {
    if (step !== "act" || query.trim().length < 3) return;
    const t = setTimeout(() => void search(query), query === initialQuery ? 0 : 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the query and step only
  }, [query, step]);

  // With the act chosen: the world scan, and what Afinlo remembers about the act.
  useEffect(() => {
    if (!act) return;
    let cancelled = false;
    void postJson<Scan>("/api/tour/scan", act.predicted ? { newAct: { name: act.name, comedian: act.comedian, like: like.map((a) => a.id) } } : { actId: act.id })
      .then((s) => {
        if (cancelled) return;
        setScan(s);
        setArea((a) => a ?? (s.regions[0] ? { kind: "region", region: s.regions[0].id } : undefined));
      })
      .catch((e) => !cancelled && setScanError((e as Error).message));
    void fetch(`/api/tour/acts/${act.id}/memory`)
      .then((r) => r.json())
      .then(({ memory: m }: { memory: ActMemory | null }) => {
        if (cancelled || !m) return;
        setMemory(m);
        if (m.where) setArea(m.where);
        // Used only while it's in the area chosen (homeId).
        if (m.homeCityId) setHome(m.homeCityId);
        if (m.stops) setStops(m.stops);
        if (m.focus) setFocus(m.focus);
        if (m.categories) setCategories(m.categories);
        if (m.avoid) setAvoid(m.avoid);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the acts it's like are set with the act
  }, [act]);

  // The area's cities, for where the tour starts.
  const areaKey = area ? (area.kind === "world" ? "world=1" : area.kind === "region" ? `region=${area.region}` : `countries=${area.countries.join(",")}`) : "";
  useEffect(() => {
    if (!areaKey) return;
    let cancelled = false;
    void fetch(`/api/tour/cities?${areaKey}`)
      .then((r) => r.json())
      .then(({ cities }: { cities: typeof homes }) => !cancelled && setHomes(cities))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [areaKey]);
  // A home chosen for one area doesn't carry to another.
  const homeId = homes.some((h) => h.id === home) ? home : "";

  const mapFocus = useMemo(() => {
    if (!area) return undefined;
    if (area.kind === "world") return { lat: 25, lon: 10, zoom: 1.2 };
    if (area.kind === "region") return viewOf(area.region);
    const tops = scan?.countries.filter((c) => area.countries.includes(c.iso)).map((c) => c.top) ?? [];
    if (!tops.length) return undefined;
    return { lat: tops.reduce((s, t) => s + t.lat, 0) / tops.length, lon: tops.reduce((s, t) => s + t.lon, 0) / tops.length, zoom: tops.length === 1 ? 4.2 : 3 };
  }, [area, scan]);

  const toggleCountry = (iso: string) => {
    const now = area?.kind === "countries" ? area.countries : [];
    const next = now.includes(iso) ? now.filter((c) => c !== iso) : [...now, iso].slice(-8);
    setArea(next.length ? { kind: "countries", countries: next } : scan?.regions[0] ? { kind: "region", region: scan.regions[0].id } : undefined);
  };
  const forget = async (change: { excludeBrandIds?: string[]; excludeCityIds?: string[]; avoid?: SponsorCategory[] }) => {
    if (!act) return;
    const res = await postJson<{ memory: ActMemory }>(`/api/tour/acts/${act.id}/memory`, { remove: change }).catch(() => undefined);
    if (res) setMemory(res.memory);
    if (change.avoid) setAvoid((v) => v.filter((c) => !change.avoid!.includes(c)));
  };

  const start = async () => {
    if (!act || !area) return;
    setStep("build");
    setRunning(true);
    setError("");
    setStages([]);
    try {
      const id = await streamPlan(
        {
          actId: act.id,
          newAct: act.predicted ? { name: act.name, comedian: act.comedian, like: like.map((a) => a.id) } : undefined,
          where: area,
          stops,
          focus,
          homeCityId: homeId || undefined,
          categories,
          avoid: avoid.filter((c) => !categories.includes(c)),
          // The newest, as many as a plan carries: a memory kept before that limit may hold more.
          excludeBrandIds: (memory?.excludeBrandIds ?? []).slice(-MAX_TURNED_DOWN_BRANDS),
          excludeCityIds: (memory?.excludeCityIds ?? []).slice(-MAX_SKIPPED_CITIES),
        },
        (s) => setStages((v) => [...v, s]),
      );
      router.push(`/tour/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
    }
  };

  const at = STEPS.findIndex(([s]) => s === step);
  const countries = (scan?.countries ?? []).filter((c) => !countryQuery || c.name.toLowerCase().includes(countryQuery.toLowerCase()));
  const chosen = area?.kind === "countries" ? area.countries : [];

  return (
    <div className="hl hl-brief">
      <div className="hl-brief-side">
        <ol className="hl-brief-steps" aria-label="Steps">
          {STEPS.map(([s, label], i) => (
            <li key={s} className={i === at ? "on" : i < at ? "done" : ""} aria-current={i === at ? "step" : undefined}>
              <span aria-hidden>{i < at ? <Check size={13} /> : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        {step === "act" && naming && (
          <NamedAct
            initialName={query.trim()}
            onBack={() => setNaming(false)}
            onDone={(a, named) => {
              setScan(undefined);
              setScanError("");
              setArea(undefined);
              setMemory(undefined);
              setLike(named);
              setAct(a);
              setNaming(false);
              setStep("where");
            }}
          />
        )}

        {step === "act" && !naming && (
          <section aria-labelledby="hl-step">
            <h1 id="hl-step" ref={heading} tabIndex={-1}>
              Who&apos;s going on tour?
            </h1>
            <p className="hl-brief-lead">An artist or comedian. Afinlo finds them in Qloo, then shows where their fans are, anywhere in the world.</p>
            <form
              className="hl-big-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                asked.current = "";
                void search(query);
              }}
            >
              <Search size={22} aria-hidden />
              <label htmlFor="hl-act" className="hl-visually-hidden">
                Artist or comedian
              </label>
              <input
                id="hl-act"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setMatches(undefined);
                }}
                placeholder="Artist or comedian"
                autoComplete="off"
                maxLength={80}
                disabled={!qloo}
                autoFocus
              />
              <button className="hl-button" disabled={!qloo || query.trim().length < 2 || searching}>
                {searching && <LoaderCircle size={18} className="hl-spin" aria-hidden />} Search
              </button>
            </form>
            {!qloo && <p className="hl-error">Qloo isn&apos;t connected on this server, so new tours can&apos;t be made right now. The examples still open.</p>}
            {error && (
              <p className="hl-error" role="alert">
                {error}
              </p>
            )}
            {!matches && !!picks.length && (
              <div className="hl-picks-row">
                <span>Try</span>
                {picks.map((p) => (
                  <button key={p} type="button" className="hl-chip-button" onClick={() => setQuery(p)}>
                    {p}
                  </button>
                ))}
              </div>
            )}
            {matches && !matches.length && <p className="hl-hint">Qloo has no act by that name. Check the spelling, or try the name they perform under.</p>}
            {matches && (
              <p className="hl-hint">
                Not in Qloo yet?{" "}
                <button type="button" className="hl-linkish" onClick={() => setNaming(true)}>
                  Plan from acts like them
                </button>
              </p>
            )}
            {!!matches?.length && (
              <ul className="hl-results" aria-label="Matches in Qloo">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="hl-result-row"
                      onClick={() => {
                        if (m.id !== act?.id) {
                          setScan(undefined);
                          setScanError("");
                          setArea(undefined);
                          setMemory(undefined);
                        }
                        setAct(m);
                        setStep("where");
                      }}
                    >
                      <Avatar name={m.name} image={m.image} size={52} />
                      <span style={{ minWidth: 0 }}>
                        <b>{m.name}</b>
                        <small>
                          {kindOf(m)} · {about(m)}
                        </small>
                      </span>
                      <ArrowRight size={18} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {step === "where" && act && (
          <section aria-labelledby="hl-step">
            <ActBadge act={act} like={like} onChange={() => setStep("act")} />
            <h1 id="hl-step" ref={heading} tabIndex={-1}>
              Where to?
            </h1>
            <p className="hl-brief-lead">The map shows where {act.name}&apos;s fans are, from Qloo&apos;s heatmap of the whole world. Pick a region, or the countries you want.</p>
            {scanError && (
              <p className="hl-error" role="alert">
                {scanError}
              </p>
            )}
            {!scan && !scanError && (
              <p className="hl-hint hl-wait">
                <LoaderCircle size={16} className="hl-spin" aria-hidden /> Looking at where {act.name}&apos;s fans are, worldwide…
              </p>
            )}
            {scan && (
              <>
                {scan.basis === "similar" && <p className="hl-note">Qloo has no map for {act.name} alone, so this is estimated from acts with overlapping audiences: {scan.similar.join(", ")}.</p>}
                {scan.basis === "named" && <p className="hl-note">Qloo doesn&apos;t know {act.name} yet, so this map is predicted from the acts you named: {scan.similar.join(", ")}.</p>}
                {!!scan.countries.length && (
                  <p className="hl-brief-top">
                    <Globe2 size={16} aria-hidden /> Strongest in {scan.countries.slice(0, 4).map((c) => c.name).join(", ")}
                  </p>
                )}
                <div className="hl-regions" role="radiogroup" aria-label="Regions">
                  <button type="button" role="radio" aria-checked={area?.kind === "world"} onClick={() => setArea({ kind: "world" })}>
                    <span>
                      <b>The whole world</b>
                      <small>The strongest cities, anywhere</small>
                    </span>
                    <Globe2 size={18} className="hl-region-globe" aria-hidden />
                  </button>
                  {scan.regions.slice(0, 7).map((r) => (
                    <button key={r.id} type="button" role="radio" aria-checked={area?.kind === "region" && area.region === r.id} onClick={() => setArea({ kind: "region", region: r.id })}>
                      <span>
                        <b>{r.label}</b>
                        <small>
                          {r.countries
                            .slice(0, 3)
                            .map((iso) => scan.countries.find((c) => c.iso === iso)?.name)
                            .filter(Boolean)
                            .join(", ")}
                        </small>
                      </span>
                      <span className="hl-region-heat" aria-label={`Fan Heat ${r.heat}`}>
                        <span style={{ width: `${Math.max(6, r.heat)}%` }} />
                      </span>
                    </button>
                  ))}
                </div>
                <details className="hl-countries" open={area?.kind === "countries"}>
                  <summary>Or choose countries{chosen.length ? `: ${chosen.length} chosen` : ""}</summary>
                  <label className="hl-country-search">
                    <Search size={16} aria-hidden />
                    <span className="hl-visually-hidden">Find a country</span>
                    <input value={countryQuery} onChange={(e) => setCountryQuery(e.target.value)} placeholder="Find a country" maxLength={40} />
                  </label>
                  <ul>
                    {countries.slice(0, 40).map((c) => (
                      <li key={c.iso}>
                        <button type="button" aria-pressed={chosen.includes(c.iso)} onClick={() => toggleCountry(c.iso)}>
                          <span>{c.name}</span>
                          <small>Fan Heat {c.heat}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
                <div className="hl-brief-foot">
                  <span className="hl-brief-choice">{area ? areaName(area) : "Choose where"}</span>
                  <button type="button" className="hl-button" disabled={!area} onClick={() => setStep("shape")}>
                    Next <ArrowRight size={17} aria-hidden />
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {step === "shape" && act && area && (
          <section aria-labelledby="hl-step">
            <ActBadge act={act} onChange={() => setStep("act")} />
            <h1 id="hl-step" ref={heading} tabIndex={-1}>
              What matters on this tour?
            </h1>
            <p className="hl-brief-lead">
              {areaName(area)}.{" "}
              <button type="button" className="hl-linkish" onClick={() => setStep("where")}>
                Change
              </button>
            </p>

            <div className="hl-question">
              <h2>How many shows?</h2>
              <div className="hl-seg hl-seg-num">
                {[4, 5, 6, 7, 8, 10, 12].map((n) => (
                  <button key={n} type="button" aria-pressed={stops === n} onClick={() => setStops(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="hl-question">
              <h2>Which cities first?</h2>
              <div className="hl-seg">
                <button type="button" aria-pressed={focus === "balanced"} onClick={() => setFocus("balanced")}>
                  The strongest, big or small
                </button>
                <button type="button" aria-pressed={focus === "hidden"} onClick={() => setFocus("hidden")}>
                  Hidden markets first
                </button>
              </div>
            </div>
            <div className="hl-question">
              <h2>Starting from</h2>
              <label className="hl-select">
                <MapPin size={16} aria-hidden />
                <span className="hl-visually-hidden">Home city</span>
                <select value={homeId} onChange={(e) => setHome(e.target.value)}>
                  <option value="">Wherever makes the shortest tour</option>
                  {homes.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}, {h.area}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="hl-question">
              <h2>Sponsors to pitch</h2>
              <p className="hl-hint">Up to three categories, or leave them all open.</p>
              <div className="hl-cats">
                {CATS.map(([key, c]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={categories.includes(key)}
                    disabled={avoid.includes(key) || (!categories.includes(key) && categories.length >= 3)}
                    onClick={() => setCategories((v) => (v.includes(key) ? v.filter((x) => x !== key) : [...v, key]))}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="hl-question">
              <h2>Never pitch</h2>
              <div className="hl-cats avoid">
                {CATS.map(([key, c]) => (
                  <button key={key} type="button" aria-pressed={avoid.includes(key)} disabled={categories.includes(key)} onClick={() => setAvoid((v) => (v.includes(key) ? v.filter((x) => x !== key) : [...v, key]))}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            {!!(memory?.excludeBrandIds?.length || memory?.excludeCityIds?.length) && (
              <div className="hl-memory">
                <Sparkles size={16} aria-hidden />
                <span>
                  Afinlo remembers for {act.name}:
                  {!!memory.excludeBrandIds?.length && ` ${memory.excludeBrandIds.length} ${memory.excludeBrandIds.length === 1 ? "brand" : "brands"} you said no to`}
                  {!!memory.excludeBrandIds?.length && !!memory.excludeCityIds?.length && ","}
                  {!!memory.excludeCityIds?.length && ` ${memory.excludeCityIds.length} ${memory.excludeCityIds.length === 1 ? "city" : "cities"} to skip`}.
                </span>
                <button type="button" className="hl-linkish" onClick={() => void forget({ excludeBrandIds: memory.excludeBrandIds, excludeCityIds: memory.excludeCityIds })}>
                  <X size={14} aria-hidden /> Forget them
                </button>
              </div>
            )}
            <div className="hl-brief-foot">
              <button type="button" className="hl-button hl-button-quiet" onClick={() => setStep("where")}>
                <ArrowLeft size={17} aria-hidden /> Back
              </button>
              <button type="button" className="hl-button hl-button-big" onClick={() => void start()} disabled={!qloo}>
                Plan the tour <ArrowRight size={18} aria-hidden />
              </button>
            </div>
          </section>
        )}

        {step === "build" && act && (
          <section aria-labelledby="hl-step">
            <ActBadge act={act} />
            <h1 id="hl-step" ref={heading} tabIndex={-1}>
              {error ? "That stopped" : `Planning ${act.name}'s tour`}
            </h1>
            <p className="hl-brief-lead">{error ? "Nothing was saved. Try again, or change the choices." : `${whereLabel(area!)}, ${stops} shows. Each step below is the agent at work: Qloo, then plain code.`}</p>
            <AgentTrace stages={stages} running={running} />
            {error && (
              <>
                <p className="hl-error" role="alert">
                  {error}
                </p>
                <div className="hl-brief-foot">
                  <button type="button" className="hl-button hl-button-quiet" onClick={() => setStep("shape")}>
                    <ArrowLeft size={17} aria-hidden /> Change the choices
                  </button>
                  <button type="button" className="hl-button" onClick={() => void start()}>
                    Try again
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </div>

      <div className="hl-brief-map">
        <TourMap points={scan?.points} focus={mapFocus} label={act ? `Where ${act.name}'s fans are, worldwide, from Qloo's heatmap` : "World map"} />
        {act && !scan && !scanError && step !== "act" && <div className="hl-brief-maptag">Asking Qloo…</div>}
      </div>
    </div>
  );
}

function ActBadge({ act, like = [], onChange }: { act: Act; like?: Act[]; onChange?: () => void }) {
  return (
    <div className="hl-actbadge">
      <Avatar name={act.name} image={act.image} size={40} />
      <span>
        <b>{act.name}</b>
        <small>{act.predicted ? `${kindOf(act)} · predicted from ${like.map((a) => a.name).join(", ")}` : kindOf(act)}</small>
      </span>
      {onChange && (
        <button type="button" className="hl-linkish" onClick={onChange}>
          Change
        </button>
      )}
    </div>
  );
}


/** An act Qloo doesn't know: its name, whether it's a comedian, and two or three acts in Qloo its fans would love. */
function NamedAct({ initialName, onBack, onDone }: { initialName: string; onBack: () => void; onDone: (act: Act, like: Act[]) => void }) {
  const [name, setName] = useState(initialName);
  const [comedian, setComedian] = useState(false);
  const [like, setLike] = useState<Act[]>([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Act[]>();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const asked = useRef("");
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const t = setTimeout(async () => {
      asked.current = term;
      setSearching(true);
      setError("");
      try {
        const { acts } = await postJson<{ acts: Act[] }>("/api/tour/search", { query: term });
        if (asked.current === term) setFound(acts);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);
  const options = (found ?? []).filter((a) => !like.some((l) => l.id === a.id));

  return (
    <section aria-labelledby="hl-step">
      <button type="button" className="hl-linkish" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden /> Back to the search
      </button>
      <h1 id="hl-step" tabIndex={-1}>
        Not in Qloo yet?
      </h1>
      <p className="hl-brief-lead">Name two or three acts in Qloo whose fans would love this one. Their fans predict where yours are, and the tour says so.</p>
      <div className="hl-question">
        <h2>The act</h2>
        <div className="hl-big-search">
          <label htmlFor="hl-new-act" className="hl-visually-hidden">
            The act&apos;s name
          </label>
          <input id="hl-new-act" value={name} onChange={(e) => setName(e.target.value)} placeholder="The act's name" autoComplete="off" maxLength={80} autoFocus={!initialName} />
        </div>
        <div className="hl-seg" style={{ marginTop: 12 }}>
          <button type="button" aria-pressed={!comedian} onClick={() => setComedian(false)}>
            Musician
          </button>
          <button type="button" aria-pressed={comedian} onClick={() => setComedian(true)}>
            Comedian
          </button>
        </div>
      </div>
      <div className="hl-question">
        <h2>Acts they&apos;re like</h2>
        {!!like.length && (
          <div className="hl-picks-row">
            {like.map((a) => (
              <button key={a.id} type="button" className="hl-chip-button" onClick={() => setLike((v) => v.filter((x) => x.id !== a.id))} aria-label={`Remove ${a.name}`}>
                {a.name} <X size={13} aria-hidden />
              </button>
            ))}
          </div>
        )}
        {like.length < 3 && (
          <form className="hl-big-search" role="search" onSubmit={(e) => e.preventDefault()}>
            <Search size={22} aria-hidden />
            <label htmlFor="hl-like" className="hl-visually-hidden">
              An act they&apos;re like
            </label>
            <input id="hl-like" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={like.length ? "Another act they're like" : "An act they're like"} autoComplete="off" maxLength={80} autoFocus={!!initialName} />
            {searching && <LoaderCircle size={18} className="hl-spin" aria-hidden />}
          </form>
        )}
        {error && (
          <p className="hl-error" role="alert">
            {error}
          </p>
        )}
        {like.length < 3 && query.trim().length >= 2 && !!options.length && (
          <ul className="hl-results" aria-label="Acts in Qloo">
            {options.slice(0, 5).map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="hl-result-row"
                  onClick={() => {
                    setLike((v) => [...v, a].slice(0, 3));
                    setQuery("");
                    setFound(undefined);
                  }}
                >
                  <Avatar name={a.name} image={a.image} size={44} />
                  <span style={{ minWidth: 0 }}>
                    <b>{a.name}</b>
                    <small>
                      {kindOf(a)} · {about(a)}
                    </small>
                  </span>
                  <Check size={18} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="hl-button" disabled={name.trim().length < 2 || like.length < 2} onClick={() => onDone(newActOf({ name, comedian }), like)}>
        Continue <ArrowRight size={18} aria-hidden />
      </button>
    </section>
  );
}
