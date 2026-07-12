# Deployment

Everything runs on [Render](https://render.com), described by
[`render.yaml`](../render.yaml) (a Render "Blueprint"): one managed Postgres,
one Web Service (`web/`), and two Cron Jobs (`worker/`, both running
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
| `perpfarm-db` | Managed Postgres | shared by all three |

All three app services read `DATABASE_URL` from the same `perpfarm-db`
database via Render's `fromDatabase` env var wiring (see `render.yaml`) --
nothing to set manually there.

## First deploy / schema changes

Render's Blueprint model has no shared "release phase" step, and running
`alembic upgrade head` from two services' build commands at once against the
same database is a race. Migrations are **not** run automatically. After the
first deploy, and after any deploy that changes `worker/perpfarm/schema.py`
+ adds a migration, run once from a Render shell on either Python cron
service:

```bash
python -m alembic -c worker/alembic.ini upgrade head
```

Then, once (first deploy only, or whenever a new venue is added to
`perpfarm/adapters/registry.py`):

```bash
perpfarm bootstrap-venues
perpfarm ingest-manual
```

`sync-markets <slug>` and any future market-data ingestion job are
per-venue/manual until a real adapter is wired up (see below) -- not
scheduled here.

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

**All 8 real-venue adapters still raise `NotImplementedError` for
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

## Environment variables

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | `web`, both cron jobs | Postgres connection string; wired automatically via `fromDatabase` in `render.yaml` |
| `PYTHON_VERSION` | both cron jobs | pins the Python runtime (`worker/pyproject.toml` requires >=3.11) |

No API keys are required yet -- no real venue adapter is wired up, so there
is nothing to authenticate against.
