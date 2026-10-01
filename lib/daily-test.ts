import AsyncStorage from '@react-native-async-storage/async-storage';
import { Word, FieldId } from '../data/types';
import { getDueWords, getMistakes, getReview, getWordById, getWordsByField, isQualityWord } from './db';
import { getPresentedIds, addPresentedIds } from './presented';
import { personalizedFeedStream } from './feed-mix';

// Daily session (owner idea 2026-09-12; SPACED LEARN/RECALL rebuild 2026-09-27): once a day,
// two phases in one sitting.
//   LEARN  - up to N_NEW brand-new words from the SAME personalized stream the feed serves
//            (never-presented per the vorto.presentedIds ledger), taught gently: a LessonCard
//            each, "Got it" to advance, UNGRADED. Each "Got it" writes an intro SRS row (due
//            at the next local midnight) + the presented mark, which is what queues the word
//            for a REAL recall on a following day.
//   RECALL - the graded gate: words introduced on PRIOR days that the SRS now says are due
//            (edge of forgetting), tested in production-biased formats. The testing effect
//            strengthens recall, not recognition - and spaced retrieval beats a same-session
//            re-check by a wide margin, which is why a word is never tested the day it is
//            taught. Reuses the SRS engine that already exists (getDueWords/recordReview)
//            rather than inventing a second "what's due" concept.
//
// Not hard-locked to once/day: a paid app shouldn't restrict something the user already owns.
// The lock is soft - the streak is what creates the "once a day" incentive.

const STATE_KEY = 'vorto.dailyTest';
const STREAK_KEY = 'vorto.dailyTestStreak';
const MASTERED_KEY = 'vorto.dailyTestMastered'; // running count of days ADVANCED (recall cleared)

// New words taught per day (LEARN phase). Deliberately small: five gentle first exposures a
// day compound to ~150 words/month, and the recall load they create a day or three out stays
// humane. Tune here, nowhere else.
export const N_NEW = 5;
// Cap on due words tested per day (RECALL phase), so a user returning after a gap gets a
// bounded session instead of a wall of everything overdue (the rest simply stays due and
// fills the following days).
export const RECALL_MAX = 12;
// Legacy display fallback only (the hub card before any state exists). The real session size
// is learnIds.length + wordIds.length.
export const DAILY_TEST_COUNT = 10;

export type DailyTestState = {
  date: string; // YYYY-MM-DD
  // The RECALL set: due words from prior days - the day's graded gate. (Before the 2026-09-27
  // spaced model these were the day's new words; every downstream reader - answered, cleared,
  // dailyLeftToClear, the Journey node, the hub card - already keyed on wordIds, so pointing
  // wordIds at the recall set repoints the whole gate in one move, no reader changes.)
  wordIds: string[];
  answered: Record<string, boolean>; // recall wordId -> correct on the FIRST attempt?
  completed: boolean;
  // ADVANCEMENT (distinct from the streak). The streak is earned by COMPLETING the round
  // (finishing all 10, accuracy irrelevant). Advancement — moving UP the journey/path — is
  // MASTERY: every one of today's words answered correctly, whether on the first pass (a clean
  // 10/10) or after drilling the missed words down to zero. This flag records that the day was
  // mastered; it is additive and optional, so older stored states (no field) simply read as
  // not-yet-advanced. Never gates the streak.
  mastered?: boolean;
  // FIX-PHASE progress (additive, learn-then-check model 2026-09-26). `answered` freezes the
  // FIRST check of each word (that's what feeds accuracy/SRS and tomorrow's carry-over), so a
  // word cleared later in the fix phase needs its own record — otherwise quitting mid-fix and
  // reopening would restart the whole fix phase instead of resuming with "N left to clear".
  // Contains only ids whose first check was WRONG but that have since been cleared (retest
  // passed, or the twice-missed guardrail finished its final requeue). Older states without
  // the field simply read as nothing-cleared-yet.
  cleared?: string[];
  // LEARN phase (additive, spaced model 2026-09-27): today's brand-new words, taught gently
  // and UNGRADED. Missing on older stored states, which simply read as a learn-less day.
  learnIds?: string[];
  // Learn ids whose card was "Got it"-ed, persisted so quitting mid-learn resumes exactly
  // there (the parallel of `cleared` for the fix phase). Each entry already carries its intro
  // SRS row + presented-ledger mark, written by the session screen at the moment of the tap.
  learned?: string[];
};

