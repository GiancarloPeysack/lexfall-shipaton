import { getReview, upsertReview, ReviewRow } from './db';

// Lightweight SM-2 spaced repetition. grade: false = missed, true = recalled.
// (FSRS is the production target; SM-2 is a solid, tiny first cut.)
const DAY = 86_400_000;

export async function recordReview(wordId: string, correct: boolean) {
  const prev = (await getReview(wordId)) ?? { word_id: wordId, due: Date.now(), interval: 0, ease: 2.5, reps: 0, lapses: 0 };
  let { interval, ease, reps, lapses } = prev;

  if (!correct) {
    reps = 0;
    lapses += 1;
    interval = 0; // see again today
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    ease = Math.min(2.8, ease + 0.05);
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 3;
    else interval = Math.round(interval * ease);
  }

  const next: ReviewRow = {
    word_id: wordId,
    due: Date.now() + interval * DAY,
    interval, ease, reps, lapses,
  };
  await upsertReview(next);
  return next;
}

// First GENTLE exposure - the daily session's LEARN phase (spaced learn/recall model,
// 2026-09-27). The word was just TAUGHT, not tested, so it must not run through the graded
// recordReview path: an ok=true there reads as a successful recall and, stacked on the feed's
// eager recordReview-on-view reps, could catapult a never-actually-tested word out to a
// multi-day interval before its first real recall. Instead the row is pinned to the intro
// state: one rep, a one-day interval, due at the NEXT LOCAL MIDNIGHT - deliberately not
// now+24h, so tomorrow's session sees the word as due whatever time of day either session
// happens. Existing ease/lapses (from feed flicks or old practice) are preserved; reps and
// interval are RESET so an eager-inflated row still gets its honest first recall tomorrow.
export async function recordIntro(wordId: string) {
  const prev = await getReview(wordId);
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0); // start of tomorrow, local time (matches todayStr rollover)
  const next: ReviewRow = {
    word_id: wordId,
    due: midnight.getTime(),
    interval: 1,
    ease: prev?.ease ?? 2.5,
    reps: 1,
    lapses: prev?.lapses ?? 0,
  };
  await upsertReview(next);
  return next;
}
