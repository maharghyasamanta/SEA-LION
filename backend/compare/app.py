"""S.E.A.-L.I.O.N. - Same-asset inspection comparison Lambda.

Fetches two records for the same asset, computes signed changes, the actual
elapsed time, and a screening urgency band. It refuses cross-asset comparisons
and never invents an elapsed interval.
"""
import json
import os
from datetime import datetime

import boto3
from botocore.config import Config

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
}


def parse_item(item: dict, s3_client, bucket: str) -> dict:
    res = {}
    for key, value in item.items():
        if "S" in value:
            res[key] = value["S"]
        elif "N" in value:
            number = float(value["N"])
            res[key] = int(number) if number.is_integer() else number
        elif "BOOL" in value:
            res[key] = value["BOOL"]
        elif "L" in value:
            res[key] = [entry.get("S", entry.get("N")) for entry in value["L"]]

    limitations = res.get("limitations")
    if isinstance(limitations, str):
        res["limitations"] = [part.strip() for part in limitations.split(" | ") if part.strip()]

    if bucket and s3_client:
        if res.get("object_key"):
            try:
                res["raw_image_url"] = s3_client.generate_presigned_url(
                    "get_object", Params={"Bucket": bucket, "Key": res["object_key"]}, ExpiresIn=3600
                )
            except Exception:
                pass
        if res.get("annotated_object_key"):
            try:
                res["annotated_image_url"] = s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": bucket, "Key": res["annotated_object_key"]},
                    ExpiresIn=3600,
                )
            except Exception:
                pass

    res["id"] = res.get("inspection_id", "")
    res["status"] = res.get("status") or (
        "COMPLETED" if res.get("crack_detected", True) else "REVIEW_REQUIRED"
    )
    res["widthMm"] = res.get("crack_max_width_mm")
    res["createdAt"] = res.get("created_at", "")
    res.setdefault("source", "aws-lambda")
    return res


def _error(status: int, message: str) -> dict:
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps({"error": message})}


def lambda_handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"ok": True})}

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return _error(400, "Invalid JSON payload")

    asset_id = str(body.get("asset_id") or "").strip()
    baseline_id = str(
        body.get("baseline_inspection_id") or body.get("baseline_id") or ""
    ).strip()
    current_id = str(body.get("current_inspection_id") or body.get("current_id") or "").strip()

    if not asset_id or not baseline_id or not current_id:
        return _error(
            400,
            "Missing required fields: 'asset_id', 'baseline_inspection_id', 'current_inspection_id'",
        )
    if baseline_id == current_id:
        return _error(400, "Baseline and current inspections must be different records")

    table_name = os.environ.get("INSPECTIONS_TABLE")
    bucket = os.environ.get("INSPECTIONS_BUCKET")
    region = os.environ.get("AWS_REGION_NAME", os.environ.get("AWS_REGION", "ap-south-1"))
    if not table_name:
        return _error(500, "INSPECTIONS_TABLE not configured")

    ddb_client = boto3.client("dynamodb", region_name=region)
    s3_client = boto3.client(
        "s3",
        region_name=region,
        config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    )

    try:
        baseline_item = ddb_client.get_item(
            TableName=table_name,
            Key={"asset_id": {"S": asset_id}, "inspection_id": {"S": baseline_id}},
        ).get("Item")
        current_item = ddb_client.get_item(
            TableName=table_name,
            Key={"asset_id": {"S": asset_id}, "inspection_id": {"S": current_id}},
        ).get("Item")

        if not baseline_item:
            return _error(404, f"Baseline inspection '{baseline_id}' not found for asset '{asset_id}'")
        if not current_item:
            return _error(404, f"Current inspection '{current_id}' not found for asset '{asset_id}'")

        baseline = parse_item(baseline_item, s3_client, bucket)
        current = parse_item(current_item, s3_client, bucket)

        baseline_time = baseline.get("created_at") or ""
        current_time = current.get("created_at") or ""
        try:
            baseline_dt = datetime.fromisoformat(str(baseline_time).replace("Z", "+00:00"))
            current_dt = datetime.fromisoformat(str(current_time).replace("Z", "+00:00"))
        except ValueError:
            return _error(400, "Both records need valid ISO-8601 timestamps")
        elapsed_days = (current_dt - baseline_dt).total_seconds() / 86400.0
        if elapsed_days <= 0:
            return _error(400, "The current inspection must be later than the baseline")

        baseline_width = float(baseline.get("crack_max_width_mm") or 0.0)
        current_width = float(current.get("crack_max_width_mm") or 0.0)
        delta_width_mm = round(current_width - baseline_width, 2)

        baseline_length = float(baseline.get("crack_total_length_cm") or 0.0)
        current_length = float(current.get("crack_total_length_cm") or 0.0)
        delta_length_cm = round(current_length - baseline_length, 2)

        baseline_area = float(baseline.get("crack_area_cm2") or 0.0)
        current_area = float(current.get("crack_area_cm2") or 0.0)
        area_expansion_pct = (
            round(((current_area - baseline_area) / baseline_area) * 100.0, 1)
            if baseline_area > 0
            else 0.0
        )

        baseline_loss = float(baseline.get("water_loss_liters_per_day") or 0.0)
        current_loss = float(current.get("water_loss_liters_per_day") or 0.0)
        delta_water_loss = round(current_loss - baseline_loss, 1)

        velocity_mm_day = round(delta_width_mm / elapsed_days, 4)

        if delta_width_mm >= 0.40 or area_expansion_pct >= 25.0:
            urgency = "CRITICAL"
            verdict = "PROGRESSING - rapid aperture growth"
            recommendation = (
                "Escalate for engineer review: the measured aperture or affected area grew quickly "
                "between inspections. Confirm both traces and scales before repair planning."
            )
        elif delta_width_mm > 0.05 or area_expansion_pct > 5.0:
            urgency = "MODERATE"
            verdict = "PROGRESSING - measurable aperture growth"
            recommendation = (
                "Schedule an engineer review and consider grouting. Continue closer monitoring."
            )
        elif delta_width_mm < 0:
            urgency = "LOW"
            verdict = "IMPROVING OR STABLE - no growth in P90 aperture"
            recommendation = (
                "Continue seasonal monitoring. Re-check the trace and scale before treating the "
                "difference as real improvement."
            )
        else:
            urgency = "LOW"
            verdict = "STABLE - no significant aperture growth"
            recommendation = "Continue seasonal monitoring."

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps(
                {
                    "ok": True,
                    "asset_id": asset_id,
                    "baseline": baseline,
                    "current": current,
                    "delta_width_mm": delta_width_mm,
                    "delta_length_cm": delta_length_cm,
                    "area_expansion_pct": area_expansion_pct,
                    "delta_water_loss_liters_per_day": delta_water_loss,
                    "elapsed_days": round(elapsed_days, 1),
                    "deterioration_velocity_mm_per_day": velocity_mm_day,
                    "verdict": verdict,
                    "urgency": urgency,
                    "recommendation": recommendation,
                }
            ),
        }
    except Exception as err:
        return _error(500, f"Failed to perform inspection comparison: {str(err)}")
