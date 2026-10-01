import { SEED } from '../data/words';
import { FieldId, Word } from '../data/types';
import { HOOK_IDS } from './hooks';

// The free taste is a FIXED set of starter words, not an ongoing free tier: a
// non-subscriber sees these ~15 words (in the feed and on the word screen) and
// everything else is walled behind the paywall. Keeping it a fixed list - rather
// than "the first N of a rotating feed" - means the free surface is identical
// everywhere (feed, deep links, Explore taps) and stays honest about being a taste.
export const FREE_WORD_LIMIT = 15;

// The free taste LEADS with the catchiest words (see lib/hooks) so a
// non-subscriber's first impression is delight — petrichor, serendipity,
// ineffable — never dry or technical vocabulary. Falls back to a mixed
// round-robin only if the hook words somehow aren't in the bundle.
const FIELD_ORDER: FieldId[] = ['gen', 'med', 'law', 'biz'];
function pickMixed(): Word[] {
  const buckets = new Map<FieldId, Word[]>();
  for (const w of SEED) {
    if (w.field === 'new') continue;
    if (!buckets.has(w.field)) buckets.set(w.field, []);
    buckets.get(w.field)!.push(w);
  }
  const lists = FIELD_ORDER.map((f) => buckets.get(f) || []).filter((l) => l.length);
  const out: Word[] = [];
  for (let i = 0; out.length < FREE_WORD_LIMIT * 2; i++) {
    let added = false;
    for (const l of lists) if (i < l.length) { out.push(l[i]); added = true; }
    if (!added) break;
  }
  return out;
}
function pickStarters(): Word[] {
  const byId = new Map(SEED.map((w) => [w.id, w]));
  const hooks = HOOK_IDS.map((id) => byId.get(id)).filter(Boolean) as Word[];
  if (hooks.length >= FREE_WORD_LIMIT) return hooks.slice(0, FREE_WORD_LIMIT);
  const seen = new Set(hooks.map((w) => w.id));
  const filler = pickMixed().filter((w) => !seen.has(w.id));
  return [...hooks, ...filler].slice(0, FREE_WORD_LIMIT);
}

export const STARTER_WORDS: Word[] = pickStarters();
export const STARTER_IDS: string[] = STARTER_WORDS.map((w) => w.id);
const STARTER_SET = new Set(STARTER_IDS);

// True if a word is part of the free taste (viewable without a subscription).
export const isStarterWord = (id: string): boolean => STARTER_SET.has(id);
