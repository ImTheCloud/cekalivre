# Cékalivre — backend d'optimisation

API FastAPI avec un seul endpoint métier, `POST /optimize`. Elle reçoit les adresses, le point de départ (GPS) et l'arrivée optionnelle, et renvoie les arrêts dans l'ordre de passage optimal.

## Lancer en local

```bash
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
uv run pytest
```

Documentation interactive : http://localhost:8000/docs

## Fonctionnement

1. **Géocodage** ([app/geocoding.py](app/geocoding.py)). Chaque adresse passe par Photon, puis Nominatim si besoin (tous deux basés sur OpenStreetMap), avec Google en option. Le meilleur candidat est choisi selon :
   1. la ressemblance du **nom de rue** (fautes de frappe et noms bilingues FR/NL tolérés) ;
   2. la **précision** (maison > rue > commune) ;
   3. le **code postal** saisi.

   En cas de doute, un `warning` lisible est renvoyé à l'app : rue différente, code postal différent, adresse à plus de 80 km du départ. Les résultats sont mis en cache 90 jours dans SQLite.
2. **Matrice** ([app/matrix.py](app/matrix.py)). Temps de trajet réels entre toutes les paires de points via OSRM `/table`, découpée en blocs si nécessaire. Sans OSRM, c'est une estimation à vol d'oiseau × 1,35 à 30 km/h.
3. **Solveur** ([app/solver.py](app/solver.py)). OR-Tools (voyageur de commerce, recherche locale guidée) minimise le temps total. Sans arrivée imposée, la tournée se termine au dernier arrêt.

Adresses identiques (plusieurs colis) : même position, donc arrêts consécutifs dans l'ordre optimisé.

## Contrat de l'API

```jsonc
// POST /optimize   (en-tête Authorization: Bearer <API_TOKEN> si configuré)
{
  "start": { "lat": 50.8357, "lng": 4.3363 },
  "end": { "address": "Rue du Dépôt 1, 1070 Anderlecht" },   // ou {lat,lng} ou null
  "stops": [
    { "id": "a1", "address": "Rue Neuve 111, 1000 Bruxelles", "location": null },
    { "id": "a2", "address": "…", "location": { "lat": 50.85, "lng": 4.35 } }  // déjà géocodé
  ]
}
// Réponse 200
{
  "stops": [   // dans l'ordre optimal
    { "id": "a1", "location": {…}, "label": "Rue Neuve - Nieuwstraat 111, 1000 Bruxelles - Brussel",
      "precision": "exact", "warning": null, "legDurationS": 312, "legDistanceM": 1850 }
  ],
  "unresolved": [ { "id": "…", "address": "…", "reason": "Adresse introuvable" } ],
  "end": { "lat": …, "lng": …, "label": "…" },
  "totalDurationS": 4170, "totalDistanceM": 27343,
  "matrixSource": "osrm"          // ou "haversine" (estimation)
}
```

Erreurs : `401` pour un jeton invalide, `422` pour une adresse d'arrivée introuvable ou une requête invalide (`detail` contient le message à afficher).

## Configuration (variables d'environnement ou `.env`)

Voir [.env.example](.env.example) et [app/config.py](app/config.py).

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `API_TOKEN` | *(vide)* | Jeton exigé par `/optimize`. Vide = API ouverte (local uniquement) |
| `OSRM_URL` | *(vide)* | Serveur OSRM. Vide = estimation à vol d'oiseau |
| `OSRM_MAX_TABLE_SIZE` | `100` | Points max par requête `/table` (1000 avec le docker-compose) |
| `GEOCODERS` | `photon,nominatim` | Ordre des géocodeurs (`google` possible avec `GOOGLE_GEOCODING_API_KEY`) |
| `GEOCODE_BBOX` / `GEOCODE_COUNTRY_CODES` | Belgique | Zone de recherche |
| `SOLVER_MAX_SECONDS` | `8` | Temps max du solveur (100 arrêts ≈ 8 s) |
| `MAX_STOP_DISTANCE_KM` | `80` | Au-delà, l'adresse est signalée comme suspecte |

## Services publics OpenStreetMap

Photon (photon.komoot.io) et Nominatim (nominatim.openstreetmap.org) sont gratuits, avec des conditions d'usage raisonnable. Nominatim impose au plus 1 requête par seconde, ce que le code respecte. Le cache limite fortement le nombre d'appels : les adresses d'une tournée reviennent souvent d'un jour à l'autre. Avec beaucoup d'utilisateurs, il faudra auto-héberger Photon.
