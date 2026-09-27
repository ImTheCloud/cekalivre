import Constants from 'expo-constants';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { checkHealth } from '@/lib/api';
import { getApiToken, getApiUrl } from '@/lib/config';
import { useSettingsStore } from '@/store/settings-store';
import { useTourStore } from '@/store/tour-store';

type Health = { state: 'idle' | 'loading' } | { state: 'ok' | 'error'; message: string };

export default function SettingsScreen() {
  const theme = useTheme();
  const defaultEndAddress = useSettingsStore((s) => s.defaultEndAddress);
  const setDefaultEndAddress = useSettingsStore((s) => s.setDefaultEndAddress);
  const [draft, setDraft] = useState(defaultEndAddress);
  const [health, setHealth] = useState<Health>({ state: 'idle' });

  const apiUrl = getApiUrl();
  const changed = draft.trim() !== defaultEndAddress;

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

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Point d’arrivée par défaut</Text>
          <Text style={[styles.help, { color: theme.textSecondary }]}>
            Utilisé pour chaque tournée (dépôt, domicile…). Tu peux le changer pour une tournée précise depuis
            l’écran Tournée. Laisse vide pour terminer au dernier arrêt.
          </Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ex. Rue du Dépôt 1, 1070 Anderlecht"
            placeholderTextColor={theme.muted}
            style={inputStyle}
            autoCorrect={false}
            returnKeyType="done"
          />
          <Button
            label={changed ? 'Enregistrer' : 'Enregistré'}
            icon="save-outline"
            disabled={!changed}
            onPress={() => {
              setDefaultEndAddress(draft);
              if (useTourStore.getState().endPoint.mode === 'default') useTourStore.getState().markDirty();
            }}
          />
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
            Géocodage et itinéraires : données © les contributeurs d’OpenStreetMap (ODbL). Navigation : Google Maps.
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
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
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
