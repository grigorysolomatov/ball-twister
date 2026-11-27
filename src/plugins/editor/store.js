// Pure editor storage logic (no DOM); importable from node tests.

export const KEY = 'bt-editor-levels';
export const BACKUP_KEY = 'bt-editor-levels-backup-v1';
export const N = 7;
export const CELLS = N * N;
const RE_ROW = /^[X.]{7}$/;

export function validLevel(l) {
  return !!l && typeof l.title === 'string' && Array.isArray(l.rows)
    && l.rows.length === N && l.rows.every((r) => RE_ROW.test(r));
}

const clean = (l) => ({ title: l.title, rows: l.rows.slice() });

let seq = 0;
export function newId() {
  seq += 1;
  return `t${Date.now().toString(36)}${seq}`;
}

export function emptyStore() {
  return { version: 2, tabs: [{ id: newId(), name: 'Medieval', levels: [] }],
    selected: null };
}

function normalize(s) {
  if (!s.tabs.length) s.tabs.push({ id: newId(), name: 'Medieval', levels: [] });
  if (s.selected !== 'old' && !s.tabs.some((t) => t.id === s.selected)) s.selected = s.tabs[0].id;
  return s;
}

// Reads storage (a Storage-like object) and returns a v2 store. When the
// old flat list is found, the new structure is written FIRST and the raw
// old value is kept in BACKUP_KEY; nothing is ever deleted.
export function loadStore(storage) {
  const raw = storage.getItem(KEY);
  let data = null;
  try { data = JSON.parse(raw); } catch (err) { /* empty or broken */ }
  if (data && data.version === 2 && Array.isArray(data.tabs)) {
    const tabs = data.tabs.filter((t) => t && Array.isArray(t.levels))
      .map((t) => ({ id: String(t.id || newId()),
        name: String(t.name || 'Tab'),
        levels: t.levels.filter(validLevel).map(clean) }));
    return normalize({ version: 2, tabs, selected: data.selected });
  }
  const store = emptyStore();
  if (Array.isArray(data)) {
    store.tabs[0].levels = data.filter(validLevel).map(clean);
  }
  store.selected = store.tabs[0].id;
  if (raw !== null && raw !== undefined) {
    if (storage.getItem(BACKUP_KEY) === null) storage.setItem(BACKUP_KEY, raw);
    // Only replace the old value once the backup exists.
    if (storage.getItem(BACKUP_KEY) === raw || Array.isArray(data)) {
      saveStore(storage, store);
    }
  }
  return store;
}

export function saveStore(storage, store) {
  storage.setItem(KEY, JSON.stringify(
    { version: 2, tabs: store.tabs, selected: store.selected }));
}

export function exportData(store) {
  return { version: 2, tabs: store.tabs.map((t) => ({ name: t.name,
    levels: t.levels.map(clean) })) };
}

function checkLevel(l, at) {
  if (!l || !Array.isArray(l.rows) || l.rows.length !== N
    || !l.rows.every((r) => typeof r === 'string' && RE_ROW.test(r))) {
    return { error: `${at}: rows must be 7 strings of 7 X or . characters.` };
  }
  const balls = l.rows.join('').replaceAll('.', '').length;
  if (balls === 0) return { error: `${at}: the board is empty.` };
  if (balls === CELLS) return { error: `${at}: the board is full.` };
  const title = typeof l.title === 'string' && l.title.trim()
    ? l.title.trim().slice(0, 20) : 'Untitled';
  return { level: { title, rows: l.rows.slice() } };
}

// Accepts v2 ({version:2, tabs}) or the round-8 flat list (extra
// fields such as chapter are ignored). Returns { tabs:[{name,levels}] }
// where flat lists come back as one tab with name null, or { error }.
export function parseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch (err) {
    return { error: 'That is not valid JSON.' };
  }
  const readList = (list, where) => {
    const levels = [];
    for (let i = 0; i < list.length; i++) {
      const r = checkLevel(list[i], `${where}Level ${i + 1}`);
      if (r.error) return r;
      levels.push(r.level);
    }
    return { levels };
  };
  if (Array.isArray(data)) {
    if (!data.length) return { error: 'Expected a list of levels.' };
    const r = readList(data, '');
    return r.error ? r : { tabs: [{ name: null, levels: r.levels }] };
  }
  if (data && data.version === 2 && Array.isArray(data.tabs)) {
    const tabs = [];
    for (const [i, t] of data.tabs.entries()) {
      if (!t || !Array.isArray(t.levels)) {
        return { error: `Tab ${i + 1}: expected a list of levels.` };
      }
      const r = readList(t.levels, `Tab ${i + 1}, `);
      if (r.error) return r;
      tabs.push({ name: String(t.name || 'Imported'), levels: r.levels });
    }
    if (!tabs.length) return { error: 'Expected at least one tab.' };
    return { tabs };
  }
  return { error: 'Expected a list of levels or a version 2 export.' };
}

// Merges parsed import into the store. Flat lists go into the current
// tab; named tabs merge into the tab of the same name or become new tabs.
// Identical title+pattern levels are skipped. Returns counts.
export function applyImport(store, parsed) {
  let added = 0;
  let skipped = 0;
  for (const t of parsed.tabs) {
    let tab = t.name === null
      ? store.tabs.find((x) => x.id === store.selected)
      : store.tabs.find((x) => x.name === t.name);
    if (!tab) {
      tab = { id: newId(), name: t.name, levels: [] };
      store.tabs.push(tab);
    }
    const have = new Set(tab.levels.map((l) => l.title + l.rows.join('')));
    for (const l of t.levels) {
      const k = l.title + l.rows.join('');
      if (have.has(k)) { skipped += 1; continue; }
      have.add(k);
      tab.levels.push(clean(l));
      added += 1;
    }
  }
  return { added, skipped };
}

export function moveLevel(store, fromTab, index, toTab) {
  const a = store.tabs.find((t) => t.id === fromTab);
  const b = store.tabs.find((t) => t.id === toTab);
  if (!a || !b || a === b || !a.levels[index]) return false;
  b.levels.push(a.levels.splice(index, 1)[0]);
  return true;
}

export function reorder(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length
    || to >= list.length) return false;
  list.splice(to, 0, list.splice(from, 1)[0]);
  return true;
}
