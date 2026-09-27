import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#5F6770',
    background: '#F4F5F7',
    card: '#FFFFFF',
    border: '#E1E4E8',
    primary: '#1F6FEB',
    primaryText: '#FFFFFF',
    success: '#1A7F37',
    successSoft: '#DAFBE1',
    warning: '#B35900',
    warningSoft: '#FFF1E0',
    danger: '#CF222E',
    dangerSoft: '#FFEBE9',
    muted: '#9AA1A9',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#A0A7B0',
    background: '#0D1117',
    card: '#161B22',
    border: '#30363D',
    primary: '#3C87F7',
    primaryText: '#FFFFFF',
    success: '#3FB950',
    successSoft: '#12261B',
    warning: '#E3A04F',
    warningSoft: '#2D2112',
    danger: '#F85149',
    dangerSoft: '#2D1414',
    muted: '#6E7681',
  },
} as const;

export type ThemeColors = { [K in keyof typeof Colors.light]: string };

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const Fonts = Platform.select({
  ios: { mono: 'ui-monospace' },
  default: { mono: 'monospace' },
});
