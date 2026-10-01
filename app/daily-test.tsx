import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated, Easing, Pressable, ScrollView, AccessibilityInfo, Dimensions } from 'react-native';

// Consistent headword size for the teach cards. adjustsFontSizeToFit scales SHORT words UP on the
// New Architecture (Hermes), so each headword rendered a different size (owner 2026-10-01). Instead:
// a fixed size (30) for every word that fits, shrinking ONLY a genuinely long word so it never
// clips - so normal words are all the SAME size, which is what the design intends.
const LEARN_CARD_TEXT_W = Dimensions.get('window').width - 130; // screen - scroll/card padding - gap - speaker
function headwordSize(word: string): number {
  return Math.max(18, Math.min(30, Math.round(LEARN_CARD_TEXT_W / (Math.max(1, word.length) * 0.55))));
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Path, Rect, G, Defs, ClipPath } from 'react-native-svg';
import { useField } from '../lib/field';
import { useApp } from '../lib/app-state';
import { getWordById, getWordsByField, recordAttempt, recordSkill, recordLearned, setWordCollection } from '../lib/db';
import { recordReview, recordIntro } from '../lib/srs';
import { addPresentedIds } from '../lib/presented';
import { recordAnswer } from '../lib/metrics';
import { Word } from '../data/types';
import { GameMode, Question, buildQuestionForWord, canDoMode } from '../lib/games';
import BackButton from '../components/BackButton';
import PressBounce from '../components/PressBounce';
import FadeIn from '../components/FadeIn';
import LessonCard from '../components/LessonCard';
import CheckCard from '../components/CheckCard';
import UnlockCountdown from '../components/UnlockCountdown';
import { fonts, Palette } from '../theme/tokens';
import {
  getOrBuildDailyTest, recordDailyAnswer, finalizeDailyTest, markDailyMastered, markDailyCleared,
  markDailyLearned, dailyLeftToClear, peekDailyTest, DAILY_TEST_COUNT, DailyTestState,
  getDailyTestStreak, weekProgress, DailyTestStreak,
} from '../lib/daily-test';
import { speakWord } from '../lib/speak';
import { syncStreakTags } from '../lib/onesignal';
import { schedulePracticeReminder } from '../lib/notifications';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SPACED LEARN-TODAY / RECALL-LATER (2026-09-27). The previous model taught a word and checked
// it seconds later - pure recognition of a card still in short-term memory, so the advancement
// gate was trivial. The research is settled (locked, don't relitigate): the testing effect
// strengthens RECALL, not recognition; retrieval spaced to the edge of forgetting beats
// same-session review by a wide margin; and a gentle first exposure avoids the discouragement
// of cold-guessing unknown C1-C2 words. So a daily session now has TWO phases under one gauge:
//
//   LEARN  - up to N_NEW brand-new words from the personalized feed stream, one LessonCard
//            each, "Got it" to advance. UNGRADED - no check on these today. Each "Got it"
//            writes an intro SRS row (due at the next local midnight, lib/srs.ts recordIntro)
//            + the presented-ledger mark, which is what queues the word for a REAL recall on
//            a following day.
//   RECALL - the graded gate: words from PRIOR days the SRS says are due now, one CheckCard
//            each in production-biased formats (gap / guess / synonym - never 'meaning' first,
//            the weakest pure-recognition format). A quiet "Reveal meaning" hint is available
//            on formats where the meaning isn't already on screen; using it counts as
//            not-recalled (like Skip), so it rescues a stuck user without gaming the gate.
//
// Learn words already met in the FEED today get a one-line refresher card instead of the full
// card. Missed (or hinted) recalls are TAUGHT at the point of failure (the CheckCard reveal
// shows meaning + "In context") and roll into a FIX phase inside the SAME session: a second
// teach ("Look again"), then a retest in a DIFFERENT format. Missed twice → the answer card +
// ONE final requeue (guardrail, never loops). One session, one filling inkwell gauge, ONE end
// screen. Quitting resumes exactly where it left off (learn progress via state.learned, recall
// via state.answered, fix via state.cleared) - the Journey path node reads the same state.
//
// COMPLETION (the streak) = finishing the session: learn done + every recall attempted.
// ADVANCEMENT (mastery/path) = every due recall cleared - right first time, or drilled to
// zero in the fix phase. A COLD-START day (nothing due yet - day 1, or a fresh field) is
// LEARN-only and completes + advances on the teach cards alone; recalls fill in from tomorrow.
//
// Recording: each recall word's FIRST attempt (and only that) feeds accuracy/SRS/skill + the
// daily record, exactly like the old first-check-only rule. The LEARN phase writes only the
// intro SRS review - never accuracy. Fix retests, the guardrail requeue and voluntary replays
// record nothing, so a struggling word is never double-counted.
// ─────────────────────────────────────────────────────────────────────────────────────────────

// A concave four-point sparkle (every curve's control point sits at the center) - shared by
// the inkwell's gilt accents and the celebration burst below.
function sparklePath(x: number, y: number, R: number): string {
  const f = (v: number) => v.toFixed(2);
  return (
    `M ${f(x)} ${f(y - R)} Q ${f(x)} ${f(y)} ${f(x + R)} ${f(y)}` +
    ` Q ${f(x)} ${f(y)} ${f(x)} ${f(y + R)} Q ${f(x)} ${f(y)} ${f(x - R)} ${f(y)}` +
    ` Q ${f(x)} ${f(y)} ${f(x)} ${f(y - R)} Z`
  );
}

