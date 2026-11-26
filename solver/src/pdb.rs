//! Per-orbit move tables and pattern databases.
//!
//! The projection of a state onto one orbit is itself a valid puzzle:
//! the same moves act on it, and any solution of the full puzzle also
//! solves the projection. The exact distance in the projection is
//! therefore a lower bound on the full distance (admissible), and the
//! maximum over orbits is still admissible. Orbit spaces are small
//! (at most C(25,12) = 5.2 million states), so these distances are
//! computed exactly by breadth-first search.
//!
//! This dominates the classic "single-ball distance plus matching,
//! divided by balls moved per twist" bound: that bound is itself a lower
//! bound on the projected distance, which the table stores exactly.

use std::sync::atomic::{AtomicU8, Ordering};

use rayon::prelude::*;

use crate::index::{OrbitIndex, StateIndex};
use crate::moves::MoveSet;

pub const UNSEEN: u8 = 255;

/// `next[m * size + r]`: rank after applying move `m` to orbit rank `r`.
pub struct OrbitTable {
    pub idx: OrbitIndex,
    pub next: Vec<u32>,
}

impl OrbitTable {
    pub fn build(ms: &MoveSet, idx: OrbitIndex) -> OrbitTable {
        let size = idx.size as usize;
        assert!(size < u32::MAX as usize);
        let mut next = vec![0u32; size * ms.len()];
        next.par_chunks_mut(size).enumerate().for_each(|(m, row)| {
            let mv = &ms.moves[m];
            for (r, slot) in row.iter_mut().enumerate() {
                let s = idx.unrank(r as u64);
                *slot = idx.rank(mv.apply(s)) as u32;
            }
        });
        OrbitTable { idx, next }
    }

    #[inline]
    pub fn step(&self, m: usize, r: usize) -> usize {
        self.next[m * self.idx.size as usize + r] as usize
    }
}

/// Exact distance to the target pattern, projected onto a group of
/// orbits (one orbit or several).
pub struct Pdb {
    pub idx: StateIndex,
    pub orbit_ids: Vec<usize>,
    pub dist: Vec<u8>,
    pub max: u8,
    /// Number of projected states at each distance.
    pub layers: Vec<u64>,
}

impl Pdb {
    pub fn build(ms: &MoveSet, orbit_ids: &[usize], target: u64) -> Pdb {
        let full = StateIndex::for_target(ms, target);
        let idx = StateIndex {
            orbits: orbit_ids
                .iter()
                .map(|&o| full.orbits[o].clone())
                .collect(),
            fixed: 0,
            size: orbit_ids
                .iter()
                .fold(1u64, |a, &o| a * full.orbits[o].size),
        };
        let mask = idx.orbits.iter().fold(0u64, |m, o| m | o.mask);
        let size = idx.size as usize;
        let dist: Vec<AtomicU8> =
            (0..size).map(|_| AtomicU8::new(UNSEEN)).collect();
        dist[idx.rank(target & mask) as usize].store(0, Ordering::Relaxed);
        let mut layers = vec![1u64];
        let mut d = 0u8;
        loop {
            let found: u64 = (0..size)
                .into_par_iter()
                .with_min_len(4096)
                .map(|r| {
                    if dist[r].load(Ordering::Relaxed) != d {
                        return 0;
                    }
                    let s = idx.unrank(r as u64);
                    let mut n = 0;
                    for mv in &ms.moves {
                        let j = idx.rank(mv.apply(s) & mask) as usize;
                        if dist[j].load(Ordering::Relaxed) == UNSEEN
                            && dist[j]
                                .compare_exchange(
                                    UNSEEN,
                                    d + 1,
                                    Ordering::Relaxed,
                                    Ordering::Relaxed,
                                )
                                .is_ok()
                        {
                            n += 1;
                        }
                    }
                    n
                })
                .sum();
            if found == 0 {
                break;
            }
            layers.push(found);
            d += 1;
            assert!(d < UNSEEN - 1);
        }
        let dist: Vec<u8> =
            dist.into_iter().map(|a| a.into_inner()).collect();
        Pdb { idx, orbit_ids: orbit_ids.to_vec(), dist, max: d, layers }
    }

    #[inline]
    pub fn h(&self, s: u64) -> u8 {
        self.dist[self.idx.rank(s) as usize]
    }
}
