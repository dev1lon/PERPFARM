from perpfarm.db import connect_args_for

SESSION_POOLER = "postgresql+psycopg://postgres.abc:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
TRANSACTION_POOLER = "postgresql+psycopg://postgres.abc:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require"


def test_session_pooler_keeps_prepared_statements():
    """Where the worker is meant to run: preparing is a win, so leave it on."""
    assert connect_args_for(SESSION_POOLER) == {}


def test_transaction_pooler_turns_preparing_off():
    """The two URLs differ by one digit, and the wrong one fails hourly.

    psycopg3 prepares a statement after five runs; the worker's per-market
    INSERT crosses that every time. Through a transaction pooler the prepare
    and the execute can land on different backends -- "prepared statement does
    not exist" -- so preparing has to be off before that can happen.
    """
    assert connect_args_for(TRANSACTION_POOLER) == {"prepare_threshold": None}


def test_a_url_without_a_port_is_left_alone():
    assert connect_args_for("postgresql+psycopg://user:pw@db.example.com/postgres") == {}
