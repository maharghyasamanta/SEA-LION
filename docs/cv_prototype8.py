"""Prototype v8: operator trace + perpendicular intensity-profile width measurement."""
from __future__ import annotations

import os

import cv2
import numpy as np

OUT = r"G:\SeaLion\docs\cv_test9"
os.makedirs(OUT, exist_ok=True)

CASES = {
    "wall_detail_cc0.jpg": {
        "trace": [
            (0.47, 0.25), (0.475, 0.32), (0.48, 0.38), (0.485, 0.44),
            (0.49, 0.50), (0.495, 0.56), (0.50, 0.62), (0.50, 0.68), (0.49, 0.73),
        ],
        "scale": 0.2,
    },
    "pier294290.jpg": {
        "trace": [
            (0.15, 0.56), (0.25, 0.565), (0.35, 0.57), (0.45, 0.575),
            (0.55, 0.58), (0.65, 0.585), (0.75, 0.59), (0.85, 0.60),
        ],
        "scale": 0.2,
    },
    "whiteclay_dam.jpg": {
        "trace": [
            (0.43, 0.03), (0.45, 0.10), (0.47, 0.17), (0.49, 0.24), (0.51, 0.31),
            (0.53, 0.38), (0.54, 0.45), (0.52, 0.50), (0.47, 0.53), (0.42, 0.56),
            (0.38, 0.62), (0.36, 0.70), (0.35, 0.80), (0.34, 0.90), (0.33, 0.96),
        ],
        "scale": 0.2,
    },
    "austrian_dam.jpg": {
        "trace": [
            (0.435, 0.01), (0.43, 0.06), (0.425, 0.12), (0.425, 0.18), (0.43, 0.24),
            (0.435, 0.30), (0.44, 0.36), (0.445, 0.42), (0.45, 0.48), (0.455, 0.54),
        ],
        "scale": 0.2,
    },
}


def bilinear(gray: np.ndarray, x: float, y: float) -> float:
    h, w = gray.shape
    if x < 0 or y < 0 or x > w - 1 or y > h - 1:
        return float(gray[min(max(int(round(y)), 0), h - 1), min(max(int(round(x)), 0), w - 1)])
    x0, y0 = int(np.floor(x)), int(np.floor(y))
    x1, y1 = min(x0 + 1, w - 1), min(y0 + 1, h - 1)
    fx, fy = x - x0, y - y0
    return float(
        gray[y0, x0] * (1 - fx) * (1 - fy)
        + gray[y0, x1] * fx * (1 - fy)
        + gray[y1, x0] * (1 - fx) * fy
        + gray[y1, x1] * fx * fy
    )


def measure_profile(gray: np.ndarray, cx: float, cy: float, nx: float, ny: float, half: int = 18):
    offsets = np.arange(-half, half + 1, dtype=np.float32)
    vals = np.array([bilinear(gray, cx + nx * o, cy + ny * o) for o in offsets], dtype=np.float32)
    # smooth lightly
    vals = cv2.GaussianBlur(vals.reshape(1, -1), (1, 5), 0).ravel()
    # local background from the two ends
    edge = max(3, half // 3)
    bg = float(np.median(np.concatenate([vals[:edge], vals[-edge:]])))
    mn = float(vals.min())
    depth = bg - mn
    if depth < 8:
        return None
    half_level = bg - depth * 0.5
    below = vals <= half_level
    # find contiguous run around the minimum
    idx_min = int(np.argmin(vals))
    if not below[idx_min]:
        return None
    left = idx_min
    while left > 0 and below[left - 1]:
        left -= 1
    right = idx_min
    while right < len(vals) - 1 and below[right + 1]:
        right += 1
    # sub-pixel edges by linear interpolation
    def edge_pos(i_out: int, i_in: int) -> float:
        v_out, v_in = vals[i_out], vals[i_in]
        if v_out == v_in:
            return float(i_in)
        frac = (half_level - v_out) / (v_in - v_out)
        return float(i_out) + frac * (i_in - i_out)
    xl = edge_pos(left - 1, left) if left > 0 else float(left)
    xr = edge_pos(right + 1, right) if right < len(vals) - 1 else float(right)
    width = max(0.0, xr - xl)
    return width, depth, float(offsets[idx_min])


def analyze(path: str, trace_norm, scale: float):
    im = cv2.imread(path)
    h0, w0 = im.shape[:2]
    resize = min(1.0, 1600.0 / max(h0, w0))
    if resize < 1.0:
        im = cv2.resize(im, (int(w0 * resize), int(h0 * resize)), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
    h, w = gray.shape
    pts = np.array([(x * w, y * h) for x, y in trace_norm], dtype=np.float64)

    widths = []
    positions = []
    # interpolate along polyline every ~3 px
    for i in range(len(pts) - 1):
        p0, p1 = pts[i], pts[i + 1]
        seg = p1 - p0
        seg_len = float(np.linalg.norm(seg))
        if seg_len < 1e-6:
            continue
        tx, ty = seg / seg_len
        nx, ny = -ty, tx
        steps = max(1, int(seg_len // 3))
        for s in range(steps):
            t = s / steps
            cx, cy = p0 + seg * t
            res = measure_profile(gray, cx, cy, nx, ny)
            if res:
                width, depth, off = res
                widths.append(width)
                positions.append((cx + nx * off, cy + ny * off, nx, ny, width, depth))

    widths_arr = np.array(widths) if widths else np.array([0.0])
    length_px = float(np.sum(np.linalg.norm(np.diff(pts, axis=0), axis=1)))
    mean_w = float(np.mean(widths_arr))
    med_w = float(np.median(widths_arr))
    p90_w = float(np.percentile(widths_arr, 90))
    area_px2 = float(np.sum(widths_arr) * 3.0)  # approx step
    print(
        f"{os.path.basename(path):24s} {w}x{h} trace_len={length_px:7.1f}px samples={len(widths):4d} "
        f"width mean={mean_w:5.2f} med={med_w:5.2f} p90={p90_w:5.2f} px -> "
        f"{med_w*scale:5.2f}mm med / {p90_w*scale:5.2f}mm p90"
    )

    out = im.copy()
    cv2.polylines(out, [pts.astype(np.int32)], False, (255, 255, 0), 2)
    for cx, cy, nx, ny, width, depth in positions[::3]:
        x1, y1 = int(cx - nx * width / 2), int(cy - ny * width / 2)
        x2, y2 = int(cx + nx * width / 2), int(cy + ny * width / 2)
        cv2.line(out, (x1, y1), (x2, y2), (0, 0, 255), 1)
    cv2.putText(
        out,
        f"median {med_w*scale:.2f} mm | p90 {p90_w*scale:.2f} mm | scale {scale:.2f} mm/px",
        (10, 24),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (0, 255, 255),
        2,
        cv2.LINE_AA,
    )
    cv2.imwrite(os.path.join(OUT, os.path.basename(path).replace(".jpg", "_trace.jpg")), out)


if __name__ == "__main__":
    for name, cfg in CASES.items():
        analyze(os.path.join(r"G:\SeaLion\public\samples\_candidates", name), cfg["trace"], cfg["scale"])
