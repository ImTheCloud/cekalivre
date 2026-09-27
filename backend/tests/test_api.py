import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.geocoding import GeocodeResult
from app.main import app, get_geocoder

# Adresses fictives placées sur un axe est-ouest à partir de Bruxelles.
KNOWN = {
    "A 1, 1000 Bruxelles": (50.85, 4.36),
    "B 2, 1000 Bruxelles": (50.85, 4.40),
    "C 3, 1000 Bruxelles": (50.85, 4.38),
    "Dépôt 1, 1000 Bruxelles": (50.85, 4.45),
    "Loin 1, 8400 Ostende": (51.23, 2.92),
}


class FakeGeocoder:
    provider_names = ["fake"]

    async def geocode(self, address, bias=None):
        if address not in KNOWN:
            return None
        lat, lng = KNOWN[address]
        return GeocodeResult(lat=lat, lng=lng, label=f"[{address}]", precision="exact", warning=None, provider="fake")


@pytest.fixture
def client():
    app.dependency_overrides[get_geocoder] = lambda: FakeGeocoder()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


START = {"lat": 50.85, "lng": 4.35}


def stop(i, address, location=None):
    return {"id": f"s{i}", "address": address, "location": location}


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "matrixSource": "haversine", "geocoders": ["fake"]}


def test_optimize_orders_stops_and_reports_unresolved(client):
    body = {
        "start": START,
        "end": None,
        "stops": [
            stop(1, "B 2, 1000 Bruxelles"),
            stop(2, "Adresse inconnue 9, 1000 Bruxelles"),
            stop(3, "A 1, 1000 Bruxelles"),
            stop(4, "C 3, 1000 Bruxelles"),
        ],
    }
    response = client.post("/optimize", json=body)
    assert response.status_code == 200
    data = response.json()

    assert [s["id"] for s in data["stops"]] == ["s3", "s4", "s1"]  # A (4.36) -> C (4.38) -> B (4.40)
    assert data["unresolved"] == [{"id": "s2", "address": "Adresse inconnue 9, 1000 Bruxelles", "reason": "Adresse introuvable"}]
    assert data["stops"][0]["label"] == "[A 1, 1000 Bruxelles]"
    assert data["stops"][0]["legDurationS"] > 0
    assert data["totalDistanceM"] == pytest.approx(sum(s["legDistanceM"] for s in data["stops"]), abs=2)
    assert data["matrixSource"] == "haversine"
    assert data["end"] is None


def test_optimize_with_end_address_and_known_location(client):
    body = {
        "start": START,
        "end": {"address": "Dépôt 1, 1000 Bruxelles"},
        "stops": [
            stop(1, "B 2, 1000 Bruxelles"),
            # Coordonnées déjà connues : pas de géocodage, label null.
            stop(2, "peu importe", {"lat": 50.85, "lng": 4.37}),
        ],
    }
    data = client.post("/optimize", json=body).json()
    assert [s["id"] for s in data["stops"]] == ["s2", "s1"]
    assert data["stops"][0]["label"] is None
    assert data["end"]["label"] == "[Dépôt 1, 1000 Bruxelles]"
    # Le total inclut le dernier trajet vers l'arrivée.
    assert data["totalDistanceM"] > sum(s["legDistanceM"] for s in data["stops"])


def test_far_stop_gets_a_warning(client):
    body = {"start": START, "stops": [stop(1, "Loin 1, 8400 Ostende"), stop(2, "A 1, 1000 Bruxelles")]}
    data = client.post("/optimize", json=body).json()
    warnings = {s["id"]: s["warning"] for s in data["stops"]}
    assert "km du départ" in warnings["s1"]
    assert warnings["s2"] is None


def test_unknown_end_address_is_a_clear_error(client):
    body = {"start": START, "end": {"address": "Nulle part 1, 9999 Rien"}, "stops": [stop(1, "A 1, 1000 Bruxelles")]}
    response = client.post("/optimize", json=body)
    assert response.status_code == 422
    assert "arrivée introuvable" in response.json()["detail"]


def test_all_unresolved_returns_empty_route(client):
    data = client.post("/optimize", json={"start": START, "stops": [stop(1, "Inconnue 1, 1000 X")]}).json()
    assert data["stops"] == []
    assert len(data["unresolved"]) == 1


def test_validation_error_on_empty_stops(client):
    assert client.post("/optimize", json={"start": START, "stops": []}).status_code == 422


def test_token_is_required_when_configured(client):
    app.dependency_overrides[get_settings] = lambda: Settings(api_token="secret")
    body = {"start": START, "stops": [stop(1, "A 1, 1000 Bruxelles")]}
    assert client.post("/optimize", json=body).status_code == 401
    assert client.post("/optimize", json=body, headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.post("/optimize", json=body, headers={"Authorization": "Bearer secret"}).status_code == 200
