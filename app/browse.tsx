import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { useApp } from '../lib/app-state';
import BackButton from '../components/BackButton';
import {
  getWordsByTopic, getWordsByPos, getWordsByLevel, getWordsByOrigin, getSavedWords,
  getMistakes, getHistory, getLikedWords,
} from '../lib/db';
import { FieldId, Word } from '../data/types';
import { fonts, label, Palette } from '../theme/tokens';
import PressBounce from '../components/PressBounce';
import Illo, { IlloName } from '../components/Illustrations';
import FadeIn from '../components/FadeIn';
import WordSwipeFeed from '../components/WordSwipeFeed';

type Axis = 'topic' | 'pos' | 'level' | 'origin' | 'collection' | 'mistakes' | 'history' | 'liked';

export default function Browse() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { field, axis, value, title } = useLocalSearchParams<{ field: FieldId; axis: Axis; value: string; title?: string }>();
  const { palette: co } = useApp();
  const styles = makeStyles(co);
  const [words, setWords] = useState<Word[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [following, setFollowing] = useState(false);
  const canFollow = axis === 'topic' && !!value;

  useEffect(() => {
    if (!canFollow) return;
    AsyncStorage.getItem('vorto.topics').then((v) => {
      if (v) setFollowing(new Set<string>(JSON.parse(v)).has(value));
    });
  }, [canFollow, value]);

  const toggleFollow = async () => {
    Haptics.selectionAsync();
    const raw = await AsyncStorage.getItem('vorto.topics');
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    set.has(value) ? set.delete(value) : set.add(value);
    await AsyncStorage.setItem('vorto.topics', JSON.stringify([...set]));
    setFollowing(set.has(value));
  };

  useEffect(() => {
    const f = (field || 'gen') as FieldId;
    const load = () => {
      switch (axis) {
        case 'pos': return getWordsByPos(f, value);
        case 'level': return getWordsByLevel(f, value);
        case 'origin': return getWordsByOrigin(f, value);
        case 'collection': return getSavedWords(value);
        case 'mistakes': return getMistakes();
        case 'history': return getHistory();
        case 'liked': return getLikedWords();
        case 'topic':
        default: return getWordsByTopic(f, value);
      }
    };
    setLoaded(false);
    load().then((w) => { setWords(w); setLoaded(true); });
  }, [field, axis, value]);

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      {!loaded ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={co.accent} /></View>
      ) : words.length === 0 ? (
        <FadeIn style={styles.emptyWrap}>
          <Illo name={emptyIllo(axis)} co={co} size={112} />
          <Text style={styles.emptyText}>{emptyHint(axis)}</Text>
        </FadeIn>
      ) : (
        // Same TikTok-style vertical swipe as the main feed — one word per page.
        <WordSwipeFeed words={words} />
      )}

      {/* Header floats over the feed (back · title · follow). */}
      <View style={[styles.floatTop, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <BackButton onPress={() => router.back()} co={co} />
        <View style={styles.floatTitle} pointerEvents="none">
          <Text style={[label, { color: co.accent, textAlign: 'center' }]} numberOfLines={1}>{axisLabel(axis)}</Text>
          <Text style={styles.floatH2} numberOfLines={1}>{title || value}</Text>
        </View>
        {canFollow ? (
          <PressBounce onPress={toggleFollow} style={styles.followBtn} hitSlop={8}>
            <Text style={[styles.followTxt, following && { color: co.muted }]}>{following ? 'Following' : 'Follow'}</Text>
          </PressBounce>
        ) : <View style={{ width: 56 }} />}
      </View>
    </View>
  );
}

function emptyIllo(axis?: Axis): IlloName {
  switch (axis) {
    case 'liked': return 'heart';
    case 'collection': return 'bookmarks';
    case 'mistakes': return 'sparkle';
    case 'history': return 'clock';
    default: return 'book';
  }
}

function emptyHint(axis?: Axis) {
  switch (axis) {
    case 'mistakes': return 'No mistakes on record - keep it up.';
    case 'history': return 'Nothing practised yet. Play a game and your history will appear here.';
    case 'liked': return 'No favorites yet. Tap the heart on any word to add it here.';
    case 'collection': return 'This collection is empty. Bookmark a word in the feed - long-press to choose where it goes.';
    default: return 'No words here yet.';
  }
}

function axisLabel(axis?: Axis) {
  switch (axis) {
    case 'pos': return 'By part of speech';
    case 'level': return 'By level';
    case 'origin': return 'By origin';
    case 'collection': return 'Collection';
    case 'mistakes': return 'For you';
    case 'history': return 'For you';
    default: return 'Area';
  }
}

const makeStyles = (co: Palette) => StyleSheet.create({
  top: { paddingHorizontal: 24, paddingBottom: 8 },
  floatTop: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  floatTitle: { flex: 1, alignItems: 'center' },
  floatH2: { fontFamily: fonts.serif, fontSize: 17, color: co.text, marginTop: 1 },
  followBtn: { paddingVertical: 9, paddingHorizontal: 6 },
  followTxt: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.accent },
  h2: { fontFamily: fonts.serif, fontSize: 30, color: co.text, marginTop: 8 },
  count: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, marginTop: 4, marginBottom: 6 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 46, paddingBottom: 80, gap: 16 },
  emptyText: { fontFamily: fonts.sans, fontSize: 14.5, color: co.muted, textAlign: 'center', lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: co.line },
  word: { fontFamily: fonts.serif, fontSize: 19, color: co.text },
  def: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, marginTop: 2 },
  chev: { color: co.faint, fontSize: 18 },
});
