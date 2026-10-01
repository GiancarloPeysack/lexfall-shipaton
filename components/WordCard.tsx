import { View, Text, Image, Pressable, Share, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { speakWord } from '../lib/speak';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { fonts, label, Palette } from '../theme/tokens';
import { Word } from '../data/types';
import { getWordCollection, setWordCollection, unsaveWord, isLiked, toggleLiked } from '../lib/db';
import { recordTaste } from '../lib/taste';
import { markPresented } from '../lib/presented';
import { feedBgFor } from '../lib/feed-bg';
import { useApp } from '../lib/app-state';
import { playSfx } from '../lib/sfx';
import PressBounce from './PressBounce';
import FadeIn from './FadeIn';

// expo-linear-gradient may not be linked until the next native rebuild — degrade
// to a plain (transparent) View so the feed still renders instead of crashing.
let LinearGradient: any = View;
try { LinearGradient = require('expo-linear-gradient').LinearGradient; } catch {}

export default function WordCard({ word, onSaved, height: cardH }: { word: Word; onSaved?: () => void; height?: number }) {
  const win = useWindowDimensions();
  const height = cardH ?? win.height; // match the list viewport exactly, not the window
  // Headword sizing (owner: it read too small at a flat size). adjustsFontSizeToFit is unusable on
  // the New Architecture (it scales UP to fill width, overriding fontSize), so we size to the
  // available width by hand: short words render BIG and only genuinely long ones shrink to stay on
  // one line — the "fills the width" look the app had before, without the auto-fit bug or clipping.
  const wordSize = Math.max(30, Math.min(66, Math.round((win.width - 56) / (Math.max(1, word.word.length) * 0.64))));
  const insets = useSafeAreaInsets();
  const { palette: co, feedPhotos } = useApp();
  const styles = makeStyles(co);
  const router = useRouter();
  const [liked, setLiked] = useState(false);
  const [savedCol, setSavedCol] = useState<string | null>(null);
  const [banner, setBanner] = useState(false);
  // Feed cards show the word + its meaning by default; tapping "i" reveals the
  // in-context example + extra info. State is per-card (FlatList keys items by
  // id), so it resets naturally when you scroll to a new word.
  const [revealed, setRevealed] = useState(false);

  // Refresh save/like state whenever the feed regains focus (e.g. after the
  // Collections sheet moves this word to a different collection).
  useFocusEffect(useCallback(() => {
    let alive = true;
    getWordCollection(word.id).then((c) => { if (alive) setSavedCol(c); });
    isLiked(word.id).then((v) => { if (alive) setLiked(v); });
    return () => { alive = false; };
  }, [word.id]));

  // Any real interaction with a card (audio, save, like, example, share) marks the word
  // PRESENTED (lib/presented.ts) immediately — the user has genuinely met it, so the daily
  // test must never teach it as new. Scrolling past alone does NOT do this; the feed's dwell
  // gate (>= 2s on screen) handles reading-without-touching.
  const say = () => { Haptics.selectionAsync(); speakWord(word.word, undefined, word.id); recordTaste(word, 0.6); markPresented(word.id); };

  const onSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markPresented(word.id);
    if (savedCol) {
      await unsaveWord(word.id);
      setSavedCol(null); setBanner(false);
    } else {
      await setWordCollection(word.id, 'Want to learn');
      setSavedCol('Want to learn'); setBanner(true);
      playSfx('correct');
      recordTaste(word, 1.5);
      setTimeout(() => setBanner(false), 3200);
    }
    onSaved?.(); // let the feed refresh its "saved today" tracker
  };
  const openCollections = () => router.push({ pathname: '/collections', params: { word: word.id } });
  const onShare = () => {
    markPresented(word.id);
    const lines = [
      word.ipa ? `${word.word}  /${word.ipa}/` : word.word,
      `(${word.pos}) ${word.def}`,
    ];
    if (word.ex) lines.push(`\n“${word.ex}”`);
    lines.push(`\nLearn advanced English with Lexfall.`);
    Share.share({ message: lines.join('\n') }).catch(() => {});
  };

  // Photo backgrounds are opt-in (Profile > Photo backgrounds); off = flat dark card.
  const bg = feedPhotos ? feedBgFor(word) : null;
  // Over a photo, bone icons on the translucent-bone chips vanish — give the chips a
  // dark backing and switch the icons to bone so controls + speaker stay legible.
  const iconCol = feedPhotos ? '#F4EEE2' : co.text;

  return (
    <View style={[styles.card, { height }]}>
      {bg && (
        <>
          <Image source={bg} style={StyleSheet.absoluteFill} resizeMode="cover" />
          {/* Dark scrim: darker at the very top/bottom (behind header + controls)
              and a steady veil through the middle, so bone text stays legible over
              any photo while keeping the moody, cinematic look. */}
          <LinearGradient
            colors={['rgba(14,12,9,0.72)', 'rgba(14,12,9,0.40)', 'rgba(14,12,9,0.52)', 'rgba(14,12,9,0.86)']}
            locations={[0, 0.30, 0.62, 1]}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
      {banner && (
        <View style={[styles.banner, { top: insets.top + 52 }]}>
          <Text style={styles.bannerText}>Saved to <Text style={{ color: co.text }}>{savedCol}</Text></Text>
          <PressBounce onPress={openCollections} hitSlop={8}><Text style={styles.bannerChange}>Change</Text></PressBounce>
        </View>
      )}

      {/* Word block, truly vertically centered (the card uses justifyContent:center;
          controls are absolutely pinned near the bottom, so they don't push it up). */}
      <FadeIn duration={260} offset={10}>
        <Pressable onPress={() => router.push(`/word/${word.id}`)}>
          {/* NO adjustsFontSizeToFit: on the New Architecture it SCALES THE WORD UP to fill
              the width, overriding fontSize entirely (that's why size edits did nothing).
              fontSize 34 fits ~18 chars on one line; allowFontScaling stays. */}
          <Text style={[styles.word, { fontSize: wordSize }, feedPhotos && styles.wordOnPhoto]} numberOfLines={1} adjustsFontSizeToFit={false}>{word.word}</Text>
        </Pressable>

        {/* Pronunciation as a centered pill (IPA + speaker) — matches the reference
            word screen. The part-of-speech prefixes the definition below. */}
        <View style={[styles.pronPill, feedPhotos && styles.pronPillOnPhoto]}>
          {!!word.ipa && <Text style={[styles.ipa, feedPhotos && styles.subOnPhoto]}>{word.ipa}</Text>}
          <PressBounce onPress={say} hitSlop={10} accessibilityLabel={`Pronounce ${word.word}`}>
            <Svg width={17} height={17} viewBox="0 0 24 24">
              <Path d="M11 5 6 9H3v6h3l5 4V5Z" stroke={iconCol} strokeWidth={1.5} fill="none" />
              <Path d="M15.5 8.5a4.5 4.5 0 0 1 0 7" stroke={iconCol} strokeWidth={1.5} fill="none" />
            </Svg>
          </PressBounce>
        </View>

        {/* Never truncate the meaning (owner: a cut "…" definition is not permitted). Defs are
            capped to ~one sentence by cleanDef, so the full text fits without overflowing. */}
        <Text style={[styles.def, feedPhotos && styles.defOnPhoto]}>
          <Text style={[styles.pos, feedPhotos && styles.subOnPhoto]}>({word.pos}) </Text>{word.def}
        </Text>

        {/* Optional, compact "show example" — separate from the "i" (which opens the
            full detail screen). Because the card uses equal top/bottom spacers, the
            word stays centered whether or not the example is shown. */}
        {!!word.ex && (
          <PressBounce onPress={() => { Haptics.selectionAsync(); setRevealed((v) => !v); markPresented(word.id); }} hitSlop={8} style={styles.ctxToggle}>
            <Text style={[styles.ctxToggleText, feedPhotos && styles.subOnPhoto]}>{revealed ? 'Hide example' : 'Show example'} {revealed ? '⌃' : '⌄'}</Text>
          </PressBounce>
        )}
        {revealed && !!word.ex && (
          <Text style={[styles.exText, feedPhotos && styles.exTextOnPhoto]}>{word.ex}</Text>
        )}
      </FadeIn>

      <View style={[styles.controls, { bottom: insets.bottom + 108 }]}>
        <PressBounce
          onPress={() => { Haptics.selectionAsync(); router.push(`/word/${word.id}`); }}
          hitSlop={6}
          accessibilityLabel="Word details"
          style={[styles.glass, feedPhotos && styles.glassOnPhoto]}
        >
          <Svg width={26} height={26} viewBox="0 0 24 24">
            <Path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke={iconCol} strokeWidth={1.7} fill="none" />
            <Path d="M12 11.5v4.5" stroke={iconCol} strokeWidth={1.8} strokeLinecap="round" />
            <Path d="M12 7.8h.01" stroke={iconCol} strokeWidth={2.2} strokeLinecap="round" />
          </Svg>
        </PressBounce>
        <Control
          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"
          active={liked}
          label="Like"
          co={co}
          onPhoto={feedPhotos}
          onPress={async () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); markPresented(word.id); const now = await toggleLiked(word.id); setLiked(now); if (now) playSfx('correct'); recordTaste(word, now ? 2 : -1); }}
        />
        <Control
          d="M6 4h12v16l-6-4-6 4V4Z"
          active={!!savedCol}
          label="Save"
          co={co}
          onPhoto={feedPhotos}
          onPress={onSave}
          onLongPress={openCollections}
        />
        <Control
          d="M12 15V4M8 8l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"
          active={false}
          label="Share"
          co={co}
          onPhoto={feedPhotos}
          onPress={() => { Haptics.selectionAsync(); markPresented(word.id); router.push(`/share/${word.id}`); }}
          onLongPress={onShare}
        />
      </View>
    </View>
  );
}

