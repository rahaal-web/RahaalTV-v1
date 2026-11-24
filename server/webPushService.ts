import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Express, NextFunction, Request, Response } from 'express';
import { generateVAPIDKeys, sendNotification } from 'web-push';

export interface StoredPushSubscription {
  id: string;
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: string;
  updatedAt: string;
  userAgentSummary?: string;
}

export interface PushSendLogEntry {
  id: string;
  mode: 'test' | 'broadcast';
  title: string;
  url: string;
  sentAt: string;
  sentBy: string;
  totalTargeted: number;
  acceptedCount: number;
  failedCount: number;
  cleanedExpiredCount: number;
}

interface PushStoreFile {
  subscriptions: Record<string, StoredPushSubscription>;
  recentSends: PushSendLogEntry[];
}

interface VapidKeyFile {
  publicKey: string;
  privateKey: string;
  subject: string;
  createdAt: string;
}

export interface VerifiedStaffAdmin {
  uid: string;
  email: string;
  role: 'owner' | 'moderator';
}

export interface WebPushServiceOptions {
  storeFilePath?: string;
  vapidFilePath?: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
  sendNotificationFn?: typeof sendNotification;
  verifyStaffAdminFn?: (authHeader: string) => Promise<VerifiedStaffAdmin | null>;
  isBlockedHostFn?: (hostname: string) => boolean;
}

const PRIMARY_ADMIN_EMAILS = new Set([
  'rahalahmed348@gmail.com',
  'mfeshmeny2@gmail.com',
  'ccicada6@gmail.com',
  'bebraheem439@gmail.com',
]);

function readFirebaseConfig(): { apiKey: string; projectId: string; databaseId: string } {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  try {
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
        apiKey?: string;
        projectId?: string;
        firestoreDatabaseId?: string;
      };
      return {
        apiKey: String(process.env.FIREBASE_API_KEY || parsed.apiKey || '').trim(),
        projectId: String(parsed.projectId || '').trim(),
        databaseId: String(parsed.firestoreDatabaseId || '(default)').trim() || '(default)',
      };
    }
  } catch {
    // Ignore read/parse errors
  }
  return {
    apiKey: String(process.env.FIREBASE_API_KEY || '').trim(),
    projectId: '',
    databaseId: '(default)',
  };
}

export function defaultIsBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
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

export function sanitizeInternalPushUrl(rawUrl: unknown): string | null {
  if (rawUrl === undefined || rawUrl === null || rawUrl === '') return '#/';
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return '#/';
  if (trimmed.length > 300 || /[\r\n\\]/.test(trimmed)) return null;
  if (/^(?:https?:|javascript:|data:|vbscript:|file:|mailto:|tel:|\/\/)/i.test(trimmed)) {
    return null;
  }
  if (trimmed === '#' || trimmed === '/') return '#/';
  if (trimmed.startsWith('#/')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    // Convert leading internal slash route to unified hash path
    return `#${trimmed}`;
  }
  return null;
}

