"""Pydantic models for the manual data/manual/*.yaml files.

Validation happens before any DB write. A malformed row anywhere in a file
fails the whole ingest run rather than partially applying -- manual data
drives the confidence/freshness badges shown to users, so partial or silently
coerced data would be worse than a loud failure.
"""

from datetime import date

from pydantic import BaseModel, ConfigDict

Confidence = str  # validated against the literal set below, kept as str for clearer error messages
CONFIDENCE_VALUES = {"confirmed", "estimated", "rumor"}


class VenueRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str
    name: str


class VenueMetaRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    venue: str
    raised_usd: float | None = None
    investors: str | None = None
    community_supply_pct: float | None = None
    otc_point_price_usd: float | None = None
    season_name: str | None = None
    season_end_date: date | None = None
    twitter_url: str | None = None
    docs_url: str | None = None
    referral_link: str | None = None
    notes_md: str | None = None


class ExecutionRuleRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    venue: str
    maker_counts_for_points: bool
    taker_counts_for_points: bool
    maker_boost_multiplier: float = 1.0
    notes: str | None = None


class SymbolOverrideRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    venue: str
    symbol: str
    symbol_canonical: str
