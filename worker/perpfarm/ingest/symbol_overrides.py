"""Loads data/manual/symbol_overrides.yaml.

Not written to any table -- consumed directly by `ingest.markets.sync_markets`
when deriving `markets.symbol_canonical` for tickers an adapter can't
normalize on its own (e.g. a venue that lists 'kPEPE-PERP' should map to the
canonical symbol 'PEPE' so it matches other venues' 'PEPE-PERP').
"""

from pathlib import Path

import yaml

from perpfarm.ingest.schemas import SymbolOverrideRow


def load_symbol_overrides(path: Path) -> dict[tuple[str, str], str]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    rows = [SymbolOverrideRow(**r) for r in data.get("overrides", [])]
    return {(r.venue, r.symbol): r.symbol_canonical for r in rows}
