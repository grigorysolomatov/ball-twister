# Ball Twister backlog

Ideas agreed in chat but not yet approved to build. Ordered roughly by
when they make sense. Nothing here runs until Grigory says go.

## Next up (pick after the current round)

- Font change. Options: docs/fonts.png. Picks: Fraunces or Young Serif;
  Nunito if more playful.
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
- Share export shows the player's theme, so people show their taste and
  what they have unlocked.

## Social and online

- Global histogram (Opus Magnum style): Cloudflare Worker + D1, anonymous
  score per puzzle, server replays the submitted twist list. Solvers are
  not a concern.
- AI benchmark for marketing: MCP server, official model markers on the
  histogram ("beat 3 of 4 AIs"). Run a small cost/skill test first;
  API spend needs approval.

## Later

- Shariki mode (match-3 survival from the original game).
- Optional timer in settings (off by default).
- Android build via Capacitor and Google Play ($25, closed test).
- iOS only if Android shows interest ($99/year).
- Paid unlock later (archive, extra modes), daily stays free.
