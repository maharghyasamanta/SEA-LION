"""S.E.A.-L.I.O.N. — Operator-guided crack measurement Lambda.

This handler is deliberately honest about what it does:

1. The field operator (or the demo reference trace) marks the crack centreline.
2. OpenCV samples perpendicular intensity profiles along that trace and measures
   the dark aperture at half-prominence with sub-pixel interpolation.
3. The pixel width is converted to millimetres only when a scale is supplied.
4. Torricelli orifice discharge and a screening risk index are computed from the
   measured aperture. Both are estimates, not certified structural calculations.

A fully automatic crack *detector* is intentionally not claimed. The trace is
the human-in-the-loop localisation step; the measurement itself is computer
vision. This avoids the false-positive masks that made earlier versions claim
15–64% of a photo was "crack".
"""
from __future__ import annotations

import io
import json
import math
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any

try:  # boto3 is provided by the Lambda runtime; optional for local unit tests.
    import boto3
    from botocore.config import Config
except ImportError:  # pragma: no cover - local test path
    boto3 = None
    Config = None

import cv2
import numpy as np

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Cache-Control": "no-store",
}

DISCHARGE_COEFFICIENT = 0.62  # sharp-edged orifice, standard civil-engineering value
GRAVITY = 9.81  # m/s^2
TREATED_WATER_COST_INR_PER_LITER = 0.05  # planning assumption: Rs 50 / 1000 L
MAX_IMAGE_BYTES = 12 * 1024 * 1024
MAX_IMAGE_PIXELS = 24_000_000
MAX_ANALYSIS_EDGE = 1600
MIN_TRACE_POINTS = 2
MAX_TRACE_POINTS = 64
CALIBRATION_SOURCES = {"field_reference", "assumed_demo", "uncalibrated"}
ASSET_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
INSPECTION_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,80}$")


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------
def _json_response(status: int, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps(payload, separators=(",", ":")),
    }


def _error(status: int, message: str, **extra: Any) -> dict[str, Any]:
    return _json_response(status, {"ok": False, "error": message, **extra})


def _as_float(value: Any, field: str, low: float, high: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"'{field}' must be a number") from None
    if not math.isfinite(number) or number < low or number > high:
        raise ValueError(f"'{field}' must be between {low} and {high}")
    return number


def _as_text(value: Any, field: str, max_len: int, default: str = "") -> str:
    text = str(value).strip() if value is not None else default
    if len(text) > max_len:
        raise ValueError(f"'{field}' must be at most {max_len} characters")
    return text


