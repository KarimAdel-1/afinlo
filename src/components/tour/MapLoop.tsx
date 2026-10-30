"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, LngLatBoundsLike, Map as MapLibre } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { flightPath } from "@/core/tour/geo";
import { heatGrid, heatLevels, heatPaint, heatSpots } from "@/core/tour/heat";
import { CLEAR_S, OVERVIEW_S, reelDelay } from "./reel";
import type { StaticStop } from "./StaticMap";
import { firstLabel, OPENFREEMAP, STYLE, tune } from "./TourMap";
import { part } from "./useLoop";

/** The heat in the landing page's blues: pale where fans lean this way, Afinlo blue where they gather, deepest at the hottest. */
const BLUES = ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(67,54,255,0)", 0.2, "rgba(150,142,255,0.1)", 0.45, "rgba(122,112,255,0.26)", 0.65, "rgba(88,76,255,0.46)", 0.82, "rgba(67,54,255,0.68)", 1, "rgba(47,34,230,0.9)"];
/** Zoomed in on an act's home ground the field runs hot everywhere, so it's turned down to let the map show through. */
const TURNED_DOWN = 0.82;
const smooth = (x: number) => x * x * (3 - 2 * x);
/** How close the camera follows a route, from the zoom that fits all of it. */
const closeZoom = (fitted: number) => Math.max(4.6, Math.min(7, fitted + 1.7));

/**
 * A tour on the real map, the tour pages' engine and colours, moving on its own in time with `t` (milliseconds into the
 * loop). With stops, the camera follows the route, zoomed in, then pulls back to all of it. With `area`, it's the heat
 * alone, closing slowly on those places. It loads as it comes near the screen, and runs only while `active`.
 */
