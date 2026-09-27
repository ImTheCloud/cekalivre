import { useEffect, useState } from 'react';

import { searchAddresses, type AddressSuggestion } from '@/lib/api';
import type { LatLng } from '@/types';

const MIN_QUERY_LENGTH = 3;
// On attend une courte pause dans la frappe avant d'interroger le serveur.
const DEBOUNCE_MS = 250;

type State = { suggestions: AddressSuggestion[]; loading: boolean; error: string | null };

const EMPTY: State = { suggestions: [], loading: false, error: null };

export function useAddressSuggestions(query: string, enabled: boolean, near: LatLng | null): State {
  const [state, setState] = useState<State>(EMPTY);
  const trimmed = query.trim();
  const active = enabled && trimmed.length >= MIN_QUERY_LENGTH;
  // Arrondi : un GPS qui bouge de quelques mètres ne doit pas relancer la recherche.
  const nearLat = near ? Math.round(near.lat * 100) / 100 : null;
  const nearLng = near ? Math.round(near.lng * 100) / 100 : null;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((previous) => ({ ...previous, loading: true }));
      try {
        const bias = nearLat !== null && nearLng !== null ? { lat: nearLat, lng: nearLng } : null;
        const suggestions = await searchAddresses(trimmed, bias, controller.signal);
        if (!controller.signal.aborted) setState({ suggestions, loading: false, error: null });
      } catch (e) {
        if (controller.signal.aborted) return;
        setState({ suggestions: [], loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, trimmed, nearLat, nearLng]);

  return active ? state : EMPTY;
}
