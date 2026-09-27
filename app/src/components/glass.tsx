import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

// Liquid Glass : iOS 26 et plus. Ailleurs (Android, iOS plus ancien) : carte opaque avec ombre.
const liquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
};

export function Glass({ children, style, interactive }: Props) {
  const theme = useTheme();
  if (liquidGlass) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive={interactive} style={style}>
        {children}
      </GlassView>
    );
  }
  return <View style={[styles.fallback, { backgroundColor: theme.card }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  fallback: {
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
});
