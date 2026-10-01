import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Path, SvgXml } from 'react-native-svg';
import sceneHabit from '../../assets/illos/sceneHabit';
import { Palette } from '../../theme/tokens';

// The exact taupe/gold the exported illustration uses, so overlay gears blend in
// and fully occlude the static ones underneath.
const GEAR_INK = '#7A7160';
const GEAR_GOLD = '#C6A85C';

// A parametric cog path in a 0..100 box, centred at (50,50).
function gearPath(teeth: number, rOut: number, rRoot: number): string {
  const cx = 50, cy = 50, step = (Math.PI * 2) / teeth, half = step / 2, tw = half * 0.55;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const p = (r: number, ang: number) => `${(cx + r * Math.cos(ang)).toFixed(1)},${(cy + r * Math.sin(ang)).toFixed(1)}`;
    d += (i === 0 ? 'M' : 'L') + p(rRoot, a - half) + 'L' + p(rOut, a - tw) + 'L' + p(rOut, a + tw) + 'L' + p(rRoot, a + half);
  }
  return d + 'Z';
}

function Gear({ co, size, teeth, dir, dur, delay = 0 }: { co: Palette; size: number; teeth: number; dir: 1 | -1; dur: number; delay?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  const d = useMemo(() => gearPath(teeth, 48, 37), [teeth]);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(spin, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: dir > 0 ? ['0deg', '360deg'] : ['0deg', '-360deg'] });
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path d={d} fill={GEAR_INK} />
        <Circle cx={50} cy={50} r={14} fill={co.bg} />
        <Circle cx={50} cy={50} r={7} fill={GEAR_GOLD} />
      </Svg>
    </Animated.View>
  );
}

// Three meshed gears positioned over the static cluster (fractions of the box, so
// easy to nudge). Adjacent gears counter-rotate; speed scales with tooth count.
const GEARS = [
  { fx: 0.53, fy: 0.41, fr: 0.17, teeth: 12, dir: 1 as const, dur: 9000 },
  { fx: 0.66, fy: 0.60, fr: 0.115, teeth: 9, dir: -1 as const, dur: 6800 },
  { fx: 0.79, fy: 0.34, fr: 0.135, teeth: 10, dir: -1 as const, dur: 7600 },
];

export default function GearsScene({ co, width = 318, height = 226 }: { co: Palette; width?: number; height?: number }) {
  // Subtle "push" — the figure leans into the gears on the same cadence as the spin.
  const push = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(push, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(push, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const lean = push.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1.6deg'] });
  const shift = push.interpolate({ inputRange: [0, 1], outputRange: [0, 3] });

  return (
    <View style={{ width, height }}>
      {/* Base illustration leans very slightly toward the gears on the push cycle. */}
      <Animated.View style={{ transform: [{ translateX: shift }, { rotate: lean }] }}>
        <SvgXml xml={sceneHabit} width={width} height={height} />
      </Animated.View>

      {/* Spinning gears, occluding the static ones. */}
      {GEARS.map((g, i) => {
        const size = g.fr * 2 * width;
        return (
          <View key={i} style={{ position: 'absolute', left: g.fx * width - size / 2, top: g.fy * height - size / 2 }}>
            <Gear co={co} size={size} teeth={g.teeth} dir={g.dir} dur={g.dur} delay={i * 120} />
          </View>
        );
      })}
    </View>
  );
}
