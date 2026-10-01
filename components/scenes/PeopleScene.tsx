import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, G, Path, SvgXml } from 'react-native-svg';
import scenePeople from '../../assets/illos/scenePeople';
import { Palette } from '../../theme/tokens';

const AG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// A flat pictogram person (head + torso). Arms are drawn by the caller so they
// can animate. viewBox-agnostic — draws around (cx, top).
function Body({ cx, top, fill }: { cx: number; top: number; fill: string }) {
  return (
    <G>
      <Circle cx={cx} cy={top} r={8} fill={fill} />
      <Path d={`M${cx - 9} ${top + 40} q0 -22 9 -22 q9 0 9 22 Z`} fill={fill} />
    </G>
  );
}

// --- Lawyers: face each other, then lean in and shake hands, on a loop. ---
function Handshake({ co, size = 118 }: { co: Palette; size?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(t, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        // two little shakes
        Animated.timing(t, { toValue: 0.9, duration: 130, useNativeDriver: false }),
        Animated.timing(t, { toValue: 1, duration: 130, useNativeDriver: false }),
        Animated.timing(t, { toValue: 0.9, duration: 130, useNativeDriver: false }),
        Animated.timing(t, { toValue: 1, duration: 130, useNativeDriver: false }),
        Animated.delay(900),
        Animated.timing(t, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  // apart -> together
  const lx = t.interpolate({ inputRange: [0, 1], outputRange: [-6, 4] });
  const rx = t.interpolate({ inputRange: [0, 1], outputRange: [6, -4] });
  const armRotL = t.interpolate({ inputRange: [0, 1], outputRange: ['24deg', '-4deg'] });
  const armRotR = t.interpolate({ inputRange: [0, 1], outputRange: ['-24deg', '4deg'] });
  const clasp = t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0, 1] });
  const ink = co.muted, gold = co.accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* left lawyer */}
      <AG x={lx as unknown as number}>
        <Body cx={34} top={30} fill={ink} />
        <AG rotation={armRotL} originX={34} originY={44}>
          <Path d="M34 44 L52 52" stroke={ink} strokeWidth={5} strokeLinecap="round" fill="none" />
        </AG>
      </AG>
      {/* right lawyer */}
      <AG x={rx as unknown as number}>
        <Body cx={66} top={30} fill={ink} />
        <AG rotation={armRotR} originX={66} originY={44}>
          <Path d="M66 44 L48 52" stroke={ink} strokeWidth={5} strokeLinecap="round" fill="none" />
        </AG>
      </AG>
      {/* the clasp */}
      <AnimatedCircle cx={50} cy={52} r={4.5} fill={gold} opacity={clasp} />
    </Svg>
  );
}

// --- Clinician: brings a stethoscope chest-piece to a seated patient. ---
function Clinician({ co, size = 118 }: { co: Palette; size?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.delay(700),
        Animated.timing(t, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const reach = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '30deg'] });
  const ink = co.muted, gold = co.accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* seated patient (right) */}
      <G>
        <Circle cx={70} cy={40} r={7} fill={ink} opacity={0.75} />
        <Path d="M62 74 q0 -26 8 -26 q8 0 8 26 Z" fill={ink} opacity={0.75} />
      </G>
      {/* clinician (left, standing) */}
      <Body cx={34} top={26} fill={ink} />
      {/* reaching arm + stethoscope, pivoting at the shoulder */}
      <AG rotation={reach} originX={34} originY={40}>
        <Path d="M34 40 Q46 46 56 52" stroke={ink} strokeWidth={5} strokeLinecap="round" fill="none" />
        {/* stethoscope tubing + chest-piece */}
        <Path d="M34 40 q-4 12 6 16" stroke={gold} strokeWidth={2.2} fill="none" strokeLinecap="round" />
        <Circle cx={57} cy={53} r={4} fill={gold} />
      </AG>
    </Svg>
  );
}

export default function PeopleScene({ co, width = 300, height = 230 }: { co: Palette; width?: number; height?: number }) {
  return (
    <View style={{ width, height }}>
      {/* Vignettes tuck BEHIND the desk people (rendered first, base drawn on top). */}
      <View style={{ position: 'absolute', left: width * 0.02, top: height * 0.06, opacity: 0.9 }}>
        <Clinician co={co} size={width * 0.34} />
      </View>
      <View style={{ position: 'absolute', right: width * 0.02, top: height * 0.06, opacity: 0.9 }}>
        <Handshake co={co} size={width * 0.34} />
      </View>
      <SvgXml xml={scenePeople} width={width} height={height} />
    </View>
  );
}
