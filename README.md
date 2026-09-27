# Cékalivre

Application mobile d'optimisation de tournée pour chauffeurs-livreurs (MVP v0).
Le chauffeur colle ses ~100 adresses du jour. L'app calcule l'ordre de passage optimal depuis sa position GPS, l'affiche en liste et sur une carte numérotée, puis ouvre Google Maps pour la navigation, arrêt par arrêt.

Cahier des charges : [SPEC.md](SPEC.md)

## Architecture

```
┌──────────────────────────┐   POST /optimize    ┌──────────────────────────────────────────┐
│  app/ (Expo, téléphone)  │ ──────────────────▶ │  backend/ (FastAPI, Python)              │
│  - saisie des adresses   │  adresses + GPS     │  1. géocodage  (Photon / Nominatim, OSM) │
│  - notes + photos colis  │ ◀────────────────── │  2. matrice des temps de trajet (OSRM)   │
│  - liste + carte         │  ordre optimisé     │  3. ordre optimal (Google OR-Tools)      │
│  - lien Google Maps      │                     └──────────────────────────────────────────┘
└──────────────────────────┘
```

| Partie | Techno | Pourquoi |
| --- | --- | --- |
| App mobile | Expo SDK 57 (React Native, TypeScript), Expo Router, zustand | Test immédiat sur téléphone avec Expo Go, sans passer par les stores |
| Carte | `react-native-maps` (Google Maps sur Android) | Affichage des repères gratuit et illimité sur mobile natif |
| Navigation | Lien direct vers l'app Google Maps | Gratuit, contrairement au Navigation SDK |
| Photos de colis | Stockées sur le téléphone | Gratuit, instantané, marche sans réseau pendant la tournée |
| Géocodage | Photon puis Nominatim (OpenStreetMap), cache SQLite | Gratuit ; les adresses belges d'OSM viennent des registres officiels |
| Temps de trajet | OSRM auto-hébergé | Coût marginal nul par optimisation (cf. SPEC) |
| Optimisation | Google OR-Tools | Solveur gratuit, gère 100+ arrêts en quelques secondes |

## Démarrage rapide (développement)

Prérequis : Node.js 20+, [uv](https://docs.astral.sh/uv/) pour Python, et l'app **Expo Go** sur ton téléphone. Le téléphone et le Mac doivent être sur le même Wi-Fi.

**1. Backend** (terminal 1)

```bash
cd backend
uv sync                       # installe Python 3.12 et les dépendances
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Sans OSRM, le backend estime les trajets à vol d'oiseau : pratique pour développer l'app.
Pour de vrais temps de trajet pendant les tests, lance plutôt :
`OSRM_URL=https://router.project-osrm.org uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`.
C'est le serveur de démo public, à réserver à quelques tests.

**2. App** (terminal 2)

```bash
cd app
npm install
npx expo start
```

Scanne le QR code avec Expo Go (Android) ou avec l'appareil photo (iPhone).
En développement, l'app trouve toute seule le backend à `http://<IP du Mac>:8000` : aucune configuration n'est nécessaire.

**3. Vérifier**

Dans l'app, onglet **Réglages** → « Tester la connexion ».

## Tests

```bash
cd backend && uv run pytest          # 51 tests : solveur, géocodage, matrice OSRM, API
cd app && npm test && npx tsc --noEmit && npx expo lint   # 21 tests : store, optimisation, liens Google Maps
```

La CI GitHub ([.github/workflows/ci.yml](.github/workflows/ci.yml)) lance les deux à chaque push.

## Mise en production (gratuite)

Voir [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) : serveur Oracle Cloud « Always Free », OSRM Belgique, HTTPS automatique, puis build de l'app avec EAS.

## Structure

```
app/                  Application mobile Expo
  src/app/            Écrans (Expo Router : 1 fichier = 1 écran)
  src/components/     Composants d'interface
  src/lib/            API, GPS, photos, liens Google Maps, logique d'optimisation
  src/store/          État de la tournée et réglages (sauvegardés sur le téléphone)
backend/              API d'optimisation (FastAPI)
  app/                geocoding.py, matrix.py, solver.py, optimize.py, main.py
  tests/              Tests pytest (sans réseau)
  docker-compose.yml  API + OSRM + Caddy (HTTPS) pour le serveur
docs/                 Guides
```
