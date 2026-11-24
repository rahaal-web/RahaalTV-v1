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
