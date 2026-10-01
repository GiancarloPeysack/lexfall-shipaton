import { syncRemoteWords } from './word-sync';

// Content-sync entry point used by app-state's early init.
//
// There used to be TWO parallel word-sync implementations — this file and
// word-sync.ts — each pulling the same `words` table on launch with its OWN
// monotonic cursor (`lexfall.wordsSyncSeq` here vs `vorto.wordsCursor` there),
// doing the work twice. Consolidated: this now delegates to the canonical
// `syncRemoteWords` so there is one cursor and one code path. (User-data sync,
// if added later, belongs here too.)
export function initSync(): void {
  syncRemoteWords().catch(() => {});
}
