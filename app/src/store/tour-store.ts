import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { OptimizeResponse } from '@/lib/api';
import { createId } from '@/lib/id';
import { deleteAllPhotos, deletePhoto } from '@/lib/photos';
import type { EndPoint, RouteSummary, Stop } from '@/types';

type TourState = {
  /** Les arrêts, dans l'ordre de passage (après optimisation) ou de saisie (avant). */
  stops: Stop[];
  /** Résultat de la dernière optimisation (null = jamais optimisée). */
  route: RouteSummary | null;
  /** Des arrêts ont été ajoutés ou modifiés depuis la dernière optimisation. */
  dirty: boolean;
  endPoint: EndPoint;

  addAddresses: (addresses: string[]) => void;
  updateAddress: (id: string, address: string) => void;
  updateNote: (id: string, note: string) => void;
  setPhoto: (id: string, photo: string | null) => void;
  duplicateStop: (id: string) => void;
  removeStop: (id: string) => void;
  toggleDelivered: (id: string) => void;
  setEndPoint: (endPoint: EndPoint) => void;
  /** Signale que l'ordre actuel n'est plus à jour (ex. arrivée par défaut modifiée). */
  markDirty: () => void;
  applyOptimization: (result: OptimizeResponse, start: RouteSummary['start']) => void;
  resetTour: () => void;
};

function newStop(address: string): Stop {
  return {
    id: createId(),
    address,
    note: '',
    photo: null,
    location: null,
    label: null,
    precision: null,
    suspicious: false,
    notFound: false,
    deliveredAt: null,
  };
}

function updateStop(stops: Stop[], id: string, patch: Partial<Stop>): Stop[] {
  return stops.map((stop) => (stop.id === id ? { ...stop, ...patch } : stop));
}

export const useTourStore = create<TourState>()(
  persist(
    (set, get) => ({
      stops: [],
      route: null,
      dirty: false,
      endPoint: { mode: 'default' },

      addAddresses: (addresses) =>
        set((state) => ({
          stops: [...state.stops, ...addresses.map(newStop)],
          dirty: state.route !== null || state.dirty,
        })),

      updateAddress: (id, address) =>
        set((state) => {
          const current = state.stops.find((s) => s.id === id);
          if (!current || current.address === address) return state;
          return {
            // Nouvelle adresse = il faudra la géocoder à nouveau.
            stops: updateStop(state.stops, id, {
              address,
              location: null,
              label: null,
              precision: null,
              suspicious: false,
              notFound: false,
            }),
            dirty: true,
          };
        }),

      updateNote: (id, note) => set((state) => ({ stops: updateStop(state.stops, id, { note }) })),

      setPhoto: (id, photo) =>
        set((state) => {
          const previous = state.stops.find((s) => s.id === id)?.photo;
          if (previous && previous !== photo) deletePhoto(previous);
          return { stops: updateStop(state.stops, id, { photo }) };
        }),

      duplicateStop: (id) =>
        set((state) => {
          const index = state.stops.findIndex((s) => s.id === id);
          if (index === -1) return state;
          const original = state.stops[index];
          // Même adresse (et mêmes coordonnées) juste après l'original : l'ordre optimisé reste valable.
          const copy: Stop = { ...original, id: createId(), note: '', photo: null, deliveredAt: null };
          const stops = [...state.stops];
          stops.splice(index + 1, 0, copy);
          return { stops };
        }),

      removeStop: (id) =>
        set((state) => {
          deletePhoto(state.stops.find((s) => s.id === id)?.photo);
          return { stops: state.stops.filter((s) => s.id !== id) };
        }),

      toggleDelivered: (id) =>
        set((state) => {
          const stop = state.stops.find((s) => s.id === id);
          if (!stop) return state;
          return { stops: updateStop(state.stops, id, { deliveredAt: stop.deliveredAt ? null : Date.now() }) };
        }),

      setEndPoint: (endPoint) => set({ endPoint, dirty: get().route !== null }),

      markDirty: () => set((state) => ({ dirty: state.route !== null })),

      applyOptimization: (result, start) =>
        set((state) => {
          const byId = new Map(state.stops.map((s) => [s.id, s]));
          const placed = new Set<string>();
          const take = (stop: Stop) => {
            placed.add(stop.id);
            return stop;
          };

          // 1. Les arrêts déjà livrés restent en tête, dans leur ordre.
          const delivered = state.stops.filter((s) => s.deliveredAt).map(take);

          // 2. Puis l'ordre optimisé renvoyé par le backend.
          const optimized = result.stops.flatMap((r) => {
            const stop = byId.get(r.id);
            if (!stop || placed.has(r.id)) return [];
            return [
              take({
                ...stop,
                location: r.location,
                label: r.label ?? stop.label,
                precision: r.precision ?? stop.precision,
                suspicious: r.suspicious,
                notFound: false,
              }),
            ];
          });

          // 3. Enfin les adresses introuvables, à corriger par le chauffeur.
          const unresolvedIds = new Set(result.unresolved.map((u) => u.id));
          const unresolved = state.stops
            .filter((s) => !placed.has(s.id) && unresolvedIds.has(s.id))
            .map((s) => take({ ...s, location: null, label: null, precision: null, notFound: true }));

          // Sécurité : un arrêt ajouté pendant le calcul ne doit jamais disparaître.
          const rest = state.stops.filter((s) => !placed.has(s.id));

          return {
            stops: [...delivered, ...optimized, ...unresolved, ...rest],
            dirty: rest.length > 0,
            route: {
              optimizedAt: Date.now(),
              start,
              end: result.end,
              totalDurationS: result.totalDurationS,
              totalDistanceM: result.totalDistanceM,
              matrixSource: result.matrixSource,
            },
          };
        }),

      resetTour: () => {
        deleteAllPhotos();
        set({ stops: [], route: null, dirty: false, endPoint: { mode: 'default' } });
      },
    }),
    {
      name: 'cekalivre-tour',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ stops, route, dirty, endPoint }) => ({ stops, route, dirty, endPoint }),
    },
  ),
);

/** Prochain arrêt à livrer (le premier non livré qui a une position). */
export function selectNextStop(state: Pick<TourState, 'stops' | 'route'>): Stop | null {
  if (!state.route) return null;
  return state.stops.find((s) => !s.deliveredAt && s.location) ?? null;
}
