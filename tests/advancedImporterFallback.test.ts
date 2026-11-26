import assert from 'node:assert/strict';
import test from 'node:test';
import type { User } from 'firebase/auth';
import workerModule from '../cloudflare-worker.js';
import {
  _setStaticBackendDetectedForTest,
  listImporterJobsApi,
  parseJsonResponseSafe,
  shouldUseBrowserImporter,
  StaticBackendUnavailableError,
} from '../src/lib/advancedImporterTransport';

test('parseJsonResponseSafe throws StaticBackendUnavailableError instead of SyntaxError for HTML SPA responses', async () => {
  const htmlResponse = new Response('<!doctype html><html><body>SPA</body></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

  await assert.rejects(
    () => parseJsonResponseSafe(htmlResponse, 'fallback error'),
    (err: unknown) => err instanceof StaticBackendUnavailableError
  );

  const htmlWithoutHeader = new Response('  <!DOCTYPE html><html></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });

  await assert.rejects(
    () => parseJsonResponseSafe(htmlWithoutHeader, 'fallback error'),
    (err: unknown) => err instanceof StaticBackendUnavailableError
  );
});

test('parseJsonResponseSafe throws StaticBackendUnavailableError on Worker 404 JSON code', async () => {
  const worker404 = new Response(
    JSON.stringify({
      ok: false,
      code: 'STATIC_WORKER_NO_NODE_API',
      error: 'No Node backend',
    }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }
  );

  await assert.rejects(
    () => parseJsonResponseSafe(worker404, 'fallback error'),
    (err: unknown) => err instanceof StaticBackendUnavailableError
  );
});

test('parseJsonResponseSafe parses valid JSON cleanly', async () => {
  const okRes = new Response(JSON.stringify({ ok: true, jobs: [{ id: 'imp_1' }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await parseJsonResponseSafe<{ ok: boolean; jobs: Array<{ id: string }> }>(
    okRes,
    'fallback'
  );
  assert.equal(data.ok, true);
  assert.equal(data.jobs[0].id, 'imp_1');
});

test('shouldUseBrowserImporter detects workers.dev proxy URLs and bimp_ job IDs', () => {
  _setStaticBackendDetectedForTest(false);
  assert.equal(
    shouldUseBrowserImporter('https://rahaaltv-v1.rahaal712.workers.dev'),
    true
  );
  assert.equal(shouldUseBrowserImporter(undefined, 'bimp_12345_ab'), true);
  assert.equal(shouldUseBrowserImporter('https://my-node-server.example.com'), false);
});

test('listImporterJobsApi transparently switches to browser engine when fetch returns SPA HTML', async () => {
  _setStaticBackendDetectedForTest(false);
  const originalFetch = globalThis.fetch;
  const storage = new Map<string, string>();
  const originalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;

  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storage.set(k, String(v));
    },
    removeItem: (k: string) => {
      storage.delete(k);
    },
  };

  globalThis.fetch = (async () =>
    new Response('<!DOCTYPE html><html><head></head><body></body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })) as typeof fetch;

  const mockUser = {
    uid: 'admin-1',
    getIdToken: async () => 'fake-token',
  } as unknown as User;

  try {
    const jobs = await listImporterJobsApi(mockUser, 'https://custom-static-domain.example.com');
    assert.ok(Array.isArray(jobs));
    assert.equal(shouldUseBrowserImporter('https://custom-static-domain.example.com'), true);
  } finally {
    globalThis.fetch = originalFetch;
    _setStaticBackendDetectedForTest(false);
    if (originalLocalStorage !== undefined) {
      (globalThis as { localStorage?: Storage }).localStorage = originalLocalStorage;
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  }
});

test('cloudflare-worker returns JSON 404 for unhandled /api/* routes instead of serving SPA index.html', async () => {
  let assetsFetchCalled = false;
  const env = {
    ASSETS: {
      fetch: async () => {
        assetsFetchCalled = true;
        return new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      },
    },
  };

  const apiReq = new Request('https://rahaaltv-v1.rahaal712.workers.dev/api/advanced-importer/jobs', {
    method: 'POST',
  });
  const apiRes = await workerModule.fetch(apiReq, env);
  assert.equal(apiRes.status, 404);
  assert.equal(assetsFetchCalled, false);
  const body = (await apiRes.json()) as { ok: boolean; code: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, 'STATIC_WORKER_NO_NODE_API');

  const pageReq = new Request('https://rahaaltv-v1.rahaal712.workers.dev/#/admin/advanced_importer');
  const pageRes = await workerModule.fetch(pageReq, env);
  assert.equal(pageRes.status, 200);
  assert.equal(assetsFetchCalled, true);
});
