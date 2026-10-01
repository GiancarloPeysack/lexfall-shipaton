import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SEED } from '../data/words';
import { FieldId, Word, inField } from '../data/types';
import { domainForTopic, domainById } from '../data/domains';
import { HOOK_IDS } from './hooks';
import { loadTaste, hasSignal, scoreWord } from './taste';
import { rankByRarity, rarityBonus, excludeGradedBasic, WordPref } from '../data/word-levels';

// On-device lexicon. In production a prebuilt vorto.sqlite ships as an asset and
// is delta-updated from the content API; here we lazily seed from SEED on first run.
let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  const db = await SQLite.openDatabaseAsync('vorto-v4.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS words (
      id TEXT PRIMARY KEY,
      field TEXT NOT NULL,
      word TEXT NOT NULL,
      pos TEXT, ipa TEXT, cefr TEXT,
      def TEXT NOT NULL,
      ex TEXT NOT NULL,
      topic TEXT NOT NULL,
      syn TEXT, etymology TEXT
    );
    CREATE TABLE IF NOT EXISTS saved (
      word_id TEXT PRIMARY KEY,
      collection TEXT NOT NULL DEFAULT 'Want to learn',
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collections (
      name TEXT PRIMARY KEY,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS progress (
      day TEXT PRIMARY KEY,
      learned INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS own_words (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      pos TEXT,
      def TEXT NOT NULL,
      ex TEXT,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS liked (
      word_id TEXT PRIMARY KEY,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_words_field ON words(field);
    CREATE VIRTUAL TABLE IF NOT EXISTS words_fts USING fts5(
      word, def, ex, content='words', content_rowid='rowid'
    );
    CREATE TABLE IF NOT EXISTS review (
      word_id TEXT PRIMARY KEY,
      due INTEGER NOT NULL,        -- epoch ms
      interval REAL NOT NULL DEFAULT 0,   -- days
      ease REAL NOT NULL DEFAULT 2.5,
      reps INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id TEXT NOT NULL,
      correct INTEGER NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_attempts_word ON attempts(word_id, ts);
    CREATE TABLE IF NOT EXISTS skill (
      dim TEXT NOT NULL,          -- 'field' | 'topic' | 'cefr' | 'overall'
      key TEXT NOT NULL,          -- e.g. 'med' | 'Cardiology' | 'C1' | 'all'
      correct INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      score REAL NOT NULL DEFAULT 0,   -- rolling accuracy 0-100
      updated INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (dim, key)
    );
  `);
  // Ensure the default collection always exists.
  try { await db.runAsync("INSERT OR IGNORE INTO collections (name, created) VALUES ('Want to learn', ?)", [Date.now()]); } catch {}
  try { await seedIfEmpty(db); } catch { /* queries fall back to the in-memory SEED */ }
  try { await refreshContentIfStale(db); } catch { /* keep existing content */ }
  _db = db;
  return db;
}

// Bump when bundled word CONTENT changes (upgraded definitions, examples, new
// batches) so improvements reach existing installs. UPSERT updates each row in
// place (rowid preserved => feed order + FTS stay intact) and never touches the
// user's saved/liked/progress/review tables.
const CONTENT_VERSION = '21';
async function refreshContentIfStale(db: SQLite.SQLiteDatabase) {
  const cur = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'contentVersion'");
  if (cur?.value === CONTENT_VERSION) return;
  await bulkUpsert(db, SEED, true);
  await recleanDefs(db);
  // v8: purge the old ~19k scraped junk (empty examples) from existing installs so the
  // feed AND search are curated-only. Quality words (bundled or synced) all have an
  // example and survive; the FTS JOIN safely ignores any orphaned index rows.
  try { await db.runAsync("DELETE FROM words WHERE ex IS NULL OR TRIM(ex) = ''"); } catch { /* best-effort cleanup */ }
  // v13: purge stale GENERAL/new junk left on old-version devices (the ~19k scrape,
  // e.g. abominate/beatify with wrong or auto-filled examples) — any gen/new word not
  // in the curated bundle. Professional fields (med/law/biz) sync clean from the backend.
  try {
    const keep = new Set(SEED.filter((w) => w.field === 'gen' || w.field === 'new').map((w) => w.id));
    const rows = await db.getAllAsync<{ id: string }>("SELECT id FROM words WHERE field IN ('gen','new')");
    const junk = rows.map((r) => r.id).filter((id) => !keep.has(id));
    for (let i = 0; i < junk.length; i += 400) {
      const batch = junk.slice(i, i + 400);
      await db.runAsync(`DELETE FROM words WHERE id IN (${batch.map(() => '?').join(',')})`, batch);
    }
  } catch { /* best-effort */ }
  await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('contentVersion', ?)", [CONTENT_VERSION]);
}

// Definitions must read as one crisp sentence on the card - never a paragraph
// block. Cross-reference defs ("Alternative form of X. [(pathology) A bony...]")
// swap in the real definition from the brackets; register tags "(pathology)"
// are stripped; length is capped at a clause boundary (no "..." truncation).
export function cleanDef(raw: string): string {
  let d = (raw || '').trim();
  const bracket = d.match(/\[([^\[\]]+)\]\s*\.?\s*$/);
  if (bracket) {
    const before = d.slice(0, d.indexOf('[')).trim();
    if (before.length < 90 && /\b(spelling|form|variant|misspelling|abbreviation|plural|inflection|synonym|obsolete (form|spelling))\s+of\b/i.test(before)) {
      d = bracket[1].trim();
    } else {
      d = before; // drop the bracketed tail either way
    }
  }
  d = d.replace(/^(\(\s*[^()]{1,36}\s*\)[\s,;:]*)+/, '').trim();
  const sentences = d.match(/[^.!?]+[.!?]+/g) || [d];
  let out = (sentences[0] || d).trim();
  if (out.length < 55 && sentences[1] && out.length + sentences[1].length <= 150) out += ' ' + sentences[1].trim();
  if (out.length > 170) {
    const cut = out.slice(0, 170);
    const stop = Math.max(cut.lastIndexOf(';'), cut.lastIndexOf(','), cut.lastIndexOf(' '));
    out = cut.slice(0, stop > 80 ? stop : 170).replace(/[\s,;:]+$/, '') + '.';
  }
  out = out.charAt(0).toUpperCase() + out.slice(1);
  if (!/[.!?]$/.test(out)) out += '.';
  return out;
}

// One-time sweep over rows that predate the cleaner (remote-synced words the
// seed upsert never touches). Only rewrites rows that actually change.
async function recleanDefs(db: SQLite.SQLiteDatabase) {
  const rows = await db.getAllAsync<{ id: string; def: string }>(
    "SELECT id, def FROM words WHERE def LIKE '%[%' OR def LIKE '(%' OR length(def) > 170"
  );
  if (!rows.length) return;
  await db.withTransactionAsync(async () => {
    for (const r of rows) {
      const c = cleanDef(r.def);
      if (c !== r.def) await db.runAsync('UPDATE words SET def = ? WHERE id = ?', [c, r.id]);
    }
  });
}

// Merge words pulled from the backend (Supabase) into local SQLite. INSERT OR
// IGNORE keeps user tables untouched; returns the max `seq` seen for cursoring.
// This is how the corpus grows server-side without shipping an app update.
export async function upsertWordsFromRemote(rows: any[]): Promise<number> {
  if (!rows || !rows.length) return 0;
  const db = await getDb();
  let maxSeq = 0;
  await db.withTransactionAsync(async () => {
    for (const w of rows) {
      await db.runAsync(
        'INSERT OR IGNORE INTO words (id, field, word, pos, ipa, cefr, def, ex, topic, syn, etymology) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [w.id, w.field ?? 'gen', w.word, w.pos ?? 'n', w.ipa ?? '', w.cefr ?? 'C1', cleanDef(w.def), w.ex ?? '', w.topic ?? 'Advanced English',
         w.syn ? (typeof w.syn === 'string' ? w.syn : JSON.stringify(w.syn)) : null, w.etymology ?? null]
      );
      if (typeof w.seq === 'number' && w.seq > maxSeq) maxSeq = w.seq;
    }
    await db.execAsync(`INSERT INTO words_fts(words_fts) VALUES('rebuild')`);
  });
  return maxSeq;
}

// Idempotently sync the shipped word list into the DB on every launch.
// INSERT OR IGNORE = new words appear as content grows, without touching the
// user's saved/liked/review/progress tables or existing rows.
// Chunked bulk upsert - one INSERT per ~80 rows (SQLite's 999-param cap) so a
// 19k-word seed is a few hundred statements, not 19k round-trips.
async function bulkUpsert(db: SQLite.SQLiteDatabase, rows: Word[], updateContent: boolean) {
  const CHUNK = 80;
  const tail = updateContent
    ? ' ON CONFLICT(id) DO UPDATE SET def=excluded.def, ex=excluded.ex, pos=excluded.pos, ipa=excluded.ipa, cefr=excluded.cefr, topic=excluded.topic, syn=excluded.syn, etymology=excluded.etymology'
    : ' ON CONFLICT(id) DO NOTHING';
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const ph = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',');
      const params: any[] = [];
      for (const w of chunk) params.push(w.id, w.field, w.word, w.pos, w.ipa, w.cefr, cleanDef(w.def), w.ex, w.topic, w.syn ? JSON.stringify(w.syn) : null, w.etymology ?? null);
      await db.runAsync(`INSERT INTO words (id, field, word, pos, ipa, cefr, def, ex, topic, syn, etymology) VALUES ${ph}${tail}`, params);
    }
    await db.execAsync(`INSERT INTO words_fts(words_fts) VALUES('rebuild')`);
  });
}

async function seedIfEmpty(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM words');
  if (row && row.n >= SEED.length) return; // already fully seeded - skip the full pass
  await bulkUpsert(db, SEED, false);
  // A fresh full seed already carries current content, so mark it and let the
  // content-refresh pass skip (avoids a second 19k-row sweep on the same launch).
  await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('contentVersion', ?)", [CONTENT_VERSION]);
}

type Row = Omit<Word, 'syn'> & { syn: string | null };
const mapRow = (r: Row): Word => ({ ...r, syn: r.syn ? JSON.parse(r.syn) : undefined });

// SQL twin of data/types.ts `inField`: General ('gen') shows ONLY general words
// (no med/law/biz jargon, no 'new' slang); a professional field shows its own
// words PLUS general ones for volume. Bind the field param TWICE.
const FIELD_MATCH = "(field = ? OR (? NOT IN ('gen','new') AND field = 'gen'))";

// For General C1–C2 the seed is stored field-by-field (all medicine, then law,
// then business, then general), which makes the feed/areas open with a wall of
// medicine. Round-robin across fields - leading with General - so it feels mixed.
const FIELD_ORDER: FieldId[] = ['gen', 'med', 'law', 'biz'];
function interleaveByField<T>(items: T[], getField: (t: T) => FieldId): T[] {
  const buckets = new Map<FieldId, T[]>();
  for (const it of items) {
    const f = getField(it);
    if (!buckets.has(f)) buckets.set(f, []);
    buckets.get(f)!.push(it);
  }
  const lists = FIELD_ORDER.map((f) => buckets.get(f) || []).filter((l) => l.length);
  const out: T[] = [];
  for (let i = 0; ; i++) {
    let added = false;
    for (const l of lists) if (i < l.length) { out.push(l[i]); added = true; }
    if (!added) break;
  }
  return out;
}

export async function getWordsByField(field: FieldId): Promise<Word[]> {
  try {
    const db = await getDb();
    // Natural (curated) order - the app is C2-level by design, so we organise by
    // category/insertion order rather than forcing hard words to the top.
    const rows = await db.getAllAsync<Row>(`SELECT * FROM words WHERE ${FIELD_MATCH} ORDER BY rowid`, [field, field]);
    if (rows.length) { const m = rows.map(mapRow); return field === 'gen' ? interleaveByField(m, (w) => w.field) : m; }
  } catch { /* fall through */ }
  const seeded = SEED.filter((w) => inField(w.field, field));
  return field === 'gen' ? interleaveByField(seeded, (w) => w.field) : seeded;
}

export async function getWordById(id: string): Promise<Word | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Row>('SELECT * FROM words WHERE id = ?', [id]);
  return r ? mapRow(r) : null;
}

// ── Saved words (favorites / collections) ──
export async function isSaved(wordId: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM saved WHERE word_id = ?', [wordId]);
  return !!r && r.n > 0;
}
export async function toggleSaved(wordId: string): Promise<boolean> {
  const db = await getDb();
  if (await isSaved(wordId)) {
    await db.runAsync('DELETE FROM saved WHERE word_id = ?', [wordId]);
    return false;
  }
  await setWordCollection(wordId, 'Want to learn');
  return true;
}
export async function getSavedWords(collection?: string): Promise<Word[]> {
  const db = await getDb();
  const rows = collection
    ? await db.getAllAsync<Row>('SELECT w.* FROM words w JOIN saved s ON s.word_id = w.id WHERE s.collection = ? ORDER BY s.created DESC', [collection])
    : await db.getAllAsync<Row>('SELECT w.* FROM words w JOIN saved s ON s.word_id = w.id ORDER BY s.created DESC', []);
  return rows.map(mapRow);
}

// ── Collections ──
export interface Collection { name: string; count: number; }
export async function getCollections(): Promise<Collection[]> {
  const db = await getDb();
  return db.getAllAsync<Collection>(
    `SELECT c.name AS name, COUNT(s.word_id) AS count
       FROM collections c LEFT JOIN saved s ON s.collection = c.name
      GROUP BY c.name ORDER BY c.created ASC`, []
  );
}
export async function createCollection(name: string) {
  const db = await getDb();
  const n = name.trim();
  if (!n) return;
  await db.runAsync('INSERT OR IGNORE INTO collections (name, created) VALUES (?, ?)', [n, Date.now()]);
}
export async function deleteCollection(name: string) {
  const db = await getDb();
  if (name === 'Want to learn') return; // keep the default
  await db.runAsync('DELETE FROM saved WHERE collection = ?', [name]);
  await db.runAsync('DELETE FROM collections WHERE name = ?', [name]);
}
export async function getWordCollection(wordId: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ collection: string }>('SELECT collection FROM saved WHERE word_id = ?', [wordId]);
  return r?.collection ?? null;
}
// Save a word into a collection (creating it if needed). Used by the Collections sheet.
export async function setWordCollection(wordId: string, collection: string) {
  const db = await getDb();
  await createCollection(collection);
  await db.runAsync('INSERT OR REPLACE INTO saved (word_id, collection, created) VALUES (?,?,?)', [wordId, collection, Date.now()]);
}
export async function unsaveWord(wordId: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM saved WHERE word_id = ?', [wordId]);
}
export async function getSavedIds(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ word_id: string }>('SELECT word_id FROM saved', []);
  return new Set(rows.map((r) => r.word_id));
}

// ── Liked (trains the feed; separate from Saved) ──
export async function isLiked(wordId: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM liked WHERE word_id = ?', [wordId]);
  return !!r && r.n > 0;
}
export async function toggleLiked(wordId: string): Promise<boolean> {
  const db = await getDb();
  if (await isLiked(wordId)) { await db.runAsync('DELETE FROM liked WHERE word_id = ?', [wordId]); return false; }
  await db.runAsync('INSERT OR REPLACE INTO liked (word_id, created) VALUES (?,?)', [wordId, Date.now()]);
  return true;
}
export async function getLikedWords(): Promise<Word[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>('SELECT w.* FROM words w JOIN liked l ON l.word_id = w.id ORDER BY l.created DESC');
    return rows.map(mapRow);
  } catch { return []; }
}
export async function getLikedCount(): Promise<number> {
  try {
    const db = await getDb();
    const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM liked');
    return r?.n ?? 0;
  } catch { return 0; }
}

// Words in a field + topic (for Explore area browsing).
export async function getWordsByTopic(field: FieldId, topic: string): Promise<Word[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>(`SELECT * FROM words WHERE ${FIELD_MATCH} AND topic = ? ORDER BY rowid`, [field, field, topic]);
    if (rows.length) return rows.map(mapRow);
  } catch { /* fall through */ }
  return SEED.filter((w) => inField(w.field, field) && w.topic === topic);
}

// Words across a set of raw topic strings (a "domain" or an exam wordlist spans several).
export async function getWordsByDomain(field: FieldId, topics: string[]): Promise<Word[]> {
  if (!topics.length) return [];
  try {
    const db = await getDb();
    const ph = topics.map(() => '?').join(',');
    const rows = await db.getAllAsync<Row>(`SELECT * FROM words WHERE ${FIELD_MATCH} AND topic IN (${ph}) ORDER BY rowid`, [field, field, ...topics]);
    if (rows.length) return rows.map(mapRow);
  } catch { /* fall through */ }
  const set = new Set(topics);
  return SEED.filter((w) => inField(w.field, field) && set.has(w.topic));
}

// ── Browse-by facets (adapts the original's grouped taxonomy to our data) ──
export interface Facet { value: string; label: string; count: number; }

const POS_LABEL: Record<string, string> = { n: 'Nouns', v: 'Verbs', adj: 'Adjectives', adv: 'Adverbs' };
const ORIGINS: { label: string; patterns: string[] }[] = [
  { label: 'Latin', patterns: ['Latin'] },
  { label: 'Greek', patterns: ['Greek'] },
  { label: 'French', patterns: ['French'] },
  { label: 'Germanic', patterns: ['Old English', 'Norse', 'German'] },
];

export async function getPosFacets(field: FieldId): Promise<Facet[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ pos: string; count: number }>(`SELECT pos, COUNT(*) AS count FROM words WHERE ${FIELD_MATCH} GROUP BY pos ORDER BY count DESC`, [field, field]);
    if (rows.length) return rows.map((r) => ({ value: r.pos, label: POS_LABEL[r.pos] ?? r.pos, count: r.count }));
  } catch { /* fall through */ }
  const m: Record<string, number> = {};
  SEED.filter((w) => inField(w.field, field)).forEach((w) => { m[w.pos] = (m[w.pos] || 0) + 1; });
  return Object.entries(m).map(([value, count]) => ({ value, label: POS_LABEL[value] ?? value, count }));
}

export async function getLevelFacets(field: FieldId): Promise<Facet[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ cefr: string; count: number }>(`SELECT cefr, COUNT(*) AS count FROM words WHERE ${FIELD_MATCH} GROUP BY cefr ORDER BY cefr`, [field, field]);
    if (rows.length) return rows.map((r) => ({ value: r.cefr, label: r.cefr, count: r.count }));
  } catch { /* fall through */ }
  const m: Record<string, number> = {};
  SEED.filter((w) => inField(w.field, field)).forEach((w) => { m[w.cefr] = (m[w.cefr] || 0) + 1; });
  return Object.entries(m).map(([value, count]) => ({ value, label: value, count }));
}

export async function getOriginFacets(field: FieldId): Promise<Facet[]> {
  const out: Facet[] = [];
  try {
    const db = await getDb();
    for (const o of ORIGINS) {
      const like = o.patterns.map(() => 'etymology LIKE ?').join(' OR ');
      const params: any[] = [field, field, ...o.patterns.map((p) => `%${p}%`)];
      const r = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM words WHERE ${FIELD_MATCH} AND (${like})`, params);
      if (r && r.count > 0) out.push({ value: o.label, label: o.label, count: r.count });
    }
    if (out.length) return out;
  } catch { /* fall through */ }
  for (const o of ORIGINS) {
    const count = SEED.filter((w) => inField(w.field, field) && o.patterns.some((p) => (w.etymology || '').includes(p))).length;
    if (count > 0) out.push({ value: o.label, label: o.label, count });
  }
  return out;
}

export async function getWordsByPos(field: FieldId, pos: string): Promise<Word[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>(`SELECT * FROM words WHERE ${FIELD_MATCH} AND pos = ? ORDER BY rowid`, [field, field, pos]);
    if (rows.length) return rows.map(mapRow);
  } catch { /* fall through */ }
  return SEED.filter((w) => inField(w.field, field) && w.pos === pos);
}

export async function getWordsByLevel(field: FieldId, level: string): Promise<Word[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>(`SELECT * FROM words WHERE ${FIELD_MATCH} AND cefr = ? ORDER BY rowid`, [field, field, level]);
    if (rows.length) return rows.map(mapRow);
  } catch { /* fall through */ }
  return SEED.filter((w) => inField(w.field, field) && w.cefr === level);
}

