// Daily statistics derived from per-puzzle records. Pure.
//
// records: { [puzzleNumber]: { first, best, plays } } for solved puzzles.

export function updateRecord(record, twists) {
  if (!record) return { first: twists, best: twists, plays: 1 };
  return {
    ...record,
    best: Math.min(record.best, twists),
    plays: record.plays + 1,
  };
}

export function streakAt(records, today) {
  let n = records[today] ? today : today - 1;
  let streak = 0;
  while (n >= 1 && records[n]) {
    streak++;
    n--;
  }
  return streak;
}

export function maxStreak(records) {
  const solved = Object.keys(records).map(Number).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = null;
  for (const n of solved) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  return best;
}

// Own score distribution: best score of each solved puzzle.
export function histogram(records) {
  const bins = {};
  for (const rec of Object.values(records)) {
    bins[rec.best] = (bins[rec.best] || 0) + 1;
  }
  return bins;
}

export function summarize(records, today) {
  const solved = Object.keys(records).length;
  return {
    played: solved,
    streak: streakAt(records, today),
    maxStreak: maxStreak(records),
    best: records[today] ? records[today].best : null,
    histogram: histogram(records),
  };
}
