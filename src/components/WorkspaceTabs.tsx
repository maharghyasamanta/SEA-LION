import { useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  GitCompare,
  History as HistoryIcon,
  OctagonAlert,
  Play,
  ShieldAlert,
  Sliders,
} from 'lucide-react';
import {
  DEFAULT_THRESHOLDS,
  DEMO_DAM_CRACKS,
  SeverityThresholds,
  classifySeverity,
} from '../lib/crackAnalysis';
import { RealInspectionResult, runRealCrackAnalysis } from '../lib/realApi';
import { SeverityBadge } from './SeverityBadge';

export interface HealthResponse {
  ok: boolean;
  service: string;
  stage: string;
  region: string;
  mode: string;
  timestamp: string;
}

interface InspectTabProps {
  thresholds: SeverityThresholds;
  onThresholdsChange: (next: SeverityThresholds) => void;
  apiBase: string;
  onRealAnalysisComplete: (result: RealInspectionResult) => void;
}

export function InspectTab({
  thresholds,
  onThresholdsChange,
  apiBase,
  onRealAnalysisComplete,
}: InspectTabProps) {
  const [selectedSamplePath, setSelectedSamplePath] = useState(DEMO_DAM_CRACKS[2].sampleImagePath);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RealInspectionResult | null>(null);

  const handleAnalyzeSample = async () => {
    setSubmitting(true);
    setError(null);
    setProgress('Starting real API analysis...');
    try {
      const filename = selectedSamplePath.split('/').pop() ?? 'sample.png';
      const result = await runRealCrackAnalysis({
        sampleImagePath: selectedSamplePath,
        filename,
        apiBase,
        onProgress: (msg) => setProgress(msg),
      });
      setLastResult(result);
      setProgress(null);
      onRealAnalysisComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach analysis API');
      setProgress(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12 items-start">
      <section className="lg:col-span-7 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-6 space-y-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
            Real Crack Inspection Pipeline
          </h1>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Submit an underwater image sample to <span className="font-mono">POST /upload-url</span> and poll{' '}
            <span className="font-mono">/inspections/&#123;id&#125;</span> for OpenCV centerline distance-transform width measurement.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="inspect-sample-select"
            className="block text-sm font-medium text-slate-900 dark:text-slate-100"
          >
            Select Sample Frame from <span className="font-mono">/samples/</span>
          </label>
          <select
            id="inspect-sample-select"
            value={selectedSamplePath}
            onChange={(e) => setSelectedSamplePath(e.target.value)}
            className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] px-3 py-2 text-sm text-slate-950 dark:text-slate-100"
          >
            {DEMO_DAM_CRACKS.map((crack) => (
              <option key={crack.id} value={crack.sampleImagePath}>
                {crack.sampleImagePath} ({crack.label})
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void handleAnalyzeSample()}
          disabled={submitting}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          <span>{submitting ? 'Running Real Analysis...' : 'Run Real API Analysis'}</span>
        </button>

        {progress && <p className="font-mono text-xs text-sky-800 dark:text-cyan-300">{progress}</p>}

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-rose-400 dark:border-rose-700 bg-rose-100 dark:bg-rose-950/50 p-4 text-sm text-rose-950 dark:text-rose-200 flex items-start gap-2.5"
          >
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">Analysis Endpoint Unreachable / Not Deployed</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        )}

        {lastResult && (
          <div className="rounded-lg border border-emerald-400 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-950/50 p-4 text-sm text-emerald-950 dark:text-emerald-200 space-y-1">
            <p className="font-semibold">Inspection {lastResult.id} completed</p>
            <p className="font-mono">
              Measured Width: {lastResult.widthMm?.toFixed(2) ?? '—'} mm
            </p>
          </div>
        )}
      </section>

      {/* Configurable Severity Thresholds shared with Showcase */}
      <section className="lg:col-span-5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-6 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-sky-700 dark:text-cyan-400" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              Configurable Severity Thresholds
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onThresholdsChange(DEFAULT_THRESHOLDS)}
            className="min-h-[44px] px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            Reset Defaults
          </button>
        </div>

        <p className="text-sm text-slate-700 dark:text-slate-300">
          Shared live across both the real inspection pipeline and the Showcase simulation.
        </p>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm">
              <label htmlFor="minor-max-input" className="font-medium text-slate-900 dark:text-slate-100">
                Minor Max Width (mm)
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-950 dark:text-slate-50">
                &le; {thresholds.minorMaxMm.toFixed(2)} mm
              </span>
            </div>
            <input
              id="minor-max-input"
              type="range"
              min="0.1"
              max="0.8"
              step="0.05"
              value={thresholds.minorMaxMm}
              onChange={(e) => {
                const val = Number(e.target.value);
                onThresholdsChange({
                  minorMaxMm: val,
                  moderateMaxMm: Math.max(val + 0.1, thresholds.moderateMaxMm),
                });
              }}
              className="mt-2 w-full accent-sky-700 dark:accent-cyan-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-sm">
              <label htmlFor="moderate-max-input" className="font-medium text-slate-900 dark:text-slate-100">
                Moderate Max Width (mm)
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-950 dark:text-slate-50">
                &le; {thresholds.moderateMaxMm.toFixed(2)} mm
              </span>
            </div>
            <input
              id="moderate-max-input"
              type="range"
              min="0.4"
              max="2.0"
              step="0.05"
              value={thresholds.moderateMaxMm}
              onChange={(e) => {
                const val = Number(e.target.value);
                onThresholdsChange({
                  minorMaxMm: Math.min(thresholds.minorMaxMm, val - 0.1),
                  moderateMaxMm: val,
                });
              }}
              className="mt-2 w-full accent-sky-700 dark:accent-cyan-400 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-300 dark:border-slate-800 pt-4 text-xs">
          <SeverityBadge severity="Minor" size="sm" />
          <span className="font-mono text-slate-700 dark:text-slate-300">
            &le; {thresholds.minorMaxMm.toFixed(2)} mm
          </span>
          <SeverityBadge severity="Moderate" size="sm" />
          <span className="font-mono text-slate-700 dark:text-slate-300">
            {thresholds.minorMaxMm.toFixed(2)}–{thresholds.moderateMaxMm.toFixed(2)} mm
          </span>
          <SeverityBadge severity="Critical" size="sm" />
          <span className="font-mono text-slate-700 dark:text-slate-300">
            &gt; {thresholds.moderateMaxMm.toFixed(2)} mm
          </span>
        </div>
      </section>
    </div>
  );
}

interface HistoryTabProps {
  records: RealInspectionResult[];
  thresholds: SeverityThresholds;
}

export function HistoryTab({ records, thresholds }: HistoryTabProps) {
  return (
    <section
      aria-label="Real Inspection History"
      className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-6 space-y-4"
      data-testid="history-panel"
    >
      <div className="flex items-center gap-2.5">
        <HistoryIcon className="h-5 w-5 text-sky-700 dark:text-cyan-400" aria-hidden="true" />
        <h1 className="text-xl font-bold text-slate-950 dark:text-slate-50">
          Inspection History (Verified API Records Only)
        </h1>
      </div>

      {records.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-400 dark:border-slate-700 bg-white dark:bg-[#070B12] p-6 space-y-2">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No real inspection records stored yet.
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Values generated inside the Showcase dam simulation are strictly labeled{' '}
            <span className="font-mono font-semibold">SIMULATED</span> and are never written to History or the database.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                <th className="py-2 pr-4">ID</th>
                <th className="py-2 pr-4">Sample</th>
                <th className="py-2 pr-4">Width</th>
                <th className="py-2 pr-4">Severity</th>
                <th className="py-2">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => (
                <tr key={rec.id} className="border-b border-slate-200 dark:border-slate-800/60">
                  <td className="py-3 pr-4 font-mono">{rec.id}</td>
                  <td className="py-3 pr-4 font-mono">{rec.filename}</td>
                  <td className="py-3 pr-4 font-mono tabular-nums">
                    {rec.widthMm !== undefined ? `${rec.widthMm.toFixed(2)} mm` : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    {rec.widthMm !== undefined ? (
                      <SeverityBadge severity={classifySeverity(rec.widthMm, thresholds)} size="sm" />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{rec.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface CompareTabProps {
  records: RealInspectionResult[];
}

export function CompareTab({ records }: CompareTabProps) {
  return (
    <section
      aria-label="Re-Inspection Comparison"
      className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-6 space-y-4"
      data-testid="compare-panel"
    >
      <div className="flex items-center gap-2.5">
        <GitCompare className="h-5 w-5 text-sky-700 dark:text-cyan-400" aria-hidden="true" />
        <h1 className="text-xl font-bold text-slate-950 dark:text-slate-50">
          Crack Progression Comparison
        </h1>
      </div>

      {records.length < 2 ? (
        <div className="rounded-lg border border-dashed border-slate-400 dark:border-slate-700 bg-white dark:bg-[#070B12] p-6 space-y-2">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
            At least two completed real API inspections are required to compare crack growth.
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Showcase simulation data (including Demo Dam C-04) is isolated and never mixed into real Compare metrics.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] p-4">
            <p className="text-xs text-slate-600 dark:text-slate-400">Baseline (oldest)</p>
            <p className="font-mono text-lg font-bold text-slate-950 dark:text-slate-50">
              {records[records.length - 1].widthMm?.toFixed(2) ?? '—'} mm
            </p>
          </div>
          <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] p-4">
            <p className="text-xs text-slate-600 dark:text-slate-400">Latest (most recent)</p>
            <p className="font-mono text-lg font-bold text-slate-950 dark:text-slate-50">
              {records[0].widthMm?.toFixed(2) ?? '—'} mm
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

interface TelemetryTabProps {
  health: HealthResponse | null;
  latencyMs: number | null;
  loading: boolean;
  error: string | null;
  endpointDisplay: string;
}

export function TelemetryTab({
  health,
  latencyMs,
  loading,
  error,
  endpointDisplay,
}: TelemetryTabProps) {
  return (
    <div className="space-y-8">
      <section className="grid gap-8 lg:grid-cols-12 items-start">
        <div className="lg:col-span-7 space-y-4">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-slate-50 [text-wrap:balance]">
            Underwater Structural Crack Screening &amp; ROV Telemetry
          </h1>
          <p className="text-base sm:text-lg leading-relaxed text-slate-700 dark:text-slate-300 max-w-2xl">
            Sea Lion calibrates underwater concrete and hull imagery using two 50 mm laser dots,
            measures 95th-percentile crack width via centerline distance transform, attaches
            surface-zeroed ROV depth telemetry, and tracks crack progression over time.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2 text-sm text-slate-700 dark:text-slate-300">
            <span>AWS Region: ap-south-1</span>
            <span aria-hidden="true">·</span>
            <span>S3 + CloudFront (OAC)</span>
            <span aria-hidden="true">·</span>
            <span>HTTP API + Python 3.12</span>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Activity className="h-5 w-5 text-sky-700 dark:text-cyan-400" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
                API Health Status
              </h2>
            </div>

            {loading ? (
              <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                Checking...
              </span>
            ) : health?.ok ? (
              <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Healthy</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-rose-800 dark:text-rose-300">
                <OctagonAlert className="h-4 w-4" aria-hidden="true" />
                <span>Offline</span>
              </span>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-4 border-t border-slate-300 dark:border-slate-800 pt-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-slate-600 dark:text-slate-400">Endpoint</dt>
              <dd className="mt-1 font-mono text-xs sm:text-sm font-medium text-slate-950 dark:text-slate-100 break-all">
                {endpointDisplay}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Round-Trip Latency
              </dt>
              <dd className="mt-1 font-mono tabular-nums text-lg font-bold text-slate-950 dark:text-slate-50">
                {latencyMs !== null ? `${latencyMs} ms` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Reported Region
              </dt>
              <dd className="mt-1 font-mono text-sm text-slate-950 dark:text-slate-100">
                {health?.region ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Payload Mode
              </dt>
              <dd className="mt-1 font-mono text-sm text-slate-950 dark:text-slate-100">
                {health?.mode ?? '—'}
              </dd>
            </div>
          </dl>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-400 dark:border-rose-700 bg-rose-100 dark:bg-rose-950/50 p-3 text-sm text-rose-900 dark:text-rose-200"
            >
              {error}
            </div>
          )}

          {health && (
            <pre className="overflow-x-auto rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#070B12] p-3 font-mono text-xs leading-relaxed text-slate-900 dark:text-slate-200">
              {JSON.stringify(health, null, 2)}
            </pre>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">
          Stage 1 Cloud Infrastructure Baseline
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-5 space-y-2">
            <p className="text-xs font-mono font-semibold text-sky-700 dark:text-cyan-400">
              01. Static Edge Delivery
            </p>
            <p className="text-base font-semibold text-slate-950 dark:text-slate-50">
              Private S3 + CloudFront OAC
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Serves the Vite SPA over HTTPS with zero public S3 bucket ACLs or policies.
            </p>
          </div>

          <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-5 space-y-2">
            <p className="text-xs font-mono font-semibold text-sky-700 dark:text-cyan-400">
              02. Throttled API Gateway
            </p>
            <p className="text-base font-semibold text-slate-950 dark:text-slate-50">
              HTTP API + Python 3.12 Lambda
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Stage throttling (10 req/s steady, 20 burst) guarding the /health baseline route.
            </p>
          </div>

          <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-5 space-y-2">
            <p className="text-xs font-mono font-semibold text-sky-700 dark:text-cyan-400">
              03. Next Stages Queued
            </p>
            <p className="text-base font-semibold text-slate-950 dark:text-slate-50">
              OpenCV, DynamoDB &amp; IoT Core
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Awaiting live Stage 1 confirmation before deploying Stage 2 crack-width analysis.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-6 space-y-3">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="h-5 w-5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
            Engineering Scope &amp; Screening Limits
          </h2>
        </div>
        <ul className="list-disc pl-5 space-y-1.5 text-sm sm:text-base text-slate-700 dark:text-slate-300">
          <li>
            Optical scale (<span className="font-mono">mm/px = 50 / dot_distance_px</span>) assumes
            the ROV camera is roughly perpendicular to the inspected wall.
          </li>
          <li>
            Intended for shallow-water screening (~1 m depth) and hackathon demonstration only;
            not a substitute for certified structural engineers or ultrasonic/NDT testing.
          </li>
          <li>
            Default severity bands (Minor &le; 0.3 mm, Moderate 0.3–1.0 mm, Critical &gt; 1.0 mm)
            are configurable hackathon heuristics.
          </li>
        </ul>
      </section>
    </div>
  );
}
