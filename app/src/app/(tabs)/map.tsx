import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { RouteMap, type RouteMapHandle } from '@/components/route-map';
import { StopBadge } from '@/components/stop-badge';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { openInGoogleMaps, stopNavigationUrl } from '@/lib/google-maps';
import { stopNumbers } from '@/lib/stop-numbers';
import { selectNextStop, useTourStore } from '@/store/tour-store';

export default function MapScreen() {
  const theme = useTheme();
  const stops = useTourStore((s) => s.stops);
  const route = useTourStore((s) => s.route);
  const toggleDelivered = useTourStore((s) => s.toggleDelivered);
  const mapRef = useRef<RouteMapHandle>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const numbers = useMemo(() => stopNumbers(stops, route !== null), [stops, route]);
  const nextStop = useMemo(() => selectNextStop({ stops, route }), [stops, route]);
  const deliveredCount = stops.filter((s) => s.deliveredAt).length;
  const hasLocatedStops = stops.some((s) => s.location);

  // Panneau du bas : l'arrêt touché sur la carte, sinon le prochain à livrer.
  const focused = stops.find((s) => s.id === selectedId) ?? nextStop;

  const navigate = async () => {
    if (!focused) return;
    try {
      await openInGoogleMaps(stopNavigationUrl(focused));
    } catch {
      Alert.alert('Google Maps', "Impossible d'ouvrir Google Maps sur ce téléphone.");
    }
  };

  return (
    <View style={styles.screen}>
      <RouteMap
        ref={mapRef}
        stops={stops}
        numbers={numbers}
        nextStopId={nextStop?.id ?? null}
        selectedId={selectedId}
        route={route}
        onSelect={setSelectedId}
      />

      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        {stops.length > 0 && (
          <View style={[styles.pill, { backgroundColor: theme.card }]}>
            <Text style={[styles.pillText, { color: theme.text }]}>
              {deliveredCount}/{stops.length} livrés
            </Text>
          </View>
        )}
        <Pressable
          accessibilityLabel="Voir tous les arrêts"
          onPress={() => mapRef.current?.fitAll()}
          style={[styles.roundButton, { backgroundColor: theme.card }]}>
          <Ionicons name="scan-outline" size={22} color={theme.text} />
        </Pressable>
      </SafeAreaView>

      {!hasLocatedStops && (
        <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
          <Ionicons name="map-outline" size={28} color={theme.muted} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Ajoute tes adresses puis appuie sur « Optimiser » pour voir les arrêts numérotés sur la carte.
          </Text>
        </View>
      )}

      {focused && (
        <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Pressable
            style={styles.sheetHeader}
            onPress={() => router.push({ pathname: '/stop/[id]', params: { id: focused.id } })}>
            <StopBadge stop={focused} number={numbers.get(focused.id)} isNext={focused.id === nextStop?.id} size={40} />
            <View style={styles.flex}>
              <Text numberOfLines={2} style={[styles.address, { color: theme.text }]}>
                {focused.address}
              </Text>
              {!!focused.note && (
                <Text numberOfLines={2} style={[styles.note, { color: theme.textSecondary }]}>
                  {focused.note}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.muted} />
          </Pressable>
          <View style={styles.actions}>
            {!focused.deliveredAt && focused.location && (
              <Button label="Naviguer" icon="navigate" onPress={navigate} style={styles.flex} />
            )}
            <Button
              label={focused.deliveredAt ? 'Annuler livré' : 'Livré'}
              icon={focused.deliveredAt ? 'arrow-undo' : 'checkmark'}
              variant={focused.deliveredAt ? 'secondary' : 'success'}
              onPress={() => toggleDelivered(focused.id)}
              style={styles.flex}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  pill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pillText: {
    fontSize: 15,
    fontWeight: '700',
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  emptyCard: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    top: '40%',
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 15,
  },
  sheet: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.md,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  address: {
    fontSize: 16,
    fontWeight: '700',
  },
  note: {
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
});
