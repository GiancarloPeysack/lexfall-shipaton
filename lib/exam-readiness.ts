import AsyncStorage from '@react-native-async-storage/async-storage';
import { Word, FieldId } from '../data/types';
import {
  getDomainProficiency, getDueWords, getMistakes, getSkillBreakdown, getWordById,
  getWordsByDomain, getWordsByField, isQualityWord,
} from './db';
import { domainsForField, domainForTopic, examTagForTopic } from '../data/domains';
import { EXAM_TAGS } from '../data/display-areas';

// Monthly "Exam readiness check" (2026-09-16): a second, monthly-cadence tier on top of the
// daily test - specifically for users prepping a real exam (OET/IELTS/TOLES/Cambridge/GRE...).
// Mirrors lib/daily-test.ts's state pattern but keyed by MONTH (YYYY-MM, not YYYY-MM-DD).
//
// Only meaningful for exam-track users: someone with a real exam date (vorto.examDate, set in
// onboarding) and/or exam-wordlist topics followed (vorto.topics n EXAM_TAGS - onboarding
// pre-selects these from the purpose picker). For everyone else the feature does not offer
// itself at all; there is deliberately no generic version.
//
// The ~24-question pool is real personalization, not a random slice: half comes from the
// user's own exam wordlist tags, the rest is allocated across the field's domains weighted
// toward where getDomainProficiency shows weakness or no signal yet. The post-check report is
// computed ONLY from this check's actual answers (per-domain correct/total) - never a
// fabricated "pass probability" (same house rule as the no-fake-social-proof monetization rule).

const STATE_KEY = 'vorto.examReadiness';
const HISTORY_KEY = 'vorto.examReadinessHistory';
export const EXAM_CHECK_COUNT = 24;
const MIN_POOL = 12;      // below this the check can't say anything useful - stay "not ready"
const MIN_ATTEMPTS = 10;  // some real practice signal first, so weighting isn't pure noise
const HISTORY_CAP = 24;   // two years of monthly checks is plenty

export type ExamReadinessState = {
  month: string; // YYYY-MM
  wordIds: string[];
  answered: Record<string, boolean>; // wordId -> correct?
  completed: boolean;
};

// Per-domain slice of ONE completed check - reuses the DomainProficiency shape's core
// (id/name/correct/total/score) but is scoped to this check's own answers only.
export type ReadinessDomain = { id: string; name: string; correct: number; total: number; score: number };
export type ReadinessResult = { month: string; correct: number; total: number; ts: number; domains: ReadinessDomain[] };

export type ExamReadinessStatus =
  | { kind: 'hidden' }   // not an exam-track user - the feature must not surface at all
  | { kind: 'notReady' } // exam-track, but not enough practice data to run a meaningful check
  | { kind: 'due'; examDate: string | null; answered: number; total: number } // available (answered>0 = resume)
  | { kind: 'done'; correct: number; total: number; nextInDays: number };

const pad = (n: number) => String(n).padStart(2, '0');
export const monthStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

// Whole days until the 1st of next month (when the next check unlocks).
export function daysToNextMonth(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

async function readState(): Promise<ExamReadinessState | null> {
  const raw = await AsyncStorage.getItem(STATE_KEY).catch(() => null);
  return raw ? JSON.parse(raw) : null;
}
async function writeState(s: ExamReadinessState) {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(s)).catch(() => {});
}

// Is this user on the exam track, and which exam-wordlist topics do they follow?
export async function getExamTrack(): Promise<{ eligible: boolean; examDate: string | null; examTopics: string[] }> {
  const [examDate, rawTopics] = await Promise.all([
    AsyncStorage.getItem('vorto.examDate').catch(() => null),
    AsyncStorage.getItem('vorto.topics').catch(() => null),
  ]);
  let topics: string[] = [];
  try { topics = JSON.parse(rawTopics || '[]'); } catch { /* ignore */ }
  const examSet = new Set<string>(EXAM_TAGS);
  const examTopics = topics.filter((t) => examSet.has(t));
  return { eligible: !!examDate || examTopics.length > 0, examDate: examDate || null, examTopics };
}