export type DailyTestStreak = { count: number; lastCompletedDate: string | null };

// FNV-1a — a stable numeric seed from today's date string, so the personalized stream's
// follows-weighted merge is deterministic for the day (a rebuilt day picks identical words).
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => dateStr(new Date());
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dateStr(d); };

async function readState(): Promise<DailyTestState | null> {
  const raw = await AsyncStorage.getItem(STATE_KEY).catch(() => null);
  return raw ? JSON.parse(raw) : null;
}
async function writeState(s: DailyTestState) {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(s)).catch(() => {});
}

export async function getDailyTestStreak(): Promise<DailyTestStreak> {
  const raw = await AsyncStorage.getItem(STREAK_KEY).catch(() => null);
  return raw ? JSON.parse(raw) : { count: 0, lastCompletedDate: null };
}

// ── The "already presented" ledger ───────────────────────────────────────────
// The UNIFIED presented ledger (vorto.presentedIds, lib/presented.ts) cuts both ways in the
// spaced model. LEARN: a word may be taught as new ONLY if the user has never genuinely met
// it — never taught here, never dwelled on (>= 2s) or interacted with in the feed (a fast
// flick deliberately does NOT count, that word is still teachable). RECALL: the mirror image —
// a due word is only worth testing if the user HAS actually met it (getDueWords pads its tail
// with never-reviewed words; the presented filter cuts that padding, so recall never quizzes a
// stranger). The old daily-test-only vorto.dailyTaughtIds is OR-read into the ledger, so
// nothing regresses.

// The exhausted-corpus fallback: mistakes first (known weak spots), then genuinely due words —
// the same SRS data the app already keeps. Used only when there is nothing left to teach AND
// nothing due to recall, so a long-time user's quiet day still gets a session instead of an
// empty screen.
async function buildReviewFallback(field: FieldId, exclude: Set<string>): Promise<Word[]> {
  const [mistakes, due] = await Promise.all([getMistakes(40), getDueWords(field, 40)]);
  const out: Word[] = [];
  for (const w of [...mistakes.filter((w) => w.field === field || field === 'gen'), ...due]) {
    if (!exclude.has(w.id) && isQualityWord(w)) { exclude.add(w.id); out.push(w); }
  }
  return out;
}

