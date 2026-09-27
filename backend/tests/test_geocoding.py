import httpx
import pytest

from app.config import Settings
from app.geocoding import (
    Candidate,
    GeocodeCache,
    GeocodingService,
    GeocodingUnavailable,
    PhotonProvider,
    choose_candidate,
    extract_postcode,
    normalize_address,
    street_matches,
)
from app.models import LatLng

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.parametrize(
    ("address", "postcode"),
    [
        ("Rue de la Loi 16, 1000 Bruxelles", "1000"),
        ("Kerkstraat 12 9000 Gent", "9000"),
        ("Chaussée de Waterloo 1151, 1180 Uccle", "1180"),
        ("Chaussée de Waterloo 1151", None),
        ("Place Flagey, Ixelles 1050", "1050"),
        ("Rue du Marché 3", None),
    ],
)
def test_extract_postcode(address, postcode):
    assert extract_postcode(address) == postcode


def test_normalize_address():
    assert normalize_address("  Rue de la Loi 16,  1000   BRUXELLES. ") == "rue de la loi 16 1000 bruxelles"


def cand(postcode, precision="exact", label="x", street=None):
    return Candidate(lat=50.0, lng=4.0, label=label, precision=precision, postcode=postcode, street=street)


def test_choose_candidate_prefers_matching_postcode():
    chosen, warning = choose_candidate([cand("9050", label="a"), cand("9000", label="b")], "Kerkstraat 12, 9000 Gent")
    assert chosen.label == "b"
    assert warning is None


def test_choose_candidate_warns_on_postcode_mismatch():
    chosen, warning = choose_candidate([cand("9050"), cand("9860")], "Kerkstraat 12, 9000 Gent")
    assert chosen.postcode == "9050"
    assert "9050 au lieu de 9000" in warning


def test_choose_candidate_prefers_precise_over_approximate():
    chosen, _ = choose_candidate(
        [cand("1000", "approximate", "city"), cand("1000", "exact", "house")], "Rue Neuve 1, 1000 Bruxelles"
    )
    assert chosen.label == "house"


def test_choose_candidate_empty():
    assert choose_candidate([], "Rue Neuve 1, 1000 Bruxelles") is None


PHOTON_RESPONSE = {
    "features": [
        {
            "properties": {
                "type": "house",
                "housenumber": "12",
                "street": "Kerkstraat",
                "postcode": "9050",
                "city": "Gand",
                "countrycode": "BE",
            },
            "geometry": {"coordinates": [3.7575, 51.0455]},
        },
        {
            "properties": {"type": "house", "housenumber": "12", "street": "Kerkstraat", "postcode": "9000",
                           "city": "Gand", "countrycode": "BE"},
            "geometry": {"coordinates": [3.72, 51.05]},
        },
        {
            "properties": {"type": "house", "housenumber": "12", "street": "Kerkstraat", "postcode": "4500",
                           "city": "Maastricht", "countrycode": "NL"},
            "geometry": {"coordinates": [5.7, 50.85]},
        },
    ]
}


def make_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_photon_provider_parses_and_filters_country():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(request.url.params)
        return httpx.Response(200, json=PHOTON_RESPONSE)

    async with make_client(handler) as client:
        provider = PhotonProvider(client, Settings())
        candidates = await provider.search("Kerkstraat 12, 9000 Gent", LatLng(lat=51.0, lng=3.7))

    assert [c.postcode for c in candidates] == ["9050", "9000"]  # le résultat NL est écarté
    assert candidates[0].label == "Kerkstraat 12, 9050 Gand"
    assert candidates[0].precision == "exact"
    assert seen["lat"] == "51.0" and seen["lang"] == "default" and "bbox" in seen


class FakeProvider:
    def __init__(self, name, candidates=None, error=False):
        self.name = name
        self.candidates = candidates or []
        self.error = error
        self.calls = 0

    async def search(self, query, bias):
        self.calls += 1
        if self.error:
            raise httpx.ConnectError("boom")
        return self.candidates


async def test_service_uses_cache():
    provider = FakeProvider("fake", [cand("1000")])
    service = GeocodingService([provider], GeocodeCache(":memory:"))
    first = await service.geocode("Rue de la Loi 16, 1000 Bruxelles")
    second = await service.geocode("rue de la loi 16 1000 bruxelles")
    assert first == second
    assert provider.calls == 1


