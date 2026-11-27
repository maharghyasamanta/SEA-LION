"""Prototype v3: adaptive local-darkness response + component shape filtering."""
from __future__ import annotations

import glob
import os
import time
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

OUT = r"G:\SeaLion\docs\cv_test4"
os.makedirs(OUT, exist_ok=True)


def morph(mask: np.ndarray, op: str, size: int) -> np.ndarray:
    img = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
    if op == "open":
        img = img.filter(ImageFilter.MinFilter(size)).filter(ImageFilter.MaxFilter(size))
    elif op == "close":
        img = img.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.MinFilter(size))
    elif op == "erode":
        img = img.filter(ImageFilter.MinFilter(size))
    return np.array(img) > 127


def components(mask: np.ndarray):
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    comps = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        q = deque([(y0, x0)])
        seen[y0, x0] = True
        pix = []
        miny = maxy = y0
        minx = maxx = x0
        while q:
            y, x = q.popleft()
            pix.append((y, x))
            if y < miny: miny = y
            if y > maxy: maxy = y
            if x < minx: minx = x
            if x > maxx: maxx = x
            for ny, nx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1), (y-1, x-1), (y-1, x+1), (y+1, x-1), (y+1, x+1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        area = len(pix)
        bw = maxx - minx + 1
        bh = maxy - miny + 1
        diag = (bw * bw + bh * bh) ** 0.5
        fill = area / float(bw * bh)
        elong = diag / max(1.0, min(bw, bh))
        comps.append(dict(area=area, bbox=(miny, minx, maxy, maxx), bw=bw, bh=bh, diag=diag, fill=fill, elong=elong, pix=pix))
    return comps


def detect(path: str, thresh: int = 35):
    im = Image.open(path).convert("RGB")
    im.thumbnail((640, 640))
    g = np.array(im.convert("L"))
    t0 = time.time()
    bg = np.array(Image.fromarray(g, mode="L").filter(ImageFilter.GaussianBlur(radius=20)), dtype=np.float32)
    diff = np.clip(bg - g.astype(np.float32), 0, 255)
    resp = np.clip(diff * 4.0, 0, 255).astype(np.uint8)
    mask = resp >= thresh
    mask = morph(mask, "open", 3)
    mask = morph(mask, "close", 5)
    b = 3
    mask[:b, :] = False; mask[-b:, :] = False; mask[:, :b] = False; mask[:, -b:] = False
    comps = components(mask)
    N = mask.size
    kept = []
    for c in comps:
        if c["area"] < max(60, N * 0.0004):
            continue
        if c["elong"] < 2.2:
            continue
        if c["fill"] > 0.55:
            continue
        if min(c["bw"], c["bh"]) > 0.16 * min(g.shape):
            continue
        if c["diag"] < 0.06 * (g.shape[0] ** 2 + g.shape[1] ** 2) ** 0.5:
            continue
        kept.append(c)
    keep_mask = np.zeros_like(mask)
    for c in kept:
        for y, x in c["pix"]:
            keep_mask[y, x] = True
    layers = 0
    er = keep_mask.copy()
    while layers < 80:
        e = morph(er, "erode", 3)
        if not e.any():
            break
        er = e
        layers += 1
    width_px = max(1.0, layers * 2.0 + 1.0) if keep_mask.any() else 0.0
    area = int(keep_mask.sum())
    length_px = area / width_px if width_px else 0.0
    dt = time.time() - t0
    print(f"{os.path.basename(path):28s} {im.size} raw={mask.mean()*100:5.2f}% kept={keep_mask.mean()*100:5.2f}% comps={len(comps)} kept={len(kept)} wpx={width_px:5.1f} area={area:6d} t={dt:.2f}s")
    rgb = np.array(im).copy()
    rgb[keep_mask] = (rgb[keep_mask] * 0.25 + np.array([239, 68, 68]) * 0.75).astype(np.uint8)
    Image.fromarray(rgb).save(os.path.join(OUT, os.path.splitext(os.path.basename(path))[0] + "_mask.png"))


if __name__ == "__main__":
    files = sorted(glob.glob(r"G:\SeaLion\public\samples\_candidates\*.jpg")) + sorted(glob.glob(r"G:\SeaLion\public\samples\*.png"))
    for f in files:
        try:
            detect(f)
        except Exception as e:
            print("ERR", f, e)
