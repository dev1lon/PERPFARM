# PerpFarm

PerpFarm is a guide and route calculator for farming perp-DEX points. A user
chooses the protocol whose points they want, chooses the protocol for the
opposite hedge leg, enters volume per account, and receives the cheapest
eligible delta-neutral route with an execution-cost breakdown.

Current complete protocol coverage: **Variational**. Other protocol pages are
catalog entries until their reward mechanics and execution inputs are verified.

## Architecture

- `web/` — Next.js 16 app deployed on Vercel (`main` = production,
  `staging` = preview).
- `worker/` — Python 3.11+ market-data collector deployed as one hourly Render
  cron.
- Postgres/Supabase — shared catalog and saved book, funding, volume, and OI
  observations.
- `data/manual/` — hand-verified protocol metadata and reward rules.

The Variational calculator reads saved 24-hour spread/impact observations and
the current public Variational quote curve. It scans every eligible market,
excludes gross OI below $50K, and returns the cheapest ten routes for the volume
entered by the user.

## Worker setup

```bash
cd worker
python -m venv .venv
.venv/Scripts/activate        # Windows
pip install -e ".[dev]"
```

Database-backed commands require `DATABASE_URL`:

```bash
python -m alembic upgrade head
perpfarm refresh-catalog
perpfarm job fee-watch
perpfarm job sync-snapshots
```

`sync-snapshots` refreshes the catalog and saves market observations. In
production it runs hourly. The public fee-page check is folded into that job
and runs once a week, Monday at 06:00 UTC.

## Web setup

```bash
cd web
npm install
npm run dev
```

Environment variables:

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | production | Postgres/Supabase connection |
| `DUNE_API_KEY` | optional | Dune Users history |
| `DUNE_VARIATIONAL_UNIQUE_TRADERS_QUERY_ID` | optional | overrides the default Variational active-addresses query (`5754146`) |
| `DEFILLAMA_API_KEY` | optional | DefiLlama Pro endpoint, if configured |

The public Variational and DefiLlama OI endpoints need no authentication.
For Dune, the key must belong to the query owner or the query must be public;
otherwise Dune returns `Query not found or private` and the page falls back to
the public Omni figure.
Historical charts show only API or saved observations; screenshots are not
turned into generated daily data.

## Verification

```bash
cd web
npm run lint
npx tsc --noEmit
npm run build

cd ../worker
pytest
ruff check .
```

On this repository's mapped `Z:` drive, Next's production build can fail on a
Windows `readlink` operation even when the source is valid. Copying `web/` to
an NTFS local path verifies the same build; Vercel's Linux build is unaffected.

## Deployment

See [production deployment](docs/deploy.md) and
[staging refresh](docs/staging.md).
