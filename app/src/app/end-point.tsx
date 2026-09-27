import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSettingsStore } from '@/store/settings-store';
import { useTourStore } from '@/store/tour-store';
import type { EndPoint } from '@/types';

export default function EndPointScreen() {
  const theme = useTheme();
  const endPoint = useTourStore((s) => s.endPoint);
  const setEndPoint = useTourStore((s) => s.setEndPoint);
  const defaultEndAddress = useSettingsStore((s) => s.defaultEndAddress);

  const [mode, setMode] = useState<EndPoint['mode']>(endPoint.mode);
  const [customAddress, setCustomAddress] = useState(endPoint.mode === 'custom' ? endPoint.address : '');

  const canSave = mode !== 'custom' || customAddress.trim().length > 0;

  const save = () => {
    const next: EndPoint = mode === 'custom' ? { mode, address: customAddress.trim() } : { mode };
    const unchanged =
      next.mode === endPoint.mode &&
      (next.mode !== 'custom' || (endPoint.mode === 'custom' && endPoint.address === next.address));
    if (!unchanged) setEndPoint(next);
    router.back();
  };

  const options: { value: EndPoint['mode']; title: string; subtitle: string }[] = [
    {
      value: 'default',
      title: 'Arrivée par défaut',
      subtitle: defaultEndAddress || 'Non définie (à régler dans Réglages) — fin au dernier arrêt',
    },
    { value: 'none', title: 'Aucune arrivée', subtitle: 'La tournée se termine au dernier arrêt optimisé' },
    { value: 'custom', title: 'Autre adresse', subtitle: 'Seulement pour cette tournée' },
  ];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {options.map((option) => {
          const selected = option.value === mode;
          return (
            <Pressable
              key={option.value}
              onPress={() => setMode(option.value)}
              style={[
                styles.option,
                { backgroundColor: theme.card, borderColor: selected ? theme.primary : theme.border },
              ]}>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={selected ? theme.primary : theme.muted}
              />
              <View style={styles.flex}>
                <Text style={[styles.optionTitle, { color: theme.text }]}>{option.title}</Text>
                <Text style={[styles.optionSubtitle, { color: theme.textSecondary }]}>{option.subtitle}</Text>
              </View>
            </Pressable>
          );
        })}

        {mode === 'custom' && (
          <TextInput
            value={customAddress}
            onChangeText={setCustomAddress}
            autoFocus
            autoCorrect={false}
            placeholder="Adresse d’arrivée pour cette tournée"
            placeholderTextColor={theme.muted}
            style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
          />
        )}

        <Button label="Valider" icon="checkmark" size="lg" disabled={!canSave} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 2,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  optionSubtitle: {
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: 16,
  },
});
