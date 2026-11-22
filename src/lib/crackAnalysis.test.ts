import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATMOSPHERIC_PRESSURE_KPA,
  DEFAULT_THRESHOLDS,
  DEMO_DAM_CRACKS,
  classifySeverity,
  computeAcousticScore,
  computeCrackWidthMm,
  computeDepthFromPressureKpa,
  computePressureKpaFromDepth,
  computeScaleMmPerPx,
  computeThrusterPwm,
  findStraddledCrack,
  measureCrackFromRov,
} from './crackAnalysis';
import { evaluateGuidedDemo, GUIDED_DEMO_DURATION_SEC } from './guidedDemo';
import { buildPartInspectionDetails } from './partInspector';

test('computeScaleMmPerPx uses 50 / dot_distance_px', () => {
  assert.equal(computeScaleMmPerPx(250), 0.2);
  assert.equal(computeScaleMmPerPx(100), 0.5);
  assert.throws(() => computeScaleMmPerPx(0));
  assert.throws(() => computeScaleMmPerPx(-10));
});

test('computeCrackWidthMm computes width = px * scale and severity', () => {
  const m1 = computeCrackWidthMm(1, 250);
  assert.equal(m1.scaleMmPerPx, 0.2);
  assert.equal(m1.widthMm, 0.2);
  assert.equal(m1.severity, 'Minor');

  const m2 = computeCrackWidthMm(3, 250);
  assert.equal(Number(m2.widthMm.toFixed(2)), 0.6);
  assert.equal(m2.severity, 'Moderate');

  const m3 = computeCrackWidthMm(6, 250);
  assert.equal(Number(m3.widthMm.toFixed(2)), 1.2);
  assert.equal(m3.severity, 'Critical');
});

test('classifySeverity respects default and custom thresholds', () => {
  assert.equal(classifySeverity(0.3), 'Minor');
  assert.equal(classifySeverity(0.31), 'Moderate');
  assert.equal(classifySeverity(1.0), 'Moderate');
  assert.equal(classifySeverity(1.01), 'Critical');

  const custom = { minorMaxMm: 0.5, moderateMaxMm: 1.5 };
  assert.equal(classifySeverity(0.45, custom), 'Minor');
  assert.equal(classifySeverity(1.2, custom), 'Moderate');
  assert.equal(classifySeverity(1.6, custom), 'Critical');
});

test('DEMO_DAM_CRACKS classify via shared classifySeverity: C-01 Minor, C-02 Moderate, C-03 Critical (leak), C-04 Critical', () => {
  const byId = Object.fromEntries(
    DEMO_DAM_CRACKS.map((crack) => [
      crack.id,
      {
        crack,
        severity: classifySeverity(crack.trueWidthMm, DEFAULT_THRESHOLDS),
        measured: measureCrackFromRov(crack, 0.8, DEFAULT_THRESHOLDS),
      },
    ]),
  );

  assert.equal(byId['C-01'].severity, 'Minor');
  assert.equal(byId['C-01'].measured.severity, 'Minor');

  assert.equal(byId['C-02'].severity, 'Moderate');
  assert.equal(byId['C-02'].measured.severity, 'Moderate');

  assert.equal(byId['C-03'].severity, 'Critical');
  assert.equal(byId['C-03'].measured.severity, 'Critical');
  assert.equal(byId['C-03'].crack.hasLeak, true);

  assert.equal(byId['C-04'].severity, 'Critical');
  assert.equal(byId['C-04'].measured.severity, 'Critical');
});

test('pressure sensor uses depth = (P - P0) / (997 * 9.81)', () => {
  const p0 = ATMOSPHERIC_PRESSURE_KPA;
  const pAtHalfM = computePressureKpaFromDepth(0.5, p0);
  const depth = computeDepthFromPressureKpa(pAtHalfM, p0);
  assert.ok(Math.abs(depth - 0.5) < 1e-6, `Expected 0.50 m, got ${depth}`);
});

test('thruster PWM responds to pilot horizontal and vertical inputs', () => {
  const idle = computeThrusterPwm({ vx: 0, vy: 0 }, false);
  assert.equal(idle.aftSurgePct, 0);

  const diving = computeThrusterPwm({ vx: 1, vy: 1 }, true);
  assert.ok(diving.aftSurgePct > 50);
  assert.ok(diving.foreHeavePct > idle.foreHeavePct);
  assert.ok(diving.aftHeavePct > idle.aftHeavePct);
});

test('buildPartInspectionDetails produces expected live data, status, and AWS targets', () => {
  const ctx = {
    rov: { xM: 0.8, depthM: 0.68 },
    cracks: DEMO_DAM_CRACKS,
    thresholds: DEFAULT_THRESHOLDS,
    pilotVector: { vx: 0, vy: 1 },
    isMoving: true,
    straddledCrack: DEMO_DAM_CRACKS[2],
  };

  const c03 = buildPartInspectionDetails('crack-C-03', ctx);
  assert.equal(c03.severity, 'Critical');
  assert.equal(c03.status, 'Alert');
  assert.ok(c03.readings.some((r) => r.label === 'Active Leak' && r.value.startsWith('Yes')));

  const tether = buildPartInspectionDetails('tether', ctx);
  assert.ok(tether.summary.toLowerCase().includes('wireless'));
  assert.ok(tether.readings.some((r) => r.value.toLowerCase().includes('no wireless underwater')));

  const piezo = buildPartInspectionDetails('piezo', ctx);
  assert.equal(piezo.status, 'Alert');
  assert.ok(piezo.awsService.includes('IoT Core'));
});

test('findStraddledCrack locks onto crack when within wall range and vertical tolerance', () => {
  assert.equal(findStraddledCrack({ xM: 0.3, depthM: 0.68 }), null);
  const c3 = findStraddledCrack({ xM: 0.78, depthM: 0.68 });
  assert.equal(c3?.id, 'C-03');
  assert.equal(c3?.hasLeak, true);

  const measured = measureCrackFromRov(c3!, 0.8);
  assert.equal(Number(measured.widthMm.toFixed(2)), 1.2);
  assert.equal(measured.severity, 'Critical');
});

test('computeAcousticScore rises near leaking crack C-03 and stays low far away', () => {
  const far = computeAcousticScore({ xM: 0.2, depthM: 0.1 });
  const near = computeAcousticScore({ xM: 0.82, depthM: 0.68 });
  assert.ok(far.score < 25, `Expected far acoustic score < 25, got ${far.score}`);
  assert.ok(near.score >= 80, `Expected near acoustic score >= 80, got ${near.score}`);
  assert.equal(near.status, 'Active Leak Detected');
  assert.equal(near.nearestLeakId, 'C-03');
});

test('evaluateGuidedDemo covers full 90-second run with Critical, delta, and recommendation', () => {
  const start = evaluateGuidedDemo(0);
  assert.equal(start.completed, false);
  assert.equal(start.rov.depthM, 0.05);

  const leakStage = evaluateGuidedDemo(46);
  assert.equal(leakStage.highlightCrackId, 'C-03');

  const deltaStage = evaluateGuidedDemo(62);
  assert.equal(deltaStage.highlightCrackId, 'C-04');
  assert.equal(deltaStage.showReinspectionDelta, true);

  const recStage = evaluateGuidedDemo(73);
  assert.equal(recStage.showRecommendation, true);
  assert.ok(recStage.caption.includes('Critical'));

  const end = evaluateGuidedDemo(GUIDED_DEMO_DURATION_SEC);
  assert.equal(end.completed, true);
  assert.equal(end.progressPct, 100);
});
