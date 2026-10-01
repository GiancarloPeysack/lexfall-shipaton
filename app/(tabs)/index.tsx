import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl, useWindowDimensions, StyleSheet, PanResponder, Animated, Easing, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Circle, Ellipse, Line, Defs, RadialGradient, LinearGradient, Stop } from 'react-native-svg';
import { useApp } from '../../lib/app-state';
import { getAllFeedWords, getTodaySaved, getTodayLearned, getSavedCount, getWordById, recordLearned, type LevelPref } from '../../lib/db';
import { getAppOpenStreak, weekOpenStrip } from '../../lib/streak';
import FeedTour from '../../components/FeedTour';

// Streak flame silhouette, surfaced in the feed top bar so the daily loop is always visible.
const FLAME_D = 'M12 1c2.2 4.3 7 6.6 7 13a7 7 0 0 1-14 0c0-2.4 1-4 2.4-5.4-.2 2.3 1.1 3.6 2.3 3.8-.7-3.6.4-6.9 2.3-11.4Z';
// Mon→Sun single-letter labels for the top-bar week pips (matches the Progress week strip order).
const WEEKDAY_PIPS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
import { takeFeedStart, onFeedStart } from '../../lib/feed-intent';
import { mixFollowedFeed, levelPrefFromSurvey } from '../../lib/feed-mix';
import { addPresentedIds } from '../../lib/presented';
import { recordTaste } from '../../lib/taste';
import { recordReview } from '../../lib/srs';
import { isWidgetAdded, setWidgetAdded } from '../../lib/widget';
import { syncRemoteWords } from '../../lib/word-sync';
import { playSfx } from '../../lib/sfx';
import { t } from '../../lib/i18n';
import { STARTER_WORDS } from '../../lib/entitlement';
import { Word } from '../../data/types';
import WordCard from '../../components/WordCard';
import { fonts, label, Palette } from '../../theme/tokens';
import PressBounce from '../../components/PressBounce';
import Counter from '../../components/Counter';

type Prompt = { prompt: true; key: string };
type Lock = { lock: true; key: string };
type Item = Word | Prompt | Lock;
const isPrompt = (i: Item): i is Prompt => (i as Prompt).prompt === true;
const isLock = (i: Item): i is Lock => (i as Lock).lock === true;

// Deterministic shuffle so each appended pass reorders the pool differently.
function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  let s = seed * 9301 + 49297;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const RARITY_ORDER = ['practical', 'balanced', 'rare'] as const;
type WordPref = typeof RARITY_ORDER[number];
const RARITY_LABEL: Record<WordPref, string> = { practical: 'Practical', balanced: 'Balanced', rare: 'Rare' };

// Feed feature (#8, backlog): adjust word rarity/level right from the feed, instead of only via
// the Personalize screen. A separate small icon from the existing "personalize" button (own touch
// target - never touches the FlatList's own scroll/paging gesture).
//
// 2026-09-17 redesign (owner-directed): the old vertical jog-dial "sometimes doesn't feel
// accurate" - a short screen-relative drag distance for 3 steps is genuinely twitchy on a phone.
// Rewritten as a rotary knob (owner's reference: old vinyl/tuner/radio knobs) - ABSOLUTE angle
// from the dial's real on-screen center, not a relative jog, so the pointer always points exactly
// where your finger actually is.
//
// 2026-09-17 (cont.) - owner feedback on the FIRST pass: (1) too flat/plain, didn't read as a
// physical "perilla" - added a raised inset bezel + a knurled rim (small ridges around the full
// edge, like a real grip) so it has SOME dimensionality without breaking the house no-borderWidth
// rule (it's still fills only - the depth comes from two tone-on-tone circles + a shadow, not a
// border). (2) growing from its own CENTER pushed part of the dial off the right edge of the
// screen, since the icon sits near the screen's right inset - fixed by anchoring growth at the
// dial's own top-right corner instead (`transformOrigin: 'right top'`), so it always expands
// left/down into open space and can never clip past the screen edge it's already inset from.
// (3) the live value label was getting cut off - it's now a fixed-width, centered Text anchored
// off that same right edge, sized to fit the longest label ("Practical") with room to spare.
// 2026-09-26 (owner, final call after the on-face arced-scale attempt): the words painted ONTO the
// tuner face were "barely seeable" — and an always-on word column was too much ("it can be ONLY
// when selected, as it was before"). Final shape: at REST the dial is the plain small knob with
// its single gold value caption underneath; WHILE TURNING the three rarity words appear as real
// full-size Text in a vertical column to the LEFT of the knob (Practical top, Balanced middle,
// Rare bottom) and the needle points LEFT at the active word's row: Practical = up-left,
// Balanced = straight left (9 o'clock), Rare = down-left. On release the words fade away again.
// Angles are degrees CLOCKWISE from 12 o'clock (matching polar() + the pan math), tuned so the
// needle visually lines up with the three stacked rows beside the knob.
const RARITY_ANGLE: Record<WordPref, number> = { practical: -66, balanced: -90, rare: -114 };
const DIAL_ARC = 24; // stops sit at 9 o'clock ± DIAL_ARC (−90±24) — used by the drag clamp
const KNOB_REST = 36; // resting knob diameter — matches the neighboring 36pt icon targets
const KNOB_OPEN = 78; // engaged knob diameter — bigger while grabbed so the needle reaches the label rows
const OPEN_DROP = 22;  // slide the engaged knob down this much so the upper labels are easier to point to
const FACE = 148; // the SVG face's fixed design space (scaled down via transform)
const ROW_H = 20; // legend word-row line height; the column is 3 × ROW_H tall

