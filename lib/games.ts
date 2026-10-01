import { Word } from '../data/types';

export type GameMode = 'guess' | 'gap' | 'meaning' | 'synonym';

export interface Question {
  word: Word;
  promptLabel: string;
  prompt: string;        // the question text
  options: string[];     // option labels
  answer: string;        // correct label
  optionStyle: 'word' | 'def';
  promptKind: 'word' | 'text';  // 'word' = prompt is a single headword (render large); 'text' = a sentence/definition
}

export const MODE_TITLE: Record<GameMode, string> = {
  guess: 'Guess the word',
  gap: 'Fill in the gap',
  meaning: 'Meaning match',
  synonym: 'Match synonyms',
};

// Fisher-Yates — unbiased. (The old `sort(() => Math.random() - 0.5)` is statistically
// skewed, which biases where the correct option lands and makes the test gameable at the margin.)
const shuffle = <T,>(a: T[]): T[] => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};
// Building a regex straight from the headword crashes if the word contains a regex-special
// character (parens, periods, brackets, etc.) - not verifiable against the full ~11k synced
// corpus from here, so this is defensive: escape the word before compiling, and never let a
// malformed pattern throw past this function (fall back to the sentence as-is).
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blank = (sentence: string, word: string) => {
  try {
    return sentence.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i'), '_____');
  } catch {
    return sentence;
  }
};

// A distractor must not secretly be a correct answer. Reject near-synonyms in either direction.
const nearSynonym = (a: Word, b: Word) =>
  a.word.toLowerCase() === b.word.toLowerCase() ||
  (a.syn || []).some((s) => s.toLowerCase() === b.word.toLowerCase()) ||
  (b.syn || []).some((s) => s.toLowerCase() === a.word.toLowerCase());

// Pick n distractor words for target w. Constraints (relax only if the pool is too small):
// same field/register, not a near-synonym of w, and — for definition options — a similar
// definition length so length isn't a tell.
function pickDistractors(pool: Word[], w: Word, n: number, byDef: boolean): Word[] {
  let cands = pool.filter((x) => x.id !== w.id && x.field === w.field && !nearSynonym(w, x));
  // Same part of speech, so grammar isn't a tell: an (adj) target with a (n) distractor
  // ("A state of awed admiration") is eliminable before the user knows the word. (#63/#8)
  const samePos = cands.filter((x) => x.pos === w.pos);
  if (samePos.length >= n) cands = samePos;
  if (byDef && cands.length >= n) {
    const L = w.def.length;
    const band = cands.filter((x) => Math.abs((x.def?.length ?? 0) - L) <= Math.max(30, L * 0.6));
    if (band.length >= n) cands = band;
  }
  if (cands.length < n) cands = pool.filter((x) => x.id !== w.id && !nearSynonym(w, x));
  if (cands.length < n) cands = pool.filter((x) => x.id !== w.id);
  return shuffle(cands).slice(0, n);
}

// Can a single question of this mode be built for this specific word? Only 'synonym' has a
// hard prerequisite (the word must carry at least one synonym); the other three always work.
// Exported for the daily test's learn-then-check stepper, which assigns each word its own
// first-check mode (and a DIFFERENT mode for the fix-phase retest) instead of taking a
// pre-built round.
export const canDoMode = (w: Word, mode: GameMode) => mode !== 'synonym' || !!(w.syn && w.syn.length);

// Build ONE question of the given mode for a specific word. Returns null only if the word
// can't support that mode (synonym without a synonym) - callers fall back to another mode.
// Exported (see canDoMode above): the daily test builds exactly one question per step so it can
// interleave teach cards and checks, and guarantee the fix-phase retest uses a different format.
export function buildQuestionForWord(pool: Word[], w: Word, mode: GameMode, numDistractors = 2): Question | null {
  if (!canDoMode(w, mode)) return null;
  const distractorWords = pickDistractors(pool, w, numDistractors, mode === 'meaning');
  if (mode === 'synonym') {
    const correct = w.syn![0];
    // Build two distinct distractors: prefer other words' synonyms, then top
    // up with other headwords so we always land on exactly 3 valid options.
    const opts = [correct];
    const ownSyn = (w.syn || []).map((s) => s.toLowerCase());
    // Prefer same-field candidates; a distractor must be neither the headword nor one of its
    // own synonyms (either would be a second correct answer).
    const synCands = shuffle(pool.filter((x) => x.id !== w.id && x.field === w.field && x.syn && x.syn.length)).map((x) => x.syn![0]);
    const wordCands = shuffle(pool.filter((x) => x.id !== w.id && x.field === w.field)).map((x) => x.word);
    const wordCandsAny = shuffle(pool.filter((x) => x.id !== w.id)).map((x) => x.word);
    for (const c of [...synCands, ...wordCands, ...wordCandsAny]) {
      if (opts.length >= 3) break;
      const cl = c.toLowerCase();
      if (!opts.some((o) => o.toLowerCase() === cl) && cl !== w.word.toLowerCase() && !ownSyn.includes(cl)) opts.push(c);
    }
    return { word: w, promptLabel: 'Pick a synonym for', prompt: w.word, options: shuffle(opts), answer: correct, optionStyle: 'word', promptKind: 'word' };
  }
  if (mode === 'meaning') {
    const opts = shuffle([w.def, ...distractorWords.map((d) => d.def)]);
    return { word: w, promptLabel: 'What does it mean', prompt: w.word, options: opts, answer: w.def, optionStyle: 'def', promptKind: 'word' };
  }
  const opts = shuffle([w.word, ...distractorWords.map((d) => d.word)]);
  if (mode === 'gap') {
    return { word: w, promptLabel: 'Fill the gap', prompt: blank(w.ex, w.word), options: opts, answer: w.word, optionStyle: 'word', promptKind: 'text' };
  }
  return { word: w, promptLabel: 'Which term means', prompt: w.def, options: opts, answer: w.word, optionStyle: 'word', promptKind: 'text' };
}

export function buildQuestions(pool: Word[], mode: GameMode, n = 10, numDistractors = 2): Question[] {
  const base = mode === 'synonym' ? pool.filter((w) => w.syn && w.syn.length) : pool;
  const items = shuffle(base).slice(0, Math.min(n, base.length));
  return items
    .map((w) => buildQuestionForWord(pool, w, mode, numDistractors))
    .filter((q): q is Question => q !== null);
}

// Mixed round: rotate question types so you're tested in different ways, not just one format.
// IMPORTANT: each selected word is asked EXACTLY ONCE (one question per distinct word), rotating
// the mode across the round. The old implementation built an independent slice PER mode, each
// re-sampling the pool - which asked some words twice and skipped others entirely. That silently
// broke the daily test: its completion (and the streak) only fires once every one of its 10
// words has an answer, so any skipped word meant the round could never complete. A word that
// can't do its rotated mode (e.g. 'synonym' with no synonym) falls back to the first mode it can.
export function buildMixedQuestions(pool: Word[], n = 10, modes: GameMode[] = ['meaning', 'gap', 'guess', 'synonym']): Question[] {
  const words = shuffle(pool).slice(0, Math.min(n, pool.length));
  const out: Question[] = [];
  words.forEach((w, idx) => {
    const rotated = modes[idx % modes.length];
    const mode = canDoMode(w, rotated) ? rotated : (modes.find((m) => canDoMode(w, m)) ?? 'meaning');
    const q = buildQuestionForWord(pool, w, mode);
    if (q) out.push(q);
  });
  return out;
}
