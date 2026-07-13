# perpfarm

Cost-per-point optimizer for tokenless perp DEXes. Ranks delta-neutral farming
routes (long venue A / short venue B, same pair) by expected **cost per 1
point earned** — fees, spread, and funding are cost line items to minimize,
not yield to maximize.

Monorepo, two deployable units, both on Render:

- `worker/` — Python 3.11+, background worker + cron jobs, Postgres.
- `web/` — Next.js + Tailwind, reads the same Postgres via route handlers.

## Status

Phase 1: repo scaffold, Postgres schema + Alembic migration, `VenueAdapter`
interface + `FixtureAdapter` + 8 real-venue stubs, manual-data YAML format +
ingest CLI, seed fixtures for two synthetic test venues.

Phase 2: scoring engine (`worker/perpfarm/scoring/`, pure functions, spec in
[`docs/scoring.md`](docs/scoring.md)) with unit tests for the
maker-rebate/taker-only-points, negative-funding, illiquid-spread, and
missing-manual-data scenarios; `worker/perpfarm/jobs/nightly.py` recomputes
`route_scores` from Postgres; `perpfarm print-routes` scores the fixture
venues end-to-end with no DB required.

Phase 3: API layer + frontend (`web/`, Next.js + Tailwind), running
end-to-end against the fixture venues with **no Postgres required** for dev
(`lib/data-source.ts` picks Postgres when `DATABASE_URL` is set, fixtures
otherwise). `lib/scoring.ts` is a TypeScript mirror of the Python engine,
verified to match it bit-for-bit via a shared parity fixture
(`data/parity/scoring_scenarios.json`, checked in both `pytest` and
`vitest`).

Phase 3.5: frontend rebuilt around a venue-first wizard IA (`/` search ->
`/[venueSlug]` -> pick hedge + strategy -> recipe cards), new
blue-accent/Plus-Jakarta-Sans design system with dark+light themes, same-
venue (self-match) routes, breakeven notional, and the recipes API. See
[`docs/scoring.md`](docs/scoring.md) for the scoring-side changes.

Phase 4 (this commit): fee-page diff watcher
(`perpfarm job fee-watch` -> `worker/perpfarm/jobs/fee_watch.py`) and Render
deploy config (`render.yaml`, [`docs/deploy.md`](docs/deploy.md)). Alert
*delivery* (Telegram or otherwise) is explicitly out of scope -- the watcher
only detects fee changes and records them in `alerts`; nothing reads that
table yet.

## worker/ setup

```bash
cd worker
python -m venv .venv
.venv/Scripts/activate        # or: source .venv/bin/activate
pip install -e ".[dev]"
```

Requires `DATABASE_URL` (Postgres) in the environment for anything that
touches the database:

```bash
export DATABASE_URL=postgresql+psycopg://user:pass@host:5432/perpfarm
python -m alembic -c worker/alembic.ini upgrade head   # or: cd worker && alembic upgrade head
perpfarm bootstrap-venues      # upserts `venues` from the adapter registry
perpfarm ingest-manual         # validates + upserts data/manual/*.yaml
perpfarm refresh-catalog       # bootstrap-venues + ingest-manual + sync every market list
perpfarm job fee-watch         # diffs fee schedules, writes fee_schedules/alerts rows
perpfarm job sync-snapshots    # populates book/funding/volume snapshots
perpfarm job nightly           # recomputes route_scores -- needs fee-watch AND
                               # sync-snapshots to have run at least once, or
                               # every route scores as incomplete. Auto-runs
                               # refresh-catalog first (adding a venue = deploy,
                               # no manual catalog step).
```

No DB needed to see the scoring engine work end-to-end:

```bash
perpfarm print-routes                              # default $10k notional, 24h hold
perpfarm print-routes --notional 50000 --hold-hours 4
```

Run tests (no DB required — they exercise fixtures, schema validation, the
adapter registry, and the full scoring engine only):

```bash
cd worker
pytest
ruff check .
```

## Adapters

