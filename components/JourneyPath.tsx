import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, AccessibilityInfo, type LayoutChangeEvent } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Path as SvgPath, Circle, Rect, Ellipse, G, Defs, RadialGradient, LinearGradient, Stop } from 'react-native-svg';
import { getWordsKnownCount } from '../lib/db';
import { computePlan, type PlanState } from '../lib/plan';
import { getDailyTestStreak, weekProgress, todayStr, peekDailyTest, dailyLeftToClear } from '../lib/daily-test';
import { getSignupDate } from '../lib/streak';
import { useField } from '../lib/field';
import { Palette, fonts, label } from '../theme/tokens';
import PressBounce from './PressBounce';
import FadeIn from './FadeIn';
import UnlockCountdown from './UnlockCountdown';
import { playSfx } from '../lib/sfx';

const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // indexed by getDay()
const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; // VoiceOver
const NODE = 46;          // day-node diameter (today included — same shape for every stop)
const ISLAND_W = 118;     // geometry width of today's stop (drives AMP + the on-screen clamp)
// The hero stack's PRESS TARGET is wider than the geometry island: the Start/word
// bubble sits above-LEFT (or above-right) of the node, so the tappable wrap has to
// span both the node and the offset bubble. Purely a hit-area/layout width — the
// path geometry still keys off ISLAND_W so the route itself is unchanged.
const WRAP_W = 200;
const BUBBLE_REACH = 84;  // how far the bubble body extends past the node centre on its side
const TAIL_REACH = 24;    // node-side bubble edge overshoot past the node centre …
const TAIL_INSET = TAIL_REACH - 5; // … so the 10pt tail's centre lands exactly on the node centre
const TOP_PAD = 92;       // room for the mountain range above the Sunday summit
// Breathing room under Monday: clears the "N of 7 days" caption, the home
// indicator (the parent route already applies the bottom safe-area inset), and
// leaves headroom for a translucent tab bar should this screen ever become a tab.
const BOTTOM_PAD = 46;
const GAP_MIN = 54;       // smallest vertical gap between two ordinary stops

// Today's stop carries a small Start pill (or the "N words" datum once done) on a
// short stack above the node; the old flat climber figure is gone, so the stack
// only needs to clear the pill + its tail.
const STACK_H = 52;       // pill + tail above today's node top
// The gap between TODAY and the next day up must clear the stack, otherwise the
// next stop hides behind the pill (the old "two stray lock circles" bug). All
// other gaps share what's left.
const HERO_CLEAR = STACK_H + 40;

// Hand-tuned serpentine: each day's horizontal offset (× amplitude). Alternating
// sides give real switchbacks; Sunday eases back toward centre to arrive at the
// foot of the main peak. A tuned table, not a sin() sweep — the bends are placed,
// not generated, which is what makes the route read designed.
const SWEEP = [-0.12, 0.74, -0.66, 0.72, -0.78, 0.58, 0.1];

function Check({ c, size = 20 }: { c: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><SvgPath d="M5 13l4 4 10-11" stroke={c} strokeWidth={2.8} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

// ── Scenery ───────────────────────────────────────────────────────────────────
// A hand-drawn editorial alpine world, all in palette tones (ink/bone + the one
// gold accent). Depth is deliberate: far shapes sit in hairline tones behind a
// mist band, the mid range in line2, and the FOREGROUND groves in muted/faint —
// real presence, not watermark-faint noise. Trees carry snow, sit on ground
// mounds, and the trail is a carved bed with stitched gold footsteps.

// The palette doesn't carry a theme flag; read it off the background luminance so
// snow/shadow/scenery tones can pick the right register in both themes.
const isDarkPalette = (co: Palette) => {
  const v = parseInt(co.bg.slice(1), 16);
  return (((v >> 16) & 255) + ((v >> 8) & 255) + (v & 255)) / 3 < 128;
};

// One conifer tier: concave swept sides + a softly scalloped underside, tip nudged
// by `lean` so trees don't stand ruler-straight.
const tierD = (cx: number, yb: number, yt: number, wh: number, lean: number) => {
  const tip = cx + lean; const hh = yb - yt;
  return `M ${tip} ${yt}` +
    ` C ${tip - wh * 0.24} ${yt + hh * 0.34} ${cx - wh * 0.58} ${yb - hh * 0.3} ${cx - wh} ${yb}` +
    ` Q ${cx - wh * 0.48} ${yb - 3.4} ${cx - wh * 0.14} ${yb - 1}` +
    ` Q ${cx} ${yb + 1.6} ${cx + wh * 0.14} ${yb - 1}` +
    ` Q ${cx + wh * 0.48} ${yb - 3.4} ${cx + wh} ${yb}` +
    ` C ${cx + wh * 0.58} ${yb - hh * 0.3} ${tip + wh * 0.24} ${yt + hh * 0.34} ${tip} ${yt} Z`;
};

function PineTree({ x, y, h, fill, snow, lean = 0, opacity = 1 }: {
  x: number; y: number; h: number; fill: string; snow?: string; lean?: number; opacity?: number;
}) {
  const tw = Math.max(2.4, h * 0.075);
  const tiers = [
    { yb: y - h * 0.08, yt: y - h * 0.52, wh: h * 0.34 },
    { yb: y - h * 0.36, yt: y - h * 0.75, wh: h * 0.26 },
    { yb: y - h * 0.6, yt: y - h, wh: h * 0.18 },
  ];
  return (
    <G opacity={opacity}>
      <Rect x={x - tw / 2} y={y - h * 0.2} width={tw} height={h * 0.22} rx={tw / 2} fill={fill} opacity={0.8} />
      {tiers.map((t, i) => (
        <SvgPath key={i} d={tierD(x, t.yb, t.yt, t.wh, lean * (0.4 + i * 0.5))} fill={fill} />
      ))}
      {/* a dusting of snow on the crown ties the grove to the peaks above */}
      {snow ? <SvgPath d={tierD(x, y - h * 0.85, y - h, h * 0.115, lean * 1.35)} fill={snow} opacity={0.92} /> : null}
    </G>
  );
}

// A seated grove: a low ground mound, a tall snow-capped foreground pine, fainter
// companions behind it, a shrub, grass strokes and a stone — trees grow out of
// ground, in tones that actually register against the page.
function PineCluster({ x, y, s, co, flip }: { x: number; y: number; s: number; co: Palette; flip: boolean }) {
  const dark = isDarkPalette(co);
  const main = dark ? co.faint : co.muted;   // real presence in both themes
  const back = co.faint;
  const snow = dark ? co.text : co.surface;
  const d = flip ? -1 : 1;
  return (
    <G>
      {/* ground mound: a gentle hill silhouette, flat-bottomed (not a shadow ellipse) */}
      <SvgPath
        d={`M ${x - 36 * s} ${y + 4} Q ${x - 18 * s} ${y - 7 * s} ${x + 2 * s} ${y - 3} T ${x + 36 * s} ${y + 4} Z`}
        fill={co.line2} opacity={dark ? 0.8 : 1}
      />
      <PineTree x={x + d * 16 * s} y={y - 1} h={31 * s} fill={back} lean={-d * 1.4} opacity={0.5} />
      <PineTree x={x - d * 13 * s} y={y + 1} h={22 * s} fill={back} lean={d * 1.1} opacity={0.38} />
      <PineTree x={x} y={y} h={48 * s} fill={main} snow={snow} lean={d * 1.8} opacity={dark ? 0.82 : 0.94} />
      <SvgPath
        d={`M ${x - d * 24 * s} ${y + 1} q ${d * 2 * s} ${-7 * s} ${d * 7 * s} ${-6 * s} q ${d * 5 * s} ${-4 * s} ${d * 9 * s} ${2 * s} q ${d * 4 * s} ${1 * s} ${d * 3 * s} ${4 * s} Z`}
        fill={back} opacity={0.55}
      />
      <SvgPath d={`M ${x + d * 25 * s} ${y + 1} q ${d * 2} -6 ${d * 5} -7`} stroke={co.faint} strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.7} />
      <SvgPath d={`M ${x + d * 30 * s} ${y + 1} q ${d * 1.5} -4 ${d * 4} -5`} stroke={co.faint} strokeWidth={1.2} fill="none" strokeLinecap="round" opacity={0.5} />
      <Ellipse cx={x - d * 29 * s} cy={y + 1} rx={3.8 * s} ry={2.4 * s} fill={co.faint} opacity={0.55} />
    </G>
  );
}

// A trailside cairn: three stacked stones + grass — the classic waymark hikers
// leave at a bend. Seats the path's empty switchbacks with an on-theme motif.
function Cairn({ x, y, co }: { x: number; y: number; co: Palette }) {
  return (
    <G>
      <SvgPath d={`M ${x - 15} ${y + 3.4} Q ${x} ${y - 1.5} ${x + 15} ${y + 3.4} Z`} fill={co.line2} opacity={0.9} />
      <Ellipse cx={x} cy={y} rx={6.6} ry={3.4} fill={co.faint} opacity={0.5} />
      <Ellipse cx={x + 0.6} cy={y - 5} rx={4.9} ry={2.9} fill={co.faint} opacity={0.68} />
      <Ellipse cx={x} cy={y - 9.4} rx={3.2} ry={2.2} fill={co.faint} opacity={0.85} />
      <SvgPath d={`M ${x - 11} ${y + 2} q 1.5 -6 4.5 -7`} stroke={co.faint} strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.6} />
      <SvgPath d={`M ${x + 10} ${y + 2.5} q 1 -4.5 3 -5.5`} stroke={co.faint} strokeWidth={1.2} fill="none" strokeLinecap="round" opacity={0.45} />
    </G>
  );
}