// Returns today's state (building or resuming it as needed) plus the resolved Word objects
// still pending in each phase: pendingLearn = learn cards not yet "Got it"-ed, pendingRecall =
// recall words without a first answer (both empty once the day is done).
export async function getOrBuildDailyTest(field: FieldId): Promise<{ state: DailyTestState; pendingLearn: Word[]; pendingRecall: Word[] }> {
  const today = todayStr();
  let state = await readState();

  if (!state || state.date !== today) {
    // Carry yesterday's WRONG recalls to the front of today's recall set (owner: "if one is
    // wrong it goes to the next day exam") - only when the stored state really was yesterday,
    // so a multi-day gap doesn't force-feed stale words forever. Their recordReview(false)
    // already made them due (interval reset to 0), so getDueWords would surface them anyway;
    // the explicit carry just guarantees they can't be crowded out of the RECALL_MAX cap by a
    // backlog of older overdue words.
    const carryIds = state && state.date === yesterdayStr()
      ? state.wordIds.filter((id) => state!.answered[id] === false)
      : [];
    // Backfill the ledger from the outgoing day. For pre-spaced-model installs this is the
    // migration that records the last old-model day's taught words as presented; for the new
    // model it's a no-op (recall words are presented by definition, and learn words enter the
    // ledger individually on "Got it" - an un-got card deliberately stays teachable-as-new).
    if (state) await addPresentedIds(state.wordIds);

    const presented = await getPresentedIds();
    const used = new Set<string>();

    // ── RECALL: due words from PRIOR days (the graded gate) ────────────────────────────────
    // getDueWords pads its tail with never-reviewed words - the presented filter cuts that
    // padding, so recall only ever tests words the user has actually met (taught here, or
    // genuinely dwelled/interacted in the feed, which also wrote their SRS row via the eager
    // recordReview-on-view). Today's learn words can't leak in: they're picked from
    // never-presented below, and their intro rows aren't due until tomorrow anyway.
    const recall: Word[] = [];
    const takeRecall = (pool: Word[]) => {
      for (const w of pool) {
        if (recall.length >= RECALL_MAX) break;
        if (used.has(w.id) || !presented.has(w.id) || !isQualityWord(w)) continue;
        used.add(w.id);
        recall.push(w);
      }
    };
    const carryWords = (await Promise.all(carryIds.map((id) => getWordById(id)))).filter((w): w is Word => !!w);
    takeRecall(carryWords);
    takeRecall(await getDueWords(field, RECALL_MAX * 5)); // over-fetch: the filter discards the unseen padding
    // The cap can still crowd out a genuinely presented due word: the feed's eager
    // recordReview-on-view means most "due" rows are strangers, and when the LIMIT boundary
    // falls inside a tie the presented word can be the one randomly dropped (seen live: 4 of 5
    // day-one words surfaced). One much wider second pass, only on under-filled days, makes the
    // cut effectively presented-aware without moving the ledger into SQL.
    if (recall.length < RECALL_MAX) takeRecall(await getDueWords(field, 1000));

    // ── LEARN: up to N_NEW brand-new words (gentle, ungraded) ─────────────────────────────
    // TIER 1: the SAME personalized stream the feed serves (lib/feed-mix.ts: taste ranker +
    // rarity dial as a soft bias, follows weighted ~80/20 within the field), filtered to words
    // never PRESENTED. Eligibility is the presented ledger ONLY - a word the feed fast-flicked
    // past may carry eager review reps, but it was never really met, so it's still teachable.
    // The seed is day-stable so a rebuilt day picks identically.
    const seed = hashStr(today);
    const learn: Word[] = [];
    const takeLearn = (pool: Word[]) => {
      for (const w of pool) {
        if (learn.length >= N_NEW) break;
        if (used.has(w.id) || presented.has(w.id) || !isQualityWord(w)) continue;
        used.add(w.id);
        learn.push(w);
      }
    };
    let tier = 'personalized feed stream';
    takeLearn(await personalizedFeedStream(field, seed));
    // TIER 2 (safety net - with a 25k+ corpus planned, normal fields shouldn't exhaust):
    // widen to never-presented words from the WHOLE field, ignoring follows.
    if (learn.length < N_NEW) {
      tier = 'whole-field pool';
      takeLearn(await getWordsByField(field));
    }
    // TIER 3: nothing left to teach AND nothing due to recall (a long-time user's quiet day) -
    // fill recall from review (mistakes first, then due) so the session never comes up empty.
    // No presented requirement here: practice mistakes were unquestionably met, even if the
    // practice screens never wrote the ledger.
    if (!learn.length && !recall.length) {
      tier = 'review fallback';
      for (const w of await buildReviewFallback(field, used)) {
        if (recall.length >= RECALL_MAX) break;
        recall.push(w);
      }
    }
    if (__DEV__) console.log(`[daily-test] built ${today}: ${recall.length} recall (${carryWords.length} carried) + ${learn.length} to learn (new from: ${tier})`);

    state = {
      date: today,
      wordIds: recall.map((w) => w.id),
      answered: {},
      completed: false,
      learnIds: learn.map((w) => w.id),
      learned: [],
    };
    await writeState(state);
    // NOTE: learn ids are deliberately NOT pre-added to the presented ledger - a word enters
    // it (and gets its intro SRS row) only when its card is actually "Got it"-ed, so a day
    // quit mid-learn leaves the untaught words genuinely teachable tomorrow.
  }

  const learnedSet = new Set(state.learned ?? []);
  const [learnResolved, recallResolved] = await Promise.all([
    Promise.all((state.learnIds ?? []).filter((id) => !learnedSet.has(id)).map((id) => getWordById(id))),
    Promise.all(state.wordIds.filter((id) => state!.answered[id] === undefined).map((id) => getWordById(id))),
  ]);
  return {
    state,
    pendingLearn: learnResolved.filter((w): w is Word => !!w),
    pendingRecall: recallResolved.filter((w): w is Word => !!w),
  };
}

