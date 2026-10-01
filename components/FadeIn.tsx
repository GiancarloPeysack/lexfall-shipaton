import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';

// Drop-in entrance animation: the child fades + rises into place once on mount.
// `delay` staggers siblings (e.g. list items by index) for a cascading reveal.
// Built on the RN Animated API (native-driven) — no Reanimated dependency.
export default function FadeIn({
  children,
  delay = 0,
  offset = 10,
  duration = 420,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  offset?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);
  return (
    <Animated.View
      style={[
        style,
        { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}
