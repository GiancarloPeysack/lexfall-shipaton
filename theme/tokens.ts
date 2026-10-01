// Vorto design tokens - editorial, dark + light (mirrors design/DESIGN.md)
export const dark = {
  bg: '#100E0B', surface: '#1A1712', surface2: '#221E18',
  line: '#322C22', line2: '#3E372B',
  // muted/faint are register-matched to light theme by APCA, not WCAG (2026-09-14):
  // on surface2, light renders muted at Lc 63.8 / faint at Lc 58.3, but the old dark
  // values (#B6AD9A / #948B79) sat at Lc 56.4 / 38.6 - visibly weaker on-device even
  // though WCAG 2.x scores them HIGHER (its known light-on-dark inflation, same trap
  // as the accent-ink fix below). These are uniform lightens along the same warm-bone
  // hue line, tuned so both themes read at the same perceptual register.
  text: '#ECE5D7', muted: '#C3BAA7', faint: '#B9B09E',
  accent: '#C6A85C', ink: '#100E0B',
  // Figure ink — the warm brown the reader illustration uses for hair/line work.
  // A named token so figures never reach for pure black (which is not in the palette).
  figureInk: '#7A7160', figureBody: '#A99F8B', figureSkin: '#EFE9DC',
  ok: '#8FA76B', bad: '#C57B5B', exText: '#CABFA8',
  glass: 'rgba(236,229,215,0.16)', glassLine: 'rgba(236,229,215,0.40)',
  glass2: 'rgba(236,229,215,0.22)',
};
export const light: typeof dark = {
  bg: '#F4F0E8', surface: '#FBF8F1', surface2: '#ECE6DA',
  line: '#E2DBCC', line2: '#D3CAB8',
  text: '#211D16', muted: '#6E665A', faint: '#7C7264',
  accent: '#9A7B2E', ink: '#FBF8F1',
  figureInk: '#7A7160', figureBody: '#A99F8B', figureSkin: '#EFE9DC',
  ok: '#5E7B45', bad: '#B25B3F', exText: '#4A4335',
  glass: 'rgba(33,29,22,0.07)', glassLine: 'rgba(33,29,22,0.22)',
  glass2: 'rgba(33,29,22,0.11)',
};
export type Palette = typeof dark;

// Back-compat: files not yet themed import `colors` and stay dark (safe default).
export const colors = dark;

// Swappable accent "color templates". Each preset carries a dark + light hue so
// the chosen accent reads well on either background.
//
// `ink` (the text color used ON accent-filled buttons/chips) is a fixed per-theme
// token calibrated against the DEFAULT gold: gold-dark is light enough that near-black
// ink reads strongly on it, gold-light is deep enough that near-white ink does.
// That calibration does NOT automatically hold for every swapped accent - rust's
// dark hue (#C57B5B) is a full register darker than gold-dark (#C6A85C), and black
// ink on it drops to APCA Lc 43 (vs gold's 58; ~60 is the body-text bar) - visibly
// muddy on-device, the weakest pairing of all twelve accent/theme cells. So a preset
// may hand-tune a per-theme `inkDark`/`inkLight` override; unset means the theme's
// default ink is the right pairing (true for the other eleven cells - verified with
// APCA + WCAG + on-device screenshots, 2026-09-14; WCAG 2.x alone is misleading here,
// its known dark-text-on-midtone bias scores every one of these backwards).
export type AccentId = 'gold' | 'sage' | 'rust' | 'ocean' | 'rose' | 'violet';
export const ACCENTS: { id: AccentId; name: string; dark: string; light: string; inkDark?: string; inkLight?: string }[] = [
  { id: 'gold',   name: 'Gold',   dark: '#C6A85C', light: '#9A7B2E' },
  { id: 'sage',   name: 'Sage',   dark: '#8FA76B', light: '#5E7B45' },
  // Rust dark hue is register-matched to light theme by APCA, not WCAG (2026-09-14):
  // the original #C57B5B sat a full register lighter than rust-light, so even the
  // better ink (near-white - light theme's ink value, so no new color enters the
  // palette) only reached Lc 61 / 3.11:1 - the old black-ink WCAG number (5.84:1)
  // looked fine on paper but was Lc 43 on-device, and the white-ink swap alone still
  // trailed light theme's Lc 73 / 4.44:1 (same WCAG-lies trap as dark muted/faint
  // above). Deepened to #B86040: white ink Lc 71 / 4.14:1 (light-theme register)
  // while accent-vs-bg stays 4.39:1 - still above light theme's own 4.14:1 pop,
  // which full 4.44:1 ink parity would have sacrificed (3.92:1 vs bg).
  { id: 'rust',   name: 'Rust',   dark: '#B86040', light: '#B25B3F', inkDark: '#FBF8F1' },
  { id: 'ocean',  name: 'Ocean',  dark: '#7AA0B4', light: '#3F7186' },
  { id: 'rose',   name: 'Rose',   dark: '#C58BA0', light: '#A65B77' },
  { id: 'violet', name: 'Violet', dark: '#9B8BC5', light: '#6E5BA6' },
];
export const accentHex = (id: AccentId, theme: 'dark' | 'light'): string =>
  (ACCENTS.find((a) => a.id === id) ?? ACCENTS[0])[theme === 'light' ? 'light' : 'dark'];
// The ink (on-accent text) override for a preset, if it has one; undefined = use the
// theme's default ink. Consumed by the palette merge in lib/app-state.tsx so every
// `co.ink` call site (flashcard answers, hero CTAs, paywall buttons...) inherits it.
export const accentInk = (id: AccentId, theme: 'dark' | 'light'): string | undefined =>
  (ACCENTS.find((a) => a.id === id) ?? ACCENTS[0])[theme === 'light' ? 'inkLight' : 'inkDark'];

export const fonts = {
  serif: 'Newsreader_500Medium',
  serifItalic: 'Newsreader_400Regular_Italic',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemi: 'Inter_600SemiBold',
} as const;

// micro-caps label style used across the app
export const label = {
  fontFamily: fonts.sansSemi,
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: 'uppercase' as const,
  color: colors.accent,
};

export const radius = { sm: 8, md: 12, lg: 14, xl: 22 } as const;
export const space = (n: number) => n * 4;
