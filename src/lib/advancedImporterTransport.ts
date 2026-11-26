import type { User } from 'firebase/auth';
import { isProxyWorkerUrl, shouldSkipBackendApiCalls } from './clientScraper';
import {
  controlImporterJobBrowser,
  deleteImporterJobBrowser,
  downloadJobExportBrowser,
  extractSingleMovieBrowser,
  fetchSourceIndexBrowser,
  getImporterJobBrowser,
  getPaginatedJobItemsBrowser,
  listImporterJobsBrowser,
  registerSourceIndexEntriesBrowser,
  startBulkImporterJobBrowser,
  updateJobItemsStatusBrowser,
} from './browserAdvancedImporter';
import type {
  AdvancedImportedMovie,
  ImporterJobConfig,
  ImporterJobItemStatus,
  ImporterJobSummary,
  ImporterPaginatedItemsResponse,
  SourceIndexEntry,
} from '../types/advancedImporter';

const ACTIVE_JOB_STORAGE_KEY = 'rahaltv_adv_importer_active_job_v1';

let staticBackendDetected = false;

export class StaticBackendUnavailableError extends Error {
  constructor(message = 'خادم الاستيراد غير متاح في الاستضافة الساكنة — تم التبديل لمحرك المتصفح.') {
    super(message);
    this.name = 'StaticBackendUnavailableError';
  }
}

export function shouldUseBrowserImporter(customApiUrl?: string, jobId?: string): boolean {
  if (jobId && jobId.startsWith('bimp_')) return true;
  if (staticBackendDetected) return true;
  if (shouldSkipBackendApiCalls()) return true;
  const trimmed = String(customApiUrl || '').trim();
  if (trimmed && isProxyWorkerUrl(trimmed)) return true;
  return false;
}

export function _setStaticBackendDetectedForTest(value: boolean): void {
  staticBackendDetected = value;
}

export async function parseJsonResponseSafe<T>(
  res: Response,
  fallbackMessage: string
): Promise<T> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text();
  const trimmed = rawText.trim();

  if (
    contentType.includes('text/html') ||
    /^<(?:!doctype|html|\?xml)/i.test(trimmed) ||
    trimmed.startsWith('<')
  ) {
    throw new StaticBackendUnavailableError();
  }

  if (!trimmed) {
    if (res.status === 404 || res.status === 405 || res.status === 501) {
      throw new StaticBackendUnavailableError();
    }
    throw new Error(fallbackMessage);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    if (trimmed.startsWith('<')) {
      throw new StaticBackendUnavailableError();
    }
    throw new Error(fallbackMessage);
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as { ok?: boolean; code?: string; error?: string };
    if (obj.code === 'STATIC_WORKER_NO_NODE_API') {
      throw new StaticBackendUnavailableError(obj.error);
    }
    if (res.status === 404 && obj.ok === false) {
      throw new StaticBackendUnavailableError(obj.error);
    }
  }

  return parsed as T;
}

