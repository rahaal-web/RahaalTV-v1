import type { User } from 'firebase/auth';
import { getCustomApiBaseUrl, isProxyWorkerUrl, normalizeCustomApiBaseUrl } from './clientScraper';
import { getAppBasePrefix } from './permalink';

const STORAGE_PUSH_API_BASE_URL = 'rahaltv_push_api_base_url';

export function getPushApiBaseUrl(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_PUSH_API_BASE_URL) || '';
      if (saved.trim()) return normalizeCustomApiBaseUrl(saved);
    }
  } catch {
    // Ignore storage access issues
  }
  const envPushBase = (import.meta.env?.VITE_PUSH_API_BASE_URL as string | undefined) || '';
  return envPushBase ? normalizeCustomApiBaseUrl(envPushBase) : '';
}

export function setPushApiBaseUrl(rawUrl: string): string {
  const cleaned = rawUrl.trim() ? normalizeCustomApiBaseUrl(rawUrl) : '';
  try {
    if (typeof localStorage !== 'undefined') {
      if (cleaned) {
        localStorage.setItem(STORAGE_PUSH_API_BASE_URL, cleaned);
      } else {
        localStorage.removeItem(STORAGE_PUSH_API_BASE_URL);
      }
    }
  } catch {
    // Ignore storage access issues
  }
  return cleaned;
}

export function shouldSkipPushApiCalls(): boolean {
  if (typeof window === 'undefined') return true;
  if (getPushApiBaseUrl()) return false;
  const customBase = getCustomApiBaseUrl();
  const host = window.location.hostname.toLowerCase();
  if (host.endsWith('.github.io')) {
    return !customBase;
  }
  return false;
}

export function resolvePushApiEndpoint(endpointPath: string): string {
  const normalized = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const explicitPushBase = getPushApiBaseUrl();
  if (explicitPushBase) {
    return `${explicitPushBase}${normalized}`;
  }
  const customBase = getCustomApiBaseUrl();
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  if (host.endsWith('.github.io') && customBase) {
    return `${customBase}${normalized}`;
  }
  if (customBase && !isProxyWorkerUrl(customBase)) {
    return `${customBase}${normalized}`;
  }
  return normalized;
}

export type PushPermissionState = NotificationPermission | 'unsupported';

export interface WebPushCapabilities {
  isSupported: boolean;
  isSecureContext: boolean;
  hasNotification: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  isAppleMobile: boolean;
  isStandalone: boolean;
  requiresHomeScreenInstall: boolean;
  backendAvailable: boolean;
  permission: PushPermissionState;
  unsupportedReason: string | null;
}

export interface WebPushStatusResult {
  capabilities: WebPushCapabilities;
  subscribed: boolean;
  endpoint: string | null;
  serverPublicKeyPresent: boolean;
}

export interface WebPushActionResult {
  ok: boolean;
  subscribed: boolean;
  endpoint: string | null;
  permission: PushPermissionState;
  message: string;
}

export interface AdminPushStats {
  totalSubscribers: number;
  vapidSource: 'env' | 'server_generated';
  vapidConfiguredInEnv: boolean;
  recentSends: Array<{
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
  }>;
}

export interface AdminPushSendResponse {
  ok: boolean;
  mode?: 'test' | 'broadcast';
  totalTargeted?: number;
  acceptedCount?: number;
  failedCount?: number;
  cleanedExpiredCount?: number;
  remainingSubscribers?: number;
  deliveryNote?: string;
  error?: string;
}

