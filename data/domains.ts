import { FieldId } from './types';
import { MED_PROFESSIONS, MED_SKILLS, MED_SPECIALTIES } from './med-taxonomy';

// ─────────────────────────────────────────────────────────────────────────────
// DOMAINS — an ADDITIVE lookup layer over the existing (field, topic) columns for
// Build-a-test grouping and per-domain proficiency ("Where you stand"). It does NOT
// migrate or re-tag any word: every word keeps its raw `topic` string. This maps
// those raw strings into:
//   • field    — already a column (general / healthcare / law / business)
//   • domain   — a semantic area (nursing, litigation, finance, rhetoric…), grouped
//                under a display `section`; a `profession` domain is one the user
//                owns and is ordered first for them.
//   • examTag  — exam wordlists (Cambridge, GRE…) kept OUT of "area" lists entirely.
// This is corpus-complete (covers the messy long tail the general-centric CATEGORIES
// map dumped into "Other"). It is intentionally SEPARATE from the crown spine in
// taxonomy.ts (Vertical→Track) which the personalize panel uses; consolidating the
// two is a future cleanup. Revert = delete this file. No content/progress touched.
// ─────────────────────────────────────────────────────────────────────────────

export type ExamTag = 'cambridge-c1' | 'cambridge-c2' | 'gre' | 'oet' | 'ielts' | 'toles' | 'plab';

export interface Domain {
  id: string;
  name: string;
  field: FieldId;
  section: string;        // display grouping header (e.g. "Professions", "Practice areas")
  topics: string[];       // RAW topic strings that belong here (incl. collapsed variants)
  profession?: boolean;   // a user-owned profession/track → ordered first in their field
}

// ── Duplicate topics collapsed to a canonical name (documented for spot-check). ──
// The canonical form is ALSO listed in the owning domain's `topics`, so words tagged
// with either spelling are still matched — this only dedupes DISPLAY.
export const COLLAPSED_TOPICS: Record<string, string> = {
  // business
  'Management': 'Management & organisation',
  'Operations': 'Operations & supply chain',
  'Meetings': 'Business email & meetings',
  'Governance': 'Corporate governance',
  // general
  'Society': 'Society & power',
  'Character': 'Character & virtue',
  'Literature & the arts': 'Arts & literature',
  'Thought & reason': 'Thought & rhetoric',
  'Aesthetics': 'Beauty & the senses',
  'Emotion': 'Emotion & the inner life',
};
export const canonicalTopic = (t: string): string => COLLAPSED_TOPICS[t] ?? t;

// ── Exam wordlists — kept OUT of every "which area" list. ──
export const EXAM_TOPICS: Record<string, ExamTag> = {
  'Cambridge C1 Advanced': 'cambridge-c1',
  'Cambridge C1 (part 2)': 'cambridge-c1',
  'Cambridge C2 Proficiency': 'cambridge-c2',
  'Cambridge C2 (part 2)': 'cambridge-c2',
  'GRE Verbal': 'gre',
  'GRE Verbal (part 2)': 'gre',
};
export const EXAM_LABEL: Record<ExamTag, string> = {
  'cambridge-c1': 'Cambridge C1 (Advanced)',
  'cambridge-c2': 'Cambridge C2 (Proficiency)',
  'gre': 'GRE Verbal',
  'oet': 'OET', 'ielts': 'IELTS', 'toles': 'TOLES', 'plab': 'PLAB',
};
export const examTagForTopic = (t: string): ExamTag | undefined => EXAM_TOPICS[t];

// ── Medicine domains: reuse the onboarding med taxonomy (single source of truth). ──
const medDomains: Domain[] = [
  ...MED_PROFESSIONS.map((p): Domain => ({ id: `med:${p.id}`, name: p.name, field: 'med', section: 'Professions', topics: p.topics, profession: true })),
  { id: 'med:communication', name: 'Communication & OET', field: 'med', section: 'Communication', topics: MED_SKILLS.topics },
  ...MED_SPECIALTIES.topics.map((t): Domain => ({ id: `med:spec:${slug(t)}`, name: t, field: 'med', section: 'Clinical specialties', topics: [t] })),
  { id: 'med:core', name: 'General clinical English', field: 'med', section: 'Core', topics: ['Advanced English', 'Roles & places', 'Clinical collocations'] },
];

