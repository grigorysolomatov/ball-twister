// UI glue: renders a session, handles input, owns screens and storage.
// Game rules live in src/core; looks live in themes.js.

import { CCW, CW, SIZE, canTwist, decodeTurn, ringCells }
  from '../core/board.js';
import { createSession } from '../core/session.js';
import { LEVELS } from '../core/levels.js';
import { unlockedCount, visibleChapters } from '../core/progress.js';
import { dateInfo } from '../core/puzzle.js';
import { shareText } from '../core/share.js';
import { summarize, updateRecord } from '../core/stats.js';
import { getMode } from '../modes.js';
import { PART_ORDER, PARTS, PRESETS, applyLook, isUnlocked,
  resolveLook } from './themes.js';
import { load, save } from './storage.js';
import { CONTROLS, HOLD_MS, QUARTER, createDrag, createTaps, dragMove,
  dragStart, dragTurns, holdDirection, isTap, tapDue, tapUp }
  from '../core/gesture.js';

const SNAP_MS = 240;
const CLICK_MS = 600;
const easeOutQuint = (t) => 1 - (1 - t) ** 5;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
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

// Turn a ring as ONE rigid square: the 3x3 block is lifted into a group
// that rotates around the ring centre, so corners stay corners and edge
// balls stay edge midpoints at every angle. Balls are counter-rotated so
// their drop shadow keeps pointing down and they do not look like they
// spin.
function spinGroup(r, c) {
  if (game.spin && game.spin.r === r && game.spin.c === c) {
    return game.spin;
  }
  const el = document.createElement('div');
  el.className = 'spin';
  el.style.left = `${(c - 1) * 100 / SIZE}%`;
  el.style.top = `${(r - 1) * 100 / SIZE}%`;
  const balls = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const b = game.balls[(r + dr) * SIZE + c + dc];
      b.style.transition = 'none';
      b.style.transform = `translate(${(dc + 1) * 100}%, ${(dr + 1) * 100}%)`;
      el.appendChild(b);
      balls.push(b);
    }
  }
  $('balls').appendChild(el);
  game.spin = { r, c, el, balls };
  return game.spin;
}

function poseRing(r, c, theta) {
  const s = spinGroup(r, c);
  const deg = theta * 180 / Math.PI;
  s.el.style.transform = `rotate(${deg}deg)`;
  for (const b of s.balls) b.firstChild.style.transform = `rotate(${-deg}deg)`;
}

// Light detents: the shown angle lingers a little at each quarter turn.
function magnet(theta) {
  const m = Math.round(theta / QUARTER) * QUARTER;
  const d = theta - m;
  return m + d * (0.65 + 0.35 * Math.min(1, Math.abs(d) / 0.35));
}

// Animate a ring from one angle to another, then call done. A running
// animation is finished at once so quick clicks never stack up.
function animateRing(r, c, from, to, ms, ease, done) {
  if (game.anim) game.anim.finish();
  const t0 = performance.now();
  let raf = 0;
  let over = false;
  const end = () => {
    if (over) return;
    over = true;
    cancelAnimationFrame(raf);
    game.anim = null;
    poseRing(r, c, to);
    done();
  };
  const frame = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    poseRing(r, c, from + (to - from) * ease(t));
    if (t < 1) raf = requestAnimationFrame(frame);
    else end();
  };
  game.anim = { finish: end };
  raf = requestAnimationFrame(frame);
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

// Highlight the 3x3 ring being pressed or dragged.
function showFocus(cell) {
  const el = $('focus');
  if (!cell) {
    el.hidden = true;
    return;
  }
  const [r, c] = cell;
  el.hidden = false;
  el.style.left = `${(c - 1) * 100 / SIZE}%`;
  el.style.top = `${(r - 1) * 100 / SIZE}%`;
}

// --- drag handle -------------------------------------------------------
// A soft line from the pivot to the finger plus two curved arrows around
// the ring. The arrow for the current turning direction lights up.
const SVGNS = 'http://www.w3.org/2000/svg';
const HANDLE_R = 1.62; // arrow radius in cells

function svgEl(name, attrs) {
  const el = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  return el;
}

