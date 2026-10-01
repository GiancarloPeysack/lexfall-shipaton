import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PREMIUM_VOICES, DEFAULT_VOICE_ID, premiumAudioUrl } from './premium-voices';
import { supabase } from './supabase';

// expo-av / expo-file-system are loaded LAZILY (same pattern as lib/sfx.ts) so importing this
// file is safe even in a build without the native module.
let _AV: any | null | undefined;
function AV(): any | null {
  if (_AV !== undefined) return _AV;
  try { _AV = require('expo-av'); } catch { _AV = null; }
  return _AV;
}
let _FS: any | null | undefined;
function FS(): any | null {
  if (_FS !== undefined) return _FS;
  try { _FS = require('expo-file-system'); } catch { _FS = null; }
  return _FS;
}

// On iOS, calling Audio.setAudioModeAsync({ playsInSilentModeIOS: true }) alone sets the
// *category* preference but doesn't reliably *activate* an active playback session - confirmed on
// a real device: the silent switch still muted Speech.speak() even with that call in place.
// AVSpeechSynthesizer defers to whatever session is actually live. lib/sfx.ts's real
// Audio.Sound.createAsync + playAsync calls are proven to force an active playback session (its
// tick/correct/wrong/complete sounds audibly play), so a near-silent primer clip played the same
// way, right before speaking, reliably holds that active session for TTS AND for premium playback.
// The single currently-playing premium clip. Only one may be live at a time (see playPremium):
// rapid taps used to spawn one Audio.Sound (native AVPlayer) per tap that only unloaded on finish,
// so they accumulated and exhausted the audio stack (MediaToolbox err -12864 -> SIGABRT).
let _current: any | null = null;
let _primer: any | null | undefined;
async function primeAudioSession(av: any) {
  try {
    await av.Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    if (_primer === undefined) {
      const { sound } = await av.Audio.Sound.createAsync(require('../assets/sounds/silence.wav'), { volume: 0 });
      _primer = sound;
    }
    if (_primer) await _primer.replayAsync();
  } catch (e) {
    if (__DEV__) console.warn('[speak] primeAudioSession failed', e);
  }
}

const KEY = 'vorto.voice';
let cached: string | null | undefined;

// Stored pref is one of PREMIUM_VOICES' ids (or null = app default, DEFAULT_VOICE_ID). Legacy
// installs may still have an old on-device OS voice identifier (e.g.
// "com.apple.voice.compact.en-GB.Daniel") cached from before this feature shipped - isPremiumId
// below treats anything not in PREMIUM_VOICES as unset rather than trying to resolve it.
export async function getVoicePref(): Promise<string | null> {
  if (cached !== undefined) return cached;
  cached = await AsyncStorage.getItem(KEY);
  return cached;
}
export async function setVoicePref(id: string | null) {
  cached = id;
  if (id) await AsyncStorage.setItem(KEY, id);
  else await AsyncStorage.removeItem(KEY);
}

const isPremiumId = (id: string | null): id is string => !!id && PREMIUM_VOICES.some((v) => v.id === id);

// Cache dir for downloaded premium clips - persists across launches, cleared only if the OS
// reclaims app storage (cacheDirectory semantics), which is fine: a cache miss just re-downloads.
function cacheDir(fs: any): string { return `${fs.cacheDirectory}pronunciations/`; }
async function ensureCacheDir(fs: any) {
  const dir = cacheDir(fs);
  const info = await fs.getInfoAsync(dir);
  if (!info.exists) await fs.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

// Asks the tts-proxy Edge Function to generate (or hand back an already-cached) clip for this
// exact (voice, word) pair. The bulk pre-generation job (scripts/gen-pronunciations.mjs) covers
// the whole corpus eventually, but it's an 81k-request job that takes many hours - this is the
// on-demand fallback for whatever it hasn't reached yet, so a tapped word plays the REAL premium
// voice immediately instead of silently downgrading to on-device TTS. Costs ~1-2s the first time
// any user requests a given pair; every call after that (any user, this one included) is a normal
// cache hit via the direct storage URL, since both paths write to the same bucket/path.
async function generateOnDemand(voiceId: string, wordId: string, text: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('tts-proxy', { body: { voiceId, wordId, text } });
    if (error) { if (__DEV__) console.log('[speak] tts-proxy invoke error', JSON.stringify(error)); return null; }
    if (!data?.url) { if (__DEV__) console.log('[speak] tts-proxy no url in response', JSON.stringify(data)); return null; }
    return data.url as string;
  } catch (e) {
    if (__DEV__) console.log('[speak] tts-proxy invoke threw', e);
    return null;
  }
}

