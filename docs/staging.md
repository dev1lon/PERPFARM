# Staging

Staging is the isolated preview for changes before `main`.

- Web: Vercel preview deployed from `staging`.
- Database: separate Supabase/Postgres project.
- Scheduled worker: none by default.

## Initial database setup

From `worker/`, with the staging connection in `DATABASE_URL`:

```bash
python -m alembic upgrade head
perpfarm refresh-catalog
perpfarm job fee-watch
perpfarm job sync-snapshots
```

There is no `job nightly` command. Pair rankings are calculated on request
from the saved snapshots.

Run `perpfarm job sync-snapshots` again whenever staging needs fresh market
data. Because staging has no cron, its volume history does not grow unless
this command is run against the staging database.

## Vercel variables

| Variable | Required |
|---|---:|
| `DATABASE_URL` | yes |
| `DUNE_API_KEY` | optional |
| `DUNE_VARIATIONAL_UNIQUE_TRADERS_QUERY_ID` | optional override; defaults to `5754146` |
| `DEFILLAMA_API_KEY` | optional |

Push test changes to `staging`; merge to `main` only after the preview and
automated checks pass.
