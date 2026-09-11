"""The numbers the worker and the website must agree on, checked automatically.

`hedge_recommendations.py` prices a route in Python; the calculator prices the
same route in TypeScript. Three small tables have to hold identical values --
the published fee fallbacks, the open-interest display factor, and each
protocol's minimum open interest. Until now they were kept in step by a comment
saying "keep these in lockstep with web/lib/...", which is not a mechanism: the
comment cannot fail, so a one-sided edit ships silently and the two sides start
quoting different costs for the same market.

This test reads the TypeScript source and compares it with the Python
constants. It parses only the small literal subset those files use, and any
expression it does not recognise fails the test loudly rather than being
skipped -- an unreadable table must never read as a matching one.
"""

import re
from pathlib import Path

import pytest

from perpfarm.jobs import hedge_recommendations as job

WEB_LIB = Path(__file__).resolve().parents[2] / "web" / "lib"


def _source(filename: str) -> str:
    """File contents with `//` comments removed, so prose never parses as data."""
    return re.sub(r"//[^\n]*", "", (WEB_LIB / filename).read_text(encoding="utf-8"))


def _evaluate(expression: str, constants: dict[str, float]) -> float:
    """A number literal or a product of literals, e.g. `1.5 * REFERRAL_FEE_DISCOUNT`."""
    expr = expression.strip().rstrip(",")
    for name, value in constants.items():
        expr = re.sub(rf"\b{name}\b", repr(value), expr)
    # Only after the named constants are gone, so `REFERRAL_FEE_DISCOUNT` is not
    # mangled into a name that never matches. What is left is `20_000` style
    # digit grouping.
    expr = expr.replace("_", "")
    # Only arithmetic over numbers survives; anything else is a parser gap, not
    # a passing test.
    assert re.fullmatch(r"[0-9.\s*/+()-]+", expr), f"unrecognised TypeScript value: {expression!r}"
    return float(eval(expr))  # noqa: S307 -- restricted to the character set asserted above


