import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

// Live countdown to when the NEXT day's daily words unlock: the start of the next local
// calendar day, matching todayStr()'s local-date rollover in lib/daily-test.ts (a new day's
// test builds the first time the screen opens after local midnight). Self-updating on a 60s
// interval, cleaned up on unmount, so a screen left open across an hour boundary stays
// truthful. Renders "Next words in Xh Ym" ("Ym" under an hour). Styling comes entirely from
// the caller so each placement stays theme-aware via its own palette.

function msToNextMidnight(): number {
  const next = new Date();
  next.setHours(24, 0, 0, 0); // start of tomorrow, local time
  return next.getTime() - Date.now();
}

export function formatUnlock(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60_000)); // floor at "1m" — never zero or negative
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function UnlockCountdown({ style }: { style?: StyleProp<TextStyle> }) {
  const [label, setLabel] = useState(() => formatUnlock(msToNextMidnight()));
  useEffect(() => {
    const id = setInterval(() => setLabel(formatUnlock(msToNextMidnight())), 60_000);
    return () => clearInterval(id);
  }, []);
  return <Text style={style}>Next words in {label}</Text>;
}
