// One play-through of a level: board, move stack, undo, replay.

import {
  CELLS, applyMove, boardFromString, canTwist, countCorrect, encodeMove,
  inverseMove, sameBoard,
} from './board.js';

// A level is { target, start } as 49-character strings.
export function createSession(level) {
  const target = boardFromString(level.target);
  const start = boardFromString(level.start);
  const session = {
    target,
    start,
    board: start.slice(),
    moves: [],
    counts: [],
    twist(r, c, dir) {
      if (!canTwist(r, c) || session.solved()) return false;
      const move = encodeMove(r, c, dir);
      applyMove(session.board, move);
      session.moves.push(move);
      session.counts.push(countCorrect(session.board, target));
      return true;
    },
    // Remove the last twist completely. Returns the undone move or null.
    undo() {
      if (session.moves.length === 0) return null;
      const move = session.moves.pop();
      session.counts.pop();
      applyMove(session.board, inverseMove(move));
      return move;
    },
    restart() {
      session.board = start.slice();
      session.moves = [];
      session.counts = [];
    },
    solved() {
      return sameBoard(session.board, target);
    },
    result() {
      return {
        twists: session.moves.length,
        moves: session.moves.slice(),
        counts: session.counts.slice(),
        startCorrect: countCorrect(start, target),
      };
    },
  };
  return session;
}

// Verify a submitted solution. Pure; the same code can run on a server.
export function replay(level, moves) {
  const session = createSession(level);
  for (const move of moves) {
    if (!Number.isInteger(move) || move < 0 || move >= CELLS * 2) {
      return { valid: false, solved: false };
    }
    const cell = move >> 1;
    const r = Math.floor(cell / 7);
    const c = cell % 7;
    if (!session.twist(r, c, move & 1 ? -1 : 1)) {
      return { valid: false, solved: false };
    }
  }
  const result = session.result();
  return { valid: true, solved: session.solved(), ...result };
}
