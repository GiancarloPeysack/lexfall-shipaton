import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Animated, Easing, AccessibilityInfo, ImageBackground, Image, Platform, LayoutAnimation, UIManager, useWindowDimensions } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import FadeIn from '../components/FadeIn';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import ExamPicker from '../components/ExamPicker';
import type { PurchasesOffering } from 'react-native-purchases';
import { getOffering, purchase, findPackage, introTrialDays, annualAnchorPricing } from '../lib/purchases';
import Svg, { Path, SvgXml, Circle } from 'react-native-svg';
import fieldLaw from '../assets/illos/fieldLaw';
import fieldMed from '../assets/illos/fieldMed';
import fieldBiz from '../assets/illos/fieldBiz';
import fieldGen from '../assets/illos/fieldGen';
import { useApp } from '../lib/app-state';
import { speakWord, getVoicePref, setVoicePref } from '../lib/speak';
import { PREMIUM_VOICES, DEFAULT_VOICE_ID } from '../lib/premium-voices';
import { feedBgFor } from '../lib/feed-bg';
import { setWordCollection } from '../lib/db';
import { rescheduleReminders, scheduleTrialReminder } from '../lib/notifications';
import { track, Events } from '../lib/analytics';
import { t } from '../lib/i18n';
import { FieldId, inField, Word } from '../data/types';
import { PROFESSIONS } from '../data/categories';
import {
  MED_PROFESSIONS, MED_SKILLS, MED_SPECIALTIES, MED_CORE_TOPICS,
  MED_PURPOSES, Purpose, MED_SKILL_CHIPS, MED_SKILL_DEFAULT_TOPICS,
} from '../data/med-taxonomy';
import { SEED } from '../data/words';
import { preferInsiderVocab } from '../lib/insider-words';
import { domainsForField } from '../data/domains';
import { fonts, label, Palette, ACCENTS } from '../theme/tokens';
import PressBounce from '../components/PressBounce';
import AppearancePicker from '../components/AppearancePicker';
import Illo, { IlloName, ProfIcon, ProfIconName, WidgetScene, PersonScene, illoFor } from '../components/Illustrations';
import { PaywallView } from '../components/Paywall';
import Game from '../components/Game';
import AnimatedBook from '../components/AnimatedBook';
import AnimatedScales from '../components/AnimatedScales';
import ReadingScene from '../components/scenes/ReadingScene';
import GearsScene from '../components/scenes/GearsScene';
import Segment from '../components/Segment';
import AreaPicker, { auditAreaCoverage } from '../components/AreaPicker';
import { DISPLAY_AREAS, EXAM_TAGS, WORDTYPE_TAGS } from '../data/display-areas';
import { REVIEWS } from '../data/reviews';
import { pickPremiumWords, excludeGradedBasic } from '../data/word-levels';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const commas = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// The flow is an ordered list of "slots", built DYNAMICALLY from the user's choices
// (see `slots` useMemo below). After picking a vertical we personalise: purpose →
// (exam type → exam date) → their field's areas → "other words too?". Value/commitment
// SCENES are interspersed so the hard paywall is earned (onboarding + paywall = one funnel).
type Slot =
  | 'intro' | 'sceneDaily' | 'scenePeople' | 'profession' | 'purpose' | 'specialty'
  | 'areas' | 'exam' | 'sceneField' | 'sceneHabit'
  | 'source' | 'age' | 'name' | 'multiCheck' | 'multiCheck2' | 'levelCheck' | 'placement' | 'levelResults' | 'building' | 'reminders'
  | 'sceneWidget' | 'sceneNotif' | 'aha' | 'retention' | 'different' | 'testimonials'
  | 'personalize' | 'feedStyle' | 'trial' | 'paywall' | 'wordPref';
const SKIPPABLE: Slot[] = ['source', 'age', 'placement', 'wordPref'];

// Purpose presets for the non-medical professional fields (medicine has its own richer
// set in med-taxonomy). One merged screen = exam identity + intent, mutually exclusive.
// "Work" leads for all three fields (owner, 2026-09-10): most users are already IN the field,
// not studying for a specific exam - that option should be the first thing they see, not buried
// after the exam options.
const LAW_PURPOSES: Purpose[] = [
  { id: 'work', label: 'I already work in law', note: 'Sharpen my legal English', exam: false },
  { id: 'toles', label: 'TOLES', note: 'Test of Legal English Skills', exam: true, migrating: true },
  { id: 'ielts', label: 'IELTS', note: 'Academic English', exam: true, migrating: true },
  { id: 'vocab', label: 'Just building my vocabulary', note: 'No exam in mind', exam: false },
];
// TOEIC and Linguaskill Business are the two real, currently-active business-English
// certifications (BULATS and BEC were both discontinued outside China) - the direct business
// equivalent of Medicine's OET / Law's TOLES, so those two get exam:true (real wordlist + a
// countdown that means something). MBA/grad school is a genuine, distinct motivation (case
// studies, GMAT/GRE verbal, admissions essays, cohort discussion) but isn't a proctored English
// exam with a scored wordlist - so it's exam:false, no exam-date countdown, but still gets its
// own goal (content naturally overlaps: negotiation, strategy, finance, economics, management).
export const BIZ_PURPOSES: Purpose[] = [
  { id: 'work', label: 'For my work', note: 'Sharpen my business English', exam: false, migrating: true },
  { id: 'toeic', label: 'TOEIC', note: 'Test of English for International Communication', exam: true, migrating: true },
  { id: 'linguaskill', label: 'Linguaskill Business', note: 'Cambridge business English', exam: true, migrating: true },
  { id: 'mba', label: 'MBA / grad school', note: 'Case studies, applications, seminars', exam: false, migrating: true },
  { id: 'vocab', label: 'Just building my vocabulary', note: 'No exam in mind', exam: false },
];
// General field's own purpose set (owner, 2026-09-11: exam wordlists like Cambridge/GRE showed
// up unchecked with no earlier question to draw a pre-select from - general never had a 'purpose'
// step at all, unlike the three professional fields). Mirrors that same pattern.
const GEN_PURPOSES: Purpose[] = [
  { id: 'vocab', label: 'Just building my vocabulary', note: 'No exam in mind', exam: false },
  { id: 'cae', label: 'Cambridge C1 Advanced (CAE)', note: 'Cambridge English exam', exam: true },
  { id: 'cpe', label: 'Cambridge C2 Proficiency (CPE)', note: 'Cambridge English exam', exam: true },
  { id: 'gre', label: 'GRE Verbal', note: 'Grad school admissions', exam: true },
];

// Maps a purpose id (med/law/biz/gen's own exam:true options) to its EXAM_TAGS string(s), so the
// 'areas' screen's exam-wordlist axis can pre-select the exam they just told us about instead
// of showing up blank ("TOEIC" has no real wordlist tag in the corpus - deliberately unmapped).
// Cambridge/GRE each have a "(part 2)" companion tag in the corpus - both get pre-selected.
const PURPOSE_EXAM_TAG: Record<string, string | string[]> = {
  oet: 'OET', ielts: 'IELTS', plab: 'PLAB', toles: 'TOLES', linguaskill: 'Linguaskill Business',
  cae: ['Cambridge C1 Advanced', 'Cambridge C1 (part 2)'],
  cpe: ['Cambridge C2 Proficiency', 'Cambridge C2 (part 2)'],
  gre: ['GRE Verbal', 'GRE Verbal (part 2)'],
};

// Short descriptor lines for the dedicated profession-pick screen (law/biz), matching the
// style of Medicine's own MED_PROFESSIONS.tag ("Ward, patient care, NMC/AHPRA").
export const PROFESSION_TAGS: Record<string, string> = {
  'biz:startups': 'Fundraising, growth, equity',
  'biz:finance': 'Markets, banking, valuation',
  'biz:economics': 'Macro, micro, policy',
  'biz:consulting': 'Frameworks, case work, growth',
  'biz:hr': 'Talent, culture, comp',
  'biz:data': 'Analytics, product, tech',
  'biz:negotiation': 'Deals, contracts, meetings',
  'biz:management': 'Leadership, projects, supply chain',
  'biz:marketing': 'Brand, campaigns, closing deals',
  'law:litigation': 'Court, evidence, advocacy',
  'law:corporate': 'M&A, governance, banking law',
  'law:contracts': 'Drafting, clauses, collocations',
  'law:property': 'Conveyancing, land, trusts',
  'law:ip': 'Patents, privacy, data law',
  'law:public': 'Constitutional, EU, immigration',
  'law:specialist': 'Tax, employment, family law',
};

// The level-check word pool: the user's actual `topics` selection wins (their real
// personalization - field + profession + whatever they trimmed on the areas screen), falling back
// to the whole profession, then the whole field, only when a narrower pool matches zero words.
// Extracted to a pure function (task #27) so it can be exercised directly from dev-capture instead
// of only observed indirectly through the live component tree.
// The level-check needs at least 16 words (12 for the flashcard/multi-select stages + up to 16
// for the MCQ pool) - a narrow topic/specialty pick can legitimately match only a handful of
// words, which used to be accepted outright and left later rounds (e.g. MultiWordCheck's
// slice(5,10)) with almost nothing to show (owner, 2026-09-11 v3: "why is there just one word...
// never have this"). Each tier now only "wins" if it actually clears the minimum; otherwise it
// falls through to the next, wider tier instead of committing to a too-small pool.
const LEVEL_CHECK_MIN = 16;
export function computeLevelCheckPool(field: FieldId, topics: Set<string>, primaryProf?: { topics: string[] }): Word[] {
  // excludeGradedBasic: Lexfall is C1-C2 always - never surface a word we've honestly graded
  // B1/A2, even as a fallback (owner, 2026-09-11). Ungraded words are unaffected.
  const base = (w: Word) => w.field === field && !w.word.includes(' ') && !!w.def && !!w.ex;
  if (topics.size) {
    const scoped = excludeGradedBasic(SEED.filter((w) => base(w) && topics.has(w.topic)));
    if (scoped.length >= LEVEL_CHECK_MIN) return scoped;
  }
  if (primaryProf) {
    const profScoped = excludeGradedBasic(SEED.filter((w) => base(w) && primaryProf.topics.includes(w.topic)));
    if (profScoped.length >= LEVEL_CHECK_MIN) return profScoped;
  }
  // Widest tier: the whole field. If even this is under the minimum, it's a genuinely thin
  // field/corpus gap, not a scoping bug - return it anyway (better than throwing/blocking
  // onboarding), the slice-based callers already tolerate fewer words than requested.
  return excludeGradedBasic(SEED.filter(base));
}

// Native time picker for the Start/End hour rows (owner, 2026-09-11): tapping the "9:00"/"22:00"
// number itself opens this, alongside the existing -/+ steppers for fine adjustment. Android's
// native picker is a one-shot system dialog (fires once then closes itself), so onDone there;
// iOS's spinner stays open and live-updates, so it needs its own explicit "Done" close.
export function TimeWheel({ co, theme, hour, onChange, onDone }: { co: Palette; theme: 'dark' | 'light'; hour: number; onChange: (h: number) => void; onDone: () => void }) {
  const s = makeStyles(co);
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return (
    <View style={s.timeWheelWrap}>
      <DateTimePicker
        value={date}
        mode="time"
        is24Hour
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        // Bug fix (owner, 2026-09-11): the picker defaulted to the OS's own dark-mode chrome (this
        // app forces userInterfaceStyle:"dark" at the app.json level, which the native picker reads
        // as a hint) - white text on this screen's cream card, essentially invisible. Tie it to the
        // app's OWN light/dark theme instead, since that's what the surrounding card actually uses.
        themeVariant={theme}
        onChange={(event, selected) => {
          if (Platform.OS === 'android') {
            onDone();
            if (event.type === 'set' && selected) onChange(selected.getHours());
          } else if (selected) {
            onChange(selected.getHours());
          }
        }}
      />
      {Platform.OS === 'ios' && (
        <Pressable onPress={onDone} style={s.timeWheelDone}><Text style={s.timeWheelDoneTxt}>Done</Text></Pressable>
      )}
    </View>
  );
}