// Vintage-knob geometry (SVG viewBox 0..148, centre 74), precomputed so the face is cheap to
// render at any scale. `polar` measures degrees CLOCKWISE from 12 o'clock (matches how the pan
// gesture reads the angle). KNURL = the fine grip ridges around the brass skirt; STOP_MARKS =
// the three painted index marks sitting on the skirt at the real rarity angles.
const DIAL_C = 74;
const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: DIAL_C + r * Math.sin(a), y: DIAL_C - r * Math.cos(a) };
};
const KNURL = Array.from({ length: 46 }, (_, i) => {
  const deg = (360 / 46) * i;
  const a = polar(deg, 59), b = polar(deg, 71);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, deg };
});
// The three painted index marks on the skirt at the real rarity angles — they now sit on the
// LEFT arc of the knob, radially in line with the word rows stacked beside it, so the chain reads
// needle → tick → (real Text) word. No words are painted on the face any more (owner 2026-09-26:
// the on-face arced scale was illegible at the resting size — the words moved off the face).
const STOP_MARKS = RARITY_ORDER.map((k) => {
  const a = polar(RARITY_ANGLE[k], 54.5), b = polar(RARITY_ANGLE[k], 58);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
});

// The knob face (owner, 2026-09-18: go full vintage "perilla", not the flat minimal disc). A
// brass knurled skirt with a top-lit beveled rim, a domed dark bakelite cap with a gloss
// highlight, painted index marks, and a bone pointer. Rendered in SVG so it stays crisp when the
// closed/open states scale it via transform. The metal tone follows co.accent, so a non-gold
// accent just tints the brass - it still reads metallic. The rotating pointer stays a separate
// Animated view so it honestly tracks the live drag angle.
function DialFace({ co, angle, muted, feedPhotos, active }: { co: Palette; angle: Animated.Value; muted?: boolean; feedPhotos?: boolean; active?: WordPref }) {
  const R = FACE / 2;
  const needleLen = R - 28;
  const rotate = angle.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] });
  // At rest (muted) the knob is a subdued dark disc with just a gold pointer - owner feedback:
  // the brass rim read as "too gold" before you grab it. On grab it blooms to the full brass
  // vintage knob (muted=false). So: dark skirt + gold needle at rest, brass + bone needle open.
  // On the photo feed the at-rest knob goes genuinely dark (light theme's surface2 is cream,
  // which read as a heavy pale blob over the dark photo) so it coheres with the glass feed.
  const dark = !!muted && !!feedPhotos;
  const skirtFill = muted ? (dark ? '#242019' : co.surface2) : co.accent;
  const capHi = dark ? '#2A251D' : co.surface;
  const capMid = dark ? '#1A1712' : co.surface2;
  const capLo = dark ? '#0C0A07' : co.bg;
  const pointerColor = muted ? co.accent : co.text;
  const markOpacity = muted ? 0.32 : 0.82;
  return (
    <View style={{ width: FACE, height: FACE, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 11, shadowOffset: { width: 0, height: 6 } }, default: { elevation: 9 } }) }}>
      <Svg width={FACE} height={FACE} viewBox="0 0 148 148" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="dialBrass" cx="0.36" cy="0.30" r="0.78">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.04" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0.36" />
          </RadialGradient>
          <LinearGradient id="dialRim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.6" />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0.5" />
          </LinearGradient>
          <RadialGradient id="dialCap" cx="0.42" cy="0.34" r="0.85">
            <Stop offset="0" stopColor={capHi} />
            <Stop offset="0.7" stopColor={capMid} />
            <Stop offset="1" stopColor={capLo} />
          </RadialGradient>
          <RadialGradient id="dialGloss" cx="0.36" cy="0.28" r="0.6">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.18" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        {/* skirt + metallic sheen (brass when engaged, dark at rest) */}
        <Circle cx={74} cy={74} r={72} fill={skirtFill} />
        <Circle cx={74} cy={74} r={72} fill="url(#dialBrass)" />
        {/* knurled grip — full wrap (no printed-scale band any more: the words live OFF the face) */}
        {KNURL.map((g, i) => (<Line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="#000000" strokeOpacity={0.28} strokeWidth={1.1} strokeLinecap="round" />))}
        {/* top-lit rim bevel */}
        <Circle cx={74} cy={74} r={71} fill="none" stroke="url(#dialRim)" strokeWidth={2.4} />
        {/* dark valley, then the domed bakelite cap + gloss */}
        <Circle cx={74} cy={74} r={52} fill="#000000" fillOpacity={0.5} />
        <Circle cx={74} cy={74} r={49} fill="url(#dialCap)" />
        <Circle cx={74} cy={74} r={49} fill="none" stroke="url(#dialRim)" strokeWidth={1.3} />
        <Ellipse cx={60} cy={55} rx={26} ry={17} fill="url(#dialGloss)" />
        {/* painted index marks at the three rarity stops — the ACTIVE one (the value the needle
            points at) is gold + full-strength so the current setting reads unmistakably, even at
            the small resting size where a straight-up needle would otherwise "point at nothing". */}
        {STOP_MARKS.map((g, i) => {
          const on = RARITY_ORDER[i] === active;
          return (<Line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={on ? co.accent : '#F3ECDB'} strokeOpacity={on ? 1 : markOpacity} strokeWidth={on ? 4 : 3} strokeLinecap="round" />);
        })}
        {/* hub */}
        <Circle cx={74} cy={74} r={7.5} fill={co.accent} />
        <Circle cx={74} cy={74} r={7.5} fill="url(#dialBrass)" />
        <Circle cx={74} cy={74} r={3} fill="#000000" fillOpacity={0.5} />
      </Svg>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', width: FACE, height: FACE, alignItems: 'center', transform: [{ rotate }] }}>
        <View style={{ width: 4, height: needleLen, borderRadius: 2, backgroundColor: pointerColor, marginTop: R - needleLen }} />
      </Animated.View>
    </View>
  );
}