export function MapLoop({ points = [], stops = [], area, t, active, label }: { points?: [number, number, number][]; stops?: StaticStop[]; area?: { lat: number; lon: number }[]; t: number; active: boolean; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const pins = useRef<HTMLElement[]>([]);
  const camera = useRef<string | number>("");
  const drawnAt = useRef(-1);
  const [ready, setReady] = useState(false);
  const route = !area && stops.length > 0;

  const legs = useMemo(() => stops.slice(1).map((s, i) => ({ mode: s.leg ?? "drive", line: (s.leg === "fly" ? flightPath(stops[i], s) : [[stops[i].lon, stops[i].lat], [s.lon, s.lat]]) as [number, number][] })), [stops]);

  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    const start = async () => {
      const maplibre = await import("maplibre-gl");
      maplibre.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
      if (cancelled || !box.current) return;
      const places = area ?? stops;
      const bounds = new maplibre.LngLatBounds();
      for (const p of places) bounds.extend([p.lon, p.lat]);
      const m = new maplibre.Map({
        container: box.current,
        style: `${location.origin}${STYLE}`,
        ...(places.length ? { bounds: bounds as LngLatBoundsLike, fitBoundsOptions: { padding: 44, maxZoom: 7 } } : { center: [10, 25] as [number, number], zoom: 1 }),
        attributionControl: false,
        interactive: false,
        // One world, like the tour's own map.
        renderWorldCopies: false,
        fadeDuration: 150,
        transformRequest: (url) => (url.startsWith(OPENFREEMAP) ? { url: `${location.origin}/map-tiles${url.slice(OPENFREEMAP.length)}` } : undefined),
      });
      m.on("error", () => {});
      void m.once("load", () => {
        if (cancelled) return;
        tune(m);
        if (points.length) {
          const grid = heatGrid(points);
          const data = { type: "FeatureCollection" as const, features: heatSpots(points, grid).map(([lat, lon, density, stretch]) => ({ type: "Feature" as const, properties: { density, stretch }, geometry: { type: "Point" as const, coordinates: [lon, lat] } })) };
          m.addSource("heat", { type: "geojson", data });
          m.addLayer({ id: "heat", type: "heatmap", source: "heat", paint: { ...heatPaint(grid, heatLevels(points, grid).map((level) => level * TURNED_DOWN)), "heatmap-color": BLUES, "heatmap-opacity": 1 } } as Parameters<MapLibre["addLayer"]>[0], firstLabel(m));
        }
        if (route) {
          m.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          m.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 } });
          m.addLayer({ id: "route-drive", type: "line", source: "route", filter: ["==", ["get", "mode"], "drive"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#262a3f", "line-width": 3 } });
          m.addLayer({ id: "route-fly", type: "line", source: "route", filter: ["==", ["get", "mode"], "fly"], layout: { "line-cap": "round" }, paint: { "line-color": "#262a3f", "line-width": 2.5, "line-dasharray": [1.5, 1.6] } });
          pins.current = stops.map((s, i) => {
            const pin = document.createElement("span");
            pin.className = `hl-loop-pin${s.hidden ? " lime" : ""}`;
            pin.textContent = String(i + 1);
            const holder = document.createElement("div");
            holder.append(pin);
            new maplibre.Marker({ element: holder }).setLngLat([s.lon, s.lat]).addTo(m);
            return pin;
          });
        }
        // Before it shows: the whole area, then each stop close up, so no tile arrives late as the camera moves. It waits
        // a moment at most for each, and the loop's first pass catches anything still to come.
        void (async () => {
          const settled = () => Promise.race([m.once("idle"), new Promise((done) => setTimeout(done, 500))]);
          await settled();
          if (route) {
            const zoom = closeZoom(m.getZoom());
            for (const s of stops) {
              if (cancelled) return;
              m.jumpTo({ center: [s.lon, s.lat], zoom });
              await settled();
            }
          }
          if (!cancelled) setReady(true);
        })();
      });
      map.current = m;
      resize = new ResizeObserver(() => m.resize());
      resize.observe(box.current);
    };
    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        near.disconnect();
        void start().catch(() => {});
      },
      { rootMargin: "600px" },
    );
    if (box.current) near.observe(box.current);
    return () => {
      cancelled = true;
      near.disconnect();
      resize?.disconnect();
      map.current?.remove();
      map.current = null;
    };
    // The tour's data doesn't change on a page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coming back on screen, the camera starts again from the top.
  useEffect(() => {
    if (!active) camera.current = "";
  }, [active]);

  // Each frame: the pins and the route so far, and the camera when its part of the loop changes.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !active) return;
    const seconds = t / 1000;
    const places = area ?? stops;
    if (!places.length) return;
    // Worked out only when the camera moves, not every frame.
    const framing = () => {
      const lats = places.map((p) => p.lat),
        lons = places.map((p) => p.lon);
      const whole: [[number, number], [number, number]] = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
      const padding = Math.max(30, Math.min(64, Math.min(m.getContainer().clientWidth, m.getContainer().clientHeight) * 0.16));
      const fit = m.cameraForBounds(whole, { padding, maxZoom: 7 });
      return { whole, padding, fitted: fit?.zoom ?? 4, center: fit?.center };
    };

    if (area) {
      // The heat alone: closing slowly on the area, then easing back.
      const part_ = seconds < 10.8 ? "in" : "out";
      if (camera.current !== part_) {
        camera.current = part_;
        const { fitted, center } = framing();
        if (center) m.easeTo({ center, zoom: part_ === "in" ? fitted + 0.55 : fitted, duration: part_ === "in" ? 10800 : 1200, easing: part_ === "in" ? (x) => x : smooth, essential: true });
      }
      return;
    }

    const clearing = seconds >= CLEAR_S;
    const reached = clearing ? 0 : stops.filter((_, i) => seconds >= reelDelay(i, stops.length)).length;
    pins.current.forEach((pin, i) => pin.classList.toggle("on", i < reached));
    if (Math.abs(t - drawnAt.current) >= 40) {
      drawnAt.current = t;
      const features = clearing
        ? []
        : legs.flatMap(({ mode, line }, i) => {
            const end = reelDelay(i + 1, stops.length);
            const p = part(seconds, end - Math.min(1.2, (end - reelDelay(i, stops.length)) * 0.85), end);
            if (p <= 0) return [];
            const at = smooth(p) * (line.length - 1);
            const whole_ = Math.floor(at);
            const coordinates = line.slice(0, whole_ + 1);
            if (whole_ < line.length - 1) coordinates.push([line[whole_][0] + (line[whole_ + 1][0] - line[whole_][0]) * (at - whole_), line[whole_][1] + (line[whole_ + 1][1] - line[whole_][1]) * (at - whole_)]);
            return [{ type: "Feature" as const, properties: { mode }, geometry: { type: "LineString" as const, coordinates } }];
          });
      void (m.getSource("route") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
    }
    // The camera: close on the stop being reached, back for the whole route, then on to the first stop again.
    const phase = clearing ? "home" : seconds >= OVERVIEW_S ? "all" : Math.max(0, reached - 1);
    if (camera.current !== phase) {
      camera.current = phase;
      const { whole, padding, fitted } = framing();
      if (phase === "all") m.fitBounds(whole, { padding, maxZoom: 7, duration: 1700, essential: true });
      else {
        const stop = phase === "home" ? stops[0] : stops[phase as number];
        const gap = stops.length > 1 ? (10 / (stops.length - 1)) * 1000 : 1000;
        m.easeTo({ center: [stop.lon, stop.lat], zoom: closeZoom(fitted), duration: phase === "home" ? 900 : gap * 0.95, easing: smooth, essential: true });
      }
    }
  }, [t, ready, active, area, stops, legs]);

  // The credit OpenStreetMap's licence asks for, in place of MapLibre's button.
  return (
    <div className={`hl-loop${ready ? " ready" : ""}`}>
      <div ref={box} className="hl-loop-canvas" role="img" aria-label={label} />
      <a className="hl-loop-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" tabIndex={-1}>
        © OpenStreetMap
      </a>
    </div>
  );
}