function arcPath(cx, cy, r, a0, a1) {
  const pt = (a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  return `M ${pt(a0)} A ${r} ${r} 0 0 ${a1 > a0 ? 1 : 0} ${pt(a1)}`;
}

function arrowHead(cx, cy, r, a, dir, size) {
  // Tip sits on the arc at angle a; points along the direction of travel.
  const tx = cx + r * Math.cos(a);
  const ty = cy + r * Math.sin(a);
  const t = a + dir * Math.PI / 2; // tangent angle
  const w = (k) => [tx - size * Math.cos(t) + k * size * 0.7 * Math.cos(t + Math.PI / 2),
    ty - size * Math.sin(t) + k * size * 0.7 * Math.sin(t + Math.PI / 2)];
  const [x1, y1] = w(1);
  const [x2, y2] = w(-1);
  return `M ${x1} ${y1} L ${tx} ${ty} L ${x2} ${y2}`;
}

function makeHandle(cx, cy, cellPx) {
  const layer = $('hits');
  killHandle();
  const r = cellPx * HANDLE_R;
  const svg = svgEl('svg', { class: 'handle' });
  const line = svgEl('line', { x1: cx, y1: cy, x2: cx, y2: cy, class: 'h-line' });
  const dot = svgEl('circle', { cx, cy, r: cellPx * 0.1, class: 'h-dot' });
  const mk = (cls, a0, a1, dir) => {
    const g = svgEl('g', { class: `h-arrow ${cls}` });
    g.appendChild(svgEl('path', { d: arcPath(cx, cy, r, a0, a1) }));
    g.appendChild(svgEl('path', { d: arrowHead(cx, cy, r, a1, dir, cellPx * 0.2) }));
    svg.appendChild(g);
    return g;
  };
  const d = Math.PI / 180;
  const cw = mk('cw', -80 * d, -20 * d, 1);
  const ccw = mk('ccw', 100 * d, 160 * d, 1);
  // The second arrow runs the other way round: reverse its path.
  ccw.firstChild.setAttribute('d', arcPath(cx, cy, r, 160 * d, 100 * d));
  ccw.lastChild.setAttribute('d', arrowHead(cx, cy, r, 100 * d, -1, cellPx * 0.2));
  svg.insertBefore(line, svg.firstChild);
  svg.insertBefore(dot, svg.firstChild);
  layer.appendChild(svg);
  requestAnimationFrame(() => svg.classList.add('on'));
  game.handle = { svg, line, cw, ccw, cx, cy };
}

function moveHandle(x, y, theta) {
  const h = game.handle;
  if (!h) return;
  h.line.setAttribute('x2', x);
  h.line.setAttribute('y2', y);
  h.cw.classList.toggle('hot', theta > 0.08);
  h.ccw.classList.toggle('hot', theta < -0.08);
}

function killHandle() {
  const h = game.handle;
  if (!h) return;
  game.handle = null;
  h.svg.classList.remove('on');
  setTimeout(() => h.svg.remove(), 260);
}

function dragHint(cell) {
  showFocus(cell);
  setTimeout(() => showFocus(null), 350);
  const n = store.settings.dragHints || 0;
  if (n >= 3) return;
  store.settings.dragHints = n + 1;
  save(store);
  toast('Drag around the ring');
}

function updateButtons() {
  $('undo').disabled = game.session.moves.length === 0;
}

// Turn a ring by k clockwise quarters with an animation from `from`.
function commitTurn(r, c, k, from, ms, ease) {
  const s = game.session;
  const turned = !s.solved() && s.turn(r, c, k);
  const to = k * QUARTER;
  animateRing(r, c, from, to, ms, ease, () => {
    game.spin = null;
    renderBalls();
    updateButtons();
    if (turned && s.solved()) {
      $('board').classList.add('solved');
      setTimeout(onSolved, 650);
    }
  });
  updateButtons();
}

function doTwist(r, c, dir) {
  if (game.session.solved()) return;
  commitTurn(r, c, dir, 0, CLICK_MS, easeOutQuint);
}

function doUndo() {
  const s = game.session;
  const move = s.undo();
  if (move === null) return;
  const { r, c, q } = decodeTurn(move);
  // Show the ring turning back by the shorter way round.
  const back = q <= 2 ? -q : 4 - q;
  animateRing(r, c, 0, back * QUARTER, CLICK_MS, easeOutQuint, () => {
    game.spin = null;
    renderBalls();
    updateButtons();
  });
  updateButtons();
}

function doRestart() {
  game.session.restart();
  renderBalls();
  updateButtons();
}

// --- input -------------------------------------------------------------

function controlMode() {
  const m = store.settings.controls;
  return CONTROLS.includes(m) ? m : 'drag';
}

// Double-tap mode: a lone tap fires once the window has passed.
const taps = createTaps();
let tapTimer = 0;
function tapInput(r, c) {
  const flush = (list) => {
    for (const t of list) {
      const [tr, tc] = t.key.split(',').map(Number);
      doTwist(tr, tc, t.dir);
    }
  };
  flush(tapUp(taps, `${r},${c}`, performance.now()));
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => flush(tapDue(taps, performance.now())),
    DOUBLE_WAIT);
}
const DOUBLE_WAIT = 255;

