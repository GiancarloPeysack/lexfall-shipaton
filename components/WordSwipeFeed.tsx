import { useRef } from 'react';
import { FlatList, useWindowDimensions } from 'react-native';
import WordCard from './WordCard';
import { Word } from '../data/types';
import { recordReview } from '../lib/srs';
import { recordTaste } from '../lib/taste';

// The TikTok-style vertical-paging word feed, reusable across any word list
// (Browse facets like "Greek", collections, search results, saved…). One
// full-screen WordCard per page; marks words seen (so they don't repeat in the
// main feed) and feeds the taste learner from dwell vs. quick-skip.
export default function WordSwipeFeed({ words }: { words: Word[] }) {
  const { height } = useWindowDimensions();
  const viewConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;
  const seen = useRef<Set<string>>(new Set());
  const viewEnter = useRef<Map<string, { t: number; w: Word }>>(new Map());

  const onViewable = useRef(({ viewableItems }: { viewableItems: Array<{ item?: Word }> }) => {
    const now = Date.now();
    const visible = new Set<string>();
    viewableItems.forEach((v) => {
      const w = v.item;
      if (!w) return;
      visible.add(w.id);
      if (!viewEnter.current.has(w.id)) viewEnter.current.set(w.id, { t: now, w });
      if (!seen.current.has(w.id)) { seen.current.add(w.id); recordReview(w.id, true).catch(() => {}); }
    });
    for (const [id, { t, w }] of viewEnter.current) {
      if (visible.has(id)) continue;
      viewEnter.current.delete(id);
      const dwell = now - t;
      if (dwell < 1800) recordTaste(w, -0.35).catch(() => {});
      else if (dwell > 5000) recordTaste(w, 0.4).catch(() => {});
    }
  }).current;

  return (
    <FlatList
      data={words}
      keyExtractor={(w) => w.id}
      renderItem={({ item }) => <WordCard word={item} />}
      pagingEnabled
      snapToInterval={height}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewable}
      viewabilityConfig={viewConfig}
    />
  );
}
