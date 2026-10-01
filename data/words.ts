import { Word } from './types';

// NOTE: This is a SMALL SAMPLE (20 entries) of the Lexfall word library.
// The full curated corpus (~11,000 hand-graded C1-C2 entries across General,
// Medicine, Law and Business) is proprietary and intentionally excluded from
// this public repository. See README.md.
export const SEED: Word[] = [
  { id: 'gen:petrichor', field: 'gen', word: 'petrichor', pos: 'n', ipa: 'ˈpɛtrɪkɔː', cefr: 'C2', def: 'The earthy scent of rain falling on dry ground.', ex: 'A sudden petrichor rose from the pavement as the storm broke.', topic: 'Nature & the senses' },
  { id: 'gen:sedulous', field: 'gen', word: 'sedulous', pos: 'adj', ipa: 'ˈsɛdjʊləs', cefr: 'C2', def: 'Showing dedicated, persistent, careful effort.', ex: 'Her sedulous revision over months finally paid off.', topic: 'Character & virtue' },
  { id: 'gen:ineffable', field: 'gen', word: 'ineffable', pos: 'adj', ipa: 'ɪnˈɛfəbl', cefr: 'C2', def: 'Too great or intense to be expressed in words.', ex: 'The summit offered an ineffable sense of stillness.', topic: 'Emotion & the inner life' },
  { id: 'gen:equanimity', field: 'gen', word: 'equanimity', pos: 'n', ipa: 'ˌɛkwəˈnɪmɪti', cefr: 'C1', def: 'Calmness and composure, especially under strain.', ex: 'He took the criticism with surprising equanimity.', topic: 'Emotion & the inner life' },
  { id: 'gen:perspicacious', field: 'gen', word: 'perspicacious', pos: 'adj', ipa: 'ˌpɜːspɪˈkeɪʃəs', cefr: 'C2', def: 'Having keen insight; quick to understand.', ex: 'A perspicacious editor caught the flaw at once.', topic: 'Thought & rhetoric' },
  { id: 'gen:laconic', field: 'gen', word: 'laconic', pos: 'adj', ipa: 'ləˈkɒnɪk', cefr: 'C1', def: 'Using very few words; terse to the point of seeming blunt.', ex: 'His laconic reply told us nothing.', topic: 'Thought & rhetoric' },
  { id: 'gen:halcyon', field: 'gen', word: 'halcyon', pos: 'adj', ipa: 'ˈhalsɪən', cefr: 'C2', def: 'Denoting a past time that was idyllically happy and peaceful.', ex: 'She spoke of the halcyon days before the move.', topic: 'Time & memory' },
  { id: 'gen:obfuscate', field: 'gen', word: 'obfuscate', pos: 'v', ipa: 'ˈɒbfəskeɪt', cefr: 'C1', def: 'To deliberately make something unclear or hard to understand.', ex: 'The report seemed written to obfuscate rather than explain.', topic: 'Thought & rhetoric' },
  { id: 'gen:sanguine', field: 'gen', word: 'sanguine', pos: 'adj', ipa: 'ˈsaŋɡwɪn', cefr: 'C1', def: 'Optimistic or positive, especially in a difficult situation.', ex: 'She stayed sanguine about the deal despite the delays.', topic: 'Emotion & the inner life' },
  { id: 'gen:cogent', field: 'gen', word: 'cogent', pos: 'adj', ipa: 'ˈkəʊdʒ(ə)nt', cefr: 'C1', def: 'Clear, logical, and convincing.', ex: 'He made a cogent case for the new strategy.', topic: 'Thought & rhetoric' },
  { id: 'med:palliative', field: 'med', word: 'palliative', pos: 'adj', ipa: 'ˈpalɪətɪv', cefr: 'C1', def: 'Relieving symptoms without curing the underlying condition.', ex: 'The team shifted to palliative care to keep her comfortable.', topic: 'Clinical care' },
  { id: 'med:ischaemia', field: 'med', word: 'ischaemia', pos: 'n', ipa: 'ɪsˈkiːmɪə', cefr: 'C2', def: 'An inadequate blood supply to an organ or tissue.', ex: 'The ECG changes pointed to myocardial ischaemia.', topic: 'Cardiology' },
  { id: 'med:prognosis', field: 'med', word: 'prognosis', pos: 'n', ipa: 'prɒɡˈnəʊsɪs', cefr: 'C1', def: 'The likely course and outcome of a disease.', ex: 'Early detection greatly improves the prognosis.', topic: 'Clinical care' },
  { id: 'law:indemnity', field: 'law', word: 'indemnity', pos: 'n', ipa: 'ɪnˈdɛmnɪti', cefr: 'C1', def: 'A contractual obligation to compensate another for loss.', ex: 'The seller gave an indemnity against any tax liability.', topic: 'Contracts' },
  { id: 'law:estoppel', field: 'law', word: 'estoppel', pos: 'n', ipa: 'ɪˈstɒpl', cefr: 'C2', def: 'A bar preventing someone from asserting a claim inconsistent with their earlier conduct.', ex: 'The defence relied on promissory estoppel.', topic: 'Litigation' },
  { id: 'law:tortious', field: 'law', word: 'tortious', pos: 'adj', ipa: 'ˈtɔːʃəs', cefr: 'C2', def: 'Constituting or relating to a civil wrong (a tort).', ex: 'The claim was framed as tortious interference.', topic: 'Litigation' },
  { id: 'biz:arbitrage', field: 'biz', word: 'arbitrage', pos: 'n', ipa: 'ˈɑːbɪtrɑːʒ', cefr: 'C1', def: 'Profiting from a price difference between two markets.', ex: 'The fund ran a currency arbitrage strategy.', topic: 'Finance' },
  { id: 'biz:unitranche', field: 'biz', word: 'unitranche', pos: 'n', ipa: 'ˈjuːnɪtrɑːnʃ', cefr: 'C2', def: 'A single blended debt facility merging senior and subordinated layers at one rate.', ex: 'A unitranche from a direct lender gave us certainty of funds.', topic: 'Finance' },
  { id: 'biz:fiduciary', field: 'biz', word: 'fiduciary', pos: 'adj', ipa: 'fɪˈdjuːʃəri', cefr: 'C1', def: 'Involving trust, especially a duty to act in another’s interest.', ex: 'Directors owe a fiduciary duty to the company.', topic: 'Governance' },
  { id: 'biz:remuneration', field: 'biz', word: 'remuneration', pos: 'n', ipa: 'rɪˌmjuːnəˈreɪʃn', cefr: 'C1', def: 'Money paid for work or a service.', ex: 'The package included equity on top of cash remuneration.', topic: 'Governance' },
];
