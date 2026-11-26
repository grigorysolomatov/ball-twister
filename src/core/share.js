// Share text: score and a sparkline of correct balls after each twist.

import { CELLS } from './board.js';

const BLOCKS = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';

// counts: correct-ball totals after each twist; startCorrect: before any.
export function sparkline(counts, startCorrect = CELLS) {
  const lo = Math.min(startCorrect, ...counts);
  const hi = CELLS;
  const span = Math.max(1, hi - lo);
  return counts
    .map((n) => BLOCKS[Math.round(((n - lo) / span) * (BLOCKS.length - 1))])
    .join('');
}

export function shareText({ number, twists, counts, startCorrect, url }) {
  const unit = twists === 1 ? 'twist' : 'twists';
  const lines = [`Ball Twister #${number}  ${twists} ${unit}`];
  if (counts && counts.length) lines.push(sparkline(counts, startCorrect));
  if (url) lines.push(url);
  return lines.join('\n');
}
