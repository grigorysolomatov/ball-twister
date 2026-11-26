//! Perimeter table: every state within `depth` twists of the target,
//! with its exact distance.
//!
//! Inside the perimeter the distance is known exactly. Outside it the
//! distance is at least `depth + 1`. Both facts are lower bounds, so
//! `max(pdb, depth + 1)` for states not in the table stays admissible.
//! This raises the weak pattern-database values near the goal, which is
//! where most IDA* nodes are, and ends the search `depth` moves early.
//!
//! Storage is an open-addressing table of u64 entries: the state in the
//! low 49 bits and the distance in the top byte; 0 marks an empty slot
//! (state 0 is never reachable, since every level has a yellow ball).

use crate::moves::MoveSet;

pub struct Perimeter {
    pub depth: u8,
    slots: Vec<u64>,
    mask: usize,
    pub layers: Vec<u64>,
}

const KEY: u64 = (1u64 << 56) - 1;

#[inline]
fn hash(s: u64) -> usize {
    (s.wrapping_mul(0x9e37_79b9_7f4a_7c15) >> 20) as usize
}

impl Perimeter {
    /// Grows layers while the total stays under `max_states`.
    pub fn build(ms: &MoveSet, target: u64, max_states: u64) -> Perimeter {
        assert!(target != 0);
        // Layer sizes are not known in advance; estimate the next layer
        // as 40x the current one and stop before exceeding the cap.
        let mut layers_states: Vec<Vec<u64>> = vec![vec![target]];
        let mut seen: std::collections::HashSet<u64> =
            std::collections::HashSet::new();
        seen.insert(target);
        let mut total = 1u64;
        loop {
            let last = layers_states.last().unwrap();
            if total + last.len() as u64 * 40 > max_states {
                break;
            }
            let mut next = Vec::new();
            for &s in last {
                for mv in &ms.moves {
                    let t = mv.apply(s);
                    if seen.insert(t) {
                        next.push(t);
                    }
                }
            }
            if next.is_empty() {
                break;
            }
            total += next.len() as u64;
            layers_states.push(next);
        }
        drop(seen);
        let cap = (total as usize * 2).next_power_of_two().max(1024);
        let mut p = Perimeter {
            depth: (layers_states.len() - 1) as u8,
            slots: vec![0u64; cap],
            mask: cap - 1,
            layers: layers_states.iter().map(|l| l.len() as u64).collect(),
        };
        for (d, layer) in layers_states.iter().enumerate() {
            for &s in layer {
                p.insert(s, d as u8);
            }
        }
        p
    }

    fn insert(&mut self, s: u64, d: u8) {
        let mut i = hash(s) & self.mask;
        loop {
            if self.slots[i] == 0 {
                self.slots[i] = s | (d as u64) << 56;
                return;
            }
            i = (i + 1) & self.mask;
        }
    }

    #[inline]
    pub fn get(&self, s: u64) -> Option<u8> {
        let mut i = hash(s) & self.mask;
        loop {
            let e = self.slots[i];
            if e == 0 {
                return None;
            }
            if e & KEY == s {
                return Some((e >> 56) as u8);
            }
            i = (i + 1) & self.mask;
        }
    }

    /// Optimal moves from a state inside the perimeter to the target.
    pub fn finish(&self, ms: &MoveSet, mut s: u64) -> Vec<usize> {
        let mut d = self.get(s).expect("state not in perimeter");
        let mut path = Vec::new();
        while d > 0 {
            let m = (0..ms.len())
                .find(|&m| self.get(ms.moves[m].apply(s)) == Some(d - 1))
                .expect("broken perimeter");
            path.push(m);
            s = ms.moves[m].apply(s);
            d -= 1;
        }
        path
    }

    pub fn bytes(&self) -> usize {
        self.slots.len() * 8
    }
}
