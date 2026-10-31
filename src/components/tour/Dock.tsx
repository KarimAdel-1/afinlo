"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Menu, Mic2, Plus, X, type LucideIcon } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";

interface Page {
  label: string;
  href: string;
  icon: LucideIcon;
  /** The icon's colour, from the app's tiles. */
  tone: string;
}

/** The pages, in the dock's groups. The website's pages (How it works, Does it work?, About) are the website's alone. */
const GROUPS: Page[][] = [
  [
    { label: "Home", href: "/home", icon: House, tone: "blue" },
    { label: "New tour", href: "/plan", icon: Plus, tone: "white" },
    { label: "Acts", href: "/acts", icon: Mic2, tone: "lavender" },
  ],
];
/** An icon's size in the dock's units: 5 at rest, 8 under the pointer, about 7 and 6 one and two icons away, as in Osmo's dock. */
const REST = 5;
const PEAK = 8;
const REACH = 9;
/** How quickly an icon eases to its size, in milliseconds. */
const EASE = 80;

/**
 * The Mac dock's magnification. Each icon's size follows how far the pointer is from where that icon sits at rest (so an
 * icon growing never moves what's pointed at), eased every frame and written straight to the icons: nothing re-renders.
 * Keyboard focus magnifies the focused icon. With reduced motion, or no pointer that hovers, the icons keep still.
 */
function useMagnify(list: RefObject<HTMLUListElement | null>) {
  useEffect(() => {
    const ul = list.current;
    if (!ul) return;
    const still = matchMedia("(prefers-reduced-motion: reduce), (hover: none)");
    let items: HTMLElement[] = [];
    let centers: number[] = [];
    let sizes: number[] = [];
    let top = 0;
    let unit = 12;
    // What's magnified, from the list's top at rest: the pointer while it's on the dock, else the icon focused from the keyboard.
    let pointer: number | null = null;
    let focused: number | null = null;
    let frame = 0;
    let then = 0;

    // Where each icon sits at rest, measured only when nothing is magnified.
    const measure = () => {
      if (pointer !== null || focused !== null || frame) return;
      items = [...ul.querySelectorAll<HTMLElement>(":scope > .hl-dock-item")];
      unit = parseFloat(getComputedStyle(ul).fontSize) || 12;
      top = ul.getBoundingClientRect().top;
      centers = items.map((el) => {
        const r = el.getBoundingClientRect();
        return r.top - top + r.height / 2;
      });
      sizes = items.map(() => REST * unit);
    };
    const tick = (now: number) => {
      const at = pointer ?? focused;
      const ease = 1 - Math.exp(-Math.min(then ? now - then : 16, 64) / EASE);
      then = now;
      let moving = false;
      items.forEach((el, i) => {
        const d = at === null ? 0 : (at - centers[i]) / (REACH * unit);
        const goal = unit * (at === null ? REST : REST + (PEAK - REST) * Math.exp(-d * d));
        const size = Math.abs(goal - sizes[i]) < 0.2 ? goal : sizes[i] + (goal - sizes[i]) * ease;
        if (size === sizes[i]) return;
        if (size !== goal) moving = true;
        sizes[i] = size;
        el.style.height = `${size.toFixed(2)}px`;
      });
      if (moving) frame = requestAnimationFrame(tick);
      else {
        frame = then = 0;
        // At rest the icons go back to the stylesheet's size.
        if (at === null) for (const el of items) el.style.removeProperty("height");
      }
    };
    const run = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      if (still.matches || e.pointerType === "touch") return;
      measure();
      pointer = e.clientY - top;
      run();
    };
    const leave = () => {
      pointer = null;
      run();
    };
    const focus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (still.matches || !el.matches(":focus-visible")) return;
      measure();
      const i = items.findIndex((item) => item.contains(el));
      focused = i < 0 ? null : centers[i];
      run();
    };
    const blur = (e: FocusEvent) => {
      if (ul.contains(e.relatedTarget as Node | null)) return;
      focused = null;
      run();
    };
    ul.addEventListener("pointermove", move);
    ul.addEventListener("pointerleave", leave);
    ul.addEventListener("focusin", focus);
    ul.addEventListener("focusout", blur);
    return () => {
      cancelAnimationFrame(frame);
      ul.removeEventListener("pointermove", move);
      ul.removeEventListener("pointerleave", leave);
      ul.removeEventListener("focusin", focus);
      ul.removeEventListener("focusout", blur);
    };
  }, [list]);
}

