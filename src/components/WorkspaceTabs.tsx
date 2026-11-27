import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Cpu,
  Database,
  Droplets,
  ExternalLink,
  Eye,
  FileCheck2,
  Flame,
  GitCompare,
  HardDrive,
  History as HistoryIcon,
  Layers,
  Maximize2,
  Play,
  RefreshCw,
  Ruler,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Sliders,
  Sparkles,
  TrendingUp,
  UploadCloud,
  Zap,
} from 'lucide-react';
import {
  ComparisonResult,
  HealthResponse,
  InspectionRecord,
  TelemetryPacket,
  compareInspections,
  getLatestTelemetry,
  ingestTelemetry,
  listInspections,
  runFullInspectionPipeline,
} from '../lib/api';
import {
  DEFAULT_THRESHOLDS,
  SeverityThresholds,
  classifySeverity,
} from '../lib/crackAnalysis';
import { NormalizedPoint, getReferenceSample } from '../lib/sampleTraces';
import { CrackTraceEditor } from './CrackTraceEditor';
import { SeverityBadge } from './SeverityBadge';

/** Defensive numeric formatting: API records may omit optional fields. */
function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value: unknown, digits = 2): string {
  return toNumber(value).toFixed(digits);
}

function formatSigned(value: unknown, digits = 2): string {
  const parsed = toNumber(value);
  return `${parsed > 0 ? '+' : ''}${parsed.toFixed(digits)}`;
}

// ============================================================================
// ILLUSTRATIVE CIVIC INFRASTRUCTURE PROFILES
// ============================================================================
export interface AssetPreset {
  id: string;
  name: string;
  type: string;
  defaultDepthM: number;
  samplePath: string;
  description: string;
  location: string;
}

export const INDIAN_ASSET_PRESETS: readonly AssetPreset[] = [
  {
    id: 'asset-tallah-res',
    name: 'Municipal Reservoir — Wall B (illustrative profile)',
    type: 'Municipal Potable Reservoir',
    defaultDepthM: 4.8,
    samplePath: '/samples/crack-c03-leak.jpg',
    description: 'Illustrative potable-water storage profile; the photo is a public-domain reference sample, not a verified KMC asset.',
    location: 'Illustrative Indian municipal profile',
  },
  {
    id: 'asset-hooghly-pier',
    name: 'Bridge Pier — Tidal Zone (illustrative profile)',
    type: 'Railway Bridge Substructure',
    defaultDepthM: 6.2,
    samplePath: '/samples/crack-c02-moderate.jpg',
    description: 'Illustrative tidal-zone pier profile; the photo is a public-domain NARA bridge-pier reference sample.',
    location: 'Illustrative Indian railway profile',
  },
  {
    id: 'asset-kalyani-sump',
    name: 'Overhead Tank Sump — Wall (illustrative profile)',
    type: 'Elevated Tank Ground Sump',
    defaultDepthM: 2.1,
    samplePath: '/samples/crack-c01-minor.jpg',
    description: 'Illustrative sump-wall profile; the photo is a CC0 concrete retaining-wall reference sample.',
    location: 'Illustrative Indian municipal profile',
  },
  {
    id: 'asset-bhakra-toe',
    name: 'Dam Gallery — Spillway Wall (illustrative profile)',
    type: 'Hydroelectric Dam Gallery',
    defaultDepthM: 8.5,
    samplePath: '/samples/crack-c04-critical.jpg',
    description: 'Illustrative dam-gallery profile; the photo is a CC BY 2.0 Austrian Dam spillway reference sample.',
    location: 'Illustrative Indian dam profile',
  },
];

// ============================================================================
// TAB 1: INSPECTION TAB (PRIMARY CIVIC AUDIT WORKSPACE)
// ============================================================================
interface InspectTabProps {
  thresholds: SeverityThresholds;
  onThresholdsChange: (next: SeverityThresholds) => void;
  onInspectionCreated?: (record: InspectionRecord) => void;
  onSelectForCompare?: (record: InspectionRecord) => void;
}

