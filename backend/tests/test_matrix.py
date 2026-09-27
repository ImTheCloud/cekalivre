import httpx
import pytest

from app.config import Settings
from app.matrix import build_matrix, haversine_m, haversine_matrix
from app.models import LatLng

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


BRUSSELS = LatLng(lat=50.8467, lng=4.3525)
GHENT = LatLng(lat=51.0543, lng=3.7174)


def test_haversine_brussels_ghent():
    assert 48_000 < haversine_m(BRUSSELS, GHENT) < 52_000


def test_haversine_matrix_applies_detour_and_speed():
    settings = Settings(fallback_detour_factor=1.5, fallback_speed_kmh=36)
    matrix = haversine_matrix([BRUSSELS, GHENT], settings)
    straight = haversine_m(BRUSSELS, GHENT)
    assert matrix.distances[0][1] == pytest.approx(straight * 1.5)
    assert matrix.durations[0][1] == pytest.approx(straight * 1.5 / 10)  # 36 km/h = 10 m/s
    assert matrix.durations[0][0] == 0
    assert matrix.source == "haversine"


def fake_osrm(all_points: list[LatLng]):
    """Faux serveur OSRM : durée = 10 x |i - j|, distance = 100 x |i - j| (i, j = indices globaux)."""
    by_coord = {f"{p.lng:.6f},{p.lat:.6f}": i for i, p in enumerate(all_points)}
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        coords = request.url.path.split("/driving/")[1].split(";")
        ids = [by_coord[c] for c in coords]
        params = request.url.params
        sources = [int(x) for x in params["sources"].split(";")] if "sources" in params else range(len(ids))
        dests = [int(x) for x in params["destinations"].split(";")] if "destinations" in params else range(len(ids))
        requests.append(len(ids))
        return httpx.Response(
            200,
            json={
                "code": "Ok",
                "durations": [[10 * abs(ids[s] - ids[d]) for d in dests] for s in sources],
                "distances": [[100 * abs(ids[s] - ids[d]) for d in dests] for s in sources],
            },
        )

    return handler, requests


@pytest.mark.parametrize("max_table", [100, 6, 4])
async def test_osrm_matrix_is_identical_with_or_without_chunking(max_table):
    points = [LatLng(lat=50 + i * 0.01, lng=4 + i * 0.01) for i in range(9)]
    handler, requests = fake_osrm(points)
    settings = Settings(osrm_url="http://osrm", osrm_max_table_size=max_table)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        matrix = await build_matrix(points, settings, client)

    assert matrix.source == "osrm"
    for i in range(9):
        for j in range(9):
            assert matrix.durations[i][j] == 10 * abs(i - j)
            assert matrix.distances[i][j] == 100 * abs(i - j)
    assert max(requests) <= max_table


async def test_osrm_null_entries_get_a_penalty():
    def handler(request):
        return httpx.Response(200, json={"code": "Ok", "durations": [[0, None], [5, 0]], "distances": [[0, None], [50, 0]]})

    settings = Settings(osrm_url="http://osrm")
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        matrix = await build_matrix([BRUSSELS, GHENT], settings, client)
    assert matrix.distances[0][1] > haversine_m(BRUSSELS, GHENT) * 2
    assert matrix.durations[1][0] == 5


async def test_osrm_failure_falls_back_to_haversine():
    def handler(request):
        return httpx.Response(503)

    settings = Settings(osrm_url="http://osrm")
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        matrix = await build_matrix([BRUSSELS, GHENT], settings, client)
    assert matrix.source == "haversine"
