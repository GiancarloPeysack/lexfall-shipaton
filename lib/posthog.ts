// PostHog analytics sink. Wires the lib/analytics.ts façade to PostHog's HTTP capture
// endpoint (no native SDK, Expo-safe). Fire-and-forget and fully guarded: analytics must
// never block a screen or crash the app. Inert until EXPO_PUBLIC_POSTHOG_KEY is set, so it
// is safe to ship before the key exists (track() just stays a no-op).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAnalyticsSink } from './analytics';

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
// US cloud ingestion host. If the PostHog project is created in the EU region, switch to
// https://eu.i.posthog.com (the key is region-bound).
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

const ANON_KEY = 'vorto.anonId';
let distinctId: string | null = null;

// Stable anonymous id per install (no PII), so a single user's path through onboarding is
// one thread in PostHog. Reused if already present.
async function getDistinctId(): Promise<string> {
  if (distinctId) return distinctId;
  try {
    let id = await AsyncStorage.getItem(ANON_KEY);
    if (!id) {
      id = 'anon_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      await AsyncStorage.setItem(ANON_KEY, id);
    }
    distinctId = id;
    return id;
  } catch {
    distinctId = 'anon_unknown';
    return distinctId;
  }
}

// Call once at app start (after `ready`). No-op if the key is not configured.
export function initAnalytics(): void {
  if (!KEY) return;
  setAnalyticsSink((event, props) => {
    getDistinctId()
      .then((id) => {
        fetch(`${HOST}/capture/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: KEY,
            event,
            distinct_id: id,
            properties: { ...(props ?? {}), $lib: 'lexfall-app' },
          }),
        }).catch(() => {});
      })
      .catch(() => {});
  });
}