`perpfarm/adapters/base.py` defines the `VenueAdapter` interface
(`get_markets`, `get_funding`, `get_orderbook_top`, `get_volume`,
`get_fees`). `FixtureAdapter` reads JSON from `data/fixtures/<slug>/` and is fully
functional — used for dev and tests. The 11 real-venue adapters (variational,
lighter, extended, paradex, pacifica, nado, txflow, tradexyz, hotstuff,
hibachi, risex) are stubs that raise `NotImplementedError` with
`TODO(verify)` markers; wiring real endpoints is intentionally left to be
filled in against verified docs, per the project's no-fabrication rule.

## Manual data

`data/manual/*.yaml` holds hand-verified venue facts (points program rules,
pair weights, venue metadata, execution rules, symbol-normalization
overrides), ingested via `perpfarm ingest-manual`. Every fact carries a
`confidence` tag (`confirmed` / `estimated` / `rumor`) and a `last_verified`
date — this becomes the confidence/freshness badges on the frontend.

`venue_alpha` and `venue_beta` in the seed data are **synthetic fixture
venues**, not real exchanges — they exist to exercise the maker-rebate vs.
taker-only-points contrast the scoring engine's tests rely on. Their
`data/fixtures/<slug>/fees.json` is what `FixtureAdapter.get_fees()` reads;
real venues have no manual-YAML path for fees — that data arrives via
`perpfarm job fee-watch` (see [`docs/deploy.md`](docs/deploy.md)) into
`fee_schedules`, once each real adapter's `get_fees()` is actually wired up.

## Scoring engine

Pure functions in `worker/perpfarm/scoring/`; the full spec (inputs,
formulas, output JSON shapes) lives in [`docs/scoring.md`](docs/scoring.md)
and is the single source of truth both the Python engine and the future
client-side TS recompute (Phase 3) must match. A route with any missing fee,
funding, spread/slippage, points-program, or execution-rule input is marked
`is_complete: false` with `cost_per_point_usd: null` rather than silently
scored with a guessed number.

## web/ setup

```bash
cd web
npm install
npm run dev
```

No `DATABASE_URL` needed for dev -- `lib/data-source.ts` falls back to the
same `data/fixtures/` + `data/manual/` files the worker uses, computed
through the exact TS mirror of the Python scoring engine
(`lib/scoring.ts`/`lib/fixtures-source.ts`). Set `DATABASE_URL` to switch to
the real Postgres-backed path (`lib/db.ts`), which is what production uses.

**Windows + exFAT note:** if the repo lives on an exFAT-formatted drive,
`next build` (both Turbopack and webpack) fails outright -- Next's build
tooling needs NTFS-style symlinks/junction points that exFAT doesn't support.
`next dev` is unaffected. This isn't a code issue; it only affects local
production builds on exFAT. Render's build environment (Linux, ext4) is not
affected.

**Why `npm run build` is `next build --webpack`:** Turbopack (Next 16's
default bundler) fails to resolve `@tailwindcss/postcss` from
`postcss.config.mjs` when built on Render -- `Error: Cannot find module
'@tailwindcss/postcss'`, even with a clean install and no build cache. The
package is genuinely installed and correctly listed in `package-lock.json`;
this looks like a Turbopack module-resolution issue in its PostCSS
transform, not a missing dependency. `--webpack` sidesteps it (matches the
`next dev --webpack` path already used for local verification throughout
this project). Revisit forcing webpack once a Next.js release fixes this.

## Scoring engine

Pure functions in `worker/perpfarm/scoring/`; the full spec (inputs,
formulas, output JSON shapes) lives in [`docs/scoring.md`](docs/scoring.md)
and is the single source of truth both `engine.py` and `web/lib/scoring.ts`
must match -- `cost_breakdown_json.{long,short}_inputs` carries the raw
per-leg data so the frontend can fully re-run the algorithm at a different
notional/hold time, not just rescale the displayed numbers (taker slippage
is piecewise-linear in notional, so a naive rescale would be wrong). A route
with any missing fee, funding, spread/slippage, points-program, or
execution-rule input is marked `is_complete: false` with
`cost_per_point_usd: null` rather than silently scored with a guessed number.

## Deployment

Everything runs on Render: Postgres, `web/` as a Web Service, and the worker
as two Cron Jobs (`job nightly`, `job fee-watch`) -- see
[`render.yaml`](render.yaml) and [`docs/deploy.md`](docs/deploy.md) for the
full Blueprint, env vars, and migration/bootstrap steps.
