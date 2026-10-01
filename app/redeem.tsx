import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import BackButton from '../components/BackButton';
import PressBounce from '../components/PressBounce';
import { useApp } from '../lib/app-state';
import { supabase } from '../lib/supabase';
import { fonts, label, Palette } from '../theme/tokens';

// Redeem a Lexfall COMP code (full free access) — validated against a Supabase
// `redeem_codes` table (columns: code text, active bool). App Store DISCOUNT codes
// are redeemed through Apple's own sheet (link at the bottom).
export default function Redeem() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { palette: co, grantPro, isPro } = useApp();
  const s = makeStyles(co);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const redeem = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 3) return;
    setBusy(true);
    try {
      // Code validation is handled server-side and is intentionally omitted from this public
      // repo (no table or query details are exposed here). In the app, a valid code returns its
      // { duration_days }; here it is stubbed so no backend access pattern is revealed.
      const data: { duration_days: number | null } | null = null;
      const error = null;
      setBusy(false);
      if (!error && data) {
        grantPro(data.duration_days);
        const msg = data.duration_days
          ? `Your code worked — Lexfall Premium is unlocked for ${data.duration_days} days. Enjoy!`
          : 'Your code worked — Lexfall Premium is unlocked. Enjoy!';
        Alert.alert('Unlocked', msg, [{ text: 'Great', onPress: () => router.replace('/(tabs)') }]);
      } else {
        Alert.alert('Invalid code', 'That code isn’t valid or has expired.');
      }
    } catch {
      setBusy(false);
      Alert.alert('Couldn’t check code', 'Please try again with a connection.');
    }
  };

  const appleCode = () => {
    try { require('react-native-purchases').default.presentCodeRedemptionSheet(); }
    catch { Alert.alert('Not available', 'Open the App Store to redeem an offer code.'); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <View style={[s.top, { paddingTop: insets.top + 8 }]}><BackButton onPress={() => router.back()} co={co} /></View>
      <View style={{ paddingHorizontal: 26 }}>
        <Text style={[label, { color: co.accent }]}>REDEEM</Text>
        <Text style={s.h2}>Have a code?</Text>
        <Text style={s.sub}>Enter a Lexfall access code to unlock Premium.</Text>
        <TextInput value={code} onChangeText={setCode} placeholder="Enter code" placeholderTextColor={co.faint} autoCapitalize="characters" autoCorrect={false} style={s.input} />
        <PressBounce style={[s.btn, (busy || code.trim().length < 3) && { opacity: 0.4 }]} onPress={redeem} disabled={busy || code.trim().length < 3 || isPro}>
          <Text style={s.btnText}>{busy ? 'Checking…' : isPro ? 'Already unlocked' : 'Unlock Premium'}</Text>
        </PressBounce>
        <Pressable onPress={appleCode} hitSlop={8} style={{ marginTop: 22, alignItems: 'center' }}>
          <Text style={s.link}>Have an App Store discount code? Redeem it here</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  top: { paddingHorizontal: 24, paddingBottom: 8 },
  h2: { fontFamily: fonts.serif, fontSize: 30, color: co.text, marginTop: 8 },
  sub: { fontFamily: fonts.sans, fontSize: 15, color: co.muted, marginTop: 8, lineHeight: 22 },
  input: { fontFamily: fonts.sansMedium, fontSize: 20, letterSpacing: 2, color: co.text, borderWidth: 1, borderColor: co.line2, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18, marginTop: 26, textAlign: 'center' },
  btn: { backgroundColor: co.accent, borderRadius: 13, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  btnText: { fontFamily: fonts.sansSemi, fontSize: 15.5, color: co.ink },
  link: { fontFamily: fonts.sans, fontSize: 13.5, color: co.muted, textDecorationLine: 'underline' },
});
