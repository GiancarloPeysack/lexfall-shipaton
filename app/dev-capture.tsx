import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing, Text, Pressable, ScrollView } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useApp } from '../lib/app-state';
import { DifferentScreen, RetentionScreen, ProjectionScreen, TestimonialsScreen, SceneWidget, SceneNotif, SceneFields, BuildingProfile, Opt, Step, PROFESSION_TAGS, BIZ_PURPOSES, PROF_FLAT, SceneField, WordCheckScreen, MultiWordCheck, LevelResultsScreen, computeLevelCheckPool, PersonalizeScreen, FeedStyleScreen, TimeWheel, CountWheel, TrialTimeline, makeStyles } from './onboarding';
import { getOffering } from '../lib/purchases';
import type { PurchasesOffering } from 'react-native-purchases';
import Segment from '../components/Segment';
import AreaPicker, { auditAreaCoverage } from '../components/AreaPicker';
import { domainsForField } from '../data/domains';
import { PROFESSIONS } from '../data/categories';
import { ProfIcon } from '../components/Illustrations';
import FadeIn from '../components/FadeIn';
import LessonCard from '../components/LessonCard';
import { SEED } from '../data/words';
import { MED_PROFESSIONS, MED_CORE_TOPICS } from '../data/med-taxonomy';
import Game from '../components/Game';
import { PaywallView } from '../components/Paywall';
import { fonts, label } from '../theme/tokens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReadinessReportView } from './exam-readiness';
import { RarityDial } from './(tabs)/index';
import { monthStr, ReadinessResult } from '../lib/exam-readiness';
import { isoInDays } from '../lib/exam';

