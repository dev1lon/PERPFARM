from pathlib import Path

import yaml

from perpfarm.ingest.schemas import ExecutionRuleRow, VenueMetaRow
from perpfarm.ingest.symbol_overrides import load_symbol_overrides

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "manual"


def _load(filename: str, key: str) -> list[dict]:
    with (DATA_DIR / filename).open(encoding="utf-8") as f:
        return yaml.safe_load(f)[key]


def test_venue_meta_validate():
    rows = [VenueMetaRow(**r) for r in _load("venue_meta.yaml", "venue_meta")]
    assert {r.venue for r in rows} >= {"venue_alpha", "venue_beta", "hibachi"}


def test_execution_rules_validate():
    rows = [ExecutionRuleRow(**r) for r in _load("execution_rules.yaml", "execution_rules")]
    by_venue = {r.venue: r for r in rows}
    assert by_venue["venue_alpha"].maker_counts_for_points is True
    assert by_venue["venue_beta"].taker_counts_for_points is True


def test_symbol_overrides_load():
    overrides = load_symbol_overrides(DATA_DIR / "symbol_overrides.yaml")
    assert overrides[("venue_alpha", "kPEPE-PERP")] == "PEPE"
