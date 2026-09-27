import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StopBadge } from '@/components/stop-badge';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Stop } from '@/types';

type Props = {
  stop: Stop;
  number: number | undefined;
  isNext: boolean;
  onPress: (id: string) => void;
  onToggleDelivered: (id: string) => void;
  onNavigate: (id: string) => void;
};

function StopRowComponent({ stop, number, isNext, onPress, onToggleDelivered, onNavigate }: Props) {
  const theme = useTheme();
  const delivered = !!stop.deliveredAt;
  const warning = stop.notFound
    ? 'Adresse introuvable — touche pour la corriger'
    : stop.suspicious
      ? 'Loin du départ — vérifie l’adresse'
      : stop.precision && stop.precision !== 'exact'
        ? 'Position approximative'
        : null;

  return (
    <Pressable
      onPress={() => onPress(stop.id)}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.card,
          borderColor: isNext ? theme.warning : theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <StopBadge stop={stop} number={number} isNext={isNext} />

      <View style={styles.body}>
        <Text
          numberOfLines={2}
          style={[
            styles.address,
            { color: delivered ? theme.muted : theme.text },
            delivered && styles.strike,
          ]}>
          {stop.address}
        </Text>
        {!!stop.note && (
          <Text numberOfLines={1} style={[styles.note, { color: theme.textSecondary }]}>
            {stop.note}
          </Text>
        )}
        <View style={styles.meta}>
          {!!stop.photo && <Ionicons name="camera" size={14} color={theme.textSecondary} />}
          {!!warning && !delivered && (
            <Text numberOfLines={1} style={[styles.warning, { color: stop.notFound ? theme.danger : theme.warning }]}>
              {warning}
            </Text>
          )}
        </View>
      </View>

      {!!stop.location && !delivered && (
        <Pressable
          accessibilityLabel="Naviguer vers cet arrêt"
          hitSlop={8}
          onPress={() => onNavigate(stop.id)}
          style={[styles.iconButton, { backgroundColor: theme.background }]}>
          <Ionicons name="navigate" size={20} color={theme.primary} />
        </Pressable>
      )}
      {!stop.notFound && (
        <Pressable
          accessibilityLabel={delivered ? 'Annuler la livraison' : 'Marquer comme livré'}
          hitSlop={8}
          onPress={() => onToggleDelivered(stop.id)}
          style={[styles.iconButton, { backgroundColor: delivered ? theme.successSoft : theme.background }]}>
          <Ionicons
            name={delivered ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={delivered ? theme.success : theme.muted}
          />
        </Pressable>
      )}
    </Pressable>
  );
}

export const StopRow = memo(StopRowComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  address: {
    fontSize: 15,
    fontWeight: '600',
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  note: {
    fontSize: 13,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  warning: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
