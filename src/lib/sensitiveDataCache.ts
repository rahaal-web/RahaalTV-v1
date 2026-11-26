import { getActiveFirebaseConfig } from './dbConnectionManager';
import { RecentlyWatchedRecord, VisitorRequest } from '../types/media';

const SENSITIVE_CACHE_PREFIX = 'rahaltv_sensitive_cache_v1';

const WATCHLIST_TTL_MS = 6 * 60 * 60 * 1000;
const RECENTLY_WATCHED_TTL_MS = 6 * 60 * 60 * 1000;
const REQUESTS_TTL_MS = 15 * 60 * 1000;
const PROFILE_SYNC_TTL_MS = 30 * 60 * 1000;

const MAX_WATCHLIST_IDS = 100;
const MAX_RECENTLY_WATCHED_CACHED = 24;
const MAX_REQUESTS_CACHED = 40;

interface CachedEntry<T> {
  uid: string;
  scope: string;
  cachedAtMs: number;
  expiresAtMs: number;
  data: T;
}

interface ProfileSyncCheckpoint {
  fingerprint: string;
  syncedAtMs: number;
}

const memoryFallbackStore = new Map<string, string>();

function hasBrowserStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readRawKey(key: string): string | null {
  if (hasBrowserStorage()) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryFallbackStore.get(key) ?? null;
    }
  }
  return memoryFallbackStore.get(key) ?? null;
}

function writeRawKey(key: string, value: string): void {
  if (hasBrowserStorage()) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      // Fall back to in-memory cache on storage quota restrictions
    }
  }
  memoryFallbackStore.set(key, value);
}

function removeRawKey(key: string): void {
  if (hasBrowserStorage()) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }
  memoryFallbackStore.delete(key);
}

function listAllSensitiveKeys(): string[] {
  const keys: string[] = [];
  if (hasBrowserStorage()) {
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(`${SENSITIVE_CACHE_PREFIX}::`)) {
          keys.push(k);
        }
      }
    } catch {
      // Ignore
    }
  }
  for (const k of memoryFallbackStore.keys()) {
    if (k.startsWith(`${SENSITIVE_CACHE_PREFIX}::`) && !keys.includes(k)) {
      keys.push(k);
    }
  }
  return keys;
}

function sanitizeKeySegment(value: string): string {
  const clean = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '_');
  return clean || 'unknown';
}

export function getActiveDbScopeId(override?: {
  projectId?: string;
  firestoreDatabaseId?: string;
}): string {
  if (override?.projectId || override?.firestoreDatabaseId) {
    const proj = sanitizeKeySegment(override.projectId || 'default');
    const dbId = sanitizeKeySegment(override.firestoreDatabaseId || '(default)');
    return `${proj}__${dbId}`;
  }
  try {
    const cfg = getActiveFirebaseConfig();
    const proj = sanitizeKeySegment(cfg.projectId || 'default');
    const dbId = sanitizeKeySegment(cfg.firestoreDatabaseId || '(default)');
    return `${proj}__${dbId}`;
  } catch {
    return 'default__(default)';
  }
}

export function getSensitiveCacheKey(
  uid: string,
  bucket: 'watchlist' | 'recently_watched' | 'requests_user' | 'requests_owner' | 'profile_sync',
  dbScope: string = getActiveDbScopeId()
): string {
  return `${SENSITIVE_CACHE_PREFIX}::${dbScope}::${sanitizeKeySegment(uid)}::${bucket}`;
}

function readScopedEntry<T>(
  uid: string,
  bucket: 'watchlist' | 'recently_watched' | 'requests_user' | 'requests_owner' | 'profile_sync',
  nowMs: number = Date.now(),
  dbScope: string = getActiveDbScopeId()
): T | null {
  if (!uid || uid === 'guest') return null;
  const key = getSensitiveCacheKey(uid, bucket, dbScope);
  const raw = readRawKey(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedEntry<T>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.uid !== uid ||
      parsed.scope !== dbScope ||
      typeof parsed.expiresAtMs !== 'number' ||
      parsed.expiresAtMs <= nowMs
    ) {
      removeRawKey(key);
      return null;
    }
    return parsed.data;
  } catch {
    removeRawKey(key);
    return null;
  }
}

