import { deleteApp, initializeApp } from 'firebase/app';
import {
  Auth,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocFromServer,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  getActiveAuthInstance,
  getActiveDb,
  getActiveFirebaseConfig,
  subscribeActiveDatabaseChange,
} from './dbConnectionManager';
import fallbackBackdropImg from '../assets/images/hero_scifi_backdrop_1794813333496.jpg';
import fallbackPosterImg from '../assets/images/poster_running_man_1794813333683.jpg';
import {
  AdminPrivilegeRole,
  AnalyticsDailyRecord,
  CustomFontRecord,
  CustomFontSlot,
  ImagePlaceholderConfig,
  MediaItem,
  RecentlyWatchedRecord,
  RecentlyWatchedUiConfig,
  RequestStatus,
  ServerHealthRecord,
  SiteSettings,
  SiteThemeId,
  StreamServer,
  UserSubProfile,
  VisitorRequest,
  WatchProgressRecord,
} from '../types/media';
import { normalizeSiteThemeId } from './siteThemes';
import {
  loadStoredPlaceholderConfig,
  normalizeImagePlaceholderConfig,
  sanitizePlaceholderConfigForFirestore,
} from './placeholderConfig';
import {
  loadStoredRecentlyWatchedUiConfig,
  normalizeRecentlyWatchedUiConfig,
  sanitizeRecentlyWatchedUiForFirestore,
} from './recentlyWatchedConfig';
import { reportClientError } from './clientLogger';
import { isLikelyNonVideoWebsiteUrl } from './clientScraper';
import {
  buildDedicatedMediaUrl,
  generateCleanSlug,
  isDedicatedAppShortUrl,
} from './permalink';
import { DEFAULT_PLAYER_THEME, saveStoredPlayerTheme } from './playerTheme';
import {
  DEFAULT_HOME_CONFIG,
  HOME_CONFIG_SLIDER_STYLE_KEYS,
  normalizeHomeConfig,
  pickLegacyAutoplayHomeConfig,
  pickLegacyCoreHomeConfig,
  pickSliderStyleHomeConfig,
  saveStoredHomeConfig,
} from './homeConfig';
import {
  DEFAULT_TYPOGRAPHY_CONFIG,
  saveStoredTypographyConfig,
} from './typographyConfig';
import {
  DEFAULT_POPUP_SHIELD_CONFIG,
  saveStoredPopupShieldConfig,
} from './popupShield';
import {
  DEFAULT_WEBSITE_BRANDING,
  sanitizeBrandingForFirestore,
  saveStoredWebsiteBranding,
} from './websiteBranding';
import { evaluateImageQuality } from './mediaImages';
import {
  HeroSliderVariant,
  loadHeroSliderVariant,
  loadMobileHeroSliderVariant,
  normalizeHeroSliderVariant,
} from './heroSliderMode';
import {
  loadStreamV4SliderConfig,
  normalizeStreamV4SliderConfig,
  sanitizeStreamV4SliderConfigForFirestore,
  StreamV4SliderConfig,
} from './streamV4SliderConfig';

export let db: Firestore = getActiveDb();
export let auth: Auth = getActiveAuthInstance();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function getActiveDatabase(): Firestore {
  db = getActiveDb();
  return db;
}

export function getActiveAuth(): Auth {
  auth = getActiveAuthInstance();
  return auth;
}

export { getActiveFirebaseConfig };

subscribeActiveDatabaseChange(() => {
  db = getActiveDb();
  auth = getActiveAuthInstance();
});

export const PRIMARY_ADMIN_EMAILS = [
  'rahalahmed348@gmail.com',
  'mfeshmeny2@gmail.com',
  'ccicada6@gmail.com',
  'bebraheem439@gmail.com',
];

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentAuth = getActiveAuth();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentAuth.currentUser?.uid,
      email: currentAuth.currentUser?.email,
      emailVerified: currentAuth.currentUser?.emailVerified,
      isAnonymous: currentAuth.currentUser?.isAnonymous,
      tenantId: currentAuth.currentUser?.tenantId,
      providerInfo:
        currentAuth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  reportClientError({
    source: 'firestore.error',
    level: 'error',
    message: `${operationType} on ${path || 'unknown'}: ${errInfo.error}`,
    context: {
      operationType,
      path: path || '',
      hasUser: Boolean(currentAuth.currentUser?.uid),
    },
  });
  throw new Error(JSON.stringify(errInfo));
}

function getFirebaseErrorCodeAndMessage(err: unknown): { code: string; message: string } {
  if (typeof err === 'object' && err !== null) {
    const rec = err as { code?: unknown; message?: unknown };
    const rawMsg = String(rec.message || '');
    // Try parsing wrapped FirestoreErrorInfo JSON thrown by handleFirestoreError
    if (rawMsg.startsWith('{')) {
      try {
        const parsed = JSON.parse(rawMsg) as { error?: unknown };
        if (parsed && typeof parsed.error === 'string') {
          return { code: String(rec.code || ''), message: parsed.error };
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
    return { code: String(rec.code || ''), message: rawMsg };
  }
  const msg = String(err || '');
  if (msg.startsWith('{')) {
    try {
      const parsed = JSON.parse(msg) as { error?: unknown };
      if (parsed && typeof parsed.error === 'string') {
        return { code: '', message: parsed.error };
      }
    } catch {
      // Ignore JSON parse errors
    }
  }
  return { code: '', message: msg };
}

function isPermissionDeniedError(err: unknown): boolean {
  const { code, message } = getFirebaseErrorCodeAndMessage(err);
  return (
    code === 'permission-denied' ||
    /permission[-_ ]denied|missing or insufficient permissions/i.test(message)
  );
}

function isNotFoundError(err: unknown): boolean {
  const { code, message } = getFirebaseErrorCodeAndMessage(err);
  return code === 'not-found' || /no document to update|not[-_ ]found/i.test(message);
}

const EXTENDED_MEDIA_IMAGE_KEYS = [
  'poster_url',
  'backdrop_url',
  'poster_width',
  'poster_height',
  'backdrop_width',
  'backdrop_height',
  'image_source',
  'image_quality_status',
] as const;

function stripExtendedImageFields(payload: Record<string, unknown>): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...payload };
  for (const key of EXTENDED_MEDIA_IMAGE_KEYS) {
    delete clone[key];
  }
  return clone;
}

export function formatFirestoreWriteError(error: unknown, fallbackMessage: string): string {
  const { code, message } = getFirebaseErrorCodeAndMessage(error);
  const combined = `${code} ${message}`.toLowerCase();

  if (combined.includes('quota exceeded')) {
    return `${fallbackMessage}: تم تجاوز الحصة اليومية المجانية لقاعدة Firestore (Quota exceeded) — تتجدد الحصة تلقائياً في اليوم التالي.`;
  }
  if (combined.includes('permission-denied') || combined.includes('insufficient permissions')) {
    const activeDbId = getActiveFirebaseConfig().firestoreDatabaseId;
    return `${fallbackMessage}: مرفوض من قواعد الأمان (permission-denied) — تأكد من تحديث firestore.rules في قاعدة ${activeDbId} ومن وجود صلاحية المسؤول/المشرف لحسابك.`;
  }
  if (combined.includes('resource-exhausted') || combined.includes('maximum allowed size')) {
    return `${fallbackMessage}: حجم المستند يتجاوز الحد المسموح في Firestore (1MB) — قلل عدد الحلقات أو السيرفرات في العنصر الواحد.`;
  }
  if (combined.includes('invalid-argument')) {
    return `${fallbackMessage}: قيمة أحد الحقول غير صالحة (${message.slice(0, 120)}).`;
  }
  if (combined.includes('unauthenticated')) {
    return `${fallbackMessage}: انتهت جلسة تسجيل الدخول — أعد تسجيل الدخول إلى لوحة التحكم.`;
  }
  if (message) {
    return `${fallbackMessage} (${message.slice(0, 110)})`;
  }
  return fallbackMessage;
}

export type FirestoreConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'quota_exceeded'
  | 'permission_denied'
  | 'offline'
  | 'error';

export function classifyFirestoreConnectionError(err: unknown): {
  status: FirestoreConnectionStatus;
  message: string;
} {
  const { code, message } = getFirebaseErrorCodeAndMessage(err);
  const combined = `${code} ${message}`.toLowerCase();

  if (combined.includes('quota exceeded') || combined.includes('resource-exhausted')) {
    return {
      status: 'quota_exceeded',
      message:
        'تم تجاوز الحصة اليومية المجانية لقراءة قاعدة بيانات Firestore (Quota exceeded) — تتجدد الحصة تلقائياً غداً أو بعد ترقية الخطة.',
    };
  }
  if (combined.includes('permission-denied') || combined.includes('missing or insufficient permissions')) {
    return {
      status: 'permission_denied',
      message:
        'قاعدة البيانات متصلة ولكن قواعد الأمان (firestore.rules) الحالية ترفض القراءة — يرجى نشر ملف firestore.rules في Firebase Console.',
    };
  }
  if (combined.includes('the client is offline') || combined.includes('unavailable')) {
    return {
      status: 'offline',
      message: 'تعذر الوصول إلى خادم Firestore (تحقق من الاتصال بالإنترنت أو إعدادات المشروع).',
    };
  }
  return {
    status: 'error',
    message: message || 'حدث خطأ غير متوقع أثناء الاتصال بقاعدة بيانات Firestore.',
  };
}

// Mandatory boot connection check
export async function testConnection(): Promise<{
  ok: boolean;
  status: FirestoreConnectionStatus;
  message?: string;
}> {
  try {
    await getDocFromServer(doc(getActiveDatabase(), 'test', 'connection'));
    return { ok: true, status: 'connected' };
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    const classified = classifyFirestoreConnectionError(error);
    return { ok: false, status: classified.status, message: classified.message };
  }
}
void testConnection();

export async function probeDatabaseConnection(): Promise<{
  ok: boolean;
  status: FirestoreConnectionStatus;
  message?: string;
}> {
  try {
    await getDocFromServer(doc(getActiveDatabase(), 'settings', 'general'));
    return { ok: true, status: 'connected' };
  } catch (error) {
    const classified = classifyFirestoreConnectionError(error);
    return { ok: false, status: classified.status, message: classified.message };
  }
}

export function normalizeAuthIdentifier(identifier: string): string {
  const clean = identifier.trim();
  if (!clean) return '';
  if (clean.includes('@')) return clean.toLowerCase();
  return `${clean.toLowerCase()}@rahaltv.com`;
}

export function getFirebaseAuthErrorMessage(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'البريد الإلكتروني / اسم المستخدم أو كلمة المرور غير صحيحة.';
    case 'auth/invalid-email':
      return 'صيغة البريد الإلكتروني غير صالحة.';
    case 'auth/email-already-in-use':
      return 'هذا البريد الإلكتروني أو اسم المستخدم مسجل بالفعل.';
    case 'auth/weak-password':
      return 'كلمة المرور ضعيفة — يجب أن تكون 6 أحرف على الأقل.';
    case 'auth/operation-not-allowed':
      return 'ميزة تسجيل الدخول بالبريد وكلمة المرور غير مفعّلة بعد في Firebase Console → Authentication → Sign-in method → Email/Password.';
    case 'auth/too-many-requests':
      return 'محاولات دخول متكررة، يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.';
    case 'auth/unauthorized-domain':
      return `الدومين (${host}) غير مضاف في Firebase Authorized Domains.`;
    case 'auth/popup-blocked':
      return 'المتصفح منع النافذة المنبثقة لتسجيل الدخول.';
    case 'auth/popup-closed-by-user':
      return 'تم إغلاق نافذة تسجيل الدخول.';
    default:
      return `تعذر إتمام تسجيل الدخول (${code || 'خطأ غير معروف'}).`;
  }
}

