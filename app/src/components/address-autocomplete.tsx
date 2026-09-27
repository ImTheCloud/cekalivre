import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useAddressSuggestions } from '@/hooks/use-address-suggestions';
import { useApproxPosition } from '@/hooks/use-approx-position';
import { useTheme } from '@/hooks/use-theme';
import type { AddressSuggestion } from '@/lib/api';
import type { AddressChoice } from '@/types';

type Props = {
  placeholder: string;
  onSelect: (choice: AddressChoice) => void;
  initialValue?: string;
  /** Vide le champ après un choix (pour enchaîner les adresses) et garde le clavier ouvert. */
  clearOnSelect?: boolean;
  autoFocus?: boolean;
  /** Sans bordure ni fond (quand le champ est posé sur une carte "verre"). */
  bare?: boolean;
  onFocusChange?: (focused: boolean) => void;
  style?: StyleProp<ViewStyle>;
};

function toChoice(s: AddressSuggestion): AddressChoice {
  return { address: s.address, location: s.location, label: s.address, precision: s.precision };
}

/** Champ d'adresse avec suggestions pendant la frappe, comme dans Google Maps. */
export function AddressAutocomplete({
  placeholder,
  onSelect,
  initialValue = '',
  clearOnSelect,
  autoFocus,
  bare,
  onFocusChange,
  style,
}: Props) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const near = useApproxPosition();
  const [text, setText] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  // Texte correspondant au dernier choix : pas besoin de reproposer des suggestions.
  const [chosenText, setChosenText] = useState(initialValue);

  const searching = focused && text !== chosenText;
  const { suggestions, loading, error } = useAddressSuggestions(text, searching, near);
  const canUseFreeText = searching && text.trim().length >= 3;

  const setFocus = (value: boolean) => {
    setFocused(value);
    onFocusChange?.(value);
  };

  const choose = (choice: AddressChoice) => {
    onSelect(choice);
    if (clearOnSelect) {
      setText('');
      setChosenText('');
    } else {
      setText(choice.address);
      setChosenText(choice.address);
      inputRef.current?.blur();
      Keyboard.dismiss();
    }
  };

  const listVisible = searching && (suggestions.length > 0 || loading || !!error || canUseFreeText);

  return (
    <View style={style}>
      <View
        style={[
          styles.inputRow,
          !bare && { backgroundColor: theme.background, borderColor: focused ? theme.primary : theme.border },
          !bare && styles.inputRowBordered,
        ]}>
        <Ionicons name="search" size={18} color={theme.textSecondary} />
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={theme.muted}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="search"
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onSubmitEditing={() => {
            if (suggestions[0]) choose(toChoice(suggestions[0]));
          }}
          blurOnSubmit={!clearOnSelect}
          style={[styles.input, { color: theme.text }]}
        />
        {loading && <ActivityIndicator size="small" color={theme.textSecondary} />}
        {text.length > 0 && (
          <Pressable
            accessibilityLabel="Effacer"
            hitSlop={10}
            onPress={() => {
              setText('');
              setChosenText('');
              inputRef.current?.focus();
            }}>
            <Ionicons name="close-circle" size={18} color={theme.muted} />
          </Pressable>
        )}
      </View>

      {listVisible && (
        <View style={[styles.list, { borderTopColor: theme.border }]}>
          {suggestions.map((s) => (
            <Pressable
              key={`${s.address}-${s.location.lat}`}
              onPress={() => choose(toChoice(s))}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.background }]}>
              <Ionicons
                name={s.precision === 'exact' ? 'location' : 'location-outline'}
                size={20}
                color={theme.primary}
              />
              <View style={styles.rowText}>
                <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                  {s.title}
                </Text>
                {!!s.subtitle && (
                  <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                    {s.subtitle}
                    {s.precision === 'street' ? ' · numéro approximatif' : ''}
                  </Text>
                )}
              </View>
            </Pressable>
          ))}
          {!!error && (
            <Text style={[styles.info, { color: theme.warning }]}>
              Suggestions indisponibles ({error}). Tu peux utiliser l’adresse telle quelle.
            </Text>
          )}
          {canUseFreeText && (
            <Pressable
              onPress={() => choose({ address: text.trim(), location: null, label: null, precision: null })}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.background }]}>
              <Ionicons name="create-outline" size={20} color={theme.textSecondary} />
              <View style={styles.rowText}>
                <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                  Utiliser « {text.trim()} »
                </Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  Telle quelle : l’adresse sera recherchée à l’optimisation
                </Text>
              </View>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
  },
  inputRowBordered: {
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.md,
  },
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.sm,
  },
  rowText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 1,
  },
  info: {
    fontSize: 13,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});
