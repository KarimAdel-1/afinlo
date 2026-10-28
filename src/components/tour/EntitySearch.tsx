"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, LoaderCircle, Search } from "lucide-react";
import type { Act, Brand } from "@/core/tour/types";
import { Avatar } from "./Avatar";
import { postJson } from "./client";

type Found<T extends "act" | "brand"> = T extends "act" ? Act : Brand;

/**
 * Search Qloo for an act or a brand by name, as the name settles, and pick the exact match. Each search is two cached
 * Qloo requests for acts, one for brands.
 */
export function EntitySearch<T extends "act" | "brand">({
  type,
  label,
  placeholder,
  qloo,
  picks = [],
  describe,
  badge,
  onChoose,
}: {
  type: T;
  label: string;
  placeholder: string;
  qloo: boolean;
  picks?: string[];
  describe: (found: Found<T>) => string;
  badge?: (found: Found<T>) => ReactNode;
  onChoose: (found: Found<T>) => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Found<T>[]>();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const asked = useRef("");

  const search = async (q: string) => {
    const term = q.trim();
    if (term.length < 2 || term === asked.current) return;
    asked.current = term;
    setSearching(true);
    setError("");
    try {
      const res = await postJson<{ acts?: Act[]; brands?: Brand[] }>("/api/tour/search", { query: term, type });
      if (asked.current === term) setMatches(((type === "brand" ? res.brands : res.acts) ?? []) as Found<T>[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };
  useEffect(() => {
    if (query.trim().length < 3) return;
    const t = setTimeout(() => void search(query), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the query only; search reads the latest state
  }, [query]);

  const id = `hl-search-${type}`;
  return (
    <>
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
        <label htmlFor={id} className="hl-visually-hidden">
          {label}
        </label>
        <input
          id={id}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setMatches(undefined);
          }}
          placeholder={placeholder}
          autoComplete="off"
          maxLength={80}
          disabled={!qloo}
        />
        <button className="hl-button" disabled={!qloo || query.trim().length < 2 || searching}>
          {searching && <LoaderCircle size={18} className="hl-spin" aria-hidden />} Search
        </button>
      </form>
      {!qloo && <p className="hl-error">Qloo isn&apos;t connected on this server, so new searches can&apos;t be made right now. The examples still open.</p>}
      {error && (
        <p className="hl-error" role="alert">
          {error}
        </p>
      )}
      {matches && !matches.length && <p className="hl-hint">Qloo has nothing by that name. Check the spelling, or try another name.</p>}
      {!!matches?.length && (
        <ul className="hl-results" aria-label="Matches in Qloo">
          {matches.map((m) => (
            <li key={m.id}>
              <button type="button" className="hl-result-row" onClick={() => onChoose(m)}>
                <Avatar name={m.name} image={m.image} size={48} fit={type === "brand" ? "contain" : "cover"} />
                <span style={{ minWidth: 0 }}>
                  <b>
                    {m.name} {badge?.(m)}
                  </b>
                  <small>{describe(m)}</small>
                </span>
                <ArrowRight size={20} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!matches && !searching && qloo && !!picks.length && (
        <div className="hl-try">
          Try
          {picks.map((p) => (
            <button
              key={p}
              type="button"
              className="hl-pick"
              onClick={() => {
                setQuery(p);
                void search(p);
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
