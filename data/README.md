# Daily queue

`daily-queue.json` is a list of puzzles for the daily. Add entries when
you like; days without an entry fall back to a random non-tutorial
level, scrambled with a seed taken from the date (same for everyone).

Entry fields:

- `date`: `YYYY-MM-DD`, the day it plays. Leave it out when adding;
  `node tools/daily-queue.mjs` stamps the next free dates (from
  tomorrow) onto undated entries, in list order. Entries without a date
  never play, and `node --test` fails until they are stamped.
- `title`: shown as "Daily #N \u00b7 title".
- `rows`: seven strings of seven characters, `X` or `.`, or instead
- `levelId`: index into the level list (`src/core/levels.js`).
- `depth` (optional): scramble length, a number or `[lo, hi]`.
  Default `[10, 14]`.

Example:

    [
      { "title": "Heart", "rows": [
          ".......", ".XX.XX.", "XXXXXXX", "XXXXXXX",
          ".XXXXX.", "..XXX..", "...X..." ] },
      { "date": "2026-12-03", "levelId": 12, "depth": 12 }
    ]

Do not change an entry once its date has passed: scores on the server
are kept per puzzle number and board.
