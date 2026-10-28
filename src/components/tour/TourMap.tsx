"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibre, Marker, Popup } from "maplibre-gl";

/** A paint property's name, as MapLibre types them. */
type PaintProperty = Parameters<MapLibre["setPaintProperty"]>[1];
import "maplibre-gl/dist/maplibre-gl.css";
import { arc } from "@/core/tour/geo";
import { heatGrid, heatLevels, heatPaint, heatSpots } from "@/core/tour/heat";

/** A stop on the route, in order. `leg` is how it's reached from the stop before (or from home). */
export interface MapStop {
  id: string;
  name: string;
  /** The line under the name: "Fan Heat 91 · hidden market". */
  detail: string;
  lat: number;
  lon: number;
  hidden: boolean;
  leg?: "drive" | "fly";
}
/** A place to pin: a venue, a local partner. */
export interface MapSpot {
  id: string;
  name: string;
  detail?: string;
  lat: number;
  lon: number;
}

const OPENFREEMAP = "https://tiles.openfreemap.org";
const STYLE = "/map-tiles/styles/positron";

/**
 * The real map: OpenFreeMap's vector tiles (through this server), Qloo's heatmap as a heat layer, the route as lines
 * (straight for a drive, along the globe for a flight), numbered stops, and pins for places. Hovering a stop tells
 * the page, and the page can light one up or fly to a place. Loads in the browser only; without WebGL it says so.
 */
