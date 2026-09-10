"""Two tickers may share a canonical symbol only if they are the same contract.

The canonical symbol is what the cross-venue table joins on and what the
spread-risk job compares marks across, so merging two differently scaled
contracts under one name would invent a permanent divergence between the
venues -- and quietly price a hedge that hedges nothing.

The S&P 500 is listed at two scales, and the ticker does not say which:

* the FULL index, near 7,600 -- Polymarket's SP500, trade.xyz's SP500, and
  QFEX's US500-USD (daily means 2026-09-09 / 09-10: QFEX 7,648.64 / 7,629.22
  against Polymarket 7,650.08 / 7,630.08);
* a TENTH of it, near 760 -- Variational's US500 (764.07 / 762.10) and the SPY
  ETF perps.

So QFEX's US500 is merged into SP500, and nothing at a tenth of the index may
ever be. (This test used to forbid every SP500/US500 merge on the belief that
QFEX's US500 was the tenth-scale one; the collected marks say it is Variational's.)
"""

from pathlib import Path

from perpfarm.ingest.symbol_overrides import load_symbol_overrides

OVERRIDES_PATH = Path(__file__).resolve().parents[2] / "data" / "manual" / "symbol_overrides.yaml"

#: Canonical names of contracts at a tenth of the index.
TENTH_SCALE = {"US500", "SPY"}
FULL_SCALE = "SP500"
#: Native listings known to trade at a tenth of the index.
TENTH_SCALE_LISTINGS = {("variational", "US500")}


def test_s_and_p_contracts_of_different_scale_are_never_merged() -> None:
    overrides = load_symbol_overrides(OVERRIDES_PATH)
    for (venue, symbol), canonical in overrides.items():
        canon = canonical.upper()
        assert canon not in TENTH_SCALE, (
            f"{venue}:{symbol} -> {canonical}: nothing is mapped onto a tenth-scale S&P 500 ticker"
        )
        if canon == FULL_SCALE:
            assert (venue, symbol) not in TENTH_SCALE_LISTINGS, (
                f"{venue}:{symbol} trades at a tenth of the index and must not join {FULL_SCALE}"
            )


def test_qfex_us500_joins_the_full_index() -> None:
    assert load_symbol_overrides(OVERRIDES_PATH)[("qfex", "US500-USD")] == FULL_SCALE