export function hashSubscriptionEndpoint(endpoint: string): string {
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

export function validatePushSubscriptionInput(
  raw: unknown,
  isBlockedHostFn: (hostname: string) => boolean = defaultIsBlockedHost
):
  | {
      ok: true;
      endpoint: string;
      expirationTime: number | null;
      keys: { p256dh: string; auth: string };
    }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'بيانات اشتراك الإشعارات غير صالحة.' };
  }
  const candidate = raw as {
    endpoint?: unknown;
    expirationTime?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };

  const endpoint = typeof candidate.endpoint === 'string' ? candidate.endpoint.trim() : '';
  if (!endpoint || endpoint.length > 1500) {
    return { ok: false, error: 'عنوان اشتراك الإشعارات غير صالح.' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    return { ok: false, error: 'صيغة عنوان اشتراك الإشعارات غير صالحة.' };
  }

  if (parsedUrl.protocol !== 'https:' || isBlockedHostFn(parsedUrl.hostname)) {
    return { ok: false, error: 'يجب أن يكون عنوان خدمة الإشعارات عبر HTTPS عام وموثوق.' };
  }

  const p256dh = typeof candidate.keys?.p256dh === 'string' ? candidate.keys.p256dh.trim() : '';
  const auth = typeof candidate.keys?.auth === 'string' ? candidate.keys.auth.trim() : '';

  if (!/^[A-Za-z0-9_-]{32,256}=*$/.test(p256dh)) {
    return { ok: false, error: 'مفتاح التشفير p256dh غير صالح.' };
  }
  if (!/^[A-Za-z0-9_-]{12,128}=*$/.test(auth)) {
    return { ok: false, error: 'مفتاح المصادقة auth غير صالح.' };
  }

  const expirationTime =
    typeof candidate.expirationTime === 'number' && Number.isFinite(candidate.expirationTime)
      ? candidate.expirationTime
      : null;

  return {
    ok: true,
    endpoint,
    expirationTime,
    keys: { p256dh, auth },
  };
}

