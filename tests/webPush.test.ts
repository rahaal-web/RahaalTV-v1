import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import {
  attachPushRoutes,
  createWebPushService,
  sanitizeInternalPushUrl,
  validatePushSubscriptionInput,
} from '../server/webPushService';

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function startPushTestServer(options?: {
  sendNotificationFn?: NonNullable<Parameters<typeof createWebPushService>[0]>['sendNotificationFn'];
}) {
  const tmpDir = createTempDir('rtv-push-test-');
  const sentCalls: Array<{ endpoint: string; payload: string }> = [];

  const defaultSendFn: NonNullable<Parameters<typeof createWebPushService>[0]>['sendNotificationFn'] =
    async (sub, payload) => {
      sentCalls.push({
        endpoint: sub.endpoint,
        payload: typeof payload === 'string' ? payload : String(payload || ''),
      });
      if (sub.endpoint.includes('expired-410')) {
        const err = new Error('Gone') as Error & { statusCode: number };
        err.statusCode = 410;
        throw err;
      }
      return {
        statusCode: 201,
        body: '',
        headers: {},
      };
    };

  const service = createWebPushService({
    storeFilePath: path.join(tmpDir, 'push-store.json'),
    vapidFilePath: path.join(tmpDir, 'push-vapid.json'),
    sendNotificationFn: options?.sendNotificationFn || defaultSendFn,
    verifyStaffAdminFn: async (authHeader) => {
      if (authHeader === 'Bearer valid-admin-token') {
        return { uid: 'admin-uid-1', email: 'rahalahmed348@gmail.com', role: 'owner' };
      }
      return null;
    },
  });

  const app = express();
  app.use(express.json());
  attachPushRoutes(app, service);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    sentCalls,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

const VALID_SUB_1 = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-device-one-123456',
  expirationTime: null,
  keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
};

const VALID_SUB_2_EXPIRED = {
  endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/expired-410-device',
  expirationTime: null,
  keys: {
    p256dh: 'BO6RdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'xBHItJI5svbpez7KI4CCYg',
  },
};

test('WebPush Validation: enforces HTTPS public endpoint and internal route sanitization', () => {
  assert.equal(sanitizeInternalPushUrl('#/watch/sample-1'), '#/watch/sample-1');
  assert.equal(sanitizeInternalPushUrl('/browse?cat=anime'), '#/browse?cat=anime');
  assert.equal(sanitizeInternalPushUrl('https://evil.com/phish'), null);
  assert.equal(sanitizeInternalPushUrl('javascript:alert(1)'), null);

  const httpSub = validatePushSubscriptionInput({
    ...VALID_SUB_1,
    endpoint: 'http://fcm.googleapis.com/insecure',
  });
  assert.equal(httpSub.ok, false);

  const loopbackSub = validatePushSubscriptionInput({
    ...VALID_SUB_1,
    endpoint: 'https://127.0.0.1/push',
  });
  assert.equal(loopbackSub.ok, false);

  const okSub = validatePushSubscriptionInput(VALID_SUB_1);
  assert.equal(okSub.ok, true);
});

