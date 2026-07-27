# Production deployment

The production topology is intentionally small:

| Component | Platform | Source |
|---|---|---|
| Web | Vercel | `main`, root `web/` |
| Database | external Postgres/Supabase | `DATABASE_URL` |
| Collector | Render cron | `render.yaml`, root `worker/` |

## First deploy or schema change

Migrations are not run from multiple services automatically. Run once against
the production database:

```bash
cd worker
python -m alembic upgrade head
perpfarm refresh-catalog
perpfarm job fee-watch
perpfarm job sync-snapshots
```

After that, the Render `perpfarm-sync-snapshots` cron runs hourly. Every run:

1. refreshes venues, manual metadata, and market lists;
2. saves book/quote-impact, funding, volume, and OI observations;
3. continues past individual unavailable stub adapters;
4. checks public fee schedules only on Monday at 06:00 UTC.

The fee watcher records changes in `fee_schedules` and `alerts`; notification
delivery is not implemented.

## Required environment variables

Vercel:

- `DATABASE_URL`
- optional `DUNE_API_KEY`
- optional `DUNE_VARIATIONAL_UNIQUE_TRADERS_QUERY_ID`
- optional `DEFILLAMA_API_KEY`

Render cron:

- `DATABASE_URL`
- `PYTHON_VERSION=3.11.9`

`DATABASE_URL` should include `sslmode=require` when required by the provider.

## Release flow

1. Develop and verify on `staging`.
2. Confirm `npm run lint`, `npx tsc --noEmit`, the production build, and worker
   tests.
3. Merge `staging` into `main`.
4. Vercel deploys production from `main`.
5. Run Alembic manually only when a new migration exists.
