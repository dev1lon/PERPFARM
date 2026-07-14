"""01 Exchange adapter.

TODO(verify): confirm the public REST/WS API docs URL, market-list endpoint,
funding-rate endpoint (and its interval convention), orderbook depth
endpoint, and 24h volume/OI endpoint before wiring this up. Also confirm
points program mechanics.
"""

from perpfarm.adapters.base import (
    FeeData,
    FundingData,
    MarketInfo,
    OrderbookTop,
    VenueAdapter,
    VolumeData,
)


class Exchange01Adapter(VenueAdapter):
    slug = "01exchange"

    def get_markets(self) -> list[MarketInfo]:
        raise NotImplementedError("TODO(verify): 01 Exchange market-list endpoint")

    def get_funding(self, symbol: str) -> FundingData:
        raise NotImplementedError("TODO(verify): 01 Exchange funding-rate endpoint + interval")

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        raise NotImplementedError("TODO(verify): 01 Exchange orderbook/depth endpoint")

    def get_volume(self, symbol: str) -> VolumeData:
        raise NotImplementedError("TODO(verify): 01 Exchange volume/OI endpoint")

    def get_fees(self) -> FeeData:
        raise NotImplementedError("TODO(verify): 01 Exchange fee schedule page/endpoint")
