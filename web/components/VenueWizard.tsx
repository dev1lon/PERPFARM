"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatCostPerPoint, formatUsd } from "@/lib/format";
import type { Recipe, RecipesResponse, Strategy, VenueSummary } from "@/lib/types";

const STRATEGIES: { id: Strategy; label: string; description: string }[] = [
  { id: "cheapest", label: "Cheapest", description: "Lowest cost per point" },
  { id: "max_points", label: "Max points", description: "More points, higher cost" },
  { id: "balanced", label: "Balanced", description: "Cost and points, weighted evenly" },
];

interface HedgeOption {
  slug: string;
  name: string;
}

function HedgeSelect({
  options,
  value,
  onChange,
}: {
  options: HedgeOption[];
  value: string;
  onChange: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()));
  const selected = options.find((o) => o.slug === value);

  function closeAndFocusTrigger() {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function selectOption(slug: string) {
    onChange(slug);
    closeAndFocusTrigger();
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAndFocusTrigger();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) selectOption(opt.slug);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setActiveIndex(Math.max(filtered.findIndex((o) => o.slug === value), 0));
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="pf-transition flex w-full items-center justify-between rounded-md border border-border bg-surface-1 px-4 py-3 text-left text-sm text-text-primary hover:bg-surface-hover"
      >
        <span>
          <span className="text-text-muted">Hedge with: </span>
          {selected?.name ?? "Select a perp-dex"}
        </span>
        <span className="text-text-muted" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-surface-1 shadow-lg">
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onListKeyDown}
            placeholder="Search perp-dexes"
            className="w-full border-b border-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.map((o, i) => (
              <li key={o.slug}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.slug === value}
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => selectOption(o.slug)}
                  className={`pf-transition flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-hover ${
                    i === activeIndex ? "bg-surface-hover" : ""
                  } ${o.slug === value ? "text-accent" : "text-text-primary"}`}
                >
                  {o.slug === "self" && (
                    <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                      same perp-dex
                    </span>
                  )}
                  {o.name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-text-muted">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function StrategyCards({ value, onChange }: { value: Strategy; onChange: (s: Strategy) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowDown" && e.key !== "ArrowLeft" && e.key !== "ArrowUp") {
      return;
    }
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = (index + dir + STRATEGIES.length) % STRATEGIES.length;
    onChange(STRATEGIES[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Strategy" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {STRATEGIES.map((s, i) => {
        const selected = s.id === value;
        return (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(s.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`pf-transition rounded-md border px-4 py-3 text-left ${
              selected
                ? "border-accent bg-accent/10"
                : "border-border bg-surface-1 hover:bg-surface-hover"
            }`}
          >
            <div className={`text-sm font-medium ${selected ? "text-accent" : "text-text-primary"}`}>
              {s.label}
            </div>
            <div className="text-xs text-text-muted">{s.description}</div>
          </button>
        );
      })}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function recipeLine(recipe: Recipe, homeSlug: string, hedgeName: string): string {
  const isSelfMatch = recipe.legs[0].venue === recipe.legs[1].venue;
  if (isSelfMatch) {
    return `${capitalize(recipe.legs[0].side)} account A as ${recipe.legs[0].orderType}, ${recipe.legs[1].side} account B as ${recipe.legs[1].orderType}.`;
  }
  const homeLeg = recipe.legs.find((l) => l.venue === homeSlug) ?? recipe.legs[0];
  const otherLeg = recipe.legs.find((l) => l.venue !== homeSlug) ?? recipe.legs[1];
  return `${capitalize(homeLeg.side)} here as ${homeLeg.orderType}, ${otherLeg.side} ${hedgeName} as ${otherLeg.orderType}.`;
}