export function detectWebPushCapabilities(): WebPushCapabilities {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isSupported: false,
      isSecureContext: false,
      hasNotification: false,
      hasServiceWorker: false,
      hasPushManager: false,
      isAppleMobile: false,
      isStandalone: false,
      requiresHomeScreenInstall: false,
      backendAvailable: false,
      permission: 'unsupported',
      unsupportedReason: 'المتصفح غير متاح في بيئة الخادم.',
    };
  }

  const ua = navigator.userAgent || '';
  const isAppleMobile =
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  const navWithStandalone = navigator as Navigator & { standalone?: boolean };
  const isStandalone =
    navWithStandalone.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches === true;

  const isLocalHost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '::1';
  const isSecureContext = window.isSecureContext === true || isLocalHost;
  const hasNotification = typeof Notification !== 'undefined';
  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasPushManager = 'PushManager' in window;
  const backendAvailable = !shouldSkipPushApiCalls();
  const permission: PushPermissionState = hasNotification ? Notification.permission : 'unsupported';
  const requiresHomeScreenInstall = isAppleMobile && !isStandalone;

  let unsupportedReason: string | null = null;
  if (!isSecureContext) {
    unsupportedReason = 'تتطلب إشعارات الويب اتصالاً مشفراً عبر HTTPS لتعمل بأمان.';
  } else if (requiresHomeScreenInstall) {
    unsupportedReason =
      'على أجهزة iPhone و iPad (iOS 16.4+) يجب أولاً إضافة الموقع إلى الشاشة الرئيسية ثم فتحه من الأيقونة لتفعيل الإشعارات.';
  } else if (!hasNotification || !hasServiceWorker || !hasPushManager) {
    unsupportedReason = 'هذا المتصفح أو الوضع الحالي لا يدعم خدمة إشعارات الدفع (Web Push).';
  } else if (!backendAvailable) {
    unsupportedReason =
      'يتطلب حفظ الاشتراكات وإرسال الإشعارات تشغيل خادم التطبيق (Node Server) على هذا النطاق.';
  }

  const isSupported =
    isSecureContext &&
    !requiresHomeScreenInstall &&
    hasNotification &&
    hasServiceWorker &&
    hasPushManager &&
    backendAvailable;

  return {
    isSupported,
    isSecureContext,
    hasNotification,
    hasServiceWorker,
    hasPushManager,
    isAppleMobile,
    isStandalone,
    requiresHomeScreenInstall,
    backendAvailable,
    permission,
    unsupportedReason,
  };
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getPushServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    return existing;
  }

  // In development mode, register push-sw.js on demand without caching Vite modules.
  if (import.meta.env.DEV) {
    const prefix = getAppBasePrefix();
    const swUrl = `${prefix}/push-sw.js`;
    const reg = await navigator.serviceWorker.register(swUrl, {
      scope: prefix ? `${prefix}/` : '/',
    });
    await navigator.serviceWorker.ready;
    return reg;
  }

  try {
    const readyReg = await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    return readyReg;
  } catch {
    return null;
  }
}

export async function fetchVapidPublicKeyWithReason(): Promise<{
  publicKey: string | null;
  error: string | null;
}> {
  if (shouldSkipPushApiCalls()) {
    return {
      publicKey: null,
      error:
        'الاستضافة الحالية ثابتة (GitHub Pages) ولا تحتوي على خادم إشعارات. أضف رابط خادم التطبيق أو Cloudflare Worker أولاً.',
    };
  }
  try {
    const res = await fetch(resolvePushApiEndpoint('/api/push/config'));
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return {
        publicKey: null,
        error:
          'لم يُعثر على خدمة الإشعارات (/api/push/config) على هذا النطاق. تأكد من تشغيل خادم التطبيق (Node Server) أو تحديث كود Cloudflare Worker.',
      };
    }
    const data = (await res.json()) as { ok?: boolean; publicKey?: string; error?: string };
    if (!res.ok || !data.ok || !data.publicKey) {
      return {
        publicKey: null,
        error: data.error || 'تعذر قراءة مفتاح التشفير (VAPID) من الخادم.',
      };
    }
    return { publicKey: data.publicKey, error: null };
  } catch {
    return {
      publicKey: null,
      error: 'تعذر الاتصال بخادم الإشعارات (/api/push/config).',
    };
  }
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  const { publicKey } = await fetchVapidPublicKeyWithReason();
  return publicKey;
}

export async function inspectWebPushStatus(): Promise<WebPushStatusResult> {
  const capabilities = detectWebPushCapabilities();
  let subscribed = false;
  let endpoint: string | null = null;

  if (capabilities.hasServiceWorker && capabilities.hasPushManager) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'pushManager' in reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          subscribed = true;
          endpoint = sub.endpoint;
        }
      }
    } catch {
      // Ignore probe error
    }
  }

  const publicKey = capabilities.backendAvailable ? await fetchVapidPublicKey() : null;

  return {
    capabilities,
    subscribed,
    endpoint,
    serverPublicKeyPresent: Boolean(publicKey),
  };
}