export async function defaultVerifyStaffAdmin(authHeader: string): Promise<VerifiedStaffAdmin | null> {
  const match = String(authHeader || '').match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;
  const idToken = match[1].trim();
  const { apiKey, projectId, databaseId } = readFirebaseConfig();
  if (!apiKey) return null;

  try {
    const lookupResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!lookupResp.ok) return null;
    const data = (await lookupResp.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    const uid = String(user?.localId || '').trim();
    const email = String(user?.email || '').trim().toLowerCase();
    if (!uid || !email) return null;

    if (user?.emailVerified && PRIMARY_ADMIN_EMAILS.has(email)) {
      return { uid, email, role: 'owner' };
    }

    if (projectId) {
      const firestoreResp = await fetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/admins/${encodeURIComponent(uid)}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      );
      if (firestoreResp.ok) {
        const docJson = (await firestoreResp.json()) as {
          fields?: { role?: { stringValue?: string } };
        };
        const roleVal = docJson.fields?.role?.stringValue;
        return {
          uid,
          email,
          role: roleVal === 'moderator' ? 'moderator' : 'owner',
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function createWebPushService(options: WebPushServiceOptions = {}) {
  const storeFilePath =
    options.storeFilePath || path.resolve(process.cwd(), '.rahaltv-push-data.json');
  const vapidFilePath =
    options.vapidFilePath || path.resolve(process.cwd(), '.rahaltv-push-vapid.json');
  const sendNotificationFn = options.sendNotificationFn || sendNotification;
  const verifyStaffAdminFn = options.verifyStaffAdminFn || defaultVerifyStaffAdmin;
  const isBlockedHostFn = options.isBlockedHostFn || defaultIsBlockedHost;

  function resolveVapidKeys(): {
    publicKey: string;
    privateKey: string;
    subject: string;
    source: 'env' | 'server_generated';
  } {
    const envPub = String(options.vapidPublicKey ?? process.env.VAPID_PUBLIC_KEY ?? '').trim();
    const envPriv = String(options.vapidPrivateKey ?? process.env.VAPID_PRIVATE_KEY ?? '').trim();
    const rawSub = String(options.vapidSubject ?? process.env.VAPID_SUBJECT ?? '').trim();
    const subject =
      rawSub && (/^mailto:.+@.+\..+$/i.test(rawSub) || /^https:\/\/.+/i.test(rawSub))
        ? rawSub
        : 'mailto:admin@rahaltv.com';

    if (envPub && envPriv) {
      return { publicKey: envPub, privateKey: envPriv, subject, source: 'env' };
    }

    try {
      if (fs.existsSync(vapidFilePath)) {
        const saved = JSON.parse(fs.readFileSync(vapidFilePath, 'utf8')) as Partial<VapidKeyFile>;
        if (saved.publicKey && saved.privateKey) {
          return {
            publicKey: saved.publicKey,
            privateKey: saved.privateKey,
            subject: saved.subject || subject,
            source: 'server_generated',
          };
        }
      }
    } catch {
      // Regenerate below if unreadable
    }

    const generated = generateVAPIDKeys();
    const filePayload: VapidKeyFile = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject,
      createdAt: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(vapidFilePath, JSON.stringify(filePayload, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch {
      // Ignore write error in read-only filesystem
    }
    return {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject,
      source: 'server_generated',
    };
  }

  function readStore(): PushStoreFile {
    try {
      if (!fs.existsSync(storeFilePath)) {
        return { subscriptions: {}, recentSends: [] };
      }
      const parsed = JSON.parse(fs.readFileSync(storeFilePath, 'utf8')) as Partial<PushStoreFile>;
      return {
        subscriptions:
          parsed.subscriptions && typeof parsed.subscriptions === 'object'
            ? parsed.subscriptions
            : {},
        recentSends: Array.isArray(parsed.recentSends) ? parsed.recentSends : [],
      };
    } catch {
      return { subscriptions: {}, recentSends: [] };
    }
  }

  function writeStore(data: PushStoreFile): void {
    fs.writeFileSync(storeFilePath, JSON.stringify(data, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  function getPublicConfig() {
    const vapid = resolveVapidKeys();
    return {
      enabled: true,
      publicKey: vapid.publicKey,
      vapidSource: vapid.source,
    };
  }

  function subscribe(rawSub: unknown, userAgent?: string) {
    const check = validatePushSubscriptionInput(rawSub, isBlockedHostFn);
    if (!check.ok) {
      return { ok: false as const, status: 400, error: check.error };
    }
    const id = hashSubscriptionEndpoint(check.endpoint);
    const store = readStore();
    const existing = store.subscriptions[id];
    const now = new Date().toISOString();
    store.subscriptions[id] = {
      id,
      endpoint: check.endpoint,
      expirationTime: check.expirationTime,
      keys: check.keys,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      userAgentSummary: userAgent ? String(userAgent).slice(0, 120) : existing?.userAgentSummary,
    };
    writeStore(store);
    return {
      ok: true as const,
      subscribed: true,
      alreadyRegistered: Boolean(existing),
    };
  }

  function unsubscribe(rawEndpoint: unknown) {
    const endpoint = typeof rawEndpoint === 'string' ? rawEndpoint.trim() : '';
    if (!endpoint) {
      return { ok: false as const, status: 400, error: 'عنوان الاشتراك مطلوب لإلغاء التفعيل.' };
    }
    const id = hashSubscriptionEndpoint(endpoint);
    const store = readStore();
    const existed = Boolean(store.subscriptions[id]);
    if (existed) {
      delete store.subscriptions[id];
      writeStore(store);
    }
    return {
      ok: true as const,
      unsubscribed: true,
      removed: existed,
    };
  }

  function getAdminStats() {
    const store = readStore();
    const vapid = resolveVapidKeys();
    return {
      totalSubscribers: Object.keys(store.subscriptions).length,
      vapidSource: vapid.source,
      vapidConfiguredInEnv: vapid.source === 'env',
      recentSends: store.recentSends.slice(0, 10),
    };
  }

  function validateMessagePayload(input: {
    title?: unknown;
    body?: unknown;
    url?: unknown;
  }):
    | { ok: true; title: string; body: string; url: string }
    | { ok: false; status: number; error: string } {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const body = typeof input.body === 'string' ? input.body.trim() : '';
    const cleanUrl = sanitizeInternalPushUrl(input.url);

    if (!title || title.length > 120) {
      return { ok: false, status: 400, error: 'عنوان الإشعار مطلوب (بحد أقصى 120 حرفاً).' };
    }
    if (!body || body.length > 300) {
      return { ok: false, status: 400, error: 'محتوى الإشعار مطلوب (بحد أقصى 300 حرف).' };
    }
    if (!cleanUrl) {
      return {
        ok: false,
        status: 400,
        error: 'الرابط المرفق غير مسموح به — يُسمح فقط بالروابط الداخلية داخل التطبيق (#/...).',
      };
    }

    return { ok: true, title, body, url: cleanUrl };
  }

  async function sendToSubscriptions(params: {
    mode: 'test' | 'broadcast';
    targets: StoredPushSubscription[];
    title: string;
    body: string;
    url: string;
    sentBy: string;
  }) {
    const vapid = resolveVapidKeys();
    const payloadJson = JSON.stringify({
      title: params.title,
      body: params.body,
      url: params.url,
      tag: params.mode === 'test' ? 'rahaltv-test' : `rahaltv-msg-${Date.now()}`,
    });

    const vapidDetails = {
      subject: vapid.subject,
      publicKey: vapid.publicKey,
      privateKey: vapid.privateKey,
    };

    let acceptedCount = 0;
    let failedCount = 0;
    const expiredIds: string[] = [];

    const BATCH_SIZE = 15;
    for (let i = 0; i < params.targets.length; i += BATCH_SIZE) {
      const chunk = params.targets.slice(i, i + BATCH_SIZE);
      await Promise.all(
        chunk.map(async (sub) => {
          try {
            await sendNotificationFn(
              {
                endpoint: sub.endpoint,
                expirationTime: sub.expirationTime,
                keys: sub.keys,
              },
              payloadJson,
              {
                vapidDetails,
                TTL: 3600,
              }
            );
            acceptedCount += 1;
          } catch (err: unknown) {
            const statusCode =
              typeof err === 'object' && err !== null && 'statusCode' in err
                ? Number((err as { statusCode?: unknown }).statusCode)
                : 0;
            if (statusCode === 404 || statusCode === 410) {
              expiredIds.push(sub.id);
            } else {
              failedCount += 1;
            }
          }
        })
      );
    }

    const store = readStore();
    for (const expId of expiredIds) {
      delete store.subscriptions[expId];
    }

    const logEntry: PushSendLogEntry = {
      id: `push_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      mode: params.mode,
      title: params.title,
      url: params.url,
      sentAt: new Date().toISOString(),
      sentBy: params.sentBy,
      totalTargeted: params.targets.length,
      acceptedCount,
      failedCount,
      cleanedExpiredCount: expiredIds.length,
    };

    store.recentSends = [logEntry, ...store.recentSends].slice(0, 20);
    writeStore(store);

    return {
      ok: true as const,
      mode: params.mode,
      totalTargeted: params.targets.length,
      acceptedCount,
      failedCount,
      cleanedExpiredCount: expiredIds.length,
      remainingSubscribers: Object.keys(store.subscriptions).length,
      deliveryNote:
        'يمثّل عدد القبول استجابة خادم الإشعارات (Push Service) بقبول الطلب فقط، ولا يُعد قياساً لوصوله الفعلي إلى الجهاز أو قراءته.',
    };
  }

  async function sendTest(params: {
    title?: unknown;
    body?: unknown;
    url?: unknown;
    endpoint?: unknown;
    sentBy: string;
  }) {
    const validated = validateMessagePayload(params);
    if (!validated.ok) return validated;

    const endpoint = typeof params.endpoint === 'string' ? params.endpoint.trim() : '';
    if (!endpoint) {
      return {
        ok: false as const,
        status: 400,
        error: 'يرجى تفعيل الإشعارات على جهازك الحالي أولاً لإرسال إشعار تجربة.',
      };
    }

    const id = hashSubscriptionEndpoint(endpoint);
    const store = readStore();
    const target = store.subscriptions[id];
    if (!target) {
      return {
        ok: false as const,
        status: 404,
        error: 'اشتراك هذا الجهاز غير مسجّل على الخادم؛ اضغط تفعيل الإشعارات أولاً.',
      };
    }

    return sendToSubscriptions({
      mode: 'test',
      targets: [target],
      title: validated.title,
      body: validated.body,
      url: validated.url,
      sentBy: params.sentBy,
    });
  }

  async function broadcast(params: {
    title?: unknown;
    body?: unknown;
    url?: unknown;
    confirmed?: unknown;
    sentBy: string;
  }) {
    if (params.confirmed !== true) {
      return {
        ok: false as const,
        status: 400,
        error: 'يجب تأكيد الإرسال لجميع المشتركين عبر نافذة التأكيد قبل التنفيذ.',
      };
    }

    const validated = validateMessagePayload(params);
    if (!validated.ok) return validated;

    const store = readStore();
    const targets = Object.values(store.subscriptions);
    if (targets.length === 0) {
      return {
        ok: false as const,
        status: 400,
        error: 'لا يوجد مشتركون مسجلون لاستلام الإشعار حالياً.',
      };
    }

    return sendToSubscriptions({
      mode: 'broadcast',
      targets,
      title: validated.title,
      body: validated.body,
      url: validated.url,
      sentBy: params.sentBy,
    });
  }

  return {
    getPublicConfig,
    subscribe,
    unsubscribe,
    getAdminStats,
    sendTest,
    broadcast,
    verifyStaffAdminFn,
  };
}

export type WebPushServiceInstance = ReturnType<typeof createWebPushService>;

export function attachPushRoutes(app: Express, service: WebPushServiceInstance): void {
  const requireStaffAdmin = async (
    req: Request & { staffAdmin?: VerifiedStaffAdmin },
    res: Response,
    next: NextFunction
  ) => {
    const authHeader = String(req.headers.authorization || '');
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) {
      return res.status(401).json({
        ok: false,
        error: 'مطلوب مصادقة المدير للوصول إلى إشعارات الدفع.',
      });
    }

    const verified = await service.verifyStaffAdminFn(authHeader);
    if (!verified) {
      return res.status(403).json({
        ok: false,
        error: 'ليست لديك صلاحية إدارية لإرسال الإشعارات أو جلسة الحساب غير صالحة.',
      });
    }

    req.staffAdmin = verified;
    return next();
  };

  app.get('/api/push/config', (_req, res) => {
    const cfg = service.getPublicConfig();
    return res.json({
      ok: true,
      enabled: cfg.enabled,
      publicKey: cfg.publicKey,
    });
  });

  app.post('/api/push/subscribe', (req, res) => {
    const result = service.subscribe(req.body?.subscription ?? req.body, req.headers['user-agent']);
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }
    return res.json(result);
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    const result = service.unsubscribe(req.body?.endpoint);
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }
    return res.json(result);
  });

  app.get('/api/push/admin/stats', requireStaffAdmin, (_req, res) => {
    const stats = service.getAdminStats();
    return res.json({
      ok: true,
      ...stats,
    });
  });

  app.post('/api/push/send-test', requireStaffAdmin, async (req: Request & { staffAdmin?: VerifiedStaffAdmin }, res: Response) => {
    const result = await service.sendTest({
      title: req.body?.title,
      body: req.body?.body,
      url: req.body?.url,
      endpoint: req.body?.endpoint,
      sentBy: req.staffAdmin?.email || req.staffAdmin?.uid || 'admin',
    });
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }
    return res.json(result);
  });

  app.post('/api/push/broadcast', requireStaffAdmin, async (req: Request & { staffAdmin?: VerifiedStaffAdmin }, res: Response) => {
    const result = await service.broadcast({
      title: req.body?.title,
      body: req.body?.body,
      url: req.body?.url,
      confirmed: req.body?.confirmed,
      sentBy: req.staffAdmin?.email || req.staffAdmin?.uid || 'admin',
    });
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }
    return res.json(result);
  });
}

