import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { getActiveDatabase, handleFirestoreError, OperationType } from './firebase';
import {
  resolveApiEndpoint,
  shouldSkipBackendApiCalls,
} from './clientScraper';
import {
  loadLocalScraperAdapters,
  normalizeScraperAdapter,
  STORAGE_ADAPTERS_KEY,
} from './scraperAdapterUtils';
import {
  ScraperAdapter,
  ScraperAdapterVersionRecord,
} from '../types/scraperAdapter';

const STORAGE_VERSIONS_KEY = 'rahaltv_scraper_adapter_versions_v1';

export { loadLocalScraperAdapters };

export function saveLocalScraperAdapters(adapters: ScraperAdapter[]): ScraperAdapter[] {
  const normalized = adapters.map((a) => normalizeScraperAdapter(a));
  try {
    localStorage.setItem(STORAGE_ADAPTERS_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage quota errors
  }
  return normalized;
}

function loadLocalVersions(adapterId: string): ScraperAdapterVersionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_VERSIONS_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, ScraperAdapterVersionRecord[]>;
    return Array.isArray(map?.[adapterId]) ? map[adapterId] : [];
  } catch {
    return [];
  }
}

function saveLocalVersion(record: ScraperAdapterVersionRecord) {
  try {
    const raw = localStorage.getItem(STORAGE_VERSIONS_KEY);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, ScraperAdapterVersionRecord[]>;
    const existing = Array.isArray(map[record.adapterId]) ? map[record.adapterId] : [];
    const next = [record, ...existing.filter((v) => v.versionId !== record.versionId)].slice(0, 25);
    map[record.adapterId] = next;
    localStorage.setItem(STORAGE_VERSIONS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

function isPermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /permission[-_ ]denied|missing or insufficient permissions/i.test(msg);
}

export async function syncAdaptersToBackendRegistry(
  adapters: ScraperAdapter[],
  user?: User | null
): Promise<void> {
  if (shouldSkipBackendApiCalls()) return;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user) {
      const token = await user.getIdToken().catch(() => '');
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    await fetch(resolveApiEndpoint('/api/adapters/sync'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ adapters: adapters.map((a) => normalizeScraperAdapter(a)) }),
    });
  } catch {
    // Backend might not be running in pure static mode
  }
}

export function subscribeScraperAdapters(
  onData: (adapters: ScraperAdapter[], cloudSynced: boolean) => void
): () => void {
  const path = 'scraper_adapters';
  const q = query(collection(getActiveDatabase(), path), orderBy('updatedAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const raw = d.data() as Record<string, unknown> & {
          createdAt?: { toMillis?: () => number };
          updatedAt?: { toMillis?: () => number };
        };
        const createdAtMs =
          raw.createdAt && typeof raw.createdAt.toMillis === 'function'
            ? raw.createdAt.toMillis()
            : undefined;
        const updatedAtMs =
          raw.updatedAt && typeof raw.updatedAt.toMillis === 'function'
            ? raw.updatedAt.toMillis()
            : createdAtMs;
        return normalizeScraperAdapter({
          ...(raw as Partial<ScraperAdapter>),
          id: String(raw.id || d.id),
          createdAtMs,
          updatedAtMs,
        });
      });
      saveLocalScraperAdapters(list);
      onData(list, true);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Fallback cleanly to local mirror if rules aren't deployed yet
        onData(loadLocalScraperAdapters(), false);
      }
    }
  );
}

function toFirestoreAdapterPayload(
  adapter: ScraperAdapter,
  uid: string,
  includeCreatedAt: boolean
): Record<string, unknown> {
  const clean = normalizeScraperAdapter(adapter);
  const payload: Record<string, unknown> = {
    id: clean.id,
    name: clean.name,
    domain: clean.domain,
    domainAliases: clean.domainAliases,
    enabled: clean.enabled,
    status: clean.status,
    contentTypeHint: clean.contentTypeHint,
    sampleUrl: clean.sampleUrl,
    version: clean.version,
    pageDetection: clean.pageDetection,
    episodeRules: clean.episodeRules,
    serverRules: clean.serverRules,
    navigationRules: clean.navigationRules,
    siteSettings: clean.siteSettings,
    updatedBy: String(uid || 'admin').slice(0, 128),
    updatedAt: serverTimestamp(),
  };
  if (clean.lastTestSummary) {
    payload.lastTestSummary = clean.lastTestSummary;
  }
  if (includeCreatedAt) {
    payload.createdAt = serverTimestamp();
  }
  return payload;
}

