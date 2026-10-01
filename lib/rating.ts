import AsyncStorage from '@react-native-async-storage/async-storage';

// Ask for an App Store review at a genuinely good moment (called after a strong daily-test result).
// Uses StoreKit's native prompt (expo-store-review) — Apple caps it to ~3/year and may not show it
// at all, which is the App-Store-compliant way (no custom star UI that routes to the store).
const KEY = 'lexfall.lastReviewAsk';
const MIN_DAYS_BETWEEN = 60;

export async function maybeRequestReview() {
  try {
    const last = parseInt((await AsyncStorage.getItem(KEY)) || '0', 10);
    const now = Date.now();
    if (last && now - last < MIN_DAYS_BETWEEN * 86400000) return;
    const StoreReview = require('expo-store-review');
    const available = (await StoreReview.hasAction?.()) ?? (await StoreReview.isAvailableAsync?.());
    if (!available) return;
    await StoreReview.requestReview();
    await AsyncStorage.setItem(KEY, String(now));
  } catch {
    /* module not present in this build yet, or no store action available */
  }
}
