import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Complète app.json avec les valeurs secrètes lues dans l'environnement
 * (fichier .env.local en local, variables EAS pour les builds cloud).
 *
 * Les clés Google Maps ne servent qu'aux builds natives : dans Expo Go, la carte fonctionne sans clé.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const iosKey = process.env.GOOGLE_MAPS_IOS_API_KEY;

  return {
    ...config,
    name: config.name ?? 'Cékalivre',
    slug: config.slug ?? 'cekalivre',
    plugins: [
      ...(config.plugins ?? []),
      [
        'react-native-maps',
        {
          ...(androidKey ? { androidGoogleMapsApiKey: androidKey } : {}),
          ...(iosKey ? { iosGoogleMapsApiKey: iosKey } : {}),
        },
      ],
    ],
    extra: {
      ...config.extra,
      googleMapsIos: Boolean(iosKey),
    },
  };
};
