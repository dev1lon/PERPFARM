"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { perpDexBadgeVars } from "@/components/PerpDexLogo";
import { PerpIdentity } from "@/components/PerpIdentity";
import { brandBg, brandBgTone, brandBgIsGradient } from "@/lib/brand";
import { daysUntil, formatCostPerPoint } from "@/lib/format";
import type { VenueSummary } from "@/lib/types";
import { isReadyVenue } from "@/lib/venue-status";
import { tr, useLocale } from "@/components/LocaleProvider";

// Perps pinned to the top of the list, in this order; everything else follows
// alphabetically.
const PINNED_ORDER = ["variational", "hibachi"];
const BULLET_CARD: VenueSummary = {
  slug: "bullet",
  name: "Bullet",
  apiStatus: "stub",
  seasonName: null,
  seasonEndDate: null,
  makerBps: null,
  takerBps: null,
  confidence: null,
  lastVerified: null,
  pairs: [],
  cheapestCostPerPointUsd: null,
};

export function HomeSearch({ venues }: { venues: VenueSummary[] }) {
  const locale = useLocale();
  const [query, setQuery] = useState("");

  const ordered = useMemo(() => {
    const catalog = venues.some((venue) => venue.slug === BULLET_CARD.slug) ? venues : [...venues, BULLET_CARD];
    const rank = (slug: string) => {
      const i = PINNED_ORDER.indexOf(slug);
      return i === -1 ? Number.POSITIVE_INFINITY : i;
    };
    return [...catalog].sort((a, b) => {
      if (a.slug === "bullet") return b.slug === "bullet" ? 0 : 1;
      if (b.slug === "bullet") return -1;
      const ra = rank(a.slug);
      const rb = rank(b.slug);
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
    });
  }, [venues]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.slug.toLowerCase().includes(q) ||
        v.pairs.some((p) => p.toLowerCase().includes(q))
    );
  }, [ordered, query]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tr(locale, "Search perp-dexes or pairs", "Поиск perp-dex или пары")}
        className="pf-transition w-full rounded-md border border-border bg-surface-1 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-1 px-6 py-12 text-center">
          <p className="text-sm text-text-muted">
            {tr(
              locale,
              `Nothing found. We track ${venues.length} perp-dex${venues.length === 1 ? "" : "es"}.`,
              `Ничего не найдено. Мы отслеживаем ${venues.length} perp-dex.`
            )}
          </p>
          <a
            href="mailto:hello@perpfarm.example?subject=Perp-dex%20suggestion"
            className="pf-transition text-sm text-accent hover:text-accent-hover"
          >
            {tr(locale, "Suggest a perp-dex", "Предложить perp-dex")}
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((v) => {
            const days = daysUntil(v.seasonEndDate);
            const ready = isReadyVenue(v.slug);
            const seasonName = v.seasonName ?? (v.slug === "variational" ? "Season 1" : null);
            const cardBg = brandBg(v.slug);
            // Brands that ship a near-white background need dark metrics text.
            const lightBg = cardBg !== undefined && brandBgTone(v.slug) === "light";
            // A thin, neat border on every card (all four sides -- a full frame,
            // not the one-edge line that used to read as a seam). Tuned to the
            // card: a translucent hairline (light on dark cards, dark on the
            // lavender card) reads cleanly over a FLAT background, but shifts
            // colour along a GRADIENT and looks uneven -- so gradient cards get
            // a flat, opaque frame instead. Monogram cards keep the theme border.
            const borderColor = !cardBg
              ? "border-border"
              : lightBg
                ? "border-black/10"
                : brandBgIsGradient(v.slug)
                  ? "border-[#3a3b42]"
                  : "border-white/10";
            // Metrics sit ON the brand background (fixed, theme-independent), so
            // their colour must track the BRAND tone, not the site theme --
            // otherwise light theme turns them dark and they vanish on a dark
            // card. Non-branded cards use theme tokens (their tint IS themed).
            const metricMuted = cardBg
              ? lightBg
                ? "text-[#454e64]"
                : "text-[#aab2c5]"
              : "text-text-muted";
            const metricStrong = cardBg
              ? lightBg
                ? "text-[#0b1220]"
                : "text-white"
              : "text-text-primary";
            const cardClassName = `pf-transition flex flex-col gap-1 rounded-lg border ${borderColor} px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
              cardBg ? "hover:brightness-110" : "pf-card-tint"
            }`;
            const cardContent = <>
                <PerpIdentity
                  slug={v.slug}
                  name={v.name}
                  markPx={24}
                  namePx={15}
                  nameClassName="text-base"
                />
                {ready ? (
                  <span className="flex items-center gap-3 text-sm">
                    {seasonName && (
                      <span className={metricMuted}>
                        {days !== null
                          ? tr(locale, `${seasonName}: ${days}d left`, `${seasonName}: осталось ${days} д.`)
                          : seasonName}
                      </span>
                    )}
                    <span className={`font-mono-num font-semibold ${metricStrong}`}>
                      {v.cheapestCostPerPointUsd !== null
                        ? `${tr(locale, "from", "от")} ${formatCostPerPoint(v.cheapestCostPerPointUsd)}/pt`
                        : v.slug === "variational"
                          ? "est. $5–11/pt"
                          : tr(locale, "Awaiting estimate", "Ожидается оценка")}
                    </span>
                  </span>
                ) : (
                  <span className={`font-mono-num font-semibold ${metricStrong}`}>SOON</span>
                )}
              </>;
            return v.slug === BULLET_CARD.slug ? (
              <div key={v.slug} className={cardClassName} style={cardBg ? { background: cardBg } : perpDexBadgeVars(v.slug)}>
                {cardContent}
              </div>
            ) : (
              <Link key={v.slug} href={`/${v.slug}`} className={cardClassName} style={cardBg ? { background: cardBg } : perpDexBadgeVars(v.slug)}>
                {cardContent}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
