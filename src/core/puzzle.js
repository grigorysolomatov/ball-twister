// Puzzle generation: curated target + seeded scramble. Pure.

import {
  CELLS, CCW, CW, boardFromString, boardToString, countCorrect, sameBoard,
  applyTurn, encodeTurn, inverseTurn, pushTurn, twist, twistCells,
} from './board.js';
import { hashSeed, mulberry32, randInt, shuffle } from './prng.js';
import { LEVELS } from './levels.js';

// Puzzle #1 is this local calendar day (year, month 1-12, day).
export const EPOCH = { y: 2026, m: 11, d: 26 };

// Scramble depth range by weekday, Monday first.
export const DEPTHS = [
  [4, 6], [6, 8], [8, 10], [10, 12], [12, 15], [14, 18], [15, 20],
];

function dayNumber(y, m, d) {
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

// Puzzle number and weekday (0 = Monday) for a local calendar date.
export function dailyInfo(y, m, d) {
  const days = dayNumber(y, m, d);
  const number = days - dayNumber(EPOCH.y, EPOCH.m, EPOCH.d) + 1;
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return { number, weekday };
}

export function dateInfo(date = new Date()) {
  return dailyInfo(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

// Daily targets come from the level list. Every cycle through the list
// uses its own seeded order, so each level appears once per cycle.
export function targetFor(number) {
  const n = Math.max(0, number - 1);
  const cycle = Math.floor(n / LEVELS.length);
  const order = shuffle(
    LEVELS.map((_, i) => i), mulberry32(hashSeed('order', cycle)));
  const { name, target } = LEVELS[order[n % LEVELS.length]];
  return { name, target };
}

// Smallest number of moves (up to maxDepth) solving start, else null.
// A move is one ring turned by 1, 2 or 3 quarters.
export function shortestWithin(start, target, maxDepth) {
  if (sameBoard(start, target)) return 0;
  const moves = [];
  for (const [r, c] of twistCells()) {
    for (let q = 1; q <= 3; q++) moves.push(encodeTurn(r, c, q));
  }
  let frontier = [start];
  const seen = new Set([boardToString(start)]);
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = [];
    for (const board of frontier) {
      for (const move of moves) {
        const b = board.slice();
        applyTurn(b, move);
        if (sameBoard(b, target)) return depth;
        const key = boardToString(b);
        if (!seen.has(key)) {
          seen.add(key);
          next.push(b);
        }
      }
    }
    frontier = next;
  }
  return null;
}

// Seeded random moves from the target. Never the same pivot twice in
// a row (they would merge into one move); the result is never already
// solved and never solvable much faster than the depth asked for.
// `solution` is a normalised move list, see board.js.
export function scramble(targetText, depth, rng) {
  const target = boardFromString(targetText);
  const pivots = twistCells();
  for (let attempt = 0; attempt < 200; attempt++) {
    const board = target.slice();
    const applied = [];
    let last = -1;
    for (let i = 0; i < depth; i++) {
      let p;
      do { p = randInt(rng, 0, pivots.length - 1); } while (p === last);
      last = p;
      const [r, c] = pivots[p];
      const turn = encodeTurn(r, c, randInt(rng, 1, 3));
      applyTurn(board, turn);
      applied.push(turn);
      // Passing through the target early would end play early.
      if (sameBoard(board, target)) break;
    }
    if (sameBoard(board, target)) continue;
    if (countCorrect(board, target) > CELLS - 6 && depth >= 6) continue;
    // Three quarter-turn moves per pivot make a depth-3 search slow on
    // a phone, so only look two moves deep.
    const quick = Math.min(2, Math.floor(depth / 2) - 1);
    const found = quick >= 1 ? shortestWithin(board, target, quick) : null;
    if (found !== null) continue;
    return {
      start: boardToString(board),
      // One valid solution: undo the scramble in reverse order.
      solution: applied.slice().reverse().map(inverseTurn),
    };
  }
  throw new Error('scramble failed');
}

export function dailyLevel(number, weekday) {
  const { name, target } = targetFor(number);
  const [lo, hi] = DEPTHS[weekday];
  const rng = mulberry32(hashSeed('daily', number));
  const depth = randInt(rng, lo, hi);
  const { start, solution } = scramble(target, depth, rng);
  return { kind: 'daily', number, weekday, name, target, start, solution };
}

export function practiceLevel(seed, depth = 8) {
  const rng = mulberry32(hashSeed('practice', seed));
  const { name, target } = LEVELS[randInt(rng, 0, LEVELS.length - 1)];
  const { start, solution } = scramble(target, depth, rng);
  return { kind: 'practice', seed, name, target, start, solution };
}

// One of his levels by id. The scramble is random on every play: pass a
// fresh seed each time (a given seed always gives the same scramble).
// Depth grows with the level's place in its chapter (level 1 easiest).
export function levelPlay(id, seed = 0) {
  const { name, target, level } = LEVELS[id];
  const rng = mulberry32(hashSeed('level', id, seed));
  const [lo, hi] = DEPTHS[Math.min(level - 1, DEPTHS.length - 1)];
  const depth = randInt(rng, lo, hi);
  const { start, solution } = scramble(target, depth, rng);
  return { kind: 'level', id, name, target, start, solution };
}

// Tutorial: a single ball first, then the first levels of the list.
// Each step is a target plus the one or two twists that scramble it.
const ONE_BALL = '.'.repeat(17) + 'X' + '.'.repeat(31);
const TUTORIAL = [
  { name: 'one ball', target: ONE_BALL, moves: [[3, 3, CCW]] },
  { name: 'tap', target: LEVELS[0].target, moves: [[3, 3, CCW]] },
  { name: 'hold', target: LEVELS[1].target,
    moves: [[2, 3, CW], [4, 3, CCW]] },
  { name: 'undo', target: LEVELS[2].target,
    moves: [[3, 3, CW], [2, 2, CW]] },
];

export const TUTORIAL_STEPS = TUTORIAL.length;

export function tutorialLevel(step) {
  const spec = TUTORIAL[step];
  const text = spec.target;
  const board = boardFromString(text);
  for (const [r, c, dir] of spec.moves) twist(board, r, c, dir);
  const solution = [];
  for (const [r, c, dir] of spec.moves.slice().reverse()) {
    pushTurn(solution, encodeTurn(r, c, -dir));
  }
  return {
    kind: 'tutorial', step, name: spec.name, target: text,
    start: boardToString(board), solution,
  };
}
