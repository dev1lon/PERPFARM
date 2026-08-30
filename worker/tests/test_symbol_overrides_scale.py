"""Two tickers may share a canonical symbol only if they are the same contract.

The canonical symbol is what the cross-venue table joins on and what the
spread-risk job compares marks across, so merging two differently scaled
contracts under one name would invent a permanent divergence between the
venues -- and quietly price a hedge that hedges nothing.

SP500 (Polymarket, ~$7,700) and US500 (QFEX, ~$770) both track the S&P 500 at
a tenth of each other's scale, which is exactly the mistake this guards.
"""

from pathlib import Path

from perpfarm.ingest.symbol_overrides import load_symbol_overrides

OVERRIDES_PATH = Path(__file__).resolve().parents[2] / "data" / "manual" / "symbol_overrides.yaml"

#: Tickers that name the same underlying but NOT the same contract size.
DIFFERENT_SCALE_TICKERS = {"SP500", "US500"}


def test_s_and_p_tickers_are_never_merged() -> None:
    overrides = load_symbol_overrides(OVERRIDES_PATH)
    for (venue, symbol), canonical in overrides.items():
        base = symbol.split("-")[0].upper()
        if base in DIFFERENT_SCALE_TICKERS or canonical.upper() in DIFFERENT_SCALE_TICKERS:
            assert base == canonical.upper(), (
                f"{venue}:{symbol} -> {canonical} merges S&P 500 contracts of different scale; "
                "SP500 trades near $7,700 and US500 near $770"
            )
