import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { useApp } from '../../lib/app-state';
import JourneyPath from '../../components/JourneyPath';
import PressBounce from '../../components/PressBounce';
import { fonts } from '../../theme/tokens';

// The Practice tab IS the weekly Journey path now (owner 2026-09-25): tap TODAY's node to start
// today's test. The former practice hub (build-a-test, review, where-you-stand, games) moved to the
// off-nav /practice-hub route — reachable via the quiet "More practice" link top-right (owner
// 2026-09-26: give the hub an entry point again).
export default function PracticeTab() {
  const { palette: co } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: co.bg, paddingHorizontal: 24, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 84 }}>
      {/* Entry point to the off-nav practice hub (build-a-test, review, where-you-stand, games). */}
      <PressBounce
        onPress={() => router.push('/practice-hub' as any)}
        style={{ position: 'absolute', top: insets.top + 14, right: 24, zIndex: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}
        hitSlop={10}
        accessibilityLabel="More practice: build a test, review, where you stand"
      >
        <Text style={{ fontFamily: fonts.sansSemi, fontSize: 13.5, color: co.accent }}>More practice</Text>
        <Svg width={14} height={14} viewBox="0 0 24 24"><SvgPath d="M9 6l6 6-6 6" stroke={co.accent} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </PressBounce>
      {/* Extra bottom padding clears the floating native tab bar so the path's base ("N of 7 days"
          caption + Monday node) never sits behind it. */}
      <JourneyPath co={co} />
    </View>
  );
}
