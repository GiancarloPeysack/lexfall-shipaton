import { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, Alert, Linking, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useRootNavigationState } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import type { PurchasesPackage, PurchasesOffering } from 'react-native-purchases';
import { useApp } from '../lib/app-state';
import { getOffering, purchase, restore, periodLabel } from '../lib/purchases';
import { scheduleTrialReminder } from '../lib/notifications';
import { introTrialDays } from '../lib/purchases';
import { track, Events } from '../lib/analytics';
import { t } from '../lib/i18n';
import type { FieldId } from '../data/types';
import FadeIn from './FadeIn';
import PressBounce from './PressBounce';
import { fonts, label, Palette } from '../theme/tokens';

// ── ONE paywall for every surface (onboarding trial, hard wall, win-back offer, feed wall). ──
// Compliance (Restore + Terms + Privacy + auto-renew disclosure) and a PRICE-BEARING CTA are
// rendered on EVERY variant, so 3.1.2 can't regress on one surface.

// 2026-09 redesign: the old 5-bullet list + a separately-fixed pricing/CTA/legal footer competed
// for the same fixed screen height - on real devices the footer's intrinsic height (2-3 price
// cards + a price-bearing CTA + the auto-renew paragraph + Restore + the legal row) regularly ate
// most of the viewport, squeezing the perks ScrollView down to 1-2 visible bullets. The structural
// fix: the WHOLE screen (header, bullets, pricing, CTA, disclosure, restore, legal) is now ONE
// ScrollView, top-aligned and naturally sized, instead of a scroll+fixed-footer split - nothing
// competes for a fixed slice of height anymore, so a short device or a 2-line headline just
// scrolls instead of silently clipping bullets. (An earlier pass here also shrank the bullet list
// to 3 and center-justified the content to force everything above the fold - reverted: on the
// actual device that traded one visible problem for another, leaving large dead margins above and
// below a small centered cluster while still working just as well at natural size. All 5 bullets
// read fine at their original scale; the single-ScrollView fix alone was the real cure for the
// clipping bug.)
const PERK_KEYS = ['paywall.perk1', 'paywall.perk2', 'paywall.perk3', 'paywall.perk4', 'paywall.perk5'];
const TERMS_URL = 'https://luxfall.online/terms';
const PRIVACY_URL = 'https://luxfall.online/privacy';
const commas = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Echoes the exact "words known in a year" math from onboarding's ProjectionScreen, right at the
// purchase decision - the personalized pace/outcome the user just set is a stronger, more concrete
// value prop than a generic feature bullet, and reusing real computed numbers keeps it honest.
// Only available where perDay/library are known live (the onboarding paywall); other surfaces fall
// back to the plain feature list.
function personalizedPerk(perDay?: number, library?: number): string | null {
  if (!perDay || !library) return null;
  const target = Math.min(perDay * 365, library);
  return `Your plan: ${perDay} words a day — you'll know ~${commas(target)} in a year`;
}

export type PaywallVariant = 'onboarding' | 'hard' | 'offer' | 'wall';

// An intro offer can be a genuine $0 trial (Yearly, Monthly) OR a paid discount, like Weekly's
// real ASC-configured "$1.99 for the first week" - those need different wording (calling a paid
// discount a "free trial" would be false advertising), so this reports both the display text and
// whether it's actually free, and every caller below picks the right one for its purpose.
function introOffer(pkg: PurchasesPackage): { note: string; free: boolean } | null {
  const intro: any = (pkg.product as any).introPrice;
  const n = intro?.periodNumberOfUnits ?? 0;
  const unit = (intro?.periodUnit || '').toString().toLowerCase();
  if (!intro || !n) return null;
  const free = !intro.price || intro.price <= 0;
  const note = free
    ? `${n}-${unit.replace(/s$/, '')} free trial`
    : `${intro.priceString} first ${n > 1 ? `${n} ${unit}s` : unit}`;
  return { note, free };
}

