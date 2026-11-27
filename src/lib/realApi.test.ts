import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { runRealCrackAnalysis } from './realApi';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const RECORD = {
  id: 'insp-test-1',
  inspection_id: 'insp-test-1',
  asset_id: 'ref-c01',
  asset_name: 'Vertical wall crack (reference photo)',
  asset_type: 'Reference concrete asset',
  water_depth_m: 4.8,
  raw_image_url: '/api/dev-image/uploads%2Fref-c01%2Fframe.jpg',
  annotated_image_url: '/api/dev-image/uploads%2Fref-c01%2Fframe.jpg?variant=annotated',
  crack_detected: true,
  status: 'COMPLETED',
  measurement_method: 'operator_trace',
  confidence: 61,
  crack_median_width_mm: 0.61,
  crack_mean_width_mm: 0.61,
  crack_max_width_mm: 1.89,
  crack_total_length_cm: 11.54,
  crack_area_cm2: 1.11,
  water_loss_liters_per_day: 8655.5,
  annual_loss_inr: 157962.01,
  structural_risk_index: 66,
  risk_tier: 'MODERATE',
  action_recommendation: 'Schedule a closer engineer review.',
  calibration_mm_per_px: 0.2,
  calibration_source: 'assumed_demo',
  limitations: ['Operator-guided trace.'],
  source: 'local-demo',
  created_at: '2026-11-27T00:00:00Z',
  createdAt: '2026-11-27T00:00:00Z',
};

function installFetchMock(options: { analyzeRecord?: Record<string, unknown>; analyzeStatus?: number } = {}) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });

    if (url === '/samples/crack-c01-minor.jpg') {
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
    }
    if (url === '/api/uploads/presign' && method === 'POST') {
      return new Response(
        JSON.stringify({
          ok: true,
          upload_url: '/api/dev-upload/uploads%2Fref-c01%2Fframe.jpg',
          object_key: 'uploads/ref-c01/frame.jpg',
          asset_id: 'ref-c01',
          inspection_id: 'insp-test-1',
          expires_in_seconds: 300,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.startsWith('/api/dev-upload/') && method === 'PUT') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/inspections/analyze' && method === 'POST') {
      return new Response(JSON.stringify(options.analyzeRecord ?? RECORD), {
        status: options.analyzeStatus ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Not Found', { status: 404 });
  };
  globalThis.fetch = mockFetch;
  return { mockFetch, calls };
}

test('runRealCrackAnalysis uploads the reference photo and returns the measured record', async () => {
  const { mockFetch, calls } = installFetchMock();

  const result = await runRealCrackAnalysis({
    sampleImagePath: '/samples/crack-c01-minor.jpg',
    filename: 'frame.jpg',
    fetchFn: mockFetch,
  });

  assert.equal(result.id, 'insp-test-1');
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.medianWidthMm, 0.61);
  assert.equal(result.widthMm, 1.89);
  assert.equal(result.confidence, 61);
  assert.equal(result.source, 'real-api');

  const analyzeCall = calls.find((call) => call.url === '/api/inspections/analyze');
  assert.ok(analyzeCall?.body, 'analyze request body should be present');
  const payload = JSON.parse(analyzeCall.body);
  assert.equal(payload.object_key, 'uploads/ref-c01/frame.jpg');
  assert.equal(payload.calibration_source, 'assumed_demo');
  assert.equal(payload.trace.length, 9);
  assert.deepEqual(payload.trace[0], [0.47, 0.25]);
});

test('runRealCrackAnalysis reports REVIEW_REQUIRED without inventing a width', async () => {
  installFetchMock({
    analyzeRecord: {
      ...RECORD,
      status: 'REVIEW_REQUIRED',
      crack_detected: false,
      crack_median_width_mm: 0,
      crack_max_width_mm: 0,
      confidence: 12,
    },
  });

  const result = await runRealCrackAnalysis({
    sampleImagePath: '/samples/crack-c01-minor.jpg',
    filename: 'frame.jpg',
    fetchFn: globalThis.fetch,
  });

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.crackDetected, false);
  assert.equal(result.widthMm, 0);
  assert.equal(result.medianWidthMm, 0);
});

test('runRealCrackAnalysis surfaces API errors', async () => {
  installFetchMock({
    analyzeStatus: 422,
    analyzeRecord: { error: 'No dark aperture was found along the trace.' },
  });

  await assert.rejects(
    () =>
      runRealCrackAnalysis({
        sampleImagePath: '/samples/crack-c01-minor.jpg',
        filename: 'frame.jpg',
        fetchFn: globalThis.fetch,
      }),
    /No dark aperture/i,
  );
});

test('runRealCrackAnalysis rejects samples without a reference trace', async () => {
  await assert.rejects(
    () =>
      runRealCrackAnalysis({
        sampleImagePath: '/samples/not-a-reference.jpg',
        filename: 'frame.jpg',
        fetchFn: globalThis.fetch,
      }),
    /no reference trace/i,
  );
});
