// Hand-drawn-style line illustrations (ink / bone / gold), inspired by the
// reference app's topic art. Loose strokes, slight rotations, dotted gold pads.
import Svg, { Path, Circle, Ellipse, Rect, Line, G } from 'react-native-svg';
import { Palette } from '../theme/tokens';

export type IlloName =
  | 'faces' | 'body' | 'pill' | 'scales' | 'contract' | 'coins' | 'briefcase'
  | 'megaphone' | 'chat' | 'phone' | 'sparkle' | 'book'
  | 'heart' | 'bookmarks' | 'pen' | 'clock' | 'leaf';

// Pick an illustration from a topic/category name.
export function illoFor(topic: string): IlloName {
  const t = topic.toLowerCase();
  if (/emotion|vibe|mind|character|reaction/.test(t)) return 'faces';
  if (/pharma/.test(t)) return 'pill';
  if (/body|patient|care|diagnos|medic|health|anatomy/.test(t)) return 'body';
  if (/litig|advoca|legisl|law|justice|court|crime/.test(t)) return 'scales';
  if (/contract|property|estate/.test(t)) return 'contract';
  if (/financ|money|econom|invest|account/.test(t)) return 'coins';
  if (/strateg|manage|governance|work|career|people/.test(t)) return 'briefcase';
  if (/market|brand|advertis/.test(t)) return 'megaphone';
  if (/negoti|dating|friend|society|social|relation/.test(t)) return 'chat';
  if (/internet|meme|tech|online|digital/.test(t)) return 'phone';
  if (/trend|aesthetic|style|fashion/.test(t)) return 'sparkle';
  if (/nature|sense|science|world/.test(t)) return 'leaf';
  return 'book';
}

// Grounding ellipses removed (owner call): a drop-shadow convention nothing else in the app
// uses, and a signature of the stock assets rather than of Lexfall. Kept as a no-op so the
// existing <Pad/> call sites stay valid until each illo is redrawn flat.
const Pad = (_: { cx: number; cy: number; rx: number; a: string }) => null;