function toSnapshotObject(adapter: ScraperAdapter, uid: string): ScraperAdapter {
  const clean = normalizeScraperAdapter(adapter);
  return {
    id: clean.id,
    name: clean.name,
    domain: clean.domain,
    domainAliases: clean.domainAliases,
    enabled: clean.enabled,
    status: clean.status,
    contentTypeHint: clean.contentTypeHint,
    sampleUrl: clean.sampleUrl,
    version: clean.version,
    pageDetection: clean.pageDetection,
    episodeRules: clean.episodeRules,
    serverRules: clean.serverRules,
    navigationRules: clean.navigationRules,
    siteSettings: clean.siteSettings,
    ...(clean.lastTestSummary ? { lastTestSummary: clean.lastTestSummary } : {}),
    updatedBy: String(uid || 'admin').slice(0, 128),
    createdAtMs: clean.createdAtMs || Date.now(),
    updatedAtMs: Date.now(),
  };
}

export async function saveScraperAdapterWithVersion(params: {
  adapter: ScraperAdapter;
  uid: string;
  isNew: boolean;
  changeNote: string;
  previousAdapter?: ScraperAdapter | null;
}): Promise<{ adapter: ScraperAdapter; syncedToCloud: boolean }> {
  const { adapter, uid, isNew, changeNote, previousAdapter } = params;
  const nextVersion = isNew
    ? Math.max(1, adapter.version || 1)
    : Math.max((previousAdapter?.version || adapter.version || 1) + 1, adapter.version || 1);

  const normalized = normalizeScraperAdapter({
    ...adapter,
    version: nextVersion,
    updatedBy: uid,
    createdAtMs: isNew ? Date.now() : previousAdapter?.createdAtMs || adapter.createdAtMs || Date.now(),
    updatedAtMs: Date.now(),
  });

  // Always update local cache optimistically
  const currentLocal = loadLocalScraperAdapters();
  const filtered = currentLocal.filter((a) => a.id !== normalized.id);
  saveLocalScraperAdapters([normalized, ...filtered]);

  const versionId = `v${normalized.version}_${Date.now()}`;
  const versionRecord: ScraperAdapterVersionRecord = {
    versionId,
    adapterId: normalized.id,
    version: normalized.version,
    changeNote: String(changeNote || (isNew ? 'إنشاء أولي للـ Adapter' : 'تحديث القواعد')).slice(0, 400),
    snapshot: toSnapshotObject(normalized, uid),
    savedBy: uid,
    createdAtMs: Date.now(),
  };
  saveLocalVersion(versionRecord);

  // If upgrading from previous adapter and previous wasn't captured locally yet, ensure backup snapshot exists
  if (!isNew && previousAdapter && previousAdapter.version < normalized.version) {
    const prevList = loadLocalVersions(normalized.id);
    if (!prevList.some((v) => v.version === previousAdapter.version)) {
      saveLocalVersion({
        versionId: `v${previousAdapter.version}_backup`,
        adapterId: normalized.id,
        version: previousAdapter.version,
        changeNote: 'نسخة احتياطية قبل التحديث',
        snapshot: toSnapshotObject(previousAdapter, previousAdapter.updatedBy || uid),
        savedBy: uid,
        createdAtMs: previousAdapter.updatedAtMs || Date.now() - 1000,
      });
    }
  }

  const docPath = `scraper_adapters/${normalized.id}`;
  try {
    const activeDb = getActiveDatabase();
    const docRef = doc(activeDb, 'scraper_adapters', normalized.id);
    if (isNew) {
      await setDoc(docRef, toFirestoreAdapterPayload(normalized, uid, true));
    } else {
      try {
        await updateDoc(docRef, toFirestoreAdapterPayload(normalized, uid, false));
      } catch (updateErr) {
        const msg = updateErr instanceof Error ? updateErr.message : String(updateErr || '');
        if (/not[-_ ]found|no document to update/i.test(msg)) {
          await setDoc(docRef, toFirestoreAdapterPayload(normalized, uid, true));
        } else {
          throw updateErr;
        }
      }
    }

    // Write immutable version snapshot in subcollection
    await setDoc(
      doc(activeDb, 'scraper_adapters', normalized.id, 'versions', versionId),
      {
        versionId,
        adapterId: normalized.id,
        version: versionRecord.version,
        changeNote: versionRecord.changeNote,
        snapshot: versionRecord.snapshot,
        savedBy: uid,
        createdAt: serverTimestamp(),
      }
    );

    return { adapter: normalized, syncedToCloud: true };
  } catch (error) {
    if (isPermissionError(error)) {
      return { adapter: normalized, syncedToCloud: false };
    }
    try {
      handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, docPath);
    } catch {
      return { adapter: normalized, syncedToCloud: false };
    }
  }
}

