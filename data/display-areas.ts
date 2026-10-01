import { FieldId } from './types';
import { DOMAINS, Domain } from './domains';
import { MED_PROFESSIONS, MED_SKILL_CHIPS, MED_SPECIALTIES } from './med-taxonomy';

// ── LAYER 2: the human-facing display taxonomy ──────────────────────────────
// The single source of truth for BOTH the onboarding areas picker and the
// Build-a-test area picker. Internal tags (word.topic, ~570 of them) are Layer 1
// and drive retrieval; here we curate what a person actually chooses from.
// Rules: Title Case, mutually exclusive, nothing appears at two levels.
// Every internal tag must map to a display area OR be listed in LAYER1_ONLY /
// EXAM_TAGS / WORDTYPE_TAGS — an unmapped tag is a build-time error (see
// assertTaxonomy in scripts/check-taxonomy.mjs). This replaces CATEGORIES and DOMAINS.

export interface DisplaySubArea { name: string; tags: string[] }
export interface DisplayArea { id: string; name: string; subAreas: DisplaySubArea[]; isProfession?: boolean }

// General English — mapped from the 197 live gen topics (owner-approved 2026-08-12).
const GEN: DisplayArea[] = [
  { id: 'gen-language', name: 'Language & rhetoric', subAreas: [
    { name: 'Rhetoric & persuasion', tags: ['Persuasion & rhetoric', 'Rhetoric', 'Thought & reason', 'Thought & rhetoric', 'roundabout speech', 'denunciation'] },
    { name: 'Wit & criticism', tags: ['wit', 'sarcasm', 'fault-finding', 'Wit & humour'] },
    { name: 'Speech & rhetoric', tags: ['Language & rhetoric', 'speech', 'discourse', 'oratory', 'figure of speech', 'sound in language', 'sound words', 'soft speech', 'cryptic speech', 'pompous speech', 'flattery', 'moralising', 'maxim', 'praise', 'complaint', 'loud protest', 'remonstrance', 'condemnation'] },
    { name: 'Wit, banter & mockery', tags: ['banter', 'jokes', 'teasing', 'pranks', 'irony', 'satire', 'parody', 'mockery', 'flippancy', 'lament'] },
  ] },
  { id: 'gen-arts', name: 'Literature & the arts', subAreas: [
    { name: 'Aesthetics & beauty', tags: ['Aesthetics', 'aesthetics', 'beauty', 'Beauty & the senses', 'the sublime', 'grandeur', 'delicacy'] },
    { name: 'The arts', tags: ['Literature & the arts', 'Arts & literature', 'dramatic gesture', 'conceit', 'absurdity', 'anticlimax', 'foreshadowing'] },
  ] },
  { id: 'gen-mind', name: 'Mind & psyche', subAreas: [
    { name: 'Moods & melancholy', tags: ['dejection', 'despair', 'disappointment', 'dismay', 'dread', 'longing', 'sorrow', 'unease', 'misgiving', 'lamentation', 'remorse', 'tearfulness', 'weariness', 'world-weariness', 'estrangement'] },
    { name: 'Drives & desire', tags: ['ambition', 'appetite', 'desire', 'greed', 'love', 'passion'] },
    { name: 'Temper & reaction', tags: ['bitterness', 'ill-temper', 'indignation', 'irritability', 'resentment', 'anger', 'gloom', 'sentimentality'] },
    { name: 'Thought & memory', tags: ['memory', 'daydream', 'doubt', 'reflection', 'thinking', 'indecision', 'error', 'foolishness'] },
    { name: 'Mind & cognition', tags: ['Mind & character', 'abstraction', 'belief', 'certainty', 'cognition', 'consciousness', 'obscurity', 'perception'] },
    { name: 'Joy & contentment', tags: ['Emotion', 'Emotion & the inner life', 'joy', 'bliss', 'cheerfulness', 'merriment'] },
  ] },
  { id: 'gen-society', name: 'Society & power', subAreas: [
    { name: 'Power & politics', tags: ['Power & politics', 'power', 'corruption', 'domineering', 'patronage', 'servility', 'politics', 'bureaucracy'] },
    { name: 'Rank & class', tags: ['aristocracy', 'class', 'elite', 'new money', 'inheritance'] },
    { name: 'Wealth & fortune', tags: ['Work & money', 'Money & fortune', 'money', 'poverty', 'toil', 'wealth', 'excess', 'extravagance', 'indulgence'] },
    { name: 'Manners & society', tags: ['Society', 'Society & manners', 'Society & power', 'friendliness', 'gallantry', 'propriety', 'rudeness', 'marriage', 'kinship', 'belonging', 'dissipation', 'brawl', 'respectful gesture'] },
    { name: 'Bonds & belonging', tags: ['attachment', 'betrothal', 'courtship', 'fellowship', 'friendship', 'home life', 'infidelity', 'manners', 'rapport', 'social ties', 'collective nouns'] },
    { name: 'Character & virtue', tags: ['Character', 'Character & virtue', 'candour', 'loyalty', 'mercy', 'modesty', 'patience', 'diligence', 'perseverance', 'resilience', 'self-restraint', 'reconciliation', 'relentlessness', 'shallowness'] },
    { name: 'Character & vice', tags: ['arrogance', 'audacity', 'courage', 'cunning', 'defiance', 'depravity', 'endurance', 'folly', 'generosity', 'honesty', 'insolence', 'integrity', 'laziness', 'lethargy', 'mastery', 'persistence', 'playfulness', 'wickedness', 'tireless effort', 'craft', 'expertise', 'connoisseur'] },
    { name: 'Conflict & power', tags: ['aggression', 'attack', 'bloodshed', 'challenge', 'civil conflict', 'conflict', 'conquest', 'defence', 'destruction', 'discord', 'feud', 'fortification', 'hostility', 'plunder', 'rebellion', 'revenge', 'revolt', 'siege', 'suppression', 'theft', 'uprooting', 'usurpation', 'victory'] },
  ] },
  { id: 'gen-ideas', name: 'Ideas, science & belief', subAreas: [
    { name: 'Scholarship & science', tags: ['Academia & scholarship', 'Philosophy & ideas', 'Science & reasoning'] },
    { name: 'Knowledge & philosophy', tags: ['epistemology', 'ethics', 'logic', 'metaphysics', 'philosophy', 'philosophy of mind', 'reason', 'specious reasoning', 'appearance of truth', 'bias'] },
    { name: 'Truth & deception', tags: ['truth', 'falsehood', 'deceit', 'deception', 'fraud', 'trickery', 'pretence', 'secrecy', 'collusion', 'complicity', 'corruptibility', 'defamation', 'disclosure', 'dishonesty', 'fabrication', 'inadvertent disclosure', 'insincerity', 'treachery'] },
    { name: 'Fate & the divine', tags: ['fate', 'chance', 'revelation', 'prophetic speech'] },
    { name: 'Right & wrong', tags: ['immorality', 'flagrant wrong', 'unreformable', 'clearing blame', 'escaping punishment', 'mitigation', 'vindication', 'atonement', 'clemency', 'deserved punishment', 'disgrace', 'evasion', 'flight from justice', 'forgiveness', 'hiding', 'minor offence', 'offence', 'pardonable fault', 'penalty', 'prohibition', 'remedy', 'reparation', 'wrongdoer'] },
  ] },
  { id: 'gen-time', name: 'Time & history', subAreas: [
    { name: 'Age & antiquity', tags: ['antiquity', 'ageing', 'eternity'] },
    { name: 'Change & decay', tags: ['change', 'transience', 'decay', 'obsolescence', 'Time & change', 'spoilage'] },
  ] },
  { id: 'gen-nature', name: 'Nature & landscape', subAreas: [
    { name: 'Landscape & terrain', tags: ['landscape', 'landscape / water', 'landscape / sea', 'far places', 'exposure'] },
    { name: 'Weather & sky', tags: ['weather', 'weather / sky', 'weather / touch', 'wind', 'wind / landscape'] },
    { name: 'Seasons & time', tags: ['season', 'seasonal journey', 'time of day'] },
    { name: 'Places & journeys', tags: ['arrival', 'departure', 'displacement', 'dwelling', 'exile', 'habitat', 'inhabitant', 'itinerancy', 'journey', 'lodging', 'nativeness', 'refuge', 'remote refuge', 'remote region', 'return', 'rural idyll', 'sense of place', 'surroundings', 'temporary stay', 'territory', 'threshold', 'tracking', 'traveller'] },
    { name: 'Wildlife & growth', tags: ['animal behaviour', 'botany', 'growth', 'hunting', 'wildness', 'zoology'] },
  ] },
  { id: 'gen-senses', name: 'The senses & perception', subAreas: [
    { name: 'Light & colour', tags: ['light', 'light / colour', 'light / sky', 'light / dark', 'colour', 'colour / sky', 'colour / weather', 'radiance', 'markings'] },
    { name: 'Sound & voice', tags: ['sound', 'sound / water', 'sound / wind', 'tone quality', 'harsh voice', 'mournful sound', 'rhythm'] },
    { name: 'Sound & music', tags: ['alarm sound', 'bells', 'choral music', 'clamour', 'clear sound', 'crackling', 'detached sound', 'funeral song', 'harsh sound', 'hollow voice', 'lament song', 'loud voice', 'melody', 'metallic noise', 'music passage', 'music technique', 'musical texture', 'pleasant sound', 'resonance', 'singing', 'sweet sound', 'trembling voice', 'uproar', 'voice register', 'wailing'] },
    { name: 'Movement & the body', tags: ['affected gait', 'awkward gait', 'body posture', 'clumsy gait', 'clumsy struggle', 'dexterity', 'expressive movement', 'exuberant movement', 'fearful posture', 'gesturing', 'heavy gait', 'heavy movement', 'light movement', 'playful movement', 'quick movement', 'reclining posture', 'reflex movement', 'restless roaming', 'running', 'showy gait', 'slow movement', 'stealthy movement', 'stillness', 'strolling', 'supple movement', 'swift movement', 'threatening gesture', 'unsteady gait', 'weary walking'] },
    { name: 'Taste & appetite', tags: ['taste', 'flavour', 'satiety', 'food', 'drink', 'diet', 'eating', 'enjoyment', 'gluttony', 'hunger', 'meal', 'tasting'] },
    { name: 'Smell & texture', tags: ['smell', 'aroma', 'landscape / smell', 'texture', 'texture / landscape'] },
  ] },
];

