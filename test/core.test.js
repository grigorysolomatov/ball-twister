import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CCW, CW, SIZE, applyMove, boardFromString, boardToString, canTwist,
  countCorrect, encodeMove, decodeMove, inverseMove, twist, twistCells,
  applyTurn, decodeTurn, encodeTurn, inverseTurn, pushTurn, toTurns,
} from '../src/core/board.js';
import { createSession, replay } from '../src/core/session.js';
import {
  dailyInfo, dailyLevel, levelPlay, practiceLevel, scramble, shortestWithin,
  targetFor, tutorialLevel, TUTORIAL_STEPS, DEPTHS,
} from '../src/core/puzzle.js';
import {
  QUARTER, createDrag, dragMove, dragStart, dragTurns, isTap,
} from '../src/core/gesture.js';
import { getMode } from '../src/modes.js';
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
    assert.ok(l.level >= 1 && l.level <= 5);
    assert.equal(l.name, `Chapter ${l.chapter} \u00b7 Level ${l.level}`);
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
      const { r, c, q } = decodeTurn(m);
      s.turn(r, c, q);
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
    const pivots = solution.map((m) => m >> 2);
    for (let i = 1; i < pivots.length; i++) {
      assert.notEqual(pivots[i], pivots[i - 1]);
    }
    const t = boardFromString(text);
    assert.equal(shortestWithin(boardFromString(start), t, 2), null);
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
    const d = decodeTurn(m);
    s.turn(d.r, d.c, d.q);
  }
  assert.ok(s.solved());
  assert.equal(s.result().twists, level.solution.length);
  assert.equal(s.result().counts.at(-1), 49);
  assert.equal(s.twist(3, 3, CW), false);
});

