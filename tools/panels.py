#!/usr/bin/env python3
"""Нарезка присланных ассетов под сайт серии.

    python3 tools/panels.py <папка-сайта> --grid сетка.png [--cols 4 --rows 3]
    python3 tools/panels.py <папка-сайта> --char персонаж.png

--grid  режет контактную сетку рендеров на отдельные панели
        <папка>/assets/pan-01.webp … pan-NN.webp, квадрат 512×512.
        Порядок — как читается сетка: слева направо, сверху вниз.
--char  вырезает персонажа с одноцветного фона (заливка от границ, BFS)
        в <папка>/assets/cut.webp с прозрачностью,длинная сторона до 720 px.

Нужны numpy и pillow:  pip3 install --quiet numpy pillow
"""
import argparse, os, sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

def slice_grid(src, out, cols, rows, size=512, quality=86):
    im = Image.open(src).convert("RGB")
    W, H = im.size
    tw, th = W // cols, H // rows
    n = 0
    for r in range(rows):
        for c in range(cols):
            t = im.crop((c*tw, r*th, c*tw+tw, r*th+th))
            s = min(t.size)
            t = t.crop(((t.width-s)//2, (t.height-s)//2, (t.width-s)//2+s, (t.height-s)//2+s))
            t = t.resize((size, size), Image.LANCZOS)
            n += 1
            p = os.path.join(out, "pan-%02d.webp" % n)
            t.save(p, "WEBP", quality=quality, method=6)
            print("  %s  %d КБ" % (os.path.basename(p), os.path.getsize(p)//1024))
    return n

def cutout(src, out, tol=None, long_side=720, quality=92):
    im = Image.open(src).convert("RGBA")
    a = np.array(im).astype(np.int16)
    h, w, _ = a.shape
    # фон берём по углам: у присланных рендеров он ровный
    corners = np.array([a[0,0,:3], a[0,w-1,:3], a[h-1,0,:3], a[h-1,w-1,:3]])
    bg = corners.mean(axis=0)
    white_bg = bool((bg > 232).all())
    # на белом фоне порог должен быть узким: у персонажа своя белая шерсть,
    # широкий порог утекает через морду и лапы и выедает их целиком
    if tol is None: tol = 20 if white_bg else 60
    d = np.sqrt(((a[:,:,:3]-bg)**2).sum(axis=2))
    loose = d < tol
    strict = d < tol/2.4
    vis = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h-1):
            if loose[y,x] and not vis[y,x]: vis[y,x] = True; q.append((y,x))
    for y in range(h):
        for x in (0, w-1):
            if loose[y,x] and not vis[y,x]: vis[y,x] = True; q.append((y,x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny, nx = y+dy, x+dx
            if 0 <= ny < h and 0 <= nx < w and not vis[ny,nx] and loose[ny,nx]:
                vis[ny,nx] = True; q.append((ny,nx))
    # белый фон вычищаем только заливкой: strict выел бы белки глаз и белую шерсть
    mask = vis if white_bg else (vis | strict)
    outa = a.copy()
    outa[:,:,3] = np.where(mask, 0, 255)
    res = Image.fromarray(outa.astype(np.uint8))
    # край без лесенки
    al = res.getchannel("A").filter(ImageFilter.GaussianBlur(.6))
    res.putalpha(al)
    box = res.getbbox()
    if box: res = res.crop(box)
    res.thumbnail((long_side, long_side), Image.LANCZOS)
    p = os.path.join(out, "cut.webp")
    res.save(p, "WEBP", quality=quality, method=6)
    print("  cut.webp  %d КБ  %dx%d  фон rgb%s  порог %d" %
          (os.path.getsize(p)//1024, res.width, res.height, tuple(int(v) for v in bg), tol))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("site")
    ap.add_argument("--grid"); ap.add_argument("--char")
    ap.add_argument("--cols", type=int, default=4); ap.add_argument("--rows", type=int, default=3)
    ap.add_argument("--tol", type=int, default=None, help="порог отличия от фона; по умолчанию 20 на белом, 60 на цветном")
    A = ap.parse_args()
    out = os.path.join(A.site, "assets")
    os.makedirs(out, exist_ok=True)
    if not A.grid and not A.char: ap.error("нужен --grid и/или --char")
    if A.grid: print("панели:"); slice_grid(A.grid, out, A.cols, A.rows)
    if A.char: print("персонаж:"); cutout(A.char, out, A.tol)
