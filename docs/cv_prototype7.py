"""Prototype v7: Frangi ridge filter on inverted grayscale."""
from __future__ import annotations

import glob
import os

import cv2
import numpy as np
from skimage.filters import frangi, sato

OUT = r"G:\SeaLion\docs\cv_test8"
os.makedirs(OUT, exist_ok=True)


def detect(path: str):
    im = cv2.imread(path)
    h0, w0 = im.shape[:2]
    scale = min(1.0, 900.0 / max(h0, w0))
    if scale < 1.0:
        im = cv2.resize(im, (int(w0 * scale), int(h0 * scale)), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    H, W = gray.shape

    # Cracks are dark ridges: invert.
    inv = 1.0 - gray
    resp = frangi(inv, sigmas=np.arange(1.5, 6.0, 0.5), alpha=0.5, beta=0.5, black_ridges=True)
    resp = cv2.normalize(resp, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    # threshold relative to max
    thr = max(20, int(np.percentile(resp, 97)))
    mask = (resp >= thr).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    diag_img = (H * H + W * W) ** 0.5
    kept = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < max(50, H * W * 0.0002):
            continue
        bw, bh = max(1, w), max(1, h)
        comp_diag = (bw * bw + bh * bh) ** 0.5
        if comp_diag < 0.06 * diag_img:
            continue
        fill = area / float(bw * bh)
        elong = comp_diag / max(1.0, min(bw, bh))
        if elong < 2.5 or fill > 0.45:
            continue
        comp = labels == i
        mean_resp = float(resp[comp].mean())
        kept.append((comp_diag * elong * mean_resp / 255.0, i, (x, y, w, h), area, comp_diag, elong, fill, mean_resp))
    kept.sort(reverse=True)
    kept = kept[:4]
    keep = np.zeros_like(mask)
    for _, i, *_ in kept:
        keep[labels == i] = 255

    print(f"{os.path.basename(path):28s} {W}x{H} thr={thr} mask={mask.mean()/2.55:5.2f}% kept={keep.mean()/2.55:5.2f}% n={len(kept)}")
    for t in kept:
        print(f"   score={t[0]:8.1f} bbox={t[2]} area={t[3]} diag={t[4]:.0f} elong={t[5]:.1f} fill={t[6]:.2f} resp={t[7]:.0f}")

    out = im.copy()
    out[keep > 0] = (0.25 * out[keep > 0] + 0.75 * np.array([68, 68, 239])).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, os.path.splitext(os.path.basename(path))[0] + "_mask.png"), out)
    cv2.imwrite(os.path.join(OUT, os.path.splitext(os.path.basename(path))[0] + "_resp.png"), resp)


if __name__ == "__main__":
    for f in sorted(glob.glob(r"G:\SeaLion\public\samples\_candidates\*.jpg")):
        try:
            detect(f)
        except Exception as e:
            print("ERR", f, e)
