// REAL, honestly-graded per-word CEFR levels + rarity scores, keyed by the corpus's own
// stable word id. This overlays - does NOT replace - the corpus's coarse `cefr` (C1/C2-only)
// field: that binary tagging is too blunt (some "C1" words are honestly B1/B2 in real
// difficulty, others deserve a true C2). Two independent axes per word:
//  - level: strict 6-tier CEFR (A1-C2, no decimals) - real linguistic difficulty as a general
//    English word, not how "basic" it feels to a professional in that field.
//  - rarity: 0-100, how infrequent the word is in everyday English (0 = everyone knows it, 100 =
//    almost never seen outside specialist/literary text). Independent of level - a C1 word can be
//    fairly common (low rarity) and a short-looking word can still be quite rare.
// LLM-authored (like the rest of this corpus's content), grounded in CEFR/Oxford 3000-5000
// frequency conventions - a spot-check pass before this scales to the full corpus is advisable.
// Coverage today: 11562 words (3462 med / 2936 law / 3494 biz / 1670 gen) - FULL corpus coverage.
// Grows only as new words are added to the corpus; see PROGRESS.md 2026-09-11/12/13.
import { Cefr6 } from './types';
import { Word } from './types';

export interface WordLevel {
  level: Cefr6;
  rarity: number; // 0-100
}

