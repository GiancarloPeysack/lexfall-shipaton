import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { useApp } from '../lib/app-state';
import { TAXONOMY, Track, Vertical } from '../data/taxonomy';
import { FieldId } from '../data/types';
import { fonts, label, Palette } from '../theme/tokens';
import BackButton from '../components/BackButton';
import PressBounce from '../components/PressBounce';

const KEY = 'vorto.topics'; // the follow-set the feed filters on (a Set of topic strings)

// Following works at the TRACK level for everyone (free); fine-tuning WHICH topics
// inside a track (the "deep edit") is Pro — that's the subscribe lever.
export default function Personalize() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isPro, palette: co, field, setField } = useApp();
  const styles = makeStyles(co);
  const [follows, setFollows] = useState<Set<string>>(new Set());
  const [openV, setOpenV] = useState<Set<FieldId>>(() => new Set([field])); // land on your current focus
  const [openT, setOpenT] = useState<Set<string>>(new Set());

  // A vertical here IS a field (v.id === FieldId). This screen sets BOTH the coarse field the feed
  // draws from AND the fine topic follows. Tapping a header is now NON-DESTRUCTIVE: it just
  // opens/expands the field so you can browse its tracks. Changing your focus is an EXPLICIT action
  // — the small focus toggle in each field's header (setFocus below). This stops an exploratory
  // tap (just looking at Law while on Business) from nuking your whole focus.
  const onVHeader = (id: FieldId) => {
    Haptics.selectionAsync();
    toggleV(id);
  };
  const setFocus = (id: FieldId) => {
    Haptics.selectionAsync();
    setField(id);
    setOpenV((s) => new Set(s).add(id)); // keep it open after it becomes the focus
    // Focusing a field auto-follows ALL of its topics so its bubbles light up immediately —
    // otherwise a fresh focus shows a wall of unselected circles. Additive on purpose:
    // topics the user already follows in other fields are kept.
    const v = TAXONOMY.find((x) => x.id === id);
    if (v) persist(new Set([...follows, ...v.tracks.flatMap((t) => t.topics)]));
  };

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v) setFollows(new Set(JSON.parse(v))); });
  }, []));

  const persist = (next: Set<string>) => { setFollows(new Set(next)); AsyncStorage.setItem(KEY, JSON.stringify([...next])).catch(() => {}); };
  const toggleV = (id: FieldId) => setOpenV((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleT = (id: string) => setOpenT((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // A track is 'all' / 'some' / 'none' followed by how many of its topics are in the set.
  const trackState = (t: Track): 'all' | 'some' | 'none' => {
    const on = t.topics.filter((x) => follows.has(x)).length;
    return on === 0 ? 'none' : on === t.topics.length ? 'all' : 'some';
  };
  const followTrack = (t: Track, on: boolean) => {
    Haptics.selectionAsync();
    const n = new Set(follows);
    t.topics.forEach((x) => (on ? n.add(x) : n.delete(x)));
    persist(n);
  };
  const followTopic = (topic: string, on: boolean) => {
    Haptics.selectionAsync();
    const n = new Set(follows);
    on ? n.add(topic) : n.delete(topic);
    persist(n);
  };

  const total = follows.size;

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackButton variant="close" onPress={() => router.back()} co={co} />
          <Text style={styles.count}>{total ? `${total} followed` : ''}</Text>
        </View>
        <Text style={[label, { marginTop: 14 }]}>Personalize your feed</Text>
        <Text style={styles.h1}>What do you{'\n'}want to master?</Text>
        <Text style={styles.sub}>Choose the field you want to focus on, then follow the tracks that matter. Your feed and tests centre on them. Fine-tune the exact topics with Lexfall.</Text>

        {TAXONOMY.map((v: Vertical) => {
          const open = openV.has(v.id);
          const active = v.id === field;
          const vFollowed = v.tracks.reduce((n, t) => n + t.topics.filter((x) => follows.has(x)).length, 0);
          return (
            <View key={v.id} style={styles.vWrap}>
              <PressBounce style={[styles.vHeader, active && styles.vHeaderOn]} onPress={() => onVHeader(v.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.vName, active && { color: co.accent }]}>{v.name}</Text>
                  <Text style={styles.vTag}>{v.tagline}</Text>
                </View>
                {vFollowed > 0 && <View style={styles.vBadge}><Text style={styles.vBadgeText}>{vFollowed}</Text></View>}
                {/* Focus toggle: its own PressBounce (a nested Pressable captures the touch, so
                    tapping it never expands/collapses the header). ON = this field is your focus;
                    tapping the ON one is a no-op (you can't have zero focus). */}
                <PressBounce
                  hitSlop={10}
                  accessibilityRole="switch"
                  accessibilityLabel={`Focus on ${v.name}`}
                  accessibilityState={{ checked: active }}
                  onPress={() => { if (!active) setFocus(v.id); }}
                  style={[styles.focusTrack, active && styles.focusTrackOn]}
                >
                  <View style={[styles.focusThumb, active && styles.focusThumbOn]}>
                    {active && (
                      <Svg width={12} height={12} viewBox="0 0 24 24">
                        <Path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18.3 6.2 21.4l1.1-6.5L2.6 9.8l6.5-.9z" fill={co.accent} />
                      </Svg>
                    )}
                  </View>
                </PressBounce>
                <Text style={styles.chev}>{open ? '▾' : '▸'}</Text>
              </PressBounce>

              {open && v.tracks.map((t) => {
                const st = trackState(t);
                const tOpen = openT.has(t.id);
                return (
                  <View key={t.id} style={styles.tWrap}>
                    <View style={styles.tRow}>
                      <PressBounce style={{ flex: 1 }} onPress={() => followTrack(t, st !== 'all')}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <View style={[styles.check, st === 'all' && styles.checkOn, st === 'some' && styles.checkSome]}>
                            {st !== 'none' && <Svg width={14} height={14} viewBox="0 0 24 24"><Path d={st === 'all' ? 'm5 13 4 4L19 7' : 'M6 12h12'} stroke={co.ink} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.tName}>{t.name}</Text>
                            {!!t.exam && <Text style={styles.tExam}>{t.exam} · {t.topics.length} topics</Text>}
                          </View>
                        </View>
                      </PressBounce>
                      {/* Fine-tune (deep edit) = Pro */}
                      <PressBounce hitSlop={8} onPress={() => (isPro ? toggleT(t.id) : router.push('/paywall'))} style={styles.fineBtn}>
                        {isPro
                          ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={styles.fineText}>{tOpen ? 'Done' : 'Fine-tune'}</Text>
                              {!tOpen && <Svg width={12} height={12} viewBox="0 0 24 24"><Path d="M6 9l6 6 6-6" stroke={co.muted} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>}
                            </View>
                          : <View style={styles.lockRow}><Lock co={co} /><Text style={styles.fineText}>Fine-tune</Text></View>}
                      </PressBounce>
                    </View>

                    {isPro && tOpen && (
                      <View style={styles.topics}>
                        {t.topics.map((topic) => {
                          const on = follows.has(topic);
                          return (
                            <PressBounce key={topic} onPress={() => followTopic(topic, !on)} style={[styles.topicChip, on && styles.topicChipOn]}>
                              <Text style={[styles.topicChipText, on && { color: co.ink }]}>{topic}</Text>
                            </PressBounce>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        {!isPro && (
          <PressBounce style={styles.upsell} onPress={() => router.push('/paywall')}>
            <Text style={styles.upsellTitle}>Deep-edit your feed</Text>
            <Text style={styles.upsellSub}>Go beyond tracks: pick the exact topics and sub-niches shown, across every field. Unlock full personalization with Lexfall.</Text>
            <View style={styles.upsellCta}><Text style={styles.upsellCtaText}>Unlock full personalization</Text></View>
          </PressBounce>
        )}
      </ScrollView>
    </View>
  );
}

function Lock({ co }: { co: Palette }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M6 10V8a6 6 0 0 1 12 0v2M5 10h14v10H5z" stroke={co.faint} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  count: { fontFamily: fonts.sansMedium, fontSize: 13, color: co.accent },
  h1: { fontFamily: fonts.serif, fontSize: 32, color: co.text, marginTop: 8, lineHeight: 38 },
  sub: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, lineHeight: 20, marginTop: 10, marginBottom: 8 },
  vWrap: { marginTop: 14 },
  vHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: co.surface2, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16 },
  vHeaderOn: { backgroundColor: co.surface }, // current focus reads a touch lighter than the rest
  vName: { fontFamily: fonts.serif, fontSize: 20, color: co.text },
  vTag: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, marginTop: 3 },
  // Switch-style focus toggle (fills only, no border). Header fills are surface/surface2,
  // so the OFF track uses co.bg for a quiet-but-visible resting state in both themes.
  focusTrack: { width: 44, height: 26, borderRadius: 13, backgroundColor: co.bg, padding: 3, justifyContent: 'center', alignItems: 'flex-start' },
  focusTrackOn: { backgroundColor: co.accent, alignItems: 'flex-end' },
  focusThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: co.faint, alignItems: 'center', justifyContent: 'center' },
  focusThumbOn: { backgroundColor: co.ink },
  vBadge: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: co.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  vBadgeText: { fontFamily: fonts.sansSemi, fontSize: 12, color: co.ink },
  chev: { fontFamily: fonts.sans, fontSize: 15, color: co.faint },
  tWrap: { marginTop: 6, marginLeft: 6 },
  tRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: co.surface, borderRadius: 12, paddingLeft: 14, paddingRight: 8, paddingVertical: 12 },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: co.surface2, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: co.accent },
  checkSome: { backgroundColor: co.accent, opacity: 0.6 },
  tName: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.text },
  tExam: { fontFamily: fonts.sans, fontSize: 11.5, color: co.faint, marginTop: 2 },
  fineBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  fineText: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: co.accent },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8, marginLeft: 6 },
  topicChip: { backgroundColor: co.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  topicChipOn: { backgroundColor: co.accent },
  topicChipText: { fontFamily: fonts.sansMedium, fontSize: 13, color: co.text },
  upsell: { marginTop: 24, backgroundColor: co.surface2, borderRadius: 18, padding: 20 },
  upsellTitle: { fontFamily: fonts.serif, fontSize: 21, color: co.text },
  upsellSub: { fontFamily: fonts.sans, fontSize: 13.5, color: co.muted, lineHeight: 20, marginTop: 6 },
  upsellCta: { backgroundColor: co.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  upsellCtaText: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.ink },
});
