from perpfarm.jobs.hedge_recommendations import Market, _compute


def market(*, venue_id: int, slug: str, symbol: str, maker: float, taker: float) -> Market:
    return Market(
        venue_id=venue_id,
        slug=slug,
        symbol=symbol,
        spread_bps=1,
        impact_10k=1,
        impact_50k=1,
        impact_100k=1,
        quote_curve=None,
        volume_24h_usd=1_000_000,
        open_interest_usd=1_000_000,
        maker_bps=maker,
        taker_bps=taker,
    )


def test_hourly_recommendation_compares_self_and_each_cross_venue():
    # Variational's self-match is cheapest, while TxFlow gets a lower cost by
    # resting its limit on TxFlow and crossing Variational's free taker book.
    recommendations = _compute(
        [
            market(venue_id=1, slug="variational", symbol="BTC", maker=0, taker=0),
            market(venue_id=2, slug="txflow", symbol="BTC", maker=1.425, taker=4.275),
        ]
    )

    assert recommendations[1][0] == 1
    assert recommendations[2][0] == 1
    assert recommendations[1][1] < recommendations[2][1]
