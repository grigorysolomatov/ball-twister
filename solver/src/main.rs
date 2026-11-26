//! Command line front end.
//!
//!   bt-solver info                    state-space size per level
//!   bt-solver solve <target> <start>  optimal solution of one position
//!   bt-solver level <id> [options]    difficulty analysis of one level
//!
//! `level` writes results/levels/<id>.json. Options:
//!   --exact-limit N   run exhaustive BFS when the space has <= N states
//!   --samples N       random positions (200+ random twists) to solve
//!   --per-depth N     game-style scrambles per depth 4..20
//!   --nodes N         IDA* node budget per solve before giving up

use std::time::Instant;

use rayon::prelude::*;
use serde_json::{json, Value};

use bt_solver::data::{read, Level, Puzzle};
use bt_solver::fullbfs::FullBfs;
use bt_solver::index::StateIndex;
use bt_solver::moves::{parse_board, MoveSet, CELLS};
use bt_solver::shorten::shorten;
use bt_solver::solver::{Solver, DEFAULT_PDB_LIMIT};

const DATA: &str = "data";
const OUT: &str = "results/levels";

struct Opts {
    exact_limit: u64,
    samples: usize,
    search_samples: usize,
    per_depth: usize,
    nodes: u64,
    perimeter: u64,
}

fn arg_u64(args: &[String], name: &str, default: u64) -> u64 {
    args.iter()
        .position(|a| a == name)
        .map(|i| args[i + 1].parse().expect("bad number"))
        .unwrap_or(default)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let ms = MoveSet::standard();
    match args.get(1).map(|s| s.as_str()) {
        Some("info") => info(&ms),
        Some("solve") => {
            let target = parse_board(&args[2]);
            let start = parse_board(&args[3]);
            let solver = Solver::new(&ms, target, DEFAULT_PDB_LIMIT)
                .with_perimeter(40_000_000);
            let sol = solver.solve(start, None, u64::MAX);
            println!(
                "{} moves: {:?} ({:.1} ms, {} nodes)",
                sol.moves.len(),
                ms.codes(&sol.moves),
                sol.millis,
                sol.nodes
            );
        }
        Some("level") => {
            let id: usize = args[2].parse().unwrap();
            let opts = Opts {
                exact_limit: arg_u64(&args, "--exact-limit", 3_000_000_000),
                samples: arg_u64(&args, "--samples", 300) as usize,
                search_samples: arg_u64(&args, "--search-samples", 100)
                    as usize,
                per_depth: arg_u64(&args, "--per-depth", 40) as usize,
                nodes: arg_u64(&args, "--nodes", 2_000_000_000),
                perimeter: arg_u64(&args, "--perimeter", 40_000_000),
            };
            level(&ms, id, &opts);
        }
        Some("dailies") => {
            let perim = arg_u64(&args, "--perimeter", 60_000_000);
            let pdb = arg_u64(&args, "--pdb-limit", DEFAULT_PDB_LIMIT);
            let nodes = arg_u64(&args, "--nodes", 3_000_000_000);
            let out = args
                .iter()
                .position(|a| a == "--out")
                .map(|i| args[i + 1].clone());
            dailies(&ms, perim, pdb, nodes, out);
        }
        _ => eprintln!("usage: bt-solver info | solve | level | dailies"),
    }
}

fn levels() -> Vec<Level> {
    read(&format!("{DATA}/levels.json"))
}

fn info(ms: &MoveSet) {
    for l in levels() {
        let t = parse_board(&l.target);
        let idx = StateIndex::for_target(ms, t);
        let ks: Vec<usize> = idx.orbits.iter().map(|o| o.k).collect();
        println!(
            "{:>2} {:<24} balls {:>2} orbit counts {:?} states {:.3e}",
            l.id,
            l.name,
            t.count_ones(),
            ks,
            idx.size as f64
        );
    }
}

/// xorshift64*, enough for sampling.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545_f491_4f6c_dd1d)
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

/// The game's scramble rule (puzzle.js `scramble`) with our own random
/// numbers: no pivot twice in a row, stop if the target is hit, reject
/// boards that are solved, nearly solved (> 43 correct cells at depth 6+)
/// or solvable within min(3, depth / 2 - 1) twists.
fn game_scramble(
    ms: &MoveSet,
    target: u64,
    depth: usize,
    rng: &mut Rng,
    dist_le: &dyn Fn(u64, usize) -> bool,
) -> Option<(u64, Vec<usize>)> {
    for _ in 0..200 {
        let mut s = target;
        let mut applied = Vec::new();
        let mut last = usize::MAX;
        for _ in 0..depth {
            let mut p;
            loop {
                p = rng.below(25) as usize;
                if p != last {
                    break;
                }
            }
            last = p;
            let m = p * 2 + rng.below(2) as usize;
            s = ms.moves[m].apply(s);
            applied.push(m);
            if s == target {
                break;
            }
        }
        if s == target {
            continue;
        }
        let correct = CELLS as u32 - (s ^ target).count_ones();
        if correct > CELLS as u32 - 6 && depth >= 6 {
            continue;
        }
        let quick = (depth as i64 / 2 - 1).min(3);
        if quick >= 1 && dist_le(s, quick as usize) {
            continue;
        }
        let sol: Vec<usize> =
            applied.iter().rev().map(|&m| ms.inverse[m]).collect();
        return Some((s, sol));
    }
    None
}

