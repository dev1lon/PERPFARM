"""add native quote curves to book snapshots

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("book_snapshots", sa.Column("quote_curve_json", JSONB))


def downgrade() -> None:
    op.drop_column("book_snapshots", "quote_curve_json")
