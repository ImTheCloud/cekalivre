"""Contrat JSON de l'API (en camelCase, comme côté app : voir app/src/lib/api.ts)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class LatLng(ApiModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class AddressPoint(ApiModel):
    address: str = Field(min_length=3, max_length=300)


class StopIn(ApiModel):
    id: str = Field(min_length=1, max_length=100)
    address: str = Field(min_length=1, max_length=300)
    # Coordonnées déjà connues (géocodage précédent) : on ne re-géocode pas.
    location: LatLng | None = None


class OptimizeRequest(ApiModel):
    start: LatLng
    end: LatLng | AddressPoint | None = None
    stops: list[StopIn] = Field(min_length=1, max_length=300)


Precision = Literal["exact", "street", "approximate"]


class StopOut(ApiModel):
    id: str
    location: LatLng
    # Adresse reconnue par le géocodeur (null si les coordonnées venaient de l'app).
    label: str | None = None
    precision: Precision | None = None
    # Message à montrer au chauffeur si l'adresse semble douteuse (code postal différent, trop loin…).
    warning: str | None = None
    leg_duration_s: float
    leg_distance_m: float


class UnresolvedStop(ApiModel):
    id: str
    address: str
    reason: str


class EndOut(LatLng):
    label: str


class OptimizeResponse(ApiModel):
    stops: list[StopOut]
    unresolved: list[UnresolvedStop]
    end: EndOut | None
    total_duration_s: float
    total_distance_m: float
    matrix_source: Literal["osrm", "haversine"]


class HealthResponse(ApiModel):
    status: Literal["ok"]
    matrix_source: Literal["osrm", "haversine"]
    geocoders: list[str]
