import { useRef, useState } from 'react';
import { Animated, Platform, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Shadow shown while a `lift` press is held. Toggled via state (shadow props can't
// ride the native driver) — the springing scale carries the motion, the shadow just
// snaps on/off underneath it, which reads as the element "popping" up.
const LIFT_SHADOW: ViewStyle = Platform.select<ViewStyle>({
  ios: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  default: { elevation: 10 },
});

// Tappable wrapper that dips on press and springs back with a little overshoot -
// the "jump" that makes buttons feel alive. Drop-in replacement for Pressable:
// all Pressable props (hitSlop, disabled, accessibilityLabel, ...) pass through.
// The Pressable itself is the styled/animated element, so layout stays intact.
//
// `lift` (optional): instead of dipping, the element pops UP (~1.06) and gains
// elevation/shadow while held — for nav circles and other buttons that should
// feel like they rise toward the finger. Default (no lift) keeps the classic dip.
export default function PressBounce({
  children, style, lift, onPressIn, onPressOut, ...rest
}: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; lift?: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [raised, setRaised] = useState(false);
  const spring = (v: number, bounciness = 0) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 50, bounciness });

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        if (lift) { setRaised(true); spring(1.06, 8).start(); }
        else spring(0.94).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (lift) setRaised(false);
        spring(1, lift ? 10 : 14).start();
        onPressOut?.(e);
      }}
      style={[style, lift && raised && LIFT_SHADOW, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