export default function Illo({ name, co, size = 84 }: { name: IlloName; co: Palette; size?: number }) {
  const s = { stroke: co.text, strokeWidth: 2, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const sf = { ...s, fill: co.surface2 };
  const a = co.accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      {name === 'faces' && (<G>
        <Pad cx={30} cy={52} rx={18} a={a} /><Pad cx={66} cy={44} rx={14} a={a} /><Pad cx={56} cy={80} rx={17} a={a} />
        <Circle cx={30} cy={38} r={14} {...sf} /><Circle cx={25} cy={35} r={1.6} fill={co.text} /><Circle cx={35} cy={35} r={1.6} fill={co.text} /><Path d="M24 43q6 5 12 0" {...s} />
        <G transform="rotate(8 66 32)"><Circle cx={66} cy={32} r={11} {...sf} /><Circle cx={62} cy={30} r={1.4} fill={co.text} /><Circle cx={70} cy={30} r={1.4} fill={co.text} /><Line x1={61} y1={37} x2={71} y2={37} {...s} /></G>
        <G transform="rotate(-6 56 66)"><Circle cx={56} cy={66} r={13} {...sf} /><Circle cx={51} cy={63} r={1.5} fill={co.text} /><Circle cx={61} cy={63} r={1.5} fill={co.text} /><Circle cx={56} cy={71} r={3.4} {...s} /></G>
      </G>)}
      {name === 'body' && (<G>
        <Pad cx={48} cy={84} rx={20} a={a} />
        <Circle cx={48} cy={18} r={8} {...sf} />
        <Path d="M42 28c-6 4-8 14-7 24m19-24c6 4 8 14 7 24M43 30v22l-4 30m18-52v22l4 30M43 40h10" {...s} />
        <Path d="M35 32l-8 14m34-14 8 14" {...s} />
        <Path d="M44 34c-3 2-3 8 0 10 2 2 3 1 4-1 1 2 2 3 4 1 3-2 3-8 0-10-2-1-3 0-4 2-1-2-2-3-4-2z" fill={a} opacity={0.9} />
      </G>)}
      {name === 'pill' && (<G>
        <Pad cx={40} cy={80} rx={20} a={a} />
        <G transform="rotate(-28 44 52)"><Rect x={26} y={44} width={38} height={17} rx={8.5} {...s} /><Path d="M45 44v17" {...s} /><Rect x={45.5} y={44.6} width={17.6} height={15.8} rx={8} fill={a} opacity={0.9} /></G>
        <Rect x={62} y={22} width={16} height={22} rx={3} {...sf} /><Rect x={64} y={17} width={12} height={6} rx={2} {...s} /><Line x1={65} y1={31} x2={75} y2={31} {...s} />
      </G>)}
      {name === 'scales' && (<G>
        <Pad cx={48} cy={84} rx={22} a={a} />
        <Line x1={48} y1={16} x2={48} y2={74} {...s} /><Path d="M36 76h24" {...s} /><Circle cx={48} cy={14} r={3} {...s} />
        <Path d="M20 26h56" {...s} />
        <Path d="M12 46l8-20 8 20" {...s} /><Path d="M12 46a8 8 0 0 0 16 0" fill={a} opacity={0.9} />
        <Path d="M68 46l8-20 8 20" {...s} /><Path d="M68 46a8 8 0 0 0 16 0" fill={a} opacity={0.9} />
      </G>)}
      {name === 'contract' && (<G>
        <Pad cx={50} cy={84} rx={22} a={a} />
        <G transform="rotate(-4 48 46)"><Rect x={28} y={16} width={40} height={54} rx={4} {...sf} />
        <Line x1={34} y1={28} x2={60} y2={28} {...s} /><Line x1={34} y1={36} x2={60} y2={36} {...s} /><Line x1={34} y1={44} x2={52} y2={44} {...s} />
        <Path d="M34 58q6-6 10 0t10-2" {...s} /></G>
        <Circle cx={66} cy={64} r={9} fill={a} /><Path d="M62 71l-3 10 7-4 7 4-3-10" fill={a} opacity={0.85} />
      </G>)}
      {name === 'coins' && (<G>
        <Pad cx={40} cy={84} rx={22} a={a} />
        <Ellipse cx={38} cy={72} rx={17} ry={6.5} {...sf} /><Path d="M21 72v-9c0 3.6 7.6 6.5 17 6.5s17-2.9 17-6.5v9" {...s} />
        <Ellipse cx={38} cy={61} rx={17} ry={6.5} {...sf} /><Path d="M21 61v-9c0 3.6 7.6 6.5 17 6.5s17-2.9 17-6.5v9" {...s} />
        <Ellipse cx={38} cy={50} rx={17} ry={6.5} fill={a} stroke={co.text} strokeWidth={2} />
        <Path d="M62 44 78 24m0 0h-9m9 0v9" {...s} />
      </G>)}
      {name === 'briefcase' && (<G>
        <Pad cx={48} cy={84} rx={24} a={a} />
        <G transform="rotate(-3 48 52)"><Rect x={20} y={36} width={56} height={38} rx={7} {...sf} />
        <Path d="M38 36v-6a6 6 0 0 1 6-6h8a6 6 0 0 1 6 6v6" {...s} />
        <Path d="M20 52c9 5 47 5 56 0" {...s} /><Rect x={43} y={48} width={10} height={9} rx={2.5} fill={a} /></G>
      </G>)}
      {name === 'megaphone' && (<G>
        <Pad cx={44} cy={82} rx={22} a={a} />
        <G transform="rotate(-10 44 50)"><Path d="M22 44v14l8 2V42l-8 2z" {...sf} /><Path d="M30 42l30-14v42L30 60" {...sf} /><Path d="M30 62l4 14h8l-4-14" {...s} /></G>
        <Path d="M70 30q6 8 0 18" {...s} stroke={a} /><Path d="M77 24q10 13 0 28" {...s} stroke={a} />
      </G>)}
      {name === 'chat' && (<G>
        <Pad cx={48} cy={82} rx={24} a={a} />
        <G transform="rotate(-3 36 40)"><Path d="M16 26h38a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H32l-10 9v-9h-6a6 6 0 0 1-6-6V32a6 6 0 0 1 6-6z" {...sf} />
        <Circle cx={28} cy={39} r={1.8} fill={co.text} /><Circle cx={37} cy={39} r={1.8} fill={co.text} /><Circle cx={46} cy={39} r={1.8} fill={co.text} /></G>
        <G transform="rotate(4 66 58)"><Path d="M52 46h26a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5h-4v8l-9-8h-13a5 5 0 0 1-5-5V51a5 5 0 0 1 5-5z" fill={a} stroke={co.text} strokeWidth={2} /><Path d="M58 56h14" stroke={co.ink} strokeWidth={2} strokeLinecap="round" /></G>
      </G>)}
      {name === 'phone' && (<G>
        <Pad cx={48} cy={84} rx={20} a={a} />
        <G transform="rotate(-4 48 48)"><Rect x={32} y={14} width={32} height={62} rx={8} {...sf} /><Line x1={42} y1={20} x2={54} y2={20} {...s} />
        <Path d="M44 40c-2 1-2 5 0 7l4 4 4-4c2-2 2-6 0-7-1.5-1-2.5 0-4 2-1.5-2-2.5-3-4-2z" fill={a} />
        <Line x1={39} y1={58} x2={57} y2={58} {...s} /><Line x1={39} y1={65} x2={51} y2={65} {...s} /></G>
        <Circle cx={64} cy={16} r={6} fill={a} /><Path d="M62 16h4m-2-2v4" stroke={co.ink} strokeWidth={1.8} strokeLinecap="round" />
      </G>)}
      {name === 'sparkle' && (<G>
        <Pad cx={48} cy={82} rx={22} a={a} />
        <Path d="M48 18l6 20 20 6-20 6-6 20-6-20-20-6 20-6z" fill={a} stroke={co.text} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M76 22l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5z" {...s} />
        <Path d="M20 60l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" {...s} />
      </G>)}
      {name === 'book' && (<G>
        <Pad cx={48} cy={84} rx={24} a={a} />
        <Path d="M48 30c-8-7-20-7-28-4v44c8-3 20-3 28 4 8-7 20-7 28-4V26c-8-3-20-3-28 4z" {...sf} /><Path d="M48 30v44" {...s} />
        <Line x1={27} y1={38} x2={41} y2={36} {...s} /><Line x1={27} y1={46} x2={41} y2={44} {...s} /><Line x1={55} y1={36} x2={69} y2={38} {...s} />
        <Path d="M66 14l6 6-16 16-8 2 2-8z" fill={a} stroke={co.text} strokeWidth={2} strokeLinejoin="round" />
      </G>)}
      {name === 'heart' && (<G>
        <Pad cx={48} cy={80} rx={22} a={a} />
        <Path d="M48 74S18 56 14 38c-3-13 6-22 16-22 8 0 13 5 18 11 5-6 10-11 18-11 10 0 19 9 16 22-4 18-34 36-34 36z" {...sf} />
        <Path d="M48 74S18 56 14 38c-3-13 6-22 16-22 8 0 13 5 18 11v47z" fill={a} opacity={0.9} />
      </G>)}
      {name === 'bookmarks' && (<G>
        <Pad cx={48} cy={82} rx={22} a={a} />
        <G transform="rotate(-8 38 44)"><Path d="M26 16h24v52l-12-9-12 9z" {...sf} /></G>
        <G transform="rotate(6 60 48)"><Path d="M48 22h24v52l-12-9-12 9z" fill={a} stroke={co.text} strokeWidth={2} strokeLinejoin="round" /></G>
      </G>)}
      {name === 'pen' && (<G>
        <Pad cx={48} cy={84} rx={24} a={a} />
        <G transform="rotate(-3 44 52)"><Rect x={20} y={30} width={48} height={44} rx={5} {...sf} />
        <Line x1={28} y1={42} x2={60} y2={42} {...s} /><Line x1={28} y1={52} x2={60} y2={52} {...s} /><Line x1={28} y1={62} x2={48} y2={62} {...s} /></G>
        <G transform="rotate(40 66 46)"><Rect x={62} y={18} width={9} height={44} rx={3} fill={a} stroke={co.text} strokeWidth={2} /><Path d="M62 62l4.5 10 4.5-10" {...s} /></G>
      </G>)}
      {name === 'leaf' && (<G>
        <Pad cx={48} cy={82} rx={22} a={a} />
        <Path d="M48 74C30 74 20 60 22 40 24 22 40 16 60 18c8 30-2 52-12 56z" {...sf} />
        <Path d="M48 74C30 74 20 60 22 40" stroke={a} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Path d="M46 66q4-18 12-30M40 56l8-4M44 44l8-4M50 34l6-3" {...s} />
      </G>)}
      {name === 'clock' && (<G>
        <Pad cx={48} cy={82} rx={22} a={a} />
        <Circle cx={48} cy={44} r={26} {...sf} /><Circle cx={48} cy={44} r={26} stroke={a} strokeWidth={4} fill="none" strokeDasharray="6 8" />
        <Path d="M48 30v14l10 7" {...s} /><Circle cx={48} cy={44} r={2.4} fill={a} />
      </G>)}
    </Svg>
  );
}

