import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions, Animated, Easing, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path, Line, Text as SvgText } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedText = Animated.createAnimatedComponent(SvgText);
import { useApp } from '../../lib/app-state';
import { getTodayLearned, getWordsLearnedTotal, getSavedCount, getPracticeCount, getSkillBreakdown, scoreToLevel, scoreToBand, isCefrField, getDomainProficiency, type SkillRow, type DomainProficiency } from '../../lib/db';
import { getAccuracy, getLevel } from '../../lib/metrics';
import { getAppOpenStreak } from '../../lib/streak';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '../../lib/i18n';
import { fonts, label, Palette } from '../../theme/tokens';
import BackButton from '../../components/BackButton';
import PressBounce from '../../components/PressBounce';
import Counter from '../../components/Counter';
import Journey from '../../components/Journey';

const R = 62, C = 2 * Math.PI * R;
const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const iso = (d: Date) => d.toISOString().slice(0, 10);

// ISO keys for Mon..Sun of the current week
function weekDays(): string[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return iso(d); });
}

// Map a self-contained proficiency score (0–100) from accuracy, or level as fallback.
function proficiency(accuracy: number | null, level: string): number {
  if (accuracy != null) return accuracy;
  return level === 'C2' ? 85 : level === 'C1' ? 65 : level === 'B2' ? 45 : 30;
}

// XP tiers — surface the XP already awarded per correct quiz answer (Game.tsx: lexfall.xp) as a
// visible game-like progression. Thresholds ramp so each tier feels earned.
const TIERS = [
  { name: 'Novice', at: 0 },
  { name: 'Learner', at: 300 },
  { name: 'Adept', at: 900 },
  { name: 'Eloquent', at: 2200 }, // "Fluent" reads oddly for an advanced-vocab app (users are already fluent)
  { name: 'Erudite', at: 5000 },
  { name: 'Virtuoso', at: 12000 },
];
function tierFor(xp: number) {
  let i = 0;
  for (let k = 0; k < TIERS.length; k++) if (xp >= TIERS[k].at) i = k;
  const cur = TIERS[i];
  const next = TIERS[i + 1] ?? null;
  const progress = next ? (xp - cur.at) / (next.at - cur.at) : 1;
  return { cur, next, progress: Math.max(0, Math.min(1, progress)) };
}

// Is a given date part of the current daily-test streak? Mirrors weekProgress in lib/daily-test.ts
// (a day is "on" if it falls within `count` days ending at lastCompletedDate).
function isStreakDay(streak: { count: number; lastCompletedDate: string | null }, dateKey: string): boolean {
  if (!streak.lastCompletedDate) return false;
  const diff = Math.round((Date.parse(`${streak.lastCompletedDate}T00:00:00`) - Date.parse(`${dateKey}T00:00:00`)) / 86400000);
  return diff >= 0 && diff < streak.count;
}

// Milestone achievements, computed from stats the app already tracks. Earned ones light up gold.
type Badge = { key: string; name: string; earned: boolean; hint: string };
function badgesFor(v: { streak: number; total: number; accuracy: number | null; level: string; saved: number; practised: number; flawless: number }): Badge[] {
  return [
    { key: 'streak7', name: 'On a roll', earned: v.streak >= 7, hint: '7-day streak' },
    { key: 'streak30', name: 'Unstoppable', earned: v.streak >= 30, hint: '30-day streak' },
    { key: 'flawless', name: 'Flawless', earned: v.flawless >= 1, hint: 'A perfect daily test' },
    { key: 'flawless10', name: 'Immaculate', earned: v.flawless >= 10, hint: '10 perfect daily tests' },
    { key: 'w100', name: 'Century', earned: v.total >= 100, hint: '100 words learned' },
    { key: 'w500', name: 'Lexicon', earned: v.total >= 500, hint: '500 words learned' },
    { key: 'acc80', name: 'Sharp', earned: (v.accuracy ?? 0) >= 80, hint: '80%+ accuracy' },
    { key: 'w1000', name: 'Scholar', earned: v.total >= 1000, hint: '1,000 words learned' },
    { key: 'saved25', name: 'Collector', earned: v.saved >= 25, hint: '25 saved' },
    { key: 'prac100', name: 'Grinder', earned: v.practised >= 100, hint: '100 practised' },
  ];
}

