import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { StopBadge } from '@/components/stop-badge';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { photoUri } from '@/lib/photos';
import type { Stop } from '@/types';

type Props = {
  stop: Stop;
  number: number | undefined;
  onNavigate: () => void;
  onDelivered: () => void;
  onOpen: () => void;
  /** Sans cadre ni fond : pour l'intégrer dans le panneau de la carte. */
  embedded?: boolean;
};

export function NextStopCard({ stop, number, onNavigate, onDelivered, onOpen, embedded }: Props) {
  const theme = useTheme();

  return (
    <View style={embedded ? styles.embedded : [styles.card, { backgroundColor: theme.card, borderColor: theme.warning }]}>
      <Text style={[styles.kicker, { color: theme.warning }]}>PROCHAIN ARRÊT</Text>

      <Pressable onPress={onOpen} style={styles.header}>
        <StopBadge stop={stop} number={number} isNext size={44} />
        <View style={styles.headerText}>
          <Text style={[styles.address, { color: theme.text }]} numberOfLines={3}>
            {stop.address}
          </Text>
          {!!stop.label && stop.label !== stop.address && (
            <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={1}>
              {stop.label}
            </Text>
          )}
          {!!stop.warning && (
            <Text style={[styles.label, { color: theme.warning }]} numberOfLines={2}>
              {stop.warning}
            </Text>
          )}
        </View>
        {!!stop.photo && (
          <Image source={{ uri: photoUri(stop.photo) }} style={styles.photo} contentFit="cover" />
        )}
      </Pressable>

      {!!stop.note && (
        <View style={[styles.note, { backgroundColor: theme.background }]}>
          <Text style={[styles.noteText, { color: theme.text }]}>{stop.note}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Button label="Naviguer" icon="navigate" size="lg" onPress={onNavigate} style={styles.action} />
        <Button
          label="Livré"
          icon="checkmark"
          size="lg"
          variant="success"
          onPress={onDelivered}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 2,
    gap: Spacing.md,
  },
  embedded: {
    gap: Spacing.md,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  address: {
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    fontSize: 13,
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: Radius.sm,
  },
  note: {
    padding: Spacing.md,
    borderRadius: Radius.sm,
  },
  noteText: {
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  action: {
    flex: 1,
  },
});
