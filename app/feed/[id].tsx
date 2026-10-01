import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter, useRootNavigationState } from 'expo-router';
import { setFeedStart } from '../../lib/feed-intent';
import { useApp } from '../../lib/app-state';

// Handoff route for widget / notification taps (vorto://feed/<id>). It records
// the target word and immediately replaces itself with the For-You feed, which
// then scrolls to that word — so a tap drops you into the scrollable feed on the
// exact word, not the static detail screen.
export default function FeedHandoff() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const app = useApp();
  // On a COLD start straight into this route (exactly what a widget/notification tap
  // does), the Root Layout's navigator hasn't mounted yet on the first render pass -
  // calling router.replace() then throws "Attempted to navigate before mounting the
  // Root Layout component", caught by the ErrorBoundary ("Something slipped"). Waiting
  // for `app.ready` alone didn't cover this (confirmed via device log repro - the crash
  // fires even once ready is true, because the navigator itself isn't up yet). The fix
  // is to also wait for the root navigation state to exist (`.key` is set once expo-router's
  // navigator has mounted) before navigating.
  const navState = useRootNavigationState();
  useEffect(() => {
    if (!app?.ready || !navState?.key) return;
    if (id) setFeedStart(String(id));
    router.replace('/(tabs)');
  }, [app?.ready, navState?.key, id]);
  return <View style={{ flex: 1, backgroundColor: app?.palette?.bg ?? '#100E0B' }} />;
}