// ── Practice history & mistakes (FOR YOU) ──
export async function recordAttempt(wordId: string, correct: boolean) {
  const db = await getDb();
  await db.runAsync('INSERT INTO attempts (word_id, correct, ts) VALUES (?,?,?)', [wordId, correct ? 1 : 0, Date.now()]);
}

// Multi-dimensional level tracking: every answer updates a rolling accuracy for the
// word's profession (field), category (topic), CEFR band, and an overall row — so we
// can show "your Medicine level: C1", "Cardiology: needs work", etc. per exam-prep.
export async function recordSkill(word: Word, correct: boolean) {
  const db = await getDb();
  const now = Date.now();
  const inc = correct ? 1 : 0;
  const dims: [string, string | undefined][] = [
    ['field', word.field], ['topic', word.topic], ['cefr', word.cefr], ['overall', 'all'],
    // Roll the word up to its domain (nursing, litigation…) so "Where you stand" can
    // score per profession/area, not just per raw topic. Additive dim; no migration.
    ['domain', domainForTopic(word.field, word.topic)?.id],
  ];
  for (const [dim, key] of dims) {
    if (!key) continue;
    await db.runAsync(
      `INSERT INTO skill (dim, key, correct, total, score, updated) VALUES (?,?,?,1,?,?)
       ON CONFLICT(dim, key) DO UPDATE SET
         correct = correct + ?,
         total = total + 1,
         score = (CAST(correct + ? AS REAL) / (total + 1)) * 100,
         updated = ?`,
      [dim, key, inc, correct ? 100 : 0, now, inc, inc, now]
    );
  }
}