export async function toggleScraperAdapterEnabled(
  adapter: ScraperAdapter,
  enabled: boolean,
  uid: string
): Promise<{ adapter: ScraperAdapter; syncedToCloud: boolean }> {
  const updated = normalizeScraperAdapter({
    ...adapter,
    enabled,
    updatedBy: uid,
    updatedAtMs: Date.now(),
  });
  const currentLocal = loadLocalScraperAdapters();
  saveLocalScraperAdapters(
    currentLocal.map((a) => (a.id === updated.id ? updated : a))
  );

  const docPath = `scraper_adapters/${updated.id}`;
  try {
    await updateDoc(doc(getActiveDatabase(), 'scraper_adapters', updated.id), {
      ...toFirestoreAdapterPayload(updated, uid, false),
    });
    return { adapter: updated, syncedToCloud: true };
  } catch (error) {
    if (isPermissionError(error)) {
      return { adapter: updated, syncedToCloud: false };
    }
    try {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    } catch {
      return { adapter: updated, syncedToCloud: false };
    }
  }
}

export async function deleteScraperAdapter(adapterId: string): Promise<{ syncedToCloud: boolean }> {
  const cleanId = String(adapterId || '').trim();
  const currentLocal = loadLocalScraperAdapters().filter((a) => a.id !== cleanId);
  saveLocalScraperAdapters(currentLocal);

  const docPath = `scraper_adapters/${cleanId}`;
  try {
    await deleteDoc(doc(getActiveDatabase(), 'scraper_adapters', cleanId));
    return { syncedToCloud: true };
  } catch (error) {
    if (isPermissionError(error)) {
      return { syncedToCloud: false };
    }
    try {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    } catch {
      return { syncedToCloud: false };
    }
  }
}

export async function fetchAdapterVersions(
  adapterId: string
): Promise<ScraperAdapterVersionRecord[]> {
  const localVersions = loadLocalVersions(adapterId);
  const path = `scraper_adapters/${adapterId}/versions`;
  try {
    const snap = await getDocs(
      query(collection(getActiveDatabase(), 'scraper_adapters', adapterId, 'versions'), orderBy('createdAt', 'desc'))
    );
    const cloudVersions: ScraperAdapterVersionRecord[] = snap.docs.map((d) => {
      const raw = d.data() as Record<string, unknown> & {
        createdAt?: { toMillis?: () => number };
      };
      return {
        versionId: String(raw.versionId || d.id),
        adapterId: String(raw.adapterId || adapterId),
        version: Number(raw.version || 1),
        changeNote: String(raw.changeNote || ''),
        snapshot: normalizeScraperAdapter((raw.snapshot || {}) as Partial<ScraperAdapter>),
        savedBy: String(raw.savedBy || ''),
        createdAtMs:
          raw.createdAt && typeof raw.createdAt.toMillis === 'function'
            ? raw.createdAt.toMillis()
            : undefined,
      };
    });
    if (cloudVersions.length > 0) return cloudVersions;
    return localVersions;
  } catch (error) {
    if (isPermissionError(error)) return localVersions;
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch {
      return localVersions;
    }
  }
}
