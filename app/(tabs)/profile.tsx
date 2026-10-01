import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../lib/app-state';
import { t } from '../../lib/i18n';
import BackButton from '../../components/BackButton';
import AnimatedIllo from '../../components/AnimatedIllo';
import { IlloName } from '../../components/Illustrations';
import { FeedPreviewCard } from '../onboarding';

// Each field carries its own artwork on the picker tiles.
const FIELD_ART: Record<string, IlloName> = {
  gen: 'book', med: 'pill', law: 'scales', biz: 'briefcase', new: 'phone',
};
import { rescheduleReminders } from '../../lib/notifications';
import { clearLocalData } from '../../lib/db';
import { deleteAccount } from '../../lib/supabase';
import { FieldId, FIELDS } from '../../data/types';
import { fonts, label, Palette, ACCENTS } from '../../theme/tokens';
import PressBounce from '../../components/PressBounce';
import Segment from '../../components/Segment';
import { resetFeedTour } from '../../components/FeedTour';
import AppearancePicker from '../../components/AppearancePicker';
import ExamPicker from '../../components/ExamPicker';
import { examCountdownLabel } from '../../lib/exam';
import Svg, { Path } from 'react-native-svg';

const REM_KEY = 'vorto.reminders';
const DEFAULT_REM = { allWords: true, dailyPractice: true, streak: true };

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { field, setField, name, isPro, goal, setGoal, theme, setTheme, accent, setAccent, sound, setSound, feedPhotos, setFeedPhotos, examDate, testPro, toggleTestPro, palette: co } = useApp();
  const styles = makeStyles(co);
  const [rem, setRem] = useState(DEFAULT_REM);
  // Only surface the exam section to users who actually indicated an exam (onboarding purpose →
  // vorto.examType), or who already set a date. Everyone else gets a quiet one-tap reveal instead
  // of a countdown picker for an exam they never said they have.
  const [hasExam, setHasExam] = useState(false);
  const [examOpen, setExamOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(REM_KEY).then((v) => { if (v) setRem(JSON.parse(v)); });
    AsyncStorage.getItem('vorto.examType').then((v) => setHasExam(!!(v && v.trim())));
  }, []);
  const toggle = async (k: keyof typeof rem) => {
    const next = { ...rem, [k]: !rem[k] };
    setRem(next);
    await AsyncStorage.setItem(REM_KEY, JSON.stringify(next));
    rescheduleReminders(field, true).catch(() => {});
  };

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently erases your saved words, streak and progress from this device (and your account, once signed in). This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            await clearLocalData().catch(() => {});
            await AsyncStorage.multiRemove(['vorto.onboarded', 'vorto.field', 'vorto.goal', 'vorto.theme', 'vorto.reminders', 'vorto.freq', 'vorto.voice', 'vorto.level']).catch(() => {});
            await deleteAccount();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 26, paddingBottom: insets.bottom + 130 }}>
        <View style={styles.id}>
          {/* DEV ONLY: long-press the avatar to toggle a TEST Pro unlock so Pro-only screens
              can be checked during development. Gated on __DEV__ so it does nothing in a
              production/Release build (and testPro is also ignored in release — see app-state). */}
          <PressBounce
            onLongPress={__DEV__ ? () => { toggleTestPro(); Alert.alert('Test Pro', testPro ? 'Turning OFF — Pro screens will re-lock.' : 'Turning ON — Pro screens unlocked for testing.'); } : undefined}
            delayLongPress={600}
            style={styles.mono}
          >
            {/* trim first: a stored name like " B" (leading space) otherwise makes the initial a
                blank space, so the avatar renders empty. */}
            <Text style={styles.monoText}>{(name?.trim()?.[0] || 'V').toUpperCase()}</Text>
          </PressBounce>
          <View>
            <Text style={styles.name}>{name?.trim() || 'Lexfall learner'}</Text>
            <Text style={styles.sub}>{(isPro ? 'Premium' : 'Trial') + (testPro ? ' (test)' : '')} · {FIELDS.find((f) => f.id === field)?.name}</Text>
          </View>
        </View>

        {/* ("Take a test" card removed — it linked to /practice, the exact destination of the
            always-visible Practice tab, and its "see your current level" promise was hollow.) */}
        {/* Feed personalization now lives on the Library tab (its area cards are the ONE entry
            point for choosing feed areas) — this row deep-links there instead of owning its own
            flow. The crown/personalize screen stays reachable from the feed's crown icon. */}
        <Text style={styles.sect}>Your feed</Text>
        <PressBounce style={styles.testCard} onPress={() => router.push('/(tabs)/explore' as any)}>
          <AnimatedIllo name="sparkle" co={co} size={46} amount={5} />
          <View style={{ flex: 1 }}>
            <Text style={styles.testT}>Personalize your feed</Text>
            <Text style={styles.testS}>{FIELDS.find((f) => f.id === field)?.name} · choose your areas in Library</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </PressBounce>

        {/* Settings only — Saved words / Your own words live on the Library tab, not here. */}
        <Text style={styles.sect}>{t('profile.customize')}</Text>
        <View style={styles.grid}>
          <Tile co={co} title="Home Screen widget" sub="A word on your Home Screen" illo="phone" onPress={() => router.push('/widgets')} />
          <Tile co={co} title="Voices" sub="Accent & pronunciation" illo="megaphone" onPress={() => router.push('/voices')} />
        </View>

        {(hasExam || !!examDate || examOpen) ? (
          <>
            <Text style={styles.sect}>Your exam</Text>
            {!!examDate && !!examCountdownLabel(examDate) && (
              <Text style={{ fontFamily: fonts.serif, fontSize: 20, color: co.accent, marginBottom: 12 }}>{examCountdownLabel(examDate)}</Text>
            )}
            <ExamPicker />
          </>
        ) : (
          <PressBounce style={[styles.ghost, { marginTop: 26 }]} onPress={() => setExamOpen(true)}>
            <Text style={styles.ghostText}>Preparing for an exam? Add a date</Text>
          </PressBounce>
        )}

        <Text style={styles.sect}>{t('profile.dailyGoal')}</Text>
        <Segment
          co={co}
          options={[3, 5, 10, 15].map((g) => ({ label: `${g} words`, value: String(g) }))}
          value={String(goal)}
          onChange={(v) => setGoal(+v)}
        />

        <Text style={styles.sect}>{t('profile.appearance')}</Text>
        <AppearancePicker co={co} value={theme} onChange={setTheme} />

        <Text style={styles.sect}>{t('profile.accent')}</Text>
        <View style={styles.accents}>
          {ACCENTS.map((a) => {
            const on = a.id === accent;
            const hex = theme === 'light' ? a.light : a.dark;
            return (
              <PressBounce key={a.id} onPress={() => setAccent(a.id)} style={[styles.swatch, { backgroundColor: hex }]} accessibilityLabel={a.name}>
                {on && (
                  <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="m5 13 4 4L19 7" stroke={co.ink} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
                )}
              </PressBounce>
            );
          })}
        </View>

        <Text style={styles.sect}>{t('profile.sound')}</Text>
        <Segment
          co={co}
          options={[{ label: 'On', value: 'on' }, { label: 'Off', value: 'off' }]}
          value={sound ? 'on' : 'off'}
          onChange={(v) => setSound(v === 'on')}
        />

        <Text style={styles.sect}>Photo backgrounds</Text>
        <Segment
          co={co}
          options={[{ label: 'On', value: 'on' }, { label: 'Off', value: 'off' }]}
          value={feedPhotos ? 'on' : 'off'}
          onChange={(v) => setFeedPhotos(v === 'on')}
        />
        {/* Live preview so the toggle shows the flat vs photo look, not just an On/Off (owner).
            No alignItems:'center' — the preview card has a fixed height but NO width, so centering
            collapsed it to a thin sliver; it must stretch to the content width instead. */}
        <View style={{ marginTop: 2 }}>
          <FeedPreviewCard co={co} photo={feedPhotos} />
        </View>

        <Text style={styles.sect}>{t('profile.reminders')}</Text>
        {([['allWords', 'New words', '10× a day · 9:00–22:00'], ['dailyPractice', 'Daily practice', "If you haven't practised · 19:30"], ['streak', 'Streak reminder', "Don't break the chain · 21:00"]] as const).map(([k, t, s]) => (
          <View key={k} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rt}>{t}</Text>
              <Text style={styles.rs}>{s}</Text>
            </View>
            <PressBounce onPress={() => toggle(k)} style={[styles.toggle, rem[k] && styles.toggleOn]}>
              <View style={[styles.knob, rem[k] && styles.knobOn]} />
            </PressBounce>
          </View>
        ))}

        <View style={{ height: 26 }} />
        {/* Clears the show-once flag and lands on the feed, where the tour re-triggers on focus. */}
        <PressBounce style={styles.ghost} onPress={async () => { await resetFeedTour().catch(() => {}); router.push('/(tabs)' as any); }}><Text style={styles.ghostText}>Replay the feed tour</Text></PressBounce>
        <View style={{ height: 10 }} />
        <PressBounce style={styles.ghost} onPress={() => router.push('/redeem' as any)}><Text style={styles.ghostText}>Redeem a code</Text></PressBounce>
        <PressBounce style={styles.ghost} onPress={async () => { await AsyncStorage.removeItem('vorto.onboarded'); setField('gen'); router.replace('/onboarding'); }}><Text style={styles.ghostText}>Restart onboarding</Text></PressBounce>
        <PressBounce style={styles.danger} onPress={onDeleteAccount}><Text style={styles.dangerText}>Delete account</Text></PressBounce>
        <Text style={styles.ver}>Lexfall · v0.1</Text>
      </ScrollView>
    </View>
  );
}

