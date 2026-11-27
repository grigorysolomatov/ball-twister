// Level editor plugin. Self-contained: see README.md in this folder.
// Draws on the app only through the `api` object given to install().

import { registerMode } from '../../modes.js';
import { scramble } from '../../core/puzzle.js';
import { mulberry32 } from '../../core/prng.js';

const KEY = 'bt-editor-levels';
const N = 7;
const CELLS = N * N;
const RE_ROW = /^[X.]{7}$/;

// --- data --------------------------------------------------------------

export function rowsOf(cells) {
  const rows = [];
  for (let r = 0; r < N; r++) {
    rows.push(cells.slice(r * N, r * N + N)
      .map((v) => (v ? 'X' : '.')).join(''));
  }
  return rows;
}

export function cellsOf(rows) {
  return rows.join('').split('').map((ch) => (ch === 'X' ? 1 : 0));
}

function loadSaved() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(list)) return list.filter(valid);
  } catch (err) { /* empty or broken storage */ }
  return [];
}

function valid(l) {
  return l && typeof l.title === 'string' && Array.isArray(l.rows)
    && l.rows.length === N && l.rows.every((r) => RE_ROW.test(r));
}

function persist(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

// Returns { levels, error } from pasted or file text.
export function parseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch (err) {
    return { error: 'That is not valid JSON.' };
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { error: 'Expected a list of levels.' };
  }
  const levels = [];
  for (let i = 0; i < data.length; i++) {
    const l = data[i];
    const at = `Level ${i + 1}`;
    if (!l || !Array.isArray(l.rows) || l.rows.length !== N
      || !l.rows.every((r) => typeof r === 'string' && RE_ROW.test(r))) {
      return { error: `${at}: rows must be 7 strings of 7 X or . characters.` };
    }
    const balls = l.rows.join('').replaceAll('.', '').length;
    if (balls === 0) return { error: `${at}: the board is empty.` };
    if (balls === CELLS) return { error: `${at}: the board is full.` };
    let chapter = null;
    if (l.chapter !== null && l.chapter !== undefined && l.chapter !== '') {
      chapter = Number(l.chapter);
      if (!Number.isInteger(chapter) || chapter < 1) {
        return { error: `${at}: chapter must be a whole number or empty.` };
      }
    }
    const title = typeof l.title === 'string' && l.title.trim()
      ? l.title.trim() : 'Untitled';
    levels.push({ title, chapter, rows: l.rows.slice() });
  }
  return { levels };
}

// --- install -----------------------------------------------------------