// Lesson-complete celebration burst (owner, 2026-09-18: "some confetti"; 2026-09-29: "more
// gamified"). Still strictly on-brand - gold + bone tones only, deliberately NOT a rainbow
// confetti-cannon - but a real celebration now: ~3 dozen particles in three shapes (dots,
// thin ribbons, four-point gold sparkles) burst up from behind the gauge with staggered
// timing, tumble as they fall, then fade and settle. One Animated.Value per particle
// (native driver, one-shot on mount); the burst-then-fall shape lives in the interpolation
// keyframes. Honors Reduce Motion (same AccessibilityInfo pattern as FeedTour/onboarding):
// reduced = no burst at all, the result screen stays quiet.
type ConfettiPiece = {
  kind: 'dot' | 'ribbon' | 'spark';
  dx: number; up: number; fall: number; sway: number; rot: number;
  w: number; h: number; color: string; delay: number; dur: number;
};
function Confetti({ co }: { co: Palette }) {
  const N = 34;
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => setReduceMotion(false));
  }, []);
  const anim = useRef(Array.from({ length: N }, () => new Animated.Value(0))).current;
  const specs = useRef<ConfettiPiece[]>(
    Array.from({ length: N }, (_, i) => {
      const kind: ConfettiPiece['kind'] = i % 6 === 5 ? 'spark' : i % 3 === 0 ? 'dot' : 'ribbon';
      const spread = (i / (N - 1)) * 2 - 1 + (Math.random() * 0.16 - 0.08); // jittered fan, -1..1
      const dist = 70 + Math.random() * 150;
      const size = kind === 'dot' ? 4 + Math.random() * 4 : kind === 'spark' ? 9 + Math.random() * 5 : 3 + Math.random() * 2;
      return {
        kind,
        dx: spread * dist,
        up: -(80 + Math.random() * 150),           // burst rise
        fall: 270 + Math.random() * 140,           // then the tumble down past the start
        sway: (Math.random() * 2 - 1) * 30,        // late horizontal drift while falling
        rot: (Math.random() * 2 - 1) * (kind === 'ribbon' ? 360 + Math.random() * 360 : kind === 'spark' ? 140 : 240),
        w: size,
        h: kind === 'ribbon' ? 9 + Math.random() * 8 : size,
        // Gold leads; bone (text) and warm-grey (faint) break it up so it reads as a mix.
        color: kind === 'spark' ? co.accent : i % 5 === 0 ? co.text : i % 5 === 2 ? co.faint : co.accent,
        delay: Math.random() * 240,
        dur: 1150 + Math.random() * 650,
      };
    })
  ).current;
  useEffect(() => {
    if (reduceMotion !== false) return; // still unknown, or reduced: don't fire the burst
    Animated.parallel(
      anim.map((a, i) =>
        Animated.timing(a, { toValue: 1, duration: specs[i].dur, delay: specs[i].delay, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      )
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);
  if (reduceMotion) return null;
  return (
    <View pointerEvents="none" style={styles0.confettiWrap}>
      {specs.map((s, i) => {
        const a = anim[i];
        const translateY = a.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, s.up, s.up + s.fall] });
        const translateX = a.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, s.dx * 0.75, s.dx + s.sway] });
        const opacity = a.interpolate({ inputRange: [0, 0.06, 0.72, 1], outputRange: [0, 1, 1, 0] });
        const rotate = a.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${s.rot}deg`] });
        const scale = s.kind === 'spark'
          ? a.interpolate({ inputRange: [0, 0.18, 0.55, 1], outputRange: [0.3, 1.25, 0.95, 0.7] }) // pop-in twinkle
          : a.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] });
        return (
          <Animated.View key={i} style={{ position: 'absolute', opacity, transform: [{ translateX }, { translateY }, { rotate }, { scale }] }}>
            {s.kind === 'spark' ? (
              <Svg width={s.w} height={s.w}><Path d={sparklePath(s.w / 2, s.w / 2, s.w / 2)} fill={s.color} /></Svg>
            ) : (
              <View style={{ width: s.w, height: s.h, borderRadius: s.kind === 'dot' ? s.w / 2 : 1.5, backgroundColor: s.color }} />
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}
const styles0 = StyleSheet.create({
  confettiWrap: { position: 'absolute', top: '34%', left: 0, right: 0, alignItems: 'center' },
});

// Soft spring entrance for the payoff gauge: scales up from ~86% with a small overshoot.
function PopIn({ children }: { children: React.ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 9 }).start();
  }, []);
  return (
    <Animated.View style={{ opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] }}>
      {children}
    </Animated.View>
  );
}

// Hero gauge sizing, matching onboarding's day-medallion box.
const RING_BOX = 176;

// ── Progress motif: THE INKWELL (2026-09-27, replaces the water-in-a-circle gauge;
// 2026-09-29 illustration pass - the first cut read as "a basic cup"). ──
// Water read generic and off-brand; the palette literally names its colors ink and bone, the
// product is words, and the app's gold language (day medallions, halo rings) wants a mark, not
// a meter. So the day's progress is an inkwell filling with gold ink: empty glass at 0, ink
// rising as words are cleared, a fully gilded vessel for the finished/celebration moment. Same
// props and continuous-fill behavior as before (AnimatedGauge's ramp reads as ink pouring in),
// one motif at two sizes, theme-aware via `co`, fills + SVG strokes only (no borderWidth).
// The illustration pass makes the motif unmistakable: a wider GILDED lip, a QUILL dipped nib-
// first through the mouth (this is a vocabulary app - the writing read is the meaning), a glass
// sheen on the left wall, a curved meniscus on the ink surface, and two small gold sparkles +
// a flicked ink drop for craft. The 48pt in-session header renders a reduction of the same
// vessel (no quill/sparkles/sheen - they smear at that size) but keeps the gilt rim + the fill.
// All geometry is precomputed plain-string paths per render (cheap; no Animated in here).
function Gauge({ filled, total, co, size = RING_BOX }: { filled: number; total: number; co: Palette; size?: number }) {
  const frac = Math.max(0, Math.min(1, total ? filled / total : 0));
  const s = size, cx = s / 2, cy = s / 2;
  const partial = frac > 0 && frac < 1;
  const detailed = s >= 90; // hero keeps the full illustration; the small header is a reduction
  // Classic squat glass inkwell: wide flat gilded lip, short neck, flared shoulder, squat
  // body tapering to a rounded base.
  const lipW = 0.44 * s, lipH = 0.075 * s, lipR = 0.02 * s;
  const neckW = 0.22 * s;
  const bodyW = 0.66 * s, baseW = 0.56 * s;
  const lipTop = cy - 0.315 * s;
  const neckTop = lipTop + lipH;
  const flareTop = neckTop + 0.045 * s;
  const bodyTop = flareTop + 0.105 * s;
  const baseY = cy + 0.31 * s;
  const baseR = 0.06 * s;
  const xl = (w: number) => cx - w / 2, xr = (w: number) => cx + w / 2;
  const f = (v: number) => v.toFixed(2);
  const vessel = [
    `M ${f(xl(lipW) + lipR)} ${f(lipTop)}`,
    `L ${f(xr(lipW) - lipR)} ${f(lipTop)}`,
    `Q ${f(xr(lipW))} ${f(lipTop)} ${f(xr(lipW))} ${f(lipTop + lipR)}`,
    `L ${f(xr(lipW))} ${f(neckTop)}`,
    `L ${f(xr(neckW))} ${f(neckTop)}`,
    `L ${f(xr(neckW))} ${f(flareTop)}`,
    `Q ${f(xr(bodyW))} ${f(flareTop)} ${f(xr(bodyW))} ${f(bodyTop)}`,
    `L ${f(xr(baseW))} ${f(baseY - baseR)}`,
    `Q ${f(xr(baseW))} ${f(baseY)} ${f(xr(baseW) - baseR)} ${f(baseY)}`,
    `L ${f(xl(baseW) + baseR)} ${f(baseY)}`,
    `Q ${f(xl(baseW))} ${f(baseY)} ${f(xl(baseW))} ${f(baseY - baseR)}`,
    `L ${f(xl(bodyW))} ${f(bodyTop)}`,
    `Q ${f(xl(bodyW))} ${f(flareTop)} ${f(xl(neckW))} ${f(flareTop)}`,
    `L ${f(xl(neckW))} ${f(neckTop)}`,
    `L ${f(xl(lipW))} ${f(neckTop)}`,
    `L ${f(xl(lipW))} ${f(lipTop + lipR)}`,
    `Q ${f(xl(lipW))} ${f(lipTop)} ${f(xl(lipW) + lipR)} ${f(lipTop)}`,
    'Z',
  ].join(' ');
  // Ink level: linear over the vessel's full height, so the existing progress value maps
  // straight onto it (full = the whole vessel gilded, lip included). UNCHANGED mechanic.
  const level = baseY - frac * (baseY - lipTop);
  // Meniscus: a gentle sag across the ink surface (clipped to the vessel, so drawing the
  // full body width is safe at any level - neck or belly).
  const meniscus = `M ${f(xl(bodyW))} ${f(level)} Q ${f(cx)} ${f(level + 0.03 * s)} ${f(xr(bodyW))} ${f(level)}`;
  // Glass sheen: one soft curved highlight down the left wall of the body.
  const sheen = `M ${f(cx - 0.215 * s)} ${f(bodyTop + 0.03 * s)} Q ${f(cx - 0.26 * s)} ${f(cy + 0.06 * s)} ${f(cx - 0.175 * s)} ${f(baseY - 0.07 * s)}`;
  // The quill: nib dipped through the mouth (shaft crosses the gilt lip, so it reads as IN
  // the well), feather sweeping up-right and deliberately breaking the framing ring - the
  // ring is drawn beneath it. Flat-vector: gold vane + ink outline/rachis + bone shaft.
  const qNx = cx + 0.02 * s, qNy = lipTop + 0.115 * s;  // nib, dipped into the neck
  const qVx = cx + 0.142 * s, qVy = cy - 0.294 * s;     // vane start (bare shaft below this)
  const qTx = cx + 0.40 * s, qTy = cy - 0.44 * s;       // feather tip
  const vane = `M ${f(qVx)} ${f(qVy)} Q ${f(cx + 0.219 * s)} ${f(cy - 0.458 * s)} ${f(qTx)} ${f(qTy)} Q ${f(cx + 0.303 * s)} ${f(cy - 0.310 * s)} ${f(qVx)} ${f(qVy)} Z`;
  const rachis = `M ${f(qVx)} ${f(qVy)} L ${f(qTx)} ${f(qTy)}`;
  const shaft = `M ${f(qNx)} ${f(qNy)} L ${f(qVx)} ${f(qVy)}`;
  // A flicked ink drop beside the rim.
  const dpx = cx - 0.305 * s, dpy = cy - 0.165 * s, dpr = 0.018 * s;
  const drop = `M ${f(dpx)} ${f(dpy - 1.5 * dpr)} Q ${f(dpx + 1.25 * dpr)} ${f(dpy + 0.1 * dpr)} ${f(dpx)} ${f(dpy + 0.85 * dpr)} Q ${f(dpx - 1.25 * dpr)} ${f(dpy + 0.1 * dpr)} ${f(dpx)} ${f(dpy - 1.5 * dpr)} Z`;
  const clipId = `inkwell${s}`;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={s} height={s}>
        <Defs><ClipPath id={clipId}><Path d={vessel} /></ClipPath></Defs>
        {/* the empty glass */}
        <Path d={vessel} fill={co.surface2} />
        {/* the gold ink, clipped to the vessel (unchanged fill-by-progress mechanic) */}
        {frac > 0 && (
          <G clipPath={`url(#${clipId})`}>
            <Rect x={0} y={level} width={s} height={baseY - level + 2} fill={co.accent} />
            {partial && (
              <Path d={meniscus} stroke={co.ink} strokeWidth={Math.max(1, s * 0.014)} opacity={0.35} fill="none" strokeLinecap="round" />
            )}
          </G>
        )}
        {detailed && (
          <Path d={sheen} stroke={co.text} strokeWidth={s * 0.03} opacity={0.13} fill="none" strokeLinecap="round" />
        )}
        {/* thin gold outline + the gilded rim */}
        <Path d={vessel} stroke={co.accent} strokeWidth={Math.max(1, s * 0.009)} fill="none" opacity={0.6} />
        <Rect x={f(xl(lipW))} y={f(lipTop)} width={f(lipW)} height={f(lipH)} rx={f(lipR)} fill={co.accent} />
        {/* framing ring - drawn before the quill so the feather can break the frame */}
        <Circle cx={cx} cy={cy} r={0.477 * s} stroke={co.accent} strokeWidth={1.5} fill="none" opacity={0.5} />
        {detailed && (
          <G>
            <Path d={drop} fill={co.accent} opacity={0.85} />
            <Path d={sparklePath(cx - 0.30 * s, cy - 0.33 * s, 0.045 * s)} fill={co.accent} opacity={0.9} />
            <Path d={sparklePath(cx + 0.365 * s, cy - 0.06 * s, 0.028 * s)} fill={co.accent} opacity={0.75} />
            <Path d={vane} fill={co.accent} opacity={0.92} />
            <Path d={vane} stroke={co.text} strokeWidth={Math.max(0.8, s * 0.008)} fill="none" opacity={0.85} />
            <Path d={rachis} stroke={co.ink} strokeWidth={Math.max(0.8, s * 0.007)} opacity={0.55} strokeLinecap="round" />
            <Path d={shaft} stroke={co.text} strokeWidth={Math.max(1.2, s * 0.018)} opacity={0.95} strokeLinecap="round" />
          </G>
        )}
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none" />
    </View>
  );
}

