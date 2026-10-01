import { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, useWindowDimensions, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useApp } from '../../lib/app-state';
import BackButton from '../../components/BackButton';
import PressBounce from '../../components/PressBounce';
import WordCard from '../../components/WordCard';
import { getWordsByTopic } from '../../lib/db';
import { Word, FieldId } from '../../data/types';
import { categoryForTopic } from '../../data/categories';
import { fonts, label, Palette } from '../../theme/tokens';

type Item = Word & { _k?: string };

function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  let s = seed * 9301 + 49297;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Full-screen, endless, swipeable feed scoped to one sub-category (topic).
// Same TikTok-style deck as the home feed: pages snap, and once you near the
// end we append a reshuffled pass so it keeps going. Follow the whole area from
// the top-right to add it to your daily feed.
export default function AreaFeed() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const [listH, setListH] = useState(height); // measured viewport → exact paging
  const { topic, field: fieldParam } = useLocalSearchParams<{ topic: string; field?: string }>();
  const t = decodeURIComponent(topic ?? '');
  // The topic's real field (passed from the topics list, else derived from its
  // category). Without this everything defaulted to 'gen', so Law/Medicine/
  // Business topic feeds came back empty.
  const fld: FieldId = (fieldParam as FieldId) || categoryForTopic(t)?.field || 'gen';
  const { palette: co } = useApp();
  const styles = makeStyles(co);

  const [words, setWords] = useState<Word[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [following, setFollowing] = useState(false);
  const [cycles, setCycles] = useState(1);

  useEffect(() => {
    getWordsByTopic(fld, t).then((w) => { setWords(w); setLoaded(true); });
    AsyncStorage.getItem('vorto.topics').then((v) => {
      if (v) setFollowing(new Set<string>(JSON.parse(v)).has(t));
    });
  }, [t]);

  const toggleFollow = async () => {
    Haptics.selectionAsync();
    const raw = await AsyncStorage.getItem('vorto.topics');
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    set.has(t) ? set.delete(t) : set.add(t);
    await AsyncStorage.setItem('vorto.topics', JSON.stringify([...set]));
    setFollowing(set.has(t));
  };

  const data = useMemo<Item[]>(() => {
    if (!words.length) return [];
    const out: Item[] = [];
    for (let c = 0; c < cycles; c++) {
      const pass = c === 0 ? words : shuffleSeeded(words, c + 1);
      pass.forEach((w) => out.push(c === 0 ? w : ({ ...w, _k: `${w.id}#${c}` })));
    }
    return out;
  }, [words, cycles]);

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      {!loaded ? (
        <View style={styles.center}><ActivityIndicator color={co.accent} /></View>
      ) : words.length === 0 ? (
        <View style={styles.center}><Text style={styles.empty}>No words in this area yet.</Text></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item._k ?? item.id}
          onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h > 0) setListH(h); }}
          getItemLayout={(_, index) => ({ length: listH, offset: listH * index, index })}
          renderItem={({ item }) => <WordCard word={item} height={listH} />}
          snapToInterval={listH}
          snapToAlignment="start"
          disableIntervalMomentum
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onEndReached={() => setCycles((c) => c + 1)}
          onEndReachedThreshold={1.5}
        />
      )}

      <View style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <BackButton onPress={() => router.back()} co={co} />
        <Text style={styles.title} numberOfLines={1}>{t}</Text>
        <PressBounce onPress={toggleFollow} hitSlop={8} style={styles.followBtn}>
          <Text style={[styles.followTxt, following && { color: co.muted }]}>{following ? 'Following' : 'Follow'}</Text>
        </PressBounce>
      </View>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: fonts.sans, fontSize: 15, color: co.muted },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 8 },
  title: { ...label, color: co.muted, flex: 1, textAlign: 'center' },
  followBtn: { paddingVertical: 8, paddingHorizontal: 6 },
  followTxt: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.accent },
});