// Read-only status for the Practice hub tile (never builds/mutates the pool).
export async function getExamReadinessStatus(): Promise<ExamReadinessStatus> {
  const track = await getExamTrack();
  if (!track.eligible) return { kind: 'hidden' };
  const state = await readState();
  if (state && state.month === monthStr()) {
    const answers = Object.values(state.answered);
    if (state.completed) {
      return { kind: 'done', correct: answers.filter(Boolean).length, total: answers.length, nextInDays: daysToNextMonth() };
    }
    return { kind: 'due', examDate: track.examDate, answered: answers.length, total: state.wordIds.length };
  }
  // Not started this month. Require a bare minimum of real practice history first - the
  // domain weighting (and any readiness read) is meaningless with zero signal.
  const overall = await getSkillBreakdown('overall').catch(() => []);
  const attempts = overall.reduce((s, r) => s + r.total, 0);
  if (attempts < MIN_ATTEMPTS) return { kind: 'notReady' };
  return { kind: 'due', examDate: track.examDate, answered: 0, total: EXAM_CHECK_COUNT };
}

const shuffle = <T,>(a: T[]): T[] => [...a].sort(() => Math.random() - 0.5);

// The domain-weighting formula (kept as one obvious place to tune):
//   no proficiency row OR level===null (under the sample floor)  -> 2.0  (need signal)
//   score < 55                                                   -> 2.0  (weak)
//   55 <= score < 80                                             -> 1.0  (middling)
//   score >= 80                                                  -> 0.5  (strong - light touch)
function weightFor(p: { score: number; level: string | null } | undefined): number {
  if (!p || p.level === null) return 2;
  if (p.score < 55) return 2;
  if (p.score < 80) return 1;
  return 0.5;
}

// ~24 questions: half from the user's exam wordlist tags (when they follow any), the rest
// spread across the field's domains proportional to weakness weight (largest-remainder
// apportionment). Within every bucket, words the SRS already flags (mistakes/due) are taken
// first, then random fill - so the check leans on the user's real weak spots, not a reshuffle.
async function buildPool(field: FieldId, examTopics: string[]): Promise<Word[]> {
  const [mistakes, due, prof] = await Promise.all([
    getMistakes(60), getDueWords(field, 60), getDomainProficiency(field),
  ]);
  const priority = new Set([...mistakes, ...due].map((w) => w.id));
  const profById = new Map(prof.map((p) => [p.id, p]));

  const taken = new Set<string>();
  const pickFrom = (ws: Word[], n: number): Word[] => {
    if (n <= 0) return [];
    const eligible = ws.filter((w) => isQualityWord(w) && !taken.has(w.id));
    const out = [
      ...shuffle(eligible.filter((w) => priority.has(w.id))),
      ...shuffle(eligible.filter((w) => !priority.has(w.id))),
    ].slice(0, n);
    out.forEach((w) => taken.add(w.id));
    return out;
  };

  const out: Word[] = [];
  // 1) Exam wordlist half.
  if (examTopics.length) {
    const examWords = await getWordsByDomain(field, examTopics);
    out.push(...pickFrom(examWords, Math.floor(EXAM_CHECK_COUNT / 2)));
  }
  // 2) Remaining slots across domains, weighted toward weakness / missing signal.
  const domains = domainsForField(field);
  const domainWords = await Promise.all(domains.map((d) => getWordsByDomain(d.field, d.topics)));
  const avail = domains
    .map((d, i) => ({ d, words: domainWords[i], w: weightFor(profById.get(d.id)) }))
    .filter((x) => x.words.length > 0);
  const slots = EXAM_CHECK_COUNT - out.length;
  const totalW = avail.reduce((s, x) => s + x.w, 0);
  if (totalW > 0 && slots > 0) {
    const quotas = avail.map((x) => ({ x, exact: (x.w / totalW) * slots, n: 0 }));
    quotas.forEach((q) => { q.n = Math.floor(q.exact); });
    let used = quotas.reduce((s, q) => s + q.n, 0);
    for (const q of [...quotas].sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)))) {
      if (used >= slots) break;
      q.n++; used++;
    }
    for (const q of quotas) out.push(...pickFrom(q.x.words, q.n));
  }
  // 3) Graceful top-up if buckets ran thin (small corpus scope).
  if (out.length < EXAM_CHECK_COUNT) {
    out.push(...pickFrom(await getWordsByField(field), EXAM_CHECK_COUNT - out.length));
  }
  return out;
}

