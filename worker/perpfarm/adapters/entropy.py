"""Entropy adapter.

Perpetual futures on private-market assets and other hard-to-access markets
(entropy.io: "Trade the Frontier") -- so its listings are pre-IPO names and
similar, not the crypto majors, and its markets may not pair with anything on
the other protocols we price.

TODO(verify): confirm the public REST/WS API docs URL (docs.entropy.io blocks
non-browser clients), market-list endpoint, funding-rate endpoint (and its
interval convention), orderbook depth endpoint, and 24h volume/OI endpoint
before wiring this up. Also confirm points program mechanics -- nothing is
announced on the landing page.
"""

from perpfarm.adapters.base import (
    FeeData,
    FundingData,
    MarketInfo,
    OrderbookTop,
    VenueAdapter,
    VolumeData,
)


class EntropyAdapter(VenueAdapter):
    slug = "entropy"

    def get_markets(self) -> list[MarketInfo]:
        raise NotImplementedError("TODO(verify): Entropy market-list endpoint")

    def get_funding(self, symbol: str) -> FundingData:
        raise NotImplementedError("TODO(verify): Entropy funding-rate endpoint + interval")

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        raise NotImplementedError("TODO(verify): Entropy orderbook/depth endpoint")

    def get_volume(self, symbol: str) -> VolumeData:
        raise NotImplementedError("TODO(verify): Entropy volume/OI endpoint")

    def get_fees(self) -> FeeData:
        raise NotImplementedError("TODO(verify): Entropy fee schedule page/endpoint")
