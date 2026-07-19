"""Central list of known venues and how to construct their adapter.

This is the source of truth for what `venues` rows should exist. Real venues
start with api_status='stub' until their adapter is wired up (see the
TODO(verify) comments in each adapter file); the two fixture venues exist
only for dev/tests and are never 'live'.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from perpfarm.adapters.base import VenueAdapter
from perpfarm.adapters.bullet import BulletAdapter
from perpfarm.adapters.exchange01 import Exchange01Adapter
from perpfarm.adapters.extended import ExtendedAdapter
from perpfarm.adapters.fixture import FixtureAdapter
from perpfarm.adapters.hibachi import HibachiAdapter
from perpfarm.adapters.hotstuff import HotStuffAdapter
from perpfarm.adapters.nado import NadoAdapter
from perpfarm.adapters.pacifica import PacificaAdapter
from perpfarm.adapters.perpl import PerplAdapter
from perpfarm.adapters.polymarket import PolymarketAdapter
from perpfarm.adapters.reya import ReyaAdapter
from perpfarm.adapters.risex import RiseXAdapter
from perpfarm.adapters.tradexyz import TradexyzAdapter
from perpfarm.adapters.txflow import TxflowAdapter
from perpfarm.adapters.variational import VariationalAdapter


@dataclass(frozen=True)
class VenueRegistration:
    slug: str
    name: str
    api_status: str  # 'live' | 'stub'
    build: Callable[[Path], VenueAdapter]
    # Synthetic dev/test venues (venue_alpha/venue_beta). Their manual YAML
    # rows still power the offline `print-routes` demo and scoring tests, but
    # they must NEVER be seeded into a real DB -- the catalog/ingest seed path
    # skips them by this flag.
    is_fixture: bool = False


def _real(
    slug: str, name: str, cls: type[VenueAdapter], *, api_status: str = "stub"
) -> VenueRegistration:
    return VenueRegistration(
        slug=slug, name=name, api_status=api_status, build=lambda _fixtures_dir: cls()
    )


def _fixture(slug: str, name: str) -> VenueRegistration:
    return VenueRegistration(
        slug=slug,
        name=name,
        api_status="stub",
        build=lambda fixtures_dir: FixtureAdapter(slug, fixtures_dir),
        is_fixture=True,
    )


REGISTRY: list[VenueRegistration] = [
    _real("variational", "Variational", VariationalAdapter, api_status="live"),
    _real("extended", "Extended", ExtendedAdapter),
    _real("pacifica", "Pacifica", PacificaAdapter),
    _real("nado", "Nado", NadoAdapter),
    _real("txflow", "TxFlow", TxflowAdapter),
    _real("tradexyz", "Tradexyz", TradexyzAdapter),
    _real("hotstuff", "HotStuff", HotStuffAdapter),
    _real("hibachi", "Hibachi", HibachiAdapter, api_status="live"),
    _real("risex", "RiseX", RiseXAdapter),
    # Keep the legacy slug for existing data while displaying the current
    # protocol name in the product.
    _real("01exchange", "N1", Exchange01Adapter),
    _real("perpl", "Perpl", PerplAdapter),
    _real("polymarket", "Polymarket", PolymarketAdapter),
    _real("reya", "Reya", ReyaAdapter),
    _real("bullet", "Bullet", BulletAdapter),
    _fixture("venue_alpha", "Perp-dex Alpha (fixture)"),
    _fixture("venue_beta", "Perp-dex Beta (fixture)"),
]

_BY_SLUG = {reg.slug: reg for reg in REGISTRY}

# Slugs that must be excluded from any real-DB seed (see is_fixture above).
FIXTURE_SLUGS = frozenset(reg.slug for reg in REGISTRY if reg.is_fixture)


def get_registration(slug: str) -> VenueRegistration:
    try:
        return _BY_SLUG[slug]
    except KeyError:
        raise KeyError(f"unknown venue slug '{slug}'; not in adapters.registry.REGISTRY") from None


def build_adapter(slug: str, fixtures_dir: Path) -> VenueAdapter:
    return get_registration(slug).build(fixtures_dir)
