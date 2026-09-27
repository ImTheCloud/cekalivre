import { Alert, Linking } from 'react-native';

import type { Stop } from '@/types';

/**
 * Navigation turn-by-turn : on ouvre l'app Google Maps du téléphone via un lien
 * "Maps URLs" (https://developers.google.com/maps/documentation/urls/get-started).
 * Gratuit et illimité, contrairement au Navigation SDK.
 */
const BASE_URL = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate';

/** Google Maps accepte au maximum 9 étapes intermédiaires dans un lien. */
export const MAX_WAYPOINTS = 9;

function toParam(stop: Pick<Stop, 'address' | 'location'>): string {
  // Les coordonnées garantissent qu'on va exactement au repère affiché sur la carte.
  return stop.location ? `${stop.location.lat},${stop.location.lng}` : stop.address;
}

export function stopNavigationUrl(stop: Pick<Stop, 'address' | 'location'>): string {
  return `${BASE_URL}&destination=${encodeURIComponent(toParam(stop))}`;
}

/** Lien vers les prochains arrêts à la suite (1 destination + jusqu'à 9 étapes). */
export function multiStopNavigationUrl(stops: Pick<Stop, 'address' | 'location'>[]): string | null {
  const chosen = stops.slice(0, MAX_WAYPOINTS + 1);
  if (chosen.length === 0) return null;
  const destination = chosen[chosen.length - 1];
  const waypoints = chosen.slice(0, -1).map(toParam).join('|');
  let url = `${BASE_URL}&destination=${encodeURIComponent(toParam(destination))}`;
  if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
  return url;
}

export async function openInGoogleMaps(url: string): Promise<void> {
  await Linking.openURL(url);
}

/** Ouvre Google Maps et prévient le chauffeur si c'est impossible. */
export async function navigateTo(url: string | null): Promise<void> {
  if (!url) return;
  try {
    await openInGoogleMaps(url);
  } catch {
    Alert.alert('Google Maps', "Impossible d'ouvrir Google Maps sur ce téléphone.");
  }
}
