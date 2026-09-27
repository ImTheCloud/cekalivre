import { useEffect, useState } from 'react';

import { getApproxPosition } from '@/lib/location';
import type { LatLng } from '@/types';

// Partagée entre les écrans : on ne redemande la position qu'une fois par lancement.
let cached: LatLng | null = null;
let pending: Promise<LatLng | null> | null = null;

/** Position approximative du chauffeur (null tant qu'elle n'est pas connue). */
export function useApproxPosition(): LatLng | null {
  const [position, setPosition] = useState<LatLng | null>(cached);

  useEffect(() => {
    if (cached) return;
    let active = true;
    pending ??= getApproxPosition();
    pending.then((result) => {
      if (result) cached = result;
      else pending = null; // permettra de réessayer plus tard
      if (active && result) setPosition(result);
    });
    return () => {
      active = false;
    };
  }, []);

  return position;
}
