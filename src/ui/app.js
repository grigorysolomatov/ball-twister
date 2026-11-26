// UI glue: renders a session, handles input, owns screens and storage.
// Game rules live in src/core; looks live in themes.js.

import { CCW, CW, SIZE, canTwist, decodeMove, twistPairs }
  from '../core/board.js';
import { createSession } from '../core/session.js';
import { DAYS, LEVELS } from '../core/levels.js';
import { unlockedCount, visibleChapters } from '../core/progress.js';
import { dateInfo } from '../core/puzzle.js';
import { shareText } from '../core/share.js';
import { summarize, updateRecord } from '../core/stats.js';
import { getMode } from '../modes.js';
import { THEME_ORDER, THEMES, applyTheme } from './themes.js';
import { load, save } from './storage.js';
import { SWIPE_PX, createGesture, gestureDir, gestureMove, gestureProgress,
  gestureStart, isTap } from '../core/gesture.js';

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
  const focus = document.createElement('div');
  focus.id = 'focus';
  focus.className = 'focus';
  focus.hidden = true;
  layer.appendChild(focus);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    const el = cellEl(canTwist(r, c) ? 'hit ok' : 'hit', i);
    el.dataset.r = r;
    el.dataset.c = c;
    layer.appendChild(el);
  }
}

// Highlight the 3x3 ring being pressed; tilt it to preview the twist.
function showFocus(cell, dir = 0, progress = 0) {
  const el = $('focus');
  if (!cell) {
    el.hidden = true;
    return;
  }
  const [r, c] = cell;
  el.hidden = false;
  el.style.left = `${(c - 1) * 100 / SIZE}%`;
  el.style.top = `${(r - 1) * 100 / SIZE}%`;
  el.style.transform = `rotate(${dir * progress * 18}deg)`;
  el.dataset.dir = dir;
}

function swipeHint(cell) {
  showFocus(cell, 0, 0);
  setTimeout(() => showFocus(null), 350);
  const n = store.settings.swipeHints || 0;
  if (n >= 3) return;
  store.settings.swipeHints = n + 1;
  save(store);
  toast('Swipe left or right');
}

function updateButtons() {
  $('undo').disabled = game.session.moves.length === 0;
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
  const swipeMode = () => store.settings.controls !== 'tap';
  const clearPress = () => {
    if (press) clearTimeout(press.timer);
    press = null;
    showFocus(null);
  };
  layer.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    const cell = cellOf(ev);
    if (!cell) return;
    // A lost pointer-up must not freeze the board: replace stale presses.
    clearPress();
    const mouse = ev.pointerType === 'mouse';
    if (mouse && ev.button === 2) {
      // Right click: clockwise in swipe mode, counter-clockwise in old one.
      doTwist(cell[0], cell[1], swipeMode() ? CW : CCW);
      return;
    }
    if (mouse && ev.button !== 0) return;
    if (!swipeMode()) {
      press = { cell, id: ev.pointerId, long: false };
      press.timer = setTimeout(() => {
        press.long = true;
        doTwist(cell[0], cell[1], CCW);
      }, HOLD_MS);
      return;
    }
    const rect = ev.target.closest('.hit').getBoundingClientRect();
    const g = createGesture({ x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2 }, rect.width,
    Math.max(SWIPE_PX, rect.width * 0.25));
    gestureStart(g, ev.clientX, ev.clientY);
    press = { cell, id: ev.pointerId, g, mouse };
    try { layer.setPointerCapture(ev.pointerId); } catch (err) { /* ok */ }
    showFocus(cell, 0, 0);
  });
  layer.addEventListener('pointermove', (ev) => {
    if (!press || !press.g || press.id !== ev.pointerId) return;
    gestureMove(press.g, ev.clientX, ev.clientY);
    showFocus(press.cell, gestureDir(press.g), gestureProgress(press.g));
  });
  const finish = (ev, cancel) => {
    if (!press || press.id !== ev.pointerId) return;
    const p = press;
    clearPress();
    if (cancel) return;
    if (!p.g) {
      if (!p.long) doTwist(p.cell[0], p.cell[1], CW);
      return;
    }
    gestureMove(p.g, ev.clientX, ev.clientY);
    const dir = gestureDir(p.g);
    if (dir) doTwist(p.cell[0], p.cell[1], dir);
    else if (isTap(p.g)) {
      // Mouse: left click is counter-clockwise. Touch: just a hint.
      if (p.mouse) doTwist(p.cell[0], p.cell[1], CCW);
      else swipeHint(p.cell);
    }
  };
  layer.addEventListener('pointerup', (ev) => finish(ev, false));
  layer.addEventListener('pointercancel', (ev) => finish(ev, true));
  layer.addEventListener('contextmenu', (ev) => ev.preventDefault());
  $('board').addEventListener('touchmove', (ev) => ev.preventDefault(),
    { passive: false });

  $('undo').onclick = doUndo;
  const eye = $('solution');
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
  'One ball is off its ring. Swipe right on the ball between the red one '
    + 'and the ring.',
  'Swipe right on a ball to turn the eight around it clockwise. '
    + 'Match the faint rings.',
  'Swipe left to turn the other way.',
  'Undo takes back a twist. Hold Solution to see the solved board.',
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
      : modeId === 'level'
        ? 'Make the balls match the rings.'
        : 'Practice puzzles do not count towards stats.';
  closeSheet();
  showPage('play');
  renderStatic();
  renderBalls();
  buildHits();
  updateButtons();
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
  if (id === 'level') return levelDone(result);
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