export function TourMap({
  points = [],
  stops = [],
  home,
  spots = [],
  active,
  activeSpot,
  onActive,
  onSelect,
  focus,
  label,
  interactive = true,
}: {
  points?: [number, number, number][];
  stops?: MapStop[];
  home?: { name: string; lat: number; lon: number };
  spots?: MapSpot[];
  active?: string;
  /** The place the page is pointing at, among the spots. */
  activeSpot?: string;
  onActive?: (id?: string) => void;
  onSelect?: (id: string) => void;
  /** Fly to this point (a stop being worked on); without it the map fits the route. */
  focus?: { lat: number; lon: number; zoom?: number };
  label: string;
  interactive?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef<Map<string, { marker: Marker; el: HTMLElement }>>(new Map());
  const pins = useRef<Map<string, { marker: Marker; el: HTMLElement }>>(new Map());
  const popup = useRef<Popup | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  // The latest callbacks, for handlers bound once.
  const handlers = useRef({ onActive, onSelect });
  useEffect(() => {
    handlers.current = { onActive, onSelect };
  });

  // The map itself, once.
  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    const placed = markers.current;
    void (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        // MapLibre finds its worker next to its own file, which the bundle moves: the bundle serves the worker too.
        maplibre.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
        if (cancelled || !box.current) return;
        lib.current = maplibre;
        const m = new maplibre.Map({
          container: box.current,
          style: `${location.origin}${STYLE}`,
          center: [0, 25],
          zoom: 1.2,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
          interactive,
          fadeDuration: 150,
          transformRequest: (url) => (url.startsWith(OPENFREEMAP) ? { url: `${location.origin}/map-tiles${url.slice(OPENFREEMAP.length)}` } : undefined),
        });
        m.touchZoomRotate.disableRotation();
        if (interactive) m.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
        m.on("error", () => {});
        void m.once("load", () => {
          if (cancelled) return;
          tune(m);
          // The credits stay one tap away (the ⓘ button) instead of covering a small map.
          box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
          setState("ready");
        });
        map.current = m;
        resize = new ResizeObserver(() => m.resize());
        resize.observe(box.current);
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
      resize?.disconnect();
      popup.current?.remove();
      map.current?.remove();
      map.current = null;
      placed.clear();
    };
  }, [interactive]);

  // The heat layer: Qloo's cells blurred into a field sized to their grid, on a scale anchored at the hottest places (heat.ts).
  useEffect(() => {
    const m = map.current;
    if (state !== "ready" || !m) return;
    const grid = heatGrid(points);
    const data = {
      type: "FeatureCollection" as const,
      features: heatSpots(points, grid).map(([lat, lon, density, stretch]) => ({ type: "Feature" as const, properties: { density, stretch }, geometry: { type: "Point" as const, coordinates: [lon, lat] } })),
    };
    const paint = heatPaint(grid, heatLevels(points, grid));
    const source = m.getSource("heat") as GeoJSONSource | undefined;
    if (source) {
      void source.setData(data);
      for (const [name, value] of Object.entries(paint)) m.setPaintProperty("heat", name as PaintProperty, value as never);
    } else {
      m.addSource("heat", { type: "geojson", data });
      m.addLayer({ id: "heat", type: "heatmap", source: "heat", paint } as Parameters<MapLibre["addLayer"]>[0], firstLabel(m));
    }
  }, [state, points]);

  // The route and its stops.
  useEffect(() => {
    const m = map.current,
      maplibre = lib.current;
    if (state !== "ready" || !m || !maplibre) return;
    const ml = maplibre;
    const legs = stops.flatMap((s, i) => {
      const from = i ? stops[i - 1] : home;
      if (!from) return [];
      const line = s.leg === "fly" ? arc(from, s) : ([[from.lon, from.lat], [s.lon, s.lat]] as [number, number][]);
      return [{ type: "Feature" as const, properties: { mode: s.leg ?? "drive" }, geometry: { type: "LineString" as const, coordinates: line } }];
    });
    const data = { type: "FeatureCollection" as const, features: legs };
    const source = m.getSource("route") as GeoJSONSource | undefined;
    if (source) void source.setData(data);
    else {
      m.addSource("route", { type: "geojson", data });
      m.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 } });
      m.addLayer({ id: "route-drive", type: "line", source: "route", filter: ["==", ["get", "mode"], "drive"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#262a3f", "line-width": 3 } });
      m.addLayer({ id: "route-fly", type: "line", source: "route", filter: ["==", ["get", "mode"], "fly"], layout: { "line-cap": "round" }, paint: { "line-color": "#262a3f", "line-width": 2.5, "line-dasharray": [1.5, 1.6] } });
    }
    for (const { marker } of markers.current.values()) marker.remove();
    markers.current.clear();
    // MapLibre moves a marker by its transform, so the pin that grows under the pointer is an element inside it.
    const holder = (pin: HTMLElement) => {
      const wrap = document.createElement("div");
      wrap.className = "hl-marker";
      wrap.append(pin);
      return wrap;
    };
    stops.forEach((s, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `hl-pin${s.hidden ? " lime" : ""}`;
      el.textContent = String(i + 1);
      el.setAttribute("aria-label", `Stop ${i + 1}: ${s.name}, ${s.detail}`);
      el.addEventListener("mouseenter", () => {
        handlers.current.onActive?.(s.id);
        show(s);
      });
      el.addEventListener("mouseleave", () => {
        handlers.current.onActive?.(undefined);
        popup.current?.remove();
      });
      el.addEventListener("click", () => handlers.current.onSelect?.(s.id));
      markers.current.set(s.id, { marker: new maplibre.Marker({ element: holder(el) }).setLngLat([s.lon, s.lat]).addTo(m), el });
    });
    if (home && !stops.some((s) => s.lat === home.lat && s.lon === home.lon)) {
      const el = document.createElement("span");
      el.className = "hl-pin home";
      el.title = `Home: ${home.name}`;
      markers.current.set("home", { marker: new maplibre.Marker({ element: holder(el) }).setLngLat([home.lon, home.lat]).addTo(m), el });
    }
    if (!focus) fit(m, maplibre, [...stops, ...(home ? [home] : [])], points);

    function show(s: MapStop) {
      popup.current?.remove();
      const card = document.createElement("div");
      const b = document.createElement("b");
      b.textContent = s.name;
      const small = document.createElement("small");
      small.textContent = s.detail;
      card.append(b, small);
      popup.current = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 20, className: "hl-map-pop" }).setLngLat([s.lon, s.lat]).setDOMContent(card).addTo(m!);
    }
    // Only a change of route moves the map; a new focus has its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, stops, home]);

  // Places to pin (a stop's venues and partners).
  useEffect(() => {
    const m = map.current,
      maplibre = lib.current;
    if (state !== "ready" || !m || !maplibre) return;
    for (const { marker } of pins.current.values()) marker.remove();
    pins.current.clear();
    for (const s of spots) {
      const el = document.createElement("span");
      el.className = "hl-pin spot";
      el.setAttribute("aria-label", s.detail ? `${s.name}, ${s.detail}` : s.name);
      el.addEventListener("mouseenter", () => {
        popup.current?.remove();
        const card = document.createElement("div");
        const b = document.createElement("b");
        b.textContent = s.name;
        card.append(b);
        if (s.detail) {
          const small = document.createElement("small");
          small.textContent = s.detail;
          card.append(small);
        }
        popup.current = new maplibre.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "hl-map-pop" }).setLngLat([s.lon, s.lat]).setDOMContent(card).addTo(m);
      });
      el.addEventListener("mouseleave", () => popup.current?.remove());
      const wrap = document.createElement("div");
      wrap.className = "hl-marker";
      wrap.append(el);
      pins.current.set(s.id, { marker: new maplibre.Marker({ element: wrap }).setLngLat([s.lon, s.lat]).addTo(m), el });
    }
  }, [state, spots]);

  useEffect(() => {
    for (const [id, { el }] of pins.current) el.classList.toggle("on", id === activeSpot);
  }, [activeSpot, state, spots]);

  // The stop the page is pointing at.
  useEffect(() => {
    for (const [id, { el }] of markers.current) el.classList.toggle("on", id === active);
  }, [active, state, stops]);

  // Flying to a stop, or back to the whole route.
  useEffect(() => {
    const m = map.current,
      maplibre = lib.current;
    if (state !== "ready" || !m || !maplibre) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (focus) m.flyTo({ center: [focus.lon, focus.lat], zoom: focus.zoom ?? 10.5, duration: reduce ? 0 : 1400, essential: true });
    else fit(m, maplibre, [...stops, ...(home ? [home] : [])], points, reduce ? 0 : 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, focus?.lat, focus?.lon, focus?.zoom]);

  return (
    <div className="hl-tourmap" role="region" aria-label={label}>
      <div ref={box} className="hl-tourmap-canvas" />
      {state === "loading" && <div className="hl-tourmap-wait" aria-hidden />}
      {state === "failed" && <p className="hl-tourmap-fail">This browser can&apos;t draw the map (it needs WebGL). Everything on it is listed beside it.</p>}
    </div>
  );
}

