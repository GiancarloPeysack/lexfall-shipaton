import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, Share, Alert, Linking, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getWordById } from '../../lib/db';
import { feedBgFor } from '../../lib/feed-bg';
import { Word } from '../../data/types';
import BackButton from '../../components/BackButton';
import PressBounce from '../../components/PressBounce';
import { useApp } from '../../lib/app-state';
import { fonts, Palette } from '../../theme/tokens';

// expo-linear-gradient may not be linked until the next native rebuild — degrade
// to a plain View (no scrim) instead of crashing if the module isn't present yet.
let LinearGradient: any = View;
try { LinearGradient = require('expo-linear-gradient').LinearGradient; } catch {}

// Card themes the user can pick on export. The choice persists (vorto.shareTheme)
// so every future share matches their preference - like the reference "Edit theme".
type CardTheme = { id: string; bg: string; text: string; accent: string; muted: string; ex: string; border: string };
const THEMES: CardTheme[] = [
  { id: 'ink', bg: '#100E0B', text: '#ECE5D7', accent: '#C6A85C', muted: '#A39A88', ex: '#CABFA8', border: '#3E372B' },
  { id: 'cream', bg: '#F2ECDF', text: '#1C1A17', accent: '#B07D3B', muted: '#6F675A', ex: '#4A4438', border: '#DAD0BE' },
  { id: 'noir', bg: '#000000', text: '#FFFFFF', accent: '#FFFFFF', muted: '#9A9A9A', ex: '#CFCFCF', border: '#262626' },
  { id: 'sage', bg: '#14201A', text: '#EAF1EC', accent: '#9FC7A9', muted: '#8DA593', ex: '#C4D8C8', border: '#2C4034' },
  { id: 'blush', bg: '#241615', text: '#F6E7E4', accent: '#E1907F', muted: '#B2938E', ex: '#D8BDB7', border: '#3E2723' },
];
const KEY = 'vorto.shareTheme';
const BRAND_KEY = 'vorto.shareBranding'; // '1' shows the LEXFALL watermark + CTA; default off.

// ————— Icons: simple 1.7-stroke line glyphs (WordCard pattern) —————
const S = 1.7;
const IcPhoto = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M4.5 5.5h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z" stroke={c} strokeWidth={S} fill="none" strokeLinejoin="round" />
    <Circle cx={9} cy={10} r={1.6} stroke={c} strokeWidth={S} fill="none" />
    <Path d="m5.5 17 4.5-4 3 2.5 3-3 3.5 3.5" stroke={c} strokeWidth={S} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const IcPhotoOff = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M4.5 5.5h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z" stroke={c} strokeWidth={S} fill="none" strokeLinejoin="round" />
    <Path d="M5 19 19 5" stroke={c} strokeWidth={S} strokeLinecap="round" />
  </Svg>
);
const IcSave = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M12 4v10.5" stroke={c} strokeWidth={S} strokeLinecap="round" />
    <Path d="m8 11 4 4 4-4" stroke={c} strokeWidth={S} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M5 19.5h14" stroke={c} strokeWidth={S} strokeLinecap="round" />
  </Svg>
);
const IcCollection = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V7Z" stroke={c} strokeWidth={S} fill="none" strokeLinejoin="round" />
    <Path d="M12 11.2v4.6M9.7 13.5h4.6" stroke={c} strokeWidth={S} strokeLinecap="round" />
  </Svg>
);
const IcCopy = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M9.5 9.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" stroke={c} strokeWidth={S} fill="none" strokeLinejoin="round" />
    <Path d="M5.5 14.5v-9a1 1 0 0 1 1-1h9" stroke={c} strokeWidth={S} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const IcCheck = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="m5 12.5 4.5 4.5L19 7.5" stroke={c} strokeWidth={S + 0.3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const IcMark = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M12 3.5c2.8 3 6.5 6.6 6.5 10a6.5 6.5 0 0 1-13 0c0-3.4 3.7-7 6.5-10Z" stroke={c} strokeWidth={S} fill="none" strokeLinejoin="round" />
    <Path d="M9.5 13.8a2.6 2.6 0 0 0 2.1 2.6" stroke={c} strokeWidth={S} fill="none" strokeLinecap="round" />
  </Svg>
);
const IcMore = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke={c} strokeWidth={3} strokeLinecap="round" />
  </Svg>
);
// "Themes" — the appearance/contrast glyph (a half-filled circle) reads as "change the look".
const IcThemes = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={8.2} stroke={c} strokeWidth={S} fill="none" />
    <Path d="M12 3.8a8.2 8.2 0 0 0 0 16.4Z" fill={c} />
  </Svg>
);