function ProficiencyCurve({ score, width, co }: { score: number; width: number; co: Palette }) {
  const W = Math.max(240, width), H = 96;
  const sigma = 20;
  const g = (s: number) => Math.exp(-((s - 50) ** 2) / (2 * sigma * sigma));
  const yOf = (s: number) => (H - 18) - (H - 34) * g(s);
  let d = '';
  for (let px = 0; px <= W; px += 4) { const s = (px / W) * 100; d += (px === 0 ? 'M' : ' L') + ` ${px.toFixed(1)} ${yOf(s).toFixed(1)}`; }
  const clamped = Math.max(3, Math.min(97, score));
  const sx = (clamped / 100) * W, sy = yOf(clamped);
  const tick = (s: string, band: number) => <SvgText x={(band / 100) * W} y={H - 4} fontSize={9} fill={co.faint} textAnchor="middle" fontFamily={fonts.sans}>{s}</SvgText>;

  // "Pencil-drafting" draw-on: the curve sketches itself, then the You marker inks in.
  const draw = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    draw.setValue(0);
    Animated.timing(draw, { toValue: 1, duration: 1150, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
  }, [W, score]);
  const LEN = W * 1.7;
  const dashOffset = draw.interpolate({ inputRange: [0, 1], outputRange: [LEN, 0] });
  const markerOpacity = draw.interpolate({ inputRange: [0, 0.72, 1], outputRange: [0, 0, 1] });

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Line x1={0} y1={H - 18} x2={W} y2={H - 18} stroke={co.line} strokeWidth={1} />
      <AnimatedPath d={d} stroke={co.line2} strokeWidth={1.4} fill="none" strokeDasharray={LEN} strokeDashoffset={dashOffset} />
      <AnimatedCircle cx={sx} cy={sy} r={3.5} fill={co.accent} opacity={markerOpacity} />
      <AnimatedPath d={`M ${sx} ${sy} L ${sx} ${H - 18}`} stroke={co.accent} strokeWidth={1.4} opacity={markerOpacity} />
      <AnimatedText x={sx} y={sy - 8} fontSize={9} fill={co.accent} textAnchor="middle" fontFamily={fonts.sansMedium} opacity={markerOpacity}>You</AnimatedText>
      {tick('B2', 45)}{tick('C1', 65)}{tick('C2', 85)}
    </Svg>
  );
}

