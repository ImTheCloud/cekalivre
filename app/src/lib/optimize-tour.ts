import { optimizeRoute, type OptimizeRequest } from '@/lib/api';
import { getCurrentPosition } from '@/lib/location';
import { useSettingsStore } from '@/store/settings-store';
import { useTourStore } from '@/store/tour-store';
import type { EndPoint, LatLng } from '@/types';

export type OptimizeOutcome = { optimizedCount: number; unresolvedCount: number };

function resolveEnd(
  endPoint: EndPoint,
  defaultEnd: { address: string; location: LatLng | null },
): OptimizeRequest['end'] {
  if (endPoint.mode === 'none') return null;
  if (endPoint.mode === 'custom') {
    const address = endPoint.address.trim();
    return address ? { address, location: endPoint.location ?? null } : null;
  }
  return defaultEnd.address ? { address: defaultEnd.address, location: defaultEnd.location } : null;
}

/**
 * Optimise les arrêts restants (non livrés) depuis la position actuelle du téléphone.
 * Les arrêts déjà livrés ne sont pas envoyés : on peut donc ré-optimiser en cours de tournée.
 */
export async function optimizeTour(): Promise<OptimizeOutcome> {
  const { stops, endPoint } = useTourStore.getState();
  const pending = stops.filter((s) => !s.deliveredAt);
  if (pending.length === 0) {
    throw new Error('Aucun arrêt à optimiser : ajoute des adresses ou annule une livraison.');
  }

  const start = await getCurrentPosition();
  const { defaultEndAddress, defaultEndLocation } = useSettingsStore.getState();
  const end = resolveEnd(endPoint, { address: defaultEndAddress, location: defaultEndLocation });

  const result = await optimizeRoute({
    start,
    end,
    stops: pending.map((s) => ({ id: s.id, address: s.address, location: s.location })),
  });

  useTourStore.getState().applyOptimization(result, start);
  return { optimizedCount: result.stops.length, unresolvedCount: result.unresolved.length };
}
