import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { NextStopCard } from '@/components/next-stop-card';
import { StopRow } from '@/components/stop-row';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, formatDuration, formatTime } from '@/lib/format';
import {
  MAX_WAYPOINTS,
  multiStopNavigationUrl,
  openInGoogleMaps,
  stopNavigationUrl,
} from '@/lib/google-maps';
import { optimizeTour } from '@/lib/optimize-tour';
import { stopNumbers } from '@/lib/stop-numbers';
import { useSettingsStore } from '@/store/settings-store';
import { selectNextStop, useTourStore } from '@/store/tour-store';
import type { EndPoint, Stop } from '@/types';

type Filter = 'todo' | 'all';

function endPointLabel(endPoint: EndPoint, defaultEndAddress: string): string {
  if (endPoint.mode === 'custom') return endPoint.address;
  if (endPoint.mode === 'default' && defaultEndAddress) return defaultEndAddress;
  return 'Aucune — fin au dernier arrêt';
}

async function navigate(url: string | null) {
  if (!url) return;
  try {
    await openInGoogleMaps(url);
  } catch {
    Alert.alert('Google Maps', "Impossible d'ouvrir Google Maps sur ce téléphone.");
  }
}

export default function TourScreen() {
  const theme = useTheme();
  const stops = useTourStore((s) => s.stops);
  const route = useTourStore((s) => s.route);
  const dirty = useTourStore((s) => s.dirty);
  const endPoint = useTourStore((s) => s.endPoint);
  const toggleDelivered = useTourStore((s) => s.toggleDelivered);
  const resetTour = useTourStore((s) => s.resetTour);
  const defaultEndAddress = useSettingsStore((s) => s.defaultEndAddress);

  const [optimizing, setOptimizing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const numbers = useMemo(() => stopNumbers(stops, route !== null), [stops, route]);
  const nextStop = useMemo(() => selectNextStop({ stops, route }), [stops, route]);
  const delivered = stops.filter((s) => s.deliveredAt);
  const remainingLocated = stops.filter((s) => !s.deliveredAt && s.location);
  const unresolvedCount = stops.filter((s) => s.notFound).length;
  const warningCount = stops.filter((s) => !s.deliveredAt && s.warning).length;
  const finished = route !== null && stops.length > 0 && delivered.length === stops.length;
  const visibleStops = filter === 'todo' ? stops.filter((s) => !s.deliveredAt) : stops;

  const handleOptimize = async () => {
    setOptimizing(true);
    try {
      const { optimizedCount, unresolvedCount: missing } = await optimizeTour();
      if (missing > 0) {
        Alert.alert(
          'Tournée optimisée',
          `${optimizedCount} arrêt(s) ordonné(s).\n${missing} adresse(s) introuvable(s) : corrige-les (en rouge) puis ré-optimise.`,
        );
      }
    } catch (e) {
      Alert.alert('Optimisation impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setOptimizing(false);
    }
  };

  const handleReset = () => {
    Alert.alert('Nouvelle tournée', 'Supprimer tous les arrêts, notes et photos de la tournée actuelle ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Tout supprimer', style: 'destructive', onPress: resetTour },
    ]);
  };

  const openStop = useCallback((id: string) => router.push({ pathname: '/stop/[id]', params: { id } }), []);
  const navigateTo = useCallback(
    (id: string) => {
      const stop = stops.find((s) => s.id === id);
      if (stop) navigate(stopNavigationUrl(stop));
    },
    [stops],
  );

  const renderItem = useCallback(
    ({ item }: { item: Stop }) => (
      <StopRow
        stop={item}
        number={numbers.get(item.id)}
        isNext={item.id === nextStop?.id}
        onPress={openStop}
        onToggleDelivered={toggleDelivered}
        onNavigate={navigateTo}
      />
    ),
    [numbers, nextStop?.id, openStop, toggleDelivered, navigateTo],
  );

  const header = (
    <View style={styles.header}>
      {stops.length > 0 && (
        <View style={[styles.progressCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.progressRow}>
            <Text style={[styles.progressCount, { color: theme.text }]}>
              {delivered.length}/{stops.length}
            </Text>
            <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>arrêts livrés</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.background }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: theme.success, width: `${(delivered.length / stops.length) * 100}%` },
              ]}
            />
          </View>
          {route && (
            <Text style={[styles.routeInfo, { color: theme.textSecondary }]}>
              Estimation : {formatDuration(route.totalDurationS)} de route · {formatDistance(route.totalDistanceM)}
              {route.matrixSource === 'haversine' ? ' (à vol d’oiseau)' : ''}
            </Text>
          )}
        </View>
      )}

      {dirty && <Banner tone="warning" icon="refresh" text="La tournée a changé depuis l'optimisation : ré-optimise." />}
      {unresolvedCount > 0 && (
        <Banner
          tone="danger"
          icon="alert-circle"
          text={`${unresolvedCount} adresse(s) introuvable(s). Touche-les pour les corriger.`}
        />
      )}
      {warningCount > 0 && (
        <Banner
          tone="warning"
          icon="location"
          text={`${warningCount} adresse(s) à vérifier (en orange) : la position trouvée est peut-être fausse.`}
        />
      )}

      {finished && (
        <View style={[styles.finishedCard, { backgroundColor: theme.successSoft }]}>
          <Ionicons name="trophy" size={28} color={theme.success} />
          <View style={styles.flex}>
            <Text style={[styles.finishedTitle, { color: theme.success }]}>Tournée terminée</Text>
            <FinishedSummary stops={stops} color={theme.success} />
          </View>
        </View>
      )}

      {nextStop && (
        <>
          <NextStopCard
            stop={nextStop}
            number={numbers.get(nextStop.id)}
            onOpen={() => openStop(nextStop.id)}
            onNavigate={() => navigate(stopNavigationUrl(nextStop))}
            onDelivered={() => toggleDelivered(nextStop.id)}
          />
          {remainingLocated.length > 1 && (
            <Button
              variant="ghost"
              icon="git-branch-outline"
              label={`Naviguer les ${Math.min(remainingLocated.length, MAX_WAYPOINTS + 1)} prochains d'affilée`}
              onPress={() => navigate(multiStopNavigationUrl(remainingLocated))}
            />
          )}
        </>
      )}

      {stops.length > 0 && (
        <View style={[styles.segment, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {(['all', 'todo'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setFilter(value)}
              style={[styles.segmentItem, filter === value && { backgroundColor: theme.primary }]}>
              <Text style={[styles.segmentText, { color: filter === value ? theme.primaryText : theme.text }]}>
                {value === 'all' ? `Tous (${stops.length})` : `À livrer (${stops.length - delivered.length})`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <TabsHeaderActions onReset={stops.length > 0 ? handleReset : undefined} />

      <FlatList
        data={visibleStops}
        keyExtractor={(s) => s.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          stops.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={56} color={theme.muted} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Aucun arrêt pour aujourd’hui</Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Colle la liste de tes adresses (une par ligne), puis appuie sur « Optimiser ».
              </Text>
            </View>
          ) : null
        }
      />

      <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <Pressable onPress={() => router.push('/end-point')} style={styles.endRow}>
          <Ionicons name="flag-outline" size={16} color={theme.textSecondary} />
          <Text numberOfLines={1} style={[styles.endText, { color: theme.textSecondary }]}>
            Arrivée : {endPointLabel(endPoint, defaultEndAddress)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </Pressable>
        <View style={styles.footerButtons}>
          <Button
            label="Ajouter"
            icon="add"
            variant="secondary"
            size="lg"
            onPress={() => router.push('/add')}
            style={styles.flex}
          />
          <Button
            label={optimizing ? 'Calcul…' : route ? 'Ré-optimiser' : 'Optimiser'}
            icon="sparkles"
            size="lg"
            loading={optimizing}
            disabled={stops.length === 0 || delivered.length === stops.length}
            onPress={handleOptimize}
            style={styles.flex}
          />
        </View>
      </View>
    </View>
  );
}

function Separator() {
  return <View style={{ height: Spacing.sm }} />;
}

/** Bouton "Nouvelle tournée" dans l'en-tête de l'onglet. */
function TabsHeaderActions({ onReset }: { onReset?: () => void }) {
  const theme = useTheme();
  return (
    <Tabs.Screen
      options={{
        headerRight: onReset
          ? () => (
              <Pressable onPress={onReset} hitSlop={10} style={styles.headerButton}>
                <Ionicons name="trash-outline" size={22} color={theme.danger} />
              </Pressable>
            )
          : undefined,
      }}
    />
  );
}

function FinishedSummary({ stops, color }: { stops: Stop[]; color: string }) {
  const times = stops.map((s) => s.deliveredAt).filter((t): t is number => t !== null);
  if (times.length === 0) return null;
  const first = Math.min(...times);
  const last = Math.max(...times);
  return (
    <Text style={{ color }}>
      {`${stops.length} arrêts livrés entre ${formatTime(first)} et ${formatTime(last)} (${formatDuration((last - first) / 1000)}).`}
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
  listContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  header: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerButton: {
    paddingHorizontal: Spacing.lg,
  },
  progressCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
  },
  progressCount: {
    fontSize: 34,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  progressLabel: {
    fontSize: 15,
  },
  progressTrack: {
    height: 8,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  routeInfo: {
    fontSize: 13,
  },
  finishedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
  },
  finishedTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  segment: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
  footer: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  endRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  endText: {
    flex: 1,
    fontSize: 14,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
});