export async function signInWithEmailPassword(identifier: string, password: string) {
  const email = normalizeAuthIdentifier(identifier);
  return signInWithEmailAndPassword(getActiveAuth(), email, password);
}

export async function registerMemberWithEmailPassword(
  identifier: string,
  password: string,
  displayName: string
) {
  const email = normalizeAuthIdentifier(identifier);
  const cred = await createUserWithEmailAndPassword(getActiveAuth(), email, password);
  if (displayName.trim()) {
    await updateProfile(cred.user, { displayName: displayName.trim().slice(0, 120) });
  }
  return cred;
}

export async function resendVerificationEmail(user: User) {
  return sendEmailVerification(user);
}

export async function signInWithGoogle() {
  return signInWithPopup(getActiveAuth(), googleProvider);
}

export async function signOutFirebase() {
  return signOut(getActiveAuth());
}

export async function getUserAdminRole(user: User | null): Promise<AdminPrivilegeRole | null> {
  if (!user) return null;
  const email = user.email?.toLowerCase() || '';
  if (user.emailVerified && PRIMARY_ADMIN_EMAILS.some((e) => e.toLowerCase() === email)) {
    return 'owner';
  }
  try {
    const adminDoc = await getDoc(doc(getActiveDatabase(), 'admins', user.uid));
    if (!adminDoc.exists()) return null;
    const data = adminDoc.data() as { role?: unknown };
    return data?.role === 'moderator' ? 'moderator' : 'owner';
  } catch {
    return null;
  }
}

export async function checkIsAdminUser(user: User | null): Promise<boolean> {
  const role = await getUserAdminRole(user);
  return role !== null;
}

const FALLBACK_POSTER_URL = fallbackPosterImg;
const FALLBACK_BACKDROP_URL = fallbackBackdropImg;

