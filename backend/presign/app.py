"""S.E.A.-L.I.O.N. Stage 2 - S3 Presigned Upload URL Handler.

Validates image metadata, generates secure 5-minute PUT URL, and assigns asset tracking IDs.
"""
import json
import os
import re
import uuid
from datetime import datetime, timezone
import boto3
from botocore.config import Config

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
}

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
ASSET_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


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

    filename = str(body.get("filename") or "inspection.jpg")
    content_type = str(body.get("content_type") or body.get("contentType") or "image/jpeg").lower()
    asset_id = str(body.get("asset_id") or body.get("assetId") or f"asset-{uuid.uuid4().hex[:8]}")
    try:
        file_size_bytes = int(body.get("file_size_bytes") or body.get("fileSizeBytes") or 0)
    except (TypeError, ValueError):
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "file_size_bytes must be an integer"}),
        }

    if content_type not in ALLOWED_TYPES:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "error": f"Unsupported content type '{content_type}'. Must be one of: {sorted(ALLOWED_TYPES)}"
            }),
        }

    if file_size_bytes <= 0 or file_size_bytes > MAX_SIZE_BYTES:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": f"file_size_bytes must be between 1 and {MAX_SIZE_BYTES}"}),
        }

    if not ASSET_ID_RE.match(asset_id):
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "error": "asset_id may contain only letters, digits, dot, dash and underscore (max 64)"
            }),
        }

    bucket = os.environ.get("INSPECTIONS_BUCKET")
    if not bucket:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "INSPECTIONS_BUCKET environment variable not configured"}),
        }

    safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", filename)[-120:] or "inspection.jpg"
    timestamp_prefix = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    object_key = f"uploads/{asset_id}/{timestamp_prefix}_{safe_name}"

    region = os.environ.get("AWS_REGION_NAME", os.environ.get("AWS_REGION", "ap-south-1"))
    s3_client = boto3.client(
        "s3",
        region_name=region,
        config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    )

    try:
        upload_url = s3_client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": bucket,
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=300,
        )
    except Exception as err:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": f"Failed to generate presigned upload URL: {str(err)}"}),
        }

    inspection_id = f"insp_{timestamp_prefix}_{uuid.uuid4().hex[:6]}"

    response_payload = {
        "ok": True,
        "upload_url": upload_url,
        "object_key": object_key,
        "asset_id": asset_id,
        "inspection_id": inspection_id,
        "expires_in_seconds": 300,
        # Legacy compatibility aliases
        "uploadUrl": upload_url,
        "inspectionId": inspection_id,
    }

    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps(response_payload),
    }
