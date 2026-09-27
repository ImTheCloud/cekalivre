import * as Location from 'expo-location';

import type { LatLng } from '@/types';

const GPS_TIMEOUT_MS = 15_000;

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

/** Position GPS actuelle du téléphone = point de départ de la tournée. */
export async function getCurrentPosition(): Promise<LatLng> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error(
      "L'accès à la localisation est refusé. Autorise-le dans les réglages du téléphone pour utiliser ta position comme point de départ.",
    );
  }

  try {
    const position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      GPS_TIMEOUT_MS,
    );
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    // GPS lent (intérieur, parking souterrain…) : on se rabat sur la dernière position connue.
    const last = await Location.getLastKnownPositionAsync();
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    throw new Error('Position GPS indisponible. Réessaie à l’extérieur.');
  }
}
