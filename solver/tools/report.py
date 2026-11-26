"""Builds results/levels-difficulty.json and results/REPORT.md from the
per-level files in results/levels/.

Run from solver/:  python3 tools/report.py
"""

import json
import os

LEVELS = 'results/levels'
OUT_JSON = 'results/levels-difficulty.json'
OUT_MD = 'results/REPORT.md'


def load():
    rows = []
    for name in sorted(os.listdir(LEVELS)):
        if name.endswith('.json'):
            with open(os.path.join(LEVELS, name)) as f:
                rows.append(json.load(f))
    return rows


def summary(d):
    r = d['random']
    out = {
        'id': d['id'],
        'name': d['name'],
        'chapter': d['chapter'],
        'balls': d['balls'],
        'states': d['states'],
        'method': d['method'],
    }
    if d['method'] == 'exhaustive BFS':
        out['exact'] = True
        out['god_number'] = d['god_number']
        out['mean_distance'] = round(d['mean_distance'], 3)
        out['distance_counts'] = d['layers']
    else:
        out['exact'] = False
        opt = r['optimal'] or {}
        low = r['unsolved_lower_bounds'] or {}
        n_opt = opt.get('n', 0)
        n_low = low.get('n', 0)
        # Mean over all samples with unsolved ones counted at their
        # proven lower bound: a lower bound on the true sample mean.
        tot = opt.get('mean', 0) * n_opt + low.get('mean', 0) * n_low
        out['samples'] = n_opt + n_low
        out['samples_solved'] = n_opt
        out['mean_distance_solved'] = opt.get('mean')
        out['mean_distance_lower_bound'] = (
            round(tot / (n_opt + n_low), 3) if n_opt + n_low else None)
        out['max_distance_seen'] = opt.get('max')
        out['max_lower_bound_unsolved'] = low.get('max')
        out['distance_histogram'] = opt.get('histogram')
        out['god_number_lower_bound'] = max(
            opt.get('max') or 0, low.get('max') or 0)
    sc = d['scrambles']
    out['scrambles'] = [
        {
            'depth': x['depth'],
            'cases': x['cases'],
            'proven': x['proven'],
            'inverse_optimal_share': (
                round(x['inverse_optimal'] / x['proven'], 3)
                if x['proven'] else None),
            'mean_saving': x['mean_saving'],
            'mean_optimal': x['optimal']['mean'] if x['optimal'] else None,
            'millis_median': x['millis_median'],
            'millis_p95': x['millis_p95'],
            'millis_max': x['millis_max'],
        }
        for x in sc
    ]
    out['game_puzzles'] = d.get('game_puzzles', [])
    return out


def key(s):
    if s['exact']:
        return (s['mean_distance'], s['god_number'])
    return (s['mean_distance_lower_bound'] or 0,
            s['god_number_lower_bound'])


def fmt(x, nd=2):
    if x is None:
        return '-'
    if isinstance(x, float):
        return f'{x:.{nd}f}'
    return str(x)


def dailies_section():
    path = 'results/dailies-par.json'
    if not os.path.exists(path):
        return []
    with open(path) as f:
        d = json.load(f)
    ps = d['puzzles']
    out = ['## The game\'s first 364 dailies, solved one by one\n',
           'Single thread, this machine (Ryzen AI 7 PRO 350). Tables are '
           'built once per target and reused.\n',
           '| weekday | puzzles | mean given | mean par | given = par | '
           'median ms | max ms |',
           '|---|---|---|---|---|---|---|']
    names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    for wd in range(7):
        q = [p for p in ps if p['weekday'] == wd]
        if not q:
            continue
        t = sorted(p['millis'] for p in q)
        solved = [p for p in q if p['par'] is not None]
        out.append(
            f"| {names[wd]} | {len(q)} | "
            f"{sum(p['given'] for p in q) / len(q):.2f} | "
            f"{sum(p['par'] for p in solved) / len(solved):.2f} | "
            f"{sum(p['par'] == p['given'] for p in solved)} | "
            f"{t[len(t) // 2]:.2f} | {t[-1]:.0f} |")
    t = sorted(p['millis'] for p in ps)
    setup = sorted(p['setup_millis'] for p in ps)
    out.append('')
    out.append(f"All {len(ps)}: unsolved {sum(p['par'] is None for p in ps)}"
               f", median {t[len(t) // 2]:.3f} ms, p95 "
               f"{t[int(0.95 * len(t))]:.1f} ms, p99 "
               f"{t[int(0.99 * len(t))]:.0f} ms, max {t[-1]:.0f} ms. "
               f"Table build per target {setup[0]:.0f} to {setup[-1]:.0f} "
               f"ms; largest tables {d['largest_tables_bytes'] / 1e6:.0f}"
               ' MB.\n')
    return out


