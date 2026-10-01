import { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { t } from '../lib/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { addOwnWord, getOwnWords, deleteOwnWord, OwnWord } from '../lib/db';
import { useApp } from '../lib/app-state';
import BackButton from '../components/BackButton';
import Illo from '../components/Illustrations';
import FadeIn from '../components/FadeIn';
import { fonts, label, Palette } from '../theme/tokens';
import PressBounce from '../components/PressBounce';
import Segment from '../components/Segment';

export default function Own() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { palette: co } = useApp();
  const styles = makeStyles(co);
  const [words, setWords] = useState<OwnWord[]>([]);
  const [word, setWord] = useState('');
  const [pos, setPos] = useState('n');
  const [def, setDef] = useState('');
  const [ex, setEx] = useState('');
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const shown = q ? words.filter((w) => w.word.toLowerCase().includes(q) || w.def.toLowerCase().includes(q)) : words;

  const refresh = () => getOwnWords().then(setWords);
  useFocusEffect(useCallback(() => { refresh(); }, []));

  const canAdd = word.trim() && def.trim();
  const add = async () => {
    if (!canAdd) return;
    await addOwnWord({ word, pos, def, ex });
    setWord(''); setDef(''); setEx(''); setPos('n');
    refresh();
  };

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={() => router.back()} co={co} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 26, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={[label, { color: co.accent }]}>{t('own.personal')}</Text>
        <Text style={styles.h2}>{t('own.title')}</Text>

        <View style={styles.form}>
          <TextInput value={word} onChangeText={setWord} placeholder="Word" placeholderTextColor={co.faint} style={styles.bigInput} />
          <View style={styles.posRow}>
            <Segment
              co={co}
              options={['n', 'v', 'adj', 'adv'].map((p) => ({ label: p, value: p }))}
              value={pos}
              onChange={setPos}
            />
          </View>
          <TextInput value={def} onChangeText={setDef} placeholder="Definition" placeholderTextColor={co.faint} style={styles.input} multiline />
          <TextInput value={ex} onChangeText={setEx} placeholder="Example sentence (optional)" placeholderTextColor={co.faint} style={styles.input} multiline />
          <PressBounce style={[styles.btn, !canAdd && { opacity: 0.4 }]} onPress={add} disabled={!canAdd}>
            <Text style={styles.btnText}>{t('own.addWord')}</Text>
          </PressBounce>
        </View>

        {words.length === 0 && (
          <FadeIn style={{ alignItems: 'center', paddingTop: 34, paddingBottom: 10 }}>
            <Illo name="pen" co={co} size={130} />
            <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: co.text, textAlign: 'center', marginTop: 18, lineHeight: 32 }}>
              You haven't added{'\n'}any words yet
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 15, color: co.muted, textAlign: 'center', marginTop: 8 }}>
              Write a word above to remember it forever.
            </Text>
          </FadeIn>
        )}
        {words.length > 0 && <Text style={styles.sect}>{words.length} word{words.length > 1 ? 's' : ''}</Text>}
        {/* Search within your own words — so a big list stays navigable. */}
        {words.length > 6 && (
          <View style={styles.ownSearch}>
            <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3.5-3.5" stroke={co.muted} strokeWidth={1.5} fill="none" /></Svg>
            <TextInput value={filter} onChangeText={setFilter} placeholder="Search your words" placeholderTextColor={co.faint} style={styles.ownSearchInput} autoCapitalize="none" autoCorrect={false} />
          </View>
        )}
        {shown.map((w) => (
          <View key={w.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rw}>{w.word} <Text style={styles.rpos}>({w.pos})</Text></Text>
              <Text style={styles.rd}>{w.def}</Text>
            </View>
            <PressBounce onPress={() => deleteOwnWord(w.id).then(refresh)} hitSlop={10}>
              <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6 6 18" stroke={co.faint} strokeWidth={1.6} fill="none" /></Svg>
            </PressBounce>
          </View>
        ))}
        {q && shown.length === 0 && <Text style={[styles.rd, { marginTop: 16 }]}>No words match “{filter}”.</Text>}
      </ScrollView>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  top: { paddingHorizontal: 24, paddingBottom: 8 },
  h2: { fontFamily: fonts.serif, fontSize: 30, color: co.text, marginTop: 8, marginBottom: 8 },
  form: { borderWidth: 1, borderColor: co.line, borderRadius: 16, padding: 18, marginTop: 8 },
  bigInput: { fontFamily: fonts.serif, fontSize: 26, color: co.text, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: co.line2 },
  posRow: { marginTop: 14 },
  input: { fontFamily: fonts.sans, fontSize: 15, color: co.text, borderBottomWidth: 1, borderBottomColor: co.line2, paddingVertical: 12, marginTop: 12 },
  btn: { backgroundColor: co.text, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  btnText: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.ink },
  sect: { ...label, color: co.faint, marginTop: 26, marginBottom: 6 },
  ownSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: co.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  ownSearchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 15, color: co.text, padding: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: co.line },
  rw: { fontFamily: fonts.serif, fontSize: 18, color: co.text },
  rpos: { fontFamily: fonts.serifItalic, fontSize: 14, color: co.muted },
  rd: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, marginTop: 2 },
});
