"""Matrice des temps de trajet et distances entre tous les points de la tournée.

- OSRM (self-hosted, gratuit) : vrais temps de trajet routiers, sens uniques compris.
- Sinon : estimation à vol d'oiseau (haversine) x facteur de détour — suffisant pour développer.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Literal

import httpx

from app.config import Settings
from app.models import LatLng

log = logging.getLogger(__name__)

EARTH_RADIUS_M = 6_371_000
# Pénalité pour une paire de points non reliée par la route (île, zone piétonne…).
UNREACHABLE_PENALTY = 3.0


@dataclass
class Matrix:
    durations: list[list[float]]  # secondes
    distances: list[list[float]]  # mètres
    source: Literal["osrm", "haversine"]


def haversine_m(a: LatLng, b: LatLng) -> float:
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlat = lat2 - lat1
    dlng = math.radians(b.lng - a.lng)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def haversine_matrix(points: list[LatLng], settings: Settings) -> Matrix:
    speed_ms = settings.fallback_speed_kmh / 3.6
    distances = [[haversine_m(a, b) * settings.fallback_detour_factor for b in points] for a in points]
    durations = [[d / speed_ms for d in row] for row in distances]
    return Matrix(durations=durations, distances=distances, source="haversine")


def _blocks(n: int, size: int) -> list[range]:
    return [range(i, min(i + size, n)) for i in range(0, n, size)]


async def osrm_matrix(points: list[LatLng], settings: Settings, client: httpx.AsyncClient) -> Matrix:
    n = len(points)
    durations = [[0.0] * n for _ in range(n)]
    distances = [[0.0] * n for _ in range(n)]
    base = settings.osrm_url.rstrip("/")

    # Un serveur OSRM limite le nombre de points par requête (--max-table-size) :
    # au-delà, on découpe en blocs sources x destinations.
    if n <= settings.osrm_max_table_size:
        pairs = [(range(n), range(n))]
    else:
        block_size = max(1, settings.osrm_max_table_size // 2)
        blocks = _blocks(n, block_size)
        pairs = [(src, dst) for src in blocks for dst in blocks]

    for sources, destinations in pairs:
        same = sources == destinations
        indices = list(sources) if same else list(sources) + list(destinations)
        coords = ";".join(f"{points[i].lng:.6f},{points[i].lat:.6f}" for i in indices)
        params = {"annotations": "duration,distance", "generate_hints": "false"}
        if not same:
            params["sources"] = ";".join(str(i) for i in range(len(sources)))
            params["destinations"] = ";".join(str(len(sources) + j) for j in range(len(destinations)))

        response = await client.get(f"{base}/table/v1/driving/{coords}", params=params)
        response.raise_for_status()
        body = response.json()
        if body.get("code") != "Ok":
            raise httpx.HTTPError(f"OSRM: {body.get('code')} {body.get('message', '')}")

        for row_idx, i in enumerate(sources):
            for col_idx, j in enumerate(destinations):
                duration = body["durations"][row_idx][col_idx]
                distance = body["distances"][row_idx][col_idx]
                if duration is None or distance is None:
                    straight = haversine_m(points[i], points[j])
                    distance = straight * UNREACHABLE_PENALTY
                    duration = distance / (settings.fallback_speed_kmh / 3.6)
                durations[i][j] = float(duration)
                distances[i][j] = float(distance)

    return Matrix(durations=durations, distances=distances, source="osrm")


async def build_matrix(points: list[LatLng], settings: Settings, client: httpx.AsyncClient) -> Matrix:
    if settings.osrm_url:
        try:
            return await osrm_matrix(points, settings, client)
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            # On préfère un ordre approximatif à une erreur : l'app affiche "à vol d'oiseau".
            log.error("OSRM indisponible, repli sur l'estimation à vol d'oiseau : %s", exc)
    return haversine_matrix(points, settings)
