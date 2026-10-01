import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FieldId } from '../data/types';
import { getWordStream } from './stream';

// IMPORTANT: expo-notifications is loaded LAZILY.
// A top-level `import ... from 'expo-notifications'` eagerly pulls in native
// modules (e.g. ExpoPushTokenManager) that only exist after a native rebuild.
// In a build without them, that import throws at module-load time - before any
// try/catch can run - and crashes the whole app on launch. Requiring it inside
// a guard means merely importing this file is always safe; the features simply
// no-op until `npx expo install expo-notifications && npx expo prebuild` is run.
let _N: any | null | undefined;
function N(): any | null {
  if (_N !== undefined) return _N;
  try {
    _N = require('expo-notifications');
  } catch {
    _N = null;
  }
  return _N;
}

const REM_KEY = 'vorto.reminders';       // { allWords, dailyPractice, streak }
const FREQ_KEY = 'vorto.freq';           // { wordsPerDay, from, to }
export const DEFAULT_REM = { allWords: true, dailyPractice: true, streak: true };
export const DEFAULT_FREQ = { wordsPerDay: 10, from: 9, to: 22 };

// Foreground behaviour: show the banner even while the app is open.
export function configureNotifications() {
  const n = N();
  if (!n) return;
  try {
    n.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
      }),
    });
  } catch { /* native module not linked in this build yet */ }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const n = N();
  if (!n) return false;
  try {
    const settings = await n.getPermissionsAsync();
    if (settings.granted) return true;
    const req = await n.requestPermissionsAsync();
    return !!req.granted;
  } catch {
    return false;
  }
}

export async function getReminderSettings() {
  const rem = JSON.parse((await AsyncStorage.getItem(REM_KEY)) || 'null') ?? DEFAULT_REM;
  const freq = JSON.parse((await AsyncStorage.getItem(FREQ_KEY)) || 'null') ?? DEFAULT_FREQ;
  return { rem, freq };
}

// What a tapped notification wants to open: a specific word (feed at that word) or
// a route (e.g. /practice for a "take a test" CTA, / for a "keep your streak" CTA).
export type NotifTarget = { id?: string; route?: string };
function readTarget(resp: any): NotifTarget | null {
  const d = resp?.notification?.request?.content?.data;
  if (!d) return null;
  if (d.id) return { id: String(d.id) };
  if (d.route) return { route: String(d.route) };
  return null;
}

// Notification-tap handler. Lazy-guarded like the rest.
export function onNotificationTap(handler: (t: NotifTarget) => void): () => void {
  const n = N();
  if (!n) return () => {};
  try {
    const sub = n.addNotificationResponseReceivedListener((resp: any) => {
      const t = readTarget(resp);
      if (t) handler(t);
    });
    return () => { try { sub.remove(); } catch {} };
  } catch {
    return () => {};
  }
}

// Cold start: if the app was launched by tapping a notification, return its target.
export async function getInitialNotification(): Promise<NotifTarget | null> {
  const n = N();
  if (!n) return null;
  try {
    return readTarget(await n.getLastNotificationResponseAsync());
  } catch {
    return null;
  }
}

// Schedule a one-shot reminder a couple of days before a free trial ends, so the
// user gets a nudge to decide (day 5 of a 7-day trial by default). Idempotent-ish:
// tagged so we don't stack duplicates if called again. Lazy-guarded like the rest.
export async function scheduleTrialReminder(trialDays = 7, remindOnDay = 5) {
  if (Platform.OS === 'web') return;
  const n = N();
  if (!n) return;
  try {
    const granted = (await n.getPermissionsAsync()).granted || (await requestNotificationPermission());
    if (!granted) return;
    // Clear any prior trial reminder before re-scheduling.
    const scheduled = await n.getAllScheduledNotificationsAsync();
    for (const s of scheduled) {
      if (s?.content?.data?.kind === 'trial-reminder') await n.cancelScheduledNotificationAsync(s.identifier);
    }
    const daysLeft = Math.max(1, trialDays - remindOnDay);
    const when = new Date(Date.now() + remindOnDay * 24 * 60 * 60 * 1000);
    await n.scheduleNotificationAsync({
      content: {
        title: `⏳ ${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your trial`,
        body: "Keep your streak, your saved words and your stats. Don't lose your progress.",
        data: { kind: 'trial-reminder' },
      },
      trigger: { date: when },
    });
  } catch { /* native module not linked in this build yet */ }
}