export function getSavedActiveImporterJobId(): string {
  try {
    return localStorage.getItem(ACTIVE_JOB_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setSavedActiveImporterJobId(jobId: string): void {
  try {
    if (jobId) localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, jobId);
    else localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
  } catch {
    // ignore storage quota errors
  }
}

function buildApiUrl(customApiUrl: string | undefined, path: string): string {
  const base = String(customApiUrl || '').trim().replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
}

function assertSignedIn(user: User | null): User {
  if (!user) throw new Error('يرجى تسجيل الدخول بحساب مسؤول أو مشرف معتمد.');
  return user;
}

async function getAuthHeaders(user: User | null): Promise<Record<string, string>> {
  const validUser = assertSignedIn(user);
  const token = await validUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function extractSingleMovieApi(params: {
  user: User | null;
  customApiUrl?: string;
  url?: string;
  rawHtml?: string;
  useAdapters?: boolean;
  enrichExternalMetadata?: boolean;
}): Promise<{
  movie: AdvancedImportedMovie;
  strategy: string;
  sourceDuplicate: SourceIndexEntry | null;
}> {
  assertSignedIn(params.user);
  if (shouldUseBrowserImporter(params.customApiUrl)) {
    return extractSingleMovieBrowser({
      url: params.url,
      rawHtml: params.rawHtml,
      useAdapters: params.useAdapters,
      enrichExternalMetadata: params.enrichExternalMetadata,
    });
  }
  try {
    const headers = await getAuthHeaders(params.user);
    const res = await fetch(buildApiUrl(params.customApiUrl, '/api/advanced-importer/single'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: params.url,
        rawHtml: params.rawHtml,
        useAdapters: params.useAdapters,
        enrichExternalMetadata: params.enrichExternalMetadata,
      }),
    });
    const data = await parseJsonResponseSafe<{
      ok?: boolean;
      error?: string;
      movie?: AdvancedImportedMovie;
      strategy?: string;
      sourceDuplicate?: SourceIndexEntry | null;
    }>(res, 'تعذر استخراج بيانات الفيلم.');
    if (!res.ok || !data.ok || !data.movie) {
      throw new Error(data.error || 'تعذر استخراج بيانات الفيلم.');
    }
    return {
      movie: data.movie,
      strategy: data.strategy || 'Direct Extract',
      sourceDuplicate: data.sourceDuplicate || null,
    };
  } catch (err) {
    if (err instanceof StaticBackendUnavailableError) {
      staticBackendDetected = true;
      return extractSingleMovieBrowser({
        url: params.url,
        rawHtml: params.rawHtml,
        useAdapters: params.useAdapters,
        enrichExternalMetadata: params.enrichExternalMetadata,
      });
    }
    throw err;
  }
}

export async function fetchSourceIndexApi(
  user: User | null,
  customApiUrl?: string
): Promise<Record<string, SourceIndexEntry>> {
  assertSignedIn(user);
  if (shouldUseBrowserImporter(customApiUrl)) {
    return fetchSourceIndexBrowser();
  }
  try {
    const headers = await getAuthHeaders(user);
    const res = await fetch(buildApiUrl(customApiUrl, '/api/advanced-importer/source-index'), {
      headers,
    });
    const data = await parseJsonResponseSafe<{
      ok?: boolean;
      index?: Record<string, SourceIndexEntry>;
    }>(res, 'تعذر تحميل فهرس المصادر.');
    return data.ok && data.index ? data.index : {};
  } catch (err) {
    if (err instanceof StaticBackendUnavailableError) {
      staticBackendDetected = true;
      return fetchSourceIndexBrowser();
    }
    return {};
  }
}

export async function registerSourceIndexEntriesApi(
  user: User | null,
  entries: SourceIndexEntry[],
  customApiUrl?: string
): Promise<void> {
  if (!entries.length) return;
  assertSignedIn(user);
  if (shouldUseBrowserImporter(customApiUrl)) {
    registerSourceIndexEntriesBrowser(entries);
    return;
  }
  try {
    const headers = await getAuthHeaders(user);
    const res = await fetch(buildApiUrl(customApiUrl, '/api/advanced-importer/source-index'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ entries }),
    });
    await parseJsonResponseSafe<{ ok?: boolean }>(res, 'تعذر تحديث فهرس المصادر.');
  } catch (err) {
    if (err instanceof StaticBackendUnavailableError) {
      staticBackendDetected = true;
      registerSourceIndexEntriesBrowser(entries);
      return;
    }
    throw err;
  }
}

export async function listImporterJobsApi(
  user: User | null,
  customApiUrl?: string
): Promise<ImporterJobSummary[]> {
  assertSignedIn(user);
  if (shouldUseBrowserImporter(customApiUrl)) {
    return listImporterJobsBrowser();
  }
  try {
    const headers = await getAuthHeaders(user);
    const res = await fetch(buildApiUrl(customApiUrl, '/api/advanced-importer/jobs'), { headers });
    const data = await parseJsonResponseSafe<{
      ok?: boolean;
      jobs?: ImporterJobSummary[];
      error?: string;
    }>(res, 'تعذر تحميل قائمة المهام.');
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'تعذر تحميل قائمة المهام.');
    }
    return data.jobs || [];
  } catch (err) {
    if (err instanceof StaticBackendUnavailableError) {
      staticBackendDetected = true;
      return listImporterJobsBrowser();
    }
    throw err;
  }
}

