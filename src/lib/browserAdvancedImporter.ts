import type {
  AdvancedImportedMovie,
  ImporterJobConfig,
  ImporterJobItemStatus,
  ImporterJobLog,
  ImporterJobResultRecord,
  ImporterJobSummary,
  ImporterPaginatedItemsResponse,
  SourceIndexEntry,
} from '../types/advancedImporter';
import {
  cleanTextBrowser,
  extractListingLinksAndPaginationBrowser,
  fetchViaBrowserOrCorsRelay,
  isBlockedHostBrowser,
  isLikelyContentUrl,
  parseHtmlToMediaWithHintsBrowser,
  scrapeFullItemInBrowser,
  ScrapedPayload,
  tryBloggerFeedBrowser,
  trySitemapDiscoveryBrowser,
  tryWordPressApiBrowser,
  upgradeKnownImageUrlScraper,
} from './clientScraper';
import { scrapeSingleWithAdapterInBrowser } from './clientAdapterEngine';
import { extractCleanEnglishTitleCandidate } from './imageMatching';
import { loadLocalScraperAdapters, matchAdapterForUrl } from './scraperAdapterUtils';

const STORAGE_BROWSER_SOURCE_INDEX = 'rahaltv_adv_browser_source_index_v1';
const STORAGE_BROWSER_JOBS = 'rahaltv_adv_browser_jobs_v1';
const IDB_NAME = 'rahaltv_adv_importer_idb';
const IDB_STORE = 'job_items';

function cleanStr(val: unknown): string {
  return String(val ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hash32Hex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function canonicalizeSourceUrl(rawUrl: string): string {
  const clean = cleanStr(rawUrl);
  if (!clean) return '';
  try {
    const u = new URL(clean);
    u.hash = '';
    const dropParams = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid', 'ref'];
    for (const p of dropParams) u.searchParams.delete(p);
    return u.toString().replace(/\/+$/, '');
  } catch {
    return clean.replace(/\/+$/, '');
  }
}

function buildSlugFromMovie(englishTitle: string, title: string, year: string, sourceUrl: string): string {
  const rawBase = englishTitle || extractCleanEnglishTitleCandidate(title) || title || '';
  const ascii = rawBase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (ascii && ascii.length >= 2) {
    return year && !ascii.includes(year) ? `${ascii}-${year}` : ascii;
  }
  try {
    if (sourceUrl) {
      const pathPart = decodeURIComponent(new URL(sourceUrl).pathname)
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 48);
      if (pathPart && pathPart.length >= 2) return pathPart;
    }
  } catch {
    // ignore
  }
  return `movie-${hash32Hex(sourceUrl || title || String(Date.now()))}`;
}

function extractExternalIdFromUrl(sourceUrl: string): string {
  if (!sourceUrl) return '';
  try {
    const u = new URL(sourceUrl);
    for (const key of ['vid', 'id', 'p', 'post', 'movie']) {
      const val = u.searchParams.get(key);
      if (val && /^[a-zA-Z0-9_-]{2,40}$/.test(val)) return val;
    }
    const segs = u.pathname.split('/').filter(Boolean);
    const last = segs[segs.length - 1] || '';
    const m = last.match(/(\d{3,10})/);
    if (m?.[1]) return m[1];
  } catch {
    // ignore
  }
  return '';
}

function buildAdvancedMovieRecordBrowser(
  baseMedia: ScrapedPayload,
  sourceUrl: string
): AdvancedImportedMovie {
  const canonicalUrl = canonicalizeSourceUrl(sourceUrl) || sourceUrl;
  let sourceDomain = '';
  try {
    if (canonicalUrl) sourceDomain = new URL(canonicalUrl).hostname.replace(/^www\./, '');
  } catch {
    sourceDomain = '';
  }

  const yearMatch = (baseMedia.year || '2026').match(/\b(19\d\d|20[0-3]\d)\b/);
  const year = yearMatch ? yearMatch[1] : '2026';
  const externalId = extractExternalIdFromUrl(canonicalUrl);
  const title = cleanStr(baseMedia.title) || 'فيلم مستورد';
  const englishTitle = cleanStr(baseMedia.englishTitle) || extractCleanEnglishTitleCandidate(title) || title;
  const slug = buildSlugFromMovie(englishTitle, title, year, canonicalUrl);
  const idHash = hash32Hex(canonicalUrl || `${slug}-${year}`);
  const id = `imp-${slug.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40)}-${idHash}`.replace(/-+/g, '-');

  const cast = Array.isArray(baseMedia.cast) ? baseMedia.cast : [];
  const directors = cast.filter((c) => /مخرج|director/i.test(c.role)).map((c) => c.name);
  const poster = baseMedia.poster_url || baseMedia.poster || '';
  const backdrop = baseMedia.backdrop_url || baseMedia.backdrop || '';

  return {
    id,
    externalId,
    slug,
    imdbId: cleanStr(baseMedia.imdbId),
    sourceUrl: canonicalUrl,
    sourceDomain,
    title,
    englishTitle,
    story: cleanStr(baseMedia.story || title).slice(0, 2800),
    tagline: cleanStr(baseMedia.tagline || baseMedia.story || title).slice(0, 380),
    year,
    releaseDate: year,
    kind: baseMedia.kind || 'movie',
    categories: (baseMedia.categories || ['افلام']).filter(Boolean).slice(0, 10),
    genres: (baseMedia.genres || ['دراما']).filter(Boolean).slice(0, 10),
    tags: [],
    duration: cleanStr(baseMedia.duration) || '120 دقيقة',
    imdb: Number.isFinite(Number(baseMedia.imdb)) ? Number(baseMedia.imdb) : 7.5,
    votes: cleanStr(baseMedia.votes) || '10,000',
    country: cleanStr(baseMedia.country) || 'غير محدد',
    language: cleanStr(baseMedia.language) || 'مترجم للعربية',
    quality: cleanStr(baseMedia.quality) || 'WEB-DL',
    poster,
    backdrop,
    poster_url: poster,
    backdrop_url: backdrop,
    poster_width: baseMedia.poster_width || 0,
    poster_height: baseMedia.poster_height || 0,
    backdrop_width: baseMedia.backdrop_width || 0,
    backdrop_height: baseMedia.backdrop_height || 0,
    image_source: baseMedia.image_source || (poster ? 'scraped' : 'none'),
    image_quality_status: baseMedia.image_quality_status || (backdrop ? 'unknown' : 'missing_backdrop'),
    trailerUrl: cleanStr(baseMedia.trailerUrl),
    directors,
    cast: cast.slice(0, 25),
    servers: (baseMedia.servers || []).slice(0, 15).map((s, idx) => ({
      id: s.id || `srv-${idx + 1}`,
      name: cleanStr(s.name) || `سيرفر ${idx + 1}`,
      mode: s.mode || (s.embedCode ? 'embed' : 'url'),
      url: cleanStr(s.url),
      embedCode: cleanStr(s.embedCode),
      quality: cleanStr(s.quality) || cleanStr(baseMedia.quality) || 'HD',
      speed: cleanStr(s.speed) || 'سريع',
      tag: cleanStr(s.tag) || 'HD',
    })),
    downloads: (baseMedia.downloads || []).slice(0, 15).map((d, idx) => ({
      id: d.id || `dl-${idx + 1}`,
      host: cleanStr(d.host) || `سيرفر تحميل ${idx + 1}`,
      quality: cleanStr(d.quality) || cleanStr(baseMedia.quality) || 'HD',
      size: cleanStr(d.size) || 'حسب السيرفر',
      format: cleanStr(d.format) || 'MP4',
      url: cleanStr(d.url),
    })),
    seasons: baseMedia.seasons || [],
  };
}

// =========================================================================
// Browser Source Index Persistence
// =========================================================================
export function fetchSourceIndexBrowser(): Record<string, SourceIndexEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_BROWSER_SOURCE_INDEX);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SourceIndexEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function registerSourceIndexEntriesBrowser(entries: SourceIndexEntry[]): void {
  if (!entries.length) return;
  const idx = fetchSourceIndexBrowser();
  for (const entry of entries) {
    const canon = canonicalizeSourceUrl(entry.canonicalUrl || entry.sourceUrl);
    if (!canon || !entry.mediaId) continue;
    idx[canon] = {
      ...entry,
      canonicalUrl: canon,
      sourceUrl: entry.sourceUrl || canon,
      updatedAt: entry.updatedAt || Date.now(),
    };
  }
  try {
    localStorage.setItem(STORAGE_BROWSER_SOURCE_INDEX, JSON.stringify(idx));
  } catch {
    // ignore storage quota errors
  }
}

