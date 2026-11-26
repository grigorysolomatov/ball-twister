//! Exhaustive breadth-first search over every reachable state.
//!
//! Each state takes two bits: 3 means not reached yet, otherwise the
//! distance modulo 3. That is enough to recover the exact distance of
//! any state (neighbours differ by at most one, so the neighbour one step
//! closer is the one holding `(v + 2) % 3`), and to walk an optimal path.
//!
//! Layers grow forward (expand states at distance k) while the frontier
//! is small, and backward (an unreached state is at distance k + 1 iff a
//! neighbour holds k mod 3) once few states remain. A forward pass also
//! re-expands older states with the same residue; that only wastes work
//! and is cheap while layers grow quickly.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use rayon::prelude::*;

use crate::index::StateIndex;
use crate::moves::MoveSet;
use crate::pdb::OrbitTable;

pub struct FullBfs {
    pub index: StateIndex,
    tables: Vec<OrbitTable>,
    strides: Vec<u64>,
    data: Vec<AtomicU64>,
    pub size: u64,
    /// Number of states at each distance from the target.
    pub layers: Vec<u64>,
    pub seconds: f64,
    target_rank: u64,
    pub target: u64,
}

const STATES_PER_WORD: u64 = 32;

impl FullBfs {
    /// Bytes the table needs for this many states.
    pub fn bytes_for(size: u64) -> u64 {
        size.div_ceil(STATES_PER_WORD) * 8
    }

    pub fn run(ms: &MoveSet, target: u64, verbose: bool) -> FullBfs {
        let index = StateIndex::for_target(ms, target);
        let size = index.size;
        let tables: Vec<OrbitTable> = index
            .orbits
            .iter()
            .map(|o| OrbitTable::build(ms, o.clone()))
            .collect();
        // Mixed radix: the last orbit varies fastest.
        let mut strides = vec![1u64; tables.len()];
        for o in (0..tables.len().saturating_sub(1)).rev() {
            strides[o] = strides[o + 1] * tables[o + 1].idx.size;
        }
        let words = size.div_ceil(STATES_PER_WORD) as usize;
        let data: Vec<AtomicU64> =
            (0..words).map(|_| AtomicU64::new(u64::MAX)).collect();
        let mut bfs = FullBfs {
            index,
            tables,
            strides,
            data,
            size,
            layers: Vec::new(),
            seconds: 0.0,
            target_rank: 0,
            target,
        };
        let t0 = Instant::now();
        let root = bfs.index.rank(target);
        bfs.target_rank = root;
        bfs.set(root, 0);
        bfs.layers.push(1);
        let mut reached = 1u64;
        let mut k = 0usize;
        loop {
            let unreached = size - reached;
            if unreached == 0 {
                break;
            }
            // Forward work ~ states with residue k (all older layers of
            // the same residue included); backward work ~ unreached.
            let same: u64 = bfs.layers.iter().rev().step_by(3).sum();
            let backward = unreached < same;
            let found = if backward {
                bfs.backward(k, ms.len())
            } else {
                bfs.forward(k, ms.len())
            };
            if verbose {
                eprintln!(
                    "  depth {:>2}: {:>14} states ({}) {:.1}s",
                    k + 1,
                    found,
                    if backward { "back" } else { "fwd" },
                    t0.elapsed().as_secs_f64()
                );
            }
            if found == 0 {
                break;
            }
            bfs.layers.push(found);
            reached += found;
            k += 1;
        }
        bfs.seconds = t0.elapsed().as_secs_f64();
        bfs
    }

    #[inline]
    fn get(&self, i: u64) -> u64 {
        let w = self.data[(i / STATES_PER_WORD) as usize]
            .load(Ordering::Relaxed);
        (w >> ((i % STATES_PER_WORD) * 2)) & 3
    }

