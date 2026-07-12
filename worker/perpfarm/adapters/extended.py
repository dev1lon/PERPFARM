"""Extended adapter.

TODO(verify): confirm the public REST/WS API docs URL, market-list endpoint,
funding-rate endpoint (and its interval convention), orderbook depth
endpoint, and 24h volume/OI endpoint before wiring this up. Also confirm
whether Extended's points program counts maker fills, taker fills, or both.
"""

from perpfarm.adapters.base import (
    FeeData,
    FundingData,
    MarketInfo,
    OrderbookTop,
    VenueAdapter,
    VolumeData,
)


class ExtendedAdapter(VenueAdapter):
    slug = "extended"

    def get_markets(self) -> list[MarketInfo]:
        raise NotImplementedError("TODO(verify): Extended market-list endpoint")

    def get_funding(self, symbol: str) -> FundingData:
        raise NotImplementedError("TODO(verify): Extended funding-rate endpoint + interval")

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        raise NotImplementedError("TODO(verify): Extended orderbook/depth endpoint")

    def get_volume(self, symbol: str) -> VolumeData:
        raise NotImplementedError("TODO(verify): Extended volume/OI endpoint")

    def get_fees(self) -> FeeData:
        raise NotImplementedError("TODO(verify): Extended fee schedule page/endpoint")
