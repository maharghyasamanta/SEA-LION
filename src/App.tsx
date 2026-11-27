/**
 * S.E.A.-L.I.O.N. — Submerged Engineering & Aquatic Leak-Inspection Network.
 *
 * Production Full-Stack Application for Techfest IIT Bombay — AWS Hackathon.
 * Protects Indian Municipal Water Reservoirs and Monsoon-Stressed Bridge Piers.
 */

import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Box,
  CheckCircle2,
  ChevronRight,
  Database,
  Droplets,
  ExternalLink,
  Flame,
  GitCompare,
  HardDrive,
  History as HistoryIcon,
  Moon,
  PlaySquare,
  RefreshCw,
  ScanSearch,
  Shield,
  ShieldAlert,
  Sparkles,
  Sun,
  Zap,
} from 'lucide-react';
import { DEFAULT_THRESHOLDS, SeverityThresholds } from './lib/crackAnalysis';
import {
  HealthResponse,
  InspectionRecord,
  checkHealth,
} from './lib/api';
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary';
import { ShowcaseTab } from './components/ShowcaseTab';
import {
  CompareTab,
  HistoryTab,
  InspectTab,
  TelemetryTab,
} from './components/WorkspaceTabs';

const Model3DTab = lazy(() => import('./components/Model3DTab'));

export type TabId = 'inspect' | 'history' | 'compare' | 'telemetry' | 'model-3d' | 'showcase';

interface NavTabItem {
  id: TabId;
  label: string;
  shortLabel: string;
  badge?: string;
  Icon: typeof ScanSearch;
}

const NAV_TABS: readonly NavTabItem[] = [
  { id: 'inspect', label: 'Civic Inspection', shortLabel: 'Inspect', badge: 'CV', Icon: ScanSearch },
  { id: 'history', label: 'Audit History', shortLabel: 'History', Icon: HistoryIcon },
  { id: 'compare', label: 'Temporal Compare', shortLabel: 'Compare', Icon: GitCompare },
  { id: 'telemetry', label: 'Sensor Telemetry', shortLabel: 'Telemetry', Icon: Activity },
  { id: 'model-3d', label: 'Autonomous ROV', shortLabel: '3D ROV', Icon: Box },
  { id: 'showcase', label: 'Dam Simulation', shortLabel: 'Sim', Icon: PlaySquare },
];

