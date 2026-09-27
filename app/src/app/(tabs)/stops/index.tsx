import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { StopRow } from '@/components/stop-row';
import { Radius, Spacing } from '@/constants/theme';
import { useOptimize } from '@/hooks/use-optimize';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, formatDuration } from '@/lib/format';
import { MAX_WAYPOINTS, multiStopNavigationUrl, navigateTo, stopNavigationUrl } from '@/lib/google-maps';
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

export default function StopsScreen() {
  const theme = useTheme();
  const stops = useTourStore((s) => s.stops);
  const route = useTourStore((s) => s.route);
  const dirty = useTourStore((s) => s.dirty);
  const endPoint = useTourStore((s) => s.endPoint);
  const toggleDelivered = useTourStore((s) => s.toggleDelivered);
  const resetTour = useTourStore((s) => s.resetTour);
  const defaultEndAddress = useSettingsStore((s) => s.defaultEndAddress);
  const { optimizing, optimize } = useOptimize();
  const [filter, setFilter] = useState<Filter>('all');

  const numbers = useMemo(() => stopNumbers(stops, route !== null), [stops, route]);
  const nextStop = useMemo(() => selectNextStop({ stops, route }), [stops, route]);
  const deliveredCount = stops.filter((s) => s.deliveredAt).length;
  const pendingCount = stops.length - deliveredCount;
  const remainingLocated = stops.filter((s) => !s.deliveredAt && s.location);
  const unresolvedCount = stops.filter((s) => s.notFound).length;
  const warningCount = stops.filter((s) => !s.deliveredAt && s.warning).length;
  const visibleStops = filter === 'todo' ? stops.filter((s) => !s.deliveredAt) : stops;

  const handleReset = () => {
    Alert.alert('Nouvelle tournée', 'Supprimer tous les arrêts, notes et photos de la tournée actuelle ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Tout supprimer', style: 'destructive', onPress: resetTour },
    ]);
  };

  const openStop = useCallback((id: string) => router.push({ pathname: '/stop/[id]', params: { id } }), []);
  const navigateToStop = useCallback(
    (id: string) => {
      const stop = stops.find((s) => s.id === id);
      if (stop) navigateTo(stopNavigationUrl(stop));
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
        onNavigate={navigateToStop}
      />
    ),
    [numbers, nextStop?.id, openStop, toggleDelivered, navigateToStop],
  );

  const header = (
    <View style={styles.header}>
      {stops.length > 0 && (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.progressRow}>
            <Text style={[styles.progressCount, { color: theme.text }]}>
              {deliveredCount}/{stops.length}
            </Text>
            <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>arrêts livrés</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.background }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: theme.success, width: `${(deliveredCount / stops.length) * 100}%` },
              ]}
            />
          </View>
          {route && (
            <Text style={[styles.small, { color: theme.textSecondary }]}>
              Estimation : {formatDuration(route.totalDurationS)} de route · {formatDistance(route.totalDistanceM)}
              {route.matrixSource === 'haversine' ? ' (à vol d’oiseau)' : ''}
            </Text>
          )}
          <Pressable onPress={() => router.push('/end-point')} style={styles.endRow}>
            <Ionicons name="flag-outline" size={16} color={theme.textSecondary} />
            <Text numberOfLines={1} style={[styles.small, styles.flex, { color: theme.textSecondary }]}>
              Arrivée : {endPointLabel(endPoint, defaultEndAddress)}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </Pressable>
          {pendingCount > 0 && (!route || dirty) && (
            <Button
              label={optimizing ? 'Calcul…' : route ? 'Ré-optimiser' : 'Optimiser la tournée'}
              icon="sparkles"
              size="lg"
              loading={optimizing}
              onPress={optimize}
            />
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

      {route && remainingLocated.length > 1 && (
        <Button
          variant="ghost"
          icon="git-branch-outline"
          label={`Naviguer les ${Math.min(remainingLocated.length, MAX_WAYPOINTS + 1)} prochains d'affilée`}
          onPress={() => navigateTo(multiStopNavigationUrl(remainingLocated))}
        />
      )}

      {stops.length > 0 && (
        <View style={[styles.segment, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {(['all', 'todo'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setFilter(value)}
              style={[styles.segmentItem, filter === value && { backgroundColor: theme.primary }]}>
              <Text style={[styles.segmentText, { color: filter === value ? theme.primaryText : theme.text }]}>
                {value === 'all' ? `Tous (${stops.length})` : `À livrer (${pendingCount})`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerButtons}>
              {stops.length > 0 && (
                <Pressable accessibilityLabel="Nouvelle tournée" onPress={handleReset} hitSlop={10}>
                  <Ionicons name="trash-outline" size={22} color={theme.danger} />
                </Pressable>
              )}
              <Pressable accessibilityLabel="Ajouter des arrêts" onPress={() => router.push('/add')} hitSlop={10}>
                <Ionicons name="add-circle" size={28} color={theme.primary} />
              </Pressable>
            </View>
          ),
        }}
      />
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
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
                Ajoute des adresses depuis la carte ou avec le bouton +.
              </Text>
              <Button label="Ajouter des arrêts" icon="add" onPress={() => router.push('/add')} />
            </View>
          ) : null
        }
      />
    </>
  );
}

function Separator() {
  return <View style={{ height: Spacing.sm }} />;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.lg,
    paddingBottom: 120,
  },
  header: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  card: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.md,
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
  small: {
    fontSize: 13,
  },
  endRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
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
    paddingTop: 60,
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
});
