// The premium ElevenLabs voice roster - pre-generated (scripts/gen-pronunciations.mjs), hosted in
// Supabase Storage (public bucket "pronunciations", path {voiceId}/{wordId}.mp3), and downloaded +
// cached on-device the first time each (voice, word) pair is played. This list must stay in sync
// with the `VOICES` array in scripts/gen-pronunciations.mjs (voice `id` = the storage folder name).
export type PremiumVoice = { id: string; label: string; accent: string; flag: string };

export const PREMIUM_VOICES: PremiumVoice[] = [
  { id: 'rachel', label: 'Rachel', accent: 'American', flag: '🇺🇸' },
  { id: 'adam', label: 'Adam', accent: 'American', flag: '🇺🇸' },
  { id: 'irish', label: 'Niamh', accent: 'Irish', flag: '🇮🇪' },
  { id: 'australian', label: 'Mia', accent: 'Australian', flag: '🇦🇺' },
  { id: 'british', label: 'Oliver', accent: 'British', flag: '🇬🇧' },
  { id: 'canadian', label: 'Noah', accent: 'Canadian', flag: '🇨🇦' },
  { id: 'indian', label: 'Priya', accent: 'Indian', flag: '🇮🇳' },
];

export const DEFAULT_VOICE_ID = 'rachel';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

export function premiumAudioUrl(voiceId: string, wordId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/pronunciations/${voiceId}/${encodeURIComponent(wordId)}.mp3`;
}
