import { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { LatLng, RouteSummary, Stop } from '@/types';

export type RouteMapHandle = { fitAll: () => void };

type Props = {
  stops: Stop[];
  numbers: Map<string, number>;
  nextStopId: string | null;
  selectedId: string | null;
  route: RouteSummary | null;
  onSelect: (id: string | null) => void;
  /** Centre de la carte quand aucun arrêt n'est positionné (position du chauffeur). */
  fallbackCenter?: LatLng | null;
  /** Marges (px) laissées libres par les éléments posés sur la carte (recherche, panneau). */
  edgePadding?: { top: number; right: number; bottom: number; left: number };
};

/** react-native-maps ne fonctionne pas sur le web : l'app cible uniquement Android et iOS. */
export const RouteMap = forwardRef<RouteMapHandle, Props>(function RouteMap(_props, ref) {
  useImperativeHandle(ref, () => ({ fitAll: () => {} }));
  return (
    <View style={styles.container}>
      <Text>La carte est disponible uniquement sur téléphone.</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