// `previewOpen` is a dev-capture-only prop (never passed from the real feed): it pins the dial in
// its engaged/turning state so the transient legend can be screenshotted deterministically — the
// PanResponder gesture can't be driven by synthetic mouse drags reliably (known sim limit).
export function RarityDial({ co, value, onChange, feedPhotos, onOpenChange, previewOpen }: { co: Palette; value: WordPref; onChange: (v: WordPref) => void; feedPhotos?: boolean; onOpenChange?: (open: boolean) => void; previewOpen?: boolean }) {
  const [open, setOpen] = useState(!!previewOpen);
  const [live, setLive] = useState(value);
  const knobRef = useRef<View>(null);
  const centerPage = useRef({ x: 0, y: 0 });
  const lastVal = useRef(value);
  const angle = useRef(new Animated.Value(RARITY_ANGLE[value])).current;
  const scale = useRef(new Animated.Value((previewOpen ? KNOB_OPEN : KNOB_REST) / FACE)).current;

  // Keep the pointer + the highlighted word honest when the value changes from elsewhere (e.g. the
  // wordPref Segment) or after a drag settles.
  useEffect(() => { if (!open) { angle.setValue(RARITY_ANGLE[value]); setLive(value); } }, [value, open]);

  // 2026-09-26 owner bug: "I click rare, open it again and it's in practical." Root cause: the
  // PanResponder is created ONCE (useRef), so its handlers closed over the MOUNT-time `value`/
  // `onChange`. Every later grab re-seeded lastVal/live from that stale value, and the release
  // spring swept the needle back to it — the dial "forgot" the persisted choice on reopen. These
  // refs always hold the CURRENT prop values so the once-created handlers can't go stale.
  const valueRef = useRef(value); valueRef.current = value;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const onOpenRef = useRef(onOpenChange); onOpenRef.current = onOpenChange;

  // The drag reads the ABSOLUTE angle from the knob's real on-screen centre. Pre-measure on layout
  // so a FAST drag doesn't race the async measureInWindow in onPanResponderGrant (early move
  // events used to fire before the grant measure resolved and got ignored).
  const measure = () => { knobRef.current?.measureInWindow((x, y, w, h) => { centerPage.current = { x: x + w / 2, y: y + h / 2 }; }); };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        measure();
        lastVal.current = valueRef.current;
        setLive(valueRef.current);
        setOpen(true);
        onOpenRef.current?.(true);
        Animated.spring(scale, { toValue: KNOB_OPEN / FACE, useNativeDriver: true, friction: 7, tension: 90 }).start();
        Haptics.selectionAsync().catch(() => {});
      },
      onPanResponderMove: (_, gesture) => {
        const dx = gesture.moveX - centerPage.current.x;
        const dy = gesture.moveY - centerPage.current.y;
        // Too close to the pivot the angle is pure noise (a 1px wobble flips quadrants) — wait for
        // a real lever arm before steering the needle.
        if (dx * dx + dy * dy < 100) return;
        // Angle from straight-up (12 o'clock), clockwise positive — matches how a real knob reads.
        // The stop arc lives around 9 o'clock (−90±DIAL_ARC), so clamp along the SHORTEST angular
        // path from −90: naive Math.min/max on raw atan2 output would collapse the entire right
        // half-circle (deg > 0) onto the practical stop — a finger resting slightly right of the
        // pivot would always select practical (the exact "doesn't work at all" bug). Normalising
        // the offset from −90 into (−180, 180] first makes up-anything → practical and
        // down-anything → rare, which is what the hand expects.
        const raw = Math.atan2(dx, -dy) * (180 / Math.PI);
        const rel = ((raw + 90 + 540) % 360) - 180; // offset from 9 o'clock, wrapped to (−180, 180]
        const deg = -90 + Math.max(-DIAL_ARC, Math.min(DIAL_ARC, rel));
        angle.setValue(deg);
        let nearest: WordPref = 'balanced';
        let best = Infinity;
        for (const k of RARITY_ORDER) {
          const d = Math.abs(RARITY_ANGLE[k] - deg);
          if (d < best) { best = d; nearest = k; }
        }
        if (nearest !== lastVal.current) {
          lastVal.current = nearest;
          setLive(nearest);
          onChangeRef.current(nearest); // writes wordPref (and its AsyncStorage persist) immediately
          Haptics.selectionAsync().catch(() => {});
        }
      },
      onPanResponderRelease: () => {
        setOpen(false);
        onOpenRef.current?.(false);
        Animated.spring(scale, { toValue: KNOB_REST / FACE, useNativeDriver: true, friction: 7, tension: 90 }).start();
        Animated.spring(angle, { toValue: RARITY_ANGLE[lastVal.current], useNativeDriver: false, friction: 6 }).start();
      },
      onPanResponderTerminate: () => {
        setOpen(false);
        onOpenRef.current?.(false);
        Animated.spring(scale, { toValue: KNOB_REST / FACE, useNativeDriver: true, friction: 7, tension: 90 }).start();
      },
    })
  ).current;

  // Word colours: active = gold at full strength (photo feed uses the fixed gold that reads over
  // photos), the other two muted/dimmed. A soft text shadow keeps them legible over feed photos.
  const goldOn = feedPhotos ? '#EAC97C' : co.accent;
  const wordOff = feedPhotos ? '#F3ECDB' : co.muted;
  const photoShadow = feedPhotos ? { textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } } : null;

  return (
    <View
      ref={knobRef}
      {...pan.panHandlers}
      onLayout={measure}
      style={{ width: KNOB_REST, height: KNOB_REST }}
      accessibilityLabel="Adjust word rarity - drag around the dial"
    >
      {/* WHILE TURNING only (owner: "only when selected, as it was before"): the three rarity
          words as full-size readable Text stacked LEFT of the knob — Practical top, Balanced
          middle, Rare bottom — vertically centred on the knob's pivot so the needle's
          left-pointing angles line up with the rows (up-left = Practical, straight left =
          Balanced, down-left = Rare). Absolutely positioned so appearing/disappearing never
          shifts the header row's layout (the label/bar/avatar fade out via onOpenChange, so the
          legend floats over cleared space). */}
      {open && (
        <View pointerEvents="none" style={{ position: 'absolute', right: (KNOB_REST + KNOB_OPEN) / 2 + 16, top: KNOB_REST / 2 + OPEN_DROP - (3 * ROW_H) / 2, width: 96 }}>
          {RARITY_ORDER.map((k) => {
            const on = k === live;
            return (
              <Text
                key={k}
                numberOfLines={1}
                style={[
                  { fontFamily: fonts.sansSemi, fontSize: 14, lineHeight: ROW_H, textAlign: 'right', color: on ? goldOn : wordOff, opacity: on ? 1 : 0.6 },
                  photoShadow,
                ]}
              >
                {RARITY_LABEL[k]}
              </Text>
            );
          })}
        </View>
      )}
      {/* The FACE-sized vintage face scaled down to the knob size, centre-anchored on the 36pt
          box (KNOB_OPEN adds only ~12pt a side while grabbed, so it can never clip the screen
          edge the icon is already inset from). */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: (KNOB_REST - FACE) / 2, left: (KNOB_REST - FACE) / 2, width: FACE, height: FACE, transform: [{ scale }, { translateY: scale.interpolate({ inputRange: [KNOB_REST / FACE, KNOB_OPEN / FACE], outputRange: [0, OPEN_DROP / (KNOB_OPEN / FACE)], extrapolate: 'clamp' }) }] }}>
        {/* Dark gunmetal in BOTH states (owner: prefers the dark rim over the brass bloom even
            when engaged) — only the pointer/marks carry gold. */}
        <DialFace co={co} angle={angle} muted feedPhotos={feedPhotos} active={live} />
      </Animated.View>
      {/* No resting caption (owner 2026-09-26): at rest the dial is JUST the bare knob — the
          needle + gold stop tick carry the current value; the words only exist while turning. */}
    </View>
  );
}

