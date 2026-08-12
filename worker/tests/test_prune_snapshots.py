from perpfarm.jobs import prune_snapshots


def test_volume_snapshots_are_never_pruned():
    """The charts read up to 180 days of volume history.

    Pruning it to the 24h the calculator needs would silently empty the
    activity and OI-composition charts, so its absence here is a decision.
    """
    assert "volume_snapshots" not in prune_snapshots.PRUNABLE_TABLES
    assert set(prune_snapshots.PRUNABLE_TABLES) == {"book_snapshots", "funding_snapshots"}


def test_retention_is_well_clear_of_the_read_window():
    """Readers need 24 hours; a missed weekend of crons must not destroy it."""
    assert prune_snapshots.RETENTION_DAYS >= 3
