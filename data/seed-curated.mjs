// Uploads hand-curated, full word entries (data/curated/*.json — arrays of
// complete Word objects with real definitions/examples/collocations) to the
// Supabase `words` table. Unlike build-seed.mjs (bare Datamuse defs), these are
// authored for quality. Idempotent upsert by id.
//
//   SUPABASE_SERVICE_KEY=eyJ... node data/seed-curated.mjs
//
import { createClient } from '@supabase/supabase-js';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const env = await readFile(join(root, '.env'), 'utf8').catch(() => '');
const url = process.env.SUPABASE_URL || (env.match(/EXPO_PUBLIC_SUPABASE_URL=(\S+)/) || [])[1];
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) { console.error('Need EXPO_PUBLIC_SUPABASE_URL in .env and SUPABASE_SERVICE_KEY in env.'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const dir = join(__dir, 'curated');
const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json'));
const byId = new Map();
for (const f of files) {
  const list = JSON.parse(await readFile(join(dir, f), 'utf8'));
  for (const w of list) byId.set(w.id, {
    id: w.id, field: w.field, word: w.word, pos: w.pos || 'n', ipa: w.ipa || '',
    cefr: w.cefr || 'C1', def: w.def, ex: w.ex || '', topic: w.topic || 'Advanced English',
    syn: w.syn || [], etymology: w.etymology || '',
  });
}
const rows = [...byId.values()];
console.log(`curated files: ${files.join(', ')} -> ${rows.length} unique entries`);
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await sb.from('words').upsert(rows.slice(i, i + 500), { onConflict: 'id' });
  if (error) { console.error(error); process.exit(1); }
}
console.log(`✓ uploaded ${rows.length} curated words.`);