// Words-per-day's own native wheel (owner, 2026-09-11: "words per day should also be clickable"),
// same tap-to-open pattern as TimeWheel - explicit itemStyle/color so it doesn't repeat the
// white-text-on-light-card bug the time picker had.
export function CountWheel({ co, value, min, max, onChange, onDone }: { co: Palette; value: number; min: number; max: number; onChange: (n: number) => void; onDone: () => void }) {
  const s = makeStyles(co);
  const items: number[] = [];
  for (let n = min; n <= max; n++) items.push(n);
  return (
    <View style={s.timeWheelWrap}>
      <Picker selectedValue={value} onValueChange={(v) => onChange(Number(v))} itemStyle={{ color: co.text }}>
        {items.map((n) => <Picker.Item key={n} label={String(n)} value={n} color={Platform.OS === 'android' ? co.text : undefined} />)}
      </Picker>
      <Pressable onPress={onDone} style={s.timeWheelDone}><Text style={s.timeWheelDoneTxt}>Done</Text></Pressable>
    </View>
  );
}

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { field, setField, name, setName, setGoal, palette: co, refreshEntitlement, examDate, setExamDate, isPro, wordPref, setWordPref, theme } = useApp();
  const styles = makeStyles(co);

  const [step, setStep] = useState(0);

  // Multi-select (owner, 2026-09-11): someone can genuinely be working toward TWO things at once
  // (e.g. already works in law AND is sitting TOLES) - was a single radio id.
  const [purposeIds, setPurposeIds] = useState<Set<string>>(new Set());
  const [perDay, setPerDay] = useState(10);
  const [fromH, setFromH] = useState(9);
  const [toH, setToH] = useState(22);
  // Tapping the "9:00"/"22:00" number opens the native time picker for fast big jumps, alongside
  // the existing -/+ steppers for fine adjustment (owner, 2026-09-11).
  const [timeEdit, setTimeEdit] = useState<'from' | 'to' | null>(null);
  const [countEdit, setCountEdit] = useState(false);
  const [source, setSource] = useState('');
  const [age, setAge] = useState('');
  const [rating, setRating] = useState('');
  const [pickedField, setPickedField] = useState(''); // gate: nothing pre-selected on the profession screen
  const [reduceMotion, setReduceMotion] = useState(false);
  const [buildDone, setBuildDone] = useState(false); // gates Continue on the "building profile" screen
  const [topics, setTopics] = useState<Set<string>>(new Set());
  // Which specialty/ies the user EXPLICITLY tapped on the 'specialty' screen - tracked
  // separately from `topics` because some professions' topics (e.g. biz:negotiation) are also
  // part of the default core seed for the whole field, which made that chip render as
  // already-checked with nobody having tapped it (owner-reported, 2026-09-10).
  const [pickedSpecialtyIds, setPickedSpecialtyIds] = useState<Set<string>>(new Set());
  const [specialtyQuery, setSpecialtyQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [horizon, setHorizon] = useState('90'); // "aha" projection window, in days
  const [examPicked, setExamPicked] = useState(false); // any exam-date answer made (incl. "Not booked yet")

  // --- Adaptive flow: the slot list is derived from the vertical + purpose ---
  const professional = field === 'med' || field === 'law' || field === 'biz';
  const purposes = field === 'med' ? MED_PURPOSES : field === 'law' ? LAW_PURPOSES : field === 'biz' ? BIZ_PURPOSES : GEN_PURPOSES;
  const selectedPurposes = purposes.filter((p) => purposeIds.has(p.id));
  const wantsExamDate = selectedPurposes.some((p) => p.exam);                        // any dated exam picked → ask when
  const migrating = selectedPurposes.some((p) => p.exam || p.migrating);             // abroad path → seed OET comms + firmer pace

  // Does the 'areas' screen have anything left to actually DECIDE? Biz has zero non-profession
  // display areas at all (every domain is section:'Professions'), and law's one non-profession
  // area ("Skills & language") is always 100% pre-seeded by defaultAreaSeed's PRO_CORE_DOMAINS -
  // so both fields showed this screen to EVERY user with either nothing or one already-checked
  // item and no real choice to make (owner-reported, 2026-09-10: "if this doesn't have anything
  // just take it out"). Skip the whole step when every remaining tag (area or, when relevant,
  // the exam axis) is already in `topics` - i.e. there's no unpicked option left to surface.
  const areasHasContent = useMemo(() => {
    const areas = (DISPLAY_AREAS[field] ?? []).filter((a) => !a.isProfession);
    const hasUnpickedArea = areas.some((a) => a.subAreas.some((sub) => sub.tags.some((t) => !topics.has(t))));
    const hasUnpickedAxis = (!professional || wantsExamDate) && [...EXAM_TAGS, ...WORDTYPE_TAGS].some((t) => !topics.has(t));
    return hasUnpickedArea || hasUnpickedAxis;
  }, [field, professional, wantsExamDate, topics]);

  const slots = useMemo<Slot[]>(() => {
    // "Learn without opening the app" moved up right after the field pick (was much later, paired
    // with sceneNotif near reminders) - a low-effort hook that lands better right after we know
    // their field (mock can be field-relevant) than after the whole personalization+testing block.
    // sceneNotif stays where it was, paired with reminders (see slots comment below).
    const s: Slot[] = ['intro', 'profession', 'sceneWidget'];
    if (professional) {
      s.push('purpose');
      if (wantsExamDate) s.push('exam');
      // Specialty (who you are: Nursing, Litigation, Startups...) is its own identity screen,
      // BEFORE the fine-tune areas screen (which now only holds what's left: skills/language/
      // specialist topics). Sub-niche pick comes before the value preview so "the words nursing
      // runs on" is real. 'areas' itself is skipped when it has nothing left to decide (see
      // areasHasContent) - biz always hit this, law always showed one item already pre-checked.
      s.push('specialty');
      if (areasHasContent) s.push('areas');
    } else if (field === 'gen') {
      // General has no 'specialty' identity screen (no sub-niche), but it now asks the same
      // "which exam" question the professional fields do, so Cambridge/GRE wordlists can
      // pre-select on 'areas' instead of showing up blank (owner, 2026-09-11).
      s.push('purpose');
      if (wantsExamDate) s.push('exam');
      s.push('areas');
    } else {
      s.push('areas');
    }
    // feedStyle (photo or no) then personalize (voice/color) now land right after areas, before
    // the level test (owner, 2026-09-11 v2 reorder) - was much later, paired with 'building'.
    s.push('feedStyle', 'personalize');
    // Three level-check stages, right after personalization, in this exact order (owner-
    // confirmed): multi-select tap-list (2 rounds) -> single-card flashcard (2 rounds) -> MCQ
    // (2 questions) -> ONE combined results screen aggregating every missed word across all three
    // (levelResults), Save for practice + Saved pop, then onward.
    // 'projection' (a fixed-1-year count-up screen) was cut: it told the identical "words known
    // by X" story as 'aha' one screen earlier with the same perDay*days math, just less
    // personalized (no exam-date awareness). Its count-up+haptic flourish now lives on aha's own
    // stat instead - same polish, one fewer screen. Kept as a dev-capture-only component.
    // 'ready' (a static "you're all set: field/pace/hours + 3 checkmark chips" recap) was cut -
    // its one load-bearing fact (the schedule) now opens 'aha' as its eyebrow instead of the
    // generic "Your library" line (see below), so 'aha' arrives as the payoff right after the
    // notification-permission ask instead of a breather screen first.
    // Flashcard stage first (owner, 2026-09-11): screens 1-2 of the 6-screen level test, then the
    // multi-select tap-list (3-4), then the MCQ (5-6). Word-pool slicing per stage is unchanged -
    // only the order they're shown in and their counter numbers moved.
    s.push('levelCheck', 'multiCheck', 'multiCheck2', 'placement', 'levelResults', 'building', 'aha', 'name', 'sceneNotif');
    // Pace/schedule ("Words throughout your day") moved to just before the closing pair
    // (retention, different), right before the paywall run-up (owner, 2026-09-11 v2): "after the
    // test and after the other ones, just before the last 2 before the paywall."
    s.push('reminders', 'retention', 'different');
    // Social proof lands right before the paywall - ONLY if we have real reviews (never faked).
    if (REVIEWS.length) s.push('testimonials');
    s.push('trial', 'paywall');
    // Word difficulty (Practical/Balanced/Rare) moved off the pace screen to its own quiet screen
    // right after the paywall moment (owner, 2026-09-11 v2: "maybe added after the user logs in
    // or has payed, before going to the feed") - skippable, no gate.
    s.push('wordPref');
    // Demographics (age, how-you-heard) moved to AFTER the paywall (purchase or skip) - no
    // bureaucratic gate sits between the user and checking out. onboardingPaywallDone() steps
    // into these instead of exiting once there's more of the array left to show.
    s.push('age', 'source');
    return s;
  }, [professional, wantsExamDate, areasHasContent]);

  const slot = slots[Math.min(step, slots.length - 1)];
  const isLast = step === slots.length - 1;

  // Per-screen funnel visibility: with 25-28 slots and no prior instrumentation, there was no way
  // to see WHERE users actually abandon (only whether they finished at all, via
  // Events.OnboardingComplete). Fires once per distinct slot reached, not on every re-render.
  useEffect(() => {
    track(Events.OnboardingStepView, { slot, step, of: slots.length });
  }, [slot]);

  // Words waiting for this user: their picked areas if any, else the whole field.
  // Drives the first-session "aha" (count + samples + words-by-exam-date projection).
  // The aha "your library" count = the FULL field library the subscription unlocks, NOT the
  // narrowed area pick. The picker personalises the FEED; it must not cap the library promise
  // (a 4-area default was showing e.g. 120 of General's 1,619). Grows with the corpus.
  const ahaLibrary = useMemo(() => SEED.filter((w) => inField(w.field, field)), [field]);

  // Deliberately NOT inField() here: a professional field's word POOL borrows General's words
  // for volume (by design), but General's own ~400 unmapped micro-topics are an already-known,
  // already-accepted gap (it has its own "More topics" fallback) - auditing them again under
  // Law/Medicine's OWN display-area mapping just re-surfaces that same known gap as a false
  // "unmapped for law/med" warning. Coverage should only be checked against topics this field
  // actually owns.
  const fieldTopics = useMemo(
    () => [...new Set(SEED.filter((w) => w.field === field).map((w) => w.topic))],
    [field]
  );
  // Pace screen's word preview - was a bare SEED.find() (first word matching field, no quality
  // filter at all). Now runs through the same excludeGradedBasic + preferInsiderVocab + premium
  // pipeline as the other onboarding preview screens (owner, 2026-09-11: "always C1-C2 here"),
  // and cycles through a handful of candidates every ~2.5s instead of freezing on one word.
  const previewWords = useMemo(() => {
    const scoped = topics && topics.size ? SEED.filter((w) => topics.has(w.topic) && w.ex) : [];
    const scopedPool = scoped.length ? scoped : SEED.filter((w) => w.field === field && w.ex);
    const cleanScoped = excludeGradedBasic(scopedPool);
    const rawPool = cleanScoped.length ? cleanScoped : scopedPool;
    const insider = preferInsiderVocab(rawPool);
    // Prefer a short-enough definition so the fixed-height card (owner, 2026-09-11: card was
    // resizing per word, shifting the whole screen) never needs to truncate one mid-sentence.
    const isShort = (w: Word) => `(${w.pos}) ${w.def}`.length <= 90;
    const short = insider.filter(isShort);
    const pool = short.length >= 5 ? short : insider;
    const premium = pickPremiumWords(pool, 5, { pref: wordPref });
    if (premium) return premium;
    return [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
  }, [field, topics, wordPref]);
  const [previewIdx, setPreviewIdx] = useState(0);
  useEffect(() => {
    if (previewWords.length < 2) return;
    const iv = setInterval(() => setPreviewIdx((i) => (i + 1) % previewWords.length), 4000);
    return () => clearInterval(iv);
  }, [previewWords]);
  const previewWord = previewWords[previewIdx] ?? previewWords[0];

  const allTopics = useMemo(() => new Set(SEED.map((w) => w.topic)), []);

  // Load the live offering once so the paywall slot shows real prices and
  // startTrial buys the exact plan the copy advertises.
  useEffect(() => { getOffering().then(setOffering).catch(() => {}); }, []);

  const present = (list: string[]) => list.filter((t) => allTopics.has(t));

  // The dedicated "which is closest to your work?" identity screen: profession-level items
  // (Nursing/Doctor.../Litigation.../Startups...), sourced per field. Medicine reuses its own
  // richer MED_PROFESSIONS (with real tag lines already); law/biz read the `profession: true`
  // domains plus the authored PROFESSION_TAGS descriptor. Items with zero shipped words for
  // this install are dropped rather than shown empty.
  // "General" (owner-directed, 2026-09-10, after asking whether a mandatory specialty pick is
  // too much friction): a mandatory single-tap choice per screen is a proven, low-friction
  // onboarding pattern as long as everyone has a genuine option to pick - the real risk isn't
  // the requirement itself, it's someone who doesn't see themselves in ANY listed specialty
  // hitting a dead end. So this is a REAL, ordinary specialtyItems entry (not pre-ticked, not
  // exempt from "must pick at least one" - that would just reintroduce the silent-default problem
  // fixed earlier tonight): an honest "none of these fit exactly" option, one deliberate tap like
  // any other. Its topics are the field's baseline/everyday vocabulary (exactly what
  // defaultAreaSeed's PRO_CORE_DOMAINS core entry / MED_CORE_TOPICS already seed by default).
  // isGeneral marks it so primaryProf's NAME derivation can skip it (so a General-only pick
  // doesn't produce a paywall headline like "Master the advanced lexicon of General") while still
  // letting its topics count normally everywhere else (level-check pool, feed personalization).
  const GENERAL_TAG: Record<string, string> = { med: 'Everyday clinical English', law: 'Everyday legal English', biz: 'Everyday business English' };
  const specialtyItems = useMemo(() => {
    let items: { id: string; name: string; tag: string; topics: string[]; isGeneral?: boolean }[] = [];
    if (field === 'med') {
      items = MED_PROFESSIONS.map((p) => ({ id: p.id, name: p.name, tag: p.tag, topics: present(p.topics) })).filter((it) => it.topics.length > 0);
    } else if (field === 'law' || field === 'biz') {
      items = domainsForField(field).filter((d) => d.profession).map((d) => ({ id: d.id, name: d.name, tag: PROFESSION_TAGS[d.id] ?? '', topics: present(d.topics) })).filter((it) => it.topics.length > 0);
    } else {
      return [];
    }
    const coreDomain = domainsForField(field).find((d) => d.id === `${field}:core`);
    const coreTopics = present(field === 'med' ? MED_CORE_TOPICS : coreDomain?.topics ?? []);
    if (coreTopics.length > 0) {
      items = [...items, { id: `${field}:general`, name: 'General', tag: GENERAL_TAG[field] ?? '', topics: coreTopics, isGeneral: true }];
    }
    return items;
  }, [field, allTopics]);
  // RAW topics covered by the specialty/specialties the user actually PICKED (not present()-
  // filtered - the 'areas' step's subArea tags are the raw, uncollapsed domain.topics too, so
  // this must match on the same basis or a canonicalised-away string like 'Management' - present
  // in the raw list but never in allTopics since real words carry 'Management & organisation' -
  // breaks the every() check below and the profession silently reappears in 'areas').
  // BUG (found 2026-09-04): this used to union EVERY profession domain's topics for law/biz,
  // not just the one(s) the user picked on 'specialty' - since virtually every law/biz domain is
  // profession:true, that excluded nearly the entire 'areas' picker for every user regardless of
  // which specialty they chose (biz: 10/10 sub-areas hidden, law: 7/8) - a live onboarding bug,
  // not a data gap (`npm run check:taxonomy` was clean). Now scoped to the picked specialty/ies,
  // matching the subtitle's own claim ("X already covers Y - add anything else").
  const specialtyTopicSet = useMemo(() => {
    if (field === 'med') return new Set(MED_PROFESSIONS.flatMap((p) => p.topics));
    if (field === 'law' || field === 'biz') {
      const picked = specialtyItems.filter((it) => pickedSpecialtyIds.has(it.id));
      return new Set(picked.flatMap((it) => it.topics));
    }
    return new Set<string>();
  }, [field, specialtyItems, pickedSpecialtyIds]);

  // Default follow-set per field. Generalists (gen/new) get EVERYTHING on (broad-first) so the
  // picker is a "trim what you don't want" tool and skippers keep the full library. SPECIALIST
  // fields (med/law/biz) instead seed the field's UNIVERSAL core (general professional English +
  // how the field communicates) and let the user add their specialty - all-on would feed a
  // finance person HR words and a GP oncology words. Not arbitrary: it's the taxonomy's own
  // Core/comms domains, excluding the profession:true specialties. Follows bias the feed (#82).
  const PRO_CORE_DOMAINS: Partial<Record<FieldId, string[]>> = {
    biz: ['biz:core', 'biz:negotiation'],   // General business English + Negotiation & deal-making
    law: ['law:core', 'law:skills'],  // General legal English + Register, Latin & letters
  };
  const defaultAreaSeed = (f: FieldId): string[] => {
    if (f === 'med') return present(MED_CORE_TOPICS);
    const coreIds = PRO_CORE_DOMAINS[f];
    if (coreIds) return domainsForField(f).filter((d) => coreIds.includes(d.id)).flatMap((d) => present(d.topics));
    return (DISPLAY_AREAS[f] ?? []).flatMap((a) => a.subAreas).flatMap((sub) => present(sub.tags));
  };

  // Picking a vertical seeds a broad default (every present area followed) so the user starts
  // with the whole library and trims from there. EXCEPTION: medicine stays profession-driven -
  // specialties diverge too much for "all on" (a GP shouldn't start on oncology/neurology), so
  // it seeds core clinical English and the profession pick adds the relevant skills.
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {}); }, []);

  useEffect(() => {
    setPurposeIds(new Set());
    setExamPicked(false);
    setTopics(new Set(defaultAreaSeed(field)));
    setPickedSpecialtyIds(new Set());
    setSpecialtyQuery('');
  }, [field]);

  // Dev guard: a live topic that maps to no display area/axis surfaces here in testing
  // (a console warn) rather than as a mystery chip in front of a user.
  useEffect(() => { auditAreaCoverage(field, fieldTopics); }, [field, fieldTopics]);

  // The purpose choice guides personalisation. Exam-bound users get the OET communication
  // skills seeded (letters/handover/patient talk = what the exam tests) and a firmer daily
  // pace; "already working / just vocab" leans lighter (weekly, no deadline pressure).
  useEffect(() => {
    if (purposeIds.size === 0) return;
    // Downgrading to no-exam-selected purposes must clear any exam date set earlier, so a stale
    // examDate can't leak into the app with no exam behind it (the 'exam' slot is also dropped).
    if (!wantsExamDate && examDate) setExamDate('');
    if (migrating) {
      setPerDay((n) => Math.max(n, 10));
      if (field === 'med') setTopics((s) => { const n = new Set(s); present(MED_SKILL_DEFAULT_TOPICS).forEach((t) => n.add(t)); return n; });
    } else {
      setPerDay((n) => Math.min(n, 6));
    }
    // Pre-select every exam wordlist they just told us about (can be more than one now - e.g.
    // both TOLES and IELTS picked, or Cambridge's two-part tag pair), so the 'areas' screen's
    // exam axis never shows up blank.
    const tags = selectedPurposes.filter((p) => p.exam).flatMap((p) => {
      const t = PURPOSE_EXAM_TAG[p.id];
      return t ? (Array.isArray(t) ? t : [t]) : [];
    });
    if (tags.length) setTopics((s) => { const n = new Set(s); tags.forEach((t) => { if (allTopics.has(t)) n.add(t); }); return n; });
  }, [purposeIds]);

  const toggleTopic = (t: string) => {
    Haptics.selectionAsync().catch(() => {});
    const n = new Set(topics);
    n.has(t) ? n.delete(t) : n.add(t);
    setTopics(n);
  };
  const toggleCat = (id: string) => setOpenCats((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // A medicine "sub-niche" (profession/skill/specialty) is followed when every one of
  // its (present) topics is in the follow-set. Toggling adds/removes the whole set.
  // Topic-array versions (used by the shared AreaPicker's multi-select wiring).
  const followsAll = (tp: string[]) => { const p = present(tp); return p.length > 0 && p.every((t) => topics.has(t)); };
  const toggleTopics = (tp: string[]) => { Haptics.selectionAsync().catch(() => {}); const p = present(tp); const on = followsAll(tp); setTopics((s) => { const n = new Set(s); p.forEach((t) => (on ? n.delete(t) : n.add(t))); return n; });
  };
  // The 'specialty' screen's own toggle - deliberately NOT toggleTopics/followsAll, whose on/off
  // decision reads the shared `topics` Set. A specialty's topics can already be present there
  // via the default core seed (e.g. biz:negotiation) with nobody having picked it, so a
  // topics-based toggle would read "already on" and immediately remove it on first tap instead
  // of establishing it as a real pick. pickedSpecialtyIds is the sole source of truth for on/off.
  const toggleSpecialty = (it: { id: string; topics: string[] }) => {
    Haptics.selectionAsync().catch(() => {});
    const already = pickedSpecialtyIds.has(it.id);
    setPickedSpecialtyIds((s) => { const n = new Set(s); already ? n.delete(it.id) : n.add(it.id); return n; });
    setTopics((s) => { const n = new Set(s); present(it.topics).forEach((t) => (already ? n.delete(t) : n.add(t))); return n; });
  };
  // The profession(s) they actually picked drive the personalised value line ("the words
  // nursing runs on" / "the words negotiation & deal-making runs on") + the sample words on
  // the following scene. Was med-only (MED_PROFESSIONS is the richer, pre-existing list); law/biz
  // never wired their own new specialty pick into this at all, so their SceneField silently fell
  // back to a generic "Words worth knowing well" headline even after picking a specific profession.
  // specialtyItems already covers all three fields uniformly ({id,name,tag,topics}), so reuse it.
  //
  // BUG (found 2026-09-09, owner question): the specialty picker is multi-select (`<Opt ... multi
  // />`), but this used to be `.find()` - the first matching specialty only. Someone who picked
  // BOTH "Negotiation & deal-making" and "Marketing & sales" would silently only ever see one of
  // them echoed back (whichever sorts first in domainsForField's array), on the paywall headline,
  // the sceneField value screen, AND the level-check word pool - not a display quirk, an actual
  // personalization gap. Now: collect every match, union their topics for scoping (levelCheckPool/
  // sceneField sampling), and build a readable name label (1 -> its name, 2 -> "A and B", 3+ -> no
  // name at all rather than an awkward list - each consumer already has its own generic fallback
  // copy for "no specific profession", which reads better than cramming in 3+ names).
  // Driven by pickedSpecialtyIds (explicit taps), NOT a topics-overlap check - a topics-based
  // check would also true-positive on default-seeded core topics nobody actually picked (see
  // pickedSpecialtyIds comment above), silently mislabeling the paywall headline/personalization.
  const pickedProfs = useMemo(() => specialtyItems.filter((it) => pickedSpecialtyIds.has(it.id)), [specialtyItems, pickedSpecialtyIds]);
  const primaryProf = useMemo(() => {
    if (pickedProfs.length === 0) return undefined;
    const unionTopics = [...new Set(pickedProfs.flatMap((p) => p.topics))];
    // "General" is deliberately excluded from the NAME (never "Master the advanced lexicon of
    // General") but its topics still count in unionTopics like any other pick - a General-only
    // user lands on the same undefined-name fallback copy already built for 3+ picks.
    const namedProfs = pickedProfs.filter((p) => !p.isGeneral);
    const name = namedProfs.length === 1 ? namedProfs[0].name
      : namedProfs.length === 2 ? `${namedProfs[0].name} and ${namedProfs[1].name}`
      : undefined;
    return { name, topics: unionTopics };
  }, [pickedProfs]);

  // Sample cards use the SAME profession-first selection as the old "words worth knowing well"
  // preview (formerly its own screen, SceneField, now folded into this one - showing near-identical
  // curated samples on two consecutive screens was redundant): prioritize the picked PROFESSION's
  // own topics, falling back to the broader topic pick, then the whole field. Within whichever pool
  // wins, prefer graded PREMIUM (C1/C2) words ranked by rarity (pickPremiumWords) - never lead with
  // a word we now know is only B1/B2; falls back to preferInsiderVocab+shuffle when this pool has
  // too little graded coverage yet (starter 400-word batch, not the whole corpus).
  const ahaSamples = useMemo(() => {
    const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
    const profTopics = primaryProf?.topics;
    const profPool = profTopics && profTopics.length ? SEED.filter((w) => profTopics.includes(w.topic)) : [];
    const inTopics = topics.size ? SEED.filter((w) => topics.has(w.topic)) : [];
    const rawPool = profPool.length >= 3 ? profPool : inTopics.length ? inTopics : ahaLibrary;
    const gradedClean = excludeGradedBasic(rawPool);
    const pool = gradedClean.length >= 3 ? gradedClean : rawPool;
    // Card caps the definition at 2 lines (numberOfLines) - a long one gets cut mid-word
    // ("...vital principle directing it tow..."), which the house rule already bans (WordCard,
    // 2026-08-19: never leave a definition unfinished). Prefer one short enough to read complete.
    const isShort = (w: Word) => `(${w.pos}) ${w.def}`.length <= 100;
    const shortPool = pool.filter(isShort);
    const lengthSafe = shortPool.length >= 3 ? shortPool : pool;
    // preferInsiderVocab FIRST (drops jargon acronyms/phrases/overexposed words - a graded C1/C2
    // phrase like "tender offer" is still not the single striking word this moment wants), THEN
    // prefer graded premium-by-rarity within what's left.
    const cleaned = preferInsiderVocab(lengthSafe);
    return pickPremiumWords(cleaned, 3) ?? shuffle(cleaned);
  }, [primaryProf, topics, ahaLibrary]);

  // Word pool for the "tap the words you know" level-check flashcards. Single-word items only,
  // scoped to THIS field so General isn't tested on medical/legal jargon. Owner correction
  // (2026-08-26, task #27): this used to prioritize the whole PROFESSION's topics over the user's
  // own `topics` picks (only falling back to `topics` if the profession pool was under 20 words) -
  // in practice nearly every profession clears 20, so a user's deliberate narrowing on the 'areas'
  // screen was silently ignored and the level-check always tested the full profession. Now the
  // user's actual `topics` selection (their real personalization, whatever it narrowed to) wins
  // outright; profession- and field-wide pools are only a safety net for the degenerate case where
  // the narrowed selection matches zero words.
  const levelCheckPool = useMemo(() => computeLevelCheckPool(field, topics, primaryProf), [field, topics, primaryProf]);
  // Missed words collected across ALL THREE level-check stages (multi-select, flashcard, MCQ) -
  // shown together in ONE combined "words to add to your list" screen (levelResults) instead of
  // each stage showing its own. The MCQ's misses arrive via Game's onAssessDone.
  const [missedWords, setMissedWords] = useState<Word[]>([]);
  const addMissed = (ws: Word[]) => setMissedWords((m) => [...m, ...ws]);
  // Seed the feed's word-rarity from the placement result so the test actually personalizes the
  // feed's difficulty from day one (before this, the placement only saved missed words and never
  // touched difficulty). ~14 words are tested across the stages; the more you knew, the rarer we
  // start you. Sets a smart default the user can still override on the rarity dial later.
  const seedRarityFromScore = (missedCount: number) => {
    const TOTAL = 14;
    const score = Math.max(0, (TOTAL - missedCount) / TOTAL);
    const pref = score >= 0.75 ? 'rare' : score >= 0.45 ? 'balanced' : 'practical';
    setWordPref(pref);
  };
  // 12 words: multi-select keeps its ORIGINAL 5-per-round (10 total, a quick scan-and-tap list -
  // no reason to shrink that one), the single-card flashcard is ONE round of 2 (each word gets its
  // own full-screen moment, so a second round would just double the length for no reason - owner
  // feedback: "2 flashcards", not two rounds of two). The MCQ draws separately from levelCheckPool.
  const levelCheckWords = useMemo(() => {
    // Prefer real, honestly-graded PREMIUM (C1/C2) words ranked by rarity (word-levels.ts) over the
    // corpus's own coarse C1/C2 split when there's enough graded coverage in this pool - never
    // elevate a word we now know is only B1/B2. See pickPremiumWords.
    const graded = pickPremiumWords(levelCheckPool, 12);
    // pickPremiumWords can return non-null with FEWER than 12 (it only guarantees a minimum of 4
    // graded words, not 12) - pad from the rest of the pool rather than silently shipping a short
    // round (owner, 2026-09-11 v3: "never have this").
    if (graded && graded.length < 12 && graded.length < levelCheckPool.length) {
      const have = new Set(graded.map((w) => w.id));
      const rest = levelCheckPool.filter((w) => !have.has(w.id)).sort(() => Math.random() - 0.5);
      return [...graded, ...rest].slice(0, 12);
    }
    if (graded) return graded;
    // Fill up to 12 regardless of the actual C1/C2 split in this pool (owner, 2026-09-11 v3: a
    // fixed 6/6 split could starve every later round when one tier was thin/empty - e.g. an
    // all-C1 pool used to yield only 6 words total here). Prefer C2 first, then pad with C1.
    const c2 = [...levelCheckPool.filter((w) => w.cefr === 'C2')].sort(() => Math.random() - 0.5);
    const c1 = [...levelCheckPool.filter((w) => w.cefr !== 'C2')].sort(() => Math.random() - 0.5);
    return [...c2, ...c1].slice(0, 12).sort(() => Math.random() - 0.5);
  }, [levelCheckPool]);
  // The final MCQ stage (Game, below) shuffles+slices its OWN pool internally (buildQuestions), so
  // pre-sorting levelCheckPool wouldn't influence which words get picked - it needs a pre-FILTERED
  // pool instead. Same premium/rarity preference as levelCheckWords above; a wider slice (16, not
  // 12) so Game still has enough words left over to build genuine wrong-answer distractors.
  const mcqPool = useMemo(() => {
    const graded = pickPremiumWords(levelCheckPool, 16);
    if (!graded) return levelCheckPool;
    if (graded.length < 16 && graded.length < levelCheckPool.length) {
      const have = new Set(graded.map((w) => w.id));
      const rest = levelCheckPool.filter((w) => !have.has(w.id)).sort(() => Math.random() - 0.5);
      return [...graded, ...rest];
    }
    return graded;
  }, [levelCheckPool]);

  const finish = async () => {
    await AsyncStorage.setItem('vorto.onboarded', '1').catch(() => {});
    const seen = await AsyncStorage.getItem('vorto.offerShown').catch(() => null);
    router.replace(seen ? '/welcome' : '/offer');
  };

  // Persist the survey/selections. Purchase itself is handled by the shared <PaywallView>
  // on the paywall slot; both buying and skipping land on /auth (the hard paywall follows there).
  const saveSurvey = async () => {
    track(Events.OnboardingComplete);
    setGoal(perDay);
    // vorto.examType = every exam they're prepping for, comma-joined (can be more than one now).
    const examId = selectedPurposes.filter((p) => p.exam).map((p) => p.id).join(',');
    const purpose = [...purposeIds].join(',');
    await AsyncStorage.multiSet([
      ['vorto.topics', JSON.stringify([...topics])],
      ['vorto.purpose', purpose],
      ['vorto.examType', examId],
      ['vorto.survey', JSON.stringify({ source, age, rating, purpose, examType: examId })],
    ]).catch(() => {});
  };
  // Fires from the paywall's onPurchased/onClose (whether or not it's the array's last slot,
  // now that age/source trail behind it) AND from next()'s isLast fallback for the true last
  // slot. Only actually exits once there's nothing left in `slots` to show.
  const onboardingPaywallDone = async () => {
    if (step < slots.length - 1) { setStep((s) => s + 1); return; }
    await saveSurvey();
    router.push('/auth');
  };

  const saveReminderPlan = async () => {
    await AsyncStorage.setItem('vorto.freq', JSON.stringify({ wordsPerDay: perDay, from: fromH, to: toH })).catch(() => {});
    // Save the plan and schedule IF already granted, but do NOT prompt here — the OS permission
    // ask fires on Continue from the "learn without opening the app" screen (see next()).
    rescheduleReminders(field, false).catch(() => {});
  };

  const canNext = () => {
    if (slot === 'building') return buildDone;
    if (slot === 'name') return !!name.trim();
    if (slot === 'areas') return topics.size > 0;
    if (slot === 'specialty') return pickedSpecialtyIds.size > 0;
    if (slot === 'purpose') return purposeIds.size > 0;
    if (slot === 'profession') return !!pickedField;
    if (slot === 'source') return !!source;
    if (slot === 'age') return !!age;
    if (slot === 'exam') return examPicked || !!examDate;
    return true;
  };
  const next = async () => {
    // A crisp haptic on every step so the flow feels alive (draws attention, like
    // the polished onboardings the owner referenced).
    Haptics.impactAsync(isLast ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (slot === 'reminders') await saveReminderPlan();
    // Fire the OS notification prompt on Continue FROM the notification screen (after the argument
    // for notifications has been made), never on screen entry.
    if (slot === 'sceneNotif') await rescheduleReminders(field, true).catch(() => {});
    isLast ? onboardingPaywallDone() : setStep(step + 1);
  };
  const back = () => setStep((s) => Math.max(0, s - 1));
  // Skipping from the true last slot (now possibly 'source', post-purchase) must exit the same
  // way Continue does - otherwise Skip silently no-ops (clamped to the same step) and strands
  // the user on the final screen forever.
  const skip = () => (isLast ? onboardingPaywallDone() : setStep((s) => Math.min(slots.length - 1, s + 1)));

  // The paywall is the shared <PaywallView> (full takeover): compliance row + price-bearing CTA
  // on this surface too. Buying or skipping both advance to /auth (the hard paywall follows).
  if (slot === 'paywall') {
    return <PaywallView variant="onboarding" field={field} specialty={primaryProf?.name} perDay={perDay} library={ahaLibrary.length} onPurchased={onboardingPaywallDone} onClose={onboardingPaywallDone} />;
  }
  // Three level-check stages, in this order: multi-select tap-list -> single-card flashcard ->
  // MCQ. Each reports its missed words into `missedWords`; the MCQ (last) uses onAssessDone to
  // skip its own result screen entirely, so ONE combined screen (levelResults, below) shows
  // everything missed across all three together.
  // key is REQUIRED on every round: without one, React reuses the same instance across rounds
  // (same type, same tree position) and internal state doesn't reset - round 2 mounts already
  // "past the end" and gets stuck. (The original pre-Aug12 Placement component had this key for
  // exactly this reason - missed it on the first restore.)
  // All four level-check stages (2 multi-select rounds of 5, 2 flashcards, 2 MCQ) share ONE
  // continuous "N of 14" counter instead of each stage resetting its own "1 of 2" - they're the
  // same test to the user, just different formats.
  if (slot === 'multiCheck') {
    return <MultiWordCheck key="multiCheck1" co={co} words={levelCheckWords.slice(0, 5)} onNext={(missed) => { addMissed(missed); setStep((st) => Math.min(slots.length - 1, st + 1)); }} onBack={back} insetTop={insets.top} insetBottom={insets.bottom} counterStart={3} counterTotal={6} />;
  }
  if (slot === 'multiCheck2') {
    return <MultiWordCheck key="multiCheck2" co={co} words={levelCheckWords.slice(5, 10)} onNext={(missed) => { addMissed(missed); setStep((st) => Math.min(slots.length - 1, st + 1)); }} onBack={back} insetTop={insets.top} insetBottom={insets.bottom} counterStart={4} counterTotal={6} />;
  }
  // ONE round of 2 flashcards (not two rounds of two) - each word already gets its own full-screen
  // moment, so a second round just doubled the length for no reason.
  if (slot === 'levelCheck') {
    return <WordCheckScreen key="levelCheck1" co={co} words={levelCheckWords.slice(10, 12)} onNext={(missed) => { addMissed(missed); setStep((st) => Math.min(slots.length - 1, st + 1)); }} onBack={back} insetTop={insets.top} insetBottom={insets.bottom} counterStart={0} counterTotal={6} />;
  }
  // MCQ level test = the SAME in-app Game, writes vorto.level (seed-only, so it never clobbers a
  // later 10-item in-app result). 2 questions. onAssessDone routes its misses into the combined
  // pool instead of showing its own "N words to add" screen.
  if (slot === 'placement') {
    return <Game mode="meaning" pool={mcqPool} n={2} distractors={1} assess seedLevelOnly onAssessDone={(missed) => { addMissed(missed); setStep((s) => Math.min(slots.length - 1, s + 1)); }} onExit={back} counterStart={4} counterTotal={6} />;
  }
  if (slot === 'levelResults') {
    return <LevelResultsScreen co={co} missed={missedWords} onDone={() => { seedRarityFromScore(missedWords.length); setStep((s) => Math.min(slots.length - 1, s + 1)); }} />;
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      {(step > 0 || SKIPPABLE.includes(slot)) && (
        <View style={styles.topRow}>
          {/* No Back on age/source: they now sit AFTER paywall, and going back would land on a
              paywall/trial screen the user already purchased or dismissed - PaywallView would
              just immediately bounce them right back here via its own isPro effect. */}
          {step > 0 && !(isPro && (slot === 'age' || slot === 'source'))
            ? <Pressable onPress={back} hitSlop={12} style={styles.back}><Text style={styles.backTxt}>‹ Back</Text></Pressable>
            : <View />}
          {SKIPPABLE.includes(slot) && (
            <Pressable onPress={skip} hitSlop={12} style={styles.back}><Text style={styles.skipTxt}>Skip</Text></Pressable>
          )}
        </View>
      )}

      {step > 0 && slot !== 'trial' && (
        <View style={styles.progress}>
          {/* 'building' ("Your plan is ready") presents itself as the finish line - owner,
              2026-09-11 v3: "the bar should be practically full" here, not its true ~50% mid-flow
              position (several setup screens still follow it). Read near-full on this one slot
              only; every other screen keeps its honest step/slots progress. */}
          <View style={[styles.progressFill, { width: `${slot === 'building' ? 92 : Math.round(((step + 1) / slots.length) * 100)}%` }]} />
        </View>
      )}

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingTop: step > 0 ? 20 : 0, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}>
        {slot === 'intro' && (
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flex: 1.25 }} />
            {/* Multi-profession group (owner-directed, 2026-09-10): the source art's checkerboard
                background used the EXACT same white as the doctor's coat, so color-key,
                connectivity flood-fill (4- and 8-connected), component-size filtering, and
                erosion-based separation all either left checker residue or ate part of the coat -
                the color/connectivity signal is genuinely ambiguous by pixel value alone.
                rembg (U2Net semantic segmentation) succeeded where color heuristics couldn't,
                since it identifies "this is a person" rather than "this is not grey/white."
                Verified pixel-level: background is fully transparent, the coat's white is fully
                preserved (alpha ~0.996). */}
            {/* Organic hand-cropped edge, black background kept intact (owner, 2026-09-11 v4:
                "what about he crops instead of them he leaves the black but crops it in a round
                circle? or with some like hand cropped?" - chose the hand-cropped/torn-edge
                treatment over a plain circle, which would've read too generic/corporate against
                the cream palette). Rendered straight from the SVG source at full res (928x1152,
                background intact) and masked with a soft organic blob outline (Python/PIL,
                sine-harmonic radius jitter) instead of background-removal - sidesteps the
                woman's-leg crop problem entirely since the boundary is now a deliberate shape,
                not a content crop. */}
            <View style={styles.heroIllo}><Image source={require('../assets/illustrated/organic-hero.png')} style={{ width: 280, height: 279 }} resizeMode="contain" /></View>
            <Text style={styles.markSmall}>LEXFALL<Text style={{ color: co.text }}>.</Text></Text>
            <Text style={styles.introHead}>Expand your vocabulary{'\n'}beyond average.</Text>
            <View style={styles.trust}>
              <Text style={styles.trustText}>An advanced vocabulary app{'\n'}for life and work.</Text>
            </View>
            <View style={styles.stats}>
              {[['11,000+', 'words'], ['C1–C2', 'advanced'], ['10', 'a day']].map(([n, l], i) => (
                <View key={i} style={[styles.statCell, i > 0 && styles.statDiv]}><Text style={styles.statN}>{n}</Text><Text style={styles.statL}>{l}</Text></View>
              ))}
            </View>
            <View style={{ flex: 1 }} />
          </View>
        )}




        {slot === 'profession' && (
          <Step title="What should we focus on?" sub="Pick your main focus. You can add other fields later.">
            {PROFESSIONS.map((p, i) => (
              <FadeIn key={p.id} delay={reduceMotion ? 0 : i * 55} duration={reduceMotion ? 0 : 260} offset={10}>
                <Opt label={p.label} note={p.note} icon={<ProfIcon name={PROF_FLAT[p.id]} co={co} />} on={pickedField === p.id} onPress={() => { Haptics.selectionAsync().catch(() => {}); setPickedField(p.id); setField(p.id); }} co={co} />
              </FadeIn>
            ))}
          </Step>
        )}

        {slot === 'purpose' && (
          <Step title="What are you working toward?" sub="Pick as many as apply.">
            {purposes.map((p, i) => (
              <FadeIn key={p.id} delay={reduceMotion ? 0 : i * 55} duration={reduceMotion ? 0 : 260} offset={10}>
                <Opt
                  label={p.label}
                  note={p.note}
                  on={purposeIds.has(p.id)}
                  multi
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setPurposeIds((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; });
                  }}
                  co={co}
                />
              </FadeIn>
            ))}
          </Step>
        )}

        {slot === 'specialty' && (
          <Step title="Which is closest to your work or interest?" sub="You can change this anytime.">
            {specialtyItems.length > 6 && (
              <View style={styles.search}>
                <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M21 21l-4.3-4.3M11 19a8 8 0 100-16 8 8 0 000 16z" stroke={co.muted} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
                <TextInput value={specialtyQuery} onChangeText={setSpecialtyQuery} placeholder="Search" placeholderTextColor={co.faint} style={styles.searchInput} autoCorrect={false} />
                {specialtyQuery.length > 0 && (
                  <Pressable onPress={() => setSpecialtyQuery('')} hitSlop={12}><Text style={styles.searchClear}>✕</Text></Pressable>
                )}
              </View>
            )}
            {specialtyItems
              .filter((it) => {
                const q = specialtyQuery.trim().toLowerCase();
                return !q || it.name.toLowerCase().includes(q) || it.tag.toLowerCase().includes(q);
              })
              .map((it, i) => (
                <FadeIn key={it.id} delay={reduceMotion ? 0 : i * 55} duration={reduceMotion ? 0 : 260} offset={10}>
                  <Opt label={it.name} note={it.tag} on={pickedSpecialtyIds.has(it.id)} onPress={() => toggleSpecialty(it)} co={co} multi />
                </FadeIn>
              ))}
          </Step>
        )}

        {slot === 'areas' && (
          <Step title={field === 'med' ? 'Which part of healthcare?' : 'Which areas first?'} sub={primaryProf?.name ? `${primaryProf.name} already covers ${present(primaryProf.topics).slice(0, 3).join(', ').toLowerCase()}. Add anything else that matters to you.` : primaryProf ? 'Your picks already cover a few areas below. Add anything else that matters to you.' : 'So every word matches your work.'}>
            <AreaPicker
              field={field}
              co={co}
              present={(tags) => tags.some((t) => allTopics.has(t)) && !tags.every((t) => specialtyTopicSet.has(t))}
              isSubOn={(tags) => followsAll(tags)}
              onSub={(tags) => toggleTopics(tags)}
              axisOn={(t) => topics.has(t)}
              onAxis={(t) => toggleTopic(t)}
              examPresent={(t) => allTopics.has(t)}
              hideProfession={professional}
              showAxes={!professional || wantsExamDate}
              searchable={false}
            />
          </Step>
        )}

        {slot === 'exam' && (
          <Step title="When’s your exam?" sub="We’ll count down and pace your daily practice.">
            <ExamPicker onPick={() => setExamPicked(true)} />
          </Step>
        )}

        {slot === 'sceneHabit' && (
          <SceneHabit co={co} />
        )}

        {slot === 'wordPref' && (
          <Step title="How rare should your words be?" sub="You can change this anytime in Profile.">
            <Segment
              options={[{ label: 'Practical', value: 'practical' }, { label: 'Balanced', value: 'balanced' }, { label: 'Rare', value: 'rare' }]}
              value={wordPref}
              onChange={(v) => setWordPref(v as 'practical' | 'balanced' | 'rare')}
              co={co}
            />
          </Step>
        )}

        {slot === 'source' && (
          <Step title="How did you hear about us?">
            {['App Store', 'TikTok', 'Instagram', 'YouTube', 'Reddit', 'A friend', 'Other'].map((o, i) => (
              <FadeIn key={o} delay={reduceMotion ? 0 : i * 55} duration={reduceMotion ? 0 : 260} offset={10}>
                <Opt label={o} on={source === o} onPress={() => setSource(o)} co={co} />
              </FadeIn>
            ))}
          </Step>
        )}

        {slot === 'age' && (
          <Step title="How old are you?">
            {['Under 20', '20–29', '30–39', '40–49', '50+'].map((o, i) => (
              <FadeIn key={o} delay={reduceMotion ? 0 : i * 55} duration={reduceMotion ? 0 : 260} offset={10}>
                <Opt label={o} on={age === o} onPress={() => setAge(o)} co={co} />
              </FadeIn>
            ))}
          </Step>
        )}

        {slot === 'building' && (
          <BuildingProfile co={co} field={field} topics={topics} perDay={perDay} specialty={primaryProf?.name} reduce={reduceMotion} onDone={() => setBuildDone(true)} />
        )}

        {slot === 'name' && (
          <Step title="What should we call you?" sub="We’ll use this in your daily words.">
            <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={co.faint} style={styles.input} autoFocus />
          </Step>
        )}


        {slot === 'reminders' && (
          <Step title="Words throughout your day" sub="A fresh word at the hours you choose." illo="phone">
            <Text style={[label, { color: co.faint, marginBottom: 6 }]}>Set your goal</Text>
            <View style={styles.specRow}>
              <View><Text style={styles.specL}>Words per day</Text><Text style={styles.specS}>spread through your day</Text></View>
              <View style={styles.stepper}>
                <Pressable onPress={() => setPerDay((n) => Math.max(2, n - 1))} style={styles.stepBtn}><Text style={styles.stepTxt}>–</Text></Pressable>
                <Pressable onPress={() => setCountEdit(true)} hitSlop={8}><Text style={[styles.stepVal, styles.stepValTap]}>{perDay}</Text></Pressable>
                <Pressable onPress={() => setPerDay((n) => Math.min(16, n + 1))} style={styles.stepBtn}><Text style={styles.stepTxt}>+</Text></Pressable>
              </View>
            </View>
            {countEdit && (
              <CountWheel
                co={co}
                value={perDay}
                min={2}
                max={16}
                onChange={setPerDay}
                onDone={() => setCountEdit(false)}
              />
            )}
            <View style={styles.specRow}>
              <View><Text style={styles.specL}>Start</Text><Text style={styles.specS}>first word of the day</Text></View>
              <View style={styles.stepper}>
                <Pressable onPress={() => setFromH((h) => Math.max(0, h - 1))} style={styles.stepBtn}><Text style={styles.stepTxt}>–</Text></Pressable>
                <Pressable onPress={() => setTimeEdit('from')} hitSlop={8}><Text style={[styles.stepVal, styles.stepValTap]}>{fromH}:00</Text></Pressable>
                <Pressable onPress={() => setFromH((h) => Math.min(toH - 1, h + 1))} style={styles.stepBtn}><Text style={styles.stepTxt}>+</Text></Pressable>
              </View>
            </View>
            {timeEdit === 'from' && (
              <TimeWheel
                co={co}
                theme={theme}
                hour={fromH}
                onChange={(h) => setFromH(Math.min(h, toH - 1))}
                onDone={() => setTimeEdit(null)}
              />
            )}
            <View style={styles.specRow}>
              <View><Text style={styles.specL}>End</Text><Text style={styles.specS}>quiet after this</Text></View>
              <View style={styles.stepper}>
                <Pressable onPress={() => setToH((h) => Math.max(fromH + 1, h - 1))} style={styles.stepBtn}><Text style={styles.stepTxt}>–</Text></Pressable>
                <Pressable onPress={() => setTimeEdit('to')} hitSlop={8}><Text style={[styles.stepVal, styles.stepValTap]}>{toH}:00</Text></Pressable>
                <Pressable onPress={() => setToH((h) => Math.min(23, h + 1))} style={styles.stepBtn}><Text style={styles.stepTxt}>+</Text></Pressable>
              </View>
            </View>
            {timeEdit === 'to' && (
              <TimeWheel
                co={co}
                theme={theme}
                hour={toH}
                onChange={(h) => setToH(Math.max(h, fromH + 1))}
                onDone={() => setTimeEdit(null)}
              />
            )}
            {/* Word-preview card, moved below the goal controls and restyled as a phone
                notification (owner, 2026-09-11: "make it below the set your goal part" + "black
                line stroke like if it was from a phone"). Owner follow-up (v3): a bold black
                BORDER on the normal light card, not a solid black fill. Word difficulty
                (Practical/Balanced/Rare) removed from here entirely - moves to a post-purchase
                screen. */}
            <View style={styles.wprevDark}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.wprevWDark}>{previewWord?.word}</Text>
                <Pressable
                  onPress={() => previewWord && speakWord(previewWord.word, undefined, previewWord.id)}
                  hitSlop={12}
                  accessibilityLabel={`Pronounce ${previewWord?.word}`}
                >
                  <Svg width={16} height={16} viewBox="0 0 24 24">
                    <Path d="M11 5 6 9H3v6h3l5 4V5Z" stroke={co.muted} strokeWidth={1.8} fill="none" strokeLinejoin="round" />
                    <Path d="M15.5 8.5a4.5 4.5 0 0 1 0 7" stroke={co.muted} strokeWidth={1.8} fill="none" strokeLinecap="round" />
                  </Svg>
                </Pressable>
              </View>
              <Text style={styles.wprevDDark}>({previewWord?.pos}) {previewWord?.def}</Text>
            </View>
          </Step>
        )}

        {slot === 'sceneWidget' && (
          <SceneWidget co={co} reduce={reduceMotion} />
        )}

        {slot === 'sceneNotif' && (
          <SceneNotif co={co} reduce={reduceMotion} />
        )}

        {slot === 'aha' && (() => {
          const pace = perDay;
          // #77: if the user gave an exam date, the deadline is fixed by the exam - project to
          // THAT date (and drop the pace segment, which is moot). Otherwise the segment drives it.
          const examDays = wantsExamDate && examDate
            ? Math.max(1, Math.round((new Date(examDate + 'T00:00:00').getTime() - Date.now()) / 86400000))
            : null;
          const days = examDays ?? +horizon;
          const known = Math.min(ahaLibrary.length, pace * days);
          const target = examDays != null ? new Date(examDate + 'T00:00:00') : new Date(Date.now() + days * 86400000);
          const dstr = `${target.getDate()} ${MONTHS[target.getMonth()]}`;
          const samples = ahaSamples.slice(0, 3);
          return (
            <View>
              {/* Carries the 'ready' slot's schedule recap (cut as its own screen - it ran right
                  before this one and just repeated a "you're all set" beat aha already delivers
                  with more payoff) into this eyebrow instead of the generic "Your library". */}
              <Text style={[label, { textAlign: 'center' }]}>{FIELD_SHORT[field] ?? 'General'} · {perDay} words a day</Text>
              <Text style={[styles.title, { textAlign: 'center', marginTop: 12 }]}><CountUp to={ahaLibrary.length} format={commas} reduce={reduceMotion} haptic /> words,{'\n'}waiting for you</Text>
              <View style={[styles.fieldCards, { marginTop: 6 }]}>
                {samples.map((w) => (
                  <View key={w.id} style={styles.fieldCard}>
                    <Text style={styles.fieldWord}>{w.word}</Text>
                    <Text style={styles.fieldDef} numberOfLines={2}>({w.pos}) {w.def}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.ahaProjLabel}>{examDays != null ? 'By your exam' : 'At your pace'}</Text>
              {examDays == null && (
                <Segment
                  options={[{ label: '6 weeks', value: '42' }, { label: '3 months', value: '90' }, { label: '6 months', value: '180' }]}
                  value={horizon}
                  onChange={setHorizon}
                  co={co}
                />
              )}
              <View style={styles.ahaStat}>
                <Text style={styles.ahaBig}>≈ <CountUp to={known} format={commas} reduce={reduceMotion} haptic /> words</Text>
                <Text style={styles.ahaSmall}>learned by {dstr}, at {pace} a day</Text>
              </View>
            </View>
          );
        })()}

        {slot === 'retention' && (
          <RetentionScreen co={co} reduce={reduceMotion} perDay={perDay} />
        )}

        {slot === 'different' && (
          <DifferentScreen co={co} name={name} reduce={reduceMotion} />
        )}

        {slot === 'testimonials' && (
          <TestimonialsScreen co={co} />
        )}

        {slot === 'personalize' && <PersonalizeScreen co={co} field={field} topics={topics} />}

        {slot === 'feedStyle' && <FeedStyleScreen co={co} field={field} topics={topics} />}

        {slot === 'trial' && <TrialTimeline co={co} offering={offering} />}
      </ScrollView>

      <View>
        <Pressable style={[styles.btn, !canNext() && styles.btnOff]} onPress={next} disabled={!canNext() || busy}>
          <Text style={[styles.btnTxt, !canNext() && styles.btnTxtOff]}>{slot === 'intro' ? 'Get started' : 'Continue'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function Step({ title, sub, illo, children }: { k?: string; title: string; sub?: string; illo?: IlloName; children: React.ReactNode }) {
  const { palette: co } = useApp();
  const s = makeStyles(co);
  return (
    <View>
      {illo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={[s.title, { marginTop: 0, marginBottom: 0, flexShrink: 1 }]}>{title}</Text>
          {illo === 'scales' ? <AnimatedScales co={co} size={40} /> : <Illo name={illo} co={co} size={40} />}
        </View>
      ) : (
        <Text style={s.title}>{title}</Text>
      )}
      {!!sub && <Text style={s.sub}>{sub}</Text>}
      {children}
    </View>
  );
}

export const PROF_FLAT: Record<string, ProfIconName> = { med: 'stethoscope', law: 'scales', biz: 'pen', gen: 'book' };

// Per-field illustrated face (cropped from the 4-person lineup art) - Metro needs static
// literal requires, so this is a fixed map rather than a computed path. 'new' has no distinct
// figure of its own; it reads closest to General.
const FACE_ASSET: Record<FieldId, ReturnType<typeof require>> = {
  med: require('../assets/illustrated/face-med.png'),
  law: require('../assets/illustrated/face-law.png'),
  biz: require('../assets/illustrated/face-biz.png'),
  gen: require('../assets/illustrated/face-gen.png'),
  new: require('../assets/illustrated/face-gen.png'),
};

// `multi`: single-select rows (field/source/age — pick exactly one) use a ROUND
// indicator; multi-select rows (purpose, specialty — pick as many as fit) use a rounded-SQUARE
// checkbox instead, so the two interaction models never look identical (#reused-Opt-ambiguity).
export function Opt({ label: l, note, on, onPress, co, illo, icon, multi }: { label: string; note?: string; on: boolean; onPress: () => void; co: Palette; illo?: IlloName; icon?: JSX.Element; multi?: boolean }) {
  const s = makeStyles(co);
  return (
    <Pressable onPress={onPress} style={s.opt}>
      {icon ? <View style={s.optIllo}>{icon}</View> : illo ? <View style={s.optIllo}><Illo name={illo} co={co} size={40} /></View> : null}
      <View style={{ flex: 1 }}>
        <Text style={s.optName}>{l}</Text>
        {note && <Text style={s.optNote}>{note}</Text>}
      </View>
      <View style={[s.check, multi && s.checkSquare, on && s.checkOn]}>{on && <Text style={s.checkMark}>✓</Text>}</View>
    </Pressable>
  );
}

// --- Interstitial "value" scenes: composed mini-designs, not lone icons ---

function SceneDaily({ co }: { co: Palette }) {
  const s = makeStyles(co);
  return (
    <View style={s.sceneWrap}>
      <View style={s.illoCard}><ReadingScene co={co} width={312} height={226} /></View>
      <Text style={s.valueTitle}>A new word,{'\n'}every day</Text>
    </View>
  );
}

function ScenePeople({ co }: { co: Palette }) {
  const s = makeStyles(co);
  return (
    <View style={s.sceneWrap}>
      <View style={{ alignItems: 'center', marginBottom: 10 }}><PersonScene co={co} /></View>
      <Text style={s.valueTitle}>The vocabulary{'\n'}your work runs on</Text>
    </View>
  );
}

// Multi-vertical breadth as its own beat, marketing/dev-capture only (not wired into a live
// SLOTS entry - App Store screenshot use, see dev-capture.tsx which=fields). Each professional
// track (Medicine/Law/Business) plus General gets its own tailored vocabulary, not one generic
// list wearing four labels - the real differentiator vs. single-purpose vocab apps. Reuses
// `professions-group-hero.png`, an already-processed, on-brand illustrated asset (same character
// style as the intro hero and the field faces) that was sitting unused in assets/illustrated/.
export function SceneFields({ co }: { co: Palette }) {
  const s = makeStyles(co);
  return (
    <View style={s.sceneWrap}>
      <View style={s.illoCard}>
        <Image source={require('../assets/illustrated/professions-group-hero.png')} style={{ width: 300, height: 224 }} resizeMode="contain" />
      </View>
      <Text style={s.valueTitle}>Built for{'\n'}every field</Text>
      <Text style={s.trustText}>Medicine · Law · Business · General —{'\n'}each with its own tailored vocabulary.</Text>
    </View>
  );
}

// Post-placement "building your profile" beat, 3 phases: LOADING (a 3s progress bar fills while
// the checklist checks off in step with it - makes the wait feel like real, personal work, not a
// canned animation), READY ("Your plan is ready" + growth areas replace the bar/checklist), then
// SETTLED (growth areas fade back out, leaving just the streak badge - the one thing worth
// lingering on). Reduced-motion: jumps straight to SETTLED, onDone fires almost immediately.
const BUILD_LINES = ['Reading your answers', 'Setting your level', 'Mapping your growth areas', 'Building your daily plan'];
// Sped up (owner, 2026-09-11 v2: "make this go faster") - was 3000ms, felt slow for a screen
// that's pure loading chrome.
const LOAD_MS = 1500;
const STREAK_DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
// Day-1 medallion sizing (see `dayMedallion` styles) - the halo ring sits just outside the
// gold disc, drawn via an SVG stroke rather than a bordered View (no-borderWidth-on-circles rule).
const DAY_RING_BOX = 176;
const DAY_RING_R = 84;
type BuildPhase = 'loading' | 'settled';
export function BuildingProfile({ co, field, topics, perDay, specialty, reduce, onDone }: { co: Palette; field: FieldId; topics: Set<string>; perDay?: number; specialty?: string; reduce?: boolean; onDone: () => void }) {
  const s = makeStyles(co);
  const bar = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const [phase, setPhase] = useState<BuildPhase>(reduce ? 'settled' : 'loading');
  const [checked, setChecked] = useState(reduce ? BUILD_LINES.length : 0);
  // Streak/day-of-week row (owner, 2026-09-11 v2): today through the rest of the week, today
  // marked done - Day 1 of the streak the user is about to start.
  const todayIdx = new Date().getDay();
  const weekDays = Array.from({ length: 7 }, (_, i) => STREAK_DOW[(todayIdx + i) % 7]);
  useEffect(() => {
    if (reduce) { const t = setTimeout(onDone, 200); return () => clearTimeout(t); }
    const timers: ReturnType<typeof setTimeout>[] = [];
    // (Owner, 2026-09-12: "same thing for this screen, it's animations.") Found: a leftover
    // `sparkle` Animated.Value animated a mark that no longer exists in this render at all - the
    // sparkle icon it once drove was swapped for a ProfIcon, then removed outright in an earlier
    // pass (see the Day-1 medallion rewrite above), but the animation + its `.start()` haptic
    // callback were never cleaned up. Net effect: a stray light haptic fired ~300ms into every
    // "Your plan is ready" screen, tied to nothing the user could see - a phantom animation
    // completing off-screen. Removed entirely rather than re-attached to a new mark, since
    // reviving a sparkle is exactly what the medallion redesign above was trying to get away from.
    Animated.timing(bar, { toValue: 1, duration: LOAD_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
    BUILD_LINES.forEach((_, i) => {
      timers.push(setTimeout(() => { setChecked((c) => c + 1); Haptics.selectionAsync().catch(() => {}); }, Math.round((LOAD_MS * (i + 1)) / BUILD_LINES.length)));
    });
    // The separate 'ready' hold (title + growth chips alone, THEN Day 1 fading in after another
    // delay) made the whole loading sequence feel longer than it needed to (owner, 2026-09-10:
    // "the loading thing is already long"). Straight to 'settled' - title, growth chips (if any),
    // and Day 1 all land together in one beat instead of two staggered ones.
    timers.push(setTimeout(() => { setPhase('settled'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); }, LOAD_MS));
    timers.push(setTimeout(onDone, LOAD_MS + 300));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <View style={s.buildWrap}>
      {phase === 'loading' && (
        <FadeIn duration={0}>
          <View style={s.buildBarTrack}>
            <Animated.View style={[s.buildBarFill, { backgroundColor: co.accent, width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          </View>
          <View style={[s.buildLines, { marginTop: 20 }]}>
            {BUILD_LINES.map((l, i) => {
              const on = i < checked;
              return (
                <View key={l} style={s.buildLine}>
                  {on ? (
                    <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="m5 12 5 5L20 7" stroke={co.accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
                  ) : (
                    <View style={s.buildLineDot} />
                  )}
                  <Text style={[s.buildLineTxt, { color: on ? co.text : co.muted }]}>{l}</Text>
                </View>
              );
            })}
          </View>
        </FadeIn>
      )}

      {phase !== 'loading' && (
        <FadeIn duration={reduce ? 0 : 300} offset={10}>
          <Text style={[s.title, { textAlign: 'center' }]}>Your plan is ready</Text>
          {/* Subtitle moved directly under the title (owner, 2026-09-12: was sandwiched between
              the week tracker and Continue, leaving a big empty gap up top) - "Your plan is
              ready" + this line now read as one title/subtitle pair, like every other slot. */}
          <Text style={[s.sub, { textAlign: 'center', marginTop: 6 }]}>Build a streak, one day at a time.</Text>
        </FadeIn>
      )}
      {phase !== 'loading' && (
        <FadeIn duration={reduce ? 0 : 350} offset={14}>
          <View style={s.firstWin}>
            {/* Day-1 mark, redesigned (owner, 2026-09-12 v4: the abstract flame path read as
                generic AI clip-art, and sitting digit-then-flame in a row left the "1" looking
                unrelated to it - "the 1 is super far away"). Dropped the flame illustration
                entirely - the digit itself IS the mark now, set inside a gold medallion (same
                fill+ink-text pairing every primary CTA in the app already uses, so it reads as
                established house language, not a new illustration) with a thin single-stroke
                halo ring (SVG stroke, not a bordered View, per the no-borderWidth-on-circles
                rule) - a quiet coin/seal treatment that echoes the small day-circles in the week
                panel directly below rather than competing with them. */}
            <View style={s.dayMark}>
              <Text style={s.dayMarkEyebrow}>Day</Text>
              <View style={s.dayMedallion}>
                <Svg width={DAY_RING_BOX} height={DAY_RING_BOX} style={StyleSheet.absoluteFill}>
                  <Circle cx={DAY_RING_BOX / 2} cy={DAY_RING_BOX / 2} r={DAY_RING_R} stroke={co.accent} strokeWidth={1.5} fill="none" opacity={0.5} />
                </Svg>
                <View style={s.dayDisc}>
                  <Text style={s.dayDiscNum}>1</Text>
                </View>
              </View>
            </View>
            {/* Streak-of-the-week row, adapted from a reference app's fire+weekday streak mock -
                idea only, own styling: today marked as the first day. Grouped in a soft panel
                (owner, 2026-09-12: floating in open space "loses UI structure") instead of
                floating loose. */}
            <View style={s.streakPanel}>
              <View style={s.streakRow}>
                {weekDays.map((d, i) => (
                  <View key={i} style={[s.streakDay, i === 0 && s.streakDayOn]}>
                    {i === 0 ? (
                      <Svg width={17} height={17} viewBox="0 0 24 24"><Path d="m5 13 4 4L19 7" stroke={co.ink} strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
                    ) : (
                      <Text style={s.streakDayTxt}>{d}</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          </View>
        </FadeIn>
      )}
    </View>
  );
}

// "Let's assess your level" - the multi-select tap-list (a scrollable list, tap any words you
// know). This is the FIRST of the three level-check stages, before the single-card flashcard and
// the MCQ. Reports missed (un-tapped) words on Continue, same aggregation pattern as the other two.
export function MultiWordCheck({ co, words, round, onNext, onBack, insetTop, insetBottom, counterStart, counterTotal }: { co: Palette; words: Word[]; round?: number; onNext: (missed: Word[]) => void; onBack: () => void; insetTop: number; insetBottom: number; counterStart?: number; counterTotal?: number }) {
  const s = makeStyles(co);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const toggle = (id: string) => { Haptics.selectionAsync().catch(() => {}); setKnown((k) => { const n = new Set(k); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  // Same top bar (✕ / N-of-total counter / "LEVEL TEST" label / progress line) as the flashcard
  // and MCQ stages (Game.tsx) - this used to be a plain "‹ Back" link with no counter/progress
  // chrome at all, the one stage of the three that looked like a different flow entirely even
  // though it's the SAME continuous level test. Counter shows which SCREEN of the whole level
  // test this is (1-6: 2 multi-select rounds, 2 flashcards, 2 MCQ questions), not which word -
  // a whole batch is one screen regardless of how many words it holds, so counterStart IS the
  // screen number directly (owner, 2026-09-11: "screens 1-6 not words 1-14").
  const headerTotal = counterTotal ?? 1;
  const headerN = counterStart ?? 1;
  return (
    <View style={{ flex: 1, backgroundColor: co.bg, paddingHorizontal: 26, paddingTop: insetTop + 12, paddingBottom: insetBottom + 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Pressable onPress={onBack} hitSlop={12}><Text style={{ color: co.muted, fontSize: 19 }}>✕</Text></Pressable>
        <Text style={{ fontFamily: fonts.sansSemi, fontSize: 13, color: co.muted, letterSpacing: 1, fontVariant: ['tabular-nums'] }}>{headerN} / {headerTotal}</Text>
        <Text style={[label, { color: co.faint }]}>{t('game.levelTest')}</Text>
      </View>
      <View style={{ height: 3, backgroundColor: co.line, borderRadius: 2, marginBottom: 26, overflow: 'hidden' }}>
        <View style={{ height: 3, backgroundColor: co.accent, borderRadius: 2, width: `${Math.round((headerN / headerTotal) * 100)}%` }} />
      </View>
      <Text style={s.title}>Let’s assess{'\n'}your level</Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 18, color: co.muted, marginTop: 10, lineHeight: 24 }}>Tap the words you know.</Text>
      <ScrollView style={{ flex: 1, marginTop: 20 }} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}>
        {words.map((w) => {
          const on = known.has(w.id);
          return (
            <Pressable key={w.id} onPress={() => toggle(w.id)} style={[s.wcRow, on && { backgroundColor: co.accent }]}>
              <Text style={[s.wcWord, on && { color: co.ink }]} numberOfLines={1}>{w.word}</Text>
              <View style={[s.wcCheck, on && { backgroundColor: co.ink, borderColor: co.ink }]}>
                {on && <Svg width={13} height={13} viewBox="0 0 24 24"><Path d="m5 12 5 5L20 7" stroke={co.accent} strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable style={s.btn} onPress={() => onNext(words.filter((w) => !known.has(w.id)))}>
        <Text style={s.btnTxt}>Continue</Text>
      </Pressable>
    </View>
  );
}

// "Let's assess your level" - a literal FLASHCARD: one word at a time, big and centered, with
// "I know it" / "New to me" below it (NOT a scrollable tap-list - that was a misread of what
// "flashcard" meant; restored from the original card-based Placement component, git 452bec8,
// adapted to fit the round-based (2 words, onNext) slot wiring). Advances automatically through
// the round's words, then calls onNext once done. Has a pronunciation button (matches the MCQ's)
// and colored answer buttons (ok-tinted "I know it", bad-tinted "New to me") - owner feedback:
// this screen needed sound + more color, it was too flat next to the MCQ.
export function WordCheckScreen({ co, words, round, onNext, onBack, insetTop, insetBottom, counterStart, counterTotal }: { co: Palette; words: Word[]; round?: number; onNext: (missed: Word[]) => void; onBack: () => void; insetTop: number; insetBottom: number; counterStart?: number; counterTotal?: number }) {
  const s = makeStyles(co);
  const win = useWindowDimensions();
  const [idx, setIdx] = useState(0);
  const [missed, setMissed] = useState<Word[]>([]);
  const total = words.length;
  useEffect(() => {
    if (idx >= total) onNext(missed);
  }, [idx]);
  if (idx >= total) return <View style={{ flex: 1, backgroundColor: co.bg }} />;
  const w = words[idx];
  // Shrink-to-fit headword (owner: never truncate a word with "..."; keep the pre-glass size for
  // normal words, size DOWN only for long ones like "methaemoglobinaemia"). Computed size instead
  // of adjustsFontSizeToFit, which on the New Architecture scales UP and overrides fontSize (same
  // reason WordCard.tsx sizes by length). Budget = win - outer pad (26*2) - card pad (20*2) -
  // speaker+gap (~28); caps at the original 38, floors at 20 so it always fits one line.
  const wordSize = Math.max(20, Math.min(38, Math.round((win.width - 120) / (Math.max(1, w.word.length) * 0.6))));
  const answer = (knows: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    if (!knows) setMissed((m) => [...m, w]);
    setIdx((i) => i + 1);
  };
  // Parity with the MCQ's per-question Skip (#10): an honest non-answer, not a forced guess.
  // Counts the same as "New to me" (not-known) rather than dropping it silently, matching the
  // MCQ's skip semantics ("counts as not-known" - see Game.tsx).
  const skip = () => answer(false);
  // Same top bar as MultiWordCheck/Game.tsx (see MultiWordCheck's comment) - was a bare "‹ Back"
  // link with the counter buried inline below the illustration instead.
  const headerTotal = counterTotal ?? total;
  const headerN = (counterStart ?? 0) + idx + 1;
  return (
    <View style={{ flex: 1, backgroundColor: co.bg, paddingHorizontal: 26, paddingTop: insetTop + 12, paddingBottom: insetBottom + 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Pressable onPress={onBack} hitSlop={12}><Text style={{ color: co.muted, fontSize: 19 }}>✕</Text></Pressable>
        <Text style={{ fontFamily: fonts.sansSemi, fontSize: 13, color: co.muted, letterSpacing: 1, fontVariant: ['tabular-nums'] }}>{headerN} / {headerTotal}</Text>
        <Text style={[label, { color: co.faint }]}>{t('game.levelTest')}</Text>
      </View>
      <View style={{ height: 3, backgroundColor: co.line, borderRadius: 2, marginBottom: 26, overflow: 'hidden' }}>
        <View style={{ height: 3, backgroundColor: co.accent, borderRadius: 2, width: `${Math.round((headerN / headerTotal) * 100)}%` }} />
      </View>
      <View style={s.placeWrap}>
        <Illo name={illoFor(w.topic)} co={co} size={64} />
        <Text style={[s.placeIntro, { marginTop: 14 }]}>Do you know this word?</Text>
        {!!round && <Text style={s.placeCount}>Round {round} of 2</Text>}
        <View style={[s.paperCard, s.placeCard]}>
          {/* Speaker moved inline next to the word (owner, 2026-09-11: the standalone button
              below the example was too small/easy to miss) - same pattern as the pace screen's
              word-preview card. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {/* adjustsFontSizeToFit={false}: on the New Architecture it scales the word UP to
                fill the width, overriding fontSize (same bug as the feed headword). fontSize 38
                (below) now holds — the pre-glass original size. */}
            <Text style={[s.placeWord, { fontSize: wordSize }]} numberOfLines={1} adjustsFontSizeToFit={false}>{w.word}</Text>
            <Pressable onPress={() => speakWord(w.word, undefined, w.id)} hitSlop={12} accessibilityLabel={`Pronounce ${w.word}`}>
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d="M11 5 6 9H3v6h3l5 4V5Z" stroke={co.muted} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
                <Path d="M15.5 8.5a4.5 4.5 0 0 1 0 7" stroke={co.muted} strokeWidth={1.6} fill="none" strokeLinecap="round" />
              </Svg>
            </Pressable>
          </View>
          {!!w.ipa && <Text style={s.placeIpa}>{w.ipa}</Text>}
          <Text style={s.placePos}>{w.pos}</Text>
          {!!w.ex && <Text style={s.placeEx} numberOfLines={2}>{w.ex}</Text>}
        </View>
        <View style={s.placeBtns}>
          {/* Gold = the app's one "positive/confirm" color everywhere else (the Saved pop on the
              MCQ result screen, primary CTAs) - green read as a mismatched, unrelated color
              introduced just for this screen. "New to me" stays neutral (not a second accent, not
              red/bad - "new to me" isn't wrong, it's just what you're about to learn). */}
          <Pressable style={[s.placeBtn, { backgroundColor: co.accent }]} onPress={() => answer(true)}><Text style={[s.placeBtnTxt, { color: co.ink }]}>I know it</Text></Pressable>
          <Pressable style={s.placeBtn} onPress={() => answer(false)}><Text style={s.placeBtnTxt}>New to me</Text></Pressable>
        </View>
        {/* Bigger, below-the-answers Skip (parity with the MCQ's own below-options Skip) - a real
            secondary button, not a small top-right link. alignSelf:'stretch' is required here:
            placeWrap uses alignItems:'center' (to center the card), which otherwise shrinks any
            child with no explicit width down to its own content size - exactly what made this
            render as a small square pill instead of a full-width bar like placeBtns (which
            already sets alignSelf:'stretch' itself). */}
        <Pressable style={[s.btn, { backgroundColor: co.surface2, marginTop: 14, alignSelf: 'stretch' }]} onPress={skip}>
          <Text style={[s.btnTxt, { color: co.text }]}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Combined results screen for all three level-check stages (multi-select + flashcard + MCQ) -
// ONE "N words to add to your list" moment instead of three separate ones. Mirrors the same
// soft, forward-looking pattern as the MCQ's own former result screen (no red, no "you got this
// wrong" - missed words are just "what you're about to learn"), including the "Saved" pop
// animation, since owner wanted feature parity between the two.
export function LevelResultsScreen({ co, missed, onDone }: { co: Palette; missed: Word[]; onDone: () => void }) {
  const s = makeStyles(co);
  const insets = useSafeAreaInsets();
  const [savedLater, setSavedLater] = useState(false);
  const savedPop = useRef(new Animated.Value(0)).current;
  const unique = useMemo(() => {
    const seen = new Set<string>();
    return missed.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)));
  }, [missed]);
  useEffect(() => {
    if (!savedLater) return;
    Animated.sequence([
      Animated.spring(savedPop, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true }),
      Animated.timing(savedPop, { toValue: 0, duration: 220, delay: 700, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [savedLater]);
  // Auto-save (#28): no "Save for practice" tap required - missed words save the instant this
  // screen mounts. One-shot (autoSaved ref) so re-renders / re-mounts can't re-trigger it.
  const autoSaved = useRef(false);
  useEffect(() => {
    if (autoSaved.current || !unique.length) return;
    autoSaved.current = true;
    (async () => {
      for (const w of unique) await setWordCollection(w.id, 'Review').catch(() => {});
      setSavedLater(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    })();
  }, [unique]);
  // Check-off + disappear sequence, then auto-advance (owner, 2026-09-11): once every word is
  // genuinely saved, each row gets a brief checkmark confirmation, then the list clears itself
  // top-to-bottom (LayoutAnimation collapses each row as it's removed), landing straight on
  // "Your plan is ready" - which already delivers the "your plan is ready" payoff this was built
  // for, so no custom cross-screen transition is needed. "Continue" still works at any point to
  // skip straight there (advanceRef guards against calling onDone() twice).
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [exitedIds, setExitedIds] = useState<Set<string>>(new Set());
  const [btnH, setBtnH] = useState(56); // measured Continue-button height, for floating the Saved pill just above it
  const advanced = useRef(false);
  const advance = () => { if (advanced.current) return; advanced.current = true; onDone(); };
  useEffect(() => {
    if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);
  }, []);
  useEffect(() => {
    if (!savedLater || !unique.length) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Owner (2026-09-12): the old fixed 260ms/word step let this screen's auto-advance scale
    // unbounded with word count (6-7s for a 10-13 word round) - and backwards, too, since a
    // rougher round (more misses) meant a LONGER wait. STEP now shrinks as the list grows so the
    // whole HEAD+checks+TAIL sequence never exceeds CAP, while short lists keep the snappier
    // 150ms stagger (there's room to spare).
    const HEAD = 900;   // beat before the first checkmark
    const TAIL = 1000;  // dwell time on the vault payoff after the last row exits
    const CAP = 3000;   // hard ceiling on this screen's total time, any word count
    const STEP = Math.max(70, Math.min(150, (CAP - HEAD - TAIL) / unique.length));
    unique.forEach((w, i) => {
      timers.push(setTimeout(() => {
        Haptics.selectionAsync().catch(() => {});
        setCheckedIds((s) => new Set(s).add(w.id));
      }, HEAD + i * STEP));
      timers.push(setTimeout(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExitedIds((s) => new Set(s).add(w.id));
      }, HEAD + i * STEP + 200));
    });
    // Extra beat added (owner: "compress the words into a saved vault/personalization visual")
    // so the vault payoff below actually gets seen before advancing, not just flashed.
    timers.push(setTimeout(advance, HEAD + unique.length * STEP + TAIL));
    return () => timers.forEach(clearTimeout);
  }, [savedLater, unique]);
  const visible = unique.filter((w) => !exitedIds.has(w.id));
  // Vault payoff (#42): once every row has checked off and collapsed, the list's empty space
  // resolves into one "N words added to your library" moment instead of just going blank while
  // waiting for the auto-advance timer - the compression the words visually did (checking off,
  // collapsing) now has somewhere to land.
  const allExited = savedLater && unique.length > 0 && visible.length === 0;
  const vaultScale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!allExited) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.spring(vaultScale, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [allExited]);
  return (
    <View style={[{ flex: 1, backgroundColor: co.bg, paddingHorizontal: 26 }, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      <Text style={s.resultLine}>{unique.length ? `${unique.length} new ${unique.length === 1 ? 'word' : 'words'} to add to your list` : 'A clean sweep — impressive.'}</Text>
      {allExited ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={{ alignItems: 'center', opacity: vaultScale, transform: [{ scale: vaultScale.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
            <View style={s.vaultMk}>
              <Svg width={30} height={30} viewBox="0 0 24 24"><Path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16l-6-4-6 4V4z" stroke={co.accent} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
            </View>
            <Text style={s.vaultTxt}>{unique.length} {unique.length === 1 ? 'word' : 'words'} added to your library</Text>
          </Animated.View>
        </View>
      ) : (
      <ScrollView style={{ flex: 1, marginTop: 20 }} contentContainerStyle={{ paddingBottom: 20 }}>
        {visible.map((w, k) => {
          return (
            // Staggered top-to-bottom entrance (owner, 2026-09-11) - the one thing kept from the
            // badge/density experiment (owner, 2026-09-11 v2: "let's simplify... put back the one
            // that had checks and more words fit in it... the only thing we keep is that they
            // appear from up to down"). Level/rarity badge removed (read as AI-generated). Exit
            // (LayoutAnimation-collapse) is driven by the effect above, not per-row here.
            <FadeIn key={w.id} delay={k * 90} duration={280} offset={14}>
              <View style={s.softRow}>
                <View style={s.softMk}>
                  <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="m5 13 4 4L19 7" stroke={co.accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.resWord}>{w.word}</Text>
                  <Text style={s.resDef}>({w.pos}) {w.def}</Text>
                </View>
              </View>
            </FadeIn>
          );
        })}
      </ScrollView>
      )}
      <Pressable style={s.btn} onPress={advance} onLayout={(e) => setBtnH(e.nativeEvent.layout.height)}>
        <Text style={s.btnTxt}>{unique.length ? 'Continue' : 'Start learning'}</Text>
      </Pressable>
      {savedLater && (
        // Owner flagged (2026-09-12, screenshot): the pill rendered dead-center of the WHOLE
        // screen (savedPopWrap used to be top:0/bottom:0 + justifyContent:'center'), landing
        // wherever that happened to fall on the scrollable list below - on top of the third
        // word's definition in one shot, "abstruse" in another. Tried anchoring it to the header
        // buffer above the title instead - owner reviewed live and preferred the ORIGINAL
        // near-the-Continue-button placement, just fixed so it doesn't drift with scroll content.
        // Floats a fixed distance above the measured Continue button (btnH), independent of the
        // list's scroll position - a transient toast briefly overlaying whatever's directly
        // beneath it is normal (this is the same pattern as a save/copy confirmation toast
        // elsewhere), the earlier bug was it landing at an unpredictable height, not that it
        // floats at all.
        <View style={[s.savedPopWrap, { bottom: insets.bottom + 20 + btnH + 14 }]} pointerEvents="none">
          <Animated.View style={[s.savedPop, { opacity: savedPop, transform: [{ scale: savedPop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>
            {/* Bookmark ribbon, not a checkmark (owner, 2026-09-10) - this is confirming a SAVE,
                not a correct/complete state, so it should look like one. */}
            <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16l-6-4-6 4V4z" stroke={co.ink} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
            <Text style={s.savedPopTxt}>Saved</Text>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

// ── Onboarding value/proof beats (competitor teardown, adapted to Lexfall's editorial brand) ──

// #7: three honest differentiators + a founder line.
export function DifferentScreen({ co, name, reduce }: { co: Palette; name: string; reduce?: boolean }) {
  const s = makeStyles(co);
  const POINTS: { illo: IlloName; t: string; sub: string }[] = [
    { illo: 'book', t: 'Advanced, never basic', sub: 'The rare, exact words C1–C2 speakers reach for, not the beginner list.' },
    { illo: 'briefcase', t: 'Built around your world', sub: 'Medicine, law, business, exams: vocabulary chosen by area, not a vague level.' },
    { illo: 'clock', t: 'Made to stick', sub: 'Spaced repetition brings each word back until it’s yours for good.' },
  ];
  // Cards drop in one by one with a light haptic each (owner request).
  const D0 = 300, STEP = 280;
  useEffect(() => {
    if (reduce) return;
    const timers = POINTS.map((_, i) => setTimeout(() => Haptics.selectionAsync().catch(() => {}), D0 + i * STEP));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.title, { marginTop: 8 }]}>{name ? `${name}, here’s what` : 'Here’s what'}{'\n'}makes Lexfall different</Text>
      <View style={{ gap: 12, marginTop: 26 }}>
        {POINTS.map((p, i) => (
          <FadeIn key={p.t} delay={reduce ? 0 : D0 + i * STEP} offset={16} duration={reduce ? 0 : 380}>
            <View style={s.diffCard}>
              {/* Gold icons instead of gray (owner, 2026-09-11) - a palette clone with `text`
                  swapped to the accent color, since Illo strokes with co.text and isn't scoped
                  to override elsewhere. Only affects these three cards. */}
              <View style={s.diffIconMk}>
                <Illo name={p.illo} co={{ ...co, text: co.accent }} size={38} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.diffTitle}>{p.t}</Text>
                <Text style={s.diffSub}>{p.sub}</Text>
              </View>
            </View>
          </FadeIn>
        ))}
      </View>
      <FadeIn delay={reduce ? 0 : D0 + POINTS.length * STEP} duration={reduce ? 0 : 420}>
        <Text style={s.founderLine}>We built Lexfall because we wanted it{'\n'}and couldn’t find it.</Text>
      </FadeIn>
    </View>
  );
}

// #5: retention proof. HONEST framing - no fabricated user %; it's the science of spaced review.
// Animation: the "no spaced review" line draws first, then Lexfall's rises above it.
export function RetentionScreen({ co, reduce, perDay }: { co: Palette; reduce?: boolean; perDay?: number }) {
  const s = makeStyles(co);
  const other = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const ours = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const cap = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.sequence([
      Animated.timing(other, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(ours, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(cap, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);
  const W = 300, H = 150;
  const oursPath = `M0 ${H - 10} C ${W * 0.35} ${H - 30}, ${W * 0.6} ${H - 96}, ${W} ${H - 128}`;
  // otherPath's ENDPOINT (H-49.3) is still exactly 1/3 of oursPath's endpoint rise - the real
  // word-count ratio (otherCount = round(withCount/3) below) is unchanged and honest. But a
  // uniformly-scaled copy of the same accelerating S-curve (the old version) reads as "the same
  // success, just smaller," not "this stops working" - which is the actual research story
  // (unspaced recall plateaus early, spaced review keeps compounding). Owner-flagged
  // (2026-09-10): "the line below shows too little difference in growth SHAPE." Fix: an early,
  // fast rise that plateaus by ~month 2 (most control weight front-loaded, flat tail) instead of
  // mirroring ours' steady climb - same honest endpoint, a curve that actually looks like fading.
  const otherPath = `M0 ${H - 10} C ${W * 0.2} ${H - 18}, ${W * 0.45} ${H - 30}, ${W} ${H - 39.3}`;
  const grow = (v: Animated.Value) => ({ transform: [{ scaleX: v }], opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }) });
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <Text style={[s.title, { textAlign: 'center' }]}>Learn it once,{'\n'}keep it for good</Text>
      <View style={s.chartCard}>
        <View style={{ height: H, width: W, alignSelf: 'center' }}>
          <View style={{ position: 'absolute', top: H * 0.35, left: 0, right: 0, height: 1, backgroundColor: co.line }} />
          <View style={{ position: 'absolute', top: H * 0.68, left: 0, right: 0, height: 1, backgroundColor: co.line }} />
          <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: 'left' } as any, grow(other)]}>
            <Svg width={W} height={H}><Path d={otherPath} stroke={co.muted} strokeWidth={3} fill="none" strokeLinecap="round" /></Svg>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: 'left' } as any, grow(ours)]}>
            <Svg width={W} height={H}><Path d={oursPath} stroke={co.accent} strokeWidth={3.5} fill="none" strokeLinecap="round" /></Svg>
          </Animated.View>
          {/* Word-count endpoints, not just a shape - perDay is the user's own real pace; the
              "other methods" figure is ~1/3, grounded in spaced-repetition research
              showing roughly 3x better long-term retention than unspaced study (see RetentionScreen
              call site / session notes for sources). */}
          {!!perDay && (
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: cap }]}>
              <Text style={[s.chartEndLabel, { position: 'absolute', right: 0, top: H - 128 - 20, color: co.accent }]}>{(perDay * 182).toLocaleString()} words</Text>
              <Text style={[s.chartEndLabel, { position: 'absolute', right: 0, top: H - 49.3 - 18, color: co.muted }]}>~{Math.round((perDay * 182) / 3).toLocaleString()} words</Text>
            </Animated.View>
          )}
        </View>
        <View style={s.chartLabels}>
          <Text style={s.chartAxis}>1 month</Text>
          <Text style={s.chartAxis}>3 months</Text>
          <Text style={s.chartAxis}>6 months</Text>
        </View>
        <View style={s.chartLegend}>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: co.accent }]} /><Text style={[s.legendTxt, s.legendTxtOn]}>With Lexfall</Text></View>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: co.muted }]} /><Text style={s.legendTxt}>Other methods</Text></View>
        </View>
      </View>
      <Animated.Text style={[s.retentionCaption, { opacity: cap }]}>
Without spaced repetition, new words fade in weeks. Lexfall’s spaced repetition moves them into long-term memory, so you still have them months later.
      </Animated.Text>
    </View>
  );
}

// Light pre-paywall personalization (voice, accent) - reuses the same setters/prefs as their
// standalone Profile settings equivalents, so nothing here is a separate source of truth.
// Fully skippable: no canNext gate is registered for this slot, Continue always works.
export function PersonalizeScreen({ co, field, topics }: { co: Palette; field?: FieldId; topics?: Set<string> }) {
  const s = makeStyles(co);
  const { theme, setTheme, accent, setAccent } = useApp();
  const [voiceSel, setVoiceSel] = useState<string | null>(null);
  useEffect(() => { getVoicePref().then(setVoiceSel); }, []);
  // Preview word: pull a real word from the user's own picked areas (falls back to their field,
  // then to a fixed default) so the voice/feed preview feels personal rather than generic.
  // preferInsiderVocab keeps this from landing on jargon the user already knows cold (e.g.
  // "monthly recurring revenue" for a biz profile) - this is the app's one shot at a premium
  // first impression, not a place to teach someone their own field's acronyms.
  const previewWord = useMemo(() => {
    const scoped = topics && topics.size ? SEED.filter((w) => topics.has(w.topic) && w.ex) : [];
    const scopedPool = scoped.length ? scoped : field ? SEED.filter((w) => w.field === field && w.ex) : [];
    const cleanScoped = excludeGradedBasic(scopedPool);
    const rawPool = cleanScoped.length ? cleanScoped : scopedPool;
    // preferInsiderVocab FIRST (drops jargon acronyms/phrases/overexposed words), THEN prefer
    // graded premium-by-rarity within what's left - a graded C1/C2 phrase is still not the single
    // striking word this "one shot at a premium first impression" wants.
    const pool = preferInsiderVocab(rawPool);
    const premium = pickPremiumWords(pool, 1);
    if (premium) return premium[0];
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }, [field, topics]);
  const pWord = previewWord?.word ?? 'serendipity';
  return (
    // Top-anchored, like every other slot. Centering was tried twice before (owner feedback) to
    // fix a dead top gap, but the real cause was that the screen had too little real content up
    // top - a bare title straight into a form. A subtitle (matching every other Step-based slot)
    // fixes that honestly instead of fighting ScrollView layout with a flex hack.
    <View>
      <Text style={s.title}>Make it yours</Text>
      <Text style={[s.sub, { marginBottom: 8 }]}>The voice it reads in, the color that's yours.</Text>

      <Text style={[s.perSectTight, { marginTop: 8 }]}>Appearance</Text>
      <View style={{ marginBottom: 18 }}>
        <AppearancePicker co={co} value={theme} onChange={setTheme} />
      </View>

      <Text style={s.perSectTight}>Accent color</Text>
      <View style={[s.accents, { marginBottom: 4 }]}>
        {ACCENTS.map((a) => {
          const on = a.id === accent;
          const hex = theme === 'light' ? a.light : a.dark;
          return (
            <PressBounce key={a.id} onPress={() => setAccent(a.id)} style={[s.swatch, { backgroundColor: hex }]} accessibilityLabel={a.name}>
              {on && (
                <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="m5 13 4 4L19 7" stroke={co.ink} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
              )}
            </PressBounce>
          );
        })}
      </View>

      <Text style={s.perSect}>Voice</Text>
      <Text style={s.perHint}>Tap a voice to hear "{pWord}"</Text>
      {/* Pill rows with a play mark + decorative waveform + a right-side check (owner, 2026-09-11
          v2, adapted from a reference app's voice-picker layout - idea only, own colors/fills;
          no border rings per house rule, selection reads via fill + checkmark). */}
      <View style={{ gap: 10 }}>
        {PREMIUM_VOICES.map((v) => {
          const on = (voiceSel ?? DEFAULT_VOICE_ID) === v.id;
          return (
            <PressBounce
              key={v.id}
              onPress={() => { setVoiceSel(v.id); setVoicePref(v.id); speakWord(pWord, v.id, previewWord?.id); }}
              style={[s.voiceRow, on && s.voiceRowOn]}
            >
              <View style={[s.voicePlayMk, on && s.voicePlayMkOn]}>
                <Svg width={11} height={11} viewBox="0 0 24 24"><Path d="M8 5v14l11-7z" fill={on ? co.ink : co.muted} /></Svg>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.voiceLabel, on && s.voiceLabelOn]}>{v.label} {v.flag}</Text>
                <View style={s.waveRow}>
                  {WAVE_HEIGHTS.map((h, i) => (
                    <View key={i} style={[s.waveBar, { height: h, backgroundColor: on ? co.ink + '55' : co.line2 }]} />
                  ))}
                </View>
              </View>
              {on && (
                <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="m5 13 4 4L19 7" stroke={co.ink} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
              )}
            </PressBounce>
          );
        })}
      </View>
    </View>
  );
}

const WAVE_HEIGHTS = [6, 10, 14, 9, 16, 8, 12, 7, 11, 6, 13, 9];

// Its own screen (split out of PersonalizeScreen, owner feedback): the real feed card is a tall
// near-fullscreen TikTok-style card, so a wide short preview crammed next to two other settings
// was never a truthful preview of it. This gets the room to actually show that shape.
export function FeedStyleScreen({ co, field, topics }: { co: Palette; field?: FieldId; topics?: Set<string> }) {
  const s = makeStyles(co);
  const { feedPhotos, setFeedPhotos } = useApp();
  // Same insider-vocab preview word logic as PersonalizeScreen's voice section - independent
  // random pick so this screen doesn't depend on render order with that one.
  const previewWord = useMemo(() => {
    const scoped = topics && topics.size ? SEED.filter((w) => topics.has(w.topic) && w.ex) : [];
    const scopedPool = scoped.length ? scoped : field ? SEED.filter((w) => w.field === field && w.ex) : [];
    const cleanScoped = excludeGradedBasic(scopedPool);
    const rawPool = cleanScoped.length ? cleanScoped : scopedPool;
    // Unlike PersonalizeScreen (voice-only, no card), this screen actually RENDERS the definition
    // on a fixed-height photo card - a long one gets cut mid-sentence ("...capable of negating
    // criminal lia..."), which the house rule already bans (WordCard, 2026-08-19: never leave a
    // definition unfinished). Prefer one short enough to read complete in the card's 3 lines.
    const isShort = (w: Word) => `(${w.pos}) ${w.def}`.length <= 95;
    // preferInsiderVocab FIRST (drops jargon acronyms/phrases/overexposed words), THEN the
    // length constraint, THEN prefer graded premium-by-rarity within what's left.
    const pool = preferInsiderVocab(rawPool);
    const short = pool.filter(isShort);
    const finalPool = short.length ? short : pool;
    const premium = pickPremiumWords(finalPool, 1);
    if (premium) return premium[0];
    return finalPool.length ? finalPool[Math.floor(Math.random() * finalPool.length)] : null;
  }, [field, topics]);
  const pWord = previewWord?.word ?? 'serendipity';
  const pDef = previewWord ? `(${previewWord.pos}) ${previewWord.def}` : '(n) The luck of finding something good without looking for it.';
  return (
    <View>
      <Text style={[s.title, { marginBottom: 28 }]}>Set your feed's look</Text>
      <Segment
        co={co}
        options={[{ label: 'Photo', value: 'on' }, { label: 'Flat', value: 'off' }]}
        value={feedPhotos ? 'on' : 'off'}
        onChange={(v) => setFeedPhotos(v === 'on')}
      />
      <FeedPreviewCard co={co} photo={feedPhotos} word={pWord} def={pDef} bgId={previewWord?.id} tall />
    </View>
  );
}

// A truthful mini preview of the real feed card look (not a separate mockup that could drift from
// it) - same feedBgFor() source and same flat-vs-photo text treatment WordCard uses, just scaled
// down and non-interactive, so toggling the Segment above shows exactly what the feed will do.
// tall = portrait aspect matching the real card shape (its own dedicated screen); otherwise the
// compact wide variant still used elsewhere.
export function FeedPreviewCard({ co, photo, word, def, bgId, tall }: { co: Palette; photo: boolean; word?: string; def?: string; bgId?: string; tall?: boolean }) {
  const s = makeStyles(co);
  const bg = photo ? feedBgFor(bgId ?? 'onboarding-preview') : null;
  const body = (
    <>
      <View style={[s.previewScrim, !photo && { backgroundColor: 'transparent' }]} />
      <Text style={[s.previewWord, tall && s.previewWordTall, photo && s.previewTxtOnPhoto]}>{word ?? 'serendipity'}</Text>
      <Text style={[s.previewDef, tall && s.previewDefTall, photo && s.previewTxtOnPhoto]} numberOfLines={tall ? 3 : 2}>
        {def ?? '(n) The luck of finding something good without looking for it.'}
      </Text>
    </>
  );
  return (
    <View style={[s.previewCard, tall && s.previewCardTall]}>
      {bg ? (
        <ImageBackground source={bg} style={s.previewBgFill} imageStyle={{ borderRadius: tall ? 28 : 16 }}>
          {body}
        </ImageBackground>
      ) : body}
    </View>
  );
}

// #6: exam/trajectory beat. Count-up with escalating haptics + a brand-fit ascending mark (no toy rocket).
export function ProjectionScreen({ co, field, library, perDay, reduce }: { co: Palette; field: FieldId; library: number; perDay: number; reduce?: boolean }) {
  const s = makeStyles(co);
  const target = Math.min(perDay * 365, library || perDay * 365);
  const [n, setN] = useState(reduce ? target : 0);
  const rise = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { setN(target); return; }
    Animated.timing(rise, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const steps = 40, dur = 1400;
    let i = 0;
    const id = setInterval(() => {
      i++;
      const t = i / steps;
      setN(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (i % 8 === 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (i >= steps) { clearInterval(id); setN(target); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); }
    }, dur / steps);
    return () => clearInterval(id);
  }, []);
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 }}>
      <Text style={[s.title, { textAlign: 'center' }]}>Your year{'\n'}with Lexfall</Text>
      <Animated.View style={{ alignItems: 'center', marginTop: 40, transform: [{ translateY }] }}>
        <Svg width={92} height={66} viewBox="0 0 92 66">
          <Path d="M6 60 C 30 56, 54 30, 86 6" stroke={co.accent} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Path d="M86 6 l-15 2 M86 6 l-2 15" stroke={co.accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
      <Text style={s.projLabel}>In a year, you’ll know</Text>
      <Text style={s.projNumber}>{commas(n)}</Text>
      <Text style={s.projSuffix}>advanced words</Text>
    </View>
  );
}

// #8: testimonials - REAL reviews only (gated on REVIEWS.length upstream; never fabricated).
export function TestimonialsScreen({ co }: { co: Palette }) {
  const s = makeStyles(co);
  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.title, { marginTop: 8 }]}>Loved by readers</Text>
      <View style={{ gap: 12, marginTop: 22 }}>
        {REVIEWS.slice(0, 4).map((r, i) => (
          <View key={i} style={s.reviewCard}>
            <Text style={s.reviewStars}>{'★'.repeat(Math.max(1, Math.min(5, r.stars)))}</Text>
            <Text style={s.reviewText}>{r.text}</Text>
            {!!r.author && <Text style={s.reviewAuthor}>{r.author}</Text>}
          </View>
        ))}
      </View>
    </View>
  );
}

const FIELD_SHORT: Record<string, string> = { law: 'Law', med: 'Medicine', biz: 'Business', gen: 'General', new: 'General' };
const FIELD_HEAD: Record<string, string> = {
  law: 'The words\nlaw runs on',
  med: 'The words\nmedicine runs on',
  biz: 'The words\nbusiness runs on',
  gen: 'Words worth\nknowing well',
  new: 'Words worth\nknowing well',
};
const FIELD_ILLO: Record<string, string> = { law: fieldLaw, med: fieldMed, biz: fieldBiz, gen: fieldGen, new: fieldGen };
// A word styled as an iOS notification banner (icon + word + gloss + example),
// sliding DOWN from above and settling like a real notification arriving, with a
// light haptic as it lands. Reduced-motion: shown at once, fade only, no haptic.
function FieldWordCard({ co, word, def, ex, delay, reduce }: { co: Palette; word: string; def: string; ex?: string; delay: number; reduce: boolean }) {
  const s = makeStyles(co);
  const a = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => {
      Haptics.selectionAsync().catch(() => {});
      Animated.timing(a, { toValue: 1, duration: 380, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }).start();
    }, delay);
    return () => clearTimeout(t);
  }, []);
  const translateY = a.interpolate({ inputRange: [0, 1], outputRange: [-34, 0] });
  const opacity = a.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] });
  return (
    <Animated.View style={[s.bnrCard, { opacity, transform: [{ translateY }] }]}>
      <View style={s.bnrIcon}><Text style={s.bnrIconTxt}>L</Text></View>
      <View style={{ flex: 1 }}>
        <View style={s.bnrTop}>
          <Text style={s.bnrWord} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{word}</Text>
          <Text style={s.bnrTime}>now</Text>
        </View>
        <Text style={s.bnrDef}>{def}</Text>
        {!!ex && <Text style={s.bnrEx}>{ex}</Text>}
      </View>
    </Animated.View>
  );
}

export function SceneField({ co, field, topics, profName, profTopics }: { co: Palette; field: FieldId; topics?: Set<string>; profName?: string; profTopics?: string[] }) {
  const s = makeStyles(co);
  const [reduce, setReduce] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {}); }, []);
  // Sample from the words they actually chose. Specialist fields (med especially) seed generic
  // CORE topics by default alongside whatever specialty is picked (e.g. medicine's "Advanced
  // English"/"Clinical collocations"), so `topics` alone is a mix of generic + specific - taking
  // the first N in raw corpus order let the generic core topics drown out the specialty someone
  // JUST picked (picking "Dentistry" showed palliative/iatrogenic/triage - real words, but not
  // remotely dentistry-specific, because they happened to sit earlier in the corpus). Fix:
  // prioritize the picked PROFESSION's own topics first, shuffled (not a fixed slice), falling
  // back to the broader topic set only if the specialty pool is too thin, then the whole field.
  const words = useMemo(() => {
    const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
    // preferInsiderVocab: within a topic, C1 tends to include terms patients/laypeople already
    // know (implant, caries) and jargon acronyms (MRR, NDA) are already common knowledge on the
    // job, while C2 non-jargon is the genuinely insider vocabulary (edentulous, periodontitis,
    // apicoectomy) - the whole point of "the words X runs on" is to impress a professional with
    // terms that feel like THEIRS, not ones any patient/colleague already says daily. Only for
    // this preview, NOT the placement test, which needs the real C1/C2 mix to assess level.
    const profPool = profTopics && profTopics.length ? SEED.filter((w) => profTopics.includes(w.topic)) : [];
    if (profPool.length >= 3) return shuffle(preferInsiderVocab(profPool)).slice(0, 3);
    const scoped = topics && topics.size ? SEED.filter((w) => topics.has(w.topic)) : [];
    const pool = scoped.length ? scoped : SEED.filter((w) => w.field === field);
    return shuffle(preferInsiderVocab(pool)).slice(0, 3);
  }, [profTopics, topics, field]);
  const head = profName ? `The words\n${profName.toLowerCase()} runs on` : (FIELD_HEAD[field] ?? 'Words worth\nknowing well');
  return (
    <View style={s.fieldWrap}>
      <Image source={FACE_ASSET[field]} style={{ width: 98, height: 110, alignSelf: 'center', marginBottom: 12 }} resizeMode="contain" />
      <Text style={[s.valueTitle, { marginBottom: 22 }]}>{head}</Text>
      {/* No `ex` on these cards (owner, 2026-09-10): removing the truncation cap on bnrDef/bnrEx
          fixed mid-sentence cutoffs but meant 3 full word+def+example cards could overflow the
          screen and force a scroll on this quick-payoff scene, which it was never meant to need.
          Dropping the example (not the word count, not the def) keeps all 3 cards and full
          untruncated definitions while recovering the room. */}
      <View style={s.fieldCards}>
        {words.map((w, i) => (
          <FieldWordCard key={w.id} co={co} word={w.word} def={w.def} delay={i * 400} reduce={reduce} />
        ))}
      </View>
    </View>
  );
}

function SceneHabit({ co }: { co: Palette }) {
  const s = makeStyles(co);
  return (
    <View style={s.sceneWrap}>
      <View style={s.illoCard}><GearsScene co={co} width={318} height={226} /></View>
      <Text style={s.valueTitle}>A little{'\n'}every day</Text>
    </View>
  );
}

// Kept short on purpose: each gloss must fit two lines in the notification/widget mock without
// truncating mid-word (owner flagged "pl…"). Aim ~40 chars.
const WIDGET_WORDS = [
  { w: 'equanimity', pos: 'n', d: 'Calmness and composure under strain.' },
  { w: 'perambulate', pos: 'v', d: 'To walk about or stroll at leisure.' },
  { w: 'susurrus', pos: 'n', d: 'A soft whispering or rustling sound.' },
  { w: 'halcyon', pos: 'adj', d: 'A bygone time of idyllic calm and joy.' },
];

// The widget is a core value prop: words reach you all day on the Home & Lock Screen without
// opening the app. Preview the REAL home-screen widget (black editorial card, serif word + gloss)
// and cycle the word every couple of seconds with a soft cross-fade + light haptic, so it reads
// as "a new word every time you glance at your phone" (passive learning).
const HS_APPS = ['#C9B27E', '#8FA76B', '#C57B5B', '#7E9BC9', '#B99FD0', '#D0B88F', '#89B0A0', '#C9A2AC'];
// The widget's whole value is passive, all-day exposure, but users have to ADD it. So we demo
// exactly that, the real iOS way: the widget gallery opens, Lexfall is picked OUT of the app
// list (highlight + haptic), the gallery dismisses, and the Lexfall widget pops onto the home
// screen and starts cycling words. (Home screen recreated, not a screenshot.)
const GALLERY_APPS: { name: string; color: string; lex?: boolean }[] = [
  { name: 'Weather', color: '#7E9BC9' },
  { name: 'Lexfall', color: '#0F0D0A', lex: true },
  { name: 'Notes', color: '#D0B88F' },
];
export function SceneWidget({ co, reduce }: { co: Palette; reduce?: boolean }) {
  const s = makeStyles(co);
  const [editing, setEditing] = useState(false);       // home screen in "jiggle" edit mode
  const [showGallery, setShowGallery] = useState(false);
  const [selected, setSelected] = useState(false);     // Lexfall row highlighted in the gallery
  const [added, setAdded] = useState(!!reduce);
  const press = useRef(new Animated.Value(0)).current;  // long-press ripple
  const jiggle = useRef(new Animated.Value(0)).current; // edit-mode wobble
  const plus = useRef(new Animated.Value(0)).current;   // the "+" add button appearing
  const plusTap = useRef(new Animated.Value(0)).current;
  const gallery = useRef(new Animated.Value(0)).current;
  const selPop = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const cross = useRef(new Animated.Value(1)).current;
  const [wi, setWi] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const jiggleLoop = useRef<Animated.CompositeAnimation | null>(null);

  // The full, real add-a-widget flow, beat by beat, so it never looks like it skipped straight to
  // "added": long-press (home jiggles) → the "+" appears and is tapped → the Add Widget gallery
  // slides up → Lexfall is picked → the widget pops onto the home screen. Tap the phone to replay.
  const play = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    jiggleLoop.current?.stop();
    setEditing(false); setShowGallery(false); setSelected(false); setAdded(false);
    press.setValue(0); jiggle.setValue(0); plus.setValue(0); plusTap.setValue(0); gallery.setValue(0); selPop.setValue(0); pop.setValue(0);
    const at = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
    // 1) long press → edit mode (ripple + jiggle + the "+" fades in)
    at(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      Animated.timing(press, { toValue: 1, duration: 520, useNativeDriver: true }).start();
      setEditing(true);
      jiggleLoop.current = Animated.loop(Animated.sequence([
        Animated.timing(jiggle, { toValue: 1, duration: 110, useNativeDriver: true }),
        Animated.timing(jiggle, { toValue: -1, duration: 110, useNativeDriver: true }),
      ]));
      jiggleLoop.current.start();
      Animated.spring(plus, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
    }, 800);
    // 2) tap the "+"
    at(() => {
      Haptics.selectionAsync().catch(() => {});
      Animated.sequence([
        Animated.timing(plusTap, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.timing(plusTap, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start();
    }, 2100);
    // 3) the Add Widget gallery slides up
    at(() => { setShowGallery(true); Animated.timing(gallery, { toValue: 1, duration: 300, useNativeDriver: true }).start(); }, 2400);
    // 4) pick Lexfall (highlight + bounce)
    at(() => { setSelected(true); Haptics.selectionAsync().catch(() => {}); Animated.spring(selPop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start(); }, 3350);
    // 5) gallery dismisses, jiggle stops, the widget pops onto the home screen
    at(() => {
      Animated.timing(gallery, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
        setShowGallery(false);
        setEditing(false);
        jiggleLoop.current?.stop();
        Animated.timing(jiggle, { toValue: 0, duration: 120, useNativeDriver: true }).start();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        setAdded(true);
        Animated.spring(pop, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
      });
    }, 3950);
  };

  useEffect(() => {
    if (reduce) return;
    play();
    const cyc = setInterval(() => {
      Animated.timing(cross, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => {
        setWi((x) => (x + 1) % WIDGET_WORDS.length);
        Animated.timing(cross, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 2400);
    return () => { timers.current.forEach(clearTimeout); jiggleLoop.current?.stop(); clearInterval(cyc); };
  }, []);
  const cur = WIDGET_WORDS[wi];
  const popStyle = { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }] };
  const galleryStyle = { opacity: gallery, transform: [{ translateY: gallery.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] };
  const selScale = selPop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  const jiggleRot = jiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-2.4deg', '2.4deg'] });
  const rippleStyle = { opacity: press.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.32, 0] }), transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.9] }) }] };
  const plusStyle = { opacity: plus, transform: [{ scale: plus.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }, { scale: plusTap.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }) }] };
  return (
    <View style={s.widgetWrap}>
      <Text style={s.valueTitle}>Learn without{'\n'}opening the app</Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: co.muted, textAlign: 'center', marginTop: 8, lineHeight: 20, paddingHorizontal: 6 }}>
        <Text style={{ fontFamily: fonts.sansSemi, fontSize: 15, color: co.text }}>You check your phone ~150 times a day.</Text> Meet a new word every time, passively, on your Home and Lock Screens.
      </Text>
      <Pressable onPress={reduce ? undefined : play} style={s.phoneWrap}>
        <View style={s.phoneIsland} />
        <View style={s.phoneStatus}>
          <Text style={s.phoneTime}>9:41</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={s.phoneDot} /><View style={s.phoneDot} /><View style={[s.phoneDot, { width: 16, borderRadius: 3 }]} />
          </View>
        </View>
        {/* the "+" add button (top-left) that appears in edit mode and gets tapped */}
        {editing && !added && (
          <Animated.View style={[s.plusBtn, plusStyle]}><Text style={s.plusTxt}>＋</Text></Animated.View>
        )}
        {/* widget slot: long-press ripple → Add Widget gallery (pick Lexfall) → the widget pops in */}
        <View style={s.hsSlot}>
          {showGallery ? (
            <Animated.View style={[s.gallery, galleryStyle]}>
              <View style={s.galleryGrab} />
              <Text style={s.galleryTitle}>Add Widget</Text>
              {GALLERY_APPS.map((a) => {
                const isLex = !!a.lex;
                const on = isLex && selected;
                const Row: any = isLex ? Animated.View : View;
                return (
                  <Row key={a.name} style={[s.galleryRow, on && { backgroundColor: co.accent }, isLex && { transform: [{ scale: selScale }] }]}>
                    <View style={[s.galleryIcon, { backgroundColor: a.color }]}>{isLex && <Text style={s.galleryL}>L</Text>}</View>
                    <Text style={[s.galleryName, on && { color: co.ink }]}>{a.name}</Text>
                    {on
                      ? <Svg width={17} height={17} viewBox="0 0 24 24"><Path d="m5 12 5 5L20 7" stroke={co.ink} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
                      : <Text style={s.galleryAdd}>＋</Text>}
                  </Row>
                );
              })}
            </Animated.View>
          ) : added ? (
            <Animated.View style={[s.wgtCard, popStyle]}>
              <Animated.Text style={[s.wgtWord, { opacity: cross }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{cur.w}</Animated.Text>
              <Animated.Text style={[s.wgtDef, { opacity: cross }]} numberOfLines={2}>({cur.pos}) {cur.d}</Animated.Text>
            </Animated.View>
          ) : (
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={[s.pressRing, rippleStyle]} />
              {editing && <Text style={s.editHint}>Hold, then tap ＋</Text>}
            </View>
          )}
        </View>
        {added && <Text style={s.wgtAppLabel}>Lexfall</Text>}
        {/* home-screen app grid (wobbles while in edit mode) */}
        <View style={s.hsGrid}>
          {HS_APPS.map((c, i) => (
            <Animated.View key={i} style={[s.appIcon, { backgroundColor: c }, editing && { transform: [{ rotate: jiggleRot }] }]} />
          ))}
          <Animated.View style={[s.appIcon, { backgroundColor: '#141210', alignItems: 'center', justifyContent: 'center' }, editing && { transform: [{ rotate: jiggleRot }] }]}>
            <Text style={{ fontFamily: fonts.serif, fontSize: 20, color: co.accent }}>L</Text>
          </Animated.View>
        </View>
      </Pressable>
    </View>
  );
}

// The notification value prop on its OWN screen (split out from the widget screen): a Lock Screen
// with a Lexfall notification sliding in and settling like a real one, cycling the word. This is
// also the natural place to make the argument right before the OS notification-permission prompt
// (which fires on Continue from here, see next()).
export function SceneNotif({ co, reduce }: { co: Palette; reduce?: boolean }) {
  const s = makeStyles(co);
  const slide = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const cross = useRef(new Animated.Value(1)).current;
  const [wi, setWi] = useState(0);
  useEffect(() => {
    if (reduce) return;
    Animated.sequence([
      Animated.delay(500),
      Animated.spring(slide, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
    ]).start(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}));
    const cyc = setInterval(() => {
      Animated.timing(cross, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => {
        setWi((x) => (x + 1) % WIDGET_WORDS.length);
        Animated.timing(cross, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 2600);
    return () => clearInterval(cyc);
  }, []);
  const cur = WIDGET_WORDS[wi];
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [-26, 0] });
  return (
    <View style={s.widgetWrap}>
      <Text style={s.valueTitle}>A word arrives{'\n'}every time it lights up</Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: co.muted, textAlign: 'center', marginTop: 8, lineHeight: 20, paddingHorizontal: 6 }}>
        Turn on notifications and a fresh advanced word lands on your Lock Screen, between the texts and the news. Passive learning, no app to open.
      </Text>
      <View style={s.lockWrap}>
        <Svg width={17} height={17} viewBox="0 0 24 24" style={{ marginBottom: 8 }}><Path d="M6 10V8a6 6 0 1112 0v2M5 10h14v10H5V10z" stroke={co.faint} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
        <Text style={s.lockTime}>9:41</Text>
        <Text style={s.lockDate}>Tuesday morning</Text>
        <Animated.View style={[s.bnrCard, { alignSelf: 'stretch', marginTop: 22, opacity: slide, transform: [{ translateY }] }]}>
          <View style={s.bnrIcon}><Text style={s.bnrIconTxt}>L</Text></View>
          <View style={{ flex: 1 }}>
            <View style={s.bnrTop}>
              <Animated.Text style={[s.bnrWord, { opacity: cross }]} numberOfLines={1}>{cur.w}</Animated.Text>
              <Text style={s.bnrTime}>now</Text>
            </View>
            <Animated.Text style={[s.bnrDef, { opacity: cross }]} numberOfLines={2}>({cur.pos}) {cur.d}</Animated.Text>
          </View>
        </Animated.View>
      </View>
      <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, textAlign: 'center', marginTop: 18, paddingHorizontal: 24, lineHeight: 18 }}>
        Tap Continue to turn notifications on. You can change it anytime in Settings.
      </Text>
    </View>
  );
}

