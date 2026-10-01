import Purchases, { PurchasesPackage, PurchasesOffering, CustomerInfo } from 'react-native-purchases';

// TODO: 'premium' must match the entitlement identifier configured in the
// RevenueCat dashboard - verify it there before release; a mismatch silently
// falls through to the any-active fallback below. app-state.tsx uses the
// same value.
export const ENTITLEMENT = 'premium';

function isActive(info: CustomerInfo | null | undefined): boolean {
  const active = info?.entitlements?.active ?? {};
  // Primary check: the specific entitlement this app sells. Fallback: any
  // active entitlement, so a dashboard naming mismatch never locks out a
  // paying user. Drop the fallback once ENTITLEMENT is confirmed against the
  // RevenueCat dashboard.
  return !!active[ENTITLEMENT] || Object.keys(active).length > 0;
}

// The current offering's packages (weekly / annual / etc.), or null if RevenueCat
// has no products configured yet (dev, or before App Store Connect is set up).
//
// Retries a few times before giving up: a single stall on a fresh device (cold StoreKit,
// slow network - exactly what an App Review device can hit) used to fall straight to the
// empty "plans appear once products are live" state, which shows NO subscription title/
// length/price at all - a real Guideline 3.1.2(c) risk (Apple flagged this on 2026-08-20).
// Three attempts with a short, growing wait give StoreKit a real chance to warm up.
export async function getOffering(): Promise<PurchasesOffering | null> {
  const attempt = async (timeoutMs: number): Promise<PurchasesOffering | null> => {
    try {
      const offerings = await Promise.race([
        Purchases.getOfferings(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
      return offerings?.current ?? null;
    } catch {
      return null;
    }
  };
  for (const [i, timeoutMs] of [6000, 5000, 5000].entries()) {
    const o = await attempt(timeoutMs);
    if (o) return o;
    if (i < 2) await new Promise((r) => setTimeout(r, 1200));
  }
  return null;
}

// Attempt a purchase. Returns true if it left the user entitled.
export async function purchase(pkg: PurchasesPackage): Promise<{ ok: boolean; cancelled: boolean }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { ok: isActive(customerInfo), cancelled: false };
  } catch (e: any) {
    return { ok: false, cancelled: !!e?.userCancelled };
  }
}

export async function restore(): Promise<boolean> {
  try {
    const info = await Purchases.restorePurchases();
    return isActive(info);
  } catch {
    return false;
  }
}

// Tie RevenueCat's anonymous subscriber to the signed-in Supabase user, so the
// subscription follows the account across devices.
export async function logInPurchases(userId: string) {
  try { await Purchases.logIn(userId); } catch {}
}
export async function logOutPurchases() {
  try { await Purchases.logOut(); } catch {}
}

// Human label for a package based on its subscription period.
export function periodLabel(pkg: PurchasesPackage): string {
  const t = (pkg.packageType || '').toLowerCase();
  if (t.includes('annual')) return 'Yearly';
  if (t.includes('month')) return 'Monthly';
  if (t.includes('week')) return 'Weekly';
  if (t.includes('lifetime')) return 'Lifetime';
  return pkg.product.title || 'Plan';
}

// Find the package for a billing period in an offering (by packageType, via
// periodLabel). Use this instead of indexing availablePackages blindly.
export function findPackage(
  offering: PurchasesOffering | null | undefined,
  period: 'annual' | 'monthly' | 'weekly'
): PurchasesPackage | undefined {
  const want = period === 'annual' ? 'Yearly' : period === 'monthly' ? 'Monthly' : 'Weekly';
  return (offering?.availablePackages ?? []).find((p) => periodLabel(p) === want);
}

// Length of a package's FREE-trial intro offer, in days, read live from StoreKit/RevenueCat
// (so it always matches what Apple will actually do - never a hardcoded number that can drift
// when the trial length changes in App Store Connect). Returns null when there's no intro offer
// or the intro is a paid (not free) offer.
export function introTrialDays(pkg: PurchasesPackage | null | undefined): number | null {
  const intro: any = pkg && (pkg.product as any).introPrice;
  if (!intro) return null;
  if ((intro.price ?? 0) > 0) return null; // paid intro (e.g. "$1.99 first week"), not a free trial
  const n = intro.periodNumberOfUnits ?? 0;
  if (!n) return null;
  const unit = (intro.periodUnit || '').toString().toUpperCase();
  return unit === 'WEEK' ? n * 7 : unit === 'MONTH' ? n * 30 : unit === 'YEAR' ? n * 365 : n; // DAY or default
}

// Anchor pricing for the Yearly plan, computed live (never hardcoded). House rule (owner,
// 2026-09-18): the raw annual total must NEVER be shown on its own - always lead with the
// per-week equivalent + the % saved, and show "billed annually (<total>)" only as the secondary
// line. This helper is the single source of that framing so the paywall and the pre-paywall
// trial screen can't drift. `perWeek` = annual/52 formatted with the store's own currency symbol;
// `savePct` compares that weekly rate against whichever real weekly-cost plan is live (Weekly, or
// monthly×12/52). All null until the offering resolves.
export function annualAnchorPricing(offering: PurchasesOffering | null | undefined): {
  perWeek: string | null;
  savePct: number | null;
  annualStr: string | null;
} {
  const annualPkg = findPackage(offering, 'annual');
  const weeklyPkg = findPackage(offering, 'weekly');
  const monthlyPkg = findPackage(offering, 'monthly');
  const annualStr = annualPkg ? annualPkg.product.priceString : null;
  let perWeek: string | null = null;
  let savePct: number | null = null;
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
  return { perWeek, savePct, annualStr };
}
