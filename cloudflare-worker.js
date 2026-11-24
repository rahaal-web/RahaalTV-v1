// RahaL TV — Free Cloudflare Worker CORS Proxy & Client Error Logger (v3)
// Deploy for free at https://dash.cloudflare.com (Workers & Pages -> Create Worker)
// Free tier: 100,000 requests/day, zero sleep/cold-start, works permanently with GitHub Pages & Workers Hosting.

function isBlockedHost(hostname) {
  const h = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !h ||
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    h.startsWith('169.254.') ||
    /^f[cd][0-9a-f]{0,2}:/i.test(h) ||
    /^fe80:/i.test(h)
  ) {
    return true;
  }
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Expose-Headers':
    'X-Final-Url, X-Upstream-Status, X-Upstream-X-Frame-Options, X-Upstream-CSP, X-Proxy-Worker',
  'X-Proxy-Worker': 'rahaltv-v4',
};

function sanitizeLogString(val, maxLen = 400) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .slice(0, maxLen);
}

async function handleClientErrorLog(request) {
  try {
    const rawText = await request.text();
    if (!rawText || rawText.length > 16384) {
      return new Response(JSON.stringify({ ok: false, error: 'Payload too large or empty' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    let payload = {};
    try {
      payload = JSON.parse(rawText);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const level = ['warn', 'error', 'fatal'].includes(payload.level) ? payload.level : 'error';
    const logRecord = {
      tag: 'RAHALTV_CLIENT_LOG',
      level,
      timestamp: new Date().toISOString(),
      source: sanitizeLogString(payload.source || 'window', 80),
      message: sanitizeLogString(payload.message || 'Unknown frontend error', 600),
      stack: sanitizeLogString(payload.stack || '', 1500),
      route: sanitizeLogString(payload.route || '/', 250),
      host: sanitizeLogString(payload.host || '', 120),
      release: sanitizeLogString(payload.release || 'web', 60),
      online: typeof payload.online === 'boolean' ? payload.online : undefined,
      userAgent: sanitizeLogString(request.headers.get('user-agent') || '', 220),
      cfRay: request.headers.get('cf-ray') || undefined,
      colo: request.cf && request.cf.colo ? request.cf.colo : undefined,
      country: request.cf && request.cf.country ? request.cf.country : undefined,
      context:
        payload.context && typeof payload.context === 'object'
          ? JSON.parse(JSON.stringify(payload.context)).slice?.(0, 500) || payload.context
          : undefined,
    };

    const serialized = JSON.stringify(logRecord);
    if (level === 'warn') {
      console.warn(serialized);
    } else {
      console.error(serialized);
    }

    return new Response(JSON.stringify({ ok: true, logged: true }), {
      status: 202,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('RAHALTV_LOGGER_FAILURE:', String(err));
    return new Response(JSON.stringify({ ok: false, error: 'Log processing failed' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

async function verifyWorkerAdminRequest(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return { ok: false, status: 401, error: 'Missing Authorization Bearer Token' };
  }
  const webApiKey = env && env.FIREBASE_WEB_API_KEY ? String(env.FIREBASE_WEB_API_KEY).trim() : '';
  if (!webApiKey) {
    return {
      ok: false,
      status: 503,
      error: 'FIREBASE_WEB_API_KEY secret is not configured on Cloudflare Worker.',
    };
  }
  const lookup = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(webApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: match[1].trim() }),
    }
  );
  if (!lookup.ok) {
    return { ok: false, status: 401, error: 'Invalid Firebase ID Token' };
  }
  const data = await lookup.json();
  const user = data && data.users && data.users[0];
  const email = String((user && user.email) || '').toLowerCase();
  const allowedOwners = String(
    (env && env.ADMIN_OWNER_EMAILS) ||
      'rahalahmed348@gmail.com,mfeshmeny2@gmail.com,ccicada6@gmail.com,bebraheem439@gmail.com'
  )
    .toLowerCase()
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  if (!user || !user.emailVerified || !allowedOwners.includes(email)) {
    return { ok: false, status: 403, error: 'Owner admin access required' };
  }
  return { ok: true, uid: user.localId, email };
}

async function handleWorkerDbApi(request, env, pathname) {
  const jsonRes = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });

  const authCheck = await verifyWorkerAdminRequest(request, env);
  if (!authCheck.ok) {
    return jsonRes({ ok: false, error: authCheck.error }, authCheck.status);
  }

  const kv = env && env.DB_CONFIG_KV ? env.DB_CONFIG_KV : null;

  if (pathname === '/api/db/secrets/status' && request.method === 'GET') {
    if (!kv) {
      return jsonRes({
        ok: true,
        source: 'cloudflare_kv',
        statuses: {},
        note: 'أضف ربط KV باسم DB_CONFIG_KV في Cloudflare Worker لتفعيل حفظ الأسرار السحابية.',
      });
    }
    const raw = await kv.get('db_secret_statuses');
    const statuses = raw ? JSON.parse(raw) : {};
    return jsonRes({ ok: true, source: 'cloudflare_kv', statuses });
  }

  if (pathname === '/api/db/secrets' && request.method === 'POST') {
    if (!kv) {
      return jsonRes(
        { ok: false, error: 'KV namespace DB_CONFIG_KV is not bound to this Worker.' },
        501
      );
    }
    const body = await request.json().catch(() => null);
    if (!body || !body.connectionId) {
      return jsonRes({ ok: false, error: 'connectionId is required' }, 400);
    }
    const cleanId = String(body.connectionId).replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 96);
    const updatedAt = new Date().toISOString();
    const existingRaw = await kv.get('db_secret_statuses');
    const statuses = existingRaw ? JSON.parse(existingRaw) : {};

    let saEmail = statuses[cleanId] && statuses[cleanId].serviceAccountClientEmail;
    if (body.serviceAccountJson) {
      try {
        const sa = JSON.parse(String(body.serviceAccountJson));
        saEmail = sa.client_email || saEmail;
      } catch {
        return jsonRes({ ok: false, error: 'Invalid Service Account JSON' }, 400);
      }
    }

    // Store raw secret blob in KV separate key (never returned via status API)
    await kv.put(
      `db_secret_blob:${cleanId}`,
      JSON.stringify({
        serviceAccountJson: body.serviceAccountJson || '',
        privateKey: body.privateKey || '',
        apiSecret: body.apiSecret || '',
        cloudflareToken: body.cloudflareToken || '',
        updatedAt,
        updatedBy: authCheck.email,
      })
    );

    const status = {
      connectionId: cleanId,
      hasServiceAccount: Boolean(
        body.serviceAccountJson || (statuses[cleanId] && statuses[cleanId].hasServiceAccount)
      ),
      serviceAccountClientEmail: saEmail,
      hasPrivateKey: Boolean(
        body.privateKey || (statuses[cleanId] && statuses[cleanId].hasPrivateKey)
      ),
      hasApiSecret: Boolean(
        body.apiSecret || (statuses[cleanId] && statuses[cleanId].hasApiSecret)
      ),
      hasCloudflareToken: Boolean(
        body.cloudflareToken || (statuses[cleanId] && statuses[cleanId].hasCloudflareToken)
      ),
      updatedAt,
      updatedBy: authCheck.email,
      vaultSource: 'cloudflare_kv',
    };
    statuses[cleanId] = status;
    await kv.put('db_secret_statuses', JSON.stringify(statuses));
    return jsonRes({ ok: true, status });
  }

  if (pathname.startsWith('/api/db/secrets/') && request.method === 'DELETE') {
    const cleanId = pathname.replace('/api/db/secrets/', '').replace(/[^a-zA-Z0-9_\-]/g, '-');
    if (kv && cleanId) {
      await kv.delete(`db_secret_blob:${cleanId}`);
      const existingRaw = await kv.get('db_secret_statuses');
      if (existingRaw) {
        const statuses = JSON.parse(existingRaw);
        delete statuses[cleanId];
        await kv.put('db_secret_statuses', JSON.stringify(statuses));
      }
    }
    return jsonRes({ ok: true, deleted: true });
  }

  return jsonRes({ ok: false, error: 'Unsupported DB API endpoint' }, 404);
}

// =========================================================================
// Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID ES256) using Web Crypto API
// =========================================================================

function base64UrlEncode(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i += 1) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(str) {
  const clean = String(str || '').trim();
  const pad = '='.repeat((4 - (clean.length % 4)) % 4);
  const b64 = (clean + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function concatUint8Arrays(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export function normalizeWorkerVapidSubject(rawSub) {
  const trimmed = String(rawSub || '').trim();
  if (!trimmed) return 'mailto:admin@rahaltv.com';
  const mailtoMatch = trimmed.match(/^mailto:\s*<?([^\s<>]+@[^\s<>]+\.[^\s<>]+)>?$/i);
  if (mailtoMatch && mailtoMatch[1]) {
    return `mailto:${mailtoMatch[1]}`;
  }
  if (/^https:\/\/[^\s]+$/i.test(trimmed)) {
    return trimmed;
  }
  return 'mailto:admin@rahaltv.com';
}

export function sanitizeWorkerInternalPushUrl(rawUrl) {
  if (rawUrl === undefined || rawUrl === null || rawUrl === '') return '#/';
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return '#/';
  if (trimmed.length > 300 || /[\r\n\\]/.test(trimmed)) return null;
  if (/^(?:https?:|javascript:|data:|vbscript:|file:|mailto:|tel:|\/\/)/i.test(trimmed)) {
    return null;
  }
  if (trimmed === '#' || trimmed === '/') return '#/';
  if (trimmed.startsWith('#/')) return trimmed;
  if (trimmed.startsWith('/')) return `#${trimmed}`;
  return null;
}

export async function createWorkerVapidAuthHeader(params) {
  const audience = new URL(params.endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const headerObj = { typ: 'JWT', alg: 'ES256' };
  const payloadObj = {
    aud: audience,
    exp,
    sub: normalizeWorkerVapidSubject(params.subject),
  };
  const encoder = new TextEncoder();
  const unsignedToken = `${base64UrlEncode(encoder.encode(JSON.stringify(headerObj)))}.${base64UrlEncode(
    encoder.encode(JSON.stringify(payloadObj))
  )}`;

  const pubRaw = base64UrlDecode(params.publicKey);
  if (pubRaw.length !== 65 || pubRaw[0] !== 0x04) {
    throw new Error('Invalid VAPID public key format');
  }
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(pubRaw.slice(1, 33)),
    y: base64UrlEncode(pubRaw.slice(33, 65)),
    d: String(params.privateKey || '').trim(),
    ext: true,
  };
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    encoder.encode(unsignedToken)
  );
  const jwt = `${unsignedToken}.${base64UrlEncode(new Uint8Array(sigBuf))}`;
  return `vapid t=${jwt}, k=${params.publicKey}`;
}

export async function encryptWorkerWebPushPayload(params) {
  const encoder = new TextEncoder();
  const uaPublicBytes = base64UrlDecode(params.p256dh);
  const authSecretBytes = base64UrlDecode(params.auth);
  const plaintextBytes = encoder.encode(String(params.payload || ''));

  const asKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));
  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey },
      asKeyPair.privateKey,
      256
    )
  );

  const keyInfo = concatUint8Arrays([
    encoder.encode('WebPush: info\0'),
    uaPublicBytes,
    asPublicRaw,
  ]);
  const ecdhHkdfKey = await crypto.subtle.importKey('raw', ecdhSecret, 'HKDF', false, ['deriveBits']);
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: authSecretBytes, info: keyInfo },
      ecdhHkdfKey,
      256
    )
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ikmHkdfKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);

  const cek = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: encoder.encode('Content-Encoding: aes128gcm\0'),
      },
      ikmHkdfKey,
      128
    )
  );
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: encoder.encode('Content-Encoding: nonce\0'),
      },
      ikmHkdfKey,
      96
    )
  );

  const paddedPlaintext = concatUint8Arrays([plaintextBytes, new Uint8Array([0x02])]);
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, paddedPlaintext)
  );

  const rsBytes = new Uint8Array(4);
  new DataView(rsBytes.buffer).setUint32(0, 4096, false);
  const header = concatUint8Arrays([
    salt,
    rsBytes,
    new Uint8Array([asPublicRaw.length]),
    asPublicRaw,
  ]);

  return concatUint8Arrays([header, ciphertext]);
}