enum Engine<'a> {
    Exact(FullBfs),
    Search(Solver<'a>),
}

struct Outcome {
    len: usize,
    optimal: bool,
    lower: usize,
    millis: f64,
}

impl<'a> Engine<'a> {
    fn solve(
        &self,
        ms: &MoveSet,
        start: u64,
        known: Option<&[usize]>,
        nodes: u64,
    ) -> Outcome {
        match self {
            Engine::Exact(b) => {
                let t0 = Instant::now();
                let (len, path) = b.solve(ms, start);
                assert_eq!(ms.apply_seq(start, &path), b_target(b));
                Outcome {
                    len,
                    optimal: true,
                    lower: len,
                    millis: t0.elapsed().as_secs_f64() * 1000.0,
                }
            }
            Engine::Search(s) => {
                let sol = s.solve(start, known, nodes);
                if sol.optimal {
                    assert_eq!(ms.apply_seq(start, &sol.moves), s.target);
                }
                Outcome {
                    len: sol.moves.len(),
                    optimal: sol.optimal,
                    lower: sol.lower,
                    millis: sol.millis,
                }
            }
        }
    }
}

fn b_target(b: &FullBfs) -> u64 {
    b.target
}

fn stats(xs: &[usize]) -> Value {
    if xs.is_empty() {
        return json!(null);
    }
    let n = xs.len() as f64;
    let mean = xs.iter().sum::<usize>() as f64 / n;
    let max = *xs.iter().max().unwrap();
    let min = *xs.iter().min().unwrap();
    let mut hist = vec![0usize; max + 1];
    for &x in xs {
        hist[x] += 1;
    }
    json!({"n": xs.len(), "mean": mean, "min": min, "max": max,
           "histogram": hist})
}