def _object_literal(source: str, name: str) -> str:
    """The `{ ... }` body assigned to `name`, brace-matched rather than regexed."""
    start = source.index(name)
    opening = source.index("{", start)
    depth = 0
    for index in range(opening, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[opening + 1 : index]
    raise AssertionError(f"{name}: unbalanced braces in the TypeScript source")


def _website_published_fees() -> dict[str, tuple[float, float]]:
    source = _source("venue-fees.ts")
    discount = re.search(r"REFERRAL_FEE_DISCOUNT\s*=\s*([\d.]+)", source)
    assert discount is not None, "venue-fees.ts no longer defines REFERRAL_FEE_DISCOUNT"
    constants = {"REFERRAL_FEE_DISCOUNT": float(discount.group(1))}
    entries = re.findall(
        r"(\w+):\s*\{\s*makerBps:\s*([^,]+),\s*takerBps:\s*([^}]+)\}",
        _object_literal(source, "PUBLISHED_FEES"),
    )
    return {
        slug: (_evaluate(maker, constants), _evaluate(taker, constants))
        for slug, maker, taker in entries
    }


def _website_asset_class_fees() -> dict[str, dict[str, tuple[float, float]]]:
    """The per-class schedules the site prices with, e.g. QFEX's four rates."""

    body = _object_literal(_source("venue-fees.ts"), "ASSET_CLASS_FEES")
    schedules: dict[str, dict[str, tuple[float, float]]] = {}
    for slug, classes in re.findall(r"(\w+):\s*\{((?:[^{}]|\{[^{}]*\})*)\}", body):
        entries = re.findall(
            r"(\w+):\s*\{\s*makerBps:\s*([^,]+),\s*takerBps:\s*([^}]+)\}", classes
        )
        if not entries:
            continue
        schedules[slug] = {
            asset_class: (_evaluate(maker, {}), _evaluate(taker, {}))
            for asset_class, maker, taker in entries
        }
    return schedules


def _website_oi_display_factors() -> dict[str, float]:
    body = _object_literal(_source("route-model.ts"), "OI_DISPLAY_FACTOR")
    return {slug: _evaluate(value, {}) for slug, value in re.findall(r"(\w+):\s*([\d_.]+)", body)}


def _website_dead_market_thresholds() -> tuple[float, float]:
    source = _source("route-model.ts")
    volume = re.search(r"DEAD_MARKET_VOLUME_USD\s*=\s*([\d_.]+)", source)
    oi = re.search(r"DEAD_MARKET_OI_USD\s*=\s*([\d_.]+)", source)
    assert volume is not None and oi is not None, "route-model.ts no longer defines the dead-market thresholds"
    return _evaluate(volume.group(1), {}), _evaluate(oi.group(1), {})


def _website_swap_underlying() -> dict[str, str]:
    source = _source("tradfi.ts")
    start = source.index("SWAP_UNDERLYING = new Map")
    body = source[start : source.index("]);", start)]
    entries = re.findall(r'\[\s*"(\w+)"\s*,\s*"(\w+)"\s*\]', body)
    assert entries, "tradfi.ts SWAP_UNDERLYING could not be read"
    return dict(entries)


def test_swap_underlyings_match_the_website():
    """The site keys a swap route's rating by the swap; the job must rate the same legs."""

    from perpfarm.jobs import spread_risk

    assert spread_risk.SWAP_UNDERLYING == _website_swap_underlying()


def test_published_fee_fallbacks_match_the_website():
    """A venue priced at one fee here and another there quotes two costs."""
    website = _website_published_fees()

    assert set(job.PUBLISHED_FEES) == set(website)
    for slug, (maker, taker) in job.PUBLISHED_FEES.items():
        assert maker == pytest.approx(website[slug][0]), f"{slug}: maker fee differs from the website"
        assert taker == pytest.approx(website[slug][1]), f"{slug}: taker fee differs from the website"


def test_asset_class_fees_match_the_website():
    """QFEX charges by instrument class, so both sides must charge the same one.

    Pricing an FX pair at the single-stock rate is a fivefold error, and it is
    exactly the kind that hides: the table still renders, just with the wrong
    number under most of its rows.
    """
    website = _website_asset_class_fees()

    assert set(job.ASSET_CLASS_FEES) == set(website)
    for slug, by_class in job.ASSET_CLASS_FEES.items():
        assert set(by_class) == set(website[slug]), f"{slug}: different asset classes are priced"
        for asset_class, (maker, taker) in by_class.items():
            expected = website[slug][asset_class]
            assert maker == pytest.approx(expected[0]), f"{slug}/{asset_class}: maker fee differs"
            assert taker == pytest.approx(expected[1]), f"{slug}/{asset_class}: taker fee differs"


def test_asset_class_fee_lookup_falls_back_to_the_venue_rate():
    """An unseen class is priced at the venue's headline rate, never as free."""

    assert job.published_fees("qfex", "FX") == (1.0, 2.0)
    assert job.published_fees("qfex", "fx") == (1.0, 2.0)
    assert job.published_fees("qfex", "CRYPTO") == job.PUBLISHED_FEES["qfex"]
    assert job.published_fees("qfex", None) == job.PUBLISHED_FEES["qfex"]
    # A venue with one rate ignores the class rather than losing its schedule.
    assert job.published_fees("risex", "EQUITY") == job.PUBLISHED_FEES["risex"]
    assert job.published_fees("nowhere", "EQUITY") is None


def test_open_interest_display_factor_matches_the_website():
    """Doubling OI on one side only makes the same market read $51k and $102k."""
    website = _website_oi_display_factors()

    assert set(job.OI_DISPLAY_FACTOR) == set(website)
    for slug, factor in job.OI_DISPLAY_FACTOR.items():
        assert factor == pytest.approx(website[slug]), f"{slug}: OI display factor differs"


def test_quote_curve_power_fit_threshold_matches_the_website():
    """Where a straight line stops following the book has to be one number.

    The worker interpolated every gap linearly while the site fitted wide ones
    as a power law, so the two priced Variational's 1k/100k/1m ladder
    differently -- and the worker's number is what picks the hedge partner the
    page then shows.
    """
    source = _source("quote-curve.ts")
    website = re.search(r"POWER_FIT_MIN_SPAN_RATIO\s*=\s*([\d_.]+)", source)
    assert website is not None, "quote-curve.ts no longer defines POWER_FIT_MIN_SPAN_RATIO"

    assert job.POWER_FIT_MIN_SPAN_RATIO == pytest.approx(_evaluate(website.group(1), {}))


def test_dead_market_thresholds_match_the_website():
    """A rule that differs decides that a market exists on one side only."""
    volume, oi = _website_dead_market_thresholds()

    assert job.DEAD_MARKET_VOLUME_USD == pytest.approx(volume)
    assert job.DEAD_MARKET_OI_USD == pytest.approx(oi)


def test_only_dead_markets_are_skipped():
    """Variational's TWT -- $350 of volume, $55k of open interest -- is a real market."""

    def market(volume: float | None, oi: float | None) -> job.Market:
        return job.Market(
            venue_id=1, slug="txflow", symbol="TWT", spread_bps=1.0, impact_10k=None, impact_50k=None,
            impact_100k=None, quote_curve=None, volume_24h_usd=volume, open_interest_usd=oi,
            maker_bps=None, taker_bps=None,
        )

    assert job._is_eligible(market(350.0, 55_000.0))
    assert job._is_eligible(market(5_000.0, 0.0))
    assert not job._is_eligible(market(0.0, 0.0))
    assert not job._is_eligible(market(None, 55_000.0))
