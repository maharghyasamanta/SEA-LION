/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Moon, RefreshCw, Sun } from 'lucide-react';
import { DEFAULT_THRESHOLDS, SeverityThresholds } from './lib/crackAnalysis';
import { RealInspectionResult } from './lib/realApi';
import { ShowcaseTab } from './components/ShowcaseTab';
import {
  CompareTab,
  HealthResponse,
  HistoryTab,
  InspectTab,
  TelemetryTab,
} from './components/WorkspaceTabs';

type TabId = 'inspect' | 'history' | 'compare' | 'telemetry' | 'showcase';

const NAV_TABS: readonly { id: TabId; label: string }[] = [
  { id: 'inspect', label: 'Inspect' },
  { id: 'history', label: 'History' },
  { id: 'compare', label: 'Compare' },
  { id: 'telemetry', label: 'Telemetry' },
  { id: 'showcase', label: 'Showcase' },
];

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const IS_LOCAL_MOCK = API_BASE.length === 0;

function getInitialTab(): TabId {
  if (typeof window === 'undefined') return 'showcase';
  const param = new URLSearchParams(window.location.search).get('tab');
  if (param && NAV_TABS.some((t) => t.id === param)) {
    return param as TabId;
  }
  return 'showcase';
}

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab);
  const [thresholds, setThresholds] = useState<SeverityThresholds>(DEFAULT_THRESHOLDS);

  // Strictly real API records only; Showcase simulations are never added here.
  const [realInspections, setRealInspections] = useState<RealInspectionResult[]>([]);

  // Stage 1 /health check state
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    const endpoint = IS_LOCAL_MOCK ? '/api/health' : `${API_BASE}/health`;
    const started = performance.now();
    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      const elapsed = Math.round(performance.now() - started);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${endpoint}`);
      }
      const data: HealthResponse = await response.json();
      setHealth(data);
      setLatencyMs(elapsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach /health endpoint');
      setHealth(null);
      setLatencyMs(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  const handleRealAnalysisComplete = useCallback((result: RealInspectionResult) => {
    if (result.source === 'real-api') {
      setRealInspections((prev) => [result, ...prev]);
    }
  }, []);

  const endpointDisplay = IS_LOCAL_MOCK ? '/api/health (Local Dev Mock)' : `${API_BASE}/health`;

  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#070B12] dark:text-slate-50 transition-colors duration-150">
      {/* Three-Zone Top Navigation Bar */}
      <header className="border-b border-slate-300 dark:border-slate-800 bg-white/95 dark:bg-[#070B12]/95 print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setActiveTab('showcase')}
            className="text-xl font-bold tracking-tight text-slate-950 dark:text-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Sea Lion
          </button>

          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            {NAV_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`min-h-[44px] inline-flex items-center whitespace-nowrap shrink-0 cursor-pointer transition-colors underline-offset-8 ${
                    isActive
                      ? 'text-sky-700 dark:text-cyan-400 font-semibold underline decoration-2'
                      : 'hover:text-sky-700 dark:hover:text-cyan-400 hover:underline'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => {
              void checkHealth();
              setActiveTab('telemetry');
            }}
            disabled={loading}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Test /health</span>
          </button>
        </div>

        {/* Mobile Tab Strip (44px+ touch targets, all 5 visible without clipping) */}
        <nav
          aria-label="Mobile Navigation"
          className="grid md:hidden grid-cols-5 gap-1 border-t border-slate-200 dark:border-slate-800 px-2 py-2"
        >
          {NAV_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`min-h-[44px] px-1.5 py-2 text-xs font-medium rounded-lg text-center whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-sky-700 text-white dark:bg-cyan-500 dark:text-slate-950 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
        {/* Workspace Toolbar */}
        <section
          aria-label="Console environment and display controls"
          className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-300 dark:border-slate-800 pb-4 print:hidden"
        >
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
            {IS_LOCAL_MOCK ? (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border border-amber-400 dark:border-amber-700 px-2.5 py-1 rounded">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>SAMPLE (Local Dev Mock)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-emerald-900 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-400 dark:border-emerald-700 px-2.5 py-1 rounded">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>AWS Live (ap-south-1)</span>
              </span>
            )}
            <span aria-hidden="true" className="hidden sm:inline text-slate-400 dark:text-slate-600">
              ·
            </span>
            <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
              Thresholds: Minor &le; {thresholds.minorMaxMm.toFixed(2)} mm · Moderate &le;{' '}
              {thresholds.moderateMaxMm.toFixed(2)} mm · Critical &gt;{' '}
              {thresholds.moderateMaxMm.toFixed(2)} mm
            </span>
          </div>

          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            aria-pressed={darkMode}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-[#0F1623] px-4 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            {darkMode ? (
              <>
                <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
                <span>Daylight High-Contrast</span>
              </>
            ) : (
              <>
                <Moon className="h-4 w-4 text-sky-700" aria-hidden="true" />
                <span>Deep Ocean Dark</span>
              </>
            )}
          </button>
        </section>

        {/* Active Tab Workspace */}
        {activeTab === 'showcase' && (
          <ShowcaseTab
            thresholds={thresholds}
            apiBase={API_BASE}
            onRealAnalysisComplete={handleRealAnalysisComplete}
          />
        )}

        {activeTab === 'inspect' && (
          <InspectTab
            thresholds={thresholds}
            onThresholdsChange={setThresholds}
            apiBase={API_BASE}
            onRealAnalysisComplete={handleRealAnalysisComplete}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab records={realInspections} thresholds={thresholds} />
        )}

        {activeTab === 'compare' && <CompareTab records={realInspections} />}

        {activeTab === 'telemetry' && (
          <TelemetryTab
            health={health}
            latencyMs={latencyMs}
            loading={loading}
            error={error}
            endpointDisplay={endpointDisplay}
          />
        )}
      </main>
    </div>
  );
}