// ── Law domains (practice areas). Collapsed variants included in topics. ──
const lawDomains: Domain[] = [
  { id: 'law:litigation', name: 'Litigation & advocacy', field: 'law', section: 'Practice areas', profession: true, topics: ['Litigation', 'Court & advocacy', 'Advocacy', 'Evidence & procedure', 'Criminal law', 'Tort'] },
  { id: 'law:corporate', name: 'Corporate & commercial', field: 'law', section: 'Practice areas', profession: true, topics: ['Corporate law', 'Commercial law', 'Company & governance', 'Banking & finance law', 'Insolvency & restructuring', 'Competition & antitrust'] },
  { id: 'law:contracts', name: 'Contracts & drafting', field: 'law', section: 'Practice areas', profession: true, topics: ['Legal drafting', 'Contracts', 'Contract collocations'] },
  { id: 'law:property', name: 'Property & land', field: 'law', section: 'Practice areas', profession: true, topics: ['Property', 'Conveyancing & land', 'Real estate & property', 'Trusts & equity'] },
  { id: 'law:ip', name: 'IP & data', field: 'law', section: 'Practice areas', profession: true, topics: ['Intellectual property', 'Data protection & privacy'] },
  { id: 'law:public', name: 'Public & human rights', field: 'law', section: 'Practice areas', profession: true, topics: ['Constitutional & public', 'Public law', 'Human rights', 'EU law', 'Immigration law'] },
  { id: 'law:specialist', name: 'Specialist areas', field: 'law', section: 'Practice areas', profession: true, topics: ['Tax law', 'Employment law', 'Family law', 'Shipping & maritime', 'Arbitration', 'Insurance & risk'] },
  { id: 'law:skills', name: 'Register, Latin & letters', field: 'law', section: 'Skills & language', topics: ['Legal Latin', 'Legal register & letters', 'Legal collocations', 'Legislation'] },
  { id: 'law:core', name: 'General legal English', field: 'law', section: 'Core', topics: ['Advanced English'] },
];

// ── Business domains (professions). Split from the old 8-bucket "functions" layout
// (2026-08) once the corpus grew enough to justify it: word counts showed Economics
// (302, biggest topic in the whole field) invisible inside "Finance", Negotiation (230)
// buried as an afterthought under "Communication", and "Management & operations" a
// ~800-word grab-bag hiding Consulting (96) and Corporate strategy (54) as distinct
// identities. Every raw topic from the old 8 domains is still covered here — this is
// a pure regrouping, no topic added or dropped (see app/docs/AREAS-TO-ADD.md). ──
const bizDomains: Domain[] = [
  { id: 'biz:startups', name: 'Startups & founders', field: 'biz', section: 'Professions', profession: true, topics: ['Entrepreneurship & startups'] },
  { id: 'biz:finance', name: 'Finance & investing', field: 'biz', section: 'Professions', profession: true, topics: ['Finance', 'Corporate finance', 'Banking', 'Accounting'] },
  { id: 'biz:economics', name: 'Economics', field: 'biz', section: 'Professions', profession: true, topics: ['Economics'] },
  { id: 'biz:consulting', name: 'Consulting & strategy', field: 'biz', section: 'Professions', profession: true, topics: ['Consulting', 'Strategy', 'Corporate strategy', 'Frameworks & analysis'] },
  { id: 'biz:hr', name: 'HR & people ops', field: 'biz', section: 'Professions', profession: true, topics: ['Human resources', 'People & management', 'Workplace communication'] },
  { id: 'biz:data', name: 'Data & product', field: 'biz', section: 'Professions', profession: true, topics: ['Data & analytics'] },
  { id: 'biz:negotiation', name: 'Negotiation & deal-making', field: 'biz', section: 'Professions', profession: true, topics: ['Negotiation', 'Deals', 'Business email & meetings', 'Meetings'] },
  { id: 'biz:management', name: 'Management & operations', field: 'biz', section: 'Professions', profession: true, topics: ['Leadership & management', 'Management & organisation', 'Management', 'Project management', 'Operations & supply chain', 'Operations', 'Corporate governance', 'Governance'] },
  { id: 'biz:marketing', name: 'Marketing & sales', field: 'biz', section: 'Professions', profession: true, topics: ['Marketing', 'Marketing & brand', 'Sales'] },
  { id: 'biz:specialist', name: 'Risk, property & specialist', field: 'biz', section: 'Professions', profession: true, topics: ['Insurance & risk', 'Real estate & property'] },
  { id: 'biz:core', name: 'General business English', field: 'biz', section: 'Core', topics: ['Business collocations', 'Advanced English'] },
];