export const WORD_LEVELS: Record<string, WordLevel> = {
  "biz:80-20": { level: 'B2', rarity: 55 },
  "biz:a-b-test": { level: 'C1', rarity: 55 },
  "biz:a-b-testing": { level: 'C1', rarity: 55 },
  "biz:abatement": { level: 'C1', rarity: 60 },
  "biz:abdicate": { level: 'B2', rarity: 50 },
  "biz:abdication": { level: 'B2', rarity: 45 },
  "biz:above-the-line": { level: 'C1', rarity: 65 },
  "biz:abscond": { level: 'C1', rarity: 75 },
  "biz:absenteeism": { level: 'B2', rarity: 50 },
  "biz:absolute-advantage": { level: 'C1', rarity: 68 },
  "biz:absolve": { level: 'B2', rarity: 45 },
  "biz:absorb": { level: 'B1', rarity: 10 },
  "biz:absorption": { level: 'B2', rarity: 30 },
  "biz:abstain": { level: 'B2', rarity: 40 },
  "biz:acc-absorption": { level: 'B2', rarity: 25 },
  "biz:acc-accretive": { level: 'C2', rarity: 85 },
  "biz:acc-accrual": { level: 'C1', rarity: 65 },
  "biz:acc-accrue": { level: 'B2', rarity: 45 },
  "biz:acc-amortisation": { level: 'C1', rarity: 60 },
  "biz:acc-amortise": { level: 'C1', rarity: 60 },

export function getWordLevel(id: string): WordLevel | undefined {
  return WORD_LEVELS[id];
}

// The best real level to SHOW for a word: the fine 6-tier graded level (A1-C2) when this word has
// been honestly graded, else the corpus's own coarse C1/C2 tag (which is always present). Used to
// label a word with its actual level in-test instead of a generic "Mixed" round label (2026-09-18).
export function displayLevelFor(word: Word): Cefr6 {
  return WORD_LEVELS[word.id]?.level ?? word.cefr;
}

const PREMIUM: Cefr6[] = ['C1', 'C2'];
const isPremium = (id: string) => {
  const g = WORD_LEVELS[id];
  return !!g && PREMIUM.includes(g.level);
};

export type WordPref = 'practical' | 'balanced' | 'rare';

// House rule (owner, 2026-09-11): Lexfall is a C1-C2 app - wherever the graded dataset is used to
// pick or rank words (feed scrolling, onboarding preview screens, the level-check test), ALWAYS
// prioritize words we've graded C1/C2, ranked by rarity (rarest first) - never elevate a word we
// now know is honestly only B1/B2 just because the corpus's own coarse `cefr` field called it C1.
// Ungraded words (not yet in this starter 400-word batch) are kept, ranked in the MIDDLE (neutral -
// we simply don't know yet, that's not the same as "known basic"); words we've graded B1 or below
// sink to the very end. Order is stable: within each band, original pool order is preserved except
// the premium band is rarity-sorted.
export function rankByRarity(pool: Word[], pref: WordPref = 'balanced'): Word[] {
  const premium = pool.filter((w) => isPremium(w.id)).sort((a, b) =>
    pref === 'practical' ? WORD_LEVELS[a.id].rarity - WORD_LEVELS[b.id].rarity : WORD_LEVELS[b.id].rarity - WORD_LEVELS[a.id].rarity
  );
  const ungraded = pool.filter((w) => !WORD_LEVELS[w.id]);
  const basic = pool.filter((w) => WORD_LEVELS[w.id] && !isPremium(w.id));
  return [...premium, ...ungraded, ...basic];
}

// Picks `count` words for a "show off the vocabulary" moment (level-check pool, onboarding preview
// cards): graded-premium (C1/C2), rarest first, with light shuffling among the top slice so it's
// not bit-for-bit identical every time. Returns null (caller falls back to its own pre-existing
// heuristic, e.g. preferInsiderVocab on the corpus's coarse C1/C2 field) when fewer than `minGraded`
// pool words are graded C1/C2 - coverage is a random 400-word starter batch, so many topic-narrowed
// pools won't intersect it yet.
// Owner-facing difficulty/rarity dial (2026-09-11, "Set your goal" screen + Profile). "balanced"
// is today's original default (prioritize rarest graded C1/C2); "rare" pushes further toward the
// rarest available; "practical" flips toward the more common end of the still-C1/C2 (never B1/B2 -
// that's the hard excludeGradedBasic() floor, this dial only moves within the premium band).
export function pickPremiumWords(pool: Word[], count: number, opts?: { minGraded?: number; pref?: WordPref }): Word[] | null {
  const minGraded = opts?.minGraded ?? 4;
  const pref = opts?.pref ?? 'balanced';
  const graded = pool.filter((w) => isPremium(w.id));
  if (graded.length < Math.min(count, minGraded)) return null;
  const sorted = [...graded].sort((a, b) =>
    pref === 'practical' ? WORD_LEVELS[a.id].rarity - WORD_LEVELS[b.id].rarity : WORD_LEVELS[b.id].rarity - WORD_LEVELS[a.id].rarity
  );
  // "rare" takes the true top slice (least diluted by shuffle-in variety); "practical"/"balanced"
  // keep a wider slice so it doesn't always land on the exact same handful of words.
  const sliceSize = pref === 'rare' ? count : Math.max(count * 2, count);
  const topSlice = sorted.slice(0, sliceSize);
  const shuffled = [...topSlice].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// A small signed nudge for ranking code that already computes its own composite score (e.g. the
// feed's taste-based ranker in lib/db.ts) and just needs one more term biasing toward graded
// premium (C1/C2) words, scaled by rarity, and away from graded basic (B1 or below) ones. Ungraded
// words get 0 (no opinion yet - most of the corpus isn't graded yet). Scale is deliberately small
// so it nudges an existing relevance/taste signal rather than overriding it. `pref` shifts the
// rarity term the same way pickPremiumWords does.
export function rarityBonus(id: string, pref: WordPref = 'balanced'): number {
  const g = WORD_LEVELS[id];
  if (!g) return 0;
  if (!PREMIUM.includes(g.level)) return pref === 'practical' ? -0.15 : -0.3;
  const rarityFactor = pref === 'practical' ? 1 - g.rarity / 100 : g.rarity / 100;
  const base = pref === 'rare' ? 0.2 : 0.15;
  return base + rarityFactor * 0.25;
}

// Hard exclusion, not just a preference (owner, 2026-09-11: "always a C1-C2 word here, no basic
// words through the onboarding"). Lexfall's own promise is C1-C2 vocabulary - a word we've
// honestly graded B1/A2 has no business surfacing in onboarding, even as a fallback, because now
// that words carry a visible level badge (levelResults) a contradiction would show up on screen.
// Ungraded words (not yet in this starter batch) are KEPT - we simply don't know their real level
// yet, that's not the same as "known basic". Only words we've explicitly confirmed are B1-or-below
// get dropped.
export function excludeGradedBasic(pool: Word[]): Word[] {
  return pool.filter((w) => {
    const g = WORD_LEVELS[w.id];
    return !g || PREMIUM.includes(g.level);
  });
}
