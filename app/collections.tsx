import { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useApp } from '../lib/app-state';
import { t } from '../lib/i18n';
import BackButton from '../components/BackButton';
import { getCollections, getWordCollection, setWordCollection, createCollection, Collection } from '../lib/db';
import { fonts, Palette } from '../theme/tokens';
import PressBounce from '../components/PressBounce';

export default function Collections() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { word } = useLocalSearchParams<{ word?: string }>();
  const { palette: co } = useApp();
  const styles = makeStyles(co);
  const [cols, setCols] = useState<Collection[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const load = async () => {
    setCols(await getCollections());
    if (word) setCurrent(await getWordCollection(word));
  };
  useEffect(() => { load(); }, [word]);

  const pick = async (c: string) => {
    if (word) { await setWordCollection(word, c); }
    router.back();
  };
  const add = async () => {
    const n = name.trim();
    if (!n) { setAdding(false); return; }
    await createCollection(n);
    setName(''); setAdding(false);
    if (word) { await setWordCollection(word, n); router.back(); }
    else load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.back()} co={co} />
        <Text style={styles.title}>{t('collections.title')}</Text>
        <PressBounce onPress={() => setAdding((v) => !v)} hitSlop={10}><Text style={[styles.side, { color: co.accent }]}>{t('collections.addNew')}</Text></PressBounce>
      </View>

      {adding && (
        <View style={styles.addRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Collection name"
            placeholderTextColor={co.faint}
            style={styles.input}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={add}
          />
          <PressBounce onPress={add} style={styles.addBtn}><Text style={styles.addBtnText}>{t('collections.create')}</Text></PressBounce>
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
        {cols.map((c) => {
          const on = c.name === current;
          return (
            <PressBounce key={c.name} style={styles.row} onPress={() => pick(c.name)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{c.name}</Text>
                <Text style={styles.count}>{c.count} {c.count === 1 ? 'word' : 'words'}</Text>
              </View>
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Path d="M6 4h12v16l-6-4-6 4V4Z" stroke={on ? co.accent : co.muted} fill={on ? co.accent : 'none'} strokeWidth={1.5} />
              </Svg>
            </PressBounce>
          );
        })}
      </ScrollView>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: co.line },
  side: { fontFamily: fonts.sansMedium, fontSize: 15, color: co.muted },
  title: { fontFamily: fonts.serif, fontSize: 18, color: co.text },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: co.line },
  input: { flex: 1, fontFamily: fonts.sans, fontSize: 16, color: co.text, borderWidth: 1, borderColor: co.line2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  addBtn: { backgroundColor: co.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
  addBtnText: { fontFamily: fonts.sansMedium, fontSize: 14, color: co.ink },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: co.line },
  name: { fontFamily: fonts.serif, fontSize: 18, color: co.text },
  count: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, marginTop: 3 },
});
