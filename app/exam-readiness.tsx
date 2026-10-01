import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useField } from '../lib/field';
import { useApp } from '../lib/app-state';
import { Word } from '../data/types';
import Game from '../components/Game';
import BackButton from '../components/BackButton';
import PressBounce from '../components/PressBounce';
import { fonts, label, Palette } from '../theme/tokens';
import { examCountdownLabel } from '../lib/exam';
import {
  getExamReadinessStatus, getOrBuildExamCheck, recordExamAnswer, getReadinessHistory,
  readinessVerdict, daysToNextMonth, monthStr, ReadinessResult,
} from '../lib/exam-readiness';

// Monthly exam-readiness check - the second cadence tier above the daily test, only for
// exam-track users (real exam date and/or exam-wordlist topics). See lib/exam-readiness.ts.
type ViewState =
  | { kind: 'loading' }
  | { kind: 'locked' }    // deep-linked here without being on the exam track
  | { kind: 'notReady' }
  | { kind: 'intro'; count: number }
  | { kind: 'quiz'; pending: Word[] }
  | { kind: 'report'; history: ReadinessResult[] };

export default function ExamReadiness() {
  const { field } = useField();
  const { palette: co, examDate } = useApp();
  const styles = makeStyles(co);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  const [pendingCache, setPendingCache] = useState<Word[]>([]);
  // recordExamAnswer is read-modify-write on AsyncStorage; Game fires onDone the instant the
  // last answer lands, so chain every write and await the chain before re-reading state -
  // otherwise the final answer (and the history append) can still be in flight at load().
  const writeChain = useRef<Promise<void>>(Promise.resolve());

  const load = useCallback(async () => {
    const status = await getExamReadinessStatus();
    if (status.kind === 'hidden') { setView({ kind: 'locked' }); return; }
    if (status.kind === 'notReady') { setView({ kind: 'notReady' }); return; }
    if (status.kind === 'done') { setView({ kind: 'report', history: await getReadinessHistory() }); return; }
    const built = await getOrBuildExamCheck(field);
    if (!built) { setView({ kind: 'notReady' }); return; }
    setPendingCache(built.pending);
    if (status.answered > 0) setView({ kind: 'quiz', pending: built.pending }); // resume mid-check
    else setView({ kind: 'intro', count: built.state.wordIds.length });
  }, [field]);
  useEffect(() => { load(); }, [load]);

  if (view.kind === 'loading') {
    return <View style={[styles.wrap, styles.center]}><ActivityIndicator color={co.accent} /></View>;
  }

  if (view.kind === 'quiz') {
    return (
      <Game
        mode="mixed"
        pool={view.pending}
        n={view.pending.length}
        onAnswer={(word, ok) => { writeChain.current = writeChain.current.then(() => recordExamAnswer(word.id, ok)).catch(() => {}); }}
        onDone={() => { writeChain.current.then(load); }}
        onExit={() => router.back()}
      />
    );
  }

  if (view.kind === 'report') {
    return (
      <ReadinessReportView
        co={co}
        history={view.history}
        examDate={examDate}
        insetTop={insets.top}
        onClose={() => router.back()}
        onStanding={() => router.push('/standing' as any)}
      />
    );
  }

  // locked / notReady / intro share the same simple shell with a bottom-anchored action.
  const countdown = examCountdownLabel(examDate);
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
      <BackButton variant="close" onPress={() => router.back()} co={co} />
      <View style={styles.body}>
        <Text style={label}>Monthly check</Text>
        <Text style={styles.h2}>Exam readiness</Text>
        {view.kind === 'locked' && (
          <Text style={styles.sub}>This check is for exam prep. Set an exam date or follow an exam wordlist in your areas to unlock it.</Text>
        )}
        {view.kind === 'notReady' && (
          <Text style={styles.sub}>Not ready yet. Practise a little first so this check can weigh your real weak spots, then come back.</Text>
        )}
        {view.kind === 'intro' && (
          <>
            <Text style={styles.sub}>
              {view.count} questions, once a month. Built from your exam wordlist and the areas where you need the most signal, so the result reads on your actual exam prep.
            </Text>
            {!!countdown && (
              <View style={styles.countChip}><Text style={styles.countChipTxt}>{countdown}</Text></View>
            )}
          </>
        )}
      </View>
      {view.kind === 'intro' ? (
        <PressBounce style={styles.startBtn} onPress={() => setView({ kind: 'quiz', pending: pendingCache })}>
          <Text style={styles.startTxt}>Start the check</Text>
        </PressBounce>
      ) : (
        <PressBounce style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeTxt}>{view.kind === 'notReady' ? 'Back to practice' : 'Close'}</Text>
        </PressBounce>
      )}
    </View>
  );
}

