import httpx
import pytest
from fastapi.testclient import TestClient

from app.autocomplete import rank_suggestions, typed_house_number
from app.main import app, get_http
from app.models import LatLng

MIDI = LatLng(lat=50.8357, lng=4.3363)
BE = {"BE"}


def feature(street, number=None, postcode="1000", city="Bruxelles - Brussel", lng=4.35, lat=50.85, kind=None,
            name=None, osm_key="building", country="BE"):
    props = {
        "type": kind or ("house" if number else "street"),
        "osm_key": osm_key if number or name else "highway",
        "postcode": postcode,
        "city": city,
        "countrycode": country,
    }
    if number:
        props["housenumber"] = number
        props["street"] = street
    else:
        props["name"] = street
    if name:
        props["name"] = name
        props["street"] = street
    return {"properties": props, "geometry": {"coordinates": [lng, lat]}}


@pytest.mark.parametrize(
    ("query", "number"),
    [("rue neuve 11", "11"), ("Rue Neuve 11a, 1000 Bruxelles", "11A"), ("kerkstraat 12-14 gent", "12-14"),
     ("rue neuve", None), ("1000 bruxelles", None)],
)
def test_typed_house_number(query, number):
    assert typed_house_number(query) == number


def test_same_street_closest_first_and_exact_name_before_partial():
    features = [
        feature("Rue Neuve", "11", "1430", "Rebecq-Rognon", lng=4.13, lat=50.66),
        feature("Rue Terre-Neuve - Nieuwland", "11", lng=4.345, lat=50.843),
        feature("Rue Neuve - Nieuwstraat", "11", lng=4.355, lat=50.852),
    ]
    result = rank_suggestions(features, "rue neuve 11", MIDI, BE, 6)
    assert [s.address for s in result] == [
        "Rue Neuve 11, 1000 Bruxelles",
        "Rue Neuve 11, 1430 Rebecq-Rognon",
        "Rue Terre-Neuve 11, 1000 Bruxelles",
    ]
    assert result[0].title == "Rue Neuve 11"
    assert result[0].subtitle == "1000 Bruxelles"
    assert result[0].precision == "exact"


def test_bilingual_names_follow_the_typed_language():
    features = [feature("Rue Neuve - Nieuwstraat", "11")]
    [dutch] = rank_suggestions(features, "nieuwstraat 11", MIDI, BE, 6)
    assert dutch.address == "Nieuwstraat 11, 1000 Brussel"


def test_typed_number_is_kept_on_street_level_results():
    features = [feature("Rue de la Loi - Wetstraat"), feature("Rue de la Loi - Wetstraat", name="Arts-Loi", kind="house",
                                                              osm_key="railway")]
    result = rank_suggestions(features, "rue de la loi 999", MIDI, BE, 6)
    assert [s.address for s in result] == ["Rue de la Loi 999, 1000 Bruxelles"]
    assert result[0].precision == "street"


def test_named_places_use_their_name_as_title():
    features = [feature("Kerkstraat", "12", "9820", "Merelbeke", name="Broodhuys Edelweiss", osm_key="shop")]
    [shop] = rank_suggestions(features, "kerkstraat 12", MIDI, BE, 6)
    assert shop.title == "Broodhuys Edelweiss"
    assert shop.subtitle == "Kerkstraat 12, 9820 Merelbeke"
    assert shop.address == "Broodhuys Edelweiss, Kerkstraat 12, 9820 Merelbeke"


def test_filters_other_countries_cities_and_duplicates():
    features = [
        feature("Avenue Louise", "5", "59110", "La Madeleine", country="FR"),
        {"properties": {"type": "city", "name": "Bruxelles", "countrycode": "BE"}, "geometry": {"coordinates": [4.35, 50.85]}},
        feature("Avenue Louise - Louizalaan", "5", "1050"),
        feature("Avenue Louise - Louizalaan", "5", "1050"),
    ]
    result = rank_suggestions(features, "avenue louise 5", MIDI, BE, 6)
    assert [s.address for s in result] == ["Avenue Louise 5, 1050 Bruxelles"]


def test_limit():
    features = [feature(f"Rue Neuve", str(n)) for n in range(1, 20)]
    assert len(rank_suggestions(features, "rue neuve", MIDI, BE, 6)) == 6


@pytest.fixture
def client():
    def photon(request: httpx.Request) -> httpx.Response:
        assert request.url.params["lat"] == "50.8357"
        return httpx.Response(200, json={"features": [feature("Rue Neuve - Nieuwstraat", "11")]})

    mock = httpx.AsyncClient(transport=httpx.MockTransport(photon))
    app.dependency_overrides[get_http] = lambda: mock
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_autocomplete_endpoint(client):
    response = client.get("/autocomplete", params={"q": "rue neuve 11", "lat": 50.8357, "lng": 4.3363})
    assert response.status_code == 200
    [suggestion] = response.json()["suggestions"]
    assert suggestion["address"] == "Rue Neuve 11, 1000 Bruxelles"
    assert suggestion["location"] == {"lat": 50.85, "lng": 4.35}


def test_autocomplete_short_query_returns_nothing(client):
    assert client.get("/autocomplete", params={"q": "ru"}).json() == {"suggestions": []}


def test_autocomplete_reports_photon_outage():
    mock = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(502)))
    app.dependency_overrides[get_http] = lambda: mock
    with TestClient(app) as c:
        response = c.get("/autocomplete", params={"q": "rue neuve"})
    app.dependency_overrides.clear()
    assert response.status_code == 503