function findSourceIndexDuplicateBrowser(
  sourceUrl: string,
  externalId?: string,
  imdbId?: string
): SourceIndexEntry | null {
  const idx = fetchSourceIndexBrowser();
  const canon = canonicalizeSourceUrl(sourceUrl);
  if (canon && idx[canon]) return idx[canon];
  if (imdbId || externalId) {
    for (const entry of Object.values(idx)) {
      if (imdbId && entry.imdbId && entry.imdbId.toLowerCase() === imdbId.toLowerCase()) {
        return entry;
      }
      if (externalId && entry.externalId && entry.externalId === externalId) {
        return entry;
      }
    }
  }
  return null;
}

// =========================================================================
// IndexedDB Helper for Job Items (falls back silently to in-memory)
// =========================================================================
function openImporterIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveJobItemsToIdb(jobId: string, items: ImporterJobResultRecord[]): Promise<void> {
  const db = await openImporterIdb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(items, jobId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore IDB errors
  } finally {
    db.close();
  }
}

async function loadJobItemsFromIdb(jobId: string): Promise<ImporterJobResultRecord[]> {
  const db = await openImporterIdb();
  if (!db) return [];
  try {
    return await new Promise<ImporterJobResultRecord[]>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(jobId);
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  } finally {
    db.close();
  }
}

async function deleteJobItemsFromIdb(jobId: string): Promise<void> {
  const db = await openImporterIdb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(jobId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  } finally {
    db.close();
  }
}

