import Svg, { Path, Circle, Rect } from 'react-native-svg';

// Shared line-icon set so rows/accessories use real SVG icons, not text glyphs.
export type IconName =
  | 'chevron' | 'heart' | 'plus' | 'bookmark' | 'folder' | 'pencil'
  | 'book' | 'search' | 'grid' | 'star';

const P: Record<IconName, string> = {
  chevron: 'M9 6l6 6-6 6',
  heart: 'M12 20s-7-4.35-9.33-8.11C1 9.05 2.36 5.5 5.9 5.06c2-.25 3.62.86 4.6 2.14h1c.98-1.28 2.6-2.39 4.6-2.14 3.54.44 4.9 3.99 3.23 6.83C17 15.65 12 20 12 20Z',
  plus: 'M12 5v14M5 12h14',
  bookmark: 'M6 4h12v16l-6-4-6 4V4Z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  pencil: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z',
  book: 'M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.35-4.35',
  grid: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z',
};

export default function Icon({ name, color, size = 20, filled = false, strokeWidth = 1.6 }: {
  name: IconName; color: string; size?: number; filled?: boolean; strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={P[name]} stroke={color} strokeWidth={strokeWidth} fill={filled ? color : 'none'} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Convenience chevron for list-row accessories.
export function Chevron({ color, size = 18 }: { color: string; size?: number }) {
  return <Icon name="chevron" color={color} size={size} strokeWidth={1.5} />;
}
