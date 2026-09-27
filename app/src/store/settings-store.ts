import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AddressChoice, LatLng } from '@/types';

type SettingsState = {
  /** Point d'arrivée par défaut (dépôt, domicile…). Vide = pas d'arrivée imposée. */
  defaultEndAddress: string;
  /** Position de l'arrivée si elle a été choisie dans les suggestions (sinon géocodée à l'optimisation). */
  defaultEndLocation: LatLng | null;
  setDefaultEnd: (choice: AddressChoice | null) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultEndAddress: '',
      defaultEndLocation: null,
      setDefaultEnd: (choice) =>
        set({ defaultEndAddress: choice?.address.trim() ?? '', defaultEndLocation: choice?.location ?? null }),
    }),
    {
      name: 'cekalivre-settings',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ defaultEndAddress, defaultEndLocation }) => ({ defaultEndAddress, defaultEndLocation }),
    },
  ),
);
