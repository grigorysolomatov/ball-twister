import json, re
REPO = '/home/gman/projects/games/ball-twister'

def grid():
    return [['.'] * 7 for _ in range(7)]

def rows(g):
    return [''.join(r) for r in g]

SEGS = {0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
        5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg'}

def seg5(d):
    """Gapped seven-segment digit, 5 wide x 7 tall in columns 1-5."""
    g = grid()
    cells = {'a': [(0, c) for c in (2, 3, 4)], 'g': [(3, c) for c in (2, 3, 4)],
             'd': [(6, c) for c in (2, 3, 4)],
             'f': [(1, 1), (2, 1)], 'b': [(1, 5), (2, 5)],
             'e': [(4, 1), (5, 1)], 'c': [(4, 5), (5, 5)]}
    for s in SEGS[d]:
        for r, c in cells[s]:
            g[r][c] = 'X'
    return rows(g)

def seg3(g, d, x0):
    """Filled-corner seven-segment digit, 3 wide x 7 tall at column x0."""
    cells = {'a': [(0, c) for c in range(3)], 'g': [(3, c) for c in range(3)],
             'd': [(6, c) for c in range(3)],
             'f': [(r, 0) for r in range(4)], 'b': [(r, 2) for r in range(4)],
             'e': [(r, 0) for r in range(3, 7)], 'c': [(r, 2) for r in range(3, 7)]}
    for s in SEGS[d]:
        for r, c in cells[s]:
            g[r][x0 + c] = 'X'

PIX = {
    0: '.XXX. X...X X...X X...X X...X X...X .XXX.',
    1: '..X.. .XX.. ..X.. ..X.. ..X.. ..X.. .XXX.',
    2: '.XXX. X...X ....X ...X. ..X.. .X... XXXXX',
    3: 'XXXX. ....X ....X .XXX. ....X ....X XXXX.',
    4: '...X. ..XX. .X.X. X..X. XXXXX ...X. ...X.',
    5: 'XXXXX X.... XXXX. ....X ....X X...X .XXX.',
    6: '..XX. .X... X.... XXXX. X...X X...X .XXX.',
    7: 'XXXXX ....X ...X. ..X.. .X... .X... .X...',
    8: '.XXX. X...X .XXX. X...X X...X X...X .XXX.',
    9: '.XXX. X...X X...X .XXXX ....X ...X. .XX..',
}
NAMES = 'Zero One Two Three Four Five Six Seven Eight Nine'.split()

def L(title, r, by='euler'):
    assert len(r) == 7 and all(len(x) == 7 and set(x) <= set('X.') for x in r), title
    return {'title': title, 'rows': r, 'by': by}

segs = [L(f'{d} {NAMES[d]}', seg5(d)) for d in range(10)]
pix = [L(f'{d} {NAMES[d]}', ['.' + x + '.' for x in PIX[d].split()]) for d in range(10)]

def two(n):
    g = grid(); a, b = divmod(n, 10)
    seg3(g, a, 0); seg3(g, b, 4)
    return rows(g)
NUMS = [10, 12, 21, 24, 42, 49, 64, 77]
dbl = [L(f'Number {n}', two(n)) for n in NUMS]

tut = [
    L('Dot', ['.......'] * 3 + ['...X...'] + ['.......'] * 3),
    L('Line', ['.......'] * 3 + ['..XXX..'] + ['.......'] * 3),
    L('Corner', ['.......'] * 2 + ['..X....', '..X....', '..XX...'] + ['.......'] * 2),
    L('Two Lines', ['.......'] * 2 + ['..XXX..', '.......', '..XXX..'] + ['.......'] * 2),
    L('Tee', ['.......'] * 2 + ['..XXX..', '...X...', '...X...'] + ['.......'] * 2),
    L('Square', ['.......'] * 2 + ['..XX...', '..XX...'] + ['.......'] * 3),
]

cosmos = [
    L('Rocket', ['...X...', '..XXX..', '..X.X..', '..XXX..', '..X.X..', '.XXXXX.', '.X.X.X.']),
    L('Moon', ['...XXX.', '..XX...', '.XX....', '.XX....', '.XX....', '..XX...', '...XXX.']),
    L('UFO', ['.......', '..XXX..', '.XXXXX.', 'XX.X.XX', '.XXXXX.', '.X...X.', 'X.....X']),
    L('Comet', ['X......', '.X.X...', '..X.X..', 'X..XXX.', '.X.XXX.', '...XXX.', '.......']),
    L('Big Dipper', ['X......', '..X....', '...X...', '....X.X', '.......', '....X.X', '.......']),
]

out = {'version': 2, 'tabs': [
    {'name': 'Digits LCD', 'levels': segs},
    {'name': 'Digits Pixel', 'levels': pix},
    {'name': 'Numbers', 'levels': dbl},
    {'name': 'Tutorial', 'levels': tut},
    {'name': 'Cosmos New', 'levels': cosmos},
]}
json.dump(out, open('out/numbers.json', 'w'), indent=1)

# distinctness against accepted.json and core levels
old = {}
acc = json.load(open(f'{REPO}/levels/proposals/2026-11-27b/accepted.json'))
for t in acc['tabs']:
    for l in t['levels']:
        old[tuple(l['rows'])] = f"27b {t['name']}/{l['title']}"
src = open(f'{REPO}/src/core/levels.js').read()
for m in re.finditer(r"\[\d+,\s*'([^']*)',((?:\s*'[X.]{7}',?){7})", src):
    rs = tuple(re.findall(r"'([X.]{7})'", m.group(2)))
    old[tuple(rs)] = f'core/{m.group(1)}'
print('core+27b patterns', len(old))
seen = {}
for t in out['tabs']:
    for l in t['levels']:
        k = tuple(l['rows'])
        tag = f"{t['name']}/{l['title']}"
        if k in old: print('CLASH', tag, '==', old[k])
        if k in seen: print('DUP', tag, '==', seen[k])
        seen[k] = tag
print('new levels', sum(len(t['levels']) for t in out['tabs']), 'unique', len(seen))
