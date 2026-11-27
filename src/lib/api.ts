/**
 * S.E.A.-L.I.O.N. — Typed AWS Cloud API Client.
 *
 * Implements live end-to-end communication with AWS Serverless backend:
 * - Amazon S3 (Presigned direct upload and visual asset retrieval)
 * - AWS Lambda (OpenCV Python 3.12 crack segmentation, hydraulic physics, comparison)
 * - Amazon DynamoDB (Persistent inspection audit log and live sensor telemetry)
 */

export interface ServiceHealthStatus {
  lambda: string;
  s3: string;
  dynamodb_inspections: string;
  dynamodb_telemetry: string;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  stage: string;
  region: string;
  mode: string;
  timestamp: string;
  services?: ServiceHealthStatus;
}

export interface PresignResponse {
  ok: boolean;
  upload_url: string;
  object_key: string;
  asset_id: string;
  inspection_id: string;
  expires_in_seconds: number;
  uploadUrl?: string;
  inspectionId?: string;
}

export interface InspectionRecord {
  id: string;
  asset_id: string;
  inspection_id: string;
  asset_name: string;
  asset_type: string;
  water_depth_m: number;
  raw_image_url: string;
  annotated_image_url: string;
  /** P90 screening aperture (millimetres). */
  crack_max_width_mm: number;
  /** Median aperture along the operator trace (millimetres). */
  crack_median_width_mm?: number;
  crack_mean_width_mm?: number;
  widthMm?: number;
  crack_total_length_cm: number;
  crack_area_cm2: number;
  water_loss_liters_per_day: number;
  annual_loss_inr: number;
  structural_risk_index: number;
  risk_tier: 'LOW' | 'MODERATE' | 'CRITICAL' | string;
  action_recommendation: string;
  calibration_mm_per_px: number;
  calibration_source?: 'field_reference' | 'assumed_demo' | 'uncalibrated' | string;
  crack_detected?: boolean;
  measurement_method?: 'operator_trace' | 'auto_screen' | string;
  confidence?: number;
  limitations?: string[];
  source?: 'aws-lambda' | 'local-demo' | string;
  created_at: string;
  createdAt?: string;
  status?: 'COMPLETED' | 'REVIEW_REQUIRED' | 'FAILED' | 'PROCESSING';
}

export interface ComparisonResult {
  ok: boolean;
  asset_id: string;
  baseline: InspectionRecord;
  current: InspectionRecord;
  delta_width_mm: number;
  delta_length_cm: number;
  area_expansion_pct: number;
  delta_water_loss_liters_per_day: number;
  elapsed_days: number;
  deterioration_velocity_mm_per_day: number;
  verdict: string;
  urgency: 'LOW' | 'MODERATE' | 'CRITICAL' | string;
  recommendation: string;
}

export interface TelemetryPacket {
  ok?: boolean;
  unit_id: string;
  timestamp: string;
  depth_m: number;
  pressure_kpa: number;
  acoustic_leak_index: number;
  battery_pct: number;
  thruster_rpm: number;
  source?: string;
}

const RAW_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';
export const API_BASE = RAW_BASE.replace(/\/+$/, '');

function getEndpoint(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE) {
    return cleanPath;
  }
  return `${API_BASE}${cleanPath}`;
}