// Tweens a number from 0 up to `to` on mount (the payoff beats: the level score and the
// "1,882 words waiting" count). Fires one light haptic when it lands. Reduced-motion: shows
// the final value at once, no animation, no haptic.
function CountUp({ to, format, style, reduce, haptic, duration = 900 }: { to: number; format?: (n: number) => string; style?: any; reduce?: boolean; haptic?: boolean; duration?: number }) {
  const a = useRef(new Animated.Value(reduce ? to : 0)).current;
  const [n, setN] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) { setN(to); return; }
    const id = a.addListener(({ value }) => setN(Math.round(value)));
    Animated.timing(a, { toValue: to, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => { if (haptic) Haptics.selectionAsync().catch(() => {}); });
    return () => a.removeListener(id);
  }, [to]);
  return <Text style={style}>{format ? format(n) : String(n)}</Text>;
}

function TrialRow({ co, day, title, body, last, active }: { co: Palette; day: string; title: string; body: string; last?: boolean; active?: boolean }) {
  const s = makeStyles(co);
  return (
    <View style={s.trialRow}>
      <View style={s.trialRail}>
        <View style={[s.trialDot, !active && s.trialDotDim]} />
        {!last && <View style={s.trialLine} />}
      </View>
      <View style={s.trialBody}>
        <Text style={s.trialDay}>{day}</Text>
        <Text style={s.trialTitle}>{title}</Text>
        <Text style={s.trialText}>{body}</Text>
      </View>
    </View>
  );
}

