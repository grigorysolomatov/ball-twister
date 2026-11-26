use std::collections::{HashMap, VecDeque};

use bt_solver::fullbfs::FullBfs;
use bt_solver::index::StateIndex;
use bt_solver::moves::{parse_board, MoveSet};
use bt_solver::pdb::Pdb;
use bt_solver::shorten::{cancel, meet, shorten};
use bt_solver::solver::Solver;

fn rng(seed: &mut u64) -> u64 {
    *seed ^= *seed << 13;
    *seed ^= *seed >> 7;
    *seed ^= *seed << 17;
    *seed
}

fn random_walk(ms: &MoveSet, s: u64, n: usize, seed: &mut u64) -> u64 {
    let mut s = s;
    for _ in 0..n {
        s = ms.moves[(rng(seed) % ms.len() as u64) as usize].apply(s);
    }
    s
}

/// Plain BFS distance, for tiny spaces only.
fn bfs_dist(ms: &MoveSet, target: u64) -> HashMap<u64, usize> {
    let mut d = HashMap::new();
    let mut q = VecDeque::new();
    d.insert(target, 0);
    q.push_back(target);
    while let Some(s) = q.pop_front() {
        let k = d[&s];
        for m in &ms.moves {
            let t = m.apply(s);
            if !d.contains_key(&t) {
                d.insert(t, k + 1);
                q.push_back(t);
            }
        }
    }
    d
}

#[test]
fn moves_agree_with_board_js() {
    let ms = MoveSet::standard();
    let text = include_str!("fixtures/moves.txt");
    let mut n = 0;
    for line in text.lines() {
        let parts: Vec<&str> = line.split(' ').collect();
        let start = parse_board(parts[0]);
        let codes: Vec<u32> =
            parts[1].split(',').map(|x| x.parse().unwrap()).collect();
        let end = parse_board(parts[2]);
        let seq = ms.from_codes(&codes);
        assert_eq!(ms.apply_seq(start, &seq), end, "line {n}");
        n += 1;
    }
    assert_eq!(n, 300);
}

#[test]
fn move_set_shape() {
    let ms = MoveSet::standard();
    assert_eq!(ms.len(), 50);
    let mut sizes: Vec<usize> = ms.orbits.iter().map(|o| o.len()).collect();
    sizes.sort();
    // Rotation keeps (r + c) parity: 24 odd cells, 25 even cells.
    assert_eq!(sizes, vec![24, 25]);
    for m in 0..ms.len() {
        let s = 0x1_2345_6789_abcd_u64 & ((1 << 49) - 1);
        assert_eq!(ms.moves[ms.inverse[m]].apply(ms.moves[m].apply(s)), s);
        assert_eq!(ms.moves[m].pairs.len(), 8);
    }
    // Four quarter turns are the identity.
    let s = 0x0f0f_0f0f_0f0f_u64;
    let m = &ms.moves[17];
    assert_eq!(m.apply(m.apply(m.apply(m.apply(s)))), s);
}

#[test]
fn index_round_trip() {
    let ms = MoveSet::standard();
    let target = parse_board(
        "X.X.X.X..X.X..X.X.X.X.XXXXX.X.X.X.X..X.X..X.X.X.X",
    );
    let idx = StateIndex::for_target(&ms, target);
    let mut seed = 99u64;
    for _ in 0..2000 {
        let s = random_walk(&ms, target, 40, &mut seed);
        assert!(idx.contains(s));
        let r = idx.rank(s);
        assert!(r < idx.size);
        assert_eq!(idx.unrank(r), s);
    }
    // Small space: ranks form a bijection.
    let small = parse_board(
        ".................X......X......X.................",
    );
    let idx = StateIndex::for_target(&ms, small);
    let mut seen = vec![false; idx.size as usize];
    for r in 0..idx.size {
        let s = idx.unrank(r);
        assert_eq!(idx.rank(s), r);
        assert!(!seen[r as usize]);
        seen[r as usize] = true;
    }
}

