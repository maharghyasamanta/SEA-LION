export interface RealInspectionResult {
  id: string;
  status: 'COMPLETED' | 'FAILED' | 'PROCESSING';
  filename: string;
  widthMm?: number;
  dotDistancePx?: number;
  crackWidthPx?: number;
  depthM?: number;
  createdAt: string;
  source: 'real-api';
}

export interface RunRealAnalysisOptions {
  sampleImagePath: string;
  filename: string;
  apiBase: string;
  fetchFn?: typeof fetch;
  pollIntervalMs?: number;
  maxPolls?: number;
  onProgress?: (stage: string) => void;
}

interface UploadUrlResponse {
  uploadUrl: string;
  inspectionId: string;
  fields?: Record<string, string>;
}

async function parseJsonError(res: Response, fallback: string): Promise<string> {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      return body.error ?? body.message ?? `${fallback} (HTTP ${res.status})`;
    } catch {
      return `${fallback} (HTTP ${res.status})`;
    }
  }
  return `${fallback} (HTTP ${res.status} non-JSON response)`;
}

/**
 * Executes the real Sea Lion Stage 2 upload and polling pipeline:
 * 1. Fetch sample image from /samples/
 * 2. POST /upload-url (or /api/upload-url in local dev)
 * 3. Upload image blob to signed uploadUrl
 * 4. Poll GET /inspections/{id} until COMPLETED or FAILED
 */
export async function runRealCrackAnalysis({
  sampleImagePath,
  filename,
  apiBase,
  fetchFn = fetch,
  pollIntervalMs = 1000,
  maxPolls = 12,
  onProgress,
}: RunRealAnalysisOptions): Promise<RealInspectionResult> {
  const cleanBase = apiBase.replace(/\/$/, '');
  const uploadUrlEndpoint = cleanBase ? `${cleanBase}/upload-url` : '/api/upload-url';
  const inspectionEndpoint = (id: string) =>
    cleanBase ? `${cleanBase}/inspections/${encodeURIComponent(id)}` : `/api/inspections/${encodeURIComponent(id)}`;

  onProgress?.('Loading sample image from /samples/...');
  const sampleRes = await fetchFn(sampleImagePath);
  if (!sampleRes.ok) {
    throw new Error(`Could not load sample image (${sampleImagePath}): HTTP ${sampleRes.status}`);
  }
  const imageBlob = await sampleRes.blob();

  onProgress?.(`Requesting signed upload URL from POST ${uploadUrlEndpoint}...`);
  let uploadMetaRes: Response;
  try {
    uploadMetaRes = await fetchFn(uploadUrlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        filename,
        contentType: imageBlob.type || 'image/png',
        source: 'showcase-sample',
      }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Network error';
    throw new Error(`Analysis API unreachable at ${uploadUrlEndpoint}: ${detail}`);
  }

  if (!uploadMetaRes.ok) {
    const msg = await parseJsonError(uploadMetaRes, `API unavailable at ${uploadUrlEndpoint}`);
    throw new Error(msg);
  }

  const contentType = uploadMetaRes.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON from ${uploadUrlEndpoint}, received "${contentType || 'unknown'}".`);
  }

  const { uploadUrl, inspectionId } = (await uploadMetaRes.json()) as UploadUrlResponse;
  if (!uploadUrl || !inspectionId) {
    throw new Error('API response missing uploadUrl or inspectionId.');
  }

  onProgress?.('Uploading sample image to analysis storage...');
  const putRes = await fetchFn(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': imageBlob.type || 'image/png' },
    body: imageBlob,
  });
  if (!putRes.ok) {
    throw new Error(`Sample image upload failed (HTTP ${putRes.status}).`);
  }

  for (let attempt = 1; attempt <= maxPolls; attempt++) {
    onProgress?.(`Polling /inspections/${inspectionId} (attempt ${attempt}/${maxPolls})...`);
    const pollRes = await fetchFn(inspectionEndpoint(inspectionId), {
      headers: { Accept: 'application/json' },
    });

    if (!pollRes.ok) {
      const msg = await parseJsonError(pollRes, `Polling failed for ${inspectionId}`);
      throw new Error(msg);
    }

    const record = (await pollRes.json()) as RealInspectionResult;
    if (record.status === 'COMPLETED') {
      return { ...record, source: 'real-api' };
    }
    if (record.status === 'FAILED') {
      throw new Error(`Inspection ${inspectionId} failed during backend processing.`);
    }

    if (attempt < maxPolls && pollIntervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  throw new Error(`Timed out waiting for /inspections/${inspectionId} to complete.`);
}
