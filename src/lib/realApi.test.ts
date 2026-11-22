import test from 'node:test';
import assert from 'node:assert/strict';
import { runRealCrackAnalysis } from './realApi';

test('runRealCrackAnalysis surfaces clear error when API returns 501', async () => {
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('/samples/')) {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }
    return new Response(
      JSON.stringify({ error: 'Stage 2 analysis API (/upload-url) is not deployed.' }),
      { status: 501, headers: { 'Content-Type': 'application/json' } },
    );
  };

  await assert.rejects(
    () =>
      runRealCrackAnalysis({
        sampleImagePath: '/samples/crack-c03-leak.png',
        filename: 'crack-c03-leak.png',
        apiBase: '',
        fetchFn: mockFetch,
        pollIntervalMs: 0,
      }),
    /not deployed/i,
  );
});

test('runRealCrackAnalysis completes POST /upload-url -> PUT -> poll /inspections/{id}', async () => {
  let pollCount = 0;
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === '/samples/crack-c01-minor.png') {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }
    if (url === 'https://api.example.com/upload-url' && init?.method === 'POST') {
      return new Response(
        JSON.stringify({
          uploadUrl: 'https://s3.example.com/signed-put',
          inspectionId: 'insp-42',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url === 'https://s3.example.com/signed-put' && init?.method === 'PUT') {
      return new Response(null, { status: 200 });
    }
    if (url === 'https://api.example.com/inspections/insp-42') {
      pollCount += 1;
      return new Response(
        JSON.stringify({
          id: 'insp-42',
          status: pollCount >= 2 ? 'COMPLETED' : 'PROCESSING',
          filename: 'crack-c01-minor.png',
          widthMm: 0.22,
          dotDistancePx: 248,
          crackWidthPx: 1.09,
          createdAt: '2026-11-22T00:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('Not Found', { status: 404 });
  };

  const result = await runRealCrackAnalysis({
    sampleImagePath: '/samples/crack-c01-minor.png',
    filename: 'crack-c01-minor.png',
    apiBase: 'https://api.example.com',
    fetchFn: mockFetch,
    pollIntervalMs: 0,
    maxPolls: 4,
  });

  assert.equal(result.id, 'insp-42');
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.widthMm, 0.22);
  assert.equal(pollCount, 2);
});
