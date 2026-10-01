import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useField } from '../lib/field';
import { useApp } from '../lib/app-state';
import { getDomainProficiency, DomainProficiency, getWordsByDomain, getTopics, getSkillBreakdown, SkillRow, isCefrField, scoreToBand, cefrToBand, FIELD_READ_LABEL } from '../lib/db';
import { getLevel } from '../lib/metrics';
import { loadMyTests, bestScore, lastAttempt, type SavedTest } from '../lib/my-tests';
import { domainsForField, Domain } from '../data/domains';
import { Word } from '../data/types';
import Game from '../components/Game';
import BackButton from '../components/BackButton';
import PressBounce from '../components/PressBounce';
import { fonts, label, Palette } from '../theme/tokens';

// "Where you stand" — global level up top, per-domain bars below. Tapping a bar starts a
// 10-question test scoped to that domain, so the picture fills in over time. Domains with
// too few attempts show "not enough data yet" instead of a misleading score.
export default function Standing() {
  const { field } = useField();
  const { palette: co } = useApp();
  const styles = makeStyles(co);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [prof, setProf] = useState<Record<string, DomainProficiency>>({});
  const [global, setGlobal] = useState('-');
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [pool, setPool] = useState<Word[] | null>(null);
  const [myTests, setMyTests] = useState<SavedTest[]>([]);           // #86
  const [skillByTopic, setSkillByTopic] = useState<Map<string, SkillRow>>(new Map()); // #87
  const [expanded, setExpanded] = useState<string | null>(null);     // #87: which area is open

  const load = useCallback(() => {
    getDomainProficiency(field).then((rows) => setProf(Object.fromEntries(rows.map((r) => [r.id, r]))));
    getLevel().then(setGlobal);
    getTopics(field).then((t) => setPresent(new Set(t.map((x) => x.topic))));
    loadMyTests().then(setMyTests);
    getSkillBreakdown('topic').then((rows) => setSkillByTopic(new Map(rows.map((r) => [r.key, r]))));
  }, [field]);
  useFocusEffect(load);

  const sections = useMemo(() => {
    const withWords = domainsForField(field).filter((d) => d.topics.some((t) => present.has(t)));
    const m = new Map<string, Domain[]>();
    withWords.forEach((d) => (m.get(d.section) ?? m.set(d.section, []).get(d.section)!).push(d));
    return [...m.entries()];
  }, [field, present]);

  const startDomain = async (d: Domain) => {
    const w = await getWordsByDomain(d.field, d.topics);
    const chosen = [...w].sort(() => Math.random() - 0.5).slice(0, 10);
    if (chosen.length >= 4) setPool(chosen);
  };
  // #87: drill a specific weak sub-topic; fall back to the whole area if it's too thin.
  const startTopics = async (topics: string[], d: Domain) => {
    const w = await getWordsByDomain(field, topics);
    const chosen = [...w].sort(() => Math.random() - 0.5).slice(0, 10);
    if (chosen.length >= 4) setPool(chosen); else startDomain(d);
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  if (pool) return <Game mode="mixed" pool={pool} challenge={null} assess={false} onExit={() => { setPool(null); load(); }} />;

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60, paddingHorizontal: 26, paddingTop: insets.top + 16 }}>
        <BackButton variant="close" onPress={() => router.back()} co={co} />
        <Text style={[label, { marginTop: 18 }]}>Your proficiency</Text>
        <Text style={styles.h2}>Where you stand</Text>

        <View style={styles.globalCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.globalLabel}>{isCefrField(field) ? 'Overall level' : `Your ${FIELD_READ_LABEL[field] ?? 'field'} read`}</Text>
            <Text style={styles.globalHint}>Tap an area to test it and fill in the picture</Text>
          </View>
          {/* NO adjustsFontSizeToFit: on the New Architecture it GROWS the text to fill width,
              which made this level word ("Strong") huge and crushed the flex:1 label into one
              character per line. Fixed size + shrink so it stays a compact tag. */}
          <Text style={styles.globalLevel} numberOfLines={1}>{global === '-' ? '—' : isCefrField(field) ? global : cefrToBand(global)}</Text>
        </View>

        {/* #86 Saved tests are their own scored category, from each test's attempt history. */}
        {myTests.length > 0 && (
          <View>
            <Text style={styles.sect}>My tests</Text>
            {myTests.map((tst) => {
              const best = bestScore(tst); const last = lastAttempt(tst);
              const pct = best ? Math.round((best.correct / best.total) * 100) : 0;
              return (
                <View key={tst.id} style={styles.row}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>{tst.name}</Text>
                    <Text style={[styles.level, !best && { color: co.faint }]}>{best ? scoreToBand(pct) : 'Not run yet'}</Text>
                  </View>
                  <View style={styles.barTrack}><View style={[styles.barFill, { width: `${best ? Math.max(6, pct) : 0}%` }]} /></View>
                  <Text style={styles.meta}>{best ? `best ${best.correct}/${best.total} · ${pct}% · ${tst.attempts.length} ${tst.attempts.length === 1 ? 'run' : 'runs'}${last && last !== best ? ` · last ${last.correct}/${last.total}` : ''}` : 'Run it from Practice to score'}</Text>
                </View>
              );
            })}
          </View>
        )}

        {sections.length === 0 && <Text style={styles.empty}>No areas yet for this field.</Text>}
        {sections.map(([sec, ds]) => (
          <View key={sec}>
            <Text style={styles.sect}>{sec}</Text>
            {ds.map((d) => {
              const p = prof[d.id];
              const enough = !!(p && p.level);
              const pct = enough ? Math.round(p!.score) : 0;
              const open = expanded === d.id;
              // #87: this area's sub-topics that have data, weakest first — "what you know / where to work".
              const tested = d.topics
                .map((tp) => ({ tp, s: skillByTopic.get(tp) }))
                .filter((x): x is { tp: string; s: SkillRow } => !!x.s && x.s.total > 0)
                .sort((a, b) => a.s.score - b.s.score);
              const untested = d.topics.filter((tp) => present.has(tp) && !(skillByTopic.get(tp)?.total)).length;
              return (
                <View key={d.id} style={styles.row}>
                  <PressBounce onPress={() => setExpanded(open ? null : d.id)}>
                    <View style={styles.rowTop}>
                      <Text style={styles.name} numberOfLines={1}>{d.name}</Text>
                      <Text style={[styles.level, !enough && { color: co.faint }]}>{enough ? (isCefrField(field) ? p!.level : scoreToBand(p!.score)) : 'Not enough data yet'}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${enough ? Math.max(6, pct) : 0}%` }]} />
                    </View>
                    <Text style={styles.meta}>{p ? `${p.correct}/${p.total} correct${enough ? ` · ${pct}%` : ' · keep going'} · tap for detail` : 'Untested — tap to start'}</Text>
                  </PressBounce>
                  {open && (
                    <View style={styles.breakdown}>
                      {tested.length === 0 ? (
                        <>
                          <Text style={styles.bdEmpty}>Test this area a few times to see which words you know and which need work.</Text>
                          <PressBounce style={styles.bdBtn} onPress={() => startDomain(d)}><Text style={styles.bdBtnTxt}>Test this area →</Text></PressBounce>
                        </>
                      ) : (
                        <>
                          <Text style={styles.bdHead}>What you know · where to work</Text>
                          {tested.map(({ tp, s }) => (
                            <View key={tp} style={styles.bdRow}>
                              <Text style={styles.bdName} numberOfLines={1}>{cap(tp)}</Text>
                              <Text style={[styles.bdScore, { color: s.score >= 55 ? co.muted : co.accent }]}>{scoreToBand(s.score)} · {s.correct}/{s.total}</Text>
                            </View>
                          ))}
                          {untested > 0 && <Text style={styles.bdUntested}>{untested} more not tested yet</Text>}
                          <PressBounce style={styles.bdBtn} onPress={() => startTopics([tested[0].tp], d)}>
                            <Text style={styles.bdBtnTxt}>Practise {cap(tested[0].tp)} →</Text>
                          </PressBounce>
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  h2: { fontFamily: fonts.serif, fontSize: 30, color: co.text, marginTop: 8, marginBottom: 6 },
  globalCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: co.surface2, borderRadius: 18, padding: 20, marginTop: 16 },
  globalLabel: { fontFamily: fonts.sansSemi, fontSize: 13, color: co.muted },
  globalHint: { fontFamily: fonts.sans, fontSize: 12.5, color: co.faint, marginTop: 4, lineHeight: 17 },
  globalLevel: { fontFamily: fonts.serif, fontSize: 40, color: co.accent, letterSpacing: -0.5 },
  sect: { ...label, color: co.faint, marginTop: 26, marginBottom: 12 },
  row: { backgroundColor: co.surface2, borderRadius: 16, padding: 16, marginBottom: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { fontFamily: fonts.serif, fontSize: 17, color: co.text, flexShrink: 1 },
  level: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: co.text },
  barTrack: { height: 8, borderRadius: 999, backgroundColor: co.bg, marginTop: 12, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 999, backgroundColor: co.accent },
  meta: { fontFamily: fonts.sans, fontSize: 12, color: co.muted, marginTop: 8 },
  empty: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, marginTop: 24 },
  // #87 breakdown panel
  breakdown: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: co.line },
  bdHead: { ...label, color: co.faint, marginBottom: 10 },
  bdRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 5 },
  bdName: { fontFamily: fonts.sans, fontSize: 14, color: co.text, flexShrink: 1 },
  bdScore: { fontFamily: fonts.sansSemi, fontSize: 12.5 },
  bdUntested: { fontFamily: fonts.sans, fontSize: 12, color: co.faint, marginTop: 8 },
  bdEmpty: { fontFamily: fonts.sans, fontSize: 13, color: co.muted, lineHeight: 19 },
  bdBtn: { backgroundColor: co.bg, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  bdBtnTxt: { fontFamily: fonts.sansSemi, fontSize: 14, color: co.accent },
});