// Downloads (or reuses a cached copy of) the premium clip for (voiceId, wordId) and plays it.
// Returns true on success, false on ANY failure (offline, ElevenLabs itself down, decode error...)
// so the caller can fall back to on-device TTS - a tapped pronunciation should never just go silent.
async function playPremium(voiceId: string, wordId: string, text: string): Promise<boolean> {
  const av = AV();
  const fs = FS();
  if (!av || !fs) return false;
  try {
    const dir = await ensureCacheDir(fs);
    const localPath = `${dir}${voiceId}__${encodeURIComponent(wordId)}.mp3`;
    const info = await fs.getInfoAsync(localPath);
    if (!info.exists) {
      let result = await fs.downloadAsync(premiumAudioUrl(voiceId, wordId), localPath);
      if (__DEV__) console.log(`[speak] bulk download ${voiceId}/${wordId}: status=${result.status}`);
      if (result.status !== 200) {
        // Cache miss on the bulk-generated set - ask the proxy to generate it now rather than
        // giving up immediately.
        const url = await generateOnDemand(voiceId, wordId, text);
        if (__DEV__) console.log(`[speak] generateOnDemand ${voiceId}/${wordId}: url=${url}`);
        result = url ? await fs.downloadAsync(url, localPath) : { status: 0 } as any;
        if (__DEV__) console.log(`[speak] on-demand download ${voiceId}/${wordId}: status=${result.status}`);
      }
      if (result.status !== 200) {
        await fs.deleteAsync(localPath, { idempotent: true }).catch(() => {});
        return false;
      }
    }
    await primeAudioSession(av);
    // Stop + unload the previous clip before starting the next, so we never accumulate native
    // players on rapid taps (the crash: many concurrent AVPlayers -> audio-stack abort).
    if (_current) { const prev = _current; _current = null; prev.stopAsync().catch(() => {}); prev.unloadAsync().catch(() => {}); }
    const { sound } = await av.Audio.Sound.createAsync({ uri: localPath }, { shouldPlay: true });
    _current = sound;
    sound.setOnPlaybackStatusUpdate((status: any) => {
      if (status.didJustFinish) {
        if (_current === sound) _current = null;
        sound.unloadAsync().catch(() => {});
        av.Audio.setAudioModeAsync({ playsInSilentModeIOS: false }).catch(() => {});
      }
    });
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[speak] playPremium failed', e);
    return false;
  }
}

// Speak a word using the user's chosen premium voice when a wordId is given (falls back to
// on-device TTS if that voice/word pair isn't generated yet, e.g. brand-new corpus content, or if
// offline) - otherwise (no wordId, e.g. previewing an arbitrary phrase) uses on-device TTS directly,
// since premium clips are only ever pre-generated per corpus word id, not arbitrary text.
//
// voiceOverride: omit entirely to use the stored preference; pass a specific premium voice id to
// force that voice; pass explicit `null` to force the app default (DEFAULT_VOICE_ID) rather than
// whatever's stored - distinct from omitted/`undefined`, which uses the stored pref as-is.
export async function speakWord(text: string, voiceOverride?: string | null, wordId?: string) {
  try {
    const stored = voiceOverride !== undefined ? voiceOverride : await getVoicePref();
    const voiceId = isPremiumId(stored) ? stored : DEFAULT_VOICE_ID;

    if (wordId) {
      const ok = await playPremium(voiceId, wordId, text);
      if (ok) return;
      // Fall through to on-device TTS below on any failure.
    }

    Speech.stop();
    const av = AV();
    if (av) await primeAudioSession(av);
    else if (__DEV__) console.warn('[speak] expo-av not available - silent-switch override skipped');
    const restore = () => { if (av) av.Audio.setAudioModeAsync({ playsInSilentModeIOS: false }).catch(() => {}); };
    Speech.speak(text, {
      language: 'en-GB',
      rate: 0.9,
      onDone: restore,
      onStopped: restore,
      onError: (e: any) => { if (__DEV__) console.warn('[speak] Speech.speak error', e); restore(); },
    });
  } catch (e) {
    if (__DEV__) console.warn('[speak] speakWord threw', e);
  }
}

// Kept for callers that still want the on-device voice list (none left after the premium-voice
// picker rollout, but harmless to keep - e.g. useful if a future settings screen wants both).
export async function englishVoices() {
  try {
    const all = await Speech.getAvailableVoicesAsync();
    return all
      .filter((v) => (v.language || '').toLowerCase().startsWith('en'))
      .sort((a, b) => (a.language + a.name).localeCompare(b.language + b.name));
  } catch {
    return [];
  }
}