// =========================================================================
// Mode 1: Single Movie Extraction (Browser + Cloudflare Worker)
// =========================================================================
export async function extractSingleMovieBrowser(params: {
  url?: string;
  rawHtml?: string;
  useAdapters?: boolean;
  enrichExternalMetadata?: boolean;
}): Promise<{
  movie: AdvancedImportedMovie;
  strategy: string;
  sourceDuplicate: SourceIndexEntry | null;
}> {
  const cleanUrl = cleanStr(params.url);
  const rawHtml = typeof params.rawHtml === 'string' ? params.rawHtml : '';
  const hasRawHtml = rawHtml.trim().length > 30;
  const useAdapters = params.useAdapters !== false;
  const enrichExternal = params.enrichExternalMetadata !== false;

  if (!cleanUrl && !hasRawHtml) {
    throw new Error('يرجى إدخال رابط صفحة الفيلم أو لصق كود HTML.');
  }

  let effectiveUrl = cleanUrl;
  let fetchedHtml = rawHtml;
  let strategy = 'Browser Direct Extract';

  const adapters = useAdapters ? loadLocalScraperAdapters() : [];
  const matchedAdapter = effectiveUrl ? matchAdapterForUrl(effectiveUrl, adapters) : null;

  if (matchedAdapter && matchedAdapter.enabled) {
    try {
      const adpRes = await scrapeSingleWithAdapterInBrowser({
        url: effectiveUrl || undefined,
        rawHtml: hasRawHtml ? rawHtml : undefined,
        adapter: matchedAdapter,
      });
      if (adpRes.ok && adpRes.extracted) {
        const movie = buildAdvancedMovieRecordBrowser(
          adpRes.extracted,
          effectiveUrl || adpRes.extracted.sourceUrl || 'https://imported.local/movie'
        );
        return {
          movie,
          strategy: `Adapter (Browser/Worker): ${matchedAdapter.name} (v${matchedAdapter.version})`,
          sourceDuplicate: findSourceIndexDuplicateBrowser(
            movie.sourceUrl,
            movie.externalId,
            movie.imdbId
          ),
        };
      }
    } catch {
      // fall through to generic browser scraper
    }
  }

  if (!hasRawHtml) {
    let parsed: URL;
    try {
      parsed = new URL(cleanUrl);
    } catch {
      throw new Error('صيغة الرابط غير صالحة. يجب أن يبدأ بـ http:// أو https://');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHostBrowser(parsed.hostname)) {
      throw new Error('لا يُسمح بجلب الروابط الداخلية أو غير الصالحة.');
    }

    const res = await fetchViaBrowserOrCorsRelay(parsed.toString(), 12000);
    if (!res.ok || res.text.length < 80) {
      throw new Error(
        `الموقع المصدر رفض الوصول من المتصفح/البروكسي (HTTP ${res.status || 502}). جرّب تفعيل وضع "لصق HTML بديل".`
      );
    }
    effectiveUrl = res.finalUrl || parsed.toString();
    fetchedHtml = res.text;
    strategy = enrichExternal ? 'Browser + Worker Full Scrape' : 'Browser + Worker Fast Parse';
  } else {
    if (!effectiveUrl) {
      const canonical =
        fetchedHtml.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
        fetchedHtml.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        '';
      effectiveUrl = canonical || 'https://imported.local/movie';
    }
    strategy = 'Browser Raw HTML Parse';
  }

  const baseMedia = enrichExternal
    ? await scrapeFullItemInBrowser(effectiveUrl, fetchedHtml)
    : parseHtmlToMediaWithHintsBrowser(fetchedHtml, effectiveUrl).media;

  const movie = buildAdvancedMovieRecordBrowser(baseMedia, effectiveUrl);
  return {
    movie,
    strategy,
    sourceDuplicate: findSourceIndexDuplicateBrowser(
      movie.sourceUrl,
      movie.externalId,
      movie.imdbId
    ),
  };
}

// =========================================================================
// Mode 2: Browser + Cloudflare Worker Bulk Queue Engine
// =========================================================================
interface BrowserQueuedItem {
  seq: number;
  url: string;
  hintTitle?: string;
  hintPoster?: string;
  preExtracted?: ScrapedPayload;
}

interface BrowserJobRuntime {
  summary: ImporterJobSummary;
  queue: BrowserQueuedItem[];
  seenCanonicalUrls: Set<string>;
  records: ImporterJobResultRecord[];
  recordsBySeq: Map<number, ImporterJobResultRecord>;
  nextSeq: number;
  runningPromise: Promise<void> | null;
  lastRunStartedAt: number | null;
}

const browserJobsMap = new Map<string, BrowserJobRuntime>();
let browserJobsLoaded = false;

function persistBrowserSummaries() {
  try {
    const list = Array.from(browserJobsMap.values())
      .map((r) => r.summary)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 12);
    localStorage.setItem(STORAGE_BROWSER_JOBS, JSON.stringify(list));
  } catch {
    // ignore storage quota errors
  }
}

function loadPersistedBrowserSummaries() {
  if (browserJobsLoaded) return;
  browserJobsLoaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_BROWSER_JOBS);
    if (!raw) return;
    const arr = JSON.parse(raw) as ImporterJobSummary[];
    if (!Array.isArray(arr)) return;
    for (const summary of arr) {
      if (!summary?.id || browserJobsMap.has(summary.id)) continue;
      if (summary.status === 'running' || summary.status === 'discovering') {
        summary.status = 'paused';
        const reloadLog: ImporterJobLog = {
          id: `reload_${Date.now()}`,
          ts: Date.now(),
          level: 'warn',
          message: 'توقفت المهمة عند تحديث الصفحة — تم حفظ العناصر المجلوبة ويمكنك مراجعتها أو تصديرها.',
        };
        summary.logs = [reloadLog, ...(summary.logs || [])].slice(0, 120);
      }
      browserJobsMap.set(summary.id, {
        summary,
        queue: [],
        seenCanonicalUrls: new Set(),
        records: [],
        recordsBySeq: new Map(),
        nextSeq: 1,
        runningPromise: null,
        lastRunStartedAt: null,
      });
    }
  } catch {
    // ignore corrupt cache
  }
}

async function ensureJobRecordsLoaded(runtime: BrowserJobRuntime) {
  if (runtime.records.length > 0) return;
  const cached = await loadJobItemsFromIdb(runtime.summary.id);
  if (cached.length > 0 && runtime.records.length === 0) {
    runtime.records = cached;
    for (const r of cached) {
      runtime.recordsBySeq.set(r.seq, r);
      runtime.seenCanonicalUrls.add(canonicalizeSourceUrl(r.sourceUrl));
      if (r.seq >= runtime.nextSeq) runtime.nextSeq = r.seq + 1;
    }
    recomputeBrowserJobStats(runtime);
  }
}

