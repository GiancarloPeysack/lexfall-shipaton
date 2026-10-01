import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Path, Line, Ellipse, Circle, G } from 'react-native-svg';
import { Palette } from '../theme/tokens';

const AG = Animated.createAnimatedComponent(G);

// Balance scales whose beam rocks and settles - a "weighing" motion that fits
// the level / proficiency question. Code-drawn, no native module.
export default function AnimatedScales({ co, size = 100 }: { co: Palette; size?: number }) {
  const s = { stroke: co.text, strokeWidth: 2, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const a = co.accent;
  const rock = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(rock, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(rock, { toValue: -1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(rock, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.delay(600),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const rotate = rock.interpolate({ inputRange: [-1, 1], outputRange: [-7, 7] });

  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Ellipse cx={48} cy={86} rx={24} ry={7} fill={a} opacity={0.22} />
      {/* static post + base */}
      <Line x1={48} y1={30} x2={48} y2={78} {...s} strokeWidth={2.4} />
      <Path d="M38 80h20" {...s} strokeWidth={2.4} />
      <Circle cx={48} cy={30} r={2.6} fill={a} stroke={co.text} strokeWidth={1.6} />
      {/* rocking beam + pans, pivoting at the top of the post */}
      <AG rotation={rotate} originX={48} originY={30}>
        <Line x1={24} y1={30} x2={72} y2={30} {...s} strokeWidth={2.4} />
        {/* left pan */}
        <Line x1={24} y1={30} x2={18} y2={46} {...s} />
        <Line x1={24} y1={30} x2={30} y2={46} {...s} />
        <Path d="M17 46q7 8 14 0" {...s} fill={co.surface2} />
        {/* right pan */}
        <Line x1={72} y1={30} x2={66} y2={46} {...s} />
        <Line x1={72} y1={30} x2={78} y2={46} {...s} />
        <Path d="M65 46q7 8 14 0" {...s} fill={co.surface2} />
      </AG>
    </Svg>
  );
}
