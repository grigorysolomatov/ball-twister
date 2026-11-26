//! Board geometry and the move set.
//!
//! A state is a 64-bit mask with bit `i` set when cell `i` (row-major,
//! `r * 7 + c`) holds a yellow ball. Balls of one colour are identical,
//! so the mask is the whole state.
//!
//! Each move is stored as a general permutation of cells (`dest[i]` is
//! where the ball on cell `i` goes). Nothing below depends on moves being
//! 8-rings: orbits, move pruning and inverses are all derived from the
//! permutations, so variants such as fixed cells only change how the
//! permutation list is built.

pub const SIZE: usize = 7;
pub const CELLS: usize = SIZE * SIZE;

/// Clockwise neighbour cycle from the top-left corner, as in board.js.
const OFFSETS: [(i32, i32); 8] = [
    (-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1),
];

#[derive(Clone, Debug)]
pub struct Move {
    /// Code used by the game: `(r * 7 + c) * 2 + (dir < 0)`.
    pub code: u32,
    /// `dest[i]` is the cell the ball on cell `i` moves to.
    pub dest: [u8; CELLS],
    /// Cells that actually move, as `(from, to)`.
    pub pairs: Vec<(u8, u8)>,
    /// Mask of cells that move.
    pub support: u64,
}

impl Move {
    fn from_dest(code: u32, dest: [u8; CELLS]) -> Move {
        let mut pairs = Vec::new();
        let mut support = 0u64;
        for (i, &d) in dest.iter().enumerate() {
            if d as usize != i {
                pairs.push((i as u8, d));
                support |= 1 << i;
            }
        }
        Move { code, dest, pairs, support }
    }

    #[inline]
    pub fn apply(&self, s: u64) -> u64 {
        let mut out = s & !self.support;
        for &(f, t) in &self.pairs {
            out |= ((s >> f) & 1) << t;
        }
        out
    }
}

#[derive(Clone, Debug)]
pub struct MoveSet {
    pub moves: Vec<Move>,
    /// `inverse[m]` is the index of the move undoing `m`.
    pub inverse: Vec<usize>,
    /// `allowed[a * n + b]`: may `b` follow `a` in a canonical sequence.
    pub allowed: Vec<bool>,
    /// Cell orbits under the move group; balls never leave their orbit.
    pub orbits: Vec<Vec<u8>>,
    /// Largest number of cells one move changes inside each orbit.
    pub max_moved: Vec<u32>,
}

fn compose(a: &[u8; CELLS], b: &[u8; CELLS]) -> [u8; CELLS] {
    // First a, then b.
    let mut out = [0u8; CELLS];
    for i in 0..CELLS {
        out[i] = b[a[i] as usize];
    }
    out
}

fn identity() -> [u8; CELLS] {
    let mut out = [0u8; CELLS];
    for (i, v) in out.iter_mut().enumerate() {
        *v = i as u8;
    }
    out
}

impl MoveSet {
    /// The game's 50 twists: 25 inner pivots, clockwise then
    /// counter-clockwise, in the order board.js lists them.
    pub fn standard() -> MoveSet {
        let mut list = Vec::new();
        for r in 1..SIZE - 1 {
            for c in 1..SIZE - 1 {
                for &dir in &[1i32, -1] {
                    let idx: Vec<usize> = OFFSETS
                        .iter()
                        .map(|&(dr, dc)| {
                            ((r as i32 + dr) * SIZE as i32
                                + (c as i32 + dc)) as usize
                        })
                        .collect();
                    let shift = if dir > 0 { 2 } else { 6 };
                    let mut dest = identity();
                    for i in 0..8 {
                        dest[idx[i]] = idx[(i + shift) % 8] as u8;
                    }
                    let code = ((r * SIZE + c) * 2) as u32
                        + if dir < 0 { 1 } else { 0 };
                    list.push((code, dest));
                }
            }
        }
        MoveSet::from_perms(list)
    }

