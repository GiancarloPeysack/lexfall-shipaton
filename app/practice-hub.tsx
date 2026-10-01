import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useField } from '../lib/field';
import { useApp } from '../lib/app-state';
import { getDueWords, getDueCount, getMistakeCount, getMistakes, getResolvedMistakeCount, getSavedWords, getWordsByField, getWordsByDomain, getTopics, getDomainProficiency, isQualityWord, isCefrField } from '../lib/db';
import { getLevel } from '../lib/metrics';
import { Word } from '../data/types';
import { GameMode, MODE_TITLE } from '../lib/games';
import { domainsForField, domainById, examTagsForTopics, topicsForExam, examTagForTopic } from '../data/domains';
import { t } from '../lib/i18n';
import Game, { Challenge, PracticeMode } from '../components/Game';
import Segment from '../components/Segment';
import { fonts, label, Palette } from '../theme/tokens';
import BackButton from '../components/BackButton';
import PressBounce from '../components/PressBounce';
import AnimatedIllo from '../components/AnimatedIllo';
import FadeIn from '../components/FadeIn';
import { IlloName } from '../components/Illustrations';
import AreaPicker, { auditAreaCoverage } from '../components/AreaPicker';
import { EXAM_TAGS } from '../data/display-areas';
import { loadMyTests, saveTest, addAttempt, deleteTest, updateRecipe, markSeen, bestScore, lastAttempt, type SavedTest, type TestRecipe } from '../lib/my-tests';
import { loadHistory, addHistoryEntry, type HistoryEntry } from '../lib/practice-history';
import { peekDailyTest, getDailyTestStreak, weekProgress, todayStr, dailyLeftToClear, DAILY_TEST_COUNT, type DailyTestState, type DailyTestStreak } from '../lib/daily-test';

// Single flame silhouette reused for the streak hero + the week-strip markers.
const FLAME_D = 'M12 1c2.2 4.3 7 6.6 7 13a7 7 0 0 1-14 0c0-2.4 1-4 2.4-5.4-.2 2.3 1.1 3.6 2.3 3.8-.7-3.6.4-6.9 2.3-11.4Z';
import { getExamReadinessStatus, type ExamReadinessStatus } from '../lib/exam-readiness';
import { examCountdownLabel } from '../lib/exam';

type Session = { mode: PracticeMode; challenge: Challenge; assess: boolean };

// Illustrated game/challenge tiles - artwork lives on the cards, headers stay typographic.
const GAMES: { mode: PracticeMode; illo: IlloName; title: string }[] = [
  { mode: 'mixed', illo: 'sparkle', title: 'Game shuffle' },
  { mode: 'guess', illo: 'book', title: MODE_TITLE.guess },
  { mode: 'gap', illo: 'pen', title: MODE_TITLE.gap },
  { mode: 'meaning', illo: 'chat', title: MODE_TITLE.meaning },
  { mode: 'synonym', illo: 'faces', title: MODE_TITLE.synonym },
];

const FIELD_LABEL: Record<string, string> = { med: 'Healthcare', law: 'Law', biz: 'Business', gen: 'General', new: 'Modern' };

// Static Sun-first weekday initials for the daily-test week strip (not Intl) so it never
// depends on locale/Hermes support - weekProgress's 7 entries are real consecutive calendar
// days ending today, so a plain getDay() lookup is all that's needed.
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Short relative time for history rows ("Just now", "3h ago", "Yesterday", "Tue", "12 Jan").
function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'Yesterday';
  if (day < 7) return new Date(ts).toLocaleDateString(undefined, { weekday: 'short' });
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const CHALLENGES: { key: Challenge; name: string; sub: string; illo: IlloName }[] = [
  { key: 'sprint', name: 'Sprint', sub: '60 seconds', illo: 'clock' },
  { key: 'perfection', name: 'Perfection', sub: '3 lives', illo: 'heart' },
  { key: 'rush', name: 'Rush', sub: 'Endless', illo: 'sparkle' },
];

