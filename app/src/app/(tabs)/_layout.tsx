import Ionicons from '@expo/vector-icons/Ionicons';
import { VectorIcon } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/hooks/use-theme';
import { useTourStore } from '@/store/tour-store';

/**
 * Barre d'onglets native : sur iOS 26 c'est la barre système en Liquid Glass,
 * sur Android la barre Material. Icônes : SF Symbols (iOS), Ionicons (Android).
 */
export default function TabsLayout() {
  const theme = useTheme();
  const remaining = useTourStore((s) => s.stops.filter((stop) => !stop.deliveredAt).length);

  return (
    <NativeTabs tintColor={theme.primary} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Carte</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'map', selected: 'map.fill' }}
          src={<VectorIcon family={Ionicons} name="map" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="stops">
        <NativeTabs.Trigger.Label>Arrêts</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.number" src={<VectorIcon family={Ionicons} name="list" />} />
        {remaining > 0 && <NativeTabs.Trigger.Badge>{String(remaining)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Réglages</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" src={<VectorIcon family={Ionicons} name="settings-outline" />} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
