import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CCW, CW, SIZE, applyMove, boardFromString, boardToString, canTwist,
  countCorrect, encodeMove, decodeMove, inverseMove, twist, twistCells,
} from '../src/core/board.js';
import { createSession, replay } from '../src/core/session.js';
import {
  dailyInfo, dailyLevel, practiceLevel, scramble, shortestWithin,
  targetFor, tutorialLevel, TUTORIAL_STEPS, DEPTHS,
} from '../src/core/puzzle.js';
import { PATTERNS } from '../src/core/patterns.js';
import { hashSeed, mulberry32 } from '../src/core/prng.js';
import { shareText, sparkline } from '../src/core/share.js';
import { histogram, streakAt, updateRecord } from '../src/core/stats.js';

const numbered = () => {
  const b = new Uint8Array(49);
  for (let i = 0; i < 49; i++) b[i] = i % 251;
  return b;
};

test('twist moves neighbours by two steps and keeps the pivot', () => {
  const b = numbered();
  twist(b, 3, 3, CW);
  assert.equal(b[3 * 7 + 3], 24);
  // top-left neighbour (2,2) goes two steps clockwise to (2,4)
  assert.equal(b[2 * 7 + 4], 2 * 7 + 2);
  // top-middle (2,3) goes to bottom-right... (3,4)? two steps = (3,4)
  assert.equal(b[4 * 7 + 4], 2 * 7 + 4);
});

test('cw then ccw is identity; four cw is identity', () => {
  const b = numbered();
  twist(b, 2, 4, CW);
  twist(b, 2, 4, CCW);
  assert.deepEqual(b, numbered());
  for (let i = 0; i < 4; i++) twist(b, 5 - 1, 1, CW);
  assert.deepEqual(b, numbered());
});

test('edge pivots are rejected', () => {
  const b = numbered();
  assert.equal(twist(b, 0, 3, CW), false);
  assert.equal(twist(b, 3, 6, CW), false);
  assert.equal(canTwist(1, 1), true);
  assert.deepEqual(b, numbered());
  assert.equal(twistCells().length, 25);
});

test('twists keep checkerboard colour classes', () => {
  const b = numbered();
  for (const [r, c] of twistCells()) twist(b, r, c, CW);
  for (let i = 0; i < 49; i++) {
    const home = b[i];
    const ph = (Math.floor(home / 7) + (home % 7)) % 2;
    const pi = (Math.floor(i / 7) + (i % 7)) % 2;
    assert.equal(ph, pi);
  }
});

test('move encoding round-trips', () => {
  for (const [r, c] of twistCells()) {
    for (const dir of [CW, CCW]) {
      const d = decodeMove(encodeMove(r, c, dir));
      assert.deepEqual([d.r, d.c, d.dir], [r, c, dir]);
    }
  }
  assert.equal(inverseMove(encodeMove(2, 2, CW)), encodeMove(2, 2, CCW));
});

test('prng is deterministic', () => {
  const a = mulberry32(hashSeed('x', 1));
  const b = mulberry32(hashSeed('x', 1));
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
  assert.notEqual(hashSeed('x', 1), hashSeed('x', 2));
});

test('patterns are valid, distinct, and at least 30', () => {
  assert.ok(PATTERNS.length >= 30);
  const seen = new Set();
  for (const [name, text] of PATTERNS) {
    assert.equal(text.length, 49, name);
    assert.match(text, /^[X.]+$/, name);
    assert.ok(!seen.has(text), name);
    seen.add(text);
    const ones = [...text].filter((ch) => ch === 'X').length;
    assert.ok(ones > 5 && ones < 44, name);
  }
});

test('daily info: epoch, weekday', () => {
  assert.deepEqual(dailyInfo(2026, 11, 26), { number: 1, weekday: 3 });
  assert.equal(dailyInfo(2026, 11, 27).number, 2);
  assert.equal(dailyInfo(2026, 11, 30).weekday, 0);
  assert.equal(dailyInfo(2027, 1, 1).number, 37);
});

test('daily levels are deterministic, solvable, in depth range', () => {
  for (let n = 1; n <= 70; n++) {
    const weekday = (n + 2) % 7;
    const a = dailyLevel(n, weekday);
    const b = dailyLevel(n, weekday);
    assert.deepEqual(a, b);
    assert.notEqual(a.start, a.target);
    const [lo, hi] = DEPTHS[weekday];
    assert.ok(a.solution.length >= lo && a.solution.length <= hi);
    const r = replay(a, a.solution);
    assert.ok(r.valid && r.solved, `puzzle ${n}`);
  }
});