test('undo after a wrong move lowers the score', () => {
  const level = dailyLevel(2, 4);
  const s = createSession(level);
  s.twist(3, 3, CW);
  s.twist(2, 2, CW);
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
  assert.equal(t.split('\n')[0], 'Ball Twister #7  3 moves');
  assert.equal(t.split('\n')[2], 'https://x/y');
  assert.match(shareText({ number: 1, twists: 1 }), /1 move$/);
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


// --- merged moves ---

test('turn encoding and merging', () => {
  assert.deepEqual(decodeTurn(encodeTurn(3, 3, -1)), { r: 3, c: 3, q: 3 });
  assert.equal(inverseTurn(encodeTurn(2, 2, 1)), encodeTurn(2, 2, 3));
  const list = [];
  pushTurn(list, encodeTurn(3, 3, 1));
  pushTurn(list, encodeTurn(3, 3, 1));
  assert.deepEqual(list, [encodeTurn(3, 3, 2)]);
  pushTurn(list, encodeTurn(3, 3, 2));
  assert.deepEqual(list, []);
  pushTurn(list, encodeTurn(3, 3, 1));
  pushTurn(list, encodeTurn(2, 2, 1));
  pushTurn(list, encodeTurn(3, 3, 1));
  assert.equal(list.length, 3);
});

test('turns equal quarter twists on the board', () => {
  const a = numbered();
  const b = numbered();
  applyTurn(a, encodeTurn(3, 3, 3));
  twist(b, 3, 3, CCW);
  assert.deepEqual(a, b);
  applyTurn(a, inverseTurn(encodeTurn(3, 3, 3)));
  assert.deepEqual(a, numbered());
});

test('toTurns merges quarter-move lists', () => {
  const m = [encodeMove(3, 3, CW), encodeMove(3, 3, CW),
    encodeMove(2, 2, CCW), encodeMove(2, 2, CW)];
  assert.deepEqual(toTurns(m), [encodeTurn(3, 3, 2)]);
});

test('session: same ring merges into one move', () => {
  const s = createSession(dailyLevel(3, 5));
  s.turn(3, 3, 1);
  s.turn(3, 3, 1);
  s.turn(3, 3, 2);
  assert.equal(s.moves.length, 0);
  s.turn(3, 3, 1);
  s.turn(2, 2, 3);
  assert.equal(s.result().twists, 2);
  s.turn(2, 2, 1);
  assert.equal(s.result().twists, 1);
  assert.equal(s.counts.length, 1);
  s.twist(3, 3, CW);
  assert.deepEqual(s.moves, [encodeTurn(3, 3, 2)]);
  assert.equal(s.counts.length, 1);
});

test('session: net zero restores the board and the count', () => {
  const level = dailyLevel(4, 2);
  const s = createSession(level);
  s.turn(3, 3, 2);
  s.turn(3, 3, -2);
  assert.equal(s.moves.length, 0);
  assert.equal(boardToString(s.board), level.start);
  assert.equal(s.turn(3, 3, 4), false);
  assert.equal(s.turn(0, 0, 1), false);
});

test('session: undo takes back the whole merged move', () => {
  const level = dailyLevel(4, 2);
  const s = createSession(level);
  s.turn(2, 2, 1);
  s.turn(3, 3, 1);
  s.turn(3, 3, 1);
  assert.equal(s.moves.length, 2);
  s.undo();
  assert.equal(s.moves.length, 1);
  s.undo();
  assert.equal(boardToString(s.board), level.start);
  assert.equal(s.undo(), null);
});

test('replay validates normalised move lists', () => {
  const l = dailyLevel(5, 3);
  assert.ok(replay(l, l.solution).solved);
  assert.equal(replay(l, l.solution).twists, l.solution.length);
  const c = encodeTurn(3, 3, 1);
  assert.equal(replay(l, [c, c]).valid, false);
  assert.equal(replay(l, [encodeTurn(3, 3, 0)]).valid, false);
  assert.equal(replay(l, [encodeTurn(0, 0, 1)]).valid, false);
  assert.equal(replay(l, [49 * 4]).valid, false);
});

test('level scrambles differ per play but repeat per seed', () => {
  const a = levelPlay(5, 111);
  assert.equal(a.start, levelPlay(5, 111).start);
  const seen = new Set();
  for (let s = 0; s < 8; s++) seen.add(levelPlay(5, s + 1).start);
  assert.ok(seen.size >= 6);
  const m = getMode('level');
  const x = m.next({ levelId: 5 });
  const y = m.next({ levelId: 5 });
  assert.notEqual(x.start, y.start);
});

// --- drag (centre 100,100; cell 45 px) ---

function drag(pts) {
  const g = createDrag({ x: 100, y: 100 }, 45);
  dragStart(g, pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) dragMove(g, x, y);
  return g;
}

// Finger on a circle of radius 60 around the centre, degrees clockwise
// from "right"; y grows downwards so clockwise is increasing angle.
function arc(from, to, step = 5) {
  const out = [];
  const dir = to >= from ? 1 : -1;
  for (let a = from; dir * (to - a) >= 0; a += dir * step) {
    const r = (a * Math.PI) / 180;
    out.push([100 + 60 * Math.cos(r), 100 + 60 * Math.sin(r)]);
  }
  return out;
}

test('drag: angle follows the finger one to one', () => {
  const g = drag(arc(0, 90));
  assert.ok(Math.abs(g.theta - QUARTER) < 1e-6);
  assert.equal(dragTurns(g), 1);
});

test('drag: snaps to the nearest quarter, 180 and 270 and more', () => {
  assert.equal(dragTurns(drag(arc(0, 40))), 0);
  assert.equal(dragTurns(drag(arc(0, 50))), 1);
  assert.equal(dragTurns(drag(arc(0, 180))), 2);
  assert.equal(dragTurns(drag(arc(0, 270))), 3);
  assert.equal(dragTurns(drag(arc(0, 360))), 4);
  assert.equal(dragTurns(drag(arc(0, -90))), -1);
  assert.equal(dragTurns(drag(arc(30, -150))), -2);
});

test('drag: release at 30 degrees or after going back is no move', () => {
  assert.equal(dragTurns(drag(arc(0, 30))), 0);
  assert.equal(dragTurns(drag([...arc(0, 120), ...arc(120, 10)])), 0);
});

test('drag: jitter near the centre is ignored', () => {
  const g = drag([[100, 100], [103, 98], [97, 104], [101, 96], [99, 102]]);
  assert.equal(g.theta, 0);
  assert.ok(isTap(g));
  assert.ok(!isTap(drag(arc(0, 90))));
});

test('drag: works when the finger leaves the ring area', () => {
  const far = [];
  for (let a = 0; a <= 180; a += 5) {
    const r = (a * Math.PI) / 180;
    far.push([100 + 400 * Math.cos(r), 100 + 400 * Math.sin(r)]);
  }
  assert.equal(dragTurns(drag(far)), 2);
});

test('drag: pressing on the centre then moving out starts cleanly', () => {
  const g = drag([[100, 100], ...arc(90, 180)]);
  assert.equal(dragTurns(g), 1);
});
