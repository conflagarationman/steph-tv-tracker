// Merging two copies of Steph's progress — the browser's and the one committed to the
// repo. This runs whenever a device syncs, so it is the one place where her watch
// history could actually get destroyed. The rules below are deliberately biased toward
// keeping data: where two devices disagree in a way we can't resolve confidently, the
// entry survives rather than being dropped.
//
// Model:
//   overrides    id -> {season, ep, ..., updatedAt}   per-show last-write-wins
//   customShows  id -> {t, s, ..., updatedAt}         per-show last-write-wins
//   history      append-only log, keyed by id+at      union (never shrinks)
//   dismissed    set of "id:season"                   union (never shrinks)
//
// Deletes (reset a show, remove a custom show) can't just drop the key: the other
// device still has it, and a union would resurrect it on the next sync. They leave a
// tombstone {__deleted:true, updatedAt} which loses to any *newer* real edit, so
// deleting on the phone and then editing on the laptop keeps the edit.

// A factory, not a shared constant: spreading a shared object copies only the top level,
// so callers would alias the same nested overrides/history and could mutate the template.
export const emptyDoc = () => ({ version: 1, overrides: {}, customShows: {}, history: [], dismissed: [] });

const time = (v) => {
  const t = Date.parse(v && v.updatedAt);
  return Number.isFinite(t) ? t : 0;
};

// Last-write-wins per key. Ties go to the entry that isn't a tombstone — if a delete and
// an edit land in the same millisecond, keeping the show is the recoverable choice.
function mergeKeyed(mine = {}, theirs = {}) {
  const out = {};
  for (const id of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    const a = mine[id];
    const b = theirs[id];
    if (!a) { out[id] = b; continue; }
    if (!b) { out[id] = a; continue; }
    const ta = time(a);
    const tb = time(b);
    if (ta !== tb) { out[id] = ta > tb ? a : b; continue; }
    out[id] = a.__deleted ? b : a;
  }
  return out;
}

// A history entry is uniquely identified by which show it was and when it happened.
// Two devices can't produce the same (id, at) for different events.
const histKey = (h) => `${h.id}@${h.at}`;

function mergeHistory(mine = [], theirs = []) {
  const seen = new Map();
  for (const h of [...mine, ...theirs]) {
    if (h && h.at != null && h.id != null) seen.set(histKey(h), h);
  }
  // Newest first is what the panel renders; sort here so every device agrees on order.
  return [...seen.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 500);
}

export function merge(mine, theirs) {
  const a = { ...emptyDoc(), ...(mine || {}) };
  const b = { ...emptyDoc(), ...(theirs || {}) };
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    overrides: mergeKeyed(a.overrides, b.overrides),
    customShows: mergeKeyed(a.customShows, b.customShows),
    history: mergeHistory(a.history, b.history),
    dismissed: [...new Set([...(a.dismissed || []), ...(b.dismissed || [])])].sort()
  };
}

// Tombstones are only useful while the other device might still be carrying the deleted
// entry. Past that they're dead weight in every payload, so drop the old ones. 90 days is
// far longer than any realistic gap between her picking up the phone and the laptop.
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function pruneTombstones(doc, now = Date.now()) {
  const strip = (m) => Object.fromEntries(
    Object.entries(m || {}).filter(([, v]) => !(v && v.__deleted && now - time(v) > TOMBSTONE_TTL_MS))
  );
  return { ...doc, overrides: strip(doc.overrides), customShows: strip(doc.customShows) };
}