    /// Changes a state from 3 to `v`; returns true if it was 3 before.
    #[inline]
    fn set(&self, i: u64, v: u64) -> bool {
        let sh = (i % STATES_PER_WORD) * 2;
        let clear = (3 ^ v) << sh;
        let old = self.data[(i / STATES_PER_WORD) as usize]
            .fetch_and(!clear, Ordering::Relaxed);
        (old >> sh) & 3 == 3
    }

    #[inline]
    fn ranks(&self, mut i: u64, out: &mut [usize; 8]) {
        for o in (0..self.tables.len()).rev() {
            let s = self.tables[o].idx.size;
            out[o] = (i % s) as usize;
            i /= s;
        }
    }

    #[inline]
    fn neighbour(&self, r: &[usize; 8], m: usize) -> u64 {
        let mut j = 0u64;
        for (o, t) in self.tables.iter().enumerate() {
            j += t.step(m, r[o]) as u64 * self.strides[o];
        }
        j
    }

    fn forward(&self, k: usize, nmoves: usize) -> u64 {
        let c = (k % 3) as u64;
        let nc = ((k + 1) % 3) as u64;
        let size = self.size;
        (0..self.data.len())
            .into_par_iter()
            .with_min_len(256)
            .map(|w| {
                let word = self.data[w].load(Ordering::Relaxed);
                let mut n = 0u64;
                for b in 0..STATES_PER_WORD {
                    if (word >> (b * 2)) & 3 != c {
                        continue;
                    }
                    let i = w as u64 * STATES_PER_WORD + b;
                    if i >= size {
                        break;
                    }
                    let mut r = [0usize; 8];
                    self.ranks(i, &mut r);
                    for m in 0..nmoves {
                        let j = self.neighbour(&r, m);
                        if self.get(j) == 3 && self.set(j, nc) {
                            n += 1;
                        }
                    }
                }
                n
            })
            .sum()
    }

    fn backward(&self, k: usize, nmoves: usize) -> u64 {
        let c = (k % 3) as u64;
        let nc = ((k + 1) % 3) as u64;
        let size = self.size;
        (0..self.data.len())
            .into_par_iter()
            .with_min_len(256)
            .map(|w| {
                let word = self.data[w].load(Ordering::Relaxed);
                if word & (word >> 1) & 0x5555_5555_5555_5555 == 0 {
                    return 0;
                }
                let mut n = 0u64;
                for b in 0..STATES_PER_WORD {
                    if (word >> (b * 2)) & 3 != 3 {
                        continue;
                    }
                    let i = w as u64 * STATES_PER_WORD + b;
                    if i >= size {
                        break;
                    }
                    let mut r = [0usize; 8];
                    self.ranks(i, &mut r);
                    for m in 0..nmoves {
                        if self.get(self.neighbour(&r, m)) == c {
                            if self.set(i, nc) {
                                n += 1;
                            }
                            break;
                        }
                    }
                }
                n
            })
            .sum()
    }

    pub fn god(&self) -> usize {
        self.layers.len() - 1
    }

    pub fn mean(&self) -> f64 {
        let tot: f64 = self.layers.iter().map(|&x| x as f64).sum();
        self.layers
            .iter()
            .enumerate()
            .map(|(d, &x)| d as f64 * x as f64)
            .sum::<f64>()
            / tot
    }

    /// Exact distance of a state and one optimal solution (move indices).
    pub fn solve(&self, ms: &MoveSet, start: u64) -> (usize, Vec<usize>) {
        assert!(self.index.contains(start), "state not in this space");
        let mut i = self.index.rank(start);
        let mut v = self.get(i);
        assert!(v != 3);
        let mut path = Vec::new();
        let target_i = self.target_rank;
        while i != target_i {
            let mut r = [0usize; 8];
            self.ranks(i, &mut r);
            let want = (v + 2) % 3;
            let mut moved = false;
            for m in 0..ms.len() {
                let j = self.neighbour(&r, m);
                if self.get(j) == want {
                    path.push(m);
                    i = j;
                    v = want;
                    moved = true;
                    break;
                }
            }
            assert!(moved, "broken distance table");
        }
        (path.len(), path)
    }
}
