import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SvgXml } from 'react-native-svg';
import { useApp } from '../../lib/app-state';
import { t } from '../../lib/i18n';
import fieldGen from '../../assets/illos/fieldGen';
import { getCollections, getPosFacets, getLevelFacets, getOriginFacets, Collection, Facet } from '../../lib/db';
import { CATEGORIES } from '../../data/categories';
import { DISPLAY_AREAS } from '../../data/display-areas';
import { SEED } from '../../data/words';
import { inField } from '../../data/types';
import { fonts, label, Palette } from '../../theme/tokens';
import AnimatedIllo from '../../components/AnimatedIllo';
import { IlloName, illoFor } from '../../components/Illustrations';
import BackButton from '../../components/BackButton';
import PressBounce from '../../components/PressBounce';
import FadeIn from '../../components/FadeIn';

export default function Explore() {
  const { palette: co, field } = useApp();
  const styles = makeStyles(co);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [pos, setPos] = useState<Facet[]>([]);
  const [levels, setLevels] = useState<Facet[]>([]);
  const [origins, setOrigins] = useState<Facet[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useFocusEffect(useCallback(() => {
    let alive = true;
    getCollections().then((v) => { if (alive) setCollections(v); });
    getPosFacets('gen').then((v) => { if (alive) setPos(v); });
    getLevelFacets('gen').then((v) => { if (alive) setLevels(v); });
    getOriginFacets('gen').then((v) => { if (alive) setOrigins(v); });
    AsyncStorage.getItem('vorto.topics').then((v) => { if (alive && v) setFollowed(new Set(JSON.parse(v))); });
    return () => { alive = false; };
  }, []));

  const browse = (axis: string, value: string, title?: string) =>
    router.push({ pathname: '/browse', params: { field: 'gen', axis, value, title: title ?? value } });

  // The user's TRACK areas, from the SAME taxonomy Practice's picker reads (data/display-areas.ts).
  // One shared taxonomy for Library and Practice, not two. law/biz publish 1-2 sections whose
  // subAreas are the real areas (the domains: "Litigation & advocacy" etc.), so those flatten to
  // subArea cards; gen/med/new have many top-level areas, so each top-level area is a card.
  const present = useMemo(() => new Set(SEED.filter((w) => inField(w.field, field)).map((w) => w.topic)), [field]);
  const trackAreas = useMemo(() => {
    const areas = DISPLAY_AREAS[field] ?? [];
    const flat = areas.length <= 2
      ? areas.flatMap((a) => a.subAreas.map((s) => ({ key: `${a.id}:${s.name}`, name: s.name, tags: s.tags })))
      : areas.map((a) => ({ key: a.id, name: a.name, tags: a.subAreas.flatMap((s) => s.tags) }));
    return flat
      .map((a) => ({ key: a.key, name: a.name, topics: a.tags.filter((t) => present.has(t)) }))
      .filter((a) => a.topics.length > 0);
  }, [field, present]);
  const openArea = (a: { name: string; topics: string[] }) =>
    router.push({ pathname: '/topics', params: { field, title: a.name, topics: JSON.stringify(a.topics) } });

  // Illustrated facet tiles - each browse entry carries its own artwork,
  // matching the "Your words" tile language (filled card, no borders).
  const FACET_ART: Record<string, IlloName> = {
    Nouns: 'book', Adjectives: 'sparkle', Verbs: 'pen', Adverbs: 'chat',
    C1: 'bookmarks', C2: 'contract',
    Latin: 'scales', Greek: 'faces', French: 'coins', Germanic: 'leaf',
  };
  const Chips = ({ items, axis }: { items: Facet[]; axis: string }) => (
    <FadeIn style={styles.chipWrap}>
      {items.map((f) => (
        <PressBounce key={f.value} onPress={() => browse(axis, f.value, f.label)} style={styles.tileS}>
          <AnimatedIllo name={FACET_ART[f.label] ?? illoFor(f.label)} co={co} size={40} amount={5} />
          <Text style={styles.tileSText}>{f.label}</Text>
        </PressBounce>
      ))}
    </FadeIn>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: co.bg }} contentContainerStyle={{ paddingBottom: 200 }}>
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 26 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={[label, { marginTop: 18 }]}>{t('explore.library')}</Text>
            <Text style={styles.h2}>{t('explore.title')}</Text>
          </View>
          <SvgXml xml={fieldGen} width={64} height={64} />
        </View>
      </View>

      <PressBounce onPress={() => router.push('/search')} style={styles.searchBar}>
        <Text style={styles.searchText}>{t('explore.searchPlaceholder')}</Text>
      </PressBounce>

      {/* Your words - illustrated shortcut tiles */}
      <View style={styles.sectRow}>
        <Text style={styles.sect}>{t('explore.yourWords')}</Text>
        <PressBounce onPress={() => router.push('/saved')} hitSlop={8}><Text style={styles.seeAll}>{t('common.seeAll')}</Text></PressBounce>
      </View>
      {/* Two buckets only (was Favorites / Collections / Saved words / Your own words — four
          overlapping concepts). Favorites + collections live INSIDE Saved (see saved.tsx). */}
      <FadeIn style={styles.tiles}>
        <PressBounce style={styles.tileS} onPress={() => router.push('/saved')}>
          <AnimatedIllo name="bookmarks" co={co} size={44} amount={5} />
          <View style={{ flex: 1 }}>
            <Text style={styles.tileSText}>Saved</Text>
            <Text style={styles.tileSSub} numberOfLines={1}>
              {collections.length ? `${collections.length} collections` : 'Favorites & collections'}
            </Text>
          </View>
        </PressBounce>
        <PressBounce style={styles.tileS} onPress={() => router.push('/own')}>
          <AnimatedIllo name="pen" co={co} size={44} amount={5} />
          <View style={{ flex: 1 }}>
            <Text style={styles.tileSText}>Your own words</Text>
            <Text style={styles.tileSSub} numberOfLines={1}>Added by you</Text>
          </View>
        </PressBounce>
      </FadeIn>

      {/* The user's track leads. These cards are THE place to shape the daily feed (Profile's
          "Personalize your feed" row deep-links here rather than owning its own flow). */}
      <Text style={styles.sect}>Your areas</Text>
      <Text style={styles.catHint}>Tap an area to choose what appears in your daily feed.</Text>
      <FadeIn style={styles.grid} delay={60}>
        {trackAreas.map((a) => {
          const on = a.topics.filter((t) => followed.has(t)).length;
          return (
            <PressBounce key={a.key} style={styles.tile} onPress={() => openArea(a)}>
              <View style={styles.tileArt}><AnimatedIllo name={illoFor(a.name)} co={co} size={88} /></View>
              <Text style={styles.tileName}>{a.name}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {on > 0 ? `Following ${on} of ${a.topics.length}` : `${a.topics.length} areas`}
              </Text>
            </PressBounce>
          );
        })}
      </FadeIn>

      {/* General categories after the track (the user's own field is covered above). */}
      <Text style={styles.sect}>More areas</Text>
      <FadeIn style={styles.grid} delay={90}>
        {CATEGORIES.filter((c) => c.field !== field).map((c) => {
          const on = c.topics.filter((t) => followed.has(t)).length;
          return (
            <PressBounce key={c.id} style={styles.tile} onPress={() => router.push({ pathname: '/topics', params: { category: c.id } })}>
              <View style={styles.tileArt}><AnimatedIllo name={c.illo} co={co} size={88} /></View>
              <Text style={styles.tileName}>{c.name}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {on > 0 ? `Following ${on} of ${c.topics.length}` : `${c.topics.length} areas`}
              </Text>
            </PressBounce>
          );
        })}
      </FadeIn>

      {/* Browse by part of speech */}
      <Text style={styles.sect}>By part of speech</Text>
      <Chips items={pos} axis="pos" />

      {/* Browse by level */}
      <Text style={styles.sect}>By level</Text>
      <Chips items={levels} axis="level" />

      {/* Browse by origin */}
      {origins.length > 0 && (<>
        <Text style={styles.sect}>By origin</Text>
        <Chips items={origins} axis="origin" />
      </>)}
    </ScrollView>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  h2: { fontFamily: fonts.serif, fontSize: 30, color: co.text, marginTop: 8 },
  sect: { ...label, color: co.faint, marginTop: 26, marginBottom: 12, marginHorizontal: 26 },
  sectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 26 },
  seeAll: { fontFamily: fonts.sansMedium, fontSize: 14, color: co.accent, marginTop: 26, marginBottom: 12 },
  catHint: { fontFamily: fonts.sans, fontSize: 13.5, color: co.muted, marginHorizontal: 26, marginTop: -4, marginBottom: 14, lineHeight: 20 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, paddingHorizontal: 26 },
  tileS: { width: '47.5%', flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 12, backgroundColor: co.surface2 },
  tileSText: { fontFamily: fonts.sansSemi, fontSize: 15, color: co.text, flexShrink: 1 },
  tileSSub: { fontFamily: fonts.sans, fontSize: 12, color: co.faint, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, paddingHorizontal: 26 },
  tile: { width: '47.5%', borderRadius: 20, padding: 14, backgroundColor: co.surface2 },
  tileArt: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  tileName: { fontFamily: fonts.serif, fontSize: 19, color: co.text, marginTop: 8 },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: co.faint, marginTop: 5 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, paddingHorizontal: 26 },
  chipCount: { fontFamily: fonts.sans, fontSize: 12, color: co.faint },
  searchBar: { marginHorizontal: 26, marginTop: 14, height: 46, backgroundColor: co.surface2, borderRadius: 14, justifyContent: 'center', paddingHorizontal: 16 },
  searchText: { fontFamily: fonts.sans, fontSize: 14, color: co.faint },
});
