import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, PanResponder, Animated, Easing, AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { Palette, fonts } from '../theme/tokens';
import PressBounce from './PressBounce';

// Show-once flag. LEGACY_KEY is the pre-2026-09 name — respected on read so existing
// users don't get the tour again, cleared by resetFeedTour so "Replay tour" works for them.
export const TOUR_KEY = 'vorto.hasSeenTour';
const LEGACY_KEY = 'vorto.feedTourSeen';
export async function resetFeedTour() {
  await AsyncStorage.multiRemove([TOUR_KEY, LEGACY_KEY]);
}

// App line-icons (not emoji — emoji render as tofu in the simulator and clash with the
// editorial style). Names match the feed's own controls (the crown path is the exact one the
// header renders) so the tour teaches the real icons.
function Ic({ name, color, size = 20 }: { name: string; color: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 1.7, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'swipe' && <Path d="M7 14l5-5 5 5M12 9v11" {...p} />}
      {name === 'info' && <><Circle cx={12} cy={12} r={9} {...p} /><Path d="M12 11v5M12 8h.01" {...p} /></>}
      {name === 'heart' && <Path d="M12 20s-7-4.3-9.3-8.3A5 5 0 0 1 12 6a5 5 0 0 1 9.3 5.7C19 15.7 12 20 12 20z" {...p} />}
      {name === 'save' && <Path d="M6 4h12v17l-6-4-6 4V4z" {...p} />}
      {name === 'share' && <Path d="M12 15V4M8 8l4-4 4 4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" {...p} />}
      {name === 'goal' && <><Circle cx={12} cy={12} r={9} {...p} /><Circle cx={12} cy={12} r={4.5} {...p} /></>}
      {name === 'crown' && <Path d="M4 17h16M5 7l4 4 3-6 3 6 4-4-1.5 9h-11L5 7Z" {...p} />}
      {name === 'dial' && <><Circle cx={12} cy={12} r={9} {...p} /><Path d="M12 12V6" {...p} /><Circle cx={12} cy={12} r={1.4} fill={color} stroke="none" /></>}
      {name === 'down' && <Path d="M12 4v14M6 12l6 6 6-6" {...p} />}
    </Svg>
  );
}

// Tour copy — single source so the coach bubbles and the fallback modal can't drift.
// Step 3 describes what the top bar PERSISTENTLY shows: the daily-goal counter + progress bar,
// the crown (opens /personalize — pick the fields/tracks the feed draws from) and the rarity
// dial (RarityDial — practical / balanced / rare). The streak is NOT up there — it's a
// transient pop-up on app open (owner 2026-09-25), so it only gets the muted note line.
const COPY = {
  title: 'Welcome to Lexfall',
  sub: "A quick tour, then you're off.",
  swipe: 'Swipe up for the next word',
  actions: 'Tap to see details, like, save or share',
  goal: 'Your daily goal and progress sit up top',
  crown: "Crown: choose your feed's focus",
  dial: 'Dial: set word rarity, practical to rare',
  streakNote: 'Your streak pops in when you open the app.',
  bar: 'Practice, Progress and more live below',
} as const;

// One-line guarantee on small phones (iPhone SE, 375pt): size the row text to the
// available width instead of trusting a fixed size — adjustsFontSizeToFit is unusable
// on the New Architecture (it scales text UP too, see WordCard). 0.5em/char is a safe
// average for Inter; the longest row is 40 chars (~20em, COPY.dial). numberOfLines={1}
// on the rows is the hard backstop.
const LONGEST_ROW = 40;
const fitFont = (avail: number, chars: number) => Math.max(12, Math.min(15.5, avail / (chars * 0.5)));

