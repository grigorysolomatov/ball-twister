// UI glue: renders a session, handles input, owns screens and storage.
// Game rules live in src/core; looks live in themes.js.

import { CCW, CW, SIZE, canTwist, decodeMove, twistPairs }
  from '../core/board.js';
import { createSession } from '../core/session.js';
import { dateInfo } from '../core/puzzle.js';
import { shareText } from '../core/share.js';
import { summarize, updateRecord } from '../core/stats.js';
import { getMode, listModes } from '../modes.js';
import { THEME_ORDER, THEMES, applyTheme } from './themes.js';
import { load, save } from './storage.js';

const HOLD_MS = 200;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const store = load();
const ctx = { now: () => fakeNow() || new Date(), step: 0, counter: 0 };
const game = { mode: null, level: null, session: null, balls: [], t0: 0 };

// ?day=YYYY-MM-DD plays another date, handy for checking the week.
function fakeNow() {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.get('day') || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null;
}

function cellEl(cls, index) {
  const el = document.createElement('div');
  el.className = cls;
  el.style.transform = place(index);
  return el;
}

function place(index) {
  const r = Math.floor(index / SIZE);
  const c = index % SIZE;
  return `translate(${c * 100}%, ${r * 100}%)`;
}

function ballEl(index, colour) {
  const el = cellEl(`ball c${colour}`, index);
  el.appendChild(document.createElement('i'));
  return el;
}

function renderStatic() {
  const rings = $('rings');
  const peek = document.createElement('div');
  peek.className = 'inner';
  rings.textContent = '';
  const { target } = game.session;
  for (let i = 0; i < target.length; i++) {
    const ring = cellEl('ring', i);
    const dot = document.createElement('i');
    dot.style.borderColor = `var(--ring${target[i]})`;
    ring.appendChild(dot);
    rings.appendChild(ring);
    peek.appendChild(ballEl(i, target[i]));
  }
  $('peek').textContent = '';
  $('peek').appendChild(peek);
}

function renderBalls() {
  const layer = $('balls');
  layer.textContent = '';
  game.balls = [];
  const { board } = game.session;
  for (let i = 0; i < board.length; i++) {
    const el = ballEl(i, board[i]);
    game.balls.push(el);
    layer.appendChild(el);
  }
}

// Move ball elements the same way the core moved the board values.
function animateTwist(r, c, dir) {
  const old = game.balls.slice();
  for (const [from, to] of twistPairs(r, c, dir)) {
    game.balls[to] = old[from];
    old[from].style.transform = place(to);
  }
}

function buildHits() {
  const layer = $('hits');
  layer.textContent = '';
  for (let i = 0; i < SIZE * SIZE; i++) {
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    const el = cellEl(canTwist(r, c) ? 'hit ok' : 'hit', i);
    el.dataset.r = r;
    el.dataset.c = c;
    layer.appendChild(el);
  }
}

function updateButtons() {
  const n = game.session.moves.length;
  $('undo').disabled = n === 0;
  $('restart').disabled = n === 0;
}

function doTwist(r, c, dir) {
  const s = game.session;
  if (s.solved() || !s.twist(r, c, dir)) return;
  animateTwist(r, c, dir);
  updateButtons();
  if (s.solved()) setTimeout(onSolved, 450);
}

function doUndo() {
  const s = game.session;
  const move = s.undo();
  if (move === null) return;
  const { r, c, dir } = decodeMove(move);
  animateTwist(r, c, -dir);
  updateButtons();
}

function doRestart() {
  game.session.restart();
  renderBalls();
  updateButtons();
}

// --- input -------------------------------------------------------------