export type SkillRow = { key: string; correct: number; total: number; score: number };
// Per-dimension breakdown (only rows with attempts), strongest coverage first.
export async function getSkillBreakdown(dim: string): Promise<SkillRow[]> {
  const db = await getDb();
  return db.getAllAsync<SkillRow>(
    'SELECT key, correct, total, score FROM skill WHERE dim = ? AND total > 0 ORDER BY total DESC, score DESC',
    [dim]
  );
}
// Map a rolling accuracy to a CEFR-ish band (matches the placement-test thresholds).
export function scoreToLevel(score: number): string {
  return score >= 80 ? 'C2' : score >= 55 ? 'C1' : 'B2';
}

// #66: only General/IELTS report a CEFR level. Professional tracks report a field-scoped BAND
// instead — TOLES isn't CEFR-aligned, OET grades A-E, and a specialist-vocab score partly
// reflects domain training, so it must not be presented as a language level (EVP splits
// General from Academic at C1/C2 for the same reason). Same accuracy thresholds, honest label.
export const isCefrField = (f: FieldId) => f === 'gen' || f === 'new';
export const FIELD_READ_LABEL: Partial<Record<FieldId, string>> = {
  med: 'medical-English', law: 'legal-English', biz: 'business-English',
};
export function scoreToBand(score: number): string {
  return score >= 80 ? 'Strong' : score >= 55 ? 'Solid' : 'Building';
}
export function cefrToBand(cefr: string): string {
  return cefr === 'C2' ? 'Strong' : cefr === 'C1' ? 'Solid' : 'Building';
}

