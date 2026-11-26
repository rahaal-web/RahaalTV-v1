import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import type {
  AdapterContentTypeHint,
  AdapterDiagnosticCode,
  AdapterStatus,
  AdapterVerifyMode,
  DiscoveredApiEndpoint,
  FailedServerReport,
  MissingEpisodeReport,
  ScrapedAdapterPreviewMedia,
  ScraperAdapter,
  ScraperComparisonDiff,
  ScraperDiagnosticIssue,
  ScraperSiteAnalysisReport,
  ScraperTestResult,
  SiteStructureSignals,
  TestedEpisodeReport,
} from '../src/types/scraperAdapter.ts';
import {
  matchAdapterForUrl,
  normalizeAdapterDomain,
  normalizeScraperAdapter,
} from '../src/lib/scraperAdapterUtils.ts';

const ADAPTER_CACHE_FILE = path.resolve(process.cwd(), '.rahaltv-adapters.json');

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
  'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
};

const IGNORED_AD_OR_SOCIAL_HOSTS =
  /(facebook\.com|twitter\.com|x\.com|t\.me|telegram\.me|instagram\.com|pinterest\.com|linkedin\.com|whatsapp\.com|tiktok\.com|googlesyndication\.com|doubleclick\.net|googletagmanager\.com|google-analytics\.com|adservice\.google|yandex\.ru|histats\.com|addthis\.com|sharethis\.com|disqus\.com|cloudflareinsights\.com|popads\.net|propellerads|adsterra|juicyads|exoclick|chaturbate)/i;

const IGNORED_PAGE_CONTAINER_SELECTOR =
  'header, nav, footer, .navbar, .ads, .banner, .pm-ads-banner, .ad-box, .trailer, #trailer';

// ----------------- Security: SSRF Protection -----------------

export function isBlockedHostEnhanced(hostname: string): boolean {
  const h = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '::' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.startsWith('10.') ||
    h.startsWith('127.') ||
    h.startsWith('192.168.') ||
    h.startsWith('169.254.') ||
    h.startsWith('fe80:') ||
    h.startsWith('fc00:') ||
    h.startsWith('fd00:')
  ) {
    return true;
  }
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (/^::ffff:(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) {
    return true;
  }
  return false;
}

// ----------------- Per-Domain Rate Limiter -----------------

interface DomainRateBucket {
  lastRequestMs: number;
  windowStartMs: number;
  windowCount: number;
}

class DomainRateLimiter {
  private buckets = new Map<string, DomainRateBucket>();
  private readonly maxPerMinute: number;

  constructor(maxPerMinute = 48) {
    this.maxPerMinute = maxPerMinute;
  }

  async waitForSlot(url: string, minDelayMs = 200): Promise<{ allowed: boolean; reason?: string }> {
    let host = '';
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return { allowed: false, reason: 'رابط غير صالح' };
    }
    if (isBlockedHostEnhanced(host)) {
      return { allowed: false, reason: 'لا يُسمح بالاتصال بالنطاقات الداخلية أو المحلية (SSRF guard)' };
    }

    const safeDelay = Math.min(2000, Math.max(0, Math.round(minDelayMs)));
    const now = Date.now();
    const bucket = this.buckets.get(host) || {
      lastRequestMs: 0,
      windowStartMs: now,
      windowCount: 0,
    };

    if (now - bucket.windowStartMs > 60_000) {
      bucket.windowStartMs = now;
      bucket.windowCount = 0;
    }

    if (bucket.windowCount >= this.maxPerMinute) {
      return {
        allowed: false,
        reason: `تم تجاوز الحد الآمن للطلبات على النطاق ${host} (${this.maxPerMinute} طلب/دقيقة). انتظر دقيقة ثم أعد المحاولة.`,
      };
    }

    const elapsed = now - bucket.lastRequestMs;
    if (safeDelay > 0 && elapsed < safeDelay && bucket.lastRequestMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, safeDelay - elapsed));
    }

    bucket.lastRequestMs = Date.now();
    bucket.windowCount += 1;
    this.buckets.set(host, bucket);
    return { allowed: true };
  }
}

export const domainRateLimiter = new DomainRateLimiter(60);

// ----------------- Persistent Backend Cache Registry -----------------

let cachedAdapters: ScraperAdapter[] = [];
let cacheLoaded = false;

export function loadCachedAdaptersFromDisk(): ScraperAdapter[] {
  if (cacheLoaded) return cachedAdapters;
  cacheLoaded = true;
  try {
    if (fs.existsSync(ADAPTER_CACHE_FILE)) {
      const raw = fs.readFileSync(ADAPTER_CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        cachedAdapters = parsed.map((a) => normalizeScraperAdapter(a as Partial<ScraperAdapter>));
      }
    }
  } catch {
    cachedAdapters = [];
  }
  return cachedAdapters;
}

export function syncCachedAdapters(adapters: Partial<ScraperAdapter>[]): ScraperAdapter[] {
  const normalized = adapters
    .filter((a) => a && (a.domain || a.sampleUrl || a.id))
    .slice(0, 150)
    .map((a) => normalizeScraperAdapter(a));
  cachedAdapters = normalized;
  cacheLoaded = true;
  try {
    fs.writeFileSync(ADAPTER_CACHE_FILE, JSON.stringify(normalized, null, 2), 'utf-8');
  } catch {
    // Non-fatal in read-only runtimes
  }
  return cachedAdapters;
}

export function getCachedAdapters(): ScraperAdapter[] {
  return loadCachedAdaptersFromDisk();
}

export function resolveActiveAdapterForUrl(
  targetUrl: string,
  explicitAdapter?: Partial<ScraperAdapter> | null
): ScraperAdapter | null {
  if (explicitAdapter && (explicitAdapter.domain || explicitAdapter.id)) {
    const clean = normalizeScraperAdapter(explicitAdapter);
    return clean.enabled ? clean : null;
  }
  const adapters = loadCachedAdaptersFromDisk();
  return matchAdapterForUrl(targetUrl, adapters, { includeDisabled: false });
}

// ----------------- Text & URL Utilities -----------------

function cleanText(val: string | undefined | null): string {
  return String(val || '').replace(/\s+/g, ' ').trim();
}

function normalizeArabicDigits(text: string): string {
  return String(text || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

function resolveUrl(baseUrl: string, maybeRelative: string | undefined | null): string {
  if (!maybeRelative) return '';
  const trimmed = String(maybeRelative).trim();
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:')
  ) {
    return '';
  }
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!baseUrl) return '';
  try {
    const resolved = new URL(trimmed, baseUrl).toString();
    if (new URL(resolved).hostname === 'example.com') return '';
    return resolved;
  } catch {
    return '';
  }
}

function canonicalizeCompareUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl.trim());
    u.hash = '';
    return u.toString().replace(/\/+$/, '');
  } catch {
    return String(rawUrl || '').trim().replace(/\/+$/, '');
  }
}

function isYoutubeUrl(rawUrl: string): boolean {
  return /(?:^https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/|youtu\.be\/|youtube-nocookie\.com\/)/i.test(
    rawUrl
  );
}

