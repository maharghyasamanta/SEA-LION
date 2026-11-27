# S.E.A.-L.I.O.N. — BUILD SUMMARY & CLOUD ARCHITECTURE
## AWS Serverless Architecture & Free Tier Engineering Blueprint

---

## 1. END-TO-END MERMAID ARCHITECTURE DIAGRAM

```mermaid
flowchart TD
    subgraph ClientLayer["Edge & Ingestion Layer"]
        Diver["Diver Camera / GoPro / Phone"] -->|Direct Presigned PUT| S3Bucket
        WebUser["Municipal Engineer / Evaluator"] -->|HTTPS / Port 443| CF["Amazon CloudFront (Edge OAC)"]
        Streamer["CLI Telemetry Streamer (scripts/)"] -->|HTTPS POST| APIGW
    end

    subgraph AWSCloudFront["Global Edge Delivery"]
        CF -->|Origin Access Control| S3Frontend["S3 Static Bucket\n(React 19 + Vite Dist)"]
        CF -->|API Fallback| APIGW["Amazon API Gateway\nHTTP API v2 ($default)"]
    end

    subgraph ServerlessCompute["AWS Lambda Layer (Python 3.12 / x86_64)"]
        APIGW -->|GET /api/health| LF_Health["HealthFunction\n(S3 & DDB probe)"]
        APIGW -->|POST /api/uploads/presign| LF_Presign["PresignUploadFunction\n(5-min PUT URL)"]
        APIGW -->|POST /api/inspections/analyze| LF_Analyze["AnalyzeInspectionFunction\n(OpenCV CV + Torricelli Math)"]
        APIGW -->|GET /api/inspections| LF_List["ListInspectionsFunction\n(History + S3 presign GET)"]
        APIGW -->|POST /api/inspections/compare| LF_Compare["CompareInspectionsFunction\n(Temporal delta engine)"]
        APIGW -->|POST /api/telemetry/ingest| LF_TelemIngest["TelemetryIngestFunction\n(Sensor packet write)"]
        APIGW -->|GET /api/telemetry/latest| LF_TelemLatest["TelemetryLatestFunction\n(Latest sensor packet)"]
    end

    subgraph StorageLayer["Data & Persistence Layer (AWS Free Tier)"]
        LF_Presign -.->|Generates PUT URL| S3Bucket["S3 Inspections Bucket\n(30-Day Auto-Expiry)"]
        LF_Analyze -->|Read Raw Frame| S3Bucket
        LF_Analyze -->|Write Annotated Overlay| S3Bucket
        LF_Analyze -->|Put Item| DDB_Insp[("DynamoDB Inspections Table\n(PK: asset_id, SK: inspection_id)")]
        LF_List -->|Scan / Query| DDB_Insp
        LF_Compare -->|Get Items| DDB_Insp
        LF_TelemIngest -->|Put Item with TTL| DDB_Telem[("DynamoDB Telemetry Table\n(PK: unit_id, SK: timestamp, TTL: 24h)")]
        LF_TelemLatest -->|Query Limit 1| DDB_Telem
    end
```

---

## 2. DETAILED AWS SERVICES JUSTIFICATION

| AWS Service | Architectural Role | Free Tier Guardrails & Zero-Cost Strategy |
| :--- | :--- | :--- |
| **Amazon S3** (`SeaLionInspectionsBucket`) | Stores raw underwater photos and computer-vision annotated overlays. | **5 GB free storage forever.** Enabled 30-day Lifecycle rule on `temp/` uploads to permanently purge temporary processing frames. Private bucket with Origin Access Control. |
| **Amazon S3** (`FrontendBucket`) | Houses compiled Vite production bundle (`dist/`). | Blocked 100% public ACLs; accessible strictly through CloudFront OAC. |
| **Amazon CloudFront** (`FrontendDistribution`) | Distributes SPA with worldwide edge latency and HTTPS termination. | **1 TB of data transfer out per month free.** Configured SPA error fallbacks (`403`/`404` &rarr; `/index.html`) with 60-second minimum TTL. |
| **Amazon API Gateway** (`SeaLionHttpApi`) | Low-latency HTTP API v2 providing REST routing and CORS. | **1 Million free API calls/month.** Configured with default throttling (25 req/s steady, 50 burst) to prevent API spamming or denial-of-wallet spikes. |
| **AWS Lambda** (7 Python 3.12 Functions) | Decoupled serverless microservices for CV, physics, and telemetry. | **1 Million requests and 3.2M seconds of compute time per month free.** Functions scale to absolute zero when idle. Peak memory capped at 512MB for CV, 128MB for APIs. |
| **Amazon DynamoDB** (2 On-Demand Tables) | Stores persistent inspection records and auto-expiring telemetry. | **25 GB of storage free.** `PAY_PER_REQUEST` billing mode guarantees zero hourly provisioning charges. Enabled Time-To-Live (`ttl`) on telemetry. |
| **AWS IAM** | Least-privilege IAM service roles for every Lambda. | Explicit resource ARN binding; Lambdas cannot access external AWS services. |
| **AWS SAM** (`template.yaml`) | Declarative Infrastructure-as-Code for 100% reproducible deployment. | Single-command deployment (`sam build && sam deploy`) into `ap-south-1` (Mumbai). |