// Cancel everything and re-lay the daily schedule from current settings.
export async function rescheduleReminders(field: FieldId, prompt = false) {
  if (Platform.OS === 'web') return;
  const n = N();
  if (!n) return;
  try {
  await n.cancelAllScheduledNotificationsAsync();
  const { rem, freq } = await getReminderSettings();
  if (!(rem.allWords || rem.dailyPractice || rem.streak)) return;
  const granted = prompt ? await requestNotificationPermission() : (await n.getPermissionsAsync()).granted;
  if (!granted) return;

  if (rem.allWords) {
    // Fresh, never-repeating words from the SAME stream the widget uses. We
    // schedule upcoming stream positions that land in the user's active hours as
    // ONE-SHOT notifications (not `repeats: true`), so every notification is a
    // distinct new word — no more the-same-words-every-day. Re-topped-up whenever
    // the app reschedules (launch / settings change), giving an endless feed.
    const { words, epoch, intervalMs, position } = await getWordStream(field, freq.wordsPerDay);
    if (words.length) {
      const now = Date.now();
      let scheduled = 0;
      for (let p = position + 1; scheduled < 48 && p < position + 800; p++) {
        const when = epoch + p * intervalMs;
        if (when <= now) continue;
        const d = new Date(when);
        const hour = d.getHours();
        if (hour < freq.from || hour > freq.to) continue; // no night pings
        const w = words[p % words.length];
        // Rich body like the reference app: definition line + the in-context
        // example on its own line (parenthesised), so the notification teaches the
        // word the way the feed card does — not just a bare gloss.
        const body = w.ex ? `(${w.pos}) ${w.def}\n(${w.ex})` : `(${w.pos}) ${w.def}`;
        await n.scheduleNotificationAsync({
          content: { title: `📖 ${w.word}`, body, data: { id: w.id } },
          trigger: { date: d },
        });
        scheduled++;
      }
    }
  }
  // dailyPractice is now handled by schedulePracticeReminder() below (a CONDITIONAL nudge that only
  // fires if today's daily test isn't done), not an unconditional 14:00 repeat.
  if (rem.streak) {
    // "Keep your streak" CTA → opens the feed to learn a word on tap.
    await n.scheduleNotificationAsync({
      content: { title: "🔥 Don't break the chain", body: 'Learn one word to keep your streak alive.', data: { route: '/' } },
      trigger: { hour: 21, minute: 0, repeats: true },
    });
  }
  await schedulePracticeReminder(); // conditional "you haven't done today's test" evening nudge
  } catch { /* native module not linked in this build yet */ }
}

// Conditional "you haven't done today's test" nudge. Local notifications can't check state at fire
// time, so this is a re-armed ONE-SHOT: it arms the next evening (today if still ahead and not yet
// done, else tomorrow) and is re-evaluated on launch, whenever reminders reschedule, and right after
// the daily test completes. Tagged 'practice-reminder'; respects the dailyPractice toggle + permission.
export async function schedulePracticeReminder() {
  if (Platform.OS === 'web') return;
  const n = N();
  if (!n) return;
  try {
    const scheduled = await n.getAllScheduledNotificationsAsync();
    for (const s of scheduled) {
      if (s?.content?.data?.kind === 'practice-reminder') await n.cancelScheduledNotificationAsync(s.identifier);
    }
    const { rem } = await getReminderSettings();
    if (!rem.dailyPractice) return;
    if (!(await n.getPermissionsAsync()).granted) return;
    const { peekDailyTest } = require('./daily-test');
    const today = await peekDailyTest();
    // Arm the next 19:30. If today's already done, or 19:30 has passed, push to tomorrow.
    const when = new Date();
    when.setHours(19, 30, 0, 0);
    if (today?.completed || when.getTime() <= Date.now()) when.setDate(when.getDate() + 1);
    await n.scheduleNotificationAsync({
      content: {
        title: "✍️ Today's test is waiting",
        body: 'Answer your 10 words to keep your streak alive. 🔥',
        data: { route: '/daily-test', kind: 'practice-reminder' },
      },
      trigger: { date: when },
    });
  } catch { /* native module not linked in this build yet */ }
}
