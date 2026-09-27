"""API Cékalivre : POST /optimize (ordre de passage) et GET /autocomplete (suggestions d'adresses)."""

from __future__ import annotations

import logging
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request

from app.autocomplete import AutocompleteUnavailable, suggest_addresses
from app.config import Settings, get_settings
from app.geocoding import GeocodingService, build_geocoding_service
from app.models import AutocompleteResponse, HealthResponse, LatLng, OptimizeRequest, OptimizeResponse
from app.optimize import OptimizeError, optimize

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0), headers={"User-Agent": settings.user_agent}) as client:
        app.state.http = client
        app.state.geocoder = build_geocoding_service(client, settings)
        if not settings.api_token:
            logging.warning("API_TOKEN vide : l'API est ouverte à tous (acceptable en local uniquement).")
        yield


app = FastAPI(title="Cékalivre API", version="0.1.0", lifespan=lifespan)

SettingsDep = Annotated[Settings, Depends(get_settings)]


def require_token(settings: SettingsDep, authorization: Annotated[str | None, Header()] = None) -> None:
    if not settings.api_token:
        return
    expected = f"Bearer {settings.api_token}"
    if not authorization or not secrets.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Jeton API invalide.")


def get_geocoder(request: Request) -> GeocodingService:
    return request.app.state.geocoder


def get_http(request: Request) -> httpx.AsyncClient:
    return request.app.state.http


@app.get("/health", response_model=HealthResponse)
def health(settings: SettingsDep, geocoder: Annotated[GeocodingService, Depends(get_geocoder)]) -> HealthResponse:
    return HealthResponse(
        status="ok",
        matrix_source="osrm" if settings.osrm_url else "haversine",
        geocoders=geocoder.provider_names,
    )


@app.post("/optimize", response_model=OptimizeResponse, dependencies=[Depends(require_token)])
async def optimize_route(
    body: OptimizeRequest,
    settings: SettingsDep,
    geocoder: Annotated[GeocodingService, Depends(get_geocoder)],
    client: Annotated[httpx.AsyncClient, Depends(get_http)],
) -> OptimizeResponse:
    try:
        return await optimize(body, settings, geocoder, client)
    except OptimizeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/autocomplete", response_model=AutocompleteResponse, dependencies=[Depends(require_token)])
async def autocomplete(
    settings: SettingsDep,
    client: Annotated[httpx.AsyncClient, Depends(get_http)],
    q: Annotated[str, Query(max_length=200)],
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
) -> AutocompleteResponse:
    bias = LatLng(lat=lat, lng=lng) if lat is not None and lng is not None else None
    try:
        suggestions = await suggest_addresses(q, bias, settings, client)
    except AutocompleteUnavailable as exc:
        raise HTTPException(status_code=503, detail="Suggestions d'adresses indisponibles pour le moment.") from exc
    return AutocompleteResponse(suggestions=suggestions)