// Track-aware headline. Leads with mastery, NOT the free-trial language (3.1.2: trial must not
// be more prominent than price), and adapts to the onboarding field when known. A specific
// specialty (e.g. "Cardiology", "Litigation") sharpens this further than the field alone can -
// it's the exact identity the user picked a few screens earlier, so the paywall echoes it back
// instead of regressing to the generic field-level phrase.
// The REAL app icon (assets/icon.png), not a redrawn approximation - ties the paywall to the
// actual mark users see on their home screen instead of the generic sparkle every other app's
// paywall uses.
function LMark() {
  return <Image source={require('../assets/icon.png')} style={{ width: 26, height: 26, borderRadius: 6 }} />;
}

function headlineFor(field: FieldId | undefined, specialty?: string): string {
  if (specialty) return `Master the advanced\nlexicon of ${specialty}`;
  // "Medical/legal/business English" is ESL-industry phrasing (the same pattern OET/TOLES
  // course listings use) - it implicitly frames the reader as still acquiring English itself,
  // which contradicts the app's native-inclusive positioning. "The language of X" anchors on
  // the PROFESSION, not English, matching the sceneField screen's already-correct "the words
  // {field} runs on" pattern - register mastery, not language acquisition.
  const phrase = field === 'med' ? 'the language of medicine'
    : field === 'law' ? 'the language of law'
    : field === 'biz' ? 'the language of business'
    : 'advanced English';
  return `Master ${phrase}`;
}

