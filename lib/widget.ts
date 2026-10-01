import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FieldId } from '../data/types';
import { getWordStream, intervalHoursFor } from './stream';

// Whether the user has told us they've added the home-screen widget. We can't
// reliably detect installation from JS, so we track a self-reported flag and
// stop nudging once it's set.
const WIDGET_ADDED_KEY = 'vorto.widgetAdded';
export async function isWidgetAdded(): Promise<boolean> {
  return (await AsyncStorage.getItem(WIDGET_ADDED_KEY)) === '1';
}
export async function setWidgetAdded(v: boolean) {
  await AsyncStorage.setItem(WIDGET_ADDED_KEY, v ? '1' : '0');
}

// Optional native bridge: only present once the @bacons/apple-targets plugin is
// enabled (needs your Apple Team ID). Until then this safely no-ops.
let ExtensionStorage: any = null;
try { ExtensionStorage = require('@bacons/apple-targets').ExtensionStorage; } catch {}

const WINDOW = 300; // how much of the stream we hand the extension at a time

export async function syncWidget(opts: {
  field: FieldId;
  wordsPerDay?: number;
  activeFrom?: number;
  activeTo?: number;
}) {
  if (Platform.OS !== 'ios' || !ExtensionStorage) return;
  try {
    // Use the user's REAL pace + active hours — the SAME values notifications use
    // (vorto.freq) — not a hardcoded 10. Every caller passes only { field }, so the
    // old `opts.wordsPerDay ?? 10` pinned the widget to a 10/day stride while the
    // notifications stepped the stream at the user's actual pace: the two diverged
    // and the widget looked "stuck" next to the (correctly varying) notifications.
    let perDay = opts.wordsPerDay;
    let from = opts.activeFrom;
    let to = opts.activeTo;
    if (perDay == null || from == null || to == null) {
      try {
        const raw = await AsyncStorage.getItem('vorto.freq');
        if (raw) {
          const f = JSON.parse(raw);
          if (perDay == null) perDay = f.wordsPerDay;
          if (from == null) from = f.from;
          if (to == null) to = f.to;
        }
      } catch {}
    }
    perDay = perDay ?? 10;

    // Publish a WINDOW of the shared stream starting at the current position.
    const { words, epoch, intervalMs, position } = await getWordStream(opts.field, perDay);
    let window = words.slice(position, position + WINDOW);
    if (window.length === 0) window = words.slice(0, WINDOW);
    // Never clobber a good queue with an empty one (DB not ready / transient empty
    // pool). Bailing keeps the last-published queue so the widget doesn't fall back
    // to its bundled FALLBACK and pin on one word.
    if (window.length === 0) return;
    // The widget now draws DIFFERENT entries per placed instance (family stride +
    // per-instance salt in index.swift), so the queue must always hold enough
    // DISTINCT words to spread across several widgets. When `position` sits near
    // the stream's end the slice can shrink to a handful — top it up by wrapping
    // around to the stream's start (deduped) so at least ~40 distinct words ship.
    const MIN_WINDOW = 40;
    if (window.length < MIN_WINDOW) {
      const have = new Set(window.map((w) => w.id));
      for (const w of words) {
        if (window.length >= MIN_WINDOW) break;
        if (!have.has(w.id)) {
          have.add(w.id);
          window.push(w);
        }
      }
    }

    const storage = new ExtensionStorage('group.com.gpeysack.lexfall');
    // Include the word `id` so tapping the widget can deep-link to the exact word shown.
    storage.set('wordQueue', JSON.stringify(window.map((w) => ({ id: w.id, word: w.word, ipa: w.ipa, pos: w.pos, def: w.def, ex: w.ex }))));
    // PHASE-LOCK the widget to the shared stream: the anchor is the real start time of
    // the current word (epoch + position*interval), NOT Date.now(). window[0] is the
    // word at `position`, so anchoring here makes the widget's idx grow exactly in step
    // with the stream — flipping to the next word at the SAME instants the notifications
    // do (they compute `epoch + p*interval`). Date.now() drifted the phase on every open.
    storage.set('widgetAnchor', epoch + position * intervalMs);
    storage.set('widgetIntervalHours', Math.round(intervalMs / 3600000) || intervalHoursFor(perDay));
    storage.set('wordsPerDay', perDay);
    if (from != null) storage.set('activeFrom', from);
    if (to != null) storage.set('activeTo', to);
    ExtensionStorage.reloadWidget?.();
  } catch {}
}

// Publish the APP-OPEN streak (the ONE user-facing streak — consecutive calendar days the app was
// opened, see lib/streak.ts) to the App Group so the streak widgets (launcher / week / month) render
// the SAME number the user sees in-app (feed pop-up / Progress), not the old daily-test-completion
// streak. Alongside the count we publish the TRUTHFUL opened-days set so the week strip + month
// calendar mark the real days, not days back-derived from count+lastDate (which can't honour a gap).
// Call on launch (after recordAppOpen) and whenever the daily test completes.
export async function syncStreakWidget() {
  if (Platform.OS !== 'ios' || !ExtensionStorage) return;
  try {
    const { getAppOpenStreak } = require('./streak');
    const { peekDailyTest } = require('./daily-test');
    const streak = await getAppOpenStreak();   // { count, lastDate, days } — the app-open streak
    const today = await peekDailyTest();        // today's DAILY TEST state (the launcher's signal)
    const storage = new ExtensionStorage('group.com.gpeysack.lexfall');
    // Flame count + most-recent-open date = the app-open streak shown in-app.
    storage.set('streakCount', streak?.count ?? 0);
    storage.set('streakLastDate', streak?.lastDate ?? '');
    // The real opened-days set (ISO yyyy-mm-dd[]). The Swift week/month widgets mark done-days from
    // this array, so they light exactly the days that were opened (a truthful strip, real gaps kept).
    storage.set('streakDays', JSON.stringify(streak?.days ?? []));
    // The launcher deep-links to the DAILY TEST, so its "done today" reflects whether today's daily
    // test is done — the actionable thing. (App-open is always true while the app is running, so it
    // would be a meaningless "done" state for the launcher's tap-to-practise call to action.)
    storage.set('dailyDoneToday', today?.completed ? 1 : 0);
    ExtensionStorage.reloadWidget?.();
  } catch {}
}