// Where the feed's real elements live, computed from the same constants the feed uses
// (WordCard pins its action row at bottom: insets.bottom + 108, four 56pt circles, gap 16;
// the header controls row starts at insets.top + 8 and is 36pt tall).
const ACTIONS_W = 4 * 56 + 3 * 16;
// The native Liquid Glass tab pill's top edge sits ~83-90pt from the screen bottom on BOTH
// home-button (SE: insets.bottom 0, pill still ~83pt tall) and notched devices — a constant,
// not insets.bottom (which put things behind the pill on SE). The spotlight hole for the final
// step is derived from it: top at 96pt (a few pt of air above the tallest case), bottom at 18pt
// so the pill's underside stays inside the hole on both device classes. The arrow constant is
// kept for the Reduce Motion modal, which has no spotlight.
const TAB_HOLE_TOP = 96;
const TAB_HOLE_BOTTOM = 18;
const TAB_ARROW_BOTTOM = 96;

const roundedRect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;

// Looping "swipe up" chevron inside the highlighted word card (coach step 1). Only
// rendered on the spotlight path — Reduce Motion users get the static modal instead.
function SwipeHint({ x, y, color }: { x: number; y: number; color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(350),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const ty = v.interpolate({ inputRange: [0, 1], outputRange: [12, -16] });
  const op = v.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: x - 16, top: y, opacity: op, transform: [{ translateY: ty }] }}>
      <Ic name="swipe" color={color} size={32} />
    </Animated.View>
  );
}

