# Ball Twister solver

Optimal solver, solution shortener and level difficulty analysis for
the game's rules (`src/core/board.js`). This folder does not change the
game.

## Model

- The board is 7 x 7, each cell yellow or empty. Balls of one colour are
  identical, so a state is a 49-bit mask of yellow cells.
- A move is a permutation of cells. The standard set has 50 moves: each
  of the 25 inner pivots turns its 8-ring a quarter turn either way.
  Everything else (inverses, which moves commute, orbits, the solver) is
  derived from the permutations, so other move sets, for example rings
  that skip a fixed cell, only change the move list passed to
  `MoveSet::from_perms`. The test `generic_moves_fixed_cell_variant`
  builds such a variant (one immovable cell, rings of 7 around it) and
  checks the solver stays optimal on it. A blocked-twist variant is
  the same with those moves left out of the list.
- A quarter turn keeps the parity of r + c for every ball. The moves
  split the cells into two orbits: 25 cells with r + c even and 24 with
  r + c odd. The yellow count in each orbit never changes, so a level
  with k_even and k_odd yellow balls has C(25, k_even) x C(24, k_odd)
  states. All of them are reachable (checked by the exhaustive search
  for every level where it ran: the visited count equals the formula).

## Pieces

- `moves.rs`: move permutations, inverses, canonical move pairs (drops
  inverse pairs, pairs equal to a single move and duplicate orders of
  non-overlapping moves).
- `index.rs`: perfect numbering of states, per orbit by the
  combinatorial number system.
- `pdb.rs`: exact distance tables for the projection of a state onto
  one orbit (or a pair of orbits when it fits).
- `perimeter.rs`: every state within d moves of the target with its
  exact distance (d is 5 for most levels with a 60 M state cap).
- `solver.rs`: IDA* with h = max(orbit table values), raised by the
  perimeter table.
- `fullbfs.rs`: breadth-first search over the whole state space at 2
  bits per state (distance mod 3). Gives the exact God's number and the
  exact distance distribution, and solves any position optimally by
  walking downhill. About 60 M states per second on 16 threads.
- `shorten.rs`: cancels inverse pairs across commuting moves, replaces
  windows by optimal bidirectional-BFS paths, then re-solves the longest
  tail the optimal solver finishes within a node budget.

## Why the heuristic is admissible

Projecting a state onto one orbit (forgetting the balls in the other)
gives a smaller puzzle with the same moves. Any solution of the full
puzzle also solves the projection, so the projection's exact distance
is never larger than the full distance. The maximum of two lower bounds
is a lower bound. The perimeter table stores exact distances up to d,
and a state absent from it is known to be at least d + 1 away, which is
also a lower bound. IDA* with an admissible heuristic returns optimal
solutions; with a known solution of length L the search stops at bound
L and keeps the known solution if nothing shorter exists.

The usual bound "sum of single-ball distances under a best matching,
divided by the 8 balls one twist moves" is weaker than the orbit table:
it is itself a lower bound on the projected distance, which the table
holds exactly.

## Use

Toolchain: `nix shell nixpkgs#cargo nixpkgs#rustc nixpkgs#gcc`.

    node solver/tools/gen_fixtures.mjs        # from the repo root
    cd solver
    cargo test --release
    cargo run --release -- info
    cargo run --release -- solve <target 49 chars> <start 49 chars>
    tools/run_all.sh target/release/bt-solver # all levels, hours
    python3 tools/report.py                   # summary + report

`gen_fixtures.mjs` uses the game's own code to write `tests/fixtures/`
(random boards and move sequences with board.js results) and `data/`
(levels, the first 364 dailies, the level plays).

## Results

See `results/REPORT.md` and `results/levels-difficulty.json`. Per-level
raw output is in `results/levels/<id>.json`.
