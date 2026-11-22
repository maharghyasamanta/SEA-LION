import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySeverity,
  computeAcousticScore,
  computeCrackWidthMm,
  computeScaleMmPerPx,
  DEMO_DAM_CRACKS,
  findStraddledCrack,
  measureCrackFromRov,
} from './crackAnalysis';
import { evaluateGuidedDemo, GUIDED_DEMO_DURATION_SEC } from './guidedDemo';

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

test('DEMO_DAM_CRACKS contains 4 cracks with expected growth delta on C-04', () => {
  assert.equal(DEMO_DAM_CRACKS.length, 4);
  const c4 = DEMO_DAM_CRACKS.find((c) => c.id === 'C-04');
  assert.ok(c4);
  assert.equal(Number((c4.trueWidthMm - (c4.previousWidthMm ?? 0)).toFixed(1)), 0.4);
});
