"""Géocodage : adresse texte -> coordonnées GPS.

Plusieurs fournisseurs sont essayés dans l'ordre (Photon, Nominatim, Google en option).
Les résultats sont mis en cache dans SQLite : une adresse déjà vue n'est plus jamais redemandée.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import sqlite3
import time
import unicodedata
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Protocol

import httpx

from app.config import Settings
from app.models import LatLng, Precision

log = logging.getLogger(__name__)

PRECISION_RANK: dict[str, int] = {"exact": 3, "street": 2, "approximate": 1}
CACHE_TTL_S = 90 * 24 * 3600


@dataclass(frozen=True)
class Candidate:
    lat: float
    lng: float
    label: str
    precision: Precision
    postcode: str | None
    street: str | None = None


@dataclass(frozen=True)
class GeocodeResult:
    lat: float
    lng: float
    label: str
    precision: Precision
    warning: str | None
    provider: str


class GeocodingUnavailable(Exception):
    """Tous les fournisseurs ont échoué pour une raison technique (réseau, quota…)."""


class Provider(Protocol):
    name: str

    async def search(self, query: str, bias: LatLng | None) -> list[Candidate]: ...


# --- Outils -----------------------------------------------------------------------------------

_POSTCODE_BEFORE_CITY = re.compile(r"\b([1-9]\d{3})\s+[^\d\s,]")
_ANY_POSTCODE = re.compile(r"\b([1-9]\d{3})\b")


def extract_postcode(address: str) -> str | None:
    """Code postal belge (4 chiffres) de l'adresse saisie, de préférence celui suivi d'une commune."""
    matches = _POSTCODE_BEFORE_CITY.findall(address)
    if matches:
        return matches[-1]
    # "Place Flagey, Ixelles 1050" : code postal dans le dernier segment après une virgule.
    # (Sans virgule, "Chaussée de Waterloo 1151" est un numéro de maison, pas un code postal.)
    segments = address.split(",")
    if len(segments) > 1:
        matches = _ANY_POSTCODE.findall(segments[-1])
        if matches:
            return matches[-1]
    return None


def normalize_address(address: str) -> str:
    text = unicodedata.normalize("NFKC", address).lower()
    text = re.sub(r"[\s,;]+", " ", text)
    return text.strip(" .")


def _join(*parts: str | None, sep: str = " ") -> str:
    return sep.join(p for p in parts if p)


# Mots trop génériques pour comparer deux noms de rue (FR + NL).
_GENERIC_WORDS = {
    "rue", "avenue", "av", "boulevard", "bd", "chaussee", "place", "square", "quai", "allee", "impasse",
    "chemin", "route", "dreve", "clos", "cour", "galerie", "passage", "rond", "point", "sentier", "parvis",
    "esplanade", "straat", "laan", "steenweg", "plein", "dreef", "lei", "kaai", "weg", "baan", "pad", "hof",
    "markt", "les", "des", "une", "van", "der", "den", "het",
}  # fmt: skip
_STREET_SIMILARITY = 0.8


def _significant_words(text: str) -> set[str]:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return {w for w in re.split(r"[^a-z]+", ascii_text) if len(w) >= 3 and w not in _GENERIC_WORDS}


def _words_match(a: str, b: str) -> bool:
    return a == b or SequenceMatcher(None, a, b).ratio() >= _STREET_SIMILARITY


def street_score(address: str, street: str | None) -> float:
    """Ressemblance (0 à 1) entre la rue saisie et la rue trouvée.

    Tolère les fautes de frappe, les accents et le bilinguisme bruxellois ("Rue Neuve - Nieuwstraat" :
    chaque langue est comparée séparément). "Rue Neuve" vs "Rue Terre-Neuve" donne 0,67 et non 1.
    """
    if not street:
        return 1.0  # résultat au niveau commune : rien à comparer
    # Partie "rue" de la saisie = avant la première virgule (sinon toute l'adresse).
    wanted = _significant_words(address.split(",")[0]) or _significant_words(address)
    best = 0.0
    for variant in re.split(r"\s+-\s+", street):
        found = _significant_words(variant)
        if not found:
            continue
        matched = sum(1 for f in found if any(_words_match(f, w) for w in wanted))
        best = max(best, 2 * matched / (len(found) + len(wanted)) if wanted else 0.0)
    return best


def street_matches(address: str, street: str | None) -> bool:
    return street_score(address, street) >= 0.5


def choose_candidate(candidates: list[Candidate], address: str) -> tuple[Candidate, str | None] | None:
    """Choisit le candidat le plus plausible et renvoie un avertissement s'il reste un doute.

    Priorités : bon nom de rue > position précise > bon code postal > ordre du géocodeur.
    """
    if not candidates:
        return None
    wanted_postcode = extract_postcode(address)

    def rank(item: tuple[int, Candidate]) -> tuple[float, bool, bool, int]:
        index, c = item
        return (
            round(street_score(address, c.street), 2),
            c.precision != "approximate",
            wanted_postcode is None or c.postcode == wanted_postcode,
            -index,
        )

    best = max(enumerate(candidates), key=rank)[1]
    if not street_matches(address, best.street):
        return best, f"Rue différente trouvée (« {best.street} ») : vérifie l'adresse."
    if wanted_postcode and best.postcode and best.postcode != wanted_postcode:
        return best, f"Code postal différent ({best.postcode} au lieu de {wanted_postcode}) : vérifie l'adresse."
    return best, None


# --- Fournisseurs -----------------------------------------------------------------------------


class PhotonProvider:
    """Photon (komoot) : géocodeur gratuit basé sur OpenStreetMap, tolérant aux fautes de frappe."""

    name = "photon"

    def __init__(self, client: httpx.AsyncClient, settings: Settings):
        self._client = client
        self._settings = settings
        self._countries = {c.strip().upper() for c in settings.geocode_country_codes.split(",") if c.strip()}

    async def search(self, query: str, bias: LatLng | None) -> list[Candidate]:
        params: dict[str, str | int | float] = {"q": query, "limit": 5, "lang": self._settings.geocode_language}
        bbox = self._settings.bbox
        if bbox:
            params["bbox"] = ",".join(str(v) for v in bbox)
        if bias:
            params["lat"], params["lon"] = bias.lat, bias.lng
        response = await self._client.get(f"{self._settings.photon_url.rstrip('/')}/api/", params=params)
        response.raise_for_status()
        candidates = []
        for feature in response.json().get("features", []):
            props = feature.get("properties", {})
            if self._countries and str(props.get("countrycode", "")).upper() not in self._countries:
                continue
            lng, lat = feature["geometry"]["coordinates"][:2]
            has_number = bool(props.get("housenumber"))
            kind = props.get("type")
            precision: Precision = "exact" if has_number else "street" if kind == "street" else "approximate"
            street = props.get("street") or (props.get("name") if kind == "street" else None)
            label = _join(
                _join(street, props.get("housenumber")),
                _join(props.get("postcode"), props.get("city") or props.get("name")),
                sep=", ",
            )
            candidates.append(
                Candidate(
                    lat=lat,
                    lng=lng,
                    label=label or query,
                    precision=precision,
                    postcode=props.get("postcode"),
                    street=street,
                )
            )
        return candidates


class NominatimProvider:
    """Nominatim (OSM) : plus strict que Photon. Politique d'usage : 1 requête par seconde maximum."""

    name = "nominatim"
    MIN_INTERVAL_S = 1.1

    def __init__(self, client: httpx.AsyncClient, settings: Settings):
        self._client = client
        self._settings = settings
        self._lock = asyncio.Lock()
        self._last_call = 0.0

    async def search(self, query: str, bias: LatLng | None) -> list[Candidate]:
        params: dict[str, str | int] = {
            "q": query,
            "format": "jsonv2",
            "addressdetails": 1,
            "limit": 5,
        }
        if self._settings.geocode_language != "default":
            params["accept-language"] = self._settings.geocode_language
        if self._settings.geocode_country_codes:
            params["countrycodes"] = self._settings.geocode_country_codes
        bbox = self._settings.bbox
        if bbox:
            params["viewbox"] = ",".join(str(v) for v in bbox)
            params["bounded"] = 1

        async with self._lock:
            wait = self._last_call + self.MIN_INTERVAL_S - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            try:
                response = await self._client.get(
                    f"{self._settings.nominatim_url.rstrip('/')}/search", params=params
                )
            finally:
                self._last_call = time.monotonic()
        response.raise_for_status()

        candidates = []
        for item in response.json():
            address = item.get("address", {})
            number = address.get("house_number")
            road = address.get("road") or address.get("pedestrian")
            city = address.get("city") or address.get("town") or address.get("village") or address.get("municipality")
            precision: Precision = "exact" if number else "street" if road else "approximate"
            label = _join(_join(road, number), _join(address.get("postcode"), city), sep=", ")
            candidates.append(
                Candidate(
                    lat=float(item["lat"]),
                    lng=float(item["lon"]),
                    label=label or item.get("display_name", query),
                    precision=precision,
                    postcode=address.get("postcode"),
                    street=road,
                )
            )
        return candidates


