from perpfarm.config import _normalize_database_url


def test_normalizes_bare_postgres_scheme():
    assert _normalize_database_url("postgres://u:p@host:5432/db") == "postgresql+psycopg://u:p@host:5432/db"


def test_normalizes_bare_postgresql_scheme():
    assert (
        _normalize_database_url("postgresql://u:p@host:5432/db") == "postgresql+psycopg://u:p@host:5432/db"
    )


def test_leaves_explicit_driver_scheme_untouched():
    url = "postgresql+psycopg://u:p@host:5432/db"
    assert _normalize_database_url(url) == url
