# Ball Twister

A daily twisting puzzle. Plain HTML, CSS and JavaScript (ES modules).

- `src/core/` pure game logic (no DOM): board, twist, session, daily
  puzzle generation, share text, stats, move-list replay.
- `src/modes.js` mode registry (daily, practice, tutorial).
- `src/ui/` rendering, input, themes (data), storage.
- `test/` unit tests: `node --test test/*.test.js`.
- `./launch.sh [port]` serves the game locally.

Debug URL options: `?day=YYYY-MM-DD`, `?theme=mono`, `?skip`, `?nosw`.
