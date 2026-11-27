import { useState } from 'react';
import { AlertCircle, Camera, CheckCircle2, Crosshair, Loader2, Play, TrendingUp } from 'lucide-react';
import {
  CrackMeasurement,
  DamCrack,
  SeverityThresholds,
  measureCrackFromRov,
} from '../lib/crackAnalysis';
import { RealInspectionResult, runRealCrackAnalysis } from '../lib/realApi';
import { SeverityBadge } from './SeverityBadge';

interface CameraInsetCardProps {
  straddledCrack: DamCrack | null;
  rovXM: number;
  thresholds: SeverityThresholds;
  showRecommendation: boolean;
  showReinspectionDelta: boolean;
  cracks: readonly DamCrack[];
  onSnapToCrack: (crack: DamCrack) => void;
  onRealAnalysisComplete?: (result: RealInspectionResult) => void;
}

export function CameraInsetCard({
  straddledCrack,
  rovXM,
  thresholds,
  showRecommendation,
  showReinspectionDelta,
  cracks,
  onSnapToCrack,
  onRealAnalysisComplete,
}: CameraInsetCardProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [realResult, setRealResult] = useState<RealInspectionResult | null>(null);
  const [analyzedCrackId, setAnalyzedCrackId] = useState<string | null>(null);

  const measurement: CrackMeasurement | null = straddledCrack
    ? measureCrackFromRov(straddledCrack, rovXM, thresholds)
    : null;

  const handleRunRealAnalysis = async (crack: DamCrack) => {
    setAnalyzing(true);
    setApiError(null);
    setRealResult(null);
    setAnalyzedCrackId(crack.id);
    setProgressText('Preparing sample upload...');
    try {
      const filename = crack.sampleImagePath.split('/').pop() ?? `${crack.id.toLowerCase()}.jpg`;
      const result = await runRealCrackAnalysis({
        sampleImagePath: crack.sampleImagePath,
        filename,
        onProgress: (msg) => setProgressText(msg),
      });
      setRealResult(result);
      setProgressText(null);
      onRealAnalysisComplete?.(result);
    } catch (err) {
      setApiError(
        err instanceof Error
          ? err.message
          : 'Unable to reach real analysis API. Simulation remains active.',
      );
      setProgressText(null);
    } finally {
      setAnalyzing(false);
    }
  };

  if (!straddledCrack || !measurement) {
    return (
      <section
        aria-label="ROV Camera Inset"
        className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-5 space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-sky-700 dark:text-cyan-400" aria-hidden="true" />
            <h3 className="text-base font-semibold text-slate-950 dark:text-slate-50">
              Camera Inset · Standby
            </h3>
          </div>
          <span className="font-mono text-xs text-slate-600 dark:text-slate-400">SIMULATED</span>
        </div>

        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-400 dark:border-slate-700 bg-white/70 dark:bg-[#070B12] px-4 py-6 text-center space-y-2">
          <Crosshair className="h-7 w-7 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Move near the right wall and align the 50 mm laser dots over a crack.
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Camera inset and live mm/px formula readout appear automatically on lock.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Jump to wall target (or pilot manually):
          </p>
          <div className="grid grid-cols-2 gap-2">
            {cracks.map((crack) => (
              <button
                key={crack.id}
                type="button"
                onClick={() => onSnapToCrack(crack)}
                className="inline-flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 hover:border-sky-600 dark:hover:border-cyan-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span className="font-mono font-bold">{crack.id}</span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  {crack.depthM.toFixed(2)} m
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const growthDelta =
    straddledCrack.previousWidthMm !== undefined
      ? Number((straddledCrack.trueWidthMm - straddledCrack.previousWidthMm).toFixed(1))
      : null;

  const crackStrokePx = Math.max(2.5, Math.min(13, straddledCrack.trueWidthMm * 5.5));

  return (
    <section
      aria-label="ROV Camera Inset Measurement"
      className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-5 space-y-4"
      data-testid="camera-inset-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-sky-700 dark:text-cyan-400" aria-hidden="true" />
          <h3 className="text-base font-semibold text-slate-950 dark:text-slate-50">
            Camera Inset · {straddledCrack.id}
          </h3>
        </div>
        <SeverityBadge severity={measurement.severity} size="sm" />
      </div>

      {/* Zoomed Underwater Camera View SVG */}
      <div className="relative overflow-hidden rounded-lg border border-slate-400 dark:border-slate-700 bg-[#1B2B34]">
        <svg
          viewBox="0 0 320 176"
          className="block w-full h-auto"
          role="img"
          aria-label={`Zoomed camera view of crack ${straddledCrack.id} between two 50 mm laser dots`}
        >
          {/* Underwater concrete texture backdrop */}
          <rect x="0" y="0" width="320" height="176" fill="#23373E" />
          <rect x="0" y="0" width="320" height="176" fill="#0EA5E9" fillOpacity="0.08" />

          {/* Subtle concrete aggregate grain */}
          <circle cx="48" cy="34" r="2" fill="#94A3B8" fillOpacity="0.2" />
          <circle cx="242" cy="48" r="3" fill="#94A3B8" fillOpacity="0.16" />
          <circle cx="94" cy="144" r="2.5" fill="#94A3B8" fillOpacity="0.18" />
          <circle cx="272" cy="132" r="2" fill="#94A3B8" fillOpacity="0.22" />

          {/* Magnified Jagged Crack */}
          <path
            d="M 28 88 L 76 81 L 122 92 L 164 85 L 210 95 L 258 84 L 296 90"
            fill="none"
            stroke="#090D12"
            strokeWidth={crackStrokePx}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Top & Bottom 50 mm Calibrated Laser Dots Straddling the Crack */}
          <line
            x1="160"
            y1="30"
            x2="160"
            y2="146"
            stroke="#4ADE80"
            strokeWidth="1.2"
            strokeDasharray="3 3"
          />
          <circle cx="160" cy="30" r="9" fill="#22C55E" fillOpacity="0.28" />
          <circle cx="160" cy="30" r="4.5" fill="#4ADE80" stroke="#052E16" strokeWidth="1" />
          <circle cx="160" cy="146" r="9" fill="#22C55E" fillOpacity="0.28" />
          <circle cx="160" cy="146" r="4.5" fill="#4ADE80" stroke="#052E16" strokeWidth="1" />

          {/* Callout: 50 mm / pixel separation */}
          <rect x="172" y="21" width="128" height="22" rx="4" fill="#070B12" fillOpacity="0.82" />
          <text
            x="179"
            y="36"
            fontSize="10.5"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
            fill="#86EFAC"
          >
            50 mm ({measurement.dotDistancePx} px)
          </text>

          {/* Width measurement callout near crack */}
          <rect x="12" y="136" width="136" height="26" rx="4" fill="#070B12" fillOpacity="0.86" />
          <text
            x="19"
            y="153"
            fontSize="11.5"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="700"
            fill="#F8FAFC"
          >
            {measurement.widthMm.toFixed(2)} mm (SIM)
          </text>
        </svg>
      </div>

      {/* Real Formulas Readout */}
      <dl className="grid grid-cols-2 gap-3 text-xs sm:text-sm border-t border-slate-300 dark:border-slate-800 pt-3">
        <div>
          <dt className="text-xs text-slate-600 dark:text-slate-400">Calibrated Scale</dt>
          <dd className="mt-0.5 font-mono tabular-nums font-semibold text-slate-950 dark:text-slate-100">
            {measurement.scaleMmPerPx.toFixed(3)} mm/px
          </dd>
          <dd className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
            50 / {measurement.dotDistancePx} px
          </dd>
        </div>

        <div>
          <dt className="text-xs text-slate-600 dark:text-slate-400">Crack Width (SIMULATED)</dt>
          <dd className="mt-0.5 font-mono tabular-nums text-base font-bold text-slate-950 dark:text-slate-50">
            {measurement.widthMm.toFixed(2)} mm
          </dd>
          <dd className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
            {measurement.crackWidthPx.toFixed(1)} px &times; scale
          </dd>
        </div>
      </dl>

      {/* Re-inspection comparison delta (C-04) */}
      {growthDelta !== null && (
        <div
          className={`rounded-lg border p-3 text-xs sm:text-sm space-y-1 ${
            showReinspectionDelta
              ? 'border-rose-500 bg-rose-100 text-rose-950 dark:border-rose-600 dark:bg-rose-950/60 dark:text-rose-100'
              : 'border-amber-400 bg-amber-100/80 text-amber-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100'
          }`}
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <TrendingUp className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Re-Inspection Comparison (SIMULATED)</span>
          </div>
          <p className="font-mono tabular-nums">
            Grew +{growthDelta.toFixed(1)} mm since last inspection ({straddledCrack.previousWidthMm?.toFixed(2)} mm &rarr;{' '}
            {straddledCrack.trueWidthMm.toFixed(2)} mm)
          </p>
        </div>
      )}

      {/* Screening recommendation for Critical cracks or Guided Demo Stage 6 */}
      {(showRecommendation || measurement.severity === 'Critical') && (
        <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] p-3 text-xs sm:text-sm text-slate-800 dark:text-slate-200 space-y-1">
          <p className="font-semibold text-slate-950 dark:text-slate-50">Screening Recommendation</p>
          <p>{straddledCrack.recommendation}</p>
        </div>
      )}

      {/* Run Real Analysis Button (calls POST /upload-url -> poll /inspections/{id}) */}
      <div className="space-y-2 border-t border-slate-300 dark:border-slate-800 pt-3">
        <button
          type="button"
          onClick={() => void handleRunRealAnalysis(straddledCrack)}
          disabled={analyzing}
          className="w-full inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
        >
          {analyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
              <span>Measuring on AWS...</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Measure this sample on AWS ({straddledCrack.id})</span>
            </>
          )}
        </button>
        <p className="text-[11px] text-slate-600 dark:text-slate-400">
          Uploads <span className="font-mono">{straddledCrack.sampleImagePath}</span> to S3, measures
          the aperture along the reference trace in Lambda, and persists the record to DynamoDB.
          The 3D view above remains a simulation.
        </p>

        {progressText && analyzedCrackId === straddledCrack.id && (
          <p className="font-mono text-xs text-sky-800 dark:text-cyan-300">{progressText}</p>
        )}

        {apiError && analyzedCrackId === straddledCrack.id && (
          <div
            role="alert"
            className="rounded-lg border border-rose-400 dark:border-rose-700 bg-rose-100 dark:bg-rose-950/50 p-3 text-xs text-rose-950 dark:text-rose-200 flex items-start gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">AWS measurement unavailable</p>
              <p className="mt-0.5">{apiError}</p>
            </div>
          </div>
        )}

        {realResult && analyzedCrackId === straddledCrack.id && (
          <div className="rounded-lg border border-emerald-400 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-950/50 p-3 text-xs text-emerald-950 dark:text-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                {realResult.status === 'REVIEW_REQUIRED'
                  ? 'Review required — no confident aperture'
                  : 'AWS measurement complete'}{' '}
                ({realResult.id})
              </p>
              <p className="mt-0.5 font-mono">
                Median {realResult.medianWidthMm?.toFixed(2) ?? '—'} mm · P90{' '}
                {realResult.widthMm?.toFixed(2) ?? '—'} mm · confidence {realResult.confidence ?? '—'}%
              </p>
              <p className="mt-1 text-[11px]">
                Operator-guided estimate. Confirm with a field scale and a qualified engineer.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