// ── Track landmarks ──────────────────────────────────────────────────────────
// ONE distant building per professional track, drawn as an ILLUSTRATION in the
// scenery's own vocabulary (not an icon): flat palette fills, no outlines, in
// the mid-ground warm-grey register (a step darker than the line2 flanks behind
// it, clearly LIGHTER than the foreground groves), seated on the flat valley
// floor at the base of the range with steps/plinth, a soft ground shadow, and —
// because it renders inside Alpine before the valley-fade band — the exact
// atmospheric dissolve the background mountains get. Scaled to read as distant:
// roughly the far treeline's height plus half again.
// The building's single accent (pediment / cross / crown) doubles as the quiet
// level milestone: normally a muted gold, it blooms grey → full gold right after
// the user crosses into a new level (`goldAnim`, driven by the justLeveled
// heuristic in the component; jumps straight to gold under Reduce Motion).

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Distant tonal register. Light theme: a faint warm-grey silhouette (the main
// peak's own register) that separates from the lighter line2 flanks. Dark theme:
// a faint LIGHT silhouette, exactly how the far treeline already reads there.
const distantTones = (co: Palette) => {
  const dark = isDarkPalette(co);
  return {
    body: co.faint,
    bodyOp: dark ? 0.5 : 0.8,
    detail: dark ? co.bg : co.surface,   // window/relief cutouts read INTO the silhouette
    detailOp: dark ? 0.6 : 0.55,
    sh: dark ? '#000000' : co.text,      // same shadow multiplier the peaks use
    shOp: dark ? 0.3 : 0.14,
  };
};

// Law: a distant courthouse — steps, colonnade, entablature, pediment. ~27s tall.
function Courthouse({ x, y, s, co, goldAnim }: { x: number; y: number; s: number; co: Palette; goldAnim: Animated.Value }) {
  const t = distantTones(co);
  const pedInner = `M ${x - 10 * s} ${y - 20.2 * s} L ${x} ${y - 25.4 * s} L ${x + 10 * s} ${y - 20.2 * s} Z`;
  return (
    <G opacity={t.bodyOp}>
      {/* soft ground shadow on the flat valley floor */}
      <Ellipse cx={x} cy={y + 0.6} rx={20 * s} ry={2.4 * s} fill={t.sh} opacity={t.shOp * 0.6} />
      {/* two shallow steps up to the plinth */}
      <Rect x={x - 18 * s} y={y - 2.6 * s} width={36 * s} height={2.8 * s} fill={t.body} />
      <Rect x={x - 15.5 * s} y={y - 5 * s} width={31 * s} height={2.6 * s} fill={t.body} />
      {/* colonnade: the page shows through between the four columns */}
      {[-11, -3.7, 3.7, 11].map((c) => (
        <Rect key={c} x={x + (c - 1.5) * s} y={y - 16 * s} width={3 * s} height={11.4 * s} fill={t.body} />
      ))}
      {/* entablature + soffit shadow seating the columns */}
      <Rect x={x - 14 * s} y={y - 19 * s} width={28 * s} height={3.2 * s} fill={t.body} />
      <Rect x={x - 14 * s} y={y - 15.9 * s} width={28 * s} height={1.1 * s} fill={t.sh} opacity={t.shOp * 0.7} />
      {/* pediment, with a lit/shadow split like the peaks */}
      <SvgPath d={`M ${x - 16 * s} ${y - 19 * s} L ${x} ${y - 27 * s} L ${x + 16 * s} ${y - 19 * s} Z`} fill={t.body} />
      <SvgPath d={`M ${x} ${y - 27 * s} L ${x + 16 * s} ${y - 19 * s} L ${x + 4.5 * s} ${y - 19 * s} Z`} fill={t.sh} opacity={t.shOp * 0.8} />
      {/* pediment accent: grey relief underlay + the gold milestone overlay */}
      <SvgPath d={pedInner} fill={t.detail} opacity={0.4} />
      <AnimatedG opacity={goldAnim}><SvgPath d={pedInner} fill={co.accent} /></AnimatedG>
    </G>
  );
}

// Healthcare: a distant clinic — plinth, low ward block, small tower, cross. ~26s tall.
function Clinic({ x, y, s, co, goldAnim }: { x: number; y: number; s: number; co: Palette; goldAnim: Animated.Value }) {
  const t = distantTones(co);
  return (
    <G opacity={t.bodyOp}>
      <Ellipse cx={x} cy={y + 0.6} rx={19 * s} ry={2.4 * s} fill={t.sh} opacity={t.shOp * 0.6} />
      <Rect x={x - 16 * s} y={y - 2.4 * s} width={32 * s} height={2.6 * s} fill={t.body} />
      {/* low ward block + a thin roof band */}
      <Rect x={x - 14 * s} y={y - 13 * s} width={28 * s} height={10.8 * s} fill={t.body} />
      <Rect x={x - 15 * s} y={y - 15 * s} width={30 * s} height={2.2 * s} fill={t.body} />
      {/* entrance tower */}
      <Rect x={x - 4.5 * s} y={y - 21.5 * s} width={9 * s} height={6.7 * s} fill={t.body} />
      {/* windows + door, cut into the silhouette */}
      <Rect x={x - 11 * s} y={y - 10.4 * s} width={4 * s} height={2 * s} fill={t.detail} opacity={t.detailOp} />
      <Rect x={x + 7 * s} y={y - 10.4 * s} width={4 * s} height={2 * s} fill={t.detail} opacity={t.detailOp} />
      <Rect x={x - 2 * s} y={y - 6.6 * s} width={4 * s} height={4.2 * s} fill={t.detail} opacity={t.detailOp} />
      {/* soffit shadow under the roof band */}
      <Rect x={x - 14 * s} y={y - 12.9 * s} width={28 * s} height={1 * s} fill={t.sh} opacity={t.shOp * 0.7} />
      {/* the cross on the tower: grey relief underlay + the gold milestone overlay */}
      <Rect x={x - 1.1 * s} y={y - 20.3 * s} width={2.2 * s} height={5 * s} fill={t.detail} opacity={0.4} />
      <Rect x={x - 2.5 * s} y={y - 18.9 * s} width={5 * s} height={2.2 * s} fill={t.detail} opacity={0.4} />
      <AnimatedG opacity={goldAnim}>
        <Rect x={x - 1.1 * s} y={y - 20.3 * s} width={2.2 * s} height={5 * s} fill={co.accent} />
        <Rect x={x - 2.5 * s} y={y - 18.9 * s} width={5 * s} height={2.2 * s} fill={co.accent} />
      </AnimatedG>
    </G>
  );
}

// Business: a distant three-tower skyline, one fainter tower behind. ~26s tall.
function Skyline({ x, y, s, co, goldAnim }: { x: number; y: number; s: number; co: Palette; goldAnim: Animated.Value }) {
  const t = distantTones(co);
  const win = (wx: number, wy: number, k: string) => (
    <Rect key={k} x={x + wx * s} y={y + wy * s} width={4 * s} height={1.4 * s} fill={t.detail} opacity={t.detailOp} />
  );
  return (
    <G opacity={t.bodyOp}>
      <Ellipse cx={x} cy={y + 0.6} rx={20 * s} ry={2.4 * s} fill={t.sh} opacity={t.shOp * 0.6} />
      <Rect x={x - 18 * s} y={y - 2 * s} width={37 * s} height={2.2 * s} fill={t.body} />
      {/* a fainter tower behind for depth */}
      <Rect x={x - 9 * s} y={y - 22 * s} width={8 * s} height={20 * s} fill={t.body} opacity={0.45} />
      <Rect x={x - 16 * s} y={y - 15 * s} width={9 * s} height={13 * s} fill={t.body} />
      <Rect x={x - 3.5 * s} y={y - 26 * s} width={10 * s} height={24 * s} fill={t.body} />
      <Rect x={x + 8 * s} y={y - 11.5 * s} width={8 * s} height={9.5 * s} fill={t.body} />
      {[win(-14, -12.5, 'a'), win(-14, -9, 'b'), win(-1, -22, 'c'), win(-1, -18.5, 'd'), win(-1, -15, 'e'), win(9.5, -9, 'f')]}
      {/* the tallest tower's crown: grey relief underlay + the gold milestone overlay */}
      <Rect x={x - 3.5 * s} y={y - 26 * s} width={10 * s} height={1.8 * s} fill={t.detail} opacity={0.4} />
      <AnimatedG opacity={goldAnim}>
        <Rect x={x - 3.5 * s} y={y - 26 * s} width={10 * s} height={1.8 * s} fill={co.accent} />
      </AnimatedG>
    </G>
  );
}

type LandmarkKind = 'med' | 'law' | 'biz';
function Landmark({ kind, x, y, s, co, goldAnim }: {
  kind: LandmarkKind; x: number; y: number; s: number; co: Palette; goldAnim: Animated.Value;
}) {
  if (kind === 'law') return <Courthouse x={x} y={y} s={s} co={co} goldAnim={goldAnim} />;
  if (kind === 'med') return <Clinic x={x} y={y} s={s} co={co} goldAnim={goldAnim} />;
  return <Skyline x={x} y={y} s={s} co={co} goldAnim={goldAnim} />;
}

// The sky + full mountain range above the summit. Painter's order: sun glow,
// clouds, birds, far jagged ridge, mist, flanking peaks, the two-tone main peak
// with its snow cap + gold summit pennant, then the rolling foothill band with a
// distant treeline dissolving into the page.
// `children` render on the valley floor between the foothill bands and the final
// fade band — the slot the track landmark uses so it inherits the same
// atmospheric dissolve the mountain feet get. `clearAt` (fraction of w) thins the
// far treeline around that spot so no tree overlaps the building.
function Alpine({ co, w, mBase, clearAt, children }: {
  co: Palette; w: number; mBase: number; clearAt?: number; children?: React.ReactNode;
}) {
  const dark = isDarkPalette(co);
  const snow = dark ? co.text : co.surface;
  const sh = dark ? '#000000' : co.text;               // shadow multiplier, low opacity only
  const shOp = dark ? 0.3 : 0.14;
  const cloud = dark ? co.text : co.line2;
  const treeFar = dark ? co.faint : co.muted;
  const yB = mBase + 2;
  const sx = w * 0.8, sy = 30;                         // low sun
  const ax = w * 0.55, ay = yB - 88;                   // main summit apex
  const bx = w * 0.2, by = yB - 64;                    // left peak apex
  const cx2 = w * 0.88, cy2 = yB - 50;                 // right peak apex

  return (
    <G>
      <Defs>
        <RadialGradient id="jSun" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={co.accent} stopOpacity={0.28} />
          <Stop offset="55%" stopColor={co.accent} stopOpacity={0.1} />
          <Stop offset="100%" stopColor={co.accent} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="jMist" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={co.bg} stopOpacity={0} />
          <Stop offset="100%" stopColor={co.bg} stopOpacity={0.55} />
        </LinearGradient>
        <LinearGradient id="jFade" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={co.bg} stopOpacity={0} />
          <Stop offset="70%" stopColor={co.bg} stopOpacity={0.9} />
          <Stop offset="100%" stopColor={co.bg} stopOpacity={1} />
        </LinearGradient>
      </Defs>

      {/* Sun: soft glow, a quiet disc, one thin hand-broken halo arc */}
      <Circle cx={sx} cy={sy} r={34} fill="url(#jSun)" />
      <Circle cx={sx} cy={sy} r={17.5} stroke={co.accent} strokeWidth={1} fill="none" opacity={0.22} strokeDasharray="82 28" strokeLinecap="round" />
      <Circle cx={sx} cy={sy} r={11.5} fill={co.accent} opacity={0.42} />

      {/* Slender line-clouds */}
      <G opacity={dark ? 0.12 : 0.85}>
        <SvgPath d={`M ${w * 0.09} 22 h 32`} stroke={cloud} strokeWidth={5} strokeLinecap="round" />
        <SvgPath d={`M ${w * 0.15} 31 h 15`} stroke={cloud} strokeWidth={4} strokeLinecap="round" opacity={0.7} />
        <SvgPath d={`M ${w * 0.62} 14 h 22`} stroke={cloud} strokeWidth={4.5} strokeLinecap="round" opacity={0.8} />
      </G>

      {/* Birds */}
      <SvgPath d={`M ${w * 0.34} 36 q 3.5 -4.5 7 0 q 3.5 -4.5 7 0`} stroke={co.faint} strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.75} />
      <SvgPath d={`M ${w * 0.43} 27 q 2.8 -3.6 5.6 0 q 2.8 -3.6 5.6 0`} stroke={co.faint} strokeWidth={1.2} fill="none" strokeLinecap="round" opacity={0.5} />

      {/* Far ridge: jagged hand-cut silhouette, held back by the mist band */}
      <SvgPath
        d={`M -4 ${yB} L -4 ${yB - 26} L ${w * 0.08} ${yB - 48} L ${w * 0.15} ${yB - 30} L ${w * 0.22} ${yB - 40} L ${w * 0.3} ${yB - 24} L ${w * 0.38} ${yB - 56} L ${w * 0.47} ${yB - 30} L ${w * 0.52} ${yB - 36} L ${w * 0.6} ${yB - 22} L ${w * 0.7} ${yB - 50} L ${w * 0.78} ${yB - 30} L ${w * 0.86} ${yB - 44} L ${w * 0.95} ${yB - 24} L ${w + 4} ${yB - 34} L ${w + 4} ${yB} Z`}
        fill={co.line2} opacity={0.7}
      />
      <Rect x={0} y={yB - 30} width={w} height={31} fill="url(#jMist)" />

      {/* Left peak: two-tone with a small cap */}
      <G>
        <SvgPath d={`M ${w * 0.02} ${yB} L ${w * 0.13} ${yB - 38} L ${w * 0.165} ${yB - 32} L ${bx} ${by} L ${w * 0.27} ${yB - 30} L ${w * 0.38} ${yB} Z`} fill={co.line2} opacity={0.9} />
        <SvgPath d={`M ${bx} ${by} L ${w * 0.27} ${yB - 30} L ${w * 0.38} ${yB} L ${w * 0.26} ${yB} Q ${w * 0.225} ${by + 34} ${bx} ${by} Z`} fill={sh} opacity={shOp * 0.7} />
        <SvgPath d={`M ${bx - 8} ${by + 12} L ${bx} ${by + 1} L ${bx + 8} ${by + 12} L ${bx + 5} ${by + 9} L ${bx + 2} ${by + 14} L ${bx - 2} ${by + 9} L ${bx - 5} ${by + 13} Z`} fill={snow} opacity={dark ? 0.75 : 0.95} />
      </G>

      {/* Right peak */}
      <G>
        <SvgPath d={`M ${w * 0.7} ${yB} L ${w * 0.79} ${yB - 30} L ${w * 0.83} ${yB - 24} L ${cx2} ${cy2} L ${w * 0.95} ${yB - 26} L ${w + 6} ${yB - 6} L ${w + 6} ${yB} Z`} fill={co.line2} opacity={0.9} />
        <SvgPath d={`M ${cx2} ${cy2} L ${w * 0.95} ${yB - 26} L ${w + 6} ${yB - 6} L ${w + 6} ${yB} L ${w * 0.94} ${yB} Q ${w * 0.9} ${cy2 + 26} ${cx2} ${cy2} Z`} fill={sh} opacity={shOp * 0.7} />
        <SvgPath d={`M ${cx2 - 6} ${cy2 + 9} L ${cx2} ${cy2 + 1} L ${cx2 + 6} ${cy2 + 9} L ${cx2 + 3} ${cy2 + 7} L ${cx2} ${cy2 + 11} L ${cx2 - 3} ${cy2 + 7} Z`} fill={snow} opacity={dark ? 0.6 : 0.85} />
      </G>

      {/* Main peak: lit face, shadow face, ridge lines, irregular snow cap, pennant */}
      <G>
        <SvgPath d={`M ${w * 0.3} ${yB} L ${w * 0.385} ${yB - 34} L ${w * 0.425} ${yB - 27} L ${ax} ${ay} L ${w * 0.645} ${yB - 44} L ${w * 0.685} ${yB - 52} L ${w * 0.82} ${yB} Z`} fill={dark ? co.line2 : co.faint} opacity={dark ? 1 : 0.75} />
        <SvgPath d={`M ${ax} ${ay} L ${w * 0.645} ${yB - 44} L ${w * 0.685} ${yB - 52} L ${w * 0.82} ${yB} L ${w * 0.62} ${yB} Q ${w * 0.585} ${yB - 44} ${ax} ${ay} Z`} fill={sh} opacity={shOp} />
        <SvgPath d={`M ${ax - 3} ${ay + 24} q -5 22 -11 38`} stroke={sh} strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={shOp * 0.9} />
        <SvgPath d={`M ${ax + 2} ${ay + 28} q 4 24 10 42`} stroke={sh} strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={shOp * 0.9} />
        <SvgPath d={`M ${ax - 12} ${ay + 19} L ${ax} ${ay + 1} L ${ax + 11} ${ay + 17} L ${ax + 7} ${ay + 13} L ${ax + 4} ${ay + 20} L ${ax} ${ay + 13} L ${ax - 4} ${ay + 21} L ${ax - 8} ${ay + 14} Z`} fill={snow} opacity={dark ? 0.85 : 1} />
        <SvgPath d={`M ${ax} ${ay + 1} L ${ax + 11} ${ay + 17} L ${ax + 7} ${ay + 13} L ${ax + 4} ${ay + 20} L ${ax} ${ay + 13} Z`} fill={sh} opacity={shOp * 0.5} />
        <SvgPath d={`M ${ax} ${ay} v -12`} stroke={co.accent} strokeWidth={2} strokeLinecap="round" />
        <SvgPath d={`M ${ax} ${ay - 12} l 11 3.6 l -11 3.6 Z`} fill={co.accent} />
      </G>

      {/* Rolling foothill bands + a distant treeline ground the range, then the
          whole foot dissolves into the page */}
      <SvgPath
        d={`M -4 ${yB} Q ${w * 0.12} ${yB - 14} ${w * 0.3} ${yB - 8} Q ${w * 0.5} ${yB - 2} ${w * 0.62} ${yB - 9} Q ${w * 0.78} ${yB - 16} ${w + 4} ${yB - 6} L ${w + 4} ${yB + 12} L -4 ${yB + 12} Z`}
        fill={co.line2} opacity={0.75}
      />
      {[0.07, 0.16, 0.27, 0.63, 0.74, 0.92]
        .filter((f) => clearAt === undefined || Math.abs(f - clearAt) > 0.09)
        .map((f, i) => (
          <PineTree key={i} x={w * f} y={yB + 4} h={12 + (i % 3) * 3.5} fill={treeFar} lean={i % 2 ? 1 : -1} opacity={0.32} />
        ))}
      <SvgPath
        d={`M -4 ${yB + 4} Q ${w * 0.2} ${yB - 3} ${w * 0.44} ${yB + 3} Q ${w * 0.7} ${yB + 8} ${w + 4} ${yB} L ${w + 4} ${yB + 12} L -4 ${yB + 12} Z`}
        fill={co.line2} opacity={0.4}
      />
      {children}
      <Rect x={-4} y={yB - 10} width={w + 8} height={24} fill="url(#jFade)" />
    </G>
  );
}

