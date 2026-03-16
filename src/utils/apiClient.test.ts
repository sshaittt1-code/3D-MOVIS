import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClientError, buildApiUrl, fetchApiJson } from './apiClient';

test('buildApiUrl joins absolute roots and relative paths cleanly', () => {
  assert.equal(buildApiUrl('https://updates.example.com/', '/api/update-manifest'), 'https://updates.example.com/api/update-manifest');
  assert.equal(buildApiUrl('https://updates.example.com', 'apk/latest.apk'), 'https://updates.example.com/apk/latest.apk');
});

test('fetchApiJson rejects HTML responses with a typed API error', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response('<!doctype html><html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' }
      }) as Response;

    await assert.rejects(
      () => fetchApiJson('https://updates.example.com/api/update-manifest', {}, { retryCount: 0, timeoutMs: 200 }),
      (error: unknown) => error instanceof ApiClientError && error.message.includes('HTML')
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
