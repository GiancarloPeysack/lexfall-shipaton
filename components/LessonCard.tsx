import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';

// Fixed, consistent headword size. adjustsFontSizeToFit scales short words UP on the New
// Architecture, making each card's headword a different size (owner 2026-10-01) - use a length-based
// size instead: the same size for every word that fits, shrinking only a very long one.
const LC_TEXT_W = Dimensions.get('window').width - 120;
function lessonHeadwordSize(word: string): number {
  return Math.max(18, Math.min(30, Math.round(LC_TEXT_W / (Math.max(1, word.length) * 0.55))));
}
import Svg, { Path } from 'react-native-svg';
import { Word } from '../data/types';
import { Palette, fonts } from '../theme/tokens';
import { speakWord } from '../lib/speak';

// The teach card of the daily test's LEARN-THEN-CHECK session (and the old warm-up lesson).
// Editorial, fills-only, no borderWidth per house rules: headword in serif with a speak button
// (same affordance as the feed/detail/Game pronounce circles - premium clip via the word id,
// on-device TTS fallback), a quiet accent micro-cap for pronunciation + part of speech, the
// meaning, and the word in a real field-relevant sentence (the corpus `ex`) so the card actually
// teaches rather than just naming the word.
//
// Variants (all additive - the default render is the original full card):
// - eyebrow: micro-cap line above the headword ("New word" / "From your feed" / "Look again").
// - brief:   one-line refresher for words the user already met in the feed today - just the
//            headword + speak + "(pos) def", no IPA/example, so returning learners aren't slowed.
// - note:    an extra quiet line under the example (the fix-phase card uses it for a synonym
//            anchor or a "one more look" nudge when no second example exists in the corpus).
export default function LessonCard({ word, co, eyebrow, brief = false, note }: {
  word: Word; co: Palette; eyebrow?: string; brief?: boolean; note?: string;
}) {
  const s = makeStyles(co);
  return (
    <View style={s.card}>
      {!!eyebrow && <Text style={s.eyebrow}>{eyebrow}</Text>}
      <View style={s.wordRow}>
        <Text style={[s.word, { fontSize: lessonHeadwordSize(word.word) }]} numberOfLines={1} adjustsFontSizeToFit={false}>{word.word}</Text>
        <Pressable
          onPress={() => speakWord(word.word, undefined, word.id)}
          hitSlop={10}
          accessibilityLabel={`Pronounce ${word.word}`}
          style={s.sayBtn}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M11 5 6 9H3v6h3l5 4V5Z" stroke={co.muted} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
            <Path d="M15.5 8.5a4.5 4.5 0 0 1 0 7" stroke={co.muted} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          </Svg>
        </Pressable>
      </View>
      {brief ? (
        <Text style={s.def} numberOfLines={2}>({word.pos}) {word.def}</Text>
      ) : (
        <>
          <Text style={s.meta}>{word.ipa ? `/${word.ipa}/  ·  ` : ''}({word.pos})</Text>
          <Text style={s.def}>{word.def}</Text>
          {!!word.ex && <Text style={s.ex}>“{word.ex}”</Text>}
        </>
      )}
      {!!note && <Text style={s.note}>{note}</Text>}
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  card: { backgroundColor: co.surface2, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 18 },
  eyebrow: { fontFamily: fonts.sansSemi, fontSize: 11, color: co.accent, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 },
  wordRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  word: { fontFamily: fonts.serif, fontSize: 26, color: co.text, letterSpacing: 0.3, flexShrink: 1 },
  sayBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: co.line2 },
  meta: { fontFamily: fonts.sansSemi, fontSize: 12, color: co.accent, letterSpacing: 0.6, marginTop: 4, textTransform: 'lowercase' },
  def: { fontFamily: fonts.sans, fontSize: 14.5, color: co.text, lineHeight: 21, marginTop: 8 },
  ex: { fontFamily: fonts.serifItalic, fontSize: 14, color: co.exText, lineHeight: 21, marginTop: 8 },
  note: { fontFamily: fonts.sans, fontSize: 12.5, color: co.muted, lineHeight: 18, marginTop: 10 },
});
