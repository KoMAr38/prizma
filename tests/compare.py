# Builds a side-by-side contact sheet: Prizma render (left) vs LibreOffice reference (right)
import sys, glob, os
from PIL import Image, ImageDraw
ours = sorted(glob.glob(os.path.join(sys.argv[1], 'slide-*.png')), key=lambda p: int(p.split('-')[-1][:-4]))
refs = sorted(glob.glob(os.path.join(sys.argv[2], 'ref-*.png')))
W = 640
rows = []
for i, o in enumerate(ours):
    a = Image.open(o).convert('RGB'); a = a.resize((W, int(a.height * W / a.width)))
    b = Image.open(refs[i]).convert('RGB') if i < len(refs) else Image.new('RGB', a.size, 'gray')
    b = b.resize((W, int(b.height * W / b.width)))
    h = max(a.height, b.height)
    row = Image.new('RGB', (W * 2 + 30, h + 10), (60, 60, 70)); row.paste(a, (5, 5)); row.paste(b, (W + 25, 5)); rows.append(row)
start = int(sys.argv[4]) if len(sys.argv) > 4 else 0
rows = rows[start:start + 4]
sheet = Image.new('RGB', (W * 2 + 30, sum(r.height for r in rows)), (40, 40, 50))
y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height
sheet.save(sys.argv[3]); print('saved', sys.argv[3], len(ours), 'slides')
