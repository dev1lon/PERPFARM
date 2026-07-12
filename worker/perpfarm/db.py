from sqlalchemy import Engine, create_engine

from perpfarm.config import load_settings


def make_engine() -> Engine:
    settings = load_settings()
    return create_engine(settings.database_url, future=True)
