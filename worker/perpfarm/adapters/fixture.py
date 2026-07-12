"""Fixture-backed adapter for dev and tests.

Reads JSON files from a per-venue directory:

    <fixtures_dir>/<slug>/markets.json    -- list[MarketInfo-shaped dict]
    <fixtures_dir>/<slug>/funding.json    -- {native_symbol: FundingData-shaped dict}
    <fixtures_dir>/<slug>/orderbook.json  -- {native_symbol: OrderbookTop-shaped dict,
                                              impact_bps_*/depth_usd_* optional}
    <fixtures_dir>/<slug>/volume.json     -- {native_symbol: VolumeData-shaped dict}
    <fixtures_dir>/<slug>/fees.json       -- FeeData-shaped dict (venue-wide, not per-symbol)
"""

import json
from pathlib import Path

from perpfarm.adapters.base import (
    FeeData,
    FundingData,
    MarketInfo,
    OrderbookTop,
    VenueAdapter,
    VolumeData,
)


class FixtureAdapter(VenueAdapter):
    def __init__(self, slug: str, fixtures_dir: Path):
        self.slug = slug
        self._dir = fixtures_dir / slug
        if not self._dir.is_dir():
            raise FileNotFoundError(f"no fixture directory for venue '{slug}' at {self._dir}")

    def _load(self, filename: str) -> dict | list:
        path = self._dir / filename
        with path.open(encoding="utf-8") as f:
            return json.load(f)

    def get_markets(self) -> list[MarketInfo]:
        rows = self._load("markets.json")
        return [
            MarketInfo(
                symbol=row["symbol"],
                symbol_canonical=row["symbol_canonical"],
                base_asset=row["base_asset"],
                is_active=row.get("is_active", True),
            )
            for row in rows
        ]

    def get_funding(self, symbol: str) -> FundingData:
        row = self._load("funding.json")[symbol]
        return FundingData(
            funding_rate_raw=row["funding_rate_raw"],
            interval_hours=row["interval_hours"],
            funding_rate_annualized=row["funding_rate_annualized"],
        )

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        row = self._load("orderbook.json")[symbol]
        return OrderbookTop(
            best_bid=row["best_bid"],
            best_ask=row["best_ask"],
            spread_bps=row["spread_bps"],
            impact_bps_10k=row.get("impact_bps_10k"),
            impact_bps_50k=row.get("impact_bps_50k"),
            impact_bps_100k=row.get("impact_bps_100k"),
            depth_usd_10k=row.get("depth_usd_10k"),
            depth_usd_50k=row.get("depth_usd_50k"),
            depth_usd_100k=row.get("depth_usd_100k"),
        )

    def get_volume(self, symbol: str) -> VolumeData:
        row = self._load("volume.json")[symbol]
        return VolumeData(
            volume_24h_usd=row.get("volume_24h_usd"),
            open_interest_usd=row.get("open_interest_usd"),
        )

    def get_fees(self) -> FeeData:
        row = self._load("fees.json")
        return FeeData(
            maker_bps=row["maker_bps"],
            taker_bps=row["taker_bps"],
            source_url=row.get("source_url"),
        )
