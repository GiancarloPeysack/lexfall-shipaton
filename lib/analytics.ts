// Lightweight analytics façade. No provider is wired yet, so events log in dev and
// no-op in production — but every funnel-critical moment already calls track(), so
// dropping in a real provider (PostHog / Amplitude / Firebase) later is a ONE-FILE
// change with zero new call sites: implement setAnalyticsSink at app start.
type Props = Record<string, string | number | boolean | undefined>;

let sink: ((event: string, props?: Props) => void) | null = null;
export function setAnalyticsSink(fn: (event: string, props?: Props) => void) { sink = fn; }

export function track(event: string, props?: Props) {
  try {
    if (sink) { sink(event, props); return; }
    if (__DEV__) console.log('[analytics]', event, props ?? {});
  } catch { /* analytics must never crash the app */ }
}

// Canonical funnel event names — keep these stable so the provider dashboard doesn't drift.
export const Events = {
  PaywallView: 'paywall_view',
  TrialStart: 'trial_start',
  PurchaseSuccess: 'purchase_success',
  PurchaseRestore: 'purchase_restore',
  OnboardingComplete: 'onboarding_complete',
  OnboardingStepView: 'onboarding_step_view',
} as const;
