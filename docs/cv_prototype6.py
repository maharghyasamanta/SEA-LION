"""Prototype v6: directional path-opening crack candidate screening."""
from __future__ import annotations

import glob
import os
import time

import cv2
import numpy as np

OUT = r"G:\SeaLion\docs\cv_test7"
os.makedirs(OUT, exist_ok=True)


def line_kernel(length: int, angle_deg: float, thickness: int = 3) -> np.ndarray:
    k = np.zeros((length, length), np.uint8)
    c = length // 2
    rad = np.deg2rad(angle_deg)
    dx, dy = np.cos(rad), np.sin(rad)
    half = length // 2
    p1 = (int(round(c - dx * half)), int(round(c - dy * half)))
    p2 = (int(round(c + dx * half)), int(round(c + dy * half)))
    cv2.line(k, p1, p2, 1, thickness)
    return k


def directional_open(mask: np.ndarray, lengths=(25, 45, 70), angles=range(0, 180, 15)) -> np.ndarray:
    seeds = np.zeros_like(mask)
    for length in lengths:
        for angle in angles:
            k = line_kernel(length, angle)
            opened = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
            seeds = cv2.bitwise_or(seeds, opened)
    return seeds


def reconstruct(seed: np.ndarray, mask: np.ndarray, iters: int = 60) -> np.ndarray:
    """Geodesic dilation of seed constrained by mask."""
    cur = seed.copy()
    k = np.ones((3, 3), np.uint8)
    for _ in range(iters):
        nxt = cv2.dilate(cur, k)
        nxt = cv2.bitwise_and(nxt, mask)
        if np.array_equal(nxt, cur):
            break
        cur = nxt
    return cur


def detect(path: str):
    im = cv2.imread(path)
    if im is None:
        raise RuntimeError(path)
    h0, w0 = im.shape[:2]
    scale = min(1.0, 1200.0 / max(h0, w0))
    if scale < 1.0:
        im = cv2.resize(im, (int(w0 * scale), int(h0 * scale)), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    H, W = gray.shape
    diag_img = (H * H + W * W) ** 0.5

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    responses = []
    for k in (15, 31, 51):
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        responses.append(cv2.morphologyEx(clahe, cv2.MORPH_BLACKHAT, kernel))
    resp = np.maximum.reduce(responses)
    resp = cv2.normalize(resp, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    otsu, _ = cv2.threshold(resp, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    thr = float(np.clip(otsu, 28, 110))
    mask = (resp >= thr).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask[:4, :] = 0; mask[-4:, :] = 0; mask[:, :4] = 0; mask[:, -4:] = 0

    seeds = directional_open(mask)
    seeds = cv2.morphologyEx(seeds, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    rec = reconstruct(seeds, mask)

    n, labels, stats, cents = cv2.connectedComponentsWithStats(rec, 8)
    kept = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < max(60, H * W * 0.00015):
            continue
        bw, bh = max(1, w), max(1, h)
        comp_diag = (bw * bw + bh * bh) ** 0.5
        if comp_diag < 0.07 * diag_img:
            continue
        fill = area / float(bw * bh)
        elong = comp_diag / max(1.0, min(bw, bh))
        if elong < 2.0:
            continue
        if fill > 0.55:
            continue
        if min(bw, bh) > 0.22 * min(H, W):
            continue
        comp = (labels == i)
        mean_resp = float(resp[comp].mean())
        score = comp_diag * elong * (mean_resp / 255.0)
        kept.append((score, i, (x, y, w, h), area, comp_diag, elong, fill, mean_resp))
    kept.sort(reverse=True)
    kept = kept[:4]
    keep = np.zeros_like(mask)
    for _, i, *_ in kept:
        keep[labels == i] = 255

    if keep.any():
        dist = cv2.distanceTransform(keep, cv2.DIST_L2, 5)
        vals = dist[keep > 0]
        p90_width_px = float(np.percentile(vals, 90) * 2.0)
        mean_width_px = float(vals.mean() * 2.0)
        area_px = int((keep > 0).sum())
        length_px = area_px / max(1.0, mean_width_px)
    else:
        p90_width_px = mean_width_px = length_px = 0.0
        area_px = 0

    print(
        f"{os.path.basename(path):28s} {W}x{H} otsu={otsu:5.1f} thr={thr:5.1f} "
        f"raw={mask.mean()/2.55:5.2f}% rec={rec.mean()/2.55:5.2f}% kept={keep.mean()/2.55:5.2f}% "
        f"n={len(kept)} wpx={p90_width_px:5.1f} len={length_px:6.1f} area={area_px:6d}"
    )
    for t in kept:
        print(f"   score={t[0]:8.1f} bbox={t[2]} area={t[3]} diag={t[4]:.0f} elong={t[5]:.1f} fill={t[6]:.2f} resp={t[7]:.0f}")

    out = im.copy()
    out[keep > 0] = (0.25 * out[keep > 0] + 0.75 * np.array([68, 68, 239])).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, os.path.splitext(os.path.basename(path))[0] + "_mask.png"), out)
    cv2.imwrite(os.path.join(OUT, os.path.splitext(os.path.basename(path))[0] + "_resp.png"), resp)


if __name__ == "__main__":
    files = sorted(glob.glob(r"G:\SeaLion\public\samples\_candidates\*.jpg"))
    for f in files:
        try:
            detect(f)
        except Exception as e:
            print("ERR", f, e)
