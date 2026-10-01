import { supabase } from './supabase';
import {
  getLocalSaved, getLocalReview, getLocalProgress,
  mergeSaved, mergeReview, mergeProgress,
} from './db';

// Cross-device user-data sync — the "log in on any device and everything's there"
// half of a Vocabulary-style backend. The word CORPUS syncs via word-sync.ts; THIS
// syncs the per-user state (saved words, SRS/review state, daily progress) to the
// Supabase tables (saved_words / review_state / daily_progress, RLS-scoped per user).
//
// Strategy: PULL merges remote into local additively (union saves, max reps, max
// learned) so no device's progress is ever lost; PUSH upserts local up. Full sync
// = pull then push, so devices converge. All best-effort: no session / offline => no-op.

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function pullUserData(): Promise<void> {
  const id = await currentUserId();
  if (!id) return;
  try {
    const [s, r, p] = await Promise.all([
      supabase.from('saved_words').select('word_id, collection, created_at').eq('user_id', id),
      supabase.from('review_state').select('word_id, due, stability, difficulty, reps, lapses').eq('user_id', id),
      supabase.from('daily_progress').select('day, learned').eq('user_id', id),
    ]);
    if (s.data?.length) await mergeSaved(s.data as any);
    if (r.data?.length) await mergeReview(r.data as any);
    if (p.data?.length) await mergeProgress(p.data as any);
  } catch { /* offline / not signed in — local still serves everything */ }
}

export async function pushUserData(): Promise<void> {
  const id = await currentUserId();
  if (!id) return;
  try {
    const [saved, review, progress] = await Promise.all([getLocalSaved(), getLocalReview(), getLocalProgress()]);
    if (saved.length) {
      await supabase.from('saved_words').upsert(
        saved.map((x) => ({ user_id: id, word_id: x.word_id, collection: x.collection, created_at: new Date(x.created).toISOString() })),
        { onConflict: 'user_id,word_id,collection' });
    }
    if (review.length) {
      // Local SM-2 (interval/ease) maps onto the table's FSRS columns (stability/difficulty);
      // it round-trips consistently even though the semantics are approximate.
      await supabase.from('review_state').upsert(
        review.map((x) => ({ user_id: id, word_id: x.word_id, due: new Date(x.due).toISOString(), stability: x.interval, difficulty: x.ease, reps: x.reps, lapses: x.lapses })),
        { onConflict: 'user_id,word_id' });
    }
    if (progress.length) {
      await supabase.from('daily_progress').upsert(
        progress.map((x) => ({ user_id: id, day: x.day, learned: x.learned })),
        { onConflict: 'user_id,day' });
    }
  } catch { /* offline — will retry on next sync */ }
}

// Pull others' data in, then push merged local back up. Call on launch (with a
// session), after sign-in, and when the app goes to background.
export async function syncUserData(): Promise<void> {
  await pullUserData();
  await pushUserData();
}
