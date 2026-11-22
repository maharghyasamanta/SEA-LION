export const LASER_SPACING_MM = 50;

export type SeverityLevel = 'Minor' | 'Moderate' | 'Critical';

export interface SeverityThresholds {
  minorMaxMm: number;
  moderateMaxMm: number;
}

export const DEFAULT_THRESHOLDS: SeverityThresholds = {
  minorMaxMm: 0.3,
  moderateMaxMm: 1.0,
};

export interface CrackMeasurement {
  dotDistancePx: number;
  crackWidthPx: number;
  scaleMmPerPx: number;
  widthMm: number;
  severity: SeverityLevel;
}

export interface DamCrack {
  id: string;
  label: string;
  depthM: number;
  trueWidthMm: number;
  previousWidthMm?: number;
  hasLeak: boolean;
  sampleImagePath: string;
  description: string;
  recommendation: string;
}

export interface RovState {
  /** Horizontal position in normalized meters from left (0.0 = far left, 1.0 = wall face) */
  xM: number;
  /** Depth in meters (0.00 = surface, 1.00 = silt bed) */
  depthM: number;
}

export const DEMO_DAM_CRACKS: readonly DamCrack[] = [
  {
    id: 'C-01',
    label: 'Upper Hairline Fissure',
    depthM: 0.18,
    trueWidthMm: 0.2,
    hasLeak: false,
    sampleImagePath: '/samples/crack-c01-minor.png',
    description: 'Shallow shrinkage hairline near upper waterline.',
    recommendation: 'Log baseline width; re-check during routine seasonal sweep.',
  },
  {
    id: 'C-02',
    label: 'Mid-Wall Diagonal Fracture',
    depthM: 0.42,
    trueWidthMm: 0.6,
    hasLeak: false,
    sampleImagePath: '/samples/crack-c02-moderate.png',
    description: 'Moderate surface fracture along horizontal lift joint.',
    recommendation: 'Monitor on next inspection cycle for aperture expansion.',
  },
  {
    id: 'C-03',
    label: 'Pressurized Seepage Crack',
    depthM: 0.68,
    trueWidthMm: 1.2,
    hasLeak: true,
    sampleImagePath: '/samples/crack-c03-leak.png',
    description: 'Critical-band crack exhibiting active acoustic water seepage.',
    recommendation:
      'Flag Critical: schedule diver visual verification, dye/ultrasonic NDT, and injection sealing review.',
  },
  {
    id: 'C-04',
    label: 'Lower Toe Spall & Growth',
    depthM: 0.86,
    trueWidthMm: 1.8,
    previousWidthMm: 1.4,
    hasLeak: false,
    sampleImagePath: '/samples/crack-c04-critical.png',
    description: 'Wide structural crack near silt toe showing progressive opening.',
    recommendation:
      'Flag Critical (+0.4 mm growth since last inspection): escalate to certified structural engineer for NDT assessment.',
  },
] as const;

export const ROV_BOUNDS = {
  minXM: 0.14,
  maxXM: 0.88,
  minDepthM: 0.04,
  maxDepthM: 0.96,
  wallFaceXM: 1.0,
} as const;

/**
 * Real Sea Lion calibration formula:
 * mm/px = 50 / dot_distance_px
 */
export function computeScaleMmPerPx(dotDistancePx: number): number {
  if (!Number.isFinite(dotDistancePx) || dotDistancePx <= 0) {
    throw new Error('dotDistancePx must be a positive finite number');
  }
  return LASER_SPACING_MM / dotDistancePx;
}

/**
 * Real Sea Lion crack width formula:
 * width_mm = crack_width_px * scale
 */
export function computeCrackWidthMm(
  crackWidthPx: number,
  dotDistancePx: number,
  thresholds: SeverityThresholds = DEFAULT_THRESHOLDS,
): CrackMeasurement {
  if (!Number.isFinite(crackWidthPx) || crackWidthPx < 0) {
    throw new Error('crackWidthPx must be a non-negative finite number');
  }
  const scaleMmPerPx = computeScaleMmPerPx(dotDistancePx);
  const widthMm = crackWidthPx * scaleMmPerPx;
  const severity = classifySeverity(widthMm, thresholds);
  return {
    dotDistancePx,
    crackWidthPx,
    scaleMmPerPx,
    widthMm,
    severity,
  };
}

/**
 * Severity classification from configurable thresholds:
 * Minor <= 0.3 mm, Moderate 0.3–1.0 mm, Critical > 1.0 mm
 */
