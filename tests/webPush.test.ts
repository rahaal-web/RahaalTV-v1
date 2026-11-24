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
      'rahaaltv-v1.example.workers.dev';
    assert.equal(shouldSkipPushApiCalls(), false);
    assert.equal(resolvePushApiEndpoint('/api/push/config'), '/api/push/config');

    store.clear();
    (globalThis as { window: { location: { hostname: string } } }).window.location.hostname =
      'rahal-web.github.io';
    assert.equal(shouldSkipPushApiCalls(), true);
  } finally {
    (globalThis as { window?: unknown }).window = originalWindow;
    (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
  }
});

test('Cloudflare Worker WebPush: RFC 8291 aes128gcm encryption, VAPID JWT, and KV routes', async () => {
  const workerMod = (await import('../cloudflare-worker.js')) as {
    default: { fetch: (req: Request, env: Record<string, unknown>) => Promise<Response> };
    encryptWorkerWebPushPayload: (p: {
      p256dh: string;
      auth: string;
      payload: string;
    }) => Promise<Uint8Array>;
    createWorkerVapidAuthHeader: (p: {
      endpoint: string;
      publicKey: string;
      privateKey: string;
      subject: string;
    }) => Promise<string>;
  };
  const { generateVAPIDKeys } = await import('web-push');
  const vapid = generateVAPIDKeys();

  // Verify WebCrypto aes128gcm encryption can be decrypted cleanly by receiver keypair
  const clientKeys = await globalThis.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const clientPubRaw = new Uint8Array(
    await globalThis.crypto.subtle.exportKey('raw', clientKeys.publicKey)
  );
  const authSecret = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');

  const encrypted = await workerMod.encryptWorkerWebPushPayload({
    p256dh: b64u(clientPubRaw),
    auth: b64u(authSecret),
    payload: JSON.stringify({ title: 'اختبار', body: 'رسالة مشفرة' }),
  });
  assert.ok(encrypted.length > 86 + 16);

  // Decrypt RFC 8188 / RFC 8291 aes128gcm payload on client side to prove exact protocol compliance
  const salt = encrypted.slice(0, 16);
  const idlen = encrypted[20];
  assert.equal(idlen, 65);
  const asPubRaw = encrypted.slice(21, 21 + idlen);
  const ciphertext = encrypted.slice(21 + idlen);

  const asPubKey = await globalThis.crypto.subtle.importKey(
    'raw',
    asPubRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const shared = new Uint8Array(
    await globalThis.crypto.subtle.deriveBits(
      { name: 'ECDH', public: asPubKey },
      clientKeys.privateKey,
      256
    )
  );
  const enc = new TextEncoder();
  const keyInfo = Buffer.concat([enc.encode('WebPush: info\0'), clientPubRaw, asPubRaw]);
  const hkdf1 = await globalThis.crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const ikm = new Uint8Array(
    await globalThis.crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: keyInfo },
      hkdf1,
      256
    )
  );
  const hkdf2 = await globalThis.crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const cek = new Uint8Array(
    await globalThis.crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: aes128gcm\0') },
      hkdf2,
      128
    )
  );
  const nonce = new Uint8Array(
    await globalThis.crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: nonce\0') },
      hkdf2,
      96
    )
  );
  const aesKey = await globalThis.crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const decryptedPadded = new Uint8Array(
    await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aesKey, ciphertext)
  );
  assert.equal(decryptedPadded[decryptedPadded.length - 1], 0x02);
  const decodedJson = JSON.parse(new TextDecoder().decode(decryptedPadded.slice(0, -1))) as {
    title: string;
    body: string;
  };
  assert.equal(decodedJson.title, 'اختبار');
  assert.equal(decodedJson.body, 'رسالة مشفرة');

  // Verify VAPID JWT header format
  const authHeader = await workerMod.createWorkerVapidAuthHeader({
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
    subject: 'mailto: <voar44@gmail.com>',
  });
  assert.ok(authHeader.startsWith('vapid t='));
  assert.ok(authHeader.endsWith(`, k=${vapid.publicKey}`));

  // Verify Worker /api/push/config & /api/push/subscribe with mock KV
  const kvMap = new Map<string, string>();
  const workerEnv = {
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: 'mailto:voar44@gmail.com',
    DB_CONFIG_KV: {
      get: async (k: string) => kvMap.get(k) ?? null,
      put: async (k: string, v: string) => {
        kvMap.set(k, v);
      },
      delete: async (k: string) => {
        kvMap.delete(k);
      },
    },
  };

  const cfgRes = await workerMod.default.fetch(
    new Request('https://rahaaltv.workers.dev/api/push/config'),
    workerEnv
  );
  assert.equal(cfgRes.status, 200);
  const cfgData = (await cfgRes.json()) as { ok: boolean; publicKey: string };
  assert.equal(cfgData.ok, true);
  assert.equal(cfgData.publicKey, vapid.publicKey);

  const subRes = await workerMod.default.fetch(
    new Request('https://rahaaltv.workers.dev/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: VALID_SUB_1 }),
    }),
    workerEnv
  );
  assert.equal(subRes.status, 200);
  assert.ok(kvMap.has('push_store_v1'));
});
