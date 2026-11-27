import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStore, saveStore, parseImport, applyImport, exportData,
  moveLevel, reorder, KEY, BACKUP_KEY } from '../src/plugins/editor/store.js';

const rows = (n) => Array.from({ length: 7 }, (_, r) =>
  (r === n ? 'XXXXXXX' : '.......'));
const lvl = (title, n) => ({ title, chapter: null, rows: rows(n) });

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)), m };
}

test('migrates the round-8 flat list into Medieval, keeps backup', () => {
  const raw = JSON.stringify([lvl('Shield', 0), lvl('Speck', 1), lvl('Sword', 2)]);
  const st = fakeStorage({ [KEY]: raw });
  const s = loadStore(st);
  assert.equal(s.tabs.length, 1);
  assert.equal(s.tabs[0].name, 'Medieval');
  assert.deepEqual(s.tabs[0].levels.map((l) => l.title), ['Shield', 'Speck', 'Sword']);
  assert.equal(st.getItem(BACKUP_KEY), raw);
  const stored = JSON.parse(st.getItem(KEY));
  assert.equal(stored.version, 2);
  assert.equal(stored.tabs[0].levels.length, 3);
  // second load is stable and leaves the backup alone
  const s2 = loadStore(st);
  assert.equal(s2.tabs[0].levels.length, 3);
  assert.equal(st.getItem(BACKUP_KEY), raw);
});

test('empty storage gives one Medieval tab', () => {
  const s = loadStore(fakeStorage());
  assert.equal(s.tabs[0].name, 'Medieval');
  assert.equal(s.selected, s.tabs[0].id);
});

test('v2 store round-trips with selection', () => {
  const st = fakeStorage();
  const s = loadStore(st);
  s.tabs.push({ id: 'b', name: 'Space', levels: [lvl('Moon', 3)] });
  s.selected = 'b';
  saveStore(st, s);
  const back = loadStore(st);
  assert.equal(back.selected, 'b');
  assert.equal(back.tabs[1].levels[0].title, 'Moon');
});

test('import v2 merges by tab name and skips duplicates', () => {
  const s = loadStore(fakeStorage());
  s.tabs[0].levels.push(lvl('Sword', 2));
  const text = JSON.stringify({ version: 2, tabs: [
    { name: 'Medieval', levels: [lvl('Sword', 2), lvl('Castle', 4)] },
    { name: 'Space', levels: [lvl('Moon', 3)] }] });
  const p = parseImport(text);
  assert.ok(!p.error);
  assert.deepEqual(applyImport(s, p), { added: 2, skipped: 1 });
  assert.deepEqual(s.tabs.map((t) => t.name), ['Medieval', 'Space']);
  assert.equal(s.tabs[0].levels.length, 2);
});

test('import flat round-8 list goes into the current tab', () => {
  const s = loadStore(fakeStorage());
  s.tabs.push({ id: 'b', name: 'Space', levels: [] });
  s.selected = 'b';
  const p = parseImport(JSON.stringify([lvl('Moon', 3)]));
  assert.deepEqual(applyImport(s, p), { added: 1, skipped: 0 });
  assert.equal(s.tabs[1].levels[0].title, 'Moon');
  assert.equal(s.tabs[1].levels[0].chapter, undefined);
});

test('import rejects bad data', () => {
  assert.ok(parseImport('nope').error);
  assert.ok(parseImport('[]').error);
  assert.ok(parseImport(JSON.stringify({ version: 2, tabs: [{ name: 'x',
    levels: [{ title: 'a', rows: ['X'] }] }] })).error);
  assert.ok(parseImport(JSON.stringify([{ title: 'e', rows: rows(9) }])).error);
});

test('export has the v2 shape', () => {
  const s = loadStore(fakeStorage());
  s.tabs[0].levels.push(lvl('Sword', 2));
  const e = exportData(s);
  assert.deepEqual(Object.keys(e), ['version', 'tabs']);
  assert.deepEqual(Object.keys(e.tabs[0]), ['name', 'levels']);
  assert.deepEqual(Object.keys(e.tabs[0].levels[0]), ['title', 'rows']);
});

test('move and reorder', () => {
  const s = loadStore(fakeStorage());
  s.tabs[0].levels.push(lvl('A', 0), lvl('B', 1), lvl('C', 2));
  s.tabs.push({ id: 'b', name: 'Space', levels: [] });
  assert.ok(moveLevel(s, s.tabs[0].id, 1, 'b'));
  assert.deepEqual(s.tabs[0].levels.map((l) => l.title), ['A', 'C']);
  assert.equal(s.tabs[1].levels[0].title, 'B');
  assert.ok(reorder(s.tabs[0].levels, 0, 1));
  assert.deepEqual(s.tabs[0].levels.map((l) => l.title), ['C', 'A']);
});