type Day = { date: string; done: boolean; preSignup: boolean };

// The Journey path: THIS WEEK as a climb, Monday at the base → Sunday at the summit, fit to one
// screen (no scroll). Every day — today included — is the same waymark medallion: a serif day
// letter on a disc. Five distinct states: COMPLETED (gold fill + check badge + halo), MISSED
// (quiet disc with a thin stroke ring, slightly dimmed), TODAY (gold, spotlight + double halo +
// a Start pill above it; tap → daily test), FUTURE (dimmed disc, no badge), and INACTIVE — days
// of this week that fall BEFORE the user's signup day (vorto.signupDate). The user wasn't here
// yet, so those days render lighter than future (heaviest dim, faint letter), carry no stroke
// ring, aren't tappable, and never count as missed. Past stops (done or missed) are tappable:
// no per-day word history exists, so they open the same daily-test review of due/missed words.
// FUTURE and INACTIVE stops are locked. Gold stitched footsteps connect ONLY consecutive
// completed stops; every other stretch of trail stays the faint quiet dashes.
export default function JourneyPath({ co }: { co: Palette }) {
  const router = useRouter();
  // The user's track (the same field state that drives "Premium · Law" on Profile and the
  // Practice areas). Changing it in Personalize updates this live app state, so the scenery
  // follows the next time the screen renders.
  const { field } = useField();
  const [week, setWeek] = useState<Day[] | null>(null);
  const [signup, setSignup] = useState<string | null>(null);
  const [doneToday, setDoneToday] = useState(false);
  // ADVANCED reads from the SAME daily-test state the result screen uses (state.mastered): all 10
  // cleared, whether on the first pass or by drilling the misses to zero. Keeps the path node and
  // the test result in lockstep — a finished-but-not-mastered day reads "Done", a mastered day
  // reads "Advanced", never a raw score count that contradicts "finished".
  const [masteredToday, setMasteredToday] = useState(false);
  // Words still to clear in today's fix phase (learn-then-check model): a completed-but-not-
  // mastered day is mid-session, not finished — the node reads "N left" and resumes, keeping
  // the path in lockstep with the daily test's own resume screen (same dailyLeftToClear state).
  const [leftToday, setLeftToday] = useState(0);
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  // Reduce Motion: freezes the island breath/bob, the outer-ring pulse and the
  // landmark's level-up gold bloom (which then applies instantly instead).
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduceMotion(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduceMotion(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);

  // Gentle breathing pulse for today's island (scale) + a bob for the Start pill.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) { pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  // A slower, softer pulse for TODAY's outer halo ring — only while today's test
  // is still open (static once done, and under Reduce Motion). SVG props can't
  // ride the native driver, hence useNativeDriver: false.
  const ringPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion || doneToday) { ringPulse.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(ringPulse, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(ringPulse, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [ringPulse, reduceMotion, doneToday]);

  // The landmark's milestone accent: rests at a subtle muted gold; right after a
  // level-up (justLeveled) it blooms grey → full gold once. Reduce Motion skips
  // the bloom and lands on gold directly.
  const goldAnim = useRef(new Animated.Value(0.45)).current;
  const justLeveled = !!plan && plan.levelIndex > 0 && plan.progress <= 0.06;
  useEffect(() => {
    if (!plan) return;
    if (justLeveled) {
      if (reduceMotion) { goldAnim.setValue(1); return; }
      goldAnim.setValue(0);
      Animated.timing(goldAnim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }).start();
    } else {
      goldAnim.setValue(0.45);
    }
  }, [goldAnim, plan, justLeveled, reduceMotion]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      const streak = await getDailyTestStreak();
      // Signup-aware week: days before the user's first launch come back preSignup so a
      // brand-new user never sees the earlier part of the week graded as "missed".
      const su = await getSignupDate();
      const w = weekProgress(streak, su);        // Mon..Sun
      const st = await peekDailyTest();
      const known = await getWordsKnownCount();
      if (!alive) return;
      setWeek(w);
      setSignup(su);
      setDoneToday(!!st && st.date === todayStr() && st.completed);
      setMasteredToday(!!st && st.date === todayStr() && !!st.mastered);
      setLeftToday(st && st.date === todayStr() && st.completed && !st.mastered ? dailyLeftToClear(st).length : 0);
      setPlan(computePlan(known));
    })().catch(() => {});
    return () => { alive = false; };
  }, []));

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b && b.w === width && b.h === height ? b : { w: width, h: height }));
  }, []);

  if (!week || !plan) return null;
  const s = makeStyles(co);
  const today = todayStr();
  const todayIdx = Math.max(0, week.findIndex((d) => d.date === today));
  const doneCount = week.filter((d, i) => d.done || (i === todayIdx && doneToday)).length;

  // Base-camp caption. A user who signed up mid-week is only graded on the days they were
  // actually here: signup day itself reads "Your week starts today"; from day 2 on it counts
  // done days against the days elapsed SINCE signup this week (joined Friday, today Sunday →
  // "1 of 3 days"). Anyone whose signup predates this week keeps the full "N of 7 days".
  let caption = `${doneCount} of 7 days`;
  if (signup && signup >= week[0].date) {
    const signupIdx = week.findIndex((d) => d.date === signup);
    const sinceSignup = signupIdx >= 0 ? todayIdx - signupIdx + 1 : todayIdx + 1;
    // Restored/migrated installs can carry completed days from BEFORE the stored signup day
    // ("done wins" over preSignup in weekProgress, so those days stay gold) — the elapsed
    // window must never read smaller than the done count ("4 of 2 days" is nonsense). Clamp
    // it up to the done count, and both stay within the 7-day week.
    const elapsed = Math.min(7, Math.max(sinceSignup, doneCount));
    if (signup === today && doneCount <= (doneToday ? 1 : 0)) {
      caption = 'Your week starts today';
    } else {
      caption = `${doneCount} of ${elapsed} day${elapsed === 1 ? '' : 's'}`;
    }
  }

  // ── Geometry: spread 7 stops bottom-up across the measured area ──
  let body: React.ReactNode = null;
  if (box) {
    const { w, h } = box;
    const cx = w / 2;
    const AMP = Math.min(76, w / 2 - ISLAND_W / 2 - 14);

    // Weighted vertical rhythm: the gap directly above TODAY reserves the full
    // hero-stack height (bubble + figure) so no stop ever hides behind him; the
    // other gaps share the remaining height evenly. If today IS Sunday there is
    // no gap above — reserve extra top padding for the stack instead.
    const gaps: number[] = [];
    for (let g = 0; g < 6; g++) gaps.push(g === todayIdx ? HERO_CLEAR : GAP_MIN);
    const effTop = TOP_PAD + (todayIdx === 6 ? 52 : 0);
    const need = gaps.reduce((a, b) => a + b, 0);
    const avail = h - effTop - BOTTOM_PAD - NODE;
    if (avail > need) {
      const extra = (avail - need) / 6;
      for (let g = 0; g < 6; g++) gaps[g] += extra;
    } else if (avail > 0) {
      const k = avail / need;
      for (let g = 0; g < 6; g++) gaps[g] *= k;
    }
    const tops: number[] = new Array(7);
    tops[6] = effTop;
    for (let i = 5; i >= 0; i--) tops[i] = tops[i + 1] + gaps[i];

    const yOf = (i: number) => tops[i];                       // node TOP; 0=Mon(bottom)..6=Sun(top)
    const xOf = (i: number) => cx + SWEEP[i] * AMP;           // placed switchbacks
    const pt = (i: number) => ({ x: xOf(i), y: yOf(i) + NODE / 2 });

    const mBase = tops[6] + 16;          // mountain baseline, just above the summit stop
    const baseY = yOf(0) + NODE - 2;     // base-camp ground line beside Monday

    // Today's stop, clamped so the hero stack (bubble is wider than the node) stays on screen.
    const tIx = Math.max(ISLAND_W / 2 + 4, Math.min(w - ISLAND_W / 2 - 4, xOf(todayIdx)));
    const tCy = yOf(todayIdx) + NODE / 2;
    const ptT = (i: number) => (i === todayIdx ? { x: tIx, y: tCy } : pt(i));

    // Day-state helper: a past day is done per the streak record; today counts once the
    // daily test is completed; future days are never done.
    const isDone = (i: number) =>
      i < todayIdx ? week[i].done : i === todayIdx ? (doneToday || week[i].done) : false;

    // The trail, ONE SEGMENT PER DAY-PAIR so each stretch can carry its own state:
    // gold stitched footsteps ONLY between two consecutive completed stops, the faint
    // quiet dashes everywhere else (missed or future never earn gold). The segment
    // leaving TODAY arcs around the figure (a straight climb out of the node centre
    // would run through his chest), then the switchbacks resume as normal.
    const segs: string[] = [];
    for (let i = 0; i < 6; i++) {
      if (i === todayIdx) {
        const nxt = pt(i + 1);
        const dir = nxt.x >= tIx ? 1 : -1;
        // Start INSIDE the disc (15,17 from centre ≈ r21 < 23) so the trail bed
        // emerges from under the node — no floating stub where segment meets stop.
        const sx0 = tIx + dir * (NODE / 2 - 8);
        const sy0 = tCy - NODE / 2 + 6;
        segs.push(`M ${sx0} ${sy0} C ${sx0 + dir * 56} ${sy0 - (sy0 - nxt.y) * 0.4} ${nxt.x} ${(sy0 + nxt.y) / 2} ${nxt.x} ${nxt.y}`);
      } else {
        const a = ptT(i), b = ptT(i + 1);
        const my = (a.y + b.y) / 2;
        segs.push(`M ${a.x} ${a.y} C ${a.x} ${my} ${b.x} ${my} ${b.x} ${b.y}`);
      }
    }

    // ── Track landmark: exactly ONE, and only for a professional track ──
    // med/law/biz get one distant courthouse/clinic/skyline; gen (and the 'new'
    // field) keep the pure alpine scenery. The landmark renders INSIDE Alpine on
    // the flat valley floor at the base of the range (the same ground line the
    // far treeline stands on, on the side away from the sun), so it inherits the
    // valley's atmospheric fade. It doubles as the level milestone: freshly
    // leveled (progress just above 0) blooms its accent to gold (goldAnim).
    const lmKind: LandmarkKind | null = field === 'med' || field === 'law' || field === 'biz' ? field : null;
    const LM_X = 0.17; // fraction of w — left valley, opposite the low sun

    // The Start/word bubble sits above-LEFT of today's node by preference, so it
    // can never collide with the trail arcing out of the node's top (that exit
    // always bends TOWARD the next stop). If the next stop is on the left — or
    // the left gutter is too tight for the bubble — it flips to above-right.
    let bubbleSide: -1 | 1 = -1; // -1 = above-left of the node, 1 = above-right
    if (todayIdx < 6 && pt(todayIdx + 1).x < tIx) bubbleSide = 1;
    if (bubbleSide === -1 && tIx - BUBBLE_REACH < 6) bubbleSide = 1;
    if (bubbleSide === 1 && tIx + BUBBLE_REACH > w - 6) bubbleSide = -1;

    body = (
      <>
        <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Alpine co={co} w={w} mBase={mBase} clearAt={lmKind ? LM_X : undefined}>
            {lmKind ? (
              <Landmark kind={lmKind} x={w * LM_X} y={mBase + 6} s={0.95} co={co} goldAnim={goldAnim} />
            ) : null}
          </Alpine>

          {/* Groves + cairns — each opposite the trail's sweep on its row, rows
              chosen so scenery alternates sides down the page and no two identical
              elements sit adjacent; cluster sizes vary so no grove repeats. With a
              track landmark on screen the second grove is smaller and the counts
              stay lean so the distant building reads as the focal point. */}
          {lmKind ? (
            <>
              <PineCluster x={xOf(5) > cx ? 36 : w - 36} y={yOf(5) + NODE + 8} s={0.9} co={co} flip={xOf(5) <= cx} />
              <PineCluster x={xOf(2) > cx ? 38 : w - 38} y={yOf(2) + NODE + 10} s={1.15} co={co} flip={xOf(2) <= cx} />
              <Cairn x={xOf(3) > cx ? 32 : w - 32} y={yOf(3) + NODE + 4} co={co} />
              <Cairn x={xOf(4) > cx ? 30 : w - 30} y={yOf(4) + NODE + 2} co={co} />
            </>
          ) : (
            <>
              <PineCluster x={xOf(5) > cx ? 34 : w - 34} y={yOf(5) + NODE + 8} s={0.85} co={co} flip={xOf(5) <= cx} />
              <PineCluster x={xOf(2) > cx ? 38 : w - 38} y={yOf(2) + NODE + 10} s={1.15} co={co} flip={xOf(2) <= cx} />
              <PineCluster x={xOf(1) > cx ? 34 : w - 34} y={yOf(1) + NODE + 6} s={1.0} co={co} flip={xOf(1) <= cx} />
              <Cairn x={xOf(3) > cx ? 32 : w - 32} y={yOf(3) + NODE + 4} co={co} />
              <Cairn x={xOf(4) > cx ? 30 : w - 30} y={yOf(4) + NODE + 2} co={co} />
            </>
          )}

          {/* Base camp beside Monday: shrubs, grass and a cairn */}
          <G>
            <SvgPath d={`M ${cx - 84} ${baseY} q 2 -9 9 -8 q 4 -5 8 -1 q 5 0 5 5 q 2 2 1 4 Z`} fill={co.faint} opacity={0.6} />
            <SvgPath d={`M ${cx - 66} ${baseY} q 2 -6 6 -6 q 4 -2 7 2 q 3 2 2 4 Z`} fill={co.faint} opacity={0.45} />
            <SvgPath d={`M ${cx - 46} ${baseY} q 1.5 -6 4.5 -7`} stroke={co.faint} strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.65} />
            <SvgPath d={`M ${cx - 41} ${baseY + 1} q 1 -4 3 -5`} stroke={co.faint} strokeWidth={1.2} fill="none" strokeLinecap="round" opacity={0.45} />
            <Ellipse cx={cx + 66} cy={baseY - 1} rx={6} ry={3.2} fill={co.faint} opacity={0.5} />
            <Ellipse cx={cx + 66.6} cy={baseY - 6} rx={4.6} ry={2.8} fill={co.faint} opacity={0.65} />
            <Ellipse cx={cx + 66} cy={baseY - 10.5} rx={3.2} ry={2.3} fill={co.faint} opacity={0.8} />
            <SvgPath d={`M ${cx + 78} ${baseY} q 1.5 -6 4.5 -7`} stroke={co.faint} strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.6} />
            <Ellipse cx={cx + 88} cy={baseY - 1} rx={3.2} ry={2} fill={co.faint} opacity={0.5} />
          </G>

          {/* A soft warm spotlight behind today's stop so the hero moment owns the scene —
              TODAY is the focal anchor of the whole path */}
          <Circle cx={tIx} cy={tCy - 36} r={92} fill="url(#jSun)" opacity={0.6} />

          {/* The trail: a carved bed under the whole route, then per-segment dashes —
              gold ONLY where both ends are completed, faint/quiet everywhere else */}
          {segs.map((d, i) => (
            <SvgPath key={`bed${i}`} d={d} stroke={co.line2} strokeWidth={10} strokeLinecap="round" fill="none" opacity={0.5} />
          ))}
          {segs.map((d, i) => (isDone(i) && isDone(i + 1))
            ? <SvgPath key={`gold${i}`} d={d} stroke={co.accent} strokeWidth={4} strokeDasharray="9 8" strokeLinecap="round" fill="none" opacity={0.92} />
            : <SvgPath key={`quiet${i}`} d={d} stroke={co.faint} strokeWidth={3} strokeDasharray="7 9" strokeLinecap="round" fill="none" opacity={0.55} />)}

          {/* Halo rings on completed stops — the medallion motif */}
          {week.map((d, i) => (i !== todayIdx && d.done)
            ? <Circle key={d.date} cx={xOf(i)} cy={yOf(i) + NODE / 2} r={NODE / 2 + 5.5} stroke={co.accent} strokeWidth={1.4} fill="none" opacity={0.5} />
            : null)}
          {/* Today: a double halo marks the focal stop. The OUTER ring alone
              breathes slowly while today's test is still open — static once done,
              and whenever Reduce Motion is on. */}
          <Circle cx={tIx} cy={tCy} r={NODE / 2 + 6} stroke={co.accent} strokeWidth={1.5} fill="none" opacity={0.6} />
          {!doneToday && !reduceMotion ? (
            <AnimatedCircle
              cx={tIx} cy={tCy}
              r={ringPulse.interpolate({ inputRange: [0, 1], outputRange: [NODE / 2 + 11.5, NODE / 2 + 14.5] })}
              opacity={ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.24, 0.5] })}
              stroke={co.accent} strokeWidth={1.1} fill="none"
            />
          ) : (
            <Circle cx={tIx} cy={tCy} r={NODE / 2 + 11.5} stroke={co.accent} strokeWidth={1.1} fill="none" opacity={0.28} />
          )}
        </Svg>

        {week.map((day, i) => {
          const dayIdx = new Date(`${day.date}T00:00:00`).getDay();
          const letter = DAY_LETTER[dayIdx];
          const dayName = DAY_NAME[dayIdx];
          const isToday = i === todayIdx;
          const x = xOf(i), y = yOf(i);
          const delay = i * 55;

          if (isToday) {
            // Hero stop: SAME circle-with-letter as every other day — state (gold fill,
            // halo, spotlight), not shape, says "today". The action signal — a gold
            // Start pill (gently bobbing) while the test is open, or the quiet
            // "N words" datum once done — sits above the node but OFFSET to the side
            // away from the trail (bubbleSide), its tail still aimed at the node
            // centre, so it never lies across the path coming down from the next stop.
            const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
            const bob = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -2.5] });
            const anchor = bubbleSide === 1
              ? { left: WRAP_W / 2 - TAIL_REACH, alignItems: 'flex-start' as const }
              : { right: WRAP_W / 2 - TAIL_REACH, alignItems: 'flex-end' as const };
            const tailShift = bubbleSide === 1 ? { marginLeft: TAIL_INSET } : { marginRight: TAIL_INSET };
            // Learn-then-check model: a completed-but-not-mastered day is mid-fix-phase, so the
            // node says what's actually left ("N left to clear") and taps back into the session.
            const doneLabel = masteredToday ? 'Advanced' : leftToday > 0 ? `${leftToday} left` : 'Done';
            const a11yToday = doneToday
              ? (masteredToday || leftToday === 0
                ? `${dayName}, today, ${masteredToday ? 'advanced' : 'done'}. Review today's test`
                : `${dayName}, today, ${leftToday} left to clear. Resumes today's session`)
              : `${dayName}, today, not yet completed. Starts today's test`;
            return (
              <FadeIn key={day.date} delay={delay} style={[s.islandWrap, { left: tIx - WRAP_W / 2, top: y - STACK_H }]}>
                <PressBounce
                  accessibilityLabel={a11yToday}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    playSfx('tick');
                    router.push('/daily-test' as any);
                  }}
                >
                  <Animated.View style={{ alignItems: 'center', transform: [{ scale }] }}>
                    <View style={s.stack}>
                      <View style={[s.bubbleAnchor, anchor]}>
                        {doneToday ? (
                          // Finished today: a plain status word ("Done", or "Advanced" once every
                          // word is cleared) — NOT a raw "N words" count, which read like an
                          // in-progress score on an already-finished stop. Matches the test result.
                          <>
                            <View style={s.bubble}>
                              <Text style={s.bubbleText}>{doneLabel}</Text>
                              {/* Day fully cleared → say when tomorrow's words unlock (local
                                  midnight). A mid-fix "N left" day isn't done, so no countdown. */}
                              {(masteredToday || leftToday === 0) && <UnlockCountdown style={s.bubbleNext} />}
                            </View>
                            <View style={[s.bubbleTail, tailShift]} />
                          </>
                        ) : (
                          <Animated.View style={{ alignItems: anchor.alignItems, transform: [{ translateY: bob }] }}>
                            <View style={s.startPill}>
                              <Svg width={9} height={11} viewBox="0 0 9 11">
                                <SvgPath d="M1.2 1 L8 5.5 L1.2 10 Z" fill={co.ink} />
                              </Svg>
                              <Text style={s.startText}>Start</Text>
                            </View>
                            <View style={[s.startTail, tailShift]} />
                          </Animated.View>
                        )}
                      </View>
                    </View>
                    <View style={[s.node, { backgroundColor: co.accent }]}>
                      <Text style={[s.nodeLetter, { color: co.ink }]}>{letter}</Text>
                      {doneToday && (
                        <View style={s.badge}>
                          <Check c={co.accent} size={11} />
                        </View>
                      )}
                    </View>
                  </Animated.View>
                </PressBounce>
              </FadeIn>
            );
          }

          const isPast = i < todayIdx;
          const done = day.done;
          // INACTIVE = a past day from before the user signed up: not their miss, not their
          // week yet. Distinct from MISSED (post-signup, skipped) and from FUTURE.
          const inactive = isPast && day.preSignup;
          const missed = isPast && !done && !inactive;
          const future = i > todayIdx;
          // Day-letter color: gold-filled done discs keep ink; muted discs use a
          // darker register than the old `faint` so the letter still clears WCAG
          // AA (large text) AFTER the wrapper's dimming opacity composites it
          // toward the disc fill — text for future (heaviest dim), muted for missed.
          // Inactive days are deliberately the lightest register on the path (faint letter
          // + the heaviest wrapper dim below): they carry no information or action.
          const letterColor = done ? co.ink : missed ? co.muted : inactive ? co.faint : co.text;
          const medallion = (
            <View style={[s.node, { backgroundColor: done ? co.accent : co.surface2 }]}>
              {missed && (
                // The "missed" outline: a thin SVG stroke ring on a faint fill (house
                // rule — no View borderWidth on circles).
                <Svg width={NODE} height={NODE} style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Circle cx={NODE / 2} cy={NODE / 2} r={NODE / 2 - 1} stroke={co.faint} strokeWidth={1.2} fill="none" opacity={0.7} />
                </Svg>
              )}
              <Text style={[s.nodeLetter, { color: letterColor }]}>{letter}</Text>
              {done && (
                <View style={s.badge}>
                  <Check c={co.accent} size={11} />
                </View>
              )}
            </View>
          );
          return (
            <FadeIn key={day.date} delay={delay} style={[s.nodeWrap, { left: x - NODE / 2, top: y, opacity: missed ? 0.8 : inactive ? 0.32 : future ? 0.55 : 1 }]}>
              {isPast && !inactive ? (
                // Past stops (done or missed) open a review of due/missed words. There is
                // no per-day word history, so this is the general daily-test review, not
                // that exact day's ten. FUTURE and pre-signup INACTIVE stops stay locked
                // (plain View, no press).
                <PressBounce
                  accessibilityLabel={done ? `${dayName}, completed. Review your words` : `${dayName}, missed. Review your words`}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    playSfx('tick');
                    router.push('/daily-test' as any);
                  }}
                >
                  {medallion}
                </PressBounce>
              ) : (
                <View accessible accessibilityLabel={inactive ? `${dayName}, before you joined` : `${dayName}, upcoming`}>{medallion}</View>
              )}
            </FadeIn>
          );
        })}

        {/* The day count lives WITH the path (a base-camp caption), not next to the
            level progress bar — the two track different things. */}
        <Text style={s.pathCount}>{caption}</Text>
      </>
    );
  }

  return (
    <View style={s.wrap}>
      <FadeIn>
        <Text style={[label, { color: co.accent }]}>Your journey</Text>
        <Text style={s.title}>This week</Text>
        {/* The bar + its label are one tight group: they track the LEVEL metric (words
            toward the next level). The week's day count lives down by the path itself. */}
        <Text style={s.sub}>Level {plan.levelIndex + 1} · {plan.levelTitle}</Text>
        <View style={s.bar}>
          {/* No minimum sliver: 0 progress renders a genuinely empty bar. */}
          <View style={[s.barFill, { width: `${Math.round(plan.progress * 100)}%` }]} />
        </View>
        {/* Numerator/denominator MUST use the same WITHIN-LEVEL basis as the bar above
            (bar width = plan.progress = inLevel / span). Printing mastered/levelTarget here
            (all-time cumulative) read ~66% while the bar showed ~23% — same data, two bases.
            inLevel of the level's span keeps label and bar in agreement and resets each level. */}
        <Text style={s.barLabel}>
          {plan.maxed
            ? `${plan.mastered} words mastered · top level`
            : `${plan.inLevel} of ${plan.levelTarget - plan.levelStart} words toward Level ${plan.levelIndex + 2}`}
        </Text>
      </FadeIn>
      <View style={s.world} onLayout={onLayout}>{body}</View>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  wrap: { flex: 1 },
  title: { fontFamily: fonts.serif, fontSize: 26, color: co.text, marginTop: 8 },
  sub: { fontFamily: fonts.sans, fontSize: 13.5, color: co.muted, marginTop: 3 },
  bar: { height: 5, borderRadius: 3, backgroundColor: co.surface2, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3, backgroundColor: co.accent },
  barLabel: { fontFamily: fonts.sans, fontSize: 11.5, color: co.faint, marginTop: 6 },
  world: { flex: 1, marginTop: 6, overflow: 'hidden' },

  nodeWrap: { position: 'absolute', width: NODE, height: NODE },
  // Waymark medallion: a stone/gold disc carrying a serif day letter, with a tiny
  // check badge pinned to its shoulder once done.
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  // The week's day count, seated at base camp with the path it describes.
  // bottom: 10 + BOTTOM_PAD(46) of node clearance keep it off Monday, off the
  // home indicator, and clear of a future tab bar (see BOTTOM_PAD note).
  pathCount: { position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center',
    fontFamily: fonts.sansSemi, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: co.accent },
  nodeLetter: { fontFamily: fonts.serif, fontSize: 19, marginTop: -1 },
  badge: { position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9,
    backgroundColor: co.surface, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 4 },

  // Wider than the geometry island so the side-offset bubble stays inside the
  // press target (taps outside a parent's bounds don't register on iOS). Safe to
  // widen: the only view it can overlap is the locked FUTURE stop above.
  islandWrap: { position: 'absolute', width: WRAP_W, alignItems: 'center', zIndex: 3 },
  // Fixed-height stack above today's node: the node below it always lands exactly
  // at the path's y regardless of whether the bubble is showing. The bubble itself
  // is absolutely anchored (bubbleAnchor) so it can sit left/right of the centre.
  stack: { height: STACK_H, width: WRAP_W },
  // Bottom-anchored at the stack's foot; the side (left/right + alignItems) comes
  // from bubbleSide at render time so the tail always aims at the node centre.
  bubbleAnchor: { position: 'absolute', bottom: 0 },
  bubble: { backgroundColor: co.surface, borderRadius: 13, paddingHorizontal: 15, paddingVertical: 7,
    shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  bubbleText: { fontFamily: fonts.sansSemi, fontSize: 11.5, letterSpacing: 1.2, textTransform: 'uppercase', color: co.accent, textAlign: 'center' },
  // Quiet second line in the done bubble: "Next words in Xh Ym" (unlock countdown).
  bubbleNext: { fontFamily: fonts.sans, fontSize: 10.5, color: co.muted, marginTop: 2, textAlign: 'center' },
  bubbleTail: { width: 10, height: 10, backgroundColor: co.surface, transform: [{ rotate: '45deg' }], marginTop: -6, borderRadius: 2 },
  // The Start signal above today's node: a gold pill with a play mark, tail pointing
  // at the stop. Fill + shadow only (no borders), same press target as the node.
  startPill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: co.accent,
    borderRadius: 15, paddingHorizontal: 16, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  startText: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: co.ink },
  startTail: { width: 10, height: 10, backgroundColor: co.accent, transform: [{ rotate: '45deg' }], marginTop: -6, borderRadius: 2 },
});
