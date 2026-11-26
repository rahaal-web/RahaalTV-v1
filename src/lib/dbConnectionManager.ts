import { deleteApp, FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getCountFromServer,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  limit,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import defaultFirebaseConfig from '../../firebase-applet-config.json';
import { resolveApiEndpoint, shouldSkipBackendApiCalls } from './clientScraper';
import {
  DatabaseBackupBundle,
  DatabaseConnectionHealthStatus,
  DatabaseConnectionLogEntry,
  DatabaseConnectionProfile,
  DatabaseConnectionRegistryState,
  DatabaseConnectionTestResult,
  DatabaseLogEventType,
  DatabaseMigrationCollectionCount,
  DatabaseMigrationReport,
  DatabaseProviderType,
  DatabaseServerSecretStatus,
  DatabaseTestStepResult,
  FirebaseConnectionFields,
} from '../types/database';

export const BUILTIN_DEFAULT_CONNECTION_ID = 'builtin-default-firestore';
const STORAGE_DB_REGISTRY = 'rahaltv_db_connections_v1';
const STORAGE_DB_LOGS = 'rahaltv_db_logs_v1';
const MAX_DB_LOGS = 120;

const SECRET_KEY_PATTERN =
  /(serviceAccount|private[_-]?key|secret|password|cloudflareToken|adminToken)/i;

const HEALTH_STATUS_LABELS_AR: Record<DatabaseConnectionHealthStatus, string> = {
  connected: 'متصل',
  offline: 'غير متصل',
  invalid_config: 'بيانات غير صحيحة',
  permission_denied: 'مشكلة في الصلاحيات',
  timeout: 'انتهت مهلة الاتصال',
  quota_exceeded: 'تم تجاوز الحصة اليومية',
  untested: 'لم يتم الاختبار بعد',
};

export const PROVIDER_LABELS_AR: Record<DatabaseProviderType, string> = {
  firebase_firestore: 'Firebase Firestore',
  firebase_realtime: 'Firebase Realtime Database',
  custom_api: 'خادم / API قاعدة بيانات مخصصة',
};

const MIGRATION_COLLECTIONS: Array<{ name: string; labelAr: string }> = [
  { name: 'media', labelAr: 'الأفلام والمسلسلات (media)' },
  { name: 'settings', labelAr: 'إعدادات الموقع والمظهر (settings)' },
  { name: 'requests', labelAr: 'طلبات الزوار (requests)' },
  { name: 'fonts', labelAr: 'الخطوط المخصصة (fonts)' },
  { name: 'scraper_adapters', labelAr: 'محولات الجلب (scraper_adapters)' },
  { name: 'ratings', labelAr: 'التقييمات (ratings)' },
  { name: 'admins', labelAr: 'المشرفون (admins)' },
];

function nowIso(): string {
  return new Date().toISOString();
}

export function computeConfigChecksum(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function stripSecretFields<T extends Record<string, unknown>>(obj: T): T {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = stripSecretFields(value as Record<string, unknown>);
    } else {
      clean[key] = value;
    }
  }
  return clean as T;
}

export function buildDefaultBuiltInProfile(): DatabaseConnectionProfile {
  const cfg = defaultFirebaseConfig as {
    projectId?: string;
    apiKey?: string;
    authDomain?: string;
    firestoreDatabaseId?: string;
    databaseURL?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
    measurementId?: string;
  };
  const ts = '2026-01-01T00:00:00.000Z';
  return {
    id: BUILTIN_DEFAULT_CONNECTION_ID,
    name: 'قاعدة البيانات الرئيسية (RahaL TV Firestore)',
    description: 'الإعداد الافتراضي المدمج في المشروع (firebase-applet-config.json)',
    providerType: 'firebase_firestore',
    isBuiltIn: true,
    firebaseConfig: {
      projectId: String(cfg.projectId || ''),
      apiKey: String(cfg.apiKey || ''),
      authDomain: String(cfg.authDomain || ''),
      firestoreDatabaseId: String(cfg.firestoreDatabaseId || '(default)'),
      databaseURL: String(cfg.databaseURL || ''),
      storageBucket: String(cfg.storageBucket || ''),
      messagingSenderId: String(cfg.messagingSenderId || ''),
      appId: String(cfg.appId || ''),
      measurementId: String(cfg.measurementId || ''),
    },
    lastStatus: 'untested',
    createdAt: ts,
    updatedAt: ts,
  };
}

function normalizeFirebaseFields(
  raw?: Partial<FirebaseConnectionFields>
): FirebaseConnectionFields {
  const projectId = String(raw?.projectId || '').trim();
  const authDomain =
    String(raw?.authDomain || '').trim() ||
    (projectId ? `${projectId}.firebaseapp.com` : '');
  return {
    projectId,
    apiKey: String(raw?.apiKey || '').trim(),
    authDomain,
    firestoreDatabaseId: String(raw?.firestoreDatabaseId || '(default)').trim() || '(default)',
    databaseURL: String(raw?.databaseURL || '').trim(),
    storageBucket: String(raw?.storageBucket || '').trim(),
    messagingSenderId: String(raw?.messagingSenderId || '').trim(),
    appId: String(raw?.appId || '').trim(),
    measurementId: String(raw?.measurementId || '').trim(),
  };
}

export function normalizeConnectionProfile(
  raw: Partial<DatabaseConnectionProfile>
): DatabaseConnectionProfile {
  const builtIn = buildDefaultBuiltInProfile();
  const sanitized = stripSecretFields(raw as Record<string, unknown>) as Partial<DatabaseConnectionProfile>;
  const providerType: DatabaseProviderType =
    sanitized.providerType === 'firebase_realtime' ||
    sanitized.providerType === 'custom_api'
      ? sanitized.providerType
      : 'firebase_firestore';
  const id = String(sanitized.id || `db_${Date.now()}`)
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '-')
    .slice(0, 96);

  return {
    id: id || `db_${Date.now()}`,
    name: String(sanitized.name || 'اتصال قاعدة بيانات').trim().slice(0, 120) || 'اتصال قاعدة بيانات',
    description: String(sanitized.description || '').trim().slice(0, 260),
    providerType,
    isBuiltIn: Boolean(sanitized.isBuiltIn || id === BUILTIN_DEFAULT_CONNECTION_ID),
    firebaseConfig: normalizeFirebaseFields(
      sanitized.firebaseConfig || builtIn.firebaseConfig
    ),
    customApiConfig: sanitized.customApiConfig
      ? {
          endpointUrl: String(sanitized.customApiConfig.endpointUrl || '').trim(),
          healthPath: String(sanitized.customApiConfig.healthPath || '/health').trim() || '/health',
          authHeaderName:
            String(sanitized.customApiConfig.authHeaderName || 'Authorization').trim() ||
            'Authorization',
          useWorkerProxy: Boolean(sanitized.customApiConfig.useWorkerProxy),
        }
      : undefined,
    lastStatus: sanitized.lastStatus || 'untested',
    lastStatusMessage: sanitized.lastStatusMessage
      ? String(sanitized.lastStatusMessage).slice(0, 400)
      : undefined,
    lastLatencyMs:
      typeof sanitized.lastLatencyMs === 'number' ? sanitized.lastLatencyMs : undefined,
    lastConnectedAt: sanitized.lastConnectedAt,
    lastDisconnectedAt: sanitized.lastDisconnectedAt,
    lastTestedAt: sanitized.lastTestedAt,
    createdAt: sanitized.createdAt || nowIso(),
    updatedAt: sanitized.updatedAt || nowIso(),
    createdBy: sanitized.createdBy,
    updatedBy: sanitized.updatedBy,
  };
}

function getDefaultRegistryState(): DatabaseConnectionRegistryState {
  const builtIn = buildDefaultBuiltInProfile();
  return {
    version: 1,
    activeConnectionId: builtIn.id,
    previousConnectionId: null,
    defaultConnectionId: builtIn.id,
    lastGoodConnectionId: builtIn.id,
    autoRetryEnabled: true,
    updatedAtMs: 0,
    deletedProfileIds: [],
    profiles: [builtIn],
  };
}

let inMemoryRegistry: DatabaseConnectionRegistryState | null = null;
let inMemoryLogs: DatabaseConnectionLogEntry[] | null = null;

export function loadDatabaseRegistry(): DatabaseConnectionRegistryState {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    if (!inMemoryRegistry) inMemoryRegistry = getDefaultRegistryState();
    return inMemoryRegistry;
  }

  try {
    const raw = localStorage.getItem(STORAGE_DB_REGISTRY);
    if (!raw) {
      const def = getDefaultRegistryState();
      saveDatabaseRegistry(def);
      return def;
    }
    const parsed = JSON.parse(raw) as Partial<DatabaseConnectionRegistryState>;
    const builtIn = buildDefaultBuiltInProfile();
    const rawProfiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
    const normalizedProfiles = rawProfiles.map((p) => {
      const norm = normalizeConnectionProfile(p);
      if (norm.id !== BUILTIN_DEFAULT_CONNECTION_ID) return norm;
      const sameTarget =
        norm.firebaseConfig.projectId === builtIn.firebaseConfig.projectId &&
        norm.firebaseConfig.firestoreDatabaseId === builtIn.firebaseConfig.firestoreDatabaseId &&
        norm.firebaseConfig.apiKey === builtIn.firebaseConfig.apiKey;
      return {
        ...norm,
        name: builtIn.name,
        description: builtIn.description,
        providerType: builtIn.providerType,
        isBuiltIn: true,
        firebaseConfig: builtIn.firebaseConfig,
        ...(sameTarget
          ? {}
          : {
              lastStatus: 'untested' as const,
              lastStatusMessage: undefined,
              lastLatencyMs: undefined,
              lastTestedAt: undefined,
            }),
      };
    });

    // Always guarantee built-in fallback exists and stays protected
    if (!normalizedProfiles.some((p) => p.id === BUILTIN_DEFAULT_CONNECTION_ID)) {
      normalizedProfiles.unshift(builtIn);
    }

    const idSet = new Set(normalizedProfiles.map((p) => p.id));
    const activeConnectionId =
      parsed.activeConnectionId && idSet.has(parsed.activeConnectionId)
        ? parsed.activeConnectionId
        : BUILTIN_DEFAULT_CONNECTION_ID;
    const defaultConnectionId =
      parsed.defaultConnectionId && idSet.has(parsed.defaultConnectionId)
        ? parsed.defaultConnectionId
        : BUILTIN_DEFAULT_CONNECTION_ID;
    const lastGoodConnectionId =
      parsed.lastGoodConnectionId && idSet.has(parsed.lastGoodConnectionId)
        ? parsed.lastGoodConnectionId
        : activeConnectionId;
    const previousConnectionId =
      parsed.previousConnectionId &&
      idSet.has(parsed.previousConnectionId) &&
      parsed.previousConnectionId !== activeConnectionId
        ? parsed.previousConnectionId
        : null;

    const rawState: DatabaseConnectionRegistryState = {
      version: 1,
      activeConnectionId,
      previousConnectionId,
      defaultConnectionId,
      lastGoodConnectionId,
      autoRetryEnabled: parsed.autoRetryEnabled ?? true,
      updatedAtMs:
        typeof parsed.updatedAtMs === 'number' && Number.isFinite(parsed.updatedAtMs)
          ? Math.max(0, Math.round(parsed.updatedAtMs))
          : 0,
      deletedProfileIds: Array.isArray(parsed.deletedProfileIds)
        ? parsed.deletedProfileIds
            .filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
            .slice(-40)
        : [],
      profiles: normalizedProfiles,
    };
    const { state, changed } = consolidateBuiltInDuplicates(rawState);
    if (changed) {
      return saveDatabaseRegistry(state);
    }
    inMemoryRegistry = state;
    return state;
  } catch {
    const def = getDefaultRegistryState();
    inMemoryRegistry = def;
    return def;
  }
}