// Big "glass" action button - 56pt target, translucent circle, gold when active.
function Control({ d, onPress, onLongPress, active, label: lbl, co, onPhoto }: { d: string; onPress: () => void; onLongPress?: () => void; active: boolean; label: string; co: Palette; onPhoto?: boolean }) {
  const iconCol = active ? co.ink : onPhoto ? '#F4EEE2' : co.text;
  return (
    <PressBounce
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      hitSlop={6}
      accessibilityLabel={lbl}
      style={{
        width: 56, height: 56, borderRadius: 28,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? co.accent : onPhoto ? 'rgba(18,14,10,0.42)' : co.glass2,
        shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5,
      }}
    >
      <Svg width={26} height={26} viewBox="0 0 24 24">
        <Path d={d} stroke={iconCol} fill={active ? co.ink : 'none'} strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </PressBounce>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  card: { paddingHorizontal: 30, justifyContent: 'center' },
  banner: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: co.surface2, borderWidth: 1, borderColor: co.line2, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, zIndex: 20 },
  bannerText: { fontFamily: fonts.sans, fontSize: 15, color: co.muted },
  bannerChange: { fontFamily: fonts.sansMedium, fontSize: 15, color: co.accent },
  // Defaults use the theme palette (flat dark card, no shadows); the *OnPhoto
  // overrides apply hardcoded light bone + text-shadows ONLY when a photo bg is on.
  // Original look: fontSize 52 + lineHeight 58 made adjustsFontSizeToFit shrink the word
  // hard to fit the 58px line box — measured against the (unchanged) definition text, that
  // rendered ~34px, not 52. Reproduce that size directly (fontSize 34, NO lineHeight) so it
  // matches the original AND natural font metrics make the ascender clip impossible.
  // Original (old arch) look: fontSize 52 + lineHeight 58 let adjustsFontSizeToFit height-cap
  // EVERY word to ~40px. On the New Architecture adjustsFontSizeToFit no longer shrinks for the
  // line-box HEIGHT, so short words ballooned to 52px and clipped. Reproduce the original by
  // capping fontSize at ~40 with NO lineHeight: short words render at 40 (the original cap),
  // long words still shrink to width, and natural metrics make the ascender clip impossible.
  // Measured against the prior-version device screenshots: headword/definition height
  // ratio was ~1.71 (caustic), i.e. ~35px effective. 40/46 overshot. fontSize 35 + no
  // lineHeight reproduces the original size with un-clippable natural metrics.
  word: { fontFamily: fonts.serif, fontSize: 48, color: co.text, marginTop: 12, letterSpacing: -0.5, textAlign: 'center' },
  wordOnPhoto: { color: '#F4EEE2', textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 12 },
  pronPill: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 10, marginTop: 16, backgroundColor: co.surface2, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  ipa: { fontFamily: fonts.serifItalic, fontSize: 16, color: co.muted },
  pos: { fontFamily: fonts.serifItalic, fontSize: 16, color: co.muted },
  subOnPhoto: { color: '#D8CFBD', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 },
  def: { fontFamily: fonts.sans, fontSize: 20, color: co.text, lineHeight: 28, marginTop: 22, textAlign: 'center' },
  defOnPhoto: { color: '#F1EBDD', textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 10 },
  ctxToggle: { alignSelf: 'center', marginTop: 16, paddingVertical: 4, paddingHorizontal: 10 },
  ctxToggleText: { fontFamily: fonts.sansMedium, fontSize: 13, color: co.accent, letterSpacing: 0.3 },
  exText: { fontFamily: fonts.serifItalic, fontSize: 17, color: co.exText, lineHeight: 26, textAlign: 'center', marginTop: 10, paddingHorizontal: 8 },
  exTextOnPhoto: { color: '#EDE6D6', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 10 },
  controls: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  glass: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: co.glass2, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  glassOnPhoto: { backgroundColor: 'rgba(18,14,10,0.42)' },
  pronPillOnPhoto: { backgroundColor: 'rgba(18,14,10,0.42)' },
});