export function classifySeverity(
  widthMm: number,
  thresholds: SeverityThresholds = DEFAULT_THRESHOLDS,
): SeverityLevel {
  if (widthMm <= thresholds.minorMaxMm) {
    return 'Minor';
  }
  if (widthMm <= thresholds.moderateMaxMm) {
    return 'Moderate';
  }
  return 'Critical';
}

/**
 * Computes apparent laser dot spacing in pixels from ROV standoff distance to the wall.
 * Closer standoff produces larger pixel separation; width_px scales identically so
 * width_mm = width_px * (50 / dot_distance_px) remains physically coherent.
 */
export function computeSimulatedDotDistancePx(rovXM: number): number {
  const standoffM = Math.max(0.12, ROV_BOUNDS.wallFaceXM - rovXM);
  // At nominal standoff (0.20 m -> rovXM = 0.80), dotDistancePx = 250 px (0.200 mm/px)
  const rawPx = (0.2 / standoffM) * 250;
  return Math.round(Math.min(420, Math.max(85, rawPx)));
}

/**
 * Measures a crack using the ROV's current simulated standoff distance and real formulas.
 */
export function measureCrackFromRov(
  crack: DamCrack,
  rovXM: number,
  thresholds: SeverityThresholds = DEFAULT_THRESHOLDS,
): CrackMeasurement {
  const dotDistancePx = computeSimulatedDotDistancePx(rovXM);
  const scale = computeScaleMmPerPx(dotDistancePx);
  const crackWidthPx = Number((crack.trueWidthMm / scale).toFixed(2));
  return computeCrackWidthMm(crackWidthPx, dotDistancePx, thresholds);
}

/**
 * Determines whether the ROV's twin 50 mm laser dots straddle a crack on the wall.
 * Requires the ROV to be within effective laser/camera standoff (xM >= 0.50)
 * and aligned vertically within tolerance (default +/- 0.055 m).
 */
export function findStraddledCrack(
  rov: RovState,
  cracks: readonly DamCrack[] = DEMO_DAM_CRACKS,
  minInspectXM = 0.5,
  verticalToleranceM = 0.055,
): DamCrack | null {
  if (rov.xM < minInspectXM) {
    return null;
  }
  let best: DamCrack | null = null;
  let bestDist = Infinity;
  for (const crack of cracks) {
    const dy = Math.abs(rov.depthM - crack.depthM);
    if (dy <= verticalToleranceM && dy < bestDist) {
      bestDist = dy;
      best = crack;
    }
  }
  return best;
}

/**
 * Computes acoustic hiss score (0-100) based on Euclidean proximity to a leaking crack.
 */
export function computeAcousticScore(
  rov: RovState,
  cracks: readonly DamCrack[] = DEMO_DAM_CRACKS,
): { score: number; status: 'Ambient' | 'Elevated Hiss' | 'Active Leak Detected'; nearestLeakId: string | null } {
  const leakCracks = cracks.filter((c) => c.hasLeak);
  if (leakCracks.length === 0) {
    return { score: 6, status: 'Ambient', nearestLeakId: null };
  }

  let maxScore = 6;
  let nearestLeakId: string | null = null;

  for (const leak of leakCracks) {
    // ROV nose/hydrophone sits ~0.12 m ahead of ROV center; optimal standoff is xM ~ 0.80
    const dx = Math.max(0, ROV_BOUNDS.wallFaceXM - 0.12 - rov.xM);
    const dy = (leak.depthM - rov.depthM) * 1.4;
    const dist = Math.hypot(dx, dy);
    // Peaks around ~94 near the wall at crack depth; decays smoothly with distance
    const proximityScore = Math.round(6 + 88 * Math.exp(-(dist * dist) / 0.045));
    if (proximityScore > maxScore) {
      maxScore = proximityScore;
      nearestLeakId = leak.id;
    }
  }

  const clamped = Math.min(100, Math.max(0, maxScore));
  let status: 'Ambient' | 'Elevated Hiss' | 'Active Leak Detected' = 'Ambient';
  if (clamped >= 62) {
    status = 'Active Leak Detected';
  } else if (clamped >= 26) {
    status = 'Elevated Hiss';
  }

  return { score: clamped, status, nearestLeakId };
}

export function clampRovPosition(rov: RovState): RovState {
  return {
    xM: Number(Math.min(ROV_BOUNDS.maxXM, Math.max(ROV_BOUNDS.minXM, rov.xM)).toFixed(3)),
    depthM: Number(Math.min(ROV_BOUNDS.maxDepthM, Math.max(ROV_BOUNDS.minDepthM, rov.depthM)).toFixed(3)),
  };
}
