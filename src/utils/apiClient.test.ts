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

test('fetchApiJson preserves external aborts as AbortError', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      }, { once: true });
    })) as typeof fetch;

    const controller = new AbortController();
    const request = fetchApiJson('https://updates.example.com/api/update-manifest', { signal: controller.signal }, { retryCount: 0, timeoutMs: 2000 });
    controller.abort();

    await assert.rejects(
      () => request,
      (error: unknown) => error instanceof DOMException && error.name === 'AbortError'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchApiJson turns request timeouts into transient API client errors', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(init.signal?.reason ?? new DOMException('Request timed out', 'TimeoutError'));
      }, { once: true });
    })) as typeof fetch;

    await assert.rejects(
      () => fetchApiJson('https://updates.example.com/api/update-manifest', {}, { retryCount: 0, timeoutMs: 5 }),
      (error: unknown) => (
        error instanceof ApiClientError
        && error.status === 408
        && error.transient
      )
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