// Per-DOMAIN proficiency for the "Where you stand" screen. Below `minSample` attempts we
// return level=null ("not enough data yet") rather than a misleading score.
export type DomainProficiency = { id: string; name: string; section: string; field: FieldId; correct: number; total: number; score: number; level: string | null };
export async function getDomainProficiency(field?: FieldId, minSample = 8): Promise<DomainProficiency[]> {
  const rows = await getSkillBreakdown('domain'); // key = domain id
  const out: DomainProficiency[] = [];
  for (const r of rows) {
    const d = domainById(r.key);
    if (!d || (field && d.field !== field)) continue;
    out.push({ id: d.id, name: d.name, section: d.section, field: d.field, correct: r.correct, total: r.total, score: r.score, level: r.total >= minSample ? scoreToLevel(r.score) : null });
  }
  return out;
}

// ── Cross-device user-data sync helpers (see lib/user-sync.ts) ──
// Read local user state for PUSH to Supabase.
export type LocalSaved = { word_id: string; collection: string; created: number };
export async function getLocalSaved(): Promise<LocalSaved[]> {
  const db = await getDb();
  return db.getAllAsync<LocalSaved>('SELECT word_id, collection, created FROM saved');
}
export type LocalReview = { word_id: string; due: number; interval: number; ease: number; reps: number; lapses: number };
export async function getLocalReview(): Promise<LocalReview[]> {
  const db = await getDb();
  return db.getAllAsync<LocalReview>('SELECT word_id, due, interval, ease, reps, lapses FROM review');
}
export type LocalProgress = { day: string; learned: number };
export async function getLocalProgress(): Promise<LocalProgress[]> {
  const db = await getDb();
  return db.getAllAsync<LocalProgress>('SELECT day, learned FROM progress');
}
// Merge remote rows into local on PULL — additive / max, so local progress is never lost.
export async function mergeSaved(rows: { word_id: string; collection?: string; created_at?: string }[]) {
  const db = await getDb();
  for (const r of rows) {
    await db.runAsync('INSERT OR IGNORE INTO saved (word_id, collection, created) VALUES (?,?,?)',
      [r.word_id, r.collection || 'Want to learn', r.created_at ? Date.parse(r.created_at) : Date.now()]);
  }
}
export async function mergeReview(rows: { word_id: string; due?: string; stability?: number; difficulty?: number; reps?: number; lapses?: number }[]) {
  const db = await getDb();
  for (const r of rows) {
    // Keep whichever has more reps (more practised) — never regress local SRS.
    const cur = await db.getFirstAsync<{ reps: number }>('SELECT reps FROM review WHERE word_id = ?', [r.word_id]);
    if (cur && cur.reps >= (r.reps ?? 0)) continue;
    await db.runAsync(
      `INSERT INTO review (word_id, due, interval, ease, reps, lapses) VALUES (?,?,?,?,?,?)
       ON CONFLICT(word_id) DO UPDATE SET due=excluded.due, interval=excluded.interval, ease=excluded.ease, reps=excluded.reps, lapses=excluded.lapses`,
      [r.word_id, r.due ? Date.parse(r.due) : Date.now(), r.stability ?? 0, r.difficulty ?? 2.5, r.reps ?? 0, r.lapses ?? 0]);
  }
}
export async function mergeProgress(rows: { day: string; learned?: number }[]) {
  const db = await getDb();
  for (const r of rows) {
    await db.runAsync(
      `INSERT INTO progress (day, learned) VALUES (?,?)
       ON CONFLICT(day) DO UPDATE SET learned = MAX(learned, excluded.learned)`,
      [r.day, r.learned ?? 0]);
  }
}
// Recently practiced distinct words, most recent first.
export async function getHistory(limit = 60): Promise<Word[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    `SELECT w.* FROM words w
       JOIN (SELECT word_id, MAX(ts) AS mts FROM attempts GROUP BY word_id) h ON h.word_id = w.id
      ORDER BY h.mts DESC LIMIT ?`, [limit]
  );
  return rows.map(mapRow);
}
// Words whose most recent attempt was wrong (unresolved mistakes).
export async function getMistakes(limit = 60): Promise<Word[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    `SELECT w.* FROM words w
       JOIN (SELECT word_id, MAX(ts) AS mts FROM attempts GROUP BY word_id) last ON last.word_id = w.id
       JOIN attempts a ON a.word_id = w.id AND a.ts = last.mts
      WHERE a.correct = 0
      ORDER BY last.mts DESC LIMIT ?`, [limit]
  );
  return rows.map(mapRow);
}
export async function getPracticeCount(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM attempts', []);
  return r?.n ?? 0;
}
export async function getSavedCount(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM saved', []);
  return r?.n ?? 0;
}
export async function getMistakeCount(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM words w
       JOIN (SELECT word_id, MAX(ts) AS mts FROM attempts GROUP BY word_id) last ON last.word_id = w.id
       JOIN attempts a ON a.word_id = w.id AND a.ts = last.mts
      WHERE a.correct = 0`, []
  );
  return r?.n ?? 0;
}

// Distinct words that flipped wrong->right within the window: for each recent correct attempt,
// check whether the attempt immediately before it (for that same word) was wrong. This is the
// "mistakes resolved" signal getMistakes()/getMistakeCount() can't give on their own - they only
// ever describe the CURRENT outstanding set (a word silently vanishes from it the moment it's
// answered right again, with no record that it was ever a mistake). No schema change - it's a
// self-join over the existing append-only `attempts` log. Gives Practice's "Your mistakes" card a
// real over-time progress number instead of a bare restatement of the outstanding count.
export async function getResolvedMistakeCount(days = 7): Promise<number> {
  const db = await getDb();
  const since = Date.now() - days * 86_400_000;
  const r = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(DISTINCT a.word_id) AS n
       FROM attempts a
      WHERE a.correct = 1 AND a.ts >= ?
        AND EXISTS (
          SELECT 1 FROM attempts p
           WHERE p.word_id = a.word_id AND p.correct = 0
             AND p.ts = (SELECT MAX(ts) FROM attempts q WHERE q.word_id = a.word_id AND q.ts < a.ts)
        )`, [since]
  );
  return r?.n ?? 0;
}

