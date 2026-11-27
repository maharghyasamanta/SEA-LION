import { InspectionRecord, runFullInspectionPipeline } from './api';
import { getReferenceSample } from './sampleTraces';

export interface RealInspectionResult {
  id: string;
  status: 'COMPLETED' | 'REVIEW_REQUIRED' | 'FAILED' | 'PROCESSING';
  filename: string;
  widthMm?: number;
  medianWidthMm?: number;
  confidence?: number;
  crackDetected?: boolean;
  depthM?: number;
  createdAt: string;
  source: 'real-api';
  limitations?: string[];
}

export interface RunRealAnalysisOptions {
  sampleImagePath: string;
  filename: string;
  apiBase?: string;
  fetchFn?: typeof fetch;
  onProgress?: (stage: string) => void;
  depthM?: number;
  calibrationMmPerPx?: number;
}

function toResult(record: InspectionRecord, filename: string): RealInspectionResult {
  return {
    id: record.inspection_id || record.id,
    status: record.status === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'COMPLETED',
    filename,
    widthMm: record.crack_max_width_mm,
    medianWidthMm: record.crack_median_width_mm ?? record.crack_mean_width_mm,
    confidence: record.confidence,
    crackDetected: record.crack_detected,
    depthM: record.water_depth_m,
    createdAt: record.created_at || record.createdAt || new Date().toISOString(),
    source: 'real-api',
    limitations: record.limitations,
  };
}

/**
 * Runs the same AWS pipeline as the Inspect tab for one of the public
 * reference photos. The reference trace is an operator trace, not an
 * automatic detection; the Lambda measures the aperture along it.
 */
export async function runRealCrackAnalysis({
  sampleImagePath,
  filename,
  fetchFn = fetch,
  onProgress,
  depthM = 4.8,
  calibrationMmPerPx = 0.2,
}: RunRealAnalysisOptions): Promise<RealInspectionResult> {
  const reference = getReferenceSample(sampleImagePath);
  if (!reference) {
    throw new Error(
      'This sample has no reference trace. Open the Inspect tab and mark the crack centreline before running the measurement.',
    );
  }

  onProgress?.('Loading the public reference photo...');
  const sampleRes = await fetchFn(sampleImagePath);
  if (!sampleRes.ok) {
    throw new Error(`Could not load sample image (${sampleImagePath}): HTTP ${sampleRes.status}`);
  }
  const imageBlob = await sampleRes.blob();

  onProgress?.('Uploading to S3 and measuring the aperture in Lambda...');
  const record = await runFullInspectionPipeline({
    fileOrBlob: imageBlob,
    filename,
    assetId: reference.id,
    assetName: reference.label,
    assetType: 'Reference concrete asset',
    waterDepthM: depthM,
    calibrationMmPerPx,
    calibrationSource: 'assumed_demo',
    trace: reference.trace.map(([x, y]) => [x, y] as [number, number]),
    onStageChange: (stage) => onProgress?.(stage),
  });

  return toResult(record, filename);
}