// First-run explainer on the feed (post-paywall). Default: a 4-step spotlight tour that
// dims the screen and highlights the real element each step (word card, action row,
// goal/crown/dial top bar, tab bar). With Reduce Motion on it falls back to the single-card modal.
// Shows once, ever (TOUR_KEY); Profile > "Replay the tour" clears the flag.
export default function FeedTour({ co }: { co: Palette }) {
  const [show, setShow] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [step, setStep] = useState(0);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const insets = useSafeAreaInsets();

  // Re-check on every feed focus (not just mount) so "Replay the tour" from Profile
  // re-triggers it the moment the user lands back on the feed.
  useFocusEffect(useCallback(() => {
    let alive = true;
    AsyncStorage.multiGet([TOUR_KEY, LEGACY_KEY])
      .then((rows) => { if (alive && rows.every(([, v]) => !v)) { setStep(0); setShow(true); } })
      .catch(() => {});
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (alive) setReduceMotion(!!v); })
      .catch(() => {});
    return () => { alive = false; };
  }, []));

  const dismiss = useCallback(() => {
    AsyncStorage.setItem(TOUR_KEY, '1').catch(() => {});
    setShow(false);
  }, []);

  // Swipe-down anywhere on the overlay dismisses (claims only real vertical drags,
  // so plain taps still reach the scrim/buttons underneath).
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 14 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderRelease: (_, g) => { if (g.dy > 48) dismiss(); },
    })
  ).current;

  if (!show) return null;
  const s = makeStyles(co);
  const { w: W, h: H } = box;
  const measured = W > 0 && H > 0;

  // --- Spotlight geometry (coach path) ---
  // Short-screen (iPhone SE, 667pt) fit: the word card's definition bottoms out around 0.61H,
  // and the tab pill top sits ~82pt from the bottom — so the step-0 bubble must fit between
  // ~0.63H and the pill. The hole extends to 0.635H (so the def sits inside it, not under the
  // bubble) and the bubble compacts itself (smaller title, tighter margins) when H <= 700.
  // Very long 4+ line definitions can still overflow any hole; the overflow is dimmed.
  const compact = H <= 700;
  const holes = [
    // 1. The word card: the swipeable center of the feed.
    { x: 16, y: H * 0.26, w: W - 32, h: H * 0.375, r: 28 },
    // 2. The real action row (details / like / save / share circles).
    { x: Math.max(10, (W - ACTIONS_W) / 2 - 10), y: H - insets.bottom - 108 - 56 - 10, w: Math.min(W - 20, ACTIONS_W + 20), h: 76, r: 44 },
    // 3. The top bar: daily-goal counter + progress bar, crown, rarity dial.
    { x: 14, y: insets.top + 2, w: W - 28, h: 50, r: 18 },
    // 4. The native Liquid Glass tab pill (geometry from TAB_HOLE_*, see above).
    { x: 12, y: H - TAB_HOLE_TOP, w: W - 24, h: TAB_HOLE_TOP - TAB_HOLE_BOTTOM, r: 30 },
  ] as const;
  const hole = holes[Math.min(step, 3)];
  const last = step >= 3;
  const advance = () => (last ? dismiss() : setStep((v) => v + 1));

  const bubbleFont = fitFont(W - 32 - 36 - 32, LONGEST_ROW); // bubble content minus icon column, longest row
  const bubblePos =
    step === 1 || step === 3
      ? { bottom: H - hole.y + 12 } // above the action row / tab bar
      : { top: hole.y + hole.h + (step === 0 ? 8 : 12) }; // below the word card / top bar

  const renderRows = (which: 0 | 1 | 2 | 3, font: number, fullWidthFont: number) => (
    <>
      {which === 0 && (
        <View style={s.row}>
          <View style={s.iconCol}><Ic name="swipe" color={co.accent} /></View>
          <Text style={[s.rowText, { fontSize: font }]} numberOfLines={1}>{COPY.swipe}</Text>
        </View>
      )}
      {which === 1 && (
        <View>
          {/* The 4 real action icons, smaller and on their own line so the text below never wraps. */}
          <View style={s.iconLine}>
            {(['info', 'heart', 'save', 'share'] as const).map((n) => <Ic key={n} color={co.text} size={16} name={n} />)}
          </View>
          {/* rowTextFull, not rowText: flex:1 is right for the icon+text rows (row direction)
              but collapses a full-width Text to zero height inside a column. */}
          <Text style={[s.rowTextFull, { fontSize: fullWidthFont }]} numberOfLines={1}>{COPY.actions}</Text>
        </View>
      )}
      {which === 2 && (
        <View style={s.rows2}>
          <View style={s.row}>
            <View style={s.iconCol}><Ic name="goal" color={co.accent} /></View>
            <Text style={[s.rowText, { fontSize: font }]} numberOfLines={1}>{COPY.goal}</Text>
          </View>
          <View style={s.row}>
            <View style={s.iconCol}><Ic name="crown" color={co.accent} /></View>
            <Text style={[s.rowText, { fontSize: font }]} numberOfLines={1}>{COPY.crown}</Text>
          </View>
          <View style={s.row}>
            <View style={s.iconCol}><Ic name="dial" color={co.accent} /></View>
            <Text style={[s.rowText, { fontSize: font }]} numberOfLines={1}>{COPY.dial}</Text>
          </View>
          <Text style={s.note} numberOfLines={1}>{COPY.streakNote}</Text>
        </View>
      )}
      {which === 3 && (
        <View style={s.row}>
          <View style={s.iconCol}><Ic name="down" color={co.accent} /></View>
          <Text style={[s.rowText, { fontSize: font }]} numberOfLines={1}>{COPY.bar}</Text>
        </View>
      )}
    </>
  );

  // --- Fallback modal (Reduce Motion) ---
  if (reduceMotion) {
    const cardW = Math.min(360, W > 0 ? W - 48 : 320);
    const contentW = cardW - 44;
    const font = Math.min(fitFont(contentW - 32, LONGEST_ROW), fitFont(contentW, 39));
    return (
      <View style={s.overlay} {...pan.panHandlers} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Dismiss tour" />
        <View style={[s.card, { width: cardW }]}>
          <Text style={s.title}>{COPY.title}</Text>
          <Text style={s.sub}>{COPY.sub}</Text>
          <View style={s.rows}>
            {renderRows(0, font, font)}
            {renderRows(1, font, font)}
            {renderRows(2, font, font)}
          </View>
          <Text style={s.foot} numberOfLines={1}>{COPY.bar}</Text>
          <PressBounce style={s.cta} onPress={dismiss} accessibilityLabel="Got it, start learning">
            <Text style={s.ctaTxt}>Got it</Text>
          </PressBounce>
        </View>
        {/* Small arrow pointing at the (undimmed, native) tab bar below. */}
        <View pointerEvents="none" style={[s.barArrow, { bottom: TAB_ARROW_BOTTOM }]}>
          <Ic name="down" color={co.accent} size={22} />
        </View>
      </View>
    );
  }

  // --- Coach-mark spotlight tour ---
  return (
    <View style={s.overlayFill} {...pan.panHandlers} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {measured && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={advance} accessibilityLabel={last ? 'Finish tour' : 'Next tour step'}>
            <Svg width={W} height={H}>
              <Path
                d={`M0 0H${W}V${H}H0Z ${roundedRect(hole.x, hole.y, hole.w, hole.h, hole.r)}`}
                fill="rgba(8,6,4,0.78)"
                fillRule="evenodd"
              />
            </Svg>
          </Pressable>
          {step === 0 && <SwipeHint x={W / 2} y={hole.y + hole.h - 72} color={co.accent} />}
          <View style={[s.bubble, compact && s.bubbleCompact, bubblePos]}>
            {step === 0 && (
              <>
                <Text style={[s.title, compact && s.titleCompact]}>{COPY.title}</Text>
                <Text style={[s.sub, compact && s.subCompact]}>{COPY.sub}</Text>
              </>
            )}
            {renderRows(step as 0 | 1 | 2 | 3, bubbleFont, fitFont(W - 32 - 36, 39))}
            <View style={[s.bubbleFooter, compact && s.bubbleFooterCompact]}>
              <View style={s.dots}>
                {[0, 1, 2, 3].map((i) => <View key={i} style={[s.dot, i === step && s.dotOn]} />)}
              </View>
              {!last && (
                <PressBounce onPress={dismiss} hitSlop={10} accessibilityLabel="Skip tour" style={s.skip}>
                  <Text style={s.skipTxt}>Skip</Text>
                </PressBounce>
              )}
              <PressBounce style={s.pill} onPress={advance} accessibilityLabel={last ? 'Got it, start learning' : 'Next'}>
                <Text style={s.ctaTxt}>{last ? 'Got it' : 'Next'}</Text>
              </PressBounce>
            </View>
          </View>
          {/* No arrow on the coach path — the final step spotlights the tab bar itself. */}
        </>
      )}
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,6,4,0.78)', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  overlayFill: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
  card: { backgroundColor: co.surface, borderRadius: 24, paddingVertical: 24, paddingHorizontal: 22 },
  bubble: { position: 'absolute', left: 16, right: 16, backgroundColor: co.surface, borderRadius: 24, paddingVertical: 20, paddingHorizontal: 18, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  bubbleCompact: { paddingVertical: 14 },
  title: { fontFamily: fonts.serif, fontSize: 26, color: co.text, textAlign: 'center' },
  titleCompact: { fontSize: 22 },
  sub: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  subCompact: { marginBottom: 8 },
  rows: { gap: 16, marginTop: 6 },
  rows2: { gap: 14 },
  note: { fontFamily: fonts.sans, fontSize: 13, color: co.muted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconCol: { width: 32 },
  iconLine: { flexDirection: 'row', gap: 10, marginBottom: 7 },
  rowText: { flex: 1, fontFamily: fonts.sans, color: co.text },
  rowTextFull: { fontFamily: fonts.sans, color: co.text },
  foot: { fontFamily: fonts.sans, fontSize: 13.5, color: co.muted, marginTop: 16, textAlign: 'center' },
  cta: { marginTop: 20, backgroundColor: co.accent, borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  ctaTxt: { fontFamily: fonts.sansSemi, fontSize: 15.5, color: co.ink },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  bubbleFooterCompact: { marginTop: 10 },
  dots: { flexDirection: 'row', gap: 6, flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: co.line2 },
  dotOn: { backgroundColor: co.accent },
  skip: { paddingHorizontal: 12, paddingVertical: 8 },
  skipTxt: { fontFamily: fonts.sansMedium, fontSize: 14, color: co.muted },
  pill: { backgroundColor: co.accent, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 24, alignItems: 'center' },
  barArrow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
