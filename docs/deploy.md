# Deployment

Everything runs on [Render](https://render.com), described by
[`render.yaml`](../render.yaml) (a Render "Blueprint"): one managed Postgres,
one Web Service (`web/`), and three Cron Jobs (`worker/`, all running
`perpfarm job <name>`).

**TODO(verify):** `render.yaml`'s field names and behavior are written
against Render's Blueprint schema as of this project's last edit -- Render's
schema evolves, so diff it against the current
[Blueprint reference](https://render.com/docs/blueprint-spec) before trusting
it blindly. Deploy via the Render dashboard's "New > Blueprint", point it at
this repo, and fix up anything the dashboard's own validator flags.

## Services

| Service | Type | Runs |
|---|---|---|
| `perpfarm-web` | Web Service (Node) | `web/` -- Next.js, `npm run build` / `npm start` |
| `perpfarm-nightly` | Cron Job (Python) | `perpfarm job nightly` -- recomputes `route_scores` |
| `perpfarm-fee-watch` | Cron Job (Python) | `perpfarm job fee-watch` -- fee-schedule diff watcher |
| `perpfarm-sync-snapshots` | Cron Job (Python) | `perpfarm job sync-snapshots` -- book/funding/volume snapshot sync, hourly |
| `perpfarm-db` | Managed Postgres | shared by all four |

All four app services read `DATABASE_URL` from the same `perpfarm-db`
database via Render's `fromDatabase` env var wiring (see `render.yaml`) --
nothing to set manually there.

## First deploy / schema changes

Render's Blueprint model has no shared "release phase" step, and running
`alembic upgrade head` from three services' build commands at once against
the same database is a race. Migrations are **not** run automatically. After
the first deploy, and after any deploy that changes
`worker/perpfarm/schema.py` + adds a migration, run once from a Render
**Shell** tab on any Python cron service -- the shell opens directly inside
`rootDir` (`worker/`), so the path is bare, not `worker/alembic.ini`:

```bash
python -m alembic upgrade head
```

Then, once (first deploy only, or whenever a new venue is added to
`perpfarm/adapters/registry.py`):

```bash
perpfarm bootstrap-venues
perpfarm ingest-manual
```

`perpfarm sync-markets <slug>` (per-venue, manual) still needs a run per
venue whenever its market list changes -- it's deliberately not scheduled,
since the market list changes rarely and adding it automatically would just
mean more silent-failure surface for adapters that aren't wired up yet.
Price/funding/depth data, unlike the market *list*, **is** scheduled --
that's `perpfarm-sync-snapshots`, below.

## The fee-page diff watcher (`perpfarm job fee-watch`)

`worker/perpfarm/jobs/fee_watch.py`, wired to the `perpfarm-fee-watch` cron
job. Per run, for every venue in `perpfarm/adapters/registry.py`:

1. Calls that venue's `adapter.get_fees()` (the interface method added in
   `perpfarm/adapters/base.py`).
2. Hashes the result (`fee_hash()`) and compares it to the latest
   `fee_schedules` row for that venue.
3. If unchanged: no-op. If changed (or this is the venue's first-ever
   observation): inserts a new `fee_schedules` row. If it was an actual
   change (not the first observation): also inserts an `alerts` row
   (`kind='fee_change'`) with the before/after fee numbers.

**This only detects and records changes -- it does not notify anyone.**
Telegram (or any other) alert delivery was explicitly descoped; `alerts.
notified_at` stays `NULL` forever until something reads that table and
delivers it. That's a deliberate, minimal stopping point: the schema
(`alerts.notified_at` nullable, `alerts.kind`/`payload_json` generic) was
already designed for a notifier to be bolted on later without changes here.

**All 11 real-venue adapters still raise `NotImplementedError` for
`get_fees()`** (same as their other methods) -- per this project's
no-fabrication rule, nobody has verified their actual fee-schedule
endpoint/page yet. The watcher treats `NotImplementedError` as "not wired up
yet" and skips that venue silently (counted in the job's `skipped` total,
not its `errors`); it does *not* raise or fail the run. Only the two fixture
venues (`venue_alpha`, `venue_beta`, via `data/fixtures/<slug>/fees.json`)
currently produce real fee-watch activity. Wiring a real venue's `get_fees()`
is the same kind of task as wiring its `get_markets()`/`get_funding()`/etc.
-- confirm the actual fee-schedule source (API endpoint or static page) and
its auth/rate-limit requirements before implementing, and keep the
`TODO(verify)` marker until you have.

## Market-data snapshot sync (`perpfarm job sync-snapshots`)

`worker/perpfarm/jobs/sync_snapshots.py`, wired to the
`perpfarm-sync-snapshots` cron job (hourly). **This is load-bearing, not
optional** -- discovered missing during the first real deploy, when every
route stayed `is_complete: false` on Postgres even after `job nightly` ran.
Root cause: `nightly.py` computes `spread_bps`/funding from the
`book_snapshots`/`funding_snapshots` tables, and until this job existed,
*nothing* wrote to them -- `sync-markets` only maintains the market **list**
(which symbols exist), not price/funding/depth data. `spread_bps` is a hard
completeness requirement (see `docs/scoring.md`), so without this job every
route is permanently incomplete on the DB-backed path, regardless of how
often `nightly`/`fee-watch` run.

Per run, for every *active market* (not every venue -- a venue can list
several symbols): calls `get_orderbook_top()`, `get_funding()`, and
`get_volume()` on that market's venue adapter, and inserts one row into each
of `book_snapshots`/`funding_snapshots`/`volume_snapshots`. Same
`NotImplementedError`-is-not-an-error convention as `fee-watch`. Each
market's DB write is its own transaction (not one transaction for the whole
run) so one bad market can't roll back snapshots already written for others
in the same run.

Run hourly, not daily like `nightly` -- `nightly.py` medians/means over a
rolling 24h (book) / 7-day (funding) window, so it needs more than one
sample a day to be meaningful.

## Environment variables

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | `web`, all cron jobs | Postgres connection string; wired automatically via `fromDatabase` in `render.yaml`. Render hands out a bare `postgres://`/`postgresql://` URL -- `perpfarm/config.py` rewrites it to `postgresql+psycopg://` so SQLAlchemy picks the psycopg3 dialect (psycopg2 isn't installed) |
| `PYTHON_VERSION` | all cron jobs | pins the Python runtime (`worker/pyproject.toml` requires >=3.11) |

No API keys are required yet -- no real venue adapter is wired up, so there
is nothing to authenticate against.