async function sha256HexWorker(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyWorkerStaffAdmin(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return { ok: false, status: 401, error: 'مطلوب مصادقة المدير للوصول إلى إشعارات الدفع.' };
  }
  const idToken = match[1].trim();
  const webApiKey = env && env.FIREBASE_WEB_API_KEY ? String(env.FIREBASE_WEB_API_KEY).trim() : '';
  if (!webApiKey) {
    return {
      ok: false,
      status: 503,
      error: 'متغير FIREBASE_WEB_API_KEY غير مضبوط في إعدادات Cloudflare Worker للتحقق من صلاحية المدير.',
    };
  }

  const lookup = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(webApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!lookup.ok) {
    return { ok: false, status: 401, error: 'جلسة المصادقة غير صالحة أو منتهية.' };
  }
  const data = await lookup.json();
  const user = data && data.users && data.users[0];
  const uid = String((user && user.localId) || '').trim();
  const email = String((user && user.email) || '').toLowerCase().trim();
  if (!uid || !email) {
    return { ok: false, status: 401, error: 'بيانات الحساب غير مكتملة.' };
  }

  const allowedOwners = String(
    (env && env.ADMIN_OWNER_EMAILS) ||
      'rahalahmed348@gmail.com,mfeshmeny2@gmail.com,ccicada6@gmail.com,bebraheem439@gmail.com'
  )
    .toLowerCase()
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  if (user.emailVerified && allowedOwners.includes(email)) {
    return { ok: true, uid, email, role: 'owner' };
  }

  const projectId = String((env && env.FIREBASE_PROJECT_ID) || 'rahaal-8e5f1').trim();
  const databaseId = String((env && env.FIREBASE_DATABASE_ID) || '(default)').trim() || '(default)';
  if (projectId) {
    const fsResp = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}/databases/${encodeURIComponent(databaseId)}/documents/admins/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    if (fsResp.ok) {
      const docJson = await fsResp.json().catch(() => ({}));
      const roleVal = docJson && docJson.fields && docJson.fields.role && docJson.fields.role.stringValue;
      return { ok: true, uid, email, role: roleVal === 'moderator' ? 'moderator' : 'owner' };
    }
  }

  return { ok: false, status: 403, error: 'ليست لديك صلاحية إدارية لإرسال الإشعارات.' };
}