export default function Practice() {
  const { field } = useField();
  const { palette: co, theme } = useApp();
  const styles = makeStyles(co);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { runTest, runArea, editTest } = useLocalSearchParams<{ runTest?: string; runArea?: string; editTest?: string }>();
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [pool, setPool] = useState<Word[]>([]);
  const [weak, setWeak] = useState<Word[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [level, setLevel] = useState('-');
  const [mistakes, setMistakes] = useState(0);
  // Not a new "resolved" tracker table — derived from the same append-only attempts log
  // getMistakes()/getMistakeCount() already read. Lets the mistakes card show real over-time
  // progress ("outstanding · cleared this week") instead of just restating the hero's own count.
  const [mistakesCleared, setMistakesCleared] = useState(0);
  const [reviewPool, setReviewPool] = useState<Word[] | null>(null);
  const [cat, setCat] = useState(''); // focus games/challenges on one category ('' = all)
  const [dailyState, setDailyState] = useState<DailyTestState | null>(null);
  const [dailyStreak, setDailyStreak] = useState<DailyTestStreak>({ count: 0, lastCompletedDate: null });
  // Monthly exam-readiness tier - defaults to hidden so non-exam users never see a flash.
  const [examCheck, setExamCheck] = useState<ExamReadinessStatus>({ kind: 'hidden' });
  // The one system-chosen action at the top. Defaults to the new-user fallback so it
  // renders immediately (no empty-state flash), then resolves to the real priority.
  const [hero, setHero] = useState<{ label: string; sub?: string; start: () => void }>(
    { label: 'Start with 10 words', start: () => startWords() }
  );

  // Every other pool-starting function here requires >=4 words before starting a round (too few
  // and the quiz can't find distractors - pickDistractors in lib/games.ts degrades to a single-
  // option, unloseable "question"). This one was missing that floor: a small mistake count (as
  // low as 1) sailed straight into a broken round. Top up with due words (deduped) so a thin
  // mistake queue still produces a real quiz instead of skipping the guard entirely.
  const reviewMistakes = async () => {
    try {
      const m = await getMistakes();
      let pool = m;
      if (pool.length < 4) {
        const ids = new Set(pool.map((w) => w.id));
        const extra = (await getDueWords(field, 10)).filter((w) => isQualityWord(w) && !ids.has(w.id));
        pool = [...pool, ...extra];
      }
      if (pool.length >= 4) { setReviewPool(pool); setSession({ mode: 'meaning', challenge: null, assess: false }); }
    } catch { /* leave the hub in place rather than crash - the tap silently no-ops */ }
  };

  // Start a normal (mixed) round from a given pool, or from due/unseen words if none given.
  // This is the hero's "N words to review" action - the single most-tapped entry point on the
  // screen, so it's guarded end-to-end: any DB/query failure falls back to the already-loaded
  // `pool` state instead of leaving the tap looking like nothing happened or throwing past the
  // component (an uncaught rejection here would leave the ErrorBoundary as the only net).
  const startWords = async (words?: Word[]) => {
    try {
      const w = words ?? (await getDueWords(field, 10)).filter(isQualityWord);
      setReviewPool(w.length >= 4 ? w : null);
      setSession({ mode: 'mixed', challenge: null, assess: false });
    } catch {
      setReviewPool(null);
      setSession({ mode: 'mixed', challenge: null, assess: false });
    }
  };

  // Placement test samples the user's PROFESSION domains (their followed areas), not
  // general English — so a nurse is placed on nursing/clinical words. Falls back to due
  // words if there aren't enough (e.g. a brand-new General user).
  const startPlacement = async () => {
    const follows: string[] = JSON.parse((await AsyncStorage.getItem('vorto.topics').catch(() => null)) || '[]');
    const followSet = new Set(follows);
    const profDomains = domainsForField(field).filter((d) => d.profession && d.topics.some((t) => presentSet.has(t)));
    const scoped = follows.length ? profDomains.filter((d) => d.topics.some((t) => followSet.has(t))) : profDomains;
    const useDomains = scoped.length ? scoped : profDomains;
    const domTopics = [...new Set(useDomains.flatMap((d) => d.topics))];
    let sample = domTopics.length ? (await getWordsByDomain(field, domTopics)).filter(isQualityWord) : [];
    if (sample.length < 10) sample = [...sample, ...(await getDueWords(field, 40)).filter(isQualityWord)];
    const chosen = [...sample].sort(() => Math.random() - 0.5).slice(0, 10);
    setReviewPool(chosen.length >= 4 ? chosen : null);
    setSession({ mode: 'meaning', challenge: null, assess: true });
  };

  useEffect(() => {
    // Scope the practice pool to the chosen DOMAIN (cat holds a domain id), else due words.
    const d = cat ? domainById(cat) : undefined;
    (d ? getWordsByDomain(d.field, d.topics) : getDueWords(field, 40)).then((ws) => setPool(ws.filter(isQualityWord)));
    getMistakes(10).then(setWeak); // for auto-injecting weak words into rounds
  }, [field, session, cat]);
  useFocusEffect(useCallback(() => {
    getLevel().then(setLevel);
    getMistakeCount().then(setMistakes);
    getResolvedMistakeCount().then(setMistakesCleared);
    loadMyTests().then(setMyTests);
    loadHistory().then(setHistory);
    peekDailyTest().then(setDailyState);
    getDailyTestStreak().then(setDailyStreak);
    getExamReadinessStatus().then(setExamCheck).catch(() => {});
    // Hero priority: genuinely-due → mistakes → weakest area → new-user fallback.
    (async () => {
      // Daily Test's own candidate pool is mistakes-first-then-due (lib/daily-test.ts) - the
      // EXACT same signal this hero tier reads. Without this check, a due/mistakes user saw TWO
      // competing CTAs pointing at the same words ("N to review" here + "Daily test" card right
      // below) with no relationship between them. While today's test is still open, route the
      // hero there instead of starting a second, separate round through the identical pool - one
      // action, not two. Once today's test is done, any due/mistakes backlog it didn't cover
      // reverts to this hero's own open-ended review (unchanged from before).
      const today = await peekDailyTest();
      const dailyOpen = !today?.completed;
      const due = await getDueCount(field);
      if (due > 0) {
        if (dailyOpen) { setHero({ label: `${due} ${due === 1 ? 'word' : 'words'} to review`, sub: "Today's test covers these", start: () => router.push('/daily-test' as any) }); return; }
        setHero({ label: `${due} ${due === 1 ? 'word' : 'words'} to review`, start: () => startWords() });
        return;
      }
      const mc = await getMistakeCount();
      if (mc > 0) {
        const cleared = await getResolvedMistakeCount();
        if (dailyOpen) {
          setHero({
            label: `Review ${mc} ${mc === 1 ? 'mistake' : 'mistakes'}`,
            sub: "Today's test covers these",
            start: () => router.push('/daily-test' as any),
          });
          return;
        }
        setHero({
          label: `Review ${mc} ${mc === 1 ? 'mistake' : 'mistakes'}`,
          sub: cleared > 0 ? `${cleared} cleared this week` : undefined,
          start: reviewMistakes,
        });
        return;
      }
      const weak = (await getDomainProficiency(field)).filter((p) => p.level !== null).sort((a, b) => a.score - b.score)[0];
      if (weak) {
        setHero({ label: `10 from ${weak.name}`, sub: 'your weakest area', start: async () => {
          const d = domainById(weak.id);
          startWords(d ? (await getWordsByDomain(d.field, d.topics)).filter(isQualityWord) : undefined);
        } });
        return;
      }
      setHero({ label: 'Start with 10 words', start: () => startWords() });
    })();
  }, [session, field]));

  // Sprinkle a few weak (previously-wrong) words through a normal round so they
  // keep coming back — but NOT into the placement test (that stays a clean sample)
  // or the dedicated mistakes review (which is already all weak words).
  const blendWeak = (base: Word[]): Word[] => {
    const baseIds = new Set(base.map((w) => w.id));
    const inject = weak.filter((w) => !baseIds.has(w.id)).slice(0, 5);
    if (!inject.length) return base;
    const out = [...base];
    inject.forEach((w, i) => out.splice(Math.min(out.length, 2 + i * 4), 0, w));
    return out;
  };

  // --- Custom "Build a test" picker ---
  const [building, setBuilding] = useState(false);
  const [bSrcs, setBSrcs] = useState<string[]>(['due']); // #84: multi-select sources (union)
  const [bMode, setBMode] = useState<PracticeMode>('mixed');
  const [bLen, setBLen] = useState(10);
  const [bLevel, setBLevel] = useState('all');   // all | C1 | C2
  const [bTags, setBTags] = useState<string[]>([]); // #29: union of ALL selected sub-areas/axes (multi-select)
  const [topics, setTopics] = useState<string[]>([]);
  const [bMsg, setBMsg] = useState('');
  // #85 My tests: saved recipes + which one (if any) the current run is scoring against.
  const [myTests, setMyTests] = useState<SavedTest[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showAllAreas, setShowAllAreas] = useState(false);
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  useEffect(() => { getTopics(field).then((t) => setTopics(t.map((x) => x.topic))); }, [field]);
  // Remember the last Build-a-test setup so "practice again in the same settings" is one tap:
  // the sheet reopens pre-filled. (No per-test progress is stored — misses already flow into the
  // global SRS, so the recipe is all that's worth keeping.)
  useEffect(() => {
    AsyncStorage.getItem('vorto.lastTest').then((v) => {
      if (!v) return;
      try {
        const c = JSON.parse(v);
        setBSrcs(c.bSrcs ?? (c.bSrc ? [c.bSrc] : ['due'])); setBMode(c.bMode ?? 'mixed'); setBLen(c.bLen ?? 10);
        setBLevel(c.bLevel ?? 'all'); setBTags(c.bTags ?? []);
      } catch { /* ignore */ }
    }).catch(() => {});
  }, []);

  // Which tags actually have words here — drives what the picker surfaces (no dead chips).
  const presentSet = useMemo(() => new Set(topics), [topics]);
  // "Focus a category" chips (separate from the Build-a-test picker) scope the hub pool to one domain.
  const fieldDomains = useMemo(() => domainsForField(field).filter((d) => d.topics.some((t) => presentSet.has(t))), [field, presentSet]);
  // #15: real per-area progress (not just a flat log) - group history by the domain it was
  // scoped to, newest first, so retaking the SAME area later shows actual improvement over time.
  const areaProgress = useMemo(() => {
    const byArea = new Map<string, HistoryEntry[]>();
    for (const h of history) {
      if (!h.area) continue;
      (byArea.get(h.area) ?? byArea.set(h.area, []).get(h.area)!).push(h);
    }
    return byArea;
  }, [history]);
  const examTags = useMemo(() => examTagsForTopics(topics), [topics]);
  // Dev guard: any live topic that maps to no display area/axis warns in testing.
  useEffect(() => { auditAreaCoverage(field, topics); }, [field, topics]);

  // Multi-select handlers (#29): a sub-area/exam/word-type toggles into a UNION of tags, same
  // pattern as onboarding's own multi-select area picker (toggleTopics/followsAll) - "on" means
  // every one of this chip's tags is already in the union, toggling removes/adds all of them.
  const toggleBTags = (tags: string[]) => setBTags((cur) => {
    const on = tags.length > 0 && tags.every((t) => cur.includes(t));
    const set = new Set(cur);
    tags.forEach((t) => (on ? set.delete(t) : set.add(t)));
    return [...set];
  });
  const onSub = (tags: string[], _key: string) => toggleBTags(tags);
  const isSubOnMulti = (tags: string[]) => tags.length > 0 && tags.every((t) => bTags.includes(t));
  const onAxis = (tag: string) => {
    const slug = (EXAM_TAGS as string[]).includes(tag) ? examTagForTopic(tag) : undefined;
    toggleBTags(slug ? topicsForExam(slug) : [tag]);
  };
  const axisOn = (tag: string) => bTags.includes(tag);
  // #84: sources are multi-select. "Everything" is exclusive (it IS the superset);
  // the rest combine as a UNION (pick several buckets, get all of them).
  const toggleSrc = (v: string) => setBSrcs((cur) => {
    if (v === 'all') return cur.includes('all') ? [] : ['all'];
    return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur.filter((x) => x !== 'all'), v];
  });
  const currentRecipe = (): TestRecipe => ({ bSrcs, bMode, bLen, bLevel, bTags });
  // Resolve a recipe to a concrete word pool. Union the selected sources, de-duped by id, so
  // combining buckets never double-counts. Returns null (and sets bMsg) if it can't run.
  // #16: retaking a saved test should rotate through the WHOLE matching pool (hundreds/
  // thousands of words for a broad area recipe) rather than an independent reshuffle that can
  // coincidentally repeat words you just saw. `excludeIds` (a test's rolling seenIds) is
  // preferred, but only if enough words remain after excluding them - once the pool's mostly
  // exhausted, fall back to the full pool (a natural "new lap") instead of erroring out.
  const poolFromRecipe = async (r: TestRecipe, excludeIds?: Set<string>): Promise<Word[] | null> => {
    const seen = new Set<string>();
    let src: Word[] = [];
    const add = (ws: Word[]) => { for (const w of ws) if (!seen.has(w.id)) { seen.add(w.id); src.push(w); } };
    if (r.bSrcs.includes('all')) {
      add((await getWordsByField(field)).filter(isQualityWord));
    } else {
      if (!r.bSrcs.length) { setBMsg('Pick at least one thing to practise.'); return null; }
      if (r.bSrcs.includes('mistakes')) add(await getMistakes(80));
      if (r.bSrcs.includes('due')) add((await getDueWords(field, 80)).filter(isQualityWord));
      if (r.bSrcs.includes('saved')) add(await getSavedWords());
      if (r.bSrcs.includes('area')) {
        if (r.bTags.length) add((await getWordsByDomain(field, r.bTags)).filter(isQualityWord));
        else { setBMsg('Pick an area or exam first.'); return null; }
      }
    }
    if (r.bLevel !== 'all') src = src.filter((w) => w.cefr === r.bLevel);
    if (excludeIds?.size) {
      const fresh = src.filter((w) => !excludeIds.has(w.id));
      if (fresh.length >= r.bLen) src = fresh; // else the pool's basically exhausted - start a new lap
    }
    const chosen = [...src].sort(() => Math.random() - 0.5).slice(0, r.bLen);
    if (chosen.length < 4) { setBMsg('Not enough words for that combination. Widen the level or pick another source.'); return null; }
    return chosen;
  };
  const startCustom = async () => {
    setBMsg('');
    const chosen = await poolFromRecipe(currentRecipe());
    if (!chosen) return;
    // Persist the recipe so the sheet reopens on these settings next time.
    AsyncStorage.setItem('vorto.lastTest', JSON.stringify(currentRecipe())).catch(() => {});
    setActiveTestId(null);
    setReviewPool(chosen);
    setBuilding(false);
    setSession({ mode: bMode, challenge: null, assess: false });
  };
  // #85: run a saved test (scores against it) / save the current recipe under a name.
  const runSaved = async (test: SavedTest) => {
    setBMsg('');
    const chosen = await poolFromRecipe(test.recipe, test.seenIds?.length ? new Set(test.seenIds) : undefined);
    if (!chosen) return;
    setActiveTestId(test.id);
    setReviewPool(chosen);
    setBuilding(false);
    setSession({ mode: test.recipe.bMode, challenge: null, assess: false });
  };
  const doSave = async () => {
    setBMsg('');
    const chosen = await poolFromRecipe(currentRecipe()); // must be runnable before we keep it
    if (!chosen) return;
    if (editingTestId) {
      setMyTests(await updateRecipe(editingTestId, currentRecipe()));
      setEditingTestId(null);
      setBuilding(false);
      setBMsg('');
    } else {
      setMyTests(await saveTest(saveName, currentRecipe()));
      setSaveName('');
      setBMsg('Saved to My tests.');
    }
  };

  // Start a quick round scoped straight to one domain (from the "See more areas" list) - one
  // tap, no chip-then-tile detour, mirrors the hero's "one tap" pattern.
  const startAreaQuick = async (d: { id: string; field: string; topics: string[] }) => {
    setCat(d.id);
    const words = (await getWordsByDomain(d.field as any, d.topics)).filter(isQualityWord);
    setReviewPool(words.length >= 4 ? words : null);
    setSession({ mode: 'mixed', challenge: null, assess: false });
  };

  // #16: react to navigation coming BACK from the test-detail screen (Retake / Change settings).
  // Guarded so a stale param sitting in the URL after handling once doesn't keep re-firing.
  const handledParamsRef = useRef('');
  useEffect(() => {
    const key = `${runTest ?? ''}|${runArea ?? ''}|${editTest ?? ''}`;
    if (key === '||' || key === handledParamsRef.current) return;
    handledParamsRef.current = key;
    router.setParams({ runTest: undefined, runArea: undefined, editTest: undefined } as any); // clear so a remount can't replay a stale action
    if (runTest) { const t = myTests.find((x) => x.id === runTest); if (t) runSaved(t); }
    else if (runArea) { const d = domainById(runArea); if (d) startAreaQuick(d); }
    else if (editTest) {
      const t = myTests.find((x) => x.id === editTest);
      if (t) {
        setEditingTestId(editTest);
        setBSrcs(t.recipe.bSrcs); setBMode(t.recipe.bMode); setBLen(t.recipe.bLen);
        setBLevel(t.recipe.bLevel); setBTags(t.recipe.bTags);
        setBMsg(''); setBuilding(true);
      }
    }
  }, [runTest, runArea, editTest, myTests]);

  // Human-readable source for the history log - named test > challenge > game mode.
  const sessionLabel = (): string => {
    if (activeTestId) {
      const t = myTests.find((x) => x.id === activeTestId);
      if (t) return `My test: ${t.name}`;
    }
    if (session?.challenge) return CHALLENGES.find((c) => c.key === session.challenge)?.name ?? 'Challenge';
    if (session?.mode === 'mixed') return 'Mixed';
    return session?.mode ? (MODE_TITLE[session.mode as GameMode] ?? 'Practice') : 'Practice';
  };

  // Hooks must run unconditionally on every render (the `if (session)` branch below returns
  // early) - this was previously declared after that return, so opening a session (tap "Start")
  // dropped a hook between renders and crashed the whole screen ("Rendered fewer hooks than
  // expected"). Keep any new hooks above this line, never inside/after the early return.
  const dailyWeek = useMemo(() => weekProgress(dailyStreak), [dailyStreak]);

  if (session) {
    // Final safety net: strip non-quality words (multi-word phrases, transparent-med) from
    // EVERY test path — placement, custom, mistakes review, and weak-word blending — so quizzes
    // never surface B1 phrases as answers OR distractors. Fall back to raw if it thins too much.
    const rawPool = reviewPool ?? (session.assess ? pool : blendWeak(pool));
    const filtered = rawPool.filter(isQualityWord);
    const gamePool = filtered.length >= 4 ? filtered : rawPool;
    return <Game mode={session.mode} pool={gamePool} challenge={session.challenge} assess={session.assess}
      onDone={(r) => {
        // #12: every completed practice session is logged, not just named "My tests" - the
        // level test (assess) is excluded, it already has its own retake affordance/tracking.
        if (!session.assess) {
          const areaName = cat ? domainById(cat)?.name : undefined;
          addHistoryEntry({ mode: session.mode, challenge: session.challenge, label: sessionLabel(), area: cat || undefined, areaName, ...r }).then(setHistory);
        }
        if (activeTestId) {
          addAttempt(activeTestId, r).then(setMyTests);
          markSeen(activeTestId, gamePool.map((w) => w.id));
        }
      }}
      onExit={() => { setSession(null); setReviewPool(null); setActiveTestId(null); }} />;
  }

  // Spaced learn/recall model (2026-09-27): a day = LEARN (new words, ungraded "Got it" cards,
  // state.learnIds/learned) + RECALL (due words from prior days, the graded gate, wordIds/
  // answered). Progress and totals count BOTH phases so the card matches the session's own
  // gauge; the gate itself (left-to-clear / mastered) stays recall-only, same as the session.
  const dailyLearnTotal = dailyState?.learnIds?.length ?? 0;
  const dailyLearnDone = dailyState?.learned?.length ?? 0;
  const dailyAnswered = (dailyState ? Object.keys(dailyState.answered).length : 0) + dailyLearnDone;
  const dailyTotal = dailyState ? Math.max(1, dailyState.wordIds.length + dailyLearnTotal) : DAILY_TEST_COUNT;
  // Learn-then-check model (2026-09-26): a completed-but-not-mastered day is MID-SESSION (the
  // fix phase is still open), not finished - the card reads "N left to clear" and keeps its
  // Continue CTA so quitting resumes rather than restarts. Only a mastered day (or one with
  // nothing left) is truly done. Same dailyLeftToClear state the Journey node + session read.
  const dailyLeft = dailyState?.completed && !dailyState.mastered ? dailyLeftToClear(dailyState).length : 0;
  const dailyDone = !!dailyState?.completed && dailyLeft === 0;
  // The daily test drives ADVANCEMENT (owner 2026-09-25: it has no streak; the streak = opening the
  // app, shown on the feed + Progress). So the card is about moving up your path, not a streak.
  const dailySub = dailyState?.completed
    ? (dailyDone
      ? 'Advanced today. Come back tomorrow.'
      : `${dailyLeft} left to clear. Finish them to advance.`)
    : dailyAnswered > 0
      ? `${dailyAnswered} of ${dailyTotal} done today`
      : `Learn new words and recall earlier ones to advance your path.`;

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 200, paddingHorizontal: 26, paddingTop: insets.top + 12 }}>
      {/* This hub is off the tab bar now (the Practice tab is the Journey path), so it needs its
          own dismiss affordance when reached from a saved-test flow. */}
      <View style={{ marginBottom: 4 }}>
        <BackButton variant="close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} co={co} />
      </View>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[label, { marginTop: 8 }]}>Train the recall</Text>
          <Text style={styles.h2}>Practice</Text>
        </View>
      </View>

      {/* YOUR JOURNEY — the daily test's front door (owner 2026-09-25: surface the path here, in
          the "do" tab). Tapping the CARD opens the full journey map (/journey), where the TODAY
          island starts the test; the gold Start/Continue pill is a direct shortcut into the test
          (nested press — inner pill wins). Once done it reads as a quiet "view path" status card. */}
      <PressBounce style={[styles.dailyHero, !dailyDone && styles.dailyHeroActive]} onPress={() => router.push('/journey' as any)}>
        <View style={styles.dailyTop}>
          <View style={{ flex: 1 }}>
            <Text style={[label, { color: co.accent, marginBottom: 4 }]}>Your journey</Text>
            <Text style={styles.heroLabel}>Daily test</Text>
            <Text style={styles.heroSub}>{dailySub}</Text>
          </View>
          {dailyDone ? (
            <Text style={styles.viewPath}>View path ›</Text>
          ) : (
            <PressBounce style={styles.heroCta} onPress={() => router.push('/daily-test' as any)}>
              <Text style={styles.heroCtaTxt}>{dailyAnswered > 0 || dailyLeft > 0 ? 'Continue' : 'Start'}</Text>
            </PressBounce>
          )}
        </View>
        {!dailyState?.completed && dailyAnswered > 0 && (
          <View style={styles.dailyProg}><View style={[styles.dailyProgFill, { width: `${(dailyAnswered / dailyTotal) * 100}%` }]} /></View>
        )}
      </PressBounce>

      {/* REVIEW — open-ended backlog of due/missed words, shown only AFTER the daily test is done
          (owner, 2026-09-18: review comes after the streak, not before it). While today's test is
          still open it's deliberately ABSENT: the daily test already draws from the same
          mistakes-first/due pool, so a second card here would just be two CTAs pointing at the
          same words (the exact redundancy the hero's old dailyOpen-redirect was papering over -
          two cards that both just opened the daily test). Quieter than the daily hero - text CTA,
          not a competing gold pill. A mid-fix day (completed but "N left to clear") counts as
          still-open for the same reason: one action, finish the session. */}
      {dailyDone && (
        <PressBounce style={styles.review} onPress={hero.start}>
          <View style={{ flex: 1 }}>
            <Text style={styles.reviewLabel}>{hero.label}</Text>
            {!!hero.sub && <Text style={styles.reviewSub}>{hero.sub}</Text>}
          </View>
          <Text style={styles.reviewGo}>Start</Text>
        </PressBounce>
      )}

      {/* YOUR TESTS — #12/#13/#16: a horizontal row, not a vertical list, so it can never crowd
          the hub no matter how many tests pile up (scrolling right reveals more instead of
          pushing everything else down the page). Named recipes and auto-tracked areas both get
          a card; tapping opens the detail view (full score history, coverage, retake, and for
          named tests, edit settings) rather than cramming that onto the compact card. */}
      <Text style={styles.sect}>Your tests</Text>
      {myTests.length === 0 && areaProgress.size === 0 ? (
        <View style={styles.mtEmpty}>
          <Text style={styles.mtEmptyTxt}>Your results will show up here after your first test.</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 26 }} style={{ marginHorizontal: -26, paddingHorizontal: 26, marginBottom: 4 }}>
          {myTests.map((tst) => {
            const last = lastAttempt(tst); const best = bestScore(tst);
            const sub = last
              ? `Last ${last.correct}/${last.total}${best && best !== last ? ` · best ${best.correct}/${best.total}` : ''} · ${tst.attempts.length} ${tst.attempts.length === 1 ? 'run' : 'runs'}`
              : 'Not run yet';
            return (
              <PressBounce key={tst.id} style={styles.testCard} onPress={() => router.push({ pathname: '/test-detail', params: { kind: 'saved', id: tst.id } } as any)}>
                <Text style={styles.mtName} numberOfLines={1}>{tst.name}</Text>
                <Text style={styles.mtSub} numberOfLines={2}>{sub}</Text>
              </PressBounce>
            );
          })}
          {[...areaProgress.entries()]
            .sort(([, a], [, b]) => b[0].ts - a[0].ts)
            .map(([areaId, entries]) => {
              const latest = entries[0];
              return (
                <PressBounce key={areaId} style={styles.testCard} onPress={() => router.push({ pathname: '/test-detail', params: { kind: 'area', id: areaId } } as any)}>
                  <Text style={styles.mtName} numberOfLines={1}>{latest.areaName ?? 'Area'}</Text>
                  <Text style={styles.mtSub} numberOfLines={2}>Last {latest.correct}/{latest.total} · {entries.length} {entries.length === 1 ? 'attempt' : 'attempts'}</Text>
                </PressBounce>
              );
            })}
        </ScrollView>
      )}

      {/* SEE MORE AREAS — turns this section into a discovery surface, not just a record of
          what's already been done: every practiceable area for the field, tried or not. */}
      {fieldDomains.length > 0 && (
        <>
          <PressBounce onPress={() => setShowAllAreas((v) => !v)} style={styles.seeMoreRow}>
            <Text style={styles.seeMoreTxt}>{showAllAreas ? 'Show less' : 'See more areas'}</Text>
          </PressBounce>
          {showAllAreas && fieldDomains.map((d) => {
            const entries = areaProgress.get(d.id);
            return (
              <PressBounce key={d.id} style={styles.histRow} onPress={() => startAreaQuick(d)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.histLabel} numberOfLines={1}>{d.name}</Text>
                  {!!entries && <Text style={styles.histWhen}>Last {entries[0].correct}/{entries[0].total} · {entries.length} {entries.length === 1 ? 'attempt' : 'attempts'}</Text>}
                </View>
                <Text style={[styles.histScore, !entries && { color: co.accent }]}>{entries ? `${entries[0].correct}/${entries[0].total}` : 'Try it'}</Text>
              </PressBounce>
            );
          })}
        </>
      )}

      {/* SECONDARY ROW — two equal cards */}
      <View style={styles.secRow}>
        <PressBounce style={styles.secCard} onPress={() => { setBMsg(''); setBuilding(true); }}>
          <Text style={styles.secTitle}>{t('practice.buildTest')}</Text>
          <Text style={styles.secSub}>Pick what, how, how long</Text>
        </PressBounce>
        <PressBounce style={styles.secCard} onPress={() => router.push('/standing' as any)}>
          <Text style={styles.secTitle}>Where you stand</Text>
          <Text style={styles.secSub}>Your level by area</Text>
        </PressBounce>
      </View>

      <Text style={styles.sect}>More ways to practise</Text>

      {/* EXAM READINESS - exam-track users only (exam date and/or exam wordlist followed);
          for everyone else this renders nothing at all. Deliberately a quiet status readout,
          NOT a hero-competing CTA: the hero owns "what to do next" (see the mistakesCleared
          note above) - this tile just reports the monthly check's state and opens it when
          it's actually available. */}
      {examCheck.kind !== 'hidden' && (
        <PressBounce
          style={[styles.readiness, examCheck.kind === 'notReady' && { opacity: 0.5 }]}
          onPress={examCheck.kind === 'notReady' ? undefined : () => router.push('/exam-readiness' as any)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.fyT}>Exam readiness</Text>
            <Text style={styles.fyS}>
              {examCheck.kind === 'due'
                ? examCheck.answered > 0
                  ? `${examCheck.answered} of ${examCheck.total} answered · pick it back up`
                  : `Check ready · ${examCountdownLabel(examCheck.examDate) ?? 'once a month'}`
                : examCheck.kind === 'done'
                  ? `Done · ${examCheck.correct}/${examCheck.total} · next in ${examCheck.nextInDays} ${examCheck.nextInDays === 1 ? 'day' : 'days'}`
                  : 'Not ready yet · needs more practice data'}
            </Text>
          </View>
          {examCheck.kind === 'due' && (
            <Text style={styles.readinessGo}>{examCheck.answered > 0 ? 'Resume' : 'Take it'}</Text>
          )}
        </PressBounce>
      )}

      {fieldDomains.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 26 }} style={{ flexGrow: 0, marginBottom: 14 }}>
          <PressBounce onPress={() => setCat('')} style={[styles.chip, cat === '' && { backgroundColor: co.accent }]}>
            <Text style={[styles.chipText, cat === '' && { color: co.ink }]}>{t('practice.all')}</Text>
          </PressBounce>
          {fieldDomains.map((d) => (
            <PressBounce key={d.id} onPress={() => setCat(cat === d.id ? '' : d.id)} style={[styles.chip, cat === d.id && { backgroundColor: co.accent }]}>
              <Text style={[styles.chipText, cat === d.id && { color: co.ink }]}>{d.name}</Text>
            </PressBounce>
          ))}
        </ScrollView>
      )}

      <FadeIn style={styles.foryou}>
        <PressBounce style={styles.fy} onPress={() => router.push({ pathname: '/browse', params: { axis: 'history', title: 'Your history' } })}>
          <AnimatedIllo name="clock" co={co} size={34} amount={5} />
          <Text style={styles.fyT}>{t('practice.yourHistory')}</Text>
          <Text style={styles.fyS}>Words you’ve practised</Text>
        </PressBounce>
        {/* A status/progress card, not a second "Start" button — the hero above already owns the
            single "what to do next" action (and covers this exact one when mistakes are the
            system priority). This tile's job is showing the ongoing mistakes-review PROCESS: how
            many are still outstanding vs. how many got cleared recently, so it stays useful (and
            non-duplicate) even when the hero is busy pointing at due words or a weak area instead. */}
        <PressBounce style={[styles.fy, mistakes === 0 && { opacity: 0.5 }]} onPress={mistakes > 0 ? reviewMistakes : undefined}>
          <AnimatedIllo name="pen" co={co} size={34} amount={5} />
          <Text style={styles.fyT}>Your mistakes</Text>
          <Text style={styles.fyS}>
            {mistakes > 0
              ? `${mistakes} outstanding${mistakesCleared > 0 ? ` · ${mistakesCleared} cleared this wk` : ''}`
              : mistakesCleared > 0 ? `All clear · ${mistakesCleared} cleared this wk` : 'None yet - nice'}
          </Text>
        </PressBounce>
      </FadeIn>

      <FadeIn style={styles.chalRow} delay={40}>
        {CHALLENGES.map((c) => (
          <PressBounce key={c.name} style={styles.chal} onPress={() => setSession({ mode: 'guess', challenge: c.key, assess: false })}>
            <AnimatedIllo name={c.illo} co={co} size={34} amount={4} />
            <Text style={styles.chalName}>{c.name}</Text>
            <Text style={styles.chalSub}>{c.sub}</Text>
          </PressBounce>
        ))}
      </FadeIn>

      <FadeIn style={styles.gameGrid} delay={80}>
        {GAMES.map(({ mode, illo, title }) => (
          <PressBounce key={mode} style={styles.gameTile} onPress={() => setSession({ mode, challenge: null, assess: false })}>
            <AnimatedIllo name={illo} co={co} size={48} amount={5} />
            <Text style={styles.gameName}>{title}</Text>
          </PressBounce>
        ))}
      </FadeIn>

      {/* Level test demoted out of the top slot — a quiet retake, not a vanity metric on the hub (#66/#74) */}
      <PressBounce style={styles.retake} onPress={startPlacement}>
        <Text style={styles.retakeTxt}>{level === '-' ? 'Take the level test' : 'Retake the level test'}</Text>
      </PressBounce>
    </ScrollView>

      {building && (
        <ScrollView style={styles.sheet} contentContainerStyle={{ paddingHorizontal: 26, paddingTop: insets.top + 30, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{t('practice.buildTest')}</Text>
            <PressBounce onPress={() => setBuilding(false)} hitSlop={12}><Text style={styles.sheetClose}>✕</Text></PressBounce>
          </View>
          <Text style={styles.sect}>What to practise</Text>
          <View style={styles.srcRow}>
            {([['due', 'Due'], ['mistakes', 'Mistakes'], ['saved', 'Saved'], ['area', 'Area'], ['all', 'Everything']] as const).map(([v, l]) => {
              const on = bSrcs.includes(v);
              return (
                <PressBounce key={v} onPress={() => toggleSrc(v)} style={[styles.chip, on && { backgroundColor: co.accent }]}>
                  <Text style={[styles.chipText, on && { color: co.ink }]}>{l}</Text>
                </PressBounce>
              );
            })}
          </View>
          {bSrcs.includes('area') && (
            <View style={{ marginTop: 20 }}>
              <AreaPicker
                field={field}
                co={co}
                present={(tags) => tags.some((t) => presentSet.has(t))}
                isSubOn={(tags) => isSubOnMulti(tags)}
                onSub={onSub}
                axisOn={axisOn}
                onAxis={onAxis}
                examPresent={(t) => (examTags as string[]).includes(t) || presentSet.has(t)}
                searchable
              />
            </View>
          )}
          <Text style={styles.sect}>{isCefrField(field) ? 'Level' : 'Difficulty'}</Text>
          <Segment co={co} value={bLevel} onChange={setBLevel}
            options={[{ label: 'All', value: 'all' }, { label: 'C1', value: 'C1' }, { label: 'C2', value: 'C2' }]} />
          <Text style={styles.sect}>How</Text>
          <Segment co={co} value={bMode} onChange={(v) => setBMode(v as PracticeMode)}
            options={[{ label: 'Mixed', value: 'mixed' }, { label: 'Meaning', value: 'meaning' }, { label: 'Gap', value: 'gap' }, { label: 'Synonym', value: 'synonym' }, { label: 'Guess', value: 'guess' }]} />
          <Text style={styles.sect}>Length</Text>
          <Segment co={co} value={String(bLen)} onChange={(v) => setBLen(+v)}
            options={[{ label: '10 words', value: '10' }, { label: '20 words', value: '20' }, { label: '30 words', value: '30' }]} />
          {!!bMsg && <Text style={styles.bMsg}>{bMsg}</Text>}
          <PressBounce style={styles.startBtn} onPress={startCustom}><Text style={styles.startTxt}>{t('practice.startTest')}</Text></PressBounce>
          {/* #85 Save this recipe to "My tests" (explicit, named) so it tracks a score over time. */}
          <View style={styles.saveRow}>
            <TextInput
              value={saveName}
              onChangeText={setSaveName}
              placeholder="Name this test to save it"
              placeholderTextColor={co.faint}
              style={styles.saveInput}
              returnKeyType="done"
              onSubmitEditing={doSave}
            />
            <PressBounce style={[styles.saveBtn, !saveName.trim() && { opacity: 0.4 }]} onPress={saveName.trim() ? doSave : undefined}>
              <Text style={styles.saveBtnTxt}>Save</Text>
            </PressBounce>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  build: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: co.surface2, borderRadius: 18, padding: 18, marginTop: 12 },
  buildT: { fontFamily: fonts.serif, fontSize: 18, color: co.text },
  buildS: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, marginTop: 3 },
  buildArrow: { fontFamily: fonts.serif, fontSize: 22, color: co.faint },
  sheet: { ...StyleSheet.absoluteFillObject, backgroundColor: co.bg },
  bHint: { fontFamily: fonts.sans, fontSize: 13.5, color: co.muted },
  catHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: co.surface2, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15 },
  catHeaderText: { fontFamily: fonts.serif, fontSize: 17, color: co.text },
  catMeta: { fontFamily: fonts.sans, fontSize: 13, color: co.faint },
  catBody: { marginTop: 6, gap: 6, paddingLeft: 6 },
  topicRow: { backgroundColor: co.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  topicRowText: { fontFamily: fonts.sansMedium, fontSize: 14.5, color: co.text },
  subLabel: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 1.2, color: co.faint, textTransform: 'uppercase', marginTop: 18, marginBottom: 10 },
  examRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  examChip: { backgroundColor: co.surface2, borderRadius: 999, paddingHorizontal: 15, paddingVertical: 10 },
  examChipTxt: { fontFamily: fonts.sansMedium, fontSize: 14, color: co.text },
  otherToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, paddingVertical: 6 },
  otherToggleTxt: { fontFamily: fonts.sansMedium, fontSize: 15, color: co.text },
  switchTrack: { width: 46, height: 28, borderRadius: 999, backgroundColor: co.surface2, padding: 3, justifyContent: 'center' },
  switchKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: co.bg },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 26, color: co.text },
  sheetClose: { fontFamily: fonts.sans, fontSize: 20, color: co.muted },
  bMsg: { fontFamily: fonts.sans, fontSize: 13.5, color: co.bad, marginTop: 16, lineHeight: 20 },
  startBtn: { backgroundColor: co.accent, borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginTop: 30 },
  startTxt: { fontFamily: fonts.sansSemi, fontSize: 16, color: co.ink },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  saveInput: { flex: 1, backgroundColor: co.surface2, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontFamily: fonts.sans, fontSize: 15, color: co.text },
  saveBtn: { backgroundColor: co.surface2, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13 },
  saveBtnTxt: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.text },
  testCard: { width: 200, backgroundColor: co.surface2, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16 },
  mtName: { fontFamily: fonts.serif, fontSize: 17, color: co.text },
  mtSub: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, marginTop: 3 },
  mtEmpty: { backgroundColor: co.surface2, borderRadius: 16, paddingVertical: 20, paddingHorizontal: 16 },
  mtEmptyTxt: { fontFamily: fonts.sans, fontSize: 13.5, color: co.muted, lineHeight: 19 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: co.line },
  histLabel: { fontFamily: fonts.sansMedium, fontSize: 14.5, color: co.text },
  histWhen: { fontFamily: fonts.sans, fontSize: 12, color: co.muted, marginTop: 2 },
  histScore: { fontFamily: fonts.sansSemi, fontSize: 14, color: co.muted },
  seeMoreRow: { paddingVertical: 12 },
  seeMoreTxt: { fontFamily: fonts.sansMedium, fontSize: 14, color: co.accent },
  h2: { fontFamily: fonts.serif, fontSize: 30, color: co.text, marginTop: 8, marginBottom: 6 },
  test: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: co.surface2, borderRadius: 18, padding: 20, marginTop: 16 },
  testT: { fontFamily: fonts.serif, fontSize: 20, color: co.text },
  testS: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, marginTop: 3 },
  testCta: { alignSelf: 'flex-start', backgroundColor: co.accent, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 18, marginTop: 14 },
  testCtaT: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: co.ink },
  sect: { ...label, color: co.faint, marginTop: 4, marginBottom: 14 },
  srcRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { backgroundColor: co.surface2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: co.text },
  foryou: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  fy: { flex: 1, backgroundColor: co.surface2, borderRadius: 18, padding: 16 },
  fyT: { fontFamily: fonts.serif, fontSize: 17, color: co.text },
  fyS: { fontFamily: fonts.sans, fontSize: 11.5, color: co.muted, marginTop: 5 },
  chalRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  chal: { flex: 1, backgroundColor: co.surface2, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 12 },
  chalName: { fontFamily: fonts.serif, fontSize: 16, color: co.text },
  chalSub: { fontFamily: fonts.sans, fontSize: 11, color: co.muted, marginTop: 4 },
  gameGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  gameTile: { width: '48%', backgroundColor: co.surface2, borderRadius: 18, paddingVertical: 22, paddingHorizontal: 16 },
  gameName: { fontFamily: fonts.serif, fontSize: 17, color: co.text },
  // Daily test — the streak-first PRIMARY (hero weight): column card holding the top row
  // (streak badge + title + CTA) and the week strip below.
  dailyHero: { backgroundColor: co.surface2, borderRadius: 20, paddingVertical: 20, paddingHorizontal: 22, marginTop: 20, marginBottom: 16 },
  heroLabel: { fontFamily: fonts.serif, fontSize: 22, color: co.text, lineHeight: 28 },
  heroSub: { fontFamily: fonts.sans, fontSize: 13, color: co.muted, marginTop: 4 },
  heroCta: { backgroundColor: co.accent, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 22 },
  heroCtaTxt: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.ink },
  viewPath: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: co.accent, alignSelf: 'center' },
  // Review — the SECONDARY, quieter open-ended review card below the daily hero (text CTA, not
  // a competing gold pill).
  review: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: co.surface2, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 20 },
  reviewLabel: { fontFamily: fonts.serif, fontSize: 18, color: co.text, lineHeight: 24 },
  reviewSub: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, marginTop: 3 },
  reviewGo: { fontFamily: fonts.sansSemi, fontSize: 14, color: co.accent },
  dailyTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dailyStreakBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 8, paddingRight: 11, height: 36, borderRadius: 18, backgroundColor: co.accent + '22' },
  dailyStreakNum: { fontFamily: fonts.sansSemi, fontSize: 16, color: co.accent },
  // Subtle gold wash when the day's test is still open — signals "activity waiting".
  dailyHeroActive: { backgroundColor: co.accent + '14' },
  dailyProg: { height: 5, borderRadius: 3, backgroundColor: co.line, marginTop: 14, overflow: 'hidden' },
  dailyProgFill: { height: '100%', borderRadius: 3, backgroundColor: co.accent },
  dailyWeekRow: { flexDirection: 'row', marginTop: 16 },
  dailyWeekCell: { flex: 1, alignItems: 'center', gap: 7 },
  dailyWeekLetter: { fontFamily: fonts.sansSemi, fontSize: 10.5, color: co.faint, letterSpacing: 0.2 },
  dailyWeekDot: { width: 9, height: 9, borderRadius: 4.5 },
  // Negative margins neutralize the flame's taller footprint (16 vs the 9pt dot) so a done day
  // doesn't push its cell taller than the plain-dot cells and skew the row.
  dailyWeekFlame: { marginTop: -3, marginBottom: -4 },
  // Today-not-done needs its own strong cue (bigger + a saturated accent tint, not just a faint
  // wash) since at a low alpha it reads as the same neutral grey as every other undone day.
  dailyWeekDotToday: { width: 12, height: 12, borderRadius: 6, backgroundColor: co.accent + '73' },
  // Exam-readiness tile: same register as the fy status cards, full width, quiet.
  readiness: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: co.surface2, borderRadius: 18, padding: 16, marginBottom: 14 },
  readinessGo: { fontFamily: fonts.sansSemi, fontSize: 14, color: co.accent },
  secRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 20 },
  secCard: { flex: 1, backgroundColor: co.surface2, borderRadius: 18, padding: 16 },
  secTitle: { fontFamily: fonts.serif, fontSize: 17, color: co.text },
  secSub: { fontFamily: fonts.sans, fontSize: 12, color: co.muted, marginTop: 4 },
  retake: { alignItems: 'center', paddingVertical: 16, marginTop: 6 },
  retakeTxt: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, textDecorationLine: 'underline' },
});
