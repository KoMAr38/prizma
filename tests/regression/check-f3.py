# Checks the exported pictures: exact size, both corner squares where they belong, transparent circle corners
import sys, os
from PIL import Image
out = sys.argv[1]
bad = []
for scale in ['1', '1.5', '2', '3']:
    f = os.path.join(out, f'x{scale}.png')
    if not os.path.exists(f): bad.append(f'missing {f}'); continue
    im = Image.open(f).convert('RGB'); w, h = im.size
    ew, eh = round(1280 * float(scale)), round(720 * float(scale))
    br = im.getpixel((int(w * 0.95), int(h * 0.9))); tl = im.getpixel((int(w * 0.05), int(h * 0.09)))
    ok = (w, h) == (ew, eh) and br[0] > 200 and br[1] < 60 and tl[2] > 200 and tl[0] < 60
    print(f'x{scale}: {w}x{h} bottom-right {br} top-left {tl} {"OK" if ok else "BAD"}')
    if not ok: bad.append(f'x{scale}')
f = os.path.join(out, 'circle.png')
if os.path.exists(f):
    im = Image.open(f); print('circle', im.size, im.mode, 'corner', im.getpixel((2, 2)), 'center', im.getpixel((im.size[0] // 2, im.size[1] // 2)))
    if im.mode != 'RGBA' or im.getpixel((2, 2))[3] != 0: bad.append('circle corners not transparent')
else: bad.append('missing circle.png')
f = os.path.join(out, 'x2.jpg')
if os.path.exists(f):
    im = Image.open(f).convert('RGB'); print('jpg', im.size, 'bottom-right', im.getpixel((int(im.size[0] * 0.95), int(im.size[1] * 0.9))))
    if im.size != (2560, 1440): bad.append('jpg size')
else: bad.append('missing x2.jpg')
print('BAD:', bad if bad else 'none')