function validateWorkerPushSub(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'بيانات اشتراك الإشعارات غير صالحة.' };
  }
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint.trim() : '';
  if (!endpoint || endpoint.length > 1500) {
    return { ok: false, error: 'عنوان اشتراك الإشعارات غير صالح.' };
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    return { ok: false, error: 'صيغة عنوان اشتراك الإشعارات غير صالحة.' };
  }
  if (parsedUrl.protocol !== 'https:' || isBlockedHost(parsedUrl.hostname)) {
    return { ok: false, error: 'يجب أن يكون عنوان خدمة الإشعارات عبر HTTPS عام وموثوق.' };
  }
  const p256dh = raw.keys && typeof raw.keys.p256dh === 'string' ? raw.keys.p256dh.trim() : '';
  const auth = raw.keys && typeof raw.keys.auth === 'string' ? raw.keys.auth.trim() : '';
  if (!/^[A-Za-z0-9_-]{32,256}=*$/.test(p256dh)) {
    return { ok: false, error: 'مفتاح التشفير p256dh غير صالح.' };
  }
  if (!/^[A-Za-z0-9_-]{12,128}=*$/.test(auth)) {
    return { ok: false, error: 'مفتاح المصادقة auth غير صالح.' };
  }
  return {
    ok: true,
    endpoint,
    expirationTime: typeof raw.expirationTime === 'number' && Number.isFinite(raw.expirationTime) ? raw.expirationTime : null,
    keys: { p256dh, auth },
  };
}