fn level(ms: &MoveSet, id: usize, o: &Opts) {
    let lv = levels().into_iter().find(|l| l.id == id).unwrap();
    let target = parse_board(&lv.target);
    let idx = StateIndex::for_target(ms, target);
    let t0 = Instant::now();
    eprintln!("level {id}: {:.3e} states", idx.size as f64);
    let exact = idx.size <= o.exact_limit;
    let engine = if exact {
        Engine::Exact(FullBfs::run(ms, target, true))
    } else {
        Engine::Search(
            Solver::new(ms, target, DEFAULT_PDB_LIMIT)
                .with_perimeter(o.perimeter),
        )
    };
    let setup_s = t0.elapsed().as_secs_f64();
    let mut out = json!({
        "id": id, "name": lv.name, "chapter": lv.chapter,
        "target": lv.target, "balls": target.count_ones(),
        "states": idx.size, "setup_seconds": setup_s,
    });
    // A searcher for small-distance checks in scramble rejection.
    let quick_solver = match &engine {
        Engine::Search(s) => Some(s),
        _ => None,
    };
    let dist_le = |s: u64, d: usize| -> bool {
        match &engine {
            Engine::Exact(b) => b.solve(ms, s).0 <= d,
            Engine::Search(_) => {
                let sv = quick_solver.unwrap();
                let r = sv.solve(s, None, 2_000_000);
                r.optimal && r.moves.len() <= d
            }
        }
    };

    match &engine {
        Engine::Exact(b) => {
            out["method"] = json!("exhaustive BFS");
            out["god_number"] = json!(b.god());
            out["mean_distance"] = json!(b.mean());
            out["layers"] = json!(b.layers);
            out["bfs_seconds"] = json!(b.seconds);
        }
        Engine::Search(s) => {
            out["method"] = json!("IDA* on random positions");
            out["pdb_max"] = json!(s.pdbs.iter().map(|p| p.max)
                .collect::<Vec<_>>());
            out["pdb_layers"] = json!(s.pdbs.iter().map(|p| &p.layers)
                .collect::<Vec<_>>());
            if let Some(p) = &s.perimeter {
                out["perimeter_layers"] = json!(p.layers);
            }
        }
    }

    // Random positions: 200 + random twists from the target.
    let mut rng = Rng(0x9e37_79b9_7f4a_7c15 ^ (id as u64 + 1));
    let n_samples = if exact { o.samples } else { o.search_samples };
    let starts: Vec<u64> = (0..n_samples)
        .map(|_| {
            let mut s = target;
            let n = 200 + rng.below(56);
            for _ in 0..n {
                s = ms.moves[rng.below(ms.len() as u64) as usize].apply(s);
            }
            s
        })
        .collect();
    let res: Vec<Outcome> = starts
        .par_iter()
        .map(|&s| engine.solve(ms, s, None, o.nodes))
        .collect();
    let solved: Vec<usize> =
        res.iter().filter(|r| r.optimal).map(|r| r.len).collect();
    let lowers: Vec<usize> =
        res.iter().filter(|r| !r.optimal).map(|r| r.lower).collect();
    let ms_rand: Vec<f64> = res.iter().map(|r| r.millis).collect();
    out["random"] = json!({
        "optimal": stats(&solved),
        "unsolved": lowers.len(),
        "unsolved_lower_bounds": stats(&lowers),
        "millis_mean": mean_f(&ms_rand),
        "millis_max": ms_rand.iter().cloned().fold(0.0, f64::max),
    });
    eprintln!(
        "  random: {} solved, {} over budget, {:.1}s",
        solved.len(),
        lowers.len(),
        t0.elapsed().as_secs_f64()
    );

    // Game-style scrambles at each daily depth.
    let mut by_depth = Vec::new();
    for depth in 4..=20 {
        let mut r2 = Rng(0x51_7cc1_b727_220a ^ ((id * 100 + depth) as u64));
        let cases: Vec<(u64, Vec<usize>)> = (0..o.per_depth)
            .filter_map(|_| game_scramble(ms, target, depth, &mut r2,
                                          &dist_le))
            .collect();
        let res: Vec<(usize, Outcome)> = cases
            .par_iter()
            .map(|(s, sol)| {
                (sol.len(), engine.solve(ms, *s, Some(sol), o.nodes))
            })
            .collect();
        let opt: Vec<&(usize, Outcome)> =
            res.iter().filter(|(_, r)| r.optimal).collect();
        let same = opt.iter().filter(|(l, r)| r.len == *l).count();
        let saved: Vec<usize> =
            opt.iter().map(|(l, r)| l - r.len).collect();
        let lens: Vec<usize> = opt.iter().map(|(_, r)| r.len).collect();
        let times: Vec<f64> = res.iter().map(|(_, r)| r.millis).collect();
        let times_opt: Vec<f64> =
            opt.iter().map(|(_, r)| r.millis).collect();
        by_depth.push(json!({
            "depth": depth, "cases": res.len(), "proven": opt.len(),
            "inverse_optimal": same,
            "mean_saving": mean_u(&saved),
            "max_saving": saved.iter().max(),
            "optimal": stats(&lens),
            "millis_mean": mean_f(&times),
            "millis_median": median(&times),
            "millis_p95": pct(&times, 0.95),
            "millis_max": times.iter().cloned().fold(0.0, f64::max),
            "millis_mean_proven": mean_f(&times_opt),
        }));
    }
    out["scrambles"] = json!(by_depth);
    eprintln!("  scrambles done, {:.1}s", t0.elapsed().as_secs_f64());

    // The game's own puzzles for this level (dailies and level play).
    let dailies: Vec<Puzzle> = read(&format!("{DATA}/dailies.json"));
    let plays: Vec<Puzzle> = read(&format!("{DATA}/level-plays.json"));
    let mine: Vec<(String, Puzzle)> = dailies
        .into_iter()
        .filter(|p| p.target == lv.target)
        .map(|p| (format!("daily {}", p.number.unwrap()), p))
        .chain(
            plays
                .into_iter()
                .filter(|p| p.id == Some(id))
                .map(|p| ("level play".to_string(), p)),
        )
        .collect();
    let game: Vec<Value> = mine
        .par_iter()
        .map(|(label, p)| {
            let start = parse_board(&p.start);
            let known = ms.from_codes(&p.solution);
            assert_eq!(ms.apply_seq(start, &known), target);
            let r = engine.solve(ms, start, Some(&known), o.nodes);
            json!({"puzzle": label, "given": known.len(),
                   "optimal": if r.optimal { json!(r.len) }
                              else { json!(null) },
                   "lower_bound": r.lower, "millis": r.millis})
        })
        .collect();
    out["game_puzzles"] = json!(game);

    // Shortener check: inverse of a long random walk, shortened without
    // a full search, against the optimum where known.
    if let Engine::Search(s) = &engine {
        let mut r3 = Rng(0xabcdef ^ id as u64);
        let mut rows = Vec::new();
        for depth in [12usize, 16, 20, 30] {
            let cases: Vec<Value> = (0..12)
                .map(|_| {
                    let seq: Vec<usize> = (0..depth)
                        .map(|_| r3.below(ms.len() as u64) as usize)
                        .collect();
                    (ms.apply_seq(target, &seq), seq)
                })
                .collect::<Vec<_>>()
                .par_iter()
                .map(|(start, seq)| {
                    let known: Vec<usize> =
                        seq.iter().rev().map(|&m| ms.inverse[m]).collect();
                    let t = Instant::now();
                    let (short, st) = shorten(s, *start, &known, 3, 0);
                    let ms_short = t.elapsed().as_secs_f64() * 1000.0;
                    let opt = s.solve(*start, Some(&short), o.nodes);
                    json!({"depth": depth, "given": st.before,
                           "cancel": st.after_cancel,
                           "window": st.after_window,
                           "shortened": short.len(),
                           "optimal": if opt.optimal {
                               json!(opt.moves.len()) } else { json!(null) },
                           "millis": ms_short})
                })
                .collect();
            rows.extend(cases);
        }
        out["shortener"] = json!(rows);
    }

    out["total_seconds"] = json!(t0.elapsed().as_secs_f64());
    std::fs::create_dir_all(OUT).unwrap();
    let path = format!("{OUT}/{id:02}.json");
    std::fs::write(&path, serde_json::to_string_pretty(&out).unwrap())
        .unwrap();
    eprintln!("  wrote {path} ({:.1}s)", t0.elapsed().as_secs_f64());
}

