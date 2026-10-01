import { Word } from '../data/types';

// Words whose only claim to "advanced" is that they're industry jargon/acronyms (MRR, CAC, TAM,
// NDA, MVP...) rather than genuinely elevated ENGLISH vocabulary - a working professional already
// knows these day one, so showing them in a "look how deep your field's vocabulary goes" sample
// undersells the app instead of impressing anyone. Detected cheaply: any synonym that's a short
// all-caps acronym (a real English word essentially never has one).
const ACRONYM_SYN = /^[A-Z]{2,8}$/;
const isJargonAcronym = (w: Word): boolean => !!w.syn?.some((s) => ACRONYM_SYN.test(s));

// ANY multi-word entry - not just ones tagged pos:"phrase". Real gap found live: "earnest money"
// is tagged pos:"n" (a regular noun), not "phrase", so the old phrase-only check missed it
// entirely, same as "monthly recurring revenue" would have if it hadn't also had an acronym syn.
// A packaged multi-word term (compound noun, collocation, whatever the corpus calls its part of
// speech) reads as jargon/a phrase either way - single striking words are what actually impress.
const isPhrase = (w: Word): boolean => w.word.includes(' ');

// Formally C2 (genuinely harder syntax/register than everyday speech) but so overexposed through
// general schooling/news that they don't read as "insider" to any field - real gap found live:
// "despotism" passed every other filter (C2, no acronym, single word) yet still read as basic.
// CEFR measures difficulty, not "would this surprise a professional" - these are the common
// political/social-science -ism/-ocracy/-archy family that shows up in any history or current-
// events discussion, not specialized field vocabulary. Hand-curated, same precedent as
// TRANSPARENT_MED in lib/db.ts (transparent medical cognates that pass CEFR but read as basic).
const OVEREXPOSED = new Set([
  'despotism', 'autocracy', 'democracy', 'monarchy', 'oligarchy', 'aristocracy', 'bureaucracy',
  'hierarchy', 'anarchy', 'tyranny', 'plutocracy', 'theocracy', 'capitalism', 'socialism',
  'communism', 'feudalism', 'colonialism', 'imperialism', 'nationalism', 'patriotism',
  'extremism', 'terrorism', 'racism', 'sexism', 'activism', 'criticism', 'journalism', 'tourism',
  'optimism', 'pessimism', 'idealism', 'realism', 'cynicism', 'propaganda', 'censorship',
]);
const isOverexposed = (w: Word): boolean => OVEREXPOSED.has(w.word.toLowerCase());

// Prefer genuinely insider vocabulary for "impress the user" sample contexts (onboarding's
// sceneField / aha / personalize previews). NEVER use this for the placement test or feed
// ordering, which need the real C1/C2 mix, not a curated-best slice.
//
// Four biases, applied in order, each only taking effect if enough words remain so the pool
// never goes empty: drop acronym-jargon terms, drop packaged conversational phrases, drop
// overexposed general-education vocabulary, then prefer C2 over C1 (a field's C1 tier skews
// toward terms laypeople already half-know - implant, caries; C2 is the real insider register -
// edentulous, periodontitis).
export function preferInsiderVocab(pool: Word[]): Word[] {
  const noJargon = pool.filter((w) => !isJargonAcronym(w));
  const step1 = noJargon.length >= 3 ? noJargon : pool;
  const noPhrase = step1.filter((w) => !isPhrase(w));
  const step2 = noPhrase.length >= 3 ? noPhrase : step1;
  const noOverexposed = step2.filter((w) => !isOverexposed(w));
  const step3 = noOverexposed.length >= 3 ? noOverexposed : step2;
  const c2 = step3.filter((w) => w.cefr === 'C2');
  return c2.length >= 3 ? c2 : step3;
}
