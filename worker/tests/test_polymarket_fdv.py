from perpfarm.jobs.polymarket_fdv import parse_fdv_event


def test_parse_fdv_event_keeps_yes_probability_and_sorts_thresholds():
    snapshot = parse_fdv_event(
        {
            "volume": "1780728.34",
            "markets": [
                {
                    "groupItemTitle": "$1B",
                    "outcomes": '["Yes", "No"]',
                    "outcomePrices": '["0.32", "0.68"]',
                    "volume": "165698.74",
                },
                {
                    "groupItemTitle": "$100M",
                    "outcomes": '["Yes", "No"]',
                    "outcomePrices": '["0.97", "0.03"]',
                    "volume": "26542.38",
                },
            ],
        }
    )

    assert snapshot.event_volume_usd == 1780728.34
    assert [(market.threshold, market.probability_pct) for market in snapshot.markets] == [
        ("$100M", 97),
        ("$1B", 32),
    ]
