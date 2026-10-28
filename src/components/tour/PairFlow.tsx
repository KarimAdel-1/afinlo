"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Heart, LoaderCircle, Map as MapIcon, Route, Sparkles } from "lucide-react";
import type { Act, TourStage, MapCity } from "@/core/tour/types";
import { Avatar } from "./Avatar";
import { postJson, streamRun } from "./client";
import { EntitySearch } from "./EntitySearch";
import { ExampleCard, GetsPanel, RunPanel, StepBar } from "./FlowParts";

type Step = "first" | "second" | "running";
const STEPS: Step[] = ["first", "second", "running"];
const kindOf = (a: Act) => (a.comedian ? "Comedian" : a.kind === "person" ? "Person" : "Artist");
const about = (a: Act) => [a.disambiguation, a.description].filter(Boolean).join(" · ").slice(0, 300) || "No description in Qloo";
const Kind = ({ act }: { act: Act }) => <span className={`hl-kind ${act.comedian ? "comic" : ""}`}>{kindOf(act)}</span>;

function ActCard({ act, onChange }: { act: Act; onChange: () => void }) {
  return (
    <div className="hl-act">
      <Avatar name={act.name} image={act.image} size={60} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <b>
          {act.name} <Kind act={act} />
        </b>
        <p>{about(act)}</p>
      </div>
      <button type="button" className="hl-button hl-button-quiet hl-button-small" onClick={onChange}>
        Change
      </button>
    </div>
  );
}

