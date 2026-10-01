import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Path, Ellipse } from 'react-native-svg';
import { Palette } from '../theme/tokens';

const AP = Animated.createAnimatedComponent(Path);

// The onboarding hero: an open book whose pages keep turning (right -> left),
// pivoting at the spine. Two staggered pages give a continuous "reading" feel.
export default function AnimatedBook({ co, size = 168 }: { co: Palette; size?: number }) {
  const s = { stroke: co.text, strokeWidth: 2, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const sf = { ...s, fill: co.surface2 };
  const a = co.accent;

  const flip = useRef(new Animated.Value(0)).current;
  const flip2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const mk = (v: Animated.Value, delay: number) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
        Animated.delay(1100),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    );
    const l1 = mk(flip, 0);
    const l2 = mk(flip2, 1300);
    l1.start(); l2.start();
    return () => { l1.stop(); l2.stop(); };
  }, []);

  // scaleX 1 -> -1 pivoted at the spine (x=48): a page turning over.
  const sx1 = flip.interpolate({ inputRange: [0, 1], outputRange: [1, -1] });
  const op1 = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.55, 1] });
  const sx2 = flip2.interpolate({ inputRange: [0, 1], outputRange: [1, -1] });
  const op2 = flip2.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.55, 1] });

  const PAGE = 'M48 30c8-7 20-7 28-4v44c-8-3-20-3-28 4z';

  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Ellipse cx={48} cy={84} rx={26} ry={8} fill={a} opacity={0.22} />
      {/* open book base (both leaves) */}
      <Path d="M48 30c-8-7-20-7-28-4v44c8-3 20-3 28 4 8-7 20-7 28-4V26c-8-3-20-3-28 4z" {...sf} />
      {/* turning pages, pivoting at the spine */}
      <AP d={PAGE} fill={co.bg} stroke={co.text} strokeWidth={1.6} strokeLinejoin="round" originX={48} originY={52} scaleX={sx2} opacity={op2} />
      <AP d={PAGE} fill={co.bg} stroke={co.text} strokeWidth={1.6} strokeLinejoin="round" originX={48} originY={52} scaleX={sx1} opacity={op1} />
      {/* ruled lines + spine */}
      <Path d="M48 30v44" {...s} />
      <Path d="M27 38l14-2M27 46l14-2M55 36l14 2" {...s} strokeWidth={2} />
      {/* gold bookmark */}
      <Path d="M66 14l6 6-16 16-8 2 2-8z" fill={a} stroke={co.text} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}
