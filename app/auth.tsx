import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { t } from '../lib/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { signInWithApple, signInWithGoogle, updateProfile } from '../lib/supabase';
import { syncUserData } from '../lib/user-sync';
import { logInPurchases } from '../lib/purchases';
import { useApp } from '../lib/app-state';
import BackButton from '../components/BackButton';
import { fonts, label, Palette } from '../theme/tokens';

WebBrowser.maybeCompleteAuthSession();

export default function Auth() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { field, name, completeOnboarding, theme, palette: co } = useApp();
  const styles = makeStyles(co);

  const finish = async () => {
    // persist the chosen field + name to the profile (best-effort)
    await updateProfile({ field, name }).catch(() => {});
    // Restore/back up cross-device data now that a session exists (no-op if sign-in was skipped).
    syncUserData().catch(() => {});
    await completeOnboarding();
    // Hard paywall: the paywall passes straight through if the user is already
    // entitled (or before any products exist), otherwise it gates access.
    router.replace('/paywall');
  };

  const apple = async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (cred.identityToken) {
        const res = await signInWithApple(cred.identityToken);
        const uid = res?.data?.user?.id;
        if (uid) await logInPurchases(uid); // tie the subscription to the account
      }
    } catch { /* cancelled */ }
    await finish();
  };

  const google = async () => {
    try {
      const redirectTo = makeRedirectUri({ scheme: 'vorto' });
      const { data } = await signInWithGoogle(redirectTo);
      if (data?.url) await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    } catch { /* cancelled */ }
    await finish();
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
      <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} co={co} />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={[label, { color: co.accent }]}>{t('auth.keepProgress')}</Text>
        <Text style={styles.title}>Save your words{name ? `, ${name}` : ''}</Text>
        <Text style={styles.sub}>Sign in so your streak, saved words and progress follow you to every device.</Text>
      </View>

      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={theme === 'light' ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={13}
          style={styles.apple}
          onPress={apple}
        />
      )}
      <Pressable style={styles.google} onPress={google}><Text style={styles.googleTxt}>{t('auth.continueGoogle')}</Text></Pressable>
      <Pressable onPress={finish}><Text style={styles.skip}>{t('common.maybeLater')} ›</Text></Pressable>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: co.bg, paddingHorizontal: 28 },
  title: { fontFamily: fonts.serif, fontSize: 30, color: co.text, marginTop: 16, marginBottom: 12 },
  sub: { fontFamily: fonts.sans, fontSize: 14.5, color: co.muted, lineHeight: 22 },
  apple: { height: 52, marginBottom: 12 },
  google: { height: 52, borderRadius: 13, borderWidth: 1, borderColor: co.line2, alignItems: 'center', justifyContent: 'center' },
  googleTxt: { fontFamily: fonts.sansSemi, fontSize: 15.5, color: co.text },
  skip: { fontFamily: fonts.sans, fontSize: 12, color: co.faint, textAlign: 'center', marginTop: 16, textDecorationLine: 'underline' },
});
