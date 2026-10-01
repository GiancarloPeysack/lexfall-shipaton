import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { fonts, Palette } from '../theme/tokens';
import PressBounce from './PressBounce';

export type SegmentOption = { label: string; value: string };

// Single-container segmented control: one filled track, no borders. The
// selected segment fills gold with a small spring - hierarchy from fill, not
// outlines. With more than 4 options it falls back to a wrap of borderless
// filled chips (same visual language).
export default function Segment({ options, value, onChange, co }: {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  co: Palette;
}) {
  if (options.length > 4) {
    return (
      <View style={styles.cloud}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <PressBounce
              key={o.value}
              onPress={() => onChange(o.value)}
              style={[styles.chip, { backgroundColor: on ? co.accent : co.surface2 }]}
            >
              <Text style={[styles.chipText, { color: on ? co.ink : co.muted }]}>{o.label}</Text>
            </PressBounce>
          );
        })}
      </View>
    );
  }

  return (
    <View style={[styles.track, { backgroundColor: co.surface2 }]}>
      {options.map((o) => (
        <Seg key={o.value} label={o.label} on={o.value === value} onPress={() => onChange(o.value)} co={co} />
      ))}
    </View>
  );
}

function Seg({ label, on, onPress, co }: { label: string; on: boolean; onPress: () => void; co: Palette }) {
  const a = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: on ? 1 : 0, useNativeDriver: true, speed: 26, bounciness: 5 }).start();
  }, [on]);
  return (
    <PressBounce onPress={onPress} style={styles.seg}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: co.accent, borderRadius: 11, opacity: a,
            transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
          },
        ]}
      />
      <Text style={[styles.segText, { color: on ? co.ink : co.muted }]} numberOfLines={1}>{label}</Text>
    </PressBounce>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 14, padding: 3 },
  seg: { flex: 1, borderRadius: 11, overflow: 'hidden' },
  segText: { fontFamily: fonts.sansMedium, fontSize: 14, textAlign: 'center', paddingVertical: 9, paddingHorizontal: 6 },
  cloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 15 },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 14 },
});
