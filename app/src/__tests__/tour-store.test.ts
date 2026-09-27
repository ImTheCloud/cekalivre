import { beforeEach, expect, it, jest } from '@jest/globals';

import type { OptimizeResponse } from '@/lib/api';
import { deleteAllPhotos, deletePhoto } from '@/lib/photos';
import { freeTextChoice, selectNextStop, useTourStore } from '@/store/tour-store';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/lib/photos', () => ({ deletePhoto: jest.fn(), deleteAllPhotos: jest.fn() }));

const START = { lat: 50.83, lng: 4.33 };
const store = () => useTourStore.getState();

function idsOf(addresses: string[]) {
  return addresses.map((a) => store().stops.find((s) => s.address === a)!.id);
}

function response(orderedIds: string[], unresolvedIds: string[] = []): OptimizeResponse {
  return {
    stops: orderedIds.map((id, i) => ({
      id,
      location: { lat: 50 + i / 100, lng: 4 },
      label: `label-${id}`,
      precision: 'exact',
      warning: null,
      legDurationS: 60,
      legDistanceM: 500,
    })),
    unresolved: unresolvedIds.map((id) => ({ id, address: '?', reason: 'Adresse introuvable' })),
    end: null,
    totalDurationS: 60 * orderedIds.length,
    totalDistanceM: 500 * orderedIds.length,
    matrixSource: 'osrm',
  };
}

beforeEach(() => {
  useTourStore.setState({ stops: [], route: null, dirty: false, endPoint: { mode: 'default' } });
  jest.clearAllMocks();
});

it('ajoute des adresses sans marquer la tournée comme modifiée avant la 1re optimisation', () => {
  store().addAddresses(['A', 'B']);
  expect(store().stops.map((s) => s.address)).toEqual(['A', 'B']);
  expect(store().dirty).toBe(false);
});

it("applique l'ordre optimisé et place les adresses introuvables à la fin", () => {
  store().addAddresses(['A', 'B', 'C', 'D']);
  const [a, b, c, d] = idsOf(['A', 'B', 'C', 'D']);
  store().applyOptimization(response([c, a, d], [b]), START);

  expect(store().stops.map((s) => s.address)).toEqual(['C', 'A', 'D', 'B']);
  expect(store().stops[0].label).toBe(`label-${c}`);
  expect(store().stops[3].notFound).toBe(true);
  expect(store().route?.totalDistanceM).toBe(1500);
  expect(store().dirty).toBe(false);
  expect(selectNextStop(store())?.address).toBe('C');
});

it('garde les arrêts livrés en tête lors d’une ré-optimisation en cours de tournée', () => {
  store().addAddresses(['A', 'B', 'C']);
  const [a, b, c] = idsOf(['A', 'B', 'C']);
  store().applyOptimization(response([a, b, c]), START);
  store().toggleDelivered(a);
  // Le backend ne reçoit que B et C, et les inverse.
  store().applyOptimization(response([c, b]), START);

  expect(store().stops.map((s) => s.address)).toEqual(['A', 'C', 'B']);
  expect(store().stops[0].deliveredAt).not.toBeNull();
  expect(selectNextStop(store())?.address).toBe('C');
});

it("un arrêt ajouté pendant le calcul n'est jamais perdu", () => {
  store().addAddresses(['A']);
  const [a] = idsOf(['A']);
  store().addAddresses(['Nouveau']);
  store().applyOptimization(response([a]), START);
  expect(store().stops.map((s) => s.address)).toEqual(['A', 'Nouveau']);
  expect(store().dirty).toBe(true);
});

it("modifier une adresse efface sa position et demande une ré-optimisation", () => {
  store().addAddresses(['A']);
  const [a] = idsOf(['A']);
  store().applyOptimization(response([a]), START);
  store().updateAddress(a, freeTextChoice('A corrigée'));

  const stop = store().stops[0];
  expect(stop.address).toBe('A corrigée');
  expect(stop.location).toBeNull();
  expect(store().dirty).toBe(true);
});

it('duplique juste après l’original, avec la même position mais sans note ni photo', () => {
  store().addAddresses(['A', 'B']);
  const [a, b] = idsOf(['A', 'B']);
  store().applyOptimization(response([a, b]), START);
  store().updateNote(a, 'carton rouge');
  store().setPhoto(a, 'photo-a.jpg');
  store().duplicateStop(a);

  const [original, copy, last] = store().stops;
  expect(copy.address).toBe('A');
  expect(copy.id).not.toBe(original.id);
  expect(copy.location).toEqual(original.location);
  expect(copy.note).toBe('');
  expect(copy.photo).toBeNull();
  expect(last.address).toBe('B');
  expect(store().dirty).toBe(false);
});

it('supprime la photo du téléphone quand on la remplace ou supprime l’arrêt', () => {
  store().addAddresses(['A']);
  const [a] = idsOf(['A']);
  store().setPhoto(a, 'p1.jpg');
  store().setPhoto(a, 'p2.jpg');
  expect(deletePhoto).toHaveBeenCalledWith('p1.jpg');
  store().removeStop(a);
  expect(deletePhoto).toHaveBeenCalledWith('p2.jpg');
  expect(store().stops).toHaveLength(0);
});

it('marque livré puis annule', () => {
  store().addAddresses(['A']);
  const [a] = idsOf(['A']);
  store().toggleDelivered(a);
  expect(store().stops[0].deliveredAt).toEqual(expect.any(Number));
  store().toggleDelivered(a);
  expect(store().stops[0].deliveredAt).toBeNull();
});

it('nouvelle tournée : vide tout et supprime les photos', () => {
  store().addAddresses(['A']);
  store().setEndPoint({ mode: 'none' });
  store().resetTour();
  expect(store().stops).toHaveLength(0);
  expect(store().endPoint).toEqual({ mode: 'default' });
  expect(deleteAllPhotos).toHaveBeenCalled();
});

it('un arrêt choisi dans les suggestions arrive déjà positionné', () => {
  store().addStops([
    { address: 'Rue Neuve 11, 1000 Bruxelles', location: { lat: 50.85, lng: 4.35 }, label: 'Rue Neuve 11, 1000 Bruxelles', precision: 'exact' },
  ]);
  const [stop] = store().stops;
  expect(stop.location).toEqual({ lat: 50.85, lng: 4.35 });
  expect(stop.precision).toBe('exact');
  expect(stop.notFound).toBe(false);
});

it('corriger une adresse via une suggestion garde la nouvelle position', () => {
  store().addAddresses(['Rue Zzz 12']);
  const [a] = idsOf(['Rue Zzz 12']);
  store().applyOptimization(response([], [a]), START);
  expect(store().stops[0].notFound).toBe(true);

  store().updateAddress(a, {
    address: 'Rue des Bouchers 12, 1000 Bruxelles',
    location: { lat: 50.847, lng: 4.354 },
    label: 'Rue des Bouchers 12, 1000 Bruxelles',
    precision: 'exact',
  });
  const stop = store().stops[0];
  expect(stop.notFound).toBe(false);
  expect(stop.location).toEqual({ lat: 50.847, lng: 4.354 });
  expect(store().dirty).toBe(true);
});
