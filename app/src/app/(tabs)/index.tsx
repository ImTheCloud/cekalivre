import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView as ScreensSafeAreaView } from 'react-native-screens/experimental';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { Button } from '@/components/button';
import { Glass } from '@/components/glass';
import { NextStopCard } from '@/components/next-stop-card';
import { RouteMap, type RouteMapHandle } from '@/components/route-map';
import { StopBadge } from '@/components/stop-badge';
import { Radius, Spacing } from '@/constants/theme';
import { useApproxPosition } from '@/hooks/use-approx-position';
import { useOptimize } from '@/hooks/use-optimize';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/format';
import { navigateTo, stopNavigationUrl } from '@/lib/google-maps';
import { stopNumbers } from '@/lib/stop-numbers';
import { useSettingsStore } from '@/store/settings-store';
import { selectNextStop, useTourStore } from '@/store/tour-store';
import type { AddressChoice, EndPoint, Stop } from '@/types';

const ADDED_FEEDBACK_MS = 2500;

function endPointLabel(endPoint: EndPoint, defaultEndAddress: string): string {
  if (endPoint.mode === 'custom') return endPoint.address;
  if (endPoint.mode === 'default' && defaultEndAddress) return defaultEndAddress;
  return 'Aucune — fin au dernier arrêt';
}

/**
 * Panneau du bas. Sur iOS, la barre d'onglets (Liquid Glass) flotte par-dessus l'écran :
 * le SafeAreaView de react-native-screens connaît sa hauteur. Sur Android, l'écran s'arrête
 * déjà au-dessus de la barre d'onglets.
 */
function BottomArea({ children }: { children: ReactNode }) {
  if (Platform.OS === 'ios') {
    return (
      <ScreensSafeAreaView edges={{ bottom: true }} style={styles.bottomArea} pointerEvents="box-none">
        {children}
      </ScreensSafeAreaView>
    );
  }
  return (
    <View style={[styles.bottomArea, styles.bottomAreaAndroid]} pointerEvents="box-none">
      {children}
    </View>
  );
}