/** The basemap in Afinlo's colours: a pale canvas, lavender water, quiet labels. */
function tune(m: MapLibre) {
  const set = (layer: string, prop: PaintProperty, value: unknown) => {
    if (!m.getLayer(layer)) return;
    try {
      m.setPaintProperty(layer, prop, value as never);
    } catch {
      // A layer this style doesn't have in that form: leave it.
    }
  };
  set("background", "background-color", "#f7f7fa");
  set("water", "fill-color", "#dcdcf5");
  set("park", "fill-color", "#eef0ec");
  for (const layer of m.getStyle().layers) {
    if (layer.type !== "symbol") continue;
    // Place names in English where the map has them, so a tour reads the same anywhere.
    if (/^(label_|water_name|place)/.test(layer.id)) {
      try {
        m.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name_en"], ["get", "name:en"], ["get", "name:latin"], ["get", "name"]]);
      } catch {
        // A label without a name field: leave it.
      }
    }
    if (/^label_(city|town|state|country)/.test(layer.id)) {
      set(layer.id, "text-color", "#5f6274");
      set(layer.id, "text-halo-color", "#ffffff");
    }
  }
}

/** The style's first label layer: the heat goes under the labels, so place names stay readable. */
const firstLabel = (m: MapLibre) => m.getStyle().layers.find((l) => l.type === "symbol")?.id;

/** Frames the route, or the heat when there's no route, or the world. */
function fit(m: MapLibre, maplibre: typeof import("maplibre-gl"), places: { lat: number; lon: number }[], points: [number, number, number][], duration = 0) {
  const pts = places.length ? places : points.filter((p) => p[2] > 0.6).map(([lat, lon]) => ({ lat, lon }));
  if (!pts.length) return;
  if (pts.length === 1) {
    m.jumpTo({ center: [pts[0].lon, pts[0].lat], zoom: 7 });
    return;
  }
  const bounds = new maplibre.LngLatBounds();
  for (const p of pts) bounds.extend([p.lon, p.lat]);
  const { width, height } = m.getContainer().getBoundingClientRect();
  const pad = Math.max(24, Math.min(80, Math.min(width, height) * 0.12));
  m.fitBounds(bounds, { padding: pad, maxZoom: 7.5, duration });
}
