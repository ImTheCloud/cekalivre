import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { Button } from '@/components/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { checkHealth } from '@/lib/api';
import { getApiToken, getApiUrl } from '@/lib/config';
import { useSettingsStore } from '@/store/settings-store';
import { useTourStore } from '@/store/tour-store';
import type { AddressChoice } from '@/types';

type Health = { state: 'idle' | 'loading' } | { state: 'ok' | 'error'; message: string };

export default function SettingsScreen() {
  const theme = useTheme();
  const defaultEndAddress = useSettingsStore((s) => s.defaultEndAddress);
  const defaultEndLocation = useSettingsStore((s) => s.defaultEndLocation);
  const setDefaultEnd = useSettingsStore((s) => s.setDefaultEnd);
  const [health, setHealth] = useState<Health>({ state: 'idle' });
  // Change la clé du champ pour le vider après "Supprimer".
  const [fieldKey, setFieldKey] = useState(0);

  const apiUrl = getApiUrl();

  const saveDefaultEnd = (choice: AddressChoice | null) => {
    setDefaultEnd(choice);
    // L'arrivée change : l'ordre calculé n'est plus forcément le bon.
    if (useTourStore.getState().endPoint.mode === 'default') useTourStore.getState().markDirty();
  };

  const testConnection = async () => {
    setHealth({ state: 'loading' });
    try {
      const result = await checkHealth();
      const routing =
        result.matrixSource === 'osrm' ? 'temps de trajet routiers (OSRM)' : 'estimation à vol d’oiseau (OSRM non configuré)';
      setHealth({ state: 'ok', message: `Serveur joignable — ${routing}.` });
    } catch (e) {
      setHealth({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Point d’arrivée par défaut</Text>
          <Text style={[styles.help, { color: theme.textSecondary }]}>
            Utilisé pour chaque tournée (dépôt, domicile…). Tu peux le changer pour une tournée précise depuis la
            carte ou l’onglet Arrêts. Sans arrivée, la tournée se termine au dernier arrêt.
          </Text>
          <AddressAutocomplete
            key={fieldKey}
            placeholder="Recherche l’adresse du dépôt…"
            initialValue={defaultEndAddress}
            onSelect={saveDefaultEnd}
          />
          {!!defaultEndAddress && (
            <View style={styles.savedRow}>
              <Ionicons
                name={defaultEndLocation ? 'checkmark-circle' : 'time-outline'}
                size={16}
                color={defaultEndLocation ? theme.success : theme.textSecondary}
              />
              <Text style={[styles.help, styles.flex, { color: theme.textSecondary }]}>
                {defaultEndLocation ? 'Enregistrée et localisée.' : 'Enregistrée (sera localisée à l’optimisation).'}
              </Text>
              <Button
                label="Supprimer"
                variant="ghost"
                onPress={() => {
                  saveDefaultEnd(null);
                  setFieldKey((k) => k + 1);
                }}
              />
            </View>
          )}
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Serveur d’optimisation</Text>
          <Row label="Adresse" value={apiUrl ?? 'non configurée'} />
          <Row label="Jeton API" value={getApiToken() ? 'configuré' : 'aucun'} />
          <Button
            label="Tester la connexion"
            icon="pulse"
            variant="secondary"
            loading={health.state === 'loading'}
            onPress={testConnection}
          />
          {(health.state === 'ok' || health.state === 'error') && (
            <Text style={{ color: health.state === 'ok' ? theme.success : theme.danger }}>{health.message}</Text>
          )}
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>À propos</Text>
          <Row label="Version" value={Constants.expoConfig?.version ?? '—'} />
          <Text style={[styles.help, { color: theme.textSecondary }]}>
            Adresses et itinéraires : données © les contributeurs d’OpenStreetMap (ODbL). Navigation : Google Maps.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.text }]} numberOfLines={1} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: 120,
  },
  section: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  help: {
    fontSize: 14,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  rowLabel: {
    fontSize: 15,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
});
