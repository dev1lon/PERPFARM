"""Data types for the scoring engine. See docs/scoring.md for the spec these
implement -- this module has no DB/IO dependency by design.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal

OrderType = Literal["maker", "taker"]
Confidence = Literal["confirmed", "estimated", "rumor"]

_CONFIDENCE_RANK = {"confirmed": 0, "estimated": 1, "rumor": 2}

# Two accounts on the same venue can largely fill against each other rather
# than walking the public book -- this factor damps the impact_bps_* curve
# for same-venue (self-match) routes before it reaches score_route. It's a
# documented approximation, not a measurement; score_route itself has no
# notion of same-venue routes, see docs/scoring.md.
SELF_MATCH_IMPACT_FACTOR = 0.2

# Maker fill_risk fires when the $50k-bucket book depth is thin relative to
# the notional being sized -- i.e. resting size this large may not fill.
FILL_RISK_DEPTH_MULTIPLIER = 4.0


def weakest_confidence(values: list[Confidence | None]) -> Confidence | None:
    present = [v for v in values if v is not None]
    if not present:
        return None
    return max(present, key=lambda v: _CONFIDENCE_RANK[v])


@dataclass(frozen=True)
class LegInputs:
    venue_slug: str
    maker_bps: float | None
    taker_bps: float | None
    spread_bps: float | None
    impact_bps_10k: float | None = None
    impact_bps_50k: float | None = None
    impact_bps_100k: float | None = None
    depth_usd_10k: float | None = None
    depth_usd_50k: float | None = None
    depth_usd_100k: float | None = None
    funding_rate_annualized_7d_mean: float | None = None
    points_per_usd_volume_estimate: float | None = None
    pair_weight_multiplier: float = 1.0
    maker_counts_for_points: bool | None = None
    taker_counts_for_points: bool | None = None
    maker_boost_multiplier: float = 1.0
    manual_confidence: Confidence | None = None
    manual_last_verified: date | None = None
    # dilution inputs -- display only, never gate completeness
    points_distributed_week: float | None = None
    total_points_outstanding: float | None = None


@dataclass(frozen=True)
class ScoringParams:
    notional_usd: float = 10_000.0
    hold_hours: float = 24.0
    round_trips_per_week: float | None = None  # None = auto: floor(168 / hold_hours)

    def effective_round_trips_per_week(self) -> float:
        if self.round_trips_per_week is not None:
            return self.round_trips_per_week
        return max(1.0, 168.0 // self.hold_hours)


@dataclass(frozen=True)
class RouteScoreResult:
    is_complete: bool
    cost_per_point_usd: float | None
    points_per_1m_volume: float | None
    weekly_cost_usd: float | None
    dilution_score: float | None
    cost_breakdown: dict
    recommended_execution: dict
    data_freshness: dict
    # route-level, OR'd across both legs' chosen order type -- wash_risk is
    # NOT here: it's a pure venue-slug comparison, computed by the caller
    # (nightly job / recipe API), not something score_route can know about.
    risks: dict