export async function subscribeDeviceToWebPush(): Promise<WebPushActionResult> {
  const caps = detectWebPushCapabilities();
  if (caps.requiresHomeScreenInstall) {
    return {
      ok: false,
      subscribed: false,
      endpoint: null,
      permission: caps.permission,
      message:
        'على أجهزة Apple، أضف التطبيق إلى الشاشة الرئيسية أولاً عبر زر المشاركة ثم افتحه من هناك لتفعيل الإشعارات.',
    };
  }
  if (!caps.isSupported) {
    return {
      ok: false,
      subscribed: false,
      endpoint: null,
      permission: caps.permission,
      message: caps.unsupportedReason || 'متصفحك الحالي لا يدعم إشعارات الدفع.',
    };
  }

  if (Notification.permission === 'denied') {
    return {
      ok: false,
      subscribed: false,
      endpoint: null,
      permission: 'denied',
      message:
        'تم رفض إذن الإشعارات سابقاً. يمكنك إعادة السماح من إعدادات المتصفح أو إعدادات الموقع.',
    };
  }

  let permission: NotificationPermission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    return {
      ok: false,
      subscribed: false,
      endpoint: null,
      permission,
      message:
        permission === 'denied'
          ? 'تم رفض إذن الإشعارات. لتفعيلها لاحقاً اسمح بالإشعارات من إعدادات المتصفح.'
          : 'لم يتم منح إذن الإشعارات.',
    };
  }

  const vapidCheck = await fetchVapidPublicKeyWithReason();
  const publicKey = vapidCheck.publicKey;
  if (!publicKey) {
    return {
      ok: false,
      subscribed: false,
      endpoint: null,
      permission,
      message: vapidCheck.error || 'تعذر الحصول على مفتاح التشفير (VAPID) من الخادم.',
    };
  }

  const reg = await getPushServiceWorkerRegistration();
  if (!reg || !('pushManager' in reg)) {
    return {
      ok: false,
      subscribed: false,
      endpoint: null,
      permission,
      message: 'لم يتمكن المتصفح من تجهيز Service Worker لهذا النطاق.',
    };
  }

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    const appServerKey = urlBase64ToUint8Array(publicKey);
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey.buffer as ArrayBuffer,
    });
  }

  const subJson = subscription.toJSON();
  const res = await fetch(resolvePushApiEndpoint('/api/push/subscribe'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subJson }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };

  if (!res.ok || !payload.ok) {
    return {
      ok: false,
      subscribed: false,
      endpoint: null,
      permission,
      message: payload.error || 'تعذر حفظ الاشتراك على الخادم.',
    };
  }

  return {
    ok: true,
    subscribed: true,
    endpoint: subscription.endpoint,
    permission,
    message: 'تم تفعيل الإشعارات على هذا الجهاز بنجاح.',
  };
}

export async function unsubscribeDeviceFromWebPush(): Promise<WebPushActionResult> {
  const caps = detectWebPushCapabilities();
  let endpoint: string | null = null;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && 'pushManager' in reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        endpoint = sub.endpoint;
        await sub.unsubscribe();
      }
    }
  } catch {
    // Continue notifying server cleanup if endpoint was known
  }

  if (endpoint && caps.backendAvailable) {
    await fetch(resolvePushApiEndpoint('/api/push/unsubscribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }).catch(() => undefined);
  }

  return {
    ok: true,
    subscribed: false,
    endpoint: null,
    permission: caps.permission,
    message: 'تم إلغاء اشتراك هذا الجهاز ولن يستقبل إشعارات جديدة.',
  };
}

export async function fetchAdminPushStats(user: User): Promise<AdminPushStats> {
  if (shouldSkipPushApiCalls()) {
    throw new Error(
      'الاستضافة الحالية ثابتة (GitHub Pages) ولا تحتوي على خادم إشعارات. أضف رابط خادم الإشعارات أدناه أو استخدم استضافة تدعم Node/Cloudflare Worker.'
    );
  }
  const token = await user.getIdToken();
  const res = await fetch(resolvePushApiEndpoint('/api/push/admin/stats'), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(
      'نقطة خادم الإشعارات (/api/push/admin/stats) غير متاحة على هذا النطاق. تأكد من تحديث Cloudflare Worker أو ضبط رابط خادم Node.'
    );
  }
  const json = (await res.json().catch(() => ({}))) as Partial<AdminPushStats> & {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || 'تعذر جلب إحصائيات المشتركين.');
  }
  return {
    totalSubscribers: Number(json.totalSubscribers || 0),
    vapidSource: json.vapidSource === 'env' ? 'env' : 'server_generated',
    vapidConfiguredInEnv: Boolean(json.vapidConfiguredInEnv),
    recentSends: Array.isArray(json.recentSends) ? json.recentSends : [],
  };
}

export async function sendAdminTestPush(params: {
  user: User;
  title: string;
  body: string;
  url: string;
  endpoint: string;
}): Promise<AdminPushSendResponse> {
  const token = await params.user.getIdToken();
  const res = await fetch(resolvePushApiEndpoint('/api/push/send-test'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: params.title,
      body: params.body,
      url: params.url,
      endpoint: params.endpoint,
    }),
  });
  return (await res.json().catch(() => ({ ok: false, error: 'استجابة غير صالحة من الخادم.' }))) as AdminPushSendResponse;
}

export async function sendAdminBroadcastPush(params: {
  user: User;
  title: string;
  body: string;
  url: string;
  confirmed: boolean;
}): Promise<AdminPushSendResponse> {
  const token = await params.user.getIdToken();
  const res = await fetch(resolvePushApiEndpoint('/api/push/broadcast'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: params.title,
      body: params.body,
      url: params.url,
      confirmed: params.confirmed,
    }),
  });
  return (await res.json().catch(() => ({ ok: false, error: 'استجابة غير صالحة من الخادم.' }))) as AdminPushSendResponse;
}
