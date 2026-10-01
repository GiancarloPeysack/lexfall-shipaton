import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Path, SvgXml } from 'react-native-svg';
import sceneDaily from '../../assets/illos/sceneDaily';
import { Palette } from '../../theme/tokens';

const AP = Animated.createAnimatedComponent(Path);

// Base illustration viewBox — the overlay uses the SAME one so page coords land
// exactly on the drawn book regardless of letterboxing.
const VB = '0 0 1007.04 858';
// The right leaf of the open book (from sceneDaily's polygons); it flips over the
// spine (x≈452) toward the left leaf, then resets — a page turning, on a loop.
const RIGHT_PAGE = 'M648.93 489.08 L450.32 534.57 L461.41 806.41 L645.6 749.82 Z';
const SPINE_X = 452;
const PAGE_MID_Y = 650;
const PAGE_GOLD = '#C6A85C';

export default function ReadingScene({ co, width = 312, height = 226 }: { co: Palette; width?: number; height?: number }) {
  const flip = useRef(new Animated.Value(0)).current;   // page turn
  const breathe = useRef(new Animated.Value(0)).current; // subtle "keeps reading"

  useEffect(() => {
    const turn = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(flip, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
        Animated.delay(1600),
        Animated.timing(flip, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    );
    const br = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    turn.start(); br.start();
    return () => { turn.stop(); br.stop(); };
  }, []);

  // scaleX 1 -> -1 pivoted at the spine: the leaf sweeps right -> left.
  const sx = flip.interpolate({ inputRange: [0, 1], outputRange: [1, -1] });
  const op = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.9, 0] }); // hidden at rest (overlaps static leaf), visible mid-turn
  const shadowOp = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.12, 0] });
  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.012] });
  const ty = breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });

  return (
    <View style={{ width, height }}>
      <Animated.View style={{ transform: [{ translateY: ty }, { scale }] }}>
        <SvgXml xml={sceneDaily} width={width} height={height} />
        <Svg width={width} height={height} viewBox={VB} style={{ position: 'absolute', left: 0, top: 0 }}>
          {/* soft shadow of the lifting leaf */}
          <AP d={RIGHT_PAGE} fill="#000" opacity={shadowOp} originX={SPINE_X} originY={PAGE_MID_Y} scaleX={sx} />
          {/* the turning leaf */}
          <AP d={RIGHT_PAGE} fill={PAGE_GOLD} opacity={op} originX={SPINE_X} originY={PAGE_MID_Y} scaleX={sx} />
        </Svg>
      </Animated.View>
    </View>
  );
}