export function InspectTab({
  thresholds,
  onThresholdsChange,
  onInspectionCreated,
}: InspectTabProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(INDIAN_ASSET_PRESETS[0].id);
  const [assetName, setAssetName] = useState<string>(INDIAN_ASSET_PRESETS[0].name);
  const [assetType, setAssetType] = useState<string>(INDIAN_ASSET_PRESETS[0].type);
  const [waterDepthM, setWaterDepthM] = useState<number>(INDIAN_ASSET_PRESETS[0].defaultDepthM);
  const [calibrationMmPerPx, setCalibrationMmPerPx] = useState<number>(0.2);
  const [calibrationSource, setCalibrationSource] = useState<'assumed_demo' | 'field_reference'>(
    'assumed_demo',
  );

  const [activeSamplePath, setActiveSamplePath] = useState<string>(INDIAN_ASSET_PRESETS[0].samplePath);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>(INDIAN_ASSET_PRESETS[0].samplePath);
  const [trace, setTrace] = useState<NormalizedPoint[]>(() => {
    const reference = getReferenceSample(INDIAN_ASSET_PRESETS[0].samplePath);
    return reference ? reference.trace.map(([x, y]) => [x, y]) : [];
  });

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [progressStage, setProgressStage] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latestRecord, setLatestRecord] = useState<InspectionRecord | null>(null);

  const [viewMode, setViewMode] = useState<'annotated' | 'raw' | 'split'>('annotated');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadReferenceTrace = useCallback((path: string) => {
    const reference = getReferenceSample(path);
    setTrace(reference ? reference.trace.map(([x, y]) => [x, y] as NormalizedPoint) : []);
  }, []);

  const handleSelectPreset = (preset: AssetPreset) => {
    setSelectedPresetId(preset.id);
    setAssetName(preset.name);
    setAssetType(preset.type);
    setWaterDepthM(preset.defaultDepthM);
    setActiveSamplePath(preset.samplePath);
    setUploadedFile(null);
    setPreviewUrl(preset.samplePath);
    loadReferenceTrace(preset.samplePath);
    setLatestRecord(null);
    setProgressStage(null);
    setProgressPct(0);
    setErrorMessage(null);
  };

  const handleSelectSample = (path: string) => {
    setUploadedFile(null);
    setActiveSamplePath(path);
    setPreviewUrl(path);
    loadReferenceTrace(path);
    setLatestRecord(null);
    setProgressStage(null);
    setProgressPct(0);
    setErrorMessage(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setActiveSamplePath('');
      setTrace([]);
      setLatestRecord(null);
      setProgressStage(null);
      setProgressPct(0);
      setErrorMessage(null);
    }
  };

  const handleExecuteAnalysis = async () => {
    if (trace.length < 2) {
      setErrorMessage(
        'Mark at least two points along the crack centreline (or click "Use reference trace") before running the measurement.',
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setLatestRecord(null);
    setProgressPct(5);

    try {
      let fileBlob: Blob;
      let filename: string;

      if (uploadedFile) {
        fileBlob = uploadedFile;
        filename = uploadedFile.name;
      } else {
        setProgressStage('Loading the selected reference photo...');
        const res = await fetch(activeSamplePath);
        if (!res.ok) {
          throw new Error(`Failed to load sample image (${activeSamplePath}): HTTP ${res.status}`);
        }
        fileBlob = await res.blob();
        filename = activeSamplePath.split('/').pop() ?? 'sample.jpg';
      }

      const record = await runFullInspectionPipeline({
        fileOrBlob: fileBlob,
        filename,
        assetId: selectedPresetId,
        assetName,
        assetType,
        waterDepthM,
        calibrationMmPerPx,
        calibrationSource,
        trace,
        onStageChange: (stage, pct) => {
          setProgressStage(stage);
          if (pct !== undefined) setProgressPct(pct);
        },
      });

      setLatestRecord(record);
      onInspectionCreated?.(record);
      setProgressStage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Analysis pipeline failed');
      setProgressStage(null);
    } finally {
      setSubmitting(false);
    }
  };

  const referenceSample = getReferenceSample(activeSamplePath);

  return (
    <div className="space-y-6">
      {/* Civic Context Banner */}
      <section className="rounded-xl border border-sky-300/40 dark:border-cyan-500/20 bg-gradient-to-r from-sky-50 via-white to-blue-50 dark:from-[#0B1526] dark:via-[#0D1B2A] dark:to-[#07101B] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 dark:bg-cyan-950/80 border border-sky-300 dark:border-cyan-700 px-2.5 py-0.5 text-xs font-semibold text-sky-900 dark:text-cyan-300">
                <Shield className="h-3.5 w-3.5" />
                <span>Bharat Civic Infrastructure Defense</span>
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Techfest IIT Bombay AWS Hackathon
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-slate-50">
              Submerged Structural Screening &amp; Water-Loss Physics
            </h1>
            <p className="text-sm text-slate-700 dark:text-slate-300 max-w-3xl leading-relaxed">
              Upload a diver or ROV photo, mark the crack centreline, and the AWS pipeline measures the
              aperture along your trace with OpenCV, estimates Torricelli leakage, and persists the
              record to DynamoDB. This is a <strong>screening estimate</strong>, not a certified survey.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExecuteAnalysis}
              disabled={submitting}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-sky-700 hover:bg-sky-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 text-white px-5 py-2.5 text-sm font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-60"
            >
              <Play className={`h-4 w-4 ${submitting ? 'animate-spin' : ''}`} />
              <span>{submitting ? 'Measuring on AWS...' : 'Run AWS Screening Measurement'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Two-Column Layout */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: Asset Selection & Upload Config */}
        <div className="lg:col-span-5 space-y-5">
          {/* Asset Selection Card */}
          <section className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-950 dark:text-slate-50 flex items-center gap-2">
                <Compass className="h-4 w-4 text-sky-700 dark:text-cyan-400" />
                <span>1. Select an Asset Profile</span>
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">Illustrative</span>
            </div>

            <div className="space-y-2">
              {INDIAN_ASSET_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-sky-600 dark:border-cyan-400 bg-sky-50 dark:bg-cyan-950/30 ring-1 ring-sky-600 dark:ring-cyan-400'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070B12] hover:border-slate-400 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                        {preset.name}
                      </p>
                      <span className="text-xs font-mono font-bold text-sky-800 dark:text-cyan-300 shrink-0">
                        {preset.defaultDepthM}m head
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      {preset.location} · {preset.type}
                    </p>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              These profiles pair illustrative Indian asset types with public-domain reference photos.
              They are not verified utility assets. Edit the fields below for your own site.
            </p>

            {/* Custom Asset Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <label htmlFor="inspect-water-depth" className="font-semibold text-slate-800 dark:text-slate-200">
                  Water Head Depth (m)
                </label>
                <input
                  id="inspect-water-depth"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="30"
                  value={waterDepthM}
                  onChange={(e) => setWaterDepthM(Number(e.target.value))}
                  className="mt-1 w-full min-h-[38px] rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] px-2.5 py-1 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
              <div>
                <label htmlFor="inspect-scale" className="font-semibold text-slate-800 dark:text-slate-200">
                  Scale (mm/px)
                </label>
                <input
                  id="inspect-scale"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="5"
                  value={calibrationMmPerPx}
                  onChange={(e) => setCalibrationMmPerPx(Number(e.target.value))}
                  className="mt-1 w-full min-h-[38px] rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] px-2.5 py-1 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
              <div>
                <label htmlFor="inspect-calibration-source" className="font-semibold text-slate-800 dark:text-slate-200">
                  Scale Source
                </label>
                <select
                  id="inspect-calibration-source"
                  value={calibrationSource}
                  onChange={(e) => setCalibrationSource(e.target.value as 'assumed_demo' | 'field_reference')}
                  className="mt-1 w-full min-h-[38px] rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] px-2 py-1 text-slate-900 dark:text-slate-100"
                >
                  <option value="assumed_demo">Assumed (demo)</option>
                  <option value="field_reference">Field ruler / target</option>
                </select>
              </div>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Reference photos use a demo assumption of 0.2 mm/px. For a field photo, place a ruler or
              known-size target in the frame and record the true scale.
            </p>
          </section>

          {/* Image Ingestion Mode (Hardware-Agnostic) */}
          <section className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-950 dark:text-slate-50 flex items-center gap-2">
                <UploadCloud className="h-4 w-4 text-sky-700 dark:text-cyan-400" />
                <span>2. Ingest Underwater Photo</span>
              </h2>
              <span className="text-xs text-emerald-800 dark:text-emerald-400 font-semibold font-mono">
                Hardware-Agnostic
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Works with diver action cameras, pipe crawlers, or tethered ROV cameras. The photo is
              processed only after you mark the crack centreline.
            </p>

            {/* Drag & Drop Area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] p-5 text-center cursor-pointer hover:border-sky-600 dark:hover:border-cyan-400 transition-colors"
            >
              <Camera className="h-8 w-8 mx-auto text-slate-400 dark:text-slate-500 mb-2" />
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {uploadedFile ? uploadedFile.name : 'Click or drop custom underwater inspection photo'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                PNG, JPG, or WebP up to 10MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Quick Sample Selector */}
            <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Or use a public-domain reference photo:
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Wall crack (C-01)', path: '/samples/crack-c01-minor.jpg' },
                  { label: 'Bridge pier (C-02)', path: '/samples/crack-c02-moderate.jpg' },
                  { label: 'Dam crack (C-03)', path: '/samples/crack-c03-leak.jpg' },
                ].map((s) => (
                  <button
                    key={s.path}
                    type="button"
                    onClick={() => handleSelectSample(s.path)}
                    className={`min-h-[38px] px-2 py-1 text-[11px] font-semibold rounded border transition-colors cursor-pointer ${
                      activeSamplePath === s.path && !uploadedFile
                        ? 'border-sky-700 bg-sky-700 text-white dark:bg-cyan-500 dark:text-slate-950'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Each reference photo includes a preloaded operator trace. Image credits are listed in
                the submission pack.
              </p>
            </div>

            {/* Trigger Button & Progress */}
            <button
              type="button"
              onClick={handleExecuteAnalysis}
              disabled={submitting}
              className="w-full inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg bg-sky-700 hover:bg-sky-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 text-white px-4 py-2 text-sm font-bold shadow transition-colors cursor-pointer disabled:opacity-60"
            >
              <Play className={`h-4 w-4 ${submitting ? 'animate-spin' : ''}`} />
              <span>{submitting ? 'Processing on AWS...' : 'Upload & Measure Crack Aperture'}</span>
            </button>

            {progressStage && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs font-mono text-sky-800 dark:text-cyan-300">
                  <span className="truncate">{progressStage}</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full bg-sky-700 dark:bg-cyan-400 transition-all duration-200"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {errorMessage && (
              <div
                role="alert"
                className="rounded-lg border border-rose-400 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/60 p-3.5 text-xs text-rose-950 dark:text-rose-200 flex items-start gap-2"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Inspection Error</p>
                  <p className="mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}
          </section>

          {/* Configurable Severity Thresholds */}
          <section className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-950 dark:text-slate-50 flex items-center gap-1.5">
                <Sliders className="h-4 w-4 text-sky-700 dark:text-cyan-400" />
                <span>Configurable Screening Bands</span>
              </h2>
              <button
                type="button"
                onClick={() => onThresholdsChange(DEFAULT_THRESHOLDS)}
                className="text-xs text-sky-700 dark:text-cyan-400 underline hover:no-underline cursor-pointer"
              >
                Reset
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between font-mono">
                  <span>Minor Threshold:</span>
                  <span className="font-bold">&le; {thresholds.minorMaxMm.toFixed(2)} mm</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.8"
                  step="0.05"
                  value={thresholds.minorMaxMm}
                  onChange={(e) =>
                    onThresholdsChange({
                      minorMaxMm: Number(e.target.value),
                      moderateMaxMm: Math.max(Number(e.target.value) + 0.1, thresholds.moderateMaxMm),
                    })
                  }
                  className="w-full accent-sky-700 dark:accent-cyan-400 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between font-mono">
                  <span>Moderate Threshold:</span>
                  <span className="font-bold">&le; {thresholds.moderateMaxMm.toFixed(2)} mm</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="2.0"
                  step="0.05"
                  value={thresholds.moderateMaxMm}
                  onChange={(e) =>
                    onThresholdsChange({
                      minorMaxMm: Math.min(thresholds.minorMaxMm, Number(e.target.value) - 0.1),
                      moderateMaxMm: Number(e.target.value),
                    })
                  }
                  className="w-full accent-sky-700 dark:accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Demo thresholds for this prototype. They are not an official PWD, Jal Board, or NDSA
              standard.
            </p>
          </section>
        </div>

        {/* Right Column: Operator Trace, Visual Proof & Impact Dashboard */}
        <div className="lg:col-span-7 space-y-5">
          {/* Operator-Guided Crack Trace */}
          <section className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h2 className="text-base font-bold text-slate-950 dark:text-slate-50 flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-sky-700 dark:text-cyan-400" />
                  <span>3. Mark the Crack Centreline</span>
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Click along the dark crack line. Lambda measures the aperture perpendicular to your
                  trace. Human localisation, computer-vision measurement.
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-sky-800 dark:text-cyan-300">
                {trace.length} point{trace.length === 1 ? '' : 's'}
              </span>
            </div>

            <CrackTraceEditor
              imageUrl={previewUrl}
              trace={trace}
              onTraceChange={(next) => {
                setTrace(next);
                setErrorMessage(null);
              }}
              referenceSample={referenceSample}
              disabled={submitting}
            />

            {referenceSample && (
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                A reference trace is preloaded for this public-domain photo. For a field image, mark
                your own points and enter the true scale.
              </p>
            )}
          </section>

          {/* Visual Proof Viewer */}
          <section className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h2 className="text-base font-bold text-slate-950 dark:text-slate-50 flex items-center gap-2">
                  <Eye className="h-4 w-4 text-sky-700 dark:text-cyan-400" />
                  <span>Visual Evidence: Trace &amp; Aperture Overlay</span>
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                  {latestRecord ? `Inspection ID: ${latestRecord.inspection_id}` : 'Awaiting measurement'}
                </p>
              </div>

              {latestRecord && (
                <div className="flex items-center gap-1 bg-white dark:bg-[#070B12] p-1 rounded-lg border border-slate-300 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setViewMode('annotated')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer ${
                      viewMode === 'annotated'
                        ? 'bg-sky-700 text-white dark:bg-cyan-500 dark:text-slate-950'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Measurement Overlay
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('raw')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer ${
                      viewMode === 'raw'
                        ? 'bg-sky-700 text-white dark:bg-cyan-500 dark:text-slate-950'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Raw Frame
                  </button>
                </div>
              )}
            </div>

            {/* Image Display */}
            <div className="relative overflow-hidden rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-900 aspect-video flex items-center justify-center">
              {latestRecord ? (
                <img
                  src={viewMode === 'raw' ? latestRecord.raw_image_url : latestRecord.annotated_image_url}
                  alt="Inspection visual overlay"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center">
                  <img
                    src={previewUrl}
                    alt="Preview target"
                    className="absolute inset-0 w-full h-full object-cover opacity-35 filter blur-[1px]"
                  />
                  <div className="relative z-10 max-w-sm space-y-2 bg-slate-950/80 p-4 rounded-xl border border-slate-800 backdrop-blur-sm">
                    <p className="text-sm font-bold text-white">Target Staged for AWS Measurement</p>
                    <p className="text-xs text-slate-300">
                      Click &ldquo;Run AWS Screening Measurement&rdquo; to upload to S3 and measure the
                      aperture along the trace in Lambda.
                    </p>
                  </div>
                </div>
              )}

              {latestRecord && (
                <div className="absolute top-3 right-3 bg-slate-950/85 backdrop-blur-sm border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono text-white flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      latestRecord.source === 'aws-lambda'
                        ? 'bg-emerald-400'
                        : latestRecord.source === 'local-demo'
                          ? 'bg-amber-400'
                          : 'bg-slate-400'
                    }`}
                  />
                  <span>
                    {latestRecord.source === 'aws-lambda'
                      ? 'AWS Lambda record'
                      : latestRecord.source === 'local-demo'
                        ? 'LOCAL DEMO record'
                        : 'Inspection record'}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Screening Metrics & Torricelli Estimate */}
          {latestRecord ? (
            <div className="space-y-4">
              {latestRecord.status === 'REVIEW_REQUIRED' || latestRecord.crack_detected === false ? (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs text-amber-950 dark:text-amber-100 flex items-start gap-2"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="font-bold">Review required — no confident aperture measurement</p>
                    <p>
                      The trace did not yield a stable dark aperture. Re-mark the crack centreline or
                      upload a clearer image. No water-loss or risk figure is reported for this record.
                    </p>
                    <p className="font-mono text-[11px]">
                      Confidence {latestRecord.confidence ?? 0}% · method{' '}
                      {latestRecord.measurement_method ?? 'operator_trace'}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Aperture */}
                    <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-4 space-y-1">
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        Aperture (median / P90)
                      </p>
                      <p className="text-2xl font-extrabold font-mono text-slate-950 dark:text-cyan-300">
                        {formatNumber(
                          latestRecord.crack_median_width_mm ??
                            latestRecord.crack_mean_width_mm ??
                            latestRecord.crack_max_width_mm,
                        )}
                        {' / '}
                        {formatNumber(latestRecord.crack_max_width_mm)} mm
                      </p>
                      <div className="pt-1">
                        <SeverityBadge
                          severity={classifySeverity(
                            toNumber(latestRecord.crack_max_width_mm),
                            thresholds,
                          )}
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Hydraulic Water Loss */}
                    <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-4 space-y-1">
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Water Loss Estimate</p>
                      <p className="text-2xl font-extrabold font-mono text-slate-950 dark:text-slate-50">
                        {toNumber(latestRecord.water_loss_liters_per_day).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Liters / Day</p>
                    </div>

                    {/* Annual Financial Loss */}
                    <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-4 space-y-1">
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Annual NRW Estimate</p>
                      <p className="text-2xl font-extrabold font-mono text-amber-700 dark:text-amber-400">
                        ₹{Math.round(toNumber(latestRecord.annual_loss_inr)).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Treated Water / Year</p>
                    </div>

                    {/* Structural Risk Index */}
                    <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-4 space-y-1">
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Screening Risk Index</p>
                      <p className="text-2xl font-extrabold font-mono text-rose-700 dark:text-rose-400">
                        {toNumber(latestRecord.structural_risk_index)} / 100
                      </p>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          latestRecord.risk_tier === 'CRITICAL'
                            ? 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200'
                            : latestRecord.risk_tier === 'MODERATE'
                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                              : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                        }`}
                      >
                        {latestRecord.risk_tier}
                      </span>
                    </div>
                  </div>

                  {/* Action Recommendation Callout */}
                  <div className="rounded-xl border border-sky-400/50 dark:border-cyan-600/50 bg-sky-50/70 dark:bg-cyan-950/20 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <FileCheck2 className="h-4 w-4 text-sky-800 dark:text-cyan-400" />
                      <p className="text-xs font-bold uppercase tracking-wider text-sky-950 dark:text-cyan-300">
                        Screening Recommendation — Engineer Confirmation Required
                      </p>
                    </div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {latestRecord.action_recommendation}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-slate-600 dark:text-slate-400 pt-1">
                      <span>Trace length: {formatNumber(latestRecord.crack_total_length_cm)} cm</span>
                      <span>·</span>
                      <span>Affected area: {formatNumber(latestRecord.crack_area_cm2)} cm&sup2;</span>
                      <span>·</span>
                      <span>Head: {formatNumber(latestRecord.water_depth_m, 1)} m</span>
                      <span>·</span>
                      <span>
                        Scale: {formatNumber(latestRecord.calibration_mm_per_px)} mm/px (
                        {latestRecord.calibration_source ?? 'unknown'})
                      </span>
                      <span>·</span>
                      <span>Confidence: {latestRecord.confidence ?? '—'}%</span>
                    </div>
                  </div>
                </>
              )}

              {latestRecord.limitations && latestRecord.limitations.length > 0 && (
                <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-4 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Measurement Limitations
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {latestRecord.limitations.map((limitation) => (
                      <li key={limitation}>{limitation}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-8 text-center space-y-2">
              <Droplets className="h-8 w-8 mx-auto text-sky-600 dark:text-cyan-400" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Screening Engine Ready
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                After a measurement, this panel shows the median and P90 aperture, the Torricelli
                water-loss estimate, and a screening risk band. All figures require engineer review.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TAB 2: HISTORY TAB (DYNAMODB AUDIT LOG)
// ============================================================================
interface HistoryTabProps {
  thresholds: SeverityThresholds;
  onSelectForCompare?: (record: InspectionRecord) => void;
}

export function HistoryTab({ thresholds, onSelectForCompare }: HistoryTabProps) {
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [selectedInspection, setSelectedInspection] = useState<InspectionRecord | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await listInspections();
      setInspections(records);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to query DynamoDB table');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const filtered = useMemo(() => {
    if (!filterQuery) return inspections;
    const q = filterQuery.toLowerCase();
    return inspections.filter((i) =>
      [i.asset_name, i.asset_id, i.inspection_id, i.risk_tier]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    );
  }, [inspections, filterQuery]);

  return (
    <section className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-sky-700 dark:text-cyan-400" />
            <h1 className="text-xl font-bold text-slate-950 dark:text-slate-50">
              Inspection Audit Log
            </h1>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Records returned by the API: DynamoDB in AWS mode, an in-memory store in local demo mode.
            Image links are short-lived presigned URLs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search asset or ID..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] text-slate-900 dark:text-slate-100 font-mono"
            />
          </div>
          <button
            type="button"
            onClick={() => void fetchHistory()}
            disabled={loading}
            className="inline-flex min-h-[38px] items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-400 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/60 p-3 text-xs text-rose-950 dark:text-rose-200"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 space-y-2">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-sky-700 dark:text-cyan-400" />
          <p className="text-xs font-mono text-slate-600 dark:text-slate-400">
            Loading inspection records...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            No inspection records returned by the API.
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Run a measurement from the &ldquo;Inspect&rdquo; tab to create the first record.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-[#0B121E] text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Thumbnail</th>
                <th className="py-2.5 px-3">Asset &amp; Location</th>
                <th className="py-2.5 px-3">Depth</th>
                <th className="py-2.5 px-3">Max Width</th>
                <th className="py-2.5 px-3">Water Loss</th>
                <th className="py-2.5 px-3">Risk Tier</th>
                <th className="py-2.5 px-3">Timestamp (IST)</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#070B12]">
              {filtered.map((item) => {
                const width = toNumber(item.crack_max_width_mm ?? item.widthMm);
                const reviewRequired =
                  item.status === 'REVIEW_REQUIRED' || item.crack_detected === false;
                const createdAt = item.created_at || item.createdAt;
                const createdLabel =
                  createdAt && !Number.isNaN(new Date(createdAt).getTime())
                    ? new Date(createdAt).toLocaleString('en-IN')
                    : '—';
                const sourceLabel =
                  item.source === 'aws-lambda'
                    ? 'AWS'
                    : item.source === 'local-demo'
                      ? 'DEMO'
                      : '—';

                return (
                  <tr key={item.inspection_id || item.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="py-2 px-3">
                      <div className="h-10 w-14 overflow-hidden rounded border border-slate-200 dark:border-slate-700 bg-slate-900 flex items-center justify-center">
                        {item.annotated_image_url || item.raw_image_url ? (
                          <img
                            src={item.annotated_image_url || item.raw_image_url}
                            alt={`${item.asset_name || 'Inspection'} thumbnail`}
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <Camera className="h-4 w-4 text-slate-500" aria-hidden="true" />
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {item.asset_name || 'Unnamed asset'}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {item.asset_id || '—'}
                      </p>
                    </td>
                    <td className="py-2 px-3 font-mono">{formatNumber(item.water_depth_m, 1)}m</td>
                    <td className="py-2 px-3 font-mono">
                      {reviewRequired ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                          Review required
                        </span>
                      ) : (
                        <>
                          <span className="font-bold">{width.toFixed(2)} mm</span>
                          <div className="pt-0.5">
                            <SeverityBadge
                              severity={classifySeverity(width, thresholds)}
                              size="sm"
                            />
                          </div>
                        </>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {reviewRequired ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <>
                          <p className="font-bold text-slate-900 dark:text-slate-100">
                            {toNumber(item.water_loss_liters_per_day).toLocaleString()} L/d
                          </p>
                          <p className="text-[10px] text-amber-700 dark:text-amber-400">
                            ₹{Math.round(toNumber(item.annual_loss_inr)).toLocaleString()}/yr
                          </p>
                        </>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          reviewRequired || item.risk_tier === 'CRITICAL'
                            ? 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200'
                            : item.risk_tier === 'MODERATE'
                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                              : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                        }`}
                      >
                        {reviewRequired
                          ? 'REVIEW'
                          : `${item.risk_tier || 'UNKNOWN'} (${toNumber(item.structural_risk_index)})`}
                      </span>
                      <p className="pt-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                        {sourceLabel}
                      </p>
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {createdLabel}
                    </td>
                    <td className="py-2 px-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => setSelectedInspection(item)}
                        className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium cursor-pointer"
                      >
                        View
                      </button>
                      {onSelectForCompare && (
                        <button
                          type="button"
                          onClick={() => onSelectForCompare(item)}
                          className="px-2 py-1 rounded bg-sky-700 hover:bg-sky-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-[11px] font-bold cursor-pointer"
                        >
                          Compare
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selectedInspection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="max-w-2xl w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1623] p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-950 dark:text-slate-50">
                {selectedInspection.asset_name}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedInspection(null)}
                className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                Close
              </button>
            </div>
            <img
              src={selectedInspection.annotated_image_url || selectedInspection.raw_image_url}
              alt="Inspection detail"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 max-h-72 object-contain bg-slate-950"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
              <span
                className={`px-2 py-0.5 rounded font-bold ${
                  selectedInspection.status === 'REVIEW_REQUIRED' ||
                  selectedInspection.crack_detected === false
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                    : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                }`}
              >
                {selectedInspection.status === 'REVIEW_REQUIRED' ||
                selectedInspection.crack_detected === false
                  ? 'REVIEW REQUIRED'
                  : 'COMPLETED'}
              </span>
              <span className="text-slate-500">
                Source: {selectedInspection.source ?? 'unknown'}
              </span>
              <span className="text-slate-500">
                Confidence: {selectedInspection.confidence ?? '—'}%
              </span>
              <span className="text-slate-500">
                Method: {selectedInspection.measurement_method ?? '—'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div>
                <span className="text-slate-500">Inspection ID:</span>{' '}
                {selectedInspection.inspection_id || selectedInspection.id || '—'}
              </div>
              <div>
                <span className="text-slate-500">Asset ID:</span>{' '}
                {selectedInspection.asset_id || '—'}
              </div>
              <div>
                <span className="text-slate-500">Median aperture:</span>{' '}
                {formatNumber(
                  selectedInspection.crack_median_width_mm ??
                    selectedInspection.crack_mean_width_mm,
                )}{' '}
                mm
              </div>
              <div>
                <span className="text-slate-500">P90 aperture:</span>{' '}
                {formatNumber(selectedInspection.crack_max_width_mm)} mm
              </div>
              <div>
                <span className="text-slate-500">Water loss estimate:</span>{' '}
                {toNumber(selectedInspection.water_loss_liters_per_day).toLocaleString()} L/day
              </div>
              <div>
                <span className="text-slate-500">Annual estimate:</span> ₹
                {Math.round(toNumber(selectedInspection.annual_loss_inr)).toLocaleString()}
              </div>
              <div>
                <span className="text-slate-500">Screening risk:</span>{' '}
                {selectedInspection.risk_tier || '—'} (
                {toNumber(selectedInspection.structural_risk_index)}/100)
              </div>
              <div>
                <span className="text-slate-500">Scale:</span>{' '}
                {formatNumber(selectedInspection.calibration_mm_per_px)} mm/px (
                {selectedInspection.calibration_source ?? 'unknown'})
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-500">Created:</span>{' '}
                {selectedInspection.created_at || selectedInspection.createdAt
                  ? new Date(
                      selectedInspection.created_at || selectedInspection.createdAt || '',
                    ).toLocaleString('en-IN')
                  : '—'}
              </div>
            </div>
            <p className="text-xs p-3 rounded bg-sky-50 dark:bg-cyan-950/40 text-slate-900 dark:text-slate-100 font-medium border border-sky-200 dark:border-cyan-800">
              {selectedInspection.action_recommendation || 'No recommendation recorded.'}
            </p>
            {selectedInspection.limitations && selectedInspection.limitations.length > 0 && (
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <p className="font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Limitations
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  {selectedInspection.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Screening estimate only. Confirm the scale and the finding with a qualified engineer
              before any repair decision.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// TAB 3: COMPARE TAB (TEMPORAL DEGRADATION ENGINE)
// ============================================================================
interface CompareTabProps {
  initialBaselineId?: string;
  initialCurrentId?: string;
}

export function CompareTab({ initialBaselineId, initialCurrentId }: CompareTabProps) {
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [baselineId, setBaselineId] = useState<string>(initialBaselineId || '');
  const [currentId, setCurrentId] = useState<string>(initialCurrentId || '');

  const [comparing, setComparing] = useState<boolean>(false);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const [sliderPos, setSliderPos] = useState<number>(50);

  useEffect(() => {
    async function loadAll() {
      try {
        const list = await listInspections();
        setInspections(list);

        if (initialBaselineId && initialCurrentId) {
          setBaselineId(initialBaselineId);
          setCurrentId(initialCurrentId);
          return;
        }

        // Auto-select the most recent same-asset pair, oldest -> newest.
        const groups = new Map<string, InspectionRecord[]>();
        for (const record of list) {
          const key = record.asset_id || 'unknown';
          groups.set(key, [...(groups.get(key) ?? []), record]);
        }
        const pair = [...groups.values()].find((group) => group.length >= 2);
        if (pair) {
          const ordered = [...pair].sort(
            (a, b) =>
              new Date(a.created_at || a.createdAt || 0).getTime() -
              new Date(b.created_at || b.createdAt || 0).getTime(),
          );
          setBaselineId(ordered[0].inspection_id);
          setCurrentId(ordered[ordered.length - 1].inspection_id);
        } else if (list.length > 0) {
          setBaselineId(list[0].inspection_id);
        }
      } catch {
        // Leave the empty state in place; the user can retry from History.
      } finally {
        setLoadingList(false);
      }
    }
    void loadAll();
  }, [initialBaselineId, initialCurrentId]);

  const handleRunComparison = async () => {
    if (!baselineId || !currentId) return;
    const baseline = inspections.find((i) => i.inspection_id === baselineId);
    const current = inspections.find((i) => i.inspection_id === currentId);
    if (!baseline || !current) {
      setCompareError('Select two inspection records.');
      return;
    }
    if (baseline.asset_id !== current.asset_id) {
      setCompareError(
        'Both inspections must belong to the same asset. Pick a baseline, then choose another inspection of that same asset.',
      );
      return;
    }

    setComparing(true);
    setCompareError(null);
    try {
      const res = await compareInspections(baseline.asset_id, baselineId, currentId);
      setComparisonResult(res);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setComparing(false);
    }
  };

  const baselineItem = inspections.find((i) => i.inspection_id === baselineId);
  const currentItem = inspections.find((i) => i.inspection_id === currentId);
  const sameAsset = Boolean(
    baselineItem && currentItem && baselineItem.asset_id === currentItem.asset_id,
  );
  const currentOptions = baselineItem
    ? inspections.filter((i) => i.asset_id === baselineItem.asset_id)
    : inspections;
  const hasComparablePair = inspections.some(
    (record) => inspections.filter((other) => other.asset_id === record.asset_id).length >= 2,
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-sky-700 dark:text-cyan-400" />
              <h1 className="text-xl font-bold text-slate-950 dark:text-slate-50">
                Multi-Timestamp Structural Degradation Comparison
              </h1>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Compare two inspections of the <strong>same asset</strong> to compute the signed aperture
              change, water-loss change, and elapsed-time velocity. Records from different assets are
              rejected by the API.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunComparison}
            disabled={comparing || !sameAsset}
            className="inline-flex min-h-[42px] items-center gap-2 px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60"
          >
            <GitCompare className={`h-4 w-4 ${comparing ? 'animate-spin' : ''}`} />
            <span>{comparing ? 'Calculating change...' : 'Run Change Comparison'}</span>
          </button>
        </div>

        {/* Dropdown Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <label htmlFor="compare-baseline" className="block text-xs font-bold text-slate-800 dark:text-slate-200">
              Baseline Inspection (Earlier Date)
            </label>
            <select
              id="compare-baseline"
              value={baselineId}
              onChange={(e) => {
                const nextId = e.target.value;
                setBaselineId(nextId);
                setComparisonResult(null);
                setCompareError(null);
                const nextBaseline = inspections.find((i) => i.inspection_id === nextId);
                if (nextBaseline) {
                  const candidates = inspections.filter(
                    (i) => i.asset_id === nextBaseline.asset_id && i.inspection_id !== nextId,
                  );
                  if (!candidates.some((i) => i.inspection_id === currentId)) {
                    setCurrentId(candidates[0]?.inspection_id ?? '');
                  }
                }
              }}
              className="w-full min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono"
            >
              <option value="">Select Baseline...</option>
              {inspections.map((i) => (
                <option key={i.inspection_id} value={i.inspection_id}>
                  {i.asset_name} ({formatNumber(i.crack_max_width_mm)}mm) —{' '}
                  {i.created_at || i.createdAt
                    ? new Date(i.created_at || i.createdAt || '').toLocaleDateString()
                    : 'unknown date'}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="compare-current" className="block text-xs font-bold text-slate-800 dark:text-slate-200">
              Current Re-Inspection (same asset)
            </label>
            <select
              id="compare-current"
              value={currentId}
              onChange={(e) => {
                setCurrentId(e.target.value);
                setComparisonResult(null);
                setCompareError(null);
              }}
              className="w-full min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono"
            >
              <option value="">Select Current...</option>
              {currentOptions
                .filter((i) => i.inspection_id !== baselineId)
                .map((i) => (
                  <option key={i.inspection_id} value={i.inspection_id}>
                    {i.asset_name} ({formatNumber(i.crack_max_width_mm)}mm) —{' '}
                    {i.created_at || i.createdAt
                      ? new Date(i.created_at || i.createdAt || '').toLocaleDateString()
                      : 'unknown date'}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {!loadingList && !hasComparablePair && (
          <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg p-3">
            No same-asset pair is available yet. Run two measurements for one asset from the Inspect
            tab, then return here.
          </p>
        )}
        {!loadingList && hasComparablePair && baselineItem && currentOptions.filter((i) => i.inspection_id !== baselineId).length === 0 && (
          <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg p-3">
            This asset has only one inspection. Run another measurement for the same asset before
            comparing.
          </p>
        )}
        {baselineItem && sameAsset && (
          <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
            Same asset: {baselineItem.asset_name} · {baselineItem.asset_id}
          </p>
        )}

        {compareError && (
          <div
            role="alert"
            className="rounded-lg border border-rose-400 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/60 p-3 text-xs text-rose-950 dark:text-rose-200"
          >
            {compareError}
          </div>
        )}
      </section>

      {/* Comparison Visual Split & Delta Cards */}
      {comparisonResult ? (
        <div className="grid gap-6 lg:grid-cols-12 items-start">
          {/* Interactive Drag Before/After Image Slider */}
          <div className="lg:col-span-7 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-950 dark:text-slate-50 flex items-center gap-2">
                <Sliders className="h-4 w-4 text-sky-700 dark:text-cyan-400" />
                <span>Interactive Before/After Aperture Slider</span>
              </h2>
              <span className="text-xs font-mono text-slate-500">Drag handle to compare</span>
            </div>

            <div className="relative overflow-hidden rounded-lg border border-slate-300 dark:border-slate-800 aspect-video select-none">
              {/* After Image (Background) */}
              <img
                src={comparisonResult.current.annotated_image_url || comparisonResult.current.raw_image_url}
                alt="Current"
                className="absolute inset-0 w-full h-full object-contain bg-slate-950"
              />

              {/* Before Image (Clipped Overlay) */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${sliderPos}%` }}
              >
                <img
                  src={comparisonResult.baseline.annotated_image_url || comparisonResult.baseline.raw_image_url}
                  alt="Baseline"
                  className="absolute inset-0 w-full h-full object-contain bg-slate-950 max-w-none"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>

              {/* Slider Divider Line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg cursor-ew-resize"
                style={{ left: `${sliderPos}%` }}
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-sky-700 dark:bg-cyan-500 text-white dark:text-slate-950 flex items-center justify-center text-xs font-bold shadow-md">
                  &harr;
                </div>
              </div>

              {/* Slider Input overlay */}
              <input
                type="range"
                min="0"
                max="100"
                value={sliderPos}
                onChange={(e) => setSliderPos(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20"
                aria-label="Image comparison slider position"
              />

              {/* Labels */}
              <div className="absolute top-3 left-3 bg-slate-950/80 px-2 py-1 rounded text-[11px] font-mono text-white pointer-events-none z-10">
                Baseline ({formatNumber(comparisonResult.baseline.crack_max_width_mm)}mm)
              </div>
              <div className="absolute top-3 right-3 bg-slate-950/80 px-2 py-1 rounded text-[11px] font-mono text-white pointer-events-none z-10">
                Current ({formatNumber(comparisonResult.current.crack_max_width_mm)}mm)
              </div>
            </div>
          </div>

          {/* Delta Metrics & Verdict */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-950 dark:text-slate-50 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-sky-700 dark:text-cyan-400" />
                <span>Delta Progression Breakdown</span>
              </h2>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-white dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-slate-500">&Delta; P90 aperture</span>
                  <p className="text-xl font-extrabold font-mono text-rose-700 dark:text-rose-400">
                    {formatSigned(comparisonResult.delta_width_mm)} mm
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-white dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-slate-500">Area change</span>
                  <p className="text-xl font-extrabold font-mono text-amber-700 dark:text-amber-400">
                    {formatSigned(comparisonResult.area_expansion_pct, 1)}%
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-white dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-slate-500">&Delta; Water loss</span>
                  <p className="text-xl font-extrabold font-mono text-sky-800 dark:text-cyan-300">
                    {formatSigned(comparisonResult.delta_water_loss_liters_per_day, 1)} L/d
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-white dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-slate-500">Aperture velocity</span>
                  <p className="text-xl font-extrabold font-mono text-slate-900 dark:text-slate-100">
                    {formatSigned(comparisonResult.deterioration_velocity_mm_per_day, 4)}
                  </p>
                  <span className="text-[10px] text-slate-500">mm / day</span>
                </div>
              </div>

              <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                Elapsed: {formatNumber(comparisonResult.elapsed_days, 1)} days · Asset:{' '}
                {comparisonResult.asset_id} · Signed change (current − baseline)
              </p>

              {/* Verdict Banner */}
              <div
                className={`p-4 rounded-xl border space-y-2 ${
                  comparisonResult.urgency === 'CRITICAL'
                    ? 'border-rose-400 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40 text-rose-950 dark:text-rose-100'
                    : comparisonResult.urgency === 'MODERATE'
                      ? 'border-amber-400 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100'
                      : 'border-emerald-400 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <p className="text-xs font-bold uppercase tracking-wider">{comparisonResult.verdict}</p>
                </div>
                <p className="text-xs leading-relaxed">{comparisonResult.recommendation}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-12 text-center space-y-2">
          <GitCompare className="h-8 w-8 mx-auto text-slate-400" />
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Select Two Inspections to Compare
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Choose a baseline and current re-inspection above and click &ldquo;Run Degradation Comparison&rdquo; to visualize the delta.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TAB 4: TELEMETRY TAB (SENSOR PACKETS & CLOUD HEALTH)
// ============================================================================
interface TelemetryTabProps {
  health: HealthResponse | null;
  latencyMs: number | null;
  loading: boolean;
  error: string | null;
}

type ServiceState = 'ok' | 'warn' | 'unknown';

function serviceState(value: string | undefined): ServiceState {
  if (!value) return 'unknown';
  const normalized = value.toLowerCase();
  if (normalized.includes('sim') || normalized.includes('demo') || normalized.includes('mock')) {
    return 'warn';
  }
  if (
    normalized.includes('ok') ||
    normalized.includes('healthy') ||
    normalized.includes('ready') ||
    normalized.includes('active') ||
    normalized.includes('available') ||
    normalized.includes('connected')
  ) {
    return 'ok';
  }
  return 'unknown';
}

function serviceDotClass(state: ServiceState): string {
  if (state === 'ok') return 'bg-emerald-400';
  if (state === 'warn') return 'bg-amber-400';
  return 'bg-slate-400';
}

export function TelemetryTab({ health, latencyMs, loading, error }: TelemetryTabProps) {
  const [telemetry, setTelemetry] = useState<TelemetryPacket | null>(null);
  const [pulsing, setPulsing] = useState<boolean>(false);
  const [pulseMessage, setPulseMessage] = useState<string | null>(null);
  const [pulseError, setPulseError] = useState<boolean>(false);

  const fetchLatest = useCallback(async () => {
    try {
      const pkt = await getLatestTelemetry();
      setTelemetry(pkt);
    } catch {
      // Leave the last packet (or the empty state) in place.
    }
  }, []);

  useEffect(() => {
    void fetchLatest();
    const interval = setInterval(() => {
      void fetchLatest();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchLatest]);

  const handleTriggerPulse = async () => {
    setPulsing(true);
    setPulseMessage(null);
    setPulseError(false);
    try {
      // Values are generated in the browser. This demonstrates the ingestion
      // path; it is not a reading from a physical sensor.
      const depth = Number((1.5 + Math.random() * 2.0).toFixed(2));
      const pressure = Number((101.325 + depth * 9.81 * 0.997).toFixed(2));
      const acoustic = Math.round(20 + Math.random() * 75);
      const battery = Math.round(90 - Math.random() * 15);
      const rpm = Math.round(700 + Math.random() * 800);

      const res = await ingestTelemetry({
        unit_id: 'sealion-rov-01',
        depth_m: depth,
        pressure_kpa: pressure,
        acoustic_leak_index: acoustic,
        battery_pct: battery,
        thruster_rpm: rpm,
      });

      setTelemetry(res);
      setPulseMessage(
        `Test packet accepted by the API (browser-generated values): depth ${depth} m, acoustic ${acoustic}/100.`,
      );
    } catch (err) {
      setPulseError(true);
      setPulseMessage(
        `Failed to ingest test packet: ${err instanceof Error ? err.message : 'Network error'}`,
      );
    } finally {
      setPulsing(false);
    }
  };

  const modeLabel =
    health?.mode === 'aws-live'
      ? 'AWS live'
      : health?.mode === 'local-demo'
        ? 'Local demo'
        : health?.mode || 'Unknown';

  const lambdaState = serviceState(health?.services?.lambda);
  const s3State = serviceState(health?.services?.s3);
  const inspectionsState = serviceState(health?.services?.dynamodb_inspections);
  const telemetryState = serviceState(health?.services?.dynamodb_telemetry);

  return (
    <div className="space-y-6">
      {/* Telemetry Header */}
      <section className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-700 dark:text-cyan-400" />
              <h1 className="text-xl font-bold text-slate-950 dark:text-slate-50">
                Sensor Telemetry &amp; Cloud Health
              </h1>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Displays the latest packet from the telemetry endpoint. In local demo mode the values
              are simulated; the button below generates a test packet in your browser.
            </p>
          </div>

          <button
            type="button"
            onClick={handleTriggerPulse}
            disabled={pulsing}
            className="inline-flex min-h-[42px] items-center gap-2 px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 shrink-0"
          >
            <Zap className={`h-4 w-4 ${pulsing ? 'animate-bounce' : ''}`} />
            <span>{pulsing ? 'Sending packet...' : 'Send Test Telemetry Packet'}</span>
          </button>
        </div>

        {pulseMessage && (
          <p
            className={`text-xs font-mono p-2.5 rounded-lg border ${
              pulseError
                ? 'text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
                : 'text-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
            }`}
          >
            {pulseMessage}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400">
          <span className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700">
            Packet source: {telemetry?.source ?? 'unknown'}
          </span>
          <span className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700">
            API mode: {modeLabel}
          </span>
          {telemetry?.timestamp && (
            <span>
              Latest packet: {new Date(telemetry.timestamp).toLocaleString('en-IN')}
            </span>
          )}
        </div>

        {/* Live Gauges */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
          {/* Depth */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070B12] space-y-1">
            <span className="text-xs text-slate-500 font-medium">Hydrostatic Depth</span>
            <p className="text-2xl font-extrabold font-mono text-sky-700 dark:text-cyan-300">
              {telemetry ? telemetry.depth_m.toFixed(2) : '—'} m
            </p>
            <span className="text-[10px] text-slate-400 font-mono">Zeroed Datum</span>
          </div>

          {/* Pressure */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070B12] space-y-1">
            <span className="text-xs text-slate-500 font-medium">Water Pressure</span>
            <p className="text-2xl font-extrabold font-mono text-slate-900 dark:text-slate-100">
              {telemetry ? telemetry.pressure_kpa.toFixed(2) : '—'} kPa
            </p>
            <span className="text-[10px] text-slate-400 font-mono">P = P0 + &rho;gh</span>
          </div>

          {/* Acoustic Hiss */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070B12] space-y-1">
            <span className="text-xs text-slate-500 font-medium">Acoustic Leak Hiss</span>
            <p className="text-2xl font-extrabold font-mono text-rose-700 dark:text-rose-400">
              {telemetry ? telemetry.acoustic_leak_index : '—'} / 100
            </p>
            <span className="text-[10px] text-slate-400 font-mono">Piezo Hydrophone</span>
          </div>

          {/* Battery */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070B12] space-y-1">
            <span className="text-xs text-slate-500 font-medium">Tether / Battery</span>
            <p className="text-2xl font-extrabold font-mono text-emerald-700 dark:text-emerald-400">
              {telemetry ? `${telemetry.battery_pct}%` : '—'}
            </p>
            <span className="text-[10px] text-slate-400 font-mono">14.8V 4S LiPo</span>
          </div>

          {/* Thruster RPM */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070B12] space-y-1">
            <span className="text-xs text-slate-500 font-medium">Thruster Load</span>
            <p className="text-2xl font-extrabold font-mono text-slate-900 dark:text-slate-100">
              {telemetry ? telemetry.thruster_rpm : '—'} RPM
            </p>
            <span className="text-[10px] text-slate-400 font-mono">3-Axis Array</span>
          </div>
        </div>
      </section>

      {/* Cloud Architecture Status */}
      <section className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1623] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-950 dark:text-slate-50 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-sky-700 dark:text-cyan-400" />
            <span>Cloud Pipeline Health</span>
          </h2>
          <span className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-400">
            {loading
              ? 'Checking health endpoint...'
              : `Mode: ${modeLabel} · Region: ${health?.region || 'unknown'} · ${
                  latencyMs !== null ? `${latencyMs}ms` : '—'
                }`}
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-rose-400 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/60 p-3 text-xs text-rose-950 dark:text-rose-200"
          >
            Health endpoint unavailable: {error}. Service status is unknown.
          </div>
        )}

        {!health && !error && !loading && (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            No health response received. Service status is unknown.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-lg bg-white dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900 dark:text-slate-100">AWS Lambda</span>
              <span className={`inline-block h-2 w-2 rounded-full ${serviceDotClass(lambdaState)}`} />
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              {health?.services?.lambda ?? 'not reported'}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-white dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900 dark:text-slate-100">Amazon S3</span>
              <span className={`inline-block h-2 w-2 rounded-full ${serviceDotClass(s3State)}`} />
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              {health?.services?.s3 ?? 'not reported'}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-white dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900 dark:text-slate-100">DynamoDB — inspections</span>
              <span className={`inline-block h-2 w-2 rounded-full ${serviceDotClass(inspectionsState)}`} />
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              {health?.services?.dynamodb_inspections ?? 'not reported'}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-white dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900 dark:text-slate-100">DynamoDB — telemetry</span>
              <span className={`inline-block h-2 w-2 rounded-full ${serviceDotClass(telemetryState)}`} />
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              {health?.services?.dynamodb_telemetry ?? 'not reported'}
            </p>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          A gray dot means the endpoint did not report that service. An amber dot means the reported
          value is simulated. This panel never assumes a healthy service.
        </p>
      </section>
    </div>
  );
}