/** The co-headliner finder: pick an act, pick a second (Qloo suggests acts whose fans overlap), watch the agent work. */
export function PairFlow({
  qloo,
  tiles,
  picks,
  example,
}: {
  qloo: boolean;
  tiles: [number, number][];
  picks: string[];
  example?: { id: string; name: string; heat?: [number, number, number][]; cities: MapCity[] };
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("first");
  const [a, setA] = useState<Act>();
  const [b, setB] = useState<Act>();
  const [stops, setStops] = useState(7);
  const [suggested, setSuggested] = useState<{ for: string; acts: Act[] }>();
  const [suggestError, setSuggestError] = useState("");
  const [stages, setStages] = useState<TourStage[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef(step);

  useEffect(() => {
    if (shown.current !== step) heading.current?.focus();
    shown.current = step;
  }, [step]);

  // Qloo's suggestions for the first act: the acts whose audiences overlap most with its own.
  useEffect(() => {
    if (step !== "second" || !a || suggested?.for === a.id) return;
    const ask = async () => {
      try {
        const { acts } = await postJson<{ acts: Act[] }>("/api/tour/similar", { actId: a.id });
        setSuggested({ for: a.id, acts });
      } catch (e) {
        setSuggestError((e as Error).message);
      }
    };
    void ask();
  }, [step, a, suggested]);

  const start = async () => {
    if (!a || !b) return;
    setStep("running");
    setRunning(true);
    setError("");
    setStages([]);
    try {
      const id = await streamRun("/api/tour/pairs", { aId: a.id, bId: b.id, stops }, (s) => setStages((v) => [...v, s]));
      router.push(`/co-headline/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
    }
  };
  const suggestions = suggested?.for === a?.id ? suggested?.acts : undefined;

  return (
    <>
      <StepBar steps={["First act", "Co-headliner", "Get the pairing"]} at={STEPS.indexOf(step)} />
      <div className="hl-flow-grid">
        {step === "first" && (
          <section className="hl-panel" aria-labelledby="hl-step">
            <h2 id="hl-step" ref={heading} tabIndex={-1}>
              Who&apos;s headlining?
            </h2>
            <p>Search for the first artist or comedian, then choose the exact match from Qloo.</p>
            <EntitySearch
              type="act"
              label="The first act"
              placeholder="Artist or comedian"
              qloo={qloo}
              picks={picks}
              describe={about}
              badge={(act) => <Kind act={act} />}
              onChoose={(act) => {
                setA(act);
                setB(undefined);
                setStep("second");
              }}
            />
          </section>
        )}

        {step === "second" && a && (
          <section className="hl-panel" aria-labelledby="hl-step">
            <h2 id="hl-step" ref={heading} tabIndex={-1}>
              {b ? "Ready to pair" : "Pick a co-headliner"}
            </h2>
            <p>{b ? "Choose the tour length, then see where the two crowds meet." : "Qloo's suggestions are the acts whose fans overlap most. Or search for any act."}</p>
            <ActCard act={a} onChange={() => setStep("first")} />
            {b ? (
              <>
                <p className="hl-pair-plus" aria-hidden>
                  +
                </p>
                <ActCard act={b} onChange={() => setB(undefined)} />
                <div className="hl-question" role="group" aria-labelledby="hl-q-stops">
                  <b id="hl-q-stops">How many cities?</b>
                  <p>The double bill goes where both audiences are strongest, ordered to keep the drives short.</p>
                  <div className="hl-seg hl-seg-num">
                    {[4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <button key={n} type="button" aria-pressed={stops === n} onClick={() => setStops(n)}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="hl-cta">
                  <p>Takes under a minute. No sign-up.</p>
                  <button type="button" className="hl-button hl-button-big" onClick={() => void start()} disabled={!qloo}>
                    Pair them <ArrowRight size={18} aria-hidden />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="hl-question">
                  <b>Fans overlap with {a.name}&apos;s</b>
                  {suggestions ? (
                    suggestions.length ? (
                      <ul className="hl-results" aria-label={`Acts whose fans overlap with ${a.name}'s`}>
                        {suggestions.map((s) => (
                          <li key={s.id}>
                            <button type="button" className="hl-result-row" onClick={() => setB(s)}>
                              <Avatar name={s.name} image={s.image} size={48} />
                              <span style={{ minWidth: 0 }}>
                                <b>
                                  {s.name} <Kind act={s} />
                                </b>
                                <small>{about(s)}</small>
                              </span>
                              <ArrowRight size={20} aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="hl-hint">Qloo has no suggestions for this act. Search for one below.</p>
                    )
                  ) : suggestError ? (
                    <p className="hl-hint">{suggestError}</p>
                  ) : (
                    <p className="hl-hint">
                      <LoaderCircle size={15} className="hl-spin" aria-hidden /> Asking Qloo…
                    </p>
                  )}
                </div>
                <div className="hl-question">
                  <b>Or search for any act</b>
                  <EntitySearch type="act" label="The co-headliner" placeholder="Artist or comedian" qloo={qloo} describe={about} badge={(act) => <Kind act={act} />} onChoose={(act) => act.id !== a.id && setB(act)} />
                </div>
              </>
            )}
          </section>
        )}

        {step === "running" && a && b && (
          <RunPanel
            headingRef={heading}
            title={`Pairing ${a.name} and ${b.name}`}
            waiting="Afinlo is asking Qloo about both audiences. The pairing opens as soon as it's ready."
            stages={stages}
            running={running}
            error={error}
            tiles={tiles}
            onBack={() => setStep("second")}
            onRetry={() => void start()}
          />
        )}

        <aside className="hl-side" aria-label="What a pairing includes">
          <GetsPanel
            items={[
              [MapIcon, "Where both crowds are", "The cities where both audiences are strong, on one map."],
              [Heart, "What they share", "The taste both crowds have in common, from Qloo."],
              [Sparkles, "What each one brings", "The cities only one of the acts is strong in."],
              [Route, "A double-bill route", "The best shared cities, ordered to keep the drives short."],
            ]}
          />
          {example && <ExampleCard href={`/co-headline/${example.id}`} title={`See ${example.name}`} tiles={tiles} heat={example.heat} cities={example.cities} />}
        </aside>
      </div>
    </>
  );
}
