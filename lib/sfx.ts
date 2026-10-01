import { Platform } from 'react-native';

// Subtle UI sounds (feed scroll tick + test correct/wrong/complete). Like
// notifications, expo-av is loaded LAZILY so merely importing this file is safe
// in a build without the native module — sounds simply no-op until rebuilt.
let _AV: any | null | undefined;
function AV(): any | null {
  if (_AV !== undefined) return _AV;
  try { _AV = require('expo-av'); } catch { _AV = null; }
  return _AV;
}

export type SfxName = 'tick' | 'correct' | 'wrong' | 'complete';
const FILES: Record<SfxName, any> = {
  tick: require('../assets/sounds/tick.wav'),
  correct: require('../assets/sounds/correct.wav'),
  wrong: require('../assets/sounds/wrong.wav'),
  complete: require('../assets/sounds/complete.wav'),
};

// Per-sound volume (the feed tick is deliberately quieter than test feedback).
const VOL: Record<SfxName, number> = { tick: 0.3, correct: 0.5, wrong: 0.5, complete: 0.55 };

let enabled = true;
export function setSfxEnabled(v: boolean) { enabled = v; }

const sounds: Partial<Record<SfxName, any>> = {};
let loading: Promise<void> | null = null;

function ensureLoaded(): Promise<void> {
  if (loading) return loading;
  const av = AV();
  if (!av || Platform.OS === 'web') return Promise.resolve();
  loading = (async () => {
    try {
      // Do NOT play in silent mode — a muted phone stays silent (these are ambient
      // UI cues, not media). Don't duck/interrupt the user's music.
      await av.Audio.setAudioModeAsync({ playsInSilentModeIOS: false });
      for (const k of Object.keys(FILES) as SfxName[]) {
        const { sound } = await av.Audio.Sound.createAsync(FILES[k], { volume: VOL[k] });
        sounds[k] = sound;
      }
    } catch { /* native module not linked yet */ }
  })();
  return loading;
}

// Warm the sounds up front (call once on app ready) so the first play has no latency.
export function preloadSfx() { ensureLoaded().catch(() => {}); }

export async function playSfx(name: SfxName) {
  if (!enabled || Platform.OS === 'web' || !AV()) return;
  try {
    await ensureLoaded();
    const s = sounds[name];
    if (s) await s.replayAsync();
  } catch { /* ignore */ }
}