export async function startBulkImporterJobApi(
  user: User | null,
  config: ImporterJobConfig,
  customApiUrl?: string
): Promise<ImporterJobSummary> {
  assertSignedIn(user);
  if (shouldUseBrowserImporter(customApiUrl)) {
    return startBulkImporterJobBrowser(config);
  }
  try {
    const headers = await getAuthHeaders(user);
    const res = await fetch(buildApiUrl(customApiUrl, '/api/advanced-importer/jobs'), {
      method: 'POST',
      headers,
      body: JSON.stringify(config),
    });
    const data = await parseJsonResponseSafe<{
      ok?: boolean;
      job?: ImporterJobSummary;
      error?: string;
    }>(res, 'تعذر بدء مهمة جلب الموقع.');
    if (!res.ok || !data.ok || !data.job) {
      throw new Error(data.error || 'تعذر بدء مهمة جلب الموقع.');
    }
    return data.job;
  } catch (err) {
    if (err instanceof StaticBackendUnavailableError) {
      staticBackendDetected = true;
      return startBulkImporterJobBrowser(config);
    }
    throw err;
  }
}

export async function getImporterJobApi(
  user: User | null,
  jobId: string,
  customApiUrl?: string
): Promise<ImporterJobSummary> {
  assertSignedIn(user);
  if (shouldUseBrowserImporter(customApiUrl, jobId)) {
    return getImporterJobBrowser(jobId);
  }
  try {
    const headers = await getAuthHeaders(user);
    const res = await fetch(
      buildApiUrl(customApiUrl, `/api/advanced-importer/jobs/${encodeURIComponent(jobId)}`),
      { headers }
    );
    const data = await parseJsonResponseSafe<{
      ok?: boolean;
      job?: ImporterJobSummary;
      error?: string;
    }>(res, 'لم يتم العثور على المهمة.');
    if (!res.ok || !data.ok || !data.job) {
      throw new Error(data.error || 'لم يتم العثور على المهمة.');
    }
    return data.job;
  } catch (err) {
    if (err instanceof StaticBackendUnavailableError) {
      staticBackendDetected = true;
      return getImporterJobBrowser(jobId);
    }
    throw err;
  }
}

export async function controlImporterJobApi(
  user: User | null,
  jobId: string,
  action: 'pause' | 'resume' | 'cancel' | 'retry-failed',
  extraBody?: Record<string, unknown>,
  customApiUrl?: string
): Promise<ImporterJobSummary> {
  assertSignedIn(user);
  if (shouldUseBrowserImporter(customApiUrl, jobId)) {
    return controlImporterJobBrowser(jobId, action, extraBody);
  }
  try {
    const headers = await getAuthHeaders(user);
    const res = await fetch(
      buildApiUrl(customApiUrl, `/api/advanced-importer/jobs/${encodeURIComponent(jobId)}/${action}`),
      {
        method: 'POST',
        headers,
        body: JSON.stringify(extraBody || {}),
      }
    );
    const data = await parseJsonResponseSafe<{
      ok?: boolean;
      job?: ImporterJobSummary;
      error?: string;
    }>(res, 'فشل تنفيذ الإجراء على المهمة.');
    if (!res.ok || !data.ok || !data.job) {
      throw new Error(data.error || 'فشل تنفيذ الإجراء على المهمة.');
    }
    return data.job;
  } catch (err) {
    if (err instanceof StaticBackendUnavailableError) {
      staticBackendDetected = true;
      return controlImporterJobBrowser(jobId, action, extraBody);
    }
    throw err;
  }
}

export async function deleteImporterJobApi(
  user: User | null,
  jobId: string,
  customApiUrl?: string
): Promise<void> {
  assertSignedIn(user);
  if (shouldUseBrowserImporter(customApiUrl, jobId)) {
    await deleteImporterJobBrowser(jobId);
    return;
  }
  try {
    const headers = await getAuthHeaders(user);
    const res = await fetch(
      buildApiUrl(customApiUrl, `/api/advanced-importer/jobs/${encodeURIComponent(jobId)}`),
      {
        method: 'DELETE',
        headers,
      }
    );
    await parseJsonResponseSafe<{ ok?: boolean }>(res, 'تعذر حذف المهمة.');
  } catch (err) {
    if (err instanceof StaticBackendUnavailableError) {
      staticBackendDetected = true;
      await deleteImporterJobBrowser(jobId);
      return;
    }
    throw err;
  }
}

