// OneSignal remote push — powers the Shipaton "Keep Them Coming Back" (retention) entry
// and, more importantly, real re-engagement (streak-about-to-break nudges, win-backs) via
// OneSignal Journeys. expo-notifications stays the LOCAL scheduled-reminder path; OneSignal
// handles REMOTE push + segmentation/Journeys.
//
// Native module — kept LAZILY required (same rule as lib/notifications.ts). A JS bundle
// running on a binary that doesn't yet contain the native SDK (e.g. before the next native
// rebuild, or Expo Go) must degrade to a no-op instead of crashing on import.

import { NativeModules } from 'react-native';

const APP_ID = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID || 'f3dafa4a-eec0-4531-9e75-1e36aaeda3df';

// HARD GUARD: react-native-onesignal builds a NativeEventEmitter at import time, which THROWS on a
// binary that doesn't contain the native module (a dev/Expo-Go build, or any build made before the
// SDK was added). A try/catch around require() is too late — the throw isn't reliably catchable.
// So check the native module is actually linked BEFORE ever requiring the wrapper. When absent,
// every function here is a clean no-op.
const hasNative = () => !!(NativeModules as any)?.RNOneSignal;

let inited = false;

export function initOneSignal() {
  if (inited || !hasNative()) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { OneSignal, LogLevel } = require('react-native-onesignal');
    if (!OneSignal?.initialize) return; // module shape missing → skip
    OneSignal.Debug?.setLogLevel?.(LogLevel?.Warn ?? 4);
    OneSignal.initialize(APP_ID);
    // Ask for push permission (fallbackToSettings=true routes to Settings if previously denied).
    // If the user already granted notifications during onboarding, iOS won't re-prompt.
    OneSignal.Notifications?.requestPermission?.(true)?.catch?.(() => {});
    inited = true;
  } catch {
    // Native OneSignal module not present in this binary yet — no-op until the next rebuild.
  }
}

// Tag the current user with lightweight retention signals so Journeys can target them
// (e.g. "streak >= 3 but no session in 2 days"). Safe no-op if OneSignal isn't present.
export function setOneSignalTags(tags: Record<string, string | number>) {
  if (!hasNative()) return;
  try {
    const { OneSignal } = require('react-native-onesignal');
    const stringified: Record<string, string> = {};
    for (const k of Object.keys(tags)) stringified[k] = String(tags[k]);
    OneSignal?.User?.addTags?.(stringified);
  } catch {
    /* no-op */
  }
}

// Publish the user's Daily-Test streak state to OneSignal so a "Streak Saver" Journey can target
// exactly the right people: has an active streak AND hasn't COMPLETED today's test yet (a streak
// in Lexfall = finishing the 10-question Daily Test, not just opening the app). Call on launch and
// whenever the daily test is completed. Tags: streak_count (number), daily_done_today (yes/no),
// streak_last_date (YYYY-MM-DD).
export async function syncStreakTags() {
  try {
    const { getDailyTestStreak, peekDailyTest } = require('./daily-test');
    const streak = await getDailyTestStreak();
    const today = await peekDailyTest();
    setOneSignalTags({
      streak_count: streak?.count ?? 0,
      streak_last_date: streak?.lastCompletedDate ?? 'none',
      daily_done_today: today?.completed ? 'yes' : 'no',
    });
  } catch {
    /* no-op */
  }
}
