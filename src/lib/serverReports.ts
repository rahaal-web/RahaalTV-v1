import type { MediaItem, MediaKind, VisitorRequest } from '../types/media';

export const BROKEN_SERVER_REPORT_TITLE_PREFIX = 'بلاغ عطل سيرفرات:';
const STORAGE_KEY = 'rahaltv_server_reports_v1';
const REPORT_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_STORED_REPORTS = 30;

export interface BrokenServerReportPayload {
  title: string;
  type: VisitorRequest['type'];
  notes: string;
  dedupeKey: string;
}

export interface StoredServerReportEntry {
  dedupeKey: string;
  payload: BrokenServerReportPayload;
  synced: boolean;
  reportedAtMs: number;
}

function getSafeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore storage access restriction
  }
  return null;
}

function readStoredEntries(): StoredServerReportEntry[] {
  const storage = getSafeStorage();
  if (!storage) return memoryFallbackEntries;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is StoredServerReportEntry =>
        Boolean(entry) &&
        typeof entry.dedupeKey === 'string' &&
        typeof entry.reportedAtMs === 'number' &&
        Boolean(entry.payload) &&
        typeof entry.payload.title === 'string'
    );
  } catch {
    return [];
  }
}

let memoryFallbackEntries: StoredServerReportEntry[] = [];

function writeStoredEntries(entries: StoredServerReportEntry[]): void {
  const trimmed = entries.slice(-MAX_STORED_REPORTS);
  memoryFallbackEntries = trimmed;
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore quota failure
  }
}

export function mapMediaKindToRequestType(kind?: MediaKind): VisitorRequest['type'] {
  if (kind === 'series' || kind === 'tv') return 'مسلسل';
  if (kind === 'wrestling') return 'عرض مصارعة';
  return 'فيلم';
}

export function buildAutoBrokenServerReportPayload(params: {
  item: Pick<MediaItem, 'id' | 'title' | 'kind'>;
  seasonNumber?: number;
  episodeNumber?: number;
  activeServerLabel?: string;
  totalServers?: number;
}): BrokenServerReportPayload {
  const { item, seasonNumber, episodeNumber, activeServerLabel, totalServers = 0 } = params;
  const isEpisodic =
    (item.kind === 'series' || item.kind === 'tv') &&
    typeof episodeNumber === 'number' &&
    episodeNumber > 0;
  const epTag = isEpisodic
    ? ` (الموسم ${seasonNumber && seasonNumber > 0 ? seasonNumber : 1} - الحلقة ${String(episodeNumber).padStart(2, '0')})`
    : '';
  const title = `${BROKEN_SERVER_REPORT_TITLE_PREFIX} ${item.title}${epTag}`.trim().slice(0, 200);
  const type = mapMediaKindToRequestType(item.kind);
  const targetWord =
    item.kind === 'series' || item.kind === 'tv'
      ? isEpisodic
        ? 'لهذه الحلقة'
        : 'لهذا المسلسل'
      : item.kind === 'wrestling'
        ? 'لهذا العرض'
        : 'لهذا الفيلم';
  const serverInfo = activeServerLabel ? `السيرفر الحالي: ${activeServerLabel}` : 'بدون سيرفر فعال';
  const notes = `إبلاغ تلقائي من المشغّل: لا يوجد سيرفر شغال ${targetWord} (${serverInfo} · عدد السيرفرات: ${Math.max(0, totalServers)} · ID: ${item.id})`
    .trim()
    .slice(0, 500);
  const dedupeKey = `${item.id}::s${isEpisodic ? seasonNumber || 1 : 0}::e${isEpisodic ? episodeNumber : 0}`;

  return {
    title,
    type,
    notes,
    dedupeKey,
  };
}

export function isBrokenServerRequest(
  req: Pick<VisitorRequest, 'title' | 'notes'>
): boolean {
  const title = String(req?.title || '');
  const notes = String(req?.notes || '');
  return (
    title.startsWith(BROKEN_SERVER_REPORT_TITLE_PREFIX) ||
    notes.includes('إبلاغ تلقائي من المشغّل') ||
    notes.includes('لا يوجد سيرفر شغال')
  );
}

export function hasRecentlyReportedServerIssue(
  dedupeKey: string,
  nowMs: number = Date.now()
): boolean {
  if (!dedupeKey) return false;
  const entries = readStoredEntries();
  return entries.some(
    (entry) =>
      entry.dedupeKey === dedupeKey && nowMs - entry.reportedAtMs < REPORT_COOLDOWN_MS
  );
}

export function markServerIssueReportedLocally(
  dedupeKey: string,
  payload: BrokenServerReportPayload,
  synced: boolean,
  nowMs: number = Date.now()
): void {
  const existing = readStoredEntries().filter((e) => e.dedupeKey !== dedupeKey);
  existing.push({
    dedupeKey,
    payload,
    synced,
    reportedAtMs: nowMs,
  });
  writeStoredEntries(existing);
}

export function loadPendingGuestServerReports(): StoredServerReportEntry[] {
  return readStoredEntries().filter((entry) => !entry.synced);
}

export function markPendingServerReportsSynced(syncedKeys: string[]): void {
  if (syncedKeys.length === 0) return;
  const set = new Set(syncedKeys);
  const next = readStoredEntries().map((entry) =>
    set.has(entry.dedupeKey) ? { ...entry, synced: true } : entry
  );
  writeStoredEntries(next);
}

export function clearStoredServerReportsForTests(): void {
  memoryFallbackEntries = [];
  const storage = getSafeStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}