// ————— Brand marks for the social row (recognisable, current logos) —————
const IG_GRADIENT = ['#F9CE34', '#EE2A7B', '#6228D7'];
const LgWhatsApp = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24">
    <Path fill="#FFFFFF" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.42 1.31-1.95 1.35-.5.04-.99.24-3.34-.66-2.83-1.11-4.63-3.99-4.77-4.18-.14-.18-1.13-1.5-1.13-2.86s.71-2.03.97-2.31c.25-.28.55-.35.73-.35.18 0 .37 0 .53.01.17.01.4-.06.62.48.24.58.79 2 .86 2.14.07.14.11.31.02.49-.09.18-.14.29-.28.44-.14.15-.29.34-.42.45-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.18-.19.7-.81.89-1.09.18-.28.37-.23.62-.14.25.09 1.6.76 1.87.9.28.14.46.21.53.32.07.12.07.66-.17 1.34Z" />
  </Svg>
);
const LgMessages = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24">
    <Path fill="#FFFFFF" d="M12 3C6.9 3 3 6.63 3 11.02c0 2.53 1.3 4.78 3.4 6.26-.14 1.1-.66 2.53-1.5 3.52 1.55-.2 3.32-.85 4.6-1.72.79.18 1.63.28 2.5.28 5.1 0 9-3.63 9-8.02C21 6.63 17.1 3 12 3Z" />
  </Svg>
);
const LgInstagram = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24">
    <Path d="M8 3.5h8A4.5 4.5 0 0 1 20.5 8v8a4.5 4.5 0 0 1-4.5 4.5H8A4.5 4.5 0 0 1 3.5 16V8A4.5 4.5 0 0 1 8 3.5Z" stroke="#FFFFFF" strokeWidth={1.9} fill="none" />
    <Circle cx={12} cy={12} r={3.7} stroke="#FFFFFF" strokeWidth={1.9} fill="none" />
    <Circle cx={16.7} cy={7.3} r={1.1} fill="#FFFFFF" />
  </Svg>
);
const LgFacebook = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24">
    <Path fill="#FFFFFF" d="M13.6 21v-7.4h2.5l.37-2.9H13.6V8.86c0-.84.23-1.41 1.43-1.41h1.53V4.86c-.27-.04-1.18-.12-2.24-.12-2.22 0-3.74 1.35-3.74 3.84v2.14H8.06v2.9h2.52V21h3.02Z" />
  </Svg>
);

// One round icon+caption button (Vocabulary-style action circle). A gradient (for Instagram/
// Stories) renders as the circle fill; otherwise a solid bg colour is used.
function ActionCircle({ label, onPress, bg, gradient, disabled, children, co }: {
  label: string; onPress: () => void; bg?: string; gradient?: string[]; disabled?: boolean; children: React.ReactNode; co: Palette;
}) {
  return (
    <View style={{ alignItems: 'center', width: 62 }}>
      <PressBounce
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={label}
        style={{ width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: gradient ? 'transparent' : bg, opacity: disabled ? 0.45 : 1, overflow: 'hidden' }}
      >
        {gradient && <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
        {children}
      </PressBounce>
      <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 11, color: co.muted, textAlign: 'center', marginTop: 6, lineHeight: 13 }}>
        {label}
      </Text>
    </View>
  );
}