// Exported presentational report so dev-capture can render it with known data (RN ScrollView
// swallows synthetic option taps, so completing a real 24-question run isn't sim-automatable).
// Everything shown is a straight count from completed checks - the trend line only appears
// once 2+ real months exist; nothing is projected or modeled.
export function ReadinessReportView({ co, history, examDate, insetTop, onClose, onStanding }: {
  co: Palette; history: ReadinessResult[]; examDate: string | null; insetTop: number;
  onClose: () => void; onStanding: () => void;
}) {
  const styles = makeStyles(co);
  const latest = history[history.length - 1];
  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const countdown = examCountdownLabel(examDate);
  const next = daysToNextMonth();
  const isThisMonth = latest?.month === monthStr();
  const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long' });
  if (!latest) return null;
  const ready = latest.domains.filter((d) => readinessVerdict(d) === 'Ready');
  const work = latest.domains.filter((d) => readinessVerdict(d) === 'Needs work');
  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 26, paddingTop: insetTop + 16 }}>
        <BackButton variant="close" onPress={onClose} co={co} />
        <Text style={[label, { marginTop: 18 }]}>{monthName(latest.month)} check</Text>
        <Text style={styles.h2}>Exam readiness</Text>

        <View style={styles.scoreCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.scoreLabel}>{isThisMonth ? 'This month' : monthName(latest.month)}</Text>
            {!!countdown && <Text style={styles.scoreHint}>{countdown}</Text>}
            {isThisMonth && <Text style={styles.scoreHint}>Next check in {next} {next === 1 ? 'day' : 'days'}</Text>}
          </View>
          <Text style={styles.scoreBig}>{latest.correct}/{latest.total}</Text>
        </View>

        {/* Trend - only with 2+ real completed checks, never fabricated from one point. */}
        {prev && (
          <Text style={styles.trend}>
            {monthName(prev.month)}: {prev.correct}/{prev.total} · {monthName(latest.month)}: {latest.correct}/{latest.total}
            {latest.total === prev.total ? (latest.correct > prev.correct ? ' · up' : latest.correct < prev.correct ? ' · down' : ' · level') : ''}
          </Text>
        )}

        {/* One-line readout of the verdict ends, only where a verdict exists (3+ Qs). */}
        {(ready.length > 0 || work.length > 0) && (
          <Text style={styles.verdictLine}>
            {ready.length > 0 ? `Ready: ${ready.map((d) => d.name).join(', ')}` : ''}
            {ready.length > 0 && work.length > 0 ? ' · ' : ''}
            {work.length > 0 ? `Needs work: ${work.map((d) => d.name).join(', ')}` : ''}
          </Text>
        )}

        <Text style={styles.sect}>By area · weakest first</Text>
        {latest.domains.map((d) => {
          const verdict = readinessVerdict(d);
          const pct = Math.round(d.score);
          return (
            <View key={d.id} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.name} numberOfLines={1}>{d.name}</Text>
                <Text style={[styles.level, !verdict && { color: co.faint }, verdict === 'Needs work' && { color: co.accent }]}>
                  {verdict ?? 'Small sample'}
                </Text>
              </View>
              <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(6, pct)}%` }]} /></View>
              <Text style={styles.meta}>{d.correct}/{d.total} correct in this check</Text>
            </View>
          );
        })}

        <PressBounce style={styles.standingBtn} onPress={onStanding}>
          <Text style={styles.standingTxt}>See where you stand →</Text>
        </PressBounce>
      </ScrollView>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: co.bg, paddingHorizontal: 26 },
  center: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, justifyContent: 'center' },
  h2: { fontFamily: fonts.serif, fontSize: 30, color: co.text, marginTop: 8, marginBottom: 6 },
  sub: { fontFamily: fonts.sans, fontSize: 15, color: co.muted, lineHeight: 22, marginTop: 8 },
  countChip: { alignSelf: 'flex-start', backgroundColor: co.surface2, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, marginTop: 18 },
  countChipTxt: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: co.accent },
  startBtn: { backgroundColor: co.accent, borderRadius: 16, paddingVertical: 17, alignItems: 'center' },
  startTxt: { fontFamily: fonts.sansSemi, fontSize: 16, color: co.ink },
  closeBtn: { backgroundColor: co.surface2, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  closeTxt: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.text },
  // report
  scoreCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: co.surface2, borderRadius: 18, padding: 20, marginTop: 16 },
  scoreLabel: { fontFamily: fonts.sansSemi, fontSize: 13, color: co.muted },
  scoreHint: { fontFamily: fonts.sans, fontSize: 12.5, color: co.faint, marginTop: 4 },
  scoreBig: { fontFamily: fonts.serif, fontSize: 40, color: co.accent, letterSpacing: -0.5 },
  trend: { fontFamily: fonts.sans, fontSize: 13, color: co.muted, marginTop: 14, lineHeight: 19 },
  verdictLine: { fontFamily: fonts.sansMedium, fontSize: 14, color: co.text, marginTop: 14, lineHeight: 21 },
  sect: { ...label, color: co.faint, marginTop: 26, marginBottom: 12 },
  row: { backgroundColor: co.surface2, borderRadius: 16, padding: 16, marginBottom: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { fontFamily: fonts.serif, fontSize: 17, color: co.text, flexShrink: 1 },
  level: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: co.text },
  barTrack: { height: 8, borderRadius: 999, backgroundColor: co.bg, marginTop: 12, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 999, backgroundColor: co.accent },
  meta: { fontFamily: fonts.sans, fontSize: 12, color: co.muted, marginTop: 8 },
  standingBtn: { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
  standingTxt: { fontFamily: fonts.sansMedium, fontSize: 14, color: co.accent },
});
