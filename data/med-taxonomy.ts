import { IlloName } from '../components/Illustrations';

// Healthcare-specific onboarding taxonomy (GTM: breadth BY PROFESSION is the wedge —
// OET spans ~12 professions and incumbents cover 1-2). These map to the REAL topic
// strings in the corpus (see data/curated-bundle.json). Anything not present in SEED
// is filtered out at render time, so listing generously here is safe.

export interface MedGroup {
  id: string;
  name: string;
  tag: string;
  illo: IlloName;
  topics: string[];
}

// 1) Your profession — the differentiator. Nurses primary, allied health the wedge.
export const MED_PROFESSIONS: MedGroup[] = [
  { id: 'nursing', name: 'Nursing', tag: 'Ward, patient care, NMC/AHPRA', illo: 'heart',
    topics: ['Nursing care', 'Nursing', 'Ward care', 'US nursing English'] },
  { id: 'doctor', name: 'Doctor / IMG', tag: 'Consultation, PLAB, GMC', illo: 'body',
    topics: ['Clinical consultation', 'Assessment & examination', 'History taking', 'Diagnosis'] },
  { id: 'physio', name: 'Physiotherapy', tag: 'Rehab & movement', illo: 'body',
    topics: ['Physiotherapy', 'Musculoskeletal'] },
  { id: 'pharmacy', name: 'Pharmacy', tag: 'Dispensing & counselling', illo: 'pill',
    topics: ['Pharmacy practice', 'Pharmacy', 'Pharmacology'] },
  { id: 'dentistry', name: 'Dentistry', tag: 'Oral health', illo: 'sparkle',
    topics: ['Dentistry'] },
  { id: 'radiography', name: 'Radiography', tag: 'Imaging & scans', illo: 'body',
    topics: ['Radiography & imaging', 'Radiology & imaging'] },
  { id: 'midwifery', name: 'Midwifery', tag: 'Maternity & obstetrics', illo: 'heart',
    topics: ['Midwifery & obstetrics', 'Maternity'] },
  { id: 'mental-health', name: 'Mental health', tag: 'Psychiatric nursing & care', illo: 'faces',
    topics: ['Mental health nursing', 'Mental health'] },
  { id: 'dietetics', name: 'Dietetics', tag: 'Nutrition', illo: 'leaf',
    topics: ['Dietetics & nutrition'] },
  { id: 'ot', name: 'Occupational therapy', tag: 'Function & daily living', illo: 'sparkle',
    topics: ['Occupational therapy'] },
  { id: 'optometry', name: 'Optometry', tag: 'Eye care', illo: 'sparkle',
    topics: ['Optometry'] },
  { id: 'podiatry', name: 'Podiatry', tag: 'Foot & lower limb', illo: 'body',
    topics: ['Podiatry'] },
  { id: 'slt', name: 'Speech & language', tag: 'SLT communication', illo: 'chat',
    topics: ['Speech & language therapy'] },
  { id: 'paramedic', name: 'Paramedic', tag: 'Pre-hospital & emergency', illo: 'body',
    topics: ['Paramedic & emergency', 'Emergency'] },
  { id: 'lab', name: 'Laboratory', tag: 'Pathology & diagnostics', illo: 'pill',
    topics: ['Medical laboratory'] },
  { id: 'vet', name: 'Veterinary', tag: 'Animal health', illo: 'heart',
    topics: ['Veterinary'] },
];

// 2) Communication & OET skills — the exam wedge (Writing is the hardest sub-test).
export const MED_SKILLS: MedGroup = {
  id: 'communication', name: 'Communication & OET', tag: 'Letters, handover, patient talk', illo: 'pen',
  topics: [
    'OET letter-writing', 'Referral & discharge letters', 'Referral writing',
    'Clinical handover', 'Handover & SBAR', 'Handover',
    'Patient-facing communication', 'Patient communication', 'Patient care',
    'Consent & explaining', 'Clinical consultation', 'Assessment & examination',
    'History taking', 'Symptoms',
  ],
};

