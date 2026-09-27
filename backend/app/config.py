from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration lue dans les variables d'environnement (ou le fichier .env)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Jeton partagé avec l'app. Vide = pas d'authentification (pratique en local uniquement).
    api_token: str = ""

    # --- Géocodage -------------------------------------------------------------------------
    # Ordre des géocodeurs essayés : "photon", "nominatim", "google" (séparés par des virgules).
    geocoders: str = "photon,nominatim"
    photon_url: str = "https://photon.komoot.io"
    nominatim_url: str = "https://nominatim.openstreetmap.org"
    google_geocoding_api_key: str = ""
    # Zone de recherche (lon_min,lat_min,lon_max,lat_max). Par défaut : Belgique + marge.
    geocode_bbox: str = "2.3,49.3,6.6,51.7"
    geocode_country_codes: str = "be"
    # "default" = noms officiels locaux (bilingues à Bruxelles : "Rue Neuve - Nieuwstraat"),
    # indispensable pour reconnaître une rue saisie en français comme en néerlandais.
    geocode_language: str = "default"
    # Les services publics OSM demandent un User-Agent identifiable avec un contact.
    user_agent: str = "cekalivre/0.1 (+https://github.com/ImTheCloud/cekalivre)"
    geocode_cache_path: str = "data/geocode-cache.sqlite3"
    geocode_concurrency: int = 4

    # --- Temps de trajet -------------------------------------------------------------------
    # URL d'un serveur OSRM (ex. http://osrm:5000). Vide = estimation à vol d'oiseau.
    osrm_url: str = ""
    # Nombre max de points par requête /table (doit respecter --max-table-size du serveur).
    osrm_max_table_size: int = 100
    # Estimation sans OSRM : détour moyen des routes et vitesse moyenne en ville.
    fallback_detour_factor: float = 1.35
    fallback_speed_kmh: float = 30.0

    # --- Solveur ---------------------------------------------------------------------------
    solver_max_seconds: float = 8.0

    # Au-delà de cette distance du point de départ, une adresse est signalée comme suspecte.
    max_stop_distance_km: float = 80.0

    @property
    def geocoder_list(self) -> list[str]:
        return [g.strip().lower() for g in self.geocoders.split(",") if g.strip()]

    @property
    def bbox(self) -> tuple[float, float, float, float] | None:
        parts = [p.strip() for p in self.geocode_bbox.split(",") if p.strip()]
        if len(parts) != 4:
            return None
        lon_min, lat_min, lon_max, lat_max = (float(p) for p in parts)
        return lon_min, lat_min, lon_max, lat_max


@lru_cache
def get_settings() -> Settings:
    return Settings()