// Pre-paywall "How your N days work" timeline. Extracted so it renders identically in the
// onboarding 'trial' slot and in the dev-capture preview. Trial length + billing/reminder days
// are derived live from the annual offer (introTrialDays), so this can never drift from the real
// Apple trial the way the old hardcoded "7 days / Day 5 / Day 7" copy did.
export function TrialTimeline({ co, offering }: { co: Palette; offering: PurchasesOffering | null }) {
  const styles = makeStyles(co);
  const a = findPackage(offering, 'annual');
  const trialDays = introTrialDays(a) ?? 3;
  const remindDay = Math.max(1, trialDays - 1);
  // House rule: never show the bare annual total. Lead with % off + per-week, annual billing is
  // the secondary line. Same helper the paywall uses, so the two can't disagree.
  const { perWeek, savePct, annualStr } = annualAnchorPricing(offering);
  const billTitle = perWeek
    ? (savePct ? `${savePct}% off · ${perWeek}/wk` : `${perWeek}/wk`)
    : 'Trial ends';
  const billBody = annualStr
    ? `Billed annually (${annualStr}). Cancel any time before this in one tap, and you are never charged.`
    : 'Cancel any time before this in one tap, and you are never charged.';
  return (
    <View>
      <Text style={[label, { textAlign: 'center' }]}>Your free trial</Text>
      <Text style={[styles.title, { textAlign: 'center', marginTop: 12 }]}>How your{'\n'}{trialDays} days work</Text>
      <View style={styles.timeline}>
        <TrialRow co={co} active day="Today" title="Full access, free" body="Every advanced word, the Home Screen widget, practice and stats. Nothing held back." />
        <TrialRow co={co} day={`Day ${remindDay}`} title="A gentle reminder" body="We nudge you a day before the trial ends, so nothing is a surprise." />
        <TrialRow co={co} day={`Day ${trialDays}`} title={billTitle} body={billBody} last />
      </View>
    </View>
  );
}

