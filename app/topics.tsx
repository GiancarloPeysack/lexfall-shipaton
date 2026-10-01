import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { t } from '../lib/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../lib/app-state';
import BackButton from '../components/BackButton';
import Illo from '../components/Illustrations';
import { Chevron } from '../components/Icon';
import { FIELDS, FieldId, inField } from '../data/types';
import { categoryById, categoryForTopic } from '../data/categories';
import { SEED } from '../data/words';
import { fonts, label, Palette } from '../theme/tokens';
import PressBounce from '../components/PressBounce';

export default function Topics() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { field, palette: co } = useApp();
  const styles = makeStyles(co);
  const { category, title, field: fieldParam, topics: topicsParam } = useLocalSearchParams<{ category?: string; title?: string; field?: string; topics?: string }>();
  const cat = category ? categoryById(category) : undefined;
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  // Track-area mode: the Library tab passes an area's topic list straight from
  // DISPLAY_AREAS (the same taxonomy Practice's picker reads), plus its field.
  const areaTopics = useMemo<string[] | null>(() => {
    if (!topicsParam) return null;
    try { const v = JSON.parse(String(topicsParam)); return Array.isArray(v) ? v : null; } catch { return null; }
  }, [topicsParam]);
  const effField = (fieldParam as FieldId) || field;

  // Track-area mode > category mode > fall back to field topics.
  const topics = useMemo(() => {
    if (areaTopics) return areaTopics.filter((t) => SEED.some((w) => w.topic === t && inField(w.field, effField)));
    if (cat) return cat.topics.filter((t) => SEED.some((w) => w.topic === t));
    return [...new Set(SEED.filter((w) => inField(w.field, field)).map((w) => w.topic))];
  }, [cat, field, areaTopics, effField]);

  useEffect(() => {
    AsyncStorage.getItem('vorto.topics').then((v) => {
      if (v) setFollowed(new Set(JSON.parse(v)));
      else if (!cat && !areaTopics) setFollowed(new Set(topics)); // legacy default: all field topics
    });
  }, [field, category, topicsParam]);

  // Pass the topic's real field (from its area/category) so the area feed queries the
  // right pool — Law/Medicine/Business topics were coming up empty because the
  // area screen defaulted everything to 'gen'.
  const openTopic = (topicName: string) =>
    router.push({ pathname: '/area/[topic]', params: { topic: topicName, field: areaTopics ? effField : cat?.field ?? categoryForTopic(topicName)?.field ?? field } });

  return (
    <View style={{ flex: 1, backgroundColor: co.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={() => router.back()} co={co} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 26, paddingBottom: insets.bottom + 40 }}>
        {cat ? (
          <View style={{ alignItems: 'center', marginTop: 4, marginBottom: 8 }}>
            <Illo name={cat.illo} co={co} size={104} />
          </View>
        ) : null}
        <Text style={[label, { color: co.accent }]}>{cat ? cat.tag : FIELDS.find((f) => f.id === (areaTopics ? effField : field))?.name}</Text>
        <Text style={styles.h2}>{cat ? cat.name : areaTopics ? String(title || 'Your area') : 'Areas you follow'}</Text>
        <Text style={styles.hint}>Open an area to browse its words — follow it from there to add it to your feed.</Text>

        <View style={styles.list}>
          {topics.map((topic) => {
            const on = followed.has(topic);
            return (
              <PressBounce key={topic} style={styles.row} onPress={() => openTopic(topic)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{topic}</Text>
                  {on && <Text style={styles.sub}>{t('topics.following')}</Text>}
                </View>
                {on && <View style={styles.dot} />}
                <Chevron color={co.faint} />
              </PressBounce>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  top: { paddingHorizontal: 24, paddingBottom: 8 },
  h2: { fontFamily: fonts.serif, fontSize: 30, color: co.text, marginTop: 8 },
  hint: { fontFamily: fonts.sans, fontSize: 14, color: co.muted, marginTop: 6, marginBottom: 12, lineHeight: 21 },
  list: { borderTopWidth: 1, borderTopColor: co.line, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: co.line },
  name: { fontFamily: fonts.serif, fontSize: 19, color: co.text },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: co.muted, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: co.accent, marginRight: 8 },
});
