//! Optimal solver: IDA* with pattern-database heuristics.
//!
//! Heuristic h(s) = max over databases of the exact distance of the
//! projection of `s` onto that database's orbits. Each projection is a
//! relaxation of the real puzzle (every real solution also solves it), so
//! each value is a lower bound and so is their maximum: h is admissible.
//! It is also consistent, because one move changes each projected
//! distance by at most one. IDA* with an admissible heuristic returns an
//! optimal solution.
//!
//! Search uses the canonical-pair table from `MoveSet`, which removes
//! inverse pairs, pairs equal to a single move and duplicate orderings of
//! commuting moves, without losing any optimal solution.
//!
//! When an upper bound (a known solution of length L, such as the
//! inverse scramble) is given, the search stops at threshold L and returns
//! the known solution if nothing shorter exists.

use std::time::Instant;

use crate::index::StateIndex;
use crate::moves::MoveSet;
use crate::pdb::Pdb;
use crate::perimeter::Perimeter;

pub struct Solver<'a> {
    pub ms: &'a MoveSet,
    pub target: u64,
    pub index: StateIndex,
    pub pdbs: Vec<Pdb>,
    pub perimeter: Option<Perimeter>,
}

#[derive(Clone, Debug)]
pub struct Solution {
    /// Move indices into the `MoveSet`.
    pub moves: Vec<usize>,
    /// True when the length is proven minimal.
    pub optimal: bool,
    /// Proven lower bound on the optimal length.
    pub lower: usize,
    pub nodes: u64,
    pub millis: f64,
}

/// Largest database size built automatically, in states (one byte each).
pub const DEFAULT_PDB_LIMIT: u64 = 300_000_000;

impl<'a> Solver<'a> {
    /// Builds one database per orbit and, when affordable, one for each
    /// pair of orbits (pairs give a much stronger bound).
    pub fn new(ms: &'a MoveSet, target: u64, limit: u64) -> Solver<'a> {
        let index = StateIndex::for_target(ms, target);
        let n = index.orbits.len();
        let mut groups: Vec<Vec<usize>> = Vec::new();
        let mut covered = vec![false; n];
        for a in 0..n {
            for b in a + 1..n {
                let size = index.orbits[a].size * index.orbits[b].size;
                if size <= limit && size > 1 {
                    groups.push(vec![a, b]);
                    covered[a] = true;
                    covered[b] = true;
                }
            }
        }
        for o in 0..n {
            if !covered[o] && index.orbits[o].size > 1 {
                groups.push(vec![o]);
            }
        }
        if n == 3 {
            let all: u64 = index.orbits.iter().map(|o| o.size).product();
            if all <= limit {
                groups = vec![vec![0, 1, 2]];
            }
        }
        let pdbs = groups.iter().map(|g| Pdb::build(ms, g, target)).collect();
        Solver { ms, target, index, pdbs, perimeter: None }
    }

    /// Adds a perimeter table of at most `max_states` states.
    pub fn with_perimeter(mut self, max_states: u64) -> Self {
        if max_states > 0 {
            self.perimeter =
                Some(Perimeter::build(self.ms, self.target, max_states));
        }
        self
    }

    #[inline]
    pub fn h(&self, s: u64) -> u32 {
        let mut best = 0u8;
        for p in &self.pdbs {
            let v = p.h(s);
            if v > best {
                best = v;
            }
        }
        best as u32
    }

    /// Heuristic including the perimeter table.
    pub fn h_full(&self, s: u64) -> usize {
        let h = self.h(s) as usize;
        match &self.perimeter {
            Some(p) => match p.get(s) {
                Some(d) => d as usize,
                None => h.max(p.depth as usize + 1),
            },
            None => h,
        }
    }

    /// Optimal solution, or the best proven bounds within `node_limit`.
    pub fn solve(
        &self,
        start: u64,
        known: Option<&[usize]>,
        node_limit: u64,
    ) -> Solution {
        let t0 = Instant::now();
        assert!(self.index.contains(start), "start not reachable");
        if let Some(k) = known {
            assert_eq!(self.ms.apply_seq(start, k), self.target);
        }
        let upper = known.map(|k| k.len());
        let mut path: Vec<usize> = Vec::with_capacity(64);
        let mut nodes = 0u64;
        let mut bound = self.h_full(start);
        loop {
            if let Some(u) = upper {
                if bound >= u {
                    return Solution {
                        moves: known.unwrap().to_vec(),
                        optimal: true,
                        lower: u,
                        nodes,
                        millis: ms_since(t0),
                    };
                }
            }
            let mut next = usize::MAX;
            let r = self.dfs(
                start, 0, bound, usize::MAX, &mut path, &mut nodes,
                &mut next, node_limit,
            );
            match r {
                Found::Yes => {
                    return Solution {
                        lower: path.len(),
                        moves: path,
                        optimal: true,
                        nodes,
                        millis: ms_since(t0),
                    };
                }
                Found::Abort => {
                    return Solution {
                        moves: known.map(|k| k.to_vec()).unwrap_or_default(),
                        optimal: false,
                        lower: bound,
                        nodes,
                        millis: ms_since(t0),
                    };
                }
                Found::No => {
                    assert!(next != usize::MAX, "unsolvable state");
                    bound = next;
                }
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn dfs(
        &self,
        s: u64,
        g: usize,
        bound: usize,
        last: usize,
        path: &mut Vec<usize>,
        nodes: &mut u64,
        next: &mut usize,
        limit: u64,
    ) -> Found {
        *nodes += 1;
        if *nodes > limit {
            return Found::Abort;
        }
        let mut h = self.h(s) as usize;
        if let Some(p) = &self.perimeter {
            if h <= p.depth as usize {
                match p.get(s) {
                    Some(d) => {
                        let f = g + d as usize;
                        if f <= bound {
                            path.extend(p.finish(self.ms, s));
                            return Found::Yes;
                        }
                        if f < *next {
                            *next = f;
                        }
                        return Found::No;
                    }
                    None => h = p.depth as usize + 1,
                }
            }
        }
        let f = g + h;
        if f > bound {
            if f < *next {
                *next = f;
            }
            return Found::No;
        }
        if s == self.target {
            return Found::Yes;
        }
        let n = self.ms.len();
        for m in 0..n {
            if last != usize::MAX && !self.ms.allowed[last * n + m] {
                continue;
            }
            let t = self.ms.moves[m].apply(s);
            if t == s {
                continue;
            }
            path.push(m);
            match self.dfs(t, g + 1, bound, m, path, nodes, next, limit) {
                Found::No => {}
                other => return other,
            }
            path.pop();
        }
        Found::No
    }
}

enum Found {
    Yes,
    No,
    Abort,
}

fn ms_since(t0: Instant) -> f64 {
    t0.elapsed().as_secs_f64() * 1000.0
}
