// A tiny cross-module channel for "open the For-You feed AT this word" — used by
// the widget (vorto://feed/<id>) and word notifications. The feed reads the
// pending id on focus and scrolls to it (prepending the word if it isn't already
// in the current feed scope), so tapping a widget/notification drops you into the
// scrollable feed on that exact word — NOT the static detail screen.
let pending: string | null = null;
type Sub = (id: string) => void;
const subs = new Set<Sub>();

// Set the word the feed should jump to, and notify any live listener (covers the
// case where the feed is already mounted/focused).
export function setFeedStart(id: string) {
  pending = id;
  subs.forEach((s) => { try { s(id); } catch {} });
}

// Consume the pending start word (one-shot). Returns null if none.
export function takeFeedStart(): string | null {
  const p = pending;
  pending = null;
  return p;
}

export function onFeedStart(cb: Sub): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}
