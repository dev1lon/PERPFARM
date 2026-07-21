"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatUsd } from "@/lib/format";
import type { VenueSummary } from "@/lib/types";
import { tr, useLocale } from "@/components/LocaleProvider";
import { VariationalPairRankings } from "@/components/VariationalPairRankings";
import { CrossPairRankings } from "@/components/CrossPairRankings";

interface HedgeOption {
  slug: string;
  name: string;
}

function HedgeSelect({
  options,
  value,
  onChange,
  sidebar = false,
}: {
  options: HedgeOption[];
  value: string;
  onChange: (slug: string) => void;
  sidebar?: boolean;
}) {
  const locale = useLocale();
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
      {sidebar && <p className="mb-2 text-sm text-text-muted">{tr(locale, "Hedge with", "Хедж с")}</p>}
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
          {!sidebar && <span className="text-text-muted">{tr(locale, "Hedge with: ", "Хедж с: ")}</span>}
          {selected?.name ?? tr(locale, "Select a perp-dex", "Выберите perp-dex")}
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
            placeholder={tr(locale, "Search perp-dexes", "Поиск perp-dex")}
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
                  {o.name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-text-muted">{tr(locale, "No matches", "Нет совпадений")}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

type Status = "idle" | "loading" | "loaded" | "error";

export function VenueWizard({
  venueSlug,
  venueName,
  otherVenues,
  layout = "default",
  allowCustomAccountVolume = false,
}: {
  venueSlug: string;
  venueName?: string;
  otherVenues: VenueSummary[];
  layout?: "default" | "sidebar" | "sidebar-wide";
  /** Kept local to the Variational preview until the planner design is final. */
  allowCustomAccountVolume?: boolean;
}) {
  const homeName = venueName ?? venueSlug;
  const locale = useLocale();
  const hedgeOptions: HedgeOption[] = useMemo(
    () => [
      ...(venueSlug === "variational" ? [{ slug: "variational", name: "Variational" }] : []),
      ...otherVenues.map((v) => ({ slug: v.slug, name: v.name })),
    ],
    [venueSlug, otherVenues]
  );
  const [hedge, setHedge] = useState(hedgeOptions[0]?.slug ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [notionalUsd, setNotionalUsd] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accountVolumeInput, setAccountVolumeInput] = useState("100000");

  // The only wired calculation is the same-protocol pair Run (Variational).
  // The live cross-protocol Hedge-with calc is added separately.
  const isSameVenueRun = venueSlug === "variational" && hedge === "variational";
  const isCrossRun = hedge !== "" && hedge !== venueSlug;
  const hedgeName = hedgeOptions.find((o) => o.slug === hedge)?.name ?? hedge;
  const customAccountVolumeEnabled = allowCustomAccountVolume && (isSameVenueRun || isCrossRun);
  const requestedAccountVolumeUsd = Number(accountVolumeInput);
  const validAccountVolume = Number.isFinite(requestedAccountVolumeUsd)
    && requestedAccountVolumeUsd >= 1_000
    && requestedAccountVolumeUsd <= 200_000;
  const sidebar = layout !== "default";
  const wideSidebar = layout === "sidebar-wide";

  if (hedgeOptions.length === 0) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-6 text-center">
        <p className="font-mono-num text-3xl font-semibold tracking-[0.2em] text-text-primary">SOON</p>
        <p className="text-sm text-text-muted">
          {tr(locale, "A neutral hedge needs a second verified perp-dex. Calculations appear once one is live.", "Нейтральному хеджу нужен второй проверенный perp-dex. Расчёты появятся после его подключения.")}
        </p>
      </section>
    );
  }

  function run() {
    setStatus("loading");
    setErrorMessage(null);
    if (customAccountVolumeEnabled && !validAccountVolume) {
      setErrorMessage(tr(locale, "Enter volume from $1,000 to $200,000 per account.", "Введите объём от $1 000 до $200 000 на один аккаунт."));
      setStatus("error");
      return;
    }
    setNotionalUsd(customAccountVolumeEnabled ? requestedAccountVolumeUsd : 100_000);
    setStatus("loaded");
  }

  function reset() {
    setNotionalUsd(null);
    setStatus("idle");
  }

  return (
    <div className={wideSidebar ? "contents" : "flex flex-col gap-6"}>
      <div className={`flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-5 ${wideSidebar ? "lg:col-start-2 lg:row-start-2" : ""}`}>
        <HedgeSelect options={hedgeOptions} value={hedge} onChange={setHedge} sidebar={sidebar} />
        {customAccountVolumeEnabled && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-text-muted">{tr(locale, "Volume per account", "Объём на один аккаунт")}</span>
            <div className="flex items-center rounded-md border border-border bg-surface-1 focus-within:border-accent">
              <span className="pl-3 font-mono-num text-sm text-text-muted">$</span>
              <input
                type="number"
                inputMode="numeric"
                min="1000"
                max="200000"
                step="1000"
                value={accountVolumeInput}
                onChange={(event) => setAccountVolumeInput(event.target.value)}
                aria-describedby="account-volume-note"
                className="pf-inline-number-input w-full bg-transparent px-1 py-3 font-mono-num text-sm text-text-primary"
              />
              <span className="pr-3 text-sm text-text-muted">USDC</span>
            </div>
            <span id="account-volume-note" className="text-sm leading-5 text-text-muted">
              {validAccountVolume
                ? tr(locale, `Full hedge cycle: ${formatUsd(requestedAccountVolumeUsd * 2, { decimals: 0 })} across two accounts.`, `Полный хедж-цикл: ${formatUsd(requestedAccountVolumeUsd * 2, { decimals: 0 })} на два аккаунта.`)
                : tr(locale, "Allowed range: $1,000–$200,000 per account.", "Допустимый диапазон: $1 000–$200 000 на аккаунт.")}
            </span>
          </label>
        )}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={run}
            disabled={status === "loading"}
            className="pf-transition w-full rounded-md bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {status === "loading" ? tr(locale, "Computing…", "Считаем…") : tr(locale, "Run", "Рассчитать")}
          </button>
        </div>
      </div>

      {status === "error" && (
        <div className={`rounded-lg border border-negative/40 bg-negative/10 p-4 text-sm text-negative ${wideSidebar ? "lg:col-span-2" : ""}`}>
          {tr(locale, "Couldn’t compute:", "Не удалось рассчитать:")} {errorMessage}
        </div>
      )}

      {status === "loaded" && notionalUsd !== null && (
        <div className={`flex flex-col gap-4 ${wideSidebar ? "lg:col-span-2" : ""}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">{tr(locale, "Planning statistics", "Плановая статистика")}</h2>
            <button
              type="button"
              onClick={reset}
              className="pf-transition text-sm text-text-muted hover:text-text-primary"
            >
              {tr(locale, "Reset", "Сбросить")}
            </button>
          </div>

          {isSameVenueRun ? (
            <VariationalPairRankings key={notionalUsd} accountVolumeUsd={notionalUsd} />
          ) : isCrossRun ? (
            <CrossPairRankings
              key={`${hedge}-${notionalUsd}`}
              venueSlug={venueSlug}
              hedgeSlug={hedge}
              homeName={homeName}
              hedgeName={hedgeName}
              accountVolumeUsd={notionalUsd}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-1 px-6 py-12 text-center">
              <p className="text-sm text-text-muted">{tr(locale, "Select a hedge protocol to compute.", "Выберите протокол для хеджа.")}</p>
            </div>
          )}

          <p className="text-center text-sm text-text-muted">
            {tr(locale, "Estimates from public data · not financial advice", "Оценки на основе публичных данных · не финансовый совет")}
          </p>
        </div>
      )}
    </div>
  );
}