function getInitialTab(): TabId {
  if (typeof window === 'undefined') return 'inspect';
  const param = new URLSearchParams(window.location.search).get('tab');
  if (param && NAV_TABS.some((t) => t.id === param)) {
    return param as TabId;
  }
  return 'inspect';
}

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab);
  const [thresholds, setThresholds] = useState<SeverityThresholds>(DEFAULT_THRESHOLDS);
  const [chunkRetryKey, setChunkRetryKey] = useState<number>(0);

  // Selected compare IDs passed from history or inspection
  const [compareBaselineId, setCompareBaselineId] = useState<string>('');
  const [compareCurrentId, setCompareCurrentId] = useState<string>('');

  // Live AWS Pipeline Health
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Sync dark mode class with DOM root
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const runHealthCheck = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    const start = performance.now();
    try {
      const data = await checkHealth();
      const elapsed = Math.round(performance.now() - start);
      setHealth(data);
      setLatencyMs(elapsed);
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : 'Failed to reach AWS API');
      setHealth(null);
      setLatencyMs(null);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void runHealthCheck();
  }, [runHealthCheck]);

  const handleSelectForCompare = (record: InspectionRecord) => {
    setCompareCurrentId(record.inspection_id);
    setActiveTab('compare');
  };

  const healthIsLive = health?.ok === true && health.mode === 'aws-live';
  const healthIsDemo = health?.ok === true && health.mode === 'local-demo';
  const healthLabel = healthLoading
    ? 'Checking...'
    : healthError
      ? 'API offline'
      : healthIsLive
        ? `AWS live (${health?.region ?? 'region'})`
        : healthIsDemo
          ? 'Local demo'
          : health
            ? 'API ready'
            : 'API unknown';
  const healthPillClass = healthIsLive
    ? 'border-emerald-400 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
    : healthIsDemo || healthError
      ? 'border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
      : 'border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300';
  const healthDotClass = healthIsLive
    ? 'bg-emerald-500'
    : healthIsDemo || healthError
      ? 'bg-amber-500'
      : 'bg-slate-400';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950 dark:bg-[#070B12] dark:text-slate-50 transition-colors duration-150">
      {/* Top Header & Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-300 dark:border-slate-800 bg-white/95 dark:bg-[#070B12]/95 backdrop-blur-md print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('inspect')}
              className="flex items-center gap-2.5 text-left cursor-pointer group"
            >
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-sky-600 to-blue-800 dark:from-cyan-400 dark:to-blue-600 flex items-center justify-center text-white dark:text-slate-950 font-black text-lg shadow-sm">
                S
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-extrabold tracking-tight text-slate-950 dark:text-slate-50 group-hover:text-sky-700 dark:group-hover:text-cyan-400 transition-colors">
                    S.E.A.-L.I.O.N.
                  </span>
                  <span className="rounded bg-sky-100 dark:bg-cyan-950 text-[10px] font-mono font-bold text-sky-800 dark:text-cyan-300 px-1.5 py-0.2">
                    AWS STAGE 2
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:block">
                  Submerged Engineering &amp; Aquatic Leak-Inspection Network
                </p>
              </div>
            </button>
          </div>

          {/* Desktop Tab Navigation */}
          <nav aria-label="Primary" className="hidden lg:flex items-center gap-1">
            {NAV_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const { Icon } = tab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-sky-700 text-white dark:bg-cyan-500 dark:text-slate-950 shadow-sm'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="rounded bg-rose-500 text-white text-[9px] font-bold px-1 py-0.2 animate-pulse">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Header Action Controls & AWS Status Pill */}
          <div className="flex items-center gap-2.5">
            {/* API health pill */}
            <button
              type="button"
              onClick={() => void runHealthCheck()}
              disabled={healthLoading}
              title="Re-check the configured API. Green means the API reports AWS live mode; amber means local demo or an error."
              className={`inline-flex min-h-[38px] items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-all cursor-pointer ${healthPillClass}`}
            >
              <span className={`h-2 w-2 rounded-full ${healthDotClass}`} />
              <span className="hidden sm:inline">{healthLabel}</span>
              {latencyMs !== null && (
                <span className="hidden md:inline text-[11px] text-slate-500 dark:text-slate-400">
                  {latencyMs}ms
                </span>
              )}
              <RefreshCw className={`h-3 w-3 ${healthLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* Dark/Daylight Toggle */}
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              aria-label="Toggle visual theme"
              className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1623] text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-sky-700" />}
            </button>
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar */}
        <nav
          aria-label="Mobile Navigation"
          className="grid lg:hidden grid-cols-6 gap-1 border-t border-slate-200 dark:border-slate-800 px-2 py-1.5"
        >
          {NAV_TABS.map(({ id, shortLabel, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`min-h-[40px] flex flex-col items-center justify-center gap-0.5 px-1 py-1 rounded text-[10px] font-semibold cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-sky-700 text-white dark:bg-cyan-500 dark:text-slate-950 font-bold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{shortLabel}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Workspace Body */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* Suggested demo walkthrough */}
        <section
          aria-label="Suggested demo walkthrough"
          className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#0D1524] p-3.5 sm:p-4 shadow-sm"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold">
              <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
              <span>Suggested demo walkthrough:</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('inspect')}
                className={`px-3 py-1.5 rounded-lg border text-left cursor-pointer transition-all ${
                  activeTab === 'inspect'
                    ? 'border-sky-600 dark:border-cyan-400 bg-sky-50 dark:bg-cyan-950/40 font-bold text-sky-950 dark:text-cyan-200'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="block text-[10px] text-slate-400">Step 1</span>
                <span>Measure a crack</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 rounded-lg border text-left cursor-pointer transition-all ${
                  activeTab === 'history'
                    ? 'border-sky-600 dark:border-cyan-400 bg-sky-50 dark:bg-cyan-950/40 font-bold text-sky-950 dark:text-cyan-200'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="block text-[10px] text-slate-400">Step 2</span>
                <span>Inspection log</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('compare')}
                className={`px-3 py-1.5 rounded-lg border text-left cursor-pointer transition-all ${
                  activeTab === 'compare'
                    ? 'border-sky-600 dark:border-cyan-400 bg-sky-50 dark:bg-cyan-950/40 font-bold text-sky-950 dark:text-cyan-200'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="block text-[10px] text-slate-400">Step 3</span>
                <span>Same-asset change</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('telemetry')}
                className={`px-3 py-1.5 rounded-lg border text-left cursor-pointer transition-all ${
                  activeTab === 'telemetry'
                    ? 'border-sky-600 dark:border-cyan-400 bg-sky-50 dark:bg-cyan-950/40 font-bold text-sky-950 dark:text-cyan-200'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="block text-[10px] text-slate-400">Step 4</span>
                <span>Telemetry &amp; health</span>
              </button>
            </div>
          </div>
        </section>

        {/* Tab Content Display */}
        {activeTab === 'inspect' && (
          <InspectTab
            thresholds={thresholds}
            onThresholdsChange={setThresholds}
            onSelectForCompare={handleSelectForCompare}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab
            thresholds={thresholds}
            onSelectForCompare={handleSelectForCompare}
          />
        )}

        {activeTab === 'compare' && (
          <CompareTab
            initialBaselineId={compareBaselineId}
            initialCurrentId={compareCurrentId}
          />
        )}

        {activeTab === 'telemetry' && (
          <TelemetryTab
            health={health}
            latencyMs={latencyMs}
            loading={healthLoading}
            error={healthError}
          />
        )}

        {activeTab === 'model-3d' && (
          <ChunkErrorBoundary
            key={chunkRetryKey}
            onRetry={() => setChunkRetryKey((k) => k + 1)}
          >
            <Suspense
              fallback={
                <div
                  role="status"
                  className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#0F1623] p-12 text-center space-y-2"
                >
                  <p className="text-base font-semibold text-slate-950 dark:text-slate-50">
                    Loading Interactive 3D ROV Hardware Model...
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Procedural Three.js underwater inspection geometry.
                  </p>
                </div>
              }
            >
              <Model3DTab darkMode={darkMode} />
            </Suspense>
          </ChunkErrorBoundary>
        )}

        {activeTab === 'showcase' && (
          <ShowcaseTab
            thresholds={thresholds}
            onRealAnalysisComplete={() => {}}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-300 dark:border-slate-800 bg-white dark:bg-[#070B12] py-6 text-xs text-slate-500 dark:text-slate-400 text-center print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            &copy; 2026 S.E.A.-L.I.O.N. · Submerged Engineering &amp; Aquatic Leak-Inspection Network · Techfest IIT Bombay
          </p>
          <p className="font-mono">
            AWS Serverless Free Tier Architecture: S3 &middot; CloudFront &middot; API Gateway &middot; Lambda &middot; DynamoDB
          </p>
        </div>
      </footer>
    </div>
  );
}
