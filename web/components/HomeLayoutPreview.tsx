"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PerpIdentity } from "@/components/PerpIdentity";
import { tr, useLocale } from "@/components/LocaleProvider";

type PreviewVenue = { slug: string; name: string };

const tiers: Array<{ label: string; venues: PreviewVenue[] }> = [
  {
    label: "Tier S",
    venues: [
      { slug: "variational", name: "Variational" },
      { slug: "tradexyz", name: "TradeXYZ" },
    ],
  },
  {
    label: "Early stage",
    venues: [
      { slug: "risex", name: "RiseX" },
      { slug: "txflow", name: "TxFlow" },
    ],
  },
  {
    label: "Radar",
    venues: [
      { slug: "polymarket", name: "Polymarket" },
      { slug: "hotstuff", name: "HotStuff" },
      { slug: "01exchange", name: "N1" },
      { slug: "bullet", name: "Bullet" },
      { slug: "hibachi", name: "Hibachi" },
      { slug: "extended", name: "Extended" },
      { slug: "pacifica", name: "Pacifica" },
      { slug: "nado", name: "Nado" },
      { slug: "perpl", name: "Perpl" },
      { slug: "reya", name: "Reya" },
    ],
  },
];

function PreviewVenueCard({ venue, featured }: { venue: PreviewVenue; featured: boolean }) {
  return (
    <Link
      href={`/${venue.slug}`}
      className={`pf-transition flex min-h-28 items-center rounded-2xl border bg-surface-1 px-6 py-5 hover:bg-surface-hover ${featured ? "border-accent/60" : "border-border"}`}
    >
      <PerpIdentity
        slug={venue.slug}
        name={venue.name}
        markPx={28}
        namePx={18}
        nameClassName="text-lg"
        useNameImage={false}
      />
    </Link>
  );
}

export function HomeLayoutPreview() {
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTiers = useMemo(() => tiers.map((tier) => ({
    ...tier,
    venues: normalizedQuery
      ? tier.venues.filter((venue) => venue.name.toLowerCase().includes(normalizedQuery))
      : tier.venues,
  })).filter((tier) => tier.venues.length > 0), [normalizedQuery]);

  return (
    <main className="min-h-screen bg-bg px-3 py-3 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-6xl rounded-[1.5rem] bg-bg px-5 py-14 sm:px-10 sm:py-20">
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-5xl">{tr(locale, "Farm perp points, pay less for them", "Фармите perp-поинты с меньшими затратами")}</h1>
          <p className="mt-4 text-lg text-text-muted sm:text-xl">{tr(locale, "Reward mechanics, current recommendations and lower-cost routes", "Механики наград, актуальные рекомендации и более дешёвые маршруты")}</p>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr(locale, "Search perp-dex", "Поиск perp-dex")}
            className="mt-8 w-full rounded-2xl border border-border bg-surface-1 px-6 py-4 text-lg text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </section>

        <div className="mt-12 flex flex-col gap-10">
          {visibleTiers.map((tier) => (
            <section key={tier.label}>
              <h2 className="text-xl font-medium text-accent">{tier.label}</h2>
              <div className={`mt-5 grid gap-4 ${tier.label === "Tier S" || tier.label === "Early stage" ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
                {tier.venues.map((venue) => <PreviewVenueCard key={venue.slug} venue={venue} featured={tier.label === "Tier S"} />)}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-14 text-center text-sm text-text-muted">{tr(locale, "Estimates from public data · not financial advice", "Оценки на основе публичных данных · не финансовый совет")}</p>
      </div>
    </main>
  );
}