function writeScopedEntry<T>(
  uid: string,
  bucket: 'watchlist' | 'recently_watched' | 'requests_user' | 'requests_owner' | 'profile_sync',
  data: T,
  ttlMs: number,
  nowMs: number = Date.now(),
  dbScope: string = getActiveDbScopeId()
): void {
  if (!uid || uid === 'guest') return;
  const key = getSensitiveCacheKey(uid, bucket, dbScope);
  const envelope: CachedEntry<T> = {
    uid,
    scope: dbScope,
    cachedAtMs: nowMs,
    expiresAtMs: nowMs + Math.max(1000, ttlMs),
    data,
  };
  try {
    writeRawKey(key, JSON.stringify(envelope));
  } catch {
    // Ignore storage errors
  }
}

export function loadCachedUserWatchlist(
  uid: string,
  nowMs: number = Date.now(),
  dbScope?: string
): string[] | null {
  const data = readScopedEntry<unknown>(uid, 'watchlist', nowMs, dbScope);
  if (!Array.isArray(data)) return null;
  return data.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())).slice(0, MAX_WATCHLIST_IDS);
}

export function saveCachedUserWatchlist(
  uid: string,
  watchlistIds: string[],
  nowMs: number = Date.now(),
  dbScope?: string
): void {
  if (!uid || uid === 'guest' || !Array.isArray(watchlistIds)) return;
  const clean = Array.from(
    new Set(watchlistIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))
  ).slice(0, MAX_WATCHLIST_IDS);
  writeScopedEntry(uid, 'watchlist', clean, WATCHLIST_TTL_MS, nowMs, dbScope);
}

export function loadCachedUserRecentlyWatched(
  uid: string,
  nowMs: number = Date.now(),
  dbScope?: string
): RecentlyWatchedRecord[] | null {
  const data = readScopedEntry<unknown>(uid, 'recently_watched', nowMs, dbScope);
  if (!Array.isArray(data)) return null;
  return data
    .filter(
      (entry): entry is RecentlyWatchedRecord =>
        Boolean(entry && typeof entry === 'object' && typeof (entry as RecentlyWatchedRecord).mediaId === 'string')
    )
    .filter((entry) => entry.userId === uid)
    .slice(0, MAX_RECENTLY_WATCHED_CACHED);
}

export function saveCachedUserRecentlyWatched(
  uid: string,
  records: RecentlyWatchedRecord[],
  nowMs: number = Date.now(),
  dbScope?: string
): void {
  if (!uid || uid === 'guest' || !Array.isArray(records)) return;
  const compact: RecentlyWatchedRecord[] = records
    .filter((r) => Boolean(r && r.userId === uid && r.mediaId))
    .sort((a, b) => (b.lastWatchedAtMs || 0) - (a.lastWatchedAtMs || 0))
    .slice(0, MAX_RECENTLY_WATCHED_CACHED)
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      mediaId: r.mediaId,
      title: String(r.title || '').slice(0, 160),
      kind: r.kind,
      poster: String(r.poster || '').slice(0, 400),
      backdrop: String(r.backdrop || '').slice(0, 400),
      year: r.year,
      quality: r.quality,
      slug: r.slug,
      englishTitle: r.englishTitle,
      seasonNumber: r.seasonNumber,
      episodeNumber: r.episodeNumber,
      episodeTitle: r.episodeTitle,
      positionSec: r.positionSec,
      durationSec: r.durationSec,
      progressPct: r.progressPct,
      completed: Boolean(r.completed),
      lastServerIndex: r.lastServerIndex,
      lastWatchedAtMs: r.lastWatchedAtMs,
      createdAtMs: r.createdAtMs,
    }));
  writeScopedEntry(uid, 'recently_watched', compact, RECENTLY_WATCHED_TTL_MS, nowMs, dbScope);
}

export function normalizeFirestoreRequestRecord(
  docId: string,
  rawData: Record<string, unknown>
): { createdMs: number; item: VisitorRequest } {
  const createdAtRaw = rawData.createdAt as
    | { toMillis?: () => number; toDate?: () => Date }
    | string
    | undefined;
  const createdMs =
    createdAtRaw && typeof createdAtRaw === 'object' && typeof createdAtRaw.toMillis === 'function'
      ? createdAtRaw.toMillis()
      : typeof createdAtRaw === 'string'
        ? Date.parse(createdAtRaw) || 0
        : 0;
  const createdAtIso =
    createdAtRaw && typeof createdAtRaw === 'object' && typeof createdAtRaw.toDate === 'function'
      ? createdAtRaw.toDate().toISOString()
      : typeof createdAtRaw === 'string' && createdAtRaw
        ? createdAtRaw
        : new Date(createdMs || Date.now()).toISOString();

  const item: VisitorRequest = {
    id: String(rawData.id || docId),
    userId: typeof rawData.userId === 'string' ? rawData.userId : undefined,
    requesterName: String(rawData.requesterName || 'عضو'),
    title: String(rawData.title || ''),
    type: (['movie', 'series', 'wrestling', 'other'].includes(String(rawData.type))
      ? rawData.type
      : 'other') as VisitorRequest['type'],
    notes: String(rawData.notes || ''),
    status: (['pending', 'approved', 'completed', 'rejected'].includes(String(rawData.status))
      ? rawData.status
      : 'pending') as VisitorRequest['status'],
    adminNote: String(rawData.adminNote || ''),
    createdAt: createdAtIso,
  };
  return { createdMs, item };
}

