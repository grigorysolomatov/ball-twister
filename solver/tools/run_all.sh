#!/bin/sh
# Runs the difficulty analysis for every level, smallest space first.
# Levels up to EXACT states get an exhaustive BFS (2 bits per state);
# the rest are sampled with IDA*. Usage, from solver/:
#   tools/run_all.sh <path to bt-solver binary>
set -eu
BIN=${1:-target/release/bt-solver}
EXACT=${EXACT:-70000000000}
# Cheap exact levels, then sampled levels, then the slowest exact ones.
ORDER="${ORDER:-0 15 1 2 5 16 10 17 22 21 3 20 18 8 11 19 7 4 9 14 13 12 23 6}"
mkdir -p results/levels results/logs
for id in $ORDER; do
  if [ -s "results/levels/$(printf %02d "$id").json" ] && \
     [ -z "${FORCE:-}" ]; then
    continue
  fi
  echo "== level $id $(date +%H:%M:%S)"
  nice -n 10 "$BIN" level "$id" --exact-limit "$EXACT" \
    --samples "${SAMPLES:-300}" \
    --search-samples "${SEARCH_SAMPLES:-100}" --per-depth "${PER_DEPTH:-40}" \
    --nodes "${NODES:-1500000000}" --perimeter "${PERIM:-60000000}" \
    > "results/logs/$id.log" 2>&1
done
echo "== done $(date +%H:%M:%S)"
