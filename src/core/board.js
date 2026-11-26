// Board state and the twist operation. No DOM, no clock, no storage.
//
// A board is a Uint8Array of SIZE*SIZE cells holding 0 or 1 (two ball
// colours). A twist on an inner cell rotates its eight neighbours by two
// steps of their 8-cycle; the pivot ball stays. Every twist keeps each
// ball on its checkerboard colour class, so a scramble made by twists
// from a target can always be undone by twists.

export const SIZE = 7;
export const CELLS = SIZE * SIZE;
export const CW = 1;
export const CCW = -1;

// Neighbour cycle, clockwise, starting at the top-left corner.
const OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1],
];

export function canTwist(r, c) {
  return r >= 1 && r <= SIZE - 2 && c >= 1 && c <= SIZE - 2;
}

export function cellIndex(r, c) {
  return r * SIZE + c;
}

// All pivots a twist may use, row-major.
export function twistCells() {
  const out = [];
  for (let r = 1; r <= SIZE - 2; r++) {
    for (let c = 1; c <= SIZE - 2; c++) out.push([r, c]);
  }
  return out;
}

// The eight ring cells around a pivot as [row, col], clockwise from the
// top-left corner; empty for an edge pivot.
export function ringCells(r, c) {
  if (!canTwist(r, c)) return [];
  return OFFSETS.map(([dr, dc]) => [r + dr, c + dc]);
}

// [fromIndex, toIndex] pairs describing where each neighbour goes.
export function twistPairs(r, c, dir) {
  if (!canTwist(r, c)) return [];
  const idx = OFFSETS.map(([dr, dc]) => cellIndex(r + dr, c + dc));
  const shift = dir > 0 ? 2 : 6;
  return idx.map((from, i) => [from, idx[(i + shift) % 8]]);
}

// Apply a twist in place. Returns false for an edge pivot.
export function twist(board, r, c, dir) {
  const pairs = twistPairs(r, c, dir);
  if (pairs.length === 0) return false;
  const old = pairs.map(([from]) => board[from]);
  pairs.forEach(([, to], i) => { board[to] = old[i]; });
  return true;
}

// Moves are small integers so a solution is a plain list of numbers.
export function encodeMove(r, c, dir) {
  return cellIndex(r, c) * 2 + (dir < 0 ? 1 : 0);
}

export function decodeMove(move) {
  const cell = move >> 1;
  return {
    r: Math.floor(cell / SIZE),
    c: cell % SIZE,
    dir: move & 1 ? CCW : CW,
  };
}

export function inverseMove(move) {
  return move ^ 1;
}

export function applyMove(board, move) {
  const { r, c, dir } = decodeMove(move);
  return twist(board, r, c, dir);
}

// 'X' is colour 1, anything else colour 0. Rows may be joined or not.
export function boardFromString(text) {
  const flat = text.replace(/\s+/g, '');
  if (flat.length !== CELLS) throw new Error('bad board length');
  const board = new Uint8Array(CELLS);
  for (let i = 0; i < CELLS; i++) board[i] = flat[i] === 'X' ? 1 : 0;
  return board;
}

export function boardToString(board) {
  let out = '';
  for (let i = 0; i < CELLS; i++) out += board[i] ? 'X' : '.';
  return out;
}

export function sameBoard(a, b) {
  for (let i = 0; i < CELLS; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function countCorrect(board, target) {
  let n = 0;
  for (let i = 0; i < CELLS; i++) if (board[i] === target[i]) n++;
  return n;
}

// A turn is a normalised move: a pivot and 1-3 clockwise quarter turns,
// packed as cell * 4 + quarters. Consecutive turns of one pivot merge.
export function encodeTurn(r, c, quarters) {
  return cellIndex(r, c) * 4 + (((quarters % 4) + 4) % 4);
}

export function decodeTurn(turn) {
  const cell = turn >> 2;
  return { r: Math.floor(cell / SIZE), c: cell % SIZE, q: turn & 3 };
}

export function inverseTurn(turn) {
  return (turn & ~3) | ((4 - (turn & 3)) & 3);
}

export function applyTurn(board, turn) {
  const { r, c, q } = decodeTurn(turn);
  for (let i = 0; i < q; i++) twist(board, r, c, CW);
}

// Merge a turn onto the end of a normalised list, in place: the same
// pivot as the last entry adds up, and a net zero removes the entry.
export function pushTurn(list, turn) {
  const last = list.length ? list[list.length - 1] : -1;
  if (last >= 0 && (last >> 2) === (turn >> 2)) {
    const q = ((last & 3) + (turn & 3)) & 3;
    list.pop();
    if (q) list.push((turn & ~3) | q);
    return list;
  }
  list.push(turn);
  return list;
}

// Quarter-turn moves (encodeMove) to a normalised turn list.
export function toTurns(quarterMoves) {
  const list = [];
  for (const m of quarterMoves) {
    const { r, c, dir } = decodeMove(m);
    pushTurn(list, encodeTurn(r, c, dir));
  }
  return list;
}
