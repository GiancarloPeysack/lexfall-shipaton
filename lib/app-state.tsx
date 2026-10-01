import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform, useColorScheme, AppState as RNAppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import { FieldId } from '../data/types';
import { dark, light, Palette, AccentId, accentHex, accentInk } from '../theme/tokens';
import { syncWidget } from './widget';
import { configureNotifications, rescheduleReminders } from './notifications';
import { initSync } from './sync';
import { syncUserData, pushUserData } from './user-sync';
import { setSfxEnabled, preloadSfx } from './sfx';

configureNotifications();

const ONBOARDED_KEY = 'vorto.onboarded';
const ENTITLEMENT = 'premium'; // RevenueCat entitlement id

// DEV ONLY: force Pro so the full "unlimited" feed + unlocked words are reachable in the
// simulator without live RevenueCat products (without this, isPro is false in dev and the
// feed always dead-ends at the 15-word taste). Flip the `true` to `false` to test the
// paywall/gate in dev. Never affects production — guarded by __DEV__.
const DEV_FORCE_PRO = __DEV__ && true;

type AppState = {
  ready: boolean;
  onboarded: boolean;
  isPro: boolean;
  field: FieldId;
  name: string;
  goal: number;
  theme: 'dark' | 'light';
  accent: AccentId;
  sound: boolean;
  feedPhotos: boolean;
  wordPref: 'practical' | 'balanced' | 'rare'; // owner-facing difficulty/rarity dial, see data/word-levels.ts wordPrefMultiplier
  examDate: string | null; // ISO yyyy-mm-dd of the user's target exam (GTM: retention hook)
  palette: Palette;
  setField: (f: FieldId) => void;
  setName: (n: string) => void;
  setGoal: (n: number) => void;
  setTheme: (t: 'dark' | 'light') => void;
  setAccent: (a: AccentId) => void;
  setSound: (v: boolean) => void;
  setFeedPhotos: (v: boolean) => void;
  setWordPref: (v: 'practical' | 'balanced' | 'rare') => void;
  setExamDate: (d: string | null) => void;
  completeOnboarding: () => Promise<void>;
  refreshEntitlement: () => Promise<void>;
  testPro: boolean;           // DEV-ONLY manual test override (persisted) for checking Pro screens
  toggleTestPro: () => void;  // in development; ignored entirely in production (gated on __DEV__)
  grantPro: (durationDays?: number | null) => void; // unlock Pro via a redeemed comp code (persisted); omit/null duration = permanent
};

