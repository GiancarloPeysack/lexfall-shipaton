import AsyncStorage from '@react-native-async-storage/async-storage';

// ── The unified "presented" ledger (vorto.presentedIds) ─────────────────────────────────────
// Every wordId the user has GENUINELY met, persisted forever (until an account reset — see
// clearLocalData in lib/db.ts). A word enters this ledger when any of:
//   • it dwelled on a feed card for >= 2s — a real read, not a flick (the second viewability
//     pair with minimumViewTime: 2000 in app/(tabs)/index.tsx), or
//   • it was interacted with in the feed — saved, liked, example expanded, audio played, or
//     shared (components/WordCard.tsx), or
//   • it was taught in a daily test (lib/daily-test.ts).
// A fast flick past a card adds NOTHING. The feed's eager recordReview-on-first-view stays as
// the SRS signal but is deliberately NOT this signal — a word that merely scrolled past under
// 2s was never really "presented", so the daily test may still teach it as new. This ledger is
// the daily test's single "never teach as new twice" gate.
//
// Migration: the old daily-test-only ledger (vorto.dailyTaughtIds) is OR-read into every get,
// so installs from before the unified ledger keep their full taught history (nothing already
// taught can regress into being re-taught). New writes land only on the new key; the legacy
// key is left as-is (cheap, and clearLocalData wipes both).
const PRESENTED_KEY = 'vorto.presentedIds';
const LEGACY_TAUGHT_KEY = 'vorto.dailyTaughtIds';

const parseIds = (raw: string | null): string[] => {
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
};

export async function getPresentedIds(): Promise<Set<string>> {
  const [now, legacy] = await Promise.all([
    AsyncStorage.getItem(PRESENTED_KEY).catch(() => null),
    AsyncStorage.getItem(LEGACY_TAUGHT_KEY).catch(() => null),
  ]);
  return new Set<string>([...parseIds(now), ...parseIds(legacy)]);
}

// Writes are serialized through one chain: the feed's dwell callback, a card's interaction
// handlers and a daily-test build can all add concurrently, and an unserialized
// read-modify-write on the same AsyncStorage key would silently drop ids. Never rejects, so
// call sites can fire-and-forget.
let writeChain: Promise<unknown> = Promise.resolve();

export function addPresentedIds(ids: string[]): Promise<void> {
  if (!ids.length) return Promise.resolve();
  const run = async () => {
    try {
      const set = await getPresentedIds();
      const before = set.size;
      for (const id of ids) set.add(id);
      if (set.size === before) return;
      await AsyncStorage.setItem(PRESENTED_KEY, JSON.stringify([...set]));
    } catch { /* best-effort — a dropped mark only risks one extra teach */ }
  };
  const p = writeChain.then(run, run);
  writeChain = p;
  return p;
}

// One-word convenience for the feed's interaction handlers.
export const markPresented = (id: string): Promise<void> => addPresentedIds([id]);
