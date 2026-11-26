// Chapter reveal. Players see only unlocked chapters plus one teaser;
// the total number of chapters is never exposed.
//
// Rule: chapter N+1 unlocks when every level of chapter N is solved.
// Unlocks are permanent (stored), so they never relock.

export function chapterIds(levels) {
  return [...new Set(levels.map((l) => l.chapter))].sort((a, b) => a - b);
}

// solved: { [levelId]: twists }. Returns how many chapters are open,
// at least `stored`, at least 1.
export function unlockedCount(levels, solved, stored = 1) {
  const ids = chapterIds(levels);
  let open = Math.max(1, stored);
  while (open < ids.length) {
    const ch = ids[open - 1];
    const left = levels.filter((l) => l.chapter === ch && !solved[l.id]);
    if (left.length) break;
    open++;
  }
  return Math.min(open, ids.length);
}

// What the Levels screen may show.
// { open: [chapter ids], teaser: { remaining } | null }
export function visibleChapters(levels, solved, stored = 1) {
  const ids = chapterIds(levels);
  const n = unlockedCount(levels, solved, stored);
  const open = ids.slice(0, n);
  if (n >= ids.length) return { open, teaser: null };
  const ch = ids[n - 1];
  const remaining = levels.filter(
    (l) => l.chapter === ch && !solved[l.id]).length;
  return { open, teaser: { remaining } };
}
