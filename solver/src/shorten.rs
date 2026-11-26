//! Solution shortener for when an optimal search is too slow.
//!
//! Three passes, repeated until nothing changes:
//! 1. Cancellation: a move and its inverse cancel even when separated by
//!    moves that commute with them (moves whose cells do not overlap).
//! 2. Window re-solve: the stretch between two states on the path is
//!    replaced by an optimal path between them, found by bidirectional
//!    breadth-first search (exact for windows up to `2 * half`).
//! 3. Tail re-solve: from a state on the path, the remaining moves are
//!    replaced by an optimal solution from the main solver, when that
//!    finishes within a node budget.
//!
//! Every pass keeps the path valid; the result is checked by replay.

use std::collections::HashMap;

use crate::moves::MoveSet;
use crate::solver::Solver;

/// Removes inverse pairs separated only by commuting moves.
pub fn cancel(ms: &MoveSet, seq: &[usize]) -> Vec<usize> {
    let mut out: Vec<usize> = seq.to_vec();
    let mut changed = true;
    while changed {
        changed = false;
        'outer: for i in 0..out.len() {
            for j in i + 1..out.len() {
                if out[j] == ms.inverse[out[i]] {
                    out.remove(j);
                    out.remove(i);
                    changed = true;
                    break 'outer;
                }
                if !ms.commute(out[i], out[j]) {
                    break;
                }
            }
        }
    }
    out
}

/// States visited along `seq` from `start`, including both ends.
pub fn states(ms: &MoveSet, start: u64, seq: &[usize]) -> Vec<u64> {
    let mut v = Vec::with_capacity(seq.len() + 1);
    let mut s = start;
    v.push(s);
    for &m in seq {
        s = ms.moves[m].apply(s);
        v.push(s);
    }
    v
}

/// Shortest path from `a` to `b` if it has at most `2 * half` moves.
pub fn meet(ms: &MoveSet, a: u64, b: u64, half: usize) -> Option<Vec<usize>> {
    if a == b {
        return Some(Vec::new());
    }
    // Forward layers from a, then backward layers from b, alternating,
    // with parent links for path recovery.
    let mut fwd: HashMap<u64, (u64, usize)> = HashMap::new();
    let mut bwd: HashMap<u64, (u64, usize)> = HashMap::new();
    fwd.insert(a, (a, usize::MAX));
    bwd.insert(b, (b, usize::MAX));
    let mut ff = vec![a];
    let mut bf = vec![b];
    for step in 0..2 * half {
        let forward = step % 2 == 0;
        let (front, own, other) = if forward {
            (&mut ff, &mut fwd, &bwd)
        } else {
            (&mut bf, &mut bwd, &fwd)
        };
        let mut next = Vec::new();
        let mut hit: Option<u64> = None;
        for &s in front.iter() {
            for (m, mv) in ms.moves.iter().enumerate() {
                let t = mv.apply(s);
                if own.contains_key(&t) {
                    continue;
                }
                own.insert(t, (s, m));
                if other.contains_key(&t) {
                    hit = Some(t);
                    break;
                }
                next.push(t);
            }
            if hit.is_some() {
                break;
            }
        }
        if let Some(mid) = hit {
            let mut left = Vec::new();
            let mut s = mid;
            while s != a {
                let (p, m) = fwd[&s];
                left.push(m);
                s = p;
            }
            left.reverse();
            let mut s = mid;
            while s != b {
                let (p, m) = bwd[&s];
                // Backward edge p -> s used move m; walk s -> p.
                left.push(ms.inverse[m]);
                s = p;
            }
            return Some(left);
        }
        *front = next;
    }
    None
}

pub struct ShortenStats {
    pub before: usize,
    pub after_cancel: usize,
    pub after_window: usize,
    pub after_tail: usize,
}

/// Shortens `seq` (which must solve `start`) as far as the passes allow.
pub fn shorten(
    solver: &Solver,
    start: u64,
    seq: &[usize],
    half: usize,
    tail_nodes: u64,
) -> (Vec<usize>, ShortenStats) {
    let ms = solver.ms;
    assert_eq!(ms.apply_seq(start, seq), solver.target);
    let before = seq.len();
    let mut cur = cancel(ms, seq);
    let after_cancel = cur.len();
    let w = 2 * half;
    loop {
        let len0 = cur.len();
        // Windows longer than any optimal path of length <= w.
        let mut i = 0;
        while i < cur.len() {
            let st = states(ms, start, &cur);
            let mut replaced = false;
            let end_max = (i + w + 2).min(cur.len());
            for j in (i + 2..=end_max).rev() {
                if let Some(p) = meet(ms, st[i], st[j], half) {
                    if p.len() < j - i {
                        let mut n = cur[..i].to_vec();
                        n.extend_from_slice(&p);
                        n.extend_from_slice(&cur[j..]);
                        cur = cancel(ms, &n);
                        replaced = true;
                        break;
                    }
                }
            }
            if !replaced {
                i += 1;
            }
        }
        if cur.len() >= len0 {
            break;
        }
    }
    let after_window = cur.len();
    // Tail re-solve, longest tail first that finishes within budget.
    let st = states(ms, start, &cur);
    for i in 0..cur.len() {
        let tail = &cur[i..];
        let sol = solver.solve(st[i], Some(tail), tail_nodes);
        if sol.optimal {
            if sol.moves.len() < tail.len() {
                let mut n = cur[..i].to_vec();
                n.extend_from_slice(&sol.moves);
                cur = n;
            }
            break;
        }
    }
    assert_eq!(ms.apply_seq(start, &cur), solver.target);
    let after_tail = cur.len();
    (cur, ShortenStats { before, after_cancel, after_window, after_tail })
}