export default function MapHomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const position = useApproxPosition();
  const mapRef = useRef<RouteMapHandle>(null);
  const { optimizing, optimize } = useOptimize();

  const stops = useTourStore((s) => s.stops);
  const route = useTourStore((s) => s.route);
  const dirty = useTourStore((s) => s.dirty);
  const endPoint = useTourStore((s) => s.endPoint);
  const addStops = useTourStore((s) => s.addStops);
  const toggleDelivered = useTourStore((s) => s.toggleDelivered);
  const resetTour = useTourStore((s) => s.resetTour);
  const defaultEndAddress = useSettingsStore((s) => s.defaultEndAddress);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const numbers = useMemo(() => stopNumbers(stops, route !== null), [stops, route]);
  const nextStop = useMemo(() => selectNextStop({ stops, route }), [stops, route]);
  const deliveredCount = stops.filter((s) => s.deliveredAt).length;
  const pendingCount = stops.length - deliveredCount;
  const problemCount = stops.filter((s) => !s.deliveredAt && (s.notFound || s.warning)).length;
  const finished = route !== null && stops.length > 0 && pendingCount === 0;
  const selected = stops.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    if (!lastAdded) return;
    const timer = setTimeout(() => setLastAdded(null), ADDED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [lastAdded]);

  const handleAdd = (choice: AddressChoice) => {
    addStops([choice]);
    setLastAdded(choice.address);
  };

  const handleReset = () => {
    Alert.alert('Nouvelle tournée', 'Supprimer tous les arrêts, notes et photos de la tournée actuelle ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Tout supprimer', style: 'destructive', onPress: resetTour },
    ]);
  };

  const openStop = (id: string) => router.push({ pathname: '/stop/[id]', params: { id } });

  let panel: ReactNode;
  if (selected && selected.id !== nextStop?.id) {
    panel = (
      <SelectedStopPanel
        stop={selected}
        number={numbers.get(selected.id)}
        onClose={() => setSelectedId(null)}
        onOpen={() => openStop(selected.id)}
        onToggleDelivered={() => toggleDelivered(selected.id)}
      />
    );
  } else if (stops.length === 0) {
    panel = (
      <View style={styles.panelBody}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>Aucun arrêt pour l’instant</Text>
        <Text style={[styles.panelText, { color: theme.textSecondary }]}>
          Tape une adresse dans la barre de recherche : choisis la bonne suggestion, elle s’ajoute à la tournée.
        </Text>
        <Button
          label="Coller une liste d’adresses"
          icon="clipboard-outline"
          variant="secondary"
          onPress={() => router.push({ pathname: '/add', params: { mode: 'paste' } })}
        />
      </View>
    );
  } else if (finished) {
    panel = (
      <View style={styles.panelBody}>
        <View style={styles.rowCenter}>
          <Ionicons name="trophy" size={24} color={theme.success} />
          <Text style={[styles.panelTitle, { color: theme.success }]}>Tournée terminée</Text>
        </View>
        <FinishedSummary stops={stops} />
        <Button label="Nouvelle tournée" icon="refresh" variant="secondary" onPress={handleReset} />
      </View>
    );
  } else if (!route) {
    panel = (
      <View style={styles.panelBody}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>
          {pendingCount} arrêt{pendingCount > 1 ? 's' : ''} à livrer
        </Text>
        <Pressable onPress={() => router.push('/end-point')} style={styles.rowCenter}>
          <Ionicons name="flag-outline" size={16} color={theme.textSecondary} />
          <Text numberOfLines={1} style={[styles.panelText, styles.flex, { color: theme.textSecondary }]}>
            Arrivée : {endPointLabel(endPoint, defaultEndAddress)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </Pressable>
        <Button
          label={optimizing ? 'Calcul de l’itinéraire…' : 'Optimiser la tournée'}
          icon="sparkles"
          size="lg"
          loading={optimizing}
          onPress={optimize}
        />
      </View>
    );
  } else {
    panel = (
      <View style={styles.panelBody}>
        {nextStop ? (
          <NextStopCard
            embedded
            stop={nextStop}
            number={numbers.get(nextStop.id)}
            onOpen={() => openStop(nextStop.id)}
            onNavigate={() => navigateTo(stopNavigationUrl(nextStop))}
            onDelivered={() => toggleDelivered(nextStop.id)}
          />
        ) : (
          <Text style={[styles.panelText, { color: theme.textSecondary }]}>
            Les arrêts restants n’ont pas de position : corrige-les dans l’onglet Arrêts.
          </Text>
        )}
        {(dirty || problemCount > 0) && (
          <View style={[styles.notice, { backgroundColor: theme.warningSoft }]}>
            <Text style={[styles.noticeText, { color: theme.warning }]}>
              {dirty ? 'La tournée a changé.' : `${problemCount} adresse(s) à vérifier.`}
            </Text>
            {dirty ? (
              <Button
                label="Ré-optimiser"
                icon="sparkles"
                loading={optimizing}
                onPress={optimize}
                style={styles.noticeButton}
              />
            ) : (
              <Button label="Voir" variant="ghost" onPress={() => router.push('/stops')} />
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <RouteMap
        ref={mapRef}
        stops={stops}
        numbers={numbers}
        nextStopId={nextStop?.id ?? null}
        selectedId={selectedId}
        route={route}
        fallbackCenter={position}
        edgePadding={{ top: insets.top + 90, right: 50, bottom: 340, left: 50 }}
        onSelect={(id) => {
          Keyboard.dismiss();
          setSelectedId(id);
        }}
      />

      <View style={[styles.top, { paddingTop: insets.top + Spacing.sm }]} pointerEvents="box-none">
        <Glass style={styles.searchCard} interactive>
          <AddressAutocomplete
            bare
            clearOnSelect
            placeholder="Ajouter une adresse…"
            onSelect={handleAdd}
            onFocusChange={setSearching}
          />
          {!!lastAdded && (
            <View style={styles.added}>
              <Ionicons name="checkmark-circle" size={16} color={theme.success} />
              <Text numberOfLines={1} style={[styles.addedText, { color: theme.success }]}>
                Ajouté : {lastAdded}
              </Text>
            </View>
          )}
        </Glass>

        {!searching && stops.length > 0 && (
          <View style={styles.topRow} pointerEvents="box-none">
            <Glass style={styles.pill}>
              <Text style={[styles.pillText, { color: theme.text }]}>
                {deliveredCount}/{stops.length} livrés
                {route ? ` · ~${formatDuration(route.totalDurationS)}` : ''}
              </Text>
            </Glass>
            <Pressable accessibilityLabel="Voir tous les arrêts" onPress={() => mapRef.current?.fitAll()}>
              <Glass style={styles.roundButton} interactive>
                <Ionicons name="scan-outline" size={22} color={theme.text} />
              </Glass>
            </Pressable>
          </View>
        )}
      </View>

      {!searching && (
        <BottomArea>
          <Glass style={styles.panel}>{panel}</Glass>
        </BottomArea>
      )}
    </View>
  );
}

function SelectedStopPanel({
  stop,
  number,
  onClose,
  onOpen,
  onToggleDelivered,
}: {
  stop: Stop;
  number: number | undefined;
  onClose: () => void;
  onOpen: () => void;
  onToggleDelivered: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.panelBody}>
      <View style={styles.rowCenter}>
        <Pressable onPress={onOpen} style={[styles.rowCenter, styles.flex]}>
          <StopBadge stop={stop} number={number} size={40} />
          <View style={styles.flex}>
            <Text numberOfLines={2} style={[styles.selectedAddress, { color: theme.text }]}>
              {stop.address}
            </Text>
            {!!stop.note && (
              <Text numberOfLines={2} style={[styles.panelText, { color: theme.textSecondary }]}>
                {stop.note}
              </Text>
            )}
          </View>
        </Pressable>
        <Pressable accessibilityLabel="Fermer" hitSlop={10} onPress={onClose}>
          <Ionicons name="close-circle" size={26} color={theme.muted} />
        </Pressable>
      </View>
      <View style={styles.actions}>
        {!stop.deliveredAt && (
          <Button label="Naviguer" icon="navigate" onPress={() => navigateTo(stopNavigationUrl(stop))} style={styles.flex} />
        )}
        <Button
          label={stop.deliveredAt ? 'Annuler livré' : 'Livré'}
          icon={stop.deliveredAt ? 'arrow-undo' : 'checkmark'}
          variant={stop.deliveredAt ? 'secondary' : 'success'}
          onPress={onToggleDelivered}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

function FinishedSummary({ stops }: { stops: Stop[] }) {
  const theme = useTheme();
  const times = stops.map((s) => s.deliveredAt).filter((t): t is number => t !== null);
  if (times.length === 0) return null;
  const seconds = (Math.max(...times) - Math.min(...times)) / 1000;
  return (
    <Text style={[styles.panelText, { color: theme.textSecondary }]}>
      {stops.length} arrêts livrés en {formatDuration(seconds)} (du premier au dernier livré).
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  searchCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    paddingVertical: Spacing.xs,
  },
  added: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  addedText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  pillText: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  bottomAreaAndroid: {
    paddingBottom: Spacing.md,
  },
  panel: {
    borderRadius: 28,
    padding: Spacing.lg,
  },
  panelBody: {
    gap: Spacing.md,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  panelText: {
    fontSize: 14,
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  selectedAddress: {
    fontSize: 16,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingLeft: Spacing.md,
    padding: Spacing.xs,
    borderRadius: Radius.md,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  noticeButton: {
    minHeight: 38,
  },
});
