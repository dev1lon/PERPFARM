import type { Metadata } from "next";

export const metadata: Metadata = { title: "Methodology — perpfarm" };

export default function MethodologyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10 px-4 py-20 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-text-primary">Methodology</h1>
        <p className="font-mono-num text-sm text-text-muted">Updated 2026-07-12</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text-primary">What &quot;cost per point&quot; means</h2>
        <p className="leading-relaxed text-text-muted">
          We add up everything a delta-neutral position pays: trading fees on both legs, the spread
          you cross, price impact at your size, and the 7-day average funding difference between the
          two perp-dexes. That total is divided by the points the same volume earns. The number is
          recomputed nightly.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text-primary">Where the data comes from</h2>
        <p className="leading-relaxed text-text-muted">
          Prices, books, and funding come from perp-dex APIs, refreshed hourly. Fee schedules are read
          from perp-dex fee pages daily. Point weights come from public announcements, community
          research, and our own test trades.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text-primary">What can go wrong</h2>
        <p className="leading-relaxed text-text-muted">
          Perp-dexes change point weights between seasons, sometimes without notice. Books go thin and
          real slippage exceeds the estimate. Two accounts on the same perp-dex are modeled as if they
          mostly fill against each other, which is an approximation, not a measurement. Treat every
          number here as an estimate, not a guarantee.
        </p>
      </section>

      <div className="border-t border-border pt-6 text-sm text-text-muted">
        Estimates from public data · not financial advice
      </div>
    </div>
  );
}
