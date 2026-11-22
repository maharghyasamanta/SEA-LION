import { RovState } from './crackAnalysis';

export const GUIDED_DEMO_DURATION_SEC = 90;

export interface DemoKeyframe {
  timeSec: number;
  rov: RovState;
  phase: string;
  caption: string;
  highlightCrackId: string | null;
  showRecommendation: boolean;
  showReinspectionDelta: boolean;
}

export const GUIDED_DEMO_KEYFRAMES: readonly DemoKeyframe[] = [
  {
    timeSec: 0,
    rov: { xM: 0.34, depthM: 0.05 },
    phase: '01 · Surface Calibration',
    caption: 'ROV positioned at 0.05 m surface datum. Pressure sensor zeroed; twin 50 mm lasers active.',
    highlightCrackId: null,
    showRecommendation: false,
    showReinspectionDelta: false,
  },
  {
    timeSec: 7,
    rov: { xM: 0.66, depthM: 0.12 },
    phase: '01 · Dive & Approach',
    caption: 'Descending along Demo Dam concrete face toward upper screening zone.',
    highlightCrackId: null,
    showRecommendation: false,
    showReinspectionDelta: false,
  },
  {
    timeSec: 12,
    rov: { xM: 0.78, depthM: 0.18 },
    phase: '02 · Crack C-01 (Minor)',
    caption: 'Laser dots straddle C-01 at 0.18 m depth. Scale = 50 / dot_distance_px → 0.20 mm (Minor).',
    highlightCrackId: 'C-01',
    showRecommendation: false,
    showReinspectionDelta: false,
  },
  {
    timeSec: 20,
    rov: { xM: 0.76, depthM: 0.18 },
    phase: '02 · Crack C-01 Logged',
    caption: 'C-01 (0.20 mm) is within Minor threshold (<= 0.3 mm). Continuing descent.',
    highlightCrackId: 'C-01',
    showRecommendation: false,
    showReinspectionDelta: false,
  },
  {
    timeSec: 26,
    rov: { xM: 0.78, depthM: 0.42 },
    phase: '03 · Crack C-02 (Moderate)',
    caption: 'At 0.42 m depth, laser dots bracket C-02. Measured 0.60 mm → Moderate (0.3–1.0 mm).',
    highlightCrackId: 'C-02',
    showRecommendation: false,
    showReinspectionDelta: false,
  },
  {
    timeSec: 34,
    rov: { xM: 0.74, depthM: 0.42 },
    phase: '03 · Crack C-02 Logged',
    caption: 'C-02 recorded for routine monitoring. Descending toward lower lift joint.',
    highlightCrackId: 'C-02',
    showRecommendation: false,
    showReinspectionDelta: false,
  },
  {
    timeSec: 41,
    rov: { xM: 0.79, depthM: 0.64 },
    phase: '04 · Acoustic Hiss Rising',
    caption: 'Hydrophone detects elevated acoustic hiss near 0.65 m depth—approaching seepage zone.',
    highlightCrackId: null,
    showRecommendation: false,
    showReinspectionDelta: false,
  },
  {
    timeSec: 45,
    rov: { xM: 0.81, depthM: 0.68 },
    phase: '04 · Critical Leak Flagged (C-03)',
    caption: 'C-03 at 0.68 m measures 1.20 mm (> 1.0 mm Critical) with peak acoustic leak signal!',
    highlightCrackId: 'C-03',
    showRecommendation: false,
    showReinspectionDelta: false,
  },
  {
    timeSec: 55,
    rov: { xM: 0.8, depthM: 0.68 },
    phase: '04 · Critical Leak Flagged (C-03)',
    caption: 'Critical flag attached to C-03 with surface-zeroed depth (0.68 m) and acoustic score.',
    highlightCrackId: 'C-03',
    showRecommendation: false,
    showReinspectionDelta: false,
  },
  {
    timeSec: 61,
    rov: { xM: 0.8, depthM: 0.86 },
    phase: '05 · Re-Inspection Comparison (C-04)',
    caption: 'At 0.86 m near the silt bed, C-04 measures 1.80 mm — grew +0.4 mm since last inspection (1.40 mm → 1.80 mm).',
    highlightCrackId: 'C-04',
    showRecommendation: false,
    showReinspectionDelta: true,
  },
  {
    timeSec: 71,
    rov: { xM: 0.78, depthM: 0.86 },
    phase: '06 · Screening Recommendation',
    caption: 'Recommendation: Flag C-03 & C-04 Critical for certified diver / ultrasonic NDT inspection and seepage sealing.',
    highlightCrackId: 'C-04',
    showRecommendation: true,
    showReinspectionDelta: true,
  },
  {
    timeSec: 82,
    rov: { xM: 0.56, depthM: 0.45 },
    phase: '07 · Ascent & Summary',
    caption: 'Ascending to surface. Simulation complete — all demo readings are SIMULATED and never stored to History.',
    highlightCrackId: null,
    showRecommendation: true,
    showReinspectionDelta: true,
  },
  {
    timeSec: 90,
    rov: { xM: 0.36, depthM: 0.08 },
    phase: '07 · Complete',
    caption: 'Guided 90-second Demo Dam sweep complete. Pilot manually or press Restart to replay.',
    highlightCrackId: null,
    showRecommendation: true,
    showReinspectionDelta: true,
  },
] as const;

export interface GuidedDemoFrame {
  elapsedSec: number;
  progressPct: number;
  rov: RovState;
  phase: string;
  caption: string;
  highlightCrackId: string | null;
  showRecommendation: boolean;
  showReinspectionDelta: boolean;
  completed: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Pure deterministic evaluator for any timestamp t in [0, 90] seconds.
 */
export function evaluateGuidedDemo(elapsedSec: number): GuidedDemoFrame {
  const clampedSec = Math.min(GUIDED_DEMO_DURATION_SEC, Math.max(0, elapsedSec));
  const frames = GUIDED_DEMO_KEYFRAMES;

  let prev = frames[0];
  let next = frames[frames.length - 1];

  for (let i = 0; i < frames.length - 1; i++) {
    if (clampedSec >= frames[i].timeSec && clampedSec <= frames[i + 1].timeSec) {
      prev = frames[i];
      next = frames[i + 1];
      break;
    }
  }

  const span = next.timeSec - prev.timeSec;
  const rawT = span > 0 ? (clampedSec - prev.timeSec) / span : 1;
  const easedT = smoothstep(rawT);

  const active = rawT >= 0.85 ? next : prev;

  return {
    elapsedSec: clampedSec,
    progressPct: Number(((clampedSec / GUIDED_DEMO_DURATION_SEC) * 100).toFixed(1)),
    rov: {
      xM: Number(lerp(prev.rov.xM, next.rov.xM, easedT).toFixed(3)),
      depthM: Number(lerp(prev.rov.depthM, next.rov.depthM, easedT).toFixed(3)),
    },
    phase: active.phase,
    caption: active.caption,
    highlightCrackId: active.highlightCrackId,
    showRecommendation: active.showRecommendation,
    showReinspectionDelta: active.showReinspectionDelta,
    completed: clampedSec >= GUIDED_DEMO_DURATION_SEC,
  };
}
