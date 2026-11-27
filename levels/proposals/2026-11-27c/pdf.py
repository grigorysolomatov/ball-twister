import json
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import simpleSplit
d = json.load(open('out/numbers.json'))
T = {t['name']: t for t in d['tabs']}
W, H = 420, 800
c = canvas.Canvas('out/numbers.pdf', pagesize=(W, H))
c.setTitle('Ball Twister: Numbers, Tutorial, Cosmos candidates 2026-11-27c')
bg = HexColor('#faf6ee'); wood = HexColor('#d8b47e'); cream = HexColor('#f6ecd6')
terra = HexColor('#c0603a'); ink = HexColor('#222222'); gray = HexColor('#8a8a8a')
pink = HexColor('#ff0088'); sub = HexColor('#555555')

def page():
    c.setFillColor(bg); c.rect(0, 0, W, H, fill=1, stroke=0)

def para(txt, x, y, w, font='Helvetica', size=10, col=ink, lead=None):
    lead = lead or size * 1.25; c.setFont(font, size); c.setFillColor(col)
    for ln in simpleSplit(txt, font, size, w):
        c.drawString(x, y, ln); y -= lead
    return y

def board(l, x, yt, size):
    c.setFillColor(wood); c.roundRect(x, yt - size, size, size, 8, fill=1, stroke=0)
    pad = 4; p = (size - 2 * pad) / 7
    for r, line in enumerate(l['rows']):
        for k, ch in enumerate(line):
            c.setFillColor(terra if ch == 'X' else cream)
            c.circle(x + pad + p * (k + .5), yt - pad - p * (r + .5), p * .42, fill=1, stroke=0)

VERD = {
 'Digits LCD': 'Seven-segment, 5 wide, gaps at the corners like a real display. '
               'Reads well for 0, 2-9; 1 is just two short bars (weak). 6/9 and 0/8 differ by one bar.',
 'Digits Pixel': 'Classic 5x7 font digits. Reads better than the segment style: every digit is '
                 'unmistakable, 1 has a foot and flag. My pick for a Digits theme.',
 'Numbers': 'Two 3x7 segment digits with a one-column gap. 10, 12, 21, 77 read clearly; '
            '24, 42, 49, 64 read but are dense (4 and 9 crowd the 3-wide cell); a lone 1 leaves blank columns. Fine as a bonus set, not a theme.',
 'Tutorial': 'Six steps, one idea each: one ball, three in a row, a bend, two parallel lines, '
             'a T, a 2x2 block. Dot replaces Big Bang (same picture, on purpose).',
 'Cosmos New': 'Replacements for Big Bang. My order: Rocket (clearest), Moon (crescent, simple), '
               'UFO. Comet and Big Dipper read only with the title.',
}
SECT = [('Digits LCD', 'A. Digits 0-9, seven-segment'),
        ('Digits Pixel', 'B. Digits 0-9, pixel font'),
        ('Numbers', 'C. Double-digit numbers'),
        ('Tutorial', 'D. Tutorial sequence'),
        ('Cosmos New', 'E. Cosmos replacements for Big Bang')]

# page 1: overview + the pixel digits preview row
page()
c.setFillColor(ink); c.setFont('Helvetica-Bold', 22); c.drawString(24, H - 44, 'Ball Twister: Numbers')
c.setFont('Helvetica', 11); c.setFillColor(gray)
c.drawString(24, H - 62, 'Digits, numbers, tutorial, Cosmos swap. Proposal 2026-11-27c.')
y = H - 92
for name, title in SECT:
    c.setFont('Helvetica-Bold', 12); c.setFillColor(ink); c.drawString(24, y, title)
    c.setFont('Helvetica', 9); c.setFillColor(gray)
    c.drawRightString(W - 24, y, f"{len(T[name]['levels'])} levels")
    y = para(VERD[name], 40, y - 13, W - 64, size=9.5, col=sub) - 8
y -= 4
c.setFont('Helvetica-Bold', 13); c.setFillColor(pink); c.drawString(24, y, 'Verdict'); y -= 16
y = para('Digits work on 7x7. Pixel digits beat seven-segment for reading; keep segments only if the '
         'calculator look is the point. Ten digits = one theme of 10 (breaks the 7 rule, fine). '
         'Double digits fit but are tight: use a few as daily puzzles, not a theme.',
         24, y, W - 48, size=10, col=ink) - 10
size = (W - 48 - 4 * 6) / 5
for i, l in enumerate(T['Digits Pixel']['levels']):
    col, row = i % 5, i // 5
    board(l, 24 + col * (size + 6), y - row * (size + 8), size)
c.setFont('Helvetica', 8.5); c.setFillColor(gray)
c.drawString(24, 24, '39 levels; distinct from the 24 game + 49 accepted (Dot = Big Bang on purpose).')
c.showPage()

for name, title in SECT:
    t = T[name]; page()
    c.setFillColor(gray); c.setFont('Helvetica', 9); c.drawString(24, H - 28, title)
    c.setFillColor(ink); c.setFont('Helvetica-Bold', 24); c.drawString(24, H - 54, name)
    para(VERD[name], 24, H - 72, W - 48, size=9.5, col=sub)
    n = len(t['levels']); ncol = 4 if n > 9 else 3
    cell = (W - 24) / ncol; size = cell - (14 if ncol == 4 else 22); top = H - 118
    for i, l in enumerate(t['levels']):
        col, row = i % ncol, i // ncol
        x = 12 + col * cell + (cell - size) / 2; yt = top - row * (size + 34)
        board(l, x, yt, size)
        c.setFillColor(ink); c.setFont('Helvetica-Bold', 11)
        c.drawCentredString(x + size / 2, yt - size - 14, l['title'])
    c.showPage()
c.save()
