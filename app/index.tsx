import { Redirect } from 'expo-router';
import { useApp } from '../lib/app-state';

// Gate: unfinished onboarding (or not subscribed) → onboarding/paywall; else the app.
export default function Index() {
  const { onboarded } = useApp();
  return <Redirect href={onboarded ? '/(tabs)' : '/onboarding'} />;
}
