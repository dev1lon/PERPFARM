"""QFEX adapter.

TODO(verify): confirm this venue's official name/domain, public REST/WS API
docs URL, market-list endpoint, funding-rate endpoint (and its interval
convention), orderbook depth endpoint, and 24h volume/OI endpoint before
wiring this up. Also confirm points program mechanics.
"""

from perpfarm.adapters.base import (
    FeeData,
    FundingData,
    MarketInfo,
    OrderbookTop,
    VenueAdapter,
    VolumeData,
)


class QfexAdapter(VenueAdapter):
    slug = "qfex"

    def get_markets(self) -> list[MarketInfo]:
        raise NotImplementedError("TODO(verify): QFEX market-list endpoint")

    def get_funding(self, symbol: str) -> FundingData:
        raise NotImplementedError("TODO(verify): QFEX funding-rate endpoint + interval")

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        raise NotImplementedError("TODO(verify): QFEX orderbook/depth endpoint")

    def get_volume(self, symbol: str) -> VolumeData:
        raise NotImplementedError("TODO(verify): QFEX volume/OI endpoint")

    def get_fees(self) -> FeeData:
        raise NotImplementedError("TODO(verify): QFEX fee schedule page/endpoint")