// Flat faceless professional bust holding a gold word-card — house style, matches the welcome
// reader figure (dark hair, cream face, warm-grey suit, gold accent). No outlines, no shadow.
export function PersonScene({ co, width = 200, height = 190 }: { co: Palette; width?: number; height?: number }) {
  // Reader-figure palette (not co.text — that resolves to near-black, which reads as a generic
  // avatar and isn't a brand colour). figureInk = warm brown hair, figureBody = suit, figureSkin = face.
  const grey = co.figureBody; const gold = co.accent; const cream = co.figureSkin; const hair = co.figureInk;
  return (
    <Svg width={width} height={height} viewBox="0 0 200 196">
      <Path d="M36 196v-14a64 62 0 0 1 128 0v14z" fill={grey} />
      <Circle cx={100} cy={90} r={30} fill={cream} />
      <Path d="M70 90a30 30 0 0 1 60 0q-13-15-30-15t-30 15z" fill={hair} />
      <Rect x={58} y={150} width={84} height={42} rx={9} fill={gold} />
      <Rect x={70} y={163} width={50} height={5} rx={2.5} fill={cream} opacity={0.72} />
      <Rect x={70} y={174} width={34} height={4} rx={2} fill={cream} opacity={0.5} />
    </Svg>
  );
}

// Flat phone for "Learn without opening the app" — house style: rounded-rect phone (no notch,
// no bezel), a gold widget tile, an app-grid hint. No figure, no plants, no outlines/shadows.
export function WidgetScene({ co, width = 150, height = 196 }: { co: Palette; width?: number; height?: number }) {
  const gold = co.accent; const grey = co.muted; const cream = co.surface; const bg = co.bg;
  return (
    <Svg width={width} height={height} viewBox="0 0 150 196">
      <Rect x={38} y={6} width={74} height={184} rx={22} fill={grey} opacity={0.22} />
      <Rect x={44} y={13} width={62} height={170} rx={16} fill={cream} />
      {/* gold widget tile with a suggested word */}
      <Rect x={53} y={30} width={44} height={44} rx={11} fill={gold} />
      <Rect x={60} y={44} width={30} height={4} rx={2} fill={bg} opacity={0.55} />
      <Rect x={60} y={54} width={22} height={3} rx={1.5} fill={bg} opacity={0.4} />
      {/* app-grid hint, one gold */}
      <Rect x={53} y={86} width={13} height={13} rx={4} fill={grey} opacity={0.3} />
      <Rect x={68.5} y={86} width={13} height={13} rx={4} fill={grey} opacity={0.3} />
      <Rect x={84} y={86} width={13} height={13} rx={4} fill={grey} opacity={0.3} />
      <Rect x={53} y={104} width={13} height={13} rx={4} fill={grey} opacity={0.3} />
      <Rect x={68.5} y={104} width={13} height={13} rx={4} fill={gold} opacity={0.85} />
      <Rect x={84} y={104} width={13} height={13} rx={4} fill={grey} opacity={0.3} />
    </Svg>
  );
}

