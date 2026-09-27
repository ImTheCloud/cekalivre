import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { Button } from '@/components/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseAddresses } from '@/lib/parse-addresses';
import { useTourStore } from '@/store/tour-store';
import type { AddressChoice } from '@/types';

/** Ajout d'arrêts : recherche avec suggestions (par défaut) ou collage d'une liste, une adresse par ligne. */
export default function AddStopsScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [pasteMode, setPasteMode] = useState(mode === 'paste');

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
      {pasteMode ? (
        <PasteList onSwitch={() => setPasteMode(false)} />
      ) : (
        <SearchAdd onSwitch={() => setPasteMode(true)} />
      )}
    </KeyboardAvoidingView>
  );
}

function SearchAdd({ onSwitch }: { onSwitch: () => void }) {
  const theme = useTheme();
  const addStops = useTourStore((s) => s.addStops);
  const [added, setAdded] = useState<string[]>([]);

  const add = (choice: AddressChoice) => {
    addStops([choice]);
    setAdded((previous) => [choice.address, ...previous]);
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <AddressAutocomplete
            bare
            autoFocus
            clearOnSelect
            placeholder="Tape le début de l’adresse…"
            onSelect={add}
          />
        </View>
        <Text style={[styles.help, { color: theme.textSecondary }]}>
          Choisis la bonne suggestion : l’arrêt est ajouté et tu peux taper l’adresse suivante. Plusieurs colis à la
          même adresse ? Ajoute-la plusieurs fois.
        </Text>

        {added.length > 0 && (
          <View style={styles.added}>
            <Text style={[styles.addedTitle, { color: theme.text }]}>
              {added.length} arrêt{added.length > 1 ? 's' : ''} ajouté{added.length > 1 ? 's' : ''}
            </Text>
            {added.map((address, index) => (
              <View key={`${index}-${address}`} style={styles.addedRow}>
                <Ionicons name="checkmark-circle" size={18} color={theme.success} />
                <Text numberOfLines={1} style={[styles.addedText, { color: theme.textSecondary }]}>
                  {address}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Button label="Coller une liste d’adresses" icon="clipboard-outline" variant="ghost" onPress={onSwitch} />
      </ScrollView>
      <View style={styles.footer}>
        <Button label="Terminé" icon="checkmark" size="lg" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

function PasteList({ onSwitch }: { onSwitch: () => void }) {
  const theme = useTheme();
  const addAddresses = useTourStore((s) => s.addAddresses);
  const [text, setText] = useState('');
  const addresses = useMemo(() => parseAddresses(text), [text]);

  const submit = () => {
    if (addresses.length === 0) return;
    addAddresses(addresses);
    router.back();
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.flex, styles.pasteContainer, { backgroundColor: theme.background }]}>
      <Text style={[styles.help, { color: theme.textSecondary }]}>
        Colle ta liste, <Text style={styles.bold}>une adresse par ligne</Text>, avec le code postal pour une meilleure
        précision. Les adresses seront localisées au moment d’optimiser.
      </Text>

      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        autoCorrect={false}
        autoCapitalize="words"
        textAlignVertical="top"
        placeholder={'Rue de la Loi 16, 1000 Bruxelles\nKerkstraat 12, 9000 Gent\n…'}
        placeholderTextColor={theme.muted}
        style={[styles.textarea, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
      />

      <Button label="Rechercher une adresse à la place" icon="search" variant="ghost" onPress={onSwitch} />
      <Button
        label={addresses.length > 0 ? `Ajouter ${addresses.length} arrêt${addresses.length > 1 ? 's' : ''}` : 'Ajouter'}
        icon="add-circle"
        size="lg"
        disabled={addresses.length === 0}
        onPress={submit}
      />
    </SafeAreaView>
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
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.xs,
  },
  help: {
    fontSize: 14,
    lineHeight: 20,
  },
  bold: {
    fontWeight: '700',
  },
  added: {
    gap: Spacing.sm,
  },
  addedTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  addedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  addedText: {
    flex: 1,
    fontSize: 14,
  },
  footer: {
    padding: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  pasteContainer: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  textarea: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: 16,
    lineHeight: 24,
  },
});