test('scramble never cancels at once and is not trivially short', () => {
  for (let s = 0; s < 40; s++) {
    const [, text] = PATTERNS[s % PATTERNS.length];
    const { start, solution } = scramble(text, 8, mulberry32(s));
    const pivots = solution.map((m) => m >> 1);
    for (let i = 1; i < pivots.length; i++) {
      assert.notEqual(pivots[i], pivots[i - 1]);
    }
    const t = boardFromString(text);
    assert.equal(shortestWithin(boardFromString(start), t, 3), null);
  }
});

test('targets cover all patterns across a cycle', () => {
  const names = new Set();
  for (let n = 1; n <= PATTERNS.length; n++) names.add(targetFor(n).name);
  assert.equal(names.size, PATTERNS.length);
});

test('difficulty rises from Monday to Sunday', () => {
  for (let i = 1; i < 7; i++) {
    assert.ok(DEPTHS[i][0] >= DEPTHS[i - 1][0]);
    assert.ok(DEPTHS[i][1] >= DEPTHS[i - 1][1]);
  }
});

test('session: twist, undo removes fully, restart, solve', () => {
  const level = dailyLevel(3, 5);
  const s = createSession(level);
  assert.equal(s.twist(0, 0, CW), false);
  assert.equal(s.twist(3, 3, CW), true);
  assert.equal(s.moves.length, 1);
  s.undo();
  assert.equal(s.moves.length, 0);
  assert.equal(boardToString(s.board), level.start);
  s.twist(2, 2, CW);
  s.restart();
  assert.equal(boardToString(s.board), level.start);
  for (const m of level.solution) {
    const d = decodeMove(m);
    s.twist(d.r, d.c, d.dir);
  }
  assert.ok(s.solved());
  assert.equal(s.result().twists, level.solution.length);
  assert.equal(s.result().counts.at(-1), 49);
  assert.equal(s.twist(3, 3, CW), false);
});

test('undo after wrong twist lowers the score', () => {
  const level = dailyLevel(2, 4);
  const s = createSession(level);
  s.twist(3, 3, CW);
  s.twist(3, 3, CW);
  s.undo();
  assert.equal(s.result().twists, 1);
});

test('replay rejects bad moves', () => {
  const level = dailyLevel(2, 4);
  assert.equal(replay(level, [9999]).valid, false);
  assert.equal(replay(level, [0]).valid, false);
  assert.equal(replay(level, []).solved, false);
});

test('tutorial levels are 1-3 twists and solvable', () => {
  assert.equal(TUTORIAL_STEPS, 3);
  for (let i = 0; i < 3; i++) {
    const l = tutorialLevel(i);
    assert.ok(l.solution.length >= 1 && l.solution.length <= 3);
    assert.ok(replay(l, l.solution).solved);
  }
});

test('practice levels solvable', () => {
  const l = practiceLevel('abc', 8);
  assert.ok(replay(l, l.solution).solved);
});

test('sparkline and share text', () => {
  assert.equal(sparkline([49], 40), '\u2588');
  const s = sparkline([40, 44, 49], 40);
  assert.equal(s.length, 3);
  assert.equal(s.at(-1), '\u2588');
  const t = shareText({
    number: 7, twists: 3, counts: [40, 44, 49], startCorrect: 40,
    url: 'https://x/y',
  });
  assert.equal(t.split('\n')[0], 'Ball Twister #7  3 twists');
  assert.equal(t.split('\n')[2], 'https://x/y');
  assert.match(shareText({ number: 1, twists: 1 }), /1 twist$/);
});

test('stats: records, streak, histogram', () => {
  let rec = updateRecord(undefined, 9);
  rec = updateRecord(rec, 6);
  assert.deepEqual(rec, { first: 9, best: 6, plays: 2 });
  const recs = { 3: rec, 4: { first: 5, best: 5, plays: 1 }, 6: rec };
  assert.equal(streakAt(recs, 4), 2);
  assert.equal(streakAt(recs, 5), 2);
  assert.equal(streakAt(recs, 6), 1);
  assert.equal(streakAt(recs, 8), 0);
  assert.deepEqual(histogram(recs), { 5: 1, 6: 2 });
});

test('size constant', () => {
  assert.equal(SIZE, 7);
  assert.equal(applyMove(new Uint8Array(49), encodeMove(3, 3, CW)), true);
  assert.equal(countCorrect(new Uint8Array(49), new Uint8Array(49)), 49);
});
