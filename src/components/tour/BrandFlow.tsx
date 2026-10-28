"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Gauge, Map as MapIcon, Route, Users } from "lucide-react";
import type { Brand, TourStage, MapCity } from "@/core/tour/types";
import { Avatar } from "./Avatar";
import { streamRun } from "./client";
import { EntitySearch } from "./EntitySearch";
import { ExampleCard, GetsPanel, RunPanel, StepBar } from "./FlowParts";
import { categoryOf } from "./sponsors";

type Step = "find" | "options" | "running";
const STEPS: Step[] = ["find", "options", "running"];
const KINDS = [
  ["both", "Artists and comedians"],
  ["music", "Artists"],
  ["comedy", "Comedians"],
] as const;
const about = (b: Brand) => [categoryOf(b.categories), b.description].filter(Boolean).join(" · ").slice(0, 300) || "No description in Qloo";

/** For brands: find the brand in Qloo and confirm the exact one, choose which acts, watch the agent work. */
export function BrandFlow({
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
  const [step, setStep] = useState<Step>("find");
  const [brand, setBrand] = useState<Brand>();
  const [acts, setActs] = useState<(typeof KINDS)[number][0]>("both");
  const [stages, setStages] = useState<TourStage[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef(step);

  // Each new step's heading takes the focus, so keyboard and screen reader users start there.
  useEffect(() => {
    if (shown.current !== step) heading.current?.focus();
    shown.current = step;
  }, [step]);

  const start = async () => {
    if (!brand) return;
    setStep("running");
    setRunning(true);
    setError("");
    setStages([]);
    try {
      const id = await streamRun("/api/tour/brands", { brandId: brand.id, acts }, (s) => setStages((v) => [...v, s]));
      router.push(`/brands/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
    }
  };

  return (
    <>
      <StepBar steps={["Find the brand", "Choose the acts", "Get the matches"]} at={STEPS.indexOf(step)} />
      <div className="hl-flow-grid">
        {step === "find" && (
          <section className="hl-panel" aria-labelledby="hl-step">
            <h2 id="hl-step" ref={heading} tabIndex={-1}>
              Which brand?
            </h2>
            <p>Search Qloo for a brand, then choose the exact one.</p>
            <EntitySearch
              type="brand"
              label="A brand"
              placeholder="A brand, e.g. Liquid Death"
              qloo={qloo}
              picks={picks}
              describe={about}
              onChoose={(b) => {
                setBrand(b);
                setStep("options");
              }}
            />
          </section>
        )}

        {step === "options" && brand && (
          <section className="hl-panel" aria-labelledby="hl-step">
            <h2 id="hl-step" ref={heading} tabIndex={-1}>
              Choose the acts
            </h2>
            <p>Afinlo asks Qloo which acts this brand&apos;s audience loves, then where both audiences are strongest.</p>
            <div className="hl-act">
              <Avatar name={brand.name} image={brand.image} size={60} fit="contain" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <b>{brand.name}</b>
                <p>{about(brand)}</p>
              </div>
              <button type="button" className="hl-button hl-button-quiet hl-button-small" onClick={() => setStep("find")}>
                Change
              </button>
            </div>
            <div className="hl-question" role="group" aria-labelledby="hl-q-acts">
              <b id="hl-q-acts">Which acts?</b>
              <p>Musicians come from Qloo&apos;s artists; comedians from the people Qloo tags as comedians.</p>
              <div className="hl-seg">
                {KINDS.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={acts === value} onClick={() => setActs(value)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="hl-cta">
              <p>Takes under a minute. No sign-up.</p>
              <button type="button" className="hl-button hl-button-big" onClick={() => void start()} disabled={!qloo}>
                Find the acts <ArrowRight size={18} aria-hidden />
              </button>
            </div>
          </section>
        )}

        {step === "running" && brand && (
          <RunPanel
            headingRef={heading}
            title={`Finding acts for ${brand.name}`}
            waiting="Afinlo is asking Qloo about this brand's audience. The matches open as soon as they're ready."
            stages={stages}
            running={running}
            error={error}
            tiles={tiles}
            onBack={() => setStep("options")}
            onRetry={() => void start()}
          />
        )}

        <aside className="hl-side" aria-label="What a match includes">
          <GetsPanel
            items={[
              [Users, "Acts whose fans love the brand", "Artists and comedians this audience over-indexes for, ranked by Brand Fit."],
              [MapIcon, "Where both audiences meet", "The cities where the brand's fans and each act's fans are strongest together."],
              [Gauge, "Reach for each act", "Household names, established acts and rising acts, weighed for fit."],
              [Route, "A tour for any of them", "Open a full tour and sponsorship plan for an act in one click."],
            ]}
          />
          {example && <ExampleCard href={`/brands/${example.id}`} title={`See ${example.name}'s matches`} tiles={tiles} heat={example.heat} cities={example.cities} />}
        </aside>
      </div>
    </>
  );
}
