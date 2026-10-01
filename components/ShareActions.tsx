import { View, Text } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import PressBounce from './PressBounce';
import { fonts, Palette } from '../theme/tokens';

// Shared share-sheet building blocks (round action circles + current social brand marks), so the
// word card and the streak card offer the SAME actions and logos. expo-linear-gradient may not be
// linked until the next native rebuild → degrade to a plain View so we never crash.
let LinearGradient: any = View;
try { LinearGradient = require('expo-linear-gradient').LinearGradient; } catch {}

const S = 1.7;
export const IcSave = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M12 4v10.5" stroke={c} strokeWidth={S} strokeLinecap="round" />
    <Path d="m8 11 4 4 4-4" stroke={c} strokeWidth={S} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M5 19.5h14" stroke={c} strokeWidth={S} strokeLinecap="round" />
  </Svg>
);
export const IcCopy = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M9.5 9.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" stroke={c} strokeWidth={S} fill="none" strokeLinejoin="round" />
    <Path d="M5.5 14.5v-9a1 1 0 0 1 1-1h9" stroke={c} strokeWidth={S} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
export const IcCheck = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="m5 12.5 4.5 4.5L19 7.5" stroke={c} strokeWidth={S + 0.3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
export const IcThemes = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={8.2} stroke={c} strokeWidth={S} fill="none" />
    <Path d="M12 3.8a8.2 8.2 0 0 0 0 16.4Z" fill={c} />
  </Svg>
);
export const IcMore = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke={c} strokeWidth={3} strokeLinecap="round" />
  </Svg>
);

export const IG_GRADIENT = ['#F9CE34', '#EE2A7B', '#6228D7'];
export const LgWhatsApp = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24">
    <Path fill="#FFFFFF" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.42 1.31-1.95 1.35-.5.04-.99.24-3.34-.66-2.83-1.11-4.63-3.99-4.77-4.18-.14-.18-1.13-1.5-1.13-2.86s.71-2.03.97-2.31c.25-.28.55-.35.73-.35.18 0 .37 0 .53.01.17.01.4-.06.62.48.24.58.79 2 .86 2.14.07.14.11.31.02.49-.09.18-.14.29-.28.44-.14.15-.29.34-.42.45-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.18-.19.7-.81.89-1.09.18-.28.37-.23.62-.14.25.09 1.6.76 1.87.9.28.14.46.21.53.32.07.12.07.66-.17 1.34Z" />
  </Svg>
);
export const LgMessages = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24">
    <Path fill="#FFFFFF" d="M12 3C6.9 3 3 6.63 3 11.02c0 2.53 1.3 4.78 3.4 6.26-.14 1.1-.66 2.53-1.5 3.52 1.55-.2 3.32-.85 4.6-1.72.79.18 1.63.28 2.5.28 5.1 0 9-3.63 9-8.02C21 6.63 17.1 3 12 3Z" />
  </Svg>
);
export const LgInstagram = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24">
    <Path d="M8 3.5h8A4.5 4.5 0 0 1 20.5 8v8a4.5 4.5 0 0 1-4.5 4.5H8A4.5 4.5 0 0 1 3.5 16V8A4.5 4.5 0 0 1 8 3.5Z" stroke="#FFFFFF" strokeWidth={1.9} fill="none" />
    <Circle cx={12} cy={12} r={3.7} stroke="#FFFFFF" strokeWidth={1.9} fill="none" />
    <Circle cx={16.7} cy={7.3} r={1.1} fill="#FFFFFF" />
  </Svg>
);
export const LgFacebook = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24">
    <Path fill="#FFFFFF" d="M13.6 21v-7.4h2.5l.37-2.9H13.6V8.86c0-.84.23-1.41 1.43-1.41h1.53V4.86c-.27-.04-1.18-.12-2.24-.12-2.22 0-3.74 1.35-3.74 3.84v2.14H8.06v2.9h2.52V21h3.02Z" />
  </Svg>
);

// One round icon+caption button. A gradient (Instagram/Stories) renders as the circle fill;
// otherwise a solid bg colour is used.
export function ActionCircle({ label, onPress, bg, gradient, disabled, children, co }: {
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
        {gradient && <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />}
        {children}
      </PressBounce>
      <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 11, color: co.muted, textAlign: 'center', marginTop: 6, lineHeight: 13 }}>
        {label}
      </Text>
    </View>
  );
}