function bindBoard() {
  const layer = $('hits');
  let press = null;
  const cellOf = (ev) => {
    const el = ev.target.closest('.hit.ok');
    return el ? [+el.dataset.r, +el.dataset.c] : null;
  };
  const drop = () => {
    if (press) clearTimeout(press.holdTimer);
    press = null;
    showFocus(null);
    const f = $('focus');
    if (f) f.classList.remove('hold');
  };
  layer.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    const cell = cellOf(ev);
    if (!cell) return;
    // A lost pointer-up must not freeze the board: replace stale presses.
    drop();
    const mouse = ev.pointerType === 'mouse';
    // Right click: clockwise quarter turn, no menu.
    if (mouse && ev.button === 2) {
      doTwist(cell[0], cell[1], CW);
      return;
    }
    if (mouse && ev.button !== 0) return;
    if (game.session.solved()) return;
    if (game.anim) game.anim.finish();
    const rect = ev.target.closest('.hit').getBoundingClientRect();
    const g = createDrag({ x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2 }, rect.width);
    dragStart(g, ev.clientX, ev.clientY);
    press = { cell, id: ev.pointerId, g, mouse, t0: performance.now() };
    try { layer.setPointerCapture(ev.pointerId); } catch (err) { /* ok */ }
    showFocus(cell);
    const lr = layer.getBoundingClientRect();
    if (controlMode() === 'drag') {
      makeHandle(g.centre.x - lr.left, g.centre.y - lr.top, rect.width);
      press.lr = lr;
    } else if (controlMode() === 'hold') {
      press.holdTimer = setTimeout(() => {
        if (press && press.id === ev.pointerId && isTap(press.g)) {
          press.held = true;
          if (navigator.vibrate) navigator.vibrate(10);
          showFocus(press.cell);
          $('focus').classList.add('hold');
        }
      }, HOLD_MS);
    }
  });
  layer.addEventListener('pointermove', (ev) => {
    if (!press || press.id !== ev.pointerId) return;
    dragMove(press.g, ev.clientX, ev.clientY);
    if (press.lr) {
      moveHandle(ev.clientX - press.lr.left, ev.clientY - press.lr.top,
        press.g.theta);
    }
    if (controlMode() !== 'drag' && isTap(press.g)) return;
    if (press.g.theta === 0 && !press.spun) return;
    press.spun = true;
    const shown = magnet(press.g.theta);
    press.shown = shown;
    const q = Math.round(shown / QUARTER);
    if (press.q !== undefined && q !== press.q && navigator.vibrate) {
      navigator.vibrate(5);
    }
    press.q = q;
    poseRing(press.cell[0], press.cell[1], shown);
  });
  const finish = (ev, cancel) => {
    if (!press || press.id !== ev.pointerId) return;
    const p = press;
    clearTimeout(p.holdTimer);
    drop();
    killHandle();
    const [r, c] = p.cell;
    if (!cancel) dragMove(p.g, ev.clientX, ev.clientY);
    const k = cancel ? 0 : dragTurns(p.g);
    if (!cancel && p.g.theta === 0 && isTap(p.g)) {
      const mode = controlMode();
      if (mode === 'hold') {
        doTwist(r, c, holdDirection(performance.now() - p.t0));
      } else if (mode === 'tap2') {
        tapInput(r, c);
      } else if (p.mouse) {
        // Mouse: left click is counter-clockwise. Touch: just a hint.
        doTwist(r, c, CCW);
      } else {
        dragHint(p.cell);
      }
      return;
    }
    commitTurn(r, c, k, p.shown === undefined ? p.g.theta : p.shown,
      SNAP_MS, easeOutCubic);
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
  'One ball is off its ring. Press the ball between the red one and the '
    + 'ring, then drag around it.',
  'Drag around a ball to turn the eight around it. Let go and they '
    + 'snap to a quarter turn. Match the faint rings.',
  'Turn as far as you like: half a turn or more still counts as one '
    + 'move, and so does turning the same ring again.',
  'Undo takes back a move. Hold Solution to see the solved board.',
];

