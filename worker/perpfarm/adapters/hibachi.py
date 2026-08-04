"""Hibachi adapter -- the first real-venue integration (wired 2026-07-12).

Endpoints verified against the official Python SDK
(https://github.com/hibachi-xyz/hibachi_sdk, `helpers.py` DEFAULT_DATA_API_URL
+ `api.py` paths) and exercised live against production before this was
written. Public market data needs no API key.

    GET /market/exchange-info            -- contracts + feeConfig
    GET /market/data/prices?symbol=      -- bid/ask/mark + fundingRateEstimation
    GET /market/data/orderbook?symbol=&depth=&granularity=
    GET /market/data/stats?symbol=       -- volume24h (quote units, USDT)
    GET /market/data/open-interest?symbol=  -- totalQuantity (base units)
    GET /market/data/funding-rates?symbol=  -- history (not used here; see below)

Funding interval: **1 hour**. Confirmed by the official docs
(docs.hibachi.xyz/hibachi-docs/trading/funding: "On Hibachi, funding
payments are made every hour") and cross-checked live -- consecutive
`fundingTimestamp`s in /market/data/funding-rates are exactly 3600s apart
(2026-07-12). `estimatedFundingRate` is the per-interval (1h) rate.
"""

import time

import httpx

from perpfarm.adapters.base import (
    FeeData,
    FundingData,
    MarketInfo,
    MarketUnavailable,
    OrderbookTop,
    VenueAdapter,
    VolumeData,
)

# Public market-data host -- NOT api.hibachi.xyz (that host serves gRPC /
# authenticated REST; the SDK routes all unauthenticated requests here).
DATA_API_URL = "https://data-api.hibachi.xyz"

FUNDING_INTERVAL_HOURS = 1.0  # see module docstring for the verification trail
_HOURS_PER_YEAR = 8760.0
_IMPACT_BUCKETS_USD = (10_000.0, 50_000.0, 100_000.0)
_ORDERBOOK_DEPTH = 100  # price levels per side to request for the impact walk


def _walk_side(levels: list[tuple[float, float]], bucket_usd: float) -> tuple[float, float] | None:
    """VWAP-walk one book side for `bucket_usd` of notional.

    `levels` must be ordered best-first (asks ascending, bids descending).
    Returns (vwap, reachable_usd) where reachable_usd <= bucket_usd on a thin
    book, or None for an empty side.
    """
    if not levels:
        return None
    remaining = bucket_usd
    cost = 0.0  # sum of price * base_qty actually consumed
    filled = 0.0  # base qty consumed
    for price, qty in levels:
        level_notional = price * qty
        take_notional = min(remaining, level_notional)
        take_qty = take_notional / price
        cost += take_notional
        filled += take_qty
        remaining -= take_notional
        if remaining <= 0:
            break
    if filled == 0.0:
        return None
    vwap = cost / filled
    return vwap, bucket_usd - max(remaining, 0.0)


def _impact_from_book(
    asks: list[tuple[float, float]], bids: list[tuple[float, float]], mid: float
) -> dict[str, float | None]:
    """Mid-referenced impact (bps) + reachable depth (USD) per notional bucket,
    averaged across the buy (ask-walk) and sell (bid-walk) sides; depth is the
    conservative min of the two sides. See docs/scoring.md for the bucket
    semantics the scoring engine expects."""
    out: dict[str, float | None] = {}
    for bucket in _IMPACT_BUCKETS_USD:
        label = f"{int(bucket / 1000)}k"
        ask_walk = _walk_side(asks, bucket)
        bid_walk = _walk_side(bids, bucket)
        if ask_walk is None or bid_walk is None or mid <= 0:
            out[f"impact_bps_{label}"] = None
            out[f"depth_usd_{label}"] = None
            continue
        ask_vwap, ask_reach = ask_walk
        bid_vwap, bid_reach = bid_walk
        ask_impact = (ask_vwap - mid) / mid * 10_000.0
        bid_impact = (mid - bid_vwap) / mid * 10_000.0
        out[f"impact_bps_{label}"] = (ask_impact + bid_impact) / 2.0
        out[f"depth_usd_{label}"] = min(ask_reach, bid_reach)
    return out


def _parse_levels(side: dict | None) -> list[tuple[float, float]]:
    # A closed market (weekend FX/metals) can return a null side, not {} --
    # treat it as no levels rather than crashing on None.get(...).
    return [(float(lv["price"]), float(lv["quantity"])) for lv in (side or {}).get("levels", [])]


