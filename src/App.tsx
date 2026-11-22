/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Moon,
  OctagonAlert,
  RefreshCw,
  ShieldAlert,
  Sun,
} from 'lucide-react';

interface HealthResponse {
  ok: boolean;
  service: string;
  stage: string;
  region: string;
  mode: string;
  timestamp: string;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const IS_LOCAL_MOCK = API_BASE.length === 0;

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
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

  const endpointDisplay = IS_LOCAL_MOCK ? '/api/health (Local Dev Mock)' : `${API_BASE}/health`;

  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#070B12] dark:text-slate-50 transition-colors duration-150">
      {/* Three-Zone Top Navigation Bar */}
      <header className="border-b border-slate-300 dark:border-slate-800 bg-white/95 dark:bg-[#070B12]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-4 sm:px-6">
          <a
            href="#overview"
            className="text-xl font-bold tracking-tight text-slate-950 dark:text-slate-50 whitespace-nowrap shrink-0"
          >
            Sea Lion
          </a>

          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            <a
              href="#overview"
              className="hover:text-sky-700 dark:hover:text-cyan-400 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Overview
            </a>
            <a
              href="#health"
              className="hover:text-sky-700 dark:hover:text-cyan-400 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Health Check
            </a>
            <a
              href="#architecture"
              className="hover:text-sky-700 dark:hover:text-cyan-400 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Architecture
            </a>
            <a
              href="#limits"
              className="hover:text-sky-700 dark:hover:text-cyan-400 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Limits
            </a>
          </nav>

          <button
            type="button"
            onClick={() => void checkHealth()}
            disabled={loading}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Test /health</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 space-y-10">
        {/* Workspace Toolbar */}
        <section
          aria-label="Console environment and display controls"
          className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-300 dark:border-slate-800 pb-6"
        >
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-slate-950 dark:text-slate-50">
              Stage 1 Hello-World Baseline
            </span>
            <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">
              ·
            </span>
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

        {/* Hero / Overview */}
        <section id="overview" className="grid gap-8 lg:grid-cols-12 items-start">
          <div className="lg:col-span-7 space-y-4">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-slate-50 [text-wrap:balance]">
              Underwater Structural Crack Screening & ROV Telemetry
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

          {/* Live Health Check Readout */}
          <div
            id="health"
            className="lg:col-span-5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-6 space-y-5"
          >
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

        {/* Stage 1 Architecture Verification Strip */}
        <section id="architecture" className="space-y-4">
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
                OpenCV, DynamoDB & IoT Core
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Awaiting live Stage 1 confirmation before deploying Stage 2 crack-width analysis.
              </p>
            </div>
          </div>
        </section>

        {/* Engineering Limits */}
        <section
          id="limits"
          className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-6 space-y-3"
        >
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-5 w-5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              Engineering Scope & Screening Limits
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
      </main>
    </div>
  );
}
