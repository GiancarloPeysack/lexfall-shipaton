import AsyncStorage from '@react-native-async-storage/async-storage';
import { Word, FieldId } from '../data/types';
import { displayTagsFor } from '../data/display-areas';
import { getAllFeedWords, LevelPref } from './db';
import { WordPref } from '../data/word-levels';

// ── The feed's personalization mix, extracted so it has exactly ONE home ────────────────────
// app/(tabs)/index.tsx composes the main feed as: getAllFeedWords (taste ranker + rarity dial +
// hooks) → field filter → follows-WEIGHTED merge (~80/20, never a hard filter). The daily test
// draws its NEW words from the very same stream (lib/daily-test.ts), so "the next best words
// for this person" means the same thing in both places by construction — this module is that
// shared composition, not a second personalization path.

// Small seeded PRNG (mulberry32) so the weighted merge is stable for a given seed.
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// #82/#83: weight follows instead of gating them. Walk both streams in their INCOMING order
// (they arrive taste-ranked from getAllFeedWords, so this preserves that personalisation -
// the old topic-interleave threw it away), drawing from `a` with probability pA (~0.8) else
// `b`. Nothing is ever unreachable; follows bias, they don't hide. Falls through when one empties.
export function weightedMerge(a: Word[], b: Word[], pA: number, seed: number): Word[] {
  const rnd = mulberry32(seed);
  const out: Word[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (rnd() < pA) out.push(a[i++]); else out.push(b[j++]);
  }
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return out;
}

// FIELD is authoritative (picking Medicine shows medicine even if the onboarding follows were
// general). Within the field, follows WEIGHT the stream ~80/20 instead of hard-filtering it —
// curating an area biases toward it without ever hiding the rest, and the taste ranking from
// getAllFeedWords survives to the output. Topics that aren't pickable at all (LAYER1_ONLY /
// unmapped) are never hidden either.
export function mixFollowedFeed(words: Word[], field: FieldId, followed: Set<string>, seed: number): Word[] {
  const fieldWords = words.filter((w) => (field === 'gen' ? w.field === 'gen' : w.field === field));
  if (!followed.size) return fieldWords; // nothing followed → the whole field (already taste-ranked)
  const pickable = displayTagsFor(field);
  const onTopic = fieldWords.filter((w) => followed.has(w.topic) || !pickable.has(w.topic));
  const explore = fieldWords.filter((w) => pickable.has(w.topic) && !followed.has(w.topic));
  return weightedMerge(onTopic, explore, 0.8, seed);
}

// The onboarding self-assessment ('vorto.survey' rating) → the feed's difficulty tier.
export function levelPrefFromSurvey(raw: string | null): LevelPref {
  try {
    const r = raw ? (JSON.parse(raw).rating as string) : '';
    return r === 'Building it' ? 'C1' : r === 'Advanced' ? 'C2' : 'mix';
  } catch { return 'mix'; }
}

// The full personalized stream as the FEED would serve it right now: reads the same stored
// preferences the feed screen reads (survey level, rarity dial, followed topics) and runs the
// same getAllFeedWords → field filter → follows-weighted merge. Rarity stays a SOFT bias
// (inherited from getAllFeedWords/weightedMerge), never a hard filter. Used by the daily test
// to pick its new words in the feed's own personalized order.
export async function personalizedFeedStream(field: FieldId, seed = 1): Promise<Word[]> {
  const [surveyRaw, wordPrefRaw, topicsRaw] = await Promise.all([
    AsyncStorage.getItem('vorto.survey').catch(() => null),
    AsyncStorage.getItem('vorto.wordPref').catch(() => null),
    AsyncStorage.getItem('vorto.topics').catch(() => null),
  ]);
  const level = levelPrefFromSurvey(surveyRaw);
  const wordPref: WordPref = wordPrefRaw === 'practical' || wordPrefRaw === 'rare' ? wordPrefRaw : 'balanced';
  let followed = new Set<string>();
  try { if (topicsRaw) followed = new Set<string>(JSON.parse(topicsRaw)); } catch { /* fresh install */ }
  const words = await getAllFeedWords('', level, wordPref);
  return mixFollowedFeed(words, field, followed, seed);
}
