import { Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Palette } from '../theme/tokens';

// Discoverable, thumb-friendly 38px circular back/close control used in every
// pushed/modal screen header (replaces bare 24px glyphs).
export default function BackButton({ onPress, co, variant = 'chevron' }: {
  onPress: () => void; co: Palette; variant?: 'chevron' | 'close';
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityLabel={variant === 'close' ? 'Close' : 'Back'}
      style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: co.surface2, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24">
        {variant === 'close'
          ? <Path d="M6 6l12 12M18 6L6 18" stroke={co.text} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          : <Path d="M15 18l-6-6 6-6" stroke={co.text} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      </Svg>
    </Pressable>
  );
}
