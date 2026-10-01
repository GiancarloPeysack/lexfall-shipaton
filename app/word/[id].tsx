import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { speakWord } from '../../lib/speak';
import Svg, { Path } from 'react-native-svg';
import { getWordById, getWordCollection, setWordCollection, unsaveWord, isLiked, toggleLiked, getWordsByTopic } from '../../lib/db';
import { displayLevelFor } from '../../data/word-levels';
import { isStarterWord } from '../../lib/entitlement';
import { t } from '../../lib/i18n';
import { FieldId, Word } from '../../data/types';
import { fonts, label, Palette } from '../../theme/tokens';
import { useApp } from '../../lib/app-state';
import BackButton from '../../components/BackButton';
import PressBounce from '../../components/PressBounce';

export default function WordDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isPro, palette: co } = useApp();
  const styles = makeStyles(co);
  const [w, setW] = useState<Word | null>(null);
  const [savedCol, setSavedCol] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [related, setRelated] = useState<Word[]>([]);

  useEffect(() => { if (id) { getWordById(id).then(setW); isLiked(id).then(setLiked); } }, [id]);
  // "Related in {topic}" - anchors the lower half of the screen for words
  // without synonyms/etymology, and gives the reader somewhere to go next.
  useEffect(() => {
    if (!w) return;
    let alive = true;
    getWordsByTopic(w.field as FieldId, w.topic).then((list) => {
      if (alive) setRelated(list.filter((x) => x.id !== w.id).slice(0, 4));
    });
    return () => { alive = false; };
  }, [w?.id]);
  useFocusEffect(useCallback(() => {
    let alive = true;
    if (id) getWordCollection(id).then((c) => { if (alive) setSavedCol(c); });
    return () => { alive = false; };
  }, [id]));

  if (!w) {
    return (
      <View style={{ flex: 1, backgroundColor: co.bg }}>
        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <BackButton onPress={() => router.back()} co={co} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 80 }}>
          <Text style={styles.nfTitle}>Word not found</Text>
          <Text style={styles.nfSub}>It may have been removed.</Text>
          <PressBounce onPress={() => router.back()} hitSlop={10} style={{ marginTop: 22 }}>
            <Text style={styles.nfBtn}>{t('common.goBack')}</Text>
          </PressBounce>
        </View>
      </View>
    );
  }

  // Free taste: a non-subscriber can read the fixed starter words in full;
  // every other word is a locked preview (headword only) that routes to the
  // paywall. This gates deep links, Explore taps, search and related-word taps -
  // the feed enforces the same limit on its side.
  if (!isPro && !isStarterWord(w.id)) {
    return (
      <View style={{ flex: 1, backgroundColor: co.bg }}>
        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <BackButton onPress={() => router.back()} co={co} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          <Text style={[label, { color: co.accent }]}>{w.topic}</Text>
          <Text style={styles.word} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>{w.word}</Text>
          <View style={styles.pronRow}>
            {!!w.ipa && <Text style={styles.ipa}>/{w.ipa}/</Text>}
            <Text style={styles.pos}>({w.pos})</Text>
            {/* Honest per-word level: the fine graded A1-C2 level when we have it, NOT the corpus's
                coarse C1/C2-only `cefr` field - that field labelled every graded-B1/B2 word
                (logistics, rebalance, redemption...) as C1/C2 on this screen (owner bug, 2026-09-30). */}
            <Text style={styles.cefr}>{displayLevelFor(w)}</Text>
          </View>
          <View style={styles.lockPanel}>
            <View style={styles.lockIcon}>
              <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M6 10V8a6 6 0 0 1 12 0v2m-13 0h14v10H5V10Z" stroke={co.accent} strokeWidth={1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
            </View>
            <Text style={styles.lockTitle}>A premium word</Text>
            <Text style={styles.lockSub}>{t('word.lockSub')}</Text>
            <PressBounce style={[styles.ctaGold, { marginTop: 24, alignSelf: 'stretch' }]} onPress={() => router.push('/paywall')}>
              <Text style={styles.ctaGoldText}>{t('word.unlockCta')}</Text>
            </PressBounce>
          </View>
        </ScrollView>
      </View>
    );
  }

  const say = () => { Haptics.selectionAsync(); speakWord(w.word, undefined, w.id); };
  const onSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (savedCol) { await unsaveWord(w.id); setSavedCol(null); }
    else { await setWordCollection(w.id, 'Want to learn'); setSavedCol('Want to learn'); }
  };
  const openCollections = () => router.push({ pathname: '/collections', params: { word: w.id } });
  const onLike = async () => { Haptics.selectionAsync(); setLiked(await toggleLiked(w.id)); };
  // Open the SAME share-card flow as the feed (was a bare OS text share here, so sharing a word
  // opened from Review/Collections looked nothing like sharing from the feed).
  const onShare = () => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/share/[id]', params: { id: w.id } }); };

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={() => router.back()} co={co} />
        <View style={{ flexDirection: 'row', gap: 20 }}>
          <PressBounce onPress={onLike} hitSlop={12} accessibilityLabel="Like">
            <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M12 20s-7-4.35-9.33-8.11C1 9.05 2.36 5.5 5.9 5.06c2-.25 3.62.86 4.6 2.14h1c.98-1.28 2.6-2.39 4.6-2.14 3.54.44 4.9 3.99 3.23 6.83C17 15.65 12 20 12 20Z" stroke={liked ? co.accent : co.muted} fill={liked ? co.accent : 'none'} strokeWidth={1.5} /></Svg>
          </PressBounce>
          <PressBounce onPress={onShare} hitSlop={12} accessibilityLabel="Share">
            <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M12 15V4M8 8l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" stroke={co.muted} strokeWidth={1.5} fill="none" /></Svg>
          </PressBounce>
          <PressBounce onPress={onSave} onLongPress={openCollections} delayLongPress={280} hitSlop={12} accessibilityLabel="Save">
            <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M6 4h12v16l-6-4-6 4V4Z" stroke={savedCol ? co.accent : co.muted} fill={savedCol ? co.accent : 'none'} strokeWidth={1.5} /></Svg>
          </PressBounce>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Text style={[label, { color: co.accent }]}>{w.topic}</Text>
        <Text style={styles.word} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>{w.word}</Text>

        <View style={styles.pronRow}>
          {!!w.ipa && <Text style={styles.ipa}>/{w.ipa}/</Text>}
          <Text style={styles.pos}>({w.pos})</Text>
          <PressBounce onPress={say} style={styles.say} hitSlop={10} accessibilityLabel={`Pronounce ${w.word}`}>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="M11 5 6 9H3v6h3l5 4V5Z" stroke={co.text} strokeWidth={1.5} fill="none" />
              <Path d="M15.5 8.5a4.5 4.5 0 0 1 0 7" stroke={co.text} strokeWidth={1.5} fill="none" />
            </Svg>
          </PressBounce>
          {/* Same honest graded level as the locked preview above (never the coarse C1/C2 tag). */}
          <Text style={styles.cefr}>{displayLevelFor(w)}</Text>
        </View>

        {savedCol && (
          <PressBounce onPress={openCollections} style={styles.savedRow} hitSlop={6}>
            <Svg width={14} height={14} viewBox="0 0 24 24"><Path d="M6 4h12v16l-6-4-6 4V4Z" fill={co.accent} stroke={co.accent} strokeWidth={1.5} /></Svg>
            <Text style={styles.savedText}>Saved to <Text style={{ color: co.text }}>{savedCol}</Text></Text>
            <Text style={styles.savedChange}>{t('common.change')}</Text>
          </PressBounce>
        )}

        <Text style={styles.def}>{w.def}</Text>

        {!!w.ex && <Text style={styles.sect}>{t('today.inContext')}</Text>}
        {!!w.ex && <Text style={styles.ex}>“{w.ex}”</Text>}

        {w.syn && w.syn.length > 0 && (
          <Text style={styles.also}>also: {w.syn.join(', ')}</Text>
        )}

        {w.etymology && (
          <>
            <Text style={styles.sect}>{t('word.origin')}</Text>
            <Text style={styles.ety}>{w.etymology}</Text>
          </>
        )}

        {!savedCol && (
          <PressBounce style={styles.cta} onPress={onSave}>
            <Text style={styles.ctaText}>Save to Want to learn</Text>
          </PressBounce>
        )}

        {related.length > 0 && (
          <>
            <Text style={styles.sect}>Related in {w.topic}</Text>
            {related.map((r) => (
              <PressBounce key={r.id} style={styles.relRow} onPress={() => router.push(`/word/${r.id}`)} hitSlop={4}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.relWord}>{r.word}</Text>
                  <Text style={styles.relDef} numberOfLines={1}>{r.def}</Text>
                </View>
                <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="m9 6 6 6-6 6" stroke={co.faint} strokeWidth={1.5} fill="none" /></Svg>
              </PressBounce>
            ))}
          </>
        )}

        {w.field === 'med' && (
          <Text style={styles.medNote}>
            For English-language learning only, not clinical guidance. Always follow current
            local protocols and your professional judgement.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 8 },
  word: { fontFamily: fonts.serif, fontSize: 46, color: co.text, marginTop: 14, letterSpacing: -0.5 },
  pronRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 14 },
  ipa: { fontFamily: fonts.serifItalic, fontSize: 16, color: co.muted },
  say: { width: 36, height: 36, borderRadius: 18, backgroundColor: co.glass2, alignItems: 'center', justifyContent: 'center' },
  cefr: { ...label, color: co.faint, marginLeft: 'auto' },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  savedText: { fontFamily: fonts.sans, fontSize: 15, color: co.muted },
  savedChange: { fontFamily: fonts.sansMedium, fontSize: 15, color: co.accent, marginLeft: 6 },
  pos: { fontFamily: fonts.serifItalic, fontSize: 16, color: co.muted },
  def: { fontFamily: fonts.sans, fontSize: 21, color: co.text, lineHeight: 30, marginTop: 8 },
  sect: { ...label, color: co.faint, marginTop: 30, marginBottom: 10 },
  ex: { fontFamily: fonts.serifItalic, fontSize: 20, color: co.exText, lineHeight: 30, paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: co.accent },
  also: { fontFamily: fonts.serifItalic, fontSize: 17, color: co.muted, lineHeight: 26, marginTop: 26 },
  ety: { fontFamily: fonts.serifItalic, fontSize: 17, color: co.muted, lineHeight: 26 },
  medNote: { fontFamily: fonts.sans, fontSize: 11.5, color: co.faint, lineHeight: 17, marginTop: 34, textAlign: 'center' },
  nfTitle: { fontFamily: fonts.serif, fontSize: 28, color: co.text, textAlign: 'center' },
  nfSub: { fontFamily: fonts.sans, fontSize: 15, color: co.muted, textAlign: 'center', marginTop: 8 },
  nfBtn: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.accent },
  // Save is secondary to reading (the header bookmark is the quick save), so it's
  // a quiet filled button. Solid gold (ctaGold) is reserved for true primary
  // moments like the Unlock paywall CTA.
  cta: { marginTop: 40, backgroundColor: co.surface2, borderRadius: 16, paddingVertical: 17, alignItems: 'center' },
  ctaText: { fontFamily: fonts.sansSemi, fontSize: 17, color: co.accent },
  ctaGold: { marginTop: 40, backgroundColor: co.accent, borderRadius: 16, paddingVertical: 17, alignItems: 'center' },
  ctaGoldText: { fontFamily: fonts.sansSemi, fontSize: 17, color: co.ink },
  lockPanel: { marginTop: 40, backgroundColor: co.surface2, borderRadius: 20, padding: 26, alignItems: 'center' },
  lockIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: co.glass2, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  lockTitle: { fontFamily: fonts.serif, fontSize: 24, color: co.text, textAlign: 'center' },
  lockSub: { fontFamily: fonts.sans, fontSize: 15, color: co.muted, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  relRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: co.line2 },
  relWord: { fontFamily: fonts.serif, fontSize: 20, color: co.text },
  relDef: { fontFamily: fonts.sans, fontSize: 14.5, color: co.muted, marginTop: 2 },
});