function start(modeId, level) {
  game.mode = getMode(modeId);
  game.level = level || game.mode.next(ctx);
  game.session = createSession(game.level);
  game.t0 = Date.now();
  $('label').textContent = game.mode.label(game.level);
  $('ptitle').textContent = game.level.heading || 'Ball Twister';
  $('hint').textContent = game.level.hint ? game.level.hint
    : modeId === 'tutorial'
    ? HINTS[game.level.step]
    : modeId === 'daily'
      ? 'Make the balls match the rings.'
      : modeId === 'level'
        ? 'Make the balls match the rings.'
        : 'Practice puzzles do not count towards stats.';
  closeSheet();
  $('board').classList.remove('solved');
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
  if (game.mode.onSolved) return game.mode.onSolved(result);
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
    <p>moves</p><div class="row">
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
    <p>moves</p><div class="row"><button class="primary" id="again">
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
    <div class="big">${result.twists}</div><p>moves</p>
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
    <p>Press a ball in the middle of the board and drag around it: the
    eight balls around it follow your finger. Let go and they snap to the
    nearest quarter turn. Let go near where you started to cancel.</p>
    <p>Turn as far as you like. One ring turned any amount is one move,
    and turning the same ring again keeps it the same move. Turn it back
    to the start and the move disappears.</p>
    <p>On a computer: left click turns counter-clockwise, right click
    clockwise. Dragging works too. The Controls setting in the menu offers tap and double-tap or tap and hold instead.</p>
    <p>Make the board match the faint rings. Fewer moves is a better
    score. Undo takes a move back.</p>
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

const CONTROL_LABELS = {
  drag: ['Drag', 'Press a ball and drag around it'],
  tap2: ['Tap and double-tap', 'Tap turns clockwise, double-tap counter-clockwise'],
  hold: ['Tap and hold', 'Tap turns clockwise, press and hold counter-clockwise'],
};

function chooseControls() {
  const cur = controlMode();
  sheet(`<h2>Controls</h2><div class="menulist">${CONTROLS.map((id) =>
    `<button data-id="${id}" class="opt ${id === cur ? 'on' : ''}">`
    + `<b>${CONTROL_LABELS[id][0]}</b><small>${CONTROL_LABELS[id][1]}</small>`
    + '</button>').join('')}</div>
    <div class="row"><button id="back">Back</button></div>`, (c) => {
    c.querySelectorAll('[data-id]').forEach((b) => {
      b.onclick = () => {
        store.settings.controls = b.dataset.id;
        save(store);
        c.querySelectorAll('[data-id]').forEach((o) =>
          o.classList.toggle('on', o === b));
      };
    });
    c.querySelector('#back').onclick = showMenu;
  });
}

// Customise: four pickers, each option drawn as a live mini board or
// swatch. Picks apply at once and persist in settings.look.
function swatchHtml(part, o, look) {
  const l = { ...look, [part]: o.id };
  const v = lookVarsFor(l);
  const st = Object.entries(v).map(([k, x]) => `${k}:${x}`).join(';');
  if (part === 'board') {
    return `<span class="sw board" style="${st};background:${o.css};`
      + 'box-shadow:var(--board-shadow)"><i class="c0"></i><i class="c1">'
      + '</i><i class="c1"></i><i class="c0"></i></span>';
  }
  if (part === 'background') {
    return `<span class="sw bgsw" style="background:${o.css};${st}">`
      + '<em style="background:var(--btn)"></em>'
      + '<em style="background:var(--accent)"></em></span>';
  }
  return `<span class="sw orb" style="background:${o.css}"></span>`;
}

function lookVarsFor(look) {
  const out = {};
  const probe = { style: { setProperty: (k, v) => { out[k] = v; } } };
  applyLook(look, probe);
  return out;
}

function showCustomise() {
  const look = resolveLook(store.settings.look);
  const sections = PART_ORDER.map((part) => `<h3>${PARTS[part].label}</h3>
    <div class="picker" data-part="${part}">${PARTS[part].options
    .filter(isUnlocked).map((o) =>
      `<button type="button" data-id="${o.id}" aria-label="${o.name}"
        class="${o.id === look[part] ? 'on' : ''}">`
      + `${swatchHtml(part, o, look)}<small>${o.name}</small></button>`)
    .join('')}</div>`).join('');
  sheet(`<h2>Customize</h2><div class="custom">${sections}</div>
    <div class="row"><button id="reset">Reset</button>
    <button class="primary" id="done">Done</button></div>`, (c) => {
    c.classList.add('wide');
    const pick = (part, id) => {
      const next = { ...resolveLook(store.settings.look), [part]: id };
      store.settings.look = next;
      save(store);
      applyLook(next);
      const sc = c.querySelector('.custom').scrollTop;
      showCustomise();
      c.querySelector('.custom').scrollTop = sc;
    };
    c.querySelectorAll('.picker').forEach((pk) => {
      pk.querySelectorAll('button').forEach((b) => {
        b.onclick = () => pick(pk.dataset.part, b.dataset.id);
      });
    });
    c.querySelector('#reset').onclick = () => {
      store.settings.look = null;
      save(store);
      applyLook(PRESETS.terracotta);
      showCustomise();
    };
    c.querySelector('#done').onclick = closeSheet;
  });
}

function currentLook() {
  const t = params.get('theme');
  return t && PRESETS[t] ? PRESETS[t] : store.settings.look;
}

// --- pages and menu ----------------------------------------------------

function showPage(id) {
  for (const p of ['start', 'levels', 'play']) $(p).hidden = p !== id;
  $(id).classList.remove('enter');
  void $(id).offsetWidth; // restart the fade-in
  $(id).classList.add('enter');
  game.page = id;
  document.dispatchEvent(new CustomEvent('bt:page', { detail: id }));
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
      b.innerHTML = `<b>${l.level}</b><span></span>`;
      b.lastChild.textContent = l.title;
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
    <button id="m-custom">Customize</button>
    <button id="m-controls">Controls</button>
    ${inPlay ? `<button id="m-restart" ${canRestart ? '' : 'disabled'}>`
      + 'Restart</button>' : ''}
    ${game.page !== 'start'
    ? '<button id="m-start">Back to start</button>' : ''}
    </div><div class="row"><button id="close">Close</button></div>`, (c) => {
    c.querySelector('#m-help').onclick = showHelp;
    c.querySelector('#m-stats').onclick = showStats;
    c.querySelector('#m-custom').onclick = showCustomise;
    c.querySelector('#m-controls').onclick = chooseControls;
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

// Optional plugins (src/plugins). Deleting that folder is enough: a
// failed import is ignored. See src/plugins/editor/README.md.
function loadPlugins() {
  const api = { LEVELS, play: (level) => start('editor-test', level),
    sheet, closeSheet, toast, showPage, showStart, page: () => game.page };
  import('../plugins/config.js')
    .then((c) => c.EDITOR_ENABLED && import('../plugins/editor/editor.js'))
    .then((m) => m && m.install(api))
    .catch(() => {});
}

function init() {
  applyLook(currentLook());
  bindBoard();
  $('menu').onclick = showMenu;
  $('go-daily').onclick = () => start('daily');
  $('go-levels').onclick = showLevels;
  $('go-custom').onclick = showCustomise;
  $('sheet').addEventListener('pointerdown', (ev) => {
    if (ev.target === $('sheet')) closeSheet();
  });
  const first = !store.settings.tutorialDone && !params.has('skip');
  if (first) start('tutorial');
  else showStart();
  registerWorker();
  loadPlugins();
  // Read-only hooks for automated checks.
  window.__bt = {
    level: () => game.level,
    session: () => game.session,
    lastShare: () => game.lastShare,
    CW, CCW,
  };
}

init();
