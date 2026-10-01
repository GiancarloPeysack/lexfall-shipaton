import type { ImageSourcePropType } from 'react-native';
import { FEED_BG, FEED_BG_FIELD } from './feed-bg-map';

// Stable FNV-1a hash so every word maps to the SAME background every time (no
// flicker on re-render) while spreading evenly across the bundled set. Adjacent
// feed words have different ids, so they naturally get different images.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Precompute the image indices for each field bucket once.
const BUCKETS: Record<string, number[]> = {};
FEED_BG_FIELD.forEach((f, i) => { (BUCKETS[f] ||= []).push(i); });

// The photo behind a given word in the feed — FIELD-MATCHED: medical words get
// medical imagery, law → courthouses, business → cityscapes, everything else the
// general moody set. Bundled + offline; falls back to the whole set (then to null,
// so the feed shows the flat dark background — never a crash).
export function feedBgFor(word: { id: string; field?: string } | string): ImageSourcePropType | null {
  if (!FEED_BG.length) return null;
  const id = typeof word === 'string' ? word : (word.id || '');
  const rawField = typeof word === 'string' ? 'gen' : (word.field || 'gen');
  const bucket = rawField === 'med' || rawField === 'law' || rawField === 'biz' ? rawField : 'gen';
  const pool = BUCKETS[bucket]?.length ? BUCKETS[bucket] : FEED_BG.map((_, i) => i);
  return FEED_BG[pool[hash(id) % pool.length]];
}