function appendBrowserLog(
  runtime: BrowserJobRuntime,
  level: ImporterJobLog['level'],
  message: string,
  url?: string
) {
  runtime.summary.logs.unshift({
    id: `blog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    level,
    message: message.slice(0, 320),
    ...(url ? { url: url.slice(0, 260) } : {}),
  });
  if (runtime.summary.logs.length > 120) {
    runtime.summary.logs.length = 120;
  }
}

function recomputeBrowserJobStats(runtime: BrowserJobRuntime) {
  const s = runtime.summary.stats;
  let fetched = 0;
  let failed = 0;
  let duplicates = 0;
  let saved = 0;
  let excluded = 0;

  for (const rec of runtime.records) {
    if (rec.status === 'failed') {
      failed++;
    } else if (rec.status === 'duplicate') {
      duplicates++;
      fetched++;
    } else if (rec.status === 'saved') {
      saved++;
      fetched++;
    } else if (rec.status === 'excluded') {
      excluded++;
      fetched++;
    } else {
      fetched++;
    }
  }

  s.fetched = fetched;
  s.failed = failed;
  s.duplicates = duplicates;
  s.saved = saved;
  s.excluded = excluded;
  s.processed = runtime.records.length;
  s.queued = Math.max(0, runtime.queue.length);

  const totalTarget = Math.max(s.discovered, s.processed + s.queued);
  s.progressPercent =
    totalTarget > 0
      ? Math.min(100, Math.round((s.processed / totalTarget) * 1000) / 10)
      : runtime.summary.status === 'completed'
        ? 100
        : 0;

  let elapsed = s.activeElapsedMs;
  if (
    runtime.lastRunStartedAt &&
    (runtime.summary.status === 'running' || runtime.summary.status === 'discovering')
  ) {
    elapsed += Date.now() - runtime.lastRunStartedAt;
  }
  const elapsedSec = Math.max(1, elapsed / 1000);
  const itemsPerSec = s.processed / elapsedSec;
  s.itemsPerMinute = s.processed > 0 ? Math.round(itemsPerSec * 60 * 10) / 10 : 0;
  const remaining = Math.max(0, totalTarget - s.processed);
  s.etaSeconds =
    itemsPerSec > 0.01 && remaining > 0
      ? Math.round(remaining / itemsPerSec)
      : remaining === 0
        ? 0
        : null;
  runtime.summary.updatedAt = Date.now();
}

function enqueueBrowserUrl(
  runtime: BrowserJobRuntime,
  rawUrl: string,
  meta?: { hintTitle?: string; hintPoster?: string; preExtracted?: ScrapedPayload }
): boolean {
  if (runtime.seenCanonicalUrls.size >= runtime.summary.config.maxItems) return false;
  const canon = canonicalizeSourceUrl(rawUrl);
  if (!canon || runtime.seenCanonicalUrls.has(canon)) return false;

  runtime.seenCanonicalUrls.add(canon);
  runtime.queue.push({
    seq: runtime.nextSeq++,
    url: canon,
    ...(meta?.hintTitle ? { hintTitle: meta.hintTitle } : {}),
    ...(meta?.hintPoster ? { hintPoster: meta.hintPoster } : {}),
    ...(meta?.preExtracted ? { preExtracted: meta.preExtracted } : {}),
  });
  runtime.summary.stats.discovered = runtime.seenCanonicalUrls.size;
  runtime.summary.stats.queued = runtime.queue.length;
  return true;
}

async function discoverUrlsInBrowser(runtime: BrowserJobRuntime): Promise<void> {
  const { config } = runtime.summary;
  const origin = new URL(config.sourceUrl).origin;
  const maxItems = config.maxItems;
  const hasSectionUrls = config.sectionUrls.length > 0;
  const startUrls = hasSectionUrls ? config.sectionUrls : [config.sourceUrl];

  const runHtmlCrawl = async (seeds: string[], maxPagesBudget: number) => {
    const visitedPages = new Set<string>();
    const pageQueue = [...seeds];
    let added = 0;

    while (
      pageQueue.length > 0 &&
      visitedPages.size < maxPagesBudget &&
      runtime.seenCanonicalUrls.size < maxItems &&
      runtime.summary.status === 'discovering'
    ) {
      const pageUrl = pageQueue.shift()!;
      if (visitedPages.has(pageUrl)) continue;
      visitedPages.add(pageUrl);

      const res = await fetchViaBrowserOrCorsRelay(pageUrl, 12000).catch(() => null);
      if (!res || !res.ok || res.text.length < 100) {
        appendBrowserLog(
          runtime,
          'warn',
          `تعذر قراءة صفحة الاكتشاف (HTTP ${res?.status || 502})`,
          pageUrl
        );
        continue;
      }

      const extracted = extractListingLinksAndPaginationBrowser(res.text, res.finalUrl || pageUrl);
      if (extracted.siteTitle && visitedPages.size === 1) {
        runtime.summary.siteTitle = extracted.siteTitle.slice(0, 80);
      }

      for (const card of extracted.cards) {
        if (enqueueBrowserUrl(runtime, card.url, { hintTitle: card.title, hintPoster: card.poster })) {
          added++;
        }
      }

      for (const nextUrl of extracted.nextUrls) {
        if (!visitedPages.has(nextUrl) && !pageQueue.includes(nextUrl)) {
          pageQueue.push(nextUrl);
        }
      }

      recomputeBrowserJobStats(runtime);
      persistBrowserSummaries();
    }
    return added;
  };

  if (config.discoveryMode === 'html') {
    runtime.summary.discoveryStrategy = 'Browser HTML + Pagination';
    await runHtmlCrawl(startUrls, Math.min(250, Math.max(8, Math.ceil(maxItems / 12))));
    return;
  }

  if (config.discoveryMode === 'api') {
    runtime.summary.discoveryStrategy = 'Browser WordPress / Blogger API';
    const blogger = await tryBloggerFeedBrowser(origin, Math.min(maxItems, 500));
    if (blogger && blogger.items.length > 0) {
      runtime.summary.siteTitle = blogger.siteTitle || runtime.summary.siteTitle;
      for (const it of blogger.items) {
        enqueueBrowserUrl(runtime, it.sourceUrl || origin, {
          hintTitle: it.title,
          hintPoster: it.poster,
          preExtracted: it,
        });
      }
      return;
    }
    const wp = await tryWordPressApiBrowser(origin, Math.min(maxItems, 100));
    if (wp && wp.items.length > 0) {
      runtime.summary.siteTitle = wp.siteTitle || runtime.summary.siteTitle;
      for (const it of wp.items) {
        enqueueBrowserUrl(runtime, it.sourceUrl || origin, {
          hintTitle: it.title,
          hintPoster: it.poster,
          preExtracted: it,
        });
      }
    }
    return;
  }

  if (config.discoveryMode === 'sitemap') {
    runtime.summary.discoveryStrategy = 'Browser XML Sitemap';
    const smUrls = await trySitemapDiscoveryBrowser(origin, maxItems);
    for (const u of smUrls) {
      enqueueBrowserUrl(runtime, u);
    }
    return;
  }

  // 'auto': If sectionUrls are specified, crawl them via HTML + Pagination FIRST!
  if (hasSectionUrls) {
    runtime.summary.discoveryStrategy = 'Browser Auto (Sections HTML + Pagination)';
    const fromSections = await runHtmlCrawl(
      startUrls,
      Math.min(200, Math.max(10, Math.ceil(maxItems / 12)))
    );
    if (fromSections > 0) return;
  }

  // Try Blogger -> WordPress API -> Root HTML -> Sitemap
  const blogger = await tryBloggerFeedBrowser(origin, Math.min(maxItems, 200));
  if (blogger && blogger.items.length > 0) {
    runtime.summary.discoveryStrategy = 'Browser Auto (Blogger Feed)';
    runtime.summary.siteTitle = blogger.siteTitle || runtime.summary.siteTitle;
    for (const it of blogger.items) {
      enqueueBrowserUrl(runtime, it.sourceUrl || origin, {
        hintTitle: it.title,
        hintPoster: it.poster,
        preExtracted: it,
      });
    }
    return;
  }

  const fromRootHtml = await runHtmlCrawl(
    [config.sourceUrl],
    Math.min(120, Math.max(6, Math.ceil(maxItems / 15)))
  );
  if (fromRootHtml > 0) {
    runtime.summary.discoveryStrategy = 'Browser Auto (HTML + Pagination)';
  }

  if (runtime.seenCanonicalUrls.size < maxItems) {
    const wp = await tryWordPressApiBrowser(origin, Math.min(maxItems - runtime.seenCanonicalUrls.size, 50));
    if (wp && wp.items.length > 0) {
      runtime.summary.discoveryStrategy = 'Browser Auto (WordPress API + HTML)';
      for (const it of wp.items) {
        enqueueBrowserUrl(runtime, it.sourceUrl || origin, {
          hintTitle: it.title,
          hintPoster: it.poster,
          preExtracted: it,
        });
      }
    }
  }

  if (runtime.seenCanonicalUrls.size === 0) {
    const smUrls = await trySitemapDiscoveryBrowser(origin, maxItems);
    if (smUrls.length > 0) {
      runtime.summary.discoveryStrategy = 'Browser Auto (XML Sitemap)';
      for (const u of smUrls) {
        if (isLikelyContentUrl(u, [origin])) {
          enqueueBrowserUrl(runtime, u);
        }
      }
    }
  }
}

async function runBrowserJobPipeline(runtime: BrowserJobRuntime): Promise<void> {
  const { config } = runtime.summary;
  runtime.lastRunStartedAt = Date.now();
  const adapters = config.useAdapters ? loadLocalScraperAdapters() : [];

  try {
    if (runtime.summary.discoveryPhase !== 'done') {
      runtime.summary.status = 'discovering';
      runtime.summary.discoveryPhase = 'scanning';
      appendBrowserLog(
        runtime,
        'info',
        `بدء اكتشاف الروابط عبر محرك المتصفح + Cloudflare Worker (${config.discoveryMode})...`,
        config.sourceUrl
      );
      persistBrowserSummaries();

      await discoverUrlsInBrowser(runtime);

      if (runtime.summary.status !== 'discovering') {
        recomputeBrowserJobStats(runtime);
        persistBrowserSummaries();
        return;
      }

      runtime.summary.discoveryPhase = 'done';
      appendBrowserLog(
        runtime,
        runtime.summary.stats.discovered > 0 ? 'success' : 'warn',
        `اكتمل الاكتشاف: تم العثور على ${runtime.summary.stats.discovered} رابط.`
      );
      recomputeBrowserJobStats(runtime);
      persistBrowserSummaries();
    }

    if (runtime.summary.stats.discovered === 0 && runtime.queue.length === 0) {
      runtime.summary.status = 'error';
      runtime.summary.error =
        'لم يتم اكتشاف أي روابط أفلام من الموقع المصدر عبر الوضع المحدد (قد يكون محمياً بـ Cloudflare Turnstile أو يحتاج ربط Worker مخصص في الإعدادات).';
      runtime.summary.finishedAt = Date.now();
      recomputeBrowserJobStats(runtime);
      persistBrowserSummaries();
      return;
    }

    runtime.summary.status = 'running';
    recomputeBrowserJobStats(runtime);
    persistBrowserSummaries();

    const concurrency = Math.min(8, Math.max(1, config.concurrency || 4));
    const delayMs = Math.min(5000, Math.max(0, config.delayMs || 120));

    const recordResult = (rec: ImporterJobResultRecord) => {
      const idx = runtime.records.findIndex((r) => r.seq === rec.seq);
      if (idx >= 0) runtime.records[idx] = rec;
      else runtime.records.push(rec);
      runtime.recordsBySeq.set(rec.seq, rec);
    };

    const processOne = async (item: BrowserQueuedItem) => {
      if (runtime.summary.status !== 'running') return;
      try {
        let movie: AdvancedImportedMovie | null = null;

        if (item.preExtracted && !config.enrichExternalMetadata) {
          movie = buildAdvancedMovieRecordBrowser(item.preExtracted, item.url);
        } else {
          const matchedAdapter = config.useAdapters
            ? matchAdapterForUrl(item.url, adapters)
            : null;
          if (matchedAdapter && matchedAdapter.enabled) {
            try {
              const adpRes = await scrapeSingleWithAdapterInBrowser({
                url: item.url,
                adapter: matchedAdapter,
              });
              if (adpRes.ok && adpRes.extracted) {
                movie = buildAdvancedMovieRecordBrowser(adpRes.extracted, item.url);
              }
            } catch {
              // fall back to generic scrape
            }
          }

          if (!movie) {
            const fetched = await fetchViaBrowserOrCorsRelay(item.url, 12000);
            if (fetched.ok && fetched.text.length >= 80) {
              const baseMedia = config.enrichExternalMetadata
                ? await scrapeFullItemInBrowser(item.url, fetched.text)
                : parseHtmlToMediaWithHintsBrowser(fetched.text, item.url).media;
              movie = buildAdvancedMovieRecordBrowser(baseMedia, fetched.finalUrl || item.url);
            } else if (item.preExtracted) {
              movie = buildAdvancedMovieRecordBrowser(item.preExtracted, item.url);
            } else {
              recordResult({
                seq: item.seq,
                itemKey: `seq_${item.seq}`,
                sourceUrl: item.url,
                status: 'failed',
                error: `تعذر جلب الصفحة (HTTP ${fetched.status || 502})`,
                fetchedAt: Date.now(),
              });
              appendBrowserLog(
                runtime,
                'error',
                `فشل جلب ${item.hintTitle || item.url} (HTTP ${fetched.status || 502})`,
                item.url
              );
              return;
            }
          }
        }

        if (item.hintPoster && !movie.poster) {
          movie.poster = upgradeKnownImageUrlScraper(item.hintPoster);
          movie.poster_url = movie.poster;
        }
        if (item.hintTitle && (!movie.title || movie.title === 'فيلم مستورد')) {
          movie.title = item.hintTitle;
        }
        if (config.targetCategory && !movie.categories.includes(config.targetCategory)) {
          movie.categories = [config.targetCategory, ...movie.categories].slice(0, 10);
        }

        const dup = findSourceIndexDuplicateBrowser(movie.sourceUrl, movie.externalId, movie.imdbId);
        const status: ImporterJobItemStatus =
          dup && config.duplicateMode === 'skip' ? 'duplicate' : 'ready';

        recordResult({
          seq: item.seq,
          itemKey: movie.id,
          sourceUrl: movie.sourceUrl,
          status,
          ...(dup
            ? {
                duplicateMatchId: dup.mediaId,
                duplicateReason: `تطابق مع عنصر محفوظ مسبقاً (${dup.title})`,
              }
            : {}),
          fetchedAt: Date.now(),
          movie,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'خطأ غير متوقع أثناء الجلب';
        recordResult({
          seq: item.seq,
          itemKey: `seq_${item.seq}`,
          sourceUrl: item.url,
          status: 'failed',
          error: msg,
          fetchedAt: Date.now(),
        });
        appendBrowserLog(runtime, 'error', `خطأ في ${item.url}: ${msg}`, item.url);
      }
    };

    let processedSinceFlush = 0;
    const workers = Array.from({ length: concurrency }, async (_, wIdx) => {
      if (delayMs > 0 && wIdx > 0) {
        await new Promise((r) => setTimeout(r, Math.min(delayMs, wIdx * 40)));
      }
      while (runtime.summary.status === 'running') {
        const nextItem = runtime.queue.shift();
        if (!nextItem) break;
        await processOne(nextItem);
        processedSinceFlush++;
        recomputeBrowserJobStats(runtime);
        if (processedSinceFlush % 4 === 0) {
          persistBrowserSummaries();
          void saveJobItemsToIdb(runtime.summary.id, runtime.records);
        }
        if (delayMs > 0 && runtime.summary.status === 'running' && runtime.queue.length > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    });

    await Promise.all(workers);

    if (runtime.lastRunStartedAt) {
      runtime.summary.stats.activeElapsedMs += Date.now() - runtime.lastRunStartedAt;
      runtime.lastRunStartedAt = null;
    }

    if (runtime.summary.status === 'running' && runtime.queue.length === 0) {
      runtime.summary.status = 'completed';
      runtime.summary.finishedAt = Date.now();
      appendBrowserLog(
        runtime,
        'success',
        `اكتملت المهمة: تم جلب ${runtime.summary.stats.fetched} عنصر (فاشل: ${runtime.summary.stats.failed}، مكرر: ${runtime.summary.stats.duplicates}).`
      );
    }
    recomputeBrowserJobStats(runtime);
    persistBrowserSummaries();
    await saveJobItemsToIdb(runtime.summary.id, runtime.records);
  } catch (err) {
    if (runtime.lastRunStartedAt) {
      runtime.summary.stats.activeElapsedMs += Date.now() - runtime.lastRunStartedAt;
      runtime.lastRunStartedAt = null;
    }
    runtime.summary.status = 'error';
    runtime.summary.error = err instanceof Error ? err.message : 'فشل تشغيل مهمة الاستيراد';
    appendBrowserLog(runtime, 'error', runtime.summary.error);
    recomputeBrowserJobStats(runtime);
    persistBrowserSummaries();
  } finally {
    runtime.runningPromise = null;
  }
}

export function listImporterJobsBrowser(): ImporterJobSummary[] {
  loadPersistedBrowserSummaries();
  return Array.from(browserJobsMap.values())
    .map((r) => {
      recomputeBrowserJobStats(r);
      return { ...r.summary, stats: { ...r.summary.stats }, logs: [...r.summary.logs] };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function startBulkImporterJobBrowser(
  rawConfig: ImporterJobConfig
): Promise<ImporterJobSummary> {
  loadPersistedBrowserSummaries();

  let parsedSource: URL;
  try {
    parsedSource = new URL(cleanStr(rawConfig.sourceUrl));
  } catch {
    throw new Error('صيغة رابط الموقع غير صالحة. يجب أن يبدأ بـ http:// أو https://');
  }
  if (!['http:', 'https:'].includes(parsedSource.protocol) || isBlockedHostBrowser(parsedSource.hostname)) {
    throw new Error('رابط الموقع غير مسموح به أو غير صالح.');
  }

  const sectionUrls: string[] = [];
  for (const s of (rawConfig.sectionUrls || []).slice(0, 25)) {
    try {
      const u = new URL(cleanStr(s));
      if (['http:', 'https:'].includes(u.protocol) && !isBlockedHostBrowser(u.hostname)) {
        sectionUrls.push(u.toString());
      }
    } catch {
      // ignore invalid section line
    }
  }

  const config: ImporterJobConfig = {
    sourceUrl: parsedSource.toString(),
    sectionUrls,
    discoveryMode: rawConfig.discoveryMode || 'auto',
    maxItems: Math.min(50000, Math.max(1, Number(rawConfig.maxItems) || 100)),
    concurrency: Math.min(12, Math.max(1, Number(rawConfig.concurrency) || 4)),
    delayMs: Math.min(5000, Math.max(0, Number(rawConfig.delayMs ?? 120))),
    batchSize: Math.min(100, Math.max(5, Number(rawConfig.batchSize) || 25)),
    duplicateMode: rawConfig.duplicateMode === 'update' ? 'update' : 'skip',
    targetCategory: cleanStr(rawConfig.targetCategory),
    useAdapters: rawConfig.useAdapters !== false,
    enrichExternalMetadata: Boolean(rawConfig.enrichExternalMetadata),
  };

  const jobId = `bimp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();
  const summary: ImporterJobSummary = {
    id: jobId,
    siteTitle: parsedSource.hostname.replace(/^www\./, ''),
    sourceUrl: config.sourceUrl,
    discoveryStrategy: `${config.discoveryMode.toUpperCase()} (Browser/Worker)`,
    status: 'discovering',
    discoveryPhase: 'pending',
    config,
    stats: {
      discovered: 0,
      queued: 0,
      processed: 0,
      fetched: 0,
      saved: 0,
      failed: 0,
      duplicates: 0,
      excluded: 0,
      activeElapsedMs: 0,
      itemsPerMinute: 0,
      etaSeconds: null,
      progressPercent: 0,
    },
    createdAt: now,
    updatedAt: now,
    logs: [],
  };

  const runtime: BrowserJobRuntime = {
    summary,
    queue: [],
    seenCanonicalUrls: new Set(),
    records: [],
    recordsBySeq: new Map(),
    nextSeq: 1,
    runningPromise: null,
    lastRunStartedAt: null,
  };

  browserJobsMap.set(jobId, runtime);
  persistBrowserSummaries();
  runtime.runningPromise = runBrowserJobPipeline(runtime);

  return { ...summary, stats: { ...summary.stats }, logs: [...summary.logs] };
}

export async function getImporterJobBrowser(jobId: string): Promise<ImporterJobSummary> {
  loadPersistedBrowserSummaries();
  const runtime = browserJobsMap.get(jobId);
  if (!runtime) {
    throw new Error('لم يتم العثور على المهمة.');
  }
  await ensureJobRecordsLoaded(runtime);
  recomputeBrowserJobStats(runtime);
  return {
    ...runtime.summary,
    stats: { ...runtime.summary.stats },
    logs: [...runtime.summary.logs],
  };
}

export async function controlImporterJobBrowser(
  jobId: string,
  action: 'pause' | 'resume' | 'cancel' | 'retry-failed',
  extraBody?: Record<string, unknown>
): Promise<ImporterJobSummary> {
  loadPersistedBrowserSummaries();
  const runtime = browserJobsMap.get(jobId);
  if (!runtime) throw new Error('لم يتم العثور على المهمة.');
  await ensureJobRecordsLoaded(runtime);

  if (action === 'pause') {
    if (runtime.lastRunStartedAt) {
      runtime.summary.stats.activeElapsedMs += Date.now() - runtime.lastRunStartedAt;
      runtime.lastRunStartedAt = null;
    }
    runtime.summary.status = 'paused';
    appendBrowserLog(runtime, 'warn', 'تم إيقاف المهمة مؤقتاً بناءً على طلب المسؤول.');
  } else if (action === 'cancel') {
    if (runtime.lastRunStartedAt) {
      runtime.summary.stats.activeElapsedMs += Date.now() - runtime.lastRunStartedAt;
      runtime.lastRunStartedAt = null;
    }
    runtime.summary.status = 'cancelled';
    runtime.summary.finishedAt = Date.now();
    appendBrowserLog(runtime, 'warn', 'تم إلغاء المهمة.');
  } else if (action === 'resume') {
    if (runtime.queue.length === 0 && runtime.summary.discoveryPhase === 'done') {
      runtime.summary.status = 'completed';
    } else if (!runtime.runningPromise) {
      runtime.summary.status = runtime.summary.discoveryPhase === 'done' ? 'running' : 'discovering';
      appendBrowserLog(runtime, 'info', 'استئناف المهمة...');
      runtime.runningPromise = runBrowserJobPipeline(runtime);
    }
  } else if (action === 'retry-failed') {
    const requestedSeqs = Array.isArray(extraBody?.seqs) ? new Set(extraBody.seqs as number[]) : null;
    const toRetry = runtime.records.filter(
      (r) => r.status === 'failed' && (!requestedSeqs || requestedSeqs.has(r.seq))
    );
    for (const r of toRetry) {
      runtime.queue.push({ seq: r.seq, url: r.sourceUrl });
    }
    runtime.records = runtime.records.filter(
      (r) => !(r.status === 'failed' && (!requestedSeqs || requestedSeqs.has(r.seq)))
    );
    for (const r of toRetry) runtime.recordsBySeq.delete(r.seq);
    if (toRetry.length > 0 && !runtime.runningPromise) {
      runtime.summary.status = 'running';
      appendBrowserLog(runtime, 'info', `إعادة محاولة ${toRetry.length} عنصر فاشل.`);
      runtime.runningPromise = runBrowserJobPipeline(runtime);
    }
  }

  recomputeBrowserJobStats(runtime);
  persistBrowserSummaries();
  return {
    ...runtime.summary,
    stats: { ...runtime.summary.stats },
    logs: [...runtime.summary.logs],
  };
}

export async function deleteImporterJobBrowser(jobId: string): Promise<void> {
  loadPersistedBrowserSummaries();
  const runtime = browserJobsMap.get(jobId);
  if (runtime) {
    runtime.summary.status = 'cancelled';
    runtime.queue = [];
    browserJobsMap.delete(jobId);
  }
  persistBrowserSummaries();
  await deleteJobItemsFromIdb(jobId);
}

export async function getPaginatedJobItemsBrowser(params: {
  jobId: string;
  page: number;
  pageSize: number;
  status: 'all' | ImporterJobItemStatus;
  search: string;
}): Promise<ImporterPaginatedItemsResponse> {
  loadPersistedBrowserSummaries();
  const runtime = browserJobsMap.get(params.jobId);
  if (!runtime) throw new Error('لم يتم العثور على نتائج المهمة.');
  await ensureJobRecordsLoaded(runtime);

  const counts = {
    all: runtime.records.length,
    ready: 0,
    duplicate: 0,
    failed: 0,
    saved: 0,
    excluded: 0,
  };
  for (const r of runtime.records) {
    counts[r.status]++;
  }

  const searchLower = cleanStr(params.search).toLowerCase();
  const filtered = runtime.records.filter((r) => {
    if (params.status !== 'all' && r.status !== params.status) return false;
    if (!searchLower) return true;
    return (
      r.sourceUrl.toLowerCase().includes(searchLower) ||
      (r.movie?.title || '').toLowerCase().includes(searchLower) ||
      (r.movie?.englishTitle || '').toLowerCase().includes(searchLower) ||
      (r.movie?.year || '').includes(searchLower)
    );
  });

  const sorted = [...filtered].sort((a, b) => b.seq - a.seq);
  const pageSize = Math.min(100, Math.max(5, params.pageSize || 25));
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, params.page || 1));
  const start = (page - 1) * pageSize;

  return {
    ok: true,
    jobId: params.jobId,
    page,
    pageSize,
    totalFiltered: sorted.length,
    totalPages,
    counts,
    items: sorted.slice(start, start + pageSize),
  };
}

