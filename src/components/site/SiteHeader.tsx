"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";

const LINKS = [
  ["How it works", "/how-it-works"],
  ["Does it work?", "/does-it-work"],
  ["About", "/about"],
] as const;

/** The website's navigation: Afinlo's floating header, with the pages, the tours, and one action, planning a tour. */
export function SiteHeader() {
  const [mobile, setMobile] = useState(false);
  const [floating, setFloating] = useState(false);
  const path = usePathname();
  const root = useRef<HTMLElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const scroll = () => setFloating(window.scrollY > 50);
    scroll();
    window.addEventListener("scroll", scroll, { passive: true });
    return () => window.removeEventListener("scroll", scroll);
  }, []);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setMobile(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const close = () => setMobile(false);
  return (
    <header
      ref={root}
      className={`af2-header${floating ? " af2-header-floating" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && mobile) {
          close();
          mobileTrigger.current?.focus();
        }
      }}
    >
      <a className="af2-skip" href="#main-content">
        Skip to content
      </a>
      <div className="af2-header-inner">
        <nav className="af2-desktop-nav" aria-label="Website">
          {LINKS.map(([label, href]) => (
            <Link key={href} aria-current={path === href || path.startsWith(`${href}/`) ? "page" : undefined} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="af2-header-logo" onClick={close}>
          <Wordmark />
        </div>
        <div className="af2-header-actions">
          <Link className="af2-header-login" href="/home">
            Your tours
          </Link>
          <Link className="af2-header-create" href="/plan" aria-current={path === "/plan" ? "page" : undefined}>
            Plan a tour
          </Link>
          <button
            ref={mobileTrigger}
            className="af2-mobile-toggle"
            aria-label={mobile ? "Close navigation" : "Open navigation"}
            aria-expanded={mobile}
            aria-controls="af2-mobile-menu"
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>
      {mobile && (
        <nav className="af2-mobile-menu" id="af2-mobile-menu" aria-label="Mobile website">
          {[["Plan a tour", "/plan"] as const, ["Your tours", "/home"] as const, ...LINKS].map(([label, href]) => (
            <Link key={href} href={href} onClick={close}>
              {label}
              <ArrowUpRight size={17} />
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
