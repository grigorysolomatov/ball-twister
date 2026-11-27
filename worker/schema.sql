-- D1 schema for the daily score server. Anonymous: one row per solve.
-- `board` is the exact puzzle (number, start, target), so a changed
-- queue entry never mixes scores of two different boards.
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle INTEGER NOT NULL,
  board TEXT NOT NULL,
  twists INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  bucket INTEGER NOT NULL,
  created INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS scores_puzzle ON scores (puzzle, board);
