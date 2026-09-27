import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatTime } from '@/lib/format';
import { openInGoogleMaps, stopNavigationUrl } from '@/lib/google-maps';
import { photoUri, pickParcelPhoto, takeParcelPhoto } from '@/lib/photos';
import { stopNumbers } from '@/lib/stop-numbers';
import { useTourStore } from '@/store/tour-store';
import type { Stop } from '@/types';

const PRECISION_LABEL: Record<NonNullable<Stop['precision']>, string> = {
  exact: 'Adresse exacte',
  street: 'Rue trouvée, numéro approximatif',
  approximate: 'Position approximative (quartier / commune)',
};

export default function StopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const stops = useTourStore((s) => s.stops);
  const route = useTourStore((s) => s.route);
  const stop = stops.find((s) => s.id === id);
  const number = useMemo(() => stopNumbers(stops, route !== null).get(id), [stops, route, id]);

  if (!stop) {
    return (
      <View style={[styles.missing, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>Cet arrêt n’existe plus.</Text>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  return <StopDetails key={stop.id} stop={stop} number={number} />;
}

function StopDetails({ stop, number }: { stop: Stop; number: number | undefined }) {
  const theme = useTheme();
  const updateAddress = useTourStore((s) => s.updateAddress);
  const updateNote = useTourStore((s) => s.updateNote);
  const setPhoto = useTourStore((s) => s.setPhoto);
  const duplicateStop = useTourStore((s) => s.duplicateStop);
  const removeStop = useTourStore((s) => s.removeStop);
  const toggleDelivered = useTourStore((s) => s.toggleDelivered);

  const [address, setAddress] = useState(stop.address);
  const [photoBusy, setPhotoBusy] = useState(false);
  const addressChanged = address.trim() !== stop.address && address.trim().length > 0;

  const handlePhoto = async (source: 'camera' | 'library') => {
    setPhotoBusy(true);
    try {
      const name = source === 'camera' ? await takeParcelPhoto() : await pickParcelPhoto();
      if (name) setPhoto(stop.id, name);
    } catch (e) {
      Alert.alert('Photo', e instanceof Error ? e.message : String(e));
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleNavigate = async () => {
    try {
      await openInGoogleMaps(stopNavigationUrl(stop));
    } catch {
      Alert.alert('Google Maps', "Impossible d'ouvrir Google Maps sur ce téléphone.");
    }
  };

  const handleDuplicate = () => {
    duplicateStop(stop.id);
    Alert.alert('Arrêt dupliqué', 'Une copie a été ajoutée juste après cet arrêt (même adresse, sans note ni photo).');
  };

  const handleDelete = () => {
    Alert.alert('Supprimer cet arrêt ?', stop.address, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          router.back();
          removeStop(stop.id);
        },
      },
    ]);
  };

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: number ? `Arrêt n° ${number}` : 'Arrêt' }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {stop.deliveredAt && (
          <Banner tone="info" icon="checkmark-circle" text={`Livré à ${formatTime(stop.deliveredAt)}`} />
        )}
        {stop.notFound && (
          <Banner
            tone="danger"
            icon="alert-circle"
            text="Adresse introuvable. Corrige-la (rue, numéro, code postal, commune) puis ré-optimise."
          />
        )}
        {!!stop.warning && !stop.notFound && <Banner tone="warning" icon="location" text={stop.warning} />}

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Adresse</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            multiline
            autoCorrect={false}
            style={inputStyle}
          />
          {addressChanged && (
            <Button label="Enregistrer l’adresse" icon="save-outline" onPress={() => updateAddress(stop.id, address.trim())} />
          )}
          {!!stop.label && (
            <Text style={[styles.meta, { color: theme.textSecondary }]}>
              Reconnue comme : {stop.label}
              {stop.precision && !stop.warning ? `\n${PRECISION_LABEL[stop.precision]}` : ''}
            </Text>
          )}
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Note</Text>
          <TextInput
            value={stop.note}
            onChangeText={(note) => updateNote(stop.id, note)}
            multiline
            placeholder="Ex. gros carton, fond du camion à gauche, sonner 2 fois…"
            placeholderTextColor={theme.muted}
            style={inputStyle}
          />
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Photo du colis</Text>
          {stop.photo ? (
            <Image source={{ uri: photoUri(stop.photo) }} style={styles.photo} contentFit="cover" />
          ) : (
            <View style={[styles.photoPlaceholder, { backgroundColor: theme.background }]}>
              <Ionicons name="camera-outline" size={32} color={theme.muted} />
            </View>
          )}
          <View style={styles.row}>
            <Button
              label={stop.photo ? 'Reprendre' : 'Prendre une photo'}
              icon="camera"
              variant="secondary"
              loading={photoBusy}
              onPress={() => handlePhoto('camera')}
              style={styles.flex}
            />
            <Button
              label="Galerie"
              icon="images-outline"
              variant="secondary"
              disabled={photoBusy}
              onPress={() => handlePhoto('library')}
            />
          </View>
          {stop.photo && (
            <Button label="Supprimer la photo" icon="trash-outline" variant="ghost" onPress={() => setPhoto(stop.id, null)} />
          )}
        </View>

        <View style={styles.actions}>
          {!stop.deliveredAt && (
            <Button label="Naviguer avec Google Maps" icon="navigate" size="lg" onPress={handleNavigate} />
          )}
          {!stop.notFound && (
            <Button
              label={stop.deliveredAt ? 'Annuler la livraison' : 'Marquer comme livré'}
              icon={stop.deliveredAt ? 'arrow-undo' : 'checkmark'}
              variant={stop.deliveredAt ? 'secondary' : 'success'}
              size="lg"
              onPress={() => toggleDelivered(stop.id)}
            />
          )}
          <View style={styles.row}>
            <Button
              label="Dupliquer"
              icon="copy-outline"
              variant="secondary"
              onPress={handleDuplicate}
              style={styles.flex}
            />
            <Button label="Supprimer" icon="trash-outline" variant="danger" onPress={handleDelete} style={styles.flex} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: 48,
  },
  section: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: 16,
    minHeight: 48,
  },
  meta: {
    fontSize: 13,
    lineHeight: 19,
  },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Radius.md,
  },
  photoPlaceholder: {
    height: 120,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  actions: {
    gap: Spacing.md,
  },
});
