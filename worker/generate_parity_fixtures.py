"""One-off generator for data/parity/scoring_scenarios.json -- run manually
whenever the scenarios below change. Python is the reference implementation:
this script computes `expected` via score_route, and both
worker/tests/test_scoring_parity.py and web/lib/scoring.parity.test.ts must
reproduce these exact numbers.
"""

import json
from pathlib import Path

from perpfarm.scoring.engine import score_route
from perpfarm.scoring.types import LegInputs, ScoringParams

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "data" / "parity" / "scoring_scenarios.json"

SCENARIOS = [
    {
        "name": "maker_rebate_vs_taker_only_points",
        "long_leg": {
            "venue_slug": "venue_alpha",
            "maker_bps": 0.0,
            "taker_bps": 5.0,
            "spread_bps": 2.0,
            "impact_bps_10k": 1.0,
            "impact_bps_50k": 2.0,
            "impact_bps_100k": 4.0,
            "depth_usd_10k": 10_000.0,
            "depth_usd_50k": 50_000.0,
            "depth_usd_100k": 100_000.0,
            "funding_rate_annualized_7d_mean": 0.05,
            "points_per_usd_volume_estimate": 1.0,
            "pair_weight_multiplier": 1.0,
            "maker_counts_for_points": True,
            "taker_counts_for_points": False,
            "maker_boost_multiplier": 1.0,
        },
        "short_leg": {
            "venue_slug": "venue_beta",
            "maker_bps": 5.0,
            "taker_bps": 0.5,
            "spread_bps": 1.0,
            "impact_bps_10k": 0.5,
            "impact_bps_50k": 1.0,
            "impact_bps_100k": 2.0,
            "depth_usd_10k": 10_000.0,
            "depth_usd_50k": 50_000.0,
            "depth_usd_100k": 100_000.0,
            "funding_rate_annualized_7d_mean": 0.02,
            "points_per_usd_volume_estimate": 2.0,
            "pair_weight_multiplier": 1.0,
            "maker_counts_for_points": False,
            "taker_counts_for_points": True,
            "maker_boost_multiplier": 1.0,
        },
        "params": {"notional_usd": 10_000.0, "hold_hours": 24.0},
    },
    {
        "name": "impact_interpolation_midpoint",
        "long_leg": {
            "venue_slug": "leg",
            "maker_bps": 1.0,
            "taker_bps": 3.0,
            "spread_bps": 2.0,
            "impact_bps_10k": 1.0,
            "impact_bps_50k": 5.0,
            "impact_bps_100k": 9.0,
            "depth_usd_10k": 10_000.0,
            "depth_usd_50k": 50_000.0,
            "depth_usd_100k": 100_000.0,
            "funding_rate_annualized_7d_mean": 0.0,
            "points_per_usd_volume_estimate": 1.0,
            "pair_weight_multiplier": 1.0,
            "maker_counts_for_points": True,
            "taker_counts_for_points": True,
            "maker_boost_multiplier": 1.0,
        },
        "short_leg": {
            "venue_slug": "other",
            "maker_bps": 1.0,
            "taker_bps": 3.0,
            "spread_bps": 2.0,
            "impact_bps_10k": 1.0,
            "impact_bps_50k": 2.0,
            "impact_bps_100k": 4.0,
            "depth_usd_10k": 10_000.0,
            "depth_usd_50k": 50_000.0,
            "depth_usd_100k": 100_000.0,
            "funding_rate_annualized_7d_mean": 0.0,
            "points_per_usd_volume_estimate": 1.0,
            "pair_weight_multiplier": 1.0,
            "maker_counts_for_points": True,
            "taker_counts_for_points": True,
            "maker_boost_multiplier": 1.0,
        },
        "params": {"notional_usd": 30_000.0, "hold_hours": 24.0},
    },
    {
        "name": "same_venue_damped_impact",
        "long_leg": {
            "venue_slug": "venue_alpha",
            "maker_bps": -2.0,
            "taker_bps": 5.0,
            "spread_bps": 16.1,
            "impact_bps_10k": 5.0,
            "impact_bps_50k": 12.0,
            "impact_bps_100k": 28.0,
            "depth_usd_10k": 9_000.0,
            "depth_usd_50k": 22_000.0,
            "depth_usd_100k": 28_000.0,
            "funding_rate_annualized_7d_mean": -0.05475,
            "points_per_usd_volume_estimate": 1.0,
            "pair_weight_multiplier": 2.0,
            "maker_counts_for_points": True,
            "taker_counts_for_points": False,
            "maker_boost_multiplier": 1.0,
        },
        "short_leg": {
            "venue_slug": "venue_alpha",
            "maker_bps": -2.0,
            "taker_bps": 5.0,
            "spread_bps": 16.1,
            "impact_bps_10k": 5.0,
            "impact_bps_50k": 12.0,
            "impact_bps_100k": 28.0,
            "depth_usd_10k": 9_000.0,
            "depth_usd_50k": 22_000.0,
            "depth_usd_100k": 28_000.0,
            "funding_rate_annualized_7d_mean": -0.05475,
            "points_per_usd_volume_estimate": 1.0,
            "pair_weight_multiplier": 2.0,
            "maker_counts_for_points": True,
            "taker_counts_for_points": False,
            "maker_boost_multiplier": 1.0,
        },
        "params": {"notional_usd": 10_000.0, "hold_hours": 24.0},
    },
    {
        "name": "fill_risk_thin_maker_book",
        "long_leg": {
            "venue_slug": "thin",
            "maker_bps": -5.0,
            "taker_bps": 3.0,
            "spread_bps": 2.0,
            "impact_bps_10k": 1.0,
            "impact_bps_50k": 2.0,
            "impact_bps_100k": 4.0,
            "depth_usd_10k": 1_000.0,
            "depth_usd_50k": 1_000.0,
            "depth_usd_100k": 1_000.0,
            "funding_rate_annualized_7d_mean": 0.0,
            "points_per_usd_volume_estimate": 1.0,
            "pair_weight_multiplier": 1.0,
            "maker_counts_for_points": True,
            "taker_counts_for_points": True,
            "maker_boost_multiplier": 1.0,
        },
        "short_leg": {
            "venue_slug": "other",
            "maker_bps": 1.0,
            "taker_bps": 3.0,
            "spread_bps": 2.0,
            "impact_bps_10k": 1.0,
            "impact_bps_50k": 2.0,
            "impact_bps_100k": 4.0,
            "depth_usd_10k": 10_000.0,
            "depth_usd_50k": 50_000.0,
            "depth_usd_100k": 100_000.0,
            "funding_rate_annualized_7d_mean": 0.0,
            "points_per_usd_volume_estimate": 1.0,
            "pair_weight_multiplier": 1.0,
            "maker_counts_for_points": True,
            "taker_counts_for_points": True,
            "maker_boost_multiplier": 1.0,
        },
        "params": {"notional_usd": 10_000.0, "hold_hours": 24.0},
    },
]


def main() -> None:
    output = []
    for scenario in SCENARIOS:
        long_leg = LegInputs(**scenario["long_leg"])
        short_leg = LegInputs(**scenario["short_leg"])
        params = ScoringParams(**scenario["params"])
        result = score_route(long_leg, short_leg, params)
        assert result.is_complete, f"{scenario['name']}: expected a complete route"

        output.append(
            {
                "name": scenario["name"],
                "long_leg": scenario["long_leg"],
                "short_leg": scenario["short_leg"],
                "params": scenario["params"],
                "expected": {
                    "cost_per_point_usd": result.cost_per_point_usd,
                    "points_per_1m_volume": result.points_per_1m_volume,
                    "weekly_cost_usd": result.weekly_cost_usd,
                    "funding_cost_usd": result.cost_breakdown["funding_cost_usd"],
                    "total_points": result.cost_breakdown["total_points"],
                    "long_order_type": result.recommended_execution["long"]["order_type"],
                    "short_order_type": result.recommended_execution["short"]["order_type"],
                    "risks": result.risks,
                },
            }
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(output)} scenarios to {OUT_PATH}")


if __name__ == "__main__":
    main()
