import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { t } from '../lib/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { getVoicePref, setVoicePref, speakWord } from '../lib/speak';
import { PREMIUM_VOICES, DEFAULT_VOICE_ID } from '../lib/premium-voices';
import { useApp } from '../lib/app-state';
import BackButton from '../components/BackButton';
import { fonts, label, Palette } from '../theme/tokens';

const SAMPLE = 'serendipity';
const SAMPLE_ID = 'gen:serendipity';

export default function Voices() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { palette: co } = useApp();
  const styles = makeStyles(co);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => { getVoicePref().then(setSel); }, []);

  const pick = (id: string) => { setSel(id); setVoicePref(id); speakWord(SAMPLE, id, SAMPLE_ID); };

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={() => router.back()} co={co} />
      </View>
      <View style={{ paddingHorizontal: 26 }}>
        <Text style={[label, { color: co.accent }]}>{t('voices.pronunciation')}</Text>
        <Text style={styles.h2}>{t('voices.voice')}</Text>
        <Text style={styles.hint}>Tap to hear “{SAMPLE}” and choose.</Text>
      </View>
      <FlatList
        data={PREMIUM_VOICES}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ paddingHorizontal: 26, paddingTop: 10 }}
        renderItem={({ item }) => {
          const on = (sel ?? DEFAULT_VOICE_ID) === item.id;
          return (
            <Pressable style={styles.row} onPress={() => pick(item.id)}>
              <Text style={styles.vFlag}>{item.flag}</Text>
              <Text style={[styles.vName, { flex: 1 }]}>{item.label}</Text>
              <View style={[styles.check, on && styles.checkOn]}>
                {on && <Svg width={12} height={12} viewBox="0 0 24 24"><Path d="m5 12 5 5L20 7" stroke={co.ink} strokeWidth={2.6} fill="none" /></Svg>}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  top: { paddingHorizontal: 24, paddingBottom: 8 },
  h2: { fontFamily: fonts.serif, fontSize: 30, color: co.text, marginTop: 8 },
  hint: { fontFamily: fonts.sans, fontSize: 13, color: co.muted, marginTop: 6, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: co.line },
  vFlag: { fontSize: 22 },
  vName: { fontFamily: fonts.serif, fontSize: 17, color: co.text },
  check: { width: 22, height: 22, borderRadius: 11, backgroundColor: co.surface2, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: co.accent },
});
