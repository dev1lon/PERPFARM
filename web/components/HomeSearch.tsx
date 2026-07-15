"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { perpDexBadgeVars } from "@/components/PerpDexLogo";
import { PerpIdentity } from "@/components/PerpIdentity";
import { brandBg, brandBgTone } from "@/lib/brand";
import { daysUntil, formatCostPerPoint } from "@/lib/format";
import type { VenueSummary } from "@/lib/types";

// Perps pinned to the top of the list, in this order; everything else follows
// alphabetically.
const PINNED_ORDER = ["variational", "hibachi"];

export function HomeSearch({ venues }: { venues: VenueSummary[] }) {
  const [query, setQuery] = useState("");

  const ordered = useMemo(() => {
    const rank = (slug: string) => {
      const i = PINNED_ORDER.indexOf(slug);
      return i === -1 ? Number.POSITIVE_INFINITY : i;
    };
    return [...venues].sort((a, b) => {
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
        placeholder="Search perp-dexes or pairs"
        className="pf-transition w-full rounded-md border border-border bg-surface-1 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-1 px-6 py-12 text-center">
          <p className="text-sm text-text-muted">
            Nothing found. We track {venues.length} perp-dex{venues.length === 1 ? "" : "es"}.
          </p>
          <a
            href="mailto:hello@perpfarm.example?subject=Perp-dex%20suggestion"
            className="pf-transition text-sm text-accent hover:text-accent-hover"
          >
            Suggest a perp-dex
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((v) => {
            const days = daysUntil(v.seasonEndDate);
            // Branded perps get the SAME dark brand gradient as their page and
            // render BORDERLESS -- an immersive slice of the page, so no border
            // line reads as a seam. Others keep the bordered monogram-tint card.
            const cardBg = brandBg(v.slug);
            // Brands that ship a near-white background need dark metrics text.
            const lightBg = cardBg !== undefined && brandBgTone(v.slug) === "light";
            return (
              <Link
                key={v.slug}
                href={`/${v.slug}`}
                className={`pf-transition flex flex-col gap-1 rounded-lg px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
                  cardBg ? "hover:brightness-110" : "pf-card-tint border border-border"
                }`}
                style={cardBg ? { background: cardBg } : perpDexBadgeVars(v.slug)}
              >
                <PerpIdentity
                  slug={v.slug}
                  name={v.name}
                  markPx={24}
                  namePx={15}
                  nameClassName="text-base"
                />
                <span className="flex items-center gap-3 text-sm">
                  <span className={lightBg ? "text-[#454e64]" : "text-text-muted"}>
                    {days !== null ? `season ends in ${days}d` : "season n/a"}
                  </span>
                  <span
                    className={`font-mono-num font-semibold ${
                      lightBg ? "text-[#0b1220]" : "text-text-primary"
                    }`}
                  >
                    {v.cheapestCostPerPointUsd !== null
                      ? `from ${formatCostPerPoint(v.cheapestCostPerPointUsd)}/pt`
                      : "no data yet"}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