function bindBoard() {
  const layer = $('hits');
  let press = null;
  const cellOf = (ev) => {
    const el = ev.target.closest('.hit');
    return el ? [+el.dataset.r, +el.dataset.c] : null;
  };
  layer.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    const cell = cellOf(ev);
    if (!cell) return;
    // A lost pointer-up must not freeze the board: replace stale presses.
    if (press) clearTimeout(press.timer);
    press = null;
    if (ev.pointerType === 'mouse' && ev.button === 2) {
      doTwist(cell[0], cell[1], CCW);
      return;
    }
    press = { cell, id: ev.pointerId, long: false };
    press.timer = setTimeout(() => {
      press.long = true;
      doTwist(cell[0], cell[1], CCW);
    }, HOLD_MS);
  });
  const finish = (ev, cancel) => {
    if (!press || press.id !== ev.pointerId) return;
    clearTimeout(press.timer);
    if (!press.long && !cancel) doTwist(press.cell[0], press.cell[1], CW);
    press = null;
  };
  layer.addEventListener('pointerup', (ev) => finish(ev, false));
  layer.addEventListener('pointercancel', (ev) => finish(ev, true));
  layer.addEventListener('contextmenu', (ev) => ev.preventDefault());
  $('board').addEventListener('touchmove', (ev) => ev.preventDefault(),
    { passive: false });

  $('undo').onclick = doUndo;
  $('restart').onclick = doRestart;
  const eye = $('eye');
  const peek = (on) => $('peek').classList.toggle('on', on);
  eye.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    peek(true);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
    eye.addEventListener(type, () => peek(false));
  }
  eye.addEventListener('contextmenu', (ev) => ev.preventDefault());
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'z' || ev.key === 'Z') doUndo();
    if (ev.key === 'e') peek(true);
  });
  document.addEventListener('keyup', (ev) => {
    if (ev.key === 'e') peek(false);
  });
}

// --- screens -----------------------------------------------------------

const HINTS = [
  'Tap a ball to turn the eight around it. Match the faint rings.',
  'Hold a ball a moment to turn the other way.',
  'Undo takes back a twist. Hold the eye button to see the solved board.',
];

function start(modeId, level) {
  game.mode = getMode(modeId);
  game.level = level || game.mode.next(ctx);
  game.session = createSession(game.level);
  game.t0 = Date.now();
  $('label').textContent = game.mode.label(game.level);
  $('hint').textContent = modeId === 'tutorial'
    ? HINTS[game.level.step]
    : modeId === 'daily'
      ? 'Make the balls match the rings.'
      : 'Practice puzzles do not count towards stats.';
  document.querySelectorAll('#modes button').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === modeId);
  });
  closeSheet();
  renderStatic();
  renderBalls();
  buildHits();
  updateButtons();
}

function buildModeBar() {
  const bar = $('modes');
  for (const mode of listModes()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = mode.title;
    b.dataset.mode = mode.id;
    b.onclick = () => {
      if (mode.id === 'tutorial') ctx.step = 0;
      start(mode.id);
    };
    bar.appendChild(b);
  }
}

function sheet(html, wire) {
  $('card').innerHTML = html;
  $('sheet').hidden = false;
  if (wire) wire($('card'));
}

function closeSheet() {
  $('sheet').hidden = true;
}

function today() {
  return dateInfo(ctx.now()).number;
}

