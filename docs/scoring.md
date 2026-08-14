# Cost model

How a route's execution cost is derived, and what each stored measurement
means. One model serves every protocol: they differ in their data — fees,
depth, open-interest scale — never in the formula.

This file previously specified a cost-per-point scoring engine
(`worker/perpfarm/scoring/`, `web/lib/scoring.ts`) with points-per-volume
emission inputs. That engine, and the tables behind it
(`points_programs`, `pair_weights`, `points_distributions`), were removed in
migration 0003. Point VALUE is the user's own manual/OTC knowledge and is never
computed here.

## The route

Two accounts, one delta-neutral position, four fills: two resting LIMIT orders
and two MARKET orders. A resting limit is filled at its own price — it pays the
maker fee and crosses nothing. A market order pays the taker fee and crosses
the book.

```
legBps = spread_bps / 2 + impact_bps(fill size)      one crossing leg
cycle  = 2 x fill x (legBps + feeBps) / 10 000       the whole round trip
```

`fill = accountVolumeUsd / 2`, because the requested volume is entry plus exit
turnover on one account.

The headline figure is the **24-hour median** of that, with p25–p75 as the
range. Percentiles are taken over whole-route observations, not per leg, and
the breakdown shown under a route comes from the same observation as its
headline — otherwise the parts do not add up to the total.

Implementations: [`web/lib/cost-history.ts`](../web/lib/cost-history.ts)
(same-protocol), [`web/lib/cross-cost.ts`](../web/lib/cross-cost.ts)
(cross-protocol), [`worker/perpfarm/jobs/hedge_recommendations.py`](../worker/perpfarm/jobs/hedge_recommendations.py)
(the hourly "cheapest partner" card).

## Stored measurements

| column | meaning |
|---|---|
| `spread_bps` | touch spread, relative to mid |
| `impact_bps_10k/50k/100k` | price impact **beyond the touch** at that USD notional, measured by walking the book (VWAP) or reading the venue's quote at that size; legacy fixed buckets, kept for historical rows |
| `depth_usd_10k/50k/100k` | USD notional actually reachable within that walk; may be less than the nominal bucket on a thin book |
| `quote_curve_json` | the venue's own quote points, `{reference_price, points: [{notional_usd, bid, ask}]}`; the point at notional 0 is the touch |

The quote curve is preferred wherever it exists — it carries bid AND ask per
size, so the cheaper side to cross is derivable from the stored row and no live
venue call is needed. The fixed buckets are the fallback for older rows.

### Interpolating between quote points

Displacement from the touch is interpolated, not the raw price. Between two
anchors less than 10x apart the interpolation is linear; across a wider gap it
fits `displacement = a * size^k` with the exponent taken from the anchors
themselves. Both were measured by leave-one-out over production curves: the
power fit made TxFlow's closely-spaced ladder worse and Variational's 100x gap
(1k / 100k / 1m) markedly better. See
[`web/lib/quote-curve.ts`](../web/lib/quote-curve.ts) for the numbers.

## Funding

Funding is not part of the execution cost and never ranks a route: it has its
own sign, can be a credit as easily as a charge, and drifts during the hold.
It is reported separately, for a fixed 12-hour hold so pairs stay comparable.

- Same protocol, equal long and short: funding cancels to zero.
- Cross protocol: the delta between the two venues' rates. The cheaper-to-fund
  leg is the long one, so the choice is made rather than inherited from
  whichever page the user opened.
- The 24-hour aggregate is a **trimmed mean** (drop the extreme 10% at each
  end), not a median: funding accrues every hour, so the total is a sum and the
  mean is the matching aggregate. Trimming stops one extreme reading from
  setting the number by itself.

## Per-protocol conventions

Protocols disagree about what they display, so the convention is verified per
protocol rather than guessed globally — see
[`web/lib/route-model.ts`](../web/lib/route-model.ts), which is the one
definition of all of it:

- **Open interest.** Variational stores long + short and its UI shows twice
  that; TxFlow has no confirmed adjustment, so its raw value is shown.
  Anything unverified stays at 1.
- **OI bands.** The formula is shared, the thresholds cannot be: the two
  protocols' markets differ by three orders of magnitude.
- **Fees.** A `fee_schedules` row written by the fee watcher wins; otherwise
  the documented published schedule in `web/lib/venue-fees.ts` applies. A venue
  with neither is unknown, not free, and its route is dropped rather than
  priced at zero.
- **Cost tier.** Graded on book cost (spread + impact) with fees excluded —
  fees are identical for every pair on a protocol, so grading them says nothing
  about the pair.

The worker's copies of the fee, OI-factor and OI-floor tables are checked
against the TypeScript ones by `worker/tests/test_website_parity.py`.

## Freshness

Snapshots older than three hours are not "live" — the worker runs hourly, so
that is two missed turns. Every protocol's endpoint answers this the same way
(`snapshotsAreFresh` in `web/lib/route-model.ts`) and reports the answer in
`sources[].live`, so a stalled cron shows as stale instead of being published
as current.