export default function Today() {
  const { field, goal, isPro, name, palette: co, wordPref, setWordPref, feedPhotos } = useApp();
  const styles = makeStyles(co);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // The list's own measured height — cards + snap interval use THIS, not the
  // window height, so paging lands exactly on each card (no drift).
  const [listH, setListH] = useState(height);
  const [words, setWords] = useState<Word[]>([]);
  const [feedSeed] = useState(() => Math.floor(Math.random() * 1e6) + 1); // fresh interleave each session
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saved, setSaved] = useState(0); // words SAVED today — drives the top tracker
  // While the rarity dial is being dragged, the rest of the header row (label + gold progress
  // bar + avatar) fades out so nothing collides with the needle/word column. Opacity only.
  const [dialBusy, setDialBusy] = useState(false);
  const dialFade = useRef(new Animated.Value(1)).current;
  useEffect(() => { Animated.timing(dialFade, { toValue: dialBusy ? 0 : 1, duration: 160, useNativeDriver: true }).start(); }, [dialBusy]);
  const [streak, setStreak] = useState(0); // app-open streak (consecutive days opened) — the loop
  const [openDays, setOpenDays] = useState<string[]>([]); // real opened-days set → truthful week pips
  const [streakVisible, setStreakVisible] = useState(false); // the streak bar is a transient pop-up on open
  const streakPop = useRef(new Animated.Value(0)).current;   // 0 hidden → 1 shown
  const streakPopped = useRef(false);                        // pop only once per app open, not every tab focus
  const [personalized, setPersonalized] = useState(false); // one-time "feed now learns from you" celebration
  const [medNotice, setMedNotice] = useState(false); // one-time medical-content safety notice (GTM §20)

  // Vocabulary-style promise: once you've saved a handful of words, tell the user
  // the feed now personalises to them (the taste ranker already kicks in by then).
  // Show medical users a one-time content-safety notice (GTM §20 — the existential risk).
  useEffect(() => {
    if (field !== 'med') return;
    AsyncStorage.getItem('vorto.medNoticeShown').then((v) => { if (v !== '1') setMedNotice(true); });
  }, [field]);
  const dismissMedNotice = () => { setMedNotice(false); AsyncStorage.setItem('vorto.medNoticeShown', '1').catch(() => {}); };

  const PERSONALIZE_AT = 5;
  const checkPersonalized = useCallback(async () => {
    if ((await AsyncStorage.getItem('vorto.personalizedShown')) === '1') return;
    const total = await getSavedCount();
    if (total >= PERSONALIZE_AT) {
      await AsyncStorage.setItem('vorto.personalizedShown', '1');
      setPersonalized(true);
      setTimeout(() => setPersonalized(false), 5000);
    }
  }, []);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [widgetAdded, setWA] = useState(true); // assume added until we check (avoids a flash)
  const seen = useRef<Set<string>>(new Set());
  const currentId = useRef<string | null>(null);
  const lastSounded = useRef<string | null>(null); // last word we transitioned to
  const scrollCount = useRef(0); // words scrolled since launch — tick every 10th
  const listRef = useRef<FlatList<Item>>(null);
  // A word tapped from the widget/notification: pinned to the TOP of the feed so
  // the tap lands on it and you can keep scrolling from there.
  const [injected, setInjected] = useState<Word | null>(null);
  // When each word entered the viewport, so we can learn from dwell vs. quick-skip.
  const viewEnter = useRef<Map<string, { t: number; w: Word }>>(new Map());

  // Feed is now follow-driven across the whole corpus (categories the user
  // ticks in Explore). Unseen-first, daily-shuffled, no repeats until cycled.
  const [level, setLevel] = useState<LevelPref>('mix');
  // Re-pull the feed whenever the difficulty tier changes.
  useEffect(() => { getAllFeedWords('', level, wordPref).then((w) => { setWords(w); setLoaded(true); }); }, [level, wordPref]);
  useFocusEffect(useCallback(() => {
    getTodayLearned().then(setSaved); // daily-goal progress = words seen today (matches the Progress ring)
    getAppOpenStreak().then((s) => {
      setStreak(s.count); setOpenDays(s.days);
      // The streak bar is a transient pop-up: on the first feed focus after opening the app it
      // slides in, holds ~2.5s, then slides away (not a permanent bar). Once per app open.
      if (!streakPopped.current) {
        streakPopped.current = true;
        setStreakVisible(true);
        streakPop.setValue(0);
        Animated.sequence([
          Animated.timing(streakPop, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.delay(2600),
          Animated.timing(streakPop, { toValue: 0, duration: 340, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]).start(({ finished }) => { if (finished) setStreakVisible(false); });
      }
    });
    isWidgetAdded().then(setWA);
    AsyncStorage.getItem('vorto.topics').then((v) => { if (v) setFollowed(new Set(JSON.parse(v))); });
    AsyncStorage.getItem('vorto.survey').then((v) => setLevel(levelPrefFromSurvey(v)));
  }, []));

  // Widget / notification tap → jump the feed to that word. Pull the word by id
  // (works even before the corpus finishes loading) and pin it to the top.
  const loadStart = useCallback((id: string) => {
    getWordById(id).then((w) => { if (w) setInjected(w); }).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => {
    const pending = takeFeedStart();
    if (pending) loadStart(pending);
    const unsub = onFeedStart(loadStart);
    return () => unsub();
  }, [loadStart]));
  // Whenever a new word is injected, snap to the top so it's the one on screen.
  useEffect(() => {
    if (injected) requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
  }, [injected]);

  // Follow-driven feed. FIELD is authoritative (picking Medicine shows medicine even if the
  // onboarding follows were general). Within the field, follows WEIGHT the feed ~80/20 instead
  // of hard-filtering it (#82) — so curating an area biases toward it without ever hiding the
  // rest, and the taste ranking from getAllFeedWords survives to the screen (#83). The mix
  // itself lives in lib/feed-mix.ts, shared with the daily test's new-word source, so "the
  // feed's personalized order" is one code path, not two.
  const shown = useMemo(() => mixFollowedFeed(words, field, followed, feedSeed), [words, followed, field, feedSeed]);

  // Endless feed: once the user scrolls near the end we append another reshuffled
  // pass of the pool, so it never runs out - it just keeps going, TikTok-style.
  const [cycles, setCycles] = useState(1);
  useEffect(() => { setCycles(1); }, [shown.length]);

  const data = useMemo<Item[]>(() => {
    // Free taste: a subscriber-less user gets the fixed set of starter words and
    // then a hard paywall wall - no endless cycling, no widget nudge. We map the
    // starter list through the loaded corpus so it carries any content updates,
    // falling back to the bundled copy before the DB has loaded.
    // A widget/notification word gets pinned to the very top (then de-duped from
    // the rest of the pass so it isn't shown twice).
    const lead: Item[] = injected ? [injected] : [];
    if (!isPro) {
      // Free taste = the first N of the FIELD-SCOPED pool, so switching field changes
      // the free feed too. (It used to always return the general starter set and
      // ignore `field` — the reason picking Law/Medicine did nothing.) Falls back to
      // the curated starters only before the pool has loaded.
      const byId = new Map(words.map((w) => [w.id, w]));
      const n = STARTER_WORDS.length;
      // Fallback before the pool loads must stay in the user's FIELD - the general STARTER_WORDS
      // are General words, so a Medicine/Law user was seeing General C2 words. Only General falls
      // back to the curated starters; other fields fall back to their own words.
      const fallback = field === 'gen'
        ? STARTER_WORDS.map((s) => byId.get(s.id) ?? s)
        : words.filter((w) => w.field === field).slice(0, n);
      const src = shown.length ? shown.slice(0, n) : fallback;
      const starters = src.filter((s) => s.id !== injected?.id);
      return [...lead, ...starters, { lock: true, key: 'lock' }];
    }
    if (shown.length === 0) return lead.length ? [...lead] : shown;
    const out: Item[] = [...lead];
    for (let c = 0; c < cycles; c++) {
      const pass = c === 0 ? shown : shuffleSeeded(shown, c);
      pass.forEach((w, i) => {
        if (c === 0 && injected && w.id === injected.id) return; // already pinned on top
        out.push(c === 0 ? w : ({ ...w, _k: `${w.id}#${c}` } as Item));
        // Only the first pass carries the widget nudge.
        if (c === 0 && !widgetAdded && (i + 1) % 6 === 0) out.push({ prompt: true, key: `wp-${i}` });
      });
    }
    return out;
  }, [isPro, words, shown, widgetAdded, cycles, injected]);

  // Count a word toward the daily goal + streak the first time it's scrolled into view.
  const onViewable = useRef(({ viewableItems }: { viewableItems: Array<{ item?: Item }> }) => {
    const now = Date.now();
    const visible = new Set<string>();
    viewableItems.forEach((v) => {
      const w = v.item;
      if (!w || isPrompt(w) || isLock(w)) return;
      visible.add(w.id);
      currentId.current = w.id;
      if (!viewEnter.current.has(w.id)) viewEnter.current.set(w.id, { t: now, w });
      if (!seen.current.has(w.id)) {
        seen.current.add(w.id);
        recordLearned(1).catch(() => {}); // streak/daily progress
        getTodayLearned().then(setSaved); // keep the header's daily-goal count live as you swipe
        recordReview(w.id, true).catch(() => {});
      }
    });
    // Subtle tick only every 10th word scrolled (not every word) — a periodic
    // cue, not a constant one. Skips the initial appearance.
    if (currentId.current !== lastSounded.current) {
      if (lastSounded.current !== null) {
        scrollCount.current += 1;
        if (scrollCount.current % 10 === 0) playSfx('tick');
      }
      lastSounded.current = currentId.current;
    }
    // Words that just scrolled out → learn from how long they were on screen.
    for (const [id, { t, w }] of viewEnter.current) {
      if (visible.has(id)) continue;
      viewEnter.current.delete(id);
      const dwell = now - t;
      if (dwell < 1800) recordTaste(w, -0.35).catch(() => {});   // quick skip → less like this
      else if (dwell > 5000) recordTaste(w, 0.4).catch(() => {}); // lingered → more like this
    }
  }).current;

  // PRESENTED gate (dwell >= 2s): a SECOND, stricter viewability pair. minimumViewTime: 2000
  // means RN only fires this callback for a card still on screen after two full seconds — a
  // real read — so a fast flick never lands here and the word stays teachable-as-new in the
  // daily test. This is deliberately separate from onViewable above, which keeps its instant
  // recordReview-on-view for SRS/streak; the presented ledger (lib/presented.ts) is the daily
  // test's own "genuinely met" signal. Interactions (save/like/example/audio/share) mark the
  // ledger immediately inside WordCard, without waiting for the dwell.
  const presentedLocal = useRef<Set<string>>(new Set()); // session de-dupe → one write per word
  const onDwelled = useRef(({ viewableItems }: { viewableItems: Array<{ item?: Item }> }) => {
    const add: string[] = [];
    viewableItems.forEach((v) => {
      const w = v.item;
      if (!w || isPrompt(w) || isLock(w)) return;
      if (presentedLocal.current.has(w.id)) return;
      presentedLocal.current.add(w.id);
      add.push(w.id);
    });
    if (add.length) addPresentedIds(add);
  }).current;

  // FlatList takes EITHER viewabilityConfig/onViewableItemsChanged OR callback pairs — with two
  // trackers we need the pairs form. Pair 1 is the pre-existing eager tracker, byte-identical
  // config; pair 2 is the dwell gate. Must be a stable ref (RN forbids changing it on the fly).
  const viewabilityPairs = useRef([
    { viewabilityConfig: { itemVisiblePercentThreshold: 70 }, onViewableItemsChanged: onViewable },
    { viewabilityConfig: { minimumViewTime: 2000, itemVisiblePercentThreshold: 60 }, onViewableItemsChanged: onDwelled },
  ]).current;

  const dismissWidget = async () => { await setWidgetAdded(true); setWA(true); };

  // On-demand streaming: as you near the end, pull any words that have been
  // added server-side (Supabase) and fold them into the feed. No-op offline /
  // when the corpus is already fully synced.
  const loadingMore = useRef(false);
  const pullMore = useCallback(async () => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    try {
      const added = await syncRemoteWords();
      if (added > 0) { const w = await getAllFeedWords('', level, wordPref); setWords(w); }
    } finally { loadingMore.current = false; }
  }, [level, wordPref]);

  // Screenshot the feed → open the share screen for the word on screen (so a
  // screenshot becomes a proper branded share card, not a raw grab). Lazily
  // required like the other native modules so it no-ops if not linked.
  useFocusEffect(useCallback(() => {
    let sub: { remove: () => void } | undefined;
    try {
      const ScreenCapture = require('expo-screen-capture');
      sub = ScreenCapture.addScreenshotListener(() => {
        if (currentId.current) router.push(`/share/${currentId.current}`);
      });
    } catch { /* module not linked in this build */ }
    return () => { try { sub?.remove(); } catch {} };
  }, [router]));

  // Pull to reshuffle the day's words (keeps already-counted words counted).
  // A random salt reshuffles the unseen segment without breaking unseen-first.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const w = await getAllFeedWords(Math.random().toString(36).slice(2), level, wordPref);
    setWords(w);
    setRefreshing(false);
  }, [level, wordPref]);

  const GOAL = goal;
  const pct = Math.min(saved, GOAL) / GOAL;

  return (
    <View style={{ flex: 1, backgroundColor: feedPhotos ? '#0c0a07' : co.bg }}>
      {/* Streak bar is a TRANSIENT POP-UP now (owner 2026-09-25): it slides in on app open, holds a
          couple of seconds, then slides away — see the streakVisible overlay below the header. It is
          NOT a permanent bar, so the header starts with the controls row. */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {/* The controls row stays put; the streak pop-up floats ON TOP of it (owner 2026-09-26:
            the pop-up should overlay, not push other components down). */}
        <View style={styles.controlsRow}>
          {/* While the dial is being dragged, fade the label + progress bar + avatar out so the
              gold progress line never reads as colliding with the needle/word column (opacity
              only — no layout shift, the row keeps its exact geometry). */}
          <Animated.View style={[styles.controlsLead, { opacity: dialFade }]}>
            <Text style={[label, { color: co.faint }]}><Counter value={Math.min(saved, GOAL)} /> / {GOAL} today</Text>
            <View style={styles.bar}><View style={[styles.barFill, { width: `${pct * 100}%` }]} /></View>
            <PressBounce onPress={() => router.push('/personalize' as any)} style={[styles.avatar, feedPhotos && styles.avatarGlass]} hitSlop={8} accessibilityLabel="Personalize your feed">
              <Svg width={19} height={19} viewBox="0 0 24 24"><Path d="M4 17h16M5 7l4 4 3-6 3 6 4-4-1.5 9h-11L5 7Z" stroke={co.accent} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /></Svg>
            </PressBounce>
          </Animated.View>
          <RarityDial co={co} value={wordPref} onChange={setWordPref} feedPhotos={feedPhotos} onOpenChange={setDialBusy} />
        </View>
      </View>
      {/* Transient streak pop-up: slides in on open, holds ~2.5s, slides away. Overlays the top so
          it doesn't take permanent layout space. Taps to Progress while it's up. */}
      {streakVisible && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.streakPop, { top: insets.top + 8, opacity: streakPop, transform: [{ translateY: streakPop.interpolate({ inputRange: [0, 1], outputRange: [-22, 0] }) }] }]}
        >
          <PressBounce
            onPress={() => router.push('/(tabs)/stats' as any)}
            style={[styles.streakBar, styles.streakBarPop, feedPhotos ? styles.streakBarPhoto : styles.streakBarFlat]}
            accessibilityLabel={`${streak} day streak. Opens this week.`}
          >
            <View style={styles.streakBarLeft}>
              <Svg width={15} height={18} viewBox="0 0 24 30"><Path d={FLAME_D} fill="#EAC97C" /></Svg>
              <Text style={[styles.streakNum, feedPhotos ? styles.streakNumPhoto : { color: co.text }]}>{streak}</Text>
            </View>
            <View style={styles.pipRow}>
              {weekOpenStrip(openDays).map((d, i) => (
                <View key={d.date} style={styles.pipCell}>
                  <View style={[styles.pip, d.done ? styles.pipDone : (d.isToday ? styles.pipToday : (feedPhotos ? styles.pipOffPhoto : styles.pipOff))]} />
                  <Text style={[styles.pipLabel, feedPhotos && styles.pipLabelPhoto, d.isToday && { color: '#EAC97C' }]}>{WEEKDAY_PIPS[i]}</Text>
                </View>
              ))}
            </View>
          </PressBounce>
        </Animated.View>
      )}
      {/* One-time "your feed now personalises" celebration (save 5 words). */}
      {personalized && (
        <View style={[styles.personalizedBanner, { top: insets.top + 42 }]} pointerEvents="none">
          <Text style={styles.personalizedText}>✨ Your feed now learns from you, showing more of the words you save.</Text>
        </View>
      )}
      {medNotice && (
        <PressBounce onPress={dismissMedNotice} style={[styles.medBanner, { top: insets.top + 42 }]}>
          <Text style={styles.medBannerText}>Medical English for communication, not clinical guidance. Tap to dismiss.</Text>
        </PressBounce>
      )}
      {!loaded ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={co.accent} />
        </View>
      ) : (
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item) => (isPrompt(item) || isLock(item) ? item.key : ((item as any)._k ?? item.id))}
        onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h > 0) setListH(h); }}
        getItemLayout={(_, index) => ({ length: listH, offset: listH * index, index })}
        onEndReached={() => { if (!isPro) return; setCycles((c) => c + 1); pullMore(); }}
        onEndReachedThreshold={1.5}
        renderItem={({ item }) =>
          isLock(item)
            ? <PaywallWall co={co} height={listH} onUnlock={() => router.push('/paywall')} />
            : isPrompt(item)
            ? <WidgetNudge co={co} height={listH} onAdd={() => router.push('/widgets')} onHave={dismissWidget} />
            : <WordCard word={item} height={listH} onSaved={() => { getTodayLearned().then(setSaved); checkPersonalized(); }} />
        }
        showsVerticalScrollIndicator={false}
        snapToInterval={listH}
        snapToAlignment="start"
        disableIntervalMomentum
        decelerationRate="fast"
        viewabilityConfigCallbackPairs={viewabilityPairs}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={co.accent} />}
      />
      )}
      <FeedTour co={co} />
    </View>
  );
}

