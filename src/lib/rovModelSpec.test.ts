import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMERA_PRESETS,
  CONCEPT_MODEL_BADGE,
  DESIGN_LASER_SPACING_LABEL,
  DRY_TOPSIDE_LABEL,
  ROV_3D_PARTS,
  computeThrusterTestTelemetry,
  getPartSpecById,
} from './rovModelSpec';

test('ROV_3D_PARTS includes all 10 requested assemblies with required realism constraints', () => {
  const expectedIds = [
    'pvc-frame',
    'usb-camera',
    'calibration-lasers',
    'thruster-port',
    'thruster-starboard',
    'thruster-vertical',
    'piezo-hydrophone',
    'pressure-sensor',
    'tether-cable',
    'shore-unit',
  ];
  assert.deepEqual(
    ROV_3D_PARTS.map((p) => p.id),
    expectedIds,
  );

  for (const part of ROV_3D_PARTS) {
    assert.ok(part.summary.length > 15, `${part.id} missing summary`);
    assert.ok(part.awsService.length > 5, `${part.id} missing AWS service`);
    assert.ok(
      part.esp32PinGroup.toLowerCase().includes('planned wiring, to be confirmed'),
      `${part.id} must mark ESP32 pin group as planned wiring, to be confirmed`,
    );
  }

  const allCopy = JSON.stringify(ROV_3D_PARTS).toLowerCase();
  assert.equal(allCopy.includes('schedule-40'), false);
  assert.equal(allCopy.includes('float collar'), false);
  assert.equal(allCopy.includes('anodized aluminum'), false);
  assert.equal(allCopy.includes('acrylic'), false);
  assert.equal(allCopy.includes('50 mm (exact)'), false);
});

test('Piezo hydrophone is wired to an ADC1 pin and lasers specify plastic pen barrels with epoxy seal', () => {
  const piezo = getPartSpecById('piezo-hydrophone');
  assert.ok(piezo.esp32PinGroup.includes('ADC1'));

  const lasers = getPartSpecById('calibration-lasers');
  assert.ok(lasers.summary.toLowerCase().includes('plastic pen barrels with epoxy seal'));
  assert.ok(lasers.summary.includes(DESIGN_LASER_SPACING_LABEL));
});

test('Honesty constants match approved terminology', () => {
  assert.equal(CONCEPT_MODEL_BADGE, 'CONCEPT MODEL: dimensions illustrative, not final');
  assert.equal(DESIGN_LASER_SPACING_LABEL, '50 mm design spacing (verify with calipers)');
  assert.equal(DRY_TOPSIDE_LABEL, 'dry topside: not underwater');
});

test('CAMERA_PRESETS provides iso/reset, front, side, top, and shore presets', () => {
  assert.deepEqual(
    CAMERA_PRESETS.map((p) => p.id),
    ['iso', 'front', 'side', 'top', 'shore'],
  );
});

test('computeThrusterTestTelemetry returns 0 PWM when inactive and active SIMULATED PWM when testing', () => {
  const idle = computeThrusterTestTelemetry(2.5, false);
  assert.equal(idle.active, false);
  assert.equal(idle.portHorizontalPct, 0);
  assert.equal(idle.starboardHorizontalPct, 0);
  assert.equal(idle.verticalDivePct, 0);

  const surge = computeThrusterTestTelemetry(1.0, true);
  assert.equal(surge.active, true);
  assert.ok(surge.portHorizontalPct > 50);
  assert.ok(surge.starboardHorizontalPct > 50);
  assert.ok(surge.maneuverLabel.includes('SIMULATED'));

  const dive = computeThrusterTestTelemetry(7.5, true);
  assert.ok(dive.verticalDivePct > 60);
  assert.ok(dive.verticalSpinRadPerSec > dive.horizontalSpinRadPerSec);
});
