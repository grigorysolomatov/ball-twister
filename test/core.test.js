import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CCW, CW, SIZE, applyMove, boardFromString, boardToString, canTwist,
  countCorrect, encodeMove, decodeMove, inverseMove, twist, twistCells,
} from '../src/core/board.js';
import { createSession, replay } from '../src/core/session.js';
import {
  dailyInfo, dailyLevel, levelPlay, practiceLevel, scramble, shortestWithin,
  targetFor, tutorialLevel, TUTORIAL_STEPS, DEPTHS,
} from '../src/core/puzzle.js';
import {
  CCW as GCCW, CW as GCW, createGesture, gestureDir, gestureMove,
  gestureStart, isTap,
} from '../src/core/gesture.js';
import { LEVELS } from '../src/core/levels.js';
import { unlockedCount, visibleChapters } from '../src/core/progress.js';
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

test('levels: his two-colour list, valid and distinct', () => {
  assert.equal(LEVELS.length, 24);
  assert.equal(LEVELS[0].target.replaceAll('.', '').length, 3);
  const seen = new Set();
  for (const l of LEVELS) {
    assert.equal(l.target.length, 49, l.name);
    assert.match(l.target, /^[X.]+$/, l.name);
    assert.ok(!seen.has(l.target), l.name);
    seen.add(l.target);
    assert.ok(l.chapter >= 1 && l.chapter <= 5);
    assert.ok(l.day >= 0 && l.day <= 4);
  }
});

test('level play: deterministic, solvable, scrambled', () => {
  for (const l of LEVELS) {
    const a = levelPlay(l.id);
    assert.equal(a.start, levelPlay(l.id).start);
    assert.equal(a.target, l.target);
    assert.notEqual(a.start, a.target);
    const s = createSession(a);
    for (const m of a.solution) {
      const { r, c, dir } = decodeMove(m);
      s.twist(r, c, dir);
    }
    assert.ok(s.solved(), l.name);
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
    const text = LEVELS[s % LEVELS.length].target;
    const { start, solution } = scramble(text, 8, mulberry32(s));
    const pivots = solution.map((m) => m >> 1);
    for (let i = 1; i < pivots.length; i++) {
      assert.notEqual(pivots[i], pivots[i - 1]);
    }
    const t = boardFromString(text);
    assert.equal(shortestWithin(boardFromString(start), t, 3), null);
  }
});

test('targets cover all levels across a cycle, all from his list', () => {
  const names = new Set();
  const all = new Set(LEVELS.map((l) => l.target));
  for (let n = 1; n <= LEVELS.length * 2; n++) {
    const t = targetFor(n);
    assert.ok(all.has(t.target));
    if (n <= LEVELS.length) names.add(t.name);
  }
  assert.equal(names.size, LEVELS.length);
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

test('tutorial: first step one ball, 1-2 twists, solvable', () => {
  assert.equal(TUTORIAL_STEPS, 4);
  const first = tutorialLevel(0);
  assert.equal(first.target.replaceAll('.', '').length, 1);
  assert.equal(tutorialLevel(1).target, LEVELS[0].target);
  for (let i = 0; i < TUTORIAL_STEPS; i++) {
    const l = tutorialLevel(i);
    assert.ok(l.solution.length >= 1 && l.solution.length <= 2);
    assert.notEqual(l.start, l.target);
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

test('chapters reveal one at a time', () => {
  const ch1 = LEVELS.filter((l) => l.chapter === 1);
  let v = visibleChapters(LEVELS, {});
  assert.deepEqual(v.open, [1]);
  assert.deepEqual(v.teaser, { remaining: ch1.length });
  const solved = {};
  for (const l of ch1.slice(0, 2)) solved[l.id] = 3;
  v = visibleChapters(LEVELS, solved);
  assert.deepEqual(v.open, [1]);
  assert.equal(v.teaser.remaining, ch1.length - 2);
  for (const l of ch1) solved[l.id] = 3;
  v = visibleChapters(LEVELS, solved);
  assert.deepEqual(v.open, [1, 2]);
  assert.ok(v.teaser);
});

test('unlocks persist and the last chapter has no teaser', () => {
  assert.equal(unlockedCount(LEVELS, {}, 3), 3);
  const all = {};
  for (const l of LEVELS) all[l.id] = 1;
  const v = visibleChapters(LEVELS, all);
  assert.equal(v.teaser, null);
  assert.equal(v.open.length, new Set(LEVELS.map((l) => l.chapter)).size);
});

// --- gestures (centre 100,100; cell 45 px) ---
const drag = (pts) => {
  const g = createGesture({ x: 100, y: 100 }, 45);
  gestureStart(g, pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) gestureMove(g, x, y);
  return g;
};

test('gesture: swipe right is clockwise, left counter-clockwise', () => {
  assert.equal(gestureDir(drag([[100, 100], [130, 100], [160, 102]])), GCW);
  assert.equal(gestureDir(drag([[100, 100], [70, 98], [40, 100]])), GCCW);
  assert.equal(GCW, CW);
  assert.equal(GCCW, CCW);
});

test('gesture: a tap or tiny move does nothing', () => {
  const g = drag([[100, 100], [102, 101]]);
  assert.equal(gestureDir(g), 0);
  assert.ok(isTap(g));
  assert.equal(gestureDir(drag([[100, 100], [112, 100]])), 0);
});

test('gesture: returning to the start cancels', () => {
  const g = drag([[100, 100], [140, 100], [120, 100], [104, 101]]);
  assert.equal(gestureDir(g), 0);
  assert.ok(!isTap(g));
});

test('gesture: vertical swipes do nothing', () => {
  assert.equal(gestureDir(drag([[100, 100], [104, 150], [105, 190]])), 0);
});

test('gesture: circular drag uses angular sign', () => {
  const arc = (sign) => {
    const pts = [[100, 100]];
    for (let a = 0; a <= 1.8; a += 0.15) {
      const t = -Math.PI / 2 + sign * a;
      pts.push([100 + 40 * Math.cos(t), 100 + 40 * Math.sin(t)]);
    }
    return pts;
  };
  // Screen y points down: increasing angle runs clockwise.
  assert.equal(gestureDir(drag(arc(1))), GCW);
  assert.equal(gestureDir(drag(arc(-1))), GCCW);
});

test('gesture: straight swipe above the centre stays horizontal', () => {
  assert.equal(
    gestureDir(drag([[100, 70], [125, 70], [150, 70], [180, 70]])), GCW);
});