function RecipeCard({
  recipe,
  homeSlug,
  hedgeName,
  isTopPick,
  expanded,
  onToggle,
}: {
  recipe: Recipe;
  homeSlug: string;
  hedgeName: string;
  isTopPick: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isSelfMatch = recipe.legs[0].venue === recipe.legs[1].venue;
  const otherLeg = recipe.legs.find((l) => l.venue !== homeSlug);
  const line = recipeLine(recipe, homeSlug, hedgeName);

  return (
    <div
      className={`rounded-lg border bg-surface-1 ${
        isTopPick ? "border-border border-l-2 border-l-accent" : "border-border"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="pf-transition flex w-full flex-col gap-2 rounded-lg px-5 py-4 text-left hover:bg-surface-hover sm:flex-row sm:items-start sm:justify-between sm:gap-4"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono-num text-sm font-medium text-text-primary">{recipe.pair}</span>
            {recipe.chips.map((chip) => (
              <span
                key={chip}
                className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted"
              >
                {chip}
              </span>
            ))}
          </div>
          <p className="text-sm text-text-muted">{line}</p>
          {!isSelfMatch && otherLeg && (
            <span className="text-xs text-accent">View {hedgeName} →</span>
          )}
        </div>
        <span
          key={`${recipe.pair}-${recipe.costPerPointUsd}`}
          className="pf-value-pulse shrink-0 self-end font-mono-num text-base font-semibold text-text-primary sm:self-start"
        >
          {formatCostPerPoint(recipe.costPerPointUsd)}
          <span className="font-normal text-text-muted">/pt</span>
        </span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-2 border-t border-border px-5 py-4 text-sm text-text-muted">
          <p>{recipe.legs[0].why}</p>
          <p>{recipe.legs[1].why}</p>
          {recipe.breakevenUsd !== null && (
            <p>Works best up to ~{formatUsd(recipe.breakevenUsd, { decimals: 0 })} per entry.</p>
          )}
          {recipe.risks.washRisk && (
            <p className="text-negative">
              Two accounts on the same perp-dex -- modeled as mostly filling each other, an
              approximation, not a measurement.
            </p>
          )}
          {recipe.risks.fillRisk && (
            <p className="text-negative">Resting size may be large relative to book depth on one leg.</p>
          )}
          {recipe.risks.beyondMeasuredDepth && (
            <p className="text-negative">
              Size exceeds measured book depth on one leg -- the impact estimate is a rough clamp.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="pf-skeleton h-20 rounded-lg border border-border bg-surface-1" />
      ))}
    </div>
  );
}

type Status = "idle" | "loading" | "loaded" | "error";

export function VenueWizard({
  venueSlug,
  otherVenues,
}: {
  venueSlug: string;
  otherVenues: VenueSummary[];
}) {
  const hedgeOptions: HedgeOption[] = useMemo(
    () => [
      { slug: "self", name: "— second account" },
      ...otherVenues.map((v) => ({ slug: v.slug, name: v.name })),
    ],
    [otherVenues]
  );

  const [hedge, setHedge] = useState(hedgeOptions[1]?.slug ?? "self");
  const [strategy, setStrategy] = useState<Strategy>("cheapest");
  const [status, setStatus] = useState<Status>("idle");
  const [response, setResponse] = useState<RecipesResponse | null>(null);
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hedgeName = hedgeOptions.find((o) => o.slug === hedge)?.name ?? hedge;

  async function run() {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const res = await fetch(
        `/api/venues/${venueSlug}/recipes?hedge=${encodeURIComponent(hedge)}&strategy=${strategy}`
      );
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      const data: RecipesResponse = await res.json();
      setResponse(data);
      setExpandedPair(null);
      setStatus("loaded");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "failed to load recipes");
      setStatus("error");
    }
  }

  function reset() {
    setResponse(null);
    setStatus("idle");
    setExpandedPair(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-5">
        <HedgeSelect options={hedgeOptions} value={hedge} onChange={setHedge} />
        <StrategyCards value={strategy} onChange={setStrategy} />
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={run}
            disabled={status === "loading"}
            className="pf-transition w-full rounded-md bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {status === "loading" ? "Computing…" : "Run"}
          </button>
          <p className="text-center text-xs text-text-muted">
            Based on the latest nightly scoring run, $10,000 notional, 24h hold.
          </p>
        </div>
      </div>

      {status === "loading" && <ResultsSkeleton />}

      {status === "error" && (
        <div className="rounded-lg border border-negative/40 bg-negative/10 p-4 text-sm text-negative">
          Couldn&apos;t compute recipes: {errorMessage}
        </div>
      )}

      {status === "loaded" && response && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">
              {response.recipes.length} recipe{response.recipes.length === 1 ? "" : "s"}
            </h2>
            <button
              type="button"
              onClick={reset}
              className="pf-transition text-sm text-text-muted hover:text-text-primary"
            >
              Reset
            </button>
          </div>

          {response.recipes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-1 px-6 py-12 text-center">
              <p className="text-sm text-text-muted">No pairs fit this strategy right now.</p>
              {strategy !== "cheapest" && (
                <button
                  type="button"
                  onClick={() => {
                    setStrategy("cheapest");
                  }}
                  className="pf-transition rounded-md border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
                >
                  Try Cheapest
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {response.recipes.map((recipe, i) => (
                <RecipeCard
                  key={recipe.pair}
                  recipe={recipe}
                  homeSlug={venueSlug}
                  hedgeName={hedgeName}
                  isTopPick={i === 0}
                  expanded={expandedPair === recipe.pair}
                  onToggle={() => setExpandedPair(expandedPair === recipe.pair ? null : recipe.pair)}
                />
              ))}
            </div>
          )}

          <p className="text-center text-xs text-text-muted">
            Estimates from public data · not financial advice
          </p>
        </div>
      )}
    </div>
  );
}
