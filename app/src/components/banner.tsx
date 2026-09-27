import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  tone: 'warning' | 'danger' | 'info';
  icon: ComponentProps<typeof Ionicons>['name'];
  text: string;
};

export function Banner({ tone, icon, text }: Props) {
  const theme = useTheme();
  const colors = {
    warning: { bg: theme.warningSoft, fg: theme.warning },
    danger: { bg: theme.dangerSoft, fg: theme.danger },
    info: { bg: theme.card, fg: theme.textSecondary },
  }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: colors.bg }]}>
      <Ionicons name={icon} size={18} color={colors.fg} />
      <Text style={[styles.text, { color: colors.fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
});
