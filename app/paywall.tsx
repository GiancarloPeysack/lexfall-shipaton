import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useApp } from '../lib/app-state';
import { PaywallView } from '../components/Paywall';
import { inField } from '../data/types';
import { SEED } from '../data/words';

// The standalone hard paywall route. Now a thin wrapper over the shared <PaywallView>,
// so Restore/Terms/Privacy/disclosure, price-bearing CTA and plan set stay identical to
// every other surface. Track-aware via the user's chosen field.
export default function Paywall() {
  const router = useRouter();
  const { field } = useApp();
  const [perDay, setPerDay] = useState<number | undefined>(undefined);
  const proceed = () => router.replace('/(tabs)');
  const onClose = () => (router.canGoBack() ? router.back() : proceed());

  // A user hitting this hard wall has already finished onboarding, so their real daily pace
  // is already in storage (vorto.freq) - reading it here lets the paywall's "Your plan: N
  // words a day..." bullet show a genuine, personalized number instead of falling back to the
  // generic feature bullet, without inventing a stat.
  useEffect(() => {
    AsyncStorage.getItem('vorto.freq').then((raw) => {
      if (!raw) return;
      try { setPerDay(JSON.parse(raw).wordsPerDay); } catch {}
    });
  }, []);

  const library = SEED.filter((w) => inField(w.field, field)).length;

  return (
    <PaywallView
      variant="hard"
      field={field}
      perDay={perDay}
      library={library}
      onPurchased={proceed}
      onClose={onClose}
      showExitOffer
    />
  );
}