export async function getWordsByOrigin(field: FieldId, origin: string): Promise<Word[]> {
  const o = ORIGINS.find((x) => x.label === origin);
  const patterns = o ? o.patterns : [origin];
  try {
    const db = await getDb();
    const like = patterns.map(() => 'etymology LIKE ?').join(' OR ');
    const params: any[] = [field, field, ...patterns.map((p) => `%${p}%`)];
    const rows = await db.getAllAsync<Row>(`SELECT * FROM words WHERE ${FIELD_MATCH} AND (${like}) ORDER BY rowid`, params);
    if (rows.length) return rows.map(mapRow);
  } catch { /* fall through */ }
  return SEED.filter((w) => inField(w.field, field) && patterns.some((p) => (w.etymology || '').includes(p)));
}

// ── Daily progress & streak ──
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

export async function recordLearned(n = 1) {
  const db = await getDb();
  const k = dayKey();
  await db.runAsync(
    'INSERT INTO progress (day, learned) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET learned = learned + ?',
    [k, n, n]
  );
}
export async function getTodayLearned(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ learned: number }>('SELECT learned FROM progress WHERE day = ?', [dayKey()]);
  return r?.learned ?? 0;
}
// Words SAVED today (the feed's top tracker counts saves, not words viewed).
export async function getTodaySaved(): Promise<number> {
  const db = await getDb();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const r = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM saved WHERE created >= ?', [start.getTime()]);
  return r?.c ?? 0;
}
export async function getStreak(): Promise<number> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ day: string }>('SELECT day FROM progress WHERE learned > 0 ORDER BY day DESC', []);
  const days = new Set(rows.map((r) => r.day));
  let streak = 0;
  const cur = new Date();
  // allow today to be incomplete: start counting from today if present, else yesterday
  if (!days.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
  while (days.has(dayKey(cur))) { streak++; cur.setDate(cur.getDate() - 1); }
  return streak;
}
export async function getActiveDays(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ day: string }>('SELECT day FROM progress WHERE learned > 0', []);
  return new Set(rows.map((r) => r.day));
}
export async function getWordsLearnedTotal(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ t: number }>('SELECT COALESCE(SUM(learned),0) AS t FROM progress', []);
  return r?.t ?? 0;
}