function WidgetNudge({ co, height, onAdd, onHave }: { co: Palette; height: number; onAdd: () => void; onHave: () => void }) {
  const s = makeStyles(co);
  const steps: [string, string][] = [
    ['1', 'Touch & hold anywhere on your Home Screen'],
    ['2', 'Tap the  +  in the corner, then search “Lexfall”'],
    ['3', 'Pick a size and tap Add Widget'],
  ];
  return (
    <View style={[s.nudge, { height }]}>
      <Text style={[label, { color: co.faint, textAlign: 'center' }]}>{t('feed.makeHabit')}</Text>
      <Text style={s.nudgeTitle}>A new word on your{'\n'}Home Screen</Text>

      <View style={s.nudgeCard}>
        <Text style={[label, { color: co.faint, textAlign: 'center' }]}>Lexfall</Text>
        <Text style={s.nudgeWord}>ineffable</Text>
        <Text style={s.nudgeIpa}>/ɪnˈɛfəb(ə)l/</Text>
        <Text style={s.nudgeDef}>(adj.) Too great to be expressed in words.</Text>
      </View>

      <View style={s.steps}>
        {steps.map(([n, t]) => (
          <View key={n} style={s.step}>
            <View style={s.stepNum}><Text style={s.stepNumText}>{n}</Text></View>
            <Text style={s.stepText}>{t}</Text>
          </View>
        ))}
      </View>

      <PressBounce style={s.nudgePrimary} onPress={onHave}><Text style={s.nudgePrimaryText}>I’ve added it</Text></PressBounce>
      <PressBounce style={s.nudgeGhost} onPress={onAdd}><Text style={s.nudgeGhostText}>{t('feed.livePreview')}</Text></PressBounce>
    </View>
  );
}

