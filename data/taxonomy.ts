import { FieldId } from './types';

// The 3-level personalization spine: Vertical → Track (sub-niche / exam) → topics
// (the finest "sub-track" grain, matching the `topic` field on every Word). The
// crown personalization panel, onboarding, and build-a-test all read this; the
// feed filters on the set of followed topics. `topics` here are the exact `topic`
// strings present in the corpus, so no per-word migration is needed.
export interface Track {
  id: string;
  vertical: FieldId;
  name: string;
  exam?: string;       // headline credential this track prepares for
  topics: string[];    // sub-tracks (corpus topic labels)
}

export interface Vertical {
  id: FieldId;
  name: string;
  tagline: string;
  tracks: Track[];
}

export const TAXONOMY: Vertical[] = [
  {
    id: 'med', name: 'Medicine', tagline: 'OET · clinical English for healthcare',
    tracks: [
      { id: 'med-oet-comm', vertical: 'med', name: 'OET & communication', exam: 'OET', topics: ['Clinical consultation', 'OET letter-writing', 'Handover & SBAR', 'Handover', 'Patient communication', 'History taking', 'Referral writing', 'Nursing care', 'Ward care', 'Patient care', 'Assessment', 'Examination', 'Diagnosis'] },
      { id: 'med-specialties', vertical: 'med', name: 'Specialties', exam: 'OET Medicine', topics: ['Cardiology', 'Oncology', 'Neurology', 'Endocrine & diabetes', 'Gastroenterology', 'Musculoskeletal', 'Renal & urinary', 'Respiratory', 'Dermatology', 'Ophthalmology', 'ENT', 'Paediatrics', 'Maternity', 'Infectious disease', 'Body systems', 'Conditions', 'Symptoms'] },
      { id: 'med-acute', vertical: 'med', name: 'Acute & surgical', exam: 'OET Medicine', topics: ['Emergency', 'Critical care', 'Anaesthesia', 'Surgery', 'Procedures'] },
      { id: 'med-dx-pharm', vertical: 'med', name: 'Diagnostics & pharmacy', exam: 'OET Pharmacy', topics: ['Radiology & imaging', 'Pharmacology', 'Pharmacy practice', 'Medications'] },
      { id: 'med-allied', vertical: 'med', name: 'Allied & dental', exam: 'OET', topics: ['Physiotherapy', 'Dentistry'] },
      { id: 'med-us-nursing', vertical: 'med', name: 'US nursing (IELTS/TOEFL)', exam: 'CGFNS / IELTS', topics: ['US nursing English'] },
      { id: 'med-general', vertical: 'med', name: 'General clinical English', topics: ['Advanced English', 'Roles & places', 'Clinical collocations'] },
    ],
  },
  {
    id: 'law', name: 'Law', tagline: 'TOLES · legal English & drafting',
    tracks: [
      { id: 'law-contracts', vertical: 'law', name: 'Contracts & commercial', exam: 'TOLES Advanced', topics: ['Contracts', 'Contract collocations', 'Commercial law', 'Banking & finance law', 'Corporate law'] },
      { id: 'law-litigation', vertical: 'law', name: 'Litigation & procedure', exam: 'Litigation', topics: ['Litigation', 'Evidence & procedure', 'Advocacy', 'Criminal law', 'Tort'] },
      { id: 'law-arbitration', vertical: 'law', name: 'Arbitration & international', exam: 'International arbitration', topics: ['Arbitration', 'Shipping & maritime'] },
      { id: 'law-ip-reg', vertical: 'law', name: 'IP & regulatory', exam: 'Corporate', topics: ['Intellectual property', 'Competition & antitrust', 'Data protection & privacy', 'Tax law'] },
      { id: 'law-public', vertical: 'law', name: 'Public & constitutional', exam: 'LLM', topics: ['Constitutional & public', 'Public law', 'Legislation'] },
      { id: 'law-drafting', vertical: 'law', name: 'Drafting, register & Latin', exam: 'TOLES', topics: ['Legal drafting', 'Legal register & letters', 'Legal Latin', 'Legal collocations'] },
      { id: 'law-private', vertical: 'law', name: 'Private client', topics: ['Family law', 'Employment law', 'Property'] },
    ],
  },
  {
    id: 'biz', name: 'Business', tagline: 'Professional English for the workplace',
    tracks: [
      { id: 'biz-finance', vertical: 'biz', name: 'Finance & accounting', topics: ['Finance', 'Corporate finance', 'Accounting', 'Economics'] },
      { id: 'biz-strategy', vertical: 'biz', name: 'Strategy & consulting', topics: ['Consulting', 'Strategy'] },
      { id: 'biz-people', vertical: 'biz', name: 'People & leadership', topics: ['Leadership & management', 'Human resources'] },
      { id: 'biz-commercial', vertical: 'biz', name: 'Sales, marketing & deals', topics: ['Sales', 'Marketing', 'Negotiation', 'Deals'] },
      { id: 'biz-ops', vertical: 'biz', name: 'Operations & delivery', topics: ['Project management', 'Data & analytics', 'Governance'] },
      { id: 'biz-comm', vertical: 'biz', name: 'Communication & email', topics: ['Business email & meetings', 'Workplace communication', 'Meetings', 'Business collocations'] },
    ],
  },
  {
    id: 'gen', name: 'General', tagline: 'Cambridge · GRE · advanced English',
    tracks: [
      { id: 'gen-cae', vertical: 'gen', name: 'Cambridge C1 (CAE)', exam: 'CAE', topics: ['Cambridge C1 Advanced'] },
      { id: 'gen-cpe', vertical: 'gen', name: 'Cambridge C2 (CPE)', exam: 'CPE', topics: ['Cambridge C2 Proficiency'] },
      { id: 'gen-gre', vertical: 'gen', name: 'GRE Verbal', exam: 'GRE', topics: ['GRE Verbal'] },
      { id: 'gen-academic', vertical: 'gen', name: 'Academic English', exam: 'IELTS/TOEFL', topics: ['Academic writing'] },
      { id: 'gen-everyday', vertical: 'gen', name: 'Everyday advanced', topics: ['Idioms & phrasal verbs', 'Evocative words', 'Advanced English'] },
      { id: 'gen-mind', vertical: 'gen', name: 'Mind & society', topics: ['Emotion', 'Character', 'Thought & reason', 'Power & politics', 'Society', 'Language & rhetoric'] },
      { id: 'gen-world', vertical: 'gen', name: 'World & time', topics: ['Nature & senses', 'Time & change', 'Aesthetics'] },
    ],
  },
  {
    id: 'new', name: 'Modern', tagline: 'Internet, culture & slang',
    tracks: [
      { id: 'new-modern', vertical: 'new', name: 'Modern & internet', topics: ['Tech & society', 'Relationships', 'Identity', 'Work & culture', 'Aesthetics'] },
    ],
  },
];

// ---- helpers ----
export const VERTICAL_IDS: FieldId[] = TAXONOMY.map((v) => v.id);
export const verticalById = (id: FieldId): Vertical | undefined => TAXONOMY.find((v) => v.id === id);
export const ALL_TRACKS: Track[] = TAXONOMY.flatMap((v) => v.tracks);
export const trackById = (id: string): Track | undefined => ALL_TRACKS.find((t) => t.id === id);

// The track a topic belongs to (first match wins).
const _trackByTopic: Record<string, Track> = {};
for (const t of ALL_TRACKS) for (const top of t.topics) if (!_trackByTopic[top]) _trackByTopic[top] = t;
export const trackForTopic = (topic: string): Track | undefined => _trackByTopic[topic];

// All topics under a track / vertical (the follow-set unit expands to these).
export const topicsForTrack = (id: string): string[] => trackById(id)?.topics ?? [];
export const topicsForVertical = (id: FieldId): string[] => (verticalById(id)?.tracks ?? []).flatMap((t) => t.topics);
