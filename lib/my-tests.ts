import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PracticeMode } from '../components/Game';

// #85 "My tests": a Build-a-test recipe the user chose to keep, plus the history of how
// they did each time they ran it. Fully local (AsyncStorage), no backend.

export type TestRecipe = {
  // bTags (#29): union of every selected sub-area/axis's tags - multi-select, not a single pick.
  bSrcs: string[]; bMode: PracticeMode; bLen: number; bLevel: string; bTags: string[];
};
export type TestAttempt = { ts: number; correct: number; total: number };
export type SavedTest = {
  id: string; name: string; recipe: TestRecipe; attempts: TestAttempt[];
  // Word ids shown across every run of this test - lets a retake actively avoid words you've
  // already seen and rotate through the rest of the matching pool (hundreds/thousands of words
  // for a broad area recipe), instead of an independent reshuffle that can keep re-serving the
  // same handful. Capped and reset in db.ts's poolFromRecipe helper once the pool runs thin.
  seenIds?: string[];
};

const KEY = 'vorto.myTests';

export async function loadMyTests(): Promise<SavedTest[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]') as SavedTest[]; } catch { return []; }
}
async function persist(list: SavedTest[]) { await AsyncStorage.setItem(KEY, JSON.stringify(list)); }

export async function saveTest(name: string, recipe: TestRecipe): Promise<SavedTest[]> {
  const list = await loadMyTests();
  const id = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  list.unshift({ id, name: name.trim() || 'My test', recipe, attempts: [] });
  await persist(list);
  return list;
}

export async function addAttempt(id: string, a: { correct: number; total: number }): Promise<SavedTest[]> {
  const list = await loadMyTests();
  const test = list.find((x) => x.id === id);
  if (test) { test.attempts.unshift({ ts: Date.now(), correct: a.correct, total: a.total }); await persist(list); }
  return list;
}

export async function deleteTest(id: string): Promise<SavedTest[]> {
  const list = (await loadMyTests()).filter((x) => x.id !== id);
  await persist(list);
  return list;
}

export async function updateRecipe(id: string, recipe: TestRecipe): Promise<SavedTest[]> {
  const list = await loadMyTests();
  const test = list.find((x) => x.id === id);
  // Changing settings changes what the test even means, so past exposure no longer applies -
  // start the rotation fresh rather than silently excluding words from the OLD recipe's pool.
  if (test) { test.recipe = recipe; test.seenIds = []; await persist(list); }
  return list;
}

const SEEN_CAP = 2000; // generous rolling cap - a full "lap" resets it well before this anyway

export async function markSeen(id: string, wordIds: string[]): Promise<SavedTest[]> {
  const list = await loadMyTests();
  const test = list.find((x) => x.id === id);
  if (test) {
    const merged = [...new Set([...(test.seenIds ?? []), ...wordIds])];
    test.seenIds = merged.slice(-SEEN_CAP);
    await persist(list);
  }
  return list;
}

// Best (highest %) attempt so far — for the "your best" line on the card.
export function bestScore(t: SavedTest): TestAttempt | null {
  if (!t.attempts.length) return null;
  return [...t.attempts].sort((a, b) => b.correct / b.total - a.correct / a.total)[0];
}
export function lastAttempt(t: SavedTest): TestAttempt | null { return t.attempts[0] ?? null; }
