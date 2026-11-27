// Score server for the daily (Cloudflare Worker + D1). Not deployed yet.
//
// POST /score     {puzzle, moves, ms}  rebuild the day's puzzle with the
//                 game's own core code, replay the moves, store twists
//                 and time if solved. Anonymous: no ids, no IPs.
// GET /histogram?puzzle=N  counts per twist count and per time bucket.

import { dailyLevel, dateInfo } from '../../src/core/puzzle.js';
import { replay } from '../../src/core/session.js';
import bundledQueue from '../../data/daily-queue.json' with { type: 'json' };

// Upper edges of the time buckets in seconds; the last bucket is open.
export const TIME_BUCKETS = [30, 60, 120, 180, 300, 600, 900, 1800];
const MAX_MOVES = 500;
const MAX_MS = 24 * 3600 * 1000;

function json(body, status = 200, env = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': env.ALLOW_ORIGIN || '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

export function timeBucket(ms) {
  const s = ms / 1000;
  const i = TIME_BUCKETS.findIndex((edge) => s < edge);
  return i < 0 ? TIME_BUCKETS.length : i;
}

// The queue the game itself uses: the live data file if QUEUE_URL is
// set (so filling the queue needs no redeploy), else the bundled copy.
async function loadQueue(env) {
  if (env.QUEUE) return env.QUEUE;
  if (env.QUEUE_URL) {
    try {
      const res = await fetch(env.QUEUE_URL, { cf: { cacheTtl: 300 } });
      if (res.ok) return await res.json();
    } catch {
      // Fall through to the bundled copy.
    }
  }
  return bundledQueue;
}

// Puzzles open from their own date (any time zone, so a day of slack
// either side) and stay open for scores afterwards.
function puzzleOpen(number, now) {
  const today = dateInfo(now).number;
  return Number.isInteger(number) && number >= 1 && number <= today + 1;
}

async function postScore(request, env, now) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad json' }, 400, env);
  }
  const { puzzle, moves, ms } = body || {};
  if (!puzzleOpen(puzzle, now)) return json({ error: 'bad puzzle' }, 400, env);
  if (!Array.isArray(moves) || moves.length > MAX_MOVES) {
    return json({ error: 'bad moves' }, 400, env);
  }
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_MS) {
    return json({ error: 'bad time' }, 400, env);
  }
  const level = dailyLevel(puzzle, await loadQueue(env));
  const result = replay(level, moves);
  if (!result.valid || !result.solved) {
    return json({ error: 'not solved' }, 422, env);
  }
  await env.DB.prepare(
    'INSERT INTO scores (puzzle, board, twists, ms, bucket) '
      + 'VALUES (?, ?, ?, ?, ?)',
  ).bind(puzzle, level.key, result.twists, ms, timeBucket(ms)).run();
  return json({ ok: true, twists: result.twists }, 200, env);
}

async function getHistogram(url, env, now) {
  const puzzle = Number(url.searchParams.get('puzzle'));
  if (!puzzleOpen(puzzle, now)) return json({ error: 'bad puzzle' }, 400, env);
  const { key } = dailyLevel(puzzle, await loadQueue(env));
  const twists = await env.DB.prepare(
    'SELECT twists AS k, COUNT(*) AS n FROM scores '
      + 'WHERE puzzle = ? AND board = ? GROUP BY twists ORDER BY twists',
  ).bind(puzzle, key).all();
  const times = await env.DB.prepare(
    'SELECT bucket AS k, COUNT(*) AS n FROM scores '
      + 'WHERE puzzle = ? AND board = ? GROUP BY bucket ORDER BY bucket',
  ).bind(puzzle, key).all();
  const toMap = (rows) => Object.fromEntries(
    rows.results.map((r) => [r.k, r.n]));
  const twistCounts = toMap(twists);
  const total = Object.values(twistCounts).reduce((a, b) => a + b, 0);
  return json({
    puzzle,
    total,
    twists: twistCounts,
    time: { edges: TIME_BUCKETS, counts: toMap(times) },
  }, 200, env);
}

export async function handle(request, env, now = new Date()) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return json({}, 204, env);
  if (request.method === 'POST' && url.pathname === '/score') {
    return postScore(request, env, now);
  }
  if (request.method === 'GET' && url.pathname === '/histogram') {
    return getHistogram(url, env, now);
  }
  return json({ error: 'not found' }, 404, env);
}

export default {
  fetch(request, env) {
    return handle(request, env);
  },
};