// Record a LEARN-phase "Got it" for one word, so quitting mid-learn resumes exactly where it
// left off. The card's real side effects (the intro SRS row + the presented-ledger mark) are
// written by the session screen at the moment of the tap; this only persists which cards are
// done. Idempotent.
export async function markDailyLearned(wordId: string): Promise<void> {
  const state = await readState();
  if (!state || state.date !== todayStr()) return;
  const learned = new Set(state.learned ?? []);
  if (learned.has(wordId)) return;
  learned.add(wordId);
  state.learned = [...learned];
  await writeState(state);
}

// Call once per RECALL answer during today's round. Finalizes + bumps the streak the moment
// the session is COMPLETE - learn done + every recall attempted - exactly once (idempotent;
// re-answering after completion, i.e. a voluntary retake, no longer touches state at all).
export async function recordDailyAnswer(wordId: string, ok: boolean): Promise<void> {
  const state = await readState();
  if (!state || state.date !== todayStr() || state.completed) return;
  state.answered[wordId] = ok;
  const allAnswered = state.wordIds.every((id) => state.answered[id] !== undefined);
  const learnDone = (state.learnIds ?? []).every((id) => (state.learned ?? []).includes(id));
  if (allAnswered && learnDone) {
    state.completed = true;
    const streak = await getDailyTestStreak();
    const nextCount = streak.lastCompletedDate === yesterdayStr() ? streak.count + 1 : 1;
    await AsyncStorage.setItem(STREAK_KEY, JSON.stringify({ count: nextCount, lastCompletedDate: todayStr() })).catch(() => {});
  }
  await writeState(state);
}

// Force-finalize today's session + award the streak, exactly once. The streak is earned by
// COMPLETING the session (learn done + every recall attempted), not by accuracy - so once the
// session screen's queue actually ends, the day is done by definition. recordDailyAnswer
// handles the normal case (it flips completed the moment the last recall lands); this is the
// safety net the session calls at queue end so a streak can never be silently lost (a
// since-deleted word, an interrupted write) - and on a LEARN-ONLY cold-start day (nothing due
// yet, wordIds empty) it is the one thing that completes the day at all. Idempotent: a no-op
// once today is already completed, so a voluntary retake never double-bumps.
export async function finalizeDailyTest(): Promise<void> {
  const state = await readState();
  if (!state || state.date !== todayStr() || state.completed) return;
  state.completed = true;
  await writeState(state);
  const streak = await getDailyTestStreak();
  const nextCount = streak.lastCompletedDate === yesterdayStr() ? streak.count + 1 : 1;
  await AsyncStorage.setItem(STREAK_KEY, JSON.stringify({ count: nextCount, lastCompletedDate: todayStr() })).catch(() => {});
}

// Was this word already ENCOUNTERED today (swiped past in the feed, or answered in practice)?
// The app has no dedicated per-day "seen in feed" tracker, and building one for this would be
// over-engineering — but the feed already writes an SRS review row the first time a word
// scrolls into view (app/(tabs)/index.tsx onViewable → recordReview(id, true)), and every
// recordReview sets `due = now + interval*DAY`. So `due - interval*DAY` IS the last-touched
// timestamp, recoverable exactly with no schema change. If that lands today, the user met the
// word today → the teach step can be a one-line refresher instead of a full card. (Practice
// answers today also match, which is fine: either way the word isn't new-to-them today.)
const DAY_MS = 86_400_000;
export async function wasEncounteredToday(wordId: string): Promise<boolean> {
  const row = await getReview(wordId).catch(() => null);
  if (!row) return false;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  return row.due - row.interval * DAY_MS >= startOfToday.getTime();
}

// Which of today's words are still to clear: first check was wrong AND the fix phase hasn't
// cleared them yet. Pure + exported so the session screen, the Journey path node and the
// practice-hub card all derive "N left to clear" from the SAME stored state and can never
// disagree. An unanswered word is not "to clear" — it's still mid-round (pending).
export function dailyLeftToClear(state: DailyTestState | null): string[] {
  if (!state) return [];
  const cleared = new Set(state.cleared ?? []);
  return state.wordIds.filter((id) => state.answered[id] === false && !cleared.has(id));
}

