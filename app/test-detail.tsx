import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../lib/app-state';
import { useField } from '../lib/field';
import { loadMyTests, deleteTest, type SavedTest } from '../lib/my-tests';
import { loadHistory, type HistoryEntry } from '../lib/practice-history';
import { domainById } from '../data/domains';
import { getWordsByDomain, isQualityWord } from '../lib/db';
import BackButton from '../components/BackButton';
import PressBounce from '../components/PressBounce';
import { fonts, label, Palette } from '../theme/tokens';

// Detail view for one test — named ("My tests") or an auto-tracked area. Shows the full score
// history and, for area-scoped recipes, how much of the matching pool has been covered so far
// (the rotation the retake logic promises isn't a repeat of the same handful of words). Retake
// and (for named tests) Change settings live here instead of on the compact hub card.
export default function TestDetail() {
  const { kind, id } = useLocalSearchParams<{ kind: 'saved' | 'area'; id: string }>();
  const { field } = useField();
  const { palette: co } = useApp();
  const styles = makeStyles(co);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [test, setTest] = useState<SavedTest | null>(null);
  const [areaEntries, setAreaEntries] = useState<HistoryEntry[]>([]);
  const [coverage, setCoverage] = useState<{ seen: number; total: number } | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      if (kind === 'saved') {
        const t = (await loadMyTests()).find((x) => x.id === id) ?? null;
        setTest(t);
        if (t?.recipe.bSrcs.includes('area') && t.recipe.bTags.length) {
          const pool = (await getWordsByDomain(field, t.recipe.bTags)).filter(isQualityWord);
          setCoverage({ seen: (t.seenIds ?? []).filter((id) => pool.some((w) => w.id === id)).length, total: pool.length });
        } else setCoverage(null);
      } else {
        const h = (await loadHistory()).filter((e) => e.area === id);
        setAreaEntries(h);
        const d = domainById(id);
        if (d) {
          const pool = (await getWordsByDomain(d.field, d.topics)).filter(isQualityWord);
          setCoverage({ seen: 0, total: pool.length }); // area entries don't track per-word ids (no saved recipe to rotate against)
        }
      }
    })();
  }, [kind, id, field]));

  const name = kind === 'saved' ? (test?.name ?? 'Test') : (domainById(id)?.name ?? 'Area');
  const attempts = kind === 'saved' ? (test?.attempts ?? []) : areaEntries.map((e) => ({ ts: e.ts, correct: e.correct, total: e.total }));

  const retake = () => {
    if (kind === 'saved') router.replace({ pathname: '/practice-hub', params: { runTest: id } });
    else router.replace({ pathname: '/practice-hub', params: { runArea: id } });
  };
  const changeSettings = () => router.replace({ pathname: '/practice-hub', params: { editTest: id } });
  const remove = async () => { if (kind === 'saved') { await deleteTest(id); router.back(); } };

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 26, paddingTop: insets.top + 16, paddingBottom: 60 }}>
        <BackButton variant="close" onPress={() => router.back()} co={co} />
        <Text style={[label, { marginTop: 18 }]}>Test</Text>
        <Text style={styles.h2} numberOfLines={2}>{name}</Text>

        {!!coverage && coverage.total > 0 && (
          <View style={styles.coverageCard}>
            <Text style={styles.coverageTxt}>
              {kind === 'saved'
                ? `${coverage.seen} of ${coverage.total} words seen so far - retaking rotates through the rest before repeating.`
                : `${coverage.total} words in this area.`}
            </Text>
          </View>
        )}

        <View style={styles.actionRow}>
          <PressBounce style={styles.primaryBtn} onPress={retake}><Text style={styles.primaryBtnTxt}>Retake</Text></PressBounce>
          {kind === 'saved' && (
            <PressBounce style={styles.secondaryBtn} onPress={changeSettings}><Text style={styles.secondaryBtnTxt}>Change settings</Text></PressBounce>
          )}
        </View>

        <Text style={styles.sect}>Score history</Text>
        {attempts.length === 0 ? (
          <Text style={styles.empty}>No attempts yet.</Text>
        ) : (
          attempts.map((a, i) => (
            <View key={i} style={styles.histRow}>
              <Text style={styles.histWhen}>{new Date(a.ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
              <Text style={styles.histScore}>{a.correct}/{a.total}</Text>
            </View>
          ))
        )}

        {kind === 'saved' && (
          <PressBounce onPress={remove} style={{ marginTop: 30 }}>
            <Text style={styles.deleteTxt}>Delete this test</Text>
          </PressBounce>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  h2: { fontFamily: fonts.serif, fontSize: 28, color: co.text, marginTop: 6, marginBottom: 16 },
  coverageCard: { backgroundColor: co.surface2, borderRadius: 16, padding: 16, marginBottom: 20 },
  coverageTxt: { fontFamily: fonts.sans, fontSize: 13.5, color: co.muted, lineHeight: 19 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  primaryBtn: { flex: 1, backgroundColor: co.accent, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  primaryBtnTxt: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.ink },
  secondaryBtn: { flex: 1, backgroundColor: co.surface2, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  secondaryBtnTxt: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.text },
  sect: { ...label, color: co.faint, marginBottom: 14 },
  empty: { fontFamily: fonts.sans, fontSize: 14, color: co.muted },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: co.line },
  histWhen: { fontFamily: fonts.sans, fontSize: 14, color: co.text },
  histScore: { fontFamily: fonts.sansSemi, fontSize: 14, color: co.muted },
  deleteTxt: { fontFamily: fonts.sans, fontSize: 14, color: co.bad },
});
