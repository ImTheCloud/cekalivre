import { describe, expect, it } from '@jest/globals';

import { formatDistance, formatDuration } from '@/lib/format';
import { multiStopNavigationUrl, stopNavigationUrl } from '@/lib/google-maps';
import { parseAddresses } from '@/lib/parse-addresses';
import { stopNumbers } from '@/lib/stop-numbers';
import type { Stop } from '@/types';

function makeStop(id: string, located: boolean): Stop {
  return {
    id,
    address: `Adresse ${id}`,
    note: '',
    photo: null,
    location: located ? { lat: 50, lng: 4 } : null,
    label: null,
    precision: null,
    warning: null,
    notFound: false,
    deliveredAt: null,
  };
}

describe('parseAddresses', () => {
  it('découpe par ligne, nettoie les puces et garde les doublons', () => {
    const text = [
      '1. Rue Neuve 111, 1000 Bruxelles',
      '',
      '  - Kerkstraat   12, 9000 Gent  ',
      '• Rue Neuve 111, 1000 Bruxelles',
      'ab',
      '3) Place Flagey 18, 1050 Ixelles\r',
    ].join('\n');
    expect(parseAddresses(text)).toEqual([
      'Rue Neuve 111, 1000 Bruxelles',
      'Kerkstraat 12, 9000 Gent',
      'Rue Neuve 111, 1000 Bruxelles',
      'Place Flagey 18, 1050 Ixelles',
    ]);
  });

  it("ne confond pas un numéro de rue en début de ligne avec une numérotation", () => {
    expect(parseAddresses('12 Rue Haute, 1000 Bruxelles')).toEqual(['12 Rue Haute, 1000 Bruxelles']);
  });
});

describe('stopNumbers', () => {
  it('numérote uniquement les arrêts positionnés, une fois optimisé', () => {
    const stops = [makeStop('a', true), makeStop('b', false), makeStop('c', true)];
    expect(stopNumbers(stops, false).size).toBe(0);
    expect([...stopNumbers(stops, true)]).toEqual([
      ['a', 1],
      ['c', 2],
    ]);
  });
});

describe('liens Google Maps', () => {
  it('utilise les coordonnées si elles sont connues, sinon l’adresse', () => {
    expect(stopNavigationUrl({ address: 'X', location: { lat: 50.1, lng: 4.2 } })).toContain(
      'destination=50.1%2C4.2',
    );
    expect(stopNavigationUrl({ address: 'Rue Neuve 1', location: null })).toContain('destination=Rue%20Neuve%201');
    expect(stopNavigationUrl({ address: 'X', location: null })).toContain('dir_action=navigate');
  });

  it('limite la navigation multi-arrêts à 9 étapes + 1 destination', () => {
    const stops = Array.from({ length: 15 }, (_, i) => ({ address: `A${i}`, location: { lat: i, lng: i } }));
    const url = multiStopNavigationUrl(stops)!;
    expect(url).toContain('destination=9%2C9');
    const waypoints = decodeURIComponent(url.split('waypoints=')[1]).split('|');
    expect(waypoints).toHaveLength(9);
    expect(waypoints[0]).toBe('0,0');
    expect(multiStopNavigationUrl([])).toBeNull();
  });
});

describe('format', () => {
  it('formate durées et distances', () => {
    expect(formatDuration(45 * 60)).toBe('45 min');
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe('3 h 05');
    expect(formatDuration(2 * 3600)).toBe('2 h');
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(4250)).toBe('4,3 km');
    expect(formatDistance(27343)).toBe('27 km');
  });
});
