"""S.E.A.-L.I.O.N. - Inspection history and audit-log Lambda.

Reads DynamoDB records, regenerates short-lived S3 GET URLs, and supports
asset-level filtering plus single-record detail lookups.
"""
import json
import os

import boto3
from botocore.config import Config

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
}


def parse_ddb_item(item: dict, s3_client, bucket: str) -> dict:
    """Deserialize a DynamoDB item and attach fresh presigned image URLs."""
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

    # limitations is stored as a " | " separated string in DynamoDB.
    limitations = res.get("limitations")
    if isinstance(limitations, str):
        res["limitations"] = [part.strip() for part in limitations.split(" | ") if part.strip()]

    if bucket and s3_client:
        object_key = res.get("object_key")
        annotated_key = res.get("annotated_object_key")
        if object_key:
            try:
                res["raw_image_url"] = s3_client.generate_presigned_url(
                    "get_object", Params={"Bucket": bucket, "Key": object_key}, ExpiresIn=3600
                )
            except Exception:
                pass
        if annotated_key:
            try:
                res["annotated_image_url"] = s3_client.generate_presigned_url(
                    "get_object", Params={"Bucket": bucket, "Key": annotated_key}, ExpiresIn=3600
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


def lambda_handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"ok": True})}

    table_name = os.environ.get("INSPECTIONS_TABLE")
    bucket = os.environ.get("INSPECTIONS_BUCKET")
    region = os.environ.get("AWS_REGION_NAME", os.environ.get("AWS_REGION", "ap-south-1"))

    if not table_name:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "INSPECTIONS_TABLE not configured"}),
        }

    ddb_client = boto3.client("dynamodb", region_name=region)
    s3_client = boto3.client(
        "s3",
        region_name=region,
        config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    )

    path_params = event.get("pathParameters") or {}
    single_id = path_params.get("id")
    query_params = event.get("queryStringParameters") or {}
    filter_asset = query_params.get("asset_id")

    if single_id:
        try:
            # The table key is (asset_id, inspection_id), so a detail lookup by
            # inspection_id alone needs a paginated scan. Never use Limit=1:
            # the matching item may not be on the first page.
            found = None
            start_key = None
            for _ in range(20):
                kwargs = {
                    "TableName": table_name,
                    "FilterExpression": "inspection_id = :iid",
                    "ExpressionAttributeValues": {":iid": {"S": single_id}},
                }
                if start_key:
                    kwargs["ExclusiveStartKey"] = start_key
                response = ddb_client.scan(**kwargs)
                items = response.get("Items", [])
                if items:
                    found = items[0]
                    break
                start_key = response.get("LastEvaluatedKey")
                if not start_key:
                    break

            if not found:
                return {
                    "statusCode": 404,
                    "headers": CORS_HEADERS,
                    "body": json.dumps({"error": f"Inspection '{single_id}' not found"}),
                }
            record = parse_ddb_item(found, s3_client, bucket)
            return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps(record)}
        except Exception as err:
            return {
                "statusCode": 500,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"Failed to retrieve inspection: {str(err)}"}),
            }

    try:
        if filter_asset:
            response = ddb_client.query(
                TableName=table_name,
                KeyConditionExpression="asset_id = :aid",
                ExpressionAttributeValues={":aid": {"S": filter_asset}},
            )
        else:
            response = ddb_client.scan(TableName=table_name, Limit=100)

        raw_items = response.get("Items", [])
        records = [parse_ddb_item(item, s3_client, bucket) for item in raw_items]
        records.sort(key=lambda record: record.get("created_at", ""), reverse=True)

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"ok": True, "count": len(records), "inspections": records}),
        }
    except Exception as err:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": f"Failed to list inspections: {str(err)}"}),
        }
