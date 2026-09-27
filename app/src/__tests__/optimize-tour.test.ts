import { beforeEach, expect, it, jest } from '@jest/globals';

import { optimizeRoute } from '@/lib/api';
import { getCurrentPosition } from '@/lib/location';
import { optimizeTour } from '@/lib/optimize-tour';
import { useSettingsStore } from '@/store/settings-store';
import { useTourStore } from '@/store/tour-store';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/lib/photos', () => ({ deletePhoto: jest.fn(), deleteAllPhotos: jest.fn() }));
jest.mock('@/lib/location', () => ({ getCurrentPosition: jest.fn() }));
jest.mock('@/lib/api', () => ({ optimizeRoute: jest.fn() }));

const START = { lat: 50.83, lng: 4.33 };
const mockedOptimize = jest.mocked(optimizeRoute);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getCurrentPosition).mockResolvedValue(START);
  mockedOptimize.mockImplementation(async (body) => ({
    stops: body.stops.map((s) => ({
      id: s.id,
      location: { lat: 50, lng: 4 },
      label: null,
      precision: 'exact' as const,
      warning: null,
      legDurationS: 1,
      legDistanceM: 1,
    })),
    unresolved: [],
    end: null,
    totalDurationS: 1,
    totalDistanceM: 1,
    matrixSource: 'osrm' as const,
  }));
  useTourStore.setState({ stops: [], route: null, dirty: false, endPoint: { mode: 'default' } });
  useSettingsStore.setState({ defaultEndAddress: '' });
});

it("envoie uniquement les arrêts non livrés, depuis la position GPS", async () => {
  useTourStore.getState().addAddresses(['A', 'B']);
  const a = useTourStore.getState().stops[0].id;
  useTourStore.getState().toggleDelivered(a);

  const outcome = await optimizeTour();

  const body = mockedOptimize.mock.calls[0][0];
  expect(body.start).toEqual(START);
  expect(body.stops.map((s) => s.address)).toEqual(['B']);
  expect(outcome).toEqual({ optimizedCount: 1, unresolvedCount: 0 });
  expect(useTourStore.getState().route?.start).toEqual(START);
});

it.each([
  ['default', 'Dépôt 1, 1070 Anderlecht', { mode: 'default' as const }, { address: 'Dépôt 1, 1070 Anderlecht' }],
  ['default sans adresse réglée', '', { mode: 'default' as const }, null],
  ['none', 'Dépôt 1, 1070 Anderlecht', { mode: 'none' as const }, null],
  ['custom', 'Dépôt 1', { mode: 'custom' as const, address: ' Maison 3, 1180 Uccle ' }, { address: 'Maison 3, 1180 Uccle' }],
])("point d'arrivée : %s", async (_label, defaultEnd, endPoint, expected) => {
  useSettingsStore.setState({ defaultEndAddress: defaultEnd });
  useTourStore.getState().addAddresses(['A']);
  useTourStore.getState().setEndPoint(endPoint);

  await optimizeTour();

  expect(mockedOptimize.mock.calls[0][0].end).toEqual(expected);
});

it('refuse d’optimiser une tournée entièrement livrée', async () => {
  useTourStore.getState().addAddresses(['A']);
  useTourStore.getState().toggleDelivered(useTourStore.getState().stops[0].id);
  await expect(optimizeTour()).rejects.toThrow('Aucun arrêt à optimiser');
  expect(mockedOptimize).not.toHaveBeenCalled();
});
