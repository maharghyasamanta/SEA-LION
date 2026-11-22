import json
import os
from datetime import datetime, timezone


def lambda_handler(event, context):
    region = os.environ.get("AWS_REGION", "ap-south-1")
    stage = os.environ.get("APP_STAGE", "stage-1-hello-world")
    body = {
        "ok": True,
        "service": "sea-lion-api",
        "stage": stage,
        "region": region,
        "mode": "aws",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
        },
        "body": json.dumps(body),
    }
