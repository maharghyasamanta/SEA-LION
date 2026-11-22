import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Info,
  OctagonAlert,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Volume2,
} from 'lucide-react';
import {
  DEMO_DAM_CRACKS,
  DamCrack,
  PilotInputVector,
  ROV_BOUNDS,
  RovState,
  SeverityThresholds,
  clampRovPosition,
  computeAcousticScore,
  computeScaleMmPerPx,
  computeSimulatedDotDistancePx,
  findStraddledCrack,
} from '../lib/crackAnalysis';
import { GUIDED_DEMO_DURATION_SEC, evaluateGuidedDemo } from '../lib/guidedDemo';
import { InspectablePartId, buildPartInspectionDetails } from '../lib/partInspector';
import { RealInspectionResult } from '../lib/realApi';
import { CameraInsetCard } from './CameraInsetCard';
import { DamSceneSvg } from './DamSceneSvg';
import { PartInspectorPanel } from './PartInspectorPanel';

interface ShowcaseTabProps {
  thresholds: SeverityThresholds;
  apiBase: string;
  onRealAnalysisComplete: (result: RealInspectionResult) => void;
}

const INITIAL_ROV: RovState = { xM: 0.42, depthM: 0.14 };

function formatTimer(seconds: number): string {
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ShowcaseTab({ thresholds, apiBase, onRealAnalysisComplete }: ShowcaseTabProps) {
  const [rov, setRov] = useState<RovState>(INITIAL_ROV);
  const [isMoving, setIsMoving] = useState(false);
  const [pilotVector, setPilotVector] = useState<PilotInputVector>({ vx: 0, vy: 0 });

  // Part Inspector hover & pinned selection
  const [pinnedPartId, setPinnedPartId] = useState<InspectablePartId | null>(null);
  const [hoveredPartId, setHoveredPartId] = useState<InspectablePartId | null>(null);

  // Guided demo state
  const [demoState, setDemoState] = useState<'idle' | 'playing' | 'paused' | 'completed'>('idle');
  const [demoElapsedSec, setDemoElapsedSec] = useState(0);

  // Respect prefers-reduced-motion
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Held pilot direction (from keyboard or pointer hold)
  const heldDirectionRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const moveTimeoutRef = useRef<number | null>(null);
  const prevDemoRovRef = useRef<RovState>(INITIAL_ROV);

  const nudgeRov = useCallback((dx: number, dy: number) => {
    setDemoState((prev) => (prev === 'playing' ? 'paused' : prev));
    setRov((prev) => clampRovPosition({ xM: prev.xM + dx, depthM: prev.depthM + dy }));
    setIsMoving(true);
    setPilotVector({
      vx: dx === 0 ? 0 : dx > 0 ? 1 : -1,
      vy: dy === 0 ? 0 : dy > 0 ? 1 : -1,
    });
    if (moveTimeoutRef.current !== null) {
      window.clearTimeout(moveTimeoutRef.current);
    }
    moveTimeoutRef.current = window.setTimeout(() => {
      setIsMoving(false);
      setPilotVector({ vx: 0, vy: 0 });
    }, 220);
  }, []);

  // Esc key closes pinned part inspector; Arrow / WASD keys pilot ROV
  useEffect(() => {
    const pressedKeys = new Set<string>();

    const updateHeldVector = () => {
      let dx = 0;
      let dy = 0;
      if (pressedKeys.has('ArrowLeft') || pressedKeys.has('a') || pressedKeys.has('A')) dx -= 1;
      if (pressedKeys.has('ArrowRight') || pressedKeys.has('d') || pressedKeys.has('D')) dx += 1;
      if (pressedKeys.has('ArrowUp') || pressedKeys.has('w') || pressedKeys.has('W')) dy -= 1;
      if (pressedKeys.has('ArrowDown') || pressedKeys.has('s') || pressedKeys.has('S')) dy += 1;
      heldDirectionRef.current = { dx, dy };
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinnedPartId(null);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        pressedKeys.add(e.key);
        updateHeldVector();
        const stepX = e.key === 'ArrowLeft' ? -0.03 : e.key === 'ArrowRight' ? 0.03 : 0;
        const stepY = e.key === 'ArrowUp' ? -0.025 : e.key === 'ArrowDown' ? 0.025 : 0;
        if (stepX !== 0 || stepY !== 0) {
          nudgeRov(stepX, stepY);
        }
      } else if (['w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        pressedKeys.add(e.key);
        updateHeldVector();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeys.delete(e.key);
      updateHeldVector();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [nudgeRov]);

  // Continuous hold piloting loop (~30fps)
  useEffect(() => {
    const timerId = window.setInterval(() => {
      const { dx, dy } = heldDirectionRef.current;
      if (dx !== 0 || dy !== 0) {
        setDemoState((prev) => (prev === 'playing' ? 'paused' : prev));
        setRov((prev) =>
          clampRovPosition({ xM: prev.xM + dx * 0.018, depthM: prev.depthM + dy * 0.015 }),
        );
        setIsMoving(true);
        setPilotVector({ vx: dx, vy: dy });
      }
    }, 33);
    return () => window.clearInterval(timerId);
  }, []);

  // 90-second Guided Demo playback loop
  useEffect(() => {
    if (demoState !== 'playing') return;

    let last = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      setDemoElapsedSec((prev) => {
        const next = Math.min(GUIDED_DEMO_DURATION_SEC, prev + dt);
        const frame = evaluateGuidedDemo(next);
        const dx = frame.rov.xM - prevDemoRovRef.current.xM;
        const dy = frame.rov.depthM - prevDemoRovRef.current.depthM;
        prevDemoRovRef.current = frame.rov;
        setRov(frame.rov);
        setIsMoving(!frame.completed);
        setPilotVector(
          frame.completed
            ? { vx: 0, vy: 0 }
            : {
                vx: Math.abs(dx) > 0.0005 ? (dx > 0 ? 0.7 : -0.7) : 0,
                vy: Math.abs(dy) > 0.0005 ? (dy > 0 ? 0.8 : -0.8) : 0,
              },
        );
        if (frame.completed) {
          setDemoState('completed');
        }
        return next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [demoState]);

  const demoFrame = demoState !== 'idle' ? evaluateGuidedDemo(demoElapsedSec) : null;
  const straddledCrack = findStraddledCrack(rov, DEMO_DAM_CRACKS);
  const acoustic = computeAcousticScore(rov, DEMO_DAM_CRACKS);
  const standoffM = Math.max(0.05, ROV_BOUNDS.wallFaceXM - rov.xM);
  const dotDistancePx = computeSimulatedDotDistancePx(rov.xM);
  const currentScaleMmPerPx = computeScaleMmPerPx(dotDistancePx);

  const partCtx = {
    rov,
    cracks: DEMO_DAM_CRACKS,
    thresholds,
    pilotVector,
    isMoving,
    straddledCrack,
  };
  const pinnedDetails = pinnedPartId ? buildPartInspectionDetails(pinnedPartId, partCtx) : null;
  const hoveredDetails = hoveredPartId ? buildPartInspectionDetails(hoveredPartId, partCtx) : null;

  const handleStartGuidedDemo = () => {
    if (demoState === 'completed') {
      setDemoElapsedSec(0);
    }
    setDemoState('playing');
  };

  const handlePauseResume = () => {
    setDemoState((prev) => (prev === 'playing' ? 'paused' : 'playing'));
  };

  const handleRestartDemo = () => {
    setDemoElapsedSec(0);
    const frame = evaluateGuidedDemo(0);
    prevDemoRovRef.current = frame.rov;
    setRov(frame.rov);
    setDemoState('playing');
  };

  const handleSnapToCrack = (crack: DamCrack) => {
    setDemoState((prev) => (prev === 'playing' ? 'paused' : prev));
    setRov(clampRovPosition({ xM: 0.78, depthM: crack.depthM }));
  };

  const handleResetRov = () => {
    setDemoState('idle');
    setDemoElapsedSec(0);
    setRov(INITIAL_ROV);
    setPilotVector({ vx: 0, vy: 0 });
    setIsMoving(false);
  };

  const bindHoldButton = (dx: number, dy: number) => ({
    onPointerDown: () => {
      heldDirectionRef.current = { dx, dy };
      nudgeRov(dx * 0.03, dy * 0.025);
    },
    onPointerUp: () => {
      heldDirectionRef.current = { dx: 0, dy: 0 };
      setIsMoving(false);
      setPilotVector({ vx: 0, vy: 0 });
    },
    onPointerLeave: () => {
      heldDirectionRef.current = { dx: 0, dy: 0 };
      setIsMoving(false);
      setPilotVector({ vx: 0, vy: 0 });
    },
    onPointerCancel: () => {
      heldDirectionRef.current = { dx: 0, dy: 0 };
      setIsMoving(false);
      setPilotVector({ vx: 0, vy: 0 });
    },
  });

  return (
    <div className="space-y-6" onClick={() => setPinnedPartId(null)}>
      {/* Guided Demo Control & Caption Strip */}
      <section
        aria-label="Guided Demo Controls"
        className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-4 sm:p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                Demo Dam Inspection Simulation
              </h1>
              <span className="font-mono text-xs font-semibold text-amber-800 dark:text-amber-300">
                · SIMULATED
              </span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Pilot Sea Lion with arrow keys or touch buttons, or hover/tap any sensor, thruster, tether, shore unit, or crack to inspect it.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {demoState === 'idle' || demoState === 'completed' ? (
              <button
                type="button"
                onClick={handleStartGuidedDemo}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Play className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{demoState === 'completed' ? 'Replay Guided Demo' : 'Guided Demo (90s)'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePauseResume}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {demoState === 'playing' ? (
                  <>
                    <Pause className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Pause Demo</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Resume Demo</span>
                  </>
                )}
              </button>
            )}

            {demoState !== 'idle' && (
              <button
                type="button"
                onClick={handleRestartDemo}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] px-4 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Restart</span>
              </button>
            )}
          </div>
        </div>

        {/* Guided Demo Timeline & Projector-Readable Caption */}
        {demoFrame && (
          <div className="space-y-2.5 border-t border-slate-300 dark:border-slate-800 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
              <span className="font-mono font-semibold text-sky-800 dark:text-cyan-300">
                {demoFrame.phase}
              </span>
              <span
                className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200"
                data-testid="guided-demo-timer"
              >
                {formatTimer(demoFrame.elapsedSec)} / {formatTimer(GUIDED_DEMO_DURATION_SEC)}
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-300 dark:bg-slate-800">
              <div
                className="h-full bg-sky-700 dark:bg-cyan-400 motion-reduce:transition-none transition-all duration-150"
                style={{ width: `${demoFrame.progressPct}%` }}
              />
            </div>

            <p
              className="rounded-lg bg-white dark:bg-[#070B12] border border-slate-300 dark:border-slate-800 px-3.5 py-2.5 text-sm sm:text-base font-medium text-slate-950 dark:text-slate-100"
              data-testid="guided-demo-caption"
            >
              {demoFrame.caption}
            </p>
          </div>
        )}
      </section>

      {/* Main Two-Zone Simulation Split */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Left Top Zone: Interactive Dam Cross-Section + Interactive Hint */}
        <div className="lg:col-span-8 lg:row-start-1 space-y-3">
          <DamSceneSvg
            rov={rov}
            cracks={DEMO_DAM_CRACKS}
            straddledCrack={straddledCrack}
            acousticScore={acoustic.score}
            thresholds={thresholds}
            isMoving={isMoving}
            prefersReducedMotion={prefersReducedMotion}
            pinnedPartId={pinnedPartId}
            hoveredPartId={hoveredPartId}
            hoveredDetails={hoveredDetails}
            onSelectPart={setPinnedPartId}
            onHoverPart={setHoveredPartId}
          />

          {/* Subtle interactive instruction line */}
          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300 px-1">
            <Info className="h-4 w-4 text-sky-700 dark:text-cyan-400 shrink-0" aria-hidden="true" />
            <span>
              Interactive parts: tap or press Enter on Camera, 50 mm Lasers, Piezo Hydrophone, Pressure Sensor, 3 Thrusters, Tether, Shore Unit, or Cracks C-01–C-04 to pin live SIMULATED telemetry.
            </span>
          </div>
        </div>

        {/* Right Zone (spans full height on desktop; appears right below SVG on mobile): Pinned Part Inspector + Pilot D-Pad + Acoustic Leak Bar + Camera Inset */}
        <div
          className="lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:row-span-2 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          {pinnedDetails && (
            <PartInspectorPanel
              details={pinnedDetails}
              onClose={() => setPinnedPartId(null)}
            />
          )}

          {/* Telemetry & Pilot Controls Card */}
          <section
            aria-label="ROV Pilot Controls and Simulated Telemetry"
            className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
                ROV Pilot &amp; Depth
              </h2>
              <button
                type="button"
                onClick={handleResetRov}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Reset ROV</span>
              </button>
            </div>

            <dl className="grid grid-cols-3 gap-2 border-y border-slate-300 dark:border-slate-800 py-3">
              <div>
                <dt className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Depth (SIM)
                </dt>
                <dd
                  className="mt-0.5 font-mono tabular-nums text-lg font-bold text-slate-950 dark:text-cyan-300"
                  data-testid="rov-depth-readout"
                >
                  {rov.depthM.toFixed(2)} m
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Standoff (SIM)
                </dt>
                <dd className="mt-0.5 font-mono tabular-nums text-lg font-bold text-slate-950 dark:text-slate-100">
                  {standoffM.toFixed(2)} m
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Scale (SIM)
                </dt>
                <dd className="mt-0.5 font-mono tabular-nums text-sm font-bold text-slate-950 dark:text-slate-100">
                  {currentScaleMmPerPx.toFixed(3)}
                </dd>
              </div>
            </dl>

            {/* On-Screen 44px+ D-Pad */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                aria-label="Pilot ROV Up"
                {...bindHoldButton(0, -1)}
                onClick={() => nudgeRov(0, -0.04)}
                className="inline-flex min-h-[44px] min-w-[68px] items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] text-slate-900 dark:text-slate-100 hover:border-sky-600 dark:hover:border-cyan-400 active:bg-sky-100 dark:active:bg-cyan-950 transition-colors cursor-pointer"
              >
                <ArrowUp className="h-5 w-5" aria-hidden="true" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Pilot ROV Left"
                  {...bindHoldButton(-1, 0)}
                  onClick={() => nudgeRov(-0.05, 0)}
                  className="inline-flex min-h-[44px] min-w-[68px] items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] text-slate-900 dark:text-slate-100 hover:border-sky-600 dark:hover:border-cyan-400 active:bg-sky-100 dark:active:bg-cyan-950 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Pilot ROV Down"
                  {...bindHoldButton(0, 1)}
                  onClick={() => nudgeRov(0, 0.04)}
                  className="inline-flex min-h-[44px] min-w-[68px] items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] text-slate-900 dark:text-slate-100 hover:border-sky-600 dark:hover:border-cyan-400 active:bg-sky-100 dark:active:bg-cyan-950 transition-colors cursor-pointer"
                >
                  <ArrowDown className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Pilot ROV Right"
                  {...bindHoldButton(1, 0)}
                  onClick={() => nudgeRov(0.05, 0)}
                  className="inline-flex min-h-[44px] min-w-[68px] items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070B12] text-slate-900 dark:text-slate-100 hover:border-sky-600 dark:hover:border-cyan-400 active:bg-sky-100 dark:active:bg-cyan-950 transition-colors cursor-pointer"
                >
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400">
                Use arrow keys or hold buttons to pilot
              </p>
            </div>
          </section>

          {/* Acoustic Hiss / Leak Sensor Bar */}
          <section
            aria-label="Simulated Acoustic Leak Sensor"
            className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-5 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Volume2 className="h-5 w-5 text-sky-700 dark:text-cyan-400" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
                  Acoustic Hiss (SIMULATED)
                </h2>
              </div>
              <span
                className="font-mono tabular-nums text-base font-bold text-slate-950 dark:text-slate-50"
                data-testid="acoustic-score-value"
              >
                {acoustic.score}%
              </span>
            </div>

            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-300 dark:bg-slate-800">
              <div
                className={`h-full motion-reduce:transition-none transition-all duration-200 ${
                  acoustic.status === 'Active Leak Detected'
                    ? 'bg-rose-600 dark:bg-rose-500'
                    : acoustic.status === 'Elevated Hiss'
                      ? 'bg-amber-600 dark:bg-amber-400'
                      : 'bg-sky-700 dark:bg-cyan-400'
                }`}
                style={{ width: `${acoustic.score}%` }}
              />
            </div>

            <div className="flex items-center justify-between gap-2 text-xs font-semibold">
              {acoustic.status === 'Active Leak Detected' ? (
                <span className="inline-flex items-center gap-1.5 text-rose-800 dark:text-rose-300">
                  <OctagonAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Active Leak Detected near {acoustic.nearestLeakId}</span>
                </span>
              ) : acoustic.status === 'Elevated Hiss' ? (
                <span className="inline-flex items-center gap-1.5 text-amber-900 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Elevated Hiss · Approaching Leak</span>
                </span>
              ) : (
                <span className="text-slate-700 dark:text-slate-300">Ambient Background Flow</span>
              )}
            </div>
          </section>

          {/* Zoomed Camera Inset & Real API Analysis Trigger */}
          <CameraInsetCard
            straddledCrack={straddledCrack}
            rovXM={rov.xM}
            thresholds={thresholds}
            apiBase={apiBase}
            showRecommendation={demoFrame?.showRecommendation ?? false}
            showReinspectionDelta={demoFrame?.showReinspectionDelta ?? false}
            cracks={DEMO_DAM_CRACKS}
            onSnapToCrack={handleSnapToCrack}
            onRealAnalysisComplete={onRealAnalysisComplete}
          />
        </div>

        {/* Left Bottom Zone: Engineering Scope & Honesty Limits */}
        <section
          aria-label="Simulation Honesty and Engineering Limits"
          className="lg:col-span-8 lg:row-start-2 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-[#0F1623] p-5 space-y-2.5"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert
              className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0"
              aria-hidden="true"
            />
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
              Simulation Scope &amp; Screening Limits
            </h2>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 dark:text-slate-300">
            <li>
              All depth, pressure, thruster, acoustic, and crack width readouts in Showcase are{' '}
              <strong>SIMULATED</strong> for a fictional dam and are never saved to History or Compare.
            </li>
            <li>
              Optical calibration (<span className="font-mono">mm/px = 50 / dot_distance_px</span>)
              assumes the ROV camera is roughly perpendicular to the concrete wall.
            </li>
            <li>
              Designed for shallow-water screening (~1 m depth) and demonstration only — makes no
              claims about real-world measurement accuracy and never replaces certified structural or
              ultrasonic NDT inspection.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
