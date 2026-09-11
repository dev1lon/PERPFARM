from pathlib import Path

import pytest

from perpfarm.adapters.registry import REGISTRY, build_adapter, get_registration

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "data" / "fixtures"


def test_registry_has_twenty_one_unique_venues():
    # Lighter RH (2026-09-11) is the twentieth, Hyperliquid core the twenty-first.
    assert len(REGISTRY) == 21
    assert len({r.slug for r in REGISTRY}) == 21


@pytest.mark.parametrize("slug", ["hyperliquid", "ondo"])
def test_truenorth_execution_venues_are_registered_and_live(slug):
    """Both exchanges used by TrueNorth need a collector before a route is public."""

    assert get_registration(slug).api_status == "live"


def test_real_adapter_stub_raises_not_implemented():
    adapter = build_adapter("extended", FIXTURES_DIR)
    with pytest.raises(NotImplementedError):
        adapter.get_markets()


def test_fixture_adapter_builds_and_works():
    adapter = build_adapter("venue_alpha", FIXTURES_DIR)
    assert adapter.get_markets()


def test_unknown_slug_raises_keyerror():
    with pytest.raises(KeyError):
        get_registration("nonexistent")
