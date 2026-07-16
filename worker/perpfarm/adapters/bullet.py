"""Bullet adapter placeholder.

Bullet is listed in the catalog so PerpFarm can track it, but no points,
fees, market-data, or execution endpoints have been verified yet.
"""

from perpfarm.adapters.base import FeeData, FundingData, MarketInfo, OrderbookTop, VenueAdapter, VolumeData


class BulletAdapter(VenueAdapter):
    slug = "bullet"

    def get_markets(self) -> list[MarketInfo]:
        raise NotImplementedError("TODO(verify): Bullet market-list endpoint")

    def get_funding(self, symbol: str) -> FundingData:
        raise NotImplementedError("TODO(verify): Bullet funding-rate endpoint")

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        raise NotImplementedError("TODO(verify): Bullet orderbook/depth endpoint")

    def get_volume(self, symbol: str) -> VolumeData:
        raise NotImplementedError("TODO(verify): Bullet volume/OI endpoint")

    def get_fees(self) -> FeeData:
        raise NotImplementedError("TODO(verify): Bullet fee schedule")
