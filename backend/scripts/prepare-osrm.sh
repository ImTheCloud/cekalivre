#!/usr/bin/env bash
# Télécharge la carte OpenStreetMap et prépare les données de routage OSRM (profil voiture).
# Belgique : ~650 Mo à télécharger, ~10-20 min de calcul, ~6 Go de RAM nécessaires pendant la préparation.
#
# Usage : ./scripts/prepare-osrm.sh                      (Belgique)
#         REGION_URL=https://download.geofabrik.de/europe/luxembourg-latest.osm.pbf ./scripts/prepare-osrm.sh
set -euo pipefail

cd "$(dirname "$0")/.."

REGION_URL="${REGION_URL:-https://download.geofabrik.de/europe/belgium-latest.osm.pbf}"
IMAGE="ghcr.io/project-osrm/osrm-backend:v6.0.0"
DATA_DIR="$PWD/osrm-data"

mkdir -p "$DATA_DIR"
echo "==> Téléchargement de $REGION_URL"
curl -fL --retry 3 -o "$DATA_DIR/region.osm.pbf" "$REGION_URL"

echo "==> Extraction (profil voiture)"
docker run --rm -t -v "$DATA_DIR:/data" "$IMAGE" osrm-extract -p /opt/car.lua /data/region.osm.pbf

echo "==> Partition + personnalisation (algorithme MLD)"
docker run --rm -t -v "$DATA_DIR:/data" "$IMAGE" osrm-partition /data/region.osrm
docker run --rm -t -v "$DATA_DIR:/data" "$IMAGE" osrm-customize /data/region.osrm

echo "==> Terminé. Lance ou redémarre : docker compose up -d"
