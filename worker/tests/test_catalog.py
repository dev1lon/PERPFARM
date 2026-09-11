from perpfarm.adapters.registry import REGISTRY
from perpfarm.jobs import catalog
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


def test_sync_all_markets_skips_stub_adapters_without_db(tmp_path, monkeypatch):
    # This is a unit test of the stub path, not an integration test of every
    # live public API. Restrict its registry to stubs so adding a live adapter
    # cannot turn a fast, offline assertion into a network timeout.
    monkeypatch.setattr(catalog, "REGISTRY", [reg for reg in REGISTRY if reg.api_status == "stub"])
    summary = CatalogRefreshSummary()
    _sync_all_markets(
        _FakeEngine(),
        fixtures_dir=tmp_path,
        data_dir=tmp_path,
        summary=summary,
    )
    # The adapters still raising NotImplementedError skip cleanly: extended,
    # pacifica, hotstuff, 01exchange, perpl, reya, bullet. The count drops each
    # time a venue is wired up (nado, tradexyz, then ondo), so update it
    # together with the registry rather than loosening it to nothing.
    assert summary.markets_skipped >= 7
    assert summary.markets_synced == 0
