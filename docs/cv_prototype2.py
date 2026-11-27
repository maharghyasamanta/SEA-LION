"""Prototype v2: black-hat on raw gray + ridge on flattened gray, with component filtering."""
from __future__ import annotations

import glob
import os
import time
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

OUT = r"G:\SeaLion\docs\cv_test3"
os.makedirs(OUT, exist_ok=True)


def otsu(gray: np.ndarray) -> int:
    hist, _ = np.histogram(gray, bins=256, range=(0, 256))
    total = gray.size
    sum_total = np.dot(np.arange(256), hist)
    sum_b = 0.0
    w_b = 0
    best_t, best_v = 128, 0.0
    for t in range(256):
        w_b += int(hist[t])
        if w_b == 0:
            continue
        w_f = total - w_b
        if w_f == 0:
            break
        sum_b += float(t * hist[t])
        m_b = sum_b / w_b
        m_f = (sum_total - sum_b) / w_f
        v = float(w_b) * float(w_f) * ((m_b - m_f) ** 2)
        if v > best_v:
            best_v, best_t = v, t
    return best_t


def morph(mask: np.ndarray, op: str, size: int) -> np.ndarray:
    img = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
    if op == "open":
        img = img.filter(ImageFilter.MinFilter(size)).filter(ImageFilter.MaxFilter(size))
    elif op == "close":
        img = img.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.MinFilter(size))
    elif op == "dilate":
        img = img.filter(ImageFilter.MaxFilter(size))
    elif op == "erode":
        img = img.filter(ImageFilter.MinFilter(size))
    return np.array(img) > 127


def ridge_response(gray: np.ndarray) -> np.ndarray:
    g = gray.astype(np.float32)
    responses = []
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        along = np.zeros_like(g)
        for k in (1, 2, 3):
            along += np.roll(np.roll(g, dy * k, axis=0), dx * k, axis=1)
            along += np.roll(np.roll(g, -dy * k, axis=0), -dx * k, axis=1)
        along /= 6.0
        perp = np.zeros_like(g)
        for k in (1, 2):
            perp += np.roll(np.roll(g, -dy * k, axis=0), dx * k, axis=1)
            perp += np.roll(np.roll(g, dy * k, axis=0), -dx * k, axis=1)
        perp /= 4.0
        responses.append(perp - along)
    r = np.maximum.reduce(responses)
    r = np.clip(r, 0, None)
    if r.max() > 0:
        r = r / r.max() * 255.0
    return r.astype(np.uint8)


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


def detect(path: str):
    im = Image.open(path).convert("RGB")
    im.thumbnail((768, 768))
    g = np.array(im.convert("L"))
    t0 = time.time()
    # black-hat on raw gray
    k = max(15, (int(min(g.shape) * 0.035) | 1))
    closed = Image.fromarray(g, mode="L").filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))
    bh = np.clip(np.array(closed, dtype=np.int16) - g.astype(np.int16), 0, 255).astype(np.uint8)
    # ridge on flattened
    bg = np.array(Image.fromarray(g, mode="L").filter(ImageFilter.GaussianBlur(radius=12)), dtype=np.float32)
    flat = np.clip(g.astype(np.float32) - bg + 128, 0, 255).astype(np.uint8)
    ridge = ridge_response(flat)
    resp = np.maximum(bh, ridge)
    p = float(np.percentile(resp, 97.0))
    thr = max(float(otsu(resp)), p)
    mask = resp >= thr
    mask = morph(mask, "open", 3)
    mask = morph(mask, "close", 5)
    b = 3
    mask[:b, :] = False; mask[-b:, :] = False; mask[:, :b] = False; mask[:, -b:] = False
    comps = components(mask)
    N = mask.size
    kept = []
    for c in comps:
        if c["area"] < max(30, N * 0.0002):
            continue
        if c["elong"] < 1.8:
            continue
        # reject very wide blobs
        if min(c["bw"], c["bh"]) > 0.12 * min(g.shape):
            continue
        kept.append(c)
    keep_mask = np.zeros_like(mask)
    for c in kept:
        for y, x in c["pix"]:
            keep_mask[y, x] = True
    # width via erosion layers
    layers = 0
    er = keep_mask.copy()
    while layers < 60:
        e = morph(er, "erode", 3)
        if not e.any():
            break
        er = e
        layers += 1
    width_px = max(1.0, layers * 2.0 + 1.0) if keep_mask.any() else 0.0
    area = int(keep_mask.sum())
    length_px = area / width_px if width_px else 0.0
    dt = time.time() - t0
    print(f"{os.path.basename(path):28s} {im.size} thr={thr:5.1f} raw={mask.mean()*100:5.2f}% kept={keep_mask.mean()*100:5.2f}% comps={len(comps)} kept={len(kept)} wpx={width_px:5.1f} area={area:6d} t={dt:.2f}s")
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
