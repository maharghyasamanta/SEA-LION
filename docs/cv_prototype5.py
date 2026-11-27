"""Prototype v5: OpenCV CLAHE + multi-scale black-hat + shape-filtered components."""
from __future__ import annotations

import glob
import os
import time

import cv2
import numpy as np

OUT = r"G:\SeaLion\docs\cv_test6"
os.makedirs(OUT, exist_ok=True)


def detect(path: str, thresh_floor: int = 45):
    im = cv2.imread(path)
    if im is None:
        raise RuntimeError(path)
    h0, w0 = im.shape[:2]
    scale = min(1.0, 1024.0 / max(h0, w0))
    if scale < 1.0:
        im = cv2.resize(im, (int(w0 * scale), int(h0 * scale)), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    t0 = time.time()
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    responses = []
    for k in (9, 15, 25, 41):
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        responses.append(cv2.morphologyEx(clahe, cv2.MORPH_BLACKHAT, kernel))
    resp = np.maximum.reduce(responses)
    resp = cv2.normalize(resp, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    otsu, _ = cv2.threshold(resp, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    thr = max(float(otsu), thresh_floor)
    mask = (resp >= thr).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    mask[:4, :] = 0; mask[-4:, :] = 0; mask[:, :4] = 0; mask[:, -4:] = 0
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    H, W = gray.shape
    N = H * W
    diag_img = (H * H + W * W) ** 0.5
    keep = np.zeros_like(mask)
    kept = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < max(40, N * 0.00025):
            continue
        bw, bh = w, h
        diag = (bw * bw + bh * bh) ** 0.5
        fill = area / float(bw * bh)
        elong = diag / max(1.0, min(bw, bh))
        if elong < 2.3:
            continue
        if fill > 0.45:
            continue
        if min(bw, bh) > 0.16 * min(H, W):
            continue
        if diag < 0.07 * diag_img:
            continue
        kept.append((area, elong, (x, y, w, h), fill))
        keep[labels == i] = 255
    kept.sort(key=lambda t: t[0] * t[1], reverse=True)
    if len(kept) > 4:
        # rebuild mask with top 4 only
        keep = np.zeros_like(mask)
        top = set()
        for area, elong, bbox, fill in kept[:4]:
            x, y, w, h = bbox
            # find label at bbox center-ish by checking labels in bbox
            sub = labels[y:y+h, x:x+w]
            vals, counts = np.unique(sub[sub > 0], return_counts=True)
            if len(vals):
                top.add(int(vals[np.argmax(counts)]))
        for i in top:
            keep[labels == i] = 255
        kept = kept[:4]
    if keep.any():
        dist = cv2.distanceTransform(keep, cv2.DIST_L2, 5)
        vals = dist[keep > 0]
        max_width_px = float(np.percentile(vals, 95) * 2.0)
        mean_width_px = float(vals.mean() * 2.0)
        area_px = int((keep > 0).sum())
        length_px = area_px / max(1.0, mean_width_px)
    else:
        max_width_px = mean_width_px = length_px = 0.0
        area_px = 0
    dt = time.time() - t0
    print(f"{os.path.basename(path):28s} {W}x{H} otsu={otsu:5.1f} thr={thr:5.1f} raw={mask.mean()/2.55:5.2f}% kept={keep.mean()/2.55:5.2f}% comps={n-1} kept={len(kept)} wpx={max_width_px:5.1f} area={area_px:6d} t={dt:.2f}s")
    out = im.copy()
    out[keep > 0] = (0.25 * out[keep > 0] + 0.75 * np.array([68, 68, 239])).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, os.path.splitext(os.path.basename(path))[0] + "_mask.png"), out)


if __name__ == "__main__":
    files = sorted(glob.glob(r"G:\SeaLion\public\samples\_candidates\*.jpg")) + sorted(glob.glob(r"G:\SeaLion\public\samples\*.png"))
    for f in files:
        try:
            detect(f)
        except Exception as e:
            print("ERR", f, e)
