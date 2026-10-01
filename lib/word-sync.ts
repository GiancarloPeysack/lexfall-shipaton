import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { upsertWordsFromRemote } from './db';

// TikTok-style incremental corpus sync: keep a cursor (highest `seq` merged) and
// pull only a small page of newer rows per call, caching them into local SQLite.
// Called on launch and as the feed nears its end (pullMore), so backend content
// streams in a bit at a time instead of draining the whole corpus in one burst.
// Offline / no table => no-op; the cached/bundled corpus still serves everything.
//
// QUALITY-SCOPED: the backend `words` table holds ~21k rows but only ~2k have a real
// in-context example — the rest is scraped junk (film/place names) seeded at LOW seq,
// so an unfiltered seq sync streamed junk first and reached the good content last.
// We now pull ONLY rows with an example, so the app streams the curated corpus from
// the backend. New cursor key ('…Q') so existing installs re-pull the quality set.
const CURSOR_KEY = 'vorto.wordsCursorQ';
const PAGE = 300;
const MAX_PAGES_PER_CALL = 3; // stream gradually; pullMore fetches more on scroll

export async function syncRemoteWords(): Promise<number> {
  let added = 0;
  try {
    let cursor = parseInt((await AsyncStorage.getItem(CURSOR_KEY)) || '0', 10) || 0;
    for (let page = 0; page < MAX_PAGES_PER_CALL; page++) {
      const { data, error } = await supabase
        .from('words')
        .select('*')
        .neq('ex', '')   // curated, quality words only (skip scraped junk)
        .gt('seq', cursor)
        .order('seq', { ascending: true })
        .limit(PAGE);
      if (error || !data || data.length === 0) break;
      const maxSeq = await upsertWordsFromRemote(data);
      added += data.length;
      if (maxSeq > cursor) { cursor = maxSeq; await AsyncStorage.setItem(CURSOR_KEY, String(cursor)); }
      if (data.length < PAGE) break;
    }
  } catch {
    // Not configured / offline — the bundled SEED already covers the app.
  }
  return added;
}
