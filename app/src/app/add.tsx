import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseAddresses } from '@/lib/parse-addresses';
import { useTourStore } from '@/store/tour-store';

export default function AddAddressesScreen() {
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
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
      <SafeAreaView edges={['bottom']} style={styles.container}>
        <Text style={[styles.help, { color: theme.textSecondary }]}>
          Colle ta liste ou tape les adresses, <Text style={styles.bold}>une par ligne</Text>. Mets le code postal
          pour une meilleure précision. Plusieurs colis à la même adresse ? Répète la ligne ou utilise « Dupliquer »
          ensuite.
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
          style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
        />

        <View style={styles.footer}>
          <Button
            label={addresses.length > 0 ? `Ajouter ${addresses.length} arrêt${addresses.length > 1 ? 's' : ''}` : 'Ajouter'}
            icon="add-circle"
            size="lg"
            disabled={addresses.length === 0}
            onPress={submit}
          />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  help: {
    fontSize: 14,
    lineHeight: 20,
  },
  bold: {
    fontWeight: '700',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: 16,
    lineHeight: 24,
  },
  footer: {
    paddingBottom: Spacing.sm,
  },
});
