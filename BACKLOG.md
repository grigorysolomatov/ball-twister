# Ball Twister backlog

Ideas agreed in chat but not yet approved to build. Ordered roughly by
when they make sense. Nothing here runs until Grigory says go.

## Next up (pick after the current round)

- Font: Baloo 2 chosen as default (option 4, soft). Later: own logo font,
  and themes may bring their own fonts.
- Less generic look: hand-made title wordmark, one small drawn icon set,
  plain short copy, no stock UI patterns.
- Feel: soft wooden click per twist, chime on solve, light phone haptics,
  small ripple/bounce of the balls on solve.

## Unlockables and themes

- Each chapter of the levels has its own theme. Beating the chapter
  unlocks that theme.
- Two independent tracks that mix freely:
  - boards: light wood (default), Go board, linen, slate, ...
  - pieces: cream/terracotta balls (default), Go stones, eggs, billiard
    balls, fruit, emoji, black/white, ...
- Theme ideas: eggs, bacteria, newspaper balls, bombs, footballs,
  basketballs, Go stones, billiard, fruit, emoji. Curiosity about which
  themes exist is a reason to keep playing. Piece art via image
  generation (his OpenAI login works; sample docs/theme-pieces.png).
- Levels fit their chapter's theme (billiards: balls in the corners like
  pockets...). Every level has a name.
- Share export shows the player's theme, so people show their taste and
  what they have unlocked.

## Progression

- Reveal chapters one at a time; never show the full level count up
  front (a wall of levels, as in Baba Is You, makes people quit).
- Grigory authors levels in the editor plugin; sort into chapters later;
  remove the plugin before release.

## Social and online

- Global histogram (Opus Magnum style): Cloudflare Worker + D1, anonymous
  score per puzzle, server replays the submitted twist list. Solvers are
  not a concern.
- AI benchmark for marketing: MCP server, official model markers on the
  histogram ("beat 3 of 4 AIs"). Run a small cost/skill test first;
  API spend needs approval.

## Decisions

- Stay on plain web (no Godot). Shader effects (WebGL/PixiJS) later,
  not now.
- Rust solver is a developer tool only (rank levels, compute par
  offline); it never ships in the app. Results may be baked in as data.
- Player feedback matters: sound, haptics, solve animation.

## Histograms (decided 11-26)

- Honest: if nobody has solved it yet, show exactly that. No seeding,
  no fake players.
- Show the player's best against the current pool (live, not frozen at
  solve time).
- Daily only: same scramble for everyone that day, so histograms make
  sense. Normal levels scramble randomly each play, no histogram.
- Several score axes like Zachtronics: twists, time (measured silently,
  no visible timer during play), maybe a third (candidate: rings used =
  distinct centres touched, the 'area' analogue). Undo stays free.

## Later

- Immovable cells in some levels (variety, harder). Two rule options:
  (a) the twist skips the fixed cell, the ring becomes 7 steps;
  (b) a twist whose ring touches it is blocked. Scrambling from the
  solved board keeps every puzzle solvable either way. Try both.

- Shariki mode (match-3 survival from the original game).
- Optional timer in settings (off by default).
- Android build via Capacitor and Google Play ($25, closed test).
- iOS only if Android shows interest ($99/year).
- Paid unlock later (archive, extra modes), daily stays free.
