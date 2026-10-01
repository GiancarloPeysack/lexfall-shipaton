// Upgrades machine-generated (WordNet) entries to editorial quality: crisp
// definition + a vivid example + synonyms. Applies OVERRIDES onto generated.json
// in place (matched by headword). Re-run any time you add more.  node data/apply-overrides.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OVERRIDES = {
  abstruse: { pos: 'adj', def: 'Difficult to understand; deep and obscure.', ex: 'His abstruse theory lost everyone but the specialists in the room.', syn: ['obscure', 'arcane', 'recondite'] },
  acumen: { pos: 'n', def: 'Keen insight and sharp judgement, especially in practical matters.', ex: 'Her business acumen turned a failing shop into a chain.', syn: ['shrewdness', 'astuteness', 'insight'] },
  alacrity: { pos: 'n', def: 'Brisk and cheerful readiness.', ex: 'He accepted the challenge with surprising alacrity.', syn: ['eagerness', 'readiness', 'zeal'] },
  aplomb: { pos: 'n', def: 'Self-assured poise, especially in a difficult situation.', ex: 'She fielded the hostile questions with remarkable aplomb.', syn: ['poise', 'composure', 'assurance'] },
  arcane: { pos: 'adj', def: 'Understood by few; mysterious or secret.', ex: 'The manual was full of arcane symbols only engineers could read.', syn: ['esoteric', 'obscure', 'cryptic'] },
  assiduous: { pos: 'adj', def: 'Showing great care, effort, and persistence.', ex: 'Years of assiduous practice made the passage sound effortless.', syn: ['diligent', 'sedulous', 'industrious'] },
  banal: { pos: 'adj', def: 'So lacking in originality as to be obvious and boring.', ex: 'The speech offered nothing but banal platitudes.', syn: ['trite', 'hackneyed', 'insipid'] },
  burgeon: { pos: 'v', def: 'To grow or flourish rapidly.', ex: 'The tiny startup burgeoned into a household name within a year.', syn: ['flourish', 'proliferate', 'thrive'] },
  cacophony: { pos: 'n', def: 'A harsh, discordant mixture of sounds.', ex: 'A cacophony of horns rose from the gridlocked street.', syn: ['din', 'racket', 'discord'] },
  candor: { pos: 'n', def: 'Frankness and honesty in expression.', ex: 'I appreciated the candor with which she admitted the mistake.', syn: ['frankness', 'openness', 'sincerity'] },
  castigate: { pos: 'v', def: 'To reprimand severely.', ex: 'The editorial castigated the council for wasting public funds.', syn: ['rebuke', 'censure', 'chastise'] },
  caustic: { pos: 'adj', def: 'Bitingly sarcastic; corrosive.', ex: 'His caustic wit left no one at the table unscathed.', syn: ['scathing', 'acerbic', 'mordant'] },
  cogent: { pos: 'adj', def: 'Clear, logical, and convincing.', ex: 'She made a cogent case for cutting the budget.', syn: ['compelling', 'persuasive', 'lucid'] },
  cursory: { pos: 'adj', def: 'Hasty and superficial; done without attention to detail.', ex: 'A cursory glance at the contract missed the crucial clause.', syn: ['perfunctory', 'hasty', 'superficial'] },
  deference: { pos: 'n', def: 'Polite submission and respect.', ex: 'Out of deference to the elders, he waited to be asked.', syn: ['respect', 'regard', 'esteem'] },
  deleterious: { pos: 'adj', def: 'Causing harm or damage.', ex: 'Sleep loss has a deleterious effect on judgement.', syn: ['harmful', 'injurious', 'detrimental'] },
  didactic: { pos: 'adj', def: 'Intended to teach, often moralizing in tone.', ex: 'The novel is too didactic to feel like a story.', syn: ['instructive', 'moralistic', 'pedagogic'] },
  egregious: { pos: 'adj', def: 'Outstandingly bad; shocking.', ex: 'The report exposed an egregious breach of trust.', syn: ['flagrant', 'glaring', 'outrageous'] },
  elucidate: { pos: 'v', def: 'To make something clear; to explain.', ex: 'Could you elucidate the second step of the proof?', syn: ['clarify', 'explain', 'illuminate'] },
  enervate: { pos: 'v', def: 'To drain of energy or vitality.', ex: 'The relentless heat enervated the whole crew.', syn: ['weaken', 'sap', 'debilitate'] },
  ennui: { pos: 'n', def: 'A weary dissatisfaction born of boredom.', ex: 'A vague ennui settled over the long, idle afternoon.', syn: ['boredom', 'listlessness', 'tedium'] },
  eschew: { pos: 'v', def: 'To deliberately avoid or abstain from.', ex: 'She eschews small talk in favour of real conversation.', syn: ['avoid', 'shun', 'forgo'] },
  exacerbate: { pos: 'v', def: 'To make a problem or situation worse.', ex: 'Scratching only exacerbates the rash.', syn: ['aggravate', 'worsen', 'inflame'] },
  garrulous: { pos: 'adj', def: 'Excessively talkative, especially about trivia.', ex: 'The garrulous cab driver narrated every turn.', syn: ['loquacious', 'voluble', 'chatty'] },
  germane: { pos: 'adj', def: 'Relevant and appropriate to the matter at hand.', ex: 'Keep your remarks germane to the motion, please.', syn: ['relevant', 'pertinent', 'apposite'] },
  iconoclast: { pos: 'n', def: 'A person who attacks cherished beliefs or institutions.', ex: 'The young director is a gleeful iconoclast of studio convention.', syn: ['maverick', 'dissenter', 'radical'] },
  inexorable: { pos: 'adj', def: 'Impossible to stop or resist; relentless.', ex: 'The inexorable rise of the tide erased the sandcastle.', syn: ['relentless', 'inescapable', 'unstoppable'] },
  ingenuous: { pos: 'adj', def: 'Innocent, frank, and unsuspecting.', ex: 'Her ingenuous smile disarmed the whole panel.', syn: ['naive', 'artless', 'guileless'] },
  insidious: { pos: 'adj', def: 'Advancing gradually and harmfully, without being noticed.', ex: 'The insidious leak rotted the beams for years unseen.', syn: ['stealthy', 'subtle', 'treacherous'] },
  laconic: { pos: 'adj', def: 'Using very few words.', ex: 'His laconic "fine" ended the argument.', syn: ['terse', 'concise', 'curt'] },
  meticulous: { pos: 'adj', def: 'Showing great attention to detail; very careful.', ex: 'The restorer was meticulous about every brushstroke.', syn: ['scrupulous', 'painstaking', 'fastidious'] },
  mitigate: { pos: 'v', def: 'To make less severe or painful.', ex: 'Planting trees can mitigate the summer heat.', syn: ['alleviate', 'lessen', 'temper'] },
  nadir: { pos: 'n', def: 'The lowest point.', ex: 'Losing the house was the nadir of a brutal year.', syn: ['low point', 'rock bottom', 'trough'] },
  nebulous: { pos: 'adj', def: 'Vague, hazy, or ill-defined.', ex: 'The plan was still nebulous when funding fell through.', syn: ['vague', 'hazy', 'unclear'] },
  nonchalant: { pos: 'adj', def: 'Calmly casual; showing no anxiety or concern.', ex: 'He gave a nonchalant shrug at the terrible news.', syn: ['unconcerned', 'blasé', 'insouciant'] },
  obfuscate: { pos: 'v', def: 'To deliberately make unclear or confusing.', ex: 'The jargon seemed designed to obfuscate the truth.', syn: ['obscure', 'muddle', 'cloud'] },
  obsequious: { pos: 'adj', def: 'Excessively eager to please or obey.', ex: 'The obsequious clerk agreed with every word the boss said.', syn: ['fawning', 'servile', 'sycophantic'] },
  ostentatious: { pos: 'adj', def: 'Showy, designed to impress or attract notice.', ex: 'The ostentatious chandelier dwarfed the little room.', syn: ['showy', 'flashy', 'gaudy'] },
  paucity: { pos: 'n', def: 'The presence of something in disappointingly small amounts.', ex: 'A paucity of evidence forced the case to be dropped.', syn: ['scarcity', 'dearth', 'shortage'] },
  perfunctory: { pos: 'adj', def: 'Done routinely and with little care or interest.', ex: 'He gave the report a perfunctory nod and moved on.', syn: ['cursory', 'mechanical', 'token'] },
  pernicious: { pos: 'adj', def: 'Having a harmful effect, especially in a subtle way.', ex: 'Rumours had a pernicious effect on morale.', syn: ['harmful', 'destructive', 'insidious'] },
  pithy: { pos: 'adj', def: 'Brief, forceful, and full of meaning.', ex: 'She summed it up in one pithy sentence.', syn: ['succinct', 'terse', 'trenchant'] },
  placate: { pos: 'v', def: 'To soothe or pacify, especially by concessions.', ex: 'A refund did little to placate the furious customer.', syn: ['appease', 'mollify', 'pacify'] },
  plethora: { pos: 'n', def: 'An excess; an overabundance.', ex: 'The menu offered a plethora of nearly identical dishes.', syn: ['excess', 'surfeit', 'glut'] },
  prescient: { pos: 'adj', def: 'Having knowledge of events before they happen.', ex: 'Her prescient warning about the crash went unheeded.', syn: ['prophetic', 'foresighted', 'clairvoyant'] },
  prosaic: { pos: 'adj', def: 'Commonplace and unimaginative; dull.', ex: 'Behind the grand title lay a prosaic accounting job.', syn: ['dull', 'mundane', 'pedestrian'] },
  reticent: { pos: 'adj', def: 'Reserved; reluctant to reveal thoughts or feelings.', ex: 'He was reticent about his plans until they were certain.', syn: ['reserved', 'reticent', 'taciturn'] },
  sagacious: { pos: 'adj', def: 'Having keen practical wisdom; shrewd.', ex: 'A sagacious investor, she sold before the bubble burst.', syn: ['wise', 'astute', 'perspicacious'] },
  soporific: { pos: 'adj', def: 'Tending to induce drowsiness or sleep.', ex: 'The lecturer’s soporific drone emptied the back rows.', syn: ['sleep-inducing', 'sedative', 'drowsy'] },
  specious: { pos: 'adj', def: 'Superficially plausible but actually wrong.', ex: 'The ad made a specious claim about instant results.', syn: ['misleading', 'fallacious', 'deceptive'] },
  surreptitious: { pos: 'adj', def: 'Kept secret because it would not be approved of.', ex: 'She stole a surreptitious glance at his notes.', syn: ['stealthy', 'furtive', 'clandestine'] },
  tenuous: { pos: 'adj', def: 'Very weak or slight; flimsy.', ex: 'The evidence linking them was tenuous at best.', syn: ['flimsy', 'slight', 'weak'] },
  trenchant: { pos: 'adj', def: 'Vigorous, incisive, and to the point.', ex: 'Her trenchant critique reshaped the whole draft.', syn: ['incisive', 'cutting', 'penetrating'] },
  ubiquitous: { pos: 'adj', def: 'Present, appearing, or found everywhere.', ex: 'Smartphones are now ubiquitous, even at the dinner table.', syn: ['omnipresent', 'pervasive', 'universal'] },
  venerate: { pos: 'v', def: 'To regard with deep respect or reverence.', ex: 'Students still venerate the old professor decades on.', syn: ['revere', 'honour', 'esteem'] },
  vociferous: { pos: 'adj', def: 'Expressing feelings loudly and insistently.', ex: 'Vociferous protests greeted the new fee.', syn: ['clamorous', 'strident', 'outspoken'] },
  wistful: { pos: 'adj', def: 'Full of quiet, yearning longing or regret.', ex: 'She gave a wistful look at her childhood home.', syn: ['yearning', 'nostalgic', 'plaintive'] },
  zenith: { pos: 'n', def: 'The highest point; the peak.', ex: 'The band was at the zenith of its fame that summer.', syn: ['peak', 'apex', 'pinnacle'] },
};

const __dir = dirname(fileURLToPath(import.meta.url));
const p = join(__dir, 'generated.json');
const g = JSON.parse(await readFile(p, 'utf8'));
let n = 0;
for (const w of g) {
  const o = OVERRIDES[w.word];
  if (!o) continue;
  w.def = o.def; w.ex = o.ex; if (o.pos) w.pos = o.pos; if (o.syn) w.syn = o.syn; w.cefr = 'C2';
  n++;
}
await writeFile(p, JSON.stringify(g, null, 2));
console.log(`applied ${n} editorial overrides (of ${Object.keys(OVERRIDES).length} authored) to generated.json`);
