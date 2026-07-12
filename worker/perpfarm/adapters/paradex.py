"""Paradex adapter.

TODO(verify): confirm the public REST/WS API docs URL, market-list endpoint,
funding-rate endpoint (and its interval convention), orderbook depth
endpoint, and 24h volume/OI endpoint before wiring this up. Also confirm
whether Paradex's points program counts maker fills, taker fills, or both,
and whether it has since launched a token (would move it out of scope).
"""

from perpfarm.adapters.base import (
    FeeData,
    FundingData,
    MarketInfo,
    OrderbookTop,
    VenueAdapter,
    VolumeData,
)


class ParadexAdapter(VenueAdapter):
    slug = "paradex"

    def get_markets(self) -> list[MarketInfo]:
        raise NotImplementedError("TODO(verify): Paradex market-list endpoint")

    def get_funding(self, symbol: str) -> FundingData:
        raise NotImplementedError("TODO(verify): Paradex funding-rate endpoint + interval")

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        raise NotImplementedError("TODO(verify): Paradex orderbook/depth endpoint")

    def get_volume(self, symbol: str) -> VolumeData:
        raise NotImplementedError("TODO(verify): Paradex volume/OI endpoint")

    def get_fees(self) -> FeeData:
        raise NotImplementedError("TODO(verify): Paradex fee schedule page/endpoint")