class HibachiAdapter(VenueAdapter):
    slug = "hibachi"

    def __init__(self) -> None:
        self._exchange_info: dict | None = None

    def _get_json(self, path: str, params: dict | None = None) -> dict:
        # data-api sits behind Cloudflare and drops the occasional request --
        # one cheap retry keeps a single blip from failing a whole market's
        # snapshot (callers already isolate per-market errors on top of this).
        last: Exception | None = None
        for attempt in range(2):
            try:
                resp = httpx.get(
                    DATA_API_URL + path,
                    params=params,
                    timeout=25,
                    headers={"Accept": "application/json"},
                )
                resp.raise_for_status()
                return resp.json()
            except Exception as exc:  # noqa: BLE001 -- retried once, then re-raised
                last = exc
                if attempt == 0:
                    time.sleep(1.0)
        raise last  # type: ignore[misc]

    def _get_exchange_info(self) -> dict:
        if self._exchange_info is None:
            self._exchange_info = self._get_json("/market/exchange-info")
        return self._exchange_info

    def _contracts(self) -> list[dict]:
        # During scheduled maintenance the API answers 200 with a payload that
        # has no contract list. Say so plainly instead of surfacing a bare
        # KeyError('futureContracts') in the cron log.
        info = self._get_exchange_info()
        contracts = info.get("futureContracts")
        if not contracts:
            raise RuntimeError("Hibachi API returned no contracts (venue under maintenance?)")
        return contracts

    def get_markets(self) -> list[MarketInfo]:
        contracts = self._contracts()
        return [
            MarketInfo(
                symbol=c["symbol"],
                # canonical key = the underlying, e.g. "BTC" from "BTC/USDT-P";
                # cross-venue mismatches are fixable via symbol_overrides.yaml
                symbol_canonical=c["underlyingSymbol"],
                base_asset=c["underlyingSymbol"],
                # FX/metal markets close on weekends: status flips off LIVE
                is_active=c.get("status") == "LIVE" and c.get("symbolStatus") == "OPEN",
            )
            for c in contracts
        ]

    def get_funding(self, symbol: str) -> FundingData:
        prices = self._get_json("/market/data/prices", params={"symbol": symbol})
        estimation = prices.get("fundingRateEstimation")
        if not estimation:
            # closed market (weekend FX/metals): no funding estimate -> skip
            raise MarketUnavailable(f"hibachi: no funding estimation for {symbol} (market closed?)")
        raw = float(estimation["estimatedFundingRate"])
        return FundingData(
            funding_rate_raw=raw,
            interval_hours=FUNDING_INTERVAL_HOURS,
            funding_rate_annualized=raw * (_HOURS_PER_YEAR / FUNDING_INTERVAL_HOURS),
        )

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        contracts = self._contracts()
        contract = next(c for c in contracts if c["symbol"] == symbol)
        granularity = contract["orderbookGranularities"][0]  # finest

        book = self._get_json(
            "/market/data/orderbook",
            params={"symbol": symbol, "depth": _ORDERBOOK_DEPTH, "granularity": granularity},
        )
        asks = sorted(_parse_levels(book.get("ask")), key=lambda pq: pq[0])
        bids = sorted(_parse_levels(book.get("bid")), key=lambda pq: -pq[0])
        if not asks or not bids:
            # closed market (weekend FX/metals) returns null/empty sides -> skip
            raise MarketUnavailable(f"hibachi: empty orderbook for {symbol} (market closed?)")

        best_ask = asks[0][0]
        best_bid = bids[0][0]
        mid = (best_ask + best_bid) / 2.0
        impact = _impact_from_book(asks, bids, mid)

        return OrderbookTop(
            best_bid=best_bid,
            best_ask=best_ask,
            spread_bps=(best_ask - best_bid) / mid * 10_000.0,
            impact_bps_10k=impact["impact_bps_10k"],
            impact_bps_50k=impact["impact_bps_50k"],
            impact_bps_100k=impact["impact_bps_100k"],
            depth_usd_10k=impact["depth_usd_10k"],
            depth_usd_50k=impact["depth_usd_50k"],
            depth_usd_100k=impact["depth_usd_100k"],
        )

    def get_volume(self, symbol: str) -> VolumeData:
        stats = self._get_json("/market/data/stats", params={"symbol": symbol})
        # volume24h is in quote units (USDT ~ USD): the observed magnitudes
        # only make sense as quote notional, base units would be absurd
        volume_24h_usd = float(stats["volume24h"]) if stats.get("volume24h") else None

        open_interest_usd = None
        oi = self._get_json("/market/data/open-interest", params={"symbol": symbol})
        if oi.get("totalQuantity"):
            # totalQuantity is in base units -- convert via mark price
            prices = self._get_json("/market/data/prices", params={"symbol": symbol})
            mark = float(prices["markPrice"])
            open_interest_usd = float(oi["totalQuantity"]) * mark

        return VolumeData(volume_24h_usd=volume_24h_usd, open_interest_usd=open_interest_usd)

    def get_fees(self) -> FeeData:
        fee_config = self._get_exchange_info()["feeConfig"]
        return FeeData(
            # tradeMakerFeeRate/tradeTakerFeeRate are decimal rates (0.00045
            # = 4.5 bps); cross-checked against docs.hibachi.xyz fees page
            maker_bps=float(fee_config["tradeMakerFeeRate"]) * 10_000.0,
            taker_bps=float(fee_config["tradeTakerFeeRate"]) * 10_000.0,
            source_url=f"{DATA_API_URL}/market/exchange-info",
        )
