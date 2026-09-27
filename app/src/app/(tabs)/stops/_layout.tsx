import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function StopsLayout() {
  return (
    <Stack screenOptions={{ headerLargeTitle: Platform.OS === 'ios' }}>
      <Stack.Screen name="index" options={{ title: 'Arrêts' }} />
    </Stack>
  );
}
