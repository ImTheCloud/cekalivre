import { useState } from 'react';
import { Alert } from 'react-native';

import { optimizeTour } from '@/lib/optimize-tour';

/** Bouton "Optimiser" : lance le calcul et affiche le résultat ou l'erreur au chauffeur. */
export function useOptimize(): { optimizing: boolean; optimize: () => Promise<void> } {
  const [optimizing, setOptimizing] = useState(false);

  const optimize = async () => {
    setOptimizing(true);
    try {
      const { optimizedCount, unresolvedCount } = await optimizeTour();
      if (unresolvedCount > 0) {
        Alert.alert(
          'Tournée optimisée',
          `${optimizedCount} arrêt(s) ordonné(s).\n${unresolvedCount} adresse(s) introuvable(s) : corrige-les (en rouge) puis ré-optimise.`,
        );
      }
    } catch (e) {
      Alert.alert('Optimisation impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setOptimizing(false);
    }
  };

  return { optimizing, optimize };
}