class GoogleProvider:
    """Google Geocoding API (optionnel, payant au-delà du quota gratuit) : filet de sécurité."""

    name = "google"
    URL = "https://maps.googleapis.com/maps/api/geocode/json"
    PRECISIONS: dict[str, Precision] = {
        "ROOFTOP": "exact",
        "RANGE_INTERPOLATED": "exact",
        "GEOMETRIC_CENTER": "street",
        "APPROXIMATE": "approximate",
    }

    def __init__(self, client: httpx.AsyncClient, settings: Settings):
        self._client = client
        self._settings = settings

    async def search(self, query: str, bias: LatLng | None) -> list[Candidate]:
        params = {"address": query, "key": self._settings.google_geocoding_api_key, "language": "fr"}
        if self._settings.geocode_country_codes:
            codes = self._settings.geocode_country_codes.split(",")
            params["components"] = "|".join(f"country:{c.strip().upper()}" for c in codes)
        response = await self._client.get(self.URL, params=params)
        response.raise_for_status()
        body = response.json()
        if body.get("status") not in ("OK", "ZERO_RESULTS"):
            raise httpx.HTTPError(f"Google Geocoding: {body.get('status')} {body.get('error_message', '')}")

        candidates = []
        for item in body.get("results", []):
            location = item["geometry"]["location"]
            postcode = next(
                (c["short_name"] for c in item.get("address_components", []) if "postal_code" in c.get("types", [])),
                None,
            )
            street = next(
                (c["long_name"] for c in item.get("address_components", []) if "route" in c.get("types", [])),
                None,
            )
            candidates.append(
                Candidate(
                    lat=location["lat"],
                    lng=location["lng"],
                    label=item.get("formatted_address", query),
                    precision=self.PRECISIONS.get(item["geometry"].get("location_type", ""), "approximate"),
                    postcode=postcode,
                    street=street,
                )
            )
        return candidates


