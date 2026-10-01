// REAL reviews only. app/CLAUDE.md forbids fabricated social proof and Apple rejects fake
// reviews, so this stays EMPTY until we have genuine App Store reviews to quote. The
// onboarding "Loved by readers" screen only appears when this array is non-empty, so nothing
// fabricated is ever shown. When real reviews exist, paste them here verbatim (attributed).
export type Review = { stars: number; text: string; author?: string };

export const REVIEWS: Review[] = [
  // { stars: 5, text: 'Finally an app for words I actually want.', author: '—' },
];
