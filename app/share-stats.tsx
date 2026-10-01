import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Share, Alert, Linking, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { getStreak, getWordsLearnedTotal, getPracticeCount, getSkillBreakdown, scoreToLevel } from '../lib/db';
import { getAccuracy } from '../lib/metrics';
import BackButton from '../components/BackButton';
import PressBounce from '../components/PressBounce';
import { useApp } from '../lib/app-state';
import { fonts } from '../theme/tokens';
import {
  ActionCircle, IG_GRADIENT, IcSave, IcCopy, IcThemes, IcCheck, IcMore,
  LgWhatsApp, LgMessages, LgInstagram, LgFacebook,
} from '../components/ShareActions';

const FIELD_LABEL: Record<string, string> = { gen: 'General', med: 'Medicine', law: 'Law', biz: 'Business', new: 'Modern & slang' };
const APP_STORE = 'https://apps.apple.com/app/id6786614029';

// Same five looks as the word share card, so the streak card is themeable too.
type CardTheme = { id: string; bg: string; text: string; muted: string; accent: string; line: string };
const THEMES: CardTheme[] = [
  { id: 'cream',  bg: '#F4F0E8', text: '#211D16', muted: '#6E665A', accent: '#9A7B2E', line: '#D3CAB8' },
  { id: 'ink',    bg: '#100E0B', text: '#ECE5D7', muted: '#B6AD9A', accent: '#C6A85C', line: '#3E372B' },
  { id: 'black',  bg: '#0B0B0B', text: '#F2F2F2', muted: '#9A9A9A', accent: '#D8C48F', line: '#2A2A2A' },
  { id: 'forest', bg: '#16231C', text: '#EAF0EA', muted: '#9DB0A2', accent: '#8FA76B', line: '#2C3B31' },
  { id: 'rust',   bg: '#241413', text: '#F3E7E2', muted: '#C0A79E', accent: '#C57B5B', line: '#3A241F' },
];
const KEY = 'vorto.statCardTheme';

