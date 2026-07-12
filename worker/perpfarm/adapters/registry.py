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
from perpfarm.adapters.extended import ExtendedAdapter
from perpfarm.adapters.fixture import FixtureAdapter
from perpfarm.adapters.hibachi import HibachiAdapter
from perpfarm.adapters.hotstuff import HotStuffAdapter
from perpfarm.adapters.lighter import LighterAdapter
from perpfarm.adapters.nado import NadoAdapter
from perpfarm.adapters.pacifica import PacificaAdapter
from perpfarm.adapters.paradex import ParadexAdapter
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


def _real(slug: str, name: str, cls: type[VenueAdapter]) -> VenueRegistration:
    return VenueRegistration(slug=slug, name=name, api_status="stub", build=lambda _fixtures_dir: cls())


def _fixture(slug: str, name: str) -> VenueRegistration:
    return VenueRegistration(
        slug=slug,
        name=name,
        api_status="stub",
        build=lambda fixtures_dir: FixtureAdapter(slug, fixtures_dir),
    )


REGISTRY: list[VenueRegistration] = [
    _real("variational", "Variational", VariationalAdapter),
    _real("lighter", "Lighter", LighterAdapter),
    _real("extended", "Extended", ExtendedAdapter),
    _real("paradex", "Paradex", ParadexAdapter),
    _real("pacifica", "Pacifica", PacificaAdapter),
    _real("nado", "Nado", NadoAdapter),
    _real("txflow", "TxFlow", TxflowAdapter),
    _real("tradexyz", "Tradexyz", TradexyzAdapter),
    _real("hotstuff", "HotStuff", HotStuffAdapter),
    _real("hibachi", "Hibachi", HibachiAdapter),
    _real("risex", "RiseX", RiseXAdapter),
    _fixture("venue_alpha", "Perp-dex Alpha (fixture)"),
    _fixture("venue_beta", "Perp-dex Beta (fixture)"),
]

_BY_SLUG = {reg.slug: reg for reg in REGISTRY}


def get_registration(slug: str) -> VenueRegistration:
    try:
        return _BY_SLUG[slug]
    except KeyError:
        raise KeyError(f"unknown venue slug '{slug}'; not in adapters.registry.REGISTRY") from None


def build_adapter(slug: str, fixtures_dir: Path) -> VenueAdapter:
    return get_registration(slug).build(fixtures_dir)