function levelDone(result) {
  const id = game.level.id;
  store.levels[id] = Math.min(store.levels[id] || Infinity, result.twists);
  save(store);
  const more = id + 1 < LEVELS.length;
  sheet(`<h2>Solved</h2><div class="big">${result.twists}</div>
    <p>twists</p><div class="row">
    ${more ? '<button class="primary" id="next">Next level</button>' : ''}
    <button id="back">Levels</button></div>`, (c) => {
    if (more) c.querySelector('#next').onclick = () => playLevel(id + 1);
    c.querySelector('#back').onclick = () => {
      closeSheet();
      showLevels();
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
    <p>Press a ball in the middle of the board and swipe right: the eight
    balls around it turn clockwise. Swipe left to turn the other way. Let
    go near where you started to cancel.</p>
    <p>On a computer: left click turns counter-clockwise, right click
    clockwise. Dragging works too.</p>
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

function chooseTheme() {
  const cur = store.settings.theme;
  sheet(`<h2>Theme</h2><div class="menulist">${THEME_ORDER.map((id) =>
    `<button data-id="${id}" class="${id === cur ? 'on' : ''}">`
    + `${THEMES[id].name}</button>`).join('')}</div>
    <div class="row"><button id="close">Close</button></div>`, (c) => {
    c.querySelectorAll('[data-id]').forEach((b) => {
      b.onclick = () => {
        store.settings.theme = b.dataset.id;
        save(store);
        applyTheme(b.dataset.id);
        chooseTheme();
      };
    });
    c.querySelector('#close').onclick = closeSheet;
  });
}

// --- pages and menu ----------------------------------------------------

function showPage(id) {
  for (const p of ['start', 'levels', 'play']) $(p).hidden = p !== id;
  game.page = id;
}

function showStart() {
  closeSheet();
  showPage('start');
}

function playLevel(id) {
  ctx.levelId = id;
  start('level');
}

function showLevels() {
  const list = $('levellist');
  list.textContent = '';
  const seen = store.chapters;
  store.chapters = unlockedCount(LEVELS, store.levels, seen);
  if (store.chapters !== seen) save(store);
  const { open, teaser } = visibleChapters(
    LEVELS, store.levels, store.chapters);
  for (const ch of open) {
    const h = document.createElement('h3');
    h.textContent = `Chapter ${ch}`;
    const row = document.createElement('div');
    row.className = 'levelrow';
    for (const l of LEVELS.filter((x) => x.chapter === ch)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = store.levels[l.id] ? 'done' : '';
      b.innerHTML = `<b>${l.id + 1}</b>${DAYS[l.day].slice(0, 3)}`;
      b.onclick = () => playLevel(l.id);
      row.appendChild(b);
    }
    list.append(h, row);
  }
  if (teaser) {
    const t = document.createElement('div');
    t.className = 'teaser';
    t.textContent = `Next chapter: solve ${teaser.remaining} more`;
    list.appendChild(t);
  }
  const foot = document.createElement('div');
  foot.className = 'levelfoot';
  foot.innerHTML = '<button type="button">Practice</button>';
  foot.firstChild.onclick = () => start('practice');
  list.appendChild(foot);
  showPage('levels');
}

function showMenu() {
  const inPlay = game.page === 'play';
  const canRestart = inPlay && game.session.moves.length > 0;
  sheet(`<h2>Menu</h2><div class="menulist">
    <button id="m-help">How to play</button>
    <button id="m-stats">Stats</button>
    <button id="m-theme">Theme</button>
    <button id="m-controls">Controls: ${store.settings.controls === 'tap'
    ? 'Tap &amp; hold' : 'Swipe'}</button>
    ${inPlay ? `<button id="m-restart" ${canRestart ? '' : 'disabled'}>`
      + 'Restart</button>' : ''}
    ${game.page !== 'start'
    ? '<button id="m-start">Back to start</button>' : ''}
    </div><div class="row"><button id="close">Close</button></div>`, (c) => {
    c.querySelector('#m-help').onclick = showHelp;
    c.querySelector('#m-stats').onclick = showStats;
    c.querySelector('#m-theme').onclick = chooseTheme;
    c.querySelector('#m-controls').onclick = () => {
      store.settings.controls = store.settings.controls === 'tap'
        ? 'swipe' : 'tap';
      save(store);
      showMenu();
    };
    c.querySelector('#close').onclick = closeSheet;
    const st = c.querySelector('#m-start');
    if (st) st.onclick = showStart;
    const rs = c.querySelector('#m-restart');
    if (rs) {
      // A second tap confirms; twists exist, so a slip would cost them.
      rs.onclick = () => {
        if (!rs.classList.contains('confirm')) {
          rs.classList.add('confirm');
          rs.textContent = 'Restart? Tap again';
          return;
        }
        closeSheet();
        doRestart();
      };
    }
  });
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
  bindBoard();
  $('menu').onclick = showMenu;
  $('go-daily').onclick = () => start('daily');
  $('go-levels').onclick = showLevels;
  $('go-custom').onclick = chooseTheme;
  $('sheet').addEventListener('pointerdown', (ev) => {
    if (ev.target === $('sheet')) closeSheet();
  });
  const first = !store.settings.tutorialDone && !params.has('skip');
  if (first) start('tutorial');
  else showStart();
  registerWorker();
  // Read-only hooks for automated checks.
  window.__bt = {
    level: () => game.level,
    session: () => game.session,
    lastShare: () => game.lastShare,
    CW, CCW,
    controls: () => store.settings.controls || 'swipe',
  };
}

init();
