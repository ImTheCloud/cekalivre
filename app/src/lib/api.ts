import { getApiToken, getApiUrl } from '@/lib/config';
import type { GeocodePrecision, LatLng } from '@/types';

/** Contrat de l'endpoint POST /optimize (voir backend/app/models.py). */
export type OptimizeRequest = {
  start: LatLng;
  end: LatLng | { address: string; location?: LatLng | null } | null;
  stops: { id: string; address: string; location: LatLng | null }[];
};

export type OptimizedStop = {
  id: string;
  location: LatLng;
  label: string | null;
  precision: GeocodePrecision | null;
  warning: string | null;
  legDurationS: number;
  legDistanceM: number;
};

export type OptimizeResponse = {
  stops: OptimizedStop[];
  unresolved: { id: string; address: string; reason: string }[];
  end: (LatLng & { label: string }) | null;
  totalDurationS: number;
  totalDistanceM: number;
  matrixSource: 'osrm' | 'haversine';
};

/** Suggestion renvoyée par GET /autocomplete. */
export type AddressSuggestion = {
  address: string;
  title: string;
  subtitle: string;
  location: LatLng;
  precision: GeocodePrecision;
};

export class ApiError extends Error {}

// Géocodage de ~100 adresses + calcul OR-Tools : ça peut prendre quelques dizaines de secondes.
const OPTIMIZE_TIMEOUT_MS = 90_000;
const AUTOCOMPLETE_TIMEOUT_MS = 10_000;

async function request<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const baseUrl = getApiUrl();
  if (!baseUrl) {
    throw new ApiError(
      "Serveur non configuré : ajoute EXPO_PUBLIC_API_URL dans app/.env.local puis relance l'app.",
    );
  }

  const token = getApiToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Annulation demandée par l'appelant (ex. une nouvelle lettre tapée dans la recherche).
  const external = init.signal;
  if (external?.aborted) controller.abort();
  external?.addEventListener('abort', () => controller.abort());

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      signal: controller.signal,
    });
  } catch {
    if (external?.aborted) throw new ApiError('Requête annulée.');
    if (controller.signal.aborted) {
      throw new ApiError('Le serveur met trop de temps à répondre. Réessaie dans un instant.');
    }
    throw new ApiError(`Impossible de joindre le serveur (${baseUrl}). Vérifie ta connexion.`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ApiError(await describeError(response));
  }
  return (await response.json()) as T;
}

async function describeError(response: Response): Promise<string> {
  if (response.status === 401) return 'Jeton API refusé : vérifie EXPO_PUBLIC_API_TOKEN.';
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch {
    // corps non JSON : on retombe sur le message générique
  }
  return `Erreur du serveur (${response.status}).`;
}

export function optimizeRoute(body: OptimizeRequest): Promise<OptimizeResponse> {
  return request<OptimizeResponse>(
    '/optimize',
    { method: 'POST', body: JSON.stringify(body) },
    OPTIMIZE_TIMEOUT_MS,
  );
}

/** Suggestions d'adresses pendant la saisie, les plus proches de `near` en premier. */
export async function searchAddresses(
  query: string,
  near: LatLng | null,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({ q: query });
  if (near) {
    params.set('lat', near.lat.toFixed(4));
    params.set('lng', near.lng.toFixed(4));
  }
  const body = await request<{ suggestions: AddressSuggestion[] }>(
    `/autocomplete?${params.toString()}`,
    { method: 'GET', signal },
    AUTOCOMPLETE_TIMEOUT_MS,
  );
  return body.suggestions;
}

export function checkHealth(): Promise<{ status: string; matrixSource: string }> {
  return request('/health', { method: 'GET' }, 10_000);
}
