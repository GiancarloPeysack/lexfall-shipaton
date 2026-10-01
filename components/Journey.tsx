import { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { loadPlan, type PlanState } from '../lib/plan';
import { Palette, fonts, label } from '../theme/tokens';
import PressBounce from './PressBounce';

// The Journey hero: turns the flat daily ritual into a leveled PLAN. Levels are milestones of
// "known" words (recalled correctly >= twice — see getWordsKnownCount). The daily test + practice
// feed it automatically, so tapping through moves the bar. v1 = a level badge + progress-to-next
// + a compact ladder; a full winding path can layer on later.
export default function Journey({ co }: { co: Palette }) {
  const router = useRouter();
  const [plan, setPlan] = useState<PlanState | null>(null);
  useFocusEffect(useCallback(() => {
    let alive = true;
    // Same level source as the /journey screen (lib/plan.ts loadPlan) so the two never disagree.
    loadPlan().then((p) => { if (alive) setPlan(p); }).catch(() => {});
    return () => { alive = false; };
  }, []));
  if (!plan) return null;
  const s = makeStyles(co);
  const nextTitle = plan.levels[plan.levelIndex + 1]?.title;
  return (
    <PressBounce style={s.card} onPress={() => router.push('/journey')} accessibilityLabel="Your journey — practice to level up">
      <Text style={[label, { color: co.accent }]}>Your journey</Text>
      <View style={s.headRow}>
        <View style={s.badge}><Text style={s.badgeNum}>{plan.levelIndex + 1}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>Level {plan.levelIndex + 1} · {plan.levelTitle}</Text>
          <Text style={s.sub}>
            {plan.maxed
              ? `${plan.mastered} words known — top level reached`
              : `${plan.mastered} of ${plan.levelTarget} known · ${plan.needed} to ${nextTitle ? nextTitle : 'the next level'}`}
          </Text>
        </View>
      </View>
      <View style={s.track}><View style={[s.fill, { width: `${Math.max(3, Math.round(plan.progress * 100))}%` }]} /></View>
      <View style={s.ladder}>
        {plan.levels.slice(0, 8).map((l) => {
          const done = plan.mastered >= l.target;
          const current = l.index === plan.levelIndex && !plan.maxed;
          return <View key={l.index} style={[s.node, { backgroundColor: done ? co.accent : co.line2 }, current && s.nodeCurrent]} />;
        })}
      </View>
    </PressBounce>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  card: { backgroundColor: co.surface2, borderRadius: 22, padding: 20, marginBottom: 20 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
  badge: { width: 46, height: 46, borderRadius: 23, backgroundColor: co.accent, alignItems: 'center', justifyContent: 'center' },
  badgeNum: { fontFamily: fonts.serif, fontSize: 22, color: co.ink },
  title: { fontFamily: fonts.serif, fontSize: 19, color: co.text },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: co.muted, marginTop: 2 },
  track: { height: 8, borderRadius: 4, backgroundColor: co.line, overflow: 'hidden', marginTop: 16 },
  fill: { height: '100%', borderRadius: 4, backgroundColor: co.accent },
  ladder: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  node: { flex: 1, height: 6, borderRadius: 3 },
  nodeCurrent: { height: 8, borderRadius: 4, backgroundColor: co.accent, opacity: 0.55 },
});