    /// Builds the derived tables from any list of cell permutations.
    pub fn from_perms(list: Vec<(u32, [u8; CELLS])>) -> MoveSet {
        let moves: Vec<Move> = list
            .into_iter()
            .map(|(code, dest)| Move::from_dest(code, dest))
            .collect();
        let n = moves.len();
        let id = identity();

        let mut inverse = vec![usize::MAX; n];
        for a in 0..n {
            for b in 0..n {
                if compose(&moves[a].dest, &moves[b].dest) == id {
                    inverse[a] = b;
                }
            }
        }

        // Canonical pairs. A pair (a, b) is dropped when the product
        // a.b is the identity, equals a single move, or equals another
        // pair (c, d) that comes first in (c, d) order. Any sequence can
        // be rewritten into one where every pair is kept without getting
        // longer, so the pruning never loses an optimal solution.
        let mut allowed = vec![true; n * n];
        let singles: Vec<[u8; CELLS]> =
            moves.iter().map(|m| m.dest).collect();
        let mut first: std::collections::HashMap<[u8; CELLS], usize> =
            std::collections::HashMap::new();
        for a in 0..n {
            for b in 0..n {
                let p = compose(&moves[a].dest, &moves[b].dest);
                let k = a * n + b;
                if p == id || singles.contains(&p) {
                    allowed[k] = false;
                    continue;
                }
                match first.get(&p) {
                    Some(_) => allowed[k] = false,
                    None => {
                        first.insert(p, k);
                    }
                }
            }
        }

        // Orbits by union-find over all moves.
        let mut parent: Vec<usize> = (0..CELLS).collect();
        fn find(p: &mut Vec<usize>, x: usize) -> usize {
            let mut x = x;
            while p[x] != x {
                p[x] = p[p[x]];
                x = p[x];
            }
            x
        }
        for m in &moves {
            for &(f, t) in &m.pairs {
                let (a, b) = (find(&mut parent, f as usize),
                              find(&mut parent, t as usize));
                if a != b {
                    parent[a] = b;
                }
            }
        }
        let mut groups: Vec<Vec<u8>> = Vec::new();
        let mut root_of: Vec<Option<usize>> = vec![None; CELLS];
        for cell in 0..CELLS {
            let r = find(&mut parent, cell);
            let g = match root_of[r] {
                Some(g) => g,
                None => {
                    groups.push(Vec::new());
                    root_of[r] = Some(groups.len() - 1);
                    groups.len() - 1
                }
            };
            groups[g].push(cell as u8);
        }
        // Single fixed cells never change; keep only orbits that move.
        let orbits: Vec<Vec<u8>> =
            groups.into_iter().filter(|g| g.len() > 1).collect();
        let max_moved = orbits
            .iter()
            .map(|o| {
                let mask = cells_mask(o);
                moves
                    .iter()
                    .map(|m| (m.support & mask).count_ones())
                    .max()
                    .unwrap_or(0)
            })
            .collect();
        MoveSet { moves, inverse, allowed, orbits, max_moved }
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.moves.len()
    }

    pub fn index_of_code(&self, code: u32) -> Option<usize> {
        self.moves.iter().position(|m| m.code == code)
    }

    pub fn apply_seq(&self, s: u64, seq: &[usize]) -> u64 {
        seq.iter().fold(s, |acc, &m| self.moves[m].apply(acc))
    }

    pub fn codes(&self, seq: &[usize]) -> Vec<u32> {
        seq.iter().map(|&m| self.moves[m].code).collect()
    }

    pub fn from_codes(&self, codes: &[u32]) -> Vec<usize> {
        codes
            .iter()
            .map(|&c| self.index_of_code(c).expect("unknown move code"))
            .collect()
    }

    /// Two moves commute when the cells they move do not overlap.
    #[inline]
    pub fn commute(&self, a: usize, b: usize) -> bool {
        self.moves[a].support & self.moves[b].support == 0
    }
}

pub fn cells_mask(cells: &[u8]) -> u64 {
    cells.iter().fold(0u64, |m, &c| m | (1u64 << c))
}

/// 'X' is yellow, anything else empty; whitespace is ignored.
pub fn parse_board(text: &str) -> u64 {
    let flat: Vec<char> =
        text.chars().filter(|c| !c.is_whitespace()).collect();
    assert_eq!(flat.len(), CELLS, "board must have 49 cells");
    flat.iter()
        .enumerate()
        .fold(0u64, |m, (i, &ch)| if ch == 'X' { m | 1 << i } else { m })
}

pub fn board_string(s: u64) -> String {
    (0..CELLS).map(|i| if s >> i & 1 == 1 { 'X' } else { '.' }).collect()
}

/// Seven-row picture for reports and debugging.
pub fn board_rows(s: u64) -> String {
    let flat = board_string(s);
    flat.as_bytes()
        .chunks(SIZE)
        .map(|r| String::from_utf8(r.to_vec()).unwrap())
        .collect::<Vec<_>>()
        .join("\n")
}