async function handleWorkerPushApi(request, env, pathname) {
  const jsonRes = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });

  const vapidPublicKey = String((env && env.VAPID_PUBLIC_KEY) || '').trim();
  const vapidPrivateKey = String((env && env.VAPID_PRIVATE_KEY) || '').trim();
  const vapidSubject = normalizeWorkerVapidSubject(env && env.VAPID_SUBJECT);
  const kv = (env && (env.PUSH_SUBSCRIPTIONS_KV || env.DB_CONFIG_KV)) || null;
  const KV_KEY = 'push_store_v1';

  const readPushStore = async () => {
    if (!kv) return { subscriptions: {}, recentSends: [] };
    try {
      const raw = await kv.get(KV_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        subscriptions: parsed && typeof parsed.subscriptions === 'object' && parsed.subscriptions ? parsed.subscriptions : {},
        recentSends: Array.isArray(parsed && parsed.recentSends) ? parsed.recentSends : [],
      };
    } catch {
      return { subscriptions: {}, recentSends: [] };
    }
  };

  if (pathname === '/api/push/config' && request.method === 'GET') {
    if (!vapidPublicKey || !vapidPrivateKey) {
      return jsonRes(
        {
          ok: false,
          error: 'مفاتيح VAPID غير مضبوطة في متغيرات Cloudflare Worker (أضف VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY وربط KV).',
        },
        503
      );
    }
    return jsonRes({ ok: true, enabled: true, publicKey: vapidPublicKey });
  }

  if (pathname === '/api/push/subscribe' && request.method === 'POST') {
    if (!kv) {
      return jsonRes(
        { ok: false, error: 'مساحة التخزين KV (PUSH_SUBSCRIPTIONS_KV أو DB_CONFIG_KV) غير مربوطة في Cloudflare Worker.' },
        503
      );
    }
    const body = await request.json().catch(() => ({}));
    const check = validateWorkerPushSub(body && body.subscription ? body.subscription : body);
    if (!check.ok) {
      return jsonRes({ ok: false, error: check.error }, 400);
    }
    const id = await sha256HexWorker(check.endpoint);
    const store = await readPushStore();
    const existing = store.subscriptions[id];
    const now = new Date().toISOString();
    store.subscriptions[id] = {
      id,
      endpoint: check.endpoint,
      expirationTime: check.expirationTime,
      keys: check.keys,
      createdAt: (existing && existing.createdAt) || now,
      updatedAt: now,
    };
    await kv.put(KV_KEY, JSON.stringify(store));
    return jsonRes({ ok: true, subscribed: true, alreadyRegistered: Boolean(existing) });
  }

  if (pathname === '/api/push/unsubscribe' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
    if (!endpoint) {
      return jsonRes({ ok: false, error: 'عنوان الاشتراك مطلوب لإلغاء التفعيل.' }, 400);
    }
    if (!kv) {
      return jsonRes({ ok: true, unsubscribed: true, removed: false });
    }
    const id = await sha256HexWorker(endpoint);
    const store = await readPushStore();
    const existed = Boolean(store.subscriptions[id]);
    if (existed) {
      delete store.subscriptions[id];
      await kv.put(KV_KEY, JSON.stringify(store));
    }
    return jsonRes({ ok: true, unsubscribed: true, removed: existed });
  }

  if (pathname === '/api/push/admin/stats' && request.method === 'GET') {
    const auth = await verifyWorkerStaffAdmin(request, env);
    if (!auth.ok) return jsonRes({ ok: false, error: auth.error }, auth.status);
    const store = await readPushStore();
    return jsonRes({
      ok: true,
      totalSubscribers: Object.keys(store.subscriptions).length,
      vapidSource: 'env',
      vapidConfiguredInEnv: Boolean(vapidPublicKey && vapidPrivateKey),
      recentSends: store.recentSends.slice(0, 10),
    });
  }

  if ((pathname === '/api/push/send-test' || pathname === '/api/push/broadcast') && request.method === 'POST') {
    const auth = await verifyWorkerStaffAdmin(request, env);
    if (!auth.ok) return jsonRes({ ok: false, error: auth.error }, auth.status);
    if (!vapidPublicKey || !vapidPrivateKey || !kv) {
      return jsonRes(
        { ok: false, error: 'تأكد من ضبط VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY وربط KV في Cloudflare Worker.' },
        503
      );
    }

    const body = await request.json().catch(() => ({}));
    const isBroadcast = pathname === '/api/push/broadcast';
    if (isBroadcast && body.confirmed !== true) {
      return jsonRes({ ok: false, error: 'يجب تأكيد الإرسال لجميع المشتركين عبر نافذة التأكيد قبل التنفيذ.' }, 400);
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const msgBody = typeof body.body === 'string' ? body.body.trim() : '';
    const cleanUrl = sanitizeWorkerInternalPushUrl(body.url);
    if (!title || title.length > 120) {
      return jsonRes({ ok: false, error: 'عنوان الإشعار مطلوب (بحد أقصى 120 حرفاً).' }, 400);
    }
    if (!msgBody || msgBody.length > 300) {
      return jsonRes({ ok: false, error: 'محتوى الإشعار مطلوب (بحد أقصى 300 حرف).' }, 400);
    }
    if (!cleanUrl) {
      return jsonRes({ ok: false, error: 'الرابط المرفق غير مسموح به — يُسمح فقط بالروابط الداخلية (#/...).' }, 400);
    }

    const store = await readPushStore();
    let targets = [];
    if (isBroadcast) {
      targets = Object.values(store.subscriptions);
      if (targets.length === 0) {
        return jsonRes({ ok: false, error: 'لا يوجد مشتركون مسجلون لاستلام الإشعار حالياً.' }, 400);
      }
    } else {
      const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
      if (!endpoint) {
        return jsonRes({ ok: false, error: 'يرجى تفعيل الإشعارات على جهازك الحالي أولاً لإرسال إشعار تجربة.' }, 400);
      }
      const id = await sha256HexWorker(endpoint);
      const found = store.subscriptions[id];
      if (!found) {
        return jsonRes({ ok: false, error: 'اشتراك هذا الجهاز غير مسجّل على الخادم؛ اضغط تفعيل الإشعارات أولاً.' }, 404);
      }
      targets = [found];
    }

    const payloadJson = JSON.stringify({
      title,
      body: msgBody,
      url: cleanUrl,
      tag: isBroadcast ? `rahaltv-msg-${Date.now()}` : 'rahaltv-test',
    });

    let acceptedCount = 0;
    let failedCount = 0;
    const expiredIds = [];

    for (const sub of targets) {
      try {
        const authHeader = await createWorkerVapidAuthHeader({
          endpoint: sub.endpoint,
          publicKey: vapidPublicKey,
          privateKey: vapidPrivateKey,
          subject: vapidSubject,
        });
        const encryptedBody = await encryptWorkerWebPushPayload({
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          payload: payloadJson,
        });
        const pushResp = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: '3600',
          },
          body: encryptedBody,
        });
        if (pushResp.status >= 200 && pushResp.status < 300) {
          acceptedCount += 1;
        } else if (pushResp.status === 404 || pushResp.status === 410) {
          expiredIds.push(sub.id);
        } else {
          failedCount += 1;
        }
      } catch {
        failedCount += 1;
      }
    }

    for (const expId of expiredIds) {
      delete store.subscriptions[expId];
    }
    store.recentSends = [
      {
        id: `push_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        mode: isBroadcast ? 'broadcast' : 'test',
        title,
        url: cleanUrl,
        sentAt: new Date().toISOString(),
        sentBy: auth.email || auth.uid,
        totalTargeted: targets.length,
        acceptedCount,
        failedCount,
        cleanedExpiredCount: expiredIds.length,
      },
      ...store.recentSends,
    ].slice(0, 20);
    await kv.put(KV_KEY, JSON.stringify(store));

    return jsonRes({
      ok: true,
      mode: isBroadcast ? 'broadcast' : 'test',
      totalTargeted: targets.length,
      acceptedCount,
      failedCount,
      cleanedExpiredCount: expiredIds.length,
      remainingSubscribers: Object.keys(store.subscriptions).length,
      deliveryNote:
        'يمثّل عدد القبول استجابة خادم الإشعارات (Push Service) بقبول الطلب فقط، ولا يُعد قياساً لوصوله الفعلي إلى الجهاز أو قراءته.',
    });
  }

  return jsonRes({ ok: false, error: 'Unsupported Web Push API endpoint' }, 404);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const reqUrl = new URL(request.url);

    if (reqUrl.pathname === '/api/client-logs' && request.method === 'POST') {
      return handleClientErrorLog(request);
    }

    if (reqUrl.pathname.startsWith('/api/db/')) {
      return handleWorkerDbApi(request, env, reqUrl.pathname);
    }

    if (reqUrl.pathname.startsWith('/api/push/')) {
      return handleWorkerPushApi(request, env, reqUrl.pathname);
    }

    let target = (reqUrl.searchParams.get('url') || '').trim();
    const isPing = reqUrl.searchParams.has('ping');

    if (!target && request.method === 'POST') {
      try {
        const ct = request.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const body = await request.json();
          if (body && typeof body.url === 'string') {
            target = body.url.trim();
          }
        }
      } catch {
        // Ignore invalid POST body
      }
    }

    if (!target && !isPing && env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      try {
        const assetRes = await env.ASSETS.fetch(request);
        if (assetRes.status >= 500) {
          console.error(
            JSON.stringify({
              tag: 'RAHALTV_WORKER_ASSET_ERROR',
              status: assetRes.status,
              pathname: reqUrl.pathname,
              cfRay: request.headers.get('cf-ray') || undefined,
            })
          );
        }
        return assetRes;
      } catch (assetErr) {
        console.error(
          JSON.stringify({
            tag: 'RAHALTV_WORKER_ASSET_EXCEPTION',
            pathname: reqUrl.pathname,
            error: String(assetErr),
            cfRay: request.headers.get('cf-ray') || undefined,
          })
        );
        throw assetErr;
      }
    }

    if (!target) {
      return new Response(
        JSON.stringify({
          ok: true,
          service: 'RahaL TV Proxy Worker',
          version: 3,
          usage: '?url=https://...',
          logsEndpoint: '/api/client-logs',
          note: 'هذا رابط بروكسي السحب وتسجيل الأخطاء الخاص بـ RahaL TV. الصقه في لوحة الإدارة -> الإعدادات -> رابط بروكسي السحب.',
        }),
        {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    let parsedTarget;
    try {
      parsedTarget = new URL(target);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid target url' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    if (!['http:', 'https:'].includes(parsedTarget.protocol) || isBlockedHost(parsedTarget.hostname)) {
      return new Response(JSON.stringify({ ok: false, error: 'Blocked host or protocol' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    try {
      const upstream = await fetch(parsedTarget.toString(), {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
          'Upgrade-Insecure-Requests': '1',
          Referer: `${parsedTarget.origin}/`,
        },
      });

      const body = request.method === 'HEAD' ? null : await upstream.arrayBuffer();
      const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
      const isImageResponse = /^image\//i.test(contentType);
      const xFrame = upstream.headers.get('x-frame-options') || '';
      const csp = upstream.headers.get('content-security-policy') || '';
      return new Response(body, {
        status: upstream.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': isImageResponse && upstream.ok
            ? 'public, max-age=86400, stale-while-revalidate=604800'
            : 'public, max-age=120, stale-while-revalidate=300',
          'X-Final-Url': upstream.url || parsedTarget.toString(),
          'X-Upstream-Status': String(upstream.status),
          ...(xFrame ? { 'X-Upstream-X-Frame-Options': xFrame } : {}),
          ...(csp ? { 'X-Upstream-CSP': csp } : {}),
        },
      });
    } catch (err) {
      console.error(
        JSON.stringify({
          tag: 'RAHALTV_PROXY_UPSTREAM_ERROR',
          targetHost: parsedTarget.hostname,
          error: String(err),
          cfRay: request.headers.get('cf-ray') || undefined,
        })
      );
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  },
};