#[test]
fn single_ball_distances() {
    let ms = MoveSet::standard();
    // One yellow ball at the centre (3,3).
    let mut target = 0u64;
    target |= 1 << 24;
    let truth = bfs_dist(&ms, target);
    // One ball reaches every cell of its parity: 25 cells.
    assert_eq!(truth.len(), 25);
    let at = |r: usize, c: usize| 1u64 << (r * 7 + c);
    // Hand-checked: (1,3) is a corner of pivot (2,2) and turns onto
    // (3,3); (2,2) is an edge of pivot (2,3) and turns onto (3,3).
    assert_eq!(truth[&at(3, 3)], 0);
    assert_eq!(truth[&at(1, 3)], 1);
    assert_eq!(truth[&at(2, 2)], 1);
    assert_eq!(truth[&at(4, 4)], 1);
    // (3,3) is never moved by a turn that lands it on itself, and a
    // corner cell like (0,0) is only moved by pivot (1,1).
    assert!(truth[&at(0, 0)] >= 2);
    let pdb = Pdb::build(&ms, &[orbit_of(&ms, 24)], target);
    for (&s, &d) in &truth {
        assert_eq!(pdb.h(s) as usize, d);
    }
    // A corner ball: from (0,0) only pivot (1,1) moves it.
    let corner = 1u64 << 0;
    let truth = bfs_dist(&ms, corner);
    assert_eq!(truth.len(), 25);
    assert_eq!(truth[&at(0, 2)], 1);
    assert_eq!(truth[&at(2, 0)], 1);
    let pdb = Pdb::build(&ms, &[orbit_of(&ms, 0)], corner);
    for (&s, &d) in &truth {
        assert_eq!(pdb.h(s) as usize, d);
    }
    // r + c odd: 24 cells.
    let edge = at(0, 1);
    let truth = bfs_dist(&ms, edge);
    assert_eq!(truth.len(), 24);
}

fn orbit_of(ms: &MoveSet, cell: u8) -> usize {
    ms.orbits.iter().position(|o| o.contains(&cell)).unwrap()
}

#[test]
fn full_bfs_matches_plain_bfs() {
    let ms = MoveSet::standard();
    let target = parse_board(
        ".................X......X......X.................",
    );
    let truth = bfs_dist(&ms, target);
    let full = FullBfs::run(&ms, target, false);
    assert_eq!(full.size as usize, truth.len());
    let maxd = *truth.values().max().unwrap();
    assert_eq!(full.god(), maxd);
    for (&s, &d) in &truth {
        let (len, path) = full.solve(&ms, s);
        assert_eq!(len, d);
        assert_eq!(ms.apply_seq(s, &path), target);
    }
}

#[test]
fn solver_is_optimal_on_small_levels() {
    let ms = MoveSet::standard();
    for text in [
        ".................X......X......X.................",
        "..........X......X......X......X......X..........",
    ] {
        let target = parse_board(text);
        let truth = bfs_dist(&ms, target);
        let solver = Solver::new(&ms, target, 1_000_000);
        for (&s, &d) in truth.iter().take(3000) {
            let sol = solver.solve(s, None, u64::MAX);
            assert!(sol.optimal);
            assert_eq!(sol.moves.len(), d);
            assert_eq!(ms.apply_seq(s, &sol.moves), target);
            assert!(solver.h(s) as usize <= d, "heuristic overestimates");
        }
    }
}

#[test]
fn perimeter_solver_is_optimal() {
    let ms = MoveSet::standard();
    let target = parse_board(
        "..........X......X......X......X......X..........",
    );
    let truth = bfs_dist(&ms, target);
    let solver = Solver::new(&ms, target, 1_000_000).with_perimeter(20_000);
    let p = solver.perimeter.as_ref().unwrap();
    assert!(p.depth >= 2);
    for (&s, &d) in truth.iter().take(5000) {
        assert!(solver.h_full(s) <= d);
        if d <= p.depth as usize {
            assert_eq!(p.get(s), Some(d as u8));
        } else {
            assert_eq!(p.get(s), None);
        }
        let sol = solver.solve(s, None, u64::MAX);
        assert_eq!(sol.moves.len(), d);
        assert_eq!(ms.apply_seq(s, &sol.moves), target);
    }
}

