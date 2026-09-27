"""Orchestration de POST /optimize : géocodage -> matrice -> solveur -> réponse."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

import anyio.to_thread
import httpx

from app.config import Settings
from app.geocoding import GeocodingService, GeocodingUnavailable
from app.matrix import build_matrix, haversine_m
from app.models import (
    AddressPoint,
    EndOut,
    LatLng,
    OptimizeRequest,
    OptimizeResponse,
    Precision,
    StopIn,
    StopOut,
    UnresolvedStop,
)
from app.solver import solve_order, time_limit_for

log = logging.getLogger(__name__)


class OptimizeError(Exception):
    """Erreur compréhensible par le chauffeur (renvoyée en 422)."""


@dataclass
class ResolvedStop:
    stop: StopIn
    location: LatLng
    label: str | None
    precision: Precision | None
    warning: str | None


async def _geocode_stops(
    stops: list[StopIn], start: LatLng, geocoder: GeocodingService
) -> tuple[list[ResolvedStop], list[UnresolvedStop]]:
    async def resolve(stop: StopIn) -> ResolvedStop | UnresolvedStop:
        if stop.location is not None:
            return ResolvedStop(stop, stop.location, None, None, None)
        try:
            result = await geocoder.geocode(stop.address, bias=start)
        except GeocodingUnavailable:
            return UnresolvedStop(id=stop.id, address=stop.address, reason="Service de géocodage indisponible")
        if result is None:
            return UnresolvedStop(id=stop.id, address=stop.address, reason="Adresse introuvable")
        return ResolvedStop(stop, LatLng(lat=result.lat, lng=result.lng), result.label, result.precision, result.warning)

    # Les adresses identiques (plusieurs colis) ne sont géocodées qu'une fois grâce au cache,
    # mais on les lance en série pour qu'elles en profitent : on groupe donc par adresse.
    by_address: dict[str, list[StopIn]] = {}
    for stop in stops:
        by_address.setdefault(stop.address.strip().lower(), []).append(stop)

    async def resolve_group(group: list[StopIn]) -> list[ResolvedStop | UnresolvedStop]:
        return [await resolve(stop) for stop in group]

    groups = await asyncio.gather(*(resolve_group(g) for g in by_address.values()))
    results = {r.stop.id if isinstance(r, ResolvedStop) else r.id: r for group in groups for r in group}

    resolved, unresolved = [], []
    for stop in stops:  # on conserve l'ordre de saisie
        r = results[stop.id]
        (resolved if isinstance(r, ResolvedStop) else unresolved).append(r)
    return resolved, unresolved


async def _resolve_end(end: LatLng | AddressPoint | None, start: LatLng, geocoder: GeocodingService) -> EndOut | None:
    if end is None:
        return None
    if isinstance(end, LatLng):
        return EndOut(lat=end.lat, lng=end.lng, label="Arrivée")
    try:
        result = await geocoder.geocode(end.address, bias=start)
    except GeocodingUnavailable as exc:
        raise OptimizeError("Service de géocodage indisponible, réessaie dans un instant.") from exc
    if result is None:
        raise OptimizeError(f"Adresse d'arrivée introuvable : « {end.address} ». Corrige-la dans les réglages.")
    return EndOut(lat=result.lat, lng=result.lng, label=result.label)


async def optimize(
    request: OptimizeRequest, settings: Settings, geocoder: GeocodingService, client: httpx.AsyncClient
) -> OptimizeResponse:
    t0 = time.perf_counter()
    (resolved, unresolved), end = await asyncio.gather(
        _geocode_stops(request.stops, request.start, geocoder),
        _resolve_end(request.end, request.start, geocoder),
    )
    t_geocode = time.perf_counter() - t0

    if not resolved:
        return OptimizeResponse(
            stops=[], unresolved=unresolved, end=end, total_duration_s=0, total_distance_m=0, matrix_source="haversine"
        )

    # Points : 0 = départ, 1..n = arrêts, n+1 = arrivée (si imposée).
    points = [request.start, *(r.location for r in resolved)]
    if end is not None:
        points.append(LatLng(lat=end.lat, lng=end.lng))
    matrix = await build_matrix(points, settings, client)
    t_matrix = time.perf_counter() - t0 - t_geocode

    cost = [[round(d) for d in row] for row in matrix.durations]
    end_index = len(points) - 1 if end is not None else None
    time_limit = time_limit_for(len(resolved), settings.solver_max_seconds)
    order = await anyio.to_thread.run_sync(solve_order, cost, end_index, time_limit)
    t_solve = time.perf_counter() - t0 - t_geocode - t_matrix

    stops_out: list[StopOut] = []
    total_duration = total_distance = 0.0
    previous = 0
    for node in order:
        r = resolved[node - 1]
        leg_duration, leg_distance = matrix.durations[previous][node], matrix.distances[previous][node]
        total_duration += leg_duration
        total_distance += leg_distance
        warning = r.warning
        distance_km = haversine_m(request.start, r.location) / 1000
        if warning is None and distance_km > settings.max_stop_distance_km:
            warning = f"À {round(distance_km)} km du départ : vérifie l'adresse."
        stops_out.append(
            StopOut(
                id=r.stop.id,
                location=r.location,
                label=r.label,
                precision=r.precision,
                warning=warning,
                leg_duration_s=round(leg_duration),
                leg_distance_m=round(leg_distance),
            )
        )
        previous = node
    if end_index is not None:
        total_duration += matrix.durations[previous][end_index]
        total_distance += matrix.distances[previous][end_index]

    log.info(
        "optimize: %d arrêts (%d introuvables) | géocodage %.1fs, matrice %s %.1fs, solveur %.1fs",
        len(resolved),
        len(unresolved),
        t_geocode,
        matrix.source,
        t_matrix,
        t_solve,
    )
    return OptimizeResponse(
        stops=stops_out,
        unresolved=unresolved,
        end=end,
        total_duration_s=round(total_duration),
        total_distance_m=round(total_distance),
        matrix_source=matrix.source,
    )
