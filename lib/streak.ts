import AsyncStorage from '@react-native-async-storage/async-storage';

// APP-OPEN STREAK (owner model, 2026-09-25). The ONE user-facing streak in Lexfall is the number
// of consecutive calendar days on which the user OPENED the app at least once. Opening the app
// always surfaces a word, so an open is itself a meaningful daily rep — this is what the streak
// rewards. It REPLACES the old daily-test-COMPLETION streak (lib/daily-test.ts) as the
// user-facing streak shown on the feed top bar and the Progress tab.
//
// The daily TEST no longer has a streak at all: it drives ADVANCEMENT (mastery) only. The internal
// daily-test-completion streak in lib/daily-test.ts is kept solely for the home-screen widgets and
// the OneSignal Streak-Saver tags (which still read it) until those are repointed here.
//
// Storage is truthful: alongside the count we persist the actual set of opened days
// (`openStreakDays`), so the week strip marks exactly the days that were opened rather than
// back-deriving them from count + last-date (which can't represent a real gap honestly).

const COUNT_KEY = 'vorto.openStreak';       // consecutive-day count ending at lastDate
const LAST_KEY = 'vorto.openStreakLast';    // YYYY-MM-DD of the most recent open
const DAYS_KEY = 'vorto.openStreakDays';    // JSON string[] of recent opened days (yyyy-mm-dd)
const SIGNUP_KEY = 'vorto.signupDate';      // YYYY-MM-DD of the user's first launch (write-once)

const KEEP_DAYS = 21; // enough recent opens to render this week's + last week's strip truthfully

export type AppOpenStreak = { count: number; lastDate: string | null; days: string[] };

const pad = (n: number) => String(n).padStart(2, '0');
const dateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dateStr(new Date());
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dateStr(d); };

// Raw stored values, with NO break detection applied (used internally by recordAppOpen so it can
// see the true stored count/last-date before deciding whether today continues or resets the run).
async function readRaw(): Promise<AppOpenStreak> {
  const [c, last, daysRaw] = await Promise.all([
    AsyncStorage.getItem(COUNT_KEY).catch(() => null),
    AsyncStorage.getItem(LAST_KEY).catch(() => null),
    AsyncStorage.getItem(DAYS_KEY).catch(() => null),
  ]);
  let days: string[] = [];
  try { days = daysRaw ? JSON.parse(daysRaw) : []; } catch { days = []; }
  return { count: c ? parseInt(c, 10) || 0 : 0, lastDate: last, days };
}

// Read-only. The count self-heals: if the last open is older than yesterday a full day was skipped,
// so the live streak is broken and reads 0 until the next open re-seeds it (the raw stored count is
// left untouched — recordAppOpen is what rewrites it). `days` is always the real opened-days set.
export async function getAppOpenStreak(): Promise<AppOpenStreak> {
  const raw = await readRaw();
  if (raw.lastDate && raw.lastDate !== todayStr() && raw.lastDate !== yesterdayStr()) {
    return { count: 0, lastDate: raw.lastDate, days: raw.days };
  }
  return raw;
}

// Call once per launch (idempotent within a calendar day). The first open of a new day increments
// the streak — or resets it to 1 if a whole day was missed — and records today in the opened-days
// set. Subsequent opens the same day are a no-op. Returns the resulting streak.
export async function recordAppOpen(): Promise<AppOpenStreak> {
  const today = todayStr();
  const raw = await readRaw();
  if (raw.lastDate === today) return raw; // already counted today's open
  const count = raw.lastDate === yesterdayStr() ? raw.count + 1 : 1; // consecutive → +1, else fresh run
  const days = [...new Set([...raw.days, today])].sort().slice(-KEEP_DAYS);
  await Promise.all([
    AsyncStorage.setItem(COUNT_KEY, String(count)),
    AsyncStorage.setItem(LAST_KEY, today),
    AsyncStorage.setItem(DAYS_KEY, JSON.stringify(days)),
  ]).catch(() => {});
  return { count, lastDate: today, days };
}

// The user's signup day (their first launch), for "don't call pre-signup days missed" logic on
// the Journey path and anywhere else that grades days the user wasn't here for. Write-once: if
// unset it seeds from the EARLIEST recorded app-open day (so existing users keep their real
// history) or today (a brand-new install), then persists so it can never move afterwards.
// Idempotent and safe to call from any surface; _layout.tsx calls it once on launch so the key
// exists before any consumer needs it.
export async function getSignupDate(): Promise<string> {
  const stored = await AsyncStorage.getItem(SIGNUP_KEY).catch(() => null);
  if (stored) return stored;
  const raw = await readRaw();
  const seed = raw.days.length ? [...raw.days].sort()[0] : todayStr();
  await AsyncStorage.setItem(SIGNUP_KEY, seed).catch(() => {});
  return seed;
}

// This calendar week Monday→Sunday, each day flagged from the REAL opened-days set (not derived
// from count) plus a today marker — for the feed top-bar pips and the Progress week strip.
export function weekOpenStrip(days: string[]): { date: string; done: boolean; isToday: boolean }[] {
  const set = new Set(days);
  const today = todayStr();
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // back up to this week's Monday
  const out: { date: string; done: boolean; isToday: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const ds = dateStr(d);
    out.push({ date: ds, done: set.has(ds), isToday: ds === today });
  }
  return out;
}
