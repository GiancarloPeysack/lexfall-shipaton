import { View, Text, StyleSheet } from 'react-native';
import { dark, light, fonts, Palette } from '../theme/tokens';
import PressBounce from './PressBounce';

// Owner (2026-09-12): plain "Dark"/"Light" text on a Segment control doesn't tell you what
// either mode actually looks like - iOS's own Appearance setting shows a thumbnail per option,
// so this does the same with a tiny mock screen rendered in that mode's REAL palette colors
// (imported directly, not through useApp - that only exposes whichever theme is currently
// active). Segment.tsx itself is label-only with no per-option render slot, so this is a
// bespoke control rather than an extension of it.
function Mock({ mode }: { mode: 'dark' | 'light' }) {
  const p = mode === 'dark' ? dark : light;
  return (
    <View style={[s.mock, { backgroundColor: p.bg }]}>
      <View style={[s.mockBar, { backgroundColor: p.accent }]} />
      <View style={[s.mockCard, { backgroundColor: p.surface2 }]}>
        <View style={[s.mockLine, { backgroundColor: p.text, width: '70%' }]} />
        <View style={[s.mockLine, { backgroundColor: p.muted, width: '45%' }]} />
      </View>
    </View>
  );
}

export default function AppearancePicker({ value, onChange, co }: {
  value: 'dark' | 'light'; onChange: (v: 'dark' | 'light') => void; co: Palette;
}) {
  return (
    <View style={s.row}>
      {(['dark', 'light'] as const).map((mode) => {
        const on = value === mode;
        return (
          <PressBounce key={mode} onPress={() => onChange(mode)} style={[s.option, { backgroundColor: on ? co.accent + '26' : co.surface2 }]}>
            <Mock mode={mode} />
            <Text style={[s.label, { color: on ? co.accent : co.text }]}>{mode === 'dark' ? 'Dark' : 'Light'}</Text>
          </PressBounce>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  option: { flex: 1, borderRadius: 16, padding: 12, alignItems: 'center', gap: 10 },
  mock: { width: '100%', aspectRatio: 1.5, borderRadius: 10, padding: 8, justifyContent: 'flex-end' },
  mockBar: { width: 22, height: 5, borderRadius: 3, marginBottom: 8 },
  mockCard: { borderRadius: 6, padding: 6, gap: 4 },
  mockLine: { height: 4, borderRadius: 2 },
  label: { fontFamily: fonts.sansSemi, fontSize: 14.5 },
});
