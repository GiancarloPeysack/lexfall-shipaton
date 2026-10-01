import { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { FieldId } from '../data/types';
import { fonts, Palette } from '../theme/tokens';
import {
  DISPLAY_AREAS, DisplayArea, DisplaySubArea,
  EXAM_TAGS, WORDTYPE_TAGS, assertTaxonomyCoverage,
} from '../data/display-areas';

// ── The ONE area picker, shared by onboarding (multi-select follow-set) and
// Build-a-test (single-select scope). It only renders DISPLAY_AREAS → sub-areas
// and reports taps; the PARENT owns what a tap means (toggle a follow-set vs pick
// one scope). Exam wordlists + word-type are SEPARATE axes (#64), never topic rows.
// Section headers are pure type — no glyph beside a label (#61 + house rule).

export interface AreaPickerProps {
  field: FieldId;
  co: Palette;
  present: (tags: string[]) => boolean;          // does this tag-set have any word in this install?
  isSubOn: (tags: string[], key: string) => boolean;  // is this sub-area currently selected/active?
  onSub: (tags: string[], key: string) => void;
  // exam + word-type axes (optional; rendered as their own controls)
  axisOn?: (tag: string) => boolean;
  onAxis?: (tag: string) => void;
  showAxes?: boolean;
  // which exam tags actually have words here (defaults to "all EXAM_TAGS")
  examPresent?: (tag: string) => boolean;
  searchable?: boolean;
  // Hide the "Your profession"/"Your practice area" section — for consumers (onboarding)
  // that already have a dedicated specialty-pick screen covering the exact same list.
  hideProfession?: boolean;
}

const subKey = (a: DisplayArea, s: DisplaySubArea) => `${a.id}::${s.name}`;

export default function AreaPicker({
  field, co, present, isSubOn, onSub, axisOn, onAxis,
  showAxes = true, examPresent, searchable = true, hideProfession = false,
}: AreaPickerProps) {
  const s = makeStyles(co);
  const [query, setQuery] = useState('');
  // A-Z jump index (#46): a bounded internal ScrollView (same nested-scroll pattern already used
  // for the sub-area chip lists below) + a floating letter rail that scrolls to the first area
  // starting with the tapped letter. Only worth showing once the list is actually long.
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const onAreaLayout = (id: string) => (e: LayoutChangeEvent) => { offsets.current[id] = e.nativeEvent.layout.y; };
  const areasRaw = (DISPLAY_AREAS[field] ?? []).filter((a) => !(hideProfession && a.isProfession));

  // Keep only sub-areas that actually have words, then only areas with sub-areas left.
  const areas = useMemo(() => areasRaw
    .map((a) => ({ ...a, subAreas: a.subAreas.filter((sub) => present(sub.tags)) }))
    .filter((a) => a.subAreas.length > 0), [areasRaw, present]);

  // Collapsed by default — a clean list of big category headers (each shows its ✓count), NOT a
  // long scroll of fine sub-area bubbles. The default is now all-areas-on, so auto-opening every
  // selected category expanded everything; keeping them shut lets the user scan categories and
  // expand only what they want to fine-tune. (Granularity call: category is the primary unit.)
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggleOpen = (id: string) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const exams = useMemo(() => EXAM_TAGS.filter((t) => (examPresent ? examPresent(t) : true)), [examPresent]);
  const wordTypes = useMemo(() => WORDTYPE_TAGS.filter((t) => (examPresent ? examPresent(t) : true)), [examPresent]);

  // First-letter → first matching area id, in list order (so a tap always lands on the letter's
  // FIRST occurrence, matching iOS's own A-Z index convention).
  const letterIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of areas) {
      const letter = a.name.trim()[0]?.toUpperCase();
      if (letter && !map.has(letter)) map.set(letter, a.id);
    }
    return map;
  }, [areas]);
  const jumpTo = (id: string) => {
    const y = offsets.current[id];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 4), animated: true });
  };

  const q = query.trim().toLowerCase();
  // Owner: remove the floating A-Z letter rail entirely - always render the plain list.
  const showAZ = false;
  const matches = useMemo(() => {
    if (!q) return [];
    const out: { area: DisplayArea; sub: DisplaySubArea }[] = [];
    for (const a of areas) for (const sub of a.subAreas)
      if (sub.name.toLowerCase().includes(q) || sub.tags.some((t) => t.toLowerCase().includes(q)))
        out.push({ area: a, sub });
    return out;
  }, [q, areas]);

  const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipTxt, on && { color: co.ink }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  return (
    <View>
      {searchable && (
        <View style={s.search}>
          <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M21 21l-4.3-4.3M11 19a8 8 0 100-16 8 8 0 000 16z" stroke={co.muted} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search areas" placeholderTextColor={co.faint} style={s.searchInput} autoCorrect={false} />
          {query.length > 0 && <Pressable onPress={() => setQuery('')} hitSlop={12}><Text style={s.searchClear}>✕</Text></Pressable>}
        </View>
      )}

      {q ? (
        matches.length ? (
          <View style={s.chips}>
            {matches.map(({ area, sub }) => (
              <Chip key={subKey(area, sub)} label={sub.name} on={isSubOn(sub.tags, subKey(area, sub))} onPress={() => onSub(sub.tags, subKey(area, sub))} />
            ))}
          </View>
        ) : (
          <Text style={s.noMatch}>No areas match “{query.trim()}”.</Text>
        )
      ) : (
        <>
          {(() => {
            const cards = areas.map((a) => {
              const isOpen = open.has(a.id);
              const sel = a.subAreas.filter((sub) => isSubOn(sub.tags, subKey(a, sub))).length;
              return (
                <View key={a.id} style={s.card} onLayout={onAreaLayout(a.id)}>
                  <Pressable onPress={() => toggleOpen(a.id)} style={s.row} hitSlop={6}>
                    <Text style={s.areaName} numberOfLines={1}>{a.name}</Text>
                    <View style={s.right}>
                      {sel > 0 && (
                        <View style={s.tick}>
                          <Svg width={11} height={11} viewBox="0 0 24 24"><Path d="m5 12 5 5L20 7" stroke={co.ink} strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
                          <Text style={s.tickN}>{sel}</Text>
                        </View>
                      )}
                      <Svg width={16} height={16} viewBox="0 0 24 24" style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}><Path d="M6 9l6 6 6-6" stroke={co.muted} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
                    </View>
                  </Pressable>
                  {isOpen && (() => {
                    const chipEls = a.subAreas.map((sub) => (
                      <Chip key={subKey(a, sub)} label={sub.name} on={isSubOn(sub.tags, subKey(a, sub))} onPress={() => onSub(sub.tags, subKey(a, sub))} />
                    ));
                    // Long lists (e.g. the 16 professions) scroll WITHIN a fixed box instead of pushing
                    // the page down; short lists render inline (no nested-scroll gesture capture).
                    return a.subAreas.length > 6 ? (
                      <ScrollView style={s.chipScroll} contentContainerStyle={[s.chips, { paddingTop: 12, paddingBottom: 2 }]} nestedScrollEnabled showsVerticalScrollIndicator>
                        {chipEls}
                      </ScrollView>
                    ) : (
                      <View style={[s.chips, { marginTop: 12 }]}>{chipEls}</View>
                    );
                  })()}
                </View>
              );
            });
            // A-Z jump rail (#46): only for genuinely long lists (6+ distinct first letters) -
            // same bounded-ScrollView + nestedScrollEnabled pattern already used for sub-area
            // chip lists above, now applied to the outer area-card list too.
            if (!showAZ) return cards;
            return (
              <View style={s.azWrap}>
                <ScrollView ref={scrollRef} style={s.azScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {cards}
                </ScrollView>
                <View style={s.azBar} pointerEvents="box-none">
                  {[...letterIndex.keys()].map((letter) => (
                    <Pressable key={letter} onPress={() => jumpTo(letterIndex.get(letter)!)} hitSlop={2}>
                      <Text style={s.azLetter}>{letter}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })()}

          {showAxes && (exams.length > 0 || wordTypes.length > 0) && (
            <>
              {exams.length > 0 && (
                <>
                  <Text style={s.axisLabel}>Exam wordlists</Text>
                  <View style={s.chips}>
                    {exams.map((e) => <Chip key={e} label={e} on={!!axisOn?.(e)} onPress={() => onAxis?.(e)} />)}
                  </View>
                </>
              )}
              {wordTypes.length > 0 && (
                <>
                  <Text style={s.axisLabel}>Word type</Text>
                  <View style={s.chips}>
                    {wordTypes.map((w) => <Chip key={w} label={w} on={!!axisOn?.(w)} onPress={() => onAxis?.(w)} />)}
                  </View>
                </>
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}

// Dev guard: surface taxonomy holes (a tag that maps to no display area/axis) in
// testing rather than as a mystery chip. Cheap — call from a consumer's effect.
export const auditAreaCoverage = (field: FieldId, topics: Iterable<string>) => assertTaxonomyCoverage(field, topics);

const makeStyles = (co: Palette) => StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: co.surface2, borderRadius: 14, paddingHorizontal: 14, height: 48, marginBottom: 16 },
  searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 15.5, color: co.text, padding: 0 },
  searchClear: { fontFamily: fonts.sans, fontSize: 15, color: co.faint },
  noMatch: { fontFamily: fonts.sans, fontSize: 14.5, color: co.muted, marginTop: 6 },
  card: { marginBottom: 10, borderWidth: 1, borderColor: co.line, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 15 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  areaName: { fontFamily: fonts.sansSemi, fontSize: 15.5, color: co.text, flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tick: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: co.accent, borderRadius: 999, paddingLeft: 7, paddingRight: 9, paddingVertical: 3 },
  tickN: { fontFamily: fonts.sansSemi, fontSize: 12.5, color: co.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chipScroll: { maxHeight: 232, marginTop: 4 },
  chip: { backgroundColor: co.surface2, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 15 },
  chipOn: { backgroundColor: co.accent },
  chipTxt: { fontFamily: fonts.sansMedium, fontSize: 15, color: co.muted },
  axisLabel: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 1.5, color: co.faint, marginTop: 18, marginBottom: 10, marginLeft: 4, textTransform: 'uppercase' },
  azWrap: { position: 'relative' },
  azScroll: { maxHeight: 460, paddingRight: 22 },
  azBar: { position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  azLetter: { fontFamily: fonts.sansSemi, fontSize: 10.5, color: co.accent, paddingVertical: 1.5, paddingHorizontal: 4 },
});