function extractServerTargetUrl(srv?: { url?: string; embedCode?: string }): string {
  if (!srv) return '';
  const embed = String(srv.embedCode || '').trim();
  if (embed) {
    const m = embed.match(/src\s*=\s*["']([^"']+)["']/i);
    if (m?.[1]) return m[1].trim();
    if (/^https?:\/\//i.test(embed)) return embed;
  }
  return String(srv.url || '').trim();
}

function sanitizeServerList(
  rawList: StreamServer[] | undefined,
  fallbackQuality: string,
  maxItems = 15,
  idPrefix = 'srv'
) {
  return (rawList || [])
    .filter((srv) => {
      if (!srv) return false;
      const targetUrl = extractServerTargetUrl(srv);
      if (!targetUrl) return false;
      return !isLikelyNonVideoWebsiteUrl(targetUrl);
    })
    .slice(0, maxItems)
    .map((srv, idx) => {
      const cleanUrl = String(srv.url || '').trim().slice(0, 600);
      const rawEmbed = String(srv.embedCode || '').trim().slice(0, 1200);
      const mode: 'url' | 'embed' =
        srv.mode === 'url' || (!rawEmbed && cleanUrl && !/embed/i.test(cleanUrl)) ? 'url' : 'embed';
      const embedCode =
        rawEmbed || (mode === 'embed' && cleanUrl ? `<iframe src="${cleanUrl}" frameborder="0" allowfullscreen></iframe>` : '');
      const rawSpeed = String(srv.speed || '').trim();
      const rawTag = String(srv.tag || '').trim();
      const rawName = String(srv.name || '').trim();
      const safeName =
        rawName && !/^(مستورد|embed|server)$/i.test(rawName)
          ? rawName.slice(0, 60)
          : `سيرفر ${idx + 1}`;
      const cleanQuality = String(srv.quality || fallbackQuality || '1080p').trim().slice(0, 40) || '1080p';
      return {
        id: String(srv.id || `${idPrefix}-${Date.now()}-${idx + 1}`).slice(0, 80),
        name: safeName,
        mode,
        url: cleanUrl,
        embedCode,
        quality: cleanQuality,
        speed: !rawSpeed || /مستورد/i.test(rawSpeed) ? 'سريع' : rawSpeed.slice(0, 40),
        tag: !rawTag || /^embed$/i.test(rawTag) ? cleanQuality : rawTag.slice(0, 30),
      };
    });
}

function sanitizeMediaPayload(item: MediaItem, uid: string, isCreate: boolean) {
  const cleanId =
    String(item.id || '')
      .replace(/[^a-zA-Z0-9_\-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 128) || `media-${Date.now()}`;
  const safeTitle = String(item.title || 'عمل مستورد').trim().slice(0, 200) || 'عمل مستورد';
  const safeEnglishTitle = String(item.englishTitle || safeTitle).trim().slice(0, 200) || safeTitle;
  const rawSlugCandidate = String(item.slug || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128);
  const safeSlug =
    rawSlugCandidate && rawSlugCandidate.length >= 2
      ? rawSlugCandidate
      : generateCleanSlug(safeEnglishTitle, safeTitle, cleanId);
  const dedicatedShortUrl = isDedicatedAppShortUrl(item.shortUrl)
    ? String(item.shortUrl).trim().slice(0, 300)
    : buildDedicatedMediaUrl({ id: cleanId, slug: safeSlug }).slice(0, 300);

  const rawPosterInput = String(item.poster_url || item.poster || '').trim().slice(0, 500);
  const safePoster = rawPosterInput || FALLBACK_POSTER_URL;
  const rawBackdropUrl = String(
    item.backdrop_url !== undefined ? item.backdrop_url : item.backdrop || ''
  )
    .trim()
    .slice(0, 500);
  const hasDistinctBackdropInput = Boolean(rawBackdropUrl && rawBackdropUrl !== safePoster);
  const safeBackdropUrl = hasDistinctBackdropInput ? rawBackdropUrl : '';
  // Legacy required `backdrop` field stays non-empty in Firestore rules and avoids portrait stretching
  const safeBackdrop = safeBackdropUrl || FALLBACK_BACKDROP_URL;

  const posterWidth = Math.max(0, Math.min(20000, Math.round(Number(item.poster_width) || 0)));
  const posterHeight = Math.max(0, Math.min(20000, Math.round(Number(item.poster_height) || 0)));
  const backdropWidth = Math.max(0, Math.min(20000, Math.round(Number(item.backdrop_width) || 0)));
  const backdropHeight = Math.max(0, Math.min(20000, Math.round(Number(item.backdrop_height) || 0)));
  const computedQuality = evaluateImageQuality({
    posterUrl: safePoster,
    backdropUrl: safeBackdropUrl,
    posterWidth,
    posterHeight,
    backdropWidth,
    backdropHeight,
  });
  const imageQualityStatus =
    computedQuality !== 'unknown'
      ? computedQuality
      : item.image_quality_status || (hasDistinctBackdropInput ? 'unknown' : 'missing_backdrop');
  const imageSource =
    String(item.image_source || (safePoster === FALLBACK_POSTER_URL ? 'fallback' : 'manual'))
      .trim()
      .slice(0, 60) || 'manual';

  const safeYear = String(item.year || '2026').trim().slice(0, 10);
  const normalizedYear = safeYear.length >= 4 ? safeYear : '2026';
  const safeKind = (['movie', 'series', 'tv', 'wrestling'] as const).includes(item.kind)
    ? item.kind
    : 'movie';

  const normalizedCategories = (item.categories || [])
    .map((c) => String(c || '').trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 10);
  const normalizedGenres = (item.genres || [])
    .map((g) => String(g || '').trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 10);

  let normalizedServers = sanitizeServerList(item.servers, String(item.quality || '1080p'), 15, 'srv');

  const normalizedDownloads = (item.downloads || [])
    .filter((dl) => dl && String(dl.url || '').trim())
    .slice(0, 15)
    .map((dl, idx) => ({
      id: String(dl.id || `dl-${Date.now()}-${idx}`).slice(0, 80),
      host: String(dl.host || `رابط تحميل ${idx + 1}`).trim().slice(0, 80) || `رابط تحميل ${idx + 1}`,
      quality: String(dl.quality || item.quality || '1080p').trim().slice(0, 40) || '1080p',
      size: String(dl.size || 'حسب السيرفر').trim().slice(0, 40) || 'حسب السيرفر',
      format: String(dl.format || 'MP4').trim().slice(0, 20) || 'MP4',
      url: String(dl.url || '').trim().slice(0, 600),
    }));

  const normalizedCast = (item.cast || [])
    .filter((c) => c && String(c.name || '').trim())
    .slice(0, 25)
    .map((c) => {
      const nm = String(c.name).trim().slice(0, 80);
      const cleanAvatar =
        typeof c.avatarUrl === 'string' && c.avatarUrl.trim()
          ? c.avatarUrl.trim().slice(0, 500)
          : '';
      return {
        name: nm,
        role: String(c.role || 'ممثل').trim().slice(0, 60) || 'ممثل',
        initials: String(c.initials || nm.slice(0, 2).toUpperCase() || 'RT').slice(0, 6),
        ...(cleanAvatar ? { avatarUrl: cleanAvatar } : {}),
      };
    });

  const normalizedSeasons = (item.seasons || []).slice(0, 20).map((season, sIdx) => ({
    seasonNumber: Number(season.seasonNumber) || sIdx + 1,
    label: String(season.label || `الموسم ${String(sIdx + 1).padStart(2, '0')}`).trim().slice(0, 80),
    year: String(season.year || normalizedYear).trim().slice(0, 10) || normalizedYear,
    episodes: (season.episodes || []).slice(0, 120).map((ep, eIdx) => {
      const epNum = Number(ep.number) || eIdx + 1;
      const epQual = String(ep.quality || item.quality || 'WEB-DL').trim().slice(0, 40) || 'WEB-DL';
      const epServers = sanitizeServerList(ep.servers, epQual, 12, `ep-${epNum}-srv`);
      let cleanWatchUrl = String(ep.watchUrl || '').trim().slice(0, 600);
      if (cleanWatchUrl && isLikelyNonVideoWebsiteUrl(cleanWatchUrl)) {
        cleanWatchUrl = epServers[0]?.url || '';
      }
      let cleanEmbedCode = String(ep.embedCode || '').trim().slice(0, 1200);
      if (cleanEmbedCode) {
        const emSrc = extractServerTargetUrl({ embedCode: cleanEmbedCode });
        if (!emSrc || isLikelyNonVideoWebsiteUrl(emSrc)) {
          cleanEmbedCode = '';
        }
      }
      const cleanThumb =
        typeof ep.thumbnailUrl === 'string' && ep.thumbnailUrl.trim()
          ? ep.thumbnailUrl.trim().slice(0, 500)
          : '';
      return {
        number: epNum,
        title: String(ep.title || `الحلقة ${epNum}`).trim().slice(0, 120) || `الحلقة ${epNum}`,
        duration: String(ep.duration || '45 دقيقة').trim().slice(0, 40) || '45 دقيقة',
        quality: epQual,
        ...(cleanThumb ? { thumbnailUrl: cleanThumb } : {}),
        watchUrl: cleanWatchUrl || epServers[0]?.url || '',
        embedCode: cleanEmbedCode,
        servers: epServers,
      };
    }),
  }));

  if (normalizedServers.length === 0 && normalizedSeasons.length > 0) {
    const ep1Servers = normalizedSeasons[0].episodes.find((ep) => ep.servers && ep.servers.length > 0)?.servers;
    if (ep1Servers && ep1Servers.length > 0) {
      normalizedServers = ep1Servers.map((s, idx) => ({
        ...s,
        id: `srv-${Date.now()}-${idx + 1}`,
        name: s.name || `سيرفر ${idx + 1}`,
      }));
    }
  }

  const parsedImdb = Number(item.imdb);
  const safeImdb = Number.isFinite(parsedImdb) ? Math.min(10, Math.max(0, parsedImdb)) : 0;

  const base: Record<string, unknown> = {
    id: cleanId,
    slug: safeSlug,
    title: safeTitle,
    englishTitle: safeEnglishTitle,
    kind: safeKind,
    categories: normalizedCategories.length ? normalizedCategories : ['افلام'],
    genres: normalizedGenres.length ? normalizedGenres : ['دراما'],
    year: normalizedYear,
    country: String(item.country || 'الولايات المتحدة').trim().slice(0, 80) || 'الولايات المتحدة',
    language: String(item.language || 'الانجليزية').trim().slice(0, 80) || 'الانجليزية',
    quality: String(item.quality || 'WEB-DL').trim().slice(0, 40) || 'WEB-DL',
    duration: String(item.duration || '120 دقيقة').trim().slice(0, 40) || '120 دقيقة',
    imdb: safeImdb,
    votes: String(item.votes || '0').trim().slice(0, 40) || '0',
    views: Math.max(0, Math.round(Number(item.views) || 0)),
    likes: Math.max(0, Math.round(Number(item.likes) || 0)),
    pinned: Boolean(item.pinned),
    isNew: Boolean(item.isNew),
    comingSoon: Boolean(item.comingSoon),
    poster: safePoster,
    backdrop: safeBackdrop,
    poster_url: safePoster,
    backdrop_url: safeBackdropUrl,
    poster_width: posterWidth,
    poster_height: posterHeight,
    backdrop_width: backdropWidth,
    backdrop_height: backdropHeight,
    image_source: imageSource,
    image_quality_status: imageQualityStatus,
    tagline: String(item.tagline || '').slice(0, 400),
    story: String(item.story || safeTitle).trim().slice(0, 3000) || safeTitle,
    shortUrl: dedicatedShortUrl,
    trailerUrl: String(item.trailerUrl || '').slice(0, 500),
    trailerLabel: String(item.trailerLabel || safeTitle).slice(0, 200),
    trailerDuration: String(item.trailerDuration || '02:00').slice(0, 30),
    cast: normalizedCast,
    seasons: normalizedSeasons,
    franchiseIds: (item.franchiseIds || []).map((f) => String(f)).slice(0, 15),
    servers: normalizedServers,
    downloads: normalizedDownloads,
    updatedBy: String(uid || '').slice(0, 128),
    updatedAt: serverTimestamp(),
  };

  if (isCreate) {
    base.createdAt = serverTimestamp();
  }
  return { cleanId, payload: base };
}

export async function seedCatalogToFirestore(items: MediaItem[], uid: string) {
  const activeDb = getActiveDatabase();
  const path = 'media';
  const prepared = items.map((item) => sanitizeMediaPayload(item, uid, true));
  try {
    const batch = writeBatch(activeDb);
    for (const { cleanId, payload } of prepared) {
      batch.set(doc(activeDb, 'media', cleanId), payload);
    }
    await batch.commit();
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      try {
        const legacyBatch = writeBatch(activeDb);
        for (const { cleanId, payload } of prepared) {
          legacyBatch.set(doc(activeDb, 'media', cleanId), stripExtendedImageFields(payload));
        }
        await legacyBatch.commit();
        return;
      } catch (legacyErr) {
        handleFirestoreError(legacyErr, OperationType.WRITE, path);
      }
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function bulkSaveMediaToFirestore(items: MediaItem[], uid: string): Promise<number> {
  const activeDb = getActiveDatabase();
  const path = 'media';
  const CHUNK_SIZE = 35;
  let savedCount = 0;
  try {
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const prepared = chunk.map((item) => sanitizeMediaPayload(item, uid, true));
      try {
        const batch = writeBatch(activeDb);
        for (const { cleanId, payload } of prepared) {
          batch.set(doc(activeDb, 'media', cleanId), payload);
        }
        await batch.commit();
      } catch (chunkErr) {
        if (isPermissionDeniedError(chunkErr)) {
          const legacyBatch = writeBatch(activeDb);
          for (const { cleanId, payload } of prepared) {
            legacyBatch.set(doc(activeDb, 'media', cleanId), stripExtendedImageFields(payload));
          }
          await legacyBatch.commit();
        } else {
          throw chunkErr;
        }
      }
      savedCount += chunk.length;
    }
    return savedCount;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function bulkUpdateMediaInFirestore(items: MediaItem[], uid: string): Promise<number> {
  const activeDb = getActiveDatabase();
  const path = 'media';
  const CHUNK_SIZE = 35;
  let updatedCount = 0;
  try {
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const prepared = chunk.map((item) => sanitizeMediaPayload(item, uid, false));
      try {
        const batch = writeBatch(activeDb);
        for (const { cleanId, payload } of prepared) {
          batch.update(doc(activeDb, 'media', cleanId), payload);
        }
        await batch.commit();
      } catch (chunkErr) {
        if (isPermissionDeniedError(chunkErr)) {
          const legacyBatch = writeBatch(activeDb);
          for (const { cleanId, payload } of prepared) {
            legacyBatch.update(doc(activeDb, 'media', cleanId), stripExtendedImageFields(payload));
          }
          await legacyBatch.commit();
        } else {
          throw chunkErr;
        }
      }
      updatedCount += chunk.length;
    }
    return updatedCount;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveMediaToFirestore(
  item: MediaItem,
  uid: string,
  isCreate: boolean
): Promise<{ usedLegacySchemaFallback: boolean }> {
  const activeDb = getActiveDatabase();
  const { cleanId, payload } = sanitizeMediaPayload(item, uid, isCreate);
  const path = `media/${cleanId}`;
  const docRef = doc(activeDb, 'media', cleanId);

  const writeDoc = async (docPayload: Record<string, unknown>, createMode: boolean) => {
    if (createMode) {
      await setDoc(docRef, {
        ...docPayload,
        createdAt: docPayload.createdAt || serverTimestamp(),
      });
    } else {
      try {
        await updateDoc(docRef, docPayload);
      } catch (updateErr) {
        if (isNotFoundError(updateErr)) {
          await setDoc(docRef, {
            ...docPayload,
            createdAt: serverTimestamp(),
          });
        } else {
          throw updateErr;
        }
      }
    }
  };

  try {
    await writeDoc(payload, isCreate);
    return { usedLegacySchemaFallback: false };
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      try {
        await writeDoc(stripExtendedImageFields(payload), isCreate);
        return { usedLegacySchemaFallback: true };
      } catch (legacyErr) {
        handleFirestoreError(legacyErr, isCreate ? OperationType.CREATE : OperationType.UPDATE, path);
      }
    }
    handleFirestoreError(error, isCreate ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteMediaFromFirestore(mediaId: string) {
  const activeDb = getActiveDatabase();
  const path = `media/${mediaId}`;
  try {
    await deleteDoc(doc(activeDb, 'media', mediaId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function bulkDeleteMediaFromFirestore(mediaIds: string[]): Promise<number> {
  const activeDb = getActiveDatabase();
  const path = 'media';
  const CHUNK_SIZE = 400;
  let deletedCount = 0;
  try {
    const validIds = mediaIds
      .map((id) => String(id || '').trim())
      .filter((id) => /^[a-zA-Z0-9_\-]+$/.test(id));
    for (let i = 0; i < validIds.length; i += CHUNK_SIZE) {
      const chunk = validIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(activeDb);
      for (const id of chunk) {
        batch.delete(doc(activeDb, 'media', id));
      }
      await batch.commit();
      deletedCount += chunk.length;
    }
    return deletedCount;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function submitVisitorRequestToFirestore(
  user: User,
  req: { title: string; type: VisitorRequest['type']; notes: string }
) {
  const activeDb = getActiveDatabase();
  const id = `req_${Date.now()}`;
  const path = `requests/${id}`;
  try {
    await setDoc(doc(activeDb, 'requests', id), {
      id,
      userId: user.uid,
      requesterName: (user.displayName || 'مستخدم RahaL TV').slice(0, 120),
      title: req.title.trim().slice(0, 200),
      type: req.type,
      notes: req.notes.trim().slice(0, 500),
      status: 'pending',
      adminNote: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateVisitorRequestInFirestore(
  requestId: string,
  status: RequestStatus,
  adminNote: string
) {
  const activeDb = getActiveDatabase();
  const path = `requests/${requestId}`;
  try {
    await updateDoc(doc(activeDb, 'requests', requestId), {
      status,
      adminNote: adminNote.trim().slice(0, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteVisitorRequestFromFirestore(requestId: string) {
  const activeDb = getActiveDatabase();
  const path = `requests/${requestId}`;
  try {
    await deleteDoc(doc(activeDb, 'requests', requestId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncUserProfileToFirestore(
  user: User,
  localWatchlist: string[],
  isAdminUser: boolean
): Promise<string[]> {
  const activeDb = getActiveDatabase();
  const userPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/info`;
  try {
    const userRef = doc(activeDb, 'users', user.uid);
    const snap = await getDoc(userRef);

    if (user.email) {
      await setDoc(
        doc(activeDb, 'users', user.uid, 'private', 'info'),
        {
          email: user.email.slice(0, 200),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (!snap.exists()) {
      const mergedWatchlist = localWatchlist.slice(0, 100);
      await setDoc(userRef, {
        uid: user.uid,
        displayName: (user.displayName || 'عضو RahaL TV').slice(0, 120),
        photoURL: (user.photoURL || '').slice(0, 500),
        watchlistIds: mergedWatchlist,
        role: isAdminUser ? 'admin' : 'member',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return mergedWatchlist;
    } else {
      const existingList = Array.isArray(snap.data().watchlistIds)
        ? (snap.data().watchlistIds as string[])
        : [];
      await updateDoc(userRef, {
        displayName: (user.displayName || snap.data().displayName || 'عضو RahaL TV').slice(0, 120),
        photoURL: (user.photoURL || '').slice(0, 500),
        updatedAt: serverTimestamp(),
      });
      return existingList;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${userPath} / ${privatePath}`);
  }
}

export async function saveWatchlistToFirestore(uid: string, watchlistIds: string[]) {
  const activeDb = getActiveDatabase();
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(activeDb, 'users', uid), {
      watchlistIds: watchlistIds.slice(0, 100),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export type SettingsOptionalSection = 'homeConfig' | 'typography' | 'popupShield' | 'branding';

export interface SaveSiteSettingsResult {
  syncedHomeToCloud: boolean;
  syncedTypographyToCloud: boolean;
  syncedPopupShieldToCloud: boolean;
  syncedBrandingToCloud: boolean;
  rejectedSections: SettingsOptionalSection[];
  projectId: string;
  databaseId: string;
}

async function writeSplitHomeDocs(
  activeDb: Firestore,
  normalizedHome: ReturnType<typeof normalizeHomeConfig>,
  uid: string
): Promise<{ homeLayoutOk: boolean; sliderStyleOk: boolean }> {
  let homeLayoutOk = false;
  let sliderStyleOk = false;

  try {
    await setDoc(doc(activeDb, 'settings', 'home_layout'), {
      ...pickLegacyAutoplayHomeConfig(normalizedHome),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
    homeLayoutOk = true;
  } catch (err) {
    if (!isPermissionDeniedError(err)) {
      throw err;
    }
  }

  try {
    await setDoc(doc(activeDb, 'settings', 'slider_style'), {
      ...pickSliderStyleHomeConfig(normalizedHome),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
    sliderStyleOk = true;
  } catch (err) {
    if (!isPermissionDeniedError(err)) {
      throw err;
    }
  }

  return { homeLayoutOk, sliderStyleOk };
}

async function writeSplitBrandingDoc(
  activeDb: Firestore,
  firestoreBranding: ReturnType<typeof sanitizeBrandingForFirestore>,
  uid: string
): Promise<boolean> {
  try {
    await setDoc(doc(activeDb, 'settings', 'site_branding'), {
      ...firestoreBranding,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      return false;
    }
    throw err;
  }
}

export async function saveSiteSettingsToFirestore(
  settings: SiteSettings,
  uid: string
): Promise<SaveSiteSettingsResult> {
  const activeDb = getActiveDatabase();
  const activeCfg = getActiveFirebaseConfig();
  const projectId = activeCfg.projectId;
  const databaseId = activeCfg.firestoreDatabaseId || '(default)';
  const path = 'settings/general';
  const normalizedTheme = saveStoredPlayerTheme(settings.playerTheme || DEFAULT_PLAYER_THEME);
  const normalizedHome = saveStoredHomeConfig(settings.homeConfig || DEFAULT_HOME_CONFIG);
  const normalizedTypography = saveStoredTypographyConfig(
    settings.typography || DEFAULT_TYPOGRAPHY_CONFIG
  );
  const normalizedShield = saveStoredPopupShieldConfig(
    settings.popupShield || DEFAULT_POPUP_SHIELD_CONFIG
  );
  const normalizedBrandingLocal = saveStoredWebsiteBranding(
    settings.branding || { ...DEFAULT_WEBSITE_BRANDING, siteName: settings.siteName },
    settings.siteName
  );
  const firestoreBranding = sanitizeBrandingForFirestore(
    normalizedBrandingLocal,
    settings.siteName
  );

  const corePayload: Record<string, unknown> = {
    siteName: settings.siteName.trim().slice(0, 80) || 'RahaL TV',
    tagline: settings.tagline.trim().slice(0, 300) || 'منصة RahaL TV الترفيهية',
    announcementText: settings.announcementText.trim().slice(0, 300),
    tickerEnabled: Boolean(settings.tickerEnabled),
    featuredLimit: Math.min(20, Math.max(1, Math.round(Number(settings.featuredLimit) || 5))),
    maintenanceMode: Boolean(settings.maintenanceMode),
    maintenanceMessage: (settings.maintenanceMessage || '').trim().slice(0, 500),
    playerTheme: normalizedTheme,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  };

  const extendedPayloadWithoutBranding: Record<string, unknown> = {
    ...corePayload,
    homeConfig: normalizedHome,
    typography: normalizedTypography,
    popupShield: normalizedShield,
  };

  try {
    await setDoc(doc(activeDb, 'settings', 'general'), {
      ...extendedPayloadWithoutBranding,
      branding: firestoreBranding,
    });
    return {
      syncedHomeToCloud: true,
      syncedTypographyToCloud: true,
      syncedPopupShieldToCloud: true,
      syncedBrandingToCloud: true,
      rejectedSections: [],
      projectId,
      databaseId,
    };
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }

    // Tier 2: try without branding on settings/general (and mirror branding to settings/site_branding if enabled)
    try {
      await setDoc(doc(activeDb, 'settings', 'general'), extendedPayloadWithoutBranding);
      const splitBrandingOk = await writeSplitBrandingDoc(activeDb, firestoreBranding, uid);
      if (!splitBrandingOk) {
        reportClientError({
          source: 'firestore.settings.partial_sync',
          level: 'warn',
          message: `Settings write rejected branding on ${projectId}/${databaseId} (permission-denied); homeConfig/typography/popupShield synced.`,
        });
      }
      return {
        syncedHomeToCloud: true,
        syncedTypographyToCloud: true,
        syncedPopupShieldToCloud: true,
        syncedBrandingToCloud: splitBrandingOk,
        rejectedSections: splitBrandingOk ? [] : ['branding'],
        projectId,
        databaseId,
      };
    } catch (midErr) {
      if (!isPermissionDeniedError(midErr)) {
        handleFirestoreError(midErr, OperationType.WRITE, path);
      }
    }

    // Tier 3: First sync Home Layout + Slider Style via dedicated lightweight documents
    // so Firestore's map-complexity ceiling on settings/general never drops the 19 slider styling keys.
    let splitHomeSynced = false;
    try {
      const splitRes = await writeSplitHomeDocs(activeDb, normalizedHome, uid);
      splitHomeSynced = splitRes.homeLayoutOk && splitRes.sliderStyleOk;
    } catch (splitErr) {
      handleFirestoreError(splitErr, OperationType.WRITE, 'settings/home_layout');
    }

    // Also persist each optional section on settings/general independently/cumulatively.
    const docRef = doc(activeDb, 'settings', 'general');
    const acceptedPayload: Record<string, unknown> = { ...corePayload };
    const statusMap: Record<SettingsOptionalSection, boolean> = {
      typography: false,
      popupShield: false,
      homeConfig: splitHomeSynced,
      branding: false,
    };
    const optionalEntries: Array<{
      key: SettingsOptionalSection;
      value: unknown;
    }> = [
      { key: 'typography', value: normalizedTypography },
      { key: 'popupShield', value: normalizedShield },
      { key: 'branding', value: firestoreBranding },
      ...(!splitHomeSynced ? [{ key: 'homeConfig' as const, value: normalizedHome }] : []),
    ];

    let anyOptionalWritten = false;
    for (const entry of optionalEntries) {
      const candidate: Record<string, unknown> = {
        ...acceptedPayload,
        [entry.key]: entry.value,
      };
      try {
        await setDoc(docRef, candidate);
        acceptedPayload[entry.key] = entry.value;
        statusMap[entry.key] = true;
        anyOptionalWritten = true;
      } catch (secErr) {
        if (!isPermissionDeniedError(secErr)) {
          handleFirestoreError(secErr, OperationType.WRITE, path);
        }
      }
    }

    if (!statusMap.branding) {
      try {
        statusMap.branding = await writeSplitBrandingDoc(activeDb, firestoreBranding, uid);
      } catch (brandErr) {
        handleFirestoreError(brandErr, OperationType.WRITE, 'settings/site_branding');
      }
    }

    if (!anyOptionalWritten) {
      try {
        await setDoc(docRef, corePayload, { merge: true });
      } catch (mergeErr) {
        if (isPermissionDeniedError(mergeErr)) {
          try {
            await setDoc(docRef, corePayload);
          } catch (innerErr) {
            handleFirestoreError(innerErr, OperationType.WRITE, path);
          }
        } else {
          handleFirestoreError(mergeErr, OperationType.WRITE, path);
        }
      }
    }

    const rejectedSections = (
      ['homeConfig', 'typography', 'popupShield', 'branding'] as SettingsOptionalSection[]
    ).filter((k) => !statusMap[k]);

    if (rejectedSections.length > 0) {
      reportClientError({
        source: 'firestore.settings.partial_sync',
        level: 'warn',
        message: `Firestore rules on ${projectId}/${databaseId} rejected sections: [${rejectedSections.join(', ')}].`,
      });
    }

    return {
      syncedHomeToCloud: statusMap.homeConfig,
      syncedTypographyToCloud: statusMap.typography,
      syncedPopupShieldToCloud: statusMap.popupShield,
      syncedBrandingToCloud: statusMap.branding,
      rejectedSections,
      projectId,
      databaseId,
    };
  }
}

export type HomeConfigRulesMode = 'full' | 'split_sync' | 'autoplay_only' | 'core_only' | 'rejected';

export type RulesDiagnosticReport =
  | {
      ok: true;
      result: SaveSiteSettingsResult;
      homeConfigMode: HomeConfigRulesMode;
      outdatedRulesDetected: boolean;
      payloadIssueDetected: boolean;
      rejectedHomeKeys: string[];
      homeComplexityLimitDetected: boolean;
      splitDocsReady: {
        homeLayout: boolean;
        sliderStyle: boolean;
        siteBranding: boolean;
      };
      syncedImagePlaceholdersToCloud: boolean;
      imagePlaceholdersErrorCode?: string;
      imagePlaceholdersErrorMessage?: string;
      recentlyWatchedReady: boolean;
      recentlyWatchedUiReady: boolean;
      recentlyWatchedUiErrorCode?: string;
      recentlyWatchedUiErrorMessage?: string;
      heroSliderModeReady: boolean;
      heroSliderModeErrorCode?: string;
      streamV4SliderReady: boolean;
      streamV4SliderErrorCode?: string;
      userEmail: string | null;
      emailVerified: boolean;
    }
  | {
      ok: false;
      errorMessage: string;
      projectId: string;
      databaseId: string;
      userEmail: string | null;
      emailVerified: boolean;
    };

export async function diagnoseFirestoreSettingsRules(
  settings: SiteSettings,
  uid: string,
  imagePlaceholders?: ImagePlaceholderConfig,
  recentlyWatchedUi?: RecentlyWatchedUiConfig
): Promise<RulesDiagnosticReport> {
  const activeDb = getActiveDatabase();
  const activeCfg = getActiveFirebaseConfig();
  const projectId = activeCfg.projectId;
  const databaseId = activeCfg.firestoreDatabaseId || '(default)';
  const currentUser = getActiveAuth().currentUser;
  const actorUid = currentUser?.uid || uid;
  const userEmail = currentUser?.email ?? null;
  const emailVerified = Boolean(currentUser?.emailVerified);

  const normalizedTheme = saveStoredPlayerTheme(settings.playerTheme || DEFAULT_PLAYER_THEME);
  const normalizedHome = saveStoredHomeConfig(settings.homeConfig || DEFAULT_HOME_CONFIG);
  const normalizedTypography = saveStoredTypographyConfig(
    settings.typography || DEFAULT_TYPOGRAPHY_CONFIG
  );
  const normalizedShield = saveStoredPopupShieldConfig(
    settings.popupShield || DEFAULT_POPUP_SHIELD_CONFIG
  );
  const normalizedBrandingLocal = saveStoredWebsiteBranding(
    settings.branding || { ...DEFAULT_WEBSITE_BRANDING, siteName: settings.siteName },
    settings.siteName
  );
  const firestoreBranding = sanitizeBrandingForFirestore(
    normalizedBrandingLocal,
    settings.siteName
  );

  const corePayload: Record<string, unknown> = {
    siteName: settings.siteName.trim().slice(0, 80) || 'RahaL TV',
    tagline: settings.tagline.trim().slice(0, 300) || 'منصة RahaL TV الترفيهية',
    announcementText: settings.announcementText.trim().slice(0, 300),
    tickerEnabled: Boolean(settings.tickerEnabled),
    featuredLimit: Math.min(20, Math.max(1, Math.round(Number(settings.featuredLimit) || 5))),
    maintenanceMode: Boolean(settings.maintenanceMode),
    maintenanceMessage: (settings.maintenanceMessage || '').trim().slice(0, 500),
    playerTheme: normalizedTheme,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  };

  // Probe non-destructively on settings/rules_diagnostic first.
  const probeRef = doc(activeDb, 'settings', 'rules_diagnostic');
  const tryProbe = async (payload: Record<string, unknown>): Promise<boolean> => {
    try {
      await setDoc(probeRef, payload);
      return true;
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        return false;
      }
      throw err;
    }
  };

  try {
    await setDoc(probeRef, corePayload);

    const syncedTypographyToCloud = await tryProbe({
      ...corePayload,
      typography: normalizedTypography,
    });

    const syncedPopupShieldToCloud = await tryProbe({
      ...corePayload,
      popupShield: normalizedShield,
    });

    const brandingStandaloneOk = await tryProbe({
      ...corePayload,
      branding: firestoreBranding,
    });

    let brandingDefaultOk = brandingStandaloneOk;
    if (!brandingStandaloneOk) {
      brandingDefaultOk = await tryProbe({
        ...corePayload,
        branding: sanitizeBrandingForFirestore(DEFAULT_WEBSITE_BRANDING, 'RahaL TV'),
      });
    }

    const combinedGeneralWithBrandingOk =
      syncedTypographyToCloud && syncedPopupShieldToCloud && brandingStandaloneOk
        ? await tryProbe({
            ...corePayload,
            typography: normalizedTypography,
            popupShield: normalizedShield,
            branding: firestoreBranding,
          })
        : brandingStandaloneOk;

    const splitBrandingDocOk = await writeSplitBrandingDoc(activeDb, firestoreBranding, uid);
    const syncedBrandingToCloud = combinedGeneralWithBrandingOk || splitBrandingDocOk;

    const fullHomeOnGeneralOk = await tryProbe({
      ...corePayload,
      homeConfig: normalizedHome,
    });

    let syncedHomeToCloud = fullHomeOnGeneralOk;
    let homeConfigMode: HomeConfigRulesMode = fullHomeOnGeneralOk ? 'full' : 'rejected';
    let homeDefaultFullOk = fullHomeOnGeneralOk;
    const rejectedHomeKeys: string[] = [];
    let homeComplexityLimitDetected = false;
    let splitHomeResult = { homeLayoutOk: false, sliderStyleOk: false };

    if (!fullHomeOnGeneralOk) {
      splitHomeResult = await writeSplitHomeDocs(activeDb, normalizedHome, uid);
      if (splitHomeResult.homeLayoutOk && splitHomeResult.sliderStyleOk) {
        syncedHomeToCloud = true;
        homeConfigMode = 'split_sync';
      } else {
        const defaultHome = normalizeHomeConfig(DEFAULT_HOME_CONFIG);
        homeDefaultFullOk = await tryProbe({
          ...corePayload,
          homeConfig: defaultHome,
        });

        const autoplayBase = pickLegacyAutoplayHomeConfig(defaultHome);
        const autoplayOk = await tryProbe({
          ...corePayload,
          homeConfig: autoplayBase,
        });
        if (autoplayOk) {
          homeConfigMode = 'autoplay_only';
          const halfSplit = Math.ceil(HOME_CONFIG_SLIDER_STYLE_KEYS.length / 2);
          const firstHalfKeys = HOME_CONFIG_SLIDER_STYLE_KEYS.slice(0, halfSplit);
          const secondHalfKeys = HOME_CONFIG_SLIDER_STYLE_KEYS.slice(halfSplit);

          const buildWithKeys = (keys: readonly (typeof HOME_CONFIG_SLIDER_STYLE_KEYS)[number][]) => {
            const obj: Record<string, unknown> = { ...autoplayBase };
            for (const k of keys) {
              obj[k] = defaultHome[k];
            }
            return obj;
          };

          const halfAOk = await tryProbe({
            ...corePayload,
            homeConfig: buildWithKeys(firstHalfKeys),
          });
          const halfBOk = await tryProbe({
            ...corePayload,
            homeConfig: buildWithKeys(secondHalfKeys),
          });

          if (halfAOk && halfBOk) {
            homeComplexityLimitDetected = true;
          } else {
            if (!halfAOk) {
              for (const key of firstHalfKeys) {
                const ok = await tryProbe({
                  ...corePayload,
                  homeConfig: buildWithKeys([key]),
                });
                if (!ok) rejectedHomeKeys.push(key);
              }
            }
            if (!halfBOk) {
              for (const key of secondHalfKeys) {
                const ok = await tryProbe({
                  ...corePayload,
                  homeConfig: buildWithKeys([key]),
                });
                if (!ok) rejectedHomeKeys.push(key);
              }
            }
            if (rejectedHomeKeys.length === 0) {
              homeComplexityLimitDetected = true;
            }
          }
        } else {
          const coreOnlyOk = await tryProbe({
            ...corePayload,
            homeConfig: pickLegacyCoreHomeConfig(defaultHome),
          });
          if (coreOnlyOk) {
            homeConfigMode = 'core_only';
          }
        }
      }
    }

    let targetPlaceholders = imagePlaceholders;
    if (!targetPlaceholders) {
      try {
        const existingPhSnap = await getDoc(doc(activeDb, 'settings', 'image_placeholders'));
        if (existingPhSnap.exists()) {
          targetPlaceholders = normalizeImagePlaceholderConfig(
            existingPhSnap.data() as Partial<ImagePlaceholderConfig>
          );
        }
      } catch {
        // Fallback to local stored placeholder config
      }
    }
    const placeholderProbeRes = await saveImagePlaceholderConfigToFirestore(
      targetPlaceholders || loadStoredPlaceholderConfig(),
      actorUid
    );

    let recentlyWatchedReady = false;
    try {
      await getDoc(doc(activeDb, 'recently_watched', `${actorUid}__probe_check`));
      recentlyWatchedReady = true;
    } catch (rwErr) {
      if (!isPermissionDeniedError(rwErr)) {
        recentlyWatchedReady = true;
      }
    }

    let targetRwUi = recentlyWatchedUi;
    if (!targetRwUi) {
      try {
        const existingRwUiSnap = await getDoc(doc(activeDb, 'settings', 'recently_watched_ui'));
        if (existingRwUiSnap.exists()) {
          targetRwUi = normalizeRecentlyWatchedUiConfig(
            existingRwUiSnap.data() as Partial<RecentlyWatchedUiConfig>
          );
        }
      } catch {
        // Fallback to local stored recently watched UI config
      }
    }
    const rwUiProbeRes = await saveRecentlyWatchedUiConfigToFirestore(
      targetRwUi || loadStoredRecentlyWatchedUiConfig(),
      actorUid
    );

    let targetSliderVariant = loadHeroSliderVariant();
    let targetMobileSliderVariant = loadMobileHeroSliderVariant();
    try {
      const existingModeSnap = await getDoc(doc(activeDb, 'settings', 'hero_slider_mode'));
      if (existingModeSnap.exists()) {
        const modeData = existingModeSnap.data() as {
          variant?: unknown;
          mobileVariant?: unknown;
        };
        targetSliderVariant = normalizeHeroSliderVariant(modeData.variant);
        targetMobileSliderVariant =
          modeData.mobileVariant !== undefined
            ? normalizeHeroSliderVariant(modeData.mobileVariant)
            : targetSliderVariant;
      }
    } catch {
      // Fallback to local variants
    }
    const heroSliderModeProbeRes = await saveHeroSliderVariantToFirestore(
      targetSliderVariant,
      actorUid,
      targetMobileSliderVariant
    );

    let targetStreamV4Cfg = loadStreamV4SliderConfig();
    try {
      const existingV4Snap = await getDoc(doc(activeDb, 'settings', 'stream_v4_slider'));
      if (existingV4Snap.exists()) {
        targetStreamV4Cfg = normalizeStreamV4SliderConfig(
          existingV4Snap.data() as Partial<StreamV4SliderConfig>
        );
      }
    } catch {
      // Fallback to local config
    }
    const streamV4ProbeRes = await saveStreamV4SliderConfigToFirestore(
      targetStreamV4Cfg,
      actorUid
    );

    const rejectedSections = (
      ['homeConfig', 'typography', 'popupShield', 'branding'] as SettingsOptionalSection[]
    ).filter((k) => {
      if (k === 'homeConfig') return !syncedHomeToCloud;
      if (k === 'typography') return !syncedTypographyToCloud;
      if (k === 'popupShield') return !syncedPopupShieldToCloud;
      return !syncedBrandingToCloud;
    });

    const payloadIssueDetected =
      (!syncedHomeToCloud && homeDefaultFullOk) || (!syncedBrandingToCloud && brandingDefaultOk);

    const anyCoreRulePassed =
      syncedHomeToCloud ||
      syncedTypographyToCloud ||
      syncedPopupShieldToCloud ||
      syncedBrandingToCloud ||
      homeConfigMode === 'autoplay_only' ||
      homeConfigMode === 'core_only';

    const outdatedRulesDetected =
      !payloadIssueDetected &&
      !homeComplexityLimitDetected &&
      anyCoreRulePassed &&
      (!syncedHomeToCloud ||
        !syncedBrandingToCloud ||
        !placeholderProbeRes.ok ||
        !recentlyWatchedReady ||
        !rwUiProbeRes.ok ||
        !heroSliderModeProbeRes.ok ||
        !streamV4ProbeRes.ok);

    if (rejectedSections.length === 0) {
      // Immediately synchronize live settings across settings/general and split docs
      await saveSiteSettingsToFirestore(settings, actorUid);
    }

    return {
      ok: true,
      result: {
        syncedHomeToCloud,
        syncedTypographyToCloud,
        syncedPopupShieldToCloud,
        syncedBrandingToCloud,
        rejectedSections,
        projectId,
        databaseId,
      },
      homeConfigMode,
      outdatedRulesDetected,
      payloadIssueDetected,
      rejectedHomeKeys,
      homeComplexityLimitDetected,
      splitDocsReady: {
        homeLayout: splitHomeResult.homeLayoutOk,
        sliderStyle: splitHomeResult.sliderStyleOk,
        siteBranding: splitBrandingDocOk,
      },
      syncedImagePlaceholdersToCloud: placeholderProbeRes.ok,
      imagePlaceholdersErrorCode: placeholderProbeRes.errorCode,
      imagePlaceholdersErrorMessage: placeholderProbeRes.errorMessage,
      recentlyWatchedReady,
      recentlyWatchedUiReady: rwUiProbeRes.ok,
      recentlyWatchedUiErrorCode: rwUiProbeRes.errorCode,
      recentlyWatchedUiErrorMessage: rwUiProbeRes.errorMessage,
      heroSliderModeReady: heroSliderModeProbeRes.ok,
      heroSliderModeErrorCode: heroSliderModeProbeRes.errorCode,
      streamV4SliderReady: streamV4ProbeRes.ok,
      streamV4SliderErrorCode: streamV4ProbeRes.errorCode,
      userEmail,
      emailVerified,
    };
  } catch (err) {
    return {
      ok: false,
      errorMessage: formatFirestoreWriteError(err, 'تعذر الكتابة إلى إعدادات Firestore'),
      projectId,
      databaseId,
      userEmail,
      emailVerified,
    };
  }
}

export async function saveCustomFontToFirestore(
  font: CustomFontRecord,
  uid: string
): Promise<void> {
  const activeDb = getActiveDatabase();
  const slot: CustomFontSlot = font.id === 'english' ? 'english' : 'arabic';
  const path = `fonts/${slot}`;
  try {
    await setDoc(doc(activeDb, 'fonts', slot), {
      id: slot,
      family: String(font.family || `RahaLCustom_${slot}`).trim().slice(0, 80),
      fileName: String(font.fileName || 'custom-font').trim().slice(0, 160),
      format: font.format,
      sourceUrl: String(font.sourceUrl || '').trim().slice(0, 950000),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCustomFontFromFirestore(slot: CustomFontSlot): Promise<void> {
  const activeDb = getActiveDatabase();
  const cleanSlot: CustomFontSlot = slot === 'english' ? 'english' : 'arabic';
  const path = `fonts/${cleanSlot}`;
  try {
    await deleteDoc(doc(activeDb, 'fonts', cleanSlot));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function grantAdminRoleInFirestore(
  targetUid: string,
  displayName: string,
  addedByUid: string,
  role: AdminPrivilegeRole = 'moderator'
) {
  const activeDb = getActiveDatabase();
  const cleanUid = targetUid.trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
  const path = `admins/${cleanUid}`;
  try {
    await setDoc(doc(activeDb, 'admins', cleanUid), {
      uid: cleanUid,
      displayName: displayName.trim().slice(0, 120) || (role === 'owner' ? 'مسؤول RahaL TV' : 'مشرف RahaL TV'),
      addedBy: addedByUid,
      role,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createAdminAccountInFirebase(
  identifier: string,
  password: string,
  displayName: string,
  addedByUid: string,
  role: AdminPrivilegeRole = 'moderator'
): Promise<{ uid: string; email: string; role: AdminPrivilegeRole }> {
  const email = normalizeAuthIdentifier(identifier);
  const cleanName =
    displayName.trim().slice(0, 120) ||
    email.split('@')[0] ||
    (role === 'owner' ? 'مسؤول RahaL TV' : 'مشرف RahaL TV');
  const activeCfg = getActiveFirebaseConfig();
  const secondaryApp = initializeApp(
    {
      apiKey: activeCfg.apiKey,
      authDomain: activeCfg.authDomain,
      projectId: activeCfg.projectId,
      appId: activeCfg.appId,
      ...(activeCfg.storageBucket ? { storageBucket: activeCfg.storageBucket } : {}),
      ...(activeCfg.messagingSenderId ? { messagingSenderId: activeCfg.messagingSenderId } : {}),
    },
    `admin-creator-${Date.now()}`
  );
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await updateProfile(cred.user, { displayName: cleanName });
    await grantAdminRoleInFirestore(cred.user.uid, cleanName, addedByUid, role);
    await signOut(secondaryAuth);
    return { uid: cred.user.uid, email, role };
  } finally {
    await deleteApp(secondaryApp).catch(() => undefined);
  }
}

export async function updateAdminRoleInFirestore(
  targetUid: string,
  role: AdminPrivilegeRole
) {
  const activeDb = getActiveDatabase();
  const cleanUid = targetUid.trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
  const path = `admins/${cleanUid}`;
  try {
    await updateDoc(doc(activeDb, 'admins', cleanUid), { role });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function revokeAdminRoleFromFirestore(targetUid: string) {
  const activeDb = getActiveDatabase();
  const path = `admins/${targetUid}`;
  try {
    await deleteDoc(doc(activeDb, 'admins', targetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function sanitizeRatingMediaId(mediaId: string): string {
  return (
    String(mediaId || '')
      .trim()
      .replace(/[^a-zA-Z0-9_\-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 128) || 'media-item'
  );
}

export async function submitMediaRatingToFirestore(
  mediaId: string,
  uid: string,
  stars: number
): Promise<number> {
  const activeDb = getActiveDatabase();
  const cleanMediaId = sanitizeRatingMediaId(mediaId);
  const cleanUid = String(uid || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
  const ratingId = `${cleanMediaId}__${cleanUid}`;
  const path = `ratings/${ratingId}`;
  const safeStars = Math.min(5, Math.max(1, Math.round(Number(stars) || 5)));

  try {
    const ratingRef = doc(activeDb, 'ratings', ratingId);
    const snap = await getDoc(ratingRef);
    if (snap.exists()) {
      await updateDoc(ratingRef, {
        stars: safeStars,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ratingRef, {
        id: ratingId,
        mediaId: cleanMediaId,
        userId: cleanUid,
        stars: safeStars,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return safeStars;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMediaRatingFromFirestore(mediaId: string, uid: string) {
  const activeDb = getActiveDatabase();
  const cleanMediaId = sanitizeRatingMediaId(mediaId);
  const cleanUid = String(uid || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
  const ratingId = `${cleanMediaId}__${cleanUid}`;
  const path = `ratings/${ratingId}`;

  try {
    await deleteDoc(doc(activeDb, 'ratings', ratingId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function recordAnalyticsEventInFirestore(
  dayKey: string,
  event: {
    kind: 'playback_start' | 'playback_complete' | 'watchlist_add';
    mediaId: string;
    episodeKey?: string;
    genres?: string[];
  }
): Promise<void> {
  const activeDb = getActiveDatabase();
  const cleanDay = String(dayKey || '').replace(/[^0-9\-]/g, '').slice(0, 20);
  if (!cleanDay) return;
  const cleanMedia = sanitizeRatingMediaId(event.mediaId);
  const docRef = doc(activeDb, 'analytics_daily', cleanDay);
  try {
    const updateData: Record<string, unknown> = {
      id: cleanDay,
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    };
    if (event.kind === 'playback_start') {
      updateData.playbackStarts = increment(1);
      updateData[`mediaCounts.${cleanMedia}`] = increment(1);
      if (event.episodeKey) {
        const cleanEp = String(event.episodeKey).replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 160);
        updateData[`episodeCounts.${cleanEp}`] = increment(1);
      }
      for (const g of (event.genres || []).slice(0, 4)) {
        const cleanG = String(g || '').trim().replace(/[.$/[\]#]/g, '_').slice(0, 60);
        if (cleanG) {
          updateData[`genreCounts.${cleanG}`] = increment(1);
        }
      }
    } else if (event.kind === 'playback_complete') {
      updateData.playbackCompletes = increment(1);
    } else if (event.kind === 'watchlist_add') {
      updateData.watchlistAdds = increment(1);
    }
    await setDoc(docRef, updateData, { merge: true });
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      reportClientError({
        source: 'firestore.analytics',
        level: 'warn',
        message: `Analytics write failed for ${cleanDay}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

export async function fetchAnalyticsDailyRange(days = 30): Promise<AnalyticsDailyRecord[]> {
  const activeDb = getActiveDatabase();
  const safeDays = Math.max(1, Math.min(90, Math.round(days)));
  try {
    const q = query(
      collection(activeDb, 'analytics_daily'),
      orderBy('id', 'desc'),
      limit(safeDays)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as Partial<AnalyticsDailyRecord>;
      return {
        id: String(data.id || d.id),
        playbackStarts: Number(data.playbackStarts) || 0,
        playbackCompletes: Number(data.playbackCompletes) || 0,
        watchlistAdds: Number(data.watchlistAdds) || 0,
        mediaCounts: (data.mediaCounts || {}) as Record<string, number>,
        episodeCounts: (data.episodeCounts || {}) as Record<string, number>,
        genreCounts: (data.genreCounts || {}) as Record<string, number>,
        updatedAtMs: Number(data.updatedAtMs) || Date.now(),
      };
    });
  } catch {
    return [];
  }
}

export async function saveUserSubProfileToFirestore(
  uid: string,
  profile: UserSubProfile
): Promise<void> {
  const activeDb = getActiveDatabase();
  const cleanUid = String(uid || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
  const cleanProfileId = String(profile.id || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 64);
  if (!cleanUid || !cleanProfileId) return;
  try {
    await setDoc(doc(activeDb, 'users', cleanUid, 'profiles', cleanProfileId), {
      ...profile,
      id: cleanProfileId,
      userId: cleanUid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.WRITE, `users/${cleanUid}/profiles/${cleanProfileId}`);
    }
  }
}

export async function deleteUserSubProfileFromFirestore(
  uid: string,
  profileId: string
): Promise<void> {
  const activeDb = getActiveDatabase();
  const cleanUid = String(uid || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
  const cleanProfileId = String(profileId || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 64);
  if (!cleanUid || !cleanProfileId) return;
  try {
    await deleteDoc(doc(activeDb, 'users', cleanUid, 'profiles', cleanProfileId));
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.DELETE, `users/${cleanUid}/profiles/${cleanProfileId}`);
    }
  }
}

export function buildServerHealthId(url: string): string {
  const raw = String(url || '').trim();
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  let host = 'srv';
  try {
    host = new URL(raw).hostname.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48) || 'srv';
  } catch {
    host = 'srv';
  }
  return `${host}_${hex}`.slice(0, 128);
}

export async function saveServerHealthRecordToFirestore(
  record: ServerHealthRecord,
  uid?: string
): Promise<void> {
  const activeDb = getActiveDatabase();
  const id = record.id || buildServerHealthId(record.url);
  try {
    await setDoc(doc(activeDb, 'server_health', id), {
      ...record,
      id,
      ...(uid ? { checkedBy: uid } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal: localStorage cache remains authoritative fallback
  }
}

export async function bulkSaveServerHealthRecordsToFirestore(
  records: ServerHealthRecord[],
  uid?: string
): Promise<void> {
  if (!records || records.length === 0) return;
  const activeDb = getActiveDatabase();
  try {
    const batch = writeBatch(activeDb);
    for (const rec of records.slice(0, 100)) {
      const id = rec.id || buildServerHealthId(rec.url);
      batch.set(doc(activeDb, 'server_health', id), {
        ...rec,
        id,
        ...(uid ? { checkedBy: uid } : {}),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch {
    // Non-fatal: localStorage cache remains authoritative fallback
  }
}

export async function saveWatchProgressToFirestore(
  record: WatchProgressRecord
): Promise<void> {
  const activeDb = getActiveDatabase();
  const cleanId = String(record.id || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 260);
  if (!cleanId) return;
  try {
    await setDoc(doc(activeDb, 'watch_progress', cleanId), {
      ...record,
      id: cleanId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      reportClientError({
        source: 'firestore.watch_progress',
        level: 'warn',
        message: `Watch progress write failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

export async function deleteWatchProgressFromFirestore(progressId: string): Promise<void> {
  const activeDb = getActiveDatabase();
  const cleanId = String(progressId || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 260);
  if (!cleanId) return;
  try {
    await deleteDoc(doc(activeDb, 'watch_progress', cleanId));
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      reportClientError({
        source: 'firestore.watch_progress',
        level: 'warn',
        message: `Watch progress delete failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

export interface SaveImagePlaceholdersResult {
  ok: boolean;
  projectId: string;
  databaseId: string;
  errorCode?: string;
  errorMessage?: string;
}

export async function saveImagePlaceholderConfigToFirestore(
  cfg: ImagePlaceholderConfig,
  uid: string
): Promise<SaveImagePlaceholdersResult> {
  const activeDb = getActiveDatabase();
  const activeCfg = getActiveFirebaseConfig();
  const projectId = activeCfg.projectId;
  const databaseId = activeCfg.firestoreDatabaseId || '(default)';
  const actorUid = getActiveAuth().currentUser?.uid || uid;
  const cleanCfg = sanitizePlaceholderConfigForFirestore(normalizeImagePlaceholderConfig(cfg));
  try {
    await setDoc(doc(activeDb, 'settings', 'image_placeholders'), {
      ...cleanCfg,
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
    });
    return { ok: true, projectId, databaseId };
  } catch (error) {
    const { code, message } = getFirebaseErrorCodeAndMessage(error);
    reportClientError({
      source: 'firestore.settings.image_placeholders',
      level: 'warn',
      message: `Write to settings/image_placeholders on ${projectId}/${databaseId} failed (${code || 'unknown'}): ${message}`,
      context: { projectId, databaseId, actorUid },
    });
    if (!isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/image_placeholders');
    }
    return {
      ok: false,
      projectId,
      databaseId,
      errorCode: code || 'permission-denied',
      errorMessage: message,
    };
  }
}

export async function saveRecentlyWatchedUiConfigToFirestore(
  cfg: RecentlyWatchedUiConfig,
  uid: string
): Promise<SaveImagePlaceholdersResult> {
  const activeDb = getActiveDatabase();
  const activeCfg = getActiveFirebaseConfig();
  const projectId = activeCfg.projectId;
  const databaseId = activeCfg.firestoreDatabaseId || '(default)';
  const actorUid = getActiveAuth().currentUser?.uid || uid;
  const cleanCfg = sanitizeRecentlyWatchedUiForFirestore(
    normalizeRecentlyWatchedUiConfig(cfg)
  );
  try {
    await setDoc(doc(activeDb, 'settings', 'recently_watched_ui'), {
      ...cleanCfg,
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
    });
    return { ok: true, projectId, databaseId };
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      const legacyPayload: Record<string, unknown> = { ...cleanCfg };
      delete legacyPayload.cardStyle;
      try {
        await setDoc(doc(activeDb, 'settings', 'recently_watched_ui'), {
          ...legacyPayload,
          updatedBy: actorUid,
          updatedAt: serverTimestamp(),
        });
        return { ok: true, projectId, databaseId };
      } catch {
        // Fall through to report original error below
      }
    }
    const { code, message } = getFirebaseErrorCodeAndMessage(error);
    reportClientError({
      source: 'firestore.settings.recently_watched_ui',
      level: 'warn',
      message: `Write to settings/recently_watched_ui on ${projectId}/${databaseId} failed (${code || 'unknown'}): ${message}`,
      context: { projectId, databaseId, actorUid },
    });
    if (!isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/recently_watched_ui');
    }
    return {
      ok: false,
      projectId,
      databaseId,
      errorCode: code || 'permission-denied',
      errorMessage: message,
    };
  }
}

export async function saveSiteThemeToFirestore(
  siteThemeId: SiteThemeId,
  uid: string
): Promise<SaveImagePlaceholdersResult> {
  const activeDb = getActiveDatabase();
  const activeCfg = getActiveFirebaseConfig();
  const projectId = activeCfg.projectId;
  const databaseId = activeCfg.firestoreDatabaseId || '(default)';
  const actorUid = getActiveAuth().currentUser?.uid || uid;
  const normalizedThemeId = normalizeSiteThemeId(siteThemeId);
  try {
    await setDoc(doc(activeDb, 'settings', 'site_theme'), {
      siteThemeId: normalizedThemeId,
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
    });
    return { ok: true, projectId, databaseId };
  } catch (error) {
    const { code, message } = getFirebaseErrorCodeAndMessage(error);
    reportClientError({
      source: 'firestore.settings.site_theme',
      level: 'warn',
      message: `Write to settings/site_theme on ${projectId}/${databaseId} failed (${code || 'unknown'}): ${message}`,
      context: { projectId, databaseId, actorUid },
    });
    if (!isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/site_theme');
    }
    return {
      ok: false,
      projectId,
      databaseId,
      errorCode: code || 'permission-denied',
      errorMessage: message,
    };
  }
}

function buildRecentlyWatchedDocPayload(record: RecentlyWatchedRecord, includeCreatedAt: boolean) {
  const cleanId = String(record.id || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 260);
  const payload: Record<string, unknown> = {
    id: cleanId,
    userId: String(record.userId || '').trim().slice(0, 128),
    mediaId: sanitizeRatingMediaId(record.mediaId),
    title: String(record.title || '').trim().slice(0, 200) || 'عمل بدون عنوان',
    kind: (['movie', 'series', 'tv', 'wrestling'] as const).includes(record.kind) ? record.kind : 'movie',
    poster: String(record.poster || '').trim().slice(0, 500),
    backdrop: String(record.backdrop || '').trim().slice(0, 500),
    year: String(record.year || '').trim().slice(0, 10),
    quality: String(record.quality || '').trim().slice(0, 40),
    slug: String(record.slug || '').trim().slice(0, 128),
    englishTitle: String(record.englishTitle || '').trim().slice(0, 200),
    positionSec: Math.max(0, Math.round(Number(record.positionSec) || 0)),
    durationSec: Math.max(0, Math.round(Number(record.durationSec) || 0)),
    progressPct: Math.min(100, Math.max(0, Math.round(Number(record.progressPct) || 0))),
    completed: Boolean(record.completed),
    lastWatchedAtMs: Number(record.lastWatchedAtMs) || Date.now(),
    createdAtMs: Number(record.createdAtMs) || Date.now(),
    updatedAt: serverTimestamp(),
  };
  if (typeof record.seasonNumber === 'number') {
    payload.seasonNumber = Math.max(1, Math.round(record.seasonNumber));
  }
  if (typeof record.episodeNumber === 'number') {
    payload.episodeNumber = Math.max(1, Math.round(record.episodeNumber));
  }
  if (record.episodeTitle) {
    payload.episodeTitle = String(record.episodeTitle).trim().slice(0, 120);
  }
  if (typeof record.lastServerIndex === 'number') {
    payload.lastServerIndex = Math.max(0, Math.round(record.lastServerIndex));
  }
  if (record.lastServerUrl) {
    payload.lastServerUrl = String(record.lastServerUrl).trim().slice(0, 600);
  }
  if (includeCreatedAt) {
    payload.createdAt = serverTimestamp();
  }
  return { cleanId, payload };
}

export async function saveRecentlyWatchedToFirestore(
  record: RecentlyWatchedRecord,
  isNewCandidate = false
): Promise<boolean> {
  const activeDb = getActiveDatabase();
  const cleanId = String(record.id || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 260);
  if (!cleanId || !record.userId || record.userId === 'guest') return false;

  try {
    const docRef = doc(activeDb, 'recently_watched', cleanId);
    let existsOnServer = !isNewCandidate;
    if (isNewCandidate) {
      const snap = await getDoc(docRef);
      existsOnServer = snap.exists();
    }
    const { payload } = buildRecentlyWatchedDocPayload(record, !existsOnServer);
    if (existsOnServer) {
      await setDoc(docRef, payload, { merge: true });
    } else {
      await setDoc(docRef, payload);
    }
    return true;
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      reportClientError({
        source: 'firestore.recently_watched',
        level: 'warn',
        message: `Recently watched write failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    return false;
  }
}

export async function batchMergeRecentlyWatchedToFirestore(
  records: RecentlyWatchedRecord[]
): Promise<boolean> {
  if (!records.length) return true;
  const activeDb = getActiveDatabase();
  try {
    const slice = records.slice(0, 40);
    const existenceFlags = await Promise.all(
      slice.map(async (rec) => {
        const cleanId = String(rec.id || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 260);
        if (!cleanId || !rec.userId || rec.userId === 'guest') return false;
        try {
          const snap = await getDoc(doc(activeDb, 'recently_watched', cleanId));
          return snap.exists();
        } catch {
          return false;
        }
      })
    );

    const batch = writeBatch(activeDb);
    let ops = 0;
    slice.forEach((rec, idx) => {
      const existsOnServer = existenceFlags[idx];
      const { cleanId, payload } = buildRecentlyWatchedDocPayload(rec, !existsOnServer);
      if (!cleanId || !rec.userId || rec.userId === 'guest') return;
      if (existsOnServer) {
        batch.set(doc(activeDb, 'recently_watched', cleanId), payload, { merge: true });
      } else {
        batch.set(doc(activeDb, 'recently_watched', cleanId), payload);
      }
      ops += 1;
    });
    if (ops > 0) {
      await batch.commit();
    }
    return true;
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      reportClientError({
        source: 'firestore.recently_watched.merge',
        level: 'warn',
        message: `Recently watched batch merge failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    return false;
  }
}

export async function deleteRecentlyWatchedFromFirestore(entryId: string): Promise<boolean> {
  const activeDb = getActiveDatabase();
  const cleanId = String(entryId || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 260);
  if (!cleanId) return false;
  try {
    await deleteDoc(doc(activeDb, 'recently_watched', cleanId));
    return true;
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      reportClientError({
        source: 'firestore.recently_watched.delete',
        level: 'warn',
        message: `Recently watched delete failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    return false;
  }
}

export async function clearRecentlyWatchedCollectionForUser(uid: string): Promise<boolean> {
  const activeDb = getActiveDatabase();
  const cleanUid = String(uid || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
  if (!cleanUid) return false;
  try {
    const q = query(
      collection(activeDb, 'recently_watched'),
      where('userId', '==', cleanUid),
      limit(100)
    );
    const snap = await getDocs(q);
    if (snap.empty) return true;
    const batch = writeBatch(activeDb);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return true;
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      reportClientError({
        source: 'firestore.recently_watched.clear',
        level: 'warn',
        message: `Recently watched clear failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    return false;
  }
}

export async function saveHeroSliderVariantToFirestore(
  variant: HeroSliderVariant,
  uid: string,
  mobileVariant?: HeroSliderVariant
): Promise<SaveImagePlaceholdersResult> {
  const activeDb = getActiveDatabase();
  const activeCfg = getActiveFirebaseConfig();
  const projectId = activeCfg.projectId;
  const databaseId = activeCfg.firestoreDatabaseId || '(default)';
  const actorUid = getActiveAuth().currentUser?.uid || uid;
  const normalizedVariant = normalizeHeroSliderVariant(variant);
  const normalizedMobileVariant = normalizeHeroSliderVariant(
    mobileVariant ?? loadMobileHeroSliderVariant()
  );
  try {
    await setDoc(doc(activeDb, 'settings', 'hero_slider_mode'), {
      variant: normalizedVariant,
      mobileVariant: normalizedMobileVariant,
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
    });
    return { ok: true, projectId, databaseId };
  } catch (error) {
    if (
      isPermissionDeniedError(error) &&
      normalizedMobileVariant === normalizedVariant &&
      ['original', 'cinematic', 'stream_v4'].includes(normalizedVariant)
    ) {
      try {
        await setDoc(doc(activeDb, 'settings', 'hero_slider_mode'), {
          variant: normalizedVariant,
          updatedBy: actorUid,
          updatedAt: serverTimestamp(),
        });
        return { ok: true, projectId, databaseId };
      } catch {
        // Fall through to normal error reporting below
      }
    }
    const { code, message } = getFirebaseErrorCodeAndMessage(error);
    reportClientError({
      source: 'firestore.settings.hero_slider_mode',
      level: 'warn',
      message: `Write to settings/hero_slider_mode on ${projectId}/${databaseId} failed (${code || 'unknown'}): ${message}`,
      context: { projectId, databaseId, actorUid },
    });
    if (!isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/hero_slider_mode');
    }
    return {
      ok: false,
      projectId,
      databaseId,
      errorCode: code || 'permission-denied',
      errorMessage: message,
    };
  }
}

export async function saveStreamV4SliderConfigToFirestore(
  cfg: StreamV4SliderConfig,
  uid: string
): Promise<SaveImagePlaceholdersResult> {
  const activeDb = getActiveDatabase();
  const activeCfg = getActiveFirebaseConfig();
  const projectId = activeCfg.projectId;
  const databaseId = activeCfg.firestoreDatabaseId || '(default)';
  const actorUid = getActiveAuth().currentUser?.uid || uid;
  const cleanCfg = sanitizeStreamV4SliderConfigForFirestore(cfg);
  try {
    await setDoc(doc(activeDb, 'settings', 'stream_v4_slider'), {
      ...cleanCfg,
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
    });
    return { ok: true, projectId, databaseId };
  } catch (error) {
    const { code, message } = getFirebaseErrorCodeAndMessage(error);
    reportClientError({
      source: 'firestore.settings.stream_v4_slider',
      level: 'warn',
      message: `Write to settings/stream_v4_slider on ${projectId}/${databaseId} failed (${code || 'unknown'}): ${message}`,
      context: { projectId, databaseId, actorUid },
    });
    if (!isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/stream_v4_slider');
    }
    return {
      ok: false,
      projectId,
      databaseId,
      errorCode: code || 'permission-denied',
      errorMessage: message,
    };
  }
}



