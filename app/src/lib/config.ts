import Constants, { ExecutionEnvironment } from 'expo-constants';

const BACKEND_DEV_PORT = 8000;

/** true quand l'app tourne dans Expo Go (et non dans une build native). */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * URL du backend d'optimisation.
 *
 * 1. `EXPO_PUBLIC_API_URL` (fichier `app/.env.local`) si elle est définie.
 * 2. Sinon, en développement : même machine que le serveur Metro, port 8000.
 *    Ça permet de tester sur téléphone (même Wi-Fi) sans rien configurer.
 */
export function getApiUrl(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  if (__DEV__) {
    const host = Constants.expoConfig?.hostUri?.split(':')[0];
    if (host) return `http://${host}:${BACKEND_DEV_PORT}`;
  }
  return null;
}

export function getApiToken(): string | null {
  return process.env.EXPO_PUBLIC_API_TOKEN?.trim() || null;
}

/** Google Maps est utilisé sur iOS seulement dans une build native avec une clé configurée. */
export const useGoogleMapsOnIos = !isExpoGo && Constants.expoConfig?.extra?.googleMapsIos === true;
