import { useEffect } from 'react';
import { LogBox, Text as RNText, TextInput as RNTextInput } from 'react-native';

// Global Dynamic Type ceiling (root-cause guard). RN Text/TextInput scale unbounded with the
// system accessibility size, so any capped or fixed-height text truncates/clips at XXL. Cap the
// multiplier app-wide: Dynamic Type is still honoured up to 1.5x, past which layouts stay intact.
const _t = RNText as unknown as { defaultProps?: Record<string, unknown> };
_t.defaultProps = { ..._t.defaultProps, maxFontSizeMultiplier: 1.5 };
const _ti = RNTextInput as unknown as { defaultProps?: Record<string, unknown> };
_ti.defaultProps = { ..._ti.defaultProps, maxFontSizeMultiplier: 1.5 };
import { Stack, useRouter, useRootNavigationState } from 'expo-router';
import { onNotificationTap, getInitialNotification, schedulePracticeReminder, type NotifTarget } from '../lib/notifications';
import { initOneSignal, syncStreakTags } from '../lib/onesignal';
import { setFeedStart } from '../lib/feed-intent';
import { recordAppOpen, getSignupDate } from '../lib/streak';

// RevenueCat logs a benign error in the dev scaffold when no store key is set.
// Keep its LogBox toast from overlaying the UI (it can intercept touches while testing).
LogBox.ignoreLogs([/\[RevenueCat\]/, /Purchases instance/i, /singleton instance/i, /\[expo-notifications\]/, /EXNotification/, /\[taxonomy\]/]);
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Newsreader_400Regular_Italic, Newsreader_500Medium } from '@expo-google-fonts/newsreader';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { AppProvider, useApp } from '../lib/app-state';
import ErrorBoundary from '../components/ErrorBoundary';

SplashScreen.preventAutoHideAsync();

// Overlay screens present as the native iOS card sheet: the screen scales up from
// the bottom as a card while the one behind shrinks back. `gestureEnabled` +
// vertical gesture make them dismissible by DRAGGING DOWN from the top (like
// pulling a sheet closed), not only via the X button.
const sheet = { presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' } as const;

function Root() {
  const { ready, theme, palette: co } = useApp();
  const router = useRouter();
  const navState = useRootNavigationState();
  useEffect(() => { if (ready) SplashScreen.hideAsync(); }, [ready]);

  // Initialize OneSignal remote push once on launch (no-op on binaries without the native
  // SDK — see lib/onesignal.ts). Local scheduled reminders still run via expo-notifications.
  useEffect(() => { initOneSignal(); }, []);

  // Once app state is ready, publish the streak state to OneSignal so the Streak-Saver Journey
  // can target "has a streak but hasn't finished today's test" (see lib/onesignal.ts).
  useEffect(() => { if (ready) syncStreakTags(); }, [ready]);

  // Re-arm the conditional "you haven't done today's test" evening nudge on every launch, so it
  // reflects whether today's test is already done (see lib/notifications.ts).
  useEffect(() => { if (ready) schedulePracticeReminder(); }, [ready]);

  // Publish the daily-test streak to the App Group so the streak widgets render current data.
  useEffect(() => { if (ready) { require('../lib/widget').syncStreakWidget?.(); } }, [ready]);

  // Record today's app open for the ONE user-facing streak (consecutive days the app was opened).
  // Idempotent per calendar day — the first open of a new day increments/reset the streak. Gated
  // on `ready` so it runs once app state has hydrated (matches the other launch-time effects).
  // Re-publish the streak widgets AFTER recording, so the home-screen flame reflects TODAY's
  // incremented count on the first open of a new day (the standalone sync above may run before this).
  useEffect(() => {
    if (ready) {
      require('../lib/posthog').initAnalytics?.(); // wire the analytics sink once app state is ready (no-op until the PostHog key is set)
      recordAppOpen().then(() => require('../lib/widget').syncStreakWidget?.()).catch(() => {});
    }
  }, [ready]);

  // Seed vorto.signupDate exactly once (first launch = signup day; existing users fall back to
  // their earliest recorded app-open day). The Journey path reads it so days of this week that
  // predate the user are rendered inactive, never "missed".
  useEffect(() => { if (ready) getSignupDate().catch(() => {}); }, [ready]);

  // A tapped WORD notification opens the For-You FEED on that word (same as the
  // widget) so you land in the scrollable feed, not the static detail screen.
  // (Widget taps route via vorto://feed/<id>; notifications carry the id in data.)
  // Also gated on navState.key (not just `ready`) - same "Attempted to navigate
  // before mounting the Root Layout" race confirmed on the widget/feed handoff path
  // (see app/feed/[id].tsx). A cold-start notification tap can fire this before the
  // navigator itself has mounted, so wait for both.
  useEffect(() => {
    if (!ready || !navState?.key) return;
    let mounted = true;
    const handle = (t: NotifTarget) => {
      if (t.id) { setFeedStart(t.id); router.replace('/(tabs)'); }        // word → feed at that word
      else if (t.route === '/') router.replace('/(tabs)');                // streak CTA → the feed
      else if (t.route) router.push(t.route as any);                      // e.g. practice CTA → /practice
    };
    getInitialNotification().then((t) => { if (mounted && t) handle(t); });
    const unsub = onNotificationTap(handle);
    return () => { mounted = false; unsub(); };
  }, [ready, navState?.key]);

  if (!ready) return null;
  return (
    <>
    <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: co.bg },
        // Pushed content screens (area/[topic], topics, browse, saved, ...) glide
        // in from the right — the subtle iOS-native push feel.
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="welcome" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="offer" options={{ ...sheet, gestureEnabled: false }} />
      <Stack.Screen name="auth" />
      <Stack.Screen name="paywall" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="feed/[id]" options={{ animation: 'none' }} />
      {/* Crown personalization — a hub that opens the paywall, so a card (not modal). */}
      <Stack.Screen name="personalize" options={{ animation: 'slide_from_right' }} />
      {/* explore / practice / stats / profile are now TABS (see app/(tabs)/_layout.tsx),
          reached by switching tabs — no longer pushed as cards/sheets here. */}
      {/* "standing" is reachable from BOTH practice (a card) and stats (a modal) - a card pushed
          from stats would render invisibly behind it (the exact bug above), so standing must be a
          modal too. A card presenting a modal (from practice) is normal and unaffected. */}
      <Stack.Screen name="standing" options={sheet} />
      <Stack.Screen name="word/[id]" options={sheet} />
      <Stack.Screen name="share/[id]" options={sheet} />
      <Stack.Screen name="share-stats" options={sheet} />
      <Stack.Screen name="saved" />
      <Stack.Screen name="collections" options={sheet} />
      <Stack.Screen name="widgets" options={sheet} />
      <Stack.Screen name="own" options={sheet} />
      <Stack.Screen name="search" options={sheet} />
      <Stack.Screen name="journey" options={{ animation: 'slide_from_right' }} />
      {/* Former Practice hub — now off the tab bar (Practice tab is the Journey path). Still a
          route (/practice-hub) reached from saved-test flows; no nav entry, like journey was. */}
      <Stack.Screen name="practice-hub" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="redeem" options={sheet} />
      <Stack.Screen name="browse" />
      <Stack.Screen name="topics" />
      <Stack.Screen name="area/[topic]" />
      <Stack.Screen name="voices" options={sheet} />
    </Stack>
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Newsreader_500Medium, Newsreader_400Regular_Italic,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
  });
  if (!loaded) return null;
  return (
    <ErrorBoundary>
      <AppProvider>
        <Root />
      </AppProvider>
    </ErrorBoundary>
  );
}
