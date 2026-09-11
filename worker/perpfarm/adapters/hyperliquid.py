"""Hyperliquid's own perp book (HyperCore) -- public market-data adapter.

Collected as a venue of its own because TrueNorth, an AI trading agent with no
order book, executes its trades on it: a farmer choosing a TrueNorth account on
Hyperliquid is trading this book, so this book is what their route costs.

It is the same unauthenticated `/info` endpoint trade.xyz's adapter already
reads, answered in the same units -- funding as a fraction per hour, open
interest in base units, `l2Book` for the depth walk -- so the parsing is shared
with `TradexyzAdapter`. The one difference is scope: this venue asks for the
core dex only (a `metaAndAssetCtxs` call with no `dex` field), never the xyz
HIP-3 markets, and its totals are the core book's own.

Fees: Hyperliquid's tier 0, 0.015% maker / 0.045% taker
(hyperliquid.gitbook.io/hyperliquid-docs/trading/fees). An interface routing
through a builder code may add its own fee, up to 0.1% on perps; TrueNorth
publishes none, so none is added here.
"""

from __future__ import annotations

from collections.abc import Mapping

from perpfarm.adapters.base import FeeData, VenueTotals
from perpfarm.adapters.tradexyz import TradexyzAdapter, _float

FEE_SOURCE_URL = "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees"


class HyperliquidAdapter(TradexyzAdapter):
    """The core book only; everything else is trade.xyz's parsing, unchanged."""

    slug = "hyperliquid"

    def _all(self) -> dict[str, tuple[Mapping[str, object], Mapping[str, object]]]:
        """Every live core market with its context, fetched once per instance.

        A delisted market is left out entirely rather than listed inactive: this
        venue starts collecting today, so it has no history to keep for one.
        """

        if self._contexts is None:
            paired: dict[str, tuple[Mapping[str, object], Mapping[str, object]]] = {}
            for market, context in self._dex(None):
                symbol = market.get("name")
                if isinstance(symbol, str) and symbol and market.get("isDelisted") is not True:
                    paired[symbol] = (market, context)
            self._contexts = paired
        return self._contexts

    def get_venue_totals(self) -> VenueTotals:
        """The core book's 24h volume and open interest, summed per market."""

        volume = 0.0
        open_interest = 0.0
        for _market, context in self._all().values():
            market_volume = _float(context.get("dayNtlVlm"))
            if market_volume is not None:
                volume += market_volume
            price = _float(context.get("markPx"))
            size = _float(context.get("openInterest"))
            if price is not None and size is not None:
                open_interest += price * size
        return VenueTotals(volume_24h_usd=volume, open_interest_usd=open_interest)

    def get_fees(self) -> FeeData:
        """Tier 0: 0.015% maker, 0.045% taker. Volume tiers only take it lower."""

        return FeeData(maker_bps=1.5, taker_bps=4.5, source_url=FEE_SOURCE_URL)
