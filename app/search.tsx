import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { searchWords, getAllFeedWords } from '../lib/db';
import { useApp } from '../lib/app-state';
import { isStarterWord } from '../lib/entitlement';
import { t } from '../lib/i18n';
import BackButton from '../components/BackButton';
import { Word } from '../data/types';
import { fonts, label, Palette } from '../theme/tokens';
import { Chevron } from '../components/Icon';
import PressBounce from '../components/PressBounce';
import Illo from '../components/Illustrations';
import FadeIn from '../components/FadeIn';

const RECENT_KEY = 'vorto.recentSearches';

export default function Search() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { palette: co, isPro } = useApp();
  const styles = makeStyles(co);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Word[]>([]);
  const [suggestions, setSuggestions] = useState<Word[]>([]);
  const [recents, setRecents] = useState<string[]>([]);

  // Zero-state: three words to wander into, plus your latest searches.
  useEffect(() => {
    getAllFeedWords(Math.random().toString(36).slice(2)).then((w) => setSuggestions(w.slice(0, 3))).catch(() => {});
    AsyncStorage.getItem(RECENT_KEY).then((v) => { if (v) setRecents(JSON.parse(v)); }).catch(() => {});
  }, []);

  const onChange = async (text: string) => {
    setQ(text);
    if (text.trim().length < 1) { setResults([]); return; }
    setResults(await searchWords(text));
  };

  const saveRecent = async (term: string) => {
    const v = term.trim();
    if (v.length < 2) return;
    const next = [v, ...recents.filter((r) => r.toLowerCase() !== v.toLowerCase())].slice(0, 5);
    setRecents(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  };

  const showZeroState = q.trim().length < 1;

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={() => router.back()} co={co} />
      </View>

      <View style={{ paddingHorizontal: 26 }}>
        <View style={styles.searchBar}>
          <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3.5-3.5" stroke={co.muted} strokeWidth={1.5} fill="none" /></Svg>
          <TextInput
            value={q}
            onChangeText={onChange}
            onSubmitEditing={() => saveRecent(q)}
            placeholder={t('explore.searchPlaceholder')}
            placeholderTextColor={co.faint}
            style={styles.input}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
      </View>

      {showZeroState ? (
        <View style={{ paddingHorizontal: 26 }}>
          {recents.length > 0 && (
            <>
              <Text style={styles.sect}>{t('search.recent')}</Text>
              {recents.map((r) => (
                <PressBounce key={r} style={styles.row} onPress={() => onChange(r)}>
                  <Text style={[styles.word, { flex: 1 }]}>{r}</Text>
                  <Chevron color={co.faint} />
                </PressBounce>
              ))}
            </>
          )}
          {suggestions.length > 0 && (
            <>
              <Text style={styles.sect}>{t('search.suggestions')}</Text>
              {suggestions.map((w) => (
                <PressBounce key={w.id} style={styles.row} onPress={() => router.push(`/word/${w.id}`)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.word}>{w.word}</Text>
                    {!isPro && !isStarterWord(w.id)
                      ? <Text style={styles.locked}>{t('search.unlockDef')}</Text>
                      : <Text style={styles.def}>({w.pos}) {w.def}</Text>}
                  </View>
                  <Chevron color={co.faint} />
                </PressBounce>
              ))}
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(w) => w.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 26, paddingTop: 14 }}
          ListEmptyComponent={
            <FadeIn style={{ alignItems: 'center', marginTop: 56, paddingHorizontal: 30 }}>
              <Illo name="book" co={co} size={96} />
              <Text style={[styles.empty, { textAlign: 'center', marginTop: 14 }]}>{t('search.noMatches', { q })}</Text>
            </FadeIn>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => { saveRecent(q); router.push(`/word/${item.id}`); }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.word}>{item.word}</Text>
                {!isPro && !isStarterWord(item.id)
                  ? <Text style={styles.locked}>{t('search.unlockDef')}</Text>
                  : <Text style={styles.def}>({item.pos}) {item.def}</Text>}
              </View>
              <Chevron color={co.faint} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  top: { paddingHorizontal: 24, paddingBottom: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: co.surface2, borderRadius: 14, paddingHorizontal: 14, height: 48 },
  input: { flex: 1, fontFamily: fonts.sans, fontSize: 15, color: co.text },
  sect: { ...label, color: co.faint, marginTop: 26, marginBottom: 4 },
  empty: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, marginTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: co.line },
  word: { fontFamily: fonts.serif, fontSize: 19, color: co.text },
  def: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, marginTop: 2 },
  locked: { fontFamily: fonts.serifItalic, fontSize: 12.5, color: co.faint, marginTop: 2 },
});
