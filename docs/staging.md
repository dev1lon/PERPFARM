# Staging

Staging is the isolated preview for changes before `main`.

- Web: Vercel preview deployed from `staging`.
- Database: separate Supabase/Postgres project.
- Scheduled worker: none by default.

## Database setup, and after every schema change

From `worker/`, with the staging connection in `DATABASE_URL`:

```bash
python -m alembic upgrade head
perpfarm refresh-catalog
perpfarm job fee-watch
perpfarm job sync-snapshots
```

`alembic upgrade head` is not optional after a migration lands on the branch:
staging has no cron, so nothing else will ever apply it. Migrations 0010 and
0011 added `venue_daily_stats` (the daily chart points), `pair_spread_risk`
(the cross-venue risk badge) and a traders column. Until they are applied, the
preview keeps working -- the chart falls back to summing snapshots and the
badge reads "unknown" -- but it is not testing what production runs.

There is no `job nightly` command. Pair rankings are calculated on request
from the saved snapshots.

Run `perpfarm job sync-snapshots` again whenever staging needs fresh market
data. Because staging has no cron, its volume history does not grow unless
this command is run against the staging database.

## Vercel variables

| Variable | Required |
|---|---:|
| `DATABASE_URL` | yes |
| `DUNE_API_KEY` | optional — only the TxFlow fallback path reads it |

Push test changes to `staging`; merge to `main` only after the preview and
automated checks pass.
