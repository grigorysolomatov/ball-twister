// Level editor plugin. Self-contained: see README.md in this folder.
// Draws on the app only through the `api` object given to install().

import { registerMode } from '../../modes.js';
import { scramble } from '../../core/puzzle.js';
import { mulberry32 } from '../../core/prng.js';
import * as St from './store.js';

const N = 7;
const CELLS = N * N;
const OLD = 'old';

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

// --- install -----------------------------------------------------------

export function install(api) {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('./editor.css', import.meta.url).href;
  document.head.appendChild(css);

  const store = St.loadStore(localStorage);
  const persist = () => St.saveStore(localStorage, store);
  const curTab = () => store.tabs.find((t) => t.id === store.selected);
  const allSaved = () => store.tabs.flatMap((t) => t.levels);
  let testing = false;
  const cur = { tab: null, index: null, title: '',
    cells: new Array(CELLS).fill(0) };
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
      <div id="ed-tabs" class="ed-tabs"></div>
      <div id="ed-list" class="ed-list"></div>
      <div class="ed-main">
        <button type="button" id="ed-export">Export all</button>
        <button type="button" id="ed-share">Share</button>
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
  $('ed-depth').oninput = (ev) => { depth = +ev.target.value; draw(); };

  function check() {
    const n = ballCount();
    if (n === 0) return 'The board is empty. Add some balls first.';
    if (n === CELLS) return 'The board is full. Take some balls away.';
    return '';
  }

  function duplicateOf(rows) {
    const text = rows.join('');
    const built = api.LEVELS.find((l) => l.target === text);
    if (built) return `built-in level "${built.title}"`;
    const here = cur.tab && cur.index !== null ? store.tabs.find((t) => t.id === cur.tab).levels[cur.index] : null;
    const mine = allSaved().find((l) => l !== here && l.rows.join('') === text);
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
    testing = true;
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
    const rows = rowsOf(cur.cells);
    const entry = { title: cur.title.trim() || 'Untitled', rows };
    const dup = duplicateOf(rows);
    const own = cur.tab && store.tabs.find((t) => t.id === cur.tab);
    if (own && cur.index !== null && own.levels[cur.index]) {
      own.levels[cur.index] = entry;
    } else {
      const tab = store.selected === OLD ? store.tabs[0] : curTab();
      tab.levels.push(entry);
      cur.tab = tab.id; cur.index = tab.levels.length - 1;
      if (store.selected === OLD) store.selected = tab.id;
    }
    persist();
    cur.title = entry.title;
    $('ed-title').value = cur.title;
    draw();
    renderList();
    msg(dup ? `Saved. Note: same pattern as ${dup}.` : 'Saved.', !!dup);
  }

  function load(entry, tab, index) {
    cur.tab = tab; cur.index = index;
    cur.title = entry.title;
    cur.cells = cellsOf(entry.rows);
    msg('');
    open();
  }

  function fresh() {
    cur.tab = null; cur.index = null; cur.title = '';
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

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (tag === 'button') e.type = 'button';
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  let panel = null; // { kind: 'rename'|'delete'|'move', ... }

  function renderTabs() {
    const bar = $('ed-tabs');
    bar.textContent = '';
    const strip = el('div', 'ed-tabstrip');
    for (const t of store.tabs) {
      const b = el('button', 'ed-tab' + (t.id === store.selected ? ' on' : ''), t.name);
      b.onclick = () => selectTab(t.id);
      strip.appendChild(b);
    }
    const add = el('button', 'ed-tab ed-add', '+');
    add.setAttribute('aria-label', 'Add tab');
    add.onclick = () => {
      const t = { id: St.newId(), name: 'New tab', levels: [] };
      store.tabs.push(t); store.selected = t.id; persist();
      panel = { kind: 'rename' }; renderList();
    };
    strip.appendChild(add);
    const old = el('button', 'ed-tab ed-old' + (store.selected === OLD ? ' on' : ''),
      'Old levels');
    old.onclick = () => selectTab(OLD);
    strip.appendChild(old);
    bar.appendChild(strip);
    if (store.selected === OLD) return;
    const acts = el('div', 'ed-tabacts');
    const ren = el('button', 'ed-mini', 'Rename tab');
    ren.onclick = () => { panel = { kind: 'rename' }; renderList(); };
    const del = el('button', 'ed-mini', 'Delete tab');
    del.onclick = () => { panel = { kind: 'delete' }; renderList(); };
    acts.append(ren, del);
    bar.appendChild(acts);
    if (panel && panel.kind === 'rename') {
      const box = el('div', 'ed-panel');
      const inp = el('input');
      inp.type = 'text'; inp.maxLength = 24; inp.value = curTab().name;
      const ok = el('button', 'ed-mini ed-ok', 'OK');
      const done = () => {
        curTab().name = inp.value.trim() || curTab().name;
        persist(); panel = null; renderList();
      };
      ok.onclick = done;
      inp.onkeydown = (ev) => { if (ev.key === 'Enter') done(); };
      box.append(inp, ok);
      bar.appendChild(box);
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
    } else if (panel && panel.kind === 'delete') {
      const tab = curTab();
      const box = el('div', 'ed-panel col');
      const others = store.tabs.filter((t) => t !== tab);
      if (!tab.levels.length) {
        box.appendChild(el('p', 'sub', `Delete empty tab "${tab.name}"?`));
      } else {
        box.appendChild(el('p', 'sub',
          `"${tab.name}" has ${tab.levels.length} level${tab.levels.length === 1 ? '' : 's'}. Move them first, or delete them too.`));
        const chips = el('div', 'ed-chips');
        for (const o of others) {
          const c = el('button', 'ed-chip', `Move all to ${o.name}`);
          c.onclick = () => {
            o.levels.push(...tab.levels); tab.levels = [];
            removeTab(tab); };
          chips.appendChild(c);
        }
        box.appendChild(chips);
      }
      const row = el('div', 'ed-chips');
      const kill = el('button', 'ed-chip danger',
        tab.levels.length ? 'Delete tab and its levels' : 'Delete tab');
      kill.onclick = () => removeTab(tab);
      const cancel = el('button', 'ed-chip', 'Cancel');
      cancel.onclick = () => { panel = null; renderList(); };
      row.append(kill, cancel);
      box.appendChild(row);
      bar.appendChild(box);
    }
  }

  function removeTab(tab) {
    if (store.tabs.length === 1) {
      tab.levels = []; tab.name = 'Medieval';
    } else {
      store.tabs.splice(store.tabs.indexOf(tab), 1);
      store.selected = store.tabs[0].id;
    }
    if (cur.tab === tab.id) { cur.tab = null; cur.index = null; }
    persist(); panel = null; draw(); renderList();
  }

  function selectTab(id) {
    store.selected = id; panel = null; persist(); renderList();
  }

  function moveMenu(row, tab, i) {
    const box = el('div', 'ed-chips ed-moveto');
    box.appendChild(el('span', 'sub', 'Move to:'));
    for (const t of store.tabs.filter((x) => x !== tab)) {
      const c = el('button', 'ed-chip', t.name);
      c.onclick = () => {
        St.moveLevel(store, tab.id, i, t.id);
        if (cur.tab === tab.id) {
          if (cur.index === i) { cur.tab = t.id; cur.index = t.levels.length - 1; }
          else if (cur.index > i) cur.index -= 1;
        }
        persist(); panel = null; renderList();
      };
      box.appendChild(c);
    }
    if (box.children.length === 1) box.appendChild(el('span', 'sub', 'add another tab first'));
    row.after(box);
  }

  function renderList() {
    renderTabs();
    const list = $('ed-list');
    list.textContent = '';
    if (store.selected === OLD) {
      api.LEVELS.forEach((l) => {
        const rows = rowsOf(l.target.split('').map((ch) => (ch === 'X' ? 1 : 0)));
        const row = el('div', 'ed-item old');
        const b = el('button', 'ed-open');
        const name = el('span', '', `${l.id + 1}. ${l.title}`);
        b.append(thumb(rows), name);
        b.onclick = () => { load({ title: l.title, rows }, null, null); };
        row.appendChild(b);
        list.appendChild(row);
      });
      list.appendChild(el('p', 'sub', 'Read only. Tap one to open a copy.'));
      return;
    }
    const tab = curTab();
    if (!tab.levels.length) {
      list.appendChild(el('p', 'sub', 'Nothing in this tab yet.'));
      return;
    }
    tab.levels.forEach((entry, i) => {
      const row = el('div', 'ed-item' + (tab.id === cur.tab && i === cur.index ? ' on' : ''));
      const grip = el('button', 'ed-grip', '\u22ee\u22ee');
      grip.setAttribute('aria-label', 'Drag to reorder');
      grip.onpointerdown = (ev) => startDrag(ev, row, tab, i);
      const open_ = el('button', 'ed-open');
      open_.append(thumb(entry.rows), el('span', '', entry.title));
      open_.onclick = () => load(entry, tab.id, i);
      const mv = el('button', 'ed-mini', 'Move');
      mv.onclick = () => {
        const had = row.nextSibling && row.nextSibling.classList
          && row.nextSibling.classList.contains('ed-moveto');
        list.querySelectorAll('.ed-moveto').forEach((n) => n.remove());
        if (!had) moveMenu(row, tab, i);
      };
      const dup = el('button', 'ed-mini', 'Copy');
      dup.onclick = () => {
        tab.levels.splice(i + 1, 0, { title: `${entry.title} copy`.slice(0, 20),
          rows: entry.rows.slice() });
        if (cur.tab === tab.id && cur.index !== null && cur.index > i) cur.index += 1;
        persist(); renderList();
      };
      const del = el('button', 'ed-mini', 'Delete');
      del.onclick = () => {
        if (!del.classList.contains('confirm')) {
          del.classList.add('confirm');
          del.textContent = 'Sure?';
          setTimeout(() => { del.classList.remove('confirm'); del.textContent = 'Delete'; }, 3000);
          return;
        }
        tab.levels.splice(i, 1);
        persist();
        if (cur.tab === tab.id) {
          if (cur.index === i) { cur.tab = null; cur.index = null; }
          else if (cur.index > i) cur.index -= 1;
        }
        draw(); renderList();
      };
      const acts = el('div', 'ed-acts');
      acts.append(mv, dup, del);
      row.append(grip, open_, acts);
      list.appendChild(row);
    });
  }

  // Drag to reorder: pointer events on the handle (touch-action none).
  function startDrag(ev, row, tab, from) {
    ev.preventDefault();
    const grip = ev.currentTarget;
    grip.setPointerCapture(ev.pointerId);
    const scroller = page.querySelector('.ed-scroll');
    const rows = [...$('ed-list').querySelectorAll('.ed-item')];
    const mids0 = rows.map((r) => r.offsetTop + r.offsetHeight / 2);
    const startY = ev.clientY;
    const startScroll = scroller.scrollTop;
    let y = ev.clientY;
    let to = from;
    let raf = 0;
    row.classList.add('drag');
    const apply = () => {
      const dy = y - startY + (scroller.scrollTop - startScroll);
      row.style.transform = `translateY(${dy}px)`;
      const mine = mids0[from] + dy;
      // Count rows whose midpoint is above the dragged midpoint.
      to = mids0.filter((m, k) => k !== from && m < mine).length;
      rows.forEach((r, k) => {
        if (k === from) return;
        let shift = 0;
        if (from < to && k > from && k <= to) shift = -rows[from].offsetHeight - 8;
        if (from > to && k < from && k >= to) shift = rows[from].offsetHeight + 8;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const tick = () => {
      const rect = scroller.getBoundingClientRect();
      const edge = 60;
      if (y < rect.top + edge) scroller.scrollTop -= Math.ceil((rect.top + edge - y) / 5);
      else if (y > rect.bottom - edge) scroller.scrollTop += Math.ceil((y - (rect.bottom - edge)) / 5);
      apply();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    grip.onpointermove = (e) => { y = e.clientY; };
    const end = (commit) => {
      cancelAnimationFrame(raf);
      grip.onpointermove = null; grip.onpointerup = null; grip.onpointercancel = null;
      if (commit && St.reorder(tab.levels, from, to)) {
        if (cur.tab === tab.id && cur.index !== null) {
          if (cur.index === from) cur.index = to;
          else if (from < cur.index && to >= cur.index) cur.index -= 1;
          else if (from > cur.index && to <= cur.index) cur.index += 1;
        }
        persist();
      }
      renderList();
    };
    grip.onpointerup = () => end(true);
    grip.onpointercancel = () => end(false);
  }

  $('ed-export').onclick = async () => {
    const count = allSaved().length;
    if (!count) return msg('Save a level first, then export.', true);
    const json = JSON.stringify(St.exportData(store), null, 2);
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
    msg(`Exported ${count} level${count === 1 ? '' : 's'}`
      + (copied ? ', file downloaded and copied.' : ', file downloaded.'));
  };

  // Share sheet on phones (Gmail, chat); clipboard where unavailable.
  $('ed-share').onclick = async () => {
    const count = allSaved().length;
    if (!count) return msg('Save a level first, then share.', true);
    const json = JSON.stringify(St.exportData(store), null, 2);
    const d = new Date();
    const stamp = d.toISOString().slice(0, 10);
    const name = `ball-twister-levels-${stamp}.json`;
    const title = `Ball Twister levels ${stamp}`;
    if (navigator.share) {
      const file = new File([json], name, { type: 'application/json' });
      const data = navigator.canShare && navigator.canShare({ files: [file] })
        ? { title, text: json, files: [file] } : { title, text: json };
      try { await navigator.share(data); return msg('Shared.'); }
      catch (err) { if (err && err.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(json);
      msg(`Copied ${count} level${count === 1 ? '' : 's'}; paste it to Euler.`);
    } catch (err) { msg('Could not share or copy; use Export.', true); }
  };

  function importText(text) {
    const parsed = St.parseImport(text);
    if (parsed.error) return { error: parsed.error };
    if (store.selected === OLD) store.selected = store.tabs[0].id;
    const res = St.applyImport(store, parsed);
    persist();
    return res;
  }

  $('ed-import').onclick = () => {
    api.sheet(`<h2>Import</h2>
      <p>Paste exported JSON, or choose a file.</p>
      <textarea id="imp-text" class="ed-text" rows="6"
        placeholder='{"version":2,"tabs":[...]}'></textarea>
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
        out.classList.toggle('warn', !!res.error);
        if (res.error) { out.textContent = res.error; return; }
        let text = `Imported ${res.added} level${res.added === 1 ? '' : 's'}.`;
        if (res.skipped) text += ` ${res.skipped} already saved, skipped.`;
        out.textContent = text;
        renderList();
      };
    });
  };

  // Exit button during play-test (on the play page, not core markup).
  const exit = document.createElement('button');
  exit.type = 'button'; exit.id = 'ed-exit'; exit.textContent = 'Back to editor';
  exit.hidden = true;
  exit.onclick = () => { testing = false; open(); };
  document.querySelector('#play .btns').appendChild(exit);
  document.addEventListener('bt:page', (ev) => {
    if (ev.detail !== 'play') testing = false;
    exit.hidden = !(ev.detail === 'play' && testing);
  });

  // Hooks for automated checks.
  window.__btEditor = { store, parseImport: St.parseImport, current: cur,
    last: () => last };
}
