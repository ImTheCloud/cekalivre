# Cékalivre — application mobile

Application Expo (SDK 57, React Native, TypeScript). Vue d'ensemble et démarrage : [README racine](../README.md).

## Lancer

```bash
npm install
npx expo start        # puis scanner le QR code avec Expo Go
```

## Configuration

Copie `.env.example` en `.env.local` si besoin. En développement, rien n'est obligatoire.

| Variable | Rôle |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | URL du backend. Vide en dev : `http://<IP du Mac>:8000` est utilisé automatiquement |
| `EXPO_PUBLIC_API_TOKEN` | Jeton partagé avec le backend (`API_TOKEN`) |
| `GOOGLE_MAPS_ANDROID_API_KEY` / `GOOGLE_MAPS_IOS_API_KEY` | Uniquement pour les builds natives (EAS). Inutiles dans Expo Go |

## Écrans (`src/app/`)

| Fichier | Écran |
| --- | --- |
| `(tabs)/index.tsx` | **Tournée** : compteur de progression, prochain arrêt, liste, Ajouter / Optimiser |
| `(tabs)/map.tsx` | **Carte** : repères numérotés dans l'ordre de passage |
| `(tabs)/settings.tsx` | **Réglages** : arrivée par défaut, test du serveur |
| `add.tsx` | Coller ou saisir des adresses (une par ligne) |
| `stop/[id].tsx` | Détail d'un arrêt : adresse, note, photo, naviguer, livré, dupliquer, supprimer |
| `end-point.tsx` | Point d'arrivée de la tournée du jour |

## Où est la logique ?

- `src/store/tour-store.ts` : tout l'état de la tournée (arrêts, ordre, livrés). Il est sauvegardé automatiquement sur le téléphone, donc rien n'est perdu quand on bascule vers Google Maps.
- `src/lib/optimize-tour.ts` : position GPS → appel `POST /optimize` → nouvel ordre. Les arrêts déjà livrés sont exclus, ce qui permet de ré-optimiser en cours de tournée.
- `src/lib/google-maps.ts` : liens de navigation Google Maps (1 arrêt, ou jusqu'à 10 d'affilée).
- `src/lib/photos.ts` : photos de colis, enregistrées dans le dossier privé de l'app.

## Limites connues (v0)

- **iOS dans Expo Go** : la carte utilise Apple Maps, car Expo Go n'embarque pas Google Maps sur iOS. Une build native avec `GOOGLE_MAPS_IOS_API_KEY` passe à Google Maps.
- **Navigation multi-arrêts** : Google Maps accepte au plus 9 étapes par lien. L'app en propose donc 10 d'affilée.
- **Données locales** : les données restent sur le téléphone. Désinstaller l'app efface la tournée en cours et ses photos.