// A word is "mastered" once its SRS interval matures — it has genuinely stuck. 21 days is the
// standard SRS "mature card" threshold. This is the currency the Journey/plan levels count.
export const MASTERY_INTERVAL_DAYS = 21;
export async function getMasteredCount(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM review WHERE interval >= ?', [MASTERY_INTERVAL_DAYS]);
  return r?.n ?? 0;
}

// The Journey/plan currency: words the user can genuinely RECALL (answered correctly at least
// twice), not just seen once. Grows from daily-test/practice within days, so the leveled path
// feels alive from the start — unlike the stricter 21-day "mastered" stat above.
export async function getWordsKnownCount(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM review WHERE reps >= 2', []);
  return r?.n ?? 0;
}

// ── Your own words ──
export interface OwnWord { id: string; word: string; pos: string; def: string; ex: string; created: number; }
export async function addOwnWord(w: { word: string; pos: string; def: string; ex: string }) {
  const db = await getDb();
  const id = 'own:' + w.word.toLowerCase().replace(/\s+/g, '-') + ':' + Date.now();
  await db.runAsync('INSERT INTO own_words (id, word, pos, def, ex, created) VALUES (?,?,?,?,?,?)',
    [id, w.word.trim(), w.pos, w.def.trim(), w.ex.trim(), Date.now()]);
}
export async function getOwnWords(): Promise<OwnWord[]> {
  const db = await getDb();
  return db.getAllAsync<OwnWord>('SELECT * FROM own_words ORDER BY created DESC', []);
}
export async function deleteOwnWord(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM own_words WHERE id = ?', [id]);
}

// Wipe all on-device user data (used by account deletion / reset).
export async function clearLocalData() {
  const db = await getDb();
  await db.execAsync("DELETE FROM saved; DELETE FROM progress; DELETE FROM review; DELETE FROM own_words; DELETE FROM attempts; DELETE FROM collections WHERE name <> 'Want to learn';");
  // Daily-test state lives in AsyncStorage, not SQLite. The presented-words ledger
  // (vorto.presentedIds, lib/presented.ts — plus its legacy vorto.dailyTaughtIds key, still
  // OR-read for migration) especially MUST be wiped here or a "fresh" account would silently
  // skip every word the old account was ever taught or ever dwelled on in the feed. The day
  // state, streak and advancement counter go with it — the delete-account copy promises streak
  // and progress are erased.
  await AsyncStorage.multiRemove([
    'vorto.presentedIds', 'vorto.dailyTaughtIds', 'vorto.dailyTest', 'vorto.dailyTestStreak', 'vorto.dailyTestMastered',
  ]).catch(() => {});
}

