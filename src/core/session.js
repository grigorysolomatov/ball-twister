// One play-through of a level: board, move list, undo, replay.
//
// The score is the length of the move list. A move is a pivot plus its
// net clockwise quarter turns (1-3), however big the drag was. A turn
// of the same pivot as the last move merges into it, and a net zero
// removes it, so spamming one ring never adds to the score.

import {
  CELLS, CW, applyTurn, boardFromString, canTwist, cellIndex,
  countCorrect, decodeTurn, encodeTurn, inverseTurn, pushTurn, sameBoard,
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
    // Turn a ring by k clockwise quarters (negative = counter-clockwise).
    turn(r, c, k) {
      const q = ((k % 4) + 4) % 4;
      if (q === 0 || !canTwist(r, c) || session.solved()) return false;
      const move = encodeTurn(r, c, q);
      applyTurn(session.board, move);
      const had = session.moves.length;
      pushTurn(session.moves, move);
      const n = session.moves.length;
      if (n > had) session.counts.push(countCorrect(session.board, target));
      else if (n === had) {
        session.counts[n - 1] = countCorrect(session.board, target);
      } else session.counts.pop();
      return true;
    },
    twist(r, c, dir) {
      return session.turn(r, c, dir > 0 ? 1 : -1);
    },
    // Remove the last (merged) move completely. Returns it or null.
    undo() {
      if (session.moves.length === 0) return null;
      const move = session.moves.pop();
      session.counts.pop();
      applyTurn(session.board, inverseTurn(move));
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

// Verify a submitted solution: a normalised move list (see board.js).
// Pure; the same code can run on a server.
export function replay(level, moves) {
  const session = createSession(level);
  let prev = -1;
  for (const move of moves) {
    if (!Number.isInteger(move) || move < 0 || move >= CELLS * 4) {
      return { valid: false, solved: false };
    }
    const { r, c, q } = decodeTurn(move);
    // Not normalised: no turn, or the same ring twice in a row.
    if (q === 0 || (prev >= 0 && (prev >> 2) === (move >> 2))) {
      return { valid: false, solved: false };
    }
    if (!session.turn(r, c, q)) return { valid: false, solved: false };
    prev = move;
  }
  const result = session.result();
  return { valid: true, solved: session.solved(), ...result };
}

export { CW, cellIndex };
