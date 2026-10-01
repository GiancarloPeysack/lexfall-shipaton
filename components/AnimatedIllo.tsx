import Illo, { IlloName } from './Illustrations';
import { Palette } from '../theme/tokens';

// Static illustration wrapper. A generic float/wobble reads as meaningless
// motion, so idle animation is reserved for illustrations where movement means
// something (AnimatedBook = pages turning, AnimatedScales = weighing, the
// streak flame, the welcome swipe prompt). This stays as the drop-in mount
// point for richer per-illustration animation (e.g. Lottie) later.
export default function AnimatedIllo({
  name, co, size = 92,
}: { name: IlloName; co: Palette; size?: number; amount?: number; tilt?: number }) {
  return <Illo name={name} co={co} size={size} />;
}