// Professional tracks ADOPT their existing curated domain structures (one source, no
// duplication): law/biz derived from DOMAINS grouped by section; med from med-taxonomy.
// Single-item "Core" domains (General X English) are dropped — their generic topic is Layer 1.
const SECTION_AREA_NAME: Record<string, string> = { 'Practice areas': 'Your practice area', 'Professions': 'Your profession' };
function areasFromDomains(field: FieldId): DisplayArea[] {
  const doms = DOMAINS.filter((d: Domain) => d.field === field && d.section !== 'Core');
  const bySection = new Map<string, Domain[]>();
  for (const d of doms) (bySection.get(d.section) ?? bySection.set(d.section, []).get(d.section)!).push(d);
  return [...bySection.entries()].map(([section, ds]) => ({
    id: `${field}-${section.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    name: SECTION_AREA_NAME[section] ?? section,
    subAreas: ds.map((d) => ({ name: d.name, tags: d.topics })),
    // Sections renamed to "Your profession"/"Your practice area" duplicate the dedicated
    // 'specialty' onboarding screen (which already multi-selects from this exact list) — so
    // AreaPicker can hide it there via hideProfession, while Build-a-test (no specialty step)
    // still shows it as a pickable scope.
    isProfession: section in SECTION_AREA_NAME,
  }));
}
const MED: DisplayArea[] = [
  { id: 'med-profession', name: 'Your profession', isProfession: true, subAreas: MED_PROFESSIONS.map((p) => ({ name: p.name, tags: p.topics })) },
  { id: 'med-communication', name: 'Communication & OET', subAreas: MED_SKILL_CHIPS.map((c) => ({ name: c.label, tags: c.topics })) },
  { id: 'med-specialties', name: 'Clinical specialties', subAreas: [{ name: 'Specialties', tags: MED_SPECIALTIES.topics }] },
  { id: 'med-practice', name: 'Clinical practice', subAreas: [
    { name: 'Assessment & examination', tags: ['Assessment', 'Examination'] },
    { name: 'Conditions & procedures', tags: ['Conditions', 'Procedures'] },
    { name: 'Medications', tags: ['Medications'] },
    { name: 'Public health', tags: ['Public health'] },
  ] },
];

// Modern/internet English (the `new` field) — its own taxonomy (was reusing GEN, which fit none).
const NEW: DisplayArea[] = [
  { id: 'new-online', name: 'Internet & culture', subAreas: [
    { name: 'Internet & memes', tags: ['Internet & memes'] },
    { name: 'Tech & society', tags: ['Tech & society'] },
    { name: 'Trends & aesthetics', tags: ['Trends & aesthetics'] },
  ] },
  { id: 'new-people', name: 'People & vibes', subAreas: [
    { name: 'Dating & friendship', tags: ['Dating & friendship', 'Relationships'] },
    { name: 'Identity & self', tags: ['Identity'] },
    { name: 'Vibes & reactions', tags: ['Vibes & reactions'] },
  ] },
];

export const DISPLAY_AREAS: Partial<Record<FieldId, DisplayArea[]>> = {
  gen: GEN,
  new: [...NEW, ...GEN],   // modern English = internet-specific areas + the general areas
  law: areasFromDomains('law'),
  biz: areasFromDomains('biz'),
  med: MED,
};

// A separate axis: exam wordlists (filter-by-source, not by subject).
export const EXAM_TAGS: string[] = [
  'Cambridge C1 Advanced', 'Cambridge C1 (part 2)', 'Cambridge C2 Proficiency', 'Cambridge C2 (part 2)',
  'GRE Verbal', 'GRE Verbal (part 2)', 'TOLES', 'IELTS', 'OET', 'PLAB', 'Linguaskill Business',
];

// A separate axis: word-type distinctions (not subjects).
export const WORDTYPE_TAGS: string[] = ['Idioms & phrasal verbs'];

// Valid tags that drive retrieval but are deliberately NOT shown in the picker:
// generic/whole-product restatements, and the single-word Roget movement/posture
// sense-labels (filtered out 2026-08-12: <8 pickable, so Layer 1 only).
export const LAYER1_ONLY: string[] = [
  'Advanced English', 'Evocative words', 'Academic writing', 'Nature & senses',
  // Professional-track generic/collocation "Core" topics (single-item Core domains, folded per #64):
  'Business collocations', 'Roles & places', 'Clinical collocations',
  'walking', 'wandering', 'staggering', 'swaying gait', 'impaired gait', 'sliding movement',
  'unsteady movement', 'precarious balance', 'crouching', 'lazy posture', 'spread posture',
  'awkward climbing', 'circular motion', 'spinning', 'twisting motion', 'wavelike movement',
  'agility', 'skill', 'precision', 'ineptitude',
];

// All tags a given field's picker should surface (flattened), for convenience.
export const displayTagsFor = (field: FieldId): Set<string> => {
  const areas = DISPLAY_AREAS[field] ?? [];
  const s = new Set<string>();
  for (const a of areas) for (const sub of a.subAreas) for (const t of sub.tags) s.add(t);
  return s;
};

const _axis = new Set<string>([...EXAM_TAGS, ...WORDTYPE_TAGS, ...LAYER1_ONLY]);
// Every tag must resolve to a display area OR an axis OR Layer-1-only. Anything left over is a
// taxonomy hole (the "More areas" dumping bucket is gone — an unmapped tag is a bug, not a chip).
export const unmappedTopicsFor = (field: FieldId, topics: Iterable<string>): string[] => {
  const display = displayTagsFor(field);
  const out: string[] = [];
  for (const t of topics) if (t && !display.has(t) && !_axis.has(t)) out.push(t);
  return out;
};
// Dev-time guard: call once with the field's live topics; logs holes so drift surfaces in
// testing rather than as a "what does this mean" chip in front of a user.
export const assertTaxonomyCoverage = (field: FieldId, topics: Iterable<string>): void => {
  if (!__DEV__) return;
  const holes = unmappedTopicsFor(field, topics);
  if (holes.length) console.warn(`[taxonomy] ${field}: ${holes.length} unmapped topic(s):`, holes.slice(0, 40));
};