def parse_trace(raw: Any) -> list[tuple[float, float]]:
    """Validates a normalized polyline: [[x, y], ...] with 0 <= x,y <= 1."""
    if not isinstance(raw, list) or not (MIN_TRACE_POINTS <= len(raw) <= MAX_TRACE_POINTS):
        raise ValueError(
            f"'trace' must contain between {MIN_TRACE_POINTS} and {MAX_TRACE_POINTS} normalized [x, y] points"
        )
    points: list[tuple[float, float]] = []
    for index, item in enumerate(raw):
        if not isinstance(item, (list, tuple)) or len(item) != 2:
            raise ValueError(f"trace[{index}] must be an [x, y] pair")
        try:
            x, y = float(item[0]), float(item[1])
        except (TypeError, ValueError):
            raise ValueError(f"trace[{index}] coordinates must be numbers") from None
        if not (math.isfinite(x) and math.isfinite(y) and 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
            raise ValueError(f"trace[{index}] coordinates must be normalized to 0..1")
        points.append((x, y))
    if len({(round(x, 5), round(y, 5)) for x, y in points}) < 2:
        raise ValueError("'trace' must contain at least two distinct points")
    return points


def _bilinear(gray: np.ndarray, x: float, y: float) -> float:
    """Bilinear sample; clamps at the image border."""
    h, w = gray.shape
    if x < 0.0 or y < 0.0 or x > w - 1 or y > h - 1:
        return float(gray[min(max(int(round(y)), 0), h - 1), min(max(int(round(x)), 0), w - 1)])
    x0, y0 = int(math.floor(x)), int(math.floor(y))
    x1, y1 = min(x0 + 1, w - 1), min(y0 + 1, h - 1)
    fx, fy = x - x0, y - y0
    return float(
        gray[y0, x0] * (1 - fx) * (1 - fy)
        + gray[y0, x1] * fx * (1 - fy)
        + gray[y1, x0] * (1 - fx) * fy
        + gray[y1, x1] * fx * fy
    )


def _profile_width(
    gray: np.ndarray,
    cx: float,
    cy: float,
    nx: float,
    ny: float,
    half: int,
    min_depth: float = 7.0,
) -> tuple[float, float] | None:
    """Measures dark-aperture width on a perpendicular profile.

    Returns (width_px, contrast_depth) or None when no clear dark valley exists.
    """
    offsets = np.arange(-half, half + 1, dtype=np.float32)
    values = np.asarray(
        [_bilinear(gray, cx + nx * float(offset), cy + ny * float(offset)) for offset in offsets],
        dtype=np.float32,
    )
    # Light smoothing suppresses single-pixel aggregate noise without erasing the aperture.
    values = cv2.GaussianBlur(values.reshape(1, -1), (1, 5), 0).ravel()

    edge = max(2, half // 3)
    background = float(np.median(np.concatenate([values[:edge], values[-edge:]])))
    minimum = float(values.min())
    depth = background - minimum
    if depth < min_depth:
        return None

    half_level = background - depth * 0.5
    below = values <= half_level
    index_min = int(np.argmin(values))
    if not below[index_min]:
        return None

    left = index_min
    while left > 0 and below[left - 1]:
        left -= 1
    right = index_min
    while right < len(values) - 1 and below[right + 1]:
        right += 1

    def _edge(i_out: int, i_in: int) -> float:
        v_out, v_in = float(values[i_out]), float(values[i_in])
        if v_out == v_in:
            return float(i_in)
        fraction = (half_level - v_out) / (v_in - v_out)
        return float(i_out) + fraction * (i_in - i_out)

    x_left = _edge(left - 1, left) if left > 0 else float(left)
    x_right = _edge(right + 1, right) if right < len(values) - 1 else float(right)
    width = max(0.0, x_right - x_left)
    # Reject profiles that simply ran off the end of the sampling window.
    if width <= 0.0 or width > half * 1.8:
        return None
    return width, depth


def measure_trace(
    gray: np.ndarray,
    trace_norm: list[tuple[float, float]],
    step_px: float = 3.0,
) -> dict[str, Any]:
    """Measures aperture statistics along a normalized crack trace."""
    h, w = gray.shape
    points = np.asarray([(x * (w - 1), y * (h - 1)) for x, y in trace_norm], dtype=np.float64)
    diagonal = math.hypot(w, h)
    polyline_length_px = float(np.sum(np.linalg.norm(np.diff(points, axis=0), axis=1)))
    if polyline_length_px < max(8.0, diagonal * 0.015):
        raise ValueError("The crack trace is too short. Mark at least two points across a visible crack length.")

    half = int(max(8, min(28, round(min(h, w) * 0.018))))
    widths: list[float] = []
    depths: list[float] = []
    samples: list[dict[str, float]] = []
    weighted_area_px2 = 0.0

    for segment_index in range(len(points) - 1):
        p0, p1 = points[segment_index], points[segment_index + 1]
        delta = p1 - p0
        segment_length = float(np.linalg.norm(delta))
        if segment_length < 1e-6:
            continue
        tangent = delta / segment_length
        normal = np.array([-tangent[1], tangent[0]], dtype=np.float64)
        steps = max(1, int(segment_length // step_px))
        actual_step = segment_length / steps
        for step_index in range(steps):
            t = step_index / steps
            cx, cy = p0 + delta * t
            measured = _profile_width(gray, float(cx), float(cy), float(normal[0]), float(normal[1]), half)
            if measured is None:
                continue
            width_px, depth = measured
            widths.append(width_px)
            depths.append(depth)
            weighted_area_px2 += width_px * actual_step
            samples.append(
                {
                    "x": round(float(cx), 2),
                    "y": round(float(cy), 2),
                    "nx": round(float(normal[0]), 4),
                    "ny": round(float(normal[1]), 4),
                    "width_px": round(width_px, 2),
                    "depth": round(depth, 1),
                }
            )

    if not widths:
        return {
            "detected": False,
            "reason": "No dark aperture was found along the trace. Re-mark the crack centreline or improve lighting.",
            "polyline_length_px": round(polyline_length_px, 1),
            "valid_samples": 0,
            "total_samples": 0,
            "widths_px": [],
            "samples": [],
        }

    widths_array = np.asarray(widths, dtype=np.float64)
    median_width = float(np.median(widths_array))
    p90_width = float(np.percentile(widths_array, 90))
    iqr = float(np.percentile(widths_array, 75) - np.percentile(widths_array, 25))
    # Count all attempted samples for an honest coverage ratio.
    attempted = 0
    for segment_index in range(len(points) - 1):
        segment_length = float(np.linalg.norm(points[segment_index + 1] - points[segment_index]))
        attempted += max(1, int(segment_length // step_px))
    valid_ratio = len(widths) / max(1, attempted)
    consistency = 1.0 - min(1.0, iqr / max(median_width, 1e-6))
    confidence = int(round(max(0.0, min(100.0, 100.0 * (0.45 * valid_ratio + 0.35 * consistency + 0.20 * min(1.0, median_width / 4.0))))))
    detected = valid_ratio >= 0.30 and median_width >= 0.8 and polyline_length_px >= max(12.0, diagonal * 0.02)

    return {
        "detected": bool(detected),
        "reason": None if detected else "Low measurement confidence. Re-mark the crack or improve image contrast.",
        "polyline_length_px": round(polyline_length_px, 1),
        "valid_samples": len(widths),
        "total_samples": attempted,
        "valid_ratio": round(valid_ratio, 3),
        "widths_px": [round(value, 2) for value in widths],
        "median_width_px": round(median_width, 2),
        "p90_width_px": round(p90_width, 2),
        "median_depth": round(float(np.median(depths)), 1),
        "area_px2": round(weighted_area_px2, 1),
        "confidence": confidence,
        "samples": samples,
    }


# ---------------------------------------------------------------------------
# Engineering calculations
# ---------------------------------------------------------------------------
def calculate_hydraulic_loss(crack_area_cm2: float, water_depth_m: float) -> tuple[float, float]:
    """Torricelli orifice estimate: Q = Cd * A * sqrt(2gh).

    The 0.15 effective-orifice factor accounts for the difference between the
    visible surface aperture and the connected seepage path. It is a planning
    assumption, not a measured hydraulic property.
    """
    head_m = max(0.1, float(water_depth_m))
    area_m2 = max(0.000001, (max(0.0, crack_area_cm2) * 1e-4) * 0.15)
    velocity_m_s = math.sqrt(2.0 * GRAVITY * head_m)
    flow_rate_m3_s = DISCHARGE_COEFFICIENT * area_m2 * velocity_m_s
    liters_per_day = flow_rate_m3_s * 1000.0 * 86400.0
    annual_loss_inr = liters_per_day * 365.0 * TREATED_WATER_COST_INR_PER_LITER
    return round(liters_per_day, 1), round(annual_loss_inr, 2)


def evaluate_structural_risk(
    width_mm: float,
    water_loss_l_day: float,
    area_cm2: float,
    depth_m: float,
) -> tuple[int, str, str]:
    """Screening risk index (0-100) with a conservative action band.

    This is a triage aid. It is not a CPWD/NDSA rating and must be confirmed by
    a qualified engineer.
    """
    # Calibrated so that a 2 mm screening aperture, a 15,000 L/day leak,
    # a 40 cm2 affected area and an 8 m head each saturate their sub-score.
    w_width = min(100.0, (max(0.0, width_mm) / 2.0) * 100.0)
    w_loss = min(100.0, (max(0.0, water_loss_l_day) / 15000.0) * 100.0)
    w_area = min(100.0, (max(0.0, area_cm2) / 40.0) * 100.0)
    w_head = min(100.0, (max(0.0, depth_m) / 8.0) * 100.0)

    score = int(round(0.45 * w_width + 0.25 * w_loss + 0.15 * w_area + 0.15 * w_head))
    score = max(0, min(100, score))

    if score <= 35:
        return score, "LOW", "Routine screening. Re-check during the next seasonal inspection."
    if score <= 70:
        return score, "MODERATE", "Schedule a closer engineer review and consider grouting within 30 days."
    return score, "CRITICAL", "Escalate to a qualified structural engineer for immediate verification and repair planning."


# ---------------------------------------------------------------------------
# Overlay rendering
# ---------------------------------------------------------------------------
def render_overlay(
    image_bgr: np.ndarray,
    trace_px: list[tuple[float, float]],
    measurement: dict[str, Any],
    width_mm: float,
    depth_m: float,
    water_loss: float,
    risk_index: int,
    risk_tier: str,
    status: str,
) -> np.ndarray:
    annotated = image_bgr.copy()
    height, width = annotated.shape[:2]
    points = np.asarray(trace_px, dtype=np.int32).reshape(-1, 1, 2)
    cv2.polylines(annotated, [points], False, (255, 255, 0), 2, cv2.LINE_AA)

    for sample in measurement.get("samples", [])[::4]:
        cx, cy = sample["x"], sample["y"]
        nx, ny = sample["nx"], sample["ny"]
        half_width = sample["width_px"] / 2.0
        p1 = (int(round(cx - nx * half_width)), int(round(cy - ny * half_width)))
        p2 = (int(round(cx + nx * half_width)), int(round(cy + ny * half_width)))
        cv2.line(annotated, p1, p2, (0, 0, 255), 1, cv2.LINE_AA)

    banner_h = 54
    cv2.rectangle(annotated, (0, 0), (width, banner_h), (7, 11, 18), -1)
    if status == "COMPLETED":
        line1 = f"S.E.A.-L.I.O.N. screening | median aperture {width_mm:.2f} mm | depth {depth_m:.2f} m"
        line2 = f"Torricelli estimate {water_loss:,.0f} L/day | screening risk {risk_index}/100 ({risk_tier})"
    else:
        line1 = "S.E.A.-L.I.O.N. screening | REVIEW REQUIRED"
        line2 = "No confident aperture measurement. Re-mark the crack or improve image quality."
    cv2.putText(annotated, line1, (12, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (248, 250, 252), 1, cv2.LINE_AA)
    cv2.putText(annotated, line2, (12, 43), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (148, 163, 184), 1, cv2.LINE_AA)
    cv2.putText(
        annotated,
        "Operator-guided measurement. Not a certified survey.",
        (12, height - 12),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        (248, 250, 252),
        1,
        cv2.LINE_AA,
    )
    return annotated


# ---------------------------------------------------------------------------
# Lambda entry point
# ---------------------------------------------------------------------------
def lambda_handler(event, context):  # noqa: ANN001 - AWS signature
    if (event.get("requestContext", {}).get("http", {}).get("method") or "").upper() == "OPTIONS":
        return _json_response(200, {"ok": True})

    try:
        body = json.loads(event.get("body") or "{}")
    except (TypeError, ValueError):
        return _error(400, "Invalid JSON payload")
    if not isinstance(body, dict):
        return _error(400, "JSON body must be an object")

    # ---- Input validation -------------------------------------------------
    try:
        asset_id = _as_text(body.get("asset_id"), "asset_id", 64, "asset-demo")
        if not ASSET_ID_RE.match(asset_id):
            raise ValueError("'asset_id' may contain only letters, digits, dot, dash and underscore")
        asset_name = _as_text(body.get("asset_name"), "asset_name", 120, "Unnamed asset")
        asset_type = _as_text(body.get("asset_type"), "asset_type", 80, "Concrete asset")
        water_depth_m = _as_float(body.get("water_depth_m", 2.5), "water_depth_m", 0.1, 30.0)
        calibration_mm_per_px = _as_float(
            body.get("calibration_mm_per_px", 0.2), "calibration_mm_per_px", 0.01, 5.0
        )
        calibration_source = str(body.get("calibration_source") or "assumed_demo")
        if calibration_source not in CALIBRATION_SOURCES:
            raise ValueError(f"'calibration_source' must be one of {sorted(CALIBRATION_SOURCES)}")
        object_key = _as_text(body.get("object_key"), "object_key", 512)
        if not object_key:
            raise ValueError("Missing required field: 'object_key'")
        if not object_key.startswith("uploads/") or ".." in object_key or object_key.startswith("/"):
            raise ValueError("'object_key' must be a key created by the presign endpoint under uploads/")
        trace_norm = parse_trace(body.get("trace"))
        requested_inspection_id = body.get("inspection_id")
        if requested_inspection_id is not None:
            requested_inspection_id = _as_text(requested_inspection_id, "inspection_id", 80)
            if not INSPECTION_ID_RE.match(requested_inspection_id):
                raise ValueError("'inspection_id' has an invalid format")
    except ValueError as err:
        return _error(400, str(err))

    bucket = os.environ.get("INSPECTIONS_BUCKET")
    table_name = os.environ.get("INSPECTIONS_TABLE")
    region = os.environ.get("AWS_REGION_NAME", os.environ.get("AWS_REGION", "ap-south-1"))
    if not bucket:
        return _error(500, "INSPECTIONS_BUCKET environment variable is not configured")
    if boto3 is None or Config is None:
        return _error(500, "boto3 is unavailable in this runtime")

    s3_client = boto3.client(
        "s3",
        region_name=region,
        config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    )

    # ---- Fetch and validate the image ------------------------------------
    try:
        head = s3_client.head_object(Bucket=bucket, Key=object_key)
        content_length = int(head.get("ContentLength", 0))
        content_type = str(head.get("ContentType", "")).lower()
        if content_length <= 0 or content_length > MAX_IMAGE_BYTES:
            return _error(413, f"Image must be between 1 byte and {MAX_IMAGE_BYTES} bytes")
        if content_type and not content_type.startswith("image/"):
            return _error(415, "Stored object is not an image")
        raw_bytes = s3_client.get_object(Bucket=bucket, Key=object_key)["Body"].read(MAX_IMAGE_BYTES + 1)
        if len(raw_bytes) > MAX_IMAGE_BYTES:
            return _error(413, "Image exceeds the maximum allowed size")
    except Exception as err:  # boto3 raises ClientError; keep the message useful but bounded
        return _error(404, f"Could not read image from S3: {str(err)[:180]}")

    try:
        image_array = np.frombuffer(raw_bytes, dtype=np.uint8)
        image_bgr = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if image_bgr is None:
            return _error(415, "Could not decode the image. Use JPEG, PNG, or WebP.")
        height, width = image_bgr.shape[:2]
        if height * width > MAX_IMAGE_PIXELS:
            return _error(413, "Image dimensions are too large")
        scale_to_max = min(1.0, MAX_ANALYSIS_EDGE / max(height, width))
        if scale_to_max < 1.0:
            image_bgr = cv2.resize(
                image_bgr,
                (max(1, int(width * scale_to_max)), max(1, int(height * scale_to_max))),
                interpolation=cv2.INTER_AREA,
            )
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    except Exception as err:
        return _error(422, f"Image preprocessing failed: {str(err)[:180]}")

    # ---- Measurement ------------------------------------------------------
    try:
        measurement = measure_trace(gray, trace_norm)
    except ValueError as err:
        return _error(422, str(err))

    detected = bool(measurement.get("detected"))
    median_width_px = float(measurement.get("median_width_px", 0.0))
    p90_width_px = float(measurement.get("p90_width_px", 0.0))
    length_px = float(measurement.get("polyline_length_px", 0.0))
    area_px2 = float(measurement.get("area_px2", 0.0))

    width_mm = round(median_width_px * calibration_mm_per_px, 2) if detected else 0.0
    p90_width_mm = round(p90_width_px * calibration_mm_per_px, 2) if detected else 0.0
    length_cm = round((length_px * calibration_mm_per_px) / 10.0, 2) if detected else 0.0
    area_cm2 = round((area_px2 * (calibration_mm_per_px**2)) / 100.0, 2) if detected else 0.0

    if detected:
        water_loss_l_day, annual_loss_inr = calculate_hydraulic_loss(area_cm2, water_depth_m)
        risk_index, risk_tier, action_rec = evaluate_structural_risk(
            p90_width_mm, water_loss_l_day, area_cm2, water_depth_m
        )
        status = "COMPLETED"
    else:
        water_loss_l_day = 0.0
        annual_loss_inr = 0.0
        risk_index = 0
        risk_tier = "LOW"
        action_rec = "No confident measurement. Re-mark the crack or upload a clearer image."
        status = "REVIEW_REQUIRED"

    # ---- Overlay ----------------------------------------------------------
    height, width = image_bgr.shape[:2]
    trace_px = [(x * (width - 1), y * (height - 1)) for x, y in trace_norm]
    annotated = render_overlay(
        image_bgr,
        trace_px,
        measurement,
        width_mm,
        water_depth_m,
        water_loss_l_day,
        risk_index,
        risk_tier,
        status,
    )
    ok, encoded = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 86])
    if not ok:
        return _error(500, "Failed to encode the annotated overlay")

    annotated_key = f"annotated/{object_key}"
    try:
        s3_client.put_object(
            Bucket=bucket,
            Key=annotated_key,
            Body=encoded.tobytes(),
            ContentType="image/jpeg",
        )
        raw_image_url = s3_client.generate_presigned_url(
            "get_object", Params={"Bucket": bucket, "Key": object_key}, ExpiresIn=3600
        )
        annotated_image_url = s3_client.generate_presigned_url(
            "get_object", Params={"Bucket": bucket, "Key": annotated_key}, ExpiresIn=3600
        )
    except Exception as err:
        return _error(500, f"Failed to store the annotated overlay: {str(err)[:180]}")

    now_iso = datetime.now(timezone.utc).isoformat()
    inspection_id = requested_inspection_id or (
        f"insp_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}"
    )

    limitations = [
        "Operator-guided crack trace; the system does not claim fully automatic crack detection.",
        "Aperture is an intensity-profile estimate at the supplied scale, not a certified crack gauge reading.",
        "Torricelli discharge is a planning estimate and does not model fracture roughness or flow path tortuosity.",
        "Screening risk bands require confirmation by a qualified structural engineer.",
    ]

    record_item = {
        "asset_id": {"S": asset_id},
        "inspection_id": {"S": inspection_id},
        "asset_name": {"S": asset_name},
        "asset_type": {"S": asset_type},
        "water_depth_m": {"N": str(water_depth_m)},
        "object_key": {"S": object_key},
        "annotated_object_key": {"S": annotated_key},
        "crack_detected": {"BOOL": detected},
        "status": {"S": status},
        "measurement_method": {"S": "operator_trace"},
        "confidence": {"N": str(measurement.get("confidence", 0))},
        "calibration_mm_per_px": {"N": str(calibration_mm_per_px)},
        "calibration_source": {"S": calibration_source},
        "crack_median_width_mm": {"N": str(width_mm)},
        "crack_mean_width_mm": {"N": str(width_mm)},
        "crack_max_width_mm": {"N": str(p90_width_mm)},
        "crack_total_length_cm": {"N": str(length_cm)},
        "crack_area_cm2": {"N": str(area_cm2)},
        "water_loss_liters_per_day": {"N": str(water_loss_l_day)},
        "annual_loss_inr": {"N": str(annual_loss_inr)},
        "structural_risk_index": {"N": str(risk_index)},
        "risk_tier": {"S": risk_tier},
        "action_recommendation": {"S": action_rec},
        "limitations": {"S": " | ".join(limitations)},
        "source": {"S": "aws-lambda"},
        "created_at": {"S": now_iso},
    }

    if table_name:
        try:
            boto3.client("dynamodb", region_name=region).put_item(TableName=table_name, Item=record_item)
        except Exception as err:
            return _error(500, f"Failed to persist the inspection: {str(err)[:180]}")

    payload = {
        "ok": True,
        "source": "aws-lambda",
        "status": status,
        "asset_id": asset_id,
        "inspection_id": inspection_id,
        "asset_name": asset_name,
        "asset_type": asset_type,
        "water_depth_m": water_depth_m,
        "raw_image_url": raw_image_url,
        "annotated_image_url": annotated_image_url,
        "crack_detected": detected,
        "measurement_method": "operator_trace",
        "confidence": measurement.get("confidence", 0),
        "calibration_mm_per_px": calibration_mm_per_px,
        "calibration_source": calibration_source,
        "crack_median_width_mm": width_mm,
        "crack_mean_width_mm": width_mm,
        "crack_max_width_mm": p90_width_mm,
        "crack_total_length_cm": length_cm,
        "crack_area_cm2": area_cm2,
        "water_loss_liters_per_day": water_loss_l_day,
        "annual_loss_inr": annual_loss_inr,
        "structural_risk_index": risk_index,
        "risk_tier": risk_tier,
        "action_recommendation": action_rec,
        "limitations": limitations,
        "valid_samples": measurement.get("valid_samples", 0),
        "total_samples": measurement.get("total_samples", 0),
        "created_at": now_iso,
        # Legacy aliases retained for older frontend builds.
        "id": inspection_id,
        "widthMm": p90_width_mm,
        "createdAt": now_iso,
    }

    return _json_response(200, payload)