// The wall at the end of the free taste. Full-height so it snaps like a card;
// prices live on /paywall (never hardcoded here).
function PaywallWall({ co, height, onUnlock }: { co: Palette; height: number; onUnlock: () => void }) {
  const s = makeStyles(co);
  const perks = ['Every advanced word across your field & literature', 'Practice games, level tests & pronunciation', 'Streaks, stats and your Home Screen widget'];
  return (
    <View style={[s.wall, { height }]}>
      <Text style={[label, { color: co.faint, textAlign: 'center' }]}>{t('feed.freeTaste')}</Text>
      <Text style={s.wallTitle}>Unlock the{'\n'}full Lexfall</Text>
      <View style={s.wallPerks}>
        {perks.map((p) => (
          <View key={p} style={s.wallPerk}>
            <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="m5 13 4 4L19 7" stroke={co.accent} strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
            <Text style={s.wallPerkText}>{p}</Text>
          </View>
        ))}
      </View>
      <PressBounce style={s.wallCta} onPress={onUnlock}><Text style={s.wallCtaText}>{t('feed.seeMembership')}</Text></PressBounce>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 26, right: 26, zIndex: 10, gap: 10 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // label + progress bar + avatar, grouped so they can fade as one while the dial is dragged.
  controlsLead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Slim top streak bar: flame + count on the left, this week's day pips on the right.
  streakBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  streakBarFlat: { backgroundColor: co.surface2 },
  streakBarPhoto: { backgroundColor: 'rgba(18,16,12,0.82)' },
  // Transient pop-up wrapper: floats over the top of the feed for a couple of seconds on open.
  streakPop: { position: 'absolute', left: 26, right: 26, zIndex: 25 },
  streakBarPop: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  streakBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  streakNum: { fontFamily: fonts.sansSemi, fontSize: 15 },
  streakNumPhoto: { color: '#F4EEE2', textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  pipRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  pipCell: { alignItems: 'center', gap: 4 },
  pip: { width: 8, height: 8, borderRadius: 4 },
  pipOff: { backgroundColor: co.line2 },
  pipOffPhoto: { backgroundColor: 'rgba(240,236,226,0.30)' },
  pipDone: { backgroundColor: co.accent },
  pipToday: { backgroundColor: co.accent + '66' },
  pipLabel: { fontFamily: fonts.sans, fontSize: 9, color: co.faint },
  pipLabelPhoto: { color: '#CFC7B7' },
  wall: { paddingHorizontal: 34, justifyContent: 'center', alignItems: 'center', backgroundColor: co.bg },
  wallTitle: { fontFamily: fonts.serif, fontSize: 36, color: co.text, lineHeight: 42, marginTop: 12, textAlign: 'center' },
  wallPerks: { alignSelf: 'stretch', marginTop: 30, gap: 16 },
  wallPerk: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wallPerkText: { flex: 1, fontFamily: fonts.sans, fontSize: 15, color: co.text, lineHeight: 21 },
  wallCta: { alignSelf: 'stretch', backgroundColor: co.accent, borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginTop: 36 },
  wallCtaText: { fontFamily: fonts.sansSemi, fontSize: 16, color: co.ink },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: co.surface2, alignItems: 'center', justifyContent: 'center' },
  // On the photo feed the crown goes dark-translucent glass (matching the word-action
  // buttons + the at-rest dial) so the header controls cohere over the dark photo.
  avatarGlass: { backgroundColor: 'rgba(18,16,12,0.4)' },
  avatarInitial: { fontFamily: fonts.serif, fontSize: 17, color: co.accent, marginTop: -1 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: co.line2, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2, backgroundColor: co.accent },
  dialLabel: { fontFamily: fonts.sansSemi, fontSize: 11, color: co.text, marginTop: 8 },
  personalizedBanner: { position: 'absolute', left: 20, right: 20, zIndex: 12, backgroundColor: co.accent, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  personalizedText: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: co.ink, textAlign: 'center', lineHeight: 19 },
  medBanner: { position: 'absolute', left: 20, right: 20, zIndex: 12, backgroundColor: co.surface2, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  medBannerText: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: co.text, textAlign: 'center', lineHeight: 18 },
  nudge: { paddingHorizontal: 34, justifyContent: 'center', alignItems: 'center' },
  nudgeTitle: { fontFamily: fonts.serif, fontSize: 32, color: co.text, lineHeight: 38, marginTop: 12, textAlign: 'center' },
  nudgeCard: { alignSelf: 'stretch', borderRadius: 20, padding: 22, marginTop: 26, backgroundColor: co.surface2, alignItems: 'center' },
  nudgeWord: { fontFamily: fonts.serif, fontSize: 30, color: co.text, marginTop: 10, textAlign: 'center' },
  nudgeIpa: { fontFamily: fonts.serifItalic, fontSize: 15, color: co.muted, marginTop: 6, textAlign: 'center' },
  nudgeDef: { fontFamily: fonts.sans, fontSize: 15, color: co.text, marginTop: 10, lineHeight: 21, textAlign: 'center' },
  steps: { alignSelf: 'stretch', marginTop: 26, gap: 14 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: co.surface2, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontFamily: fonts.sansSemi, fontSize: 13, color: co.accent },
  stepText: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: co.text, lineHeight: 20 },
  nudgePrimary: { alignSelf: 'stretch', backgroundColor: co.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 30 },
  nudgePrimaryText: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.ink },
  nudgeGhost: { paddingVertical: 14, alignItems: 'center', marginTop: 2 },
  nudgeGhostText: { fontFamily: fonts.sansMedium, fontSize: 14, color: co.muted },
});