// Record a fix-phase clear for one word (retest passed, or the guardrail's final requeue
// finished). Post-completion only mutation the daily record allows — `answered` itself stays
// frozen (it's the truthful first-check record that feeds SRS + tomorrow's carry-over).
// Idempotent. Returns how many words are STILL left to clear after this one.
export async function markDailyCleared(wordId: string): Promise<number> {
  const state = await readState();
  if (!state || state.date !== todayStr()) return 0;
  const cleared = new Set(state.cleared ?? []);
  if (!cleared.has(wordId)) {
    cleared.add(wordId);
    state.cleared = [...cleared];
    await writeState(state);
  }
  return dailyLeftToClear(state).length;
}

// Mark today's session as MASTERED (ADVANCED). Advancement is distinct from the streak: the
// streak only needs the session finished, but advancing up the path needs every due RECALL
// cleared — right on the first pass, or the missed words drilled to zero in the fix phase. On
// a learn-only cold-start day (no recalls yet) completing the teach cards is the bar. Call this the
// moment there are no outstanding misses (either path). Idempotent: the mastered-day count bumps
// exactly once per day, so a voluntary retake or a re-cleared drill can't inflate it. Returns
// whether THIS call is what newly advanced the day (for a one-shot celebration), and whether the
// day was already mastered.
export async function markDailyMastered(): Promise<{ advanced: boolean; alreadyMastered: boolean }> {
  const state = await readState();
  if (!state || state.date !== todayStr()) return { advanced: false, alreadyMastered: false };
  if (state.mastered) return { advanced: false, alreadyMastered: true };
  state.mastered = true;
  await writeState(state);
  const prev = parseInt((await AsyncStorage.getItem(MASTERED_KEY)) || '0', 10);
  await AsyncStorage.setItem(MASTERED_KEY, String(prev + 1)).catch(() => {});
  return { advanced: true, alreadyMastered: false };
}

// Has today's test been mastered (advanced)? Read-only.
export async function isDailyMastered(): Promise<boolean> {
  const state = await readState();
  return !!(state && state.date === todayStr() && state.mastered);
}

// Total number of days the user has ADVANCED (mastered all 10). Read-only; for Stats/achievements.
export async function getMasteredDayCount(): Promise<number> {
  return parseInt((await AsyncStorage.getItem(MASTERED_KEY)) || '0', 10);
}

// For the Practice-hub card / Stats: today's state without mutating anything (read-only peek).
export async function peekDailyTest(): Promise<DailyTestState | null> {
  const state = await readState();
  return state && state.date === todayStr() ? state : null;
}

// The current calendar week, MONDAY -> SUNDAY (matching the Progress/stats strip so the two
// never disagree), each day flagged done. A streak's count IS, by construction, the number of
// consecutive days completed ending at lastCompletedDate, so a day is "done" if it falls within
// `count` days ending at lastCompletedDate. Future days of this week are simply not-done yet.
// Pass the user's signup day (vorto.signupDate, see lib/streak.ts getSignupDate) and days of
// this week that PRECEDE it come back flagged `preSignup` — the user wasn't here yet, so those
// days must render as inactive, never as "missed". The parameter is optional and the new field
// is additive, so existing callers (practice-hub week strip) are untouched.
export function weekProgress(
  streak: DailyTestStreak,
  signupDate?: string | null,
): { date: string; done: boolean; preSignup: boolean }[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // back up to this week's Monday
  const days: { date: string; done: boolean; preSignup: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const ds = dateStr(d);
    let done = false;
    if (streak.lastCompletedDate) {
      const diff = Math.round((Date.parse(`${streak.lastCompletedDate}T00:00:00`) - Date.parse(`${ds}T00:00:00`)) / 86400000);
      done = diff >= 0 && diff < streak.count;
    }
    // YYYY-MM-DD compares correctly as a plain string. A completed day can never read as
    // pre-signup (done wins), so a restored install with history keeps its gold days.
    const preSignup = !!signupDate && ds < signupDate && !done;
    days.push({ date: ds, done, preSignup });
  }
  return days;
}
