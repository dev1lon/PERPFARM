"use client";

import { useEffect, useState } from "react";

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
    <footer className="border-t border-border bg-surface-1">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-4 text-sm font-mono-num">
          <span>
            <span className="text-text-muted">BTC</span>{" "}
            <span className="font-semibold text-text-primary">{formatUsd(prices.btc)}</span>
          </span>
          <span>
            <span className="text-text-muted">ETH</span>{" "}
            <span className="font-semibold text-text-primary">{formatUsd(prices.eth)}</span>
          </span>
        </div>
        <a
          href="https://x.com/devilonnn"
          target="_blank"
          rel="noreferrer"
          className="pf-transition flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary"
        >
          created by devilonnn
          <XLogo />
        </a>
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