export async function getPaginatedJobItemsApi(params: {
  user: User | null;
  jobId: string;
  page: number;
  pageSize: number;
  status: 'all' | ImporterJobItemStatus;
  search: string;
  customApiUrl?: string;
}): Promise<ImporterPaginatedItemsResponse> {
  assertSignedIn(params.user);
  if (shouldUseBrowserImporter(params.customApiUrl, params.jobId)) {
    return getPaginatedJobItemsBrowser({
      jobId: params.jobId,
      page: params.page,
      pageSize: params.pageSize,
      status: params.status,
      search: params.search,
    });
  }
  try {
    const headers = await getAuthHeaders(params.user);
    const qs = new URLSearchParams({
      page: String(params.page),
      pageSize: String(params.pageSize),
      status: params.status,
      search: params.search,
    });
    const res = await fetch(
      buildApiUrl(
        params.customApiUrl,
        `/api/advanced-importer/jobs/${encodeURIComponent(params.jobId)}/items?${qs.toString()}`
      ),
      { headers }
    );
    const data = await parseJsonResponseSafe<ImporterPaginatedItemsResponse & { error?: string }>(
      res,
      'تعذر قراءة نتائج المهمة.'
    );
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'تعذر قراءة نتائج المهمة.');
    }
    return data;
  } catch (err) {
    if (err instanceof StaticBackendUnavailableError) {
      staticBackendDetected = true;
      return getPaginatedJobItemsBrowser({
        jobId: params.jobId,
        page: params.page,
        pageSize: params.pageSize,
        status: params.status,
        search: params.search,
      });
    }
    throw err;
  }
}

export async function updateJobItemsStatusApi(
  user: User | null,
  jobId: string,
  updates: Array<{ seq: number; status: ImporterJobItemStatus; savedMediaId?: string }>,
  customApiUrl?: string
): Promise<ImporterJobSummary | null> {
  if (!updates.length) return null;
  assertSignedIn(user);
  if (shouldUseBrowserImporter(customApiUrl, jobId)) {
    return updateJobItemsStatusBrowser(jobId, updates);
  }
  try {
    const headers = await getAuthHeaders(user);
    const res = await fetch(
      buildApiUrl(customApiUrl, `/api/advanced-importer/jobs/${encodeURIComponent(jobId)}/items-status`),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ updates }),
      }
    );
    const data = await parseJsonResponseSafe<{ ok?: boolean; job?: ImporterJobSummary }>(
      res,
      'تعذر تحديث حالة النتائج.'
    );
    return data.ok && data.job ? data.job : null;
  } catch (err) {
    if (err instanceof StaticBackendUnavailableError) {
      staticBackendDetected = true;
      return updateJobItemsStatusBrowser(jobId, updates);
    }
    throw err;
  }
}

export async function downloadJobExportApi(params: {
  user: User | null;
  jobId: string;
  format: 'json' | 'csv';
  statusFilter?: string;
  customApiUrl?: string;
}): Promise<void> {
  assertSignedIn(params.user);
  if (shouldUseBrowserImporter(params.customApiUrl, params.jobId)) {
    await downloadJobExportBrowser({
      jobId: params.jobId,
      format: params.format,
      statusFilter: params.statusFilter,
    });
    return;
  }
  const headers = await getAuthHeaders(params.user);
  const qs = new URLSearchParams({
    format: params.format,
    status: params.statusFilter || 'all',
  });
  const res = await fetch(
    buildApiUrl(
      params.customApiUrl,
      `/api/advanced-importer/jobs/${encodeURIComponent(params.jobId)}/export?${qs.toString()}`
    ),
    { headers }
  );
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok || contentType.includes('text/html')) {
    if (contentType.includes('text/html') || res.status === 404 || res.status === 405 || res.status === 501) {
      staticBackendDetected = true;
      await downloadJobExportBrowser({
        jobId: params.jobId,
        format: params.format,
        statusFilter: params.statusFilter,
      });
      return;
    }
    throw new Error('تعذر تصدير ملف النتائج من الخادم.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rahaltv-importer-${params.jobId}.${params.format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
