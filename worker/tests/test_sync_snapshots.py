from perpfarm.jobs.sync_snapshots import SnapshotSyncSummary


def test_snapshot_sync_summary_defaults_to_all_zero():
    summary = SnapshotSyncSummary()
    assert summary.written == 0
    assert summary.skipped == 0
    assert summary.errors == []