function histogramHtml(bins, mine) {
  const keys = Object.keys(bins).map(Number).sort((a, b) => a - b);
  if (!keys.length) return '';
  const lo = keys[0];
  const hi = keys[keys.length - 1];
  const peak = Math.max(...Object.values(bins));
  let out = '<div class="histo">';
  for (let k = lo; k <= hi; k++) {
    const n = bins[k] || 0;
    const h = Math.max(4, Math.round((n / peak) * 62));
    out += `<div class="${k === mine ? 'me' : ''}" style="height:${h}px">`
      + `<small>${k}</small></div>`;
  }
  return out + '</div><p style="margin-top:18px">Your best score per day</p>';
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

async function share(text) {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch (err) {
    window.prompt('Copy your result', text);
  }
}

function onSolved() {
  const result = game.session.result();
  const secs = Math.round((Date.now() - game.t0) / 1000);
  const id = game.mode.id;
  if (id === 'tutorial') return tutorialDone();
  if (id === 'practice') return practiceDone(result);
  const n = game.level.number;
  const first = !store.records[n];
  store.records[n] = updateRecord(store.records[n], result.twists);
  store.records[n].lastSeconds = secs;
  save(store);
  dailyDone(result, first);
}

function tutorialDone() {
  const step = game.level.step;
  const last = step === getMode('tutorial').steps - 1;
  sheet(`<h2>${last ? 'You are ready' : 'Well done'}</h2>
    <p>${last ? 'Today\'s puzzle is waiting.' : 'On to the next one.'}</p>
    <div class="row"><button class="primary" id="go">
    ${last ? 'Play today\'s puzzle' : 'Next'}</button></div>`, (card) => {
    card.querySelector('#go').onclick = () => {
      if (last) {
        store.settings.tutorialDone = true;
        save(store);
        start('daily');
      } else {
        ctx.step = step + 1;
        start('tutorial');
      }
    };
  });
}

function practiceDone(result) {
  sheet(`<h2>Solved</h2><div class="big">${result.twists}</div>
    <p>twists</p><div class="row"><button class="primary" id="again">
    New puzzle</button><button id="close">Close</button></div>`, (c) => {
    c.querySelector('#again').onclick = () => start('practice');
    c.querySelector('#close').onclick = closeSheet;
  });
}

function dailyDone(result, first) {
  const n = game.level.number;
  const sum = summarize(store.records, today());
  const text = shareText({
    number: n, twists: result.twists, counts: result.counts,
    startCorrect: result.startCorrect, url: shareUrl(),
  });
  const spark = text.split('\n')[1] || '';
  sheet(`<h2>Solved</h2>
    <div class="big">${result.twists}</div><p>twists</p>
    <div class="spark">${spark}</div>
    <div class="stats4">
      <div><b>${sum.best}</b><span>Best</span></div>
      <div><b>${sum.streak}</b><span>Streak</span></div>
      <div><b>${sum.played}</b><span>Played</span></div>
    </div>
    ${histogramHtml(sum.histogram, sum.best)}
    <div class="row"><button class="primary" id="share">Share</button>
    <button id="replay">Play again</button>
    <button id="close">Close</button></div>`, (c) => {
    c.querySelector('#share').onclick = () => share(text);
    c.querySelector('#replay').onclick = () => start('daily', game.level);
    c.querySelector('#close').onclick = closeSheet;
  });
  game.lastShare = text;
  game.firstSolve = first;
}

function shareUrl() {
  return location.origin + location.pathname;
}

function showStats() {
  const sum = summarize(store.records, today());
  sheet(`<h2>Stats</h2>
    <div class="stats4">
      <div><b>${sum.played}</b><span>Played</span></div>
      <div><b>${sum.streak}</b><span>Streak</span></div>
      <div><b>${sum.maxStreak}</b><span>Max streak</span></div>
    </div>
    ${histogramHtml(sum.histogram, sum.best) || '<p>Solve a daily puzzle to'
      + ' see your scores here.</p>'}
    <div class="row"><button id="close">Close</button></div>`, (c) => {
    c.querySelector('#close').onclick = closeSheet;
  });
}

function showHelp() {
  sheet(`<h2>How to play</h2>
    <p>Tap a ball in the middle of the board and the eight balls around it
    turn. Hold instead to turn the other way.</p>
    <p>Make the board match the faint rings. Fewer twists is a better
    score. Undo takes a twist back.</p>
    <p>A new daily puzzle appears at midnight.</p>
    <div class="row"><button id="tut">Tutorial</button>
    <button id="close">Close</button></div>`, (c) => {
    c.querySelector('#tut').onclick = () => {
      ctx.step = 0;
      start('tutorial');
    };
    c.querySelector('#close').onclick = closeSheet;
  });
}

function cycleTheme() {
  const i = THEME_ORDER.indexOf(store.settings.theme);
  store.settings.theme = THEME_ORDER[(i + 1) % THEME_ORDER.length];
  save(store);
  applyTheme(store.settings.theme);
  toast(THEMES[store.settings.theme].name);
}

function registerWorker() {
  if (!('serviceWorker' in navigator) || params.has('nosw')) return;
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (had) location.reload();
  });
}

function init() {
  applyTheme(params.get('theme') || store.settings.theme);
  buildModeBar();
  bindBoard();
  $('stats').onclick = showStats;
  $('help').onclick = showHelp;
  $('theme').onclick = cycleTheme;
  $('sheet').addEventListener('pointerdown', (ev) => {
    if (ev.target === $('sheet')) closeSheet();
  });
  const first = !store.settings.tutorialDone && !params.has('skip');
  start(first ? 'tutorial' : 'daily');
  registerWorker();
  // Read-only hooks for automated checks.
  window.__bt = {
    level: () => game.level,
    session: () => game.session,
    lastShare: () => game.lastShare,
    CW, CCW,
  };
}

init();