export default function Stats() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { goal, isPro, palette: co } = useApp();
  const styles = makeStyles(co);
  const router = useRouter();
  const [streak, setStreak] = useState(0); // app-open streak (consecutive days the app was opened)
  const [openDays, setOpenDays] = useState<string[]>([]); // real opened-days set → truthful week strip
  const [today, setToday] = useState(0);
  const [total, setTotal] = useState(0);
  const [level, setLevel] = useState('-');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [saved, setSaved] = useState(0);
  const [practised, setPractised] = useState(0);
  const [flawless, setFlawless] = useState(0);
  const [newBadge, setNewBadge] = useState<Badge | null>(null); // in-app "achievement unlocked" toast
  const [fieldSkills, setFieldSkills] = useState<SkillRow[]>([]);
  const [topicSkills, setTopicSkills] = useState<SkillRow[]>([]);
  const [domainProf, setDomainProf] = useState<DomainProficiency[]>([]);

  useFocusEffect(useCallback(() => {
    getAppOpenStreak().then((s) => { setStreak(s.count); setOpenDays(s.days); }); // the ONE user-facing streak = app opens
    getTodayLearned().then(setToday);
    getWordsLearnedTotal().then(setTotal);
    AsyncStorage.getItem('lexfall.flawlessDays').then((v) => setFlawless(parseInt(v || '0', 10)));
    getLevel().then(setLevel);
    getAccuracy().then(setAccuracy);
    getSavedCount().then(setSaved);
    getPracticeCount().then(setPractised);
    getSkillBreakdown('field').then(setFieldSkills);
    getSkillBreakdown('topic').then(setTopicSkills);
    getDomainProficiency().then(setDomainProf);
  }, []));

  const todayCount = Math.min(today, goal);
  const offset = C * (1 - todayCount / goal);
  // Draw the streak ring's arc on each focus.
  const ring = useRef(new Animated.Value(C)).current;
  useEffect(() => {
    Animated.timing(ring, { toValue: offset, duration: 950, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [offset]);
  // Streak flame flicker - a soft, continuous idle animation (illustration feel).
  const flick = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(flick, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(flick, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const flameScale = flick.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const flameOpacity = flick.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const week = weekDays();
  const openSet = new Set(openDays); // truthful "opened that day" marks for the week strip
  const todayKey = iso(new Date());
  const score = proficiency(accuracy, level);
  // XP is derived from REAL cumulative practice (each question answered = 10 XP). The old
  // `lexfall.xp` key was never written, so tiers were stuck at Novice for real users (the big
  // numbers only appeared from fabricated test data). Deriving from `practised` makes tiers both
  // functional AND paced — you climb by practising over time, not instantly.
  const xp = practised * 10;
  const tier = tierFor(xp);
  const badges = badgesFor({ streak, total, accuracy, level, saved, practised, flawless });

  // In-app "achievement unlocked" pop-up: the FIRST time a newly-earned badge appears, celebrate it.
  // The very first visit just baselines what's already earned (no false toast for pre-existing ones).
  const earnedKeys = badges.filter((b) => b.earned).map((b) => b.key).join(',');
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem('lexfall.seenBadges').then((v) => {
      if (!alive) return;
      const earned = badges.filter((b) => b.earned);
      if (v == null) { AsyncStorage.setItem('lexfall.seenBadges', JSON.stringify(earned.map((b) => b.key))).catch(() => {}); return; }
      const seen = new Set<string>(JSON.parse(v));
      const fresh = earned.filter((b) => !seen.has(b.key));
      if (fresh.length) {
        setNewBadge(fresh[0]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        AsyncStorage.setItem('lexfall.seenBadges', JSON.stringify([...seen, ...fresh.map((b) => b.key)])).catch(() => {});
      }
    });
    return () => { alive = false; };
  }, [earnedKeys]);
  useEffect(() => {
    if (!newBadge) return;
    const t = setTimeout(() => setNewBadge(null), 3800);
    return () => clearTimeout(t);
  }, [newBadge]);

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
    {newBadge && (
      <View style={[styles.badgeToast, { top: insets.top + 10 }]} pointerEvents="none">
        <Text style={styles.badgeToastEyebrow}>Achievement unlocked</Text>
        <Text style={styles.badgeToastName}>{newBadge.name}</Text>
        <Text style={styles.badgeToastHint}>{newBadge.hint}</Text>
      </View>
    )}
    <ScrollView style={{ flex: 1, backgroundColor: co.bg }} contentContainerStyle={{ paddingHorizontal: 26, paddingTop: insets.top + 16, paddingBottom: 200 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <PressBounce onPress={() => router.push('/share-stats')} hitSlop={8} style={styles.shareBtn} accessibilityLabel="Share your progress">
          <Svg width={19} height={19} viewBox="0 0 24 24"><Path d="M12 15V4M8 8l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" stroke={co.text} strokeWidth={1.7} fill="none" /></Svg>
        </PressBounce>
      </View>
      {/* The advancement counter the owner liked — taps into the full /journey path. */}
      <Journey co={co} />
      {streak > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 }}>
          <Animated.View style={{ transform: [{ scale: flameScale }], opacity: flameOpacity }}>
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path d="M12 2c2 3 5 5 5 9a5 5 0 0 1-10 0c0-1.5.6-2.6 1.4-3.6C9 9 10 8 10 6c1.2.8 2 2 2 3 0-2-.4-4 0-7Z" fill={co.accent} opacity={0.9} />
              <Path d="M12 13c1 1.2 2 2.3 2 3.6a2 2 0 0 1-4 0c0-1 .6-1.8 1-2.4.3.4.6.8 1 1.2 0-.9-.2-1.6 0-2.4Z" fill={co.bg} opacity={0.5} />
            </Svg>
          </Animated.View>
          <Text style={[label, { color: co.accent }]}>{`Day ${streak}`}</Text>
        </View>
      ) : (
        <Text style={[label, { marginTop: 18 }]}>Get started</Text>
      )}
      <Text style={styles.h2}>Your progress</Text>

      <View style={{ alignItems: 'center', marginTop: 18 }}>
        <Svg width={148} height={148} viewBox="0 0 148 148">
          <Circle cx={74} cy={74} r={R} stroke={co.surface2} strokeWidth={6} fill="none" />
          <AnimatedCircle cx={74} cy={74} r={R} stroke={co.accent} strokeWidth={6} fill="none"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={ring} transform="rotate(-90 74 74)" />
          <SvgText x={74} y={82} textAnchor="middle" fontSize={36} fill={co.text} fontFamily={fonts.serif}>{todayCount}</SvgText>
        </Svg>
        <Text style={[label, { color: co.faint, marginTop: 4 }]}>of {goal} today</Text>
      </View>

      <Text style={[label, { color: co.faint, marginTop: 22 }]}>{t('stats.thisWeek')}</Text>
      <View style={styles.week}>
        {week.map((key, i) => {
          const on = openSet.has(key);
          const isToday = key === todayKey;
          return (
            <View key={key} style={{ alignItems: 'center', width: 34 }}>
              <View style={[styles.dot, on && styles.dotOn, isToday && !on && styles.dotToday]}>
                {on && (
                  <Svg width={14} height={14} viewBox="0 0 24 24">
                    <Path d="m5 13 4 4L19 7" stroke={co.ink} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                )}
              </View>
              <Text style={styles.dayLabel}>{dayLabels[i]}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.grid}>
        {([
          { v: streak, l: 'Day streak' },
          { v: total, l: 'Words viewed' },
          { s: level, l: 'Level' },
          { s: accuracy == null ? '-' : `${accuracy}%`, l: 'Quiz accuracy' },
          { v: saved, l: 'Saved' },
          { v: practised, l: 'Practised' },
        ] as { v?: number; s?: string; l: string }[]).map((it, i) => (
          <View key={i} style={[styles.stat, i % 2 === 0 ? styles.statL : styles.statR]}>
            {it.v != null
              ? <Counter value={it.v} style={styles.n} />
              : <Text style={styles.n}>{it.s}</Text>}
            <Text style={styles.l}>{it.l}</Text>
          </View>
        ))}
      </View>

      {/* XP tier — a game-like progression bar (shown to everyone, to drive engagement). XP is the
          points already awarded per correct quiz answer (Game.tsx: lexfall.xp). */}
      <View style={styles.tierCard}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={styles.tierName}>{tier.cur.name}</Text>
          <Text style={styles.tierXp}>{xp.toLocaleString()} XP</Text>
        </View>
        <View style={styles.tierBar}>
          <View style={[styles.tierFill, { width: `${Math.round(tier.progress * 100)}%` }]} />
        </View>
        <Text style={styles.tierNext}>
          {tier.next ? `${(tier.next.at - xp).toLocaleString()} XP to ${tier.next.name}` : 'Top tier reached'}
        </Text>
      </View>

      {/* Achievements — milestone badges, earned ones light gold. */}
      <Text style={[label, { color: co.faint, marginTop: 24 }]}>Achievements</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -26 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 26 }}>
        {badges.map((b) => (
          <View key={b.key} style={[styles.badge, b.earned ? styles.badgeOn : styles.badgeOff]}>
            <Text style={[styles.badgeName, b.earned ? styles.badgeNameOn : styles.badgeNameOff]}>{b.name}</Text>
            <Text style={[styles.badgeHint, b.earned && { color: co.ink, opacity: 0.75 }]}>{b.earned ? 'Earned' : b.hint}</Text>
          </View>
        ))}
      </ScrollView>

      {!isPro ? (
        <PressBounce style={styles.upsell} onPress={() => router.push('/paywall')}>
          <Text style={styles.upsellTitle}>See your full stats</Text>
          <Text style={styles.upsellSub}>Track your proficiency curve, level by area, streaks and every category — with Lexfall.</Text>
          <View style={styles.upsellCta}><Text style={styles.upsellCtaText}>Get full access</Text></View>
        </PressBounce>
      ) : (<>
      <Text style={[label, { color: co.faint, marginTop: 26 }]}>{t('stats.proficiency')}</Text>
      <Text style={styles.curveScore}><Counter value={score} /><Text style={styles.curveScoreSub}> / 100</Text></Text>
      <ProficiencyCurve score={score} width={width - 52} co={co} />
      <Text style={styles.curveNote}>
        {accuracy == null ? 'Take the placement test to plot your level.' : `Estimated at ${level} · from your quiz accuracy.`}
      </Text>

      {fieldSkills.length > 0 && (
        <>
          <Text style={[label, { color: co.faint, marginTop: 26 }]}>{t('stats.levelByArea')}</Text>
          {fieldSkills.map((s) => (
            <View key={`f-${s.key}`} style={styles.lvlRow}>
              <Text style={styles.lvlName}>{FIELD_LABEL[s.key] ?? s.key}</Text>
              <Text style={styles.lvlMeta}>{Math.round(s.score)}% · {isCefrField(s.key as any) ? scoreToLevel(s.score) : scoreToBand(s.score)} · {s.correct}/{s.total}</Text>
            </View>
          ))}
        </>
      )}
      {topicSkills.length > 0 && (
        <>
          <Text style={[label, { color: co.faint, marginTop: 18 }]}>{t('stats.levelByCategory')}</Text>
          {topicSkills.slice(0, 8).map((s) => (
            <View key={`t-${s.key}`} style={styles.lvlRow}>
              <Text style={styles.lvlName} numberOfLines={1}>{s.key}</Text>
              <Text style={styles.lvlMeta}>{Math.round(s.score)}% · {scoreToLevel(s.score)} · {s.correct}/{s.total}</Text>
            </View>
          ))}
          <Text style={styles.curveNote}>Practise a weak area to raise its level — tap it in Practice.</Text>
        </>
      )}
      {domainProf.some((d) => d.total > 0) && (
        <>
          <Text style={[label, { color: co.faint, marginTop: 18 }]}>By profession & area</Text>
          {domainProf.filter((d) => d.total > 0).sort((a, b) => b.total - a.total).slice(0, 10).map((d) => (
            <View key={`d-${d.id}`} style={styles.lvlRow}>
              <Text style={styles.lvlName} numberOfLines={1}>{d.name}</Text>
              <Text style={styles.lvlMeta}>{d.level ? `${Math.round(d.score)}% · ${d.level}` : 'building…'} · {d.correct}/{d.total}</Text>
            </View>
          ))}
        </>
      )}
      <PressBounce style={styles.standingLink} onPress={() => router.push('/standing' as any)}>
        <Text style={styles.standingLinkText}>See where you stand — level by area →</Text>
      </PressBounce>
      </>)}
    </ScrollView>
    </View>
  );
}

const FIELD_LABEL: Record<string, string> = { gen: 'General', med: 'Medicine', law: 'Law', biz: 'Business', new: 'Modern & slang' };

const makeStyles = (co: Palette) => StyleSheet.create({
  shareBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: co.surface2, alignItems: 'center', justifyContent: 'center' },
  badgeToast: { position: 'absolute', left: 20, right: 20, zIndex: 20, backgroundColor: co.accent, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }, default: { elevation: 10 } }) },
  badgeToastEyebrow: { fontFamily: fonts.sansSemi, fontSize: 10.5, letterSpacing: 1, color: co.ink, opacity: 0.8, textTransform: 'uppercase' },
  badgeToastName: { fontFamily: fonts.serif, fontSize: 22, color: co.ink, marginTop: 2 },
  badgeToastHint: { fontFamily: fonts.sans, fontSize: 12.5, color: co.ink, opacity: 0.85, marginTop: 1 },
  h2: { fontFamily: fonts.serif, fontSize: 30, color: co.text, marginTop: 8 },
  week: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: co.line, paddingVertical: 16 },
  dot: { width: 24, height: 24, borderRadius: 12, backgroundColor: co.surface2, marginBottom: 7, alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: co.accent },
  dotToday: { backgroundColor: co.line2 },
  dayLabel: { fontFamily: fonts.sans, fontSize: 10, color: co.faint },
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderColor: co.line, marginTop: 18 },
  stat: { width: '50%', paddingVertical: 18, borderBottomWidth: 1, borderColor: co.line, alignItems: 'center' },
  statL: { borderRightWidth: 1 },
  statR: {},
  n: { fontFamily: fonts.serif, fontSize: 30, color: co.text },
  l: { fontFamily: fonts.sans, fontSize: 11.5, color: co.muted, marginTop: 3 },
  tierCard: { marginTop: 24, backgroundColor: co.surface2, borderRadius: 18, padding: 18 },
  tierName: { fontFamily: fonts.serif, fontSize: 22, color: co.text },
  tierXp: { fontFamily: fonts.sansSemi, fontSize: 14, color: co.accent },
  tierBar: { height: 8, borderRadius: 4, backgroundColor: co.surface, marginTop: 12, overflow: 'hidden' },
  tierFill: { height: 8, borderRadius: 4, backgroundColor: co.accent },
  tierNext: { fontFamily: fonts.sans, fontSize: 12, color: co.muted, marginTop: 8 },
  badge: { minWidth: 96, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  badgeOn: { backgroundColor: co.accent },
  badgeOff: { backgroundColor: co.surface2 },
  badgeName: { fontFamily: fonts.serif, fontSize: 16 },
  badgeNameOn: { color: co.ink },
  badgeNameOff: { color: co.muted },
  badgeHint: { fontFamily: fonts.sans, fontSize: 10.5, color: co.faint, marginTop: 3 },
  curveScore: { fontFamily: fonts.serif, fontSize: 34, color: co.text, marginTop: 8 },
  curveScoreSub: { fontFamily: fonts.sans, fontSize: 14, color: co.faint },
  curveNote: { fontFamily: fonts.sans, fontSize: 12, color: co.muted, marginTop: 8, lineHeight: 18 },
  lvlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: co.line },
  lvlName: { fontFamily: fonts.serif, fontSize: 17, color: co.text, flexShrink: 1 },
  lvlMeta: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted },
  upsell: { marginTop: 26, backgroundColor: co.surface2, borderRadius: 18, padding: 20 },
  upsellTitle: { fontFamily: fonts.serif, fontSize: 22, color: co.text },
  upsellSub: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, lineHeight: 20, marginTop: 6 },
  upsellCta: { backgroundColor: co.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  upsellCtaText: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.ink },
  standingLink: { marginTop: 20, backgroundColor: co.surface2, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  standingLinkText: { fontFamily: fonts.sansSemi, fontSize: 14.5, color: co.accent },
});
