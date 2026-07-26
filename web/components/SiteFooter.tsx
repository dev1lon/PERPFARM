"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface Prices {
  btc: number | null;
  eth: number | null;
}

// Public, keyless, CORS-enabled spot prices. Polled client-side every 60s.
const PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd";

function formatUsd(n: number | null): string {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2 });
}

export function SiteFooter() {
  const [prices, setPrices] = useState<Prices>({ btc: null, eth: null });
  // On the redesigned /v2 pages, scope the v2 tokens onto the bar so it reads in
  // the redesign palette (matching the page) instead of the legacy chrome navy.
  const pathname = usePathname();
  const v2 = pathname?.startsWith("/v2") ? "pf-v2 " : "";

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(PRICE_URL, { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        setPrices({
          btc: typeof data?.bitcoin?.usd === "number" ? data.bitcoin.usd : null,
          eth: typeof data?.ethereum?.usd === "number" ? data.ethereum.usd : null,
        });
      } catch {
        /* transient network/rate-limit error -- keep the last known values */
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    // Fixed to the viewport bottom (always visible), a thin single-line bar.
    // main gets matching bottom padding in app/layout.tsx so nothing hides
    // behind it.
    <footer className={`${v2}fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-1`}>
      {/* Full-bleed: prices hard-left, credit hard-right (no centred max-width). */}
      <div className="flex items-center justify-between gap-3 whitespace-nowrap px-4 py-1.5 text-xs sm:px-6">
        <div className="flex items-center gap-4 font-mono-num">
          <span>
            <span className="text-text-muted">BTC</span>{" "}
            <span className="font-semibold text-text-primary">{formatUsd(prices.btc)}</span>
          </span>
          <span>
            <span className="text-text-muted">ETH</span>{" "}
            <span className="font-semibold text-text-primary">{formatUsd(prices.eth)}</span>
          </span>
        </div>
        <div className="flex items-center gap-1 text-text-muted">
          {/* Drop the prefix on very narrow phones so prices + link never overflow. */}
          <span className="hidden min-[400px]:inline">created by</span>
          <a
            href="https://x.com/devilonnn"
            target="_blank"
            rel="noreferrer"
            className="pf-transition inline-flex items-center gap-1 font-medium text-text-primary hover:text-accent"
          >
            devilonnn
            <XLogo />
          </a>
        </div>
      </div>
    </footer>
  );
}

function XLogo() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