export const makeStyles = (co: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: co.bg, paddingHorizontal: 28 },
  back: { paddingVertical: 4 },
  backTxt: { fontFamily: fonts.sans, fontSize: 14, color: co.muted },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skipTxt: { fontFamily: fonts.sansMedium, fontSize: 15, color: co.muted },
  trust: { alignItems: 'center', marginTop: 26 },
  trustStars: { fontSize: 15, color: co.accent, letterSpacing: 3 },
  trustText: { fontFamily: fonts.sans, fontSize: 14, color: co.text, marginTop: 7, textAlign: 'center' },

  // Progress bar (personalization sequence)
  progress: { height: 3, borderRadius: 3, backgroundColor: co.line, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 3, backgroundColor: co.accent },
  buildWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  buildMark: { alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  buildLines: { alignSelf: 'stretch', gap: 14, marginTop: 22, paddingHorizontal: 20 },
  buildLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buildLineTxt: { fontFamily: fonts.sans, fontSize: 15.5, color: co.muted },
  buildLineDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: co.surface2 },
  buildBarTrack: { alignSelf: 'stretch', marginHorizontal: 20, height: 5, borderRadius: 3, backgroundColor: co.surface2, overflow: 'hidden' },
  buildBarFill: { height: '100%', borderRadius: 3 },
  buildReveal: { alignItems: 'center', marginTop: 18 },
  firstWin: { alignItems: 'center', marginTop: 4, paddingHorizontal: 20 },
  dayMark: { alignItems: 'center' },
  dayMarkEyebrow: { fontFamily: fonts.sansSemi, fontSize: 13, letterSpacing: 3, textTransform: 'uppercase', color: co.accent, marginBottom: 10 },
  dayMedallion: { width: DAY_RING_BOX, height: DAY_RING_BOX, alignItems: 'center', justifyContent: 'center' },
  dayDisc: { width: 150, height: 150, borderRadius: 75, backgroundColor: co.accent, alignItems: 'center', justifyContent: 'center' },
  dayDiscNum: { fontFamily: fonts.serif, fontSize: 86, color: co.ink, lineHeight: 96 },
  streakPanel: { backgroundColor: co.surface2, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 14, marginTop: 18 },
  streakRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  streakDay: { width: 36, height: 36, borderRadius: 18, backgroundColor: co.surface2, alignItems: 'center', justifyContent: 'center' },
  streakDayOn: { backgroundColor: co.accent },
  streakDayTxt: { fontFamily: fonts.sansSemi, fontSize: 12.5, color: co.muted },
  buildChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
  buildChip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: co.surface2 },
  buildChipTxt: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: co.text },
  // #7 differentiators
  diffCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: co.surface2, borderRadius: 16, padding: 16 },
  diffIconMk: { width: 60, height: 60, borderRadius: 30, backgroundColor: co.accent + '14', alignItems: 'center', justifyContent: 'center' },
  diffTitle: { fontFamily: fonts.serif, fontSize: 18, color: co.text },
  diffSub: { fontFamily: fonts.sans, fontSize: 14.5, color: co.text, lineHeight: 20, marginTop: 3 },
  // Was co.accent (pale gold) - borderline-fails AA contrast on the light theme's cream bg at
  // this size. co.text plus the italic serif reads as "handwritten" from typography alone,
  // not from a low-contrast color choice.
  founderLine: { fontFamily: fonts.serifItalic, fontSize: 19, color: co.text, textAlign: 'center', lineHeight: 26, marginTop: 34 },
  // #5 retention chart
  chartCard: { backgroundColor: co.surface2, borderRadius: 18, padding: 20, marginTop: 26 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 6 },
  chartAxis: { fontFamily: fonts.sans, fontSize: 12, color: co.muted },
  chartEndLabel: { fontFamily: fonts.sansSemi, fontSize: 12 },
  chartLegend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendTxt: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: co.muted },
  legendTxtOn: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: co.text },
  perSect: { ...label, color: co.faint, marginTop: 26, marginBottom: 12 },
  perSectTight: { ...label, color: co.faint, marginTop: 26, marginBottom: 4 },
  perHint: { fontFamily: fonts.sans, fontSize: 13.5, color: co.muted, marginBottom: 12 },
  perRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  perChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: co.surface2 },
  perChipOn: { backgroundColor: co.accent },
  perChipTxt: { fontFamily: fonts.sansMedium, fontSize: 14, color: co.text },
  perChipTxtOn: { color: co.ink },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: co.surface2, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14 },
  voiceRowOn: { backgroundColor: co.accent },
  voicePlayMk: { width: 30, height: 30, borderRadius: 15, backgroundColor: co.surface, alignItems: 'center', justifyContent: 'center' },
  voicePlayMkOn: { backgroundColor: co.ink + '1A' },
  voiceLabel: { fontFamily: fonts.sansMedium, fontSize: 14.5, color: co.text },
  voiceLabelOn: { color: co.ink },
  waveRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16, marginTop: 6 },
  waveBar: { width: 2.5, borderRadius: 1.5 },
  accents: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  swatch: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  previewCard: { height: 140, borderRadius: 16, overflow: 'hidden', backgroundColor: co.surface2, padding: 16, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  previewBgFill: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', padding: 16 },
  previewScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,14,11,0.42)' },
  previewWord: { fontFamily: fonts.serif, fontSize: 24, color: co.text, textAlign: 'center' },
  previewDef: { fontFamily: fonts.sans, fontSize: 13, color: co.muted, marginTop: 4, textAlign: 'center' },
  previewTxtOnPhoto: { color: '#F4EEE2' },
  // Portrait, matching the real feed card's actual TikTok-style shape (~9:16) - centered on its
  // own screen rather than stretched full-width like the compact variant. Explicit width+height
  // (not aspectRatio) so both cleanly override previewCard's fixed height in the style array.
  // Sized to fit the REAL onboarding chrome (back row + progress bar + title + subtitle +
  // segment + this card + the fixed footer Continue button) without scrolling - the first size
  // (260x462) only looked right in dev-capture, which has no footer/full chrome and so hid ~130pt
  // of real overflow (owner caught it live: the card needed a scroll to see the bottom).
  // Grown back up after the subtitle was cut (owner request: use the freed vertical space to
  // make the card itself the hero, closer to how it actually looks full-bleed in the real feed).
  previewCardTall: { width: 250, height: 445, borderRadius: 26, alignSelf: 'center', marginTop: 22, padding: 22 },
  previewWordTall: { fontSize: 29 },
  previewDefTall: { fontSize: 14, marginTop: 7, lineHeight: 20 },
  retentionCaption: { fontFamily: fonts.sans, fontSize: 14.5, color: co.muted, lineHeight: 22, textAlign: 'center', marginTop: 26 },
  // #6 projection
  projLabel: { fontFamily: fonts.sans, fontSize: 15, color: co.muted, marginTop: 30 },
  projNumber: { fontFamily: fonts.serif, fontSize: 68, color: co.accent, letterSpacing: -1, marginTop: 4 },
  projSuffix: { fontFamily: fonts.sans, fontSize: 17, color: co.text, marginTop: 2 },
  // #8 reviews
  reviewCard: { backgroundColor: co.surface2, borderRadius: 16, padding: 16 },
  reviewStars: { fontSize: 14, color: co.accent, letterSpacing: 2 },
  reviewText: { fontFamily: fonts.sans, fontSize: 15, color: co.text, lineHeight: 22, marginTop: 8 },
  reviewAuthor: { fontFamily: fonts.sansMedium, fontSize: 13, color: co.muted, marginTop: 8 },

  // Trial timeline
  timeline: { marginTop: 30, paddingHorizontal: 6 },
  trialRow: { flexDirection: 'row', gap: 14 },
  trialRail: { width: 14, alignItems: 'center', paddingTop: 4 },
  trialDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: co.accent },
  trialDotDim: { backgroundColor: co.line2 },
  trialLine: { width: 2, flex: 1, backgroundColor: co.line2, marginTop: 4, marginBottom: -4 },
  trialBody: { flex: 1, paddingBottom: 28 },
  trialDay: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: co.accent },
  trialTitle: { fontFamily: fonts.serif, fontSize: 20, color: co.text, marginTop: 4 },
  trialText: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, marginTop: 4, lineHeight: 20 },

  // Placement test (flashcard)
  placeWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeIntro: { fontFamily: fonts.serif, fontSize: 24, color: co.text, textAlign: 'center', marginBottom: 6 },
  placeCount: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 1.2, color: co.muted, marginBottom: 22, textTransform: 'uppercase' },
  // Premium paper-card treatment (owner, 2026-09-11: the old bordered box "looks like AI, doesn't
  // match the app" - real paper stock reads through a soft lifted shadow + warm card-stock color,
  // not a flat outline). Shared by the flashcard and the pace-screen word preview.
  paperCard: {
    backgroundColor: co.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: co.line,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
      default: { elevation: 6 },
    }),
  },
  placeCard: { alignSelf: 'stretch', backgroundColor: co.surface, borderRadius: 22, paddingVertical: 30, paddingHorizontal: 20, alignItems: 'center' },
  placeWord: { fontFamily: fonts.serif, fontSize: 38, color: co.text, textAlign: 'center' },
  placeIpa: { fontFamily: fonts.serifItalic, fontSize: 17, color: co.muted, marginTop: 10 },
  placePos: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, marginTop: 6 },
  placeEx: { fontFamily: fonts.serifItalic, fontSize: 15, color: co.muted, textAlign: 'center', marginTop: 14, paddingHorizontal: 6 },
  placeBtns: { flexDirection: 'row', gap: 12, alignSelf: 'stretch', marginTop: 24 },
  placeBtn: { flex: 1, backgroundColor: co.surface2, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  placeBtnTxt: { fontFamily: fonts.sansSemi, fontSize: 16, color: co.text },
  placeLevel: { fontFamily: fonts.serif, fontSize: 26, color: co.accent, textAlign: 'center', marginTop: 4 },
  resultLine: { fontFamily: fonts.serif, fontSize: 32, color: co.text, textAlign: 'center', marginTop: 10, lineHeight: 40 },
  softRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: co.line },
  softMk: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  resWord: { fontFamily: fonts.serif, fontSize: 18, color: co.text },
  resDef: { fontFamily: fonts.sans, fontSize: 12, color: co.muted, marginTop: 2 },
  // `bottom` is set inline per-screen (varies with safe-area insets); this just fixes the
  // horizontal centering + clears it from the normal layout flow.
  savedPopWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  savedPop: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: co.accent, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 16 },
  savedPopTxt: { fontFamily: fonts.sansSemi, fontSize: 17, color: co.ink },
  vaultMk: { width: 64, height: 64, borderRadius: 32, backgroundColor: co.accent + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  vaultTxt: { fontFamily: fonts.serif, fontSize: 19, color: co.text, textAlign: 'center', paddingHorizontal: 30 },

  // Interstitial scenes
  sceneWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sceneArt: { alignSelf: 'stretch', height: 250, marginBottom: 12, alignItems: 'center', justifyContent: 'center' },
  illoCard: { alignSelf: 'stretch', height: 250, marginBottom: 14, alignItems: 'center', justifyContent: 'center' },
  pad: { position: 'absolute', width: 240, height: 78, borderRadius: 40, backgroundColor: co.accent, opacity: 0.13, bottom: 34 },
  valueTitle: { fontFamily: fonts.serif, fontSize: 30, color: co.text, textAlign: 'center', lineHeight: 37, marginTop: 6 },
  sceneSub: { textAlign: 'center', maxWidth: 300, marginTop: 14 },
  wordCardBack: { position: 'absolute', width: 205, height: 150, borderRadius: 20, backgroundColor: co.surface2, borderWidth: 1, borderColor: co.line, opacity: 0.5 },
  wordCard: { position: 'absolute', width: 232, backgroundColor: co.surface2, borderWidth: 1, borderColor: co.line2, borderRadius: 20, padding: 20 },
  mockTopic: { fontFamily: fonts.sansSemi, fontSize: 9, letterSpacing: 1.5, color: co.accent },
  mockWord: { fontFamily: fonts.serif, fontSize: 30, color: co.text, marginTop: 10 },
  mockIpa: { fontFamily: fonts.serifItalic, fontSize: 14, color: co.muted, marginTop: 6 },
  mockDef: { fontFamily: fonts.sans, fontSize: 14, color: co.text, marginTop: 10, lineHeight: 19 },
  swipe: { position: 'absolute', bottom: 6, alignItems: 'center' },
  peopleGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 232, justifyContent: 'center', gap: 12 },
  person: { width: 104, backgroundColor: co.surface2, borderWidth: 1, borderColor: co.line2, borderRadius: 16, paddingVertical: 14, alignItems: 'center', gap: 6 },
  personLbl: { fontFamily: fonts.sansMedium, fontSize: 13, color: co.text },
  streakCard: { width: 252, backgroundColor: co.surface2, borderWidth: 1, borderColor: co.line2, borderRadius: 20, padding: 20 },
  streakTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  streakN: { fontFamily: fonts.serif, fontSize: 22, color: co.text },
  streakCap: { fontFamily: fonts.sans, fontSize: 12, color: co.muted, marginTop: 2 },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: co.surface2, alignItems: 'center', justifyContent: 'center' },
  dayDotOn: { backgroundColor: co.accent, borderColor: co.accent },
  dayLbl: { fontFamily: fonts.sans, fontSize: 10, color: co.muted },
  home: { width: 232, backgroundColor: co.surface2, borderWidth: 1, borderColor: co.line2, borderRadius: 22, padding: 16, gap: 14 },
  appRow: { flexDirection: 'row', justifyContent: 'space-between' },
  appSq: { width: 40, height: 40, borderRadius: 10, backgroundColor: co.line2, opacity: 0.6 },
  widget: { backgroundColor: co.bg, borderWidth: 1, borderColor: co.line, borderRadius: 16, padding: 16, alignItems: 'center' },
  wLabel: { fontFamily: fonts.sansSemi, fontSize: 9, letterSpacing: 2, color: co.accent, textAlign: 'center' },
  wWord: { fontFamily: fonts.serif, fontSize: 24, color: co.text, marginTop: 8, textAlign: 'center' },
  wDef: { fontFamily: fonts.sans, fontSize: 12.5, color: co.text, marginTop: 9, lineHeight: 17, textAlign: 'center' },

  stepIllo: { alignItems: 'center', marginBottom: 22 },
  heroIllo: { alignItems: 'center', marginBottom: 6 },
  mark: { fontFamily: fonts.serif, fontSize: 56, color: co.text, letterSpacing: -1 },
  markO: { color: co.accent, fontStyle: 'italic' },
  markSmall: { fontFamily: fonts.sansSemi, fontSize: 13, letterSpacing: 3, color: co.muted, marginBottom: 12 },
  introHead: { fontFamily: fonts.serif, fontSize: 30, color: co.text, textAlign: 'center', lineHeight: 37 },
  title: { fontFamily: fonts.serif, fontSize: 29, color: co.text, marginTop: 14, marginBottom: 12, letterSpacing: -0.3 },
  sub: { fontFamily: fonts.sans, fontSize: 16, color: co.muted, lineHeight: 24, marginBottom: 24 },
  stats: { flexDirection: 'row', marginTop: 36, borderTopWidth: 1, borderBottomWidth: 1, borderColor: co.line, paddingVertical: 16, alignSelf: 'stretch' },
  statCell: { flex: 1, alignItems: 'center' },
  statDiv: { borderLeftWidth: 1, borderLeftColor: co.line },
  statN: { fontFamily: fonts.serif, fontSize: 22, color: co.text },
  statL: { fontFamily: fonts.sans, fontSize: 11, color: co.text, marginTop: 2 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: co.line },
  optIllo: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  optName: { fontFamily: fonts.serif, fontSize: 18, color: co.text },
  optNote: { fontFamily: fonts.sans, fontSize: 15.5, color: co.muted, marginTop: 2, lineHeight: 21 },
  check: { width: 22, height: 22, borderRadius: 11, backgroundColor: co.line2, alignItems: 'center', justifyContent: 'center' },
  checkSquare: { borderRadius: 7 },
  checkOn: { backgroundColor: co.accent, borderColor: co.accent },
  checkMark: { color: co.ink, fontSize: 12, fontWeight: '700' },
  input: { fontFamily: fonts.serif, fontSize: 24, color: co.text, borderBottomWidth: 1, borderBottomColor: co.line2, paddingVertical: 12 },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  catLabel: { fontFamily: fonts.sansSemi, fontSize: 15.5, color: co.text },
  catNote: { fontFamily: fonts.sans, fontSize: 12, color: co.accent, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: { backgroundColor: co.surface2, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 15 },
  chipOn: { backgroundColor: co.accent },
  chipTxt: { fontFamily: fonts.sansMedium, fontSize: 15, color: co.muted },
  search: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: co.surface2, borderRadius: 14, paddingHorizontal: 14, height: 48, marginBottom: 16 },
  searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 15.5, color: co.text, padding: 0 },
  searchClear: { fontFamily: fonts.sans, fontSize: 15, color: co.faint },
  noMatch: { fontFamily: fonts.sans, fontSize: 14.5, color: co.muted, marginTop: 6 },
  areaSection: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 1.5, color: co.muted, marginTop: 12, marginBottom: 10, marginLeft: 4, textTransform: 'uppercase' },
  catCard: { marginBottom: 10, borderWidth: 1, borderColor: co.line, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 14 },
  catRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  catRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catTick: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: co.accent, borderRadius: 999, paddingLeft: 7, paddingRight: 9, paddingVertical: 3 },
  catTickN: { fontFamily: fonts.sansSemi, fontSize: 12.5, color: co.ink },
  // Fixed height (owner, 2026-09-11): as the preview cycles words with different-length
  // definitions, an auto-sized card made "Set your goal" and everything below jump up/down
  // every ~2.5s. minHeight + capped lines keeps the card (and the rest of the screen) still.
  wprev: { padding: 18, marginBottom: 18, alignItems: 'center', justifyContent: 'center', minHeight: 128 },
  wprevW: { fontFamily: fonts.serif, fontSize: 24, color: co.text, textAlign: 'center' },
  wprevD: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, marginTop: 4, textAlign: 'center' },
  // Fixed dark colors (not theme-driven) so this reads as a real phone notification whether the
  // app itself is in light or dark mode - same fixed-dark-mock pattern as SceneWidget elsewhere.
  // Black BORDER, not a solid black fill (owner, 2026-09-11 v3: "maybe use black borders here
  // instead of all black for the word") - the card sits on the screen's normal light surface now.
  wprevDark: { backgroundColor: co.surface, borderRadius: 18, borderWidth: 2, borderColor: '#000000', padding: 18, marginTop: 22, alignItems: 'center', justifyContent: 'center', minHeight: 118 },
  wprevWDark: { fontFamily: fonts.serif, fontSize: 24, color: co.text, textAlign: 'center' },
  wprevDDark: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, marginTop: 4, textAlign: 'center' },
  specRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: co.line },
  specL: { fontFamily: fonts.sans, fontSize: 15, color: co.text },
  specS: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  stepBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: co.surface2, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { color: co.text, fontSize: 19 },
  stepVal: { fontFamily: fonts.serif, fontSize: 20, color: co.text, minWidth: 26, textAlign: 'center' },
  // Clear "this is tappable" signal (owner, 2026-09-11) - the wired-up native time picker had
  // zero visual affordance before this, so it looked unchanged/broken from the outside.
  stepValTap: { color: co.accent, textDecorationLine: 'underline', textDecorationColor: co.accent + '80' },
  timeWheelWrap: { alignItems: 'center', backgroundColor: co.surface2, borderRadius: 14, marginTop: 4, marginBottom: 10, paddingBottom: 8 },
  timeWheelDone: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, marginHorizontal: 12, backgroundColor: co.accent, borderRadius: 10 },
  timeWheelDoneTxt: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.ink },
  planCard: { borderWidth: 1, borderColor: co.line, borderRadius: 18, paddingHorizontal: 18, backgroundColor: co.surface },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  planDiv: { borderTopWidth: 1, borderTopColor: co.line },
  planK: { fontFamily: fonts.sans, fontSize: 14.5, color: co.muted },
  planV: { fontFamily: fonts.sansSemi, fontSize: 15.5, color: co.text, maxWidth: 200, textAlign: 'right' },
  planNote: { fontFamily: fonts.sans, fontSize: 13.5, color: co.muted, textAlign: 'center', marginTop: 16, lineHeight: 20 },
  ahaProjLabel: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 1.5, color: co.muted, textTransform: 'uppercase', textAlign: 'center', marginTop: 30, marginBottom: 14 },
  ahaStat: { alignItems: 'center', marginTop: 24 },
  ahaBig: { fontFamily: fonts.serif, fontSize: 34, color: co.text, letterSpacing: -0.5 },
  ahaSmall: { fontFamily: fonts.sans, fontSize: 14.5, color: co.muted, marginTop: 6 },
  fieldWrap: { marginTop: -25 },
  fieldCards: { alignSelf: 'stretch', gap: 12 },
  fieldCard: { borderWidth: 1, borderColor: co.line2, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 18, backgroundColor: co.surface },
  fieldWord: { fontFamily: fonts.serif, fontSize: 21, color: co.text, textAlign: 'center' },
  fieldDef: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, marginTop: 4, lineHeight: 19, textAlign: 'center' },

  // Sample words as iOS notification banners (the "words find you" concept)
  bnrCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: co.surface, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } },
  // The widget shown inside a phone mock.
  phoneWrap: { alignSelf: 'center', width: 284, marginTop: 16, backgroundColor: co.surface2, borderRadius: 44, borderWidth: 4, borderColor: '#1E1E1E', paddingTop: 12, paddingHorizontal: 13, paddingBottom: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 12 } },
  phoneIsland: { alignSelf: 'center', width: 86, height: 24, borderRadius: 13, backgroundColor: '#141414', marginBottom: 8 },
  phoneStatus: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 6, marginBottom: 16 },
  phoneTime: { fontFamily: fonts.sansSemi, fontSize: 13, color: co.text },
  phoneDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: co.muted },
  wgtCard: { alignSelf: 'stretch', backgroundColor: '#0F0D0A', borderRadius: 20, paddingVertical: 20, paddingHorizontal: 18, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  wgtWord: { fontFamily: fonts.serif, fontSize: 26, color: '#ECE5D7', letterSpacing: -0.3, textAlign: 'center' },
  wgtDef: { fontFamily: fonts.sans, fontSize: 13, color: '#CFC6B4', textAlign: 'center', marginTop: 6, lineHeight: 18 },
  wgtAppLabel: { fontFamily: fonts.sans, fontSize: 11.5, color: co.muted, textAlign: 'center', marginTop: 7 },
  // Lock-screen mock (the notification screen — dark, so it reads as a lock screen at a glance and
  // the light notification banner sits on it like the real thing).
  // Light lock screen (owner: a dark phone read too harsh). The banner sits on it like a frosted
  // iOS notification on a light wallpaper; the dark bezel still defines the phone's edge.
  lockWrap: { alignSelf: 'center', width: 284, marginTop: 22, backgroundColor: co.surface2, borderRadius: 44, borderWidth: 4, borderColor: '#1E1E1E', paddingTop: 34, paddingHorizontal: 16, paddingBottom: 30, alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 12 } },
  lockTime: { fontFamily: fonts.serif, fontSize: 62, color: co.text, letterSpacing: -1 },
  lockDate: { fontFamily: fonts.sans, fontSize: 14, color: co.muted },
  hsSlot: { minHeight: 172, justifyContent: 'center' },
  // Widget gallery (pick Lexfall out of the app list) — a light sheet card over the home screen.
  gallery: { alignSelf: 'stretch', backgroundColor: co.surface, borderRadius: 20, paddingTop: 8, paddingBottom: 8, paddingHorizontal: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  galleryGrab: { alignSelf: 'center', width: 34, height: 4, borderRadius: 2, backgroundColor: co.line2, marginTop: 2, marginBottom: 8 },
  galleryTitle: { fontFamily: fonts.sansSemi, fontSize: 12.5, letterSpacing: 0.3, color: co.muted, textAlign: 'center', marginBottom: 8 },
  galleryRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 13 },
  galleryIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  galleryL: { fontFamily: fonts.serif, fontSize: 17, color: co.accent },
  galleryName: { fontFamily: fonts.sansMedium, fontSize: 14.5, color: co.text, flex: 1 },
  galleryAdd: { fontFamily: fonts.sans, fontSize: 18, color: co.faint },
  // Add-widget flow: the "+" button (edit mode), the long-press ripple, and a short cue.
  plusBtn: { position: 'absolute', top: 44, left: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: co.surface, alignItems: 'center', justifyContent: 'center', zIndex: 5, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  plusTxt: { fontFamily: fonts.sans, fontSize: 20, color: co.text, marginTop: -2 },
  pressRing: { width: 76, height: 76, borderRadius: 38, backgroundColor: co.muted },
  editHint: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, marginTop: 14 },
  hsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 16 },
  appIcon: { width: 40, height: 40, borderRadius: 11 },
  bnrIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: co.accent, alignItems: 'center', justifyContent: 'center' },
  bnrIconTxt: { fontFamily: fonts.serif, fontSize: 23, color: co.bg, marginTop: -1 },
  bnrTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  bnrWord: { fontFamily: fonts.serif, fontSize: 20, color: co.text, flex: 1 },
  bnrTime: { fontFamily: fonts.sans, fontSize: 12, color: co.muted, marginLeft: 8 },
  bnrDef: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, marginTop: 2, lineHeight: 19 },
  bnrEx: { fontFamily: fonts.serifItalic, fontSize: 14, color: co.muted, marginTop: 2, lineHeight: 19 },
  feat: { fontFamily: fonts.sans, fontSize: 14.5, color: co.text, marginBottom: 14, textAlign: 'center' },
  price: { backgroundColor: co.surface2, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  priceBig: { fontFamily: fonts.serif, fontSize: 20, color: co.text },
  priceSm: { fontFamily: fonts.sans, fontSize: 12, color: co.muted, marginTop: 3 },
  fine: { fontFamily: fonts.sans, fontSize: 11, color: co.faint, textAlign: 'center', marginTop: 12, lineHeight: 17 },
  dots: { flexDirection: 'row', gap: 5, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: co.line2 },
  dotOn: { width: 16, backgroundColor: co.accent },
  btn: { backgroundColor: co.accent, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  // Disabled Continue = a clearly-inactive neutral fill (NOT a faded gold, which reads as tappable brown).
  btnOff: { backgroundColor: co.surface2 },
  btnTxtOff: { color: co.faint },
  btnTxt: { fontFamily: fonts.sansSemi, fontSize: 17, color: co.ink },
  widgetWrap: { flex: 1, alignItems: 'center', paddingTop: 4 },
  wcRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: co.surface2, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 10 },
  wcWord: { fontFamily: fonts.serif, fontSize: 20, color: co.text, flexShrink: 1 },
  wcCheck: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: co.line2, alignItems: 'center', justifyContent: 'center' },
  demo: { fontFamily: fonts.sans, fontSize: 12, color: co.faint, textAlign: 'center', marginTop: 14, textDecorationLine: 'underline' },
});
