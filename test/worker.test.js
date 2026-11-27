import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handle, timeBucket } from '../worker/src/index.js';
import { dailyLevel, dateOfNumber } from '../src/core/puzzle.js';
import { inverseTurn } from '../src/core/board.js';
import {
  fetchHistogram, scoresEnabled, submitScore,
} from '../src/core/scores-client.js';

// In-memory stand-in for the D1 binding, backed by SQLite.
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../worker/schema.sql', import.meta.url),
    'utf8'));
  return {
    db,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async run() { db.prepare(sql).run(...args); return { success: true }; },
        async all() {
          return { results: db.prepare(sql).all(...args).map((r) => ({ ...r })) };
        },
      };
      return stmt;
    },
  };
}

const NOW = new Date('2026-12-05T12:00:00');
const env = (extra = {}) => ({ DB: fakeD1(), QUEUE: [], ...extra });

const post = (e, body) => handle(new Request('https://x/score', {
  method: 'POST', body: JSON.stringify(body),
}), e, NOW);
const hist = async (e, n) => (await handle(
  new Request(`https://x/histogram?puzzle=${n}`), e, NOW)).json();

test('worker stores solved scores and builds the histogram', async () => {
  const e = env();
  const level = dailyLevel(5, []);
  let res = await post(e, { puzzle: 5, moves: level.solution, ms: 45000 });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).twists, level.solution.length);
  await post(e, { puzzle: 5, moves: level.solution, ms: 200000 });
  // A longer solve: two far-apart rings (they commute) turned and
  // turned back first, four extra moves.
  const first = level.solution[0] >> 2;
  const [p, q] = [[8, 40], [10, 38]].find(
    (pair) => !pair.includes(first));
  const A = p * 4 + 1;
  const B = q * 4 + 1;
  res = await post(e, {
    puzzle: 5, moves: [A, B, inverseTurn(A), inverseTurn(B), ...level.solution],
    ms: 10,
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).twists, level.solution.length + 4);
  const h = await hist(e, 5);
  assert.equal(h.puzzle, 5);
  assert.equal(h.twists[level.solution.length], 2);
  assert.equal(h.twists[level.solution.length + 4], 1);
  assert.equal(h.total, 3);
  assert.equal(h.time.counts[timeBucket(45000)], 1);
  assert.equal(h.time.counts[timeBucket(200000)], 1);
});

test('worker rejects unsolved, malformed and future submissions', async () => {
  const e = env();
  const level = dailyLevel(5, []);
  assert.equal((await post(e, { puzzle: 5, moves: [], ms: 1 })).status, 422);
  assert.equal((await post(e, {
    puzzle: 5, moves: level.solution.slice(1), ms: 1,
  })).status, 422);
  assert.equal((await post(e, { puzzle: 5, moves: [9999], ms: 1 })).status,
    422);
  assert.equal((await post(e, { puzzle: 999, moves: level.solution, ms: 1 }))
    .status, 400);
  assert.equal((await post(e, { puzzle: 5, moves: 'x', ms: 1 })).status, 400);
  assert.equal((await post(e, { puzzle: 5, moves: level.solution, ms: -1 }))
    .status, 400);
  assert.equal((await hist(e, 5)).total, 0);
});

test('worker replays against the queued puzzle for that day', async () => {
  const queue = [{
    date: dateOfNumber(6), title: 'Plus',
    rows: ['.......', '...X...', '...X...', '.XXXXX.', '...X...',
      '...X...', '.......'],
  }];
  const e = env({ QUEUE: queue });
  const fallback = dailyLevel(6, []);
  const queued = dailyLevel(6, queue);
  assert.equal(queued.name, 'Plus');
  assert.notEqual(queued.target, fallback.target);
  assert.equal((await post(e, { puzzle: 6, moves: fallback.solution, ms: 1 }))
    .status, 422);
  assert.equal((await post(e, { puzzle: 6, moves: queued.solution, ms: 1 }))
    .status, 200);
});

test('unknown routes 404', async () => {
  const res = await handle(new Request('https://x/nope'), env(), NOW);
  assert.equal(res.status, 404);
});

test('scores client is off until a URL is set', async () => {
  assert.equal(scoresEnabled(), false);
  assert.equal(await submitScore({ puzzle: 1, moves: [], ms: 1 }), null);
  assert.equal(await fetchHistogram(1), null);
  const calls = [];
  const fake = async (u, o) => {
    calls.push([u, o && o.method]);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  assert.deepEqual(await submitScore({ puzzle: 2, moves: [1], ms: 3 },
    'https://s', fake), { ok: true });
  await fetchHistogram(2, 'https://s', fake);
  assert.deepEqual(calls, [['https://s/score', 'POST'],
    ['https://s/histogram?puzzle=2', undefined]]);
});
