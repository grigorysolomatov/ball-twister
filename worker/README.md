# Score server (not deployed)

A Cloudflare Worker with a D1 database that keeps anonymous daily
scores and serves histograms. It imports the game's own core code
(`src/core/`), so the server rebuilds exactly the puzzle the player saw
and replays the submitted moves; unsolved submissions are rejected.

API:

- `POST /score` with `{"puzzle": 12, "moves": [..], "ms": 83000}`:
  `moves` is the normalised move list from the game session. 200 if
  solved and stored, 422 if the moves do not solve the puzzle.
- `GET /histogram?puzzle=12`: `{"total", "twists": {count: players},
  "time": {"edges": [seconds..], "counts": {bucket: players}}}`.

Tests (no network, in-memory D1): `node --test test/*.test.js` from the
repo root.

## Deploy later (needs Grigory's OK; his own Cloudflare account)

Free tier is enough (Workers 100k requests/day, D1 5 GB).

    cd worker
    npx wrangler login
    npx wrangler d1 create ball-twister-scores
    # copy the printed database_id into wrangler.toml
    npx wrangler d1 execute ball-twister-scores --remote --file=schema.sql
    npx wrangler deploy

Then put the printed `https://ball-twister-scores.<account>.workers.dev`
URL into `SCORES_URL` in `src/core/scores-client.js` and ship the game.
Until then the client stays off and nothing is sent anywhere.
