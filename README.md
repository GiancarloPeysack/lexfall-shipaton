# Lexfall

**Advanced (C1–C2) English vocabulary, built around your profession.**

Lexfall is a premium iOS/Android app that teaches the advanced English vocabulary
professionals actually use — in Medicine, Law, Business, and General English. Instead
of generic word lists, it personalises a daily stream of genuinely advanced words to
your field, with pronunciations, spaced-repetition recall, a daily practice session,
streaks, and home-/lock-screen widgets.

- **App Store:** https://apps.apple.com/app/id6786614029
- **Demo video:** https://vimeo.com/1232078321

> Submitted to the **RevenueCat Shipaton 2026** hackathon.

---

## What's in this repository

This is the application source (Expo / React Native). A couple of things are intentionally
**not included**:

- **The full word library is not included in this repository; `data/` contains a small
  sample.** `data/words.ts` and `data/word-levels.ts` here hold only ~20 entries each (the
  real ~11,000-entry corpus and its CEFR grading dataset are proprietary) so the code still
  reads clearly.
- No secrets, and no live keys at all. There is no `.env` in this repo and every key/URL
  in `eas.json` is blanked — see `.env.example` for the variable names you'd supply.
- **Backend not included.** The Supabase edge functions (RevenueCat webhook, the creator
  attribution / payout ledger, the on-demand pronunciation proxy, account deletion) and the
  build/content scripts are intentionally left out — this repo is the client app, so there's
  no server endpoint, credential, or project reference to act on. The integrations are
  described below.

## Tech stack

- **Expo + React Native** (expo-router, New Architecture / Hermes), TypeScript
- **SQLite** on-device (`lib/db.ts`) for the offline word corpus + spaced repetition
- **Supabase** for content sync, auth, cross-device state, and edge functions
- **Native widget** (`targets/widget/` — SwiftUI / WidgetKit)
- Editorial dark/light design system (`theme/tokens.ts`)

## RevenueCat integration

RevenueCat powers the entire subscription layer (`lib/purchases.ts`, `components/Paywall.tsx`):

- **Offerings** are fetched live and the paywall renders prices from them — prices are
  never hardcoded in the UI.
- **Entitlements** gate Pro access (`app-state.tsx` reads the active entitlement).
- **Purchase / restore** flows, intro-offer / free-trial handling, and a per-week anchor
  pricing presentation.
- **Webhook** (server-side, not included here): a signature-verified RevenueCat webhook
  mirrors subscription state into the database and drives a creator-attribution / partner
  payout ledger for the influencer program.

## OneSignal integration

Remote push for retention (`lib/onesignal.ts`): the app publishes the user's streak as
tags so a "streak saver" journey can re-engage lapsed learners, alongside local
`expo-notifications` for scheduled word reminders.

## Running it

```bash
npm install
cp .env.example .env   # fill in your own keys
npx expo run:ios       # or: npx expo start
```

The app runs with the sample word data included here; the full corpus is proprietary.

---

© 2026 Lexfall. All rights reserved. See `NOTICE`.
