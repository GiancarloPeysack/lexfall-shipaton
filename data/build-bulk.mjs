// Bulk corpus builder. Pulls up to 1000 words + definitions per request from
// Datamuse using spelling patterns (suffixes/prefixes that surface advanced
// Latinate vocabulary), filters by length + frequency (advanced but real),
// and MERGES into data/generated.json (dedup by headword). Fast: ~1 request
// per pattern.  node data/build-bulk.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const POS = { n: 'n', v: 'v', adj: 'adj', adv: 'adv', u: 'n' };

// Patterns chosen to surface C1–C2 register words. `*` = any run of letters.
const SUFFIXES = ['tion','sion','ment','ance','ence','ity','ism','ist','ous','ious','eous','ate','ify','ize','ise','ive','ative','able','ible','ary','ory','ent','ant','ial','ical','ology','graphy','itude','escence','acy','ancy','ency','ude','esque','escent','ward','ish','ness','less','ful','hood','ship','dom','age','ery','ic','al','id','ile','ine','ose','oid','some','wright','monger'];
const PREFIXES = ['circum','contra','counter','extra','hyper','inter','intra','meta','multi','para','poly','pseudo','retro','super','supra','trans','ultra','anti','auto','bio','geo','hydro','macro','micro','mono','neo','omni','proto','semi','syn','tele','thermo','philo','anthropo','chrono','helio','equi','magn','bene','mal','viv','luc','sol','dis','pre','sub','ab','ad','de','ex','in','ob','per','pro'];

async function fetchPattern(sp) {
  const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(sp)}&md=dpf&max=1000`;
  try { const r = await fetch(url); return await r.json(); } catch { return []; }
}

function freqOf(hit) {
  const f = (hit.tags || []).find((t) => t.startsWith('f:'));
  return f ? parseFloat(f.slice(2)) : 0;
}

async function main() {
  const patterns = [...SUFFIXES.map((s) => `*${s}`), ...PREFIXES.map((p) => `${p}*`)];
  const byWord = new Map();
  let req = 0;
  for (const sp of patterns) {
    const hits = await fetchPattern(sp);
    req++;
    for (const h of hits) {
      const w = h.word;
      if (!/^[a-z]{6,16}$/.test(w)) continue;          // single lowercase token, 6–16 chars
      if (!h.defs || !h.defs.length) continue;          // must have a definition
      const freq = freqOf(h);
      if (freq < 0.03 || freq > 20) continue;           // advanced but real (skip ultra-common / ultra-obscure)
      if (byWord.has(w)) continue;
      const [posRaw, ...defParts] = h.defs[0].split('\t');
      const pos = POS[posRaw] || 'n';
      let def = defParts.join(' ').replace(/\s+/g, ' ').trim();
      if (!def) continue;
      def = def.charAt(0).toUpperCase() + def.slice(1);
      if (!/[.!?]$/.test(def)) def += '.';
      byWord.set(w, { id: `gen:${w}`, field: 'gen', word: w, pos, ipa: '', cefr: w.length >= 9 ? 'C2' : 'C1', def, ex: '', topic: 'Advanced English', syn: [], etymology: '' });
    }
    process.stdout.write(`\r${req}/${patterns.length} patterns · ${byWord.size} words`);
  }
  console.log();

  // Merge into existing generated.json (keep existing field-specific entries).
  const __dir = dirname(fileURLToPath(import.meta.url));
  const p = join(__dir, 'generated.json');
  let existing = [];
  try { existing = JSON.parse(await readFile(p, 'utf8')); } catch {}
  const seen = new Set(existing.map((w) => w.word.toLowerCase()));
  let added = 0;
  for (const [w, entry] of byWord) {
    if (seen.has(w)) continue;
    existing.push(entry); seen.add(w); added++;
  }
  await writeFile(p, JSON.stringify(existing, null, 2));
  console.log(`merged: +${added} new words → generated.json now ${existing.length} entries`);
}

main().catch((e) => { console.error(e); process.exit(1); });