function Tile({ co, title, sub, illo, onPress }: { co: Palette; title: string; sub: string; illo: IlloName; onPress: () => void }) {
  const styles = makeStyles(co);
  return (
    <PressBounce style={styles.tile} onPress={onPress}>
      <AnimatedIllo name={illo} co={co} size={64} amount={5} />
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileSub}>{sub}</Text>
    </PressBounce>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  top: { paddingHorizontal: 24, paddingBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fieldTile: { width: '47.5%', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: co.surface2, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 12 },
  fieldTileOn: { backgroundColor: co.accent },
  fieldTileText: { fontFamily: fonts.sansSemi, fontSize: 14.5, color: co.text, flexShrink: 1 },
  tile: { width: '47.5%', backgroundColor: co.surface2, borderRadius: 18, padding: 16, gap: 4, minHeight: 92, justifyContent: 'flex-end' },
  tileTitle: { fontFamily: fonts.serif, fontSize: 17, color: co.text },
  tileSub: { fontFamily: fonts.sans, fontSize: 11.5, color: co.muted },
  id: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  mono: { width: 48, height: 48, borderRadius: 24, backgroundColor: co.surface2, alignItems: 'center', justifyContent: 'center' },
  monoText: { fontFamily: fonts.serif, fontSize: 20, color: co.accent },
  name: { fontFamily: fonts.serif, fontSize: 20, color: co.text },
  sub: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, marginTop: 2 },
  testCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: co.surface2, borderRadius: 18, padding: 18, marginTop: 18 },
  testT: { fontFamily: fonts.sansSemi, fontSize: 17, color: co.text },
  testS: { fontFamily: fonts.sans, fontSize: 13, color: co.muted, marginTop: 3 },
  sect: { ...label, color: co.faint, marginTop: 26, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: co.line },
  rt: { fontFamily: fonts.sans, fontSize: 15, color: co.text },
  rs: { fontFamily: fonts.sans, fontSize: 12, color: co.muted, marginTop: 3 },
  accents: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  swatch: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  toggle: { width: 44, height: 26, borderRadius: 999, backgroundColor: co.surface2, padding: 4 },
  toggleOn: { backgroundColor: co.accent },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: co.text },
  knobOn: { backgroundColor: co.ink, marginLeft: 'auto' },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: co.line },
  linkText: { fontFamily: fonts.serif, fontSize: 17, color: co.text },
  chev: { color: co.faint, fontSize: 18 },
  ghost: { backgroundColor: co.surface2, borderRadius: 13, paddingVertical: 15, alignItems: 'center' },
  ghostText: { fontFamily: fonts.sansMedium, fontSize: 15, color: co.text },
  danger: { paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  dangerText: { fontFamily: fonts.sansMedium, fontSize: 14, color: co.bad },
  ver: { fontFamily: fonts.sans, fontSize: 11, color: co.faint, textAlign: 'center', marginTop: 16 },
});