function isLikelyNonVideoWebsiteUrl(rawUrl: string, sourceOrigin?: string): boolean {
  try {
    const u = new URL(rawUrl.trim());
    if (!['http:', 'https:'].includes(u.protocol)) return true;
    const host = u.hostname.toLowerCase();
    if (isBlockedHostEnhanced(host)) return true;
    if (IGNORED_AD_OR_SOCIAL_HOSTS.test(host)) return true;
    const p = u.pathname.toLowerCase();
    if (p === '' || p === '/') return true;
    if (/^\/(login|register|signup|contact|about|privacy|terms|search|category|tag|actor)(\/|$)/i.test(p)) {
      return true;
    }
    if (sourceOrigin) {
      const sHost = new URL(sourceOrigin).hostname.toLowerCase();
      if (host === sHost && !/\.(mp4|m3u8|webm|ogg)(\?|$)/i.test(p) && !/embed|player|play\.php/i.test(rawUrl)) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

function decodeMaybeBase64(val: string): string {
  const trimmed = String(val || '').trim();
  if (/^(https?:)?\/\//i.test(trimmed) || /<iframe/i.test(trimmed)) return trimmed;
  if (/^[A-Za-z0-9+/=]{16,}$/.test(trimmed)) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf-8').trim();
      if (/https?:\/\/|<iframe/i.test(decoded)) return decoded;
    } catch {
      // Ignore
    }
  }
  return trimmed;
}

// ----------------- Protection / Fetch -----------------

export function detectProtectionChallenge(
  status: number,
  html: string,
  headers?: Headers | Record<string, string>
): { isProtected: boolean; reason?: string } {
  const getHeader = (name: string): string => {
    if (!headers) return '';
    if (typeof (headers as Headers).get === 'function') {
      return ((headers as Headers).get(name) || '').toLowerCase();
    }
    const rec = headers as Record<string, string>;
    return String(rec[name] || rec[name.toLowerCase()] || '').toLowerCase();
  };

  const cfMitigated = getHeader('cf-mitigated');
  if (cfMitigated === 'challenge') {
    return {
      isProtected: true,
      reason: 'الموقع فعّل تحدي Cloudflare Challenge (cf-mitigated) — لا يمكن تجاوز التحقق تلقائياً.',
    };
  }

  const headSlice = html.slice(0, 12000);
  if (
    /<title>\s*(?:Just a moment|Attention Required|Cloudflare|Access Denied|Checking your browser)/i.test(
      headSlice
    ) ||
    /challenge-platform|cf-turnstile|g-recaptcha|hcaptcha\.com\/1\/api/i.test(headSlice)
  ) {
    return {
      isProtected: true,
      reason: 'الصفحة تحتوي على تحقق بشري (Cloudflare Turnstile / CAPTCHA) — يمكن لصق سورس الصفحة يدوياً لتحليل بنيتها.',
    };
  }

  if (status === 401 || status === 403) {
    if (/login|sign\s*in|تسجيل الدخول/i.test(headSlice) && /<input[^>]+type=["']password["']/i.test(headSlice)) {
      return {
        isProtected: true,
        reason: `الموقع يطلب تسجيل دخول (HTTP ${status}) — لا يتم تجاوز صفحات تسجيل الدخول.`,
      };
    }
    return {
      isProtected: true,
      reason: `رفض الموقع الوصول للسيرفر برمز حالة HTTP ${status} (حماية WAF/جدار حماية).`,
    };
  }

  if (/widevine|fairplay|playready|eme.*requestMediaKeySystemAccess/i.test(html.slice(0, 35000))) {
    return {
      isProtected: true,
      reason: 'المحتوى محمي بنظام DRM (Widevine/FairPlay) — لا يتم كسر أو تجاوز حماية DRM.',
    };
  }

  return { isProtected: false };
}

export async function safeFetchRemoteText(
  targetUrl: string,
  options?: {
    timeoutMs?: number;
    referer?: string;
    delayMs?: number;
  }
): Promise<{
  ok: boolean;
  status: number;
  finalUrl: string;
  text: string;
  contentType: string;
  isProtected: boolean;
  errorReason?: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return {
      ok: false,
      status: 0,
      finalUrl: targetUrl,
      text: '',
      contentType: '',
      isProtected: false,
      errorReason: 'صيغة الرابط غير صحيحة.',
    };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return {
      ok: false,
      status: 0,
      finalUrl: targetUrl,
      text: '',
      contentType: '',
      isProtected: false,
      errorReason: 'البروتوكول المسموح HTTP أو HTTPS فقط.',
    };
  }

  const slot = await domainRateLimiter.waitForSlot(targetUrl, options?.delayMs ?? 200);
  if (!slot.allowed) {
    return {
      ok: false,
      status: 429,
      finalUrl: targetUrl,
      text: '',
      contentType: '',
      isProtected: true,
      errorReason: slot.reason,
    };
  }

  const timeoutMs = options?.timeoutMs ?? 12000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const reqHeaders: Record<string, string> = { ...FETCH_HEADERS };
    if (options?.referer) reqHeaders.Referer = options.referer;

    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: reqHeaders,
    });
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    const prot = detectProtectionChallenge(response.status, text, response.headers);

    return {
      ok: response.ok && !prot.isProtected,
      status: response.status,
      finalUrl: response.url || targetUrl,
      text,
      contentType,
      isProtected: prot.isProtected,
      errorReason: prot.reason || (!response.ok ? `استجاب الخادم برمز HTTP ${response.status}` : undefined),
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      finalUrl: targetUrl,
      text: '',
      contentType: '',
      isProtected: false,
      errorReason: isAbort
        ? `انتهت مهلة الاتصال بالخادم (${Math.round(timeoutMs / 1000)} ثوانٍ)`
        : `تعذر الاتصال بالخادم: ${err instanceof Error ? err.message : 'خطأ شبكة'}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ----------------- Baseline Scraper Function Type -----------------

export interface BaselineScrapedMedia {
  title: string;
  englishTitle: string;
  kind: 'movie' | 'series' | 'tv' | 'wrestling';
  categories: string[];
  genres: string[];
  year: string;
  country: string;
  language: string;
  quality: string;
  duration: string;
  imdb: number;
  poster: string;
  backdrop: string;
  poster_url?: string;
  backdrop_url?: string;
  story: string;
  sourceUrl: string;
  imdbId?: string;
  trailerUrl: string;
  cast: { name: string; role: string; initials: string }[];
  servers: {
    id: string;
    name: string;
    mode: 'url' | 'embed';
    url: string;
    embedCode: string;
    quality: string;
    speed: string;
    tag: string;
  }[];
  downloads: {
    id: string;
    host: string;
    quality: string;
    size: string;
    format: string;
    url: string;
  }[];
  seasons: {
    seasonNumber: number;
    label: string;
    year: string;
    episodes: {
      number: number;
      title: string;
      duration: string;
      quality: string;
      watchUrl?: string;
      sourceUrl?: string;
      watchSubpageUrl?: string;
      servers?: {
        id: string;
        name: string;
        mode: 'url' | 'embed';
        url: string;
        embedCode: string;
        quality: string;
        speed: string;
        tag: string;
      }[];
    }[];
  }[];
}

export type BaselineParseFn = (
  html: string,
  sourceUrl: string,
  options?: { isDownloadPage?: boolean }
) => {
  media: BaselineScrapedMedia;
  hints: {
    watchSubpageUrl?: string;
    downloadSubpageUrl?: string;
    ajaxEmbedIds: { id: string; label: string }[];
    candidateOrigins: string[];
  };
};

// ----------------- Declarative Extraction Helpers -----------------

function parseEpisodeNumberFromLabel(label: string, href: string, customRegexStr?: string): number | null {
  const normLabel = normalizeArabicDigits(cleanText(label));
  if (!normLabel && !href) return null;
  if (/أحدث\s*الحلقات|جميع\s*الحلقات|كل\s*الحلقات|اختر\s*الحلقة|الموسم\s*\d+$/i.test(normLabel)) {
    return null;
  }

  if (customRegexStr) {
    try {
      const re = new RegExp(customRegexStr, 'i');
      const m = normLabel.match(re);
      if (m) {
        const cap = m.slice(1).find((g) => g && /^\d+$/.test(g));
        if (cap) {
          const n = Number(cap);
          if (n > 0 && n <= 999) return n;
        }
      }
    } catch {
      // Ignore malformed custom regex
    }
  }

  // Standard Arabic & English patterns, including number-before-word ("1حلقة", "2 حلقة")
  const match =
    normLabel.match(/(?:الحلقة|حلقة|Episode|Ep\.?)\s*#?(\d{1,3})/i) ||
    normLabel.match(/^(\d{1,3})\s*(?:حلقة|الحلقة)\b/i) ||
    normLabel.match(/\bE(\d{1,3})\b/i);
  if (match?.[1]) {
    const n = Number(match[1]);
    if (n > 0 && n <= 999) return n;
  }

  // Pure number inside explicit episode links (e.g. watch.php?vid=... or /episode/)
  if (/(?:vid=|ep=|episode|حلقة)/i.test(href)) {
    const numOnly = normLabel.match(/^(\d{1,3})$/);
    if (numOnly?.[1]) {
      const n = Number(numOnly[1]);
      if (n > 0 && n <= 999) return n;
    }
  }

  return null;
}

function parseSeasonNumberFromLabel(label: string, fallbackIdx: number): number {
  const norm = normalizeArabicDigits(cleanText(label));
  const m = norm.match(/(?:الموسم|موسم|Season|S)\s*#?(\d{1,2})/i);
  if (m?.[1]) {
    const n = Number(m[1]);
    if (n > 0 && n <= 50) return n;
  }
  if (/الأول|الاول|First/i.test(norm)) return 1;
  if (/الثاني|Second/i.test(norm)) return 2;
  if (/الثالث|Third/i.test(norm)) return 3;
  if (/الرابع|Fourth/i.test(norm)) return 4;
  if (/الخامس|Fifth/i.test(norm)) return 5;
  if (/السادس|Sixth/i.test(norm)) return 6;
  if (/السابع|Seventh/i.test(norm)) return 7;
  if (/الثامن|Eighth/i.test(norm)) return 8;
  if (/التاسع|Ninth/i.test(norm)) return 9;
  if (/العاشر|Tenth/i.test(norm)) return 10;
  return fallbackIdx;
}

function extractEpisodeIdFromUrl(rawUrl: string, preferredParam = 'vid'): string {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl.trim());
    const paramsToCheck = Array.from(
      new Set([preferredParam, 'vid', 'ep', 'episode', 'id', 'e'].filter(Boolean))
    );
    for (const p of paramsToCheck) {
      const val = u.searchParams.get(p);
      if (val && val.trim()) return val.trim();
    }
    const pathMatch = u.pathname.match(/(?:\/watch|\/play|\/player|\/episode|\/ep)[\/\-_](\d+|[A-Za-z0-9]{4,24})(?:[./]|$)/i);
    if (pathMatch?.[1]) return pathMatch[1];
  } catch {
    // ignore invalid url
  }
  return '';
}

function extractServerQualityFromLabel(rawLabel: string, fallbackQuality: string): string {
  const qMatch = cleanText(rawLabel).match(/\b(4K\s*UHD|4K|2160p|1440p|1080p|720p|480p|360p|FHD|Full\s*HD|HD|SD)\b/i);
  if (qMatch?.[1]) {
    const token = qMatch[1].replace(/\s+/g, ' ').trim();
    if (/^fhd$/i.test(token) || /^full\s*hd$/i.test(token)) return '1080p';
    if (/^4k/i.test(token)) return '4K';
    return token.toUpperCase() === 'HD' ? 'HD' : token;
  }
  return fallbackQuality || '1080p';
}

function cleanExtractedServerName(rawLabel: string, fallbackUrl: string, idx: number, preserveNames: boolean): string {
  if (!preserveNames) return `سيرفر ${idx + 1}`;
  const cleaned = cleanText(rawLabel)
    .replace(/<[^>]*>/g, ' ')
    .replace(/^[•\-–|»›\s]+|[•\-–|«‹\s]+$/g, '')
    .replace(/^(?:سيرفر|مشاهدة|سيرفر\s*رقم)\s*\d*\s*[:\-–]?\s*/i, '')
    .replace(/\s*(?:4K\s*UHD|4K|2160p|1440p|FHD|Full\s*HD|HD|1080p|720p|480p|360p|WEB-DL|BluRay)\s*$/i, '')
    .trim();

  if (!cleaned || cleaned.length > 42 || /^(play|watch|server|embed|\d+)$/i.test(cleaned)) {
    try {
      const host = new URL(fallbackUrl).hostname.replace(/^www\./, '').split('.')[0];
      if (host && host.length >= 2) {
        return host.charAt(0).toUpperCase() + host.slice(1);
      }
    } catch {
      // Ignore
    }
    return `سيرفر ${idx + 1}`;
  }
  return cleaned;
}

export function extractServersWithAdapter(
  $: cheerio.CheerioAPI,
  sourceUrl: string,
  adapter: ScraperAdapter,
  defaultQuality = '1080p'
): {
  servers: {
    id: string;
    name: string;
    mode: 'url' | 'embed';
    url: string;
    embedCode: string;
    quality: string;
    speed: string;
    tag: string;
  }[];
  ajaxIds: { id: string; label: string }[];
} {
  let sourceOrigin = '';
  try {
    if (sourceUrl) sourceOrigin = new URL(sourceUrl).origin;
  } catch {
    // ignore
  }

  const servers: {
    id: string;
    name: string;
    mode: 'url' | 'embed';
    url: string;
    embedCode: string;
    quality: string;
    speed: string;
    tag: string;
  }[] = [];
  const seenUrls = new Set<string>();
  const ajaxIds: { id: string; label: string }[] = [];
  const seenAjaxIds = new Set<string>();
  const preserveNames = adapter.serverRules.preserveServerNames;

  const pushServer = (rawUrlOrCode: string, preferredLabel?: string) => {
    let candidate = decodeMaybeBase64(rawUrlOrCode);
    const iframeMatch = candidate.match(/src\s*=\s*["']([^"']+)["']/i);
    if (iframeMatch?.[1]) candidate = iframeMatch[1];

    // Check short AJAX ID (e.g. data-embed="173411")
    if (/^[0-9a-zA-Z_-]{1,24}$/.test(candidate.trim()) && !/[./:?]/.test(candidate.trim())) {
      const ajaxId = candidate.trim();
      if (!seenAjaxIds.has(ajaxId)) {
        seenAjaxIds.add(ajaxId);
        ajaxIds.push({
          id: ajaxId,
          label: cleanText(preferredLabel) || `سيرفر ${ajaxIds.length + 1}`,
        });
      }
      return;
    }

    const resolved = resolveUrl(sourceUrl, candidate);
    if (!resolved) return;
    if (isYoutubeUrl(resolved)) return;
    if (seenUrls.has(resolved) || isLikelyNonVideoWebsiteUrl(resolved, sourceOrigin)) return;

    seenUrls.add(resolved);
    const seq = servers.length + 1;
    const isDirectStream = /\.(mp4|m3u8|webm|ogg)(\?|$)/i.test(resolved);
    const serverQuality = extractServerQualityFromLabel(preferredLabel || '', defaultQuality || '1080p');
    servers.push({
      id: `srv-adp-${seq}`,
      name: cleanExtractedServerName(preferredLabel || '', resolved, seq - 1, preserveNames),
      mode: isDirectStream ? 'url' : 'embed',
      url: resolved,
      embedCode: isDirectStream ? '' : `<iframe src="${resolved}" frameborder="0" allowfullscreen></iframe>`,
      quality: serverQuality,
      speed: 'سريع',
      tag: isDirectStream ? 'MP4' : serverQuality || 'HD',
    });
  };

  // 1. Primary adapter itemSelector (tabs, WatchList, buttons, select options, etc.)
  const itemSelector = adapter.serverRules.itemSelector.trim();
  const urlAttrs =
    adapter.serverRules.urlAttributes.length > 0
      ? adapter.serverRules.urlAttributes
      : [
          'data-embed-url',
          'data-embed',
          'data-iframe',
          'data-server',
          'data-video',
          'data-url',
          'data-watch',
          'data-link',
          'data-play',
          'data-src',
          'value',
          'href',
        ];
  const nameSel = adapter.serverRules.nameSelector.trim();

  const inspectElementForServer = (el: Parameters<cheerio.CheerioAPI>[0]) => {
    const $el = $(el);
    if (
      typeof el === 'object' &&
      el !== null &&
      'tagName' in el &&
      String((el as { tagName?: string }).tagName || '').toLowerCase() === 'img'
    ) {
      return;
    }
    if ($el.closest(IGNORED_PAGE_CONTAINER_SELECTOR).length > 0) return;

    let label = '';
    if (nameSel) {
      try {
        label = cleanText($el.find(nameSel).first().text());
      } catch {
        // ignore invalid sub-selector
      }
    }
    if (!label) {
      const $clone = $el.clone();
      $clone.find('noscript, script, style').remove();
      label = cleanText($clone.text()) || cleanText($el.attr('title')) || '';
    }

    // Check configured attributes
    for (const attr of urlAttrs) {
      const val = $el.attr(attr);
      if (val && val.trim()) {
        if (attr === adapter.serverRules.ajaxIdAttribute && /^[0-9a-zA-Z_-]{1,24}$/.test(val.trim())) {
          if (!seenAjaxIds.has(val.trim())) {
            seenAjaxIds.add(val.trim());
            ajaxIds.push({ id: val.trim(), label: label || `سيرفر ${ajaxIds.length + 1}` });
          }
          return;
        }
        pushServer(val, label);
        return;
      }
    }

    // Check onclick handler statically (never eval!)
    const onclickAttr = $el.attr('onclick') || '';
    if (onclickAttr) {
      if (adapter.serverRules.onclickUrlRegex) {
        try {
          const re = new RegExp(adapter.serverRules.onclickUrlRegex, 'i');
          const m = onclickAttr.match(re);
          if (m?.[1] || m?.[0]) {
            pushServer(m[1] || m[0], label);
            return;
          }
        } catch {
          // ignore bad regex
        }
      }
      const genericUrlMatch = onclickAttr.match(/['"]((?:https?:)?\/\/[^'"]+)['"]/i);
      if (genericUrlMatch?.[1]) {
        pushServer(genericUrlMatch[1], label);
      }
    }
  };

  if (itemSelector) {
    try {
      $(itemSelector).each((_, el) => inspectElementForServer(el));
    } catch {
      // Fallback if user typed invalid CSS selector
    }
  }

  // 2. Fallback attribute scan across common interactive server tags (catches data-embed-url etc.)
  $(
    '[data-embed-url], [data-embed], [data-iframe], [data-server], [data-video], [data-url], [data-watch], [data-link], [data-play], .WatchList li, li[data-src], button[data-src], a[data-src]'
  ).each((_, el) => inspectElementForServer(el));

  // 3. Extract active/embedded iframes (with label matching if tab buttons match count or active class)
  const activeTabLabel = cleanText(
    $('.WatchList li.active, .servers li.active, .nav-tabs li.active, [role="tab"][aria-selected="true"]')
      .first()
      .text()
  );
  $('iframe').each((_, el) => {
    const $el = $(el);
    if ($el.closest(IGNORED_PAGE_CONTAINER_SELECTOR).length > 0) return;
    const rawSrc = $el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src') || '';
    if (!rawSrc) return;
    const titleAttr = cleanText($el.attr('title')) || activeTabLabel;
    pushServer(rawSrc, titleAttr);
  });

  // 4. Direct <video> / <source> tags
  $('video source, video').each((_, el) => {
    const src = $(el).attr('src');
    if (src) pushServer(src, 'سيرفر مباشر');
  });

  // 5. Inline <script> inspection (regex/JSON only, strictly zero eval)
  const scriptTexts: string[] = [];
  $('script').each((_, el) => {
    const txt = $(el).html() || '';
    if (txt && txt.length >= 15) scriptTexts.push(txt);
  });

  for (const rawScript of scriptTexts) {
    const unescaped = rawScript
      .replace(/\\\//g, '/')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\n|\\r|\\t/g, ' ');

    if (adapter.serverRules.scriptUrlRegex) {
      try {
        const customRe = new RegExp(adapter.serverRules.scriptUrlRegex, 'gi');
        let cm: RegExpExecArray | null;
        while ((cm = customRe.exec(unescaped)) !== null) {
          pushServer(cm[1] || cm[0]);
        }
      } catch {
        // ignore invalid regex
      }
    }

    const iframeRegex = /<iframe[^>]+src=["'](https?:\/\/[^"'\s<>]+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = iframeRegex.exec(unescaped)) !== null) {
      pushServer(m[1]);
    }

    const atobRegex = /atob\(\s*["']([A-Za-z0-9+/=]{20,})["']\s*\)/gi;
    let bm: RegExpExecArray | null;
    while ((bm = atobRegex.exec(rawScript)) !== null) {
      const dec = decodeMaybeBase64(bm[1]);
      if (/<script/i.test(dec)) continue;
      const src = dec.match(/src=["'](https?:\/\/[^"'\s<>]+)["']/i)?.[1] || dec;
      if (/^https?:\/\//i.test(src) && !IGNORED_AD_OR_SOCIAL_HOSTS.test(src)) {
        pushServer(src);
      }
    }

    const jsArrayVarRegex = /(?:var|let|const)\s+(?:servers|embeds|players|watchLinks)\s*=\s*\[([\s\S]{5,8000}?)\]/gi;
    let am: RegExpExecArray | null;
    while ((am = jsArrayVarRegex.exec(unescaped)) !== null) {
      const urlRe = /https?:\/\/[^\s"'<>]+/gi;
      let um: RegExpExecArray | null;
      while ((um = urlRe.exec(am[1])) !== null) {
        if (!IGNORED_AD_OR_SOCIAL_HOSTS.test(um[0])) {
          pushServer(um[0]);
        }
      }
    }
  }

  return {
    servers: servers.slice(0, adapter.serverRules.maxServersPerEpisode || 15),
    ajaxIds: ajaxIds.slice(0, 20),
  };
}

export function extractSeasonsAndEpisodesWithAdapter(
  $: cheerio.CheerioAPI,
  sourceUrl: string,
  adapter: ScraperAdapter,
  defaultYear = '2026',
  defaultQuality = 'WEB-DL',
  options?: { forcedSeasonNumber?: number }
): {
  seasons: {
    seasonNumber: number;
    label: string;
    year: string;
    episodes: {
      number: number;
      title: string;
      duration: string;
      quality: string;
      watchUrl: string;
      sourceUrl: string;
      servers: [];
    }[];
  }[];
  visibleEpisodesHint: number;
  paginationLinks: string[];
  seasonPageLinks: { seasonNumber: number; label: string; url: string }[];
} {
  const maxEp = Math.max(1, Math.min(300, adapter.episodeRules.maxEpisodes || 200));
  const customEpRegex = adapter.episodeRules.episodeNumberRegex;

  type RawEp = {
    number: number;
    title: string;
    watchUrl: string;
    sourceUrl: string;
  };
  const seasonMap = new Map<number, { label: string; episodes: Map<number, RawEp> }>();

  const ensureSeason = (seasonNum: number, label: string) => {
    if (!seasonMap.has(seasonNum)) {
      seasonMap.set(seasonNum, {
        label: label || `الموسم ${String(seasonNum).padStart(2, '0')}`,
        episodes: new Map(),
      });
    }
    return seasonMap.get(seasonNum)!;
  };

  let totalProcessedEps = 0;

  const addEpisodeToSeason = (seasonNum: number, seasonLabel: string, rawLabel: string, rawHref: string) => {
    if (totalProcessedEps >= maxEp) return false;
    const href = resolveUrl(sourceUrl, rawHref);
    if (!href) return false;
    const epNum = parseEpisodeNumberFromLabel(rawLabel, href, customEpRegex);
    if (!epNum) return false;

    const targetSeason = adapter.episodeRules.preserveMultiSeason ? seasonNum : 1;
    const targetLabel = adapter.episodeRules.preserveMultiSeason ? seasonLabel : 'الموسم 01';
    const sBucket = ensureSeason(targetSeason, targetLabel);
    if (!sBucket.episodes.has(epNum)) {
      const cleanEpTitle = cleanText(rawLabel) || `الحلقة ${epNum}`;
      sBucket.episodes.set(epNum, {
        number: epNum,
        title: /^\d+\s*حلقة$/i.test(normalizeArabicDigits(cleanEpTitle))
          ? `الحلقة ${epNum}`
          : cleanEpTitle.slice(0, 120),
        watchUrl: href,
        sourceUrl: href,
      });
      totalProcessedEps += 1;
      return true;
    }
    return false;
  };

  // Discover distributed Season page links (e.g., <div class="SeasonsList"><a href="/season-2">الموسم الثاني</a></div>)
  const seasonPageLinksMap = new Map<string, { seasonNumber: number; label: string; url: string }>();
  const registerSeasonPageLink = (label: string, rawHref: string | undefined | null, fallbackSeasonIdx: number) => {
    const resolved = resolveUrl(sourceUrl, rawHref);
    if (!resolved) return;
    if (canonicalizeCompareUrl(resolved) === canonicalizeCompareUrl(sourceUrl)) return;
    const cleanLbl = cleanText(label);
    if (!cleanLbl) return;
    // Ignore links that are actually individual episode links
    if (/(?:الحلقة|حلقة|Episode|Ep\.?)\s*#?\d+/i.test(normalizeArabicDigits(cleanLbl))) return;
    if (!/(?:الموسم|موسم|Season|S\d{1,2})/i.test(cleanLbl)) return;
    const sNum = parseSeasonNumberFromLabel(cleanLbl, fallbackSeasonIdx);
    const canon = canonicalizeCompareUrl(resolved);
    if (!seasonPageLinksMap.has(canon)) {
      seasonPageLinksMap.set(canon, {
        seasonNumber: sNum,
        label: `الموسم ${String(sNum).padStart(2, '0')}`,
        url: resolved,
      });
    }
  };

  // Strategy 1: Multi-season Tab + Panel pairs (e.g., .tablinks + .tabcontent#Season1..N OR .seasons-sec + .SeasonsEpisodes)
  const tabLabelsByPanelId = new Map<string, string>();
  const tabLabelsByIndex: string[] = [];
  const seasonTabSel =
    adapter.episodeRules.seasonTabSelector.trim() ||
    '.tablinks, .seasons-sec > li, .seasons-sec a, .SeasonsList a, .series-seasons a, .season-list a, [data-season]';
  try {
    $(seasonTabSel).each((idx, el) => {
      const $el = $(el);
      const label = cleanText($el.text()) || cleanText($el.attr('title'));
      if (label) tabLabelsByIndex.push(label);
      const onclick = $el.attr('onclick') || '';
      const onclickPanelMatch = onclick.match(/openCity\([^,]+,\s*['"]([^'"]+)['"]/i);
      const dataSeason = $el.attr('data-season') || $el.attr('aria-controls') || $el.attr('href')?.replace(/^#/, '');
      const key = onclickPanelMatch?.[1] || dataSeason || String(idx + 1);
      if (label) tabLabelsByPanelId.set(key, label);

      const hrefAttr = $el.is('a') ? $el.attr('href') : $el.find('a[href]').first().attr('href');
      if (hrefAttr && !hrefAttr.startsWith('#')) {
        registerSeasonPageLink(label, hrefAttr, idx + 1);
      }
    });
  } catch {
    // ignore bad selector
  }

  // Also scan dedicated season link containers and <select> season dropdowns for separate-page seasons
  try {
    $('.SeasonsList a[href], .seasons-list a[href], .series-seasons a[href], .seasons-sec a[href], a[href*="season"]').each(
      (idx, el) => {
        const $el = $(el);
        if ($el.closest(IGNORED_PAGE_CONTAINER_SELECTOR).length > 0) return;
        registerSeasonPageLink($el.text() || $el.attr('title') || '', $el.attr('href'), idx + 1);
      }
    );
  } catch {
    // ignore
  }

  const panelSel = adapter.episodeRules.seasonPanelSelector.trim() || '.tabcontent, .SeasonsEpisodes';
  let foundMultiSeasonPanels = false;
  try {
    const panels = $(panelSel);
    if (panels.length > 0) {
      let panelsAddedEps = 0;
      panels.each((pIdx, panelEl) => {
        const $panel = $(panelEl);
        const panelId = $panel.attr('id') || $panel.attr('data-season') || '';
        const matchedTabLabel =
          (panelId && tabLabelsByPanelId.get(panelId)) ||
          panelId ||
          tabLabelsByIndex[pIdx] ||
          `الموسم ${pIdx + 1}`;
        const seasonNum = parseSeasonNumberFromLabel(matchedTabLabel, options?.forcedSeasonNumber || pIdx + 1);
        const linkSel = adapter.episodeRules.linkSelector.trim() || 'a[href]';
        const links = $panel.find(linkSel);
        links.each((_, aEl) => {
          const $a = $(aEl);
          if (
            addEpisodeToSeason(
              seasonNum,
              `الموسم ${String(seasonNum).padStart(2, '0')}`,
              cleanText($a.text()) || cleanText($a.attr('title')),
              $a.attr('href') || ''
            )
          ) {
            panelsAddedEps += 1;
          }
        });
      });
      if (panelsAddedEps > 0) foundMultiSeasonPanels = true;
    }
  } catch {
    // ignore bad selector
  }

  // Strategy 2: Paired Season + Episode <select> dropdowns (e.g., mobile .TabS + .TabE select.episodeoption)
  if (!foundMultiSeasonPanels) {
    try {
      const seasonOptLabels = new Map<string, string>();
      const selSeason = adapter.episodeRules.selectSeasonSelector.trim() || 'select#mobileselect, .TabS select';
      $(selSeason)
        .find('option')
        .each((optIdx, opt) => {
          const val = $(opt).attr('value') || '';
          const txt = cleanText($(opt).text());
          if (val && txt) {
            seasonOptLabels.set(val, txt);
            if (/^https?:\/\//i.test(val) || val.startsWith('/')) {
              registerSeasonPageLink(txt, val, optIdx + 1);
            }
          }
        });

      const selEpOpt = adapter.episodeRules.selectEpisodeOptionSelector.trim() || 'select.episodeoption option, .TabE select option';
      $(selEpOpt).each((_, optEl) => {
        const $opt = $(optEl);
        const val = $opt.attr('value') || '';
        if (!val || val === 'select-ep' || val === '#') return;
        const parentId = $opt.parent('select').attr('id') || '';
        const seasonKey = parentId.replace(/^Ep/i, '').trim();
        const labelFromMap =
          (seasonKey && (seasonOptLabels.get(`Seas${seasonKey}`) || seasonOptLabels.get(seasonKey))) ||
          (parentId && seasonOptLabels.get(parentId)) ||
          (seasonKey ? `الموسم ${seasonKey}` : '') ||
          (options?.forcedSeasonNumber ? `الموسم ${options.forcedSeasonNumber}` : 'الموسم 01');
        const sNum = parseSeasonNumberFromLabel(labelFromMap, options?.forcedSeasonNumber || (Number(seasonKey) || 1));
        addEpisodeToSeason(sNum, `الموسم ${String(sNum).padStart(2, '0')}`, cleanText($opt.text()), val);
      });
    } catch {
      // ignore
    }
  }

  // Strategy 3: General episode container links (or whole page fallback if still empty)
  if (totalProcessedEps === 0) {
    const containerSel = adapter.episodeRules.containerSelector.trim();
    const linkSel = adapter.episodeRules.linkSelector.trim() || 'a[href]';
    const defaultSeason = options?.forcedSeasonNumber || 1;
    let scannedContainer = false;
    if (containerSel) {
      try {
        const containers = $(containerSel);
        if (containers.length > 0) {
          scannedContainer = true;
          containers.each((cIdx, cEl) => {
            const $c = $(cEl);
            const sHint =
              $c.attr('data-season') ||
              $c.attr('id') ||
              cleanText($c.find('h2, h3, .season-title').first().text()) ||
              '';
            const sNum = parseSeasonNumberFromLabel(
              sHint,
              containers.length > 1 ? cIdx + 1 : defaultSeason
            );
            $c.find(linkSel).each((_, aEl) => {
              const $a = $(aEl);
              addEpisodeToSeason(
                sNum,
                `الموسم ${String(sNum).padStart(2, '0')}`,
                cleanText($a.text()) || cleanText($a.attr('title')),
                $a.attr('href') || ''
              );
            });
          });
        }
      } catch {
        // ignore
      }
    }

    if (!scannedContainer || totalProcessedEps === 0) {
      $('a[href]').each((_, aEl) => {
        const $a = $(aEl);
        if ($a.closest(IGNORED_PAGE_CONTAINER_SELECTOR).length > 0) return;
        const href = $a.attr('href') || '';
        const text = cleanText($a.text()) || cleanText($a.attr('title'));
        const seasonParentHint =
          $a.closest('[data-season], [id*="Season"], [id*="season"], .season-box, .season-block').attr('data-season') ||
          $a.closest('[data-season], [id*="Season"], [id*="season"], .season-box, .season-block').attr('id') ||
          cleanText($a.closest('.season-box, .season-block').find('h2, h3, .season-title').first().text()) ||
          '';
        const sNum = seasonParentHint
          ? parseSeasonNumberFromLabel(seasonParentHint, defaultSeason)
          : /season|الموسم|موسم|\bS\d{1,2}E\d+/i.test(`${text} ${href}`)
            ? parseSeasonNumberFromLabel(`${text} ${href}`, defaultSeason)
            : defaultSeason;
        addEpisodeToSeason(
          sNum,
          `الموسم ${String(sNum).padStart(2, '0')}`,
          text,
          href
        );
      });
    }
  }

  // Also ensure current active episode is included if page title indicates "الحلقة X" and we already detected series episodes
  const pageHeading = normalizeArabicDigits(`${cleanText($('h1').first().text())} ${cleanText($('title').first().text())}`);
  const currSeasonNum = parseSeasonNumberFromLabel(pageHeading, options?.forcedSeasonNumber || 1);
  const currEpMatch = pageHeading.match(/(?:الحلقة|حلقة|Episode|Ep\.?)\s*#?(\d{1,3})/i);
  if (currEpMatch?.[1] && sourceUrl && seasonMap.size > 0) {
    const currEpNum = Number(currEpMatch[1]);
    const targetSeason = adapter.episodeRules.preserveMultiSeason ? currSeasonNum : 1;
    const sBucket = ensureSeason(targetSeason, `الموسم ${String(targetSeason).padStart(2, '0')}`);
    if (currEpNum > 0 && !sBucket.episodes.has(currEpNum)) {
      sBucket.episodes.set(currEpNum, {
        number: currEpNum,
        title: `الحلقة ${currEpNum}`,
        watchUrl: sourceUrl,
        sourceUrl,
      });
    }
  }

  // Visible episodes count estimate from select options + panel links
  const tabPanelLinksCount = $(panelSel).find('a[href]').length;
  const selectOptionsCount = $('select.episodeoption option, .TabE select option')
    .filter((_, el) => {
      const v = $(el).attr('value') || '';
      return Boolean(v && v !== 'select-ep');
    })
    .length;

  const seasons = Array.from(seasonMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([seasonNumber, data]) => ({
      seasonNumber,
      label: data.label,
      year: defaultYear,
      episodes: Array.from(data.episodes.values())
        .sort((a, b) => a.number - b.number)
        .map((ep) => ({
          number: ep.number,
          title: ep.title,
          duration: '45 دقيقة',
          quality: defaultQuality,
          watchUrl: ep.watchUrl,
          sourceUrl: ep.sourceUrl,
          servers: [] as [],
        })),
    }))
    .filter((s) => s.episodes.length > 0);

  const totalExtractedEps = seasons.reduce((acc, s) => acc + s.episodes.length, 0);
  const visibleEpisodesHint = Math.max(totalExtractedEps, tabPanelLinksCount, selectOptionsCount);

  // Pagination links
  const pagLinks: string[] = [];
  const pagSel = adapter.navigationRules.paginationSelector.trim() || 'a[rel="next"], .pagination a, .next a, a.next';
  try {
    const baseOrigin = sourceUrl ? new URL(sourceUrl).origin : '';
    $(pagSel).each((_, el) => {
      const href = resolveUrl(sourceUrl, $(el).attr('href'));
      if (!href || href === sourceUrl) return;
      if (baseOrigin && !href.startsWith(baseOrigin)) return;
      if (!pagLinks.includes(href)) pagLinks.push(href);
    });
  } catch {
    // ignore
  }

  return {
    seasons,
    visibleEpisodesHint,
    paginationLinks: pagLinks.slice(0, 20),
    seasonPageLinks: Array.from(seasonPageLinksMap.values()).slice(0, 25),
  };
}

const IGNORED_WATCH_SUBPAGE_PARENT_SELECTOR =
  `${IGNORED_PAGE_CONTAINER_SELECTOR}, .tabcontent, .SeasonsEpisodes, .SeasonsList, .seasons-sec, .episodes-list, .episode-list, .all-episodes, .TabE, .TabS, .related, .related-posts, .sidebar, aside, [id^="Season"]`;

function findBestWatchSubpageUrl(
  $: cheerio.CheerioAPI,
  sourceUrl: string,
  adapter: ScraperAdapter
): string {
  let sourceOrigin = '';
  let sourceIdVal = '';
  const idParam = adapter.episodeRules.episodeIdParam || 'vid';
  try {
    const u = new URL(sourceUrl);
    sourceOrigin = u.origin;
    sourceIdVal = extractEpisodeIdFromUrl(sourceUrl, idParam);
  } catch {
    return '';
  }

  const candidates: { href: string; score: number }[] = [];
  const customSel = adapter.pageDetection.watchSubpageSelector.trim();
  const baseSel = customSel ? `${customSel}, a[href]` : 'a.xtgo, a.btnplay, a.watch, a[href*="play.php"], a[href*="/watch"], a[href]';

  try {
    $(baseSel).each((_, el) => {
      const $el = $(el);
      if ($el.closest(IGNORED_PAGE_CONTAINER_SELECTOR).length > 0) return;
      if ($el.hasClass('btnDowns')) return;

      const cls = cleanText($el.attr('class'));
      const txt = cleanText($el.text());
      const isExplicitWatchBtn = Boolean(
        (customSel && $el.is(customSel)) || /\b(xtgo|btnplay|play-btn|watch)\b/i.test(cls)
      );
      if (!isExplicitWatchBtn && $el.closest(IGNORED_WATCH_SUBPAGE_PARENT_SELECTOR).length > 0) {
        return;
      }

      const href = resolveUrl(sourceUrl, $el.attr('href'));
      if (!href || canonicalizeCompareUrl(href) === canonicalizeCompareUrl(sourceUrl)) return;
      if (/download\.php|\/download/i.test(href) && !/play\.php|\/+watch(?:\/|$|\?)|\/+player(?:\/|$|\?)/i.test(href)) return;
      try {
        if (new URL(href).origin !== sourceOrigin) return;
      } catch {
        return;
      }

      const candIdVal = extractEpisodeIdFromUrl(href, idParam);
      // Critical anti-contamination guard: if both current page and candidate link have an episode ID and they differ, reject immediately!
      if (sourceIdVal && candIdVal && candIdVal !== sourceIdVal) {
        return;
      }

      let score = 0;
      if (sourceIdVal && candIdVal && candIdVal === sourceIdVal) {
        score += 120;
      } else if (sourceIdVal && href.includes(sourceIdVal)) {
        score += 80;
      }
      if (adapter.pageDetection.watchSubpageUrlPattern) {
        try {
          if (new RegExp(adapter.pageDetection.watchSubpageUrlPattern, 'i').test(href)) score += 40;
        } catch {
          // ignore
        }
      }
      if (/play\.php|\/+watch(?:\/|$|\?)|\/+player(?:\/|$|\?)/i.test(href)) score += 25;
      if (/\b(xtgo|btnplay|play-btn)\b/i.test(cls)) score += 35;
      else if (/\bwatch\b/i.test(cls) && /watch|play/i.test(href)) score += 30;
      if (/مشاهدة|watch|play/i.test(txt)) score += 10;

      // Require higher bar if we have sourceIdVal and candidate didn't carry it (avoid jumping to unrelated site player links)
      const minThreshold = sourceIdVal && !candIdVal && !isExplicitWatchBtn ? 60 : 25;
      if (score >= minThreshold) {
        candidates.push({ href, score });
      }
    });
  } catch {
    // ignore
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.href || '';
}

// ----------------- Server Verification Helper -----------------

async function verifyServersList(
  servers: BaselineScrapedMedia['servers'],
  sourceOrigin: string,
  verifyMode: AdapterVerifyMode,
  episodeNumber?: number
): Promise<{
  kept: BaselineScrapedMedia['servers'];
  failed: FailedServerReport[];
}> {
  if (!servers.length) return { kept: [], failed: [] };
  if (verifyMode === 'none') {
    return { kept: servers, failed: [] };
  }

  const failed: FailedServerReport[] = [];
  const results = await Promise.all(
    servers.map(async (srv) => {
      const target = srv.url;
      if (!target || isLikelyNonVideoWebsiteUrl(target, sourceOrigin)) {
        failed.push({
          episodeNumber,
          serverName: srv.name,
          url: target || '',
          reason: 'الرابط يشير إلى صفحة موقع عامة أو نطاق إعلاني وليس مشغل فيديو',
        });
        return false;
      }
      if (/\.(mp4|m3u8|webm|ogg)(\?|$)/i.test(target)) return true;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      try {
        const reqHeaders: Record<string, string> = {
          ...FETCH_HEADERS,
          Referer: sourceOrigin ? `${sourceOrigin}/` : new URL(target).origin + '/',
        };
        if (verifyMode === 'strict') {
          reqHeaders.Range = 'bytes=0-24576';
        }
        const response = await fetch(target, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: reqHeaders,
        });
        const finalUrl = response.url || target;
        if (isLikelyNonVideoWebsiteUrl(finalUrl, sourceOrigin)) {
          failed.push({
            episodeNumber,
            serverName: srv.name,
            url: target,
            httpStatus: response.status,
            reason: `أعاد التوجيه إلى صفحة غير مشغل (${finalUrl.slice(0, 80)})`,
          });
          return false;
        }
        if (!response.ok && response.status !== 206) {
          const cfMitigated = (response.headers.get('cf-mitigated') || '').toLowerCase();
          // Relaxed mode treats 403 and Cloudflare challenge 503 with non-deleted embed hosts carefully: 404/410/5xx definitely broken
          if (verifyMode === 'relaxed_headers' && (response.status === 403 || (response.status === 503 && cfMitigated === 'challenge'))) {
            return true;
          }
          failed.push({
            episodeNumber,
            serverName: srv.name,
            url: target,
            httpStatus: response.status,
            reason: `استجاب السيرفر بحالة HTTP ${response.status}`,
          });
          return false;
        }

        const ct = (response.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('video/') || ct.includes('mpegurl')) return true;
        if (ct.includes('text/html') || ct.includes('text/plain') || !ct) {
          const snippet = (await response.text().catch(() => '')).slice(0, 24000);
          if (
            /file\s*(?:was|has been)?\s*(?:deleted|removed)|video\s*(?:was|has been)?\s*(?:deleted|removed|not found)|file\s*not\s*found|404\s*not\s*found|no\s*longer\s*available|تم\s*حذف\s*(?:الملف|الفيديو)|الفيديو\s*غير\s*موجود|الملف\s*غير\s*موجود/i.test(
              snippet
            )
          ) {
            failed.push({
              episodeNumber,
              serverName: srv.name,
              url: target,
              httpStatus: response.status,
              reason: 'السيرفر يعرض رسالة حذف أو عدم وجود الفيديو',
            });
            return false;
          }
          if (verifyMode === 'strict') {
            const xFrame = (response.headers.get('x-frame-options') || '').toLowerCase();
            const csp = (response.headers.get('content-security-policy') || '').toLowerCase();
            const frameBlocked =
              xFrame.includes('deny') ||
              xFrame.includes('sameorigin') ||
              /frame-ancestors\s+[^;]*'none'|frame-ancestors\s+'self'/.test(csp);
            if (frameBlocked && !/\.(mp4|m3u8)(\?|"|')/i.test(snippet)) {
              failed.push({
                episodeNumber,
                serverName: srv.name,
                url: target,
                httpStatus: response.status,
                reason: 'السيرفر يمنع التضمين (X-Frame-Options / CSP)',
              });
              return false;
            }
          }
        }
        return true;
      } catch (err) {
        failed.push({
          episodeNumber,
          serverName: srv.name,
          url: target,
          reason:
            err instanceof Error && err.name === 'AbortError'
              ? 'انتهت مهلة فحص السيرفر'
              : 'تعذر الاتصال بالسيرفر',
        });
        return false;
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return {
    kept: servers.filter((_, idx) => results[idx]),
    failed,
  };
}

// ----------------- Site Analyzer & 8-Scenario Diagnostic Engine -----------------

export async function analyzeSiteStructure(params: {
  url: string;
  rawHtml?: string;
  contentTypeHint?: AdapterContentTypeHint;
  existingAdapters?: ScraperAdapter[];
  baselineParseFn: BaselineParseFn;
}): Promise<ScraperSiteAnalysisReport> {
  const { url, rawHtml, contentTypeHint = 'auto', existingAdapters = [], baselineParseFn } = params;
  const domain = normalizeAdapterDomain(url) || 'unknown-site';
  const analyzedAt = new Date().toISOString();
  const matchedExisting = url ? matchAdapterForUrl(url, existingAdapters, { includeDisabled: true }) : null;

  let html = '';
  let httpStatus = 200;
  let finalUrl = url || '';
  let isProtected = false;
  let protectionReason: string | undefined;

  if (rawHtml && rawHtml.trim().length >= 50) {
    html = rawHtml;
    const canonicalMatch =
      html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      '';
    finalUrl = url || canonicalMatch || 'https://example.com';
    const prot = detectProtectionChallenge(200, html);
    isProtected = prot.isProtected;
    protectionReason = prot.reason;
  } else if (url) {
    const fetched = await safeFetchRemoteText(url, { timeoutMs: 12000, delayMs: 150 });
    httpStatus = fetched.status;
    finalUrl = fetched.finalUrl || url;
    html = fetched.text;
    isProtected = fetched.isProtected;
    protectionReason = fetched.errorReason;

    if (!fetched.ok && !html) {
      const fallbackAdapter = matchedExisting
        ? normalizeScraperAdapter({ ...matchedExisting, version: matchedExisting.version + 1, status: 'failed' })
        : normalizeScraperAdapter({
            domain,
            name: domain,
            sampleUrl: url,
            status: 'failed',
            contentTypeHint,
          });
      return {
        ok: false,
        targetUrl: url,
        domain,
        contentTypeHint,
        analyzedAt,
        matchedExistingAdapterId: matchedExisting?.id,
        error: fetched.errorReason || `فشل جلب الصفحة (HTTP ${httpStatus})`,
        signals: {
          httpStatus,
          finalUrl,
          pageTitle: '',
          cmsFingerprint: 'unknown',
          isProtectedOrBlocked: isProtected,
          protectionReason,
          hasTabsForServers: false,
          serverTabSelectorMatched: '',
          serverContainerCount: 0,
          hasSeasonTabs: false,
          seasonCountDetected: 0,
          hasSelectEpisodeDropdown: false,
          visibleEpisodeCount: 0,
          visibleServerCount: 0,
          hasPagination: false,
          paginationLinks: [],
          hasLoadMoreButton: false,
          hasWatchSubpage: false,
          watchSubpageUrl: '',
          hasDownloadSubpage: false,
          downloadSubpageUrl: '',
          episodeIdParamsFound: [],
          discoveredApis: [],
          sampleServerNames: [],
          sampleEpisodeLabels: [],
        },
        diagnostics: [
          {
            code: isProtected ? 'access_blocked_or_protection' : 'http_or_timeout_error',
            severity: 'critical',
            title: isProtected ? 'الموقع محمي ببوابة تحقق أو حجب الوصول' : 'فشل الاتصال بالصفحة الهدف',
            probableCause: fetched.errorReason || `رمز الاستجابة HTTP ${httpStatus}`,
            suggestedFix:
              'لا يقوم النظام بتجاوز الحماية أو الكابتشا. افتح الصفحة في متصفحك وانسخ كود المصدر (Ctrl+U) ثم الصقه في حقل HTML البديل لتحليل البنية وبناء الـ Adapter.',
            evidence: `HTTP ${httpStatus} — ${finalUrl}`,
          },
        ],
        baselineCounts: { episodes: 0, servers: 0, seasons: 0 },
        proposedAdapter: fallbackAdapter,
      };
    }
  }

  const $ = cheerio.load(html);
  const pageTitle = cleanText($('title').first().text()) || cleanText($('h1').first().text());

  // Fingerprint CMS
  let cmsFingerprint = 'Custom HTML';
  if (/MELODYURL|pm-video|watch\.php\?vid=|play\.php\?vid=/i.test(html)) {
    cmsFingerprint = 'PHP Melody Streaming';
  } else if (/wp-content|wp-includes|wp-json/i.test(html)) {
    cmsFingerprint = 'WordPress';
  } else if (/blogger\.com|blogspot\.com|feeds\/posts\/default/i.test(html)) {
    cmsFingerprint = 'Blogger';
  } else if ($('script#__NEXT_DATA__').length > 0) {
    cmsFingerprint = 'Next.js';
  } else if (/window\.__NUXT__|__NUXT_DATA__/i.test(html)) {
    cmsFingerprint = 'Nuxt.js';
  }

  // Run baseline parser for direct comparison
  const baseline = baselineParseFn(html, finalUrl);
  const baselineEpisodes = baseline.media.seasons.reduce((acc, s) => acc + s.episodes.length, 0);
  const baselineServers = baseline.media.servers.length;
  const baselineSeasons = baseline.media.seasons.length;

  // Detect Server Containers / Tabs
  const serverCandidateSelectors = [
    '.WatchList li',
    '.servers-list li',
    '.servers-list button',
    '.servers li',
    '.servers button',
    '.watch-servers li',
    '.watch-servers button',
    '.nav-tabs li',
    '[role="tab"]',
    'select.servers option',
    '[data-embed-url]',
    '[data-embed]',
  ];

  let bestServerSelector = '';
  let bestServerEls: Parameters<cheerio.CheerioAPI>[0][] = [];
  for (const sel of serverCandidateSelectors) {
    const found = $(sel)
      .filter((_, el) => $(el).closest(IGNORED_PAGE_CONTAINER_SELECTOR).length === 0)
      .toArray() as Parameters<cheerio.CheerioAPI>[0][];
    if (found.length > bestServerEls.length) {
      bestServerEls = found;
      bestServerSelector = sel;
    }
  }

  // Check if attributes inside bestServerEls actually carry URLs or embed IDs
  const urlAttrsOrder = [
    'data-embed-url',
    'data-embed',
    'data-iframe',
    'data-server',
    'data-video',
    'data-url',
    'data-watch',
    'data-link',
    'data-play',
    'data-src',
    'value',
    'href',
  ];
  const detectedUrlAttrs = new Set<string>();
  const sampleServerNames: string[] = [];
  let explicitServerCount = 0;

  for (const el of bestServerEls) {
    const $el = $(el);
    let foundAttr = false;
    for (const attr of urlAttrsOrder) {
      const val = $el.attr(attr);
      if (val && val.trim() && val.trim() !== '#') {
        detectedUrlAttrs.add(attr);
        foundAttr = true;
        break;
      }
    }
    const onclickVal = $el.attr('onclick') || '';
    if (!foundAttr && /https?:\/\/|load_stream|openEmbed/i.test(onclickVal)) {
      foundAttr = true;
    }
    if (foundAttr || $el.attr('data-embed-id')) {
      explicitServerCount += 1;
      const lbl = cleanText($el.find('.name').first().text()) || cleanText($el.text());
      if (lbl && sampleServerNames.length < 15 && !sampleServerNames.includes(lbl)) {
        sampleServerNames.push(lbl);
      }
    }
  }

  const iframeCount = $('iframe')
    .filter((_, el) => $(el).closest(IGNORED_PAGE_CONTAINER_SELECTOR).length === 0)
    .length;
  const visibleServerCount = Math.max(explicitServerCount, iframeCount, baselineServers);
  const hasTabsForServers =
    bestServerEls.length >= 2 &&
    (/WatchList|nav-tabs|tab|server/i.test(bestServerSelector) || explicitServerCount > iframeCount);

  // Detect Seasons, Episodes, Dropdowns, Pagination
  const seasonTabsCount = $('.tablinks, .seasons-sec > li, [data-season]').length;
  const seasonPanelsCount = $('.tabcontent, .SeasonsEpisodes').length;
  const hasSeasonTabs = seasonTabsCount >= 2 || seasonPanelsCount >= 2;
  const hasSelectEpisodeDropdown = $('select.episodeoption option, .TabE select option').length > 0;

  // Build initial smart candidate adapter for structural episode counting
  const candidateSeed = normalizeScraperAdapter({
    ...(matchedExisting || {}),
    id: matchedExisting?.id || undefined,
    name: matchedExisting?.name || domain,
    domain,
    sampleUrl: url || finalUrl,
    contentTypeHint,
    version: matchedExisting ? matchedExisting.version + 1 : 1,
    pageDetection: {
      seriesUrlPattern: matchedExisting?.pageDetection.seriesUrlPattern || '',
      movieUrlPattern: matchedExisting?.pageDetection.movieUrlPattern || '',
      episodeUrlPattern: /play\.php|watch\.php/i.test(finalUrl) ? 'play\\.php|watch\\.php' : '',
      watchSubpageSelector: $('.xtgo').length > 0 ? 'a.xtgo, a[href*="play.php"]' : 'a.xtgo, a.btnplay, a.watch, a[href*="play.php"], a[href*="/watch"]',
      watchSubpageUrlPattern: 'play\\.php\\?vid=|/+watch(?:/|$|\\?)',
      downloadSubpageSelector: 'a[href*="download.php"], a[href*="/download"]',
    },
    episodeRules: {
      containerSelector:
        $('.tabcontent').length > 0
          ? '.tabcontent, .episodes-list, .pm-ul-playlist'
          : $('.SeasonsEpisodes').length > 0
            ? '.SeasonsEpisodes, .episodes-list'
            : '.episodes-list, .pm-ul-playlist, .list-episodes, .EpisodesList',
      linkSelector: 'a[href]',
      seasonTabSelector: '.tablinks, .seasons-sec > li, [data-season]',
      seasonPanelSelector: '.tabcontent, .SeasonsEpisodes',
      selectSeasonSelector: 'select#mobileselect, .TabS select',
      selectEpisodeOptionSelector: 'select.episodeoption option, .TabE select option',
      episodeNumberRegex: '(?:الحلقة|حلقة|Episode|Ep\\.?)\\s*#?(\\d{1,3})|^(\\d{1,3})\\s*(?:حلقة|الحلقة)',
      episodeIdParam: /[?&]vid=/.test(html) ? 'vid' : /[?&]ep=/.test(html) ? 'ep' : 'vid',
      preserveMultiSeason: true,
      maxEpisodes: 150,
    },
    serverRules: {
      itemSelector: bestServerSelector || '.WatchList li, .servers-list li, .servers button, .nav-tabs li, [role="tab"]',
      urlAttributes: Array.from(new Set([...detectedUrlAttrs, ...urlAttrsOrder])).slice(0, 20),
      nameSelector: '.name, span, a',
      preserveServerNames: true,
      onclickUrlRegex: '',
      scriptUrlRegex: '',
      ajaxEndpointPattern: baseline.hints.ajaxEmbedIds.length > 0 ? '/ajax/embed' : '',
      ajaxMethod: 'POST',
      ajaxIdAttribute: $('[data-embed-id]').length > 0 ? 'data-embed-id' : 'data-embed',
      maxServersPerEpisode: 20,
    },
    navigationRules: {
      paginationSelector: 'a[rel="next"], .pagination a, .nav-links a.next, .wp-pagenavi a, a.next',
      loadMoreSelector: '.load-more, [data-load-more], [data-ajax-episodes]',
      followPagination: true,
      maxPaginationPages: 8,
      followWatchSubpage: true,
      followDownloadSubpage: true,
      listingCardSelector: '.entry-box, .pm-video-thumb, .pm-li-video, article, .post, .movie, .card',
      listingLinkSelector: 'a[href]',
    },
    siteSettings: {
      requestDelayMs: 250,
      verifyMode: 'relaxed_headers',
      refererMode: 'source_url',
      cmsFingerprint,
      notes: '',
    },
  });

  const adapterEpScan = extractSeasonsAndEpisodesWithAdapter($, finalUrl, candidateSeed);
  const extractedAdapterEpCount = adapterEpScan.seasons.reduce((acc, s) => acc + s.episodes.length, 0);
  const visibleEpisodeCount = Math.max(adapterEpScan.visibleEpisodesHint, extractedAdapterEpCount, baselineEpisodes);

  const sampleEpisodeLabels = adapterEpScan.seasons
    .flatMap((s) => s.episodes.map((e) => `${s.label}: ${e.title}`))
    .slice(0, 12);

  // Detect pagination & load more
  const paginationLinks = adapterEpScan.paginationLinks;
  const hasPagination = paginationLinks.length > 0;
  const hasLoadMoreButton =
    $('.load-more, [data-load-more], button:contains("تحميل المزيد"), a:contains("تحميل المزيد")').length > 0 ||
    /load[-_]?more|next[-_]?page/i.test(html);

  // Detect Watch / Download Subpage
  const watchSubpageUrl = findBestWatchSubpageUrl($, finalUrl, candidateSeed) || baseline.hints.watchSubpageUrl || '';
  const hasWatchSubpage = Boolean(watchSubpageUrl && canonicalizeCompareUrl(watchSubpageUrl) !== canonicalizeCompareUrl(finalUrl));
  const downloadSubpageUrl = baseline.hints.downloadSubpageUrl || '';
  const hasDownloadSubpage = Boolean(downloadSubpageUrl);

  // Episode ID params
  const episodeIdParamsFound: string[] = [];
  if (/[?&]vid=/i.test(html) || /vid=/i.test(finalUrl)) episodeIdParamsFound.push('vid');
  if (/[?&]ep=/i.test(html) || /ep=/i.test(finalUrl)) episodeIdParamsFound.push('ep');
  if (/[?&]episode=/i.test(html)) episodeIdParamsFound.push('episode');

  // Public API / Script endpoints discovery (static inspection + safe lightweight probes)
  const discoveredApis: DiscoveredApiEndpoint[] = [];
  if ($('script[type="application/ld+json"]').length > 0) {
    discoveredApis.push({
      type: 'json_ld',
      url: finalUrl,
      method: 'GET',
      reachable: true,
      sampleNote: 'تحتوي الصفحة على بيانات Schema.org JSON-LD مضمنة',
    });
  }
  if ($('script#__NEXT_DATA__').length > 0) {
    discoveredApis.push({
      type: 'next_data',
      url: finalUrl,
      method: 'GET',
      reachable: true,
      sampleNote: 'تحتوي الصفحة على حزمة __NEXT_DATA__ JSON',
    });
  }
  if (baseline.hints.ajaxEmbedIds.length > 0) {
    discoveredApis.push({
      type: 'ajax_embed',
      url: `${new URL(finalUrl).origin}/ajax/embed`,
      method: 'POST',
      reachable: true,
      sampleNote: `تم رصد ${baseline.hints.ajaxEmbedIds.length} معرف AJAX ديناميكي`,
    });
  }
  const allScripts = $('script')
    .map((_, el) => $(el).html() || '')
    .get()
    .join('\n');
  const wpAjaxMatch = allScripts.match(/https?:\/\/[^"'\s]+admin-ajax\.php/i);
  if (wpAjaxMatch?.[0]) {
    discoveredApis.push({
      type: 'admin_ajax',
      url: wpAjaxMatch[0],
      method: 'POST',
      reachable: true,
      sampleNote: 'تم رصد مرجع WordPress admin-ajax.php في سكربتات الصفحة',
    });
  }
  const wpJsonLink = $('link[rel="https://api.w.org/"]').attr('href');
  if (wpJsonLink) {
    discoveredApis.push({
      type: 'wordpress_rest',
      url: wpJsonLink,
      method: 'GET',
      reachable: true,
      sampleNote: 'واجهة WordPress REST API متاحة',
    });
  }
  if (cmsFingerprint === 'Blogger') {
    try {
      const origin = new URL(finalUrl).origin;
      discoveredApis.push({
        type: 'blogger_feed',
        url: `${origin}/feeds/posts/default?alt=json`,
        method: 'GET',
        reachable: true,
        sampleNote: 'خلاصة Blogger JSON Feed متاحة للموقع',
      });
    } catch {
      // ignore
    }
  }

  // ----------------- Diagnose the 8 Missing-Content Causes -----------------
  const diagnostics: ScraperDiagnosticIssue[] = [];

  if (isProtected) {
    diagnostics.push({
      code: 'access_blocked_or_protection',
      severity: 'critical',
      title: 'إشارات حماية أو تحقق بشري في الصفحة',
      probableCause: protectionReason || 'تم رصد إشارات حماية أو تحقق.',
      suggestedFix: 'إذا تعذر الجلب المباشر، الصق كود HTML من المتصفح في تبويب الاختبار.',
      evidence: `HTTP ${httpStatus}`,
    });
  }

  // 1. Episode count mismatch or legacy cap
  if (visibleEpisodeCount > baselineEpisodes || baselineEpisodes >= 40) {
    diagnostics.push({
      code: 'episode_count_mismatch_or_capped',
      severity: 'critical',
      title: `نقص في عدد الحلقات المستخرجة (${baselineEpisodes} من أصل ${visibleEpisodeCount} ظاهرة)`,
      probableCause:
        hasSeasonTabs && baselineSeasons <= 1 && adapterEpScan.seasons.length > 1
          ? `الجالب الافتراضي يدمج كل المواسم في موسم واحد ويحذف أرقام الحلقات المتكررة (مثل الحلقة 1 في الموسم 2 و3) أو يتجاهل نمط الترقيم المختصر مثل "1حلقة".`
          : baselineEpisodes >= 40
            ? 'الجالب الافتراضي يتوقف عند حد 40 حلقة فقط.'
            : 'توجد روابط حلقات لم يلتقطها التعبير القياسي الافتراضي أو تتطلب قراءة من قوائم التبويب/Select.',
      suggestedFix: `رفع حد الحلقات إلى ${candidateSeed.episodeRules.maxEpisodes} وتفعيل preserveMultiSeason وقراءة الحاويات (${candidateSeed.episodeRules.containerSelector}).`,
      evidence: `الأساسي: ${baselineEpisodes} حلقة / المكتشف متعدد المواسم: ${extractedAdapterEpCount} حلقة (عبر ${adapterEpScan.seasons.length} موسم)`,
    });
  }

  // 2. Missing servers per episode
  if (visibleServerCount > baselineServers || (visibleServerCount > 0 && baselineServers === 0)) {
    diagnostics.push({
      code: 'missing_servers_per_episode',
      severity: 'critical',
      title: `نقص في سيرفرات المشاهدة (${baselineServers} مستخرج مقابل ${visibleServerCount} ظاهر بالصفحة)`,
      probableCause: detectedUrlAttrs.has('data-embed-url')
        ? 'الموقع يخزن روابط السيرفرات داخل سمة data-embed-url وليس data-embed، ولذلك كان الجالب الافتراضي يلتقط iframe الافتراضي فقط ويتجاهل باقي السيرفرات.'
        : hasTabsForServers
          ? 'السيرفرات موزعة داخل أزرار/تبويبات ويتم تحميل Iframe واحد فقط عند فتح الصفحة.'
          : 'روابط السيرفرات موجودة في سمات مخصصة أو نصوص برمجية داخلية.',
      suggestedFix: `إضافة المحدد "${candidateSeed.serverRules.itemSelector}" مع أولوية السمات [${candidateSeed.serverRules.urlAttributes.slice(0, 5).join(', ')}].`,
      evidence: `سيرفرات أساسية: ${baselineServers} | سيرفرات مكتشفة بالتبويبات/السمات: ${visibleServerCount}${sampleServerNames.length ? ` (${sampleServerNames.slice(0, 5).join('، ')})` : ''}`,
    });
  }

  // 3. Episodes spread across separate pages or season panels
  if (hasSeasonTabs || (extractedAdapterEpCount > 0 && /watch\.php|play\.php/i.test(html))) {
    diagnostics.push({
      code: 'episodes_in_separate_pages_or_seasons',
      severity: adapterEpScan.seasons.length > baselineSeasons ? 'warning' : 'info',
      title: `توزيع الحلقات على ${adapterEpScan.seasons.length || seasonPanelsCount || 1} مواسم/صفحات منفصلة`,
      probableCause:
        'كل حلقة تقود إلى صفحة مستقلة أو تتوزع داخل تبويبات مواسم منفصلة (Tabs / Select)، مما يتطلب تتبع كل رابط حلقة واستخراج سيرفراته على حدة.',
      suggestedFix:
        'تفعيل ربط تبويبات المواسم (seasonTabSelector + seasonPanelSelector) وزحف صفحة كل حلقة على حدة مع مهلة بين الطلبات.',
      evidence: `المواسم المكتشفة: ${adapterEpScan.seasons.length || seasonTabsCount} | خيارات Select: ${hasSelectEpisodeDropdown ? 'نعم' : 'لا'}`,
    });
  }

  // 4. Pagination / Load more
  if (hasPagination || hasLoadMoreButton) {
    diagnostics.push({
      code: 'pagination_or_load_more',
      severity: 'warning',
      title: 'الموقع يستخدم تعدد الصفحات (Pagination) أو زر تحميل المزيد',
      probableCause:
        'قائمة الحلقات أو الأعمال مقسمة على أكثر من صفحة أو تُجلب عند النقر على تحميل المزيد.',
      suggestedFix:
        'تفعيل followPagination في قواعد التنقل مع تحديد paginationSelector لاستكمال الصفحات التالية تلقائياً.',
      evidence: paginationLinks.length > 0 ? `روابط صفحات مكتشفة: ${paginationLinks.slice(0, 2).join(' | ')}` : 'إشارات Load More في HTML',
    });
  }

  // 5. Servers inside UI tabs
  if (hasTabsForServers) {
    diagnostics.push({
      code: 'servers_inside_tabs',
      severity: 'warning',
      title: 'السيرفرات معروضة داخل تبويبات تفاعلية (Tabs / List)',
      probableCause:
        'واجهة المشغل تعرض سيرفراً واحداً نشطاً في Iframe وتضع بقية السيرفرات وأسماءها داخل عناصر قائمة/تبويب.',
      suggestedFix: `قراءة عناصر التبويب عبر "${candidateSeed.serverRules.itemSelector}" مع حفظ الأسماء الحقيقية (preserveServerNames: true).`,
      evidence: `المحدد المطابق: ${bestServerSelector} (${bestServerEls.length} عنصر)`,
    });
  }

  // 6. Dynamic AJAX or public JSON API
  if (discoveredApis.length > 0) {
    diagnostics.push({
      code: 'dynamic_ajax_or_json_api',
      severity: 'info',
      title: 'تتوفر بيانات ديناميكية أو واجهات JSON/AJAX عامة في الصفحة',
      probableCause:
        'الموقع يعتمد على بيانات JSON-LD أو حزم بيانات/AJAX عامة يمكن قراءتها بشكل منظم دون تنفيذ سكربتات غير موثوقة.',
      suggestedFix: 'الاستفادة من بيانات JSON/AJAX المصرح بها وتكامل /ajax/embed عند توفر معرفات.',
      evidence: discoveredApis.map((a) => `${a.type}: ${a.sampleNote}`).join(' | '),
    });
  }

  // 7. Structural difference between series page & episode/watch subpage
  if (hasWatchSubpage || (contentTypeHint === 'series' && /watch\.php|play\.php/i.test(finalUrl))) {
    diagnostics.push({
      code: 'episode_page_differs_from_series',
      severity: 'warning',
      title: 'اختلاف بنية صفحة الحلقة عن صفحة المشغل الفرعية أو المسلسل',
      probableCause: hasWatchSubpage
        ? 'صفحة العمل/الحلقة الرئيسية لا تعرض المشغل مباشرة بل تحيل عبر رابط فرعي (مثل watch.php -> play.php).'
        : 'رابط البداية يشير إلى صفحة مشغل فرعية (play.php) تختلف بنيتها عن صفحة التفاصيل الرئيسية.',
      suggestedFix:
        'تفعيل followWatchSubpage وتجاهل أزرار الإعلانات (.pm-ads-banner) والاعتماد على watchSubpageSelector الدقيق مع مطابقة معرف الحلقة (vid).',
      evidence: hasWatchSubpage ? `رابط المشاهدة الفرعي المكتشف: ${watchSubpageUrl}` : `الصفحة الحالية: ${finalUrl}`,
    });
  }

  // 8. Site-specific server extraction & real server name reading
  if (sampleServerNames.length > 0) {
    diagnostics.push({
      code: 'site_specific_server_pattern_or_names',
      severity: 'warning',
      title: 'أسماء السيرفرات الحقيقية لا يلتقطها الجالب العام',
      probableCause:
        'الجالب العام يستبدل أسماء مزودي البث بأرقام عامة (سيرفر 1، سيرفر 2) ويتجاهل الأسماء النصية داخل أزرار المشغل.',
      suggestedFix:
        'تفعيل preserveServerNames واستخراج الاسم عبر nameSelector من كل عنصر سيرفر.',
      evidence: `أسماء السيرفرات الحقيقية المكتشفة: ${sampleServerNames.slice(0, 8).join('، ')}`,
    });
  }

  return {
    ok: true,
    targetUrl: url || finalUrl,
    domain,
    contentTypeHint,
    analyzedAt,
    matchedExistingAdapterId: matchedExisting?.id,
    signals: {
      httpStatus,
      finalUrl,
      pageTitle,
      cmsFingerprint,
      isProtectedOrBlocked: isProtected,
      protectionReason,
      hasTabsForServers,
      serverTabSelectorMatched: bestServerSelector,
      serverContainerCount: bestServerEls.length,
      hasSeasonTabs,
      seasonCountDetected: Math.max(adapterEpScan.seasons.length, seasonTabsCount),
      hasSelectEpisodeDropdown,
      visibleEpisodeCount,
      visibleServerCount,
      hasPagination,
      paginationLinks,
      hasLoadMoreButton,
      hasWatchSubpage,
      watchSubpageUrl,
      hasDownloadSubpage,
      downloadSubpageUrl,
      episodeIdParamsFound,
      discoveredApis,
      sampleServerNames,
      sampleEpisodeLabels,
    },
    diagnostics,
    baselineCounts: {
      episodes: baselineEpisodes,
      servers: baselineServers,
      seasons: baselineSeasons,
    },
    proposedAdapter: candidateSeed,
  };
}

// ----------------- Declarative Adapter Execution -----------------

export interface EpisodeBindingValidationMapEntry {
  valid: boolean;
  note?: string;
  sourceUrl: string;
  watchSubpageUrl?: string;
}

function validateSeriesEpisodeServerBindings(
  seasons: BaselineScrapedMedia['seasons'],
  provenanceMap: Map<string, { expectedSourceUrl: string; fetchedUrls: string[]; watchSubpageUrl?: string; clonedFromRoot?: boolean; invalidReason?: string }>,
  sourceOrigin: string
): {
  validEpisodes: number;
  invalidEpisodes: number;
  duplicateServerSetsCount: number;
  crossEpisodeContaminationDetected: boolean;
  notes: string[];
  perEpisode: Map<string, EpisodeBindingValidationMapEntry>;
} {
  const perEpisode = new Map<string, EpisodeBindingValidationMapEntry>();
  const serverSignatureOwners = new Map<string, { epKey: string; sourceUrl: string }[]>();
  let validEpisodes = 0;
  let invalidEpisodes = 0;
  let crossEpisodeContaminationDetected = false;
  const notes: string[] = [];

  for (const season of seasons) {
    for (const ep of season.episodes) {
      const epKey = `${season.seasonNumber}:${ep.number}`;
      const prov = provenanceMap.get(epKey);
      const srvs = ep.servers || [];
      const srcUrl = ep.sourceUrl || prov?.expectedSourceUrl || '';
      let valid = true;
      let note = '';

      if (prov?.invalidReason) {
        valid = false;
        note = prov.invalidReason;
        crossEpisodeContaminationDetected = true;
      } else if (!srcUrl) {
        valid = false;
        note = 'لا يوجد رابط أصلي للحلقة (sourceUrl)';
        crossEpisodeContaminationDetected = true;
      } else if (prov?.clonedFromRoot) {
        valid = false;
        note = 'تم منع نسخ سيرفرات صفحة المسلسل/الجذر إلى الحلقة';
        crossEpisodeContaminationDetected = true;
      } else {
        const badSrv = srvs.find(
          (s) => !s.url || isLikelyNonVideoWebsiteUrl(s.url, sourceOrigin)
        );
        if (badSrv) {
          valid = false;
          note = `سيرفر غير صالح أو يشير إلى صفحة موقع: ${badSrv.url || '(فارغ)'}`;
        }
      }

      if (valid) validEpisodes += 1;
      else invalidEpisodes += 1;

      perEpisode.set(epKey, {
        valid,
        note: note || undefined,
        sourceUrl: srcUrl,
        watchSubpageUrl: ep.watchSubpageUrl || prov?.watchSubpageUrl,
      });

      if (srvs.length > 0 && srcUrl) {
        const sig = srvs.map((s) => canonicalizeCompareUrl(s.url)).sort().join('|');
        const list = serverSignatureOwners.get(sig) || [];
        list.push({ epKey, sourceUrl: canonicalizeCompareUrl(srcUrl) });
        serverSignatureOwners.set(sig, list);
      }
    }
  }

  let duplicateServerSetsCount = 0;
  for (const [, owners] of serverSignatureOwners.entries()) {
    const uniqueSrcUrls = new Set(owners.map((o) => o.sourceUrl).filter(Boolean));
    if (owners.length > 1 && uniqueSrcUrls.size > 1) {
      duplicateServerSetsCount += owners.length - 1;
    }
  }

  if (crossEpisodeContaminationDetected) {
    notes.push('تم رصد خلل في استقلالية مصدر السيرفرات لإحدى الحلقات.');
  }
  if (invalidEpisodes > 0) {
    notes.push(`يوجد ${invalidEpisodes} حلقة لم يتحقق ربط سيرفراتها بشكل سليم.`);
  }
  if (duplicateServerSetsCount > 0) {
    notes.push(`ملاحظة: ${duplicateServerSetsCount} حلقات بروابط مستقلة أعادت نفس روابط التضمين من الموقع المصدر.`);
  }

  return {
    validEpisodes,
    invalidEpisodes,
    duplicateServerSetsCount,
    crossEpisodeContaminationDetected,
    notes,
    perEpisode,
  };
}

export async function executeAdapterScrape(params: {
  url: string;
  rawHtml?: string;
  adapter: ScraperAdapter;
  baselineParseFn: BaselineParseFn;
  ajaxEmbedResolverFn?: (
    ajaxEmbedIds: { id: string; label: string }[],
    candidateOrigins: string[],
    refererUrl: string,
    quality: string
  ) => Promise<BaselineScrapedMedia['servers']>;
  contentTypeHint?: AdapterContentTypeHint;
  deepEpisodeCrawl?: boolean;
  maxEpisodesForCrawl?: number;
}): Promise<{
  ok: boolean;
  media: BaselineScrapedMedia;
  visibleEpisodesHint: number;
  visibleServersHint: number;
  failedServers: FailedServerReport[];
  validationSummary?: ScraperTestResult['validationSummary'];
  episodeValidationMap?: Map<string, EpisodeBindingValidationMapEntry>;
  error?: string;
}> {
  const {
    url,
    rawHtml,
    adapter,
    baselineParseFn,
    ajaxEmbedResolverFn,
    contentTypeHint = adapter.contentTypeHint || 'auto',
    deepEpisodeCrawl = true,
    maxEpisodesForCrawl,
  } = params;

  let html = rawHtml || '';
  let effectiveUrl = url || '';

  if (!html || html.trim().length < 50) {
    const fetched = await safeFetchRemoteText(url, {
      timeoutMs: 12000,
      delayMs: adapter.siteSettings.requestDelayMs,
    });
    if (!fetched.ok || !fetched.text || fetched.text.length < 100) {
      const emptyMedia = baselineParseFn('<html></html>', url || 'https://example.com').media;
      return {
        ok: false,
        media: emptyMedia,
        visibleEpisodesHint: 0,
        visibleServersHint: 0,
        failedServers: [],
        error: fetched.errorReason || `فشل جلب الصفحة (HTTP ${fetched.status})`,
      };
    }
    html = fetched.text;
    effectiveUrl = fetched.finalUrl || url;
  } else if (!effectiveUrl) {
    const canonicalMatch =
      html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      '';
    effectiveUrl = canonicalMatch || 'https://example.com';
  }

  let sourceOrigin = '';
  try {
    sourceOrigin = new URL(effectiveUrl).origin;
  } catch {
    sourceOrigin = '';
  }

  const $ = cheerio.load(html);
  const baseline = baselineParseFn(html, effectiveUrl);
  const media: BaselineScrapedMedia = {
    ...baseline.media,
    sourceUrl: effectiveUrl,
  };

  if (contentTypeHint === 'movie') media.kind = 'movie';
  else if (contentTypeHint === 'series' || contentTypeHint === 'episode') media.kind = 'series';

  // 1. Extract servers on current page using Adapter rules
  const rootSrvExtract = extractServersWithAdapter($, effectiveUrl, adapter, media.quality);
  const rawRootServers = [...rootSrvExtract.servers];
  const ajaxIds = [...rootSrvExtract.ajaxIds];

  // 2. Follow watch subpage ONLY if ID-compatible (e.g. watch.php?vid=X -> play.php?vid=X)
  const watchSubpageUrl = adapter.navigationRules.followWatchSubpage
    ? findBestWatchSubpageUrl($, effectiveUrl, adapter) || ''
    : '';
  let visibleServersHint = Math.max(
    rawRootServers.length,
    ajaxIds.length,
    $('iframe').filter((_, el) => $(el).closest(IGNORED_PAGE_CONTAINER_SELECTOR).length === 0).length
  );

  if (watchSubpageUrl && canonicalizeCompareUrl(watchSubpageUrl) !== canonicalizeCompareUrl(effectiveUrl)) {
    const watchRes = await safeFetchRemoteText(watchSubpageUrl, {
      timeoutMs: 9000,
      referer: adapter.siteSettings.refererMode === 'none' ? undefined : effectiveUrl,
      delayMs: adapter.siteSettings.requestDelayMs,
    });
    if (watchRes.ok && watchRes.text.length > 100) {
      const $w = cheerio.load(watchRes.text);
      const wExtract = extractServersWithAdapter($w, watchSubpageUrl, adapter, media.quality);
      const seen = new Set(rawRootServers.map((s) => s.url));
      for (const s of wExtract.servers) {
        if (!seen.has(s.url)) {
          rawRootServers.push(s);
          seen.add(s.url);
        }
      }
      for (const a of wExtract.ajaxIds) {
        if (!ajaxIds.some((x) => x.id === a.id)) ajaxIds.push(a);
      }
      visibleServersHint = Math.max(visibleServersHint, wExtract.servers.length + wExtract.ajaxIds.length);
      if (media.downloads.length === 0) {
        const wBase = baselineParseFn(watchRes.text, watchSubpageUrl);
        if (wBase.media.downloads.length > 0) media.downloads = wBase.media.downloads;
      }
    }
  }

  // 3. Resolve dynamic AJAX embeds if servers still empty and ajaxIds exist
  if (rawRootServers.length === 0 && ajaxIds.length > 0 && ajaxEmbedResolverFn) {
    const origins = Array.from(new Set([...baseline.hints.candidateOrigins, sourceOrigin].filter(Boolean)));
    const resolvedAjax = await ajaxEmbedResolverFn(ajaxIds, origins, effectiveUrl, media.quality);
    for (const s of resolvedAjax) {
      if (!rawRootServers.some((x) => x.url === s.url)) {
        rawRootServers.push(s);
      }
    }
  }

  const failedServers: FailedServerReport[] = [];
  const rootVerify = await verifyServersList(rawRootServers, sourceOrigin, adapter.siteSettings.verifyMode);
  media.servers = rootVerify.kept;
  failedServers.push(...rootVerify.failed);

  // 4. Extract ALL Seasons & Episodes FIRST (including distributed season pages & pagination)
  if (contentTypeHint !== 'movie') {
    const epExtract = extractSeasonsAndEpisodesWithAdapter(
      $,
      effectiveUrl,
      adapter,
      media.year,
      media.quality
    );
    const seasons = epExtract.seasons;
    let visibleEpisodesHint = epExtract.visibleEpisodesHint;

    const mergeExtractedSeasons = (incomingSeasons: typeof seasons): number => {
      let addedCount = 0;
      for (const nextSeason of incomingSeasons) {
        const targetSeason = seasons.find((s) => s.seasonNumber === nextSeason.seasonNumber);
        if (!targetSeason) {
          seasons.push(nextSeason);
          addedCount += nextSeason.episodes.length;
        } else {
          for (const ep of nextSeason.episodes) {
            if (!targetSeason.episodes.some((e) => e.number === ep.number)) {
              targetSeason.episodes.push(ep);
              addedCount += 1;
            }
          }
          targetSeason.episodes.sort((a, b) => a.number - b.number);
        }
      }
      return addedCount;
    };

    // 4a. Follow distributed multi-season links (e.g. separate season pages /season-2, /season-3)
    const canonEffective = canonicalizeCompareUrl(effectiveUrl);
    if (adapter.episodeRules.preserveMultiSeason && epExtract.seasonPageLinks.length > 0) {
      const visitedSeasonPages = new Set<string>([canonEffective]);
      for (const sLink of epExtract.seasonPageLinks) {
        const canonSeasonUrl = canonicalizeCompareUrl(sLink.url);
        if (!canonSeasonUrl || visitedSeasonPages.has(canonSeasonUrl)) continue;
        visitedSeasonPages.add(canonSeasonUrl);
        const sRes = await safeFetchRemoteText(sLink.url, {
          timeoutMs: 9000,
          referer: effectiveUrl,
          delayMs: adapter.siteSettings.requestDelayMs,
        });
        if (!sRes.ok || sRes.text.length < 100) continue;
        const $s = cheerio.load(sRes.text);
        const sExtract = extractSeasonsAndEpisodesWithAdapter(
          $s,
          sLink.url,
          adapter,
          media.year,
          media.quality,
          { forcedSeasonNumber: sLink.seasonNumber }
        );
        const added = mergeExtractedSeasons(sExtract.seasons);
        visibleEpisodesHint += added;
      }
      seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
    }

    // 4b. Pagination loop if configured and URLs were fetched
    if (
      adapter.navigationRules.followPagination &&
      epExtract.paginationLinks.length > 0 &&
      (!rawHtml || rawHtml.trim().length < 50)
    ) {
      const visitedPag = new Set<string>([canonEffective]);
      const queue = [...epExtract.paginationLinks];
      let pagesVisited = 1;
      const maxPag = Math.max(1, Math.min(20, adapter.navigationRules.maxPaginationPages || 6));

      while (queue.length > 0 && pagesVisited < maxPag) {
        const nextUrl = queue.shift()!;
        const canonNext = canonicalizeCompareUrl(nextUrl);
        if (visitedPag.has(canonNext)) continue;
        visitedPag.add(canonNext);
        pagesVisited += 1;

        const nextRes = await safeFetchRemoteText(nextUrl, {
          timeoutMs: 9000,
          referer: effectiveUrl,
          delayMs: adapter.siteSettings.requestDelayMs,
        });
        if (!nextRes.ok || nextRes.text.length < 100) continue;
        const $next = cheerio.load(nextRes.text);
        const nextExtract = extractSeasonsAndEpisodesWithAdapter($next, nextUrl, adapter, media.year, media.quality);
        const newlyAddedOnPage = mergeExtractedSeasons(nextExtract.seasons);
        visibleEpisodesHint += newlyAddedOnPage;
        if (newlyAddedOnPage === 0) break;
        for (const moreUrl of nextExtract.paginationLinks) {
          if (!visitedPag.has(canonicalizeCompareUrl(moreUrl)) && !queue.includes(moreUrl)) {
            queue.push(moreUrl);
          }
        }
      }
      seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
    }

    if (seasons.length > 0) {
      media.seasons = seasons;
      if (media.kind !== 'wrestling') media.kind = 'series';
    }

    const provenanceMap = new Map<
      string,
      { expectedSourceUrl: string; fetchedUrls: string[]; watchSubpageUrl?: string; clonedFromRoot?: boolean; invalidReason?: string }
    >();

    // 5. Per-Episode Independent Server Extraction across ALL Seasons
    if (deepEpisodeCrawl && media.seasons.length > 0) {
      type CrawlTarget = { seasonNumber: number; ep: BaselineScrapedMedia['seasons'][number]['episodes'][number] };
      const allTargetsSequential: CrawlTarget[] = media.seasons.flatMap((s) =>
        s.episodes.map((ep) => ({ seasonNumber: s.seasonNumber, ep }))
      );

      // Build fair round-robin list across all seasons when capped for test speed
      let crawlTargets: CrawlTarget[] = allTargetsSequential;
      if (maxEpisodesForCrawl && allTargetsSequential.length > maxEpisodesForCrawl) {
        const roundRobin: CrawlTarget[] = [];
        const maxLenInAnySeason = Math.max(...media.seasons.map((s) => s.episodes.length));
        for (let idx = 0; idx < maxLenInAnySeason && roundRobin.length < maxEpisodesForCrawl; idx++) {
          for (const season of media.seasons) {
            if (season.episodes[idx] && roundRobin.length < maxEpisodesForCrawl) {
              roundRobin.push({ seasonNumber: season.seasonNumber, ep: season.episodes[idx] });
            }
          }
        }
        crawlTargets = roundRobin;
      }

      // Count how many episodes explicitly share canonEffective (must be <= 1 to avoid series-page cloning)
      const matchingEffectiveCount = allTargetsSequential.filter(
        ({ ep }) => canonicalizeCompareUrl(ep.sourceUrl || ep.watchUrl || '') === canonEffective
      ).length;

      // Per-URL fetch cache within this run (keyed strictly by canonical URL, never across distinct episodes)
      const fetchedHtmlCache = new Map<string, { ok: boolean; text: string; finalUrl: string }>();
      const fetchCachedUrl = async (targetUrl: string, refererUrl: string) => {
        const canon = canonicalizeCompareUrl(targetUrl);
        const cached = fetchedHtmlCache.get(canon);
        if (cached) return cached;
        const res = await safeFetchRemoteText(targetUrl, {
          timeoutMs: 9000,
          referer: refererUrl,
          delayMs: adapter.siteSettings.requestDelayMs,
        });
        const entry = { ok: res.ok, text: res.text, finalUrl: res.finalUrl || targetUrl };
        fetchedHtmlCache.set(canon, entry);
        return entry;
      };

      const idParam = adapter.episodeRules.episodeIdParam || 'vid';
      const customWatchSel = adapter.pageDetection.watchSubpageSelector.trim();
      const CONCURRENCY = 3;

      for (let i = 0; i < crawlTargets.length; i += CONCURRENCY) {
        const chunk = crawlTargets.slice(i, i + CONCURRENCY);
        await Promise.all(
          chunk.map(async ({ seasonNumber, ep }) => {
            const originalEpUrl = (ep.sourceUrl || ep.watchUrl || '').trim();
            ep.sourceUrl = originalEpUrl;
            const canonEp = canonicalizeCompareUrl(originalEpUrl);
            const epKey = `${seasonNumber}:${ep.number}`;

            if (!canonEp) {
              ep.servers = [];
              ep.watchUrl = '';
              provenanceMap.set(epKey, {
                expectedSourceUrl: '',
                fetchedUrls: [],
                invalidReason: 'لا يوجد رابط مستقل للحلقة — تم منع نسخ سيرفرات صفحة المسلسل',
              });
              return;
            }

            // Reuse root extraction ONLY when the episode URL genuinely IS the effective URL of that single episode
            if (canonEp === canonEffective) {
              if (matchingEffectiveCount > 1) {
                ep.servers = [];
                ep.watchUrl = '';
                provenanceMap.set(epKey, {
                  expectedSourceUrl: originalEpUrl,
                  fetchedUrls: [],
                  clonedFromRoot: true,
                  invalidReason: 'عدة حلقات تشترك في نفس رابط الجذر — تم منع التعميم التلقائي للسيرفرات',
                });
                return;
              }
              ep.servers = media.servers.map((s, sIdx) => ({
                ...s,
                id: `ep-s${seasonNumber}-e${ep.number}-srv-${sIdx + 1}`,
              }));
              ep.watchSubpageUrl = watchSubpageUrl || undefined;
              ep.watchUrl = ep.servers[0]?.url || '';
              provenanceMap.set(epKey, {
                expectedSourceUrl: originalEpUrl,
                fetchedUrls: [effectiveUrl, ...(watchSubpageUrl ? [watchSubpageUrl] : [])],
                watchSubpageUrl: watchSubpageUrl || undefined,
              });
              return;
            }

            const epRes = await fetchCachedUrl(originalEpUrl, effectiveUrl);
            if (!epRes.ok || epRes.text.length < 100) {
              ep.servers = [];
              ep.watchUrl = '';
              provenanceMap.set(epKey, {
                expectedSourceUrl: originalEpUrl,
                fetchedUrls: [],
                invalidReason: 'تعذر جلب صفحة الحلقة المستقلة',
              });
              return;
            }

            const fetchedUrls = [originalEpUrl];
            const $ep = cheerio.load(epRes.text);
            const epSrvExtract = extractServersWithAdapter($ep, originalEpUrl, adapter, media.quality);
            let epRawServers = [...epSrvExtract.servers];
            const epAjaxIds = [...epSrvExtract.ajaxIds];
            let matchedWatchSubUrl = '';

            // 1-hop follow for intermediate watch pages like watch.php?vid=ID -> play.php?vid=ID
            if (adapter.navigationRules.followWatchSubpage) {
              const epWatchUrl = findBestWatchSubpageUrl($ep, originalEpUrl, adapter);
              const canonEpWatch = canonicalizeCompareUrl(epWatchUrl);
              if (epWatchUrl && canonEpWatch !== canonEp && canonEpWatch !== canonEffective) {
                const epUrlId = extractEpisodeIdFromUrl(originalEpUrl, idParam);
                const watchUrlId = extractEpisodeIdFromUrl(epWatchUrl, idParam);
                const isExactIdMatch = Boolean(epUrlId && watchUrlId && epUrlId === watchUrlId);
                const hasCustomWatchSelector = Boolean(customWatchSel && $ep(customWatchSel).length > 0);

                if (epRawServers.length === 0 || isExactIdMatch || hasCustomWatchSelector) {
                  matchedWatchSubUrl = epWatchUrl;
                  fetchedUrls.push(epWatchUrl);
                  const subRes = await fetchCachedUrl(epWatchUrl, originalEpUrl);
                  if (subRes.ok && subRes.text.length > 100) {
                    const $sub = cheerio.load(subRes.text);
                    const subSrv = extractServersWithAdapter($sub, epWatchUrl, adapter, media.quality);
                    if (subSrv.servers.length > 0) {
                      const merged: typeof epRawServers = [];
                      const seenMerged = new Set<string>();
                      const pushUnique = (srvList: typeof epRawServers) => {
                        for (const srv of srvList) {
                          if (!seenMerged.has(srv.url)) {
                            seenMerged.add(srv.url);
                            merged.push(srv);
                          }
                        }
                      };
                      // Prefer intermediate watch subpage servers first, keeping order & real names
                      pushUnique(subSrv.servers);
                      pushUnique(epRawServers);
                      epRawServers = merged;
                    }
                    for (const a of subSrv.ajaxIds) {
                      if (!epAjaxIds.some((x) => x.id === a.id)) epAjaxIds.push(a);
                    }
                  }
                }
              }
            }

            if (epRawServers.length === 0 && epAjaxIds.length > 0 && ajaxEmbedResolverFn) {
              const resolved = await ajaxEmbedResolverFn(
                epAjaxIds,
                [sourceOrigin].filter(Boolean),
                originalEpUrl,
                media.quality
              );
              epRawServers.push(...resolved);
            }

            const epVerified = await verifyServersList(
              epRawServers,
              sourceOrigin,
              adapter.siteSettings.verifyMode,
              ep.number
            );
            ep.servers = epVerified.kept.map((s, sIdx) => ({
              ...s,
              id: `ep-s${seasonNumber}-e${ep.number}-srv-${sIdx + 1}`,
            }));
            if (matchedWatchSubUrl) {
              ep.watchSubpageUrl = matchedWatchSubUrl;
            }
            failedServers.push(...epVerified.failed);
            ep.watchUrl = ep.servers[0]?.url || '';
            provenanceMap.set(epKey, {
              expectedSourceUrl: originalEpUrl,
              fetchedUrls,
              watchSubpageUrl: matchedWatchSubUrl || undefined,
            });
          })
        );
      }

      if (media.servers.length === 0) {
        const firstWithServers = allTargetsSequential.find((t) => t.ep.servers && t.ep.servers.length > 0)?.ep;
        if (firstWithServers?.servers) {
          media.servers = firstWithServers.servers.map((s, sIdx) => ({
            ...s,
            id: `srv-adp-${sIdx + 1}`,
          }));
        }
      }
    }

    const validation = validateSeriesEpisodeServerBindings(media.seasons, provenanceMap, sourceOrigin);
    return {
      ok: true,
      media,
      visibleEpisodesHint,
      visibleServersHint,
      failedServers,
      validationSummary: {
        validEpisodes: validation.validEpisodes,
        invalidEpisodes: validation.invalidEpisodes,
        duplicateServerSetsCount: validation.duplicateServerSetsCount,
        crossEpisodeContaminationDetected: validation.crossEpisodeContaminationDetected,
        notes: validation.notes,
      },
      episodeValidationMap: validation.perEpisode,
    };
  } else {
    media.seasons = [];
  }

  return {
    ok: true,
    media,
    visibleEpisodesHint: 0,
    visibleServersHint,
    failedServers,
  };
}

// ----------------- Pre-Save Test, Preview & Diff Comparison Engine -----------------

export async function testAdapterCandidate(params: {
  url: string;
  rawHtml?: string;
  adapter: ScraperAdapter;
  previousAdapter?: ScraperAdapter | null;
  contentTypeHint?: AdapterContentTypeHint;
  baselineParseFn: BaselineParseFn;
  ajaxEmbedResolverFn?: (
    ajaxEmbedIds: { id: string; label: string }[],
    candidateOrigins: string[],
    refererUrl: string,
    quality: string
  ) => Promise<BaselineScrapedMedia['servers']>;
}): Promise<ScraperTestResult> {
  const startedAt = Date.now();
  const {
    url,
    rawHtml,
    adapter,
    previousAdapter,
    contentTypeHint = adapter.contentTypeHint || 'auto',
    baselineParseFn,
    ajaxEmbedResolverFn,
  } = params;

  const domain = normalizeAdapterDomain(url || adapter.domain) || adapter.domain;
  const testedAt = new Date().toISOString();

  // For pre-save testing speed & politeness, verify up to 36 episodes distributed across all seasons
  const execResult = await executeAdapterScrape({
    url,
    rawHtml,
    adapter,
    baselineParseFn,
    ajaxEmbedResolverFn,
    contentTypeHint,
    deepEpisodeCrawl: true,
    maxEpisodesForCrawl: 36,
  });

  const media = execResult.media;
  const seasons = media.seasons || [];
  const episodesReport: TestedEpisodeReport[] = [];
  const missingEpisodes: MissingEpisodeReport[] = [];
  const allServerNames = new Set<string>();

  for (const srv of media.servers || []) {
    if (srv.name) allServerNames.add(srv.name);
  }

  let totalServersAcrossEpisodes = 0;
  let minSrv = Number.MAX_SAFE_INTEGER;
  let maxSrv = 0;

  for (const season of seasons) {
    const epNums = season.episodes.map((e) => e.number).sort((a, b) => a - b);
    const maxEpInSeason = epNums[epNums.length - 1] || 0;
    const epNumSet = new Set(epNums);

    for (let expected = 1; expected <= maxEpInSeason; expected++) {
      if (!epNumSet.has(expected)) {
        missingEpisodes.push({
          seasonNumber: season.seasonNumber,
          episodeNumber: expected,
          reason: `فجوة ترقيم في ${season.label}: الحلقة ${expected} غير موجودة ضمن النطاق 1-${maxEpInSeason}.`,
        });
      }
    }

    for (const ep of season.episodes) {
      const srvs = ep.servers || [];
      srvs.forEach((s) => {
        if (s.name) allServerNames.add(s.name);
      });
      const count = srvs.length;
      totalServersAcrossEpisodes += count;
      if (count < minSrv) minSrv = count;
      if (count > maxSrv) maxSrv = count;

      const vEntry = execResult.episodeValidationMap?.get(`${season.seasonNumber}:${ep.number}`);
      episodesReport.push({
        seasonNumber: season.seasonNumber,
        seasonLabel: season.label,
        episodeNumber: ep.number,
        title: ep.title,
        watchUrl: ep.watchUrl || '',
        sourceUrl: ep.sourceUrl || vEntry?.sourceUrl,
        watchSubpageUrl: ep.watchSubpageUrl || vEntry?.watchSubpageUrl,
        serverBindingValid: vEntry ? vEntry.valid : true,
        validationNote: vEntry?.note,
        serversCount: count,
        serverNames: srvs.map((s) => s.name),
        serverUrls: srvs.map((s) => s.url),
        status: count >= Math.max(1, Math.min(2, execResult.visibleServersHint)) ? 'complete' : count > 0 ? 'partial' : 'empty',
      });
    }
  }

  if (episodesReport.length === 0) {
    minSrv = media.servers.length;
    maxSrv = media.servers.length;
  }

  const totalServersExtracted =
    episodesReport.length > 0 ? totalServersAcrossEpisodes : media.servers.length;
  const avgServersPerEpisode =
    episodesReport.length > 0
      ? Math.round((totalServersAcrossEpisodes / episodesReport.length) * 10) / 10
      : media.servers.length;

  const episodesDiscovered = episodesReport.length;
  const visibleEpisodesHint = execResult.visibleEpisodesHint;
  const visibleServersHint = execResult.visibleServersHint;

  if (visibleEpisodesHint > episodesDiscovered) {
    missingEpisodes.push({
      seasonNumber: 1,
      episodeNumber: visibleEpisodesHint,
      reason: `يظهر في الصفحة ${visibleEpisodesHint} حلقة/عنصراً بينما تم استخراج ${episodesDiscovered} فقط.`,
    });
  }

  const epCoverage =
    visibleEpisodesHint > 0
      ? Math.min(100, Math.round((episodesDiscovered / visibleEpisodesHint) * 100))
      : episodesDiscovered > 0
        ? 100
        : contentTypeHint === 'movie'
          ? 100
          : 0;
  const srvCoverage =
    visibleServersHint > 0
      ? Math.min(100, Math.round((media.servers.length / visibleServersHint) * 100))
      : media.servers.length > 0
        ? 100
        : 0;

  let completenessVerdict: 'complete' | 'partial' | 'incomplete' = 'complete';
  const comparisonNotes: string[] = [];
  const hasBindingFailure = Boolean(
    execResult.validationSummary &&
      (execResult.validationSummary.invalidEpisodes > 0 ||
        execResult.validationSummary.crossEpisodeContaminationDetected)
  );

  if (!execResult.ok || (media.servers.length === 0 && episodesDiscovered === 0)) {
    completenessVerdict = 'incomplete';
    comparisonNotes.push(execResult.error || 'لم يتم استخراج أي سيرفرات أو حلقات صالحة.');
  } else if (
    hasBindingFailure ||
    visibleEpisodesHint > episodesDiscovered ||
    visibleServersHint > media.servers.length ||
    missingEpisodes.length > 0 ||
    execResult.failedServers.length > 0 ||
    (episodesReport.length > 0 && episodesReport.some((e) => e.serversCount === 0))
  ) {
    completenessVerdict =
      !hasBindingFailure && media.servers.length > 0 && srvCoverage >= 60 && epCoverage >= 70 ? 'partial' : 'incomplete';
    if (hasBindingFailure && execResult.validationSummary?.notes?.length) {
      comparisonNotes.push(...execResult.validationSummary.notes);
    }
    if (visibleEpisodesHint > episodesDiscovered) {
      comparisonNotes.push(`استُخرج ${episodesDiscovered} من أصل ${visibleEpisodesHint} حلقة ظاهرة.`);
    }
    if (visibleServersHint > media.servers.length) {
      comparisonNotes.push(`استُخرج ${media.servers.length} من أصل ${visibleServersHint} سيرفر ظاهر في الصفحة.`);
    }
    if (execResult.failedServers.length > 0) {
      comparisonNotes.push(`فشل أو استُبعد ${execResult.failedServers.length} سيرفر أثناء التحقق.`);
    }
  } else {
    comparisonNotes.push('تطابق كامل بين البيانات الظاهرة على الصفحة والنتائج المستخرجة.');
  }

  // Strict honesty rule: Never mark 'supported' if accessible items are incomplete or binding failed
  let recommendedStatus: AdapterStatus = 'supported';
  let recommendedStatusReason = 'اكتمل الاستخراج بنجاح وتطابقت السيرفرات والحلقات الممكن الوصول إليها.';

  if (!execResult.ok || (media.servers.length === 0 && episodesDiscovered === 0)) {
    recommendedStatus = 'failed';
    recommendedStatusReason = execResult.error || 'فشل الجلب: لم يتم استخراج أي سيرفر أو حلقة.';
  } else if (completenessVerdict !== 'complete') {
    recommendedStatus = 'needs_fix';
    recommendedStatusReason = comparisonNotes.join(' ');
  }

  // Build comparisonDiff when testing an improvement over an existing adapter
  let comparisonDiff: ScraperComparisonDiff | undefined;
  if (previousAdapter) {
    const prevSummary = previousAdapter.lastTestSummary;
    let prevEps = prevSummary?.episodesDiscovered ?? 0;
    let prevSrvs = prevSummary?.totalServersExtracted ?? 0;

    if (!prevSummary) {
      const prevRun = await executeAdapterScrape({
        url,
        rawHtml,
        adapter: previousAdapter,
        baselineParseFn,
        ajaxEmbedResolverFn,
        contentTypeHint,
        deepEpisodeCrawl: false,
      });
      prevEps = (prevRun.media.seasons || []).reduce((acc, s) => acc + s.episodes.length, 0);
      prevSrvs = prevRun.media.servers.length;
    }

    const epDelta = episodesDiscovered - prevEps;
    const srvDelta = totalServersExtracted - prevSrvs;
    comparisonDiff = {
      previousVersion: previousAdapter.version,
      candidateVersion: adapter.version,
      previousEpisodes: prevEps,
      candidateEpisodes: episodesDiscovered,
      episodesDelta: epDelta,
      previousServers: prevSrvs,
      candidateServers: totalServersExtracted,
      serversDelta: srvDelta,
      newlyDiscoveredServerNames: Array.from(allServerNames),
      resolvedDiagnosticCodes: [],
      summary: `المقارنة مع v${previousAdapter.version}: الحلقات ${prevEps} ← ${episodesDiscovered} (${epDelta >= 0 ? '+' : ''}${epDelta}) | إجمالي السيرفرات ${prevSrvs} ← ${totalServersExtracted} (${srvDelta >= 0 ? '+' : ''}${srvDelta})`,
    };
  }

  const diagnostics: ScraperDiagnosticIssue[] = [];
  if (hasBindingFailure) {
    diagnostics.push({
      code: 'episode_page_differs_from_series',
      severity: 'critical',
      title: 'تعذر التحقق من ربط السيرفرات بالحلقات المستقلة',
      probableCause:
        execResult.validationSummary?.notes?.[0] || 'إحدى الحلقات لم تُجلب من رابطها المستقل أو تحتوي على رابط غير صالح.',
      suggestedFix: 'تحقق من محدّد روابط الحلقات (linkSelector) ومحدّد صفحة المشاهدة (watchSubpageSelector) ومعامل معرف الحلقة.',
      evidence: `صالح: ${execResult.validationSummary?.validEpisodes ?? 0} | غير صالح: ${execResult.validationSummary?.invalidEpisodes ?? 0}`,
    });
  }
  if (missingEpisodes.length > 0) {
    diagnostics.push({
      code: 'episode_count_mismatch_or_capped',
      severity: 'warning',
      title: `تم رصد ${missingEpisodes.length} حلقة مفقودة أو غير مستخرجة`,
      probableCause: missingEpisodes[0].reason,
      suggestedFix: 'تحقق من regex رقم الحلقة أو محدد الحاوية (containerSelector) أو تتبع الصفحات.',
      evidence: `حلقات مستخرجة: ${episodesDiscovered} / ظاهر: ${visibleEpisodesHint}`,
    });
  }
  if (execResult.failedServers.length > 0) {
    diagnostics.push({
      code: 'missing_servers_per_episode',
      severity: 'warning',
      title: `فشل أو استُبعد ${execResult.failedServers.length} سيرفر أثناء التحقق`,
      probableCause: execResult.failedServers[0].reason,
      suggestedFix: 'جرّب تغيير وضع التحقق (verifyMode) إلى relaxed_headers أو راجع روابط الإعلانات.',
      evidence: execResult.failedServers
        .slice(0, 3)
        .map((f) => `${f.serverName}: ${f.reason}`)
        .join(' | '),
    });
  }

  const extractedPreview: ScrapedAdapterPreviewMedia = {
    title: media.title,
    englishTitle: media.englishTitle,
    kind: media.kind,
    categories: media.categories,
    genres: media.genres,
    year: media.year,
    country: media.country,
    language: media.language,
    quality: media.quality,
    duration: media.duration,
    imdb: media.imdb,
    poster: media.poster,
    backdrop: media.backdrop,
    story: media.story,
    sourceUrl: media.sourceUrl,
    trailerUrl: media.trailerUrl,
    servers: media.servers,
    downloads: media.downloads,
    seasons: media.seasons,
  };

  return {
    ok: execResult.ok,
    testedUrl: url,
    domain,
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    contentTypeHint,
    testedAt,
    durationMs: Date.now() - startedAt,
    episodesDiscovered,
    seasonsDiscovered: seasons.length,
    totalServersExtracted,
    rootServersCount: media.servers.length,
    avgServersPerEpisode,
    minServersPerEpisode: minSrv === Number.MAX_SAFE_INTEGER ? 0 : minSrv,
    maxServersPerEpisode: maxSrv,
    extractedServerNames: Array.from(allServerNames),
    episodesReport,
    missingEpisodes,
    failedServers: execResult.failedServers,
    visibleComparison: {
      visibleEpisodesHint,
      extractedEpisodes: episodesDiscovered,
      episodesCoveragePct: epCoverage,
      visibleServersHint,
      extractedRootServers: media.servers.length,
      serversCoveragePct: srvCoverage,
      completenessVerdict,
      notes: comparisonNotes,
    },
    diagnostics,
    recommendedStatus,
    recommendedStatusReason,
    extractedPreview,
    validationSummary: execResult.validationSummary,
    ...(comparisonDiff ? { comparisonDiff } : {}),
    ...(execResult.error ? { error: execResult.error } : {}),
  };
}
