"""S.E.A.-L.I.O.N. - Sensor telemetry ingestion Lambda.

Validates a telemetry packet, writes it to DynamoDB with a 24-hour TTL, and
returns the accepted values. This endpoint does not claim that the values came
from a physical sensor; the caller is responsible for the packet source.
"""
import json
import math
import os
import re
import time
from datetime import datetime, timezone

import boto3

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
}

UNIT_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def _number(body: dict, field: str, default: float, low: float, high: float) -> float:
    raw = body.get(field, default)
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise ValueError(f"'{field}' must be a number") from None
    if not math.isfinite(value) or value < low or value > high:
        raise ValueError(f"'{field}' must be between {low} and {high}")
    return value


def lambda_handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"ok": True})}

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Invalid JSON payload"}),
        }
    if not isinstance(body, dict):
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "JSON body must be an object"}),
        }

    try:
        unit_id = str(body.get("unit_id") or "sealion-rov-01")
        if not UNIT_ID_RE.match(unit_id):
            raise ValueError("'unit_id' has an invalid format")
        depth_m = _number(body, "depth_m", 0.0, 0.0, 30.0)
        pressure_kpa = _number(
            body, "pressure_kpa", 101.325 + depth_m * 9.81 * 0.997, 50.0, 500.0
        )
        acoustic_leak_index = int(_number(body, "acoustic_leak_index", 0, 0, 100))
        battery_pct = int(_number(body, "battery_pct", 0, 0, 100))
        thruster_rpm = int(_number(body, "thruster_rpm", 0, 0, 10000))
    except ValueError as err:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": str(err)}),
        }

    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    ttl_epoch = int(time.time()) + 86400  # 24-hour auto-purge

    table_name = os.environ.get("TELEMETRY_TABLE")
    region = os.environ.get("AWS_REGION_NAME", os.environ.get("AWS_REGION", "ap-south-1"))
    if not table_name:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "TELEMETRY_TABLE not configured"}),
        }

    item = {
        "unit_id": {"S": unit_id},
        "timestamp": {"S": now_iso},
        "depth_m": {"N": str(round(depth_m, 2))},
        "pressure_kpa": {"N": str(round(pressure_kpa, 2))},
        "acoustic_leak_index": {"N": str(acoustic_leak_index)},
        "battery_pct": {"N": str(battery_pct)},
        "thruster_rpm": {"N": str(thruster_rpm)},
        "ttl": {"N": str(ttl_epoch)},
    }

    try:
        boto3.client("dynamodb", region_name=region).put_item(TableName=table_name, Item=item)
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "ok": True,
                "unit_id": unit_id,
                "timestamp": now_iso,
                "depth_m": round(depth_m, 2),
                "pressure_kpa": round(pressure_kpa, 2),
                "acoustic_leak_index": acoustic_leak_index,
                "battery_pct": battery_pct,
                "thruster_rpm": thruster_rpm,
                "source": "api-ingest",
            }),
        }
    except Exception as err:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": f"Failed to ingest telemetry: {str(err)}"}),
        }
