// The Journey plan engine. Levels are milestones of MASTERED words (words whose SRS interval
// has matured — see getMasteredCount in db.ts). Every daily test / practice session that pushes
// a word to maturity moves the plan forward, so the path progresses from the learning the user
// already does. v1 uses a fixed, evocative threshold ladder (works for everyone); a later pass
// can stretch/compress the ladder to end exactly at a user's personal word goal.

import { getWordsKnownCount } from './db';

export type Level = { index: number; title: string; target: number }; // target = cumulative mastered to COMPLETE this level

// Cumulative mastered-word thresholds to complete each level. Grows so each level feels earned.
const THRESHOLDS = [10, 25, 50, 90, 150, 230, 340, 480, 660, 880, 1150, 1500, 2000];
const NAMES = [
  'Foundations', 'Building', 'Momentum', 'Fluent range', 'Wide command', 'Rare air',
  'Erudite', 'Rarefied', 'Virtuoso', 'Polymath', 'Lexicon', 'Mastery', 'Legend',
];

export const LEVELS: Level[] = THRESHOLDS.map((target, index) => ({ index, title: NAMES[index] ?? `Level ${index + 1}`, target }));

export type PlanState = {
  mastered: number;
  levelIndex: number;   // 0-based level currently in progress (or the last level once maxed)
  levelTitle: string;
  levelStart: number;   // mastered count at the start of the current level
  levelTarget: number;  // mastered needed to COMPLETE the current level
  inLevel: number;      // mastered accumulated within the current level
  needed: number;       // remaining mastered to reach the next level
  progress: number;     // 0..1 within the current level
  maxed: boolean;       // reached the final level
  levels: Level[];
};

// ── The ONE level source ─────────────────────────────────────────────────────
// Every ladder readout (Progress tab's Journey card, the /journey path screen) must show the
// level from computePlan(getWordsKnownCount()) — never a second calc. This helper is the single
// call both sides load, so the "Level N · <name>" line can never disagree across screens.
// (JourneyPath.tsx inlines the identical computePlan(getWordsKnownCount()) pair.)
export async function loadPlan(): Promise<PlanState> {
  return computePlan(await getWordsKnownCount());
}

export function computePlan(mastered: number): PlanState {
  const m = Math.max(0, Math.floor(mastered));
  // current level = the first level whose target hasn't been reached yet
  let levelIndex = LEVELS.findIndex((l) => m < l.target);
  const maxed = levelIndex === -1;
  if (maxed) levelIndex = LEVELS.length - 1;
  const levelStart = levelIndex === 0 ? 0 : LEVELS[levelIndex - 1].target;
  const levelTarget = LEVELS[levelIndex].target;
  const span = Math.max(1, levelTarget - levelStart);
  const inLevel = Math.max(0, Math.min(span, m - levelStart));
  const needed = maxed ? 0 : Math.max(0, levelTarget - m);
  const progress = maxed ? 1 : inLevel / span;
  return {
    mastered: m,
    levelIndex,
    levelTitle: LEVELS[levelIndex].title,
    levelStart,
    levelTarget,
    inLevel,
    needed,
    progress,
    maxed,
    levels: LEVELS,
  };
}
