# Vorto iOS Widget (M3)

The hero feature: a fresh advanced word on the Lock Screen, Home Screen and StandBy, refreshing every few hours within the user's active hours.

## How it's built
- Native **WidgetKit** target (`index.swift`) added to the Expo app via **@bacons/apple-targets** (`expo-target.config.js`). No ejecting — it lives alongside the RN app and is built by `expo prebuild` / EAS.
- Families: `systemSmall`, `systemMedium`, `accessoryRectangular` (Lock Screen), `accessoryInline`. StandBy uses the system families automatically.
- **Data bridge:** the RN app writes the user's curated, field-specific word queue + settings (`wordsPerDay`, `activeFrom`, `activeTo`) into the shared **App Group** `group.com.gpeysack.lexfall` via `lib/widget.ts` (`ExtensionStorage`), then calls `reloadWidget()`. The widget's `TimelineProvider` reads that queue; if empty it falls back to a bundled set.
- **Scheduling:** `intervalHours()` = round(13 / wordsPerDay); the timeline only surfaces a new word when the hour is within `[activeFrom, activeTo]`.

## To run / verify
1. Set your Apple Team ID in `app.json` → `@bacons/apple-targets` plugin (`appleTeamId`).
2. Create the App Group `group.com.gpeysack.lexfall` on both the app and widget targets (the entitlements are declared; you enable the capability in your Apple developer account / it's added on EAS credentials).
3. `npx expo prebuild -p ios` then `npx expo run:ios` (or an EAS dev build). Long-press Home/Lock Screen → add the **Vorto** widget.

## Production TODO
- Personalize the queue from spaced-repetition due words, not just shuffle.
- Deep-link widget tap → open that word in the app (`vorto://word/<id>`).
- Android: a Glance/`AppWidget` equivalent (separate target).
- Apple Watch complication using the same App Group data.
