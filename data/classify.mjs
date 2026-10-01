// Re-tags generated words from broad buckets ("Advanced English" etc.) into the
// real Explore sub-categories (topics) so each sub-category has volume. Keyword
// match on the definition; even round-robin fallback so nothing stays tiny.
// Run:  node data/classify.mjs   (then bump CONTENT_VERSION in lib/db.ts)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// field -> ordered [topic, [keywords]] rules (first match wins). Order matters:
// more specific themes first.
const RULES = {
  gen: [
    ['Emotion', ['emotion', 'feeling', 'mood', 'anger', 'angry', 'joy', 'happy', 'sad', 'grief', 'fear', 'love', 'hate', 'anxiety', 'delight', 'sorrow', 'passion']],
    ['Wit & humour', ['humor', 'humour', 'joke', 'wit', 'witty', 'funny', 'mock', 'satire', 'comic', 'amus', 'ridicule', 'jest', 'ironic']],
    ['Rhetoric', ['speech', 'speak', 'argu', 'persuad', 'rhetoric', 'eloquen', 'word', 'language', 'express', 'talk', 'utter', 'oratory', 'discourse', 'verbal']],
    ['Arts & literature', ['art', 'literat', 'poem', 'poetr', 'music', 'story', 'writ', 'aesthet', 'novel', 'drama', 'paint', 'song', 'style', 'beauty', 'beautiful']],
    ['Academia & scholarship', ['stud', 'academ', 'scholar', 'knowledge', 'scien', 'learn', 'theor', 'research', 'intellect', 'reason', 'logic', 'analy', 'method']],
    ['Power & politics', ['power', 'politic', 'govern', 'rule', 'authorit', 'state', 'law', 'command', 'dominat', 'sovereign', 'nation', 'empire']],
    ['Society & manners', ['societ', 'social', 'manner', 'custom', 'etiquette', 'class', 'community', 'convention', 'polite', 'refined', 'civil']],
    ['Work & money', ['money', 'wealth', 'profit', 'financ', 'rich', 'poor', 'pay', 'cost', 'trade', 'econom', 'labor', 'labour', 'work', 'wage']],
    ['Philosophy & ideas', ['philosoph', 'idea', 'concept', 'belief', 'truth', 'meaning', 'exist', 'moral', 'ethic', 'principle', 'doctrine', 'abstract']],
    ['Time & change', ['time', 'chang', 'past', 'future', 'transient', 'perman', 'era', 'moment', 'lasting', 'brief', 'sudden', 'gradual', 'endur']],
    ['Nature & senses', ['nature', 'natural', 'sense', 'smell', 'sound', 'light', 'plant', 'animal', 'weather', 'earth', 'sky', 'water', 'colour', 'color', 'scent', 'touch']],
    ['Mind & character', ['character', 'personalit', 'mind', 'thought', 'trait', 'temperament', 'wise', 'fool', 'stubborn', 'proud', 'humble', 'honest', 'brave', 'cautious', 'lazy', 'diligent', 'quiet', 'bold', 'shy']],
  ],
  med: [
    ['Pharmacology', ['drug', 'dose', 'dosage', 'medic', 'pharma', 'anesthet', 'analges', 'sedat', 'antibiot', 'therap']],
    ['Surgery', ['surg', 'incis', 'excis', 'resect', 'suture', 'operat', 'graft', 'anastomos']],
    ['Anatomy', ['anatom', 'organ', 'tissue', 'muscle', 'bone', 'nerve', 'artery', 'vein', 'cardiac', 'pulmonar', 'renal', 'hepatic', 'cerebral', 'vascular']],
    ['Mental health', ['mental', 'psych', 'mood', 'anxiet', 'depress', 'cogniti', 'behav']],
    ['Public health', ['epidemi', 'public health', 'contagi', 'population', 'hygien', 'outbreak', 'prevent', 'vaccin']],
    ['Patient care', ['patient', 'care', 'nurs', 'palliat', 'recover', 'convalesc', 'comfort', 'monitor']],
    ['Diagnosis', ['diagnos', 'symptom', 'sign', 'prognos', 'disease', 'condition', 'syndrome', 'patholog', 'lesion', 'inflamm', 'infect']],
  ],
  law: [
    ['Litigation', ['court', 'trial', 'sue', 'suit', 'litig', 'plaintiff', 'defendant', 'damages', 'injunc', 'tort', 'appeal', 'judge', 'jury', 'verdict', 'adjourn']],
    ['Criminal law', ['crim', 'guilt', 'offen', 'convict', 'acquit', 'felony', 'arrest', 'prosecut', 'punish', 'indict']],
    ['Contracts', ['contract', 'agree', 'clause', 'covenant', 'breach', 'oblig', 'indemn', 'warrant', 'consider', 'party']],
    ['Property', ['propert', 'land', 'estate', 'tenan', 'lease', 'mortgage', 'convey', 'easement', 'title', 'owner']],
    ['Legislation', ['statut', 'legisl', 'act', 'regulat', 'ordinance', 'bylaw', 'amend', 'enact', 'repeal', 'provision']],
    ['Advocacy', ['advoc', 'counsel', 'argu', 'plead', 'represent', 'precedent', 'brief', 'submission']],
  ],
  biz: [
    ['Finance', ['financ', 'money', 'capital', 'asset', 'liab', 'invest', 'divid', 'equity', 'yield', 'interest', 'fund', 'cash', 'credit', 'debt', 'account', 'revenue', 'profit']],
    ['Governance', ['govern', 'board', 'compli', 'audit', 'regulat', 'stakeholder', 'fiduc', 'quorum', 'proxy', 'oversight']],
    ['Strategy', ['strateg', 'plan', 'growth', 'scal', 'competit', 'benchmark', 'forecast', 'diversif', 'consolidat']],
    ['Marketing & brand', ['market', 'brand', 'advertis', 'custom', 'consum', 'retail', 'promot', 'demand']],
    ['Negotiation', ['negoti', 'deal', 'bargain', 'settle', 'terms', 'offer', 'mediat', 'arbitrat']],
    ['People & management', ['employ', 'staff', 'manage', 'team', 'hire', 'retention', 'attrition', 'personnel', 'labour', 'labor', 'workforce']],
  ],
};

function classify(w) {
  const rules = RULES[w.field] || RULES.gen;
  const hay = `${w.word} ${w.def}`.toLowerCase();
  for (const [topic, kws] of rules) {
    if (kws.some((k) => hay.includes(k))) return topic;
  }
  return null;
}

const __dir = dirname(fileURLToPath(import.meta.url));
const p = join(__dir, 'generated.json');
const g = JSON.parse(await readFile(p, 'utf8'));

// even round-robin cursor per field for the unmatched
const rr = {};
const counts = {};
for (const w of g) {
  let topic = classify(w);
  if (!topic) {
    const rules = RULES[w.field] || RULES.gen;
    rr[w.field] = (rr[w.field] ?? 0) + 1;
    topic = rules[rr[w.field] % rules.length][0];
  }
  w.topic = topic;
  counts[topic] = (counts[topic] || 0) + 1;
}
await writeFile(p, JSON.stringify(g, null, 2));
console.log('re-tagged', g.length, 'words. Per-subcategory counts:');
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, n]) => `  ${n}  ${t}`).join('\n'));