export function PaywallView({
  variant,
  field,
  specialty,
  perDay,
  library,
  onPurchased,
  onClose,
  showExitOffer,
}: {
  variant: PaywallVariant;
  field?: FieldId;
  specialty?: string;
  perDay?: number;
  library?: number;
  onPurchased: () => void;
  onClose?: () => void;
  showExitOffer?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navState = useRootNavigationState();
  const { isPro, refreshEntitlement, palette: co } = useApp();
  const s = makeStyles(co);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState(false);
  const exitOfferOn = showExitOffer ?? (variant === 'hard' || variant === 'wall');

  useEffect(() => { track(Events.PaywallView, { variant }); }, [variant]);

  useEffect(() => {
    if (isPro) {
      // This branch never shows the price UI, so don't leave the loading spinner up while
      // waiting on the navigator - an already-entitled user staring at a stuck spinner (real
      // report: paywall spinning forever) is exactly what this was silently doing before.
      setLoading(false);
      // A cold deep-link straight to a paywall surface can reach this effect before the root
      // Stack has mounted - navigating (onPurchased -> router.replace) that early throws
      // "Attempted to navigate before mounting the Root Layout" (same race already guarded in
      // _layout.tsx's notification-tap handler). Wait for the navigator, then this re-fires.
      if (navState?.key) { onPurchased(); return; }
      // Hard safety net: if navState.key never arrives (whatever the exact cause - this used to
      // hang indefinitely with no fallback), force through anyway after a few seconds rather than
      // strand an already-entitled user on a stalled paywall forever. Cleared/superseded the
      // moment navState.key does arrive, since that reruns this effect via the dep array.
      const t = setTimeout(() => { if (!navState?.key) onPurchased(); }, 4000);
      return () => clearTimeout(t);
    }
    (async () => {
      const o = await getOffering();
      if (o) {
        const pkgs = [...o.availablePackages].sort(
          (a, b) => (periodLabel(b) === 'Yearly' ? 1 : 0) - (periodLabel(a) === 'Yearly' ? 1 : 0)
        );
        (o as any).availablePackages = pkgs;
        setOffering(o);
        const annualIdx = pkgs.findIndex((p) => periodLabel(p) === 'Yearly');
        setSel(annualIdx >= 0 ? annualIdx : 0);
      }
      setLoading(false);
    })();
  }, [isPro, navState?.key]);

  const pkgs = offering?.availablePackages ?? [];
  const annualPkg = pkgs.find((p) => periodLabel(p) === 'Yearly');
  const monthlyPkg = pkgs.find((p) => periodLabel(p) === 'Monthly');
  const weeklyPkg = pkgs.find((p) => periodLabel(p) === 'Weekly');
  const offerPkg = monthlyPkg ?? pkgs.find((p) => periodLabel(p) !== 'Yearly');

  // Yearly card's headline is its own per-week equivalent (2026-09-17: "$0.99/wk" anchor
  // pricing, not the raw annual total) - live prices only, never hardcoded. savePct compares
  // that equivalent against whichever real weekly-cost plan is actually live: prefer the real
  // Weekly package's own price (what this paywall actually sells today), fall back to
  // monthly×12/52 only if Weekly isn't in the offering (keeps this correct if the lineup changes).
  let savePct: number | null = null;
  let perWeek: string | null = null;
  if (annualPkg && annualPkg.product.price > 0) {
    const annualWeeklyRate = annualPkg.product.price / 52;
    const sym = annualPkg.product.priceString?.replace(/[\d.,\s]/g, '') || '';
    const cur = (annualPkg.product as any).currencyCode || '';
    const n = annualWeeklyRate.toFixed(2);
    perWeek = sym && sym.length <= 2 ? `${sym}${n}` : `${n} ${cur}`.trim();

    const comparisonWeeklyRate = weeklyPkg && weeklyPkg.product.price > 0
      ? weeklyPkg.product.price
      : monthlyPkg && monthlyPkg.product.price > 0
        ? (monthlyPkg.product.price * 12) / 52
        : null;
    if (comparisonWeeklyRate) {
      const pct = Math.round((1 - annualWeeklyRate / comparisonWeeklyRate) * 100);
      if (pct > 0) savePct = pct;
    }
  }

  const trialNoteFor = (pkg: PurchasesPackage): string | null => introOffer(pkg)?.note ?? null;
  const isFreeTrial = (pkg: PurchasesPackage): boolean => introOffer(pkg)?.free ?? false;

  const selPkg = pkgs[sel];
  const selTrial = selPkg ? trialNoteFor(selPkg) : null;
  const selFreeTrial = selPkg ? isFreeTrial(selPkg) : false;

  const perkList = (() => {
    const list = PERK_KEYS.map((k) => t(k));
    // PERK_KEYS[1] is the "full lexicon" bullet - the personalized "your plan" number is a
    // strictly stronger version of the same claim (concrete vs generic), so it replaces that
    // slot rather than sitting awkwardly alongside it.
    const dyn = personalizedPerk(perDay, library);
    if (dyn) list[1] = dyn;
    return list;
  })();

  // PRICE-BEARING CTA: the billed amount is in the button, so trial language is never dominant.
  const ctaLabel = (): string => {
    if (busy) return t('paywall.wait');
    if (!selPkg) return t('common.continue');
    const price = `${selPkg.product.priceString}/${periodLabel(selPkg) === 'Yearly' ? 'year' : periodLabel(selPkg) === 'Monthly' ? 'month' : 'week'}`;
    return selFreeTrial ? `Start free trial, then ${price}` : `Subscribe · ${price}`;
  };

  const buyPkg = async (pkg?: PurchasesPackage, isOfferClaim = false) => {
    if (!pkg) return;
    setBusy(true);
    const { ok, cancelled } = await purchase(pkg);
    setBusy(false);
    if (ok) {
      const trial = isFreeTrial(pkg);
      track(Events.PurchaseSuccess, { plan: periodLabel(pkg), trial, variant });
      if (trial) {
        track(Events.TrialStart, { plan: periodLabel(pkg) });
        // Nudge one day before the trial ends, derived from the real trial length (not a hardcoded
        // 7/5 - a 3-day trial would otherwise fire the reminder AFTER billing).
        const td = introTrialDays(pkg) ?? 3;
        scheduleTrialReminder(td, Math.max(1, td - 1)).catch(() => {});
      }
      await refreshEntitlement();
      onPurchased();
      return;
    }
    if (cancelled) {
      if (!isOfferClaim && !offer && exitOfferOn && offerPkg) setOffer(true);
      return;
    }
    Alert.alert('Purchase failed', 'Something went wrong. Please try again.');
  };
  const buy = () => buyPkg(selPkg);
  const claimOffer = () => { setOffer(false); buyPkg(offerPkg ?? selPkg, true); };

  const onRestore = async () => {
    setBusy(true);
    const ok = await restore();
    setBusy(false);
    if (ok) { track(Events.PurchaseRestore); await refreshEntitlement(); onPurchased(); }
    else Alert.alert('Nothing to restore', 'We couldn’t find an active subscription for this Apple ID.');
  };

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      {onClose && (
        <PressBounce onPress={onClose} hitSlop={10} accessibilityLabel="Close" style={[s.close, { top: insets.top + 12 }]}>
          <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6 6 18" stroke={co.text} strokeWidth={2} strokeLinecap="round" /></Svg>
        </PressBounce>
      )}

      {/* Two-part layout, research-backed (RevenueCat/Apphud paywall guides, 2026-09): generous
          whitespace belongs BETWEEN sections, not stretched evenly through every line - so this is
          NOT one scrolling blob (an earlier pass tried that, uniformly inflating every line's
          margin, which just read as "loose," not "designed"). Perks scroll independently up top;
          price/CTA/legal are a genuinely FIXED footer, always visible with no scroll needed - the
          "sticky footer" pattern most real paywalls use, and what a 3.1.2 reviewer expects to just
          see, not discover by scrolling. Kept tight internally (this is exactly the structure an
          earlier pass reverted for squeezing perks down to 1-2 visible bullets - the difference
          this time is the footer's OWN spacing stays compact, so its total height is small enough
          to coexist with a full perk list on real device heights instead of eating them). */}
      {/* flexGrow:1 + justifyContent:'center' on the CONTENT CONTAINER (not the ScrollView/screen
          itself, which is what an earlier pass tried and reverted - that centered the footer too,
          just relocating the dead space above+below it). This only centers the perks text within
          its own scroll area when it's shorter than the available height; once a longer perk list
          overflows that height, flexGrow content naturally reverts to normal top-down scrolling -
          centering has no effect once content exceeds the container. Footer position is untouched
          either way, since it's a separate sibling View below this ScrollView. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingTop: insets.top + 20, paddingBottom: 16 }}>
        <FadeIn style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
          <LMark />
          <Text style={[label, { color: co.accent }]}>{t('paywall.access')}</Text>
        </FadeIn>
        <Text style={s.h1}>{headlineFor(field, specialty)}</Text>

        <View style={{ marginTop: 16 }}>
          {perkList.map((text, i) => (
            <View key={i} style={s.perk}>
              <Svg width={17} height={17} viewBox="0 0 24 24"><Path d="m5 13 4 4L19 7" stroke={co.accent} strokeWidth={1.8} fill="none" /></Svg>
              <Text style={s.perkText}>{text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Fixed footer - price cards, CTA, and all secondary/legal text kept close together per
          paywall-design research ("smaller fonts/tighter spacing for secondary info"), so the
          decision block reads as one unit sitting at a stable, always-visible position. */}
      <View style={{ paddingHorizontal: 28, paddingBottom: insets.bottom + 16 }}>
          {loading ? (
            <ActivityIndicator color={co.accent} style={{ marginVertical: 24 }} />
          ) : pkgs.length > 0 ? (
            <View style={s.planCards}>
              {pkgs.map((pkg, i) => {
                const on = i === sel;
                const note = trialNoteFor(pkg);
                // Fallback ONLY for a plan with no genuine trial/discount note (e.g. Weekly
                // between the 2026-09-06 price change and its new 7-day-free intro syncing
                // through RevenueCat) - a real offer from trialNoteFor always takes priority
                // and gets its normal badge. This is a true, verifiable claim (11,000+ words is
                // the same figure onboarding/App Store already use), never a fabricated one.
                const best = periodLabel(pkg) === 'Yearly';
                return (
                  <PressBounce key={pkg.identifier} onPress={() => setSel(i)} style={[s.planCard, on && s.planCardOn]}>
                    {/* Yearly leads with the "50% OFF" anchor badge instead of its trial badge
                        (2026-09-17, owner-directed: per-week anchor pricing) - the trial itself
                        is still fully disclosed via the CTA label and the auto-renew disclosure
                        text below, so nothing about the trial goes undisclosed, it's just not
                        the headline claim on this specific card anymore. */}
                    {best && savePct !== null ? (
                      <View style={s.saveBadge}><View style={s.badgePill}><Text style={s.saveBadgeTxt}>{t('paywall.save', { pct: savePct })}</Text></View></View>
                    ) : note ? (
                      <View style={s.trialBadge}><View style={s.badgePill}><Text style={s.trialBadgeTxt}>{note.replace(/(\d+)-week/, (_m, d) => `${Number(d) * 7} days`).replace(/(\d+)-day/, '$1 days').toUpperCase()}</Text></View></View>
                    ) : periodLabel(pkg) === 'Weekly' ? (
                      <View style={s.trialBadge}><View style={s.badgePill}><Text style={s.trialBadgeTxt}>11,000+ WORDS</Text></View></View>
                    ) : null}
                    <Text style={[s.planCardName, on && s.planCardTxtOn]}>{periodLabel(pkg)}</Text>
                    {/* Yearly's BIG number is its per-week equivalent, not the raw annual total -
                        "$0.99/wk" reads as pocket change vs. the same $1.99/wk Weekly plan right
                        next to it; the actual annual charge moves to the smaller line below,
                        never hidden, just not the headline. Every other plan is unchanged. */}
                    <Text style={[s.planCardPrice, on && s.planCardTxtOn]}>
                      {best && perWeek ? `${perWeek}/wk` : pkg.product.priceString}
                    </Text>
                    <Text style={[s.planCardSub, on && s.planCardSubOn]}>
                      {best
                        ? `Billed annually (${pkg.product.priceString}/yr)`
                        : note
                          ? `then ${pkg.product.priceString}/${periodLabel(pkg) === 'Monthly' ? 'mo' : 'wk'}`
                          : 'Cancel anytime'}
                    </Text>
                    {/* Guideline 3.1.2(c): the subscription's LENGTH must be explicit in the app, not
                        just implied by the plan name. */}
                    <Text style={[s.planCardLen, on && s.planCardSubOn]}>
                      {periodLabel(pkg) === 'Yearly' ? 'Renews every year' : periodLabel(pkg) === 'Monthly' ? 'Renews every month' : 'Renews every week'}
                    </Text>
                  </PressBounce>
                );
              })}
            </View>
          ) : (
            <View style={s.pending}>
              <Text style={s.pendingText}>Pricing isn't available right now. You can keep exploring, and check back shortly.</Text>
            </View>
          )}
          {pkgs.length > 0 ? (
            <PressBounce style={s.cta} onPress={buy} disabled={busy}><Text style={s.ctaText}>{ctaLabel()}</Text></PressBounce>
          ) : (
            <PressBounce style={s.cta} onPress={onPurchased}><Text style={s.ctaText}>{t('common.continue')}</Text></PressBounce>
          )}
          {pkgs.length > 0 && <Text style={s.disclosure}>{t('paywall.autoRenew')}</Text>}
          {/* Guideline 3.1.1: a DISTINCT, unambiguous Restore Purchases button (not just automatic
              restore-on-launch, and not buried as a small inline text link among others). */}
          <PressBounce onPress={onRestore} disabled={busy} style={s.restoreBtn} hitSlop={6}>
            <Text style={s.restoreBtnText}>{busy ? t('paywall.wait') : 'Restore Purchases'}</Text>
          </PressBounce>
          <View style={s.legalRow}>
            <PressBounce onPress={() => Linking.openURL(TERMS_URL).catch(() => {})} hitSlop={8}><Text style={s.legal}>{t('paywall.terms')}</Text></PressBounce>
            <Text style={s.legalDot}>·</Text>
            <PressBounce onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} hitSlop={8}><Text style={s.legal}>{t('paywall.privacy')}</Text></PressBounce>
            <Text style={s.legalDot}>·</Text>
            <PressBounce onPress={() => router.push('/redeem' as any)} hitSlop={8}><Text style={s.legal}>Have a code?</Text></PressBounce>
          </View>
      </View>

      {offer && (
        <View style={s.offerOverlay}>
          <View style={s.offerCard}>
            <Text style={s.offerBadge}>ONE-TIME OFFER</Text>
            <Text style={s.offerTitle}>Wait — 50% off{'\n'}to get you started</Text>
            <Text style={s.offerSub}>Not ready for a year? Start at half price and keep every advanced word. Cancel anytime.</Text>
            <PressBounce style={s.offerCta} onPress={claimOffer} disabled={busy}><Text style={s.offerCtaText}>{busy ? t('paywall.wait') : 'Claim 50% off'}</Text></PressBounce>
            <PressBounce onPress={() => setOffer(false)} hitSlop={8}><Text style={s.offerNo}>No thanks</Text></PressBounce>
          </View>
        </View>
      )}
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  close: { position: 'absolute', left: 20, zIndex: 10, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: co.surface2 },
  h1: { fontFamily: fonts.serif, fontSize: 26, color: co.text, marginTop: 10, lineHeight: 31, textAlign: 'center' },
  // Full 5-bullet value list, kept at a genuinely readable size - the single-ScrollView fix
  // (nothing sharing a fixed footer height with the perks list anymore) is what cures the
  // clipping bug, so the bullets don't need to be cut down to "make room." Vertical rhythm here
  // is tuned tight-but-comfortable (not stretched to the old pre-fix sizing, which - now that
  // nothing is fighting it for space - just overflows into an unnecessary scroll on a real
  // device instead of fitting the one screen it can easily fit on).
  perk: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 9 },
  perkText: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: co.text, lineHeight: 20 },
  planCards: { flexDirection: 'row', gap: 11, marginBottom: 10 },
  planCard: { flex: 1, borderRadius: 17, backgroundColor: co.surface2, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', minHeight: 96 },
  planCardOn: { backgroundColor: co.accent },
  planCardName: { fontFamily: fonts.sansSemi, fontSize: 14, color: co.muted, marginBottom: 4 },
  planCardPrice: { fontFamily: fonts.serif, fontSize: 21, color: co.text, textAlign: 'center' },
  planCardSub: { fontFamily: fonts.sans, fontSize: 11.5, color: co.faint, marginTop: 5, textAlign: 'center' },
  planCardLen: { fontFamily: fonts.sans, fontSize: 10, color: co.faint, marginTop: 3, textAlign: 'center' },
  planCardTxtOn: { color: co.ink },
  planCardSubOn: { color: co.ink },
  // left/right: -14 lets the badge bleed slightly past the card's own (narrow, 2-up) width
  // instead of wrapping "7 DAYS FREE TRIAL" onto 2 lines - there's clearance on both sides
  // (the inter-card gap and the outer screen padding). alignItems:'center' centers the inner
  // pill (badgePill carries the actual background/shape) so it shrink-wraps to its text instead
  // of being forced to the card's narrower width.
  saveBadge: { position: 'absolute', top: -10, left: -14, right: -14, alignItems: 'center' },
  trialBadge: { position: 'absolute', top: -10, left: -14, right: -14, alignItems: 'center' },
  badgePill: { backgroundColor: co.text, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  saveBadgeTxt: { fontFamily: fonts.sansSemi, fontSize: 10, color: co.bg, letterSpacing: 0.3 },
  trialBadgeTxt: { fontFamily: fonts.sansSemi, fontSize: 10, color: co.bg, letterSpacing: 0.3 },
  pending: { marginTop: 8, padding: 18, borderRadius: 14, backgroundColor: co.surface2 },
  pendingText: { fontFamily: fonts.sans, fontSize: 13.5, color: co.muted, lineHeight: 20 },
  cta: { backgroundColor: co.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  ctaText: { fontFamily: fonts.sansSemi, fontSize: 15.5, color: co.ink },
  // Compliance text (3.1.2 auto-renew disclosure) kept verbatim but visually de-emphasized -
  // smaller + tighter so it reads as fine print, not competing with the value prop above it.
  disclosure: { fontFamily: fonts.sans, fontSize: 10, color: co.faint, lineHeight: 14, textAlign: 'center', marginTop: 10 },
  restoreBtn: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 10, marginTop: 4 },
  restoreBtnText: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 4 },
  legal: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted },
  legalDot: { color: co.faint },
  offerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, zIndex: 50 },
  offerCard: { width: '100%', backgroundColor: co.surface, borderRadius: 22, padding: 26, alignItems: 'center' },
  offerBadge: { fontFamily: fonts.sansSemi, fontSize: 11, letterSpacing: 2, color: co.accent, marginBottom: 10 },
  offerTitle: { fontFamily: fonts.serif, fontSize: 25, color: co.text, textAlign: 'center', lineHeight: 30 },
  offerSub: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, textAlign: 'center', lineHeight: 21, marginTop: 12 },
  offerCta: { alignSelf: 'stretch', backgroundColor: co.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 22 },
  offerCtaText: { fontFamily: fonts.sansSemi, fontSize: 15.5, color: co.ink },
  offerNo: { fontFamily: fonts.sans, fontSize: 13.5, color: co.muted, marginTop: 14 },
});
