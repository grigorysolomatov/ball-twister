// Stamp the next free dates (from tomorrow) onto undated queue entries
// and check every entry. Usage: node tools/daily-queue.mjs [--check]

import { readFileSync, writeFileSync } from 'node:fs';
import { dateInfo, dateOfNumber, queueTarget } from '../src/core/puzzle.js';

const path = new URL('../data/daily-queue.json', import.meta.url);
const queue = JSON.parse(readFileSync(path, 'utf8'));
const check = process.argv.includes('--check');

const bad = queue.filter((e) => !queueTarget(e));
if (bad.length) {
  console.error('Unusable entries:', JSON.stringify(bad));
  process.exit(1);
}
const used = new Set(queue.map((e) => e.date).filter(Boolean));
let n = dateInfo(new Date()).number + 1;
let stamped = 0;
for (const entry of queue) {
  if (entry.date) continue;
  while (used.has(dateOfNumber(n))) n++;
  entry.date = dateOfNumber(n);
  used.add(entry.date);
  stamped++;
}
if (check) {
  console.log(stamped ? `${stamped} undated entries` : 'queue ok');
  process.exit(stamped ? 1 : 0);
}
writeFileSync(path, JSON.stringify(queue, null, 2) + '\n');
console.log(`stamped ${stamped} entries`);
