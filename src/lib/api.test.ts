import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkHealth,
  compareInspections,
  getLatestTelemetry,
  ingestTelemetry,
  listInspections,
  requestPresignedUrl,
} from './api';

test('checkHealth parses response correctly', async () => {
  const mockHealth = {
    ok: true,
    service: 'sea-lion-api',
    stage: 'stage-2',
    region: 'ap-south-1',
    mode: 'aws-live',
    timestamp: new Date().toISOString(),
    services: {
      lambda: 'connected',
      s3: 'connected',
      dynamodb_inspections: 'connected',
      dynamodb_telemetry: 'connected',
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify(mockHealth), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  try {
    const res = await checkHealth();
    assert.equal(res.ok, true);
    assert.equal(res.stage, 'stage-2');
    assert.equal(res.services?.s3, 'connected');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requestPresignedUrl requests 5-minute S3 upload URL', async () => {
  const mockPresign = {
    ok: true,
    upload_url: 'https://sealion-bucket.s3.amazonaws.com/uploads/asset1/sample.png?sig=xyz',
    object_key: 'uploads/asset1/sample.png',
    asset_id: 'asset-test-01',
    inspection_id: 'insp_123',
    expires_in_seconds: 300,
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify(mockPresign), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  try {
    const res = await requestPresignedUrl('sample.png', 'image/png', 50000, 'asset-test-01');
    assert.equal(res.ok, true);
    assert.ok(res.upload_url.includes('https://'));
    assert.equal(res.object_key, 'uploads/asset1/sample.png');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('compareInspections handles temporal progression delta', async () => {
  const mockCompare = {
    ok: true,
    asset_id: 'asset-test',
    baseline: {
      id: 'b1',
      asset_id: 'asset-test',
      inspection_id: 'b1',
      asset_name: 'Tallah Reservoir',
      asset_type: 'Municipal Tank',
      water_depth_m: 4.8,
      raw_image_url: '/raw.png',
      annotated_image_url: '/ann.png',
      crack_max_width_mm: 0.8,
      crack_total_length_cm: 15.0,
      crack_area_cm2: 6.0,
      water_loss_liters_per_day: 5000,
      annual_loss_inr: 91250,
      structural_risk_index: 55,
      risk_tier: 'MODERATE',
      action_recommendation: 'Monitor',
      calibration_mm_per_px: 0.2,
      created_at: '2026-10-01T00:00:00Z',
    },
    current: {
      id: 'c1',
      asset_id: 'asset-test',
      inspection_id: 'c1',
      asset_name: 'Tallah Reservoir',
      asset_type: 'Municipal Tank',
      water_depth_m: 4.8,
      raw_image_url: '/raw.png',
      annotated_image_url: '/ann.png',
      crack_max_width_mm: 1.4,
      crack_total_length_cm: 22.0,
      crack_area_cm2: 11.0,
      water_loss_liters_per_day: 12500,
      annual_loss_inr: 228125,
      structural_risk_index: 80,
      risk_tier: 'CRITICAL',
      action_recommendation: 'Immediate shoring',
      calibration_mm_per_px: 0.2,
      created_at: '2026-11-01T00:00:00Z',
    },
    delta_width_mm: 0.6,
    delta_length_cm: 7.0,
    area_expansion_pct: 83.3,
    delta_water_loss_liters_per_day: 7500,
    elapsed_days: 31,
    deterioration_velocity_mm_per_day: 0.0194,
    verdict: 'ACCELERATING — Critical Structural Aperture Expansion',
    urgency: 'CRITICAL',
    recommendation: 'Immediate cofferdam required',
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify(mockCompare), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  try {
    const res = await compareInspections('asset-test', 'b1', 'c1');
    assert.equal(res.ok, true);
    assert.equal(res.delta_width_mm, 0.6);
    assert.equal(res.urgency, 'CRITICAL');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ingestTelemetry and getLatestTelemetry interact with DynamoDB payload shape', async () => {
  const mockTelemetry = {
    ok: true,
    unit_id: 'sealion-rov-01',
    timestamp: new Date().toISOString(),
    depth_m: 2.34,
    pressure_kpa: 124.23,
    acoustic_leak_index: 72,
    battery_pct: 91,
    thruster_rpm: 1280,
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify(mockTelemetry), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  try {
    const latest = await getLatestTelemetry();
    assert.equal(latest.depth_m, 2.34);
    assert.equal(latest.acoustic_leak_index, 72);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
