"use client";

import { useEffect, useId, useRef } from "react";

/** A damped spring that chases a target, retargetable mid-flight without a jump; solved in closed form, so frame length doesn't matter. */
class Spring {
  velocity = 0;
  constructor(
    public value: number,
    private readonly frequency: number,
    private readonly damping: number,
  ) {}
  step(target: number, dt: number) {
    const w = this.frequency,
      x = this.value - target,
      v = this.velocity;
    if (this.damping < 1) {
      const rate = this.damping * w,
        wd = w * Math.sqrt(1 - this.damping ** 2);
      const decay = Math.exp(-rate * dt),
        cos = Math.cos(wd * dt),
        sin = Math.sin(wd * dt);
      const k = (v + rate * x) / wd;
      this.value = target + decay * (x * cos + k * sin);
      this.velocity = decay * (v * cos - (rate * k + wd * x) * sin);
    } else {
      const decay = Math.exp(-w * dt),
        k = v + w * x;
      this.value = target + decay * (x + k * dt);
      this.velocity = decay * (v - w * k * dt);
    }
    return this.value;
  }
}

/** One eye's pose: how big it is, how far its upper and lower lids come in (0–1), and how much it's a smiling arc. */
interface EyePose {
  scale: number;
  lid: number;
  lower: number;
  happy: number;
}
const NEUTRAL: EyePose = { scale: 1, lid: 0, lower: 0, happy: 0 };
/** The faces it wanders off to from neutral, each held a moment: incredulous, tired, happy. */
const FACES: { left: Partial<EyePose>; right: Partial<EyePose>; hold: number; weight: number }[] = [
  { left: { scale: 1.16 }, right: { lid: 0.32 }, hold: 1.5, weight: 1 },
  { left: { lower: 0.3 }, right: { lower: 0.3 }, hold: 2.5, weight: 1 },
  { left: { happy: 1, scale: 1.15 }, right: { happy: 1, scale: 1.15 }, hold: 0.6, weight: 0.5 },
];

/** A blink's openness over its 0.33 s: a quick close, a short hold, and a springy reopen. */
const blinkAt = (t: number) => {
  if (t < 0.09) return 1 - t / 0.09;
  if (t < 0.13) return 0;
  const u = Math.min((t - 0.13) / 0.2, 1) - 1;
  return 1 + 2.7 * u ** 3 + 1.7 * u ** 2;
};

