from urllib.parse import urlsplit

from sqlalchemy import Engine, create_engine

from perpfarm.config import load_settings

#: Supabase serves the transaction pooler here and the session pooler on 5432.
TRANSACTION_POOLER_PORT = 6543


def connect_args_for(database_url: str) -> dict[str, object]:
    """Driver options this URL needs.

    psycopg3 promotes a query to a server-side PREPARED STATEMENT once it has
    run five times, and the worker repeats the same INSERT once per market --
    hundreds of times a run, so the threshold is always crossed. A transaction
    pooler hands each statement to whatever backend is free, so the prepare and
    the execute can land on different connections and the run dies with
    "prepared statement does not exist".

    The worker is meant to stay on the session pooler (5432), where this does
    not arise. But the website is moving to the transaction pooler, and the two
    URLs look almost identical -- so if this one ever points at 6543, turn
    preparing off rather than fail hourly with a cryptic error.
    """
    port = urlsplit(database_url).port
    return {"prepare_threshold": None} if port == TRANSACTION_POOLER_PORT else {}


def make_engine() -> Engine:
    settings = load_settings()
    return create_engine(
        settings.database_url,
        future=True,
        connect_args=connect_args_for(settings.database_url),
    )
