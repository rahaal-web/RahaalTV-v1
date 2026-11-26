import * as cheerio from 'cheerio';
import crypto from 'crypto';
import dns from 'dns/promises';
import fs from 'fs';
import net from 'net';
import path from 'path';
import readline from 'readline';
import type { NextFunction, Request, Response } from 'express';
import {
  extractCleanEnglishTitleCandidate,
  extractImdbIdFromText,
  extractJsonLdNodes,
  isJunkImageCandidate,
} from '../src/lib/imageMatching.ts';
import type { ScraperAdapter } from '../src/types/scraperAdapter.ts';
import type { BaselineParseFn, BaselineScrapedMedia } from './scraperAdapterEngine.ts';
import type {
  AdvancedImportedMovie,
  ImporterDiscoveryMode,
  ImporterDuplicateMode,
  ImporterJobConfig,
  ImporterJobItemStatus,
  ImporterJobLog,
  ImporterJobResultRecord,
  ImporterJobStatus,
  ImporterJobSummary,
  ImporterPaginatedItemsResponse,
  SourceIndexEntry,
} from '../src/types/advancedImporter.ts';

const IMPORTER_BASE_DIR = path.resolve(process.cwd(), 'data', 'advanced-importer');
const SOURCE_INDEX_FILE = path.join(IMPORTER_BASE_DIR, 'source-index.json');
const CONFIG_FILE = path.resolve(process.cwd(), 'firebase-applet-config.json');

const PRIMARY_ADMIN_EMAILS = new Set([
  'rahalahmed348@gmail.com',
  'mfeshmeny2@gmail.com',
  'ccicada6@gmail.com',
  'bebraheem439@gmail.com',
]);

const DEFAULT_IMPORTER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
  'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
};

export interface ImporterScrapedMediaLike extends BaselineScrapedMedia {
  votes?: string;
  poster_width?: number;
  poster_height?: number;
  backdrop_width?: number;
  backdrop_height?: number;
  image_source?: string;
  image_quality_status?: 'high' | 'medium' | 'low' | 'missing_backdrop' | 'unknown';
  tagline?: string;
  shortUrl?: string;
}

export interface ImporterEngineDeps {
  parseHtmlToMediaWithHints: BaselineParseFn;
  scrapeFullItemWithSubpages: (
    mainUrl: string,
    mainHtml: string,
    options?: { skipEpisodeCrawl?: boolean; skipExternalEnrichment?: boolean }
  ) => Promise<ImporterScrapedMediaLike>;
  extractListingWithOptionalAdapter: (
    html: string,
    pageUrl: string,
    adapter: ScraperAdapter | null
  ) => {
    siteTitle: string;
    cards: Array<{ url: string; title: string; poster: string }>;
    nextUrls: string[];
  };
  resolveActiveAdapterForUrl: (url: string, explicitAdapter?: Partial<ScraperAdapter>) => ScraperAdapter | null;
  executeAdapterScrape: (params: {
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
    deepEpisodeCrawl?: boolean;
    maxEpisodesForCrawl?: number;
  }) => Promise<{ ok: boolean; media: BaselineScrapedMedia }>;
  enrichScrapedMediaFromAdapter: (media: BaselineScrapedMedia) => Promise<ImporterScrapedMediaLike>;
  ajaxEmbedResolverFn: (
    ajaxEmbedIds: { id: string; label: string }[],
    candidateOrigins: string[],
    refererUrl: string,
    quality: string
  ) => Promise<BaselineScrapedMedia['servers']>;
  isBlockedHost: (hostname: string) => boolean;
  isBlockedHostEnhanced: (hostname: string) => boolean;
  isLikelyContentUrl: (candidateUrl: string, allowedOrigins: string | string[]) => boolean;
  upgradeKnownImageUrlServer: (rawUrl: string | undefined | null) => string;
}

