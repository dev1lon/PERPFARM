from pathlib import Path

import pytest

from perpfarm.adapters.registry import REGISTRY, build_adapter, get_registration

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "data" / "fixtures"


def test_registry_has_ten_unique_venues():
    assert len(REGISTRY) == 10
    assert len({r.slug for r in REGISTRY}) == 10


def test_real_adapter_stub_raises_not_implemented():
    adapter = build_adapter("lighter", FIXTURES_DIR)
    with pytest.raises(NotImplementedError):
        adapter.get_markets()


def test_fixture_adapter_builds_and_works():
    adapter = build_adapter("venue_alpha", FIXTURES_DIR)
    assert adapter.get_markets()


def test_unknown_slug_raises_keyerror():
    with pytest.raises(KeyError):
        get_registration("nonexistent")
