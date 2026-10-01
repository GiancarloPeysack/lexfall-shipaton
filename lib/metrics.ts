import AsyncStorage from '@react-native-async-storage/async-storage';

// Lightweight cumulative quiz metrics + level, stored in AsyncStorage.
const ANS_KEY = 'vorto.answers';   // { correct, total }
const LEVEL_KEY = 'vorto.level';   // 'B2' | 'C1' | 'C2'

export async function recordAnswer(correct: boolean) {
  try {
    const raw = await AsyncStorage.getItem(ANS_KEY);
    const a = raw ? JSON.parse(raw) : { correct: 0, total: 0 };
    a.total += 1;
    if (correct) a.correct += 1;
    await AsyncStorage.setItem(ANS_KEY, JSON.stringify(a));
  } catch {}
}

export async function getAccuracy(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(ANS_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw);
    if (!a.total) return null;
    return Math.round((a.correct / a.total) * 100);
  } catch { return null; }
}

export async function getLevel(): Promise<string> {
  try { return (await AsyncStorage.getItem(LEVEL_KEY)) || '-'; } catch { return '-'; }
}
