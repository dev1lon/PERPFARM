"""Which pair a swap stands in for.

A swap is not a separate market and not a special case: it is another way to
hold the same exposure. Variational's XAUS is gold, and hedging it against
another venue's XAU perp is a route like any other -- priced by the same
formula and ranked on the same number.

It lives in its own module because two jobs need it (route recommendations and
spread-risk ratings) and the website has the same map, which
``tests/test_website_parity.py`` compares against this one.

Keep in lockstep with SWAP_UNDERLYING in web/lib/tradfi.ts.
"""

from __future__ import annotations

#: Swap ticker -> the pair it stands in for.
SWAP_UNDERLYING: dict[str, str] = {
    "XAUS": "XAU",
    "XAGS": "XAG",
    "US100S": "US100",
    "US500S": "SP500",
    "USOILP": "CL",
    "UKOILP": "BZ",
}

#: The reverse: a pair -> every swap listed on it.
SWAPS_BY_UNDERLYING: dict[str, tuple[str, ...]] = {}
for _swap, _underlying in SWAP_UNDERLYING.items():
    SWAPS_BY_UNDERLYING[_underlying] = (*SWAPS_BY_UNDERLYING.get(_underlying, ()), _swap)


def hedge_symbols(symbol: str) -> tuple[str, ...]:
    """Every symbol on ANOTHER venue that hedges `symbol`, itself included.

    Mirrors web/lib/cross-cost.ts: the same ticker; the underlying pair when
    this market is itself a swap; and any swap listed on this pair. Each is its
    own route, so the perp and the swap route on one pair are compared rather
    than one of them being hidden.
    """

    hedges = [symbol]
    underlying = SWAP_UNDERLYING.get(symbol)
    if underlying is not None:
        hedges.append(underlying)
    hedges.extend(SWAPS_BY_UNDERLYING.get(symbol, ()))
    return tuple(dict.fromkeys(hedges))
