"""RiseX public market-data adapter.

RiseX is the perp DEX on RISE chain, traded at rise.trade. Its read-only REST
API is unauthenticated and answers everything PerpFarm records:

* ``/api/v1/markets`` -- the catalog, and with it 24h quote volume, open
  interest, mark price and the current funding rate, all in one request;
* ``/api/v1/orderbook?market_id=N`` -- fifty levels a side of the public CLOB,
  which is what turns "spread" into a real VWAP walk at the size being priced.

TODO(verify): the fee schedule. docs.risechain.com documents the chain rather
than the exchange's maker/taker tiers, so `get_fees` raises until someone reads
it off the venue -- PerpFarm then collects RiseX market data but prices no
RiseX route, which is the honest order to do it in.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import httpx

from perpfarm.adapters.base import (
    FeeData,
    FundingData,
    MarketInfo,
    MarketUnavailable,
    OrderbookTop,
    QuoteCurve,
    QuoteCurvePoint,
    VenueAdapter,
    VolumeData,
)

API_BASE = "https://api.rise.trade/api/v1"
_HOURS_PER_YEAR = 8760.0
_NANOSECONDS_PER_HOUR = 3_600_000_000_000.0
#: Same geometric ladder as the other CLOB adapters.
_QUOTE_BUCKETS = (
    500.0,
    1_000.0,
    2_500.0,
    5_000.0,
    10_000.0,
    25_000.0,
    50_000.0,
    100_000.0,
)


def _float(value: object | None) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if numeric == numeric else None


def _vwap(levels: Sequence[tuple[float, float]], notional_usd: float) -> tuple[float, float] | None:
    """Walk one side of the book until `notional_usd` is filled, or give up.

    None means the book could not reach that size -- never a partial fill
    reported as if the whole order had gone through at that price.
    """

    remaining = notional_usd
    spent = 0.0
    quantity = 0.0
    for price, size in levels:
        level_notional = price * size
        take_notional = min(remaining, level_notional)
        if take_notional <= 0:
            continue
        spent += take_notional
        quantity += take_notional / price
        remaining -= take_notional
        if remaining <= 1e-6:
            return spent / quantity, spent
    return None


def _parse_levels(raw_levels: object) -> list[tuple[float, float]]:
    if not isinstance(raw_levels, Sequence) or isinstance(raw_levels, (str, bytes)):
        return []
    levels: list[tuple[float, float]] = []
    for row in raw_levels:
        if not isinstance(row, Mapping):
            continue
        price = _float(row.get("price"))
        size = _float(row.get("quantity"))
        if price is not None and size is not None and price > 0 and size > 0:
            levels.append((price, size))
    return levels


def canonical_symbol(symbol: str) -> str:
    """`BTC/USDC` -> `BTC`.

    The quote currency is not part of the instrument for our purposes: a
    canonical symbol exists so BTC here can be matched with BTC on another
    venue, and no two venues spell that pair the same way.
    """

    base, _, _quote = symbol.partition("/")
    return (base or symbol).upper()


class RiseXAdapter(VenueAdapter):
    slug = "risex"

    def __init__(self) -> None:
        self._markets_by_symbol: dict[str, Mapping[str, object]] | None = None

    def _get(self, path: str, params: Mapping[str, object] | None = None) -> Mapping[str, object]:
        response = httpx.get(
            f"{API_BASE}{path}", params=params, timeout=25, headers={"Accept": "application/json"}
        )
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data") if isinstance(payload, Mapping) else None
        if not isinstance(data, Mapping):
            raise ValueError(f"risex: unexpected response for {path}")
        return data

    def _markets(self) -> dict[str, Mapping[str, object]]:
        """The whole catalog, fetched once per instance.

        One request carries volume, open interest, mark price and funding for
        every market, so a run costs one call plus one book per market.
        """

        if self._markets_by_symbol is None:
            rows = self._get("/markets").get("markets")
            if not isinstance(rows, list):
                raise ValueError("risex: /markets returned no markets")
            self._markets_by_symbol = {
                symbol: row
                for row in rows
                if isinstance(row, Mapping)
                and isinstance((symbol := row.get("display_name") or row.get("base_asset_symbol")), str)
                and symbol
            }
        return self._markets_by_symbol

    def _market(self, symbol: str) -> Mapping[str, object]:
        market = self._markets().get(symbol)
        if market is None:
            raise MarketUnavailable(f"risex: unknown market {symbol}")
        return market

    def get_markets(self) -> list[MarketInfo]:
        markets: list[MarketInfo] = []
        for symbol, row in self._markets().items():
            base_asset = canonical_symbol(symbol)
            if not base_asset:
                continue
            markets.append(
                MarketInfo(
                    symbol=symbol,
                    symbol_canonical=base_asset,
                    base_asset=base_asset,
                    is_active=row.get("active") is True,
                )
            )
        return markets

    def get_funding(self, symbol: str) -> FundingData:
        """`current_funding_rate` is a FRACTION per funding interval.

        The interval arrives in NANOSECONDS (3_600_000_000_000 = one hour), and
        the venue also publishes `funding_rate_8h`, which is simply eight times
        the hourly figure -- reading that one as the per-interval rate would
        multiply every RiseX rate by eight.
        """

        market = self._market(symbol)
        rate = _float(market.get("current_funding_rate"))
        interval_ns = _float(market.get("funding_interval"))
        if rate is None or interval_ns is None or interval_ns <= 0:
            raise MarketUnavailable(f"risex: funding unavailable for {symbol}")
        interval_hours = interval_ns / _NANOSECONDS_PER_HOUR
        return FundingData(
            funding_rate_raw=rate,
            interval_hours=interval_hours,
            funding_rate_annualized=rate * (_HOURS_PER_YEAR / interval_hours),
        )

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        market = self._market(symbol)
        market_id = market.get("market_id")
        if not isinstance(market_id, (str, int)):
            raise MarketUnavailable(f"risex: missing market id for {symbol}")

        book = self._get("/orderbook", {"market_id": str(market_id)})
        bids = _parse_levels(book.get("bids"))
        asks = _parse_levels(book.get("asks"))
        if not bids or not asks:
            raise MarketUnavailable(f"risex: empty book for {symbol}")
        best_bid, best_ask = bids[0][0], asks[0][0]
        mid = (best_bid + best_ask) / 2.0
        spread_bps = (best_ask - best_bid) / mid * 10_000.0

        points = [QuoteCurvePoint(notional_usd=0.0, bid=best_bid, ask=best_ask)]
        for notional in _QUOTE_BUCKETS:
            sell = _vwap(bids, notional)
            buy = _vwap(asks, notional)
            if sell is None or buy is None:
                break
            points.append(QuoteCurvePoint(notional_usd=notional, bid=sell[0], ask=buy[0]))
        curve = QuoteCurve(reference_price=mid, points=tuple(points))

        def impact_at(notional: float) -> float | None:
            point = next((item for item in curve.points if item.notional_usd == notional), None)
            if point is None:
                return None
            buy_impact = max(point.ask - best_ask, 0.0) / mid * 10_000.0
            sell_impact = max(best_bid - point.bid, 0.0) / mid * 10_000.0
            return (buy_impact + sell_impact) / 2.0

        return OrderbookTop(
            best_bid=best_bid,
            best_ask=best_ask,
            spread_bps=spread_bps,
            impact_bps_10k=impact_at(10_000.0),
            impact_bps_50k=impact_at(50_000.0),
            impact_bps_100k=impact_at(100_000.0),
            depth_usd_10k=10_000.0 if impact_at(10_000.0) is not None else None,
            depth_usd_50k=50_000.0 if impact_at(50_000.0) is not None else None,
            depth_usd_100k=100_000.0 if impact_at(100_000.0) is not None else None,
            quote_curve=curve,
        )

    def get_volume(self, symbol: str) -> VolumeData:
        """24h quote volume as published, and open interest converted to USD.

        `open_interest` is in BASE units (144.2 BTC), so it is multiplied by the
        mark price -- storing it raw would show an $11M market as 144.
        """

        market = self._market(symbol)
        price = _float(market.get("mark_price")) or _float(market.get("last_price"))
        open_interest_base = _float(market.get("open_interest"))
        return VolumeData(
            volume_24h_usd=_float(market.get("quote_volume_24h")),
            open_interest_usd=(
                price * open_interest_base if price is not None and open_interest_base is not None else None
            ),
        )

    def get_fees(self) -> FeeData:
        raise NotImplementedError(
            "TODO(verify): RiseX's maker/taker schedule. docs.risechain.com documents "
            "the chain, not the exchange's fee tiers."
        )
