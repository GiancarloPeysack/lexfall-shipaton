import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useApp } from '../lib/app-state';
import { EXAM_OPTIONS, isoInDays } from '../lib/exam';
import { fonts, Palette } from '../theme/tokens';
import PressBounce from './PressBounce';

// A dependency-free exam-date chooser: quick options map to a concrete date so the
// countdown is real, no native date picker needed. Used in onboarding + Profile.
// onPick fires on ANY selection (including "Not booked yet", which sets no date) so the
// parent can gate Continue on "answered" rather than "has a date".
export default function ExamPicker({ onPick }: { onPick?: () => void } = {}) {
  const { examDate, setExamDate, palette: co } = useApp();
  const s = makeStyles(co);
  // Which chip is active: NOTHING until the user picks (don't default to the lowest-intent
  // "Not booked yet"). Derive the initial highlight from any existing date, but once the user
  // taps we track the chosen LABEL locally — so "Not booked yet" (which stores no date) still
  // shows as selected instead of silently reverting to nothing picked.
  const initialLabel = (() => {
    if (!examDate) return null;
    const target = new Date(examDate + 'T00:00:00').getTime();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((target - today.getTime()) / 86400000);
    let best = EXAM_OPTIONS[0], bestDiff = Infinity;
    for (const o of EXAM_OPTIONS) { if (o.days == null) continue; const d = Math.abs(o.days - days); if (d < bestDiff) { bestDiff = d; best = o; } }
    return best.label;
  })();
  const [picked, setPicked] = useState<string | null>(initialLabel);

  return (
    <View style={s.wrap}>
      {EXAM_OPTIONS.map((o) => {
        const on = o.label === picked;
        return (
          <PressBounce
            key={o.label}
            style={[s.chip, on && { backgroundColor: co.accent }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); setPicked(o.label); setExamDate(o.days == null ? null : isoInDays(o.days)); onPick?.(); }}
          >
            <Text style={[s.chipText, on && { color: co.ink }]}>{o.label}</Text>
          </PressBounce>
        );
      })}
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: co.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 14, color: co.text },
});