// ── Alternative motif A (built for comparison, not wired): a gold ring of N segments, one
// lighting per cleared word - ties to the journey's gold medallions. Pending segments are a
// faint gold ghost so the empty state still shows the day's shape. Serif count in the center.
export function SegmentRingGauge({ filled, total, co, size = RING_BOX }: { filled: number; total: number; co: Palette; size?: number }) {
  const n = Math.max(1, Math.round(total));
  const done = Math.max(0, Math.min(n, Math.round(filled)));
  const cx = size / 2, cy = size / 2;
  const r = size * 0.42, sw = Math.max(4, size * 0.07);
  const span = 360 / n;
  const gap = n > 1 ? Math.min(14, span * 0.30) : 0;
  const pt = (deg: number): [number, number] => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const segs = Array.from({ length: n }, (_, i) => {
    const a0 = i * span + gap / 2, a1 = (i + 1) * span - gap / 2;
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill as any}>
        {segs.map((d, i) => (
          <Path key={i} d={d} stroke={co.accent} strokeWidth={sw} strokeLinecap="round" fill="none" opacity={i < done ? 1 : 0.16} />
        ))}
      </Svg>
      <Text style={{ fontFamily: fonts.serif, fontSize: size * 0.30, color: co.text }}>{done}</Text>
    </View>
  );
}

// ── Alternative motif B (built for comparison, not wired): a small shelf of book spines, one
// spine added per cleared word (gold and ink alternating, hand-varied heights). Pending words
// are faint low stubs so an empty shelf still reads as "today's row, waiting".
export function BookshelfGauge({ filled, total, co, size = RING_BOX }: { filled: number; total: number; co: Palette; size?: number }) {
  const n = Math.max(1, Math.round(total));
  const done = Math.max(0, Math.min(n, Math.round(filled)));
  const shelfW = 0.80 * size;
  const shelfH = Math.max(2, 0.022 * size);
  const shelfY = size * 0.66;
  const x0 = (size - shelfW) / 2;
  const slotW = shelfW / n;
  const spineW = slotW * 0.62;
  const H = [0.30, 0.24, 0.34, 0.27, 0.31, 0.23, 0.33, 0.26, 0.29, 0.35, 0.25, 0.32];
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {Array.from({ length: n }, (_, i) => {
          const x = x0 + i * slotW + (slotW - spineW) / 2;
          const isDone = i < done;
          const h = isDone ? H[i % H.length] * size : 0.055 * size;
          const rx = Math.min(2, spineW * 0.3);
          return (
            <Rect
              key={i} x={x.toFixed(2)} y={(shelfY - h).toFixed(2)} width={spineW.toFixed(2)} height={h.toFixed(2)} rx={rx}
              fill={isDone ? (i % 2 ? co.text : co.accent) : co.accent} opacity={isDone ? 1 : 0.16}
            />
          );
        })}
        <Rect x={x0 - 0.02 * size} y={shelfY} width={shelfW + 0.04 * size} height={shelfH} rx={shelfH / 2} fill={co.faint} opacity={0.55} />
      </Svg>
    </View>
  );
}