// TEMPORARY, dev-only route for capturing App Store screenshots of onboarding-only scenes
// (which aren't reachable via deep link since they're indexed by internal step state). Not
// linked from anywhere in the app; delete before the next real ship.
export default function DevCapture() {
  const insets = useSafeAreaInsets();
  const { field, palette: co } = useApp();
  const { which } = useLocalSearchParams<{ which: string }>();
  const s = StyleSheet.create({ wrap: { flex: 1, backgroundColor: co.bg, paddingHorizontal: 28, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 } });
  return (
    <View style={s.wrap}>
      {which === 'lesson' && (
        <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
          {['ai', 'fealty', 'unitranche', 'bring-down', 'transhumance', 'counterproductive'].map((w) => {
            const found = SEED.find((x) => x.word.toLowerCase() === w) || { id: `x:${w}`, word: w, pos: 'n', def: 'Sample definition for size verification of the headword across different word lengths.', ex: 'A sample sentence.', ipa: '', field: 'gen', topic: '', cefr: 'C1', syn: [] } as any;
            return <LessonCard key={w} word={found} co={co} eyebrow="New word" />;
          })}
        </ScrollView>
      )}
      {which === 'widget' && <SceneWidget co={co} reduce={true} />}
      {which === 'notif' && <SceneNotif co={co} reduce={true} />}
      {which === 'retention' && <RetentionScreen co={co} reduce={true} />}
      {which === 'projection' && <ProjectionScreen co={co} field={field} library={11006} perDay={10} reduce={true} />}
      {which === 'different' && <DifferentScreen co={co} name={''} reduce={true} />}
      {which === 'fields' && <SceneFields co={co} />}
      {which === 'sceneFieldGen' && <SceneField co={co} field={'gen'} />}
      {which === 'testimonials' && <TestimonialsScreen co={co} />}
      {which === 'building' && <BuildingProfile co={co} field={'biz'} topics={new Set(['Negotiation'])} reduce={false} onDone={() => {}} />}
      {which === 'bizAreas' && <BizAreasPreview co={co} />}
      {which === 'lawAreas' && <LawAreasPreview co={co} />}
      {which === 'specialty' && <SpecialtyPreview co={co} field={'biz'} />}
      {which === 'bizPurpose' && <BizPurposePreview co={co} />}
      {which === 'profession' && <ProfessionPreview co={co} />}
      {which === 'source' && <SourcePreview co={co} />}
      {which === 'age' && <AgePreview co={co} />}
      {which === 'multiCheck' && <MultiWordCheck co={co} words={SEED.filter((w) => w.field === 'gen').slice(0, 5)} round={1} onNext={() => {}} onBack={() => {}} insetTop={insets.top} insetBottom={insets.bottom} />}
      {which === 'levelCheck' && <WordCheckScreen co={co} words={SEED.filter((w) => w.field === 'gen').slice(0, 2)} onNext={() => {}} onBack={() => {}} insetTop={insets.top} insetBottom={insets.bottom} />}
      {which === 'placement' && <Game mode="meaning" pool={SEED.filter((w) => w.field === 'gen').slice(0, 40)} n={2} distractors={1} assess seedLevelOnly onExit={() => {}} />}
      {which === 'levelResults' && <LevelResultsScreen co={co} missed={SEED.filter((w) => w.field === 'gen').slice(0, 14)} onDone={() => {}} />}
      {which === 'personalize' && <PersonalizeScreen co={co} field={'biz'} topics={new Set(['Business email & meetings', 'Negotiation'])} />}
      {which === 'feedStyle' && (
        <OnboardingShellPreview co={co}>
          <FeedStyleScreen co={co} field={'biz'} topics={new Set(['Business email & meetings', 'Negotiation'])} />
        </OnboardingShellPreview>
      )}
      {which === 'reminders' && (
        <OnboardingShellPreview co={co}>
          <RemindersPreview co={co} />
        </OnboardingShellPreview>
      )}
      {which === 'wordPref' && (
        <OnboardingShellPreview co={co}>
          <WordPrefPreview co={co} />
        </OnboardingShellPreview>
      )}
      {which === 'trial' && <TrialPreview co={co} />}
      {which === 'paywall' && <PaywallView variant="hard" onPurchased={() => {}} onClose={() => {}} />}
      {which === 'paywallOnboarding' && <PaywallView variant="onboarding" field={'med'} specialty={'Cardiology'} perDay={12} library={2450} onPurchased={() => {}} onClose={() => {}} />}
      {which === 'levelFlow' && <LevelFlowPreview co={co} />}
      {which === 'savedPop' && <SavedPopPreview co={co} />}
      {which === 'sceneFieldCheck' && <SceneFieldCheck co={co} />}
      {which === 'sceneField' && <SceneField co={co} field={'med'} topics={new Set(['Cardiology'])} profName="cardiologists" profTopics={['Cardiology']} />}
      {which === 'imgtest' && <Text style={{ color: co.text }}>IMGTEST</Text>}
      {which === 'sceneFieldMed' && <SceneFieldMedCheck co={co} />}
      {which === 'profCheck' && <ProfCheck co={co} />}
      {which === 'dial' && <DialPreview co={co} />}
      {which === 'examReport' && <ExamReportPreview co={co} insetTop={insets.top} />}
      {which === 'examSetup' && <ExamSetupPreview co={co} />}
      {which === 'scrollTest' && (
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, marginBottom: 10 }}>Bare ScrollView control test</Text>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
            {Array.from({ length: 30 }, (_, i) => (
              <View key={i} style={{ paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#ccc' }}>
                <Text style={{ fontSize: 18 }}>Item {i + 1}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// Proves the primaryProf fix end-to-end: pick the "Negotiation & deal-making" biz specialty
// exactly as the real specialty screen would (same domain topics), then re-run the REAL
// derivation (specialtyItems.find(it => it.topics.every(t => topics.has(t)))) - not just pass
// the name directly - to confirm law/biz now resolve a profName instead of falling back to a
// generic headline like they did before this fix.
function SceneFieldCheck({ co }: { co: any }) {
  const specialtyItems = domainsForField('biz').filter((d) => d.profession).map((d) => ({ id: d.id, name: d.name, tag: PROFESSION_TAGS[d.id] ?? '', topics: d.topics }));
  const picked = domainsForField('biz').find((d) => d.id === 'biz:negotiation')!;
  const topics = new Set(picked.topics);
  const primaryProf = specialtyItems.find((it) => it.topics.every((t) => topics.has(t)));
  return <SceneField co={co} field={'biz'} topics={topics} profName={primaryProf?.name} profTopics={primaryProf?.topics} />;
}

// Task #27 investigation: reproduces onboarding.tsx's exact levelCheckPool derivation (base filter
// + present() + the >=20 profScoped threshold) for EVERY specialty in every professional field, to
// find out whether "personalization doesn't reach the level-check" is a real bug or a thin-corpus
// fallback (profScoped < 20 -> silently widens to topics, then the whole field).
function ProfCheck({ co }: { co: any }) {
  const allTopics = new Set(SEED.map((w) => w.topic));
  const present = (list: string[]) => list.filter((t) => allTopics.has(t));
  const base = (f: string) => (w: any) => w.field === f && !w.word.includes(' ') && !!w.def && !!w.ex;
  const rows: { field: string; name: string; count: number }[] = [];
  for (const p of MED_PROFESSIONS) {
    const topics = present(p.topics);
    rows.push({ field: 'med', name: p.name, count: SEED.filter((w) => base('med')(w) && topics.includes(w.topic)).length });
  }
  for (const f of ['law', 'biz'] as const) {
    for (const d of domainsForField(f).filter((d) => d.profession)) {
      const topics = present(d.topics);
      rows.push({ field: f, name: d.name, count: SEED.filter((w) => base(f)(w) && topics.includes(w.topic)).length });
    }
  }
  // Fix verification (task #27): simulate a user who picked Pharmacy (3 topics: Pharmacy practice,
  // Pharmacy, Pharmacology - the REAL runtime mix is core-topics u profession-topics, same as
  // SceneFieldMedCheck below) then narrowed to ONLY Pharmacology on the areas screen. Old behavior
  // would've ignored that narrowing (profScoped >= 20 short-circuited straight to the WHOLE
  // profession); new computeLevelCheckPool must return ONLY Pharmacology words.
  const pharmacy = MED_PROFESSIONS.find((p) => p.id === 'pharmacy')!;
  const wholeProfPool = computeLevelCheckPool('med', new Set([...MED_CORE_TOPICS, ...pharmacy.topics]), { topics: pharmacy.topics });
  const narrowedTopics = new Set(['Pharmacology']);
  const narrowedPool = computeLevelCheckPool('med', narrowedTopics, { topics: pharmacy.topics });
  const narrowedIsPure = narrowedPool.every((w) => w.topic === 'Pharmacology');
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 10, color: co.text }}>Fix check: narrow-areas pick honored?</Text>
      <Text style={{ color: co.text }}>Whole-profession pool (Pharmacy, unnarrowed): {wholeProfPool.length}</Text>
      <Text style={{ color: co.text, marginTop: 4 }}>Narrowed-to-Pharmacology pool: {narrowedPool.length}</Text>
      <Text style={{ color: narrowedIsPure && narrowedPool.length < wholeProfPool.length ? 'green' : 'red', fontWeight: '700', marginTop: 4, marginBottom: 20 }}>
        {narrowedIsPure && narrowedPool.length < wholeProfPool.length ? 'PASS - narrowed pool is smaller and 100% Pharmacology' : 'FAIL'}
      </Text>
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 10, color: co.text }}>profScoped counts (need {'>='}20 to skip old fallback)</Text>
      {rows.map((r) => (
        <View key={r.field + r.name} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#ccc' }}>
          <Text style={{ color: co.text }}>{r.field}: {r.name}</Text>
          <Text style={{ color: r.count >= 20 ? 'green' : 'red', fontWeight: '700' }}>{r.count}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// Proves the "Dentistry showed palliative/iatrogenic/triage" fix - replicates the REAL runtime
// condition (not just a clean specialty-only set): medicine seeds MED_CORE_TOPICS by default
// alongside whatever profession is picked, so topics = {core topics} u {Dentistry}, exactly what
// broke it before (the mixed pool's first-3-in-corpus-order was dominated by generic core-topic
// words). Confirms profTopics correctly prioritizes Dentistry-specific words despite the mix.
function SceneFieldMedCheck({ co }: { co: any }) {
  const dentistry = MED_PROFESSIONS.find((p) => p.id === 'dentistry')!;
  const topics = new Set([...MED_CORE_TOPICS, ...dentistry.topics]);
  return <SceneField co={co} field={'med'} topics={topics} profName={dentistry.name} profTopics={dentistry.topics} />;
}

// Mirrors Game.tsx's saved-pop animation exactly (same spring+timing sequence, same styles) so it
// can be triggered on demand for screenshotting - real taps don't register on this app's option
// rows/skip links via simulator automation (documented limitation), so completing an actual
// placement round to reach this state isn't reliable via CLI.
function SavedPopPreview({ co }: { co: any }) {
  const [saved, setSaved] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!saved) return;
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true }),
      Animated.timing(pop, { toValue: 0, duration: 220, delay: 700, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [saved]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable onPress={() => setSaved(true)} style={{ backgroundColor: co.text, borderRadius: 13, paddingVertical: 16, paddingHorizontal: 30 }}>
        <Text style={{ color: co.ink, fontWeight: '600' }}>Save for practice</Text>
      </Pressable>
      {saved && (
        <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
          <Animated.View
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: co.accent, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 16,
              opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
            }}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16l-6-4-6 4V4z" stroke={co.ink} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
            <Text style={{ fontWeight: '600', fontSize: 17, color: co.ink }}>Saved</Text>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

function ProfessionPreview({ co }: { co: any }) {
  const [picked, setPicked] = useState('');
  return (
    <Step title="What should we focus on?" sub="Pick your main focus. You can add other fields later.">
      {PROFESSIONS.map((p, i) => (
        <FadeIn key={p.id} delay={i * 55} duration={260} offset={10}>
          <Opt label={p.label} note={p.note} icon={<ProfIcon name={PROF_FLAT[p.id]} co={co} />} on={picked === p.id} onPress={() => setPicked(p.id)} co={co} />
        </FadeIn>
      ))}
    </Step>
  );
}

function SourcePreview({ co }: { co: any }) {
  const [source, setSource] = useState('');
  return (
    <Step title="How did you hear about us?">
      {['App Store', 'TikTok', 'Instagram', 'YouTube', 'Reddit', 'A friend', 'Other'].map((o, i) => (
        <FadeIn key={o} delay={i * 55} duration={260} offset={10}>
          <Opt label={o} on={source === o} onPress={() => setSource(o)} co={co} />
        </FadeIn>
      ))}
    </Step>
  );
}

function AgePreview({ co }: { co: any }) {
  const [age, setAge] = useState('');
  return (
    <Step title="How old are you?">
      {['Under 20', '20–29', '30–39', '40–49', '50+'].map((o, i) => (
        <FadeIn key={o} delay={i * 55} duration={260} offset={10}>
          <Opt label={o} on={age === o} onPress={() => setAge(o)} co={co} />
        </FadeIn>
      ))}
    </Step>
  );
}

function BizPurposePreview({ co }: { co: any }) {
  const [purpose, setPurpose] = useState('');
  return (
    <Step title="What are you working toward?" sub="">
      {BIZ_PURPOSES.map((p, i) => (
        <FadeIn key={p.id} delay={i * 55} duration={260} offset={10}>
          <Opt label={p.label} note={p.note} on={purpose === p.id} onPress={() => setPurpose(p.id)} co={co} />
        </FadeIn>
      ))}
    </Step>
  );
}

// Replicates the real 'reminders' (pace/goal) slot's JSX so the CountWheel wiring + dark
// notification-style word-preview card can be verified without a full onboarding tap-through
// (RN ScrollView swallows synthetic option-row taps, so reaching this slot live isn't reliable -
// see CLAUDE.md). Local state only, mirrors the real Onboarding component's fromH/toH/perDay/
// timeEdit/countEdit.
function RemindersPreview({ co }: { co: any }) {
  const s = makeStyles(co);
  const { theme } = useApp();
  const [perDay, setPerDay] = useState(10);
  const [fromH, setFromH] = useState(9);
  const [toH, setToH] = useState(22);
  const [timeEdit, setTimeEdit] = useState<'from' | 'to' | null>(null);
  const [countEdit, setCountEdit] = useState(false);
  const previewWord = SEED.find((w) => w.id === 'gen:hermeneutics') ?? SEED.filter((w) => w.field === 'gen')[0];
  return (
    <Step title="Words throughout your day" sub="A fresh word at the hours you choose." illo="phone">
      <Text style={[label, { color: co.faint, marginBottom: 6 }]}>Set your goal</Text>
      <View style={s.specRow}>
        <View><Text style={s.specL}>Words per day</Text><Text style={s.specS}>spread through your day</Text></View>
        <View style={s.stepper}>
          <Pressable onPress={() => setPerDay((n) => Math.max(2, n - 1))} style={s.stepBtn}><Text style={s.stepTxt}>–</Text></Pressable>
          <Pressable onPress={() => setCountEdit(true)} hitSlop={8}><Text style={[s.stepVal, s.stepValTap]}>{perDay}</Text></Pressable>
          <Pressable onPress={() => setPerDay((n) => Math.min(16, n + 1))} style={s.stepBtn}><Text style={s.stepTxt}>+</Text></Pressable>
        </View>
      </View>
      {countEdit && <CountWheel co={co} value={perDay} min={2} max={16} onChange={setPerDay} onDone={() => setCountEdit(false)} />}
      <View style={s.specRow}>
        <View><Text style={s.specL}>Start</Text><Text style={s.specS}>first word of the day</Text></View>
        <View style={s.stepper}>
          <Pressable onPress={() => setFromH((h) => Math.max(0, h - 1))} style={s.stepBtn}><Text style={s.stepTxt}>–</Text></Pressable>
          <Pressable onPress={() => setTimeEdit('from')} hitSlop={8}><Text style={[s.stepVal, s.stepValTap]}>{fromH}:00</Text></Pressable>
          <Pressable onPress={() => setFromH((h) => Math.min(toH - 1, h + 1))} style={s.stepBtn}><Text style={s.stepTxt}>+</Text></Pressable>
        </View>
      </View>
      {timeEdit === 'from' && <TimeWheel co={co} theme={theme} hour={fromH} onChange={(h) => setFromH(Math.min(h, toH - 1))} onDone={() => setTimeEdit(null)} />}
      <View style={s.specRow}>
        <View><Text style={s.specL}>End</Text><Text style={s.specS}>quiet after this</Text></View>
        <View style={s.stepper}>
          <Pressable onPress={() => setToH((h) => Math.max(fromH + 1, h - 1))} style={s.stepBtn}><Text style={s.stepTxt}>–</Text></Pressable>
          <Pressable onPress={() => setTimeEdit('to')} hitSlop={8}><Text style={[s.stepVal, s.stepValTap]}>{toH}:00</Text></Pressable>
          <Pressable onPress={() => setToH((h) => Math.min(23, h + 1))} style={s.stepBtn}><Text style={s.stepTxt}>+</Text></Pressable>
        </View>
      </View>
      {timeEdit === 'to' && <TimeWheel co={co} theme={theme} hour={toH} onChange={(h) => setToH(Math.max(h, fromH + 1))} onDone={() => setTimeEdit(null)} />}
      <View style={s.wprevDark}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.wprevWDark}>{previewWord?.word}</Text>
        </View>
        <Text style={s.wprevDDark}>({previewWord?.pos}) {previewWord?.def}</Text>
      </View>
    </Step>
  );
}

function WordPrefPreview({ co }: { co: any }) {
  const [wordPref, setWordPref] = useState<'practical' | 'balanced' | 'rare'>('balanced');
  return (
    <Step title="How rare should your words be?" sub="You can change this anytime in Profile.">
      <Segment
        options={[{ label: 'Practical', value: 'practical' }, { label: 'Balanced', value: 'balanced' }, { label: 'Rare', value: 'rare' }]}
        value={wordPref}
        onChange={(v) => setWordPref(v as 'practical' | 'balanced' | 'rare')}
        co={co}
      />
    </Step>
  );
}

// Faithfully replicates the REAL onboarding shell (back row + progress bar + scrollable content
// + fixed footer Continue button) so a Step-based screen can be sized-checked here and actually
// trusted - dev-capture's bare wrap (no footer, no back/progress row) hid ~130pt of real chrome
// that made the feed-style preview card need a scroll in the actual flow (owner caught it live).
function OnboardingShellPreview({ co, children }: { co: any; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: co.muted }}>‹ Back</Text>
      </View>
      <View style={{ height: 3, borderRadius: 3, backgroundColor: co.line, marginTop: 10, overflow: 'hidden' }}>
        <View style={{ height: 3, borderRadius: 3, backgroundColor: co.accent, width: '40%' }} />
      </View>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingTop: 20, paddingBottom: 40 }}>
        {children}
      </ScrollView>
      <View>
        <Pressable style={{ backgroundColor: co.accent, borderRadius: 16, paddingVertical: 18, alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.sansSemi, fontSize: 17, color: co.ink }}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BizAreasPreview({ co }: { co: any }) {
  const [topics, setTopics] = useState<Set<string>>(new Set());
  const toggle = (tags: string[]) => setTopics((s) => {
    const n = new Set(s);
    const on = tags.every((t) => n.has(t));
    tags.forEach((t) => (on ? n.delete(t) : n.add(t)));
    return n;
  });
  // Mirrors the real onboarding 'areas' step's present() override exactly (fixed 2026-09-04:
  // exclude only the ONE picked specialty's topics, not every profession domain), so this
  // preview actually proves the specialty/areas exclusion works (not just that AreaPicker renders).
  const pickedDomain = domainsForField('biz').filter((d) => d.profession)[0];
  const specialtyTopicSet = new Set(pickedDomain?.topics ?? []);
  return (
    <AreaPicker
      field={'biz'}
      co={co}
      present={(tags) => !tags.every((t) => specialtyTopicSet.has(t))}
      isSubOn={(tags) => tags.every((t) => topics.has(t))}
      onSub={(tags) => toggle(tags)}
      showAxes={false}
    />
  );
}

function LawAreasPreview({ co }: { co: any }) {
  const [topics, setTopics] = useState<Set<string>>(new Set());
  const toggle = (tags: string[]) => setTopics((s) => {
    const n = new Set(s);
    const on = tags.every((t) => n.has(t));
    tags.forEach((t) => (on ? n.delete(t) : n.add(t)));
    return n;
  });
  const allTopics = new Set(SEED.map((w) => w.topic));
  // Fixed 2026-09-04: only the ONE picked specialty's topics are excluded (see BizAreasPreview).
  const pickedDomain = domainsForField('law').filter((d) => d.profession)[0];
  const specialtyTopicSet = new Set(pickedDomain?.topics ?? []);
  const fieldTopics = [...new Set(SEED.filter((w) => w.field === 'law').map((w) => w.topic))];
  useEffect(() => { auditAreaCoverage('law', fieldTopics); }, []);
  return (
    <AreaPicker
      field={'law'}
      co={co}
      present={(tags) => tags.some((t) => allTopics.has(t)) && !tags.every((t) => specialtyTopicSet.has(t))}
      isSubOn={(tags) => tags.every((t) => topics.has(t))}
      onSub={(tags) => toggle(tags)}
      axisOn={(t) => topics.has(t)}
      onAxis={(t) => toggle([t])}
      examPresent={(t) => allTopics.has(t)}
    />
  );
}

function SpecialtyPreview({ co, field }: { co: any; field: 'law' | 'biz' }) {
  const [topics, setTopics] = useState<Set<string>>(new Set());
  const items = domainsForField(field).filter((d) => d.profession).map((d) => ({ id: d.id, name: d.name, tag: PROFESSION_TAGS[d.id] ?? '', topics: d.topics }));
  const toggle = (tags: string[]) => setTopics((s) => {
    const n = new Set(s);
    const on = tags.every((t) => n.has(t));
    tags.forEach((t) => (on ? n.delete(t) : n.add(t)));
    return n;
  });
  return (
    <Step title="Which is closest to your work?" sub="Pick as many as fit. You can change this anytime.">
      {items.map((it, i) => (
        <FadeIn key={it.id} delay={i * 55} duration={260} offset={10}>
          <Opt label={it.name} note={it.tag} on={it.topics.every((t) => topics.has(t))} onPress={() => toggle(it.topics)} co={co} multi />
        </FadeIn>
      ))}
    </Step>
  );
}

// Chains the full real 3-stage flow (multi-select -> flashcard -> MCQ -> combined results) with
// the SAME key/aggregation pattern as onboarding.tsx, so tapping all the way through here proves
// the round-transition ("stuck") fix actually works end to end, not just that each screen renders.
function LevelFlowPreview({ co }: { co: any }) {
  const insets = useSafeAreaInsets();
  const words = SEED.filter((w) => w.field === 'gen' && !w.word.includes(' ')).slice(0, 12);
  const [step, setStep] = useState(0);
  const [missed, setMissed] = useState<any[]>([]);
  const add = (ws: any[]) => setMissed((m) => [...m, ...ws]);
  const next = () => setStep((s) => s + 1);
  const stages = ['multi1', 'multi2', 'card1', 'mcq', 'results'];
  const stage = stages[Math.min(step, stages.length - 1)];
  if (stage === 'multi1') return <MultiWordCheck key="multi1" co={co} words={words.slice(0, 5)} round={1} onNext={(m) => { add(m); next(); }} onBack={() => {}} insetTop={insets.top} insetBottom={insets.bottom} />;
  if (stage === 'multi2') return <MultiWordCheck key="multi2" co={co} words={words.slice(5, 10)} round={2} onNext={(m) => { add(m); next(); }} onBack={() => {}} insetTop={insets.top} insetBottom={insets.bottom} />;
  if (stage === 'card1') return <WordCheckScreen key="card1" co={co} words={words.slice(10, 12)} onNext={(m) => { add(m); next(); }} onBack={() => {}} insetTop={insets.top} insetBottom={insets.bottom} />;
  if (stage === 'mcq') return <Game mode="meaning" pool={SEED.filter((w) => w.field === 'gen')} n={2} distractors={1} assess seedLevelOnly onAssessDone={(m) => { add(m); next(); }} onExit={next} />;
  return <LevelResultsScreen co={co} missed={missed} onDone={() => {}} />;
}

// Renders the exam-readiness report with a KNOWN 2-month history (so the trend line - which
// only appears with 2+ real data points - is visible) without needing 48 real answers first.
// The data is shaped exactly like lib/exam-readiness.ts's computeResult output.
function ExamReportPreview({ co, insetTop }: { co: any; insetTop: number }) {
  const thisMonth = monthStr();
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  const prevMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const history: ReadinessResult[] = [
    {
      month: prevMonth, correct: 14, total: 24, ts: Date.now() - 30 * 86400000,
      domains: [
        { id: 'med:pharmacy', name: 'Pharmacy', correct: 1, total: 4, score: 25 },
        { id: 'exam', name: 'Exam wordlist', correct: 7, total: 12, score: 58.3 },
        { id: 'med:cardio', name: 'Cardiology', correct: 4, total: 5, score: 80 },
        { id: 'med:communication', name: 'Communication & OET', correct: 2, total: 3, score: 66.7 },
      ],
    },
    {
      month: thisMonth, correct: 18, total: 24, ts: Date.now(),
      domains: [
        { id: 'med:pharmacy', name: 'Pharmacy', correct: 2, total: 4, score: 50 },
        { id: 'med:communication', name: 'Communication & OET', correct: 2, total: 3, score: 66.7 },
        { id: 'exam', name: 'Exam wordlist', correct: 10, total: 12, score: 83.3 },
        { id: 'med:cardio', name: 'Cardiology', correct: 4, total: 4, score: 100 },
        { id: 'med:nursing', name: 'Nursing', correct: 0, total: 1, score: 0 },
      ],
    },
  ];
  return <ReadinessReportView co={co} history={history} examDate={isoInDays(38)} insetTop={0} onClose={() => {}} onStanding={() => {}} />;
}

// Seed/clear the exam-track AsyncStorage keys so the REAL Practice-hub tile and
// /exam-readiness screen can be driven live via deep links (bottom-anchored buttons DO
// receive synthetic taps, unlike option rows - see CLAUDE.md). "Seed" makes an IELTS user
// with an exam 45 days out; "Clear" restores a non-exam user (tile must disappear).
function ExamSetupPreview({ co }: { co: any }) {
  const [msg, setMsg] = useState('');
  const seed = async () => {
    await AsyncStorage.setItem('vorto.examDate', isoInDays(45));
    const topics: string[] = JSON.parse((await AsyncStorage.getItem('vorto.topics')) || '[]');
    if (!topics.includes('IELTS')) topics.push('IELTS');
    await AsyncStorage.setItem('vorto.topics', JSON.stringify(topics));
    setMsg(`Seeded: examDate=${isoInDays(45)}, +IELTS topic`);
  };
  const clear = async () => {
    await AsyncStorage.removeItem('vorto.examDate');
    const topics: string[] = JSON.parse((await AsyncStorage.getItem('vorto.topics')) || '[]');
    await AsyncStorage.setItem('vorto.topics', JSON.stringify(topics.filter((t) => t !== 'IELTS')));
    setMsg('Cleared exam track');
  };
  const reset = async () => {
    await AsyncStorage.removeItem('vorto.examReadiness');
    await AsyncStorage.removeItem('vorto.examReadinessHistory');
    setMsg('Reset readiness state + history');
  };
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', gap: 12, paddingBottom: 20 }}>
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: co.muted, marginBottom: 8 }}>{msg || 'Exam-track test harness'}</Text>
      <Pressable onPress={seed} style={{ backgroundColor: co.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
        <Text style={{ fontFamily: fonts.sansSemi, fontSize: 15, color: co.ink }}>Seed exam user (IELTS, 45d)</Text>
      </Pressable>
      <Pressable onPress={clear} style={{ backgroundColor: co.surface2, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
        <Text style={{ fontFamily: fonts.sansSemi, fontSize: 15, color: co.text }}>Clear exam track</Text>
      </Pressable>
      <Pressable onPress={reset} style={{ backgroundColor: co.surface2, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
        <Text style={{ fontFamily: fonts.sansSemi, fontSize: 15, color: co.text }}>Reset readiness state</Text>
      </Pressable>
    </View>
  );
}

// Dev preview of the pre-paywall "How your N days work" trial timeline. Fetches the live offering
// so the trial length + price reflect the real offer when StoreKit resolves; falls back to the
// configured 3-day copy otherwise.
function TrialPreview({ co }: { co: Parameters<typeof TrialTimeline>[0]['co'] }) {
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  useEffect(() => { getOffering().then(setOffering).catch(() => {}); }, []);
  return <TrialTimeline co={co} offering={offering} />;
}

// Dev preview of the feed's rarity dial pinned in its ENGAGED/turning state (previewOpen) — the
// PanResponder drag can't be driven reliably by synthetic mouse input in the sim, so this is the
// deterministic way to screenshot the transient word legend at each stop. Each row mimics the
// feed header's right-edge placement (right inset 26) with the legend appearing left of the knob.
function DialPreview({ co }: { co: ReturnType<typeof useApp>['palette'] }) {
  return (
    <View style={{ flex: 1, paddingTop: 40, gap: 64, alignItems: 'flex-end' }}>
      {(['practical', 'balanced', 'rare'] as const).map((v) => (
        <View key={v} style={{ height: 64, justifyContent: 'center' }}>
          <RarityDial co={co} value={v} onChange={() => {}} previewOpen />
        </View>
      ))}
      {/* resting control for comparison: bare knob, no words */}
      <View style={{ height: 44, justifyContent: 'center' }}>
        <RarityDial co={co} value={'balanced'} onChange={() => {}} />
      </View>
    </View>
  );
}
