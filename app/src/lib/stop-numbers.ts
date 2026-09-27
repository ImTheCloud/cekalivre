import type { Stop } from '@/types';

/**
 * Numéro de passage de chaque arrêt (1, 2, 3…) une fois la tournée optimisée.
 * Les arrêts sans position (introuvables ou ajoutés après l'optimisation) n'ont pas de numéro.
 */
export function stopNumbers(stops: Stop[], optimized: boolean): Map<string, number> {
  const numbers = new Map<string, number>();
  if (!optimized) return numbers;
  let n = 0;
  for (const stop of stops) {
    if (stop.location) numbers.set(stop.id, ++n);
  }
  return numbers;
}
