import AsyncStorage from '@react-native-async-storage/async-storage';
import { FieldId, Word } from '../data/types';
import { getFeedWords } from './db';
import { HOOK_IDS } from './hooks';

// A stable, per-field "stream" of words in a fixed shuffled order, plus an epoch.
// The word OF THE MOMENT is  words[ floor((now - epoch) / intervalMs) % length ].
// It advances one word per interval and never repeats until the ENTIRE field pool
// has been cycled (then it reshuffles). Newly-synced words are appended to the end
// so they appear later without disturbing the current position.
//
// Both the home-screen widget and the notifications index THIS same stream, so the
// user gets one coherent, never-repeating feed — a fresh word every interval, like
// scrolling to a new post. Field-scoped, so General never streams technical words.

const ORDER_KEY = (f: FieldId) => `vorto.stream.${f}`;
const EPOCH_KEY = (f: FieldId) => `vorto.streamEpoch.${f}`;

// perDay words spread across the whole day → hours between changes.
export function intervalHoursFor(perDay: number): number {
  return Math.max(1, Math.round(24 / Math.max(1, Math.min(24, perDay || 10))));
}

function shuffled<T>(a: T[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Lead a fresh stream with the catchy "hook" words so first impressions delight.
// General opens with the whole hook set; a professional field gets a short
// delightful opener (5) then dives into its own vocabulary. The rest is shuffled.
function leadWithHooks(words: Word[], field: FieldId): Word[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  const hooks = HOOK_IDS.map((id) => byId.get(id)).filter(Boolean) as Word[];
  const lead = hooks.slice(0, field === 'gen' ? hooks.length : Math.min(5, hooks.length));
  const leadSet = new Set(lead.map((w) => w.id));
  return [...lead, ...shuffled(words.filter((w) => !leadSet.has(w.id)))];
}

export interface WordStream { words: Word[]; epoch: number; intervalMs: number; position: number; }

export async function getWordStream(field: FieldId, perDay: number): Promise<WordStream> {
  const intervalMs = intervalHoursFor(perDay) * 3600 * 1000;
  const words = await getFeedWords(field); // field-scoped, unseen-first
  // Guard: if the pool is transiently empty (DB not ready yet), bail WITHOUT
  // resetting the stored epoch/order — otherwise the next open re-seeds at
  // position 0 (the first hook word) and the widget appears to "repeat" it.
  if (!words.length) {
    const keptEpoch = parseInt((await AsyncStorage.getItem(EPOCH_KEY(field))) || '0', 10) || Date.now();
    return { words: [], epoch: keptEpoch, intervalMs, position: 0 };
  }
  const byId = new Map(words.map((w) => [w.id, w]));
  const storedOrder: string[] = JSON.parse((await AsyncStorage.getItem(ORDER_KEY(field))) || '[]');
  let epoch = parseInt((await AsyncStorage.getItem(EPOCH_KEY(field))) || '0', 10) || 0;
  let ordered = storedOrder.map((id) => byId.get(id)).filter(Boolean) as Word[];
  const now = Date.now();
  let position = epoch && ordered.length ? Math.floor((now - epoch) / intervalMs) : Number.MAX_SAFE_INTEGER;

  if (!ordered.length || !epoch || position >= ordered.length) {
    // First run, or the whole pool has been cycled → a fresh PURE SHUFFLE. (We do
    // NOT lead with the hook words here: that put petrichor — HOOK_IDS[0] — at the
    // front of every regeneration, and regenerations happen on content changes, so
    // the widget kept showing petrichor. The delightful hook-first ordering lives in
    // the FEED instead. This stream just never-repeats until the pool is exhausted.)
    ordered = shuffled(words);
    epoch = now;
    position = 0;
    await AsyncStorage.setItem(ORDER_KEY(field), JSON.stringify(ordered.map((w) => w.id)));
    await AsyncStorage.setItem(EPOCH_KEY(field), String(epoch));
  } else {
    // Fold newly-available words onto the end (shown later, never a repeat).
    const have = new Set(ordered.map((w) => w.id));
    const extra = words.filter((w) => !have.has(w.id));
    if (extra.length) {
      ordered = [...ordered, ...shuffled(extra)];
      await AsyncStorage.setItem(ORDER_KEY(field), JSON.stringify(ordered.map((w) => w.id)));
    }
  }
  return { words: ordered, epoch, intervalMs, position: Math.max(0, position) };
}