// This month's check (building it on first open). Returns null when the feature shouldn't
// run at all: not an exam-track user, or the pool is too thin to mean anything.
export async function getOrBuildExamCheck(field: FieldId): Promise<{ state: ExamReadinessState; pending: Word[] } | null> {
  const track = await getExamTrack();
  if (!track.eligible) return null;
  const month = monthStr();
  let state = await readState();
  if (!state || state.month !== month) {
    const pool = await buildPool(field, track.examTopics);
    if (pool.length < MIN_POOL) return null;
    state = { month, wordIds: pool.slice(0, EXAM_CHECK_COUNT).map((w) => w.id), answered: {}, completed: false };
    await writeState(state);
  }
  const resolved = await Promise.all(
    state.wordIds.filter((id) => state!.answered[id] === undefined).map((id) => getWordById(id))
  );
  return { state, pending: resolved.filter((w): w is Word => !!w) };
}

// Group a completed check's answers by domain - exam-wordlist words get their own bucket
// (they map to no subject domain by design). Every number is a straight count of this
// check's real answers; nothing is modeled or extrapolated.
async function computeResult(state: ExamReadinessState): Promise<ReadinessResult> {
  const acc = new Map<string, ReadinessDomain>();
  let correct = 0; let total = 0;
  for (const id of state.wordIds) {
    const ok = state.answered[id];
    if (ok === undefined) continue;
    total++; if (ok) correct++;
    const w = await getWordById(id);
    if (!w) continue;
    const dom = examTagForTopic(w.topic)
      ? { id: 'exam', name: 'Exam wordlist' }
      : (domainForTopic(w.field, w.topic) ?? { id: 'other', name: 'Other areas' });
    const row = acc.get(dom.id) ?? { id: dom.id, name: dom.name, correct: 0, total: 0, score: 0 };
    row.total++; if (ok) row.correct++;
    acc.set(dom.id, row);
  }
  const domains = [...acc.values()].map((r) => ({ ...r, score: r.total ? (r.correct / r.total) * 100 : 0 }));
  domains.sort((a, b) => a.score - b.score); // weakest first - that's the actionable end
  return { month: state.month, correct, total, ts: Date.now(), domains };
}

// Oldest -> newest. The screen only shows a trend once there are 2+ REAL completed checks.
export async function getReadinessHistory(): Promise<ReadinessResult[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY).catch(() => null);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

// Call once per answer. Finalizes + appends the month's result to history exactly once
// (idempotent - answering again after completion is a no-op, same as the daily test).
export async function recordExamAnswer(wordId: string, ok: boolean): Promise<void> {
  const state = await readState();
  if (!state || state.month !== monthStr() || state.completed) return;
  state.answered[wordId] = ok;
  if (state.wordIds.every((id) => state.answered[id] !== undefined)) {
    state.completed = true;
    const result = await computeResult(state);
    const history = (await getReadinessHistory()).filter((h) => h.month !== state.month);
    history.push(result);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_CAP))).catch(() => {});
  }
  await writeState(state);
}

// A per-domain verdict only when the sample inside THIS check can carry one (3+ questions);
// below that the UI shows bare counts instead of over-claiming from 1-2 answers.
export function readinessVerdict(d: ReadinessDomain): 'Ready' | 'Close' | 'Needs work' | null {
  if (d.total < 3) return null;
  return d.score >= 80 ? 'Ready' : d.score >= 55 ? 'Close' : 'Needs work';
}