# --- Cache ------------------------------------------------------------------------------------


class GeocodeCache:
    def __init__(self, path: str):
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS geocode (key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at REAL NOT NULL)"
        )
        self._db.commit()

    def get(self, key: str) -> GeocodeResult | None:
        row = self._db.execute("SELECT value, created_at FROM geocode WHERE key = ?", (key,)).fetchone()
        if not row or time.time() - row[1] > CACHE_TTL_S:
            return None
        return GeocodeResult(**json.loads(row[0]))

    def set(self, key: str, result: GeocodeResult) -> None:
        self._db.execute(
            "INSERT OR REPLACE INTO geocode (key, value, created_at) VALUES (?, ?, ?)",
            (key, json.dumps(asdict(result)), time.time()),
        )
        self._db.commit()

    def close(self) -> None:
        self._db.close()


# --- Service ----------------------------------------------------------------------------------


class GeocodingService:
    def __init__(self, providers: list[Provider], cache: GeocodeCache, concurrency: int = 4, cache_scope: str = ""):
        self._providers = providers
        self._cache = cache
        self._semaphore = asyncio.Semaphore(max(1, concurrency))
        self._cache_scope = cache_scope

    @property
    def provider_names(self) -> list[str]:
        return [p.name for p in self._providers]

    async def geocode(self, address: str, bias: LatLng | None = None) -> GeocodeResult | None:
        """Renvoie None si l'adresse est introuvable ; lève GeocodingUnavailable si aucun service ne répond."""
        key = f"{self._cache_scope}|{normalize_address(address)}"
        cached = self._cache.get(key)
        if cached:
            return cached

        best: GeocodeResult | None = None
        failures = 0

        for provider in self._providers:
            try:
                async with self._semaphore:
                    candidates = await provider.search(address, bias)
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                failures += 1
                log.warning("Géocodeur %s en échec pour %r : %s", provider.name, address, exc)
                continue

            choice = choose_candidate(candidates, address)
            if not choice:
                continue
            candidate, warning = choice
            result = GeocodeResult(
                lat=candidate.lat,
                lng=candidate.lng,
                label=candidate.label,
                precision=candidate.precision,
                warning=warning,
                provider=provider.name,
            )
            if best is None or _score(result) > _score(best):
                best = result
            if result.precision != "approximate" and not result.warning:
                break  # résultat fiable : inutile d'interroger les fournisseurs suivants (plus lents)

        if best is None and failures == len(self._providers):
            raise GeocodingUnavailable("Aucun service de géocodage n'a répondu.")
        if best is not None:
            self._cache.set(key, best)
        return best


def _score(result: GeocodeResult) -> int:
    return PRECISION_RANK[result.precision] * 2 + (0 if result.warning else 1)


def build_geocoding_service(client: httpx.AsyncClient, settings: Settings) -> GeocodingService:
    factories = {"photon": PhotonProvider, "nominatim": NominatimProvider, "google": GoogleProvider}
    providers: list[Provider] = []
    for name in settings.geocoder_list:
        if name not in factories:
            raise ValueError(f"Géocodeur inconnu : {name!r} (choix : {', '.join(factories)})")
        if name == "google" and not settings.google_geocoding_api_key:
            log.warning("Géocodeur google ignoré : GOOGLE_GEOCODING_API_KEY est vide.")
            continue
        providers.append(factories[name](client, settings))
    if not providers:
        raise ValueError("Aucun géocodeur configuré (variable GEOCODERS).")
    scope = f"{settings.geocode_country_codes}|{settings.geocode_bbox}"
    return GeocodingService(providers, GeocodeCache(settings.geocode_cache_path), settings.geocode_concurrency, scope)
