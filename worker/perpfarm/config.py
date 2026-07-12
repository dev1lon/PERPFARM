import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    # Universe knob: only the top N routes from the last scoring run get
    # hourly book snapshots; everything else in the ≥2-venue universe gets
    # daily snapshots only.
    deep_monitor_top_n: int = 20


def _normalize_database_url(url: str) -> str:
    """Force the psycopg3 dialect. Render's `fromDatabase` (and most other
    providers) hands out a bare `postgres://`/`postgresql://` URL, which
    makes SQLAlchemy default to the psycopg2 dialect -- not installed here,
    only `psycopg[binary]` (psycopg3, per pyproject.toml) is."""
    for bare_scheme in ("postgres://", "postgresql://"):
        if url.startswith(bare_scheme):
            return "postgresql+psycopg://" + url[len(bare_scheme) :]
    return url


def load_settings() -> Settings:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is not set")
    return Settings(database_url=_normalize_database_url(database_url))
