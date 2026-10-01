import { useEffect, useRef, useState } from 'react';
import { Animated, StyleProp, Text, TextStyle } from 'react-native';

// Tweens an integer up/down to `value` whenever it changes (e.g. the daily-goal
// header counting 0 → today's total on load, or a stat easing to its number).
// Uses an Animated listener so it drives a plain <Text>.
export default function Counter({
  value,
  style,
  duration = 600,
}: {
  value: number;
  style?: StyleProp<TextStyle>;
  duration?: number;
}) {
  const a = useRef(new Animated.Value(value)).current;
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const id = a.addListener(({ value: v }) => setDisplay(Math.round(v)));
    Animated.timing(a, { toValue: value, duration, useNativeDriver: false }).start();
    return () => a.removeListener(id);
  }, [value]);
  return <Text style={style}>{display}</Text>;
}
