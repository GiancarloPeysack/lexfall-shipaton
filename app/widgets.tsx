import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Animated, Easing, StyleSheet } from 'react-native';
import { t } from '../lib/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useApp } from '../lib/app-state';
import BackButton from '../components/BackButton';
import { setWidgetAdded, syncWidget } from '../lib/widget';
import { getWordsByField } from '../lib/db';
import { Word } from '../data/types';
import { fonts, label, Palette } from '../theme/tokens';

const STEPS: [string, string][] = [
  ['Long-press the Home Screen', 'Touch and hold any empty area until the apps start to jiggle.'],
  ['Tap the + button', 'It appears in the top-left corner. Search for “Lexfall”.'],
  ['Pick a size and Add', 'Choose small or medium, tap “Add Widget”, then Done.'],
];

export default function Widgets() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { field, palette: co } = useApp();
  const styles = makeStyles(co);

  const [pool, setPool] = useState<Word[]>([]);
  const [idx, setIdx] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  // Pull the user's field words and keep the native widget's queue fresh.
  useEffect(() => {
    let alive = true;
    getWordsByField(field).then((ws) => {
      if (!alive) return;
      const shuffled = [...ws].sort(() => Math.random() - 0.5);
      setPool(shuffled);
      setIdx(0);
    });
    syncWidget({ field }).catch(() => {});
    return () => { alive = false; };
  }, [field]);

  // Live demo: cycle a new word every few seconds with a soft cross-fade, so the
  // preview behaves exactly like the Home Screen widget (which rotates on a timer).
  useEffect(() => {
    if (pool.length < 2) return;
    const t = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
        setIdx((i) => (i + 1) % pool.length);
        Animated.timing(fade, { toValue: 1, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
      });
    }, 3200);
    return () => clearInterval(t);
  }, [pool]);

  const w = pool[idx];
  const done = async () => { await setWidgetAdded(true); router.back(); };

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.back()} co={co} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Text style={[label, { color: co.accent }]}>{t('widgets.hero')}</Text>
        <Text style={styles.h1}>A new word on your Home & Lock Screen</Text>
        <Text style={styles.sub}>The widget surfaces a fresh word every few hours - with its meaning - so you keep learning without even unlocking your phone. Here it is, live:</Text>

        {/* Live rotating preview - mirrors the native Home Screen widget */}
        <View style={styles.previewWrap}>
          <Animated.View style={[styles.preview, { opacity: fade }]}>
            {w ? (
              <>
                <Text style={styles.pWord} numberOfLines={1} adjustsFontSizeToFit>{w.word}</Text>
                <Text style={styles.pDef} numberOfLines={3}>({w.pos}) {w.def}</Text>
              </>
            ) : (
              <Text style={styles.pDef}>{t('widgets.loading')}</Text>
            )}
          </Animated.View>
          <View style={styles.dots}>
            {[0, 1, 2, 3].map((d) => (
              <View key={d} style={[styles.dot, d === idx % 4 && styles.dotOn]} />
            ))}
          </View>
        </View>
        <Text style={styles.caption}>Rotates automatically through your {fieldLabel(field)} words. Tap the widget any time to jump straight into the app.</Text>

        <Text style={[styles.sect]}>{t('widgets.steps')}</Text>
        {STEPS.map(([t, s], i) => (
          <View key={i} style={styles.step}>
            <View style={styles.num}><Text style={styles.numText}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>{t}</Text>
              <Text style={styles.stepText}>{s}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sect}>Widgets you can add</Text>
        {([
          ['Word of the moment', 'A fresh word + meaning. Home Screen or Lock Screen.'],
          ['Daily test', 'Your streak, and a tap to start today’s test.'],
          ['This week', 'Your daily-test streak across the week.'],
          ['This month', 'A calendar of your streak.'],
        ] as [string, string][]).map(([tt, ss], i) => (
          <View key={i} style={styles.gRow}>
            <View style={styles.gDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>{tt}</Text>
              <Text style={styles.stepText}>{ss}</Text>
            </View>
          </View>
        ))}

        <View style={styles.note}>
          <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M12 8v5M12 16.5v.5M12 3l9 16H3l9-16Z" stroke={co.muted} strokeWidth={1.5} fill="none" strokeLinejoin="round" /></Svg>
          <Text style={styles.noteText}>iOS only lets you place widgets yourself - no app can add one for you. The steps above take about ten seconds.</Text>
        </View>

        <Pressable style={styles.primary} onPress={done}>
          <Text style={styles.primaryText}>I’ve added the widget</Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={() => router.back()}>
          <Text style={styles.ghostText}>{t('common.maybeLater')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function fieldLabel(f: string) {
  switch (f) {
    case 'med': return 'medical';
    case 'law': return 'legal';
    case 'biz': return 'business';
    default: return 'advanced';
  }
}

const makeStyles = (co: Palette) => StyleSheet.create({
  top: { paddingHorizontal: 22, paddingBottom: 8 },
  close: { fontFamily: fonts.sansMedium, fontSize: 15, color: co.muted },
  h1: { fontFamily: fonts.serif, fontSize: 30, color: co.text, marginTop: 8, lineHeight: 36 },
  sub: { fontFamily: fonts.sans, fontSize: 15, color: co.muted, marginTop: 12, lineHeight: 23 },
  previewWrap: { alignItems: 'center', marginTop: 24 },
  preview: { width: 190, height: 190, borderRadius: 26, padding: 18, backgroundColor: '#100E0B', borderWidth: 1, borderColor: co.line2, justifyContent: 'center', alignItems: 'center' },
  pBrand: { fontFamily: fonts.sansSemi, fontSize: 9, letterSpacing: 2, color: '#C6A85C', textAlign: 'center' },
  pWord: { fontFamily: fonts.serif, fontSize: 25, color: '#ECE5D7', marginTop: 12, textAlign: 'center' },
  pDef: { fontFamily: fonts.sans, fontSize: 12, color: '#CABFA8', marginTop: 10, lineHeight: 17, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 6, marginTop: 16 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: co.line2 },
  dotOn: { backgroundColor: co.accent },
  caption: { fontFamily: fonts.sans, fontSize: 13, color: co.muted, marginTop: 16, lineHeight: 20, textAlign: 'center' },
  sect: { ...label, color: co.faint, marginTop: 34, marginBottom: 6 },
  step: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginTop: 20 },
  gRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginTop: 16 },
  gDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: co.accent, marginTop: 6 },
  num: { width: 26, height: 26, borderRadius: 13, backgroundColor: co.surface2, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: fonts.sansMedium, fontSize: 13, color: co.accent },
  stepTitle: { fontFamily: fonts.sansSemi, fontSize: 15.5, color: co.text },
  stepText: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, lineHeight: 21, marginTop: 3 },
  note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 26, padding: 14, borderRadius: 13, backgroundColor: co.surface2 },
  noteText: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, lineHeight: 19 },
  primary: { backgroundColor: co.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 30 },
  primaryText: { fontFamily: fonts.sansMedium, fontSize: 15, color: co.ink },
  ghost: { paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  ghostText: { fontFamily: fonts.sansMedium, fontSize: 14, color: co.muted },
});