/**
 * The dashboard's navigation, as a Mac dock down the left side: one glass shelf of app icons that grow under the
 * pointer (their neighbours a little less), each named beside it, with a dot by the page that's open. On a phone,
 * or a tablet with no pointer to point with, it's a top bar and a menu.
 */
export function Dock() {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useMagnify(list);
  // A tour is part of Home: that's where tours are.
  const active = (href: string) => path === href || path.startsWith(`${href}/`) || (href === "/home" && path.startsWith("/tour/"));

  useEffect(() => {
    if (!menu) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu(false);
      menuButton.current?.focus();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [menu]);

  return (
    <>
      <a className="af2-skip" href="#main-content">
        Skip to content
      </a>
      <nav className="hl hl-dock" aria-label="Afinlo">
        <ul className="hl-dock-list" ref={list}>
          <DockItem label="Afinlo">
            <Link className="hl-dock-link" href="/" aria-label="Afinlo home">
              <span className="hl-dock-icon white">
                <Image src="/brand/afinlo-icon.png" alt="" width={64} height={64} priority />
              </span>
            </Link>
          </DockItem>
          {GROUPS.flatMap((group, g) => [
            ...(g ? [<li key={`sep-${g}`} className="hl-dock-sep" aria-hidden />] : []),
            ...group.map((page) => {
              const Icon = page.icon;
              return (
                <DockItem key={page.href} label={page.label} open={active(page.href)}>
                  <Link className="hl-dock-link" href={page.href} aria-label={page.label} aria-current={active(page.href) ? "page" : undefined}>
                    <span className={`hl-dock-icon ${page.tone}`}>
                      <Icon strokeWidth={2} aria-hidden />
                    </span>
                  </Link>
                </DockItem>
              );
            }),
          ])}
        </ul>
      </nav>

      <div className="hl hl-topbar">
        <Wordmark />
        <button ref={menuButton} type="button" className="hl-topbar-menu" aria-label="Open menu" aria-expanded={menu} aria-controls="hl-drawer" onClick={() => setMenu(true)}>
          <Menu size={22} aria-hidden />
        </button>
      </div>
      {menu && (
        <div className="hl hl-drawer-wrap">
          <button type="button" className="hl-drawer-shade" aria-label="Close menu" tabIndex={-1} onClick={() => setMenu(false)} />
          <nav id="hl-drawer" className="hl-drawer" aria-label="Afinlo">
            <div className="hl-drawer-head">
              <Wordmark />
              <button type="button" className="hl-topbar-menu" aria-label="Close menu" autoFocus onClick={() => setMenu(false)}>
                <X size={22} aria-hidden />
              </button>
            </div>
            {GROUPS.map((group, g) => (
              <ul key={g} className="hl-drawer-list">
                {group.map((page) => {
                  const Icon = page.icon;
                  return (
                    <li key={page.href}>
                      <Link href={page.href} aria-current={active(page.href) ? "page" : undefined} onClick={() => setMenu(false)}>
                        <span className={`hl-dock-icon ${page.tone}`}>
                          <Icon strokeWidth={2} aria-hidden />
                        </span>
                        {page.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}

/** One icon in the dock: its name beside it, and the dot when its page is open. Its size is useMagnify's. */
function DockItem({ label, open = false, children }: { label: string; open?: boolean; children: ReactNode }) {
  return (
    <li className={`hl-dock-item${open ? " is-open" : ""}`}>
      {children}
      <span className="hl-dock-tip" aria-hidden>
        {label}
      </span>
    </li>
  );
}
