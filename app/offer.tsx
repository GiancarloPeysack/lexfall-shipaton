import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, Linking, StyleSheet } from 'react-native';
import { t } from '../lib/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PurchasesPackage, PurchasesOffering } from 'react-native-purchases';
import { useApp } from '../lib/app-state';
import { getOffering, purchase, restore, periodLabel } from '../lib/purchases';
import BackButton from '../components/BackButton';
import Illo from '../components/Illustrations';
import { fonts, Palette } from '../theme/tokens';

// Win-back: shown once when a user declines the trial. A time-boxed discount on
// the annual plan - the classic "we want you back" save offer.
export default function Offer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshEntitlement, palette: co } = useApp();
  const styles = makeStyles(co);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const leave = () => router.replace('/welcome');

  useEffect(() => {
    (async () => {
      const o = await getOffering();
      const live = o?.availablePackages ?? [];
      const a = live.find((p) => periodLabel(p) === 'Yearly');
      const m = live.find((p) => periodLabel(p) === 'Monthly');
      // Never advertise a discount we can't actually sell - this screen needs
      // BOTH live prices and a genuine saving to show honest math. If either
      // product is missing (dev, or products not configured) or the annual
      // isn't actually cheaper, skip straight to the app. No fabricated
      // fallback prices, ever.
      const real = !!a && !!m && a.product.price > 0 && m.product.price > 0 && a.product.price < m.product.price * 12;
      if (!o || !real) { router.replace('/welcome'); return; }
      await AsyncStorage.setItem('vorto.offerShown', '1').catch(() => {});
      setOffering(o);
      setLoading(false);
    })();
  }, []);

  const pkgs = offering?.availablePackages ?? [];
  const annual = pkgs.find((p) => periodLabel(p) === 'Yearly') as PurchasesPackage | undefined;
  const monthly = pkgs.find((p) => periodLabel(p) === 'Monthly') as PurchasesPackage | undefined;

  // Real numbers only - the effect above guarantees both products are live
  // (with a genuine discount) before the offering is set, so nothing here is
  // ever rendered from invented prices.
  const cur = (annual?.product as any)?.currencyCode || '';
  const sym = annual?.product.priceString?.replace(/[\d.,\s]/g, '') || '';
  const fmt = (n: number) => (sym && sym.length <= 2 ? `${sym}${n.toFixed(2)}` : `${n.toFixed(2)} ${cur}`.trim());
  const nowNum = annual?.product.price ?? 0;
  const origNum = monthly ? monthly.product.price * 12 : 0;
  const nowStr = annual?.product.priceString || fmt(nowNum);
  const origStr = fmt(origNum);
  const pct = origNum > nowNum && origNum > 0 ? Math.round((1 - nowNum / origNum) * 100) : 0;
  const perMonthNow = fmt(nowNum / 12);
  const perMonthOrig = monthly?.product.priceString || fmt(origNum / 12);

  const claim = async () => {
    if (!annual) { leave(); return; }
    setBusy(true);
    const { ok, cancelled } = await purchase(annual);
    setBusy(false);
    if (ok) { await refreshEntitlement(); router.replace('/(tabs)'); }
    else if (!cancelled) Alert.alert('Purchase failed', 'Something went wrong. Please try again.');
  };

  const onRestore = async () => {
    setBusy(true);
    const ok = await restore();
    setBusy(false);
    if (ok) { await refreshEntitlement(); router.replace('/(tabs)'); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={leave} co={co} variant="close" />
      </View>

      <View style={styles.body}>
        <View style={styles.hero}><Illo name="coins" co={co} size={168} /></View>
        <Text style={styles.pct}>{pct}% off</Text>
        <Text style={styles.h2}>Lexfall Premium</Text>

        <View style={styles.cards}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('offer.originalPrice')}</Text>
            <Text style={styles.cardOrig}>{origStr}/year</Text>
            <Text style={styles.cardPer}>{perMonthOrig}/month</Text>
          </View>
          <View style={[styles.card, styles.cardNow]}>
            <Text style={[styles.cardLabel, { color: co.ink }]}>{t('offer.yourPriceNow')}</Text>
            <Text style={styles.cardNowPrice}>{nowStr}/year</Text>
            <Text style={[styles.cardPer, { color: co.ink, opacity: 0.7 }]}>{perMonthNow}/month</Text>
          </View>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable style={styles.cta} onPress={claim} disabled={busy}>
          {busy ? <ActivityIndicator color={co.ink} /> : <Text style={styles.ctaText}>{t('offer.claim')}</Text>}
        </Pressable>
        <Text style={styles.disclosure}>{t('paywall.autoRenew')}</Text>
        <View style={styles.legalRow}>
          <Pressable onPress={onRestore} hitSlop={8}><Text style={styles.legal}>{t('paywall.restore')}</Text></Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={() => Linking.openURL('https://luxfall.online/terms').catch(() => {})} hitSlop={8}><Text style={styles.legal}>{t('offer.terms')}</Text></Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={() => Linking.openURL('https://luxfall.online/privacy').catch(() => {})} hitSlop={8}><Text style={styles.legal}>{t('paywall.privacy')}</Text></Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={leave} hitSlop={8}><Text style={styles.legal}>{t('common.notNow')}</Text></Pressable>
        </View>
      </View>

      {loading && <View style={styles.veil}><ActivityIndicator color={co.accent} /></View>}
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  top: { paddingHorizontal: 24, paddingBottom: 8 },
  body: { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: 10 },
  pct: { fontFamily: fonts.serif, fontSize: 64, color: co.text, textAlign: 'center', letterSpacing: -1 },
  h2: { fontFamily: fonts.serif, fontSize: 30, color: co.text, textAlign: 'center', marginTop: 4 },
  cards: { flexDirection: 'row', gap: 14, marginTop: 34 },
  card: { flex: 1, borderRadius: 18, borderWidth: 1, borderColor: co.line2, padding: 18, alignItems: 'center' },
  cardNow: { backgroundColor: co.accent, borderColor: co.accent },
  cardLabel: { fontFamily: fonts.sans, fontSize: 14, color: co.muted },
  cardOrig: { fontFamily: fonts.sansSemi, fontSize: 20, color: co.text, marginTop: 10, textDecorationLine: 'line-through' },
  cardNowPrice: { fontFamily: fonts.sansSemi, fontSize: 20, color: co.ink, marginTop: 10 },
  cardPer: { fontFamily: fonts.sans, fontSize: 13, color: co.muted, marginTop: 6 },
  footer: { paddingHorizontal: 28, paddingTop: 12 },
  cta: { backgroundColor: co.accent, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  ctaText: { fontFamily: fonts.sansSemi, fontSize: 16.5, color: co.ink },
  disclosure: { fontFamily: fonts.sans, fontSize: 11, color: co.faint, lineHeight: 16, textAlign: 'center', marginTop: 14 },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  legal: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted },
  legalDot: { color: co.faint },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: co.bg, alignItems: 'center', justifyContent: 'center' },
});