def shortener_section(rows):
    cases = [r for d in rows for r in d.get('shortener', [])]
    if not cases:
        return []
    out = ['## Shortener without full search\n',
           'Inverse of a uniform random move sequence, shortened by '
           'cancellation and optimal re-solving of windows up to 6 moves '
           '(no tail search), against the proven optimum.\n',
           '| given | cases | after cancel | after windows | optimal | '
           'reached optimal | mean ms |',
           '|---|---|---|---|---|---|---|']
    for depth in sorted({r['depth'] for r in cases}):
        q = [r for r in cases
             if r['depth'] == depth and r['optimal'] is not None]
        n = len(q)
        if not n:
            continue
        out.append(
            f"| {depth} | {n} | "
            f"{sum(r['cancel'] for r in q) / n:.2f} | "
            f"{sum(r['shortened'] for r in q) / n:.2f} | "
            f"{sum(r['optimal'] for r in q) / n:.2f} | "
            f"{sum(r['shortened'] == r['optimal'] for r in q) / n:.0%} | "
            f"{sum(r['millis'] for r in q) / n:.0f} |")
    out.append('')
    return out


RECOMMENDATION = """## Live par or precomputed par

- Precompute in Rust. Daily puzzles are a pure function of the date, so
  `bt-solver dailies` can write the par (and an optimal solution) for
  every day ahead of time: all 364 dailies took 36 s of solving on one
  thread plus table setup, with no unsolved puzzle. Shipping one small
  number (and optionally the moves) per day is a few kB.
- Live solving in the browser (WASM) is not worth it for the hard
  days: the solver needs up to 544 MB of tables and 31 s to build them
  for the largest levels, and a Sunday solve took up to 16 s even with
  the tables ready, on a desktop CPU. Mon to Wed would be instant, but
  a split design adds complexity for no player-visible gain.
- The game's own hint (inverse scramble) is optimal in 32 of 52
  Mondays and in no puzzle from Thursday on; on Sundays it is 10.2
  moves longer than optimal on average. Precomputed optimal solutions
  would also make Solution/hint much shorter.
- Scramble depth stops adding difficulty early: the mean optimal length
  goes from 6.6 (depth 10) to only 7.8 (depth 20). Most levels have a
  random-position mean of 9 to 11, so depth 20 is still below typical
  random difficulty; ranking by par rather than by depth would make
  the weekday curve honest.
"""


def main():
    rows = load()
    sums = [summary(d) for d in rows]
    sums.sort(key=key)
    with open(OUT_JSON, 'w') as f:
        json.dump({'levels': sums}, f, indent=1)

    lines = []
    lines.append('# Ball Twister level difficulty (generated)\n')
    lines.append('Ranked easiest to hardest by mean optimal distance of a '
                 'random position.\n')
    lines.append('| rank | id | level | balls | states | method | '
                 'mean | max |')
    lines.append('|---|---|---|---|---|---|---|---|')
    for i, s in enumerate(sums, 1):
        if s['exact']:
            mean, mx = fmt(s['mean_distance']), str(s['god_number'])
        else:
            mean = '>= ' + fmt(s['mean_distance_lower_bound'])
            mx = '>= ' + str(s['god_number_lower_bound'])
        lines.append(
            f"| {i} | {s['id']} | {s['name']} | {s['balls']} | "
            f"{s['states']:.2e} | "
            f"{'exact' if s['exact'] else 'sampled'} | {mean} | {mx} |")
    lines.append('')

    # Scramble statistics pooled over levels.
    lines.append('## Daily scramble depths, all levels pooled\n')
    lines.append('| depth | cases | inverse optimal | mean saving | '
                 'mean optimal | median ms | p95 ms | max ms |')
    lines.append('|---|---|---|---|---|---|---|---|')
    for depth in range(4, 21):
        cases = proven = same = 0
        save = opt = 0.0
        med, p95, mx = [], [], 0.0
        for d in rows:
            for x in d['scrambles']:
                if x['depth'] != depth:
                    continue
                cases += x['cases']
                proven += x['proven']
                same += x['inverse_optimal']
                if x['proven']:
                    save += x['mean_saving'] * x['proven']
                    opt += x['optimal']['mean'] * x['proven']
                if x['millis_median'] is not None:
                    med.append(x['millis_median'])
                    p95.append(x['millis_p95'])
                mx = max(mx, x['millis_max'])
        if not cases:
            continue
        lines.append(
            f'| {depth} | {cases} | {same / proven:.0%} | '
            f'{save / proven:.2f} | {opt / proven:.2f} | '
            f'{max(med):.1f} | {max(p95):.1f} | {mx:.0f} |')
    lines.append('')
    lines.append('Median and p95 columns show the worst level at that '
                 'depth.\n')
    lines += dailies_section()
    lines += shortener_section(rows)
    lines += RECOMMENDATION.splitlines()
    with open(OUT_MD, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
