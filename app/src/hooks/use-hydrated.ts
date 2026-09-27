import { useEffect, useState } from 'react';

import { useSettingsStore } from '@/store/settings-store';
import { useTourStore } from '@/store/tour-store';

const stores = [useTourStore, useSettingsStore];

/** true quand la tournée et les réglages ont été relus depuis le stockage du téléphone. */
export function useStoresHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => stores.every((s) => s.persist.hasHydrated()));

  useEffect(() => {
    const check = () => setHydrated(stores.every((s) => s.persist.hasHydrated()));
    const unsubscribers = stores.map((s) => s.persist.onFinishHydration(check));
    check();
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  return hydrated;
}