function cleanStr(val: unknown): string {
  return String(val ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeInitials(name: string): string {
  const parts = cleanStr(name).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'RT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function isPrivateIpAddress(ip: string): boolean {
  if (!ip) return true;
  const clean = ip.replace(/^::ffff:/i, '');
  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map((n) => Number(n));
    if (parts.length !== 4 || parts.some(Number.isNaN)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(clean)) {
    const lower = clean.toLowerCase();
    if (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd')
    ) {
      return true;
    }
    return false;
  }
  return true;
}

export async function validateSafeExternalUrl(
  rawUrl: string,
  deps: Pick<ImporterEngineDeps, 'isBlockedHost' | 'isBlockedHostEnhanced'>
): Promise<{ ok: true; url: URL } | { ok: false; error: string }> {
  const trimmed = cleanStr(rawUrl);
  if (!trimmed) {
    return { ok: false, error: 'يرجى إدخال رابط صالح.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'صيغة الرابط غير صالحة. يجب أن يبدأ بـ http:// أو https://' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, error: 'البروتوكول المسموح HTTP أو HTTPS فقط.' };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (deps.isBlockedHost(hostname) || deps.isBlockedHostEnhanced(hostname)) {
    return { ok: false, error: 'لا يُسمح بجلب الروابط الداخلية أو المحلية (SSRF Guard).' };
  }
  if (net.isIP(hostname) && isPrivateIpAddress(hostname)) {
    return { ok: false, error: 'عنوان IP خاص أو محلي محظور لأسباب أمنية.' };
  }
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (records.some((r) => isPrivateIpAddress(r.address))) {
      return { ok: false, error: 'النطاق يشير إلى عنوان شبكة خاص محظور (SSRF DNS Guard).' };
    }
  } catch {
    // Allow upstream fetch error reporting if DNS lookup fails transiently
  }
  return { ok: true, url: parsed };
}

async function safeFetchRemote(
  rawUrl: string,
  deps: Pick<ImporterEngineDeps, 'isBlockedHost' | 'isBlockedHostEnhanced'>,
  timeoutMs = 12000,
  extraHeaders?: Record<string, string>
): Promise<{ ok: boolean; status: number; text: string; contentType: string; finalUrl: string; headers: Headers }> {
  let currentUrl = rawUrl;
  for (let hop = 0; hop < 4; hop++) {
    const check = await validateSafeExternalUrl(currentUrl, deps);
    if (!check.ok) {
      return {
        ok: false,
        status: 403,
        text: '',
        contentType: '',
        finalUrl: currentUrl,
        headers: new Headers(),
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(check.url.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          ...DEFAULT_IMPORTER_HEADERS,
          ...(extraHeaders || {}),
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const loc = response.headers.get('location');
        if (!loc) {
          return {
            ok: false,
            status: response.status,
            text: '',
            contentType: '',
            finalUrl: currentUrl,
            headers: response.headers,
          };
        }
        currentUrl = new URL(loc, check.url.toString()).toString();
        continue;
      }
      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        text,
        contentType,
        finalUrl: response.url || currentUrl,
        headers: response.headers,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    ok: false,
    status: 310,
    text: '',
    contentType: '',
    finalUrl: currentUrl,
    headers: new Headers(),
  };
}

export function canonicalizeSourceUrl(rawUrl: string): string {
  const clean = cleanStr(rawUrl);
  if (!clean) return '';
  try {
    const u = new URL(clean);
    u.hash = '';
    const dropParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    for (const key of dropParams) {
      u.searchParams.delete(key);
    }
    const str = u.toString();
    return str.length > u.origin.length + 1 ? str.replace(/\/+$/, '') : str;
  } catch {
    return clean.replace(/\/+$/, '');
  }
}

function buildSlugFromMovie(englishTitle: string, title: string, year: string, sourceUrl: string): string {
  const fromUrl = (() => {
    try {
      const parts = new URL(sourceUrl).pathname.split('/').filter(Boolean);
      const last = decodeURIComponent(parts[parts.length - 1] || '')
        .replace(/\.(html?|php|aspx?)$/i, '')
        .trim();
      return last;
    } catch {
      return '';
    }
  })();

  const base =
    cleanStr(englishTitle)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') ||
    fromUrl
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
      .replace(/^-+|-+$/g, '') ||
    cleanStr(title)
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
      .replace(/^-+|-+$/g, '') ||
    'imported-movie';

  const safeSlug = `${base}${year && /^\d{4}$/.test(year) && !base.includes(year) ? `-${year}` : ''}`
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);

  return safeSlug || `movie-${crypto.createHash('md5').update(sourceUrl || title).digest('hex').slice(0, 8)}`;
}

function extractExternalIdFromUrl(sourceUrl: string, html = ''): string {
  try {
    const u = new URL(sourceUrl);
    const vid = u.searchParams.get('vid') || u.searchParams.get('id') || u.searchParams.get('p');
    if (vid && /^[a-zA-Z0-9_-]{2,40}$/.test(vid)) return vid;
  } catch {
    // ignore
  }
  const wpIdMatch = html.match(/postid-(\d{2,10})/i) || html.match(/wp-json\/wp\/v2\/(?:posts|movies)\/(\d{2,10})/i);
  if (wpIdMatch?.[1]) return wpIdMatch[1];
  const imdbMatch = extractImdbIdFromText(`${sourceUrl} ${html.slice(0, 20000)}`);
  if (imdbMatch) return imdbMatch;
  return crypto.createHash('sha1').update(canonicalizeSourceUrl(sourceUrl) || sourceUrl).digest('hex').slice(0, 12);
}

function extractExtraMovieMetadataFromHtml(
  html: string,
  sourceUrl: string,
  baseMedia: ImporterScrapedMediaLike
): {
  releaseDate: string;
  directors: string[];
  tags: string[];
  arabicTitle: string;
  englishTitle: string;
} {
  const $ = cheerio.load(html || '');
  let releaseDate = '';
  const directorsSet = new Set<string>();
  const tagsSet = new Set<string>();

  $('script[type="application/ld+json"]').each((_, el) => {
    const nodes = extractJsonLdNodes($(el).text());
    for (const node of nodes) {
      const dateRaw = cleanStr(node.datePublished || node.releaseDate || '');
      if (dateRaw && !releaseDate && /\d{4}/.test(dateRaw)) {
        releaseDate = dateRaw.slice(0, 32);
      }
      const dirField = node.director;
      if (Array.isArray(dirField)) {
        for (const d of dirField) {
          const nm = cleanStr(typeof d === 'string' ? d : (d as Record<string, unknown>)?.name);
          if (nm && nm.length >= 2 && nm.length <= 80) directorsSet.add(nm);
        }
      } else if (dirField && typeof dirField === 'object') {
        const nm = cleanStr((dirField as Record<string, unknown>).name);
        if (nm && nm.length >= 2 && nm.length <= 80) directorsSet.add(nm);
      } else if (typeof dirField === 'string' && cleanStr(dirField)) {
        directorsSet.add(cleanStr(dirField).slice(0, 80));
      }
      if (typeof node.keywords === 'string') {
        for (const kw of node.keywords.split(',').map(cleanStr)) {
          if (kw && kw.length >= 2 && kw.length <= 50) tagsSet.add(kw);
        }
      } else if (Array.isArray(node.keywords)) {
        for (const kw of node.keywords.map(cleanStr)) {
          if (kw && kw.length >= 2 && kw.length <= 50) tagsSet.add(kw);
        }
      }
    }
  });

  if (!releaseDate) {
    const metaDate = cleanStr(
      $('meta[itemprop="datePublished"]').attr('content') ||
        $('meta[property="video:release_date"]').attr('content') ||
        $('meta[property="article:published_time"]').attr('content') ||
        $('[itemprop="datePublished"]').first().attr('datetime') ||
        $('[itemprop="datePublished"]').first().text()
    );
    if (metaDate && /\d{4}/.test(metaDate)) {
      releaseDate = metaDate.slice(0, 32);
    }
  }

  $('[itemprop="director"] [itemprop="name"], [itemprop="director"], .director a, .directors a').each((_, el) => {
    const nm = cleanStr($(el).text());
    if (nm && nm.length >= 2 && nm.length <= 80 && !/المخرج|director/i.test(nm)) {
      directorsSet.add(nm);
    }
  });

  // Arabic & English key-value info blocks
  $('li, tr, .info-row, .single-info p, .single-details div, .movie-info div, .details span').each((_, el) => {
    const txt = cleanStr($(el).text());
    if (!txt || txt.length > 200) return;
    const dirMatch = txt.match(/(?:المخرج|إخراج|أخرجه|Director|Directed\s*by)\s*[:\-–]\s*(.+)$/i);
    if (dirMatch?.[1]) {
      for (const name of dirMatch[1].split(/[،,\/|]/).map(cleanStr)) {
        if (name && name.length >= 2 && name.length <= 70) directorsSet.add(name);
      }
    }
    if (!releaseDate) {
      const dateMatch = txt.match(/(?:تاريخ\s*(?:الإصدار|العرض)|Release\s*Date)\s*[:\-–]\s*(.+)$/i);
      if (dateMatch?.[1] && /\d{4}/.test(dateMatch[1])) {
        releaseDate = dateMatch[1].slice(0, 32);
      }
    }
  });

  $('a[rel="tag"], .tags a, .labels a, .keywords a').each((_, el) => {
    const t = cleanStr($(el).text()).replace(/^(?:categories:|type:|year:|country:|language:|quality:)/i, '').trim();
    if (t && t.length >= 2 && t.length <= 50) tagsSet.add(t);
  });

  const metaKeywords = cleanStr($('meta[name="keywords"]').attr('content'));
  if (metaKeywords) {
    for (const kw of metaKeywords.split(/[،,]/).map(cleanStr).slice(0, 12)) {
      if (kw && kw.length >= 2 && kw.length <= 50) tagsSet.add(kw);
    }
  }

  for (const cat of baseMedia.categories || []) tagsSet.add(cleanStr(cat));
  for (const gen of baseMedia.genres || []) tagsSet.add(cleanStr(gen));

  // Separate Arabic vs English titles accurately
  const rawH1 = cleanStr($('h1').first().text());
  const rawOg = cleanStr($('meta[property="og:title"]').attr('content'));
  const rawTitle = baseMedia.title || rawH1 || rawOg || 'عمل مستورد جديد';

  let arabicTitle = rawTitle;
  let englishTitle =
    cleanStr(baseMedia.englishTitle) ||
    extractCleanEnglishTitleCandidate(`${rawTitle} ${rawH1} ${rawOg}`) ||
    '';

  const altEnglishEl = cleanStr(
    $('.english-title, .original-title, [itemprop="alternateName"], .en-title').first().text()
  );
  if (altEnglishEl && /[A-Za-z]{2,}/.test(altEnglishEl)) {
    englishTitle = altEnglishEl.slice(0, 200);
  }
  if (!englishTitle || !/[A-Za-z]{2,}/.test(englishTitle)) {
    englishTitle = extractCleanEnglishTitleCandidate(sourceUrl.replace(/[-_/]/g, ' ')) || rawTitle;
  }

  if (!releaseDate && baseMedia.year && /^(19|20)\d{2}$/.test(baseMedia.year)) {
    releaseDate = baseMedia.year;
  }

  return {
    releaseDate,
    directors: Array.from(directorsSet).slice(0, 8),
    tags: Array.from(tagsSet).filter(Boolean).slice(0, 20),
    arabicTitle: arabicTitle.slice(0, 200),
    englishTitle: englishTitle.slice(0, 200),
  };
}

function mergeDirectorsIntoCast(
  cast: Array<{ name: string; role: string; initials: string; avatarUrl?: string }>,
  directors: string[]
) {
  const out = [...cast];
  const existingDirectors = new Set(
    out.filter((c) => /مخرج|director/i.test(c.role)).map((c) => cleanStr(c.name).toLowerCase())
  );
  for (const dir of directors) {
    const cleanDir = cleanStr(dir);
    if (!cleanDir || existingDirectors.has(cleanDir.toLowerCase())) continue;
    existingDirectors.add(cleanDir.toLowerCase());
    out.unshift({
      name: cleanDir,
      role: 'مخرج',
      initials: makeInitials(cleanDir),
    });
  }
  return out.slice(0, 25);
}

export function buildAdvancedMovieRecord(
  baseMedia: ImporterScrapedMediaLike,
  sourceUrl: string,
  rawHtml = ''
): AdvancedImportedMovie {
  const canonicalUrl = canonicalizeSourceUrl(sourceUrl) || sourceUrl;
  let sourceDomain = '';
  try {
    if (canonicalUrl) sourceDomain = new URL(canonicalUrl).hostname.replace(/^www\./, '');
  } catch {
    sourceDomain = '';
  }

  const extra = extractExtraMovieMetadataFromHtml(rawHtml, canonicalUrl, baseMedia);
  const yearMatch = (baseMedia.year || extra.releaseDate || '2026').match(/\b(19\d\d|20[0-3]\d)\b/);
  const year = yearMatch ? yearMatch[1] : '2026';
  const externalId = extractExternalIdFromUrl(canonicalUrl, rawHtml);
  const slug = buildSlugFromMovie(extra.englishTitle, extra.arabicTitle, year, canonicalUrl);
  const idHash = crypto.createHash('md5').update(canonicalUrl || `${slug}-${year}`).digest('hex').slice(0, 8);
  const id = `imp-${slug.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40)}-${idHash}`.replace(/-+/g, '-');

  const rawCast = Array.isArray(baseMedia.cast) ? baseMedia.cast : [];
  const mergedCast = mergeDirectorsIntoCast(rawCast, extra.directors);
  const extractedDirectors = extra.directors.length
    ? extra.directors
    : rawCast.filter((c) => /مخرج|director/i.test(c.role)).map((c) => c.name);

  const poster = baseMedia.poster_url || baseMedia.poster || '';
  const backdrop = baseMedia.backdrop_url || baseMedia.backdrop || '';

  return {
    id,
    externalId,
    slug,
    imdbId: cleanStr(baseMedia.imdbId),
    sourceUrl: canonicalUrl,
    sourceDomain,
    title: extra.arabicTitle || cleanStr(baseMedia.title) || 'فيلم مستورد',
    englishTitle: extra.englishTitle || cleanStr(baseMedia.englishTitle) || extra.arabicTitle,
    story: cleanStr(baseMedia.story || extra.arabicTitle).slice(0, 2800),
    tagline: cleanStr(baseMedia.tagline || baseMedia.story || extra.arabicTitle).slice(0, 380),
    year,
    releaseDate: extra.releaseDate || year,
    kind: baseMedia.kind || 'movie',
    categories: (baseMedia.categories || ['افلام']).filter(Boolean).slice(0, 10),
    genres: (baseMedia.genres || ['دراما']).filter(Boolean).slice(0, 10),
    tags: extra.tags,
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
    directors: extractedDirectors,
    cast: mergedCast,
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

export async function extractSingleMovieAdvanced(
  params: {
    url?: string;
    rawHtml?: string;
    useAdapters?: boolean;
    enrichExternalMetadata?: boolean;
    skipEpisodeCrawl?: boolean;
  },
  deps: ImporterEngineDeps
): Promise<{ ok: true; movie: AdvancedImportedMovie; strategy: string } | { ok: false; status: number; error: string }> {
  const cleanUrl = cleanStr(params.url);
  const rawHtml = typeof params.rawHtml === 'string' ? params.rawHtml : '';
  const hasRawHtml = rawHtml.trim().length > 30;
  const useAdapters = params.useAdapters !== false;
  const enrichExternal = params.enrichExternalMetadata !== false;

  if (!cleanUrl && !hasRawHtml) {
    return { ok: false, status: 400, error: 'يرجى إدخال رابط صفحة الفيلم أو لصق كود HTML.' };
  }

  let effectiveUrl = cleanUrl;
  let fetchedHtml = rawHtml;
  let strategy = 'HTML Direct Extraction';

  if (!hasRawHtml) {
    const check = await validateSafeExternalUrl(cleanUrl, deps);
    if (!check.ok) {
      return { ok: false, status: 403, error: check.error };
    }
    effectiveUrl = check.url.toString();

    if (useAdapters) {
      const adapter = deps.resolveActiveAdapterForUrl(effectiveUrl);
      if (adapter) {
        try {
          const adpRes = await deps.executeAdapterScrape({
            url: effectiveUrl,
            adapter,
            baselineParseFn: deps.parseHtmlToMediaWithHints,
            ajaxEmbedResolverFn: deps.ajaxEmbedResolverFn,
            deepEpisodeCrawl: true,
          });
          if (adpRes.ok) {
            const finalMedia = enrichExternal
              ? await deps.enrichScrapedMediaFromAdapter(adpRes.media)
              : adpRes.media;
            const pageProbe = await safeFetchRemote(effectiveUrl, deps, 9000).catch(() => null);
            return {
              ok: true,
              strategy: `Adapter: ${adapter.name} (v${adapter.version})`,
              movie: buildAdvancedMovieRecord(finalMedia, effectiveUrl, pageProbe?.text || ''),
            };
          }
        } catch {
          // fallback to baseline scraper
        }
      }
    }

    const fetched = await safeFetchRemote(effectiveUrl, deps, 12000);
    if (!fetched.ok) {
      return {
        ok: false,
        status: 502,
        error: `الموقع المصدر رفض الاتصال (رمز الحالة ${fetched.status}). يمكنك استخدام لصق كود HTML البديل.`,
      };
    }
    if (!fetched.text || fetched.text.length < 80) {
      return {
        ok: false,
        status: 502,
        error: 'استجاب الموقع بصفحة فارغة أو محمية.',
      };
    }
    effectiveUrl = fetched.finalUrl || effectiveUrl;
    fetchedHtml = fetched.text;
    strategy = 'Full Subpage + Metadata Scrape';
  } else {
    if (!effectiveUrl) {
      const canonical =
        fetchedHtml.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
        fetchedHtml.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        '';
      effectiveUrl = canonical || 'https://imported.local/movie';
    }
    strategy = 'Raw HTML Parse';
  }

  const baseMedia = await deps.scrapeFullItemWithSubpages(effectiveUrl, fetchedHtml, {
    skipEpisodeCrawl: params.skipEpisodeCrawl,
    skipExternalEnrichment: !enrichExternal,
  });

  return {
    ok: true,
    strategy,
    movie: buildAdvancedMovieRecord(baseMedia, effectiveUrl, fetchedHtml),
  };
}

// =========================================================================
// Source URL / Duplicate Persistent Registry
// =========================================================================
let sourceIndexCache: Record<string, SourceIndexEntry> | null = null;

function ensureImporterDir() {
  fs.mkdirSync(IMPORTER_BASE_DIR, { recursive: true });
}

export function loadSourceIndex(): Record<string, SourceIndexEntry> {
  if (sourceIndexCache) return sourceIndexCache;
  ensureImporterDir();
  try {
    if (fs.existsSync(SOURCE_INDEX_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SOURCE_INDEX_FILE, 'utf8')) as Record<
        string,
        SourceIndexEntry
      >;
      if (parsed && typeof parsed === 'object') {
        sourceIndexCache = parsed;
        return sourceIndexCache;
      }
    }
  } catch {
    // ignore corrupt index
  }
  sourceIndexCache = {};
  return sourceIndexCache;
}

export function saveSourceIndexEntries(entries: SourceIndexEntry[]): number {
  const idx = loadSourceIndex();
  let added = 0;
  for (const entry of entries) {
    const canon = canonicalizeSourceUrl(entry.canonicalUrl || entry.sourceUrl);
    if (!canon || !entry.mediaId) continue;
    idx[canon] = {
      ...entry,
      canonicalUrl: canon,
      sourceUrl: entry.sourceUrl || canon,
      updatedAt: entry.updatedAt || Date.now(),
    };
    added++;
  }
  ensureImporterDir();
  fs.writeFileSync(SOURCE_INDEX_FILE, JSON.stringify(idx, null, 2), 'utf8');
  return added;
}

export function findSourceIndexDuplicate(
  sourceUrl: string,
  externalId?: string,
  imdbId?: string
): SourceIndexEntry | null {
  const idx = loadSourceIndex();
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
// Scalable 50,000-Item Disk-Backed Queue & Discovery Engine
// =========================================================================
interface QueuedTargetUrl {
  seq: number;
  url: string;
  hintTitle?: string;
  hintPoster?: string;
  preExtracted?: ImporterScrapedMediaLike;
}

interface ResultIndexRecord {
  seq: number;
  itemKey: string;
  sourceUrl: string;
  status: ImporterJobItemStatus;
  titleLower: string;
  englishTitleLower: string;
  year: string;
  savedMediaId?: string;
  byteOffset: number;
  byteLength: number;
}

interface ActiveJobRuntime {
  summary: ImporterJobSummary;
  dir: string;
  urlsFile: string;
  resultsFile: string;
  statusMapFile: string;
  summaryFile: string;
  queue: QueuedTargetUrl[];
  seenCanonicalUrls: Set<string>;
  resultIndex: ResultIndexRecord[];
  resultIndexBySeq: Map<number, ResultIndexRecord>;
  statusOverrides: Record<string, { status: ImporterJobItemStatus; savedMediaId?: string }>;
  failedSeqs: number[];
  nextSeq: number;
  workerLoopPromise: Promise<void> | null;
  lastRunStartedAt: number | null;
  dirtySummary: boolean;
}

const jobsMap = new Map<string, ActiveJobRuntime>();
let jobsBootstrapped = false;

function safeJobDir(jobId: string): string | null {
  if (!/^imp_[a-zA-Z0-9_-]{4,64}$/.test(jobId)) return null;
  const resolved = path.resolve(IMPORTER_BASE_DIR, jobId);
  if (!resolved.startsWith(IMPORTER_BASE_DIR + path.sep)) return null;
  return resolved;
}

function appendJobLog(runtime: ActiveJobRuntime, level: ImporterJobLog['level'], message: string, url?: string) {
  const entry: ImporterJobLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    level,
    message: message.slice(0, 320),
    ...(url ? { url: url.slice(0, 260) } : {}),
  };
  runtime.summary.logs.unshift(entry);
  if (runtime.summary.logs.length > 160) {
    runtime.summary.logs.length = 160;
  }
  runtime.dirtySummary = true;
}

function recomputeStats(runtime: ActiveJobRuntime) {
  const s = runtime.summary.stats;
  let fetched = 0;
  let failed = 0;
  let duplicates = 0;
  let saved = 0;
  let excluded = 0;
  const newFailedSeqs: number[] = [];

  for (const idxRec of runtime.resultIndex) {
    const effectiveStatus = runtime.statusOverrides[String(idxRec.seq)]?.status || idxRec.status;
    if (effectiveStatus === 'failed') {
      failed++;
      newFailedSeqs.push(idxRec.seq);
    } else if (effectiveStatus === 'duplicate') {
      duplicates++;
      fetched++;
    } else if (effectiveStatus === 'saved') {
      saved++;
      fetched++;
    } else if (effectiveStatus === 'excluded') {
      excluded++;
      fetched++;
    } else {
      fetched++;
    }
  }

  runtime.failedSeqs = newFailedSeqs;
  s.fetched = fetched;
  s.failed = failed;
  s.duplicates = duplicates;
  s.saved = saved;
  s.excluded = excluded;
  s.processed = runtime.resultIndex.length;
  s.queued = Math.max(0, runtime.queue.length);

  const totalTarget = Math.max(s.discovered, s.processed + s.queued);
  s.progressPercent =
    totalTarget > 0
      ? Math.min(100, Math.round((s.processed / totalTarget) * 1000) / 10)
      : runtime.summary.status === 'completed'
        ? 100
        : 0;

  let elapsed = s.activeElapsedMs;
  if (runtime.lastRunStartedAt && (runtime.summary.status === 'running' || runtime.summary.status === 'discovering')) {
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
}

function flushSummaryToDisk(runtime: ActiveJobRuntime) {
  recomputeStats(runtime);
  runtime.summary.updatedAt = Date.now();
  try {
    fs.mkdirSync(runtime.dir, { recursive: true });
    fs.writeFileSync(runtime.summaryFile, JSON.stringify(runtime.summary, null, 2), 'utf8');
    fs.writeFileSync(runtime.statusMapFile, JSON.stringify(runtime.statusOverrides), 'utf8');
    runtime.dirtySummary = false;
  } catch {
    // ignore disk flush race
  }
}

function appendResultRecord(runtime: ActiveJobRuntime, record: ImporterJobResultRecord) {
  const line = `${JSON.stringify(record)}\n`;
  const buf = Buffer.from(line, 'utf8');
  const fd = fs.openSync(runtime.resultsFile, 'a');
  let byteOffset = 0;
  try {
    const stat = fs.fstatSync(fd);
    byteOffset = stat.size;
    fs.writeSync(fd, buf, 0, buf.length, byteOffset);
  } finally {
    fs.closeSync(fd);
  }

  const idxEntry: ResultIndexRecord = {
    seq: record.seq,
    itemKey: record.itemKey,
    sourceUrl: record.sourceUrl,
    status: record.status,
    titleLower: cleanStr(record.movie?.title).toLowerCase(),
    englishTitleLower: cleanStr(record.movie?.englishTitle).toLowerCase(),
    year: cleanStr(record.movie?.year),
    savedMediaId: record.savedMediaId,
    byteOffset,
    byteLength: buf.length,
  };

  const existing = runtime.resultIndexBySeq.get(record.seq);
  if (existing) {
    Object.assign(existing, idxEntry);
  } else {
    runtime.resultIndex.push(idxEntry);
    runtime.resultIndexBySeq.set(record.seq, idxEntry);
  }
  runtime.dirtySummary = true;
}

function readResultRecordAt(runtime: ActiveJobRuntime, idxRec: ResultIndexRecord): ImporterJobResultRecord | null {
  try {
    const fd = fs.openSync(runtime.resultsFile, 'r');
    try {
      const buf = Buffer.alloc(idxRec.byteLength);
      fs.readSync(fd, buf, 0, idxRec.byteLength, idxRec.byteOffset);
      const parsed = JSON.parse(buf.toString('utf8')) as ImporterJobResultRecord;
      const override = runtime.statusOverrides[String(idxRec.seq)];
      if (override) {
        parsed.status = override.status;
        if (override.savedMediaId) parsed.savedMediaId = override.savedMediaId;
      }
      return parsed;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

export function bootstrapPersistedJobsFromDisk() {
  if (jobsBootstrapped) return;
  jobsBootstrapped = true;
  ensureImporterDir();

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(IMPORTER_BASE_DIR, { withFileTypes: true });
  } catch {
    return;
  }

  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue;
    const jobDir = safeJobDir(dirent.name);
    if (!jobDir) continue;
    const summaryFile = path.join(jobDir, 'job.json');
    if (!fs.existsSync(summaryFile)) continue;

    try {
      const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8')) as ImporterJobSummary;
      if (summary.status === 'running' || summary.status === 'discovering') {
        summary.status = 'paused';
        summary.logs.unshift({
          id: `boot_${Date.now()}`,
          ts: Date.now(),
          level: 'warn',
          message: 'تم إيقاف المهمة مؤقتاً بعد إعادة تشغيل الخادم — جاهزة للاستئناف من آخر نقطة توقف.',
        });
      }

      const urlsFile = path.join(jobDir, 'urls.ndjson');
      const resultsFile = path.join(jobDir, 'results.ndjson');
      const statusMapFile = path.join(jobDir, 'status-map.json');

      let statusOverrides: Record<string, { status: ImporterJobItemStatus; savedMediaId?: string }> = {};
      if (fs.existsSync(statusMapFile)) {
        try {
          statusOverrides = JSON.parse(fs.readFileSync(statusMapFile, 'utf8'));
        } catch {
          statusOverrides = {};
        }
      }

      const resultIndex: ResultIndexRecord[] = [];
      const resultIndexBySeq = new Map<number, ResultIndexRecord>();
      const processedUrls = new Set<string>();
      let maxSeq = 0;

      if (fs.existsSync(resultsFile)) {
        const rawBuf = fs.readFileSync(resultsFile);
        let offset = 0;
        while (offset < rawBuf.length) {
          const nlIdx = rawBuf.indexOf(10, offset);
          const lineEnd = nlIdx === -1 ? rawBuf.length : nlIdx + 1;
          const len = lineEnd - offset;
          if (len > 2) {
            try {
              const rec = JSON.parse(rawBuf.subarray(offset, lineEnd).toString('utf8')) as ImporterJobResultRecord;
              const entry: ResultIndexRecord = {
                seq: rec.seq,
                itemKey: rec.itemKey,
                sourceUrl: rec.sourceUrl,
                status: rec.status,
                titleLower: cleanStr(rec.movie?.title).toLowerCase(),
                englishTitleLower: cleanStr(rec.movie?.englishTitle).toLowerCase(),
                year: cleanStr(rec.movie?.year),
                savedMediaId: rec.savedMediaId,
                byteOffset: offset,
                byteLength: len,
              };
              const prev = resultIndexBySeq.get(rec.seq);
              if (prev) {
                Object.assign(prev, entry);
              } else {
                resultIndex.push(entry);
                resultIndexBySeq.set(rec.seq, entry);
              }
              processedUrls.add(canonicalizeSourceUrl(rec.sourceUrl));
              if (rec.seq > maxSeq) maxSeq = rec.seq;
            } catch {
              // ignore malformed line
            }
          }
          offset = lineEnd;
        }
      }

      const seenCanonicalUrls = new Set<string>(processedUrls);
      const queue: QueuedTargetUrl[] = [];
      if (fs.existsSync(urlsFile)) {
        const lines = fs.readFileSync(urlsFile, 'utf8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const q = JSON.parse(line) as QueuedTargetUrl;
            const canon = canonicalizeSourceUrl(q.url);
            seenCanonicalUrls.add(canon);
            if (!processedUrls.has(canon)) {
              queue.push(q);
            }
            if (q.seq > maxSeq) maxSeq = q.seq;
          } catch {
            // ignore
          }
        }
      }

      const runtime: ActiveJobRuntime = {
        summary,
        dir: jobDir,
        urlsFile,
        resultsFile,
        statusMapFile,
        summaryFile,
        queue,
        seenCanonicalUrls,
        resultIndex,
        resultIndexBySeq,
        statusOverrides,
        failedSeqs: [],
        nextSeq: maxSeq + 1,
        workerLoopPromise: null,
        lastRunStartedAt: null,
        dirtySummary: false,
      };
      recomputeStats(runtime);
      jobsMap.set(summary.id, runtime);
    } catch {
      // skip corrupt job dir
    }
  }
}

function enqueueDiscoveredUrl(
  runtime: ActiveJobRuntime,
  rawUrl: string,
  meta?: { hintTitle?: string; hintPoster?: string; preExtracted?: ImporterScrapedMediaLike }
): boolean {
  if (runtime.summary.stats.discovered >= runtime.summary.config.maxItems) return false;
  const canon = canonicalizeSourceUrl(rawUrl);
  if (!canon || runtime.seenCanonicalUrls.has(canon)) return false;

  runtime.seenCanonicalUrls.add(canon);
  const item: QueuedTargetUrl = {
    seq: runtime.nextSeq++,
    url: canon,
    ...(meta?.hintTitle ? { hintTitle: meta.hintTitle } : {}),
    ...(meta?.hintPoster ? { hintPoster: meta.hintPoster } : {}),
    ...(meta?.preExtracted ? { preExtracted: meta.preExtracted } : {}),
  };
  runtime.queue.push(item);
  runtime.summary.stats.discovered = runtime.seenCanonicalUrls.size;
  runtime.summary.stats.queued = runtime.queue.length;
  try {
    // Persist minimal queue metadata without bloating urls.ndjson
    fs.appendFileSync(
      runtime.urlsFile,
      `${JSON.stringify({ seq: item.seq, url: item.url, hintTitle: item.hintTitle, hintPoster: item.hintPoster })}\n`,
      'utf8'
    );
  } catch {
    // ignore
  }
  return true;
}

function urlMatchesSections(candidateUrl: string, sectionUrls: string[]): boolean {
  if (!sectionUrls.length) return true;
  try {
    const cand = new URL(candidateUrl);
    for (const sec of sectionUrls) {
      const secUrl = new URL(sec);
      if (cand.origin !== secUrl.origin) continue;
      const secPath = decodeURIComponent(secUrl.pathname).toLowerCase().replace(/\/+$/, '');
      const candPath = decodeURIComponent(cand.pathname).toLowerCase().replace(/\/+$/, '');
      if (!secPath || secPath === '/') return true;
      if (candPath.startsWith(secPath)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

async function discoverUrlsFromSitemaps(
  runtime: ActiveJobRuntime,
  origin: string,
  deps: ImporterEngineDeps
): Promise<number> {
  const maxItems = runtime.summary.config.maxItems;
  const sectionUrls = runtime.summary.config.sectionUrls || [];
  const sitemapCandidates = new Set<string>([
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap.xml`,
    `${origin}/wp-sitemap.xml`,
    `${origin}/post-sitemap.xml`,
  ]);

  try {
    const robots = await safeFetchRemote(`${origin}/robots.txt`, deps, 6000);
    if (robots.ok && robots.text) {
      const lines = robots.text.split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^Sitemap:\s*(https?:\/\/\S+)/i);
        if (m?.[1]) sitemapCandidates.add(m[1].trim());
      }
    }
  } catch {
    // ignore robots.txt
  }

  const visitedSitemaps = new Set<string>();
  const sitemapQueue = Array.from(sitemapCandidates);
  let totalAdded = 0;

  while (
    sitemapQueue.length > 0 &&
    visitedSitemaps.size < 450 &&
    runtime.summary.stats.discovered < maxItems &&
    runtime.summary.status !== 'cancelled' &&
    runtime.summary.status !== 'paused'
  ) {
    const smUrl = sitemapQueue.shift()!;
    if (visitedSitemaps.has(smUrl)) continue;
    visitedSitemaps.add(smUrl);

    const res = await safeFetchRemote(smUrl, deps, 10000).catch(() => null);
    if (!res || !res.ok || !res.text.includes('<loc>')) continue;

    const $ = cheerio.load(res.text, { xmlMode: true });
    $('sitemap loc').each((_, el) => {
      const loc = cleanStr($(el).text());
      if (
        loc &&
        !/page-sitemap|category-sitemap|tag-sitemap|author-sitemap|post_tag-sitemap/i.test(loc) &&
        !visitedSitemaps.has(loc)
      ) {
        sitemapQueue.push(loc);
      }
    });

    $('url loc').each((_, el) => {
      if (runtime.summary.stats.discovered >= maxItems) return;
      const loc = cleanStr($(el).text());
      if (!loc) return;
      if (!deps.isLikelyContentUrl(loc, origin)) return;
      if (sectionUrls.length > 0 && !urlMatchesSections(loc, sectionUrls)) return;
      if (enqueueDiscoveredUrl(runtime, loc)) totalAdded++;
    });

    if (totalAdded > 0 && visitedSitemaps.size % 5 === 0) {
      flushSummaryToDisk(runtime);
    }
  }

  if (totalAdded > 0) {
    runtime.summary.discoveryStrategy = 'XML Sitemap + Nested Sitemaps';
    appendJobLog(runtime, 'info', `اكتشاف ${totalAdded} رابط عبر خرائط الموقع (Sitemap).`);
  }
  return totalAdded;
}

async function discoverUrlsFromApis(
  runtime: ActiveJobRuntime,
  origin: string,
  deps: ImporterEngineDeps
): Promise<number> {
  const maxItems = runtime.summary.config.maxItems;
  let totalAdded = 0;

  // 1. Try Blogger JSON Feed with pagination (up to maxItems / 50k)
  try {
    let startIndex = 1;
    const perFeed = 150;
    let bloggerPages = 0;
    while (
      runtime.summary.stats.discovered < maxItems &&
      bloggerPages < 350 &&
      runtime.summary.status !== 'cancelled' &&
      runtime.summary.status !== 'paused'
    ) {
      const feedUrl = `${origin}/feeds/posts/default?alt=json&max-results=${perFeed}&start-index=${startIndex}`;
      const res = await safeFetchRemote(feedUrl, deps, 10000).catch(() => null);
      if (!res || !res.ok || !res.text.trim().startsWith('{')) break;
      const json = JSON.parse(res.text) as {
        feed?: {
          title?: { $t?: string };
          entry?: Array<{
            title?: { $t?: string };
            content?: { $t?: string };
            summary?: { $t?: string };
            category?: Array<{ term?: string }>;
            media$thumbnail?: { url?: string };
            link?: Array<{ rel?: string; href?: string }>;
          }>;
        };
      };
      const entries = json.feed?.entry || [];
      if (entries.length === 0) break;
      if (bloggerPages === 0 && json.feed?.title?.$t) {
        runtime.summary.siteTitle = cleanStr(json.feed.title.$t);
      }

      for (const entry of entries) {
        if (runtime.summary.stats.discovered >= maxItems) break;
        const altLink = entry.link?.find((l) => l.rel === 'alternate')?.href || '';
        if (!altLink) continue;
        const parsed = deps.parseHtmlToMediaWithHints(entry.content?.$t || entry.summary?.$t || '', altLink).media;
        const rawTitle = cleanStr(entry.title?.$t);
        if (rawTitle) parsed.title = rawTitle.slice(0, 200);
        if (!parsed.poster && entry.media$thumbnail?.url) {
          parsed.poster = deps.upgradeKnownImageUrlServer(entry.media$thumbnail.url);
          parsed.poster_url = parsed.poster;
        }
        const cats: string[] = [];
        const gens: string[] = [];
        for (const cat of entry.category || []) {
          const term = cleanStr(cat.term);
          if (!term) continue;
          if (term.startsWith('categories:')) cats.push(term.replace('categories:', '').trim());
          else if (term.startsWith('type:')) gens.push(term.replace('type:', '').trim());
          else if (term.startsWith('year:')) parsed.year = term.replace('year:', '').trim();
          else if (term.startsWith('quality:')) parsed.quality = term.replace('quality:', '').trim();
        }
        if (cats.length) parsed.categories = cats.slice(0, 8);
        if (gens.length) parsed.genres = gens.slice(0, 8);
        if (enqueueDiscoveredUrl(runtime, altLink, { hintTitle: parsed.title, hintPoster: parsed.poster, preExtracted: parsed })) {
          totalAdded++;
        }
      }
      if (entries.length < perFeed) break;
      startIndex += entries.length;
      bloggerPages++;
      flushSummaryToDisk(runtime);
    }
    if (totalAdded > 0) {
      runtime.summary.discoveryStrategy = 'Blogger JSON Feed API';
      appendJobLog(runtime, 'info', `اكتشاف ${totalAdded} عمل عبر واجهة Blogger JSON API.`);
      return totalAdded;
    }
  } catch {
    // ignore Blogger errors
  }

  // 2. WordPress REST API (posts + custom post types like movies / films)
  const endpoints = ['posts', 'movies', 'movie', 'films'];
  try {
    const typesRes = await safeFetchRemote(`${origin}/wp-json/wp/v2/types`, deps, 6000).catch(() => null);
    if (typesRes?.ok && typesRes.text.trim().startsWith('{')) {
      const typesObj = JSON.parse(typesRes.text) as Record<string, { rest_base?: string }>;
      for (const t of Object.values(typesObj)) {
        if (t?.rest_base && !['pages', 'media', 'blocks', 'templates', 'template-parts', 'navigation'].includes(t.rest_base)) {
          if (!endpoints.includes(t.rest_base)) endpoints.push(t.rest_base);
        }
      }
    }
  } catch {
    // ignore types discovery
  }

  for (const endpoint of endpoints) {
    if (runtime.summary.stats.discovered >= maxItems) break;
    let page = 1;
    let totalPages = 1;
    while (
      page <= totalPages &&
      page <= 550 &&
      runtime.summary.stats.discovered < maxItems &&
      runtime.summary.status !== 'cancelled' &&
      runtime.summary.status !== 'paused'
    ) {
      const apiUrl = `${origin}/wp-json/wp/v2/${endpoint}?per_page=100&page=${page}&_embed`;
      const res = await safeFetchRemote(apiUrl, deps, 10000).catch(() => null);
      if (!res || !res.ok || !res.text.trim().startsWith('[')) break;
      const wpTotalPagesHeader = Number(res.headers.get('x-wp-totalpages') || '1');
      if (Number.isFinite(wpTotalPagesHeader) && wpTotalPagesHeader > 0) {
        totalPages = wpTotalPagesHeader;
      }
      const posts = JSON.parse(res.text) as Array<{
        link?: string;
        title?: { rendered?: string };
        content?: { rendered?: string };
        excerpt?: { rendered?: string };
        _embedded?: { 'wp:featuredmedia'?: Array<{ source_url?: string }> };
      }>;
      if (!Array.isArray(posts) || posts.length === 0) break;

      for (const post of posts) {
        if (runtime.summary.stats.discovered >= maxItems) break;
        const postUrl = post.link || '';
        if (!postUrl) continue;
        const htmlBody = `${post.content?.rendered || ''} ${post.excerpt?.rendered || ''}`;
        const parsed = deps.parseHtmlToMediaWithHints(htmlBody, postUrl).media;
        const rawTitle = cleanStr(cheerio.load(post.title?.rendered || '').text());
        if (rawTitle) parsed.title = rawTitle.slice(0, 200);
        const featured = post._embedded?.['wp:featuredmedia']?.[0]?.source_url;
        if (featured && !parsed.poster && !isJunkImageCandidate(featured)) {
          parsed.poster = deps.upgradeKnownImageUrlServer(featured);
          parsed.poster_url = parsed.poster;
        }
        if (enqueueDiscoveredUrl(runtime, postUrl, { hintTitle: parsed.title, hintPoster: parsed.poster, preExtracted: parsed })) {
          totalAdded++;
        }
      }
      page++;
      flushSummaryToDisk(runtime);
    }
    if (totalAdded > 0) {
      runtime.summary.discoveryStrategy = `WordPress REST API (${endpoint})`;
    }
  }

  if (totalAdded > 0) {
    appendJobLog(runtime, 'info', `اكتشاف ${totalAdded} رابط عبر واجهة WordPress REST API.`);
  }
  return totalAdded;
}

async function discoverUrlsFromHtmlPagination(
  runtime: ActiveJobRuntime,
  seedUrls: string[],
  deps: ImporterEngineDeps
): Promise<number> {
  const maxItems = runtime.summary.config.maxItems;
  const maxPagesToScan = Math.min(2500, Math.max(20, Math.ceil(maxItems / 12)));
  const visitedPages = new Set<string>();
  const pageQueue = [...seedUrls];
  const matchedAdapter =
    runtime.summary.config.useAdapters && seedUrls[0]
      ? deps.resolveActiveAdapterForUrl(seedUrls[0])
      : null;

  let totalAdded = 0;

  while (
    pageQueue.length > 0 &&
    visitedPages.size < maxPagesToScan &&
    runtime.summary.stats.discovered < maxItems &&
    runtime.summary.status !== 'cancelled' &&
    runtime.summary.status !== 'paused'
  ) {
    const pageUrl = pageQueue.shift()!;
    const canonPage = canonicalizeSourceUrl(pageUrl);
    if (!canonPage || visitedPages.has(canonPage)) continue;
    visitedPages.add(canonPage);

    const res = await safeFetchRemote(pageUrl, deps, 11000).catch(() => null);
    if (!res || !res.ok || res.text.length < 100) continue;

    const extracted = deps.extractListingWithOptionalAdapter(res.text, res.finalUrl || pageUrl, matchedAdapter);
    if (visitedPages.size === 1 && extracted.siteTitle) {
      runtime.summary.siteTitle = extracted.siteTitle;
    }

    for (const card of extracted.cards) {
      if (runtime.summary.stats.discovered >= maxItems) break;
      if (enqueueDiscoveredUrl(runtime, card.url, { hintTitle: card.title, hintPoster: card.poster })) {
        totalAdded++;
      }
    }

    // Also inspect generic pagination anchors beyond initial selector
    const $ = cheerio.load(res.text);
    const origin = new URL(res.finalUrl || pageUrl).origin;
    const discoveredNext = new Set<string>(extracted.nextUrls);
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      try {
        const resolved = new URL(href, res.finalUrl || pageUrl).toString();
        if (!resolved.startsWith(origin)) return;
        const txt = cleanStr($(el).text());
        if (
          $(el).attr('rel') === 'next' ||
          /التالي|التالى|Next|›|»/i.test(txt) ||
          /\/page\/\d+\/?|[?&](?:page|paged|p)=\d+/i.test(resolved)
        ) {
          discoveredNext.add(resolved);
        } else if (
          runtime.summary.config.sectionUrls.length === 0 &&
          visitedPages.size === 1 &&
          /category|genre|movies|films|افلام|أفلام|قسم/i.test(resolved) &&
          !deps.isLikelyContentUrl(resolved, origin)
        ) {
          discoveredNext.add(resolved);
        }
      } catch {
        // ignore invalid href
      }
    });

    for (const nextUrl of discoveredNext) {
      const canonNext = canonicalizeSourceUrl(nextUrl);
      if (canonNext && !visitedPages.has(canonNext) && !pageQueue.includes(nextUrl)) {
        pageQueue.push(nextUrl);
      }
    }

    if (visitedPages.size % 3 === 0) {
      flushSummaryToDisk(runtime);
    }
  }

  if (totalAdded > 0) {
    runtime.summary.discoveryStrategy = matchedAdapter
      ? `Adapter Pagination Crawler (${matchedAdapter.name})`
      : 'HTML + Auto-Pagination Crawler';
    appendJobLog(
      runtime,
      'info',
      `اكتشاف ${totalAdded} رابط فيلم عبر مسح ${visitedPages.size} صفحة ترقيم وأقسام.`
    );
  }
  return totalAdded;
}

async function runJobPipeline(runtime: ActiveJobRuntime, deps: ImporterEngineDeps) {
  runtime.lastRunStartedAt = Date.now();
  try {
    const config = runtime.summary.config;
    const parsedSource = new URL(config.sourceUrl);
    const origin = parsedSource.origin;

    // Phase 1: Discovery (only if not already finished)
    if (runtime.summary.discoveryPhase !== 'done') {
      runtime.summary.status = 'discovering';
      runtime.summary.discoveryPhase = 'scanning';
      appendJobLog(runtime, 'info', `بدء فحص واكتشاف الروابط في ${config.sourceUrl} (وضع: ${config.discoveryMode})`);
      flushSummaryToDisk(runtime);

      const mode: ImporterDiscoveryMode = config.discoveryMode;
      const hasSections = config.sectionUrls.length > 0;

      if (mode === 'sitemap') {
        await discoverUrlsFromSitemaps(runtime, origin, deps);
      } else if (mode === 'api') {
        await discoverUrlsFromApis(runtime, origin, deps);
      } else if (mode === 'html') {
        await discoverUrlsFromHtmlPagination(
          runtime,
          hasSections ? config.sectionUrls : [config.sourceUrl],
          deps
        );
      } else {
        // AUTO mode: combine best strategies cleanly until maxItems
        if (hasSections) {
          await discoverUrlsFromHtmlPagination(runtime, config.sectionUrls, deps);
          if (runtime.summary.stats.discovered < config.maxItems) {
            await discoverUrlsFromSitemaps(runtime, origin, deps);
          }
        } else {
          await discoverUrlsFromSitemaps(runtime, origin, deps);
          if (runtime.summary.stats.discovered < Math.min(20, config.maxItems)) {
            await discoverUrlsFromApis(runtime, origin, deps);
          }
          if (runtime.summary.stats.discovered < config.maxItems) {
            await discoverUrlsFromHtmlPagination(runtime, [config.sourceUrl], deps);
          }
        }
      }

      const currentStatusAfterDiscovery = runtime.summary.status as ImporterJobStatus;
      if (currentStatusAfterDiscovery === 'cancelled' || currentStatusAfterDiscovery === 'paused') {
        flushSummaryToDisk(runtime);
        return;
      }

      runtime.summary.discoveryPhase = 'done';
      appendJobLog(
        runtime,
        runtime.summary.stats.discovered > 0 ? 'success' : 'warn',
        `اكتمل الاكتشاف: تم العثور على ${runtime.summary.stats.discovered} رابط فريد.`
      );
      flushSummaryToDisk(runtime);
    }

    if (runtime.summary.stats.discovered === 0 && runtime.queue.length === 0) {
      runtime.summary.status = 'error';
      runtime.summary.error = 'لم يتم اكتشاف أي روابط أفلام من الموقع المصدر عبر الوضع المحدد.';
      runtime.summary.finishedAt = Date.now();
      flushSummaryToDisk(runtime);
      return;
    }

    // Phase 2: Parallel Batched Fetching with Rate Limiting
    runtime.summary.status = 'running';
    flushSummaryToDisk(runtime);

    const concurrency = Math.min(12, Math.max(1, config.concurrency || 4));
    const delayMs = Math.min(5000, Math.max(0, config.delayMs || 150));

    const processOneItem = async (item: QueuedTargetUrl) => {
      if (runtime.summary.status !== 'running') return;
      try {
        let movie: AdvancedImportedMovie | null = null;

        if (item.preExtracted && !config.enrichExternalMetadata && item.preExtracted.servers.length > 0) {
          movie = buildAdvancedMovieRecord(item.preExtracted, item.url, '');
        } else {
          const singleRes = await extractSingleMovieAdvanced(
            {
              url: item.url,
              useAdapters: config.useAdapters,
              enrichExternalMetadata: config.enrichExternalMetadata,
              skipEpisodeCrawl: true,
            },
            deps
          );
          if (singleRes.ok) {
            movie = singleRes.movie;
          } else if (item.preExtracted) {
            movie = buildAdvancedMovieRecord(item.preExtracted, item.url, '');
          } else {
            appendResultRecord(runtime, {
              seq: item.seq,
              itemKey: `seq_${item.seq}`,
              sourceUrl: item.url,
              status: 'failed',
              error: singleRes.error,
              fetchedAt: Date.now(),
            });
            appendJobLog(runtime, 'error', `فشل جلب ${item.hintTitle || item.url}: ${singleRes.error}`, item.url);
            return;
          }
        }

        if (item.hintPoster && !movie.poster) {
          movie.poster = deps.upgradeKnownImageUrlServer(item.hintPoster);
          movie.poster_url = movie.poster;
        }
        if (config.targetCategory && !movie.categories.includes(config.targetCategory)) {
          movie.categories = [config.targetCategory, ...movie.categories].slice(0, 10);
        }

        const dup = findSourceIndexDuplicate(movie.sourceUrl, movie.externalId, movie.imdbId);
        const status: ImporterJobItemStatus =
          dup && config.duplicateMode === 'skip' ? 'duplicate' : 'ready';

        appendResultRecord(runtime, {
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
        appendResultRecord(runtime, {
          seq: item.seq,
          itemKey: `seq_${item.seq}`,
          sourceUrl: item.url,
          status: 'failed',
          error: msg,
          fetchedAt: Date.now(),
        });
        appendJobLog(runtime, 'error', `خطأ في ${item.url}: ${msg}`, item.url);
      }
    };

    const workers = Array.from({ length: concurrency }, async (_, workerIdx) => {
      if (delayMs > 0 && workerIdx > 0) {
        await new Promise((r) => setTimeout(r, Math.min(delayMs, workerIdx * 40)));
      }
      while (runtime.summary.status === 'running') {
        const nextItem = runtime.queue.shift();
        if (!nextItem) break;
        await processOneItem(nextItem);
        if (runtime.summary.stats.processed % 5 === 0) {
          flushSummaryToDisk(runtime);
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
      appendJobLog(
        runtime,
        'success',
        `اكتملت المهمة: تم جلب ${runtime.summary.stats.fetched} عنصر (فاشل: ${runtime.summary.stats.failed}، مكرر: ${runtime.summary.stats.duplicates}).`
      );
    }
    flushSummaryToDisk(runtime);
  } catch (err) {
    if (runtime.lastRunStartedAt) {
      runtime.summary.stats.activeElapsedMs += Date.now() - runtime.lastRunStartedAt;
      runtime.lastRunStartedAt = null;
    }
    runtime.summary.status = 'error';
    runtime.summary.error = err instanceof Error ? err.message : 'فشل تشغيل مهمة الاستيراد';
    appendJobLog(runtime, 'error', runtime.summary.error);
    flushSummaryToDisk(runtime);
  } finally {
    runtime.workerLoopPromise = null;
  }
}

export async function createAndStartImporterJob(
  rawConfig: Partial<ImporterJobConfig>,
  deps: ImporterEngineDeps
): Promise<{ ok: true; job: ImporterJobSummary } | { ok: false; status: number; error: string }> {
  bootstrapPersistedJobsFromDisk();
  const sourceCheck = await validateSafeExternalUrl(String(rawConfig.sourceUrl || ''), deps);
  if (!sourceCheck.ok) {
    return { ok: false, status: 400, error: sourceCheck.error };
  }

  const sectionUrls: string[] = [];
  if (Array.isArray(rawConfig.sectionUrls)) {
    for (const s of rawConfig.sectionUrls.slice(0, 25)) {
      const sCheck = await validateSafeExternalUrl(String(s || ''), deps);
      if (sCheck.ok) sectionUrls.push(sCheck.url.toString());
    }
  }

  const maxItems = Math.min(50000, Math.max(1, Number(rawConfig.maxItems) || 100));
  const concurrency = Math.min(12, Math.max(1, Number(rawConfig.concurrency) || 4));
  const delayMs = Math.min(5000, Math.max(0, Number(rawConfig.delayMs ?? 120)));
  const batchSize = Math.min(100, Math.max(5, Number(rawConfig.batchSize) || 25));
  const discoveryMode: ImporterDiscoveryMode =
    rawConfig.discoveryMode && ['auto', 'sitemap', 'api', 'html'].includes(rawConfig.discoveryMode)
      ? rawConfig.discoveryMode
      : 'auto';
  const duplicateMode: ImporterDuplicateMode =
    rawConfig.duplicateMode === 'update' ? 'update' : 'skip';

  const config: ImporterJobConfig = {
    sourceUrl: sourceCheck.url.toString(),
    sectionUrls,
    discoveryMode,
    maxItems,
    concurrency,
    delayMs,
    batchSize,
    duplicateMode,
    targetCategory: cleanStr(rawConfig.targetCategory),
    useAdapters: rawConfig.useAdapters !== false,
    enrichExternalMetadata: Boolean(rawConfig.enrichExternalMetadata),
  };

  const jobId = `imp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const jobDir = safeJobDir(jobId)!;
  fs.mkdirSync(jobDir, { recursive: true });

  const now = Date.now();
  const summary: ImporterJobSummary = {
    id: jobId,
    siteTitle: sourceCheck.url.hostname.replace(/^www\./, ''),
    sourceUrl: config.sourceUrl,
    discoveryStrategy: discoveryMode.toUpperCase(),
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

  const runtime: ActiveJobRuntime = {
    summary,
    dir: jobDir,
    urlsFile: path.join(jobDir, 'urls.ndjson'),
    resultsFile: path.join(jobDir, 'results.ndjson'),
    statusMapFile: path.join(jobDir, 'status-map.json'),
    summaryFile: path.join(jobDir, 'job.json'),
    queue: [],
    seenCanonicalUrls: new Set<string>(),
    resultIndex: [],
    resultIndexBySeq: new Map(),
    statusOverrides: {},
    failedSeqs: [],
    nextSeq: 1,
    workerLoopPromise: null,
    lastRunStartedAt: null,
    dirtySummary: true,
  };

  fs.writeFileSync(runtime.urlsFile, '', 'utf8');
  fs.writeFileSync(runtime.resultsFile, '', 'utf8');
  flushSummaryToDisk(runtime);
  jobsMap.set(jobId, runtime);

  runtime.workerLoopPromise = runJobPipeline(runtime, deps);
  return { ok: true, job: summary };
}

export function listImporterJobs(): ImporterJobSummary[] {
  bootstrapPersistedJobsFromDisk();
  return Array.from(jobsMap.values())
    .map((r) => {
      recomputeStats(r);
      return r.summary;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getImporterJobSummary(jobId: string): ImporterJobSummary | null {
  bootstrapPersistedJobsFromDisk();
  const runtime = jobsMap.get(jobId);
  if (!runtime) return null;
  recomputeStats(runtime);
  return runtime.summary;
}

export function pauseImporterJob(jobId: string): ImporterJobSummary | null {
  bootstrapPersistedJobsFromDisk();
  const runtime = jobsMap.get(jobId);
  if (!runtime) return null;
  if (runtime.summary.status === 'running' || runtime.summary.status === 'discovering') {
    if (runtime.lastRunStartedAt) {
      runtime.summary.stats.activeElapsedMs += Date.now() - runtime.lastRunStartedAt;
      runtime.lastRunStartedAt = null;
    }
    runtime.summary.status = 'paused';
    appendJobLog(runtime, 'warn', 'تم إيقاف المهمة مؤقتاً بناءً على طلب المشرف.');
    flushSummaryToDisk(runtime);
  }
  return runtime.summary;
}

export function resumeImporterJob(jobId: string, deps: ImporterEngineDeps): ImporterJobSummary | null {
  bootstrapPersistedJobsFromDisk();
  const runtime = jobsMap.get(jobId);
  if (!runtime) return null;
  if (runtime.summary.status === 'paused' || runtime.summary.status === 'error') {
    if (runtime.queue.length === 0 && runtime.summary.discoveryPhase === 'done') {
      runtime.summary.status = 'completed';
      flushSummaryToDisk(runtime);
      return runtime.summary;
    }
    runtime.summary.status = runtime.summary.discoveryPhase === 'done' ? 'running' : 'discovering';
    runtime.summary.error = undefined;
    appendJobLog(runtime, 'info', 'استئناف المهمة من آخر نقطة تقدم محفوظة.');
    flushSummaryToDisk(runtime);
    if (!runtime.workerLoopPromise) {
      runtime.workerLoopPromise = runJobPipeline(runtime, deps);
    }
  }
  return runtime.summary;
}

export function cancelImporterJob(jobId: string): ImporterJobSummary | null {
  bootstrapPersistedJobsFromDisk();
  const runtime = jobsMap.get(jobId);
  if (!runtime) return null;
  if (runtime.lastRunStartedAt) {
    runtime.summary.stats.activeElapsedMs += Date.now() - runtime.lastRunStartedAt;
    runtime.lastRunStartedAt = null;
  }
  runtime.summary.status = 'cancelled';
  runtime.summary.finishedAt = Date.now();
  appendJobLog(runtime, 'warn', 'تم إلغاء المهمة وإيقاف الطابور.');
  flushSummaryToDisk(runtime);
  return runtime.summary;
}

export function retryFailedInImporterJob(
  jobId: string,
  seqs: number[] | undefined,
  deps: ImporterEngineDeps
): { ok: boolean; retriedCount: number; job?: ImporterJobSummary } {
  bootstrapPersistedJobsFromDisk();
  const runtime = jobsMap.get(jobId);
  if (!runtime) return { ok: false, retriedCount: 0 };

  const targetSeqs =
    Array.isArray(seqs) && seqs.length > 0
      ? new Set(seqs.map(Number).filter(Number.isFinite))
      : new Set(runtime.failedSeqs);

  let retried = 0;
  for (const seq of targetSeqs) {
    const idxRec = runtime.resultIndexBySeq.get(seq);
    if (!idxRec) continue;
    const effectiveStatus = runtime.statusOverrides[String(seq)]?.status || idxRec.status;
    if (effectiveStatus !== 'failed') continue;
    runtime.queue.push({ seq: idxRec.seq, url: idxRec.sourceUrl });
    runtime.statusOverrides[String(seq)] = { status: 'excluded' };
    retried++;
  }

  if (retried > 0) {
    runtime.summary.status = 'running';
    runtime.summary.finishedAt = undefined;
    appendJobLog(runtime, 'info', `إعادة جدولة ${retried} عنصر فاشل للمحاولة مرة أخرى.`);
    flushSummaryToDisk(runtime);
    if (!runtime.workerLoopPromise) {
      runtime.workerLoopPromise = runJobPipeline(runtime, deps);
    }
  }

  return { ok: true, retriedCount: retried, job: runtime.summary };
}

export function updateJobItemsStatus(
  jobId: string,
  updates: Array<{ seq: number; status: ImporterJobItemStatus; savedMediaId?: string }>
): ImporterJobSummary | null {
  bootstrapPersistedJobsFromDisk();
  const runtime = jobsMap.get(jobId);
  if (!runtime) return null;
  for (const upd of updates) {
    if (!runtime.resultIndexBySeq.has(upd.seq)) continue;
    runtime.statusOverrides[String(upd.seq)] = {
      status: upd.status,
      ...(upd.savedMediaId ? { savedMediaId: upd.savedMediaId } : {}),
    };
  }
  flushSummaryToDisk(runtime);
  return runtime.summary;
}

export function deleteImporterJob(jobId: string): boolean {
  bootstrapPersistedJobsFromDisk();
  const runtime = jobsMap.get(jobId);
  if (runtime) {
    runtime.summary.status = 'cancelled';
    jobsMap.delete(jobId);
  }
  const jobDir = safeJobDir(jobId);
  if (jobDir && fs.existsSync(jobDir)) {
    fs.rmSync(jobDir, { recursive: true, force: true });
    return true;
  }
  return Boolean(runtime);
}

export function getPaginatedJobItems(params: {
  jobId: string;
  page: number;
  pageSize: number;
  status?: ImporterJobItemStatus | 'all';
  search?: string;
}): ImporterPaginatedItemsResponse | null {
  bootstrapPersistedJobsFromDisk();
  const runtime = jobsMap.get(params.jobId);
  if (!runtime) return null;

  const counts = { all: 0, ready: 0, duplicate: 0, failed: 0, saved: 0, excluded: 0 };
  const searchLower = cleanStr(params.search).toLowerCase();
  const filtered: ResultIndexRecord[] = [];

  for (const rec of runtime.resultIndex) {
    const effStatus = runtime.statusOverrides[String(rec.seq)]?.status || rec.status;
    counts.all++;
    counts[effStatus]++;

    if (params.status && params.status !== 'all' && effStatus !== params.status) continue;
    if (searchLower) {
      const hay = `${rec.titleLower} ${rec.englishTitleLower} ${rec.sourceUrl.toLowerCase()} ${rec.year}`;
      if (!hay.includes(searchLower)) continue;
    }
    filtered.push(rec);
  }

  const pageSize = Math.min(200, Math.max(10, Number(params.pageSize) || 25));
  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(params.page) || 1));
  const slice = filtered.slice((page - 1) * pageSize, page * pageSize);

  const items: ImporterJobResultRecord[] = [];
  for (const idxRec of slice) {
    const fullRec = readResultRecordAt(runtime, idxRec);
    if (fullRec) items.push(fullRec);
  }

  return {
    ok: true,
    jobId: params.jobId,
    page,
    pageSize,
    totalFiltered,
    totalPages,
    counts,
    items,
  };
}

function escapeCsvField(val: unknown): string {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function streamJobExport(
  jobId: string,
  format: 'json' | 'csv',
  statusFilter: string,
  res: Response
): Promise<boolean> {
  bootstrapPersistedJobsFromDisk();
  const runtime = jobsMap.get(jobId);
  if (!runtime || !fs.existsSync(runtime.resultsFile)) return false;

  const safeFileBase = `rahaltv-import-${jobId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileBase}.csv"`);
    res.write('\uFEFF');
    res.write(
      [
        'seq',
        'status',
        'sourceUrl',
        'externalId',
        'imdbId',
        'title',
        'englishTitle',
        'year',
        'releaseDate',
        'kind',
        'categories',
        'genres',
        'tags',
        'duration',
        'imdb',
        'quality',
        'country',
        'language',
        'poster',
        'backdrop',
        'trailerUrl',
        'directors',
        'actors',
        'serversCount',
        'downloadsCount',
        'story',
      ].join(',') + '\n'
    );
  } else {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileBase}.json"`);
    res.write('[\n');
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(runtime.resultsFile, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let firstJson = true;
  for await (const line of rl) {
    if (!line.trim()) continue;
    let rec: ImporterJobResultRecord;
    try {
      rec = JSON.parse(line) as ImporterJobResultRecord;
    } catch {
      continue;
    }
    const override = runtime.statusOverrides[String(rec.seq)];
    if (override) {
      rec.status = override.status;
      if (override.savedMediaId) rec.savedMediaId = override.savedMediaId;
    }
    if (statusFilter && statusFilter !== 'all' && rec.status !== statusFilter) continue;

    if (format === 'csv') {
      const m = rec.movie;
      const actorsList = (m?.cast || [])
        .filter((c) => !/مخرج|director/i.test(c.role))
        .map((c) => c.name)
        .join(' | ');
      res.write(
        [
          rec.seq,
          rec.status,
          rec.sourceUrl,
          m?.externalId || '',
          m?.imdbId || '',
          m?.title || '',
          m?.englishTitle || '',
          m?.year || '',
          m?.releaseDate || '',
          m?.kind || '',
          (m?.categories || []).join(' | '),
          (m?.genres || []).join(' | '),
          (m?.tags || []).join(' | '),
          m?.duration || '',
          m?.imdb ?? '',
          m?.quality || '',
          m?.country || '',
          m?.language || '',
          m?.poster || '',
          m?.backdrop || '',
          m?.trailerUrl || '',
          (m?.directors || []).join(' | '),
          actorsList,
          m?.servers?.length ?? 0,
          m?.downloads?.length ?? 0,
          m?.story || rec.error || '',
        ]
          .map(escapeCsvField)
          .join(',') + '\n'
      );
    } else {
      res.write(`${firstJson ? '' : ',\n'}${JSON.stringify(rec)}`);
      firstJson = false;
    }
  }

  if (format === 'json') {
    res.write('\n]\n');
  }
  res.end();
  return true;
}

// =========================================================================
// Staff Admin Authentication Middleware (Owner Admins OR Firestore Moderators)
// =========================================================================
function readFirebaseClientConfig(): { apiKey: string; projectId: string; databaseId: string } {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as {
        apiKey?: string;
        projectId?: string;
        firestoreDatabaseId?: string;
      };
      return {
        apiKey: cleanStr(parsed.apiKey),
        projectId: cleanStr(parsed.projectId),
        databaseId: cleanStr(parsed.firestoreDatabaseId) || '(default)',
      };
    }
  } catch {
    // ignore
  }
  return { apiKey: '', projectId: '', databaseId: '(default)' };
}

export async function verifyStaffAdminMiddleware(
  req: Request & { staffAuth?: { uid: string; email: string; role: 'owner' | 'moderator' } },
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = String(req.headers.authorization || '');
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) {
      return res.status(401).json({
        ok: false,
        error: 'مطلوب مصادقة المشرف (Missing Authorization Bearer Token).',
      });
    }
    const idToken = match[1].trim();
    const cfg = readFirebaseClientConfig();
    if (!cfg.apiKey || !cfg.projectId) {
      return res.status(500).json({ ok: false, error: 'تعذر قراءة إعدادات Firebase للتحقق من الجلسة.' });
    }

    const lookupResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(cfg.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(7000),
      }
    );

    if (!lookupResp.ok) {
      return res.status(401).json({ ok: false, error: 'رمز الجلسة غير صالح أو منتهي الصلاحية.' });
    }

    const lookupData = (await lookupResp.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = lookupData.users?.[0];
    const uid = cleanStr(user?.localId);
    const email = cleanStr(user?.email).toLowerCase();
    if (!uid) {
      return res.status(401).json({ ok: false, error: 'تعذر التحقق من هوية المستخدم.' });
    }

    if (user?.emailVerified && PRIMARY_ADMIN_EMAILS.has(email)) {
      req.staffAuth = { uid, email, role: 'owner' };
      return next();
    }

    // Verify moderator/admin document via user's own Bearer token against Firestore Rules
    const fsUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      cfg.projectId
    )}/databases/${encodeURIComponent(cfg.databaseId)}/documents/admins/${encodeURIComponent(uid)}`;
    const fsResp = await fetch(fsUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
      signal: AbortSignal.timeout(7000),
    });

    if (!fsResp.ok) {
      return res.status(403).json({
        ok: false,
        error: 'صلاحية الوصول مقتصرة على مسؤولي لوحة التحكم والمشرفين المعتمدين فقط.',
      });
    }

    const docJson = (await fsResp.json()) as { fields?: { role?: { stringValue?: string } } };
    const roleVal = docJson.fields?.role?.stringValue === 'moderator' ? 'moderator' : 'owner';
    req.staffAuth = { uid, email, role: roleVal };
    return next();
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'فشل التحقق الأمني من جلسة المشرف.',
    });
  }
}