// ── General domains (semantic areas). Exam wordlists are EXCLUDED (see EXAM_TOPICS). ──
const genDomains: Domain[] = [
  { id: 'gen:language', name: 'Language & rhetoric', field: 'gen', section: 'Areas', topics: ['Rhetoric', 'Persuasion & rhetoric', 'Thought & rhetoric', 'Thought & reason', 'Wit & humour', 'Arts & literature', 'Literature & the arts', 'Academia & scholarship', 'Academic writing', 'Language & rhetoric'] },
  { id: 'gen:mind', name: 'Mind & character', field: 'gen', section: 'Areas', topics: ['Mind & character', 'Character & virtue', 'Character', 'Emotion', 'Emotion & the inner life'] },
  { id: 'gen:society', name: 'Society & power', field: 'gen', section: 'Areas', topics: ['Society & power', 'Society & manners', 'Society', 'Power & politics', 'Work & money', 'Money & fortune', 'People & management'] },
  { id: 'gen:ideas', name: 'Ideas & time', field: 'gen', section: 'Areas', topics: ['Philosophy & ideas', 'Time & change', 'Science & reasoning', 'Identity'] },
  { id: 'gen:nature', name: 'Nature & senses', field: 'gen', section: 'Areas', topics: ['Nature & senses', 'Beauty & the senses', 'Aesthetics'] },
  { id: 'gen:everyday', name: 'Everyday & idioms', field: 'gen', section: 'Areas', topics: ['Idioms & phrasal verbs', 'Evocative words', 'Advanced English'] },
];

// ── New-words (slang) — its own field; a single domain so it works when active. ──
const newDomains: Domain[] = [
  { id: 'new:culture', name: 'Internet & culture', field: 'new', section: 'Areas', topics: ['Internet & memes', 'Vibes & reactions', 'Dating & friendship', 'Trends & aesthetics', 'Tech & society', 'Work & culture', 'Relationships'] },
];

export const DOMAINS: Domain[] = [...medDomains, ...lawDomains, ...bizDomains, ...genDomains, ...newDomains];

// ── Lookups ──
const _topicToDomain = new Map<string, Domain>(); // key = `${field}::${rawTopic}`
for (const d of DOMAINS) for (const t of d.topics) {
  const k = `${d.field}::${t}`;
  if (!_topicToDomain.has(k)) _topicToDomain.set(k, d);
}
export const domainForTopic = (field: FieldId, rawTopic: string): Domain | undefined =>
  _topicToDomain.get(`${field}::${rawTopic}`) ?? _topicToDomain.get(`${field}::${canonicalTopic(rawTopic)}`);

export const domainById = (id: string): Domain | undefined => DOMAINS.find((d) => d.id === id);

// Domains for a field, professions first, order otherwise preserved (stable sort).
export function domainsForField(field: FieldId): Domain[] {
  return DOMAINS.filter((d) => d.field === field)
    .map((d, i) => ({ d, i }))
    .sort((a, b) => Number(!!b.d.profession) - Number(!!a.d.profession) || a.i - b.i)
    .map((x) => x.d);
}

// Exam tags whose wordlists actually exist in a pool of topics.
export function examTagsForTopics(topics: string[]): ExamTag[] {
  const set = new Set<ExamTag>();
  for (const t of topics) { const e = examTagForTopic(t); if (e) set.add(e); }
  return [...set];
}
// Raw topics belonging to an exam tag (for querying its wordlist).
export function topicsForExam(tag: ExamTag): string[] {
  return Object.keys(EXAM_TOPICS).filter((t) => EXAM_TOPICS[t] === tag);
}

// Topics present in the pool that map to NO domain and are NOT exams → for spot-check
// (kept reachable in the UI under a "More topics" group, never a dead "Other" bucket).
export function unmappedTopics(field: FieldId, topics: string[]): string[] {
  return topics.filter((t) => !examTagForTopic(t) && !domainForTopic(field, t));
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