export function loadCachedUserRequests(
  uid: string,
  isOwnerAdmin: boolean,
  nowMs: number = Date.now(),
  dbScope?: string
): VisitorRequest[] | null {
  const bucket = isOwnerAdmin ? 'requests_owner' : 'requests_user';
  const data = readScopedEntry<unknown>(uid, bucket, nowMs, dbScope);
  if (!Array.isArray(data)) return null;
  const list = data.filter(
    (entry): entry is VisitorRequest =>
      Boolean(entry && typeof entry === 'object' && typeof (entry as VisitorRequest).id === 'string')
  );
  return isOwnerAdmin ? list : list.filter((req) => !req.userId || req.userId === uid);
}

export function saveCachedUserRequests(
  uid: string,
  isOwnerAdmin: boolean,
  requests: VisitorRequest[],
  nowMs: number = Date.now(),
  dbScope?: string
): void {
  if (!uid || uid === 'guest' || !Array.isArray(requests)) return;
  const bucket = isOwnerAdmin ? 'requests_owner' : 'requests_user';
  const scoped = (isOwnerAdmin ? requests : requests.filter((r) => !r.userId || r.userId === uid))
    .slice(0, MAX_REQUESTS_CACHED)
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      requesterName: String(r.requesterName || '').slice(0, 120),
      title: String(r.title || '').slice(0, 200),
      type: r.type,
      notes: String(r.notes || '').slice(0, 400),
      status: r.status,
      adminNote: String(r.adminNote || '').slice(0, 300),
      createdAt: r.createdAt,
    }));
  writeScopedEntry(uid, bucket, scoped, REQUESTS_TTL_MS, nowMs, dbScope);
}

export function computeUserProfileSyncFingerprint(info: {
  uid: string;
  displayName?: string | null;
  photoURL?: string | null;
  email?: string | null;
  isAdminUser?: boolean;
}): string {
  const raw = [
    info.uid || '',
    info.displayName || '',
    info.photoURL || '',
    info.email || '',
    info.isAdminUser ? '1' : '0',
  ].join('|');
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function shouldRunDeferredProfileSync(
  uid: string,
  fingerprint: string,
  nowMs: number = Date.now(),
  dbScope?: string
): boolean {
  if (!uid || uid === 'guest') return false;
  const saved = readScopedEntry<ProfileSyncCheckpoint>(uid, 'profile_sync', nowMs, dbScope);
  if (!saved) return true;
  if (saved.fingerprint !== fingerprint) return true;
  return nowMs - saved.syncedAtMs >= PROFILE_SYNC_TTL_MS;
}

export function markProfileSynced(
  uid: string,
  fingerprint: string,
  nowMs: number = Date.now(),
  dbScope?: string
): void {
  if (!uid || uid === 'guest') return;
  const payload: ProfileSyncCheckpoint = {
    fingerprint,
    syncedAtMs: nowMs,
  };
  writeScopedEntry(uid, 'profile_sync', payload, PROFILE_SYNC_TTL_MS, nowMs, dbScope);
}

export function clearSensitiveCachesForUser(uid: string, dbScope: string = getActiveDbScopeId()): void {
  if (!uid) return;
  const safeUid = sanitizeKeySegment(uid);
  const needle = `::${dbScope}::${safeUid}::`;
  for (const key of listAllSensitiveKeys()) {
    if (key.includes(needle)) {
      removeRawKey(key);
    }
  }
}

export function purgeSensitiveCachesExcept(
  activeUid: string,
  dbScope: string = getActiveDbScopeId()
): void {
  const safeActive = sanitizeKeySegment(activeUid);
  const activePrefix = `${SENSITIVE_CACHE_PREFIX}::${dbScope}::${safeActive}::`;
  for (const key of listAllSensitiveKeys()) {
    if (!key.startsWith(activePrefix)) {
      removeRawKey(key);
    }
  }
}

export function clearAllSensitiveCaches(): void {
  for (const key of listAllSensitiveKeys()) {
    removeRawKey(key);
  }
}