// ── Profession icons for the track picker ──
// Line-icon language (matches the Illo topic-icon set elsewhere in the app): stroke only, no
// fill, warm ink stroke + a gold accent detail. Held against the illustrated reader figure.
export type ProfIconName = 'book' | 'stethoscope' | 'scales' | 'pen';
export function ProfIcon({ name, co, size = 44 }: { name: ProfIconName; co: Palette; size?: number }) {
  const gold = co.accent;
  const st = { stroke: co.text, strokeWidth: 2.4, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {name === 'book' && (<G>
        <Path d="M8 13c6-2.6 12-2.6 16 1 4-3.6 10-3.6 16-1v22c-6-2.6-12-2.6-16 1-4-3.6-10-3.6-16-1z" {...st} />
        <Line x1={24} y1={14} x2={24} y2={36} {...st} />
      </G>)}
      {name === 'stethoscope' && (<G>
        <Path d="M15 7v10a9 9 0 0018 0V7" {...st} />
        <Circle cx={15} cy={6} r={2.2} {...st} />
        <Circle cx={33} cy={6} r={2.2} {...st} />
        <Path d="M33 21v3a9 9 0 01-9 9" {...st} />
        <Circle cx={24} cy={38} r={5} {...st} />
        <Circle cx={24} cy={38} r={1.7} fill={gold} />
      </G>)}
      {name === 'scales' && (<G>
        <Line x1={24} y1={8} x2={24} y2={35} {...st} />
        <Path d="M16 37h16" {...st} />
        <Circle cx={24} cy={7} r={1.6} fill={gold} />
        <Path d="M10 13h28" {...st} />
        <Path d="M4 23l6-10 6 10" {...st} />
        <Path d="M4 23a6 6 0 0012 0" {...st} />
        <Path d="M32 23l6-10 6 10" {...st} />
        <Path d="M32 23a6 6 0 0012 0" {...st} />
      </G>)}
      {name === 'pen' && (<G>
        <G transform="rotate(45 24 24)">
          <Path d="M22 8h4l1 22-3 6-3-6z" {...st} />
          <Line x1={24} y1={8} x2={24} y2={26} {...st} />
          <Circle cx={24} cy={13} r={1.6} fill={gold} />
        </G>
      </G>)}
    </Svg>
  );
}