/** The body: a superellipse, soft at the corners and a little wider than tall, around (100, 104). */
const BODY = (() => {
  const points: string[] = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * 2 * Math.PI,
      c = Math.cos(a),
      s = Math.sin(a);
    const x = 100 + 70 * Math.sign(c) * Math.abs(c) ** (2 / 3.4);
    const y = 104 + 64 * Math.sign(s) * Math.abs(s) ** (2 / 3.4) + (s > 0 ? 4 * s : 0);
    points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M${points.join("L")}Z`;
})();

const EYE = { rx: 11, ry: 24, gap: 19, y: 92, tilt: 8 };

/**
 * Afinlo's assistant, drawn: a soft plush body in Afinlo's blue with two expressive eyes. They blink (now and then
 * twice), follow the pointer, wander when it's still, and make a face from time to time: incredulous, tired, happy.
 * While the assistant works (`thinking`), it wobbles and its eyes search. Still for reduced motion. Decorative.
 */
export function Mascot({ size = 170, thinking = false }: { size?: number; thinking?: boolean }) {
  const id = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const body = useRef<SVGGElement>(null);
  const face = useRef<SVGGElement>(null);
  const eyes = useRef<{ open: SVGEllipseElement | null; arc: SVGPathElement | null; clip: SVGRectElement | null }[]>([
    { open: null, arc: null, clip: null },
    { open: null, arc: null, clip: null },
  ]);
  const working = useRef(thinking);
  useEffect(() => {
    working.current = thinking;
  }, [thinking]);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0,
      last = performance.now(),
      t = 0;
    const look = { x: new Spring(0, 14, 0.8), y: new Spring(0, 14, 0.8) };
    const pose = [0, 1].map(() => ({ scale: new Spring(1, 40, 1), lid: new Spring(0, 40, 1), lower: new Spring(0, 40, 1), happy: new Spring(0, 30, 1) }));
    const wobble = new Spring(0, 9, 0.35);
    let target = { x: 0, y: 0 },
      pointerAt = -10;
    let faceNow: (typeof FACES)[number] | undefined,
      faceUntil = 0,
      nextFace = 3 + Math.random() * 4;
    let blinkStart = -1,
      nextBlink = 1.5 + Math.random() * 2,
      doubled = false,
      nextWander = 2;

    const onPointer = (e: PointerEvent) => {
      const box = svg.current?.getBoundingClientRect();
      if (!box) return;
      const dx = e.clientX - (box.left + box.width / 2),
        dy = e.clientY - (box.top + box.height / 2);
      const reach = Math.max(260, box.width * 1.6);
      target = { x: Math.max(-1, Math.min(1, dx / reach)), y: Math.max(-1, Math.min(1, dy / reach)) };
      pointerAt = t;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt;
      const busy = working.current;

      // Where it looks: the pointer, or a wander of its own when the pointer is still; searching while it works.
      if (busy) target = { x: 0.55 * Math.sin(t * 1.6), y: -0.45 };
      else if (t - pointerAt > 3 && t > nextWander) {
        target = Math.random() < 0.4 ? { x: 0, y: 0 } : { x: Math.random() * 1.4 - 0.7, y: Math.random() * 0.8 - 0.4 };
        nextWander = t + 1.5 + Math.random() * 2.5;
      }
      const gx = look.x.step(target.x, dt),
        gy = look.y.step(target.y, dt);

      // A face now and then, held a moment, then back to neutral; none while it works.
      if (!busy && !faceNow && t > nextFace) {
        const total = FACES.reduce((s, f) => s + f.weight, 0);
        let r = Math.random() * total;
        faceNow = FACES.find((f) => (r -= f.weight) < 0) ?? FACES[0];
        faceUntil = t + faceNow.hold;
      }
      if (faceNow && (t > faceUntil || busy)) {
        faceNow = undefined;
        nextFace = t + 4 + Math.random() * 5;
      }

      // Blinks, sometimes as a quick pair; never through a happy face.
      if (blinkStart < 0 && t > nextBlink && !(faceNow && faceNow.left.happy)) {
        blinkStart = t;
        doubled = Math.random() < 0.2;
      }
      let blink = 1;
      if (blinkStart >= 0) {
        const since = t - blinkStart;
        blink = blinkAt(since);
        if (since > 0.33) {
          blinkStart = doubled ? t + 0.05 : -1;
          if (doubled) doubled = false;
          else nextBlink = t + 2 + Math.random() * 3.5;
        }
      }

      // The body breathes, and wobbles like jelly while it works.
      const jiggle = wobble.step(busy ? Math.sin(t * 7) * 0.06 : 0, dt);
      const breath = Math.sin(t * 2.2) * 0.012;
      body.current?.setAttribute("transform", `translate(100 172) scale(${1 + jiggle - breath * 0.5} ${1 - jiggle + breath}) translate(-100 -172)`);
      face.current?.setAttribute("transform", `translate(${(gx * 16).toFixed(2)} ${(gy * 11).toFixed(2)})`);

      [faceNow?.left, faceNow?.right].forEach((want, i) => {
        const goal = { ...NEUTRAL, ...want };
        const p = pose[i];
        const scale = p.scale.step(goal.scale, dt),
          lid = p.lid.step(goal.lid, dt),
          lower = p.lower.step(goal.lower, dt),
          happy = p.happy.step(goal.happy, dt);
        const el = eyes.current[i];
        const open = Math.max(blink, 0);
        // Shut, an eye is a short rounded bar, not nothing.
        el.open?.setAttribute("rx", (EYE.rx * scale * (1 + (1 - open) * 0.35)).toFixed(2));
        el.open?.setAttribute("ry", Math.max(EYE.ry * scale * Math.max(blink, 0.12), 2.6).toFixed(2));
        el.open?.setAttribute("opacity", (1 - happy).toFixed(2));
        el.arc?.setAttribute("opacity", happy.toFixed(2));
        // The lids: a window over the eye whose top comes down and whose bottom comes up.
        const h = EYE.ry * 2 * scale + 8;
        el.clip?.setAttribute("y", (-h / 2 + lid * (h - 8)).toFixed(2));
        el.clip?.setAttribute("height", Math.max(h - (lid + lower) * (h - 8), 3).toFixed(2));
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <svg ref={svg} className={`hl-mascot${thinking ? " thinking" : ""}`} width={size} height={size} viewBox="0 0 200 200" aria-hidden focusable="false">
      <defs>
        <radialGradient id={`${id}-body`} cx="0.36" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#8f86ff" />
          <stop offset="0.55" stopColor="#4336ff" />
          <stop offset="1" stopColor="#2b1fd9" />
        </radialGradient>
        <radialGradient id={`${id}-sheen`} cx="0.38" cy="0.22" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-shadow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#262a3f" stopOpacity="0.2" />
          <stop offset="1" stopColor="#262a3f" stopOpacity="0" />
        </radialGradient>
        {[0, 1].map((i) => (
          <clipPath key={i} id={`${id}-lid${i}`}>
            <rect
              ref={(el) => {
                eyes.current[i].clip = el;
              }}
              x={-EYE.rx * 2}
              y={-EYE.ry - 4}
              width={EYE.rx * 4}
              height={EYE.ry * 2 + 8}
            />
          </clipPath>
        ))}
      </defs>
      <ellipse cx="100" cy="182" rx="56" ry="8" fill={`url(#${id}-shadow)`} />
      <g ref={body}>
        <path d={BODY} fill={`url(#${id}-body)`} />
        <path d={BODY} fill={`url(#${id}-sheen)`} transform="translate(100 104) scale(0.86) translate(-100 -104)" />
        <g ref={face}>
          {[-1, 1].map((side, i) => (
            <g key={side} transform={`translate(${100 + side * EYE.gap} ${EYE.y}) rotate(${EYE.tilt})`}>
              <g clipPath={`url(#${id}-lid${i})`}>
                <ellipse
                  ref={(el) => {
                    eyes.current[i].open = el;
                  }}
                  className="hl-mascot-eye"
                  rx={EYE.rx}
                  ry={EYE.ry}
                  fill="#14152b"
                />
              </g>
              <path
                ref={(el) => {
                  eyes.current[i].arc = el;
                }}
                d="M-12 6 Q0 -12 12 6"
                fill="none"
                stroke="#14152b"
                strokeWidth="6"
                strokeLinecap="round"
                opacity="0"
              />
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}
