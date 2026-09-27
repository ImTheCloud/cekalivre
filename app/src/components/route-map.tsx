import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { StopBadge } from '@/components/stop-badge';
import { useTheme } from '@/hooks/use-theme';
import { useGoogleMapsOnIos } from '@/lib/config';
import type { LatLng, RouteSummary, Stop } from '@/types';

export type RouteMapHandle = { fitAll: () => void };

type Props = {
  stops: Stop[];
  numbers: Map<string, number>;
  nextStopId: string | null;
  selectedId: string | null;
  route: RouteSummary | null;
  onSelect: (id: string | null) => void;
};

// Belgique entière, avant que les arrêts soient positionnés.
const INITIAL_REGION = { latitude: 50.6, longitude: 4.6, latitudeDelta: 2.8, longitudeDelta: 2.8 };
const EDGE_PADDING = { top: 80, right: 60, bottom: 260, left: 60 };

// Google Maps partout sur Android. Sur iOS, Expo Go n'embarque qu'Apple Maps :
// Google Maps y est activé seulement dans une build native avec clé (voir app.config.ts).
const provider = Platform.OS === 'android' || useGoogleMapsOnIos ? PROVIDER_GOOGLE : undefined;

const toCoord = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

type MarkerProps = {
  stop: Stop & { location: LatLng };
  number: number | undefined;
  isNext: boolean;
  selected: boolean;
  onPress: (id: string) => void;
};

function NumberedMarkerComponent({ stop, number, isNext, selected, onPress }: MarkerProps) {
  // Une vue personnalisée par repère coûte cher sur Android : on la "fige" une fois dessinée.
  // Le composant parent change la `key` quand l'apparence change, ce qui relance ce cycle.
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTracksViewChanges(false), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Marker
      coordinate={toCoord(stop.location)}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
      zIndex={selected ? 1001 : isNext ? 1000 : stop.deliveredAt ? 1 : 10}
      onPress={() => onPress(stop.id)}>
      <View style={selected && styles.selected}>
        <StopBadge stop={stop} number={number} isNext={isNext} size={selected ? 36 : 28} />
      </View>
    </Marker>
  );
}

const NumberedMarker = memo(NumberedMarkerComponent);

export const RouteMap = forwardRef<RouteMapHandle, Props>(function RouteMap(
  { stops, numbers, nextStopId, selectedId, route, onSelect },
  ref,
) {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);

  const located = useMemo(
    () => stops.filter((s): s is Stop & { location: LatLng } => s.location !== null),
    [stops],
  );

  const pathCoordinates = useMemo(() => {
    if (!route) return [];
    const points: LatLng[] = [route.start, ...located.map((s) => s.location)];
    if (route.end) points.push(route.end);
    return points.map(toCoord);
  }, [route, located]);

  const fitAll = () => {
    const points = [...located.map((s) => s.location), ...(route?.end ? [route.end] : [])];
    if (points.length === 0) return;
    mapRef.current?.fitToCoordinates(points.map(toCoord), { edgePadding: EDGE_PADDING, animated: true });
  };

  useImperativeHandle(ref, () => ({ fitAll }));

  // Recadre automatiquement quand le nombre d'arrêts positionnés change (ex. après une optimisation).
  useEffect(() => {
    const timer = setTimeout(fitAll, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located.length, route?.optimizedAt]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={provider}
      initialRegion={INITIAL_REGION}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
      onMapReady={fitAll}
      onPress={(e) => {
        if (e.nativeEvent.action !== 'marker-press') onSelect(null);
      }}>
      {pathCoordinates.length > 1 && (
        <Polyline coordinates={pathCoordinates} strokeColor={theme.primary} strokeWidth={3} />
      )}

      {located.map((stop) => {
        const isNext = stop.id === nextStopId;
        const selected = stop.id === selectedId;
        const number = numbers.get(stop.id);
        return (
          <NumberedMarker
            key={`${stop.id}:${number}:${!!stop.deliveredAt}:${isNext}:${selected}`}
            stop={stop}
            number={number}
            isNext={isNext}
            selected={selected}
            onPress={onSelect}
          />
        );
      })}

      {route?.end && (
        <Marker coordinate={toCoord(route.end)} title="Arrivée" description={route.end.label} zIndex={2000}>
          <View style={[styles.endMarker, { backgroundColor: theme.text }]}>
            <Ionicons name="flag" size={16} color={theme.background} />
          </View>
        </Marker>
      )}
    </MapView>
  );
});

const styles = StyleSheet.create({
  selected: {
    padding: 2,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  endMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
