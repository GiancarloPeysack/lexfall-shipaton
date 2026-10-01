export type FieldId = 'med' | 'law' | 'biz' | 'gen' | 'new';

// Strict 6-tier CEFR grade for a word's real English-language difficulty (A1 easiest, C2 hardest;
// no decimals like "B1.2"). Independent of the corpus's own coarse `cefr` field above, which only
// ever tags C1/C2 - this is a finer, honestly-graded overlay (see data/word-levels.ts), starting
// with a sample per field and meant to grow to cover the whole corpus over time.
export type Cefr6 = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface Word {
  id: string;            // stable slug, e.g. "med:palliative"
  field: FieldId;
  word: string;
  pos: string;           // part of speech, short: adj / n / v
  ipa: string;           // without slashes
  cefr: 'C1' | 'C2';
  def: string;
  ex: string;            // example sentence
  topic: string;
  syn?: string[];        // synonyms (for the synonym game + detail)
  etymology?: string;    // short origin note (detail screen)
  visual?: string;       // cinematic stock-footage search phrase (reel backgrounds)
}

export interface Field {
  id: FieldId;
  name: string;
  tag: string;
}

export const FIELDS: Field[] = [
  { id: 'gen', name: 'General C1–C2', tag: 'Politics, ideas, science, arts — the broad advanced mix' },
  { id: 'med', name: 'Medicine', tag: 'For OET & working in English-speaking healthcare' },
  { id: 'law', name: 'Law', tag: 'Legal English · contracts, court, TOLES' },
  { id: 'biz', name: 'Business', tag: 'Business English · meetings, emails, deals' },
  { id: 'new', name: 'New Words', tag: 'Internet culture, Gen Z & Alpha slang - keep up with how English moves' },
];

// Does a word belong to a selected field?
// - General ('gen') shows ONLY general words — never medical/legal/business
//   jargon (or 'new' slang). Broadly-interesting register, nothing technical.
// - A professional field (med/law/biz) shows its own words PLUS general ones,
//   so those (small) domain sets still have volume and everyday range.
// - 'new' (slang) is its own pool, shown only when explicitly selected.
export const inField = (wordField: FieldId, field: FieldId) =>
  wordField === field || (field !== 'gen' && field !== 'new' && wordField === 'gen');
