//! Perfect indexing of states.
//!
//! Balls never leave their orbit, so the yellow count inside each orbit
//! is fixed. A state is then a choice of `k` cells out of each orbit's
//! `n` cells, and is numbered by the combinatorial number system (colex
//! order) per orbit, combined in mixed radix. Index 0 .. `size` covers
//! exactly the states with the given per-orbit counts.

use crate::moves::{cells_mask, MoveSet, CELLS};

/// Binomial table up to 64 choose 64 (fits in u64 for our sizes).
pub struct Binom {
    t: Vec<[u64; 65]>,
}

impl Binom {
    pub fn new() -> Binom {
        let mut t = vec![[0u64; 65]; 65];
        for n in 0..65 {
            t[n][0] = 1;
            for k in 1..=n {
                t[n][k] = t[n - 1][k - 1].saturating_add(t[n - 1][k]);
            }
        }
        Binom { t }
    }

    #[inline]
    pub fn c(&self, n: usize, k: usize) -> u64 {
        if k > n { 0 } else { self.t[n][k] }
    }
}

impl Default for Binom {
    fn default() -> Self {
        Binom::new()
    }
}

/// Numbering of the yellow subsets of one orbit with a fixed count.
#[derive(Clone)]
pub struct OrbitIndex {
    pub cells: Vec<u8>,
    pub mask: u64,
    pub k: usize,
    pub size: u64,
    /// Position of each board cell inside this orbit (255 if absent).
    pos: [u8; CELLS],
    /// `c[p][j]` = C(p, j), for p < n, j <= k.
    c: Vec<Vec<u64>>,
}

impl OrbitIndex {
    pub fn new(cells: &[u8], k: usize) -> OrbitIndex {
        let b = Binom::new();
        let mut cells = cells.to_vec();
        cells.sort_unstable();
        let n = cells.len();
        assert!(k <= n);
        let mut pos = [255u8; CELLS];
        for (i, &cell) in cells.iter().enumerate() {
            pos[cell as usize] = i as u8;
        }
        let c = (0..=n)
            .map(|p| (0..=k + 1).map(|j| b.c(p, j)).collect())
            .collect();
        OrbitIndex {
            mask: cells_mask(&cells),
            size: b.c(n, k),
            cells,
            k,
            pos,
            c,
        }
    }

    /// Colex rank of the yellow cells of this orbit in state `s`.
    #[inline]
    pub fn rank(&self, s: u64) -> u64 {
        let mut m = s & self.mask;
        let mut r = 0u64;
        let mut j = 1usize;
        while m != 0 {
            let cell = m.trailing_zeros() as usize;
            m &= m - 1;
            r += self.c[self.pos[cell] as usize][j];
            j += 1;
        }
        r
    }

    /// Inverse of `rank`: the orbit's yellow cells as a board mask.
    #[inline]
    pub fn unrank(&self, mut r: u64) -> u64 {
        let mut out = 0u64;
        let mut p = self.cells.len();
        for j in (1..=self.k).rev() {
            // Largest p with C(p, j) <= r.
            p -= 1;
            while self.c[p][j] > r {
                p -= 1;
            }
            r -= self.c[p][j];
            out |= 1u64 << self.cells[p];
        }
        out
    }
}

/// Mixed-radix index over all orbits.
#[derive(Clone)]
pub struct StateIndex {
    pub orbits: Vec<OrbitIndex>,
    /// Cells outside every orbit never change; their bits are kept here.
    pub fixed: u64,
    pub size: u64,
}

impl StateIndex {
    /// Index for all states reachable in principle from `target`
    /// (same yellow count in every orbit).
    pub fn for_target(ms: &MoveSet, target: u64) -> StateIndex {
        let orbits: Vec<OrbitIndex> = ms
            .orbits
            .iter()
            .map(|o| {
                let k = (target & cells_mask(o)).count_ones() as usize;
                OrbitIndex::new(o, k)
            })
            .collect();
        let all = orbits.iter().fold(0u64, |m, o| m | o.mask);
        let size = orbits
            .iter()
            .fold(1u64, |acc, o| acc.checked_mul(o.size).unwrap_or(u64::MAX));
        StateIndex { orbits, fixed: target & !all, size }
    }

    #[inline]
    pub fn rank(&self, s: u64) -> u64 {
        let mut r = 0u64;
        for o in &self.orbits {
            r = r * o.size + o.rank(s);
        }
        r
    }

    #[inline]
    pub fn unrank(&self, mut r: u64) -> u64 {
        let mut s = self.fixed;
        for o in self.orbits.iter().rev() {
            s |= o.unrank(r % o.size);
            r /= o.size;
        }
        s
    }

    /// True when `s` has the right count in every orbit.
    pub fn contains(&self, s: u64) -> bool {
        let all = self.orbits.iter().fold(0u64, |m, o| m | o.mask);
        s & !all == self.fixed
            && self
                .orbits
                .iter()
                .all(|o| (s & o.mask).count_ones() as usize == o.k)
    }
}
