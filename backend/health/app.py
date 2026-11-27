"""S.E.A.-L.I.O.N. Stage 2 - Health Check Lambda Handler.

Verifies live Lambda runtime, Amazon S3 bucket access, and Amazon DynamoDB table availability.
"""
import json
import os
import boto3
from datetime import datetime, timezone

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Cache-Control": "no-store",
}


def lambda_handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"ok": True})}

    region = os.environ.get("AWS_REGION_NAME", os.environ.get("AWS_REGION", "ap-south-1"))
    stage = os.environ.get("APP_STAGE", "stage-2")
    inspections_bucket = os.environ.get("INSPECTIONS_BUCKET", "")
    inspections_table = os.environ.get("INSPECTIONS_TABLE", "")
    telemetry_table = os.environ.get("TELEMETRY_TABLE", "")

    services = {
        "lambda": "connected",
        "s3": "unknown",
        "dynamodb_inspections": "unknown",
        "dynamodb_telemetry": "unknown",
    }
    all_healthy = True

    # Check S3
    if inspections_bucket:
        try:
            s3_client = boto3.client("s3", region_name=region)
            s3_client.list_objects_v2(Bucket=inspections_bucket, MaxKeys=1)
            services["s3"] = "connected"
        except Exception as err:
            services["s3"] = f"error: {str(err)}"
            all_healthy = False
    else:
        services["s3"] = "not_configured"

    # Check DynamoDB Inspections
    if inspections_table:
        try:
            ddb_client = boto3.client("dynamodb", region_name=region)
            resp = ddb_client.describe_table(TableName=inspections_table)
            status = resp.get("Table", {}).get("TableStatus", "UNKNOWN")
            services["dynamodb_inspections"] = "connected" if status in ("ACTIVE", "UPDATING") else status
        except Exception as err:
            services["dynamodb_inspections"] = f"error: {str(err)}"
            all_healthy = False
    else:
        services["dynamodb_inspections"] = "not_configured"

    # Check DynamoDB Telemetry
    if telemetry_table:
        try:
            ddb_client = boto3.client("dynamodb", region_name=region)
            resp = ddb_client.describe_table(TableName=telemetry_table)
            status = resp.get("Table", {}).get("TableStatus", "UNKNOWN")
            services["dynamodb_telemetry"] = "connected" if status in ("ACTIVE", "UPDATING") else status
        except Exception as err:
            services["dynamodb_telemetry"] = f"error: {str(err)}"
            all_healthy = False
    else:
        services["dynamodb_telemetry"] = "not_configured"

    body = {
        "ok": all_healthy,
        "service": "sea-lion-api",
        "stage": stage,
        "region": region,
        "mode": "aws-live",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": services,
    }

    return {
        "statusCode": 200 if all_healthy else 503,
        "headers": CORS_HEADERS,
        "body": json.dumps(body),
    }
