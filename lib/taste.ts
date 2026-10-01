import AsyncStorage from '@react-native-async-storage/async-storage';
import { Word } from '../data/types';

// On-device "learns from you" ranker — a lightweight content-based recommender.
// It watches what you engage with (like / save / pronounce / linger) vs. skip,
// and learns an affinity for the FEATURES of those words (topic, level, part of
// speech). New words are then scored by how well they match your learned taste,
// so the feed/stream drift toward what you actually enjoy — a mini For-You feed.
// Fully local (no backend, no other users needed). Cold start (no signal yet)
// leaves the hook-led order untouched.

const KEY = 'vorto.taste.v1';
const DECAY = 0.997; // gently forget, so taste keeps adapting instead of ossifying

export interface Taste { topic: Record<string, number>; cefr: Record<string, number>; pos: Record<string, number>; n: number; }
const empty = (): Taste => ({ topic: {}, cefr: {}, pos: {}, n: 0 });

let cache: Taste | null = null;
export async function loadTaste(): Promise<Taste> {
  if (cache) return cache;
  cache = (JSON.parse((await AsyncStorage.getItem(KEY)) || 'null') as Taste) || empty();
  return cache;
}
async function persist(t: Taste) { cache = t; await AsyncStorage.setItem(KEY, JSON.stringify(t)); }

function bump(m: Record<string, number>, k: string | undefined, delta: number) {
  if (!k) return;
  m[k] = (m[k] || 0) * DECAY + delta;
}

// Positive weight = liked it; negative = skipped it. Suggested weights:
//   like +2 · save +1.5 · pronounce +0.6 · linger +0.4 · quick-skip -0.35
export async function recordTaste(w: Word, weight: number) {
  const t = await loadTaste();
  bump(t.topic, w.topic, weight);
  bump(t.cefr, w.cefr, weight * 0.5);
  bump(t.pos, w.pos, weight * 0.3);
  if (weight > 0) t.n += 1;
  await persist(t);
}

// Enough positive signal to personalise? (a handful of likes/saves)
export function hasSignal(t: Taste): boolean { return t.n >= 3; }

export function scoreWord(w: Word, t: Taste): number {
  return (t.topic[w.topic] || 0) + 0.5 * (t.cefr[w.cefr] || 0) + 0.3 * (t.pos[w.pos] || 0);
}
