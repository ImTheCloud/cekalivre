import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type SettingsState = {
  /** Point d'arrivée par défaut (dépôt, domicile…). Vide = pas d'arrivée imposée. */
  defaultEndAddress: string;
  setDefaultEndAddress: (address: string) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultEndAddress: '',
      setDefaultEndAddress: (address) => set({ defaultEndAddress: address.trim() }),
    }),
    {
      name: 'cekalivre-settings',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ defaultEndAddress }) => ({ defaultEndAddress }),
    },
  ),
);