export function install(api) {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('./editor.css', import.meta.url).href;
  document.head.appendChild(css);

  let saved = loadSaved();
  const cur = { index: null, title: '', chapter: '', cells: new Array(CELLS).fill(0) };
  let depth = 9;
  let last = null;

  registerMode({
    id: 'editor-test',
    title: 'Editor test',
    next() { throw new Error('editor levels are passed in'); },
    label(level) { return level.label; },
    tracksStats: false, shareable: false, replayable: false,
    onSolved(result) {
      api.sheet(`<h2>Solved</h2><div class="big">${result.twists}</div>
        <p>moves</p><div class="row">
        <button class="primary" id="again">Test again</button>
        <button id="back">Editor</button></div>`, (c) => {
        c.querySelector('#again').onclick = playTest;
        c.querySelector('#back').onclick = () => { api.closeSheet(); open(); };
      });
    },
  });

  // Start-screen button.
  const startBtns = document.querySelector('#start .bigbtns');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'go-editor';
  btn.textContent = 'Editor';
  btn.onclick = () => open();
  startBtns.appendChild(btn);

  // Editor page.
  const page = document.createElement('section');
  page.id = 'editor';
  page.className = 'page ed';
  page.hidden = true;
  page.innerHTML = `
    <h1>Editor</h1>
    <div class="ed-scroll">
      <div class="ed-fields">
        <input id="ed-title" type="text" maxlength="20"
          placeholder="Level name" autocomplete="off">
        <input id="ed-chapter" type="number" min="1" step="1"
          inputmode="numeric" placeholder="unsorted">
      </div>
      <div id="ed-board" class="board ed-board"><div class="layer"
        id="ed-balls"></div></div>
      <p id="ed-count" class="sub"></p>
      <div class="ed-tools">
        <button type="button" data-act="clear">Clear</button>
        <button type="button" data-act="invert">Invert</button>
        <button type="button" data-act="mh">Flip \u2194</button>
        <button type="button" data-act="mv">Flip \u2195</button>
        <button type="button" data-act="rot">Rotate</button>
      </div>
      <label class="ed-depth">Scramble <b id="ed-depthv"></b> twists
        <input id="ed-depth" type="range" min="2" max="20" value="9"></label>
      <div class="ed-main">
        <button type="button" id="ed-play" class="primary">Play-test</button>
        <button type="button" id="ed-save" class="primary">Save</button>
        <button type="button" id="ed-new">New</button>
      </div>
      <p id="ed-msg" class="sub ed-msg"></p>
      <h3>Saved levels</h3>
      <div id="ed-list" class="ed-list"></div>
      <div class="ed-main">
        <button type="button" id="ed-builtin">Load built-in</button>
        <button type="button" id="ed-export">Export all</button>
        <button type="button" id="ed-import">Import</button>
      </div>
      <div class="ed-main"><button type="button" id="ed-back">Back</button>
      </div>
    </div>`;
  document.getElementById('app').appendChild(page);
  const $ = (id) => page.querySelector(`#${id}`);

  const balls = $('ed-balls');
  const els = [];
  for (let i = 0; i < CELLS; i++) {
    const el = document.createElement('div');
    el.className = 'ball c0';
    el.style.transform = `translate(${(i % N) * 100}%, ${Math.floor(i / N) * 100}%)`;
    el.appendChild(document.createElement('i'));
    balls.appendChild(el);
    els.push(el);
  }

  document.addEventListener('bt:page', (ev) => {
    page.hidden = ev.detail !== 'editor';
  });

  function msg(text, warn) {
    const el = $('ed-msg');
    el.textContent = text || '';
    el.classList.toggle('warn', !!warn);
  }

  function ballCount() { return cur.cells.reduce((a, b) => a + b, 0); }

  function draw() {
    cur.cells.forEach((v, i) => { els[i].className = `ball c${v}`; });
    $('ed-count').textContent = `${ballCount()} balls`
      + (cur.index === null ? ' \u00b7 new level' : ' \u00b7 saved level');
    $('ed-depthv').textContent = depth;
  }

  function open() {
    api.showPage('editor');
    page.hidden = false;
    $('ed-title').value = cur.title;
    $('ed-chapter').value = cur.chapter;
    draw();
    renderList();
  }

  // Painting: first cell touched decides the colour, drag paints it.
  let paint = null;
  const board = $('ed-board');
  const cellAt = (ev) => {
    const rect = balls.getBoundingClientRect();
    const c = Math.floor((ev.clientX - rect.left) / rect.width * N);
    const r = Math.floor((ev.clientY - rect.top) / rect.height * N);
    return r >= 0 && r < N && c >= 0 && c < N ? r * N + c : -1;
  };
  const set = (i, v) => {
    if (i < 0 || cur.cells[i] === v) return;
    cur.cells[i] = v;
    draw();
  };
  board.addEventListener('pointerdown', (ev) => {
    const i = cellAt(ev);
    if (i < 0) return;
    ev.preventDefault();
    board.setPointerCapture(ev.pointerId);
    paint = 1 - cur.cells[i];
    set(i, paint);
    msg('');
  });
  board.addEventListener('pointermove', (ev) => {
    if (paint !== null) set(cellAt(ev), paint);
  });
  for (const t of ['pointerup', 'pointercancel']) {
    board.addEventListener(t, () => { paint = null; });
  }
  board.addEventListener('touchmove', (ev) => ev.preventDefault(),
    { passive: false });

  const tools = {
    clear: () => cur.cells.fill(0),
    invert: () => { cur.cells = cur.cells.map((v) => 1 - v); },
    mh: () => {
      cur.cells = cur.cells.map((_, i) =>
        cur.cells[Math.floor(i / N) * N + (N - 1 - (i % N))]);
    },
    mv: () => {
      cur.cells = cur.cells.map((_, i) =>
        cur.cells[(N - 1 - Math.floor(i / N)) * N + (i % N)]);
    },
    // Clockwise: new[r][c] = old[N-1-c][r].
    rot: () => {
      cur.cells = cur.cells.map((_, i) =>
        cur.cells[(N - 1 - (i % N)) * N + Math.floor(i / N)]);
    },
  };
  page.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => { tools[b.dataset.act](); msg(''); draw(); };
  });

  $('ed-title').oninput = (ev) => { cur.title = ev.target.value; };
  $('ed-chapter').oninput = (ev) => { cur.chapter = ev.target.value; };
  $('ed-depth').oninput = (ev) => { depth = +ev.target.value; draw(); };

  function check() {
    const n = ballCount();
    if (n === 0) return 'The board is empty. Add some balls first.';
    if (n === CELLS) return 'The board is full. Take some balls away.';
    return '';
  }

  function chapterValue() {
    const v = String(cur.chapter).trim();
    if (!v) return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 ? n : NaN;
  }

  function duplicateOf(rows) {
    const text = rows.join('');
    const built = api.LEVELS.find((l) => l.target === text);
    if (built) return `built-in level "${built.title}"`;
    const mine = saved.find((l, i) => i !== cur.index && l.rows.join('') === text);
    return mine ? `saved level "${mine.title}"` : '';
  }

  function playTest() {
    const bad = check();
    if (bad) { open(); msg(bad, true); return; }
    const rows = rowsOf(cur.cells);
    const target = rows.join('');
    let result;
    try {
      result = scramble(target, depth, mulberry32((Math.random() * 2 ** 32) >>> 0));
    } catch (err) {
      msg('Could not scramble this pattern. Try a smaller scramble.', true);
      return;
    }
    api.closeSheet();
    api.play(last = {
      kind: 'editor-test', name: cur.title || 'Untitled',
      heading: cur.title.trim() || 'Untitled',
      label: 'Play-test', hint: 'Make the balls match the rings.',
      target, start: result.start, solution: result.solution,
    });
  }

  function save() {
    const bad = check();
    if (bad) return msg(bad, true);
    const chapter = chapterValue();
    if (Number.isNaN(chapter)) {
      return msg('Chapter must be a whole number, or empty.', true);
    }
    const rows = rowsOf(cur.cells);
    const entry = { title: cur.title.trim() || 'Untitled', chapter, rows };
    const dup = duplicateOf(rows);
    if (cur.index === null) { saved.push(entry); cur.index = saved.length - 1; }
    else saved[cur.index] = entry;
    persist(saved);
    cur.title = entry.title;
    $('ed-title').value = cur.title;
    draw();
    renderList();
    msg(dup ? `Saved. Note: same pattern as ${dup}.` : 'Saved.', !!dup);
  }

  function load(entry, index) {
    cur.index = index;
    cur.title = entry.title;
    cur.chapter = entry.chapter === null || entry.chapter === undefined
      ? '' : String(entry.chapter);
    cur.cells = cellsOf(entry.rows);
    msg('');
    open();
  }

  function fresh() {
    cur.index = null; cur.title = ''; cur.chapter = '';
    cur.cells = new Array(CELLS).fill(0);
    msg('');
    open();
  }

  $('ed-play').onclick = playTest;
  $('ed-save').onclick = save;
  $('ed-new').onclick = fresh;
  $('ed-back').onclick = () => api.showStart();

  function thumb(rows) {
    const t = document.createElement('div');
    t.className = 'thumb';
    for (const ch of rows.join('')) {
      const d = document.createElement('i');
      if (ch === 'X') d.className = 'on';
      t.appendChild(d);
    }
    return t;
  }

  function renderList() {
    const list = $('ed-list');
    list.textContent = '';
    if (!saved.length) {
      list.innerHTML = '<p class="sub">Nothing saved yet.</p>';
      return;
    }
    saved.forEach((entry, i) => {
      const row = document.createElement('div');
      row.className = 'ed-item' + (i === cur.index ? ' on' : '');
      const open_ = document.createElement('button');
      open_.type = 'button';
      open_.className = 'ed-open';
      const name = document.createElement('span');
      name.textContent = entry.title;
      const small = document.createElement('small');
      small.textContent = entry.chapter ? `Chapter ${entry.chapter}` : 'unsorted';
      open_.append(thumb(entry.rows), name, small);
      open_.onclick = () => load(entry, i);
      const dup = document.createElement('button');
      dup.type = 'button'; dup.className = 'ed-mini'; dup.textContent = 'Copy';
      dup.onclick = () => {
        saved.splice(i + 1, 0, { ...entry, title: `${entry.title} copy`.slice(0, 20),
          rows: entry.rows.slice() });
        persist(saved);
        if (cur.index !== null && cur.index > i) cur.index += 1;
        renderList();
      };
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'ed-mini'; del.textContent = 'Delete';
      del.onclick = () => {
        if (!del.classList.contains('confirm')) {
          del.classList.add('confirm');
          del.textContent = 'Sure?';
          setTimeout(() => { del.classList.remove('confirm'); del.textContent = 'Delete'; }, 3000);
          return;
        }
        saved.splice(i, 1);
        persist(saved);
        if (cur.index === i) cur.index = null;
        else if (cur.index !== null && cur.index > i) cur.index -= 1;
        draw();
        renderList();
      };
      row.append(open_, dup, del);
      list.appendChild(row);
    });
  }

  $('ed-builtin').onclick = () => {
    api.sheet(`<h2>Built-in levels</h2><div class="ed-built">${api.LEVELS.map((l) =>
      `<button data-id="${l.id}"><b>${l.id + 1}</b> ${l.title}</button>`).join('')}
      </div><div class="row"><button id="close">Close</button></div>`, (c) => {
      c.querySelector('#close').onclick = api.closeSheet;
      c.querySelectorAll('[data-id]').forEach((b) => {
        b.onclick = () => {
          const l = api.LEVELS[+b.dataset.id];
          api.closeSheet();
          load({ title: l.title, chapter: l.chapter,
            rows: rowsOf(l.target.split('').map((ch) => (ch === 'X' ? 1 : 0))) }, null);
        };
      });
    });
  };

  function exportJson() {
    return JSON.stringify(saved, null, 2);
  }

  $('ed-export').onclick = async () => {
    if (!saved.length) return msg('Save a level first, then export.', true);
    const json = exportJson();
    const day = new Date();
    const stamp = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `ball-twister-levels-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    let copied = false;
    try { await navigator.clipboard.writeText(json); copied = true; } catch (err) { /* ignore */ }
    msg(`Exported ${saved.length} level${saved.length === 1 ? '' : 's'}`
      + (copied ? ', file downloaded and copied.' : ', file downloaded.'));
  };

  function importText(text) {
    const { levels, error } = parseImport(text);
    if (error) return { error };
    const have = new Set(saved.map((l) => l.title + l.rows.join('')));
    let added = 0;
    let dups = 0;
    for (const l of levels) {
      if (have.has(l.title + l.rows.join(''))) continue;
      if (duplicateOf(l.rows)) dups += 1;
      saved.push(l);
      added += 1;
    }
    persist(saved);
    return { added, dups, skipped: levels.length - added };
  }

  $('ed-import').onclick = () => {
    api.sheet(`<h2>Import</h2>
      <p>Paste exported JSON, or choose a file.</p>
      <textarea id="imp-text" class="ed-text" rows="6"
        placeholder='[{"title":"Worm","chapter":1,"rows":[...]}]'></textarea>
      <input id="imp-file" type="file" accept=".json,application/json">
      <p id="imp-msg" class="ed-msg"></p>
      <div class="row"><button class="primary" id="imp-go">Import</button>
      <button id="close">Close</button></div>`, (c) => {
      const out = c.querySelector('#imp-msg');
      c.querySelector('#close').onclick = api.closeSheet;
      c.querySelector('#imp-file').onchange = async (ev) => {
        const f = ev.target.files[0];
        if (f) c.querySelector('#imp-text').value = await f.text();
      };
      c.querySelector('#imp-go').onclick = () => {
        const res = importText(c.querySelector('#imp-text').value);
        out.classList.toggle('warn', !!res.error || res.dups > 0);
        if (res.error) { out.textContent = res.error; return; }
        let text = `Imported ${res.added} level${res.added === 1 ? '' : 's'}.`;
        if (res.skipped) text += ` ${res.skipped} already saved, skipped.`;
        if (res.dups) text += ` Warning: ${res.dups} match a level that already exists.`;
        out.textContent = text;
        renderList();
      };
    });
  };

  // Hooks for automated checks.
  window.__btEditor = { saved: () => saved, parseImport, current: cur, last: () => last };
}