export function saveDatabaseRegistry(
  next: DatabaseConnectionRegistryState
): DatabaseConnectionRegistryState {
  const cleanedProfiles = next.profiles.map((p) => normalizeConnectionProfile(p));
  if (!cleanedProfiles.some((p) => p.id === BUILTIN_DEFAULT_CONNECTION_ID)) {
    cleanedProfiles.unshift(buildDefaultBuiltInProfile());
  }
  const cleanDeletedIds = Array.isArray(next.deletedProfileIds)
    ? Array.from(
        new Set(
          next.deletedProfileIds
            .map((x) => String(x || '').trim())
            .filter((x) => Boolean(x) && x !== BUILTIN_DEFAULT_CONNECTION_ID)
        )
      ).slice(-40)
    : [];
  const cleanState: DatabaseConnectionRegistryState = {
    version: 1,
    activeConnectionId: next.activeConnectionId,
    previousConnectionId: next.previousConnectionId,
    defaultConnectionId: next.defaultConnectionId,
    lastGoodConnectionId: next.lastGoodConnectionId,
    autoRetryEnabled: Boolean(next.autoRetryEnabled),
    updatedAtMs:
      typeof next.updatedAtMs === 'number' && Number.isFinite(next.updatedAtMs)
        ? Math.max(0, Math.round(next.updatedAtMs))
        : 0,
    deletedProfileIds: cleanDeletedIds,
    profiles: cleanedProfiles,
  };
  inMemoryRegistry = cleanState;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_DB_REGISTRY, JSON.stringify(cleanState));
    } catch {
      // Ignore storage quota issues gracefully
    }
  }
  return cleanState;
}

