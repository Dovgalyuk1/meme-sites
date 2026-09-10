#!/usr/bin/env python3
"""Вырезание персонажа с однотонного фона рендера.

    python3 tools/cutout.py src.png <имя>/assets/cut-hero.webp --bg 210,245,48
    python3 tools/cutout.py src.png out.webp --white

Заливка BFS от границ убирает фон, строгий порог добивает замкнутые карманы
(между лапой и телом). На белом фоне строгий порог не применяется, иначе выест
белки глаз и белые детали.
"""
import argparse
from collections import deque

import numpy as np
from PIL import Image


def cutout(src, dst, bg, loose, strict, use_strict):
    im = Image.open(src).convert("RGBA")
    a = np.array(im).astype(np.int16)
    h, w, _ = a.shape
    d = np.sqrt(((a[:, :, :3] - np.array(bg)) ** 2).sum(axis=2))
    near, hard = d < loose, d < strict

    vis = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not vis[y, x]:
                vis[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not vis[y, x]:
                vis[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not vis[ny, nx] and near[ny, nx]:
                vis[ny, nx] = True
                q.append((ny, nx))

    mask = vis | hard if use_strict else vis
    out = a.copy()
    out[:, :, 3] = np.where(mask, 0, 255)
    im2 = Image.fromarray(out.astype(np.uint8))

    box = im2.getbbox()
    if box:
        im2 = im2.crop(box)
    im2.save(dst, "WEBP", quality=95, method=6)
    print(f"{dst}  {im2.size[0]}x{im2.size[1]}  прозрачных пикселей {mask.mean():.0%}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--bg", default="210,245,48", help="цвет фона R,G,B")
    ap.add_argument("--white", action="store_true", help="белый фон: только BFS")
    ap.add_argument("--loose", type=int, default=115)
    ap.add_argument("--strict", type=int, default=70)
    o = ap.parse_args()
    bg = (255, 255, 255) if o.white else tuple(int(v) for v in o.bg.split(","))
    cutout(o.src, o.dst, bg, o.loose, o.strict, not o.white)
