import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// AsyncStorage-backed session so the user stays signed in across app restarts
// (required for cloud sync to restore on launch via the INITIAL_SESSION event).
export const supabase = createClient(url ?? '', anon ?? '', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

export type Profile = {
  id: string;
  name: string | null;
  field: 'med' | 'law' | 'biz' | 'gen' | 'new';
  words_per_day: number;
  active_from: number;
  active_to: number;
  is_pro: boolean;
};

export async function getProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return (data as Profile) ?? null;
}

export async function updateProfile(patch: Partial<Profile>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('profiles').update(patch).eq('id', user.id);
}

// Sign in with Apple (native) → Supabase session via the identity token.
export async function signInWithApple(identityToken: string) {
  return supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken });
}

// Sign in with Google via Supabase OAuth (opens a browser, returns to the app).
export async function signInWithGoogle(redirectTo: string) {
  return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
}

// Delete the account. Full server-side row deletion should run via a Supabase
// Edge Function (service role) invoked here; for now we sign the user out so the
// session is cleared. Wire the edge function when the backend is live.
export async function deleteAccount() {
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    // Preferred: the 'delete-account' Edge Function erases the data AND the auth.users
    // record (GDPR-complete). See server/functions/delete-account/index.ts.
    const fn = await supabase.functions.invoke('delete-account').catch(() => ({ error: true as any }));
    if ((fn as any)?.error && uid) {
      // Fallback until the function is deployed: at least remove the data rows
      // (RLS scopes these to the caller). The auth.users row remains until deploy.
      await Promise.all([
        supabase.from('saved_words').delete().eq('user_id', uid),
        supabase.from('review_state').delete().eq('user_id', uid),
        supabase.from('daily_progress').delete().eq('user_id', uid),
        supabase.from('profiles').delete().eq('id', uid),
      ]);
    }
    await supabase.auth.signOut();
  } catch {}
}
