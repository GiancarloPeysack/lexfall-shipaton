// Vorto content ETL - run on a machine with network: `node data/build-seed.mjs`
// Reads headword lists in data/sources/*.json, enriches each with a definition +
// part of speech from the free Datamuse API (WordNet/Wiktionary-derived), and
// writes data/generated.json as Word stubs. Example sentences + SME review are
// the next step (LLM-assisted), then merge into words.ts / ship as vorto.sqlite.
//
// See ../../strategy/DATA_PIPELINE.md for the full architecture.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, 'sources');
const OUT = join(__dir, 'generated.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const POS = { n: 'n', v: 'v', adj: 'adj', adv: 'adv', u: 'n' };

async function enrich(word) {
  // md=dp → definitions + parts of speech
  const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=dp&max=1`;
  const res = await fetch(url);
  const [hit] = await res.json();
  if (!hit || !hit.defs?.length) return null;
  const [posRaw, ...defParts] = hit.defs[0].split('\t');
  const pos = POS[posRaw] || 'n';
  const def = defParts.join('\t');
  // rough CEFR heuristic: longer/rarer headwords lean C2
  const cefr = word.length >= 9 ? 'C2' : 'C1';
  return { pos, def: def.charAt(0).toUpperCase() + def.slice(1) + '.', cefr };
}

async function main() {
  const files = (await readdir(SRC)).filter((f) => f.endsWith('.json'));
  const out = [];
  let ok = 0, miss = 0;
  for (const f of files) {
    const { field, topic, words } = JSON.parse(await readFile(join(SRC, f), 'utf8'));
    for (const w of words) {
      const e = await enrich(w);
      await sleep(120); // be polite to the API
      if (!e) { miss++; console.warn('  no data:', w); continue; }
      ok++;
      out.push({
        id: `${field}:${w}`, field, word: w, pos: e.pos, ipa: '', cefr: e.cefr,
        def: e.def, ex: '', topic, syn: [], etymology: '',
      });
    }
    console.log(`${field}: ${words.length} headwords processed`);
  }
  await writeFile(OUT, JSON.stringify(out, null, 2));
  console.log(`\n✓ wrote ${out.length} entries → generated.json  (enriched ${ok}, missing ${miss})`);
  console.log('Next: fill ex/ipa/syn (LLM), SME-review med/law, then merge into words.ts or build vorto.sqlite.');
}

main().catch((e) => { console.error(e); process.exit(1); });
