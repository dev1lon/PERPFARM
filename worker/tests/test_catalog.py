from perpfarm.jobs.catalog import CatalogRefreshSummary, _sync_all_markets


class _FakeEngine:
    """_sync_all_markets must never reach the engine for a stub venue --
    sync_markets calls adapter.get_markets() (which raises
    NotImplementedError for stubs) before it touches the DB. Any attribute
    access here means that ordering broke."""

    def __getattr__(self, name):  # pragma: no cover - only hit on regression
        raise AssertionError(f"engine was touched for a stub venue (.{name})")


def test_summary_defaults_to_all_zero():
    summary = CatalogRefreshSummary()
    assert summary.venues == 0
    assert summary.manual_rows == 0
    assert summary.markets_synced == 0
    assert summary.markets_skipped == 0
    assert summary.errors == []


def test_sync_all_markets_skips_stub_adapters_without_db(tmp_path):
    # Every stub venue raises NotImplementedError from get_markets(); hibachi
    # is live (network) and the two fixtures need real files -- so point
    # fixtures_dir at an empty dir: fixture venues then fail to build (recorded
    # as errors), stubs are skipped, and the engine is never touched.
    summary = CatalogRefreshSummary()
    _sync_all_markets(
        _FakeEngine(),
        fixtures_dir=tmp_path,
        data_dir=tmp_path,
        summary=summary,
    )
    # 12 stub real-venue adapters (variational, extended, pacifica, nado,
    # txflow, tradexyz, hotstuff, risex, 01exchange, perpl, polymarket, reya)
    # skip cleanly.
    assert summary.markets_skipped >= 10
    assert summary.markets_synced == 0
