import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PracticeMode } from '../components/Game';

// Generic history of EVERY completed practice session, regardless of entry point
// (quick game tile, challenge, hero due-review, mistakes review, or a named "My
// tests" recipe). Distinct from my-tests.ts's SavedTest, which is an explicitly
// named recipe the user chose to keep and re-run - this is a passive log so past
// sessions are never just lost the moment you back out of the result screen.

export type HistoryEntry = {
  ts: number;
  mode: PracticeMode;
  challenge: string | null;
  label: string; // human-readable source, e.g. "Mixed", "Sprint", "My test: IELTS words"
  correct: number;
  total: number;
  // Domain id + display name, set only when the session was scoped to one specific area (the
  // "Focus a category" chip was active). Lets the hub show real per-topic progress over time
  // ("Negotiation - 3 attempts, latest 8/10") instead of a flat list of disconnected sessions -
  // that's the actual point of saving every session, not just logging for its own sake.
  area?: string;
  areaName?: string;
};

const KEY = 'vorto.practiceHistory';
const MAX_ENTRIES = 50; // rolling log, not a full audit trail

export async function loadHistory(): Promise<HistoryEntry[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]') as HistoryEntry[]; } catch { return []; }
}

export async function addHistoryEntry(e: Omit<HistoryEntry, 'ts'>): Promise<HistoryEntry[]> {
  const list = await loadHistory();
  list.unshift({ ts: Date.now(), ...e });
  const trimmed = list.slice(0, MAX_ENTRIES);
  await AsyncStorage.setItem(KEY, JSON.stringify(trimmed));
  return trimmed;
}
