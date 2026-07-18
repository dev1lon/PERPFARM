# Staging (free) — Supabase + Render free

A throwaway test copy of the site, fully on free tiers, isolated from prod.

- **Web**: Render **free** web service, deployed from the `staging` branch.
  Spins down after ~15 min idle and cold-starts (~30–60s) on the next request —
  fine for staging.
- **DB**: a free **Supabase** Postgres project (persistent — pauses after ~1
  week of inactivity, restore in one click; not deleted like Render's free DB).
- **Crons**: none (paid on Render). You seed/refresh the staging DB by running
  the worker CLI **locally** against the Supabase URL — the Python worker runs
  fine locally (only Next has the exFAT dev quirk).

Prod (`main`, `render.yaml`, Render Postgres) is untouched by any of this.

## 1. Branch

```
git checkout -b staging
git push -u origin staging
```

Push test changes to `staging`; merge to `main` when they're ready for prod.

## 2. Supabase project

1. supabase.com → New project (free). Pick a region + DB password.
2. Project → **Connect** → **Connection string** → **URI**. Use the **Session
   pooler** (port `5432`) string. It looks like:
   ```
   postgresql://postgres.<ref>:<password>@<host>.pooler.supabase.com:5432/postgres
   ```
3. **Append `?sslmode=require`** if it isn't there — both the web (`lib/db.ts`)
   and the worker turn on TLS when they see it. Keep this URL handy as
   `STAGING_DB`.

## 3. Seed the staging DB (locally, from `worker/`)

```
cd worker
DATABASE_URL="<STAGING_DB>?sslmode=require" python -m alembic upgrade head
DATABASE_URL="<STAGING_DB>?sslmode=require" perpfarm refresh-catalog
DATABASE_URL="<STAGING_DB>?sslmode=require" perpfarm job sync-snapshots
DATABASE_URL="<STAGING_DB>?sslmode=require" perpfarm job nightly
```

- `alembic upgrade head` creates the schema.
- `refresh-catalog` seeds venues + manual data (Twitter/Docs, etc.).
- `sync-snapshots` + `nightly` populate market data and route scores.
- Re-run these whenever you want to refresh staging data (there are no crons).

## 4. Render free web service

Either:

- **Blueprint**: Render → New → **Blueprint** → point at `render.staging.yaml`
  on the `staging` branch, then fill the `sync: false` env vars, **or**
- **Manual**: Render → New → **Web Service** → this repo → **branch `staging`**,
  `rootDir = web`, plan **Free**, build `npm install --include=dev && npm run
  build`, start `npm start`.

Set env vars on the service:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | the Supabase URL (with `?sslmode=require`) |
| `DEFILLAMA_API_KEY` | optional (live DefiLlama volume) |
| `DUNE_API_KEY` | optional (Users tab) |
| `DUNE_VARIATIONAL_UNIQUE_TRADERS_QUERY_ID` | optional |

## Caveats

- Cold start on the first request after idle (~30–60s) — expected.
- Supabase free pauses after ~1 week idle; open the dashboard once to resume.
- Schema changes: re-run `alembic upgrade head` against `STAGING_DB` after
  merging migrations into `staging`.
- Cost: **$0** — no Render DB, no crons.