// Deduplicated DISPLAY chips for Communication & OET: 14 near-duplicate topics collapse to
// 7 clean, clinician-credible chips. Word rows stay keyed by the underlying topic strings
// (each chip's `topics` is the union it absorbs), so no corpus content is lost — only the
// visible chip list shrinks. MED_SKILLS.topics above stays the flat union for other callers.
export interface DisplayChip { label: string; topics: string[] }
export const MED_SKILL_CHIPS: DisplayChip[] = [
  { label: 'Letters & referrals', topics: ['OET letter-writing', 'Referral & discharge letters', 'Referral writing'] },
  { label: 'Handover & SBAR', topics: ['Clinical handover', 'Handover & SBAR', 'Handover'] },
  { label: 'Talking with patients', topics: ['Patient-facing communication', 'Patient communication', 'Patient care'] },
  { label: 'Explaining & consent', topics: ['Consent & explaining'] },
  { label: 'History & consultation', topics: ['Clinical consultation', 'History taking'] },
  { label: 'Examination & assessment', topics: ['Assessment & examination'] },
  { label: 'Symptoms & presentation', topics: ['Symptoms'] },
];
// The 4 communication chips pre-selected for exam/migrating users (was: all 14 topics).
const MED_SKILL_DEFAULT_LABELS = ['Letters & referrals', 'Handover & SBAR', 'Talking with patients', 'Explaining & consent'];
export const MED_SKILL_DEFAULT_TOPICS = MED_SKILL_CHIPS.filter((c) => MED_SKILL_DEFAULT_LABELS.includes(c.label)).flatMap((c) => c.topics);

// 3) Clinical specialties — depth for those who want it.
export const MED_SPECIALTIES: MedGroup = {
  id: 'specialties', name: 'Clinical specialties', tag: 'Cardiology, neuro, oncology…', illo: 'pill',
  topics: [
    'Cardiology', 'Respiratory', 'Neurology', 'Oncology', 'Gastroenterology',
    'Endocrine & diabetes', 'Renal & urinary', 'Dermatology', 'ENT', 'Ophthalmology',
    'Anaesthesia', 'Critical care', 'Paediatrics', 'Surgery', 'Infectious disease',
    'Body systems', 'Anatomy',
  ],
};

// Everyday clinical English that every healthcare user gets by default.
export const MED_CORE_TOPICS = ['Advanced English', 'Roles & places', 'Clinical collocations'];

// One screen that captures BOTH the exam identity and the intent (merged — asking "why"
// then "which exam" was redundant and contradictory, since OET *is* how most register).
// `exam` → has a dated exam (show the date picker). `migrating` → on the abroad path, so we
// seed the OET communication topics + a firmer pace. Persisted as vorto.purpose.
export interface Purpose { id: string; label: string; note: string; exam: boolean; migrating?: boolean }
// "Work" leads (owner, 2026-09-10): most users are already IN the field, not studying for a
// specific exam - that option should be the first thing they see, not buried in the middle.
export const MED_PURPOSES: Purpose[] = [
  { id: 'work', label: 'I already work in healthcare', note: 'Sharpen my clinical English', exam: false, migrating: true },
  { id: 'oet', label: 'OET', note: 'Occupational English Test', exam: true, migrating: true },
  { id: 'ielts', label: 'IELTS', note: 'Academic English', exam: true, migrating: true },
  { id: 'plab', label: 'PLAB', note: 'For doctors · UK GMC', exam: true, migrating: true },
  { id: 'registering', label: 'Registering abroad', note: 'No exam booked yet', exam: false, migrating: true },
  { id: 'improving', label: 'Just building my vocabulary', note: 'Sharpen my clinical vocabulary', exam: false },
];

// Which purpose ids count as "an exam" (drives vorto.examType).
export const MED_EXAM_IDS = ['oet', 'ielts', 'plab'];
