"""Variational adapter.

TODO(verify): confirm the public REST/WS API docs URL, auth requirements,
market-list endpoint, funding-rate endpoint (and its interval convention),
orderbook depth endpoint, and 24h volume/OI endpoint before wiring this up.
Variational's points program (if any) mechanics also need independent
confirmation -- do not assume RFQ/OTC fills count the same as onchain perp
fills for points purposes.
"""

from perpfarm.adapters.base import (
    FeeData,
    FundingData,
    MarketInfo,
    OrderbookTop,
    VenueAdapter,
    VolumeData,
)


class VariationalAdapter(VenueAdapter):
    slug = "variational"

    def get_markets(self) -> list[MarketInfo]:
        raise NotImplementedError("TODO(verify): Variational market-list endpoint")

    def get_funding(self, symbol: str) -> FundingData:
        raise NotImplementedError("TODO(verify): Variational funding-rate endpoint + interval")

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        raise NotImplementedError("TODO(verify): Variational orderbook/depth endpoint")

    def get_volume(self, symbol: str) -> VolumeData:
        raise NotImplementedError("TODO(verify): Variational volume/OI endpoint")

    def get_fees(self) -> FeeData:
        raise NotImplementedError("TODO(verify): Variational fee schedule page/endpoint")