// Animated wrapper for the payoff gauge: ramps the ink level from `from` to `to` on appear.
function AnimatedGauge({ from = 0, to, total, co, size }: { from?: number; to: number; total: number; co: Palette; size?: number }) {
  const [shown, setShown] = useState(from);
  const anim = useRef(new Animated.Value(from)).current;
  useEffect(() => {
    const sub = anim.addListener(({ value }) => setShown(value));
    Animated.timing(anim, { toValue: to, duration: 1200, delay: 350, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => { anim.removeListener(sub); };
  }, [to]);
  return <Gauge filled={shown} total={total} co={co} size={size} />;
}

// ── The session's step queue ────────────────────────────────────────────────────────────────
// learnBatch: the LEARN phase, consolidated (owner 2026-09-30: "keep 5 new words but don't make
// 5 skips before the test; make 1 screen with more words in it") - ONE scrollable screen listing
// ALL of today's brand-new words together (ungraded). Its single "Got it"/"Start recall" writes
// the intro SRS row + the presented mark for EVERY word at once (the per-word loop of what an
// 'intro' teach card used to do). teach: a LessonCard screen. pass 'intro' = the LEGACY per-word
// LEARN card (no longer built, kept for the advance() handler); 'again' = the fix-phase re-teach
// after a missed recall; 'reveal' = the twice-missed guardrail's answer card. check: one question.
// phase 'first' = the real, recorded RECALL of a word taught on a prior day; 'fix' = the
// different-format retest; 'final' = the guardrail's last requeue; 'replay' = a voluntary
// post-advance practice run (records nothing).
type Step =
  | { kind: 'teach'; word: Word; brief: boolean; pass: 'intro' | 'again' | 'reveal' }
  | { kind: 'learnBatch'; words: Word[] }
  | { kind: 'check'; word: Word; mode: GameMode; phase: 'first' | 'fix' | 'final' | 'replay' };

const MODES: GameMode[] = ['meaning', 'gap', 'guess', 'synonym']; // replay rotation only
// RECALL formats are biased toward PRODUCTION over recognition - the testing effect strengthens
// what the test demands. 'gap' (put the word back into a sentence) and 'guess' (definition →
// the word) lead; 'synonym' joins when the word carries one. 'meaning' (word → pick the
// definition, the weakest pure-recognition format) is deliberately NOT in the rotation - it
// survives only as the last-resort fallback and inside the fix/guardrail retests, where a
// DIFFERENT format matters more than a hard one.
const RECALL_MODES: GameMode[] = ['gap', 'guess', 'synonym'];
const FIX_PREF: GameMode[] = ['guess', 'gap', 'synonym', 'meaning'];

// The RECALL mode for a word: rotate the production formats across the round, keyed to the
// word's fixed index in today's wordIds - deterministic, so a resumed session (and the fix
// phase after a quit) can still know which format the recall used and pick a DIFFERENT one for
// the retest. 'synonym' only when the word carries one; fall back along the recall list
// ('meaning' only if nothing else builds, which can't happen - gap and guess always build).
function recallModeFor(word: Word, wordIds: string[]): GameMode {
  const idx = Math.max(0, wordIds.indexOf(word.id));
  const rotated = RECALL_MODES[idx % RECALL_MODES.length];
  return canDoMode(word, rotated) ? rotated : (RECALL_MODES.find((m) => canDoMode(word, m)) ?? 'meaning');
}

// The fix-phase retest mode: the first format the word supports that is NOT its recall format,
// so the re-encounter after the "Look again" card comes from a genuinely different angle.
function fixModeFor(word: Word, firstMode: GameMode): GameMode {
  return FIX_PREF.find((m) => m !== firstMode && canDoMode(word, m)) ?? 'meaning';
}

// FNV-1a over today's word ids: a stable per-day seed for the recall shuffle. NOT Math.random -
// a resumed or rebuilt session must reproduce the IDENTICAL queue order, or quitting mid-round
// would silently reorder the remaining checks.
function daySeed(wordIds: string[]): number {
  let h = 0x811c9dc5;
  const s = wordIds.join('|');
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// Deterministic Fisher-Yates (mulberry32 PRNG): same seed, same order, every time.
function seededShuffle<T>(items: T[], seed: number): T[] {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = [...items];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

// The main-phase queue: the LEARN phase as ONE consolidated screen (a single learnBatch step
// listing every pending new word), then the pending RECALL checks in a seeded-shuffled order
// (unpredictable but reproducible, so a resumed session rebuilds the identical order for whatever
// is still pending). Exactly ONE phase-'first' check per recall word, so the record-first-attempt-
// only accuracy/SRS/skill logic is untouched. No word is ever taught and checked in the same
// session phase - today's learn words carry no checks at all; their recall arrives on a later day,
// at the edge of forgetting, which is the entire point of the model.
function buildQueue(learn: Word[], recall: Word[], wordIds: string[]): Step[] {
  const steps: Step[] = [];
  if (learn.length > 0) steps.push({ kind: 'learnBatch', words: learn });
  const order = seededShuffle(recall, daySeed(wordIds));
  for (const w of order) steps.push({ kind: 'check', word: w, mode: recallModeFor(w, wordIds), phase: 'first' });
  return steps;
}

type ViewState = 'loading' | 'intro' | 'session' | 'resume' | 'result';

export default function DailyTest() {
  const { field } = useField();
  const { palette: co } = useApp();
  const styles = makeStyles(co);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [view, setView] = useState<ViewState>('loading');
  const [steps, setSteps] = useState<Step[]>([]);
  const [idx, setIdx] = useState(0);
  const [cleared, setCleared] = useState(0);       // learn cards done + recalls cleared (the ONE progress bar)
  const [total, setTotal] = useState(DAILY_TEST_COUNT); // learn count + recall count
  const [learnCount, setLearnCount] = useState(0);   // today's learn set size (intro/result copy)
  const [recallCount, setRecallCount] = useState(0); // today's due-recall set size (0 = cold start)
  const [leftOnResume, setLeftOnResume] = useState(0); // "N left to clear" on the resume screen
  const [cleanSweep, setCleanSweep] = useState(false); // every recall right first pass (result copy)
  const [replaying, setReplaying] = useState(false);
  const [streak, setStreak] = useState<DailyTestStreak | null>(null); // advancement line on the intro

  // Refs mirroring state for the async step handlers (no stale closures).
  const stepsRef = useRef<Step[]>([]);
  const idxRef = useRef(0);
  const phaseOneDone = useRef(false); // main queue finalized once (streak/widgets/fix build)
  const poolRef = useRef<Word[]>([]); // today's session words ONLY (fix/replay lookups key off this)
  // The MCQ distractor pool: today's session words first, so every option is equally familiar
  // and the just-taught target never "pops" as the one word the user has seen. Only a thin day
  // (fewer session words than the quality filters need) tops up from the broader field pool.
  const distractorPoolRef = useRef<Word[]>([]);
  const wordIdsRef = useRef<string[]>([]);
  const writeChain = useRef<Promise<unknown>>(Promise.resolve()); // serialize daily-state writes
  const finishedRef = useRef(false);  // one-shot guard for the session finish

  const chain = (fn: () => Promise<unknown>) => {
    writeChain.current = writeChain.current.then(fn).catch(() => {});
  };

  // The current check's question, built ONCE per step (memo on idx): the answer handler
  // triggers re-renders (gauge fill), and rebuilding would reshuffle the options mid-reveal.
  // Unconditional hook - it must run on every render regardless of view (this repo has been
  // bitten by a hooks-after-early-return crash before). 'meaning' always builds, so the
  // fallback guarantees a question for any word.
  const q: Question | null = useMemo(() => {
    const s = stepsRef.current[idx];
    if (!s || s.kind !== 'check') return null;
    const pool = distractorPoolRef.current.length ? distractorPoolRef.current : poolRef.current;
    if (!pool.length) return null;
    return buildQuestionForWord(pool, s.word, s.mode)
      ?? buildQuestionForWord(pool, s.word, 'meaning');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, steps, view]);

  // Resolve every one of today's words - recall AND learn, answered ones included - so the
  // checks have a full-size distractor pool even when only a few words are still pending
  // (same-day / among-due distractors: every option is a word from this session's own sets).
  const resolvePool = async (state: DailyTestState): Promise<Word[]> => {
    const all = await Promise.all([...state.wordIds, ...(state.learnIds ?? [])].map((id) => getWordById(id)));
    return all.filter((w): w is Word => !!w);
  };

  // Build the fix-phase steps for the given still-to-clear words: a second teach with a
  // DIFFERENT framing (the corpus carries ONE example per word, so a truly different example
  // sentence isn't available - the card re-shows the same `ex` under a "Look again" eyebrow
  // with a synonym anchor when one exists), then a retest in a DIFFERENT format.
  const buildFixSteps = (words: Word[]): Step[] => {
    const steps: Step[] = [];
    for (const w of words) {
      steps.push({ kind: 'teach', word: w, brief: false, pass: 'again' });
      steps.push({ kind: 'check', word: w, mode: fixModeFor(w, recallModeFor(w, wordIdsRef.current)), phase: 'fix' });
    }
    return steps;
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const { state, pendingLearn, pendingRecall } = await getOrBuildDailyTest(field);
      const pool = await resolvePool(state);
      if (!alive) return;
      poolRef.current = pool;
      // Distractors draw from the session's own words (learn + recall - all equally live for
      // this user). Only an abnormally thin day tops up from the field pool so pickDistractors'
      // quality guards (same pos, similar def length, no near-synonyms) have candidates.
      if (pool.length >= 6) {
        distractorPoolRef.current = pool;
      } else {
        const broader = await getWordsByField(field).catch(() => [] as Word[]);
        if (!alive) return;
        const have = new Set(pool.map((w) => w.id));
        distractorPoolRef.current = [...pool, ...broader.filter((w) => !have.has(w.id)).slice(0, 18)];
      }
      wordIdsRef.current = state.wordIds;
      const learnIds = state.learnIds ?? [];
      // The honest session size: today's new words + today's due recalls, under ONE gauge.
      setLearnCount(learnIds.length);
      setRecallCount(state.wordIds.length);
      setTotal(learnIds.length + state.wordIds.length || DAILY_TEST_COUNT);
      const learnedCount = (state.learned ?? []).length;
      const clearedNow = learnedCount
        + state.wordIds.filter((id) => state.answered[id] === true).length
        + (state.cleared?.length ?? 0);
      setCleared(clearedNow);

      if (!state.completed && (pendingLearn.length > 0 || pendingRecall.length > 0)) {
        // Main phase (fresh or resumed): the consolidated LEARN screen (only the still-un-got new
        // words, so a resume shows just what's left to meet), then the still-unanswered recalls.
        const queue = buildQueue(pendingLearn, pendingRecall, state.wordIds);
        stepsRef.current = queue; setSteps(queue);
        idxRef.current = 0; setIdx(0);
        const started = learnedCount > 0 || Object.keys(state.answered).length > 0;
        setView(started ? 'session' : 'intro'); // resuming skips the intro tax
        return;
      }

      // Everything attempted (or an abnormal all-answered-but-unfinalized state): the day is
      // either advanced, or mid-fix with "N left to clear".
      if (!state.completed) await finalizeDailyTest();
      const fresh = (await peekDailyTest()) ?? state;
      const left = dailyLeftToClear(fresh);
      if (left.length === 0) {
        if (!fresh.mastered) await markDailyMastered().catch(() => {});
        // Clean sweep needs recalls to sweep - a learn-only cold-start day never claims it.
        setCleanSweep(fresh.wordIds.length > 0 && fresh.wordIds.every((id) => fresh.answered[id] === true));
        setCleared((fresh.learnIds ?? []).length + fresh.wordIds.length);
        setView('result');
      } else {
        setLeftOnResume(left.length);
        setView('resume');
      }
    })().catch(() => {});
    return () => { alive = false; };
  }, [field]);

  // Daily-test streak → the intro's advancement line (day-of-week fill + a subtle caption). Read
  // once on mount; it reflects the run of days completed ENDING yesterday (today isn't done yet
  // when the intro shows), so it reads as "where you are on your path, about to extend it".
  useEffect(() => {
    getDailyTestStreak().then(setStreak).catch(() => {});
  }, []);

  // ── Session finish: everything cleared → advance, ONE success screen. ──
  const finishSession = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    await writeChain.current;
    await markDailyMastered().catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCleared(total);
    setView('result');
  };

  // ── Main-queue completion: finalize (streak + widgets + reminders), then either advance
  // right away (clean sweep, or a learn-only cold start) or roll straight into the fix phase
  // under the same gauge. Runs exactly once per session (phaseOneDone guard in advance). ──
  const onPhaseOneDone = async (): Promise<Step[]> => {
    phaseOneDone.current = true;
    await writeChain.current;             // every recordDailyAnswer/markDailyLearned landed
    await finalizeDailyTest();            // completion = learn done + recalls attempted (cold start: learn alone)
    syncStreakTags().catch(() => {});     // keep the OneSignal Streak-Saver tags current
    schedulePracticeReminder().catch(() => {}); // today's done → re-arm tomorrow's nudge
    require('../lib/widget').syncStreakWidget?.(); // keep the home-screen widgets current
    const state = await peekDailyTest();
    const left = state ? dailyLeftToClear(state) : [];
    if (left.length === 0) {
      // Clean sweep = every RECALL right on the first pass: count it once for the "Flawless"
      // achievement + a genuine positive moment for the App Store rating ask (gated + throttled
      // in lib/rating.ts). A learn-only cold-start day has no recalls, so it claims neither.
      if ((state?.wordIds.length ?? 0) > 0) {
        setCleanSweep(true);
        const prev = parseInt((await AsyncStorage.getItem('lexfall.flawlessDays')) || '0', 10);
        AsyncStorage.setItem('lexfall.flawlessDays', String(prev + 1)).catch(() => {});
        require('../lib/rating').maybeRequestReview?.();
      }
      return [];
    }
    const words = left.map((id) => poolRef.current.find((w) => w.id === id)).filter((w): w is Word => !!w);
    return buildFixSteps(words);
  };

  // ── Per-check recording. The RECALL first attempt (phase 'first', and only that) feeds the
  // daily record + the same accuracy/SRS/skill pipeline the practice Game writes - this is the
  // word's real spaced test, days after it was taught. `ok` already folds in the hint (a hinted
  // pick arrives as false from CheckCard), so a hinted recall records as a genuine miss:
  // recordReview(false) shortens/resets the SRS interval and the word rolls into the fix phase.
  // Fix/final/replay checks record NOTHING - relearning reps must not double-count. ──
  const onCheckAnswer = (step: Extract<Step, { kind: 'check' }>, ok: boolean) => {
    if (step.phase === 'first') {
      chain(() => recordDailyAnswer(step.word.id, ok));
      recordReview(step.word.id, ok).catch(() => {});
      recordAnswer(ok).catch(() => {});
      recordAttempt(step.word.id, ok).catch(() => {});
      recordSkill(step.word, ok).catch(() => {});
      if (ok) { recordLearned(1).catch(() => {}); setCleared((c) => c + 1); }
      else setWordCollection(step.word.id, 'Review').catch(() => {}); // misses file into Review (Game parity)
    } else if (step.phase === 'fix') {
      if (ok) { chain(() => markDailyCleared(step.word.id)); setCleared((c) => c + 1); }
    } else if (step.phase === 'final') {
      // Guardrail: after the reveal card, this last requeue ends the word's day either way -
      // the answer was just shown, the SRS already recorded the real miss, and it returns in
      // tomorrow's test regardless. Never loops.
      chain(() => markDailyCleared(step.word.id));
      setCleared((c) => c + 1);
    }
  };

  // ── Advance the queue after a step (teach Got it/Continue, or a check's reveal pause). ──
  const advance = async (from: Step | null, ok = true) => {
    // Re-entrancy guard: only the step actually on screen may advance the queue (a rapid
    // double-tap on a teach card's button must not skip the following step or double-write).
    if (from && stepsRef.current[idxRef.current] !== from) return;
    // A LEARN card's "Got it" is the moment the word becomes real: persist it for resume, give
    // it its intro SRS row (due tomorrow - the whole point: recall on a LATER day, never now),
    // and enter it in the presented ledger so it can never be taught as new again. This is the
    // learn phase's ONLY recording - no accuracy, no attempt, no skill rows.
    if (from?.kind === 'teach' && from.pass === 'intro') {
      chain(() => markDailyLearned(from.word.id));
      recordIntro(from.word.id).catch(() => {});
      addPresentedIds([from.word.id]).catch(() => {});
      setCleared((c) => c + 1);
    }
    // The consolidated LEARN screen's one button clears the WHOLE learn phase at once: the exact
    // per-word recording the 'intro' card did above, looped over every listed word (persist for
    // resume + intro SRS row + the presented mark). Completing this is what makes learnDone true
    // for finalize/streak - the same bar clearing all the old intro cards met.
    if (from?.kind === 'learnBatch') {
      for (const w of from.words) {
        chain(() => markDailyLearned(w.id));
        recordIntro(w.id).catch(() => {});
      }
      addPresentedIds(from.words.map((w) => w.id)).catch(() => {});
      setCleared((c) => c + from.words.length);
    }
    let list = stepsRef.current;
    if (from?.kind === 'check' && from.phase === 'fix' && !ok) {
      // Missed twice → show the answer + example, requeue ONCE more at the end. The final
      // check just needs a format different from the fix retest the user just failed.
      const finalMode: GameMode = from.mode === 'meaning' ? 'guess' : 'meaning';
      const more: Step[] = [
        { kind: 'teach', word: from.word, brief: false, pass: 'reveal' },
        { kind: 'check', word: from.word, mode: finalMode, phase: 'final' },
      ];
      list = [...list, ...more]; stepsRef.current = list; setSteps(list);
    }
    const next = idxRef.current + 1;
    if (next >= list.length) {
      if (replaying) { setReplaying(false); setView('result'); return; } // replay ends quietly
      // End of the main queue: finalize once (streak/widgets/reminders) and roll into the fix
      // phase if any recall was missed. On a learn-only cold-start day the last teach card IS
      // the finish line - the day completes and advances on the intros alone.
      if (!phaseOneDone.current) {
        const fix = await onPhaseOneDone();
        if (fix.length) {
          list = [...list, ...fix]; stepsRef.current = list; setSteps(list);
          idxRef.current = next; setIdx(next);
          return;
        }
      }
      await finishSession();
      return;
    }
    idxRef.current = next; setIdx(next);
  };

  // Resume screen → rebuild the fix queue for whatever is still to clear and dive back in.
  const resumeFix = async () => {
    const state = await peekDailyTest();
    if (!state) { router.back(); return; }
    const left = dailyLeftToClear(state);
    if (left.length === 0) { setView('result'); return; }
    const words = left.map((id) => poolRef.current.find((w) => w.id === id)).filter((w): w is Word => !!w);
    const queue = buildFixSteps(words);
    phaseOneDone.current = true; // the day already finalized; this is pure fix-phase resume
    finishedRef.current = false;
    stepsRef.current = queue; setSteps(queue);
    idxRef.current = 0; setIdx(0);
    setView('session');
  };

  // Voluntary post-advance practice run: re-check today's RECALL words (formats rotated off by
  // one so it doesn't repeat the session verbatim). Learn words stay out - their first test
  // belongs to a later day, and rehearsing them now would just manufacture recognition.
  // Records nothing; ends back on the result screen.
  const startReplay = () => {
    const recallIds = new Set(wordIdsRef.current);
    const words = poolRef.current.filter((w) => recallIds.has(w.id));
    if (!words.length) return;
    const queue: Step[] = words.map((w, i) => {
      const rotated = MODES[(i + 1) % MODES.length];
      const mode = canDoMode(w, rotated) ? rotated : (MODES.find((m) => canDoMode(w, m)) ?? 'meaning');
      return { kind: 'check', word: w, mode, phase: 'replay' };
    });
    setReplaying(true);
    stepsRef.current = queue; setSteps(queue);
    idxRef.current = 0; setIdx(0);
    setView('session');
  };

  if (view === 'loading') {
    return <View style={[styles.wrap, styles.center]}><ActivityIndicator color={co.accent} /></View>;
  }

  // ── INTRO ── one screen, shown once at the start of a fresh day, that states the model
  // plainly BEFORE the first card: meet today's new words gently (no quiz), recall the words
  // from earlier days (the graded gate), clear the recalls to advance the path. The count is
  // honest: new words + due recalls. A cold-start day (nothing due yet) gets its own truthful
  // rules - learn only, recalls start tomorrow. (The streak is the separate app-open streak -
  // no streak talk here.)
  if (view === 'intro') {
    const rules: { n: string; title: string; sub: string }[] = [];
    if (learnCount > 0) rules.push({
      n: '', title: `Meet ${learnCount} new ${learnCount === 1 ? 'word' : 'words'}`,
      sub: 'All on one screen: what each means, how it sounds, how your field uses it. Nothing to answer today.',
    });
    if (recallCount > 0) rules.push({
      n: '', title: `Recall ${recallCount} from earlier days`,
      sub: 'Words you met before come back right when you would start to forget them. Pulling one back is what makes it stick.',
    });
    rules.push(recallCount > 0
      ? { n: '', title: 'Clear the recalls to advance', sub: 'Miss one and you relearn it on the spot, then get checked a different way. Clear them all and you move up your path.' }
      : { n: '', title: 'They come back tomorrow', sub: 'Each new word returns for a real recall check right when you would start to forget it. Finish the cards today and you advance your path.' });
    rules.forEach((r, i) => { r.n = String(i + 1); });
    // Advancement line: where the user sits on their path this week. Fill = days completed in the
    // current Mon->Sun week (the same weekProgress the Journey/Progress strips read, so they can
    // never disagree); the caption states the live streak. Thin gold-on-muted, deliberately slim.
    const pathFrac = streak ? weekProgress(streak).filter((d) => d.done).length / 7 : 0;
    const streakN = streak?.count ?? 0;
    const pathLabel = streakN > 0 ? `${streakN}-day streak` : 'Start your streak';
    return (
      <View style={[styles.wrap, { paddingTop: insets.top + 16 }]}>
        <BackButton variant="close" onPress={() => router.back()} co={co} />
        <View style={styles.pathLineWrap}>
          <View style={styles.pathTrack}>
            <View style={{ flex: Math.max(0.0001, pathFrac), backgroundColor: co.accent, borderRadius: 2 }} />
            <View style={{ flex: Math.max(0.0001, 1 - pathFrac) }} />
          </View>
          <Text style={styles.pathCaption}>{pathLabel}</Text>
        </View>
        <View style={styles.doneBody}>
          <FadeIn><Text style={styles.eyebrow}>Daily words</Text></FadeIn>
          <PopIn><Gauge filled={cleared} total={total} co={co} /></PopIn>
          <Text style={styles.gaugeLabel}>{total} {total === 1 ? 'word' : 'words'} today</Text>
          <View style={styles.ruleList}>
            {rules.map((r, i) => (
              <FadeIn key={r.n} delay={160 + i * 110}>
                <View style={styles.ruleRow}>
                  <View style={styles.ruleDisc}><Text style={styles.ruleDiscTxt}>{r.n}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ruleTitle}>{r.title}</Text>
                    <Text style={styles.ruleSub}>{r.sub}</Text>
                  </View>
                </View>
              </FadeIn>
            ))}
          </View>
          <FadeIn delay={520}>
            <PressBounce style={styles.primaryBtn} onPress={() => setView('session')}>
              <Text style={styles.primaryBtnTxt}>Start</Text>
            </PressBounce>
          </FadeIn>
        </View>
      </View>
    );
  }

  // ── RESUME ── reopening a day that was quit mid-fix: today is still OPEN with N left to
  // clear. Continue picks up exactly there (the fix queue is rebuilt from the stored state,
  // never restarted) - the same "N left" the Journey path node shows.
  if (view === 'resume') {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top + 16 }]}>
        <BackButton variant="close" onPress={() => router.back()} co={co} />
        <View style={styles.doneBody}>
          <FadeIn><Text style={styles.eyebrow}>Daily words</Text></FadeIn>
          <PopIn><Gauge filled={total - leftOnResume} total={total} co={co} /></PopIn>
          <Text style={styles.gaugeLabel}>{leftOnResume} left to clear</Text>
          <Text style={styles.doneSub}>Pick up where you left off. Relearn {leftOnResume === 1 ? 'it' : 'each one'}, pass a quick check, and you advance your path.</Text>
          <PressBounce style={styles.primaryBtn} onPress={resumeFix}>
            <Text style={styles.primaryBtnTxt}>Continue</Text>
          </PressBounce>
          <PressBounce onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.quietLink}>Later today. {leftOnResume === 1 ? 'It stays' : 'They stay'} here for you.</Text>
          </PressBounce>
        </View>
      </View>
    );
  }

  // ── RESULT ── the ONE end screen: the day is cleared and the path advanced. The inkwell
  // fills to the brim under the confetti. (An imperfect quit never lands here - it resumes above.)
  if (view === 'result') {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top + 16 }]}>
        <View style={styles.resultBody}>
          <Confetti co={co} />
          <PopIn><AnimatedGauge from={Math.max(0, total - 2)} to={total} total={total} co={co} /></PopIn>
          <View style={styles.advancedPill}><Text style={styles.advancedPillTxt}>Advanced</Text></View>
          <Text style={styles.doneSub}>
            {recallCount === 0
              ? `${learnCount} new ${learnCount === 1 ? 'word' : 'words'} met. ${learnCount === 1 ? 'It comes' : 'They come'} back for recall tomorrow, right when it counts. You moved up your path.`
              : cleanSweep
                ? `Every recall cleared first try${learnCount > 0 ? ` and ${learnCount} new ${learnCount === 1 ? 'word' : 'words'} met` : ''}. You moved up your path.`
                : `All ${recallCount} recalls cleared${learnCount > 0 ? ` and ${learnCount} new ${learnCount === 1 ? 'word' : 'words'} met` : ''}. You moved up your path.`}
          </Text>
          {/* When the next day's words unlock: local midnight, when a fresh session builds. */}
          <UnlockCountdown style={styles.nextUnlock} />
          <PressBounce style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnTxt}>Done for today</Text>
          </PressBounce>
          {/* Replay re-checks the RECALL set only - a learn-only day has nothing to rerun. */}
          {recallCount > 0 && (
            <PressBounce onPress={startReplay} hitSlop={8}>
              <Text style={styles.quietLink}>Run the recalls again</Text>
            </PressBounce>
          )}
        </View>
      </View>
    );
  }

  // ── SESSION ── the whole learn-then-check flow, teach cards and checks alike, under ONE
  // compact inkwell gauge that fills only as words are CLEARED (the fill goes toward all-cleared,
  // so phase 1 and the fix phase share the same bar). The ✕ quits safely: everything answered
  // so far is already persisted, and reopening resumes.
  const step = stepsRef.current[idx];
  if (!step) {
    return <View style={[styles.wrap, styles.center]}><ActivityIndicator color={co.accent} /></View>;
  }
  const inFix = (step.kind === 'teach' && step.pass !== 'intro') || (step.kind === 'check' && (step.phase === 'fix' || step.phase === 'final'));
  const headerLabel = replaying ? 'Practice run'
    : inFix ? 'Clear your misses'
    : step.kind === 'teach' || step.kind === 'learnBatch' ? 'New words'
    : 'Recall';

  // ── The consolidated LEARN screen: every brand-new word for today on ONE scrollable screen
  // (owner: one screen, more words - not N skip-cards). Each row is the full teach - serif
  // headword + speak button, part of speech + IPA, meaning, and the in-context example - in the
  // editorial style (co.surface cards). One primary button clears the whole learn phase. ──
  if (step.kind === 'learnBatch') {
    const oneWord = step.words.length === 1;
    return (
      <View style={{ flex: 1, backgroundColor: co.bg, paddingTop: insets.top + 8 }}>
        <View style={styles.sessionHeader}>
          <Gauge filled={cleared} total={total} co={co} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.sessionHeaderLabel}>{headerLabel}</Text>
            <Text style={styles.sessionHeaderCount}>{cleared} of {total} done</Text>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.learnScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.learnTitle}>{step.words.length} new {oneWord ? 'word' : 'words'}</Text>
          <Text style={styles.learnIntro}>All on one screen: what each means, how it sounds, how your field uses it. Nothing to answer today.</Text>
          {step.words.map((w, i) => (
            <FadeIn key={w.id} delay={80 + i * 70}>
              <View style={styles.learnCard}>
                <View style={styles.learnWordRow}>
                  <Text style={[styles.learnWord, { fontSize: headwordSize(w.word) }]} numberOfLines={1} adjustsFontSizeToFit={false}>{w.word}</Text>
                  <Pressable
                    onPress={() => speakWord(w.word, undefined, w.id)}
                    hitSlop={10}
                    accessibilityLabel={`Pronounce ${w.word}`}
                    style={styles.learnSay}
                  >
                    <Svg width={18} height={18} viewBox="0 0 24 24">
                      <Path d="M11 5 6 9H3v6h3l5 4V5Z" stroke={co.muted} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
                      <Path d="M15.5 8.5a4.5 4.5 0 0 1 0 7" stroke={co.muted} strokeWidth={1.6} fill="none" strokeLinecap="round" />
                    </Svg>
                  </Pressable>
                </View>
                <Text style={styles.learnMeta}>{w.ipa ? `/${w.ipa}/  ·  ` : ''}({w.pos})</Text>
                <Text style={styles.learnDef}>{w.def}</Text>
                {!!w.ex && <Text style={styles.learnEx}>“{w.ex}”</Text>}
              </View>
            </FadeIn>
          ))}
        </ScrollView>
        <View style={[styles.learnFooter, { paddingBottom: insets.bottom + 16 }]}>
          <PressBounce style={styles.primaryBtn} onPress={() => advance(step)}>
            <Text style={styles.primaryBtnTxt}>{recallCount > 0 ? 'Start recall' : 'Got it'}</Text>
          </PressBounce>
        </View>
      </View>
    );
  }

  // The teach screens.
  if (step.kind === 'teach') {
    const eyebrow = step.pass === 'again' ? 'Look again'
      : step.pass === 'reveal' ? 'The answer'
      : step.brief ? 'From your feed today' : 'New word';
    // Intro cards say out loud that there is no quiz today (the gentle-first-exposure promise);
    // the corpus carries one example per word, so the fix-phase card can't show a genuinely
    // different sentence - it re-frames instead: a synonym anchor when one exists, and an
    // honest nudge about what comes next.
    const note = step.pass === 'again'
      ? (step.word.syn?.length ? `Close in meaning: ${step.word.syn[0]}.` : 'Same sentence, fresh eyes. A different kind of check comes next.')
      : step.pass === 'reveal' ? 'Read it once more. One last check comes at the end.'
      : step.pass === 'intro' && !step.brief ? 'No quiz on this today. It comes back for recall when the timing is right.'
      : undefined;
    return (
      <View style={{ flex: 1, backgroundColor: co.bg, paddingTop: insets.top + 8 }}>
        <View style={styles.sessionHeader}>
          <Gauge filled={cleared} total={total} co={co} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.sessionHeaderLabel}>{headerLabel}</Text>
            <Text style={styles.sessionHeaderCount}>{cleared} of {total} done</Text>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
        </View>
        <View style={styles.teachBody}>
          <FadeIn key={`teach-${idx}`}>
            <LessonCard word={step.word} co={co} eyebrow={eyebrow} brief={step.brief && step.pass === 'intro'} note={note} />
          </FadeIn>
          <FadeIn key={`teachbtn-${idx}`} delay={140}>
            <PressBounce style={styles.primaryBtn} onPress={() => advance(step)}>
              <Text style={styles.primaryBtnTxt}>{step.pass === 'intro' && step.brief ? 'I remember it' : 'Got it'}</Text>
            </PressBounce>
          </FadeIn>
        </View>
      </View>
    );
  }

  // A check screen: one question, memoized per step above (keyed remount → clean pick state).
  // q can't genuinely be null here ('meaning' always builds); the guard is defensive only.
  if (!q) return <View style={[styles.wrap, styles.center]}><ActivityIndicator color={co.accent} /></View>;
  return (
    <View style={{ flex: 1, backgroundColor: co.bg, paddingTop: insets.top + 8 }}>
      <View style={styles.sessionHeader}>
        <Gauge filled={cleared} total={total} co={co} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.sessionHeaderLabel}>{headerLabel}</Text>
          <Text style={styles.sessionHeaderCount}>{cleared} of {total} done</Text>
        </View>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
      </View>
      <CheckCard
        key={`check-${idx}`}
        q={q}
        co={co}
        // The hint is a RECALL-only affordance (never fix/final/replay), and only for formats
        // where the meaning isn't already on screen ('meaning' shows defs as options, 'guess'
        // shows the def as the prompt). Using it counts as not-recalled - see CheckCard.
        hint={step.phase === 'first' && step.mode !== 'meaning' && step.mode !== 'guess' ? step.word.def : undefined}
        onAnswer={(ok) => onCheckAnswer(step, ok)}
        onContinue={(ok) => { advance(step, ok); }}
      />
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: co.bg, paddingHorizontal: 26 },
  center: { alignItems: 'center', justifyContent: 'center' },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  resultBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 96 },
  gaugeLabel: { fontFamily: fonts.sansSemi, fontSize: 14, color: co.text, marginTop: 10, textTransform: 'uppercase', letterSpacing: 1 },
  // In-session progress header (compact inkwell filling toward all-cleared) + a safe exit.
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 26, paddingBottom: 4 },
  sessionHeaderLabel: { fontFamily: fonts.sansSemi, fontSize: 11.5, color: co.accent, textTransform: 'uppercase', letterSpacing: 1.4 },
  sessionHeaderCount: { fontFamily: fonts.serif, fontSize: 20, color: co.text, marginTop: 2 },
  close: { color: co.muted, fontSize: 19, paddingHorizontal: 4 },
  // Teach step: the lesson card vertically centered with its Continue directly beneath.
  teachBody: { flex: 1, justifyContent: 'center', paddingHorizontal: 26, paddingBottom: 40 },
  // Consolidated LEARN screen: a scrollable list of every new word + a fixed footer button.
  learnScroll: { paddingHorizontal: 26, paddingTop: 8, paddingBottom: 20 },
  learnTitle: { fontFamily: fonts.serif, fontSize: 22, color: co.text, marginTop: 8 },
  learnIntro: { fontFamily: fonts.sans, fontSize: 13.5, color: co.muted, lineHeight: 20, marginTop: 8, marginBottom: 18 },
  learnCard: { backgroundColor: co.surface, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 12 },
  learnWordRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  learnWord: { fontFamily: fonts.serif, fontSize: 24, color: co.text, letterSpacing: 0.3, flexShrink: 1 },
  learnSay: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: co.line2 },
  learnMeta: { fontFamily: fonts.sansSemi, fontSize: 12, color: co.accent, letterSpacing: 0.6, marginTop: 4, textTransform: 'lowercase' },
  learnDef: { fontFamily: fonts.sans, fontSize: 14.5, color: co.text, lineHeight: 21, marginTop: 8 },
  learnEx: { fontFamily: fonts.serifItalic, fontSize: 14, color: co.exText, lineHeight: 21, marginTop: 8 },
  learnFooter: { paddingHorizontal: 26, paddingTop: 8 },
  // Intro advancement line: thin muted track with a gold fill + a subtle streak caption.
  pathLineWrap: { marginTop: 10, marginBottom: 2 },
  pathTrack: { flexDirection: 'row', height: 4, borderRadius: 2, backgroundColor: co.surface2, overflow: 'hidden' },
  pathCaption: { fontFamily: fonts.sansSemi, fontSize: 10.5, color: co.faint, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 6 },
  // "Advanced" pill on the single end screen.
  advancedPill: { backgroundColor: co.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6, marginTop: 14 },
  advancedPillTxt: { fontFamily: fonts.sansSemi, fontSize: 12, color: co.ink, textTransform: 'uppercase', letterSpacing: 1.4 },
  doneSub: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, marginTop: 18, textAlign: 'center', lineHeight: 21, maxWidth: 300 },
  // Quiet unlock countdown under the done summary ("Next words in 7h 14m").
  nextUnlock: { fontFamily: fonts.sans, fontSize: 12.5, color: co.faint, marginTop: 10, textAlign: 'center' },
  primaryBtn: { marginTop: 26, backgroundColor: co.accent, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 30, alignSelf: 'center' },
  primaryBtnTxt: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.ink },
  quietLink: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: co.muted, marginTop: 16, textAlign: 'center' },
  // Intro rules
  eyebrow: { fontFamily: fonts.sansSemi, fontSize: 12, color: co.accent, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 },
  ruleList: { alignSelf: 'stretch', marginTop: 26, gap: 16 },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  ruleDisc: { width: 28, height: 28, borderRadius: 14, backgroundColor: co.accent, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  ruleDiscTxt: { fontFamily: fonts.sansSemi, fontSize: 14, color: co.ink },
  ruleTitle: { fontFamily: fonts.sansSemi, fontSize: 15.5, color: co.text },
  ruleSub: { fontFamily: fonts.sans, fontSize: 13, color: co.muted, marginTop: 3, lineHeight: 19 },
});
