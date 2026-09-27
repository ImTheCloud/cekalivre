import * as Location from 'expo-location';
import { Platform } from 'react-native';

import type { LatLng } from '@/types';

const GPS_TIMEOUT_MS = 15_000;
// Une position de moins de 2 minutes est assez fraîche pour servir de point de départ.
const RECENT_POSITION_MAX_AGE_MS = 2 * 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const toLatLng = (position: Location.LocationObject): LatLng => ({
  lat: position.coords.latitude,
  lng: position.coords.longitude,
});

async function ensureLocationServicesEnabled(): Promise<void> {
  if (await Location.hasServicesEnabledAsync()) return;
  if (Platform.OS === 'android') {
    try {
      // Affiche la fenêtre système "Activer la localisation ?".
      await Location.enableNetworkProviderAsync();
      return;
    } catch {
      // refusé par l'utilisateur : message ci-dessous
    }
  }
  throw new Error('La localisation du téléphone est désactivée. Active-la pour utiliser ta position comme départ.');
}

/**
 * Position approximative, sans bloquer ni afficher d'erreur : sert à centrer la carte
 * et à proposer d'abord les adresses proches. Renvoie null si indisponible.
 */
export async function getApproxPosition(): Promise<LatLng | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return null;
    const last = await Location.getLastKnownPositionAsync();
    if (last) return toLatLng(last);
    const current = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      GPS_TIMEOUT_MS,
    );
    return toLatLng(current);
  } catch {
    return null;
  }
}

/** Position GPS actuelle du téléphone = point de départ de la tournée. */
export async function getCurrentPosition(): Promise<LatLng> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error(
      "L'accès à la localisation est refusé. Autorise-le dans les réglages du téléphone pour utiliser ta position comme point de départ.",
    );
  }
  await ensureLocationServicesEnabled();

  const recent = await Location.getLastKnownPositionAsync({ maxAge: RECENT_POSITION_MAX_AGE_MS });
  if (recent) return toLatLng(recent);

  try {
    const position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      GPS_TIMEOUT_MS,
    );
    return toLatLng(position);
  } catch (error) {
    console.warn('[location] position actuelle indisponible :', error);
    // GPS lent (intérieur, parking souterrain…) : on se rabat sur la dernière position connue.
    const last = await Location.getLastKnownPositionAsync();
    if (last) return toLatLng(last);
    throw new Error('Position GPS indisponible. Réessaie dans un instant, idéalement à l’extérieur.');
  }
}
