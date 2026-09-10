"""Two tickers may share a canonical symbol only if they are the same contract.

The canonical symbol is what the cross-venue table joins on and what the
spread-risk job compares marks across, so merging two differently scaled
contracts under one name would invent a permanent divergence between the
venues -- and quietly price a hedge that hedges nothing.

The S&P 500 is listed at two scales, and the ticker does not say which:

* the FULL index, near 7,600 -- Polymarket's SP500, trade.xyz's SP500, and
  QFEX's US500-USD (daily means 2026-09-09 / 09-10: QFEX 7,648.64 / 7,629.22
  against Polymarket 7,650.08 / 7,630.08);
* the SPDR S&P 500 ETF, near 760 -- the SPY perps, and Variational's US500,
  which its own feed names "State Street SPDR S&P 500 ETF Trust" (764.07 /
  762.10; 758.31 against SPY's 758.13-758.30 in one hour).

So QFEX's US500 joins SP500, Variational's US500 joins SPY, and the two groups
never meet.
"""

from pathlib import Path

from perpfarm.ingest.symbol_overrides import load_symbol_overrides

OVERRIDES_PATH = Path(__file__).resolve().parents[2] / "data" / "manual" / "symbol_overrides.yaml"

FULL_INDEX = "SP500"
ETF_SCALE = {"SPY", "US500"}
#: Native listings at the full index -- never an ETF-scale ticker.
FULL_INDEX_LISTINGS = {("qfex", "US500-USD"), ("polymarket", "SP500-USD"), ("tradexyz", "xyz:SP500")}
#: Native listings at ETF scale -- never the full index.
ETF_SCALE_LISTINGS = {("variational", "US500")}


def test_s_and_p_contracts_of_different_scale_are_never_merged() -> None:
    overrides = load_symbol_overrides(OVERRIDES_PATH)
    for (venue, symbol), canonical in overrides.items():
        canon = canonical.upper()
        if (venue, symbol) in FULL_INDEX_LISTINGS:
            assert canon not in ETF_SCALE, f"{venue}:{symbol} is the full index and must not join {canon}"
        if (venue, symbol) in ETF_SCALE_LISTINGS:
            assert canon != FULL_INDEX, f"{venue}:{symbol} trades at ETF scale and must not join {FULL_INDEX}"


def test_qfex_us500_joins_the_full_index() -> None:
    assert load_symbol_overrides(OVERRIDES_PATH)[("qfex", "US500-USD")] == FULL_INDEX


def test_variational_us500_is_the_spy_etf() -> None:
    assert load_symbol_overrides(OVERRIDES_PATH)[("variational", "US500")] == "SPY"
