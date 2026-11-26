// Writes test and benchmark inputs for the Rust solver using the game's
// own JavaScript, so the solver is checked against the real rules and
// the real scramble generator.
//
// Run from the repository root:  node solver/tools/gen_fixtures.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import {
  CELLS, applyMove, boardFromString, boardToString, encodeMove, twistCells,
  CW, CCW,
} from '../../src/core/board.js';
import {
  dailyInfo, dailyLevel, levelPlay, scramble,
} from '../../src/core/puzzle.js';
import { LEVELS } from '../../src/core/levels.js';
import { hashSeed, mulberry32, randInt } from '../../src/core/prng.js';

const out = 'solver/tests/fixtures';
const data = 'solver/data';
mkdirSync(out, { recursive: true });
mkdirSync(data, { recursive: true });

const MOVES = [];
for (const [r, c] of twistCells()) {
  MOVES.push(encodeMove(r, c, CW), encodeMove(r, c, CCW));
}

// 1. Random boards and random move sequences, with board.js results.
{
  const rng = mulberry32(hashSeed('fixture', 'moves'));
  const lines = [];
  for (let n = 0; n < 300; n++) {
    const board = new Uint8Array(CELLS);
    for (let i = 0; i < CELLS; i++) board[i] = rng() < 0.5 ? 1 : 0;
    const start = boardToString(board);
    const len = randInt(rng, 1, 60);
    const seq = [];
    for (let i = 0; i < len; i++) {
      const m = MOVES[randInt(rng, 0, MOVES.length - 1)];
      applyMove(board, m);
      seq.push(m);
    }
    lines.push(`${start} ${seq.join(',')} ${boardToString(board)}`);
  }
  writeFileSync(`${out}/moves.txt`, lines.join('\n') + '\n');
}

// 2. Levels as the game defines them.
writeFileSync(`${data}/levels.json`, JSON.stringify(LEVELS, null, 1));

// 3. The real daily puzzles for the first 364 days, and the level plays.
{
  const days = [];
  const base = Date.UTC(2026, 10, 26);
  for (let k = 0; k < 364; k++) {
    const d = new Date(base + k * 86400000);
    const { number, weekday } = dailyInfo(
      d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    const p = dailyLevel(number, weekday);
    days.push({
      number, weekday, name: p.name, target: p.target, start: p.start,
      solution: p.solution,
    });
  }
  writeFileSync(`${data}/dailies.json`, JSON.stringify(days));
  const plays = LEVELS.map((_, id) => {
    const p = levelPlay(id);
    return {
      id, name: p.name, target: p.target, start: p.start,
      solution: p.solution,
    };
  });
  writeFileSync(`${data}/level-plays.json`, JSON.stringify(plays));
}

// 4. Synthetic scrambles from the game's generator, per level and depth.
{
  const perCell = Number(process.env.PER_CELL || 0);
  const rows = [];
  for (const level of LEVELS) {
    for (let depth = 4; depth <= 20; depth++) {
      const rng = mulberry32(hashSeed('bench', level.id, depth));
      for (let k = 0; k < perCell; k++) {
        const s = scramble(level.target, depth, rng);
        rows.push({
          level: level.id, depth, target: level.target, start: s.start,
          solution: s.solution,
        });
      }
    }
  }
  writeFileSync(`${data}/scrambles.json`, JSON.stringify(rows));
}

console.log('fixtures written');