export async function getTopics(field: FieldId): Promise<{ topic: string; examples: string }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ topic: string; examples: string; field: FieldId }>(
    `SELECT topic, MIN(field) AS field, group_concat(word, ' · ') AS examples
       FROM words WHERE ${FIELD_MATCH} GROUP BY topic ORDER BY MIN(rowid)`,
    [field, field]
  );
  const ordered = field === 'gen' ? interleaveByField(rows, (r) => r.field) : rows;
  return ordered.map(({ topic, examples }) => ({ topic, examples }));
}

export interface ReviewRow { word_id: string; due: number; interval: number; ease: number; reps: number; lapses: number; }

export async function getReview(wordId: string): Promise<ReviewRow | null> {
  const db = await getDb();
  return (await db.getFirstAsync<ReviewRow>('SELECT * FROM review WHERE word_id = ?', [wordId])) ?? null;
}

export async function upsertReview(r: ReviewRow) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO review (word_id, due, interval, ease, reps, lapses) VALUES (?,?,?,?,?,?)`,
    [r.word_id, r.due, r.interval, r.ease, r.reps, r.lapses]
  );
}

// Words due for review in a field, oldest-due first; falls back to unseen words.
// Bug fix: the ORDER BY used to put every never-seen word ahead of anything
// actually due (and broke ties by rowid), so repeated calls returned the exact
// same ~`limit` never-seen words every time instead of rotating - genuinely
// due words never surfaced, and the unseen "filler" never varied. Now due
// words (real due <= now) come first oldest-first, not-yet-due words are
// excluded entirely (reviewing early defeats spaced repetition), and ties
// within the unseen tier are randomized so repeated sessions see different
// words instead of the same fixed slice.
export async function getDueWords(field: FieldId, limit = 10): Promise<Word[]> {
  const db = await getDb();
  const now = Date.now();
  try {
    const rows = await db.getAllAsync<Row>(
      `SELECT w.* FROM words w
         LEFT JOIN review r ON r.word_id = w.id
        WHERE (w.field = ? OR (? = 'gen' AND w.field <> 'new'))
          AND (r.due IS NULL OR r.due <= ?)
        ORDER BY (r.due IS NULL) ASC, r.due ASC, RANDOM()
        LIMIT ?`,
      [field, field, now, limit]
    );
    if (rows.length) return rows.map(mapRow);
  } catch { /* fall through */ }
  return SEED.filter((w) => inField(w.field, field)).slice(0, limit);
}

// Count of words genuinely DUE (reviewed before and now past their due date), field-scoped.
// Unlike getDueWords this excludes never-seen words, so the Practice hero can honestly say
// "N words to review" (a new user gets 0, not the whole corpus).
export async function getDueCount(field: FieldId): Promise<number> {
  try {
    const db = await getDb();
    const r = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM review r JOIN words w ON w.id = r.word_id
        WHERE r.due <= ? AND (w.field = ? OR (? = 'gen' AND w.field <> 'new'))`,
      [Date.now(), field, field]
    );
    return r?.n ?? 0;
  } catch { return 0; }
}

// ── Feed ordering (no-repeat rotation) ──
// Small deterministic PRNG (mulberry32) so the feed order is stable within a
// day (no reshuffling mid-session / between launches) but fresh every day.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seededShuffle<T>(items: T[], key: string): T[] {
  const rnd = mulberry32(hashStr(key));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Today-feed order: words the user has never seen come first (daily-shuffled),
// so nothing repeats until the whole corpus has been cycled. Once everything
// has been seen, repeats start with the most-overdue reviews (SRS `due` ASC) -
// words the user already knows well have far-future due dates and land last.
// `salt` varies the unseen shuffle (used by pull-to-refresh).
// Feed across the WHOLE corpus (all fields), no-repeat order. Used by the new
// follow-driven feed: index.tsx filters this by the user's followed topics.
// Difficulty tier WITHIN advanced. C1 = accessible-advanced, C2 = rare/hard.
// 'mix' leaves the shuffle untouched; otherwise the preferred tier leads ~2:1
// so it's biased but never monotone (you still meet the other tier regularly).
export type LevelPref = 'C1' | 'C2' | 'mix';
function orderByLevel(words: Word[], pref: LevelPref): Word[] {
  if (pref === 'mix') return words;
  const primary = words.filter((w) => w.cefr === pref);
  const other = words.filter((w) => w.cefr !== pref);
  const out: Word[] = [];
  let i = 0, j = 0;
  while (i < primary.length || j < other.length) {
    if (i < primary.length) out.push(primary[i++]);
    if (i < primary.length) out.push(primary[i++]);
    if (j < other.length) out.push(other[j++]);
  }
  return out;
}

// The bundled `gen` corpus includes ~19k machine-scraped rows (film/place names,
// inflected forms) that have empty examples — noise that made the feed feel junky
// and fake-inflated the count. When ON, the FEED + widget/notification stream show
// only words with a real in-context example (all curated content) plus the hooks.
// Search / browse / practice are unaffected. Flip to false if General feels too thin.
const HIDE_LOW_QUALITY = true;
const HOOK_SET = new Set(HOOK_IDS);
// The daily-word FEED / widget / notifications are about single WORDS, not phrases
// or collocations ("weighted average cost of capital" is not a word). Multi-word
// entries stay in the DB for search / browse / practice, just not the word feed.
// (Hyphenated single tokens like "self-effacing" count as one word.)
const isSingleWord = (word: string): boolean => !/\s/.test((word || '').trim());
// Transparent medical words — everyday care terms ("reposition", "swelling", "cough")
// that a C1–C2 learner can already deduce, so they cheapen the med FEED. Kept in the DB
// for practice / search / browse; only pulled OUT of the feed / widget / notifications.
const TRANSPARENT_MED = new Set(
  'reposition position monitor swelling swollen bruise bruising rash dizzy dizziness faint fainting cough coughing breathe breathing vomit vomiting nausea tired tiredness weak weakness sore soreness ache aching painful chart admit admission discharge bedside handwashing turning bathing feeding washing walking sitting standing lying comfortable uncomfortable mobility hydration hydrate nutrition wound dressing bandage bleeding swallow swallowing chew chewing sleepy drowsy fever sweating shivering itchy itching stiff stiffness posture resting lifting wheelchair bedpan'.split(' ')
);
const TRANSPARENT_MED_AFFIX = /^(re|over|under|out|in|self|non)-?(position|dose|weight|patient|care|feed|hydrat|assess|check|examin|move|turn|wash)/i;
const isTransparentMed = (w: Word): boolean =>
  w.field === 'med' &&
  (TRANSPARENT_MED.has((w.word || '').toLowerCase()) || TRANSPARENT_MED_AFFIX.test((w.word || '').toLowerCase()));
