import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import type { Stop } from '@/types';

type Props = {
  stop: Stop;
  number: number | undefined;
  isNext?: boolean;
  size?: number;
};

/** Pastille ronde avec le numéro de passage, colorée selon l'état de l'arrêt. */
export function StopBadge({ stop, number, isNext, size = 34 }: Props) {
  const theme = useTheme();

  let background: string = theme.primary;
  if (stop.deliveredAt) background = theme.success;
  else if (stop.notFound) background = theme.danger;
  else if (number === undefined) background = theme.muted;
  else if (isNext) background = theme.warning;

  return (
    <View
      style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}>
      {stop.deliveredAt ? (
        <Ionicons name="checkmark" size={size * 0.55} color="#FFFFFF" />
      ) : stop.notFound ? (
        <Ionicons name="alert" size={size * 0.55} color="#FFFFFF" />
      ) : (
        <Text style={[styles.text, { fontSize: size * 0.42 }]}>{number ?? '•'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