fn mean_f(xs: &[f64]) -> Option<f64> {
    if xs.is_empty() { None } else { Some(xs.iter().sum::<f64>()
                                          / xs.len() as f64) }
}

fn mean_u(xs: &[usize]) -> Option<f64> {
    if xs.is_empty() { None } else { Some(xs.iter().sum::<usize>() as f64
                                          / xs.len() as f64) }
}

fn pct(xs: &[f64], q: f64) -> Option<f64> {
    if xs.is_empty() {
        return None;
    }
    let mut v = xs.to_vec();
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    Some(v[((v.len() - 1) as f64 * q).round() as usize])
}

fn median(xs: &[f64]) -> Option<f64> {
    pct(xs, 0.5)
}

/// Solves the game's daily puzzles one after another on one thread,
/// so the per-solve time is what a single player's device would see
/// (on this machine's CPU). Tables are built once per level target.
fn dailies(ms: &MoveSet, perim: u64, pdb: u64, nodes: u64,
           out: Option<String>) {
    let days: Vec<Puzzle> = read(&format!("{DATA}/dailies.json"));
    let mut solvers: std::collections::HashMap<u64, (Solver, f64)> =
        std::collections::HashMap::new();
    let mut rows = Vec::new();
    for p in &days {
        let target = parse_board(&p.target);
        let start = parse_board(&p.start);
        let known = ms.from_codes(&p.solution);
        assert_eq!(ms.apply_seq(start, &known), target);
        let (solver, setup) = solvers.entry(target).or_insert_with(|| {
            let t = Instant::now();
            let s = Solver::new(ms, target, pdb).with_perimeter(perim);
            (s, t.elapsed().as_secs_f64() * 1000.0)
        });
        let sol = solver.solve(start, Some(&known), nodes);
        if sol.optimal {
            assert_eq!(ms.apply_seq(start, &sol.moves), target);
        }
        eprintln!(
            "daily {:>3} wd {} given {:>2} optimal {:>2} {:>9.1} ms",
            p.number.unwrap(), p.weekday.unwrap(), known.len(),
            if sol.optimal { sol.moves.len() as i64 } else { -1 },
            sol.millis
        );
        rows.push(json!({
            "number": p.number, "weekday": p.weekday, "name": p.name,
            "given": known.len(),
            "par": if sol.optimal { json!(sol.moves.len()) }
                   else { json!(null) },
            "lower_bound": sol.lower,
            "solution": if sol.optimal { json!(ms.codes(&sol.moves)) }
                        else { json!(null) },
            "millis": sol.millis, "nodes": sol.nodes,
            "setup_millis": *setup,
        }));
    }
    let table_bytes: usize = solvers
        .values()
        .map(|(s, _)| {
            s.pdbs.iter().map(|p| p.dist.len()).sum::<usize>()
                + s.perimeter.as_ref().map(|p| p.bytes()).unwrap_or(0)
        })
        .max()
        .unwrap_or(0);
    let res = json!({"perimeter_cap": perim, "pdb_limit": pdb,
                     "largest_tables_bytes": table_bytes,
                     "puzzles": rows});
    let text = serde_json::to_string_pretty(&res).unwrap();
    match out {
        Some(f) => std::fs::write(f, text).unwrap(),
        None => println!("{text}"),
    }
}
