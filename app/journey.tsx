import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '../lib/app-state';
import BackButton from '../components/BackButton';
import JourneyPath from '../components/JourneyPath';

// Standalone Journey screen (route: /journey). Kept OFF the tab bar for now — the owner will
// decide where its entry point lives. Reachable via router.push('/journey') / vorto:///journey.
// No ScrollView: JourneyPath is a one-screen world that fits itself to the available height.
export default function JourneyScreen() {
  const { palette: co } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: co.bg, paddingHorizontal: 24, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 6 }}>
      <View style={{ marginBottom: 12 }}>
        <BackButton variant="close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} co={co} />
      </View>
      <JourneyPath co={co} />
    </View>
  );
}