---

## 3. STRICT AWS FREE TIER COMPLIANCE VERIFICATION

The entire `S.E.A.-L.I.O.N.` architecture has been engineered under a **Zero-Cost Mandate**:

- ❌ **No NAT Gateways:** Lambda functions run in standard AWS Lambda network space rather than a VPC, completely eliminating the ₹3,000+/month ($0.045/hour) VPC NAT Gateway fee.
- ❌ **No VPC Endpoints:** S3 and DynamoDB calls execute directly via AWS SigV4 HTTPS APIs.
- ❌ **No Relational Databases (RDS):** Zero MySQL/Postgres instances running 24/7.
- ❌ **No EC2 or ECS Instances:** Zero hourly VM compute costs.
- ❌ **No OpenSearch or Elasticsearch Clusters:** Zero provisioned cluster costs.

### Free Tier Limits vs. S.E.A.-L.I.O.N. Peak Hackathon Utilization

| Metric / Dimension | AWS Free Tier Monthly Allowance | S.E.A.-L.I.O.N. Hackathon Usage | Headroom Remaining |
| :--- | :--- | :--- | :--- |
| **API Gateway Requests** | 1,000,000 requests | ~12,000 requests | **98.8%** |
| **AWS Lambda Invocations** | 1,000,000 invocations | ~12,000 invocations | **98.8%** |
| **DynamoDB Storage** | 25 GB | < 15 MB | **99.9%** |
| **S3 Storage** | 5 GB | ~85 MB | **98.3%** |
| **CloudFront Egress** | 1,000 GB (1 TB) | ~1.5 GB | **99.8%** |

---

## 4. RESTFUL API SPECIFICATION & ROUTE REGISTRY

All endpoints provide full CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET,POST,PUT,OPTIONS`, `Access-Control-Allow-Headers: Content-Type,Authorization`).

1. `GET /api/health`
   - Real-time probe of S3 bucket accessibility and DynamoDB table state.
   - Response: `{ ok: true, stage: "stage-2", region: "ap-south-1", services: { s3: "connected", dynamodb_inspections: "connected", dynamodb_telemetry: "connected" } }`
2. `POST /api/uploads/presign`
   - Validates filename, content-type (`image/jpeg`, `image/png`, `image/webp`), and file size ($\le 10\,\text{MB}$).
   - Returns a 5-minute presigned PUT URL and allocated `asset_id`.
3. `POST /api/inspections/analyze`
   - Downloads image from S3, applies CLAHE contrast enhancement & Otsu binarization, calculates Euclidean distance transform thickness, computes Torricelli water-loss rate, renders visual overlay to `annotated/{key}`, persists to DynamoDB, and returns full inspection record + 1-hour presigned GET URLs.
4. `GET /api/inspections`
   - Scans / queries inspections from DynamoDB, regenerates valid S3 presigned GET URLs on the fly, and returns reverse-chronological audit log.
5. `POST /api/inspections/compare`
   - Accepts `{ asset_id, baseline_inspection_id, current_inspection_id }`, fetches both records from DynamoDB, and computes $\Delta\text{ width (mm)}$, $\Delta\text{ length (cm)}$, $\%\text{ area expansion}$, $\Delta\text{ water loss (L/day)}$, deterioration velocity ($\text{mm/day}$), and automated engineering verdict.
6. `POST /api/telemetry/ingest`
   - Ingests `{ unit_id, depth_m, pressure_kpa, acoustic_leak_index, battery_pct, thruster_rpm }` into DynamoDB with 24-hour auto-expiring TTL.
7. `GET /api/telemetry/latest`
   - Fetches the most recent live sensor packet for dashboard and 3D ROV synchronization.