test('WebPush API: full config, subscribe/dedup, unsubscribe, admin RBAC, test-send, broadcast confirmation & 410 cleanup', async () => {
  const ctx = await startPushTestServer();
  try {
    // 1. Public config exposes publicKey only (never privateKey)
    const cfgResp = await fetch(`${ctx.baseUrl}/api/push/config`);
    assert.equal(cfgResp.status, 200);
    const cfgJson = (await cfgResp.json()) as Record<string, unknown>;
    assert.equal(cfgJson.ok, true);
    assert.equal(typeof cfgJson.publicKey, 'string');
    assert.ok(String(cfgJson.publicKey).length > 20);
    assert.equal('privateKey' in cfgJson, false);

    // 2. Reject invalid subscription endpoints (HTTP / loopback)
    const badSubResp = await fetch(`${ctx.baseUrl}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: { ...VALID_SUB_1, endpoint: 'https://127.0.0.1/bad' },
      }),
    });
    assert.equal(badSubResp.status, 400);

    // 3. Subscribe device 1 twice -> deduplicated, never leaks endpoint back
    const sub1Resp = await fetch(`${ctx.baseUrl}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: VALID_SUB_1 }),
    });
    assert.equal(sub1Resp.status, 200);
    const sub1Json = (await sub1Resp.json()) as Record<string, unknown>;
    assert.equal(sub1Json.alreadyRegistered, false);
    assert.equal('endpoint' in sub1Json, false);
    assert.equal('keys' in sub1Json, false);

    const sub1DupResp = await fetch(`${ctx.baseUrl}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: VALID_SUB_1 }),
    });
    const sub1DupJson = (await sub1DupResp.json()) as Record<string, unknown>;
    assert.equal(sub1DupJson.alreadyRegistered, true);

    // Subscribe device 2 (which will simulate 410 Gone)
    const sub2Resp = await fetch(`${ctx.baseUrl}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: VALID_SUB_2_EXPIRED }),
    });
    assert.equal(sub2Resp.status, 200);

    // 4. Unauthenticated / non-admin callers rejected from all admin endpoints
    for (const ep of ['/api/push/admin/stats', '/api/push/send-test', '/api/push/broadcast']) {
      const method = ep.endsWith('stats') ? 'GET' : 'POST';
      const unauth = await fetch(`${ctx.baseUrl}${ep}`, { method });
      assert.equal(unauth.status, 401, `Expected 401 on ${ep} without auth`);

      const nonAdmin = await fetch(`${ctx.baseUrl}${ep}`, {
        method,
        headers: { Authorization: 'Bearer regular-user-token' },
      });
      assert.equal(nonAdmin.status, 403, `Expected 403 on ${ep} for non-admin`);
    }

    // 5. Admin stats confirms deduplicated subscriber count == 2
    const statsResp = await fetch(`${ctx.baseUrl}/api/push/admin/stats`, {
      headers: { Authorization: 'Bearer valid-admin-token' },
    });
    assert.equal(statsResp.status, 200);
    const statsJson = (await statsResp.json()) as { totalSubscribers: number };
    assert.equal(statsJson.totalSubscribers, 2);

    // 6. Send-test targets ONLY admin's own endpoint (device 1)
    const testSendResp = await fetch(`${ctx.baseUrl}/api/push/send-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-token',
      },
      body: JSON.stringify({
        title: 'تجربة إشعار',
        body: 'هذا إشعار تجريبي لجهازي فقط',
        url: '#/browse',
        endpoint: VALID_SUB_1.endpoint,
      }),
    });
    assert.equal(testSendResp.status, 200);
    const testSendJson = (await testSendResp.json()) as {
      totalTargeted: number;
      acceptedCount: number;
    };
    assert.equal(testSendJson.totalTargeted, 1);
    assert.equal(testSendJson.acceptedCount, 1);
    assert.equal(ctx.sentCalls.length, 1);
    assert.equal(ctx.sentCalls[0]?.endpoint, VALID_SUB_1.endpoint);

    // 7. Broadcast requires confirmed: true AND rejects external URLs
    const unconfirmedResp = await fetch(`${ctx.baseUrl}/api/push/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-token',
      },
      body: JSON.stringify({
        title: 'بدون تأكيد',
        body: 'نص',
        url: '#/',
      }),
    });
    assert.equal(unconfirmedResp.status, 400);

    const externalUrlResp = await fetch(`${ctx.baseUrl}/api/push/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-token',
      },
      body: JSON.stringify({
        title: 'رابط خارجي',
        body: 'نص',
        url: 'https://evil.example/redirect',
        confirmed: true,
      }),
    });
    assert.equal(externalUrlResp.status, 400);

    // 8. Confirmed broadcast sends to both, records 1 accepted & cleans 1 expired (410)
    const broadcastResp = await fetch(`${ctx.baseUrl}/api/push/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-token',
      },
      body: JSON.stringify({
        title: 'حلقة جديدة',
        body: 'تمت إضافة الحلقة السادسة الآن',
        url: '#/watch/running-man-2026?ep=6',
        confirmed: true,
      }),
    });
    assert.equal(broadcastResp.status, 200);
    const broadcastJson = (await broadcastResp.json()) as {
      totalTargeted: number;
      acceptedCount: number;
      cleanedExpiredCount: number;
      remainingSubscribers: number;
      deliveryNote: string;
    };
    assert.equal(broadcastJson.totalTargeted, 2);
    assert.equal(broadcastJson.acceptedCount, 1);
    assert.equal(broadcastJson.cleanedExpiredCount, 1);
    assert.equal(broadcastJson.remainingSubscribers, 1);
    assert.ok(broadcastJson.deliveryNote.includes('قبول الطلب فقط'));

    // 9. Unsubscribe device 1 -> remainingSubscribers becomes 0
    const unsubResp = await fetch(`${ctx.baseUrl}/api/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: VALID_SUB_1.endpoint }),
    });
    assert.equal(unsubResp.status, 200);
    const unsubJson = (await unsubResp.json()) as { removed: boolean };
    assert.equal(unsubJson.removed, true);

    const statsAfterResp = await fetch(`${ctx.baseUrl}/api/push/admin/stats`, {
      headers: { Authorization: 'Bearer valid-admin-token' },
    });
    const statsAfterJson = (await statsAfterResp.json()) as { totalSubscribers: number };
    assert.equal(statsAfterJson.totalSubscribers, 0);
  } finally {
    await ctx.close();
  }
});

test('Service Worker push-sw.js & Vite PWA integration audit', () => {
  const pushSw = fs.readFileSync(path.join(process.cwd(), 'public/push-sw.js'), 'utf8');
  assert.ok(pushSw.includes('sanitizeInternalPushTarget'));
  assert.ok(pushSw.includes("addEventListener('push'"));
  assert.ok(pushSw.includes("addEventListener('notificationclick'"));
  assert.ok(pushSw.includes('RTV_PUSH_NAVIGATE'));
  assert.ok(pushSw.includes('https?:|javascript:'));

  const viteCfg = fs.readFileSync(path.join(process.cwd(), 'vite.config.ts'), 'utf8');
  assert.ok(viteCfg.includes("importScripts: ['push-sw.js']"));
});

test('VAPID config resolves env keys and normalizes bracketed mailto subject', async () => {
  const { generateVAPIDKeys } = await import('web-push');
  const keys = generateVAPIDKeys();
  const customService = createWebPushService({
    vapidPublicKey: keys.publicKey,
    vapidPrivateKey: keys.privateKey,
    vapidSubject: 'mailto: <admin@example.com>',
  });
  const cfg = customService.getPublicConfig();
  assert.equal(cfg.vapidSource, 'env');
  assert.equal(cfg.publicKey, keys.publicKey);
  assert.equal('privateKey' in cfg, false);
});

test('WebPush Client: ignores Cloudflare Worker proxy URL and uses same-origin Node server', async () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

  const store = new Map<string, string>([
    ['rahaltv_api_base_url', 'https://rahaltv-proxy.example.workers.dev'],
  ]);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };
  (globalThis as { window?: unknown }).window = {
    location: {
      hostname: 'ais-dev-example.europe-west2.run.app',
      origin: 'https://ais-dev-example.europe-west2.run.app',
    },
  };

  try {
    const { resolvePushApiEndpoint, shouldSkipPushApiCalls } = await import(
      '../src/lib/webPushClient'
    );
    assert.equal(shouldSkipPushApiCalls(), false);
    assert.equal(resolvePushApiEndpoint('/api/push/config'), '/api/push/config');
    assert.equal(resolvePushApiEndpoint('/api/push/send-test'), '/api/push/send-test');

    (globalThis as { window: { location: { hostname: string } } }).window.location.hostname =
      'rahal-web.github.io';
    assert.equal(shouldSkipPushApiCalls(), true);
  } finally {
    (globalThis as { window?: unknown }).window = originalWindow;
    (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
  }
});