export function loadDatabaseConnectionLogs(): DatabaseConnectionLogEntry[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return inMemoryLogs || [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_DB_LOGS);
    if (!raw) return inMemoryLogs || [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DatabaseConnectionLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendDatabaseConnectionLog(
  entry: Omit<DatabaseConnectionLogEntry, 'id' | 'timestamp'>
): DatabaseConnectionLogEntry[] {
  const fullEntry: DatabaseConnectionLogEntry = {
    ...entry,
    id: `dblog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: nowIso(),
    message: String(entry.message || '').slice(0, 500),
    rawError: entry.rawError ? String(entry.rawError).slice(0, 600) : undefined,
  };
  const next = [fullEntry, ...loadDatabaseConnectionLogs()].slice(0, MAX_DB_LOGS);
  inMemoryLogs = next;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_DB_LOGS, JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
  }
  notifyRegistryChanged();
  return next;
}

export function clearDatabaseConnectionLogs(): DatabaseConnectionLogEntry[] {
  inMemoryLogs = [];
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_DB_LOGS);
    } catch {
      // Ignore
    }
  }
  notifyRegistryChanged();
  return [];
}

// ---------------- Unified Live Firebase Instance Registry ----------------
const activeChangeListeners = new Set<() => void>();
const registryUiListeners = new Set<() => void>();

function notifyRegistryChanged() {
  registryUiListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // Ignore listener errors
    }
  });
}

export function subscribeDatabaseRegistryUi(cb: () => void): () => void {
  registryUiListeners.add(cb);
  return () => registryUiListeners.delete(cb);
}

export function subscribeActiveDatabaseChange(cb: () => void): () => void {
  activeChangeListeners.add(cb);
  return () => activeChangeListeners.delete(cb);
}

function notifyActiveDatabaseSwitched() {
  activeChangeListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // Ignore listener errors
    }
  });
  notifyRegistryChanged();
}

export function getActiveConnectionProfile(): DatabaseConnectionProfile {
  const reg = loadDatabaseRegistry();
  return (
    reg.profiles.find((p) => p.id === reg.activeConnectionId) ||
    reg.profiles.find((p) => p.id === reg.defaultConnectionId) ||
    reg.profiles[0] ||
    buildDefaultBuiltInProfile()
  );
}

export function getActiveFirebaseConfig(): FirebaseConnectionFields {
  return getActiveConnectionProfile().firebaseConfig;
}

function toSdkFirebaseOptions(fields: FirebaseConnectionFields) {
  const opts: Record<string, string> = {
    projectId: fields.projectId,
    apiKey: fields.apiKey,
    authDomain: fields.authDomain,
    appId: fields.appId,
  };
  if (fields.databaseURL) opts.databaseURL = fields.databaseURL;
  if (fields.storageBucket) opts.storageBucket = fields.storageBucket;
  if (fields.messagingSenderId) opts.messagingSenderId = fields.messagingSenderId;
  if (fields.measurementId) opts.measurementId = fields.measurementId;
  return opts;
}

function buildAppSignature(profile: DatabaseConnectionProfile): string {
  const f = profile.firebaseConfig;
  return computeConfigChecksum(
    [
      profile.id,
      f.projectId,
      f.apiKey,
      f.authDomain,
      f.firestoreDatabaseId,
      f.appId,
      f.databaseURL || '',
    ].join('|')
  );
}

const firestoreCache = new Map<string, Firestore>();
const authCache = new Map<string, Auth>();

function ensureFirebaseAppForProfile(profile: DatabaseConnectionProfile): {
  app: FirebaseApp;
  appKey: string;
} {
  const isBuiltInUnmodified =
    profile.id === BUILTIN_DEFAULT_CONNECTION_ID &&
    profile.firebaseConfig.projectId === defaultFirebaseConfig.projectId &&
    profile.firebaseConfig.apiKey === defaultFirebaseConfig.apiKey &&
    profile.firebaseConfig.firestoreDatabaseId ===
      defaultFirebaseConfig.firestoreDatabaseId;

  const appName = isBuiltInUnmodified
    ? '[DEFAULT]'
    : `rahaltv-db-${profile.id}-${buildAppSignature(profile)}`;

  const existing = getApps().find((a) => a.name === appName);
  if (existing) {
    return { app: existing, appKey: appName };
  }
  const sdkOpts = toSdkFirebaseOptions(profile.firebaseConfig);
  const app =
    appName === '[DEFAULT]' ? initializeApp(sdkOpts) : initializeApp(sdkOpts, appName);
  return { app, appKey: appName };
}

export function getFirestoreInstanceForProfile(profile: DatabaseConnectionProfile): Firestore {
  const { app, appKey } = ensureFirebaseAppForProfile(profile);
  const dbId = (profile.firebaseConfig.firestoreDatabaseId || '(default)').trim() || '(default)';
  const cacheKey = `${appKey}::${dbId}`;
  const cached = firestoreCache.get(cacheKey);
  if (cached) return cached;

  let fs: Firestore;
  const canUseIndexedDbCache =
    typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
  if (canUseIndexedDbCache) {
    try {
      const settings = {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      };
      fs =
        dbId === '(default)'
          ? initializeFirestore(app, settings)
          : initializeFirestore(app, settings, dbId);
    } catch {
      fs = dbId === '(default)' ? getFirestore(app) : getFirestore(app, dbId);
    }
  } else {
    fs = dbId === '(default)' ? getFirestore(app) : getFirestore(app, dbId);
  }
  firestoreCache.set(cacheKey, fs);
  return fs;
}

export function getAuthInstanceForProfile(profile: DatabaseConnectionProfile): Auth {
  const { app, appKey } = ensureFirebaseAppForProfile(profile);
  const cached = authCache.get(appKey);
  if (cached) return cached;
  const authInst = getAuth(app);
  authCache.set(appKey, authInst);
  return authInst;
}

export function getActiveDb(): Firestore {
  return getFirestoreInstanceForProfile(getActiveConnectionProfile());
}

export function getActiveAuthInstance(): Auth {
  return getAuthInstanceForProfile(getActiveConnectionProfile());
}

export function getActiveFirebaseApp(): FirebaseApp {
  return ensureFirebaseAppForProfile(getActiveConnectionProfile()).app;
}

export function getBuiltInDefaultDb(): Firestore {
  return getFirestoreInstanceForProfile(buildDefaultBuiltInProfile());
}

export function getBuiltInDefaultAuth(): Auth {
  return getAuthInstanceForProfile(buildDefaultBuiltInProfile());
}

export function getBuiltInFirebaseConfig(): FirebaseConnectionFields {
  return buildDefaultBuiltInProfile().firebaseConfig;
}

// ---------------- Validation & Classification ----------------
export function validateConnectionProfile(profile: DatabaseConnectionProfile): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!profile.name.trim()) {
    errors.push('اسم الاتصال مطلوب.');
  }

  if (
    profile.providerType === 'firebase_firestore' ||
    profile.providerType === 'firebase_realtime'
  ) {
    const f = profile.firebaseConfig;
    if (!f.projectId || !/^[a-z0-9\-]{4,64}$/i.test(f.projectId)) {
      errors.push('Project ID غير صالح أو مفقود.');
    }
    if (!f.apiKey || f.apiKey.length < 15) {
      errors.push('API Key غير صالح أو قصير جداً.');
    }
    if (!f.appId || !f.appId.includes(':')) {
      errors.push('App ID غير صالح (يجب أن يكون بصيغة 1:...:web:...).');
    }
    if (!f.authDomain || !f.authDomain.includes('.')) {
      errors.push('Auth Domain غير صالح أو مفقود.');
    }
    if (profile.providerType === 'firebase_firestore' && !f.firestoreDatabaseId.trim()) {
      errors.push('Firestore Database ID مطلوب (أو اكتب (default)).');
    }
    if (profile.providerType === 'firebase_realtime') {
      if (!f.databaseURL || !/^https:\/\/.+/i.test(f.databaseURL)) {
        errors.push('Database URL مطلوب بصيغة https://... لقاعدة Firebase Realtime Database.');
      }
    }
  } else if (profile.providerType === 'custom_api') {
    const endpoint = profile.customApiConfig?.endpointUrl || '';
    if (!/^https?:\/\/.+/i.test(endpoint)) {
      errors.push('رابط نقطة النهاية (Endpoint URL) غير صالح.');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function classifyConnectionFailure(err: unknown): {
  status: Exclude<DatabaseConnectionHealthStatus, 'connected' | 'untested'>;
  statusLabelAr: string;
  message: string;
  rawError: string;
} {
  const rawObj =
    typeof err === 'object' && err !== null
      ? (err as { code?: unknown; message?: unknown })
      : null;
  const code = String(rawObj?.code || '');
  let rawMessage =
    err instanceof Error
      ? err.message
      : rawObj?.message
        ? String(rawObj.message)
        : String(err || '');

  if (rawMessage.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawMessage) as { error?: unknown };
      if (parsed && typeof parsed.error === 'string') {
        rawMessage = parsed.error;
      }
    } catch {
      // Ignore
    }
  }

  const combined = `${code} ${rawMessage}`.toLowerCase();

  if (
    combined.includes('timeout') ||
    combined.includes('aborted') ||
    combined.includes('timed out') ||
    combined.includes('deadline-exceeded')
  ) {
    return {
      status: 'timeout',
      statusLabelAr: HEALTH_STATUS_LABELS_AR.timeout,
      message: 'انتهت مهلة الاتصال بالخادم قبل استلام الاستجابة.',
      rawError: rawMessage || code,
    };
  }

  if (
    combined.includes('quota exceeded') ||
    combined.includes('resource-exhausted')
  ) {
    return {
      status: 'quota_exceeded',
      statusLabelAr: HEALTH_STATUS_LABELS_AR.quota_exceeded,
      message:
        'تم تجاوز الحصة اليومية المجانية للقاعدة (Quota exceeded). تتجدد تلقائياً في اليوم التالي أو بعد الترقية.',
      rawError: rawMessage || code,
    };
  }

  if (
    combined.includes('permission-denied') ||
    combined.includes('permission_denied') ||
    combined.includes('insufficient permissions') ||
    combined.includes('missing or insufficient permissions')
  ) {
    return {
      status: 'permission_denied',
      statusLabelAr: HEALTH_STATUS_LABELS_AR.permission_denied,
      message:
        'تم رفض الوصول بسبب قواعد الأمان أو الصلاحيات (permission-denied). تأكد من نشر firestore.rules وصلاحية الحساب.',
      rawError: rawMessage || code,
    };
  }

  if (
    combined.includes('api-key-not-valid') ||
    combined.includes('api key not valid') ||
    combined.includes('invalid-api-key') ||
    combined.includes('project not found') ||
    combined.includes('database') && combined.includes('does not exist') ||
    combined.includes('not-found') ||
    combined.includes('invalid-argument') ||
    combined.includes('failed-precondition')
  ) {
    return {
      status: 'invalid_config',
      statusLabelAr: HEALTH_STATUS_LABELS_AR.invalid_config,
      message:
        'بيانات الاتصال غير صحيحة أو المشروع/القاعدة غير موجودة (تحقق من Project ID و API Key و Database ID).',
      rawError: rawMessage || code,
    };
  }

  return {
    status: 'offline',
    statusLabelAr: HEALTH_STATUS_LABELS_AR.offline,
    message:
      'تعذر الوصول إلى خادم قاعدة البيانات (قد يكون الخادم غير متصل أو توجد مشكلة في الشبكة).',
    rawError: rawMessage || code,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms during ${label}`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// ---------------- Live Test Connection ----------------
export async function testDatabaseConnection(
  profile: DatabaseConnectionProfile,
  options?: {
    testWrite?: boolean;
    timeoutMs?: number;
    actorUid?: string;
    actorName?: string;
  }
): Promise<DatabaseConnectionTestResult> {
  const started = performance.now();
  const timeoutMs = options?.timeoutMs ?? 8500;
  const steps: DatabaseTestStepResult[] = [];
  const activeProfile = getActiveConnectionProfile();
  const requiresReauthNotice =
    profile.providerType !== 'custom_api' &&
    profile.firebaseConfig.projectId !== activeProfile.firebaseConfig.projectId;

  // Step 1: Config validation
  const validation = validateConnectionProfile(profile);
  if (!validation.valid) {
    const latencyMs = Math.round(performance.now() - started);
    steps.push({
      step: 'config',
      label: 'التحقق من صيغة الإعدادات',
      ok: false,
      detail: validation.errors.join(' '),
      latencyMs,
    });
    const res: DatabaseConnectionTestResult = {
      ok: false,
      status: 'invalid_config',
      statusLabelAr: HEALTH_STATUS_LABELS_AR.invalid_config,
      message: validation.errors[0] || 'بيانات الاتصال غير صحيحة.',
      rawError: validation.errors.join(' | '),
      latencyMs,
      testedAt: nowIso(),
      canSwitchSafely: false,
      requiresReauthNotice,
      steps,
    };
    updateProfileTestTelemetry(profile.id, res);
    appendDatabaseConnectionLog({
      event: 'test',
      connectionId: profile.id,
      connectionName: profile.name,
      status: 'error',
      resultStatus: res.status,
      latencyMs,
      actorUid: options?.actorUid,
      actorName: options?.actorName,
      message: res.message,
      rawError: res.rawError,
    });
    return res;
  }

  steps.push({
    step: 'config',
    label: 'التحقق من صيغة الإعدادات',
    ok: true,
    detail: 'جميع الحقول الأساسية مكتملة وصحيحة الصيغة.',
  });

  // Branch A: Custom API endpoint
  if (profile.providerType === 'custom_api') {
    const base = (profile.customApiConfig?.endpointUrl || '').replace(/\/+$/, '');
    const healthPath = profile.customApiConfig?.healthPath || '/health';
    const targetUrl = `${base}${healthPath.startsWith('/') ? healthPath : `/${healthPath}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(targetUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Math.round(performance.now() - started);
      if (resp.status === 401 || resp.status === 403) {
        steps.push({
          step: 'auth',
          label: 'فحص الصلاحيات',
          ok: false,
          detail: `استجاب الخادم برمز ${resp.status} (مطلوب تصريح أو مفتاح سر على السيرفر).`,
          latencyMs,
        });
        const res: DatabaseConnectionTestResult = {
          ok: false,
          status: 'permission_denied',
          statusLabelAr: HEALTH_STATUS_LABELS_AR.permission_denied,
          message: `رفض الخادم الاتصال برمز HTTP ${resp.status}.`,
          rawError: `HTTP ${resp.status}`,
          latencyMs,
          testedAt: nowIso(),
          canSwitchSafely: false,
          steps,
        };
        updateProfileTestTelemetry(profile.id, res);
        return res;
      }
      if (!resp.ok) {
        steps.push({
          step: 'reachability',
          label: 'فحص الوصول إلى الخادم',
          ok: false,
          detail: `استجابة غير متوقعة HTTP ${resp.status}.`,
          latencyMs,
        });
        const res: DatabaseConnectionTestResult = {
          ok: false,
          status: resp.status === 404 ? 'invalid_config' : 'offline',
          statusLabelAr:
            resp.status === 404
              ? HEALTH_STATUS_LABELS_AR.invalid_config
              : HEALTH_STATUS_LABELS_AR.offline,
          message: `استجاب الخادم بالحالة HTTP ${resp.status}.`,
          rawError: `HTTP ${resp.status}`,
          latencyMs,
          testedAt: nowIso(),
          canSwitchSafely: false,
          steps,
        };
        updateProfileTestTelemetry(profile.id, res);
        return res;
      }

      steps.push({
        step: 'reachability',
        label: 'فحص الوصول إلى الخادم',
        ok: true,
        detail: `استجاب الخادم بنجاح (HTTP ${resp.status}) خلال ${latencyMs}ms.`,
        latencyMs,
      });
      const res: DatabaseConnectionTestResult = {
        ok: true,
        status: 'connected',
        statusLabelAr: HEALTH_STATUS_LABELS_AR.connected,
        message: `نقطة الاتصال متاحة وتعمل بنجاح (${latencyMs}ms).`,
        latencyMs,
        testedAt: nowIso(),
        canSwitchSafely: false,
        steps,
      };
      updateProfileTestTelemetry(profile.id, res);
      return res;
    } catch (err) {
      clearTimeout(timer);
      const latencyMs = Math.round(performance.now() - started);
      const classified = classifyConnectionFailure(err);
      steps.push({
        step: 'reachability',
        label: 'فحص الوصول إلى الخادم',
        ok: false,
        detail: classified.message,
        latencyMs,
      });
      const res: DatabaseConnectionTestResult = {
        ok: false,
        status: classified.status,
        statusLabelAr: classified.statusLabelAr,
        message: classified.message,
        rawError: classified.rawError,
        latencyMs,
        testedAt: nowIso(),
        canSwitchSafely: false,
        steps,
      };
      updateProfileTestTelemetry(profile.id, res);
      return res;
    }
  }

  // Branch B: Firebase Realtime Database REST probe (if selected)
  if (profile.providerType === 'firebase_realtime') {
    const rtdbBase = (profile.firebaseConfig.databaseURL || '').replace(/\/+$/, '');
    const probeUrl = `${rtdbBase}/settings.json?shallow=true`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(probeUrl, { method: 'GET', signal: controller.signal });
      clearTimeout(timer);
      const latencyMs = Math.round(performance.now() - started);
      if (resp.status === 401 || resp.status === 403) {
        steps.push({
          step: 'read',
          label: 'اختبار قراءة Realtime Database',
          ok: false,
          detail: 'رفضت قواعد Realtime Database القراءة (Permission denied).',
          latencyMs,
        });
        const res: DatabaseConnectionTestResult = {
          ok: false,
          status: 'permission_denied',
          statusLabelAr: HEALTH_STATUS_LABELS_AR.permission_denied,
          message: 'قاعدة Realtime Database متصلة ولكن قواعد الأمان ترفض القراءة.',
          rawError: `HTTP ${resp.status}`,
          latencyMs,
          testedAt: nowIso(),
          canSwitchSafely: false,
          requiresReauthNotice,
          steps,
        };
        updateProfileTestTelemetry(profile.id, res);
        return res;
      }
      if (resp.status === 404) {
        steps.push({
          step: 'reachability',
          label: 'فحص رابط Realtime Database',
          ok: false,
          detail: 'الرابط غير موجود (404). تحقق من Database URL.',
          latencyMs,
        });
        const res: DatabaseConnectionTestResult = {
          ok: false,
          status: 'invalid_config',
          statusLabelAr: HEALTH_STATUS_LABELS_AR.invalid_config,
          message: 'عنوان Realtime Database غير موجود (404).',
          rawError: 'HTTP 404',
          latencyMs,
          testedAt: nowIso(),
          canSwitchSafely: false,
          steps,
        };
        updateProfileTestTelemetry(profile.id, res);
        return res;
      }
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      steps.push({
        step: 'read',
        label: 'اختبار قراءة Realtime Database',
        ok: true,
        detail: `تمت الاستجابة بنجاح خلال ${latencyMs}ms.`,
        latencyMs,
      });
      const res: DatabaseConnectionTestResult = {
        ok: true,
        status: 'connected',
        statusLabelAr: HEALTH_STATUS_LABELS_AR.connected,
        message: `اتصال ناجح بـ Firebase Realtime Database (${latencyMs}ms).`,
        latencyMs,
        testedAt: nowIso(),
        canSwitchSafely: false,
        requiresReauthNotice,
        steps,
      };
      updateProfileTestTelemetry(profile.id, res);
      return res;
    } catch (err) {
      clearTimeout(timer);
      const latencyMs = Math.round(performance.now() - started);
      const classified = classifyConnectionFailure(err);
      steps.push({
        step: 'reachability',
        label: 'فحص الوصول إلى Realtime Database',
        ok: false,
        detail: classified.message,
        latencyMs,
      });
      const res: DatabaseConnectionTestResult = {
        ok: false,
        status: classified.status,
        statusLabelAr: classified.statusLabelAr,
        message: classified.message,
        rawError: classified.rawError,
        latencyMs,
        testedAt: nowIso(),
        canSwitchSafely: false,
        steps,
      };
      updateProfileTestTelemetry(profile.id, res);
      return res;
    }
  }

  // Branch C: Firebase Firestore live SDK test (with isolated probe app so active app isn't polluted)
  const probeAppName = `probe-${profile.id}-${Date.now()}`;
  let probeApp: FirebaseApp | null = null;
  try {
    // 1. Validate API key / Project via Identity Toolkit public check or SDK init
    probeApp = initializeApp(
      toSdkFirebaseOptions(profile.firebaseConfig),
      probeAppName
    );
    const dbId =
      (profile.firebaseConfig.firestoreDatabaseId || '(default)').trim() || '(default)';
    const probeDb =
      dbId === '(default)' ? getFirestore(probeApp) : getFirestore(probeApp, dbId);
    const probeAuth = getAuth(probeApp);

    steps.push({
      step: 'auth',
      label: 'تهيئة Firebase SDK',
      ok: true,
      detail: `المشروع: ${profile.firebaseConfig.projectId} • القاعدة: ${dbId}`,
    });

    // 2. Live read probe on settings/general & media collection
    const readStart = performance.now();
    const [settingsSnap, mediaSnap] = await withTimeout(
      Promise.all([
        getDocFromServer(doc(probeDb, 'settings', 'general')),
        getDocs(query(collection(probeDb, 'media'), limit(1))),
      ]),
      timeoutMs,
      'Firestore read probe'
    );
    const readMs = Math.round(performance.now() - readStart);

    // Try counting media items if permitted
    let mediaCount: number | undefined = mediaSnap.size;
    try {
      const countSnap = await withTimeout(
        getCountFromServer(collection(probeDb, 'media')),
        3000,
        'media count'
      );
      mediaCount = countSnap.data().count;
    } catch {
      // Fallback to >= 0 from sample query
    }

    steps.push({
      step: 'read',
      label: 'اختبار القراءة الفعلي من Firestore',
      ok: true,
      detail: `القراءة نجحت خلال ${readMs}ms (settings/general: ${settingsSnap.exists() ? 'موجود' : 'فارغ'} • media: ${mediaCount ?? 0} عمل).`,
      latencyMs: readMs,
    });

    // 3. Optional non-destructive write check (when user requests write verification on same-project active auth)
    if (options?.testWrite) {
      const currentActiveAuth = getActiveAuthInstance();
      const targetUser = probeAuth.currentUser || currentActiveAuth.currentUser;
      if (
        !targetUser ||
        profile.firebaseConfig.projectId !== getActiveFirebaseConfig().projectId
      ) {
        steps.push({
          step: 'write',
          label: 'اختبار صلاحية الكتابة',
          ok: true,
          detail:
            'يتطلب اختبار الكتابة على مشروع Firebase مختلف تسجيل الدخول على المشروع الجديد بعد التفعيل.',
        });
      } else {
        const writeStart = performance.now();
        try {
          const probeDocRef = doc(probeDb, 'admin_activity_logs', `_db_probe_${Date.now()}`);
          await withTimeout(
            setDoc(probeDocRef, {
              id: probeDocRef.id,
              adminUid: targetUser.uid,
              adminName: options.actorName || targetUser.email || 'Admin',
              rawCommand: 'db_connection_test',
              understoodCommand: 'اختبار كتابة قاعدة البيانات',
              operationType: 'db_probe',
              operationLabel: 'اختبار كتابة الاتصال',
              affectedCount: 0,
              sampleTitles: [],
              status: 'queried',
              note: 'مستند اختبار اتصال مؤقت',
              createdAt: serverTimestamp(),
            }),
            5000,
            'Firestore write probe'
          );
          await deleteDoc(probeDocRef).catch(() => undefined);
          const writeMs = Math.round(performance.now() - writeStart);
          steps.push({
            step: 'write',
            label: 'اختبار صلاحية الكتابة والحذف',
            ok: true,
            detail: `تمت الكتابة والتحقق والحذف بنجاح خلال ${writeMs}ms.`,
            latencyMs: writeMs,
          });
        } catch (writeErr) {
          const classifiedWrite = classifyConnectionFailure(writeErr);
          const writeMs = Math.round(performance.now() - writeStart);
          steps.push({
            step: 'write',
            label: 'اختبار صلاحية الكتابة',
            ok: false,
            detail: classifiedWrite.message,
            latencyMs: writeMs,
          });
          const res: DatabaseConnectionTestResult = {
            ok: false,
            status: classifiedWrite.status,
            statusLabelAr: classifiedWrite.statusLabelAr,
            message: `القراءة نجحت ولكن الكتابة مرفوضة: ${classifiedWrite.message}`,
            rawError: classifiedWrite.rawError,
            latencyMs: Math.round(performance.now() - started),
            testedAt: nowIso(),
            canSwitchSafely: false,
            requiresReauthNotice,
            counts: {
              media: mediaCount,
              settingsExists: settingsSnap.exists(),
            },
            steps,
          };
          updateProfileTestTelemetry(profile.id, res);
          appendDatabaseConnectionLog({
            event: 'test',
            connectionId: profile.id,
            connectionName: profile.name,
            status: 'warning',
            resultStatus: res.status,
            latencyMs: res.latencyMs,
            actorUid: options?.actorUid,
            actorName: options?.actorName,
            message: res.message,
            rawError: res.rawError,
          });
          return res;
        }
      }
    }

    const totalMs = Math.round(performance.now() - started);
    const res: DatabaseConnectionTestResult = {
      ok: true,
      status: 'connected',
      statusLabelAr: HEALTH_STATUS_LABELS_AR.connected,
      message: `متصل بقاعدة Firestore (${profile.firebaseConfig.projectId} / ${dbId}) خلال ${totalMs}ms.`,
      latencyMs: totalMs,
      testedAt: nowIso(),
      canSwitchSafely: true,
      requiresReauthNotice,
      counts: {
        media: mediaCount,
        settingsExists: settingsSnap.exists(),
      },
      steps,
    };
    updateProfileTestTelemetry(profile.id, res);
    appendDatabaseConnectionLog({
      event: 'test',
      connectionId: profile.id,
      connectionName: profile.name,
      status: 'success',
      resultStatus: 'connected',
      latencyMs: totalMs,
      actorUid: options?.actorUid,
      actorName: options?.actorName,
      message: res.message,
    });
    return res;
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    const classified = classifyConnectionFailure(err);
    steps.push({
      step: 'read',
      label: 'اختبار الاتصال بـ Firestore',
      ok: false,
      detail: `${classified.message}${classified.rawError ? ` (${classified.rawError.slice(0, 140)})` : ''}`,
      latencyMs,
    });
    const res: DatabaseConnectionTestResult = {
      ok: false,
      status: classified.status,
      statusLabelAr: classified.statusLabelAr,
      message: classified.message,
      rawError: classified.rawError,
      latencyMs,
      testedAt: nowIso(),
      canSwitchSafely: false,
      requiresReauthNotice,
      steps,
    };
    updateProfileTestTelemetry(profile.id, res);
    appendDatabaseConnectionLog({
      event: 'test',
      connectionId: profile.id,
      connectionName: profile.name,
      status: 'error',
      resultStatus: classified.status,
      latencyMs,
      actorUid: options?.actorUid,
      actorName: options?.actorName,
      message: classified.message,
      rawError: classified.rawError,
    });
    return res;
  } finally {
    if (probeApp) {
      await deleteApp(probeApp).catch(() => undefined);
    }
  }
}

function updateProfileTestTelemetry(
  connectionId: string,
  res: DatabaseConnectionTestResult
) {
  const reg = loadDatabaseRegistry();
  const idx = reg.profiles.findIndex((p) => p.id === connectionId);
  if (idx === -1) return;
  const target = reg.profiles[idx];
  const updated: DatabaseConnectionProfile = {
    ...target,
    lastStatus: res.status,
    lastStatusMessage: res.message,
    lastLatencyMs: res.latencyMs,
    lastTestedAt: res.testedAt,
    ...(res.ok ? { lastConnectedAt: res.testedAt } : { lastDisconnectedAt: res.testedAt }),
  };
  const nextProfiles = [...reg.profiles];
  nextProfiles[idx] = updated;
  saveDatabaseRegistry({
    ...reg,
    lastGoodConnectionId: res.ok ? connectionId : reg.lastGoodConnectionId,
    profiles: nextProfiles,
  });
  notifyRegistryChanged();
}

// ---------------- CRUD, Switching & Rollback ----------------
export function createOrUpdateConnectionProfile(
  input: Partial<DatabaseConnectionProfile> & { name: string },
  actor?: { uid?: string; name?: string }
): { registry: DatabaseConnectionRegistryState; profile: DatabaseConnectionProfile; isNew: boolean } {
  const reg = loadDatabaseRegistry();
  const existingIdx = input.id ? reg.profiles.findIndex((p) => p.id === input.id) : -1;
  const isNew = existingIdx === -1;
  const ts = nowIso();
  const normalized = normalizeConnectionProfile({
    ...input,
    id: isNew ? input.id || `db_${Date.now()}` : reg.profiles[existingIdx].id,
    isBuiltIn: isNew ? false : reg.profiles[existingIdx].isBuiltIn,
    createdAt: isNew ? ts : reg.profiles[existingIdx].createdAt,
    updatedAt: ts,
    createdBy: isNew ? actor?.uid : reg.profiles[existingIdx].createdBy,
    updatedBy: actor?.uid,
    // Reset test status if credentials changed on an existing profile
    lastStatus: isNew ? 'untested' : 'untested',
    lastStatusMessage: 'تم تعديل البيانات — يُرجى إعادة اختبار الاتصال.',
  });

  const builtInFp = getFirebaseTargetFingerprint(buildDefaultBuiltInProfile());
  if (
    normalized.id !== BUILTIN_DEFAULT_CONNECTION_ID &&
    builtInFp &&
    getFirebaseTargetFingerprint(normalized) === builtInFp
  ) {
    const builtInProfile =
      reg.profiles.find((p) => p.id === BUILTIN_DEFAULT_CONNECTION_ID) ||
      buildDefaultBuiltInProfile();
    const { state: consolidated } = consolidateBuiltInDuplicates({
      ...reg,
      updatedAtMs: Date.now(),
      profiles: reg.profiles.filter((p) => p.id !== normalized.id),
    });
    const nextReg = saveDatabaseRegistry(consolidated);
    const finalBuiltIn =
      nextReg.profiles.find((p) => p.id === BUILTIN_DEFAULT_CONNECTION_ID) || builtInProfile;
    appendDatabaseConnectionLog({
      event: 'update',
      connectionId: finalBuiltIn.id,
      connectionName: finalBuiltIn.name,
      status: 'info',
      actorUid: actor?.uid,
      actorName: actor?.name,
      message: 'تم توحيد الاتصال مع قاعدة البيانات الرئيسية المدمجة لمنع التكرار.',
    });
    notifyRegistryChanged();
    return { registry: nextReg, profile: finalBuiltIn, isNew: false };
  }

  const nextProfiles = [...reg.profiles];
  if (isNew) {
    nextProfiles.push(normalized);
  } else {
    nextProfiles[existingIdx] = normalized;
  }

  const nextReg = saveDatabaseRegistry({
    ...reg,
    updatedAtMs: Date.now(),
    deletedProfileIds: (reg.deletedProfileIds || []).filter((id) => id !== normalized.id),
    profiles: nextProfiles,
  });
  appendDatabaseConnectionLog({
    event: isNew ? 'create' : 'update',
    connectionId: normalized.id,
    connectionName: normalized.name,
    status: 'info',
    actorUid: actor?.uid,
    actorName: actor?.name,
    message: isNew
      ? `تمت إضافة اتصال قاعدة بيانات جديد (${PROVIDER_LABELS_AR[normalized.providerType]}).`
      : `تم تحديث بيانات الاتصال "${normalized.name}".`,
  });
  notifyRegistryChanged();
  return { registry: nextReg, profile: normalized, isNew };
}

export function deleteConnectionProfile(
  connectionId: string,
  actor?: { uid?: string; name?: string }
): { ok: boolean; error?: string; registry: DatabaseConnectionRegistryState } {
  const reg = loadDatabaseRegistry();
  const target = reg.profiles.find((p) => p.id === connectionId);
  if (!target) {
    return { ok: false, error: 'إعداد الاتصال غير موجود.', registry: reg };
  }
  if (target.isBuiltIn || target.id === BUILTIN_DEFAULT_CONNECTION_ID) {
    return {
      ok: false,
      error: 'لا يمكن حذف قاعدة البيانات الافتراضية المدمجة في النظام.',
      registry: reg,
    };
  }
  if (target.id === reg.activeConnectionId) {
    return {
      ok: false,
      error: 'لا يمكن حذف قاعدة البيانات النشطة حالياً. قم بالتبديل إلى قاعدة أخرى أولاً.',
      registry: reg,
    };
  }
  if (target.id === reg.defaultConnectionId) {
    return {
      ok: false,
      error: 'لا يمكن حذف قاعدة البيانات المحددة كافتراضية. غيّر الافتراضية أولاً.',
      registry: reg,
    };
  }

  const nextReg = saveDatabaseRegistry({
    ...reg,
    updatedAtMs: Date.now(),
    deletedProfileIds: [...(reg.deletedProfileIds || []), connectionId].slice(-40),
    previousConnectionId:
      reg.previousConnectionId === connectionId ? null : reg.previousConnectionId,
    lastGoodConnectionId:
      reg.lastGoodConnectionId === connectionId ? reg.activeConnectionId : reg.lastGoodConnectionId,
    profiles: reg.profiles.filter((p) => p.id !== connectionId),
  });

  appendDatabaseConnectionLog({
    event: 'delete',
    connectionId: target.id,
    connectionName: target.name,
    status: 'warning',
    actorUid: actor?.uid,
    actorName: actor?.name,
    message: `تم حذف إعداد الاتصال "${target.name}".`,
  });
  notifyRegistryChanged();
  return { ok: true, registry: nextReg };
}

export function setDefaultConnectionProfile(
  connectionId: string,
  actor?: { uid?: string; name?: string }
): { ok: boolean; error?: string; registry: DatabaseConnectionRegistryState } {
  const reg = loadDatabaseRegistry();
  const target = reg.profiles.find((p) => p.id === connectionId);
  if (!target) {
    return { ok: false, error: 'إعداد الاتصال غير موجود.', registry: reg };
  }
  const nextReg = saveDatabaseRegistry({
    ...reg,
    updatedAtMs: Date.now(),
    defaultConnectionId: target.id,
  });
  appendDatabaseConnectionLog({
    event: 'set_default',
    connectionId: target.id,
    connectionName: target.name,
    status: 'info',
    actorUid: actor?.uid,
    actorName: actor?.name,
    message: `تم تعيين "${target.name}" كقاعدة بيانات افتراضية.`,
  });
  notifyRegistryChanged();
  return { ok: true, registry: nextReg };
}

export function setDatabaseAutoRetryEnabled(enabled: boolean): DatabaseConnectionRegistryState {
  const reg = loadDatabaseRegistry();
  const next = saveDatabaseRegistry({
    ...reg,
    updatedAtMs: Date.now(),
    autoRetryEnabled: enabled,
  });
  notifyRegistryChanged();
  return next;
}

export async function switchActiveDatabaseConnection(
  targetConnectionId: string,
  actor?: { uid?: string; name?: string },
  options?: { verifiedTest?: DatabaseConnectionTestResult; isEmergencyRollback?: boolean }
): Promise<{
  ok: boolean;
  error?: string;
  testResult?: DatabaseConnectionTestResult;
  registry: DatabaseConnectionRegistryState;
}> {
  const reg = loadDatabaseRegistry();
  const target = reg.profiles.find((p) => p.id === targetConnectionId);
  if (!target) {
    return { ok: false, error: 'قاعدة البيانات المستهدفة غير موجودة.', registry: reg };
  }
  if (target.id === reg.activeConnectionId) {
    return { ok: true, registry: reg };
  }
  if (target.providerType !== 'firebase_firestore') {
    return {
      ok: false,
      error:
        'النظام الموحد لتشغيل الموقع يعتمد على Firebase Firestore. يرجى استخدام اتصال من نوع Firebase Firestore للتبديل الفعلي.',
      registry: reg,
    };
  }

  let testResult = options?.verifiedTest;
  if (!options?.isEmergencyRollback) {
    if (!testResult || !testResult.ok) {
      testResult = await testDatabaseConnection(target, {
        actorUid: actor?.uid,
        actorName: actor?.name,
      });
    }
    if (!testResult.ok || !testResult.canSwitchSafely) {
      return {
        ok: false,
        error: `تم إلغاء التبديل لحماية الموقع: فشل اختبار الاتصال (${testResult.message})`,
        testResult,
        registry: loadDatabaseRegistry(),
      };
    }
  }

  const freshReg = loadDatabaseRegistry();
  const nextReg = saveDatabaseRegistry({
    ...freshReg,
    updatedAtMs: Date.now(),
    previousConnectionId: freshReg.activeConnectionId,
    activeConnectionId: target.id,
    lastGoodConnectionId: target.id,
  });

  appendDatabaseConnectionLog({
    event: options?.isEmergencyRollback ? 'rollback' : 'switch',
    connectionId: target.id,
    connectionName: target.name,
    status: 'success',
    resultStatus: testResult?.status || 'connected',
    latencyMs: testResult?.latencyMs,
    actorUid: actor?.uid,
    actorName: actor?.name,
    message: options?.isEmergencyRollback
      ? `تم الرجوع الفوري إلى قاعدة البيانات "${target.name}".`
      : `تم التبديل الموحد للموقع ولوحة الإدارة إلى "${target.name}".`,
  });

  notifyActiveDatabaseSwitched();
  return { ok: true, testResult, registry: nextReg };
}

export async function rollbackDatabaseConnection(
  actor?: { uid?: string; name?: string }
): Promise<{
  ok: boolean;
  error?: string;
  targetName?: string;
  registry: DatabaseConnectionRegistryState;
}> {
  const reg = loadDatabaseRegistry();
  const fallbackCandidateId =
    reg.previousConnectionId ||
    (reg.lastGoodConnectionId !== reg.activeConnectionId ? reg.lastGoodConnectionId : null) ||
    (reg.defaultConnectionId !== reg.activeConnectionId ? reg.defaultConnectionId : null) ||
    (BUILTIN_DEFAULT_CONNECTION_ID !== reg.activeConnectionId
      ? BUILTIN_DEFAULT_CONNECTION_ID
      : null);

  if (!fallbackCandidateId) {
    return {
      ok: false,
      error: 'لا توجد قاعدة بيانات سابقة مسجلة للرجوع إليها.',
      registry: reg,
    };
  }

  const target = reg.profiles.find((p) => p.id === fallbackCandidateId);
  if (!target) {
    return { ok: false, error: 'القاعدة السابقة لم تعد موجودة.', registry: reg };
  }

  const res = await switchActiveDatabaseConnection(target.id, actor, {
    isEmergencyRollback: true,
  });
  return {
    ok: res.ok,
    error: res.error,
    targetName: target.name,
    registry: res.registry,
  };
}

export function recordDatabaseOutage(
  status: DatabaseConnectionHealthStatus,
  message: string,
  rawError?: string
) {
  const reg = loadDatabaseRegistry();
  const active = getActiveConnectionProfile();
  const ts = nowIso();
  const nextProfiles = reg.profiles.map((p) =>
    p.id === active.id
      ? {
          ...p,
          lastStatus: status,
          lastStatusMessage: message.slice(0, 400),
          lastDisconnectedAt: ts,
        }
      : p
  );
  saveDatabaseRegistry({ ...reg, profiles: nextProfiles });
  appendDatabaseConnectionLog({
    event: 'outage',
    connectionId: active.id,
    connectionName: active.name,
    status: 'error',
    resultStatus: status,
    message,
    rawError,
  });
  notifyRegistryChanged();
}

export function recordDatabaseConnected() {
  const reg = loadDatabaseRegistry();
  const active = getActiveConnectionProfile();
  const ts = nowIso();
  if (active.lastStatus === 'connected') return;
  const nextProfiles = reg.profiles.map((p) =>
    p.id === active.id
      ? {
          ...p,
          lastStatus: 'connected' as const,
          lastStatusMessage: 'متصل ويعمل باستقرار.',
          lastConnectedAt: ts,
        }
      : p
  );
  saveDatabaseRegistry({
    ...reg,
    lastGoodConnectionId: active.id,
    profiles: nextProfiles,
  });
  notifyRegistryChanged();
}

// ---------------- Cross-Database Migration & Verification ----------------
export async function migrateDatabaseContent(
  sourceConnectionId: string,
  targetConnectionId: string,
  onProgress?: (msg: string, done: number, total: number) => void,
  actor?: { uid?: string; name?: string }
): Promise<DatabaseMigrationReport> {
  const reg = loadDatabaseRegistry();
  const source = reg.profiles.find((p) => p.id === sourceConnectionId);
  const target = reg.profiles.find((p) => p.id === targetConnectionId);
  const startedAt = nowIso();

  if (!source || !target) {
    throw new Error('لم يتم العثور على قاعدة المصدر أو القاعدة المستهدفة.');
  }
  if (source.id === target.id) {
    throw new Error('لا يمكن نقل البيانات من نفس القاعدة إلى نفسها.');
  }
  if (
    source.providerType !== 'firebase_firestore' ||
    target.providerType !== 'firebase_firestore'
  ) {
    throw new Error('نقل البيانات التلقائي مدعوم بين قواعد Firebase Firestore فقط.');
  }

  const sourceDb = getFirestoreInstanceForProfile(source);
  const targetDb = getFirestoreInstanceForProfile(target);

  const collectionsReport: DatabaseMigrationCollectionCount[] = [];
  const errors: string[] = [];
  let totalSourceDocs = 0;
  let totalCopiedDocs = 0;

  for (let idx = 0; idx < MIGRATION_COLLECTIONS.length; idx++) {
    const colMeta = MIGRATION_COLLECTIONS[idx];
    onProgress?.(
      `فحص ونقل مجموعة ${colMeta.labelAr}...`,
      idx,
      MIGRATION_COLLECTIONS.length
    );

    try {
      const [srcSnap, tgtBeforeSnap] = await Promise.all([
        getDocs(collection(sourceDb, colMeta.name)),
        getDocs(collection(targetDb, colMeta.name)),
      ]);

      const sourceCount = srcSnap.size;
      const targetBeforeCount = tgtBeforeSnap.size;
      totalSourceDocs += sourceCount;

      let copiedCount = 0;
      const CHUNK_SIZE = 25;
      const docsList = srcSnap.docs;

      for (let i = 0; i < docsList.length; i += CHUNK_SIZE) {
        const chunk = docsList.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(targetDb);
        for (const docSnap of chunk) {
          batch.set(doc(targetDb, colMeta.name, docSnap.id), docSnap.data(), {
            merge: true,
          });
        }
        await batch.commit();
        copiedCount += chunk.length;
      }

      totalCopiedDocs += copiedCount;
      const tgtAfterSnap = await getDocs(collection(targetDb, colMeta.name));
      const targetAfterCount = tgtAfterSnap.size;
      const verified = targetAfterCount >= sourceCount;

      collectionsReport.push({
        collection: colMeta.name,
        labelAr: colMeta.labelAr,
        sourceCount,
        targetBeforeCount,
        copiedCount,
        targetAfterCount,
        verified,
        warning: verified
          ? undefined
          : `عدد المستندات في الهدف (${targetAfterCount}) أقل من المصدر (${sourceCount}).`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${colMeta.name}: ${msg}`);
      collectionsReport.push({
        collection: colMeta.name,
        labelAr: colMeta.labelAr,
        sourceCount: 0,
        targetBeforeCount: 0,
        copiedCount: 0,
        targetAfterCount: 0,
        verified: false,
        warning: msg,
      });
    }
  }

  onProgress?.('اكتمل فحص وتطابق البيانات.', MIGRATION_COLLECTIONS.length, MIGRATION_COLLECTIONS.length);

  const ok = errors.length === 0 && collectionsReport.every((c) => c.verified);
  const finishedAt = nowIso();

  appendDatabaseConnectionLog({
    event: 'migrate',
    connectionId: target.id,
    connectionName: target.name,
    status: ok ? 'success' : 'warning',
    actorUid: actor?.uid,
    actorName: actor?.name,
    message: ok
      ? `تم نقل ${totalCopiedDocs} مستند من "${source.name}" إلى "${target.name}" مع تطابق كامل للعدّ.`
      : `انتهى النقل مع ملاحظات: تم نسخ ${totalCopiedDocs} مستند (${errors.length} أخطاء).`,
    rawError: errors.length > 0 ? errors.join(' | ') : undefined,
  });

  return {
    ok,
    sourceConnectionId: source.id,
    targetConnectionId: target.id,
    startedAt,
    finishedAt,
    totalSourceDocs,
    totalCopiedDocs,
    collections: collectionsReport,
    errors,
  };
}

// ---------------- Connection Config Backup & Restore (Zero Secrets) ----------------
export function buildConnectionBackupBundle(actorName?: string): DatabaseBackupBundle {
  const reg = loadDatabaseRegistry();
  const sanitizedProfiles = reg.profiles.map((p) => normalizeConnectionProfile(p));
  const payloadWithoutChecksum = {
    format: 'rahaltv-db-connections-v1' as const,
    exportedAt: nowIso(),
    exportedBy: actorName,
    activeConnectionId: reg.activeConnectionId,
    defaultConnectionId: reg.defaultConnectionId,
    previousConnectionId: reg.previousConnectionId,
    profiles: sanitizedProfiles,
  };
  const checksum = computeConfigChecksum(JSON.stringify(payloadWithoutChecksum.profiles));
  appendDatabaseConnectionLog({
    event: 'backup_export',
    connectionId: reg.activeConnectionId,
    connectionName: getActiveConnectionProfile().name,
    status: 'info',
    actorName,
    message: `تم تصدير نسخة احتياطية لإعدادات الاتصالات (${sanitizedProfiles.length} اتصال، بدون أسرار).`,
  });
  return { ...payloadWithoutChecksum, checksum };
}

export function parseAndValidateConnectionBackup(jsonText: string): {
  valid: boolean;
  error?: string;
  bundle?: DatabaseBackupBundle;
  checksumMatched?: boolean;
} {
  try {
    const raw = JSON.parse(jsonText) as Partial<DatabaseBackupBundle>;
    if (!raw || raw.format !== 'rahaltv-db-connections-v1' || !Array.isArray(raw.profiles)) {
      return { valid: false, error: 'صيغة ملف النسخة الاحتياطية لإعدادات الاتصال غير صالحة.' };
    }
    const sanitizedProfiles = raw.profiles.map((p) => normalizeConnectionProfile(p));
    const expected = computeConfigChecksum(JSON.stringify(sanitizedProfiles));
    const checksumMatched = raw.checksum === expected;
    return {
      valid: true,
      checksumMatched,
      bundle: {
        format: 'rahaltv-db-connections-v1',
        exportedAt: String(raw.exportedAt || nowIso()),
        exportedBy: raw.exportedBy,
        checksum: String(raw.checksum || expected),
        activeConnectionId: String(raw.activeConnectionId || BUILTIN_DEFAULT_CONNECTION_ID),
        defaultConnectionId: String(raw.defaultConnectionId || BUILTIN_DEFAULT_CONNECTION_ID),
        previousConnectionId: raw.previousConnectionId || null,
        profiles: sanitizedProfiles,
      },
    };
  } catch {
    return { valid: false, error: 'تعذر قراءة ملف JSON — تأكد من سلامة الملف.' };
  }
}

export function importConnectionBackupBundle(
  bundle: DatabaseBackupBundle,
  mode: 'merge' | 'replace',
  actor?: { uid?: string; name?: string }
): DatabaseConnectionRegistryState {
  const current = loadDatabaseRegistry();
  let nextProfiles: DatabaseConnectionProfile[];
  if (mode === 'replace') {
    nextProfiles = bundle.profiles.map((p) => normalizeConnectionProfile(p));
  } else {
    const map = new Map(current.profiles.map((p) => [p.id, p]));
    for (const incoming of bundle.profiles) {
      map.set(incoming.id, normalizeConnectionProfile(incoming));
    }
    nextProfiles = Array.from(map.values());
  }

  // Keep currently active DB active during import (safety rule: never hot-switch without test!)
  const importedIds = new Set(nextProfiles.map((p) => p.id));
  const nextReg = saveDatabaseRegistry({
    ...current,
    updatedAtMs: Date.now(),
    deletedProfileIds: (current.deletedProfileIds || []).filter((id) => !importedIds.has(id)),
    profiles: nextProfiles,
  });

  appendDatabaseConnectionLog({
    event: 'backup_import',
    connectionId: current.activeConnectionId,
    connectionName: getActiveConnectionProfile().name,
    status: 'success',
    actorUid: actor?.uid,
    actorName: actor?.name,
    message: `تم استيراد ${bundle.profiles.length} إعداد اتصال (${mode === 'replace' ? 'استبدال' : 'دمج'}) مع الإبقاء على الاتصال النشط آمناً.`,
  });
  notifyRegistryChanged();
  return nextReg;
}

// ---------------- Server / Worker Secret Vault API Client ----------------
async function getAuthHeaders(user: User | null): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user) {
    const token = await user.getIdToken().catch(() => '');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  return headers;
}

export async function fetchServerSecretStatuses(
  user: User | null
): Promise<{
  available: boolean;
  source: 'node_vault' | 'cloudflare_kv' | 'none';
  statuses: Record<string, DatabaseServerSecretStatus>;
  note?: string;
}> {
  if (!user) {
    return { available: false, source: 'none', statuses: {}, note: 'يلزم تسجيل الدخول.' };
  }
  if (shouldSkipBackendApiCalls()) {
    return {
      available: false,
      source: 'none',
      statuses: {},
      note: 'الوضع الحالي استضافة ثابتة (GitHub Pages). اربط Cloudflare Worker مع KV/Secrets لتفعيل مخزن الأسرار السحابي.',
    };
  }
  try {
    const resp = await fetch(resolveApiEndpoint('/api/db/secrets/status'), {
      method: 'GET',
      headers: await getAuthHeaders(user),
    });
    if (!resp.ok) {
      return {
        available: false,
        source: 'none',
        statuses: {},
        note: `خادم الأسرار استجاب بالحالة HTTP ${resp.status}`,
      };
    }
    const data = (await resp.json()) as {
      ok?: boolean;
      source?: 'node_vault' | 'cloudflare_kv' | 'none';
      statuses?: Record<string, DatabaseServerSecretStatus>;
      note?: string;
    };
    return {
      available: Boolean(data.ok),
      source: data.source || 'node_vault',
      statuses: data.statuses || {},
      note: data.note,
    };
  } catch {
    return {
      available: false,
      source: 'none',
      statuses: {},
      note: 'خادم الأسرار غير متصل حالياً (يعمل تلقائياً عند تشغيل server.ts أو Cloudflare Worker).',
    };
  }
}

export async function saveServerSecrets(
  connectionId: string,
  payload: {
    serviceAccountJson?: string;
    privateKey?: string;
    apiSecret?: string;
    cloudflareToken?: string;
  },
  user: User | null
): Promise<{ ok: boolean; status?: DatabaseServerSecretStatus; error?: string }> {
  if (!user) {
    return { ok: false, error: 'يجب تسجيل الدخول كمسؤول مالك لحفظ الأسرار على السيرفر.' };
  }
  if (shouldSkipBackendApiCalls()) {
    return {
      ok: false,
      error:
        'لا يمكن حفظ الأسرار على استضافة GitHub Pages الثابتة. استخدم خادم Node.js أو أضف رابط Cloudflare Worker في الإعدادات.',
    };
  }
  try {
    const resp = await fetch(resolveApiEndpoint('/api/db/secrets'), {
      method: 'POST',
      headers: await getAuthHeaders(user),
      body: JSON.stringify({ connectionId, ...payload }),
    });
    const data = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      status?: DatabaseServerSecretStatus;
      error?: string;
    };
    if (!resp.ok || !data.ok) {
      return { ok: false, error: data.error || `فشل الحفظ (HTTP ${resp.status})` };
    }
    const reg = loadDatabaseRegistry();
    const prof = reg.profiles.find((p) => p.id === connectionId);
    appendDatabaseConnectionLog({
      event: 'secret_update',
      connectionId,
      connectionName: prof?.name || connectionId,
      status: 'success',
      actorUid: user.uid,
      actorName: user.displayName || user.email || 'Owner',
      message: 'تم تحديث الأسرار السرية في مخزن السيرفر المشفر بنجاح (بدون عرضها في المتصفح).',
    });
    return { ok: true, status: data.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'تعذر الاتصال بمخزن الأسرار على السيرفر.',
    };
  }
}

export async function deleteServerSecrets(
  connectionId: string,
  user: User | null
): Promise<{ ok: boolean; error?: string }> {
  if (!user || shouldSkipBackendApiCalls()) return { ok: false };
  try {
    const resp = await fetch(resolveApiEndpoint(`/api/db/secrets/${encodeURIComponent(connectionId)}`), {
      method: 'DELETE',
      headers: await getAuthHeaders(user),
    });
    return { ok: resp.ok };
  } catch {
    return { ok: false };
  }
}

// ---------------- Cross-Device Firestore Sync for DB Connections ----------------
export interface ActiveDatabasePointerPayload {
  connectionId: string;
  connectionName: string;
  providerType: 'firebase_firestore';
  firebaseConfig: FirebaseConnectionFields;
}

function sanitizeFirebaseFieldsForFirestore(
  fields: FirebaseConnectionFields
): Record<string, string> {
  const norm = normalizeFirebaseFields(fields);
  return {
    projectId: norm.projectId.slice(0, 128),
    apiKey: norm.apiKey.slice(0, 200),
    authDomain: norm.authDomain.slice(0, 200),
    firestoreDatabaseId: (norm.firestoreDatabaseId || '(default)').slice(0, 128),
    databaseURL: (norm.databaseURL || '').slice(0, 300),
    storageBucket: (norm.storageBucket || '').slice(0, 200),
    messagingSenderId: (norm.messagingSenderId || '').slice(0, 80),
    appId: norm.appId.slice(0, 200),
    measurementId: (norm.measurementId || '').slice(0, 80),
  };
}

function sanitizeProfileForFirestore(
  rawProfile: DatabaseConnectionProfile
): Record<string, unknown> {
  const clean = normalizeConnectionProfile(rawProfile);
  const out: Record<string, unknown> = {
    id: clean.id.slice(0, 96),
    name: clean.name.slice(0, 120),
    description: (clean.description || '').slice(0, 260),
    providerType: clean.providerType,
    isBuiltIn: Boolean(clean.isBuiltIn || clean.id === BUILTIN_DEFAULT_CONNECTION_ID),
    firebaseConfig: sanitizeFirebaseFieldsForFirestore(clean.firebaseConfig),
    lastStatus: clean.lastStatus || 'untested',
    createdAt: String(clean.createdAt || nowIso()).slice(0, 64),
    updatedAt: String(clean.updatedAt || nowIso()).slice(0, 64),
  };
  if (clean.providerType === 'custom_api' && clean.customApiConfig) {
    out.customApiConfig = {
      endpointUrl: String(clean.customApiConfig.endpointUrl || '').slice(0, 400),
      healthPath: String(clean.customApiConfig.healthPath || '/health').slice(0, 120),
      authHeaderName: String(clean.customApiConfig.authHeaderName || 'Authorization').slice(0, 80),
      useWorkerProxy: Boolean(clean.customApiConfig.useWorkerProxy),
    };
  }
  if (clean.lastStatusMessage) {
    out.lastStatusMessage = String(clean.lastStatusMessage).slice(0, 400);
  }
  if (typeof clean.lastLatencyMs === 'number' && Number.isFinite(clean.lastLatencyMs)) {
    out.lastLatencyMs = Math.max(0, Math.round(clean.lastLatencyMs));
  }
  if (clean.lastConnectedAt) out.lastConnectedAt = String(clean.lastConnectedAt).slice(0, 64);
  if (clean.lastDisconnectedAt) out.lastDisconnectedAt = String(clean.lastDisconnectedAt).slice(0, 64);
  if (clean.lastTestedAt) out.lastTestedAt = String(clean.lastTestedAt).slice(0, 64);
  if (clean.createdBy) out.createdBy = String(clean.createdBy).slice(0, 128);
  if (clean.updatedBy) out.updatedBy = String(clean.updatedBy).slice(0, 128);
  return out;
}

export function sanitizeDatabaseRegistryForFirestore(
  registry: DatabaseConnectionRegistryState
): Record<string, unknown> {
  const cleanProfiles = registry.profiles
    .slice(0, 25)
    .map((p) => sanitizeProfileForFirestore(p));
  const idSet = new Set(cleanProfiles.map((p) => String(p.id)));
  const activeId = idSet.has(registry.activeConnectionId)
    ? registry.activeConnectionId
    : BUILTIN_DEFAULT_CONNECTION_ID;
  const defaultId = idSet.has(registry.defaultConnectionId)
    ? registry.defaultConnectionId
    : BUILTIN_DEFAULT_CONNECTION_ID;
  const lastGoodId = idSet.has(registry.lastGoodConnectionId)
    ? registry.lastGoodConnectionId
    : activeId;
  const prevId =
    registry.previousConnectionId &&
    idSet.has(registry.previousConnectionId) &&
    registry.previousConnectionId !== activeId
      ? registry.previousConnectionId
      : null;

  return {
    version: 1,
    activeConnectionId: activeId,
    previousConnectionId: prevId,
    defaultConnectionId: defaultId,
    lastGoodConnectionId: lastGoodId,
    autoRetryEnabled: Boolean(registry.autoRetryEnabled),
    updatedAtMs:
      typeof registry.updatedAtMs === 'number' && Number.isFinite(registry.updatedAtMs)
        ? Math.max(0, Math.round(registry.updatedAtMs))
        : Date.now(),
    deletedProfileIds: (registry.deletedProfileIds || []).slice(-40),
    profiles: cleanProfiles,
  };
}

function getFirebaseTargetFingerprint(profile: DatabaseConnectionProfile): string {
  if (profile.providerType !== 'firebase_firestore') return '';
  const f = profile.firebaseConfig;
  if (!f.projectId || !f.apiKey) return '';
  return `${f.projectId}::${f.firestoreDatabaseId || '(default)'}::${f.apiKey}`;
}

function parseIsoMs(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function mergeBuiltInHealthFromDuplicate(
  builtIn: DatabaseConnectionProfile,
  dup: DatabaseConnectionProfile
): DatabaseConnectionProfile {
  const dupTestedMs = parseIsoMs(dup.lastTestedAt);
  const builtInTestedMs = parseIsoMs(builtIn.lastTestedAt);
  if (
    dup.lastStatus === 'connected' &&
    (builtIn.lastStatus !== 'connected' || dupTestedMs > builtInTestedMs)
  ) {
    return {
      ...builtIn,
      lastStatus: dup.lastStatus,
      lastStatusMessage: dup.lastStatusMessage,
      lastLatencyMs: dup.lastLatencyMs,
      lastConnectedAt: dup.lastConnectedAt,
      lastTestedAt: dup.lastTestedAt,
    };
  }
  return builtIn;
}

export function consolidateBuiltInDuplicates(
  state: DatabaseConnectionRegistryState
): { state: DatabaseConnectionRegistryState; changed: boolean } {
  const builtInDefault = buildDefaultBuiltInProfile();
  const builtInFp = getFirebaseTargetFingerprint(builtInDefault);
  if (!builtInFp) return { state, changed: false };

  let builtInEntry =
    state.profiles.find((p) => p.id === BUILTIN_DEFAULT_CONNECTION_ID) || builtInDefault;
  const duplicateIds = new Set<string>();
  const keptProfiles: DatabaseConnectionProfile[] = [];

  for (const rawProf of state.profiles) {
    const prof = normalizeConnectionProfile(rawProf);
    if (prof.id === BUILTIN_DEFAULT_CONNECTION_ID) {
      continue;
    }
    if (getFirebaseTargetFingerprint(prof) === builtInFp) {
      duplicateIds.add(prof.id);
      builtInEntry = mergeBuiltInHealthFromDuplicate(builtInEntry, prof);
      continue;
    }
    keptProfiles.push(prof);
  }

  if (duplicateIds.size === 0) {
    return { state, changed: false };
  }

  const remap = (id: string | null | undefined, fallback: string): string => {
    if (!id) return fallback;
    return duplicateIds.has(id) ? BUILTIN_DEFAULT_CONNECTION_ID : id;
  };

  const activeConnectionId = remap(state.activeConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);
  const defaultConnectionId = remap(state.defaultConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);
  const lastGoodConnectionId = remap(state.lastGoodConnectionId, activeConnectionId);
  const rawPrev = state.previousConnectionId ? remap(state.previousConnectionId, '') : null;
  const previousConnectionId =
    rawPrev && rawPrev !== activeConnectionId ? rawPrev : null;

  return {
    changed: true,
    state: {
      ...state,
      activeConnectionId,
      defaultConnectionId,
      lastGoodConnectionId,
      previousConnectionId,
      deletedProfileIds: (state.deletedProfileIds || []).filter(
        (id) => !duplicateIds.has(id) && id !== BUILTIN_DEFAULT_CONNECTION_ID
      ),
      profiles: [builtInEntry, ...keptProfiles],
    },
  };
}

export function mergeRemoteDatabaseRegistry(
  local: DatabaseConnectionRegistryState,
  remoteRaw: Partial<DatabaseConnectionRegistryState>
): DatabaseConnectionRegistryState {
  let builtIn = buildDefaultBuiltInProfile();
  const builtInFp = getFirebaseTargetFingerprint(builtIn);
  const remoteProfiles = (Array.isArray(remoteRaw.profiles) ? remoteRaw.profiles : []).map((p) =>
    normalizeConnectionProfile(p)
  );
  const remoteUpdatedAtMs =
    typeof remoteRaw.updatedAtMs === 'number' && Number.isFinite(remoteRaw.updatedAtMs)
      ? Math.max(0, Math.round(remoteRaw.updatedAtMs))
      : 0;
  const localUpdatedAtMs =
    typeof local.updatedAtMs === 'number' && Number.isFinite(local.updatedAtMs)
      ? Math.max(0, Math.round(local.updatedAtMs))
      : 0;

  const remoteDeleted = new Set(
    Array.isArray(remoteRaw.deletedProfileIds) ? remoteRaw.deletedProfileIds : []
  );
  const localDeleted = new Set(
    Array.isArray(local.deletedProfileIds) ? local.deletedProfileIds : []
  );

  const byId = new Map<string, DatabaseConnectionProfile>();
  const idRemap = new Map<string, string>();
  const localBuiltIn = local.profiles.find((p) => p.id === BUILTIN_DEFAULT_CONNECTION_ID);
  if (localBuiltIn) {
    builtIn = mergeBuiltInHealthFromDuplicate(builtIn, normalizeConnectionProfile(localBuiltIn));
  }
  byId.set(BUILTIN_DEFAULT_CONNECTION_ID, builtIn);

  const localCustomByFingerprint = new Map<string, DatabaseConnectionProfile>();
  for (const lp of local.profiles) {
    const norm = normalizeConnectionProfile(lp);
    if (norm.id === BUILTIN_DEFAULT_CONNECTION_ID) continue;
    const fp = getFirebaseTargetFingerprint(norm);
    if (builtInFp && fp === builtInFp) {
      builtIn = mergeBuiltInHealthFromDuplicate(builtIn, norm);
      byId.set(BUILTIN_DEFAULT_CONNECTION_ID, builtIn);
      idRemap.set(norm.id, BUILTIN_DEFAULT_CONNECTION_ID);
      continue;
    }
    const lpUpdatedMs = parseIsoMs(norm.updatedAt);
    if (remoteDeleted.has(norm.id) && remoteUpdatedAtMs >= lpUpdatedMs) {
      continue;
    }
    byId.set(norm.id, norm);
    if (fp) localCustomByFingerprint.set(fp, norm);
  }

  for (const rp of remoteProfiles) {
    if (rp.id === BUILTIN_DEFAULT_CONNECTION_ID) {
      builtIn = mergeBuiltInHealthFromDuplicate(builtIn, rp);
      byId.set(BUILTIN_DEFAULT_CONNECTION_ID, builtIn);
      continue;
    }
    const fp = getFirebaseTargetFingerprint(rp);
    if (builtInFp && fp === builtInFp) {
      builtIn = mergeBuiltInHealthFromDuplicate(builtIn, rp);
      byId.set(BUILTIN_DEFAULT_CONNECTION_ID, builtIn);
      idRemap.set(rp.id, BUILTIN_DEFAULT_CONNECTION_ID);
      continue;
    }
    const rpUpdatedMs = parseIsoMs(rp.updatedAt);
    if (localDeleted.has(rp.id) && localUpdatedAtMs > remoteUpdatedAtMs && localUpdatedAtMs > rpUpdatedMs) {
      continue;
    }

    const existingSameId = byId.get(rp.id);
    if (existingSameId) {
      const pickRemote = rpUpdatedMs >= parseIsoMs(existingSameId.updatedAt);
      byId.set(rp.id, pickRemote ? rp : existingSameId);
      continue;
    }

    // Deduplicate if user manually added the exact same Firebase project on another device
    const dupLocal = fp ? localCustomByFingerprint.get(fp) : undefined;
    if (dupLocal) {
      const dupUpdatedMs = parseIsoMs(dupLocal.updatedAt);
      if (remoteUpdatedAtMs >= dupUpdatedMs || rpUpdatedMs >= dupUpdatedMs) {
        byId.delete(dupLocal.id);
        byId.set(rp.id, rp);
        idRemap.set(dupLocal.id, rp.id);
      }
      continue;
    }

    byId.set(rp.id, rp);
  }

  const mergedProfiles = Array.from(byId.values());
  const validIds = new Set(mergedProfiles.map((p) => p.id));

  const mapId = (id: string | null | undefined, fallback: string): string => {
    if (!id) return fallback;
    const mapped = idRemap.get(id) || id;
    return validIds.has(mapped) ? mapped : fallback;
  };

  const remoteIsNewerOrLocalFresh =
    remoteUpdatedAtMs >= localUpdatedAtMs ||
    (local.profiles.length <= 1 && remoteProfiles.length > 0);

  const remoteActiveId = mapId(remoteRaw.activeConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);
  const localActiveId = mapId(local.activeConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);
  const resolvedActiveId = remoteIsNewerOrLocalFresh ? remoteActiveId : localActiveId;

  const remoteDefaultId = mapId(remoteRaw.defaultConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);
  const localDefaultId = mapId(local.defaultConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);
  const resolvedDefaultId = remoteIsNewerOrLocalFresh ? remoteDefaultId : localDefaultId;

  const resolvedLastGoodId = remoteIsNewerOrLocalFresh
    ? mapId(remoteRaw.lastGoodConnectionId, resolvedActiveId)
    : mapId(local.lastGoodConnectionId, resolvedActiveId);

  const candidatePrev = remoteIsNewerOrLocalFresh
    ? mapId(remoteRaw.previousConnectionId, '')
    : mapId(local.previousConnectionId, '');
  const resolvedPrevId =
    candidatePrev && candidatePrev !== resolvedActiveId && validIds.has(candidatePrev)
      ? candidatePrev
      : null;

  const mergedDeleted = Array.from(
    new Set([...(local.deletedProfileIds || []), ...(remoteRaw.deletedProfileIds || [])])
  )
    .filter((id) => !validIds.has(id) && id !== BUILTIN_DEFAULT_CONNECTION_ID && !idRemap.has(id))
    .slice(-40);

  return {
    version: 1,
    activeConnectionId: resolvedActiveId,
    previousConnectionId: resolvedPrevId,
    defaultConnectionId: resolvedDefaultId,
    lastGoodConnectionId: resolvedLastGoodId,
    autoRetryEnabled:
      remoteIsNewerOrLocalFresh && typeof remoteRaw.autoRetryEnabled === 'boolean'
        ? remoteRaw.autoRetryEnabled
        : local.autoRetryEnabled,
    updatedAtMs: Math.max(localUpdatedAtMs, remoteUpdatedAtMs),
    deletedProfileIds: mergedDeleted,
    profiles: mergedProfiles,
  };
}

export function applyRemoteDatabaseRegistry(
  remoteRaw: Partial<DatabaseConnectionRegistryState>
): { changedActiveTarget: boolean; registry: DatabaseConnectionRegistryState } {
  const before = loadDatabaseRegistry();
  const beforeActive = getActiveConnectionProfile();
  const beforeSig = `${beforeActive.id}::${buildAppSignature(beforeActive)}`;

  const merged = mergeRemoteDatabaseRegistry(before, remoteRaw);
  const saved = saveDatabaseRegistry(merged);

  const afterActive =
    saved.profiles.find((p) => p.id === saved.activeConnectionId) ||
    saved.profiles.find((p) => p.id === saved.defaultConnectionId) ||
    saved.profiles[0] ||
    buildDefaultBuiltInProfile();
  const afterSig = `${afterActive.id}::${buildAppSignature(afterActive)}`;

  const changedActiveTarget = beforeSig !== afterSig;
  if (changedActiveTarget) {
    notifyActiveDatabaseSwitched();
  } else {
    notifyRegistryChanged();
  }
  return { changedActiveTarget, registry: saved };
}

export function applyRemoteActiveDatabasePointer(
  pointerRaw: Partial<ActiveDatabasePointerPayload> & { updatedAt?: unknown }
): { switched: boolean; profile?: DatabaseConnectionProfile } {
  if (
    !pointerRaw ||
    pointerRaw.providerType !== 'firebase_firestore' ||
    !pointerRaw.connectionId ||
    !pointerRaw.firebaseConfig
  ) {
    return { switched: false };
  }

  const rawCandidate = normalizeConnectionProfile({
    id: pointerRaw.connectionId,
    name: pointerRaw.connectionName || 'قاعدة البيانات النشطة',
    providerType: 'firebase_firestore',
    isBuiltIn: pointerRaw.connectionId === BUILTIN_DEFAULT_CONNECTION_ID,
    firebaseConfig: pointerRaw.firebaseConfig,
  });

  const builtInProfile = buildDefaultBuiltInProfile();
  const builtInFp = getFirebaseTargetFingerprint(builtInProfile);
  const candidate =
    rawCandidate.id !== BUILTIN_DEFAULT_CONNECTION_ID &&
    builtInFp &&
    getFirebaseTargetFingerprint(rawCandidate) === builtInFp
      ? builtInProfile
      : rawCandidate;

  const validation = validateConnectionProfile(candidate);
  if (!validation.valid) {
    return { switched: false };
  }

  const beforeActive = getActiveConnectionProfile();
  const beforeSig = `${beforeActive.id}::${buildAppSignature(beforeActive)}`;
  const targetSig = `${candidate.id}::${buildAppSignature(candidate)}`;
  if (beforeSig === targetSig) {
    return { switched: false };
  }

  const reg = loadDatabaseRegistry();
  const existingIdx = reg.profiles.findIndex((p) => p.id === candidate.id);
  const nextProfiles = [...reg.profiles];
  if (existingIdx >= 0) {
    if (candidate.id !== BUILTIN_DEFAULT_CONNECTION_ID) {
      nextProfiles[existingIdx] = {
        ...nextProfiles[existingIdx],
        name: candidate.name,
        firebaseConfig: candidate.firebaseConfig,
      };
    }
  } else {
    // Also replace duplicate profile with same target projectId/dbId if user re-added manually
    const fp = getFirebaseTargetFingerprint(candidate);
    const filtered = fp
      ? nextProfiles.filter(
          (p) => p.id === BUILTIN_DEFAULT_CONNECTION_ID || getFirebaseTargetFingerprint(p) !== fp
        )
      : nextProfiles;
    filtered.push(candidate);
    nextProfiles.splice(0, nextProfiles.length, ...filtered);
  }

  const { state: consolidated } = consolidateBuiltInDuplicates({
    ...reg,
    previousConnectionId:
      reg.activeConnectionId && reg.activeConnectionId !== candidate.id
        ? reg.activeConnectionId
        : reg.previousConnectionId,
    activeConnectionId: candidate.id,
    lastGoodConnectionId: candidate.id,
    profiles: nextProfiles,
  });
  saveDatabaseRegistry(consolidated);
  notifyActiveDatabaseSwitched();
  return { switched: true, profile: candidate };
}

function isDefaultAndActiveSameTarget(): boolean {
  const builtIn = buildDefaultBuiltInProfile();
  const active = getActiveConnectionProfile();
  if (active.id === BUILTIN_DEFAULT_CONNECTION_ID) return true;
  return (
    active.providerType === 'firebase_firestore' &&
    active.firebaseConfig.projectId === builtIn.firebaseConfig.projectId &&
    active.firebaseConfig.firestoreDatabaseId === builtIn.firebaseConfig.firestoreDatabaseId &&
    active.firebaseConfig.apiKey === builtIn.firebaseConfig.apiKey
  );
}

export async function syncDatabaseRegistryToFirestore(
  fallbackUid?: string,
  registryOverride?: DatabaseConnectionRegistryState
): Promise<{
  ok: boolean;
  syncedDefault: boolean;
  syncedActive: boolean;
  error?: string;
}> {
  const reg = registryOverride || loadDatabaseRegistry();
  const configPayload = sanitizeDatabaseRegistryForFirestore(reg);

  let syncedDefault = false;
  let syncedActive = false;
  let lastError: string | undefined;

  const defaultAuth = getBuiltInDefaultAuth();
  const defaultUid = defaultAuth.currentUser?.uid || (isDefaultAndActiveSameTarget() ? fallbackUid : '');
  if (defaultUid) {
    try {
      await setDoc(doc(getBuiltInDefaultDb(), 'admin_workspace', 'db_connections'), {
        kind: 'db_connections',
        config: configPayload,
        updatedBy: defaultUid,
        updatedAt: serverTimestamp(),
      });
      syncedDefault = true;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!isDefaultAndActiveSameTarget()) {
    const activeAuth = getActiveAuthInstance();
    const activeUid = activeAuth.currentUser?.uid || '';
    if (activeUid) {
      try {
        await setDoc(doc(getActiveDb(), 'admin_workspace', 'db_connections'), {
          kind: 'db_connections',
          config: configPayload,
          updatedBy: activeUid,
          updatedAt: serverTimestamp(),
        });
        syncedActive = true;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  return {
    ok: syncedDefault || syncedActive,
    syncedDefault,
    syncedActive,
    error: lastError,
  };
}

export async function syncActiveDatabasePointerToFirestore(
  fallbackUid?: string
): Promise<{ ok: boolean; syncedDefault: boolean; syncedActive: boolean; error?: string }> {
  const active = getActiveConnectionProfile();
  if (active.providerType !== 'firebase_firestore') {
    return { ok: false, syncedDefault: false, syncedActive: false };
  }
  const validation = validateConnectionProfile(active);
  if (!validation.valid) {
    return { ok: false, syncedDefault: false, syncedActive: false };
  }

  const pointerBase = {
    connectionId: active.id.slice(0, 96),
    connectionName: active.name.slice(0, 120),
    providerType: 'firebase_firestore' as const,
    firebaseConfig: sanitizeFirebaseFieldsForFirestore(active.firebaseConfig),
  };

  let syncedDefault = false;
  let syncedActive = false;
  let lastError: string | undefined;

  const defaultAuth = getBuiltInDefaultAuth();
  const defaultUid = defaultAuth.currentUser?.uid || (isDefaultAndActiveSameTarget() ? fallbackUid : '');
  if (defaultUid) {
    try {
      await setDoc(doc(getBuiltInDefaultDb(), 'settings', 'active_database'), {
        ...pointerBase,
        updatedBy: defaultUid,
        updatedAt: serverTimestamp(),
      });
      syncedDefault = true;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!isDefaultAndActiveSameTarget()) {
    const activeAuth = getActiveAuthInstance();
    const activeUid = activeAuth.currentUser?.uid || '';
    if (activeUid) {
      try {
        await setDoc(doc(getActiveDb(), 'settings', 'active_database'), {
          ...pointerBase,
          updatedBy: activeUid,
          updatedAt: serverTimestamp(),
        });
        syncedActive = true;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  return {
    ok: syncedDefault || syncedActive,
    syncedDefault,
    syncedActive,
    error: lastError,
  };
}

export function subscribeActiveDatabasePointerFromFirestore(
  enabled: boolean,
  onSwitched?: (profile: DatabaseConnectionProfile) => void
): () => void {
  if (!enabled) return () => {};
  try {
    const defaultDb = getBuiltInDefaultDb();
    return onSnapshot(
      doc(defaultDb, 'settings', 'active_database'),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Partial<ActiveDatabasePointerPayload>;
        const res = applyRemoteActiveDatabasePointer(data);
        if (res.switched && res.profile) {
          onSwitched?.(res.profile);
        }
      },
      () => {
        // Ignore if settings/active_database rules aren't deployed on project yet
      }
    );
  } catch {
    return () => {};
  }
}

export function subscribeDatabaseRegistryFromFirestore(
  enabled: boolean,
  options?: {
    onApplied?: (reg: DatabaseConnectionRegistryState, changedActiveTarget: boolean) => void;
    uidForInitialSeed?: string;
  }
): () => void {
  if (!enabled) return () => {};
  const unsubs: Array<() => void> = [];
  let seededDefault = false;

  const attachForDb = (targetDb: Firestore, isDefaultDb: boolean) => {
    try {
      const unsub = onSnapshot(
        doc(targetDb, 'admin_workspace', 'db_connections'),
        (snap) => {
          if (!snap.exists()) {
            const localReg = loadDatabaseRegistry();
            const hasLocalCustomizations =
              localReg.profiles.length > 1 ||
              localReg.activeConnectionId !== BUILTIN_DEFAULT_CONNECTION_ID ||
              localReg.defaultConnectionId !== BUILTIN_DEFAULT_CONNECTION_ID ||
              !localReg.autoRetryEnabled;
            if (isDefaultDb && !seededDefault && hasLocalCustomizations && options?.uidForInitialSeed) {
              seededDefault = true;
              void syncDatabaseRegistryToFirestore(options.uidForInitialSeed, localReg);
              void syncActiveDatabasePointerToFirestore(options.uidForInitialSeed);
            }
            return;
          }
          const data = snap.data() as {
            config?: Partial<DatabaseConnectionRegistryState>;
          } | undefined;
          if (!data?.config) return;
          const res = applyRemoteDatabaseRegistry(data.config);
          options?.onApplied?.(res.registry, res.changedActiveTarget);
        },
        () => {
          // Ignore permission/offline errors gracefully
        }
      );
      unsubs.push(unsub);
    } catch {
      // Ignore initialization errors gracefully
    }
  };

  if (getBuiltInDefaultAuth().currentUser) {
    attachForDb(getBuiltInDefaultDb(), true);
  }
  if (!isDefaultAndActiveSameTarget() && getActiveAuthInstance().currentUser) {
    attachForDb(getActiveDb(), false);
  }

  return () => {
    unsubs.forEach((u) => {
      try {
        u();
      } catch {
        // Ignore
      }
    });
  };
}