#[test]
fn solver_with_upper_bound() {
    let ms = MoveSet::standard();
    let target = parse_board(
        "..........X......X......X......X......X..........",
    );
    let truth = bfs_dist(&ms, target);
    let solver = Solver::new(&ms, target, 1_000_000);
    let mut seed = 7u64;
    for _ in 0..200 {
        let n = 1 + (rng(&mut seed) % 12) as usize;
        let scramble: Vec<usize> = (0..n)
            .map(|_| (rng(&mut seed) % 50) as usize)
            .collect();
        let start = ms.apply_seq(target, &scramble);
        let known: Vec<usize> =
            scramble.iter().rev().map(|&m| ms.inverse[m]).collect();
        let sol = solver.solve(start, Some(&known), u64::MAX);
        assert_eq!(sol.moves.len(), truth[&start]);
        assert_eq!(ms.apply_seq(start, &sol.moves), target);
    }
}

#[test]
fn cancel_and_meet() {
    let ms = MoveSet::standard();
    // m0 at (1,1) cw, its inverse is m1; m48 at (5,5) does not overlap.
    let a = 0usize;
    let far = 48usize;
    assert!(ms.commute(a, far));
    let seq = vec![a, far, ms.inverse[a]];
    assert_eq!(cancel(&ms, &seq), vec![far]);
    let target = parse_board(
        "..........X......X......X......X......X..........",
    );
    let truth = bfs_dist(&ms, target);
    let mut seed = 3u64;
    for _ in 0..100 {
        let s = random_walk(&ms, target, 8, &mut seed);
        let p = meet(&ms, s, target, 5).unwrap();
        assert_eq!(p.len(), truth[&s]);
        assert_eq!(ms.apply_seq(s, &p), target);
    }
}

#[test]
fn shortener_keeps_solutions_valid() {
    let ms = MoveSet::standard();
    let target = parse_board(
        "..........X......X......X......X......X..........",
    );
    let truth = bfs_dist(&ms, target);
    let solver = Solver::new(&ms, target, 1_000_000);
    let mut seed = 11u64;
    for _ in 0..30 {
        let scramble: Vec<usize> = (0..25)
            .map(|_| (rng(&mut seed) % 50) as usize)
            .collect();
        let start = ms.apply_seq(target, &scramble);
        let known: Vec<usize> =
            scramble.iter().rev().map(|&m| ms.inverse[m]).collect();
        let (short, _) = shorten(&solver, start, &known, 2, 0);
        assert_eq!(ms.apply_seq(start, &short), target);
        assert!(short.len() >= truth[&start]);
        assert!(short.len() <= known.len());
    }
}

/// Future variant: a fixed cell. Twists whose ring contains it turn the
/// remaining 7 cells one step (ring of 7). Only the move list changes;
/// orbits, indexing, tables and the solver are derived from it.
#[test]
fn generic_moves_fixed_cell_variant() {
    use bt_solver::moves::CELLS;
    const RING: [(i32, i32); 8] = [
        (-1, -1), (-1, 0), (-1, 1), (0, 1),
        (1, 1), (1, 0), (1, -1), (0, -1),
    ];
    let fixed = 3 * 7 + 2usize;
    let mut list = Vec::new();
    for r in 1..6i32 {
        for c in 1..6i32 {
            let ring: Vec<usize> = RING
                .iter()
                .map(|&(dr, dc)| ((r + dr) * 7 + c + dc) as usize)
                .filter(|&i| i != fixed)
                .collect();
            let n = ring.len();
            let step = if n == 8 { 2 } else { 1 };
            for (k, sh) in [(0u32, step), (1, n - step)] {
                let mut dest = [0u8; CELLS];
                for (i, d) in dest.iter_mut().enumerate() {
                    *d = i as u8;
                }
                for i in 0..n {
                    dest[ring[i]] = ring[(i + sh) % n] as u8;
                }
                list.push((((r * 7 + c) * 2) as u32 + k, dest));
            }
        }
    }
    let ms = MoveSet::from_perms(list);
    assert_eq!(ms.len(), 50);
    // The fixed cell never moves, so it belongs to no orbit.
    assert!(ms.orbits.iter().all(|o| !o.contains(&(fixed as u8))));
    let target = parse_board(
        "..........X......X......X......X......X..........",
    ) | 1 << fixed;
    let truth = bfs_dist(&ms, target);
    let solver = Solver::new(&ms, target, 1_000_000);
    for (&s, &d) in truth.iter().take(500) {
        assert!(s & (1 << fixed) != 0);
        let sol = solver.solve(s, None, u64::MAX);
        assert_eq!(sol.moves.len(), d);
        assert_eq!(ms.apply_seq(s, &sol.moves), target);
    }
}