const Ctx = createContext<AppState>({} as AppState);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  // Explicit <boolean>: while DEV_FORCE_PRO is temporarily `__DEV__ && false` its literal type is
  // `false`, which would otherwise narrow this state to useState<false> and break setIsPro(true).
  const [isPro, setIsPro] = useState<boolean>(DEV_FORCE_PRO);
  const [testPro, setTestPro] = useState(false);
  const toggleTestPro = () => setTestPro((p) => { const n = !p; AsyncStorage.setItem('vorto.testPro', n ? '1' : '0').catch(() => {}); return n; });
  const [compPro, setCompPro] = useState(false); // unlocked by a redeemed comp code (persisted)
  // A comp code can grant permanent access (no duration_days on the row, e.g. LEXFALLINSIDER) or
  // a time-limited window (e.g. a launch-promo code with duration_days=90) - the expiry, if any,
  // is stored as an absolute timestamp so it survives app restarts without re-deriving it.
  const grantPro = (durationDays?: number | null) => {
    setCompPro(true);
    AsyncStorage.setItem('vorto.compPro', '1').catch(() => {});
    if (durationDays) {
      const expiresAt = Date.now() + durationDays * 86400000;
      AsyncStorage.setItem('vorto.compProExpiresAt', String(expiresAt)).catch(() => {});
    } else {
      AsyncStorage.removeItem('vorto.compProExpiresAt').catch(() => {});
    }
  };
  const [field, setFieldState] = useState<FieldId>('gen');
  const [name, setNameState] = useState('');
  const [goal, setGoalState] = useState(5);
  // LIGHT is the brand default (cream + serif reads like paper). Dark is available
  // in Settings and, once chosen, persists (loaded on ready below).
  const system = useColorScheme();
  const [override, setOverride] = useState<'dark' | 'light' | null>(null);
  const theme: 'dark' | 'light' = override ?? 'light';
  const [accent, setAccentState] = useState<AccentId>('gold');
  const [sound, setSoundState] = useState(true);
  const [examDate, setExamDateState] = useState<string | null>(null);
  // Feed photo backgrounds are OPT-IN — default off (flat dark card).
  const [feedPhotos, setFeedPhotosState] = useState(false); // photos OFF by default (opt-in)
  // Difficulty/rarity dial (owner, 2026-09-11) - "balanced" matches today's default behavior
  // (prioritize graded C1/C2 by rarity, per task #9); "practical" and "rare" bias that further.
  const [wordPref, setWordPrefState] = useState<'practical' | 'balanced' | 'rare'>('balanced');

  useEffect(() => {
    // Content sync: pull any words added server-side and merge into local SQLite
    // (single consolidated path; offline / no table => no-op, bundled corpus serves).
    initSync();
    // User-data sync: if signed in, pull cross-device state (saved/review/progress)
    // and push local up. No-ops when signed out / offline.
    syncUserData().catch(() => {});
    (async () => {
      // RevenueCat init (no-op if key missing in the scaffold)
      const key = Platform.select({
        ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
        android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
      });
      // Only configure with a real RevenueCat public SDK key (ios: appl_, android: goog_).
      // Skips placeholder keys so the dev console isn't flooded with 401s - whose
      // LogBox toast can otherwise intercept touches while testing.
      const validKey = !!key && ((Platform.OS === 'ios' && key.startsWith('appl_')) || (Platform.OS === 'android' && key.startsWith('goog_')));
      try {
        if (validKey) {
          Purchases.configure({ apiKey: key! });
          await refreshEntitlement();
        }
      } catch {}
      setOnboarded((await AsyncStorage.getItem(ONBOARDED_KEY)) === '1');
      setTestPro((await AsyncStorage.getItem('vorto.testPro')) === '1');
      const compProExpiresAt = await AsyncStorage.getItem('vorto.compProExpiresAt');
      const compProExpired = !!compProExpiresAt && Date.now() >= +compProExpiresAt;
      if (compProExpired) {
        AsyncStorage.multiRemove(['vorto.compPro', 'vorto.compProExpiresAt']).catch(() => {});
        setCompPro(false);
      } else {
        setCompPro((await AsyncStorage.getItem('vorto.compPro')) === '1');
      }
      const g = await AsyncStorage.getItem('vorto.goal');
      if (g) setGoalState(+g);
      const f = await AsyncStorage.getItem('vorto.field');
      if (f === 'med' || f === 'law' || f === 'biz' || f === 'gen' || f === 'new') setFieldState(f);
      const nm = await AsyncStorage.getItem('vorto.name');
      if (nm) setNameState(nm);
      const ac = await AsyncStorage.getItem('vorto.accent');
      if (ac === 'gold' || ac === 'sage' || ac === 'rust' || ac === 'ocean' || ac === 'rose' || ac === 'violet') setAccentState(ac);
      const th = await AsyncStorage.getItem('vorto.theme'); // persist an explicit dark/light choice across launches
      if (th === 'dark' || th === 'light') setOverride(th);
      const snd = await AsyncStorage.getItem('vorto.sound');
      const soundOn = snd !== '0';
      setSoundState(soundOn);
      setSfxEnabled(soundOn);
      if (soundOn) preloadSfx();
      const fp = await AsyncStorage.getItem('vorto.feedPhotos');
      setFeedPhotosState(fp === '1'); // default OFF for first-time users (null → off); opt-in via Profile
      const wp = await AsyncStorage.getItem('vorto.wordPref');
      if (wp === 'practical' || wp === 'balanced' || wp === 'rare') setWordPrefState(wp);
      const ed = await AsyncStorage.getItem('vorto.examDate');
      if (ed) setExamDateState(ed);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    syncWidget({ field }).catch(() => {});
    rescheduleReminders(field).catch(() => {});
  }, [field]);

  // Back up user data to the cloud on background; refresh the widget's word queue
  // on every FOREGROUND so it keeps advancing to fresh, never-repeating words
  // (not just once at launch).
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'background') pushUserData().catch(() => {});
      else if (s === 'active') syncWidget({ field }).catch(() => {});
    });
    return () => sub.remove();
  }, [field]);

  const refreshEntitlement = async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      // Unlock on the named entitlement OR any active one (robust to RC naming).
      const active = info.entitlements.active;
      setIsPro(DEV_FORCE_PRO || !!active[ENTITLEMENT] || Object.keys(active).length > 0);
    } catch { /* leave as-is */ }
  };

  const setField = (f: FieldId) => { setFieldState(f); AsyncStorage.setItem('vorto.field', f).catch(() => {}); };
  const setName = (n: string) => { setNameState(n); AsyncStorage.setItem('vorto.name', n).catch(() => {}); };
  const setGoal = (n: number) => { setGoalState(n); AsyncStorage.setItem('vorto.goal', String(n)).catch(() => {}); };
  const setTheme = (t: 'dark' | 'light') => { setOverride(t); AsyncStorage.setItem('vorto.theme', t).catch(() => {}); };
  const setAccent = (a: AccentId) => { setAccentState(a); AsyncStorage.setItem('vorto.accent', a).catch(() => {}); };
  const setSound = (v: boolean) => { setSoundState(v); setSfxEnabled(v); if (v) preloadSfx(); AsyncStorage.setItem('vorto.sound', v ? '1' : '0').catch(() => {}); };
  const setFeedPhotos = (v: boolean) => { setFeedPhotosState(v); AsyncStorage.setItem('vorto.feedPhotos', v ? '1' : '0').catch(() => {}); };
  const setWordPref = (v: 'practical' | 'balanced' | 'rare') => { setWordPrefState(v); AsyncStorage.setItem('vorto.wordPref', v).catch(() => {}); };
  const setExamDate = (d: string | null) => { setExamDateState(d); if (d) AsyncStorage.setItem('vorto.examDate', d).catch(() => {}); else AsyncStorage.removeItem('vorto.examDate').catch(() => {}); };
  // Merge the chosen accent into the base palette so every `co.accent` surface
  // (buttons, chips, active tiles, progress, checks) re-tints app-wide. `ink` (the
  // text color ON accent fills) follows the accent too: the per-theme default is
  // calibrated against gold, and a preset whose hue sits in a different lightness
  // register carries its own hand-tuned override (see ACCENTS in theme/tokens.ts).
  const base = theme === 'light' ? light : dark;
  const palette: Palette = { ...base, accent: accentHex(accent, theme), ink: accentInk(accent, theme) ?? base.ink };
  const completeOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDED_KEY, '1');
    setOnboarded(true);
  };

  return (
    <Ctx.Provider value={{ ready, onboarded, isPro: isPro || (__DEV__ && testPro) || compPro, field, name, goal, theme, accent, sound, feedPhotos, wordPref, examDate, palette, setField, setName, setGoal, setTheme, setAccent, setSound, setFeedPhotos, setWordPref, setExamDate, completeOnboarding, refreshEntitlement, testPro, toggleTestPro, grantPro }}>
      {children}
    </Ctx.Provider>
  );
}
