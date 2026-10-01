import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { withLayoutContext } from 'expo-router';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { useApp } from '../../lib/app-state';
import { peekDailyTest, todayStr } from '../../lib/daily-test';

// Real NATIVE UITabBar (react-native-bottom-tabs). Built with the iOS 26 SDK, the
// system renders it as genuine Liquid Glass — real material + the native slide/morph
// selection — which no expo-blur lookalike can reproduce. Icons are SF Symbols.
const { Navigator } = createNativeBottomTabNavigator();
const Tabs = withLayoutContext(Navigator);

// True when today's daily test isn't finished yet — drives an "unseen message"
// badge on the Practice tab so there's a visible nudge that activity is waiting.
function useDailyDue(): boolean {
  const [due, setDue] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const st = await peekDailyTest();
        const done = !!st && st.date === todayStr() && st.completed;
        if (alive) setDue(!done);
      } catch { /* storage hiccup — leave badge as-is */ }
    };
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    // Cheap AsyncStorage poll so the badge clears shortly after the test is finished
    // (completion happens on a separate pushed screen this layout can't observe directly).
    const iv = setInterval(check, 8000);
    return () => { alive = false; sub.remove(); clearInterval(iv); };
  }, []);
  return due;
}

export default function TabsLayout() {
  const { palette: co } = useApp();
  const dailyDue = useDailyDue();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: co.accent }}>
      <Tabs.Screen name="index" options={{ title: 'Words', tabBarIcon: () => ({ sfSymbol: 'book' }) }} />
      {/* One name everywhere: tab label == screen title == "Library" (was Topics/Your library/Explore). */}
      <Tabs.Screen name="explore" options={{ title: 'Library', tabBarIcon: () => ({ sfSymbol: 'square.grid.2x2' }) }} />
      {/* "Today's test is waiting" nudge: a quiet DOT, not a red "1" (nothing is unread, and the
          count never goes above one test). The badge string is a single space so iOS renders an
          empty capsule dot instead of a digit. Color: tabBarBadgeBackgroundColor tints the dot
          gold on Android; iOS is a hard library limit — react-native-bottom-tabs maps the badge
          to SwiftUI .badge(), which is always the system red and exposes no color API (the
          badge*Color props are documented Android-only), so iOS shows a red digit-less dot. */}
      <Tabs.Screen
        name="practice"
        options={{
          title: 'Practice',
          tabBarIcon: () => ({ sfSymbol: 'graduationcap' }),
          tabBarBadge: dailyDue ? ' ' : undefined,
          tabBarBadgeBackgroundColor: co.accent,
          tabBarBadgeTextColor: co.ink,
        }}
      />
      <Tabs.Screen name="stats" options={{ title: 'Progress', tabBarIcon: () => ({ sfSymbol: 'chart.bar' }) }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: () => ({ sfSymbol: 'person.crop.circle' }) }} />
    </Tabs>
  );
}
