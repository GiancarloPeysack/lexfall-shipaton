import { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { getSavedWords, getCollections, getLikedWords, getLikedCount, Collection } from '../lib/db';
import { t } from '../lib/i18n';
import { useApp } from '../lib/app-state';
import BackButton from '../components/BackButton';
import { Word } from '../data/types';
import { fonts, label, Palette } from '../theme/tokens';
import Illo from '../components/Illustrations';
import FadeIn from '../components/FadeIn';
import { Chevron } from '../components/Icon';
import PressBounce from '../components/PressBounce';

export default function Saved() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { palette: co } = useApp();
  const styles = makeStyles(co);
  const [cols, setCols] = useState<Collection[]>([]);
  const [active, setActive] = useState('Want to learn');
  const [words, setWords] = useState<Word[]>([]);
  const [likedCount, setLikedCount] = useState(0);

  // Favorites is a chip INSIDE Saved (Library collapsed Favorites/Collections/Saved into one
  // "Saved" bucket — hearts and collections both live here now).
  const FAV = '__favorites__';

  useFocusEffect(useCallback(() => {
    let alive = true;
    getCollections().then((c) => { if (alive) setCols(c); });
    getLikedCount().then((n) => { if (alive) setLikedCount(n); });
    (active === FAV ? getLikedWords() : getSavedWords(active)).then((w) => { if (alive) setWords(w); });
    return () => { alive = false; };
  }, [active]));

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={() => router.back()} co={co} />
      </View>
      <View style={{ paddingHorizontal: 26 }}>
        <Text style={[label, { color: co.accent }]}>{t('collections.title')}</Text>
      </View>

      <View style={{ maxHeight: 46, marginTop: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, gap: 8 }}>
          <PressBounce onPress={() => setActive(FAV)} style={[styles.chip, active === FAV && styles.chipOn]}>
            <Text style={[styles.chipText, active === FAV && { color: co.ink }]}>Favorites · {likedCount}</Text>
          </PressBounce>
          {cols.map((c) => {
            const on = c.name === active;
            return (
              <PressBounce key={c.name} onPress={() => setActive(c.name)} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && { color: co.ink }]}>{c.name} · {c.count}</Text>
              </PressBounce>
            );
          })}
        </ScrollView>
      </View>

      {words.length === 0 ? (
        <FadeIn style={{ alignItems: 'center', marginTop: 48, paddingHorizontal: 40 }}>
          <Illo name={active === FAV ? 'heart' : 'bookmarks'} co={co} size={112} />
          <Text style={[styles.empty, { textAlign: 'center', marginTop: 18, paddingHorizontal: 0 }]}>
            {active === FAV
              ? 'No favorites yet. Tap the heart on any word to add it here.'
              : `Nothing in “${active}” yet. Tap the bookmark on a word - long-press it to pick a collection.`}
          </Text>
        </FadeIn>
      ) : (
        <FlatList
          data={words}
          keyExtractor={(w) => w.id}
          contentContainerStyle={{ paddingHorizontal: 26, paddingTop: 14 }}
          renderItem={({ item }) => (
            <PressBounce style={styles.row} onPress={() => router.push(`/word/${item.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.word}>{item.word}</Text>
                <Text style={styles.def}>({item.pos}) {item.def}</Text>
              </View>
              <Chevron color={co.faint} />
            </PressBounce>
          )}
        />
      )}
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  top: { paddingHorizontal: 24, paddingBottom: 8 },
  chip: { backgroundColor: co.surface2, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, height: 36, justifyContent: 'center' },
  chipOn: { backgroundColor: co.accent },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: co.muted },
  empty: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, paddingHorizontal: 26, marginTop: 24, lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: co.line },
  word: { fontFamily: fonts.serif, fontSize: 19, color: co.text },
  def: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, marginTop: 2 },
  chev: { color: co.faint, fontSize: 18 },
});
