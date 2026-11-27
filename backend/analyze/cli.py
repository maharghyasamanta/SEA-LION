"""Local command-line wrapper around the same measurement code used by Lambda.

The development server calls this script so that the local demo performs a real
OpenCV measurement instead of returning hard-coded numbers. It is not deployed.

Usage:
    python backend/analyze/cli.py --image path/to.jpg \
        --trace '[[0.4,0.2],[0.5,0.8]]' --calibration 0.2 --depth 4.8

Output: one JSON object on stdout. The annotated JPEG is base64 encoded.
"""
from __future__ import annotations

import argparse
import base64
import json
import math
import os
import sys

import cv2
import numpy as np

# Allow running as `python backend/analyze/cli.py` from the repository root.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import (  # noqa: E402
    MAX_ANALYSIS_EDGE,
    calculate_hydraulic_loss,
    evaluate_structural_risk,
    measure_trace,
    render_overlay,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--trace", required=True, help="JSON array of normalized [x, y] points")
    parser.add_argument("--calibration", type=float, default=0.2, help="mm per pixel")
    parser.add_argument("--depth", type=float, default=2.5, help="water head in metres")
    parser.add_argument("--no-overlay", action="store_true")
    args = parser.parse_args()

    if not (0.01 <= args.calibration <= 5.0):
        raise SystemExit("calibration must be between 0.01 and 5.0 mm/px")
    if not (0.1 <= args.depth <= 30.0):
        raise SystemExit("depth must be between 0.1 and 30.0 m")

    trace_raw = json.loads(args.trace)
    if not isinstance(trace_raw, list) or not (2 <= len(trace_raw) <= 64):
        raise SystemExit("trace must contain 2 to 64 points")
    trace = [(float(point[0]), float(point[1])) for point in trace_raw]
    if any(not (math.isfinite(x) and math.isfinite(y) and 0 <= x <= 1 and 0 <= y <= 1) for x, y in trace):
        raise SystemExit("trace coordinates must be normalized to 0..1")

    image = cv2.imread(args.image, cv2.IMREAD_COLOR)
    if image is None:
        raise SystemExit("could not decode the image")

    height, width = image.shape[:2]
    scale_to_max = min(1.0, MAX_ANALYSIS_EDGE / max(height, width))
    if scale_to_max < 1.0:
        image = cv2.resize(
            image,
            (max(1, int(width * scale_to_max)), max(1, int(height * scale_to_max))),
            interpolation=cv2.INTER_AREA,
        )
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32)

    measurement = measure_trace(gray, trace)
    detected = bool(measurement.get("detected"))
    median_px = float(measurement.get("median_width_px", 0.0))
    p90_px = float(measurement.get("p90_width_px", 0.0))
    length_px = float(measurement.get("polyline_length_px", 0.0))
    area_px2 = float(measurement.get("area_px2", 0.0))

    width_mm = round(median_px * args.calibration, 2) if detected else 0.0
    p90_mm = round(p90_px * args.calibration, 2) if detected else 0.0
    length_cm = round((length_px * args.calibration) / 10.0, 2) if detected else 0.0
    area_cm2 = round((area_px2 * (args.calibration**2)) / 100.0, 2) if detected else 0.0

    if detected:
        water_loss, annual_loss = calculate_hydraulic_loss(area_cm2, args.depth)
        risk_index, risk_tier, action = evaluate_structural_risk(
            p90_mm, water_loss, area_cm2, args.depth
        )
        status = "COMPLETED"
    else:
        water_loss = 0.0
        annual_loss = 0.0
        risk_index = 0
        risk_tier = "LOW"
        action = "No confident measurement. Re-mark the crack or upload a clearer image."
        status = "REVIEW_REQUIRED"

    result = {
        "ok": True,
        "status": status,
        "crack_detected": detected,
        "measurement_method": "operator_trace_local",
        "confidence": measurement.get("confidence", 0),
        "crack_median_width_mm": width_mm,
        "crack_mean_width_mm": width_mm,
        "crack_max_width_mm": p90_mm,
        "crack_total_length_cm": length_cm,
        "crack_area_cm2": area_cm2,
        "water_loss_liters_per_day": water_loss,
        "annual_loss_inr": annual_loss,
        "structural_risk_index": risk_index,
        "risk_tier": risk_tier,
        "action_recommendation": action,
        "valid_samples": measurement.get("valid_samples", 0),
        "total_samples": measurement.get("total_samples", 0),
    }

    if not args.no_overlay:
        height, width = image.shape[:2]
        trace_px = [(x * (width - 1), y * (height - 1)) for x, y in trace]
        overlay = render_overlay(
            image,
            trace_px,
            measurement,
            width_mm,
            args.depth,
            water_loss,
            risk_index,
            risk_tier,
            status,
        )
        encoded_ok, encoded = cv2.imencode(".jpg", overlay, [int(cv2.IMWRITE_JPEG_QUALITY), 86])
        if encoded_ok:
            result["annotated_jpeg_base64"] = base64.b64encode(encoded.tobytes()).decode("ascii")

    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
