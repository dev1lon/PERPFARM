"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatCostPerPoint, formatUsd } from "@/lib/format";
import type { Recipe, RecipesResponse, Strategy, VenueSummary } from "@/lib/types";
import { tr, useLocale } from "@/components/LocaleProvider";
import { VariationalPairRankings } from "@/components/VariationalPairRankings";

function strategies(locale: "en" | "ru"): { id: Strategy; label: string; description: string }[] {
  return [
    { id: "cheapest", label: tr(locale, "Cheapest", "Дешевле"), description: tr(locale, "Lowest cost per point", "Минимальная цена поинта") },
    { id: "max_points", label: tr(locale, "Max points", "Больше поинтов"), description: tr(locale, "More points, higher cost", "Больше поинтов, выше цена") },
    { id: "balanced", label: tr(locale, "Balanced", "Баланс"), description: tr(locale, "Cost and points, weighted evenly", "Цена и поинты с равным весом") },
  ];
}

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
          <span className="text-text-muted">{tr(locale, "Hedge with: ", "Хедж с: ")}</span>
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

function StrategyCards({ value, onChange }: { value: Strategy; onChange: (s: Strategy) => void }) {
  const locale = useLocale();
  const availableStrategies = strategies(locale);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowDown" && e.key !== "ArrowLeft" && e.key !== "ArrowUp") {
      return;
    }
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = (index + dir + availableStrategies.length) % availableStrategies.length;
    onChange(availableStrategies[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={tr(locale, "Strategy", "Стратегия")} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {availableStrategies.map((s, i) => {
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

function VariationalFarmingPlan({ strategy }: { strategy: Strategy }) {
  const locale = useLocale();
  const plan =
    strategy === "max_points"
      ? {
          title: "Faster point accumulation",
          estimate: "$10–11 / pt",
          context: "XAU, 1–2h hold",
        }
      : strategy === "balanced"
        ? {
            title: "Compare both cases",
            estimate: "$7–10 / pt",
            context: "medium OI 12–24h, plus XAU 1–2h",
          }
        : {
            title: "Lowest planning cost",
            estimate: "$5–7 / pt",
            context: "medium OI, 12–24h hold",
        };

  if (locale === "ru") {
    const variant = strategy === "max_points" ? "Быстрее набирать поинты" : strategy === "balanced" ? "Сравнить оба варианта" : "Минимальная плановая цена";
    const estimate = strategy === "max_points" ? "$10–11 / pt" : strategy === "balanced" ? "$7–10 / pt" : "$5–7 / pt";
    const hold = strategy === "max_points" ? "XAU, удержание 1–2 ч" : strategy === "balanced" ? "medium OI 12–24 ч + XAU 1–2 ч" : "medium OI, удержание 12–24 ч";
    const steps = [
      ["Задайте наблюдение.", "Зафиксируйте рынок, время, open interest и срок удержания. Базовый цикл использует по $50 000 на каждый филл: $100 000 объёма на аккаунт и $200 000 на оба аккаунта."],
      ["Смоделируйте экспозицию.", "Модель сопоставляет long и short Variational одного номинала, чтобы отделить спред, funding и влияние исполнения от направленной ставки на рынок."],
      ["Соберите данные входа и выхода.", "В каждом снимке сохраните спред/impact и funding. Maker и taker комиссия Omni — 0 bps, но entry impact, exit impact и funding остаются в реальной стоимости."],
      ["Примените оценку поинта.", "Cheapest: $5–7 за поинт; balanced: $7–10; max points: $10–11. Это ручные ориентиры, пока Omni не публикует поинты за объём."],
      ["Учтите конкурс отдельно.", "При активном конкурсе сохраните eligible TradFi volume. Бонус: 20 000 × eligible объём Variational / общий eligible объём конкурса. USDC-призы в экономику поинтов не входят."],
    ];
    return (
      <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface-1 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text-primary">План фарма Variational</p>
            <p className="mt-1 text-sm text-text-muted">Гайд по маршруту и параметрам исполнения для выбранного варианта фарма.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border bg-surface-2 p-3"><p className="text-xs text-text-muted">Выбранный вариант</p><p className="mt-1 text-sm font-medium text-text-primary">{variant}</p></div>
          <div className="rounded-md border border-border bg-surface-2 p-3"><p className="text-xs text-text-muted">Плановая оценка</p><p className="mt-1 font-mono-num text-sm font-medium text-text-primary">{estimate}</p></div>
          <div className="rounded-md border border-border bg-surface-2 p-3"><p className="text-xs text-text-muted">Окно удержания</p><p className="mt-1 text-sm font-medium text-text-primary">{hold}</p></div>
        </div>
        <ol className="grid gap-3 text-sm text-text-muted">
          {steps.map(([heading, body], index) => (
            <li key={heading} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono-num text-xs text-accent">{index + 1}</span>
              <span><strong className="font-medium text-text-primary">{heading}</strong> {body}</span>
            </li>
          ))}
        </ol>
        <div className="grid gap-3 rounded-md border border-border bg-surface-2 p-4 text-xs text-text-muted sm:grid-cols-2">
          <div><p className="font-medium text-text-primary">Расчёт стоимости</p><p className="mt-1">Стоимость = entry impact + exit impact + net funding. Цена поинта = стоимость ÷ (базовые поинты + eligible конкурсные поинты). Призовой пул $20 000 USDC не вычитается.</p></div>
          <div><p className="font-medium text-text-primary">Хедж-схема</p><p className="mt-1">Variational разрешает органический дельта-нейтральный хедж между двумя аккаунтами. Держите одинаковый номинал long и short: маршрут сравнивает стоимость исполнения, а не направленную ставку на рынок.</p></div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface-1 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text-primary">Variational farming plan</p>
          <p className="mt-1 text-sm text-text-muted">
            Route guide and execution inputs for the selected farming variant.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-surface-2 p-3">
          <p className="text-xs text-text-muted">Selected variant</p>
          <p className="mt-1 text-sm font-medium text-text-primary">{plan.title}</p>
        </div>
        <div className="rounded-md border border-border bg-surface-2 p-3">
          <p className="text-xs text-text-muted">Planning estimate</p>
          <p className="mt-1 font-mono-num text-sm font-medium text-text-primary">{plan.estimate}</p>
        </div>
        <div className="rounded-md border border-border bg-surface-2 p-3">
          <p className="text-xs text-text-muted">Hold window</p>
          <p className="mt-1 text-sm font-medium text-text-primary">{plan.context}</p>
        </div>
      </div>

      <ol className="grid gap-3 text-sm text-text-muted">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono-num text-xs text-accent">
            1
          </span>
          <span>
            <strong className="font-medium text-text-primary">Set the observation.</strong> Record the market,
            timestamp, open interest, and selected hold window. The default cycle uses four $50,000 fills:
            $100,000 of volume per account and $200,000 across both accounts.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono-num text-xs text-accent">
            2
          </span>
          <span>
            <strong className="font-medium text-text-primary">Model the exposure.</strong> The route pairs a
            Variational long with a Variational short of the same nominal value, so the record isolates spreads,
            funding, and execution impact rather than a directional market view.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono-num text-xs text-accent">
            3
          </span>
          <span>
            <strong className="font-medium text-text-primary">Capture entry and exit data.</strong> At each
            timestamp store the quoted spread/impact and funding rate. Omni publishes 0 bps trading fees, but
            the model still includes entry impact, exit impact, and funding in the realised cost.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono-num text-xs text-accent">
            4
          </span>
          <span>
            <strong className="font-medium text-text-primary">Apply the point estimate.</strong> Cheapest uses
            $5–7 per point, balanced uses $7–10, and max points uses $10–11. These remain manual benchmarks
            until Omni publishes points per volume.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono-num text-xs text-accent">
            5
          </span>
          <span>
            <strong className="font-medium text-text-primary">Account for a competition separately.</strong>
            When one is active, log eligible TradFi volume and calculate the 20,000-point bonus pro rata:
            <span className="ml-1 font-mono-num text-text-primary">
              20,000 × eligible Variational volume / total eligible competition volume.
            </span>
            USDC prizes are deliberately excluded from point economics.
          </span>
        </li>
      </ol>

      <div className="grid gap-3 rounded-md border border-border bg-surface-2 p-4 text-xs text-text-muted sm:grid-cols-2">
        <div>
          <p className="font-medium text-text-primary">Cost calculation</p>
          <p className="mt-1">
            Cost = entry impact + exit impact + net funding. Cost per point = cost ÷ (base points + eligible
            competition bonus points). The $20,000 USDC prize pool is never deducted from cost.
          </p>
        </div>
        <div>
          <p className="font-medium text-text-primary">Hedge setup</p>
          <p className="mt-1">
            Variational permits organic delta-neutral hedging across two accounts. Keep equal notional on the
            long and short legs; this route compares execution cost, not a directional market view.
          </p>
        </div>
      </div>

    </section>
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
  const locale = useLocale();
  const hedgeOptions: HedgeOption[] = useMemo(
    () => [
      ...(venueSlug === "variational" ? [{ slug: "variational", name: "Variational" }] : []),
      ...otherVenues.map((v) => ({ slug: v.slug, name: v.name })),
    ],
    [venueSlug, otherVenues]
  );
  const [hedge, setHedge] = useState(hedgeOptions[0]?.slug ?? "");
  const [strategy, setStrategy] = useState<Strategy>("cheapest");
  const [status, setStatus] = useState<Status>("idle");
  const [response, setResponse] = useState<RecipesResponse | null>(null);
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hedgeName = hedgeOptions.find((o) => o.slug === hedge)?.name ?? hedge;
  const isVariationalStatistics = venueSlug === "variational" && hedge === "variational";

  if (hedgeOptions.length === 0) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-6 text-center">
        <p className="font-mono-num text-3xl font-semibold tracking-[0.2em] text-text-primary">SOON</p>
        <p className="text-sm text-text-muted">
          {tr(locale, "A neutral hedge needs a second verified perp-dex. We will enable recipes once one is live.", "Нейтральному хеджу нужен второй проверенный perp-dex. Рецепты появятся после его подключения.")}
        </p>
      </section>
    );
  }

  async function run() {
    setStatus("loading");
    setErrorMessage(null);
    if (isVariationalStatistics) {
      setResponse({
        venue: venueSlug,
        hedge,
        strategy,
        notionalUsd: 10_000,
        holdHours: 24,
        recipes: [],
      });
      setExpandedPair(null);
      setStatus("loaded");
      return;
    }
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
            {status === "loading" ? tr(locale, "Computing…", "Считаем…") : tr(locale, "Run", "Рассчитать")}
          </button>
        </div>
      </div>

      {status === "loading" && <ResultsSkeleton />}

      {status === "error" && (
        <div className="rounded-lg border border-negative/40 bg-negative/10 p-4 text-sm text-negative">
          {tr(locale, "Couldn’t compute recipes:", "Не удалось рассчитать рецепты:")} {errorMessage}
        </div>
      )}

      {status === "loaded" && response && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">
              {response.venue === "variational" && response.hedge === "variational"
                ? tr(locale, "Planning statistics", "Плановая статистика")
                : tr(locale, `${response.recipes.length} recipe${response.recipes.length === 1 ? "" : "s"}`, `${response.recipes.length} рецепт(ов)`)}
            </h2>
            <button
              type="button"
              onClick={reset}
              className="pf-transition text-sm text-text-muted hover:text-text-primary"
            >
              {tr(locale, "Reset", "Сбросить")}
            </button>
          </div>

          {response.venue === "variational" && response.hedge === "variational" ? (
            <>
              <VariationalPairRankings key={response.strategy} strategy={response.strategy} />
              <details className="rounded-lg border border-border bg-surface-1">
                <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-text-primary">
                  {tr(locale, "Model notes and execution plan", "Примечания к модели и план исполнения")}
                </summary>
                <div className="border-t border-border p-4">
                  <VariationalFarmingPlan strategy={response.strategy} />
                </div>
              </details>
            </>
          ) : response.recipes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-1 px-6 py-12 text-center">
              <p className="text-sm text-text-muted">{tr(locale, "No pairs fit this strategy right now.", "Сейчас нет пар, подходящих этой стратегии.")}</p>
              {strategy !== "cheapest" && (
                <button
                  type="button"
                  onClick={() => {
                    setStrategy("cheapest");
                  }}
                  className="pf-transition rounded-md border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
                >
                  {tr(locale, "Try Cheapest", "Выбрать дешевле")}
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
            {tr(locale, "Estimates from public data · not financial advice", "Оценки на основе публичных данных · не финансовый совет")}
          </p>
        </div>
      )}
    </div>
  );
}