export async function updateJobItemsStatusBrowser(
  jobId: string,
  updates: Array<{ seq: number; status: ImporterJobItemStatus; savedMediaId?: string }>
): Promise<ImporterJobSummary | null> {
  loadPersistedBrowserSummaries();
  const runtime = browserJobsMap.get(jobId);
  if (!runtime) return null;
  await ensureJobRecordsLoaded(runtime);

  for (const u of updates) {
    const rec = runtime.recordsBySeq.get(u.seq);
    if (rec) {
      rec.status = u.status;
      if (u.savedMediaId) rec.savedMediaId = u.savedMediaId;
    }
  }
  recomputeBrowserJobStats(runtime);
  persistBrowserSummaries();
  await saveJobItemsToIdb(jobId, runtime.records);
  return {
    ...runtime.summary,
    stats: { ...runtime.summary.stats },
    logs: [...runtime.summary.logs],
  };
}

export async function downloadJobExportBrowser(params: {
  jobId: string;
  format: 'json' | 'csv';
  statusFilter?: string;
}): Promise<void> {
  loadPersistedBrowserSummaries();
  const runtime = browserJobsMap.get(params.jobId);
  if (!runtime) throw new Error('لم يتم العثور على المهمة للتصدير.');
  await ensureJobRecordsLoaded(runtime);

  const filter = params.statusFilter || 'all';
  const rows = runtime.records.filter((r) => filter === 'all' || r.status === filter);

  let content = '';
  let mime = 'application/json;charset=utf-8';
  if (params.format === 'json') {
    content = JSON.stringify(rows, null, 2);
  } else {
    mime = 'text/csv;charset=utf-8';
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'seq',
      'status',
      'sourceUrl',
      'title',
      'englishTitle',
      'year',
      'kind',
      'imdb',
      'quality',
      'poster',
      'serversCount',
      'downloadsCount',
      'error',
    ].join(',');
    const lines = rows.map((r) =>
      [
        r.seq,
        r.status,
        r.sourceUrl,
        r.movie?.title || '',
        r.movie?.englishTitle || '',
        r.movie?.year || '',
        r.movie?.kind || '',
        r.movie?.imdb ?? '',
        r.movie?.quality || '',
        r.movie?.poster || '',
        r.movie?.servers?.length ?? 0,
        r.movie?.downloads?.length ?? 0,
        r.error || '',
      ]
        .map(esc)
        .join(',')
    );
    content = `\uFEFF${header}\n${lines.join('\n')}\n`;
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rahaltv-importer-${params.jobId}.${params.format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