// Exported so practice/tests can hold the same C1–C2 bar as the feed (single
// advanced words, example-backed, no transparent-med) — no B1 phrases in quizzes.
export const isQualityWord = (w: Word): boolean =>
  isSingleWord(w.word) && !isTransparentMed(w) &&
  (!HIDE_LOW_QUALITY || HOOK_SET.has(w.id) || (!!w.ex && w.ex.trim().length > 0));

export async function getAllFeedWords(salt = '', level: LevelPref = 'mix', wordPref: WordPref = 'balanced'): Promise<Word[]> {
  let words: Word[] = [];
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>('SELECT * FROM words ORDER BY rowid', []);
    if (rows.length) words = rows.map(mapRow);
  } catch { /* fall through */ }
  if (!words.length) words = SEED.slice();
  words = words.filter(isQualityWord);
  const seen = new Map<string, number>();
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ word_id: string; due: number }>('SELECT word_id, due FROM review', []);
    rows.forEach((r) => seen.set(r.word_id, r.due));
  } catch { /* no review data yet */ }
  // excludeGradedBasic: Lexfall is a C1-C2 app - never surface a NEW word we've honestly graded B1
  // or below (e.g. logistics/rebalance B1, redemption B2), regardless of the rarity dial. Without
  // this, rankByRarity only SINKS graded-basic words and the taste ranker's own exploration jitter
  // could still float them up, so a "Rare"-dial user saw basic words in the feed (owner report,
  // 2026-09-29). Matches onboarding, which already runs every pool through this floor. Ungraded
  // words (most of the corpus) are kept - we don't know their level, that's not "known basic".
  // Applies to NEW words only; a basic word already in review keeps surfacing for review continuity.
  const unseen = excludeGradedBasic(words.filter((w) => !seen.has(w.id)));
  const reviewed = words.filter((w) => seen.has(w.id)).sort((a, b) => seen.get(a.id)! - seen.get(b.id)!);
  // rankByRarity: always prioritize graded PREMIUM (C1/C2) words by rarity over graded basic
  // (B1 or below) ones - Lexfall is a C1-C2 app, so a word we've now honestly graded as only B1/B2
  // shouldn't lead the feed just because the corpus's coarse `cefr` field called it C1. Ungraded
  // words (most of the corpus, starter 400-word batch) are unaffected, kept in their existing order.
  const ordered = rankByRarity(orderByLevel(seededShuffle(unseen, `${dayKey()}:all:${salt}`), level), wordPref);
  const rank = new Map(HOOK_IDS.map((id, i) => [id, i] as const));
  const taste = await loadTaste();
  let leading: Word[];
  if (hasSignal(taste)) {
    // Personalised: once you've liked/saved a few words, rank unseen words by how
    // well they match your learned taste (topic/level/pos), with a small hook nudge,
    // the same premium/rarity nudge as above, and a little exploration jitter so it keeps discovering.
    leading = [...ordered]
      .map((w) => ({ w, s: scoreWord(w, taste) + (rank.has(w.id) ? 0.4 : 0) + rarityBonus(w.id, wordPref) + Math.random() * 0.5 }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.w);
  } else {
    // Cold start: lead with the catchy "hook" words (in wow-factor order), then
    // the shuffle — so the feed opens on delight, not a random draw.
    const hooks = ordered.filter((w) => rank.has(w.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    const rest = ordered.filter((w) => !rank.has(w.id));
    leading = [...hooks, ...rest];
  }
  return [...leading, ...reviewed];
}

export async function getFeedWords(field: FieldId, salt = '', wordPref: WordPref = 'balanced'): Promise<Word[]> {
  const words = (await getWordsByField(field)).filter(isQualityWord);
  const seen = new Map<string, number>(); // word_id → due (epoch ms)
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ word_id: string; due: number }>('SELECT word_id, due FROM review', []);
    rows.forEach((r) => seen.set(r.word_id, r.due));
  } catch { /* no review data yet - everything is unseen */ }
  // Same C1-C2 floor as getAllFeedWords: keep known-basic words out of the NEW-word stream.
  const unseen = excludeGradedBasic(words.filter((w) => !seen.has(w.id)));
  const reviewed = words.filter((w) => seen.has(w.id)).sort((a, b) => seen.get(a.id)! - seen.get(b.id)!);
  return [...rankByRarity(seededShuffle(unseen, `${dayKey()}:${field}:${salt}`), wordPref), ...reviewed];
}

export async function searchWords(q: string): Promise<Word[]> {
  const db = await getDb();
  const query = q.trim();
  if (!query) return [];
  const rows = await db.getAllAsync<Row>(
    `SELECT w.* FROM words w
       JOIN words_fts f ON f.rowid = w.rowid
      WHERE words_fts MATCH ? LIMIT 80`,
    [query + '*']
  );
  const words = rows.map(mapRow);
  // FTS matches word + definition + example; rank so the HEADWORD matches lead
  // (starts-with, then contains), then the rest — so results feel relevant.
  const ql = query.toLowerCase();
  const rank = (w: Word) => {
    const wl = (w.word || '').toLowerCase();
    return wl.startsWith(ql) ? 0 : wl.includes(ql) ? 1 : 2;
  };
  return words.sort((a, b) => rank(a) - rank(b)).slice(0, 30);
}