export default function ShareCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { palette: co, feedPhotos } = useApp();
  const styles = makeStyles(co);
  const [w, setW] = useState<Word | null>(null);
  const [themeId, setThemeId] = useState('cream'); // beige/light card by default (owner)
  const [branding, setBranding] = useState(false); // watermark OFF by default (owner); "Mark on" adds it
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoReady, setPhotoReady] = useState(false);
  const [useTheme, setUseTheme] = useState(false); // false = default to the word's feed photo
  const [showThemes, setShowThemes] = useState(false); // themes are tucked behind a "Themes" button (kept out of the default two rows)
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showEx, setShowEx] = useState(true); // include the in-context example on the share card (owner: toggle it off/on)
  const cardRef = useRef<View>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Measure the preview area and fit a TRUE 9:16 card inside it, so the exported
  // image is always a clean vertical story card with the content centered (not a
  // squarish frame with the word bunched at the top).
  const [wrapBox, setWrapBox] = useState({ w: 0, h: 0 });
  // The card is laid out at a REAL story size (360×640 pt → 1080×1920 at 3×), so the
  // captured/shared image is crisp and airy like the reference. For the on-screen
  // preview it's just scaled down (transformOrigin top-left) to fit the preview area.
  const EXPORT_W = 360, EXPORT_H = 640;
  const fitScale = wrapBox.w && wrapBox.h ? Math.min(wrapBox.w / EXPORT_W, wrapBox.h / EXPORT_H) : 0;
  // Safety: if content is somehow taller than the card, scale the block to fit (never clip).
  const CARD_PAD_V = 44;
  const [contentH, setContentH] = useState(0);
  const innerH = EXPORT_H - CARD_PAD_V * 2;
  const contentScale = contentH && contentH > innerH ? innerH / contentH : 1;

  const baseTh = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  // Background: a user-picked photo wins; else (until a color theme is chosen) the word's OWN
  // feed photo — so sharing shows the picture it had in the feed, not a random theme; else solid.
  const feedBg = feedPhotos && w ? feedBgFor(w) : null;
  const bgSource = photoUri ? { uri: photoUri } : (!useTheme && feedBg ? feedBg : null);
  const hasBg = !!bgSource;
  // Over any image, force white text (a scrim supplies contrast).
  const th: CardTheme = hasBg
    ? { ...baseTh, bg: 'transparent', text: '#FFFFFF', muted: '#ECECEC', ex: '#F4F4F4', border: 'transparent' }
    : baseTh;
  const cs = cardStyles(th);

  useEffect(() => { if (id) getWordById(id).then(setW); }, [id]);
  useEffect(() => { AsyncStorage.getItem(KEY).then((v) => { if (v) setThemeId(v); }); }, []);
  useEffect(() => { AsyncStorage.getItem(BRAND_KEY).then((v) => { if (v != null) setBranding(v === '1'); }); }, []);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);
  const pickTheme = (t: string) => { setThemeId(t); setUseTheme(true); setPhotoUri(null); setPhotoReady(false); AsyncStorage.setItem(KEY, t).catch(() => {}); };
  const toggleBranding = () => setBranding((b) => { const n = !b; AsyncStorage.setItem(BRAND_KEY, n ? '1' : '0').catch(() => {}); return n; });

  if (!w) return <View style={{ flex: 1, backgroundColor: co.bg }} />;

  // The one canonical share text — used by native text share and Copy.
  const shareText = `${w.word} - /${w.ipa}/\n(${w.pos}) ${w.def}${w.ex ? `\n\n“${w.ex}”` : ''}${branding ? '\n\nLearn advanced English with Lexfall - on the App Store.' : ''}`;

  // Caption for social destinations: word + short description + the App Store link,
  // sent ALONGSIDE the card image so recipients get the photo AND a tappable link.
  const linkText = `${w.word}: ${w.def}\n\nLearn advanced English with Lexfall: https://apps.apple.com/app/id6786614029`;

  // Capture the card at its NATURAL size × device pixel ratio (no forced width/
  // height). Forcing 1080×1920 made react-native-view-shot re-lay-out the card,
  // which collapsed the auto-sizing headword (the "no word / corrupted" bug) — a
  // natural capture preserves the exact on-screen layout and stays crisp (≥3×).
  const capture = () => require('react-native-view-shot').captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });

  const pickPhoto = async () => {
    try {
      const ImagePicker = require('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      // No allowsEditing/aspect: iOS's native crop tool ignores custom aspect ratios (Android-only
      // per expo-image-picker), so it was showing a square-ish crop box that didn't match the
      // real output and didn't do anything useful - the card already renders this as a full-bleed
      // resizeMode="cover" background (line ~299), which auto-crops correctly on its own.
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1,
      });
      if (!res.canceled && res.assets?.[0]?.uri) { setPhotoReady(false); setPhotoUri(res.assets[0].uri); }
    } catch { /* module not linked yet */ }
  };
  const removePhoto = () => { setPhotoUri(null); setPhotoReady(false); };

  // The native share sheet — reads the user's installed apps and hands them the
  // card image + the link caption together. This is the "reads user apps"
  // integration (react-native-share's Share.open → iOS UIActivityViewController).
  const shareSheet = async () => {
    try {
      const uri = await capture();
      const RNShare = require('react-native-share').default;
      await RNShare.open({ url: uri, message: linkText, failOnCancel: false });
    } catch {
      // Last-resort fallbacks so a tap always does something.
      try { const uri = await capture(); await Share.share({ url: uri, message: linkText }); }
      catch { Share.share({ message: shareText }).catch(() => {}); }
    }
  };

  const APP_STORE = 'https://apps.apple.com/app/id6786614029';
  // Post to a social app if it's INSTALLED (share the card image straight into it); if it isn't,
  // open a web fallback in Safari so the tap still lands somewhere useful (owner: "has the app →
  // open it to post; doesn't → the link in Safari"). The https fallbacks are universal links, so
  // they open the app when present and the web page otherwise — no URL-scheme allow-list needed.
  const shareTo = async (social: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK', webFallback: string) => {
    try {
      const RNShare = require('react-native-share');
      const uri = await capture();
      await RNShare.default.shareSingle({
        social: RNShare.Social[social],
        url: uri,
        message: linkText,
        type: 'image/png',
        filename: 'lexfall-word',
      });
    } catch {
      // shareSingle can fail when the target app isn't installed, when its URL scheme
      // isn't in LSApplicationQueriesSchemes, or on some New-Architecture setups. Fall
      // back to the native share sheet (pick any app) so the card image always goes
      // somewhere useful, rather than bouncing to a web page. webFallback kept as a
      // last resort if even the sheet can't open.
      try { await shareSheet(); } catch { Linking.openURL(webFallback).catch(() => {}); }
    }
  };

  const onExportImage = shareSheet;

  const onSaveImage = async () => {
    try {
      const MediaLibrary = require('expo-media-library');
      // writeOnly = add-only access — all that saving needs, and avoids the full-library
      // permission (which is what was hard-crashing when its usage string was missing).
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) { Alert.alert('Allow Photos', 'Enable photo access in Settings to save the card.'); return; }
      const uri = await capture();
      await MediaLibrary.saveToLibraryAsync(uri);
      setSaved(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setSaved(false), 1400);
    } catch (e) { Alert.alert('Couldn’t save', 'Something went wrong saving the image.'); }
  };

  const onCopyText = async () => {
    try {
      await require('expo-clipboard').setStringAsync(shareText);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch { /* module not linked yet */ }
  };

  const onAddToCollection = () => router.push({ pathname: '/collections', params: { word: w.id } });

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.top}>
        <BackButton onPress={() => router.back()} co={co} variant="close" />
      </View>

      {/* The exportable card is laid out at full story size (EXPORT_W×EXPORT_H → 1080×1920
          @3×) and scaled down only for the on-screen preview, so the shared image is crisp
          and spacious like the reference. */}
      <View style={styles.cardWrap} onLayout={(e) => setWrapBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {fitScale > 0 && (
          <View style={{ width: EXPORT_W * fitScale, height: EXPORT_H * fitScale, alignSelf: 'center' }}>
            <View style={{ width: EXPORT_W, height: EXPORT_H, transform: [{ scale: fitScale }], transformOrigin: 'top left' }}>
              <View ref={cardRef} collapsable={false} style={[cs.card, { width: EXPORT_W, height: EXPORT_H, paddingVertical: CARD_PAD_V }]}>
                {hasBg && (
                  <>
                    <Image source={bgSource as any} style={StyleSheet.absoluteFill} resizeMode="cover" onLoadEnd={() => setPhotoReady(true)} />
                    <LinearGradient colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.68)']} style={StyleSheet.absoluteFill} />
                  </>
                )}
                {/* Full-bleed, centered word block (matches the reference share format). */}
                <View
                  onLayout={(e) => setContentH(e.nativeEvent.layout.height)}
                  style={{ width: '100%', alignItems: 'center', transform: [{ scale: contentScale }] }}
                >
                  <Text style={cs.word} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>{w.word}</Text>
                  {!!w.ipa && <Text style={cs.ipa} numberOfLines={1}>{w.ipa}</Text>}
                  <Text style={cs.def} numberOfLines={4} ellipsizeMode="tail">{!!w.pos && `(${w.pos}) `}{w.def}</Text>
                  {showEx && !!w.ex && <Text style={cs.ex} numberOfLines={3} ellipsizeMode="tail">{w.ex}</Text>}
                  {branding && <View style={cs.mark}><Text style={cs.markText}>Lexfall</Text></View>}
                </View>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Row 1 — actions. Themes live behind a button (kept out of the default two rows). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 20 }} style={{ flexGrow: 0, marginTop: 14 }}>
        <ActionCircle co={co} bg={co.surface2} label={photoUri ? 'Remove photo' : 'Add photo'} onPress={photoUri ? removePhoto : pickPhoto}>
          {photoUri ? <IcPhotoOff c={co.text} /> : <IcPhoto c={co.text} />}
        </ActionCircle>
        <ActionCircle co={co} bg={saved ? co.accent : co.surface2} label={saved ? 'Saved' : 'Save image'} onPress={onSaveImage}>
          {saved ? <IcCheck c={co.ink} /> : <IcSave c={co.text} />}
        </ActionCircle>
        <ActionCircle co={co} bg={co.surface2} label="Add to collection" onPress={onAddToCollection}>
          <IcCollection c={co.text} />
        </ActionCircle>
        <ActionCircle co={co} bg={copied ? co.accent : co.surface2} label={copied ? 'Copied' : 'Copy text'} onPress={onCopyText}>
          {copied ? <IcCheck c={co.ink} /> : <IcCopy c={co.text} />}
        </ActionCircle>
        <ActionCircle co={co} bg={showThemes ? co.accent : co.surface2} label="Themes" onPress={() => setShowThemes((v) => !v)}>
          <IcThemes c={showThemes ? co.ink : co.text} />
        </ActionCircle>
        <ActionCircle co={co} bg={branding ? co.accent : co.surface2} label={branding ? 'Mark on' : 'Mark off'} onPress={toggleBranding}>
          <IcMark c={branding ? co.ink : co.text} />
        </ActionCircle>
        {/* Toggle the in-context example line on/off the shared card (owner request). */}
        {!!w?.ex && (
          <ActionCircle co={co} bg={showEx ? co.accent : co.surface2} label={showEx ? 'Context on' : 'Context off'} onPress={() => setShowEx((v) => !v)}>
            <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M5 6h14M5 11h14M5 16h9" stroke={showEx ? co.ink : co.text} strokeWidth={1.8} strokeLinecap="round" fill="none" /></Svg>
          </ActionCircle>
        )}
      </ScrollView>

      {/* Themes — revealed only when "Themes" is tapped (the export matches the chosen look). */}
      {showThemes && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }} style={{ flexGrow: 0, marginTop: 12 }}>
          {THEMES.map((t) => (
            <PressBounce key={t.id} onPress={() => pickTheme(t.id)} style={[styles.swatch, { backgroundColor: t.bg, borderColor: useTheme && t.id === themeId && !photoUri ? co.accent : t.border, borderWidth: useTheme && t.id === themeId && !photoUri ? 2 : 1 }]}>
              <Text style={{ fontFamily: fonts.serif, fontSize: 17, color: t.text }}>Aa</Text>
              <View style={[styles.swatchDot, { backgroundColor: t.accent }]} />
            </PressBounce>
          ))}
        </ScrollView>
      )}

      {/* Row 2 — social destinations (current brand marks; route to the app, fall back to the sheet). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 20 }} style={{ flexGrow: 0, marginTop: 8 }}>
        <ActionCircle co={co} bg="#25D366" label="WhatsApp" onPress={() => shareTo('WHATSAPP', `https://wa.me/?text=${encodeURIComponent(linkText)}`)} disabled={!!photoUri && !photoReady}>
          <LgWhatsApp />
        </ActionCircle>
        <ActionCircle co={co} bg="#34C759" label="Messages" onPress={shareSheet} disabled={!!photoUri && !photoReady}>
          <LgMessages />
        </ActionCircle>
        <ActionCircle co={co} gradient={IG_GRADIENT} label="Stories" onPress={() => shareTo('INSTAGRAM', APP_STORE)} disabled={!!photoUri && !photoReady}>
          <LgInstagram />
        </ActionCircle>
        <ActionCircle co={co} gradient={IG_GRADIENT} label="Instagram" onPress={() => shareTo('INSTAGRAM', APP_STORE)} disabled={!!photoUri && !photoReady}>
          <LgInstagram />
        </ActionCircle>
        <ActionCircle co={co} bg="#1877F2" label="Facebook" onPress={() => shareTo('FACEBOOK', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_STORE)}`)} disabled={!!photoUri && !photoReady}>
          <LgFacebook />
        </ActionCircle>
        <ActionCircle co={co} bg={co.glass2} label="More" onPress={shareSheet} disabled={!!photoUri && !photoReady}>
          <IcMore c={co.text} />
        </ActionCircle>
      </ScrollView>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: co.bg, paddingHorizontal: 20 },
  top: { paddingBottom: 8 },
  cardWrap: { flex: 1, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 50, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 6 },
  swatchDot: { width: 16, height: 4, borderRadius: 2 },
  share: { backgroundColor: co.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 12 },
  shareText: { fontFamily: fonts.sansSemi, fontSize: 15.5, color: co.ink },
  hint: { fontFamily: fonts.sans, fontSize: 12, color: co.faint, textAlign: 'center', marginTop: 12 },
});

const cardStyles = (t: CardTheme) => StyleSheet.create({
  // Full-bleed 9:16 (dimensions applied inline). No border — text sits directly on the
  // background like the reference share format. Word is the hero; block auto-scales to fit.
  card: { alignSelf: 'center', borderRadius: 34, backgroundColor: t.bg, paddingHorizontal: 26, paddingVertical: 24, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  word: { fontFamily: fonts.serif, fontSize: 82, lineHeight: 86, color: t.text, letterSpacing: -0.5, textAlign: 'center' },
  ipa: { fontFamily: fonts.sans, fontSize: 20, color: t.muted, marginTop: 20, textAlign: 'center' },
  def: { fontFamily: fonts.sans, fontSize: 21, color: t.text, lineHeight: 29, marginTop: 26, textAlign: 'center' },
  ex: { fontFamily: fonts.sans, fontSize: 16.5, color: t.muted, lineHeight: 24, marginTop: 22, textAlign: 'center' },
  mark: { marginTop: 34, backgroundColor: 'rgba(120,110,90,0.16)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  markText: { fontFamily: fonts.sansMedium, fontSize: 13, letterSpacing: 0.4, color: t.muted },
});