async function handleJsonResponse<T>(res: Response, fallbackError: string): Promise<T> {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const data = (await res.json()) as { error?: string; message?: string } & T;
      if (!res.ok) {
        throw new Error(data.error ?? data.message ?? `${fallbackError} (HTTP ${res.status})`);
      }
      return data as T;
    } catch (e) {
      if (!res.ok) {
        throw new Error(e instanceof Error ? e.message : `${fallbackError} (HTTP ${res.status})`);
      }
      throw e;
    }
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${fallbackError} (HTTP ${res.status}): ${text.slice(0, 150)}`);
  }
  throw new Error(`Expected JSON response, received: ${contentType || 'text/plain'}`);
}

/**
 * Verifies live connectivity to AWS Lambda, Amazon S3, and Amazon DynamoDB.
 */
export async function checkHealth(timeoutMs = 8000): Promise<HealthResponse> {
  const url = getEndpoint('/api/health');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    return await handleJsonResponse<HealthResponse>(res, 'Failed to connect to health endpoint');
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Health check timed out after ${timeoutMs} ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Requests a secure 5-minute S3 presigned PUT URL.
 */
export async function requestPresignedUrl(
  filename: string,
  contentType: string,
  fileSizeBytes: number,
  assetId?: string,
): Promise<PresignResponse> {
  const url = getEndpoint('/api/uploads/presign');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      filename,
      content_type: contentType,
      file_size_bytes: fileSizeBytes,
      asset_id: assetId,
    }),
  });
  return handleJsonResponse<PresignResponse>(res, 'Failed to obtain S3 presigned upload URL');
}

/**
 * Uploads the raw image blob directly to S3 via the presigned PUT URL.
 * Uses fetch so the same path is testable in Node/Bun; progress is reported
 * at the start and completion rather than byte-by-byte.
 */
export async function uploadToS3(
  uploadUrl: string,
  fileBlob: Blob,
  contentType: string,
  onProgress?: (progressPct: number) => void,
): Promise<void> {
  onProgress?.(0);
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: fileBlob,
  });
  if (!res.ok) {
    throw new Error(`S3 upload failed with HTTP status ${res.status}`);
  }
  onProgress?.(100);
}

/**
 * Triggers OpenCV crack segmentation, hydraulic leak math, and DynamoDB persistence.
 */
export async function analyzeInspection(params: {
  asset_id: string;
  asset_name: string;
  asset_type: string;
  water_depth_m: number;
  object_key: string;
  calibration_mm_per_px?: number;
  calibration_source?: 'field_reference' | 'assumed_demo' | 'uncalibrated';
  trace: Array<[number, number]>;
  inspection_id?: string;
}): Promise<InspectionRecord> {
  const url = getEndpoint('/api/inspections/analyze');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      asset_id: params.asset_id,
      asset_name: params.asset_name,
      asset_type: params.asset_type,
      water_depth_m: params.water_depth_m,
      object_key: params.object_key,
      calibration_mm_per_px: params.calibration_mm_per_px ?? 0.2,
      calibration_source: params.calibration_source ?? 'assumed_demo',
      trace: params.trace,
      inspection_id: params.inspection_id,
    }),
  });
  return handleJsonResponse<InspectionRecord>(res, 'Crack analysis pipeline failed');
}

/**
 * Queries DynamoDB inspection audit log with optional asset filtering.
 */
export async function listInspections(assetId?: string): Promise<InspectionRecord[]> {
  const query = assetId ? `?asset_id=${encodeURIComponent(assetId)}` : '';
  const url = getEndpoint(`/api/inspections${query}`);
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = await handleJsonResponse<{ ok: boolean; count: number; inspections: InspectionRecord[] }>(
    res,
    'Failed to list inspections from DynamoDB',
  );
  return data.inspections || [];
}

/**
 * Compares two inspections across time to calculate temporal structural degradation.
 */
export async function compareInspections(
  assetId: string,
  baselineInspectionId: string,
  currentInspectionId: string,
): Promise<ComparisonResult> {
  const url = getEndpoint('/api/inspections/compare');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      asset_id: assetId,
      baseline_inspection_id: baselineInspectionId,
      current_inspection_id: currentInspectionId,
    }),
  });
  return handleJsonResponse<ComparisonResult>(res, 'Failed to execute multi-timestamp comparison');
}

/**
 * Ingests a live underwater sensor telemetry packet into DynamoDB.
 */
export async function ingestTelemetry(packet: {
  unit_id: string;
  depth_m: number;
  pressure_kpa: number;
  acoustic_leak_index: number;
  battery_pct: number;
  thruster_rpm: number;
}): Promise<TelemetryPacket> {
  const url = getEndpoint('/api/telemetry/ingest');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(packet),
  });
  return handleJsonResponse<TelemetryPacket>(res, 'Failed to ingest telemetry to DynamoDB');
}

/**
 * Fetches the latest live sensor telemetry packet from DynamoDB.
 */
export async function getLatestTelemetry(unitId = 'sealion-rov-01'): Promise<TelemetryPacket> {
  const url = getEndpoint(`/api/telemetry/latest?unit_id=${encodeURIComponent(unitId)}`);
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  return handleJsonResponse<TelemetryPacket>(res, 'Failed to fetch latest telemetry');
}

/**
 * 1-Click Live Judge Audit Pipeline Runner:
 * Fetches sample or user file blob -> requests S3 presigned URL -> uploads to S3 -> triggers CV & hydraulic physics.
 */
export async function runFullInspectionPipeline(options: {
  fileOrBlob: Blob;
  filename: string;
  assetId: string;
  assetName: string;
  assetType: string;
  waterDepthM: number;
  calibrationMmPerPx?: number;
  calibrationSource?: 'field_reference' | 'assumed_demo' | 'uncalibrated';
  trace: Array<[number, number]>;
  onStageChange?: (stage: string, progressPct?: number) => void;
}): Promise<InspectionRecord> {
  const {
    fileOrBlob,
    filename,
    assetId,
    assetName,
    assetType,
    waterDepthM,
    calibrationMmPerPx = 0.2,
    calibrationSource = 'assumed_demo',
    trace,
    onStageChange,
  } = options;

  onStageChange?.('01. Requesting a 5-minute S3 presigned upload URL...', 10);
  const presign = await requestPresignedUrl(
    filename,
    fileOrBlob.type || 'image/jpeg',
    fileOrBlob.size,
    assetId,
  );

  onStageChange?.('02. Streaming the image directly to the private S3 bucket...', 30);
  await uploadToS3(presign.upload_url, fileOrBlob, fileOrBlob.type || 'image/jpeg', (pct) => {
    onStageChange?.(`02. Uploading image to Amazon S3 (${pct}%)...`, 30 + Math.round(pct * 0.3));
  });

  onStageChange?.('03. Lambda is measuring the aperture along the operator trace...', 75);
  const result = await analyzeInspection({
    asset_id: presign.asset_id || assetId,
    asset_name: assetName,
    asset_type: assetType,
    water_depth_m: waterDepthM,
    object_key: presign.object_key,
    calibration_mm_per_px: calibrationMmPerPx,
    calibration_source: calibrationSource,
    trace,
    inspection_id: presign.inspection_id,
  });

  onStageChange?.('04. Annotated evidence stored in S3 and the record persisted to DynamoDB.', 100);
  return result;
}
