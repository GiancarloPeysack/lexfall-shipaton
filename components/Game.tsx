import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { speakWord } from '../lib/speak';
import { Word } from '../data/types';
import { GameMode, buildQuestions, buildMixedQuestions, MODE_TITLE, Question } from '../lib/games';
import { displayLevelFor } from '../data/word-levels';

export type PracticeMode = GameMode | 'mixed';
import { recordReview } from '../lib/srs';
import { recordLearned, recordAttempt, recordSkill, setWordCollection } from '../lib/db';
import { recordAnswer } from '../lib/metrics';
import { playSfx } from '../lib/sfx';
import { t } from '../lib/i18n';
import { useApp } from '../lib/app-state';
import { fonts, label, Palette } from '../theme/tokens';

export type Challenge = 'sprint' | 'perfection' | 'rush' | null;
const SPRINT_SECONDS = 60;
const LIVES = 3;

export default function Game({ mode, pool, onExit, onDone, challenge = null, assess = false, n = 10, seedLevelOnly = false, onAssessDone, distractors = 2, counterStart, counterTotal, onAnswer, hideResult = false, topInset, recordStats = true }: {
  mode: PracticeMode; pool: Word[]; onExit: () => void; challenge?: Challenge; assess?: boolean;
  n?: number; seedLevelOnly?: boolean;
  // Fired once when the round completes, with the tally. The parent decides what to do
  // with it (e.g. record an attempt against a saved test — #85). Ignored for placement.
  onDone?: (r: { correct: number; total: number }) => void;
  // When true, Game renders NOTHING on completion and just fires onDone - the parent owns the
  // entire post-round UI (the daily test does this to replace Game's generic "X wrong / Finish"
  // result screen with its own streak celebration + missed-words list). Missed words still
  // auto-save on complete (the autoSaved effect runs regardless of what's rendered here).
  hideResult?: boolean;
  // Fired after EVERY answer (right/wrong/skip counts as wrong), before the round-complete
  // screen - lets a caller persist per-question results as they happen (the daily test needs
  // this to know which of today's words were missed, not just the final tally).
  onAnswer?: (word: Word, ok: boolean) => void;
  // Onboarding only: when provided, this assess round skips its own "N words to add" result
  // screen entirely and just reports its missed words here - vorto.level still gets written.
  // Lets the parent (onboarding) combine misses from multiple assessment steps (multi-select +
  // flashcard + this MCQ) into ONE results/save screen instead of three separate ones.
  onAssessDone?: (missed: Word[]) => void;
  // Number of wrong options per question (default 2 -> 3 total options). The onboarding MCQ
  // uses 1 (2 options) - by the time someone reaches it they've already done two other
  // word-review stages, so a lighter final format is warranted.
  distractors?: number;
  // Onboarding only: continue a single N-of-total counter across multiple assessment stages
  // (flashcards then this MCQ) instead of each stage resetting its own "1 of 2".
  counterStart?: number;
  counterTotal?: number;
  // Override the safe-area top padding of the in-round view. The daily test renders its own
  // gauge header ABOVE Game and passes topInset={0} so Game's questions don't double-count the
  // safe area. Defaults to the real inset for every other caller (unchanged behavior).
  topInset?: number;
  // When false, Game does NOT write the per-answer accuracy/SRS/skill/metrics rows itself and
  // leaves that to the parent's onAnswer. The daily test owns its recording (it must record the
  // REAL round only and skip its recursive drill practice rounds, so the same missed word isn't
  // counted again on every re-drill). Defaults true — every other caller records inline as before.
  recordStats?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const topPad = topInset ?? insets.top;
  const { palette: co } = useApp();
  const styles = makeStyles(co);
  const win = useWindowDimensions(); // for the length-based headword fit (see bigWord below)
  const [retry, setRetry] = useState<Word[] | null>(null); // "practice missed" re-drill pool

  // Build a long queue for challenges (cycle the pool); a fixed 10 otherwise.
  const questions = useMemo<Question[]>(() => {
    const src = retry ?? pool;
    const build = (count: number) =>
      mode === 'mixed' ? buildMixedQuestions(src, count) : buildQuestions(src, mode, count, distractors);
    if (retry) return build(Math.min(10, src.length)); // re-drill just the missed words
    if (challenge) {
      const q: Question[] = [];
      while (q.length < 50 && pool.length) q.push(...build(pool.length || 1));
      return q.slice(0, 50);
    }
    // #10 (owner): the onboarding placement test uses a SINGLE, simplest format so a brand-new
    // user isn't saturated with alternating question types. Game is invoked with mode='meaning'
    // (see the word, pick its meaning) — the clearest format — and build(n) honours it.
    return build(n);
  }, [pool, retry, mode, challenge, assess, distractors]);

  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [time, setTime] = useState(SPRINT_SECONDS);
  const [results, setResults] = useState<{ word: Word; ok: boolean; picked: string; answer: string }[]>([]);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (challenge !== 'sprint' || done) return;
    timer.current = setInterval(() => setTime((t) => {
      if (t <= 1) { clearInterval(timer.current!); setDone(true); return 0; }
      return t - 1;
    }), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [challenge, done]);

  const finish = () => { if (timer.current) clearInterval(timer.current); setDone(true); };

  // Completion chime — covers every finish path (natural end, sprint timeout, perfection out).
  useEffect(() => { if (done) playSfx('complete'); }, [done]);

  // Report the tally to the parent exactly once when the round is over (#85). Guarded by a
  // ref so it can't double-fire across the extra renders that settle score/results.
  const reported = useRef(false);
  const complete = done || i >= questions.length;
  useEffect(() => {
    if (complete && !reported.current && results.length > 0) {
      reported.current = true;
      onDone?.({ correct: score, total: results.length });
    }
  }, [complete, results.length, score]);

  // Onboarding combined-results mode: report misses once, skip this component's own result UI
  // entirely (see onAssessDone doc above).
  const assessReported = useRef(false);
  useEffect(() => {
    if (complete && onAssessDone && !assessReported.current && results.length > 0) {
      assessReported.current = true;
      onAssessDone(results.filter((r) => !r.ok).map((r) => r.word));
    }
  }, [complete, results.length]);

  // Re-drill just the words missed this round (resets the game onto the missed pool).
  const practiceMissed = (missed: Word[]) => {
    setRetry(missed); reported.current = false;
    setI(0); setPicked(null); setScore(0); setCombo(0); setBestCombo(0);
    setLives(LIVES); setTime(SPRINT_SECONDS); setResults([]); setDone(false);
  };

  // Save the missed words to a "Review" collection to practise later (owner: save, don't force
  // an immediate drill). They're already in the SRS mistakes queue; this also files them visibly.
  const [savedLater, setSavedLater] = useState(false);
  // Onboarding placement: a "Saved" confirmation pops into the center of the screen (scale+fade
  // in, brief hold, fade out) rather than just recolouring the button, then glides into the app.
  const savedPop = useRef(new Animated.Value(0)).current;
  const saveForLater = async (words: Word[]) => {
    for (const w of words) await setWordCollection(w.id, 'Review').catch(() => {});
    setSavedLater(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };
  // Auto-save (#28): missed words save the instant results are in - no "Save for practice" tap
  // required. One-shot (autoSaved ref) so re-renders can't re-trigger it.
  const autoSaved = useRef(false);
  useEffect(() => {
    if (autoSaved.current || !(done || i >= questions.length) || !results.length) return;
    autoSaved.current = true;
    const missedNow = results.filter((r) => !r.ok).map((r) => r.word);
    if (missedNow.length) saveForLater(missedNow);
  }, [done, i, results]);
  useEffect(() => {
    if (!(assess && savedLater)) return;
    Animated.sequence([
      Animated.spring(savedPop, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true }),
      Animated.timing(savedPop, { toValue: 0, duration: 220, delay: 700, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [assess, savedLater]);

  if (done || i >= questions.length) {
    const total = results.length || 1;
    const pctScore = Math.round((score / total) * 100);
    const level = pctScore >= 80 ? 'C2' : pctScore >= 55 ? 'C1' : 'B2';
    if (assess) {
      // seedLevelOnly (onboarding, 6 items): only write if unset, so a short onboarding pass can
      // never overwrite a later authoritative in-app result (e.g. after "Restart onboarding").
      // In-app assess is authoritative and overwrites.
      if (seedLevelOnly) AsyncStorage.getItem('vorto.level').then((prev) => { if (!prev) AsyncStorage.setItem('vorto.level', level).catch(() => {}); }).catch(() => {});
      else AsyncStorage.setItem('vorto.level', level).catch(() => {});
    }
    const missed = results.filter((r) => !r.ok);

    // Combined-results mode: the parent shows one aggregate screen for this + other assessment
    // steps, so this component renders nothing here (its own effect above already reported misses).
    if (assess && onAssessDone) return <View style={{ flex: 1, backgroundColor: co.bg }} />;

    // Parent-owned completion (daily test): render nothing, let onDone hand off to the parent's
    // own streak + missed-words flow. Auto-save already fired via the autoSaved effect above.
    if (hideResult) return <View style={{ flex: 1, backgroundColor: co.bg }} />;

    // ONBOARDING placement: soft + forward-looking. No red, no X, no "you chose" — the missed
    // words are simply "words you're about to learn." One button that saves + glides into the app.
    if (assess) {
      return (
        <View style={[styles.wrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.resultLine}>{missed.length ? `${missed.length} new ${missed.length === 1 ? 'word' : 'words'} to add to your list` : 'A clean sweep — impressive.'}</Text>
          <ScrollView style={{ flex: 1, marginTop: 20 }} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}>
            {missed.map((r, k) => (
              <View key={k} style={styles.softRow}>
                <View style={styles.softMk}>
                  <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="m5 13 4 4L19 7" stroke={co.accent} strokeWidth={3.2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resWord}>{r.word.word}</Text>
                  <Text style={styles.resDef}>({r.word.pos}) {r.word.def}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable style={styles.btn} onPress={onExit}>
            <Text style={styles.btnTxt}>{missed.length ? 'Continue' : 'Start learning'}</Text>
          </Pressable>
          {savedLater && (
            <View style={styles.savedPopWrap} pointerEvents="none">
              <Animated.View
                style={[
                  styles.savedPop,
                  {
                    opacity: savedPop,
                    transform: [{ scale: savedPop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
                  },
                ]}
              >
                <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="m5 12 5 5L20 7" stroke={co.ink} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
                <Text style={styles.savedPopTxt}>Saved</Text>
              </Animated.View>
            </View>
          )}
        </View>
      );
    }

    // PRACTICE rounds: the red right/wrong review is genuinely useful for learning here.
    return (
      <View style={[styles.wrap, { paddingTop: insets.top + 40 }]}>
        <Text style={[label, { textAlign: 'center' }]}>{t('game.roundComplete')}</Text>
        <Text style={styles.score}>{score}/{results.length}</Text>
        <Text style={styles.scoreSub}>{pctScore}% · ~{level}{bestCombo >= 2 ? ` · best streak ×${bestCombo}` : ''}</Text>
        <ScrollView style={{ flex: 1, marginTop: 20 }} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}>
          {missed.length === 0
            ? <Text style={styles.allGood}>{t('game.cleanSweep')}</Text>
            : <Text style={styles.resSect}>{t('game.reviewThese')} · {missed.length}</Text>}
          {missed.map((r, k) => (
            <View key={k} style={styles.resRow}>
              <Text style={[styles.mk, { color: co.bad }]}>✕</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.resWord}>{r.word.word}</Text>
                <Text style={styles.resDef}>({r.word.pos}) {r.word.def}</Text>
                {r.picked === ''
                  ? <Text style={styles.resPick}>skipped · answer “{r.answer}”</Text>
                  : r.picked !== r.answer && <Text style={styles.resPick}>you chose “{r.picked}” · answer “{r.answer}”</Text>}
              </View>
            </View>
          ))}
        </ScrollView>
        {missed.length >= 3 && savedLater && (
          <Text style={[styles.resPick, { textAlign: 'center', marginBottom: 10 }]}>Saved {missed.length} for later ✓</Text>
        )}
        <Pressable style={styles.btn} onPress={onExit}><Text style={styles.btnTxt}>{t('game.finish')}</Text></Pressable>
      </View>
    );
  }

  const q = questions[i];
  // Defensive: `complete` above should always be true when there's no question left, but a
  // stale index during a fast re-render (e.g. pool/mode changing mid-round) could momentarily
  // slip past that check. Rather than crash on q.answer, bail into the same finishing state.
  if (!q) { if (!done) finish(); return <View style={[styles.wrap, { paddingTop: topPad + 24 }]} />; }
  const wasCorrect = picked !== null && picked === q.answer;

  const choose = (opt: string) => {
    if (picked) return;
    setPicked(opt);
    const ok = opt === q.answer;
    if (ok) {
      setScore((s) => s + 1);
      setCombo((c) => { const n = c + 1; setBestCombo((b) => Math.max(b, n)); return n; });
      AsyncStorage.getItem('lexfall.xp').then((v) => AsyncStorage.setItem('lexfall.xp', String(parseInt(v || '0', 10) + 10 + combo * 2))).catch(() => {});
    } else {
      setCombo(0);
    }
    setResults((r) => [...r, { word: q.word, ok, picked: opt, answer: q.answer }]);
    if (recordStats) {
      recordReview(q.word.id, ok).catch(() => {});
      recordAnswer(ok).catch(() => {});
      recordAttempt(q.word.id, ok).catch(() => {});
      recordSkill(q.word, ok).catch(() => {});
      if (ok) recordLearned(1).catch(() => {});
    }
    onAnswer?.(q.word, ok);
    // Reveal-synced haptic: success on right, WARNING (not error) on wrong — a nudge, not a scold. No sound (#80/#81).
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    let nextLives = lives;
    if (!ok && challenge === 'perfection') { nextLives = lives - 1; setLives(nextLives); }
    // Auto-advance for every mode, including assess (owner, 2026-09-11 v2: "make this autoscroll
    // as it was before" - a manual "Next word" tap was tried per a reference app's pattern, then
    // reverted live once seen on-device). The correct/incorrect label still shows during this
    // window, just without gating advance on a tap.
    setTimeout(() => {
      if (challenge === 'perfection' && nextLives <= 0) { finish(); return; }
      if (i + 1 >= questions.length) { finish(); return; }
      setI(i + 1); setPicked(null);
    }, 1200);
  };

  // #10: skip instead of forcing a guess. Counts as not-known (honest signal), briefly reveals
  // the answer so it still teaches, then moves on. The ' skip' sentinel locks input without
  // matching any option (so nothing shows as a wrong pick).
  const skip = () => {
    if (picked) return;
    setPicked(' skip');
    setCombo(0);
    setResults((r) => [...r, { word: q.word, ok: false, picked: '', answer: q.answer }]);
    if (recordStats) {
      recordReview(q.word.id, false).catch(() => {});
      recordAnswer(false).catch(() => {});
      recordAttempt(q.word.id, false).catch(() => {});
      recordSkill(q.word, false).catch(() => {});
    }
    onAnswer?.(q.word, false);
    Haptics.selectionAsync().catch(() => {});
    setTimeout(() => {
      if (i + 1 >= questions.length) { finish(); return; }
      setI(i + 1); setPicked(null);
    }, 900);
  };

  return (
    <View style={[styles.wrap, { paddingTop: topPad + 24 }]}>
      <View style={styles.top}>
        <Pressable onPress={onExit} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
        <Text style={styles.counter}>{(counterStart ?? 0) + i + 1}{challenge ? '' : ` / ${counterTotal ?? questions.length}`}</Text>
        {challenge === 'sprint' && <Text style={styles.timer}>{time}s</Text>}
        {challenge === 'perfection' && <Text style={styles.lives}>{'♥'.repeat(lives)}{'·'.repeat(LIVES - lives)}</Text>}
        {/* In a mixed round the question FORMAT changes every question, so labeling the format
            ("Meaning match" etc.) is meaningless - the useful constant is the current word's real
            level. Show its actual CEFR grade (fine 6-tier when graded, else the corpus C1/C2)
            instead of a generic "Mixed" (owner, 2026-09-18). Single-format rounds keep their
            format title since THAT is their constant; the level test keeps its own label. */}
        {(challenge === 'rush' || !challenge) && (
          <Text style={[label, { color: co.faint }]}>{assess ? t('game.levelTest') : mode === 'mixed' ? displayLevelFor(q.word) : MODE_TITLE[mode]}</Text>
        )}
      </View>
      {!challenge && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round((((counterStart ?? 0) + i + 1) / (counterTotal ?? questions.length)) * 100)}%` }]} />
        </View>
      )}
      <View style={styles.center}>
        {combo >= 2 && <Text style={styles.combo}>On a roll · ×{combo}</Text>}
        <Text style={[label, styles.prompt]}>{q.promptLabel}{q.promptKind === 'word' ? ' ?' : ''}</Text>
        {q.promptKind === 'word' ? (
          <>
            {/* Length-based fit instead of adjustsFontSizeToFit, which on the New Architecture
                scales the word UP to fill the width (that's why short words like "gross-up" rendered
                huge). Caps at the base 44 for normal words, sizes DOWN for long ones so nothing
                truncates. Budget = win - wrap padding (28*2) - safety; serif ratio ~0.6. */}
            <Text style={[styles.bigWord, { fontSize: Math.max(22, Math.min(44, Math.round((win.width - 64) / (Math.max(1, q.prompt.length) * 0.6)))) }]} numberOfLines={1} adjustsFontSizeToFit={false}>{q.prompt}</Text>
            {!!q.word.pos && <Text style={styles.pos}>({q.word.pos})</Text>}
            {/* #10: hear the word - adds an audio dimension to the test. */}
            <Pressable onPress={() => speakWord(q.word.word)} hitSlop={12} accessibilityLabel={`Pronounce ${q.word.word}`} style={styles.sayBtn}>
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d="M11 5 6 9H3v6h3l5 4V5Z" stroke={co.muted} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
                <Path d="M15.5 8.5a4.5 4.5 0 0 1 0 7" stroke={co.muted} strokeWidth={1.6} fill="none" strokeLinecap="round" />
              </Svg>
            </Pressable>
          </>
        ) : (
          <Text style={styles.def}>{q.prompt}</Text>
        )}

        <View style={{ marginTop: 26 }}>
          {q.options.map((opt, idx) => {
            const isCorrect = !!picked && opt === q.answer;
            const isWrong = picked === opt && opt !== q.answer;
            return (
              <Pressable
                key={`${opt}-${idx}`}
                onPress={() => choose(opt)}
                style={({ pressed }) => [styles.opt, pressed && !picked && styles.optPressed, isCorrect && styles.optOk, isWrong && styles.optBad]}
              >
                <Text style={[q.optionStyle === 'def' ? styles.optDef : styles.optWord, (isCorrect || isWrong) && { color: co.ink }]}>
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Bigger, below-the-options Skip (owner feedback: the small top-right link read as an
            afterthought) - a real secondary button, same size as the primary CTAs, quiet
            surface2 fill per the house rule (gold stays reserved for primary moments). */}
        {!picked && (challenge === 'rush' || !challenge) && (
          <Pressable style={[styles.btn, { backgroundColor: co.surface2, marginTop: 14 }]} onPress={skip}>
            <Text style={[styles.btnTxt, { color: co.text }]}>Skip</Text>
          </Pressable>
        )}

        {/* Reserve the In-context line's vertical space so revealing the answer never jumps the layout (#8 §3). */}
        <View style={styles.feedbackSlot}>
          {picked
            ? (
              <>
                {assess && (
                  <Text style={[styles.feedbackTitle, { color: wasCorrect ? co.ok : co.bad }]}>
                    {wasCorrect ? 'That’s correct!' : 'Not quite'}
                  </Text>
                )}
                <Text style={styles.feedback}>In context: {q.word.ex}</Text>
              </>
            )
            : i === 0 ? <Text style={styles.hint}>Tap the meaning you think fits.</Text> : null}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: co.bg, paddingHorizontal: 28, paddingBottom: 30 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  close: { color: co.muted, fontSize: 19 },
  counter: { fontFamily: fonts.sansSemi, fontSize: 13, color: co.muted, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  progressTrack: { height: 3, backgroundColor: co.line, borderRadius: 2, marginBottom: 26, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: co.accent, borderRadius: 2 },
  timer: { fontFamily: fonts.serif, fontSize: 18, color: co.accent, fontVariant: ['tabular-nums'] },
  lives: { fontFamily: fonts.sans, fontSize: 15, color: co.bad, letterSpacing: 2 },
  center: { flex: 1, justifyContent: 'center' },
  combo: { fontFamily: fonts.sansSemi, fontSize: 12, color: co.accent, textAlign: 'center', letterSpacing: 0.5, marginBottom: 8 },
  prompt: { textAlign: 'center', color: co.muted },
  bigWord: { fontFamily: fonts.serif, fontSize: 44, color: co.text, textAlign: 'center', marginTop: 14, letterSpacing: 0.5 },
  pos: { fontFamily: fonts.sans, fontSize: 15, color: co.faint, textAlign: 'center', marginTop: 8 },
  sayBtn: { alignSelf: 'center', marginTop: 12, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: co.surface2 },
  skipTop: { fontFamily: fonts.sansSemi, fontSize: 14, color: co.accent, letterSpacing: 0.2 },
  def: { fontFamily: fonts.serif, fontSize: 23, color: co.text, textAlign: 'center', lineHeight: 32, marginTop: 16 },
  opt: { backgroundColor: co.line2, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 18, marginBottom: 14, minHeight: 58, justifyContent: 'center' },
  optPressed: { opacity: 0.72 },
  optOk: { backgroundColor: co.ok }, optBad: { backgroundColor: co.bad },
  optWord: { fontFamily: fonts.serif, fontSize: 20, color: co.text, textAlign: 'center' },
  optDef: { fontFamily: fonts.sans, fontSize: 15, color: co.text, lineHeight: 21 },
  feedbackSlot: { minHeight: 50, marginTop: 16, justifyContent: 'center' },
  feedbackTitle: { fontFamily: fonts.sansSemi, fontSize: 14.5, textAlign: 'center', marginBottom: 6 },
  feedback: { fontFamily: fonts.serifItalic, fontSize: 15, color: co.exText, textAlign: 'center', lineHeight: 22 },
  hint: { fontFamily: fonts.sans, fontSize: 13.5, color: co.faint, textAlign: 'center' },
  score: { fontFamily: fonts.serif, fontSize: 68, color: co.text, textAlign: 'center', marginTop: 10 },
  resultLine: { fontFamily: fonts.serif, fontSize: 32, color: co.text, textAlign: 'center', marginTop: 10, lineHeight: 40 },
  scoreSub: { fontFamily: fonts.sans, fontSize: 13, color: co.muted, textAlign: 'center' },
  resRow: { flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: co.line },
  softRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: co.line },
  softMk: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  mk: { fontSize: 16, width: 18 },
  resWord: { fontFamily: fonts.serif, fontSize: 18, color: co.text },
  resDef: { fontFamily: fonts.sans, fontSize: 12, color: co.muted, marginTop: 1 },
  resPick: { fontFamily: fonts.sans, fontSize: 12, color: co.bad, marginTop: 3 },
  resSect: { fontFamily: fonts.sansSemi, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: co.faint, marginBottom: 4 },
  allGood: { fontFamily: fonts.serifItalic, fontSize: 16, color: co.muted, textAlign: 'center', marginTop: 24 },
  btn: { backgroundColor: co.text, borderRadius: 13, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnTxt: { fontFamily: fonts.sansSemi, fontSize: 15.5, color: co.ink },
  savedPopWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  savedPop: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: co.accent, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 16 },
  savedPopTxt: { fontFamily: fonts.sansSemi, fontSize: 17, color: co.ink },
});