export default function ShareStats() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { palette: co } = useApp();
  const cardRef = useRef<View>(null);
  const [streak, setStreak] = useState(0);
  const [total, setTotal] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [practised, setPractised] = useState(0);
  const [topArea, setTopArea] = useState<{ name: string; level: string } | null>(null);
  const [themeId, setThemeId] = useState('cream'); // beige/light by default (matches the word card)
  const [showThemes, setShowThemes] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = THEMES.find((x) => x.id === themeId) ?? THEMES[0];
  const s = makeStyles(t, co);
  // Lay the card out at a real story size (1080×1920 @3×) and scale it down for the
  // preview, so the exported image is a full-bleed vertical card (not a compact float).
  const [wrapBox, setWrapBox] = useState({ w: 0, h: 0 });
  const EXPORT_W = 360, EXPORT_H = 640;
  const fitScale = wrapBox.w && wrapBox.h ? Math.min(wrapBox.w / EXPORT_W, wrapBox.h / EXPORT_H) : 0;

  useEffect(() => {
    getStreak().then(setStreak);
    getWordsLearnedTotal().then(setTotal);
    getAccuracy().then(setAccuracy);
    getPracticeCount().then(setPractised);
    getSkillBreakdown('field').then((rows) => {
      if (!rows.length) return;
      const top = rows.reduce((a, b) => (b.total > a.total ? b : a));
      setTopArea({ name: FIELD_LABEL[top.key] ?? top.key, level: scoreToLevel(top.score) });
    });
    AsyncStorage.getItem(KEY).then((v) => { if (v) setThemeId(v); }).catch(() => {});
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const pickTheme = (id: string) => { setThemeId(id); AsyncStorage.setItem(KEY, id).catch(() => {}); };

  const shareMessage = `${streak}-day streak on Lexfall 🔥 - ${total} advanced words learned${topArea ? `, ${topArea.name} at ${topArea.level}` : ''}. Building the habit, one word a day.`;
  const linkText = `${shareMessage}\n\nLearn advanced English with Lexfall: ${APP_STORE}`;

  const capture = () => require('react-native-view-shot').captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });

  // The native share sheet — hands the card image + link to whatever apps the user has.
  const shareSheet = async () => {
    try {
      const uri = await capture();
      const RNShare = require('react-native-share').default;
      await RNShare.open({ url: uri, message: linkText, failOnCancel: false });
    } catch {
      try { const uri = await capture(); await Share.share({ url: uri, message: linkText }); }
      catch { Share.share({ message: linkText }).catch(() => {}); }
    }
  };
  // Post to a social app if installed; otherwise open a web fallback in Safari.
  const shareTo = async (social: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK', webFallback: string) => {
    try {
      const RNShare = require('react-native-share');
      const uri = await capture();
      await RNShare.default.shareSingle({ social: RNShare.Social[social], url: uri, message: linkText, type: 'image/png', filename: 'lexfall-streak' });
    } catch {
      Linking.openURL(webFallback).catch(() => shareSheet());
    }
  };
  const onCopyText = async () => {
    try {
      await require('expo-clipboard').setStringAsync(linkText);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch { /* module not linked yet */ }
  };
  const onSaveImage = async () => {
    try {
      const MediaLibrary = require('expo-media-library');
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) { Alert.alert('Allow Photos', 'Enable photo access in Settings to save the card.'); return; }
      const uri = await capture();
      await MediaLibrary.saveToLibraryAsync(uri);
      setSaved(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), 1400);
    } catch { Alert.alert('Couldn’t save', 'Something went wrong saving the image.'); }
  };

  const stats: [string, string][] = [
    [String(total), 'Words learned'],
    [accuracy == null ? '-' : `${accuracy}%`, 'Quiz accuracy'],
    [String(practised), 'Practised'],
  ];

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 }]}>
      <View style={s.top}><BackButton onPress={() => router.back()} co={co} variant="close" /></View>

      <View style={s.cardWrap} onLayout={(e) => setWrapBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {fitScale > 0 && (
      <View style={{ width: EXPORT_W * fitScale, height: EXPORT_H * fitScale, alignSelf: 'center' }}>
      <View style={{ width: EXPORT_W, height: EXPORT_H, transform: [{ scale: fitScale }], transformOrigin: 'top left' }}>
      <View ref={cardRef} collapsable={false} style={[s.card, { width: EXPORT_W, height: EXPORT_H }]}>
        <Text style={s.brand}>LEXFALL</Text>

        <View style={{ alignItems: 'center' }}>
          <View style={s.flameWrap}>
            <Svg width={168} height={186} viewBox="0 0 120 132">
              <Path d="M60 6c14 20 34 30 34 60a34 34 0 0 1-68 0c0-10 4-18 10-25 4 6 8 10 8 18 3-5 6-11 6-19 0-13-3-24 0-34Z" fill={t.accent} />
              <Path d="M60 60c7 8 13 15 13 24a13 13 0 0 1-26 0c0-6 4-11 7-15 2 3 4 5 6 8 0-6-1-11 0-17Z" fill="#000" opacity={0.28} />
            </Svg>
            <Text style={s.flameNum}>{streak}</Text>
          </View>
          <Text style={s.streak}>{streak} day streak</Text>
          <Text style={s.tagline}>I've made a habit of learning{'\n'}new words every day.</Text>
          {topArea && <Text style={s.strong}>Strongest: {topArea.name} · {topArea.level}</Text>}
        </View>

        <View style={s.statsRow}>
          {stats.map(([n, l], i) => (
            <View key={l} style={[s.stat, i > 0 && s.statDiv]}>
              <Text style={s.statN}>{n}</Text>
              <Text style={s.statL}>{l}</Text>
            </View>
          ))}
        </View>

        <Text style={s.cta}>Advanced English, daily · on the App Store</Text>
      </View>
      </View>
      </View>
      )}
      </View>

      {/* Row 1 — actions (themes tucked behind a button, so the default is two rows). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 20 }} style={{ flexGrow: 0, marginTop: 14 }}>
        <ActionCircle co={co} bg={saved ? co.accent : co.surface2} label={saved ? 'Saved' : 'Save image'} onPress={onSaveImage}>
          {saved ? <IcCheck c={co.ink} /> : <IcSave c={co.text} />}
        </ActionCircle>
        <ActionCircle co={co} bg={copied ? co.accent : co.surface2} label={copied ? 'Copied' : 'Copy text'} onPress={onCopyText}>
          {copied ? <IcCheck c={co.ink} /> : <IcCopy c={co.text} />}
        </ActionCircle>
        <ActionCircle co={co} bg={showThemes ? co.accent : co.surface2} label="Themes" onPress={() => setShowThemes((v) => !v)}>
          <IcThemes c={showThemes ? co.ink : co.text} />
        </ActionCircle>
      </ScrollView>

      {/* Themes — revealed only when "Themes" is tapped. */}
      {showThemes && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }} style={{ flexGrow: 0, marginTop: 12 }}>
          {THEMES.map((x) => (
            <PressBounce key={x.id} onPress={() => pickTheme(x.id)} style={[s.swatch, { backgroundColor: x.bg, borderColor: x.id === themeId ? co.accent : x.line, borderWidth: x.id === themeId ? 2 : 1 }]}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: x.accent }} />
            </PressBounce>
          ))}
        </ScrollView>
      )}

      {/* Row 2 — social destinations (open the app if installed, else the link in Safari). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 20 }} style={{ flexGrow: 0, marginTop: 8 }}>
        <ActionCircle co={co} bg="#25D366" label="WhatsApp" onPress={() => shareTo('WHATSAPP', `https://wa.me/?text=${encodeURIComponent(linkText)}`)}>
          <LgWhatsApp />
        </ActionCircle>
        <ActionCircle co={co} bg="#34C759" label="Messages" onPress={shareSheet}>
          <LgMessages />
        </ActionCircle>
        <ActionCircle co={co} gradient={IG_GRADIENT} label="Stories" onPress={() => shareTo('INSTAGRAM', APP_STORE)}>
          <LgInstagram />
        </ActionCircle>
        <ActionCircle co={co} gradient={IG_GRADIENT} label="Instagram" onPress={() => shareTo('INSTAGRAM', APP_STORE)}>
          <LgInstagram />
        </ActionCircle>
        <ActionCircle co={co} bg="#1877F2" label="Facebook" onPress={() => shareTo('FACEBOOK', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_STORE)}`)}>
          <LgFacebook />
        </ActionCircle>
        <ActionCircle co={co} bg={co.glass2} label="More" onPress={shareSheet}>
          <IcMore c={co.text} />
        </ActionCircle>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: CardTheme, co: { bg: string; muted: string }) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: co.bg, paddingHorizontal: 20 },
  top: { paddingBottom: 8 },
  cardWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 6 },
  // Shadow so the card always reads as a distinct object in the preview — the default cream card was
  // invisible against the light app background (cream on cream, no border). The exported PNG is the
  // card itself, so this only affects on-screen visibility, which is exactly the problem.
  card: { borderRadius: 34, backgroundColor: t.bg, paddingHorizontal: 34, paddingVertical: 40, justifyContent: 'space-between', overflow: 'hidden', ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }, default: { elevation: 8 } }) },
  brand: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 3, color: t.accent },
  flameWrap: { alignItems: 'center', justifyContent: 'center' },
  flameNum: { position: 'absolute', bottom: 34, fontFamily: fonts.serif, fontSize: 48, color: t.bg },
  streak: { fontFamily: fonts.serif, fontSize: 40, color: t.text, marginTop: 6, letterSpacing: -0.5 },
  tagline: { fontFamily: fonts.sans, fontSize: 16, color: t.muted, textAlign: 'center', lineHeight: 24, marginTop: 12 },
  strong: { fontFamily: fonts.sansSemi, fontSize: 13, letterSpacing: 1, color: t.accent, marginTop: 14 },
  statsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.line, paddingTop: 22 },
  stat: { flex: 1, alignItems: 'center' },
  statDiv: { borderLeftWidth: 1, borderLeftColor: t.line },
  statN: { fontFamily: fonts.serif, fontSize: 26, color: t.text },
  statL: { fontFamily: fonts.sans, fontSize: 11.5, color: t.muted, marginTop: 4 },
  cta: { fontFamily: fonts.sansMedium, fontSize: 13, color: t.muted, textAlign: 'center' },
  swatch: { width: 50, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
