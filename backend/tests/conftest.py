import os

# Avant tout import de l'app : pas de fichier de cache ni de jeton hérité de l'environnement local.
os.environ["GEOCODE_CACHE_PATH"] = ":memory:"
os.environ["API_TOKEN"] = ""
os.environ["OSRM_URL"] = ""
