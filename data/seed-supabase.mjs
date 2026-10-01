// One-time (and repeatable) uploader: pushes the generated corpus to the
// Supabase `words` table so it can grow server-side. Curated words ship in the
// app bundle; this uploads the machine-generated breadth + any future batches.
//
// 1) Run supabase/words.sql in the Supabase SQL editor first.
// 2) Grab your service_role key (Project Settings → API → service_role, secret).
// 3) SUPABASE_SERVICE_KEY=eyJ... node data/seed-supabase.mjs
//    (the Supabase URL is read from .env automatically)

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

// read EXPO_PUBLIC_SUPABASE_URL from .env
const env = await readFile(join(root, '.env'), 'utf8').catch(() => '');
const urlMatch = env.match(/EXPO_PUBLIC_SUPABASE_URL=(\S+)/);
const url = process.env.SUPABASE_URL || (urlMatch && urlMatch[1]);
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('Missing config. Need EXPO_PUBLIC_SUPABASE_URL in .env and SUPABASE_SERVICE_KEY in the environment.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const raw = JSON.parse(await readFile(join(__dir, 'generated.json'), 'utf8')).map((w) => ({
  id: w.id, field: w.field, word: w.word, pos: w.pos, ipa: w.ipa || '', cefr: w.cefr || 'C1',
  def: w.def, ex: w.ex || '', topic: w.topic || 'Advanced English',
  syn: w.syn || [], etymology: w.etymology || '',
}));
// Dedupe by id (generated.json can contain duplicate ids; upsert can't touch the
// same id twice in one command). Last occurrence wins.
const byId = new Map();
for (const w of raw) byId.set(w.id, w);
const rows = [...byId.values()];
console.log(`${raw.length} rows -> ${rows.length} unique ids (${raw.length - rows.length} dupes removed)`);

for (let i = 0; i < rows.length; i += 500) {
  const chunk = rows.slice(i, i + 500);
  const { error } = await sb.from('words').upsert(chunk, { onConflict: 'id' });
  if (error) { console.error(error); process.exit(1); }
  console.log(`upserted ${Math.min(i + 500, rows.length)}/${rows.length}`);
}
console.log(`\n✓ uploaded ${rows.length} words. Clients will pull them on next launch.`);