async def test_service_falls_back_to_next_provider():
    broken = FakeProvider("a", error=True)
    street_only = FakeProvider("b", [cand("1000", "approximate")])
    exact = FakeProvider("c", [cand("1000", "exact", "precise")])
    service = GeocodingService([broken, street_only, exact], GeocodeCache(":memory:"))
    result = await service.geocode("Rue de la Loi 16, 1000 Bruxelles")
    assert result.label == "precise"
    assert result.provider == "c"


async def test_service_stops_at_first_exact_match():
    first = FakeProvider("a", [cand("1000")])
    second = FakeProvider("b", [cand("1000")])
    service = GeocodingService([first, second], GeocodeCache(":memory:"))
    await service.geocode("Rue de la Loi 16, 1000 Bruxelles")
    assert second.calls == 0


async def test_service_not_found_vs_unavailable():
    service = GeocodingService([FakeProvider("a")], GeocodeCache(":memory:"))
    assert await service.geocode("Nulle part 1, 9999 Nowhere") is None

    service = GeocodingService([FakeProvider("a", error=True)], GeocodeCache(":memory:"))
    with pytest.raises(GeocodingUnavailable):
        await service.geocode("Rue de la Loi 16, 1000 Bruxelles")


@pytest.mark.parametrize(
    ("address", "street", "expected"),
    [
        ("Nieuwstraat 111, 1000 Brussel", "Rue Neuve - Nieuwstraat", True),  # bilinguisme bruxellois
        ("Rue Neuve 111, 1000 Bruxelles", "Rue Neuve - Nieuwstraat", True),
        ("Avenue Lousie 54, 1050 Ixelles", "Avenue Louise - Louizalaan", True),  # faute de frappe
        ("Kerkstrat 12, 9000 Gent", "Kerkstraat", True),
        ("Place Flagey 18, 1050 Ixelles", "Place Eugène Flagey - Eugène Flageyplein", True),
        ("Chaussee d'Ixelles 227, 1050 Ixelles", "Chaussée d'Ixelles - Elsensesteenweg", True),  # sans accent
        ("Kerkstraat 12, 9000 Gent", "Kerkstraat", True),
        ("Rue Zzzinconnue 12, 1000 Bruxelles", "Rue des Teinturiers - Verversstraat", False),
        ("Rue Zzzinconnue 12, 1000 Bruxelles", None, True),  # résultat au niveau commune
    ],
)
def test_street_matches(address, street, expected):
    assert street_matches(address, street) is expected


def test_choose_candidate_prefers_matching_street_over_order():
    candidates = [
        cand("1000", street="Rue de l'Écuelle - Napstraat", label="wrong"),
        cand("1000", street="Rue Neuve - Nieuwstraat", label="right"),
    ]
    chosen, warning = choose_candidate(candidates, "Nieuwstraat 111, 1000 Brussel")
    assert chosen.label == "right"
    assert warning is None


def test_choose_candidate_warns_when_no_street_matches():
    candidates = [cand("1000", street="Rue des Teinturiers - Verversstraat")]
    chosen, warning = choose_candidate(candidates, "Rue Zzzinconnue 12, 1000 Bruxelles")
    assert chosen is candidates[0]
    assert "Rue différente" in warning


async def test_service_keeps_street_level_result_without_querying_next_provider():
    first = FakeProvider("a", [cand("1000", "street")])
    second = FakeProvider("b", [cand("1000", "exact")])
    service = GeocodingService([first, second], GeocodeCache(":memory:"))
    result = await service.geocode("Rue de la Loi 16, 1000 Bruxelles")
    assert result.provider == "a"
    assert second.calls == 0


def test_choose_candidate_prefers_exact_street_name_over_partial_match():
    # Cas réel : avec un départ gare du Midi, Photon classait "Rue Terre-Neuve" avant "Rue Neuve".
    candidates = [
        cand("1000", street="Rue Terre-Neuve - Nieuwland", label="terre-neuve"),
        cand("1000", street="Rue Neuve - Nieuwstraat", label="neuve"),
    ]
    chosen, warning = choose_candidate(candidates, "Rue Neuve 111, 1000 Bruxelles")
    assert chosen.label == "neuve"
    assert warning is None


def test_right_street_beats_precise_house_on_wrong_street():
    candidates = [
        cand("1000", "exact", street="Rue des Teinturiers - Verversstraat", label="wrong"),
        cand("1000", "street", street="Rue Neuve - Nieuwstraat", label="right"),
    ]
    chosen, _ = choose_candidate(candidates, "Rue Neuve 111, 1000 Bruxelles")
    assert chosen.label == "right"
