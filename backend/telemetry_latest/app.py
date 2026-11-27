"""S.E.A.-L.I.O.N. - Latest telemetry packet Lambda.

Returns the newest packet for a unit from DynamoDB. If no packet exists, it
returns 404 rather than inventing a standby reading.
"""
import json
import os
import re

import boto3

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Cache-Control": "no-store",
}

UNIT_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def lambda_handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"ok": True})}

    query_params = event.get("queryStringParameters") or {}
    unit_id = str(query_params.get("unit_id") or "sealion-rov-01")
    if not UNIT_ID_RE.match(unit_id):
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "unit_id has an invalid format"}),
        }

    table_name = os.environ.get("TELEMETRY_TABLE")
    region = os.environ.get("AWS_REGION_NAME", os.environ.get("AWS_REGION", "ap-south-1"))
    if not table_name:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "TELEMETRY_TABLE not configured"}),
        }

    try:
        response = boto3.client("dynamodb", region_name=region).query(
            TableName=table_name,
            KeyConditionExpression="unit_id = :uid",
            ExpressionAttributeValues={":uid": {"S": unit_id}},
            ScanIndexForward=False,
            Limit=1,
        )
        items = response.get("Items", [])
        if not items:
            return {
                "statusCode": 404,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"No telemetry packets for unit '{unit_id}'"}),
            }

        item = items[0]
        packet = {
            "ok": True,
            "unit_id": item.get("unit_id", {}).get("S", unit_id),
            "timestamp": item.get("timestamp", {}).get("S", ""),
            "depth_m": float(item.get("depth_m", {}).get("N", 0.0)),
            "pressure_kpa": float(item.get("pressure_kpa", {}).get("N", 0.0)),
            "acoustic_leak_index": int(float(item.get("acoustic_leak_index", {}).get("N", 0))),
            "battery_pct": int(float(item.get("battery_pct", {}).get("N", 0))),
            "thruster_rpm": int(float(item.get("thruster_rpm", {}).get("N", 0))),
            "source": "aws-dynamodb",
        }
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps(packet)}
    except Exception as err:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": f"Failed to retrieve latest telemetry: {str(err)}"}),
        }
