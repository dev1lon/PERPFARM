import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    # Universe knob: only the top N routes from the last scoring run get
    # hourly book snapshots; everything else in the ≥2-venue universe gets
    # daily snapshots only.
    deep_monitor_top_n: int = 20


def load_settings() -> Settings:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is not set")
    return Settings(database_url=database_url)
