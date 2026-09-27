"""Suggestions d'adresses pendant la saisie (comme la barre de recherche de Google Maps).

Photon (OpenStreetMap) fournit les candidats ; on les reclasse ici car son classement favorise
les lieux "connus" plutôt que les adresses proches du chauffeur :
1. correspondance avec ce qui est tapé (mots partiels acceptés : "nieuwstr" -> "Nieuwstraat") ;
2. nom de rue le plus proche de la saisie ("Rue Neuve" avant "Rue Terre-Neuve") ;
3. distance au chauffeur.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import httpx

from app.config import Settings
from app.geocoding import _significant_words, _words_match
from app.matrix import haversine_m
from app.models import LatLng, Precision, Suggestion

PHOTON_CANDIDATES = 15
MIN_QUERY_LENGTH = 3

# Numéro de maison tapé : "11", "11A", "11-13" (les nombres à 4 chiffres sont des codes postaux belges).
_HOUSE_NUMBER = re.compile(r"^\d{1,3}[a-zA-Z]?(?:-\d{1,3})?$")
_BILINGUAL_SEPARATOR = re.compile(r"\s+-\s+")


class AutocompleteUnavailable(Exception):
    pass


def typed_house_number(query: str) -> str | None:
    for token in re.split(r"[\s,]+", query):
        if _HOUSE_NUMBER.match(token):
            return token.upper()
    return None


def _word_matches(query_word: str, words: set[str]) -> bool:
    # Préfixe accepté : le dernier mot est souvent en cours de frappe ("rue neu").
    return any(w.startswith(query_word) or _words_match(query_word, w) for w in words)


def _pick_variant(text: str | None, query_words: set[str]) -> tuple[str | None, int]:
    """"Rue Neuve - Nieuwstraat" -> la variante (et son index) qui correspond le mieux à la saisie."""
    if not text:
        return None, 0
    variants = _BILINGUAL_SEPARATOR.split(text)
    best_index, best_hits = 0, -1
    for index, variant in enumerate(variants):
        hits = sum(1 for q in query_words if _word_matches(q, _significant_words(variant)))
        if hits > best_hits:
            best_index, best_hits = index, hits
    return variants[best_index], best_index


def _variant_at(text: str | None, index: int) -> str | None:
    if not text:
        return None
    variants = _BILINGUAL_SEPARATOR.split(text)
    return variants[index] if index < len(variants) else variants[0]


@dataclass
class _Ranked:
    suggestion: Suggestion
    coverage: float  # part des mots tapés retrouvés
    street_fit: float  # part des mots de la rue trouvée présents dans la saisie
    distance_m: float


def _to_ranked(feature: dict, query: str, bias: LatLng | None, countries: set[str]) -> _Ranked | None:
    props = feature.get("properties", {})
    if countries and str(props.get("countrycode", "")).upper() not in countries:
        return None
    kind = props.get("type")
    street_raw = props.get("street") or (props.get("name") if kind == "street" else None)
    if not street_raw:
        return None  # communes, régions… : inutiles comme arrêt de livraison

    query_words = _significant_words(query)
    street, variant_index = _pick_variant(street_raw, query_words)
    city = _variant_at(props.get("city") or props.get("district"), variant_index)
    postcode = props.get("postcode")
    number = props.get("housenumber")
    precision: Precision = "exact" if number else "street"

    # Commerce / bureau avec un nom ("Broodhuys Edelweiss", Kerkstraat 12) : le nom sert de titre.
    poi_name = props.get("name") if kind == "house" and props.get("osm_key") not in ("building", "place") else None
    if poi_name:
        poi_name, _ = _pick_variant(poi_name, query_words)
        if _significant_words(poi_name) == _significant_words(street or ""):
            poi_name = None  # "Place Eugène Flagey" comme lieu nommé = doublon de la rue

    # Numéro tapé mais absent d'OpenStreetMap : on le garde, position = la rue.
    typed_number = typed_house_number(query)
    if not number and typed_number:
        if kind != "street":
            return None  # un lieu sans numéro ("Arts-Loi") n'est pas l'adresse cherchée
        number = typed_number

    street_line = " ".join(p for p in (street, number) if p)
    city_line = " ".join(p for p in (postcode, city) if p)
    title = poi_name or street_line
    subtitle = ", ".join(p for p in ((street_line if poi_name else None), city_line) if p)
    address = ", ".join(p for p in (poi_name, street_line, city_line) if p)

    lng, lat = feature["geometry"]["coordinates"][:2]
    location = LatLng(lat=lat, lng=lng)

    candidate_words = _significant_words(" ".join(p for p in (poi_name, street, city) if p))
    street_words = _significant_words(street or "")
    coverage = (
        sum(1 for q in query_words if _word_matches(q, candidate_words)) / len(query_words) if query_words else 1.0
    )
    street_fit = (
        sum(1 for s in street_words if any(_word_matches(q, {s}) for q in query_words)) / len(street_words)
        if street_words
        else 0.0
    )
    return _Ranked(
        suggestion=Suggestion(
            address=address, title=title, subtitle=subtitle, location=location, precision=precision
        ),
        coverage=coverage,
        street_fit=street_fit,
        distance_m=haversine_m(bias, location) if bias else 0.0,
    )


def rank_suggestions(features: list[dict], query: str, bias: LatLng | None, countries: set[str], limit: int) -> list[Suggestion]:
    ranked = [r for r in (_to_ranked(f, query, bias, countries) for f in features) if r is not None]
    ranked.sort(key=lambda r: (-round(r.coverage, 2), -round(r.street_fit, 2), r.distance_m))
    seen: set[str] = set()
    result: list[Suggestion] = []
    for r in ranked:
        key = r.suggestion.address.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(r.suggestion)
        if len(result) >= limit:
            break
    return result


async def suggest_addresses(
    query: str, bias: LatLng | None, settings: Settings, client: httpx.AsyncClient, limit: int = 6
) -> list[Suggestion]:
    query = query.strip()
    if len(query) < MIN_QUERY_LENGTH:
        return []
    params: dict[str, str | int | float] = {"q": query, "limit": PHOTON_CANDIDATES, "lang": settings.geocode_language}
    if settings.bbox:
        params["bbox"] = ",".join(str(v) for v in settings.bbox)
    if bias:
        params["lat"], params["lon"] = bias.lat, bias.lng
    try:
        response = await client.get(f"{settings.photon_url.rstrip('/')}/api/", params=params, timeout=8.0)
        response.raise_for_status()
        features = response.json().get("features", [])
    except (httpx.HTTPError, ValueError) as exc:
        raise AutocompleteUnavailable(str(exc)) from exc
    countries = {c.strip().upper() for c in settings.geocode_country_codes.split(",") if c.strip()}
    return rank_suggestions(features, query, bias, countries, limit)
