import 'dotenv/config';
import express from 'express';
import * as cheerio from 'cheerio';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  buildExternalSearchQueries,
  cleanExternalSearchTitle,
  extractBackgroundImageUrl,
  extractCleanEnglishTitleCandidate,
  extractImdbIdFromText,
  extractJsonLdImageUrl,
  extractJsonLdNodes,
  inferEffectiveYear,
  isJunkImageCandidate,
  isLowTrustScrapedPosterUrl,
  parseSrcsetBestUrl,
  scoreExternalTitleMatch,
} from './src/lib/imageMatching.ts';
import {
  analyzeSiteStructure,
  type BaselineScrapedMedia,
  executeAdapterScrape,
  getCachedAdapters,
  isBlockedHostEnhanced,
  loadCachedAdaptersFromDisk,
  resolveActiveAdapterForUrl,
  syncCachedAdapters,
  testAdapterCandidate,
} from './server/scraperAdapterEngine.ts';
import { normalizeScraperAdapter } from './src/lib/scraperAdapterUtils.ts';
import type { AdapterContentTypeHint, ScraperAdapter } from './src/types/scraperAdapter.ts';
import {
  deleteSecretRecord,
  getMaskedSecretStatuses,
  upsertSecretRecord,
  type VerifiedAdminContext,
  verifyOwnerAdminMiddleware,
} from './server/dbSecretVault.ts';

const PORT = 3000;

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.endsWith('.local') ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    h.startsWith('169.254.')
  ) {
    return true;
  }
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function cleanText(val: string | undefined | null): string {
  return (val || '').replace(/\s+/g, ' ').trim();
}

function resolveUrl(baseUrl: string, maybeRelative: string | undefined): string {
  if (!maybeRelative) return '';
  const trimmed = maybeRelative.trim();
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:')
  ) {
    return '';
  }
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (!baseUrl) return '';
  try {
    const resolved = new URL(trimmed, baseUrl).toString();
    if (new URL(resolved).hostname === 'example.com') return '';
    return resolved;
  } catch {
    return '';
  }
}

type ServerImageQualityStatus = 'high' | 'medium' | 'low' | 'missing_backdrop' | 'unknown';

function upgradeKnownImageUrlServer(rawUrl: string | undefined | null): string {
  const clean = String(rawUrl || '').trim();
  if (!clean || !/^https?:\/\//i.test(clean)) return clean;

  if (/image\.tmdb\.org\/t\/p\//i.test(clean)) {
    return clean.replace(/\/t\/p\/(?:w\d+|h\d+|original)\//i, '/t/p/original/');
  }
  if (/bp\.blogspot\.com|blogger\.googleusercontent\.com|googleusercontent\.com/i.test(clean)) {
    let upgraded = clean.replace(/\/(?:s|w|h)\d+(?:-[a-zA-Z0-9]+)*\//i, '/s1600/');
    upgraded = upgraded.replace(/=[sw]\d+(?:-[a-zA-Z0-9-]+)*$/i, '=s1600');
    return upgraded;
  }
  if (/media-amazon\.com\/images\/|ssl-images-amazon\.com\/images\//i.test(clean)) {
    return clean.replace(/\._V1_[^.]*\.(jpg|jpeg|png|webp)$/i, '._V1_.$1');
  }
  if (/\/wp-content\/uploads\//i.test(clean)) {
    return clean.replace(/-\d{2,4}x\d{2,4}(?=\.(jpg|jpeg|png|webp)(?:\?|$))/i, '');
  }
  if (/mzstatic\.com\/image\/thumb\//i.test(clean)) {
    return clean.replace(/\/\d+x\d+bb\.(jpg|webp|png)$/i, '/1200x1800bb.jpg');
  }
  return clean;
}

function parseImageDimensionsFromBuffer(buf: Buffer): { width: number; height: number } | null {
  if (!buf || buf.length < 16) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A -> IHDR width at 16, height at 20
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf.length >= 24
  ) {
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    if (w > 0 && h > 0 && w < 30000 && h < 30000) return { width: w, height: h };
  }

  // GIF87a / GIF89a: width at 6 (LE16), height at 8 (LE16)
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf.length >= 10) {
    const w = buf.readUInt16LE(6);
    const h = buf.readUInt16LE(8);
    if (w > 0 && h > 0) return { width: w, height: h };
  }

  // WebP: RIFF .... WEBP
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP' &&
    buf.length >= 30
  ) {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X' && buf.length >= 30) {
      const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    if (chunk === 'VP8 ' && buf.length >= 30 && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
      const w = buf.readUInt16LE(26) & 0x3fff;
      const h = buf.readUInt16LE(28) & 0x3fff;
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    if (chunk === 'VP8L' && buf.length >= 25 && buf[20] === 0x2f) {
      const b1 = buf[21];
      const b2 = buf[22];
      const b3 = buf[23];
      const b4 = buf[24];
      const w = 1 + (((b2 & 0x3f) << 8) | b1);
      const h = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      if (w > 0 && h > 0) return { width: w, height: h };
    }
  }

  // JPEG: FF D8 -> scan SOF0..SOF3 markers (0xC0..0xC3, 0xC5..0xC7, 0xC9..0xCB, 0xCD..0xCF)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      while (i < buf.length && buf[i] === 0xff) i++;
      if (i >= buf.length) break;
      const marker = buf[i];
      i++;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue;
      }
      if (i + 2 > buf.length) break;
      const segLen = buf.readUInt16BE(i);
      if (segLen < 2) break;
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof && i + 7 <= buf.length) {
        const h = buf.readUInt16BE(i + 3);
        const w = buf.readUInt16BE(i + 5);
        if (w > 0 && h > 0 && w < 30000 && h < 30000) return { width: w, height: h };
        break;
      }
      i += segLen;
    }
  }

  return null;
}

async function probeRemoteImageDimensions(
  rawUrl: string,
  timeoutMs = 6500
): Promise<{ ok: boolean; url: string; width: number; height: number; contentType: string }> {
  const cleanUrl = String(rawUrl || '').trim();
  if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
    return { ok: false, url: cleanUrl, width: 0, height: 0, contentType: '' };
  }
  try {
    const parsed = new URL(cleanUrl);
    if (isBlockedHost(parsed.hostname)) {
      return { ok: false, url: cleanUrl, width: 0, height: 0, contentType: '' };
    }
  } catch {
    return { ok: false, url: cleanUrl, width: 0, height: 0, contentType: '' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(cleanUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': DEFAULT_FETCH_HEADERS['User-Agent'],
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
        Range: 'bytes=0-131071',
      },
    });
    if (!res.ok) {
      return { ok: false, url: cleanUrl, width: 0, height: 0, contentType: '' };
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType && !/^image\//i.test(contentType)) {
      return { ok: false, url: cleanUrl, width: 0, height: 0, contentType };
    }

    const reader = res.body?.getReader();
    if (!reader) {
      const ab = await res.arrayBuffer();
      const dims = parseImageDimensionsFromBuffer(Buffer.from(ab));
      return {
        ok: Boolean(dims),
        url: res.url || cleanUrl,
        width: dims?.width || 0,
        height: dims?.height || 0,
        contentType,
      };
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const MAX_READ_BYTES = 2 * 1024 * 1024;
    while (totalBytes < MAX_READ_BYTES) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      chunks.push(Buffer.from(value));
      totalBytes += value.length;
      const merged = Buffer.concat(chunks);
      const dims = parseImageDimensionsFromBuffer(merged);
      if (dims) {
        try {
          await reader.cancel();
        } catch {
          // ignore stream cancel error
        }
        return {
          ok: true,
          url: res.url || cleanUrl,
          width: dims.width,
          height: dims.height,
          contentType,
        };
      }
    }

    const finalDims = parseImageDimensionsFromBuffer(Buffer.concat(chunks));
    return {
      ok: Boolean(finalDims),
      url: res.url || cleanUrl,
      width: finalDims?.width || 0,
      height: finalDims?.height || 0,
      contentType,
    };
  } catch {
    return { ok: false, url: cleanUrl, width: 0, height: 0, contentType: '' };
  } finally {
    clearTimeout(timer);
  }
}

function evaluateImageQualityServer(params: {
  posterUrl: string;
  backdropUrl: string;
  posterWidth: number;
  posterHeight: number;
  backdropWidth: number;
  backdropHeight: number;
}): ServerImageQualityStatus {
  const { posterUrl, backdropUrl, posterWidth, posterHeight, backdropWidth, backdropHeight } = params;
  const hasDistinctBackdrop = Boolean(backdropUrl && backdropUrl !== posterUrl);
  const backdropIsPortrait = backdropWidth > 0 && backdropHeight > 0 && backdropWidth <= backdropHeight;

  if (!hasDistinctBackdrop || backdropIsPortrait) return 'missing_backdrop';
  if (posterWidth > 0 && posterHeight > 0 && backdropWidth > 0 && backdropHeight > 0) {
    if (posterWidth < 450 || posterHeight < 650 || backdropWidth < 960 || backdropHeight < 540) {
      return 'low';
    }
    if (posterWidth >= 600 && posterHeight >= 900 && backdropWidth >= 1200 && backdropHeight >= 675) {
      return 'high';
    }
    return 'medium';
  }
  return 'unknown';
}

function extractBestImageFromElementServer(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<any>,
  baseUrl: string
): string {
  if (!$el || $el.length === 0) return '';
  const hintText = [
    $el.attr('alt') || '',
    $el.attr('class') || '',
    $el.attr('id') || '',
  ].join(' ');

  const attrWidth = Number($el.attr('width') || 0);
  const attrHeight = Number($el.attr('height') || 0);
  if ((attrWidth > 0 && attrWidth < 80) || (attrHeight > 0 && attrHeight < 80)) {
    return '';
  }

  const pictureSrcsets: string[] = [];
  const $parent = $el.parent();
  if ($parent.length && $parent.prop('tagName')?.toLowerCase() === 'picture') {
    $parent.find('source').each((_, srcEl) => {
      const s = $(srcEl).attr('data-srcset') || $(srcEl).attr('srcset') || '';
      if (s) pictureSrcsets.push(s);
    });
  }

  const rawCandidates = [
    $el.attr('data-original'),
    $el.attr('data-full-src'),
    $el.attr('data-lazy-src'),
    $el.attr('data-src'),
    $el.attr('data-lazy'),
    $el.attr('data-echo'),
    $el.attr('data-bg'),
    $el.attr('data-background'),
    $el.attr('data-background-image'),
    $el.attr('data-poster'),
    $el.attr('data-image'),
    $el.attr('data-thumb'),
    $el.attr('data-url'),
    parseSrcsetBestUrl($el.attr('data-srcset') || $el.attr('srcset')),
    ...pictureSrcsets.map((s) => parseSrcsetBestUrl(s)),
    extractBackgroundImageUrl($el.attr('style')),
    $el.attr('src'),
    $el.attr('content'),
  ];

  for (const raw of rawCandidates) {
    if (!raw) continue;
    const resolved = resolveUrl(baseUrl, raw);
    if (!resolved || isJunkImageCandidate(resolved, hintText)) continue;
    return upgradeKnownImageUrlServer(resolved);
  }
  return '';
}

const EXCLUDED_POSTER_CONTAINERS_SELECTOR =
  'header, nav, footer, aside, .navbar, .related, .related-videos, .similar, .recommended, .suggest, .comments, .sidebar, .widget, .carousel, .owl-carousel, .swiper, .pm-ul-carousel-videos, [class*="related"], [class*="similar"], [class*="widget"], [id*="related"], [id*="sidebar"]';

function pickFirstValidImageFromSelectorsServer(
  $: cheerio.CheerioAPI,
  selectors: string,
  baseUrl: string,
  skipChromeAndRelated = true
): string {
  let found = '';
  let lowTrustFallback = '';
  $(selectors).each((_, el) => {
    if (found) return;
    const $el = $(el);
    if (skipChromeAndRelated && $el.closest(EXCLUDED_POSTER_CONTAINERS_SELECTOR).length > 0) {
      return;
    }
    const candidate = extractBestImageFromElementServer($, $el, baseUrl);
    if (!candidate) return;
    if (isLowTrustScrapedPosterUrl(candidate)) {
      if (!lowTrustFallback) lowTrustFallback = candidate;
      return;
    }
    found = candidate;
  });
  return found || lowTrustFallback;
}

async function queryTmdbHighResImages(params: {
  query: string;
  title: string;
  englishTitle: string;
  year: string;
  kind: string;
}): Promise<{
  poster_url: string;
  poster_width: number;
  poster_height: number;
  backdrop_url: string;
  backdrop_width: number;
  backdrop_height: number;
} | null> {
  const { query, title, englishTitle, year, kind } = params;
  const tmdbKey = (process.env.TMDB_API_KEY || '').trim();
  const tmdbBearer = (process.env.TMDB_READ_ACCESS_TOKEN || '').trim();
  if ((!tmdbKey && !tmdbBearer) || !query) return null;

  const isSeries = kind === 'series';
  const searchType = isSeries ? 'tv' : 'movie';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (tmdbBearer) headers.Authorization = `Bearer ${tmdbBearer}`;

  const buildUrl = (pathAndQuery: string) => {
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    return tmdbBearer
      ? `https://api.themoviedb.org/3${pathAndQuery}`
      : `https://api.themoviedb.org/3${pathAndQuery}${sep}api_key=${encodeURIComponent(tmdbKey)}`;
  };

  interface TmdbSearchItem {
    id: number;
    title?: string;
    original_title?: string;
    name?: string;
    original_name?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path?: string;
    backdrop_path?: string;
  }

  const pickBestMatch = (results: TmdbSearchItem[]): TmdbSearchItem | null => {
    let best: TmdbSearchItem | null = null;
    let bestScore = 0;
    for (const item of results.slice(0, 8)) {
      if (!item?.id) continue;
      const candYear = (item.release_date || item.first_air_date || '').slice(0, 4);
      const check = scoreExternalTitleMatch({
        queryTitle: title,
        englishTitle,
        expectedYear: year,
        expectedYearExplicit: Boolean(year && year !== '2026'),
        candidateTitles: [item.title, item.original_title, item.name, item.original_name],
        candidateYear: candYear,
      });
      if (check.matched && check.score > bestScore) {
        bestScore = check.score;
        best = item;
      }
    }
    return best;
  };

  try {
    const yearParam =
      /^\d{4}$/.test(year) && year !== '2026'
        ? isSeries
          ? `&first_air_date_year=${year}`
          : `&year=${year}`
        : '';

    let matchedItem: TmdbSearchItem | null = null;

    const searchRes = await fetch(
      buildUrl(`/search/${searchType}?query=${encodeURIComponent(query)}&include_adult=false${yearParam}`),
      { headers, signal: AbortSignal.timeout(7000) }
    );
    if (searchRes.ok) {
      const searchJson = (await searchRes.json()) as { results?: TmdbSearchItem[] };
      matchedItem = pickBestMatch(searchJson.results || []);
    }

    // Retry without strict year param in case theatrical vs digital release year differs by 1-2 years
    if (!matchedItem && yearParam) {
      const fallbackRes = await fetch(
        buildUrl(`/search/${searchType}?query=${encodeURIComponent(query)}&include_adult=false`),
        { headers, signal: AbortSignal.timeout(7000) }
      );
      if (fallbackRes.ok) {
        const fallbackJson = (await fallbackRes.json()) as { results?: TmdbSearchItem[] };
        matchedItem = pickBestMatch(fallbackJson.results || []);
      }
    }

    if (!matchedItem?.id) return null;

    const imagesRes = await fetch(
      buildUrl(`/${searchType}/${matchedItem.id}/images?include_image_language=en,ar,null`),
      { headers, signal: AbortSignal.timeout(7000) }
    );
    if (!imagesRes.ok) {
      return {
        poster_url: matchedItem.poster_path ? `https://image.tmdb.org/t/p/original${matchedItem.poster_path}` : '',
        poster_width: 0,
        poster_height: 0,
        backdrop_url: matchedItem.backdrop_path ? `https://image.tmdb.org/t/p/original${matchedItem.backdrop_path}` : '',
        backdrop_width: 0,
        backdrop_height: 0,
      };
    }

    const imgJson = (await imagesRes.json()) as {
      posters?: Array<{ file_path: string; width: number; height: number; aspect_ratio: number }>;
      backdrops?: Array<{ file_path: string; width: number; height: number; aspect_ratio: number }>;
    };

    const bestPoster = (imgJson.posters || [])
      .filter((p) => p.file_path && p.height > p.width)
      .sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    const bestBackdrop = (imgJson.backdrops || [])
      .filter((b) => b.file_path && b.width > b.height && (b.aspect_ratio || b.width / Math.max(1, b.height)) >= 1.5)
      .sort((a, b) => (b.width || 0) - (a.width || 0))[0];

    const posterPath = bestPoster?.file_path || matchedItem.poster_path || '';
    const backdropPath = bestBackdrop?.file_path || matchedItem.backdrop_path || '';

    return {
      poster_url: posterPath ? `https://image.tmdb.org/t/p/original${posterPath}` : '',
      poster_width: bestPoster?.width || 0,
      poster_height: bestPoster?.height || 0,
      backdrop_url: backdropPath ? `https://image.tmdb.org/t/p/original${backdropPath}` : '',
      backdrop_width: bestBackdrop?.width || 0,
      backdrop_height: bestBackdrop?.height || 0,
    };
  } catch {
    return null;
  }
}

function buildCandidateSearchQueriesServer(
  title: string,
  englishTitle: string,
  extraTitle?: string
): string[] {
  return buildExternalSearchQueries(title, englishTitle, extraTitle);
}

const WIKIDATA_FILM_QIDS_SERVER = new Set([
  'Q11424',
  'Q24869',
  'Q202866',
  'Q226730',
  'Q506240',
  'Q24856',
]);
const WIKIDATA_SERIES_QIDS_SERVER = new Set([
  'Q5398426',
  'Q1259759',
  'Q1107',
  'Q63952888',
  'Q581714',
  'Q15416',
]);

const WIKIMEDIA_SERVER_CACHE = new Map<string, { imdbId: string; englishTitle: string; year: string } | null>();
let serverWikimediaQueue: Promise<unknown> = Promise.resolve();
let serverLastWikimediaAt = 0;

function enqueueServerWikimediaCall<T>(task: () => Promise<T>): Promise<T> {
  const run = serverWikimediaQueue.then(async () => {
    const waitMs = Math.max(0, 420 - (Date.now() - serverLastWikimediaAt));
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    serverLastWikimediaAt = Date.now();
    return task();
  });
  serverWikimediaQueue = run.catch(() => undefined);
  return run;
}

const WIKIMEDIA_HEADERS = {
  'User-Agent': 'RahaLTV/1.0 (https://rahaaltv.app)',
  'Api-User-Agent': 'RahaLTV/1.0 (https://rahaaltv.app)',
  Accept: 'application/json',
};

async function fetchServerWikimediaJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await enqueueServerWikimediaCall(() =>
        fetch(url, { headers: WIKIMEDIA_HEADERS, signal: AbortSignal.timeout(7000) })
      );
      const text = await res.text();
      if (
        res.status === 429 ||
        /too many requests/i.test(text) ||
        (!res.ok && res.status >= 500)
      ) {
        if (attempt < 2) {
          const retryAfterSec = Number(res.headers.get('retry-after') || '');
          const delayMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? Math.min(8000, retryAfterSec * 1000)
            : 1600 * (attempt + 1);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        return null;
      }
      if (!res.ok || !text.trim().startsWith('{')) return null;
      return JSON.parse(text) as T;
    } catch {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

async function queryWikidataBridgeServer(params: {
  queries: string[];
  title: string;
  englishTitle: string;
  year: string;
  kind: string;
}): Promise<{ imdbId: string; englishTitle: string; year: string } | null> {
  const { queries, title, englishTitle, year, kind } = params;
  if (queries.length === 0) return null;

  const cacheKey = `${kind}|${queries.slice(0, 3).join('||').toLowerCase()}|${year}`;
  if (WIKIMEDIA_SERVER_CACHE.has(cacheKey)) {
    return WIKIMEDIA_SERVER_CACHE.get(cacheKey) || null;
  }

  const scoreEntityIds = async (ids: string[]) => {
    if (!ids.length) return null;
    const eJson = await fetchServerWikimediaJson<{
      entities?: Record<
        string,
        {
          labels?: { ar?: { value?: string }; en?: { value?: string }; mul?: { value?: string } };
          aliases?: {
            ar?: Array<{ value?: string }>;
            en?: Array<{ value?: string }>;
            mul?: Array<{ value?: string }>;
          };
          claims?: Record<
            string,
            Array<{ mainsnak?: { datavalue?: { value?: string | { id?: string; time?: string } } } }>
          >;
        }
      >;
    }>(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=labels|aliases|claims&languages=ar|en|mul&format=json`
    );
    if (!eJson) return null;

    let bestMatch: { score: number; imdbId: string; englishTitle: string; year: string } | null = null;
    for (const id of ids) {
      const ent = eJson.entities?.[id];
      if (!ent?.claims) continue;
      const imdbVal = ent.claims.P345?.[0]?.mainsnak?.datavalue?.value;
      const imdbId = typeof imdbVal === 'string' && /^tt\d{6,10}$/i.test(imdbVal) ? imdbVal : '';
      const enLabel = ent.labels?.en?.value || ent.labels?.mul?.value || '';
      if (!imdbId && !enLabel) continue;

      const p31Ids = (ent.claims.P31 || [])
        .map((c) => {
          const v = c?.mainsnak?.datavalue?.value;
          return typeof v === 'object' && v?.id ? v.id : '';
        })
        .filter(Boolean);
      const isSeriesQid = p31Ids.some((q) => WIKIDATA_SERIES_QIDS_SERVER.has(q));
      const isFilmQid = p31Ids.some((q) => WIKIDATA_FILM_QIDS_SERVER.has(q));
      if (kind === 'movie' && isSeriesQid && !isFilmQid) continue;
      if (kind === 'series' && isFilmQid && !isSeriesQid) continue;

      const dateVal =
        ent.claims.P577?.[0]?.mainsnak?.datavalue?.value ||
        ent.claims.P580?.[0]?.mainsnak?.datavalue?.value;
      const candYear =
        typeof dateVal === 'object' && dateVal?.time
          ? dateVal.time.match(/(\d{4})/)?.[1] || ''
          : '';

      const check = scoreExternalTitleMatch({
        queryTitle: title,
        englishTitle,
        expectedYear: year,
        expectedYearExplicit: Boolean(year && year !== '2026'),
        kind,
        candidateTitles: [
          ent.labels?.ar?.value,
          enLabel,
          ...(ent.aliases?.ar || []).map((a) => a.value),
          ...(ent.aliases?.en || []).map((a) => a.value),
          ...(ent.aliases?.mul || []).map((a) => a.value),
        ],
        candidateYear: candYear,
      });
      if (check.matched) {
        const effectiveScore = imdbId ? check.score + 0.05 : check.score;
        if (!bestMatch || effectiveScore > bestMatch.score) {
          bestMatch = {
            score: effectiveScore,
            imdbId,
            englishTitle: enLabel || ent.labels?.ar?.value || '',
            year: candYear,
          };
        }
      }
    }
    return bestMatch
      ? { imdbId: bestMatch.imdbId, englishTitle: bestMatch.englishTitle, year: bestMatch.year }
      : null;
  };

  for (const term of queries.slice(0, 3)) {
    const lang = /[\u0600-\u06FF]/.test(term) ? 'ar' : 'en';
    const sJson = await fetchServerWikimediaJson<{ search?: Array<{ id?: string }> }>(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(term)}&language=${lang}&limit=6&format=json`
    );
    if (sJson) {
      const ids = (sJson.search || []).map((s) => s.id).filter((id): id is string => Boolean(id));
      const matched = await scoreEntityIds(ids);
      if (matched) {
        if (WIKIMEDIA_SERVER_CACHE.size > 400) WIKIMEDIA_SERVER_CACHE.clear();
        WIKIMEDIA_SERVER_CACHE.set(cacheKey, matched);
        return matched;
      }
    }
  }

  // Wikipedia full-text search fallback when wbsearchentities missed punctuation/subtitles
  const primaryTerm = queries.find((q) => /[\u0600-\u06FF]/.test(q)) || queries[0];
  if (primaryTerm) {
    const wikiLang = /[\u0600-\u06FF]/.test(primaryTerm) ? 'ar' : 'en';
    const wpJson = await fetchServerWikimediaJson<{
      query?: { pages?: Record<string, { pageprops?: { wikibase_item?: string } }> };
    }>(
      `https://${wikiLang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(primaryTerm)}&gsrlimit=5&prop=pageprops&ppprop=wikibase_item&format=json`
    );
    if (wpJson) {
      const ids = Array.from(
        new Set(
          Object.values(wpJson.query?.pages || {})
            .map((p) => p.pageprops?.wikibase_item)
            .filter((id): id is string => Boolean(id && /^Q\d+$/i.test(id)))
        )
      );
      const matched = await scoreEntityIds(ids);
      if (matched) {
        if (WIKIMEDIA_SERVER_CACHE.size > 400) WIKIMEDIA_SERVER_CACHE.clear();
        WIKIMEDIA_SERVER_CACHE.set(cacheKey, matched);
        return matched;
      }
    }
  }

  if (WIKIMEDIA_SERVER_CACHE.size > 400) WIKIMEDIA_SERVER_CACHE.clear();
  WIKIMEDIA_SERVER_CACHE.set(cacheKey, null);
  return null;
}

async function queryImdbSuggestionServer(params: {
  queries: string[];
  imdbId?: string;
  title: string;
  englishTitle: string;
  year: string;
  kind: string;
}): Promise<{ imdbId: string; poster: string; pw: number; ph: number } | null> {
  const { queries, imdbId = '', title, englishTitle, year, kind } = params;
  const searchList = imdbId ? [imdbId, ...queries] : queries;
  interface ImdbSuggestEntry {
    id?: string;
    l?: string;
    qid?: string;
    y?: number;
    i?: { imageUrl?: string; width?: number; height?: number };
  }

  for (const rawQ of searchList.slice(0, 3)) {
    const cleanQ = rawQ.trim();
    if (cleanQ.length < 2) continue;
    const isDirectId = /^tt\d{6,10}$/i.test(cleanQ);
    const firstChar = cleanQ.charAt(0).toLowerCase();
    const prefix = /[a-z0-9]/.test(firstChar) ? firstChar : 'a';
    try {
      const res = await fetch(
        `https://v3.sg.media-imdb.com/suggestion/${prefix}/${encodeURIComponent(cleanQ.toLowerCase())}.json`,
        { signal: AbortSignal.timeout(6500) }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { d?: ImdbSuggestEntry[] };
      let best: { score: number; entry: ImdbSuggestEntry } | null = null;
      for (const item of (json.d || []).slice(0, 10)) {
        if (!item?.id || !/^tt\d+$/i.test(item.id) || !item.i?.imageUrl) continue;
        const qid = (item.qid || '').toLowerCase();
        if (kind === 'movie' && qid && !['movie', 'feature', 'tvmovie', 'short', 'video'].includes(qid)) {
          continue;
        }
        if (kind === 'series' && qid && !['tvseries', 'tvminiseries'].includes(qid)) {
          continue;
        }
        if (isDirectId && item.id.toLowerCase() === cleanQ.toLowerCase()) {
          best = { score: 2, entry: item };
          break;
        }
        const check = scoreExternalTitleMatch({
          queryTitle: title,
          englishTitle,
          expectedYear: year,
          expectedYearExplicit: Boolean(year && year !== '2026'),
          candidateTitles: [item.l],
          candidateYear: item.y ? String(item.y) : undefined,
        });
        if (check.matched && (!best || check.score > best.score)) {
          best = { score: check.score, entry: item };
        }
      }
      if (best?.entry?.id && best.entry.i?.imageUrl) {
        return {
          imdbId: best.entry.id,
          poster: upgradeKnownImageUrlServer(best.entry.i.imageUrl),
          pw: best.entry.i.width || 0,
          ph: best.entry.i.height || 0,
        };
      }
    } catch {
      // ignore IMDb suggestion error
    }
  }
  return null;
}

async function queryCinemetaImagesServer(params: {
  queries: string[];
  imdbId?: string;
  title: string;
  englishTitle: string;
  year: string;
  kind: string;
}): Promise<{
  imdbId: string;
  poster: string;
  backdrop: string;
  pw: number;
  ph: number;
  bw: number;
  bh: number;
  source: string;
} | null> {
  const { queries, imdbId = '', title, englishTitle, year, kind } = params;
  const cmType = kind === 'series' ? 'series' : 'movie';

  const resolveFromImdbId = async (ttId: string) => {
    try {
      const metaRes = await fetch(
        `https://v3-cinemeta.strem.io/meta/${cmType}/${encodeURIComponent(ttId)}.json`,
        { signal: AbortSignal.timeout(6000) }
      );
      let metaPoster = '';
      let metaBackdrop = '';
      if (metaRes.ok) {
        const metaJson = (await metaRes.json()) as {
          meta?: { poster?: string; background?: string };
        };
        metaPoster = metaJson.meta?.poster || '';
        metaBackdrop = metaJson.meta?.background || '';
      }
      const largePoster = `https://images.metahub.space/poster/large/${ttId}/img`;
      const largeBackdrop = `https://images.metahub.space/background/large/${ttId}/img`;

      const [pLarge, bLarge] = await Promise.all([
        probeRemoteImageDimensions(largePoster, 5500),
        probeRemoteImageDimensions(largeBackdrop, 5500),
      ]);

      let poster = '';
      let pw = 0;
      let ph = 0;
      if (pLarge.ok && pLarge.height >= pLarge.width) {
        poster = largePoster;
        pw = pLarge.width;
        ph = pLarge.height;
      } else if (metaPoster) {
        const pMeta = await probeRemoteImageDimensions(metaPoster, 5000);
        if (pMeta.ok && pMeta.height >= pMeta.width) {
          poster = metaPoster;
          pw = pMeta.width;
          ph = pMeta.height;
        }
      }

      let backdrop = '';
      let bw = 0;
      let bh = 0;
      if (bLarge.ok && bLarge.width > bLarge.height) {
        backdrop = largeBackdrop;
        bw = bLarge.width;
        bh = bLarge.height;
      } else if (metaBackdrop) {
        const bMeta = await probeRemoteImageDimensions(metaBackdrop, 5000);
        if (bMeta.ok && bMeta.width > bMeta.height) {
          backdrop = metaBackdrop;
          bw = bMeta.width;
          bh = bMeta.height;
        }
      }

      if (!poster && !backdrop) return null;
      return {
        imdbId: ttId,
        poster,
        backdrop,
        pw,
        ph,
        bw,
        bh,
        source: backdrop ? 'cinemeta' : 'metahub',
      };
    } catch {
      return null;
    }
  };

  if (imdbId && /^tt\d{6,10}$/i.test(imdbId)) {
    const byId = await resolveFromImdbId(imdbId);
    if (byId) return byId;
  }

  for (const q of queries.slice(0, 3)) {
    try {
      const searchRes = await fetch(
        `https://v3-cinemeta.strem.io/catalog/${cmType}/top/search=${encodeURIComponent(q)}.json`,
        { signal: AbortSignal.timeout(6500) }
      );
      if (!searchRes.ok) continue;
      const json = (await searchRes.json()) as {
        metas?: Array<{ id?: string; name?: string; releaseInfo?: string; year?: string | number }>;
      };
      let bestTtId = '';
      let bestScore = 0;
      for (const m of (json.metas || []).slice(0, 10)) {
        if (!m?.id || !/^tt\d+$/i.test(m.id) || !m.name) continue;
        const candYear = String(m.year || m.releaseInfo || '').slice(0, 4);
        const check = scoreExternalTitleMatch({
          queryTitle: title,
          englishTitle,
          expectedYear: year,
          expectedYearExplicit: Boolean(year && year !== '2026'),
          candidateTitles: [m.name],
          candidateYear: candYear,
        });
        if (check.matched && check.score > bestScore) {
          bestScore = check.score;
          bestTtId = m.id;
        }
      }
      if (bestTtId) {
        const resolved = await resolveFromImdbId(bestTtId);
        if (resolved) return resolved;
      }
    } catch {
      // ignore Cinemeta search error
    }
  }
  return null;
}

export interface ServerRatingLookupInput {
  id?: string;
  title: string;
  englishTitle?: string;
  year?: string;
  kind?: string;
  imdbId?: string;
}

export interface ServerResolvedMediaRating {
  id?: string;
  imdb: number;
  imdbId?: string;
  votes?: string;
  matchedTitle?: string;
  year?: string;
  source: 'imdb' | 'tmdb' | 'tvmaze';
}

function normalizeRatingNumberServer(raw: unknown): number | null {
  const num = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
  if (!Number.isFinite(num) || num <= 0 || num > 10) return null;
  return Math.round(num * 10) / 10;
}

function buildRatingSearchQueriesServer(title: string, englishTitle = ''): string[] {
  return buildExternalSearchQueries(title, englishTitle);
}

async function fetchTvmazeRatingByImdbIdServer(
  ttId: string
): Promise<{ rating: number; name?: string; year?: string } | null> {
  try {
    const res = await fetch(
      `https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(ttId)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const show = (await res.json()) as {
      name?: string;
      premiered?: string;
      rating?: { average?: number | null };
    };
    const rating = normalizeRatingNumberServer(show?.rating?.average);
    if (rating === null) return null;
    return {
      rating,
      name: show.name,
      year: show.premiered?.slice(0, 4) || undefined,
    };
  } catch {
    return null;
  }
}

async function fetchCinemetaRatingByImdbIdServer(
  ttId: string,
  kind: string
): Promise<{ rating: number; name?: string; year?: string; source: 'imdb' | 'tvmaze' } | null> {
  const typesToTry =
    kind === 'series' || kind === 'tv' || kind === 'wrestling'
      ? ['series', 'movie']
      : ['movie', 'series'];

  for (const cmType of typesToTry) {
    try {
      const res = await fetch(
        `https://v3-cinemeta.strem.io/meta/${cmType}/${encodeURIComponent(ttId)}.json`,
        { signal: AbortSignal.timeout(5500) }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as {
        meta?: {
          imdbRating?: string | number;
          name?: string;
          year?: string | number;
          releaseInfo?: string;
        };
      };
      const rating = normalizeRatingNumberServer(json.meta?.imdbRating);
      if (rating !== null) {
        return {
          rating,
          name: json.meta?.name,
          year: String(json.meta?.year || json.meta?.releaseInfo || '').slice(0, 4) || undefined,
          source: 'imdb',
        };
      }
    } catch {
      // ignore Cinemeta meta lookup errors
    }
  }

  if (kind === 'series' || kind === 'tv' || kind === 'wrestling') {
    const tv = await fetchTvmazeRatingByImdbIdServer(ttId);
    if (tv) return { ...tv, source: 'tvmaze' };
  }

  return null;
}

async function queryTmdbRatingServer(params: {
  queries: string[];
  title: string;
  englishTitle: string;
  year: string;
  yearExplicit: boolean;
  kind: string;
}): Promise<ServerResolvedMediaRating | null> {
  const { queries, title, englishTitle, year, yearExplicit, kind } = params;
  const tmdbKey = (process.env.TMDB_API_KEY || '').trim();
  const tmdbBearer = (process.env.TMDB_READ_ACCESS_TOKEN || '').trim();
  if ((!tmdbKey && !tmdbBearer) || queries.length === 0) return null;

  const isSeries = kind === 'series' || kind === 'tv' || kind === 'wrestling';
  const searchType = isSeries ? 'tv' : 'movie';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (tmdbBearer) headers.Authorization = `Bearer ${tmdbBearer}`;

  const buildUrl = (pathAndQuery: string) => {
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    return tmdbBearer
      ? `https://api.themoviedb.org/3${pathAndQuery}`
      : `https://api.themoviedb.org/3${pathAndQuery}${sep}api_key=${encodeURIComponent(tmdbKey)}`;
  };

  interface TmdbSearchEntry {
    id: number;
    title?: string;
    original_title?: string;
    name?: string;
    original_name?: string;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    vote_count?: number;
  }

  for (const query of queries.slice(0, 3)) {
    try {
      const yearParam =
        yearExplicit && /^\d{4}$/.test(year)
          ? isSeries
            ? `&first_air_date_year=${year}`
            : `&year=${year}`
          : '';
      let res = await fetch(
        buildUrl(`/search/${searchType}?query=${encodeURIComponent(query)}&include_adult=false${yearParam}`),
        { headers, signal: AbortSignal.timeout(6000) }
      );
      let results: TmdbSearchEntry[] = [];
      if (res.ok) {
        const json = (await res.json()) as { results?: TmdbSearchEntry[] };
        results = json.results || [];
      }
      if (results.length === 0 && yearParam) {
        res = await fetch(
          buildUrl(`/search/${searchType}?query=${encodeURIComponent(query)}&include_adult=false`),
          { headers, signal: AbortSignal.timeout(6000) }
        );
        if (res.ok) {
          const json = (await res.json()) as { results?: TmdbSearchEntry[] };
          results = json.results || [];
        }
      }

      let best: { score: number; entry: TmdbSearchEntry; year: string } | null = null;
      for (const item of results.slice(0, 8)) {
        if (!item?.id) continue;
        const candYear = (item.release_date || item.first_air_date || '').slice(0, 4);
        const check = scoreExternalTitleMatch({
          queryTitle: title,
          englishTitle,
          expectedYear: year,
          expectedYearExplicit: yearExplicit,
          kind,
          candidateTitles: [item.title, item.original_title, item.name, item.original_name],
          candidateYear: candYear,
        });
        if (check.matched && (!best || check.score > best.score)) {
          best = { score: check.score, entry: item, year: candYear };
        }
      }
      if (!best) continue;

      let imdbId = '';
      let voteAverage = best.entry.vote_average;
      let voteCount = best.entry.vote_count || 0;
      try {
        const detailsRes = await fetch(
          buildUrl(`/${searchType}/${best.entry.id}?append_to_response=external_ids`),
          { headers, signal: AbortSignal.timeout(6000) }
        );
        if (detailsRes.ok) {
          const detailsJson = (await detailsRes.json()) as {
            imdb_id?: string;
            vote_average?: number;
            vote_count?: number;
            external_ids?: { imdb_id?: string };
          };
          imdbId = detailsJson.imdb_id || detailsJson.external_ids?.imdb_id || '';
          if (typeof detailsJson.vote_average === 'number') voteAverage = detailsJson.vote_average;
          if (typeof detailsJson.vote_count === 'number') voteCount = detailsJson.vote_count;
        }
      } catch {
        // non-fatal
      }

      if (imdbId && /^tt\d{6,10}$/i.test(imdbId)) {
        const cinemeta = await fetchCinemetaRatingByImdbIdServer(imdbId, kind);
        if (cinemeta) {
          return {
            imdb: cinemeta.rating,
            imdbId,
            votes: voteCount > 0 ? voteCount.toLocaleString('en-US') : undefined,
            matchedTitle:
              cinemeta.name || best.entry.title || best.entry.name || best.entry.original_title,
            year: cinemeta.year || best.year || undefined,
            source: cinemeta.source,
          };
        }
      }

      const tmdbRating = normalizeRatingNumberServer(voteAverage);
      if (tmdbRating !== null && voteCount > 0) {
        return {
          imdb: tmdbRating,
          imdbId: imdbId || undefined,
          votes: voteCount.toLocaleString('en-US'),
          matchedTitle: best.entry.title || best.entry.name || best.entry.original_title,
          year: best.year || undefined,
          source: 'tmdb',
        };
      }
    } catch {
      // ignore TMDB error
    }
  }
  return null;
}

async function queryImdbSuggestionIdServer(params: {
  queries: string[];
  title: string;
  englishTitle: string;
  year: string;
  yearExplicit: boolean;
  kind: string;
}): Promise<string | null> {
  const { queries, title, englishTitle, year, yearExplicit, kind } = params;
  for (const rawQ of queries.slice(0, 3)) {
    const cleanQ = rawQ.trim();
    if (cleanQ.length < 2) continue;
    if (!/[A-Za-z]/.test(cleanQ) && /[\u0600-\u06FF]/.test(cleanQ)) continue;
    const firstChar = cleanQ.charAt(0).toLowerCase();
    const prefix = /[a-z0-9]/.test(firstChar) ? firstChar : 'a';
    try {
      const res = await fetch(
        `https://v3.sg.media-imdb.com/suggestion/${prefix}/${encodeURIComponent(cleanQ.toLowerCase())}.json`,
        { signal: AbortSignal.timeout(5500) }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as {
        d?: Array<{ id?: string; l?: string; qid?: string; y?: number }>;
      };
      let best: { score: number; id: string } | null = null;
      for (const item of (json.d || []).slice(0, 10)) {
        if (!item?.id || !/^tt\d+$/i.test(item.id) || !item.l) continue;
        const qid = (item.qid || '').toLowerCase();
        if (
          kind === 'movie' &&
          qid &&
          !['movie', 'feature', 'tvmovie', 'short', 'video', 'tvspecial'].includes(qid)
        ) {
          continue;
        }
        if (kind === 'series' && qid && !['tvseries', 'tvminiseries'].includes(qid)) {
          continue;
        }
        const check = scoreExternalTitleMatch({
          queryTitle: title,
          englishTitle,
          expectedYear: year,
          expectedYearExplicit: yearExplicit,
          kind,
          candidateTitles: [item.l],
          candidateYear: item.y ? String(item.y) : undefined,
        });
        if (check.matched && (!best || check.score > best.score)) {
          best = { score: check.score, id: item.id };
        }
      }
      if (best?.id) return best.id;
    } catch {
      // ignore suggestion lookup errors
    }
  }
  return null;
}

async function searchCinemetaRatingServer(params: {
  queries: string[];
  title: string;
  englishTitle: string;
  effectiveYear: string;
  yearExplicit: boolean;
  kind: string;
  inputId?: string;
}): Promise<ServerResolvedMediaRating | null> {
  const { queries, title, englishTitle, effectiveYear, yearExplicit, kind, inputId } = params;
  const cmTypes =
    kind === 'series' || kind === 'tv' || kind === 'wrestling'
      ? ['series', 'movie']
      : ['movie', 'series'];

  for (const cmType of cmTypes) {
    for (const q of queries.slice(0, 3)) {
      if (!/[A-Za-z]/.test(q) && /[\u0600-\u06FF]/.test(q)) continue;
      try {
        const res = await fetch(
          `https://v3-cinemeta.strem.io/catalog/${cmType}/top/search=${encodeURIComponent(q)}.json`,
          { signal: AbortSignal.timeout(5500) }
        );
        if (!res.ok) continue;
        const json = (await res.json()) as {
          metas?: Array<{ id?: string; name?: string; releaseInfo?: string; year?: string | number }>;
        };
        const matches: Array<{ id: string; score: number; name: string; year: string }> = [];
        for (const m of (json.metas || []).slice(0, 12)) {
          if (!m?.id || !/^tt\d+$/i.test(m.id) || !m.name) continue;
          const candYear = String(m.year || m.releaseInfo || '').slice(0, 4);
          const check = scoreExternalTitleMatch({
            queryTitle: title,
            englishTitle,
            expectedYear: effectiveYear,
            expectedYearExplicit: yearExplicit,
            kind,
            candidateTitles: [m.name],
            candidateYear: candYear,
          });
          if (check.matched) {
            matches.push({ id: m.id, score: check.score, name: m.name, year: candYear });
          }
        }
        matches.sort((a, b) => b.score - a.score);
        for (const cand of matches.slice(0, 2)) {
          const meta = await fetchCinemetaRatingByImdbIdServer(cand.id, cmType);
          if (meta) {
            return {
              id: inputId,
              imdb: meta.rating,
              imdbId: cand.id,
              matchedTitle: meta.name || cand.name,
              year: meta.year || cand.year || undefined,
              source: meta.source,
            };
          }
        }
      } catch {
        // ignore Cinemeta search errors
      }
    }
  }
  return null;
}

async function searchTvmazeRatingServer(params: {
  queries: string[];
  title: string;
  englishTitle: string;
  effectiveYear: string;
  yearExplicit: boolean;
  kind: string;
  inputId?: string;
}): Promise<ServerResolvedMediaRating | null> {
  const { queries, title, englishTitle, effectiveYear, yearExplicit, kind, inputId } = params;
  if (kind !== 'series' && kind !== 'tv' && kind !== 'wrestling') return null;
  for (const q of queries.slice(0, 3)) {
    if (!/[A-Za-z]/.test(q) && /[\u0600-\u06FF]/.test(q)) continue;
    try {
      const res = await fetch(
        `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) continue;
      const list = (await res.json()) as Array<{
        show?: {
          name?: string;
          premiered?: string;
          rating?: { average?: number | null };
          externals?: { imdb?: string | null };
        };
      }>;
      let best: { score: number; show: NonNullable<(typeof list)[number]['show']> } | null = null;
      for (const entry of list.slice(0, 8)) {
        const show = entry?.show;
        if (!show?.name) continue;
        const check = scoreExternalTitleMatch({
          queryTitle: title,
          englishTitle,
          expectedYear: effectiveYear,
          expectedYearExplicit: yearExplicit,
          kind,
          candidateTitles: [show.name],
          candidateYear: show.premiered?.slice(0, 4),
        });
        if (check.matched && (!best || check.score > best.score)) {
          best = { score: check.score, show };
        }
      }
      if (!best) continue;
      const extImdb = best.show.externals?.imdb || '';
      if (extImdb && /^tt\d+$/i.test(extImdb)) {
        const meta = await fetchCinemetaRatingByImdbIdServer(extImdb, kind);
        if (meta) {
          return {
            id: inputId,
            imdb: meta.rating,
            imdbId: extImdb,
            matchedTitle: meta.name || best.show.name,
            year: meta.year || best.show.premiered?.slice(0, 4),
            source: meta.source,
          };
        }
      }
      const tvRating = normalizeRatingNumberServer(best.show.rating?.average);
      if (tvRating !== null) {
        return {
          id: inputId,
          imdb: tvRating,
          imdbId: extImdb || undefined,
          matchedTitle: best.show.name,
          year: best.show.premiered?.slice(0, 4),
          source: 'tvmaze',
        };
      }
    } catch {
      // ignore TVmaze errors
    }
  }
  return null;
}

async function resolveMediaRatingServer(
  input: ServerRatingLookupInput
): Promise<ServerResolvedMediaRating | null> {
  const title = cleanText(input.title);
  const englishTitle = cleanText(input.englishTitle);
  const kind = String(input.kind || 'movie');
  const existingImdbId = cleanText(input.imdbId);
  const { year: effectiveYear, explicit: yearExplicit } = inferEffectiveYear(title, input.year);
  const queries = buildRatingSearchQueriesServer(title, englishTitle);

  if (existingImdbId && /^tt\d{6,10}$/i.test(existingImdbId)) {
    const direct = await fetchCinemetaRatingByImdbIdServer(existingImdbId, kind);
    if (direct) {
      return {
        id: input.id,
        imdb: direct.rating,
        imdbId: existingImdbId,
        matchedTitle: direct.name,
        year: direct.year,
        source: direct.source,
      };
    }
  }

  if (queries.length === 0) return null;

  // 1. TMDB API when configured (gives both IMDb ID -> IMDb rating or TMDB vote_average + votes)
  const tmdbRes = await queryTmdbRatingServer({
    queries,
    title,
    englishTitle,
    year: effectiveYear,
    yearExplicit,
    kind,
  });
  if (tmdbRes) {
    return { ...tmdbRes, id: input.id };
  }

  // 2. Cinemeta catalog search -> meta.imdbRating
  const cmRes = await searchCinemetaRatingServer({
    queries,
    title,
    englishTitle,
    effectiveYear,
    yearExplicit,
    kind,
    inputId: input.id,
  });
  if (cmRes) return cmRes;

  // 3. IMDb Suggestion ID discovery -> Cinemeta / TVmaze meta rating
  const suggestedId = await queryImdbSuggestionIdServer({
    queries,
    title,
    englishTitle,
    year: effectiveYear,
    yearExplicit,
    kind,
  });
  if (suggestedId) {
    const meta = await fetchCinemetaRatingByImdbIdServer(suggestedId, kind);
    if (meta) {
      return {
        id: input.id,
        imdb: meta.rating,
        imdbId: suggestedId,
        matchedTitle: meta.name,
        year: meta.year,
        source: meta.source,
      };
    }
  }

  // 4. Wikidata & Wikipedia Arabic/English bridge -> Cinemeta / TVmaze / English retry
  const wiki = await queryWikidataBridgeServer({
    queries,
    title,
    englishTitle,
    year: effectiveYear,
    kind,
  });
  if (wiki?.imdbId) {
    const meta = await fetchCinemetaRatingByImdbIdServer(wiki.imdbId, kind);
    if (meta) {
      return {
        id: input.id,
        imdb: meta.rating,
        imdbId: wiki.imdbId,
        matchedTitle: meta.name || wiki.englishTitle,
        year: meta.year || wiki.year || undefined,
        source: meta.source,
      };
    }
  }
  if (wiki?.englishTitle) {
    const bridgedQueries = buildRatingSearchQueriesServer(wiki.englishTitle, wiki.englishTitle);
    const effectiveBridgeTitle = englishTitle || wiki.englishTitle;
    const cmBridge = await searchCinemetaRatingServer({
      queries: bridgedQueries,
      title,
      englishTitle: effectiveBridgeTitle,
      effectiveYear: wiki.year || effectiveYear,
      yearExplicit,
      kind,
      inputId: input.id,
    });
    if (cmBridge) return cmBridge;

    const suggestBridgeId = await queryImdbSuggestionIdServer({
      queries: bridgedQueries,
      title,
      englishTitle: effectiveBridgeTitle,
      year: wiki.year || effectiveYear,
      yearExplicit,
      kind,
    });
    if (suggestBridgeId) {
      const meta = await fetchCinemetaRatingByImdbIdServer(suggestBridgeId, kind);
      if (meta) {
        return {
          id: input.id,
          imdb: meta.rating,
          imdbId: suggestBridgeId,
          matchedTitle: meta.name || wiki.englishTitle,
          year: meta.year || wiki.year || undefined,
          source: meta.source,
        };
      }
    }

    const tvBridge = await searchTvmazeRatingServer({
      queries: bridgedQueries,
      title,
      englishTitle: effectiveBridgeTitle,
      effectiveYear: wiki.year || effectiveYear,
      yearExplicit,
      kind,
      inputId: input.id,
    });
    if (tvBridge) return tvBridge;
  }

  // 5. TVmaze fallback for TV series/programs/wrestling
  const tvRes = await searchTvmazeRatingServer({
    queries,
    title,
    englishTitle,
    effectiveYear,
    yearExplicit,
    kind,
    inputId: input.id,
  });
  if (tvRes) return tvRes;

  return null;
}

async function resolveHighResImagesServer(params: {
  title: string;
  englishTitle?: string;
  year?: string;
  kind?: string;
  imdbId?: string;
  currentPoster?: string;
  currentBackdrop?: string;
  preferOfficial?: boolean;
}) {
  const {
    title,
    englishTitle = '',
    year = '',
    kind = 'movie',
    imdbId = '',
    currentPoster = '',
    currentBackdrop = '',
    preferOfficial = false,
  } = params;

  const sanitizedCurrentPoster = isJunkImageCandidate(currentPoster) ? '' : currentPoster;
  const sanitizedCurrentBackdrop = isJunkImageCandidate(currentBackdrop) ? '' : currentBackdrop;

  const queries = buildCandidateSearchQueriesServer(title, englishTitle);
  const cleanQuery = queries[0] || '';
  const candidatePoster = sanitizedCurrentPoster ? upgradeKnownImageUrlServer(sanitizedCurrentPoster) : '';
  const candidateBackdrop =
    sanitizedCurrentBackdrop && sanitizedCurrentBackdrop !== sanitizedCurrentPoster
      ? upgradeKnownImageUrlServer(sanitizedCurrentBackdrop)
      : '';

  const [curP, curB, tmdbRes] = await Promise.all([
    candidatePoster ? probeRemoteImageDimensions(candidatePoster) : Promise.resolve(null),
    candidateBackdrop ? probeRemoteImageDimensions(candidateBackdrop) : Promise.resolve(null),
    queryTmdbHighResImages({ query: cleanQuery, title, englishTitle, year, kind }),
  ]);

  let poster_url = curP?.ok ? curP.url : candidatePoster;
  let poster_width = curP?.ok ? curP.width : 0;
  let poster_height = curP?.ok ? curP.height : 0;

  let backdrop_url = curB?.ok && curB.width > curB.height ? curB.url : '';
  let backdrop_width = curB?.ok && curB.width > curB.height ? curB.width : 0;
  let backdrop_height = curB?.ok && curB.width > curB.height ? curB.height : 0;
  let image_source = poster_url || backdrop_url ? 'scraped' : 'none';

  const posterIsLandscape = poster_width > 0 && poster_height > 0 && poster_width > poster_height * 1.05;
  const posterIsLowTrust = isLowTrustScrapedPosterUrl(poster_url) || posterIsLandscape;

  const tryAcceptOfficialPosterServer = async (
    candUrl: string,
    knownW: number,
    knownH: number,
    sourceLabel: string
  ) => {
    if (!candUrl) return false;
    let cw = knownW;
    let ch = knownH;
    if (!cw || !ch) {
      const pr = await probeRemoteImageDimensions(candUrl);
      if (!pr.ok) return false;
      cw = pr.width;
      ch = pr.height;
    }
    if (ch < cw || cw < 500) return false;

    const alreadyOfficial =
      image_source === 'tmdb' || image_source === 'imdb' || image_source === 'cinemeta' || image_source === 'metahub';
    const shouldReplace =
      !poster_url ||
      posterIsLowTrust ||
      poster_width === 0 ||
      (preferOfficial && !alreadyOfficial) ||
      cw > poster_width;

    if (shouldReplace) {
      poster_url = candUrl;
      poster_width = cw;
      poster_height = ch;
      image_source = sourceLabel;
      return true;
    }
    return false;
  };

  const tryAcceptOfficialBackdropServer = async (
    candUrl: string,
    knownW: number,
    knownH: number,
    sourceLabel: string
  ) => {
    if (!candUrl) return false;
    let cw = knownW;
    let ch = knownH;
    if (!cw || !ch) {
      const br = await probeRemoteImageDimensions(candUrl);
      if (!br.ok) return false;
      cw = br.width;
      ch = br.height;
    }
    if (cw <= ch || cw < 960) return false;
    if (!backdrop_url || cw > backdrop_width) {
      backdrop_url = candUrl;
      backdrop_width = cw;
      backdrop_height = ch;
      if (image_source === 'scraped' || image_source === 'none') {
        image_source = sourceLabel;
      }
      return true;
    }
    return false;
  };

  // Prefer TMDB genuine 2:3 & 16:9 high-res assets when title+year verified
  if (tmdbRes) {
    if (tmdbRes.poster_url) {
      await tryAcceptOfficialPosterServer(tmdbRes.poster_url, tmdbRes.poster_width, tmdbRes.poster_height, 'tmdb');
    }
    if (tmdbRes.backdrop_url) {
      await tryAcceptOfficialBackdropServer(tmdbRes.backdrop_url, tmdbRes.backdrop_width, tmdbRes.backdrop_height, 'tmdb');
    }
  }

  const needsOfficialPoster =
    preferOfficial || !poster_url || poster_width === 0 || poster_width < 900 || posterIsLowTrust;
  const needsOfficialBackdrop = !backdrop_url || backdrop_width < 1200;

  let resolvedImdbId = imdbId;
  let extraEngTitle = '';
  let extraYear = year;

  const hasArabicOnlyQuery =
    queries.length > 0 && queries.every((q) => /[\u0600-\u06FF]/.test(q) && !/[A-Za-z]{2,}/.test(q));

  if (!resolvedImdbId && hasArabicOnlyQuery && (needsOfficialPoster || needsOfficialBackdrop)) {
    const wikiRes = await queryWikidataBridgeServer({ queries, title, englishTitle, year, kind });
    if (wikiRes) {
      resolvedImdbId = wikiRes.imdbId;
      extraEngTitle = wikiRes.englishTitle;
      if (!year && wikiRes.year) extraYear = wikiRes.year;
    }
  }

  const expandedQueries = buildCandidateSearchQueriesServer(title, englishTitle, extraEngTitle);
  const searchEng = extraEngTitle || englishTitle;

  // IMDb Suggestion API
  if ((needsOfficialPoster || needsOfficialBackdrop) && image_source !== 'tmdb' && (expandedQueries.length > 0 || resolvedImdbId)) {
    const imdbRes = await queryImdbSuggestionServer({
      queries: expandedQueries,
      imdbId: resolvedImdbId,
      title,
      englishTitle: searchEng,
      year: extraYear,
      kind,
    });
    if (imdbRes) {
      if (imdbRes.imdbId && !resolvedImdbId) resolvedImdbId = imdbRes.imdbId;
      if (imdbRes.poster) {
        await tryAcceptOfficialPosterServer(imdbRes.poster, imdbRes.pw, imdbRes.ph, 'imdb');
      }
    }
  }

  // Wikidata bridge fallback if IMDb Suggestion didn't match directly
  if (!resolvedImdbId && expandedQueries.length > 0 && image_source !== 'tmdb' && (needsOfficialPoster || needsOfficialBackdrop)) {
    const wikiRes = await queryWikidataBridgeServer({
      queries: expandedQueries,
      title,
      englishTitle: searchEng,
      year: extraYear,
      kind,
    });
    if (wikiRes?.imdbId) {
      resolvedImdbId = wikiRes.imdbId;
      if (wikiRes.englishTitle) extraEngTitle = wikiRes.englishTitle;
      const imdbByWikiId = await queryImdbSuggestionServer({
        queries: [],
        imdbId: resolvedImdbId,
        title,
        englishTitle: extraEngTitle || searchEng,
        year: extraYear,
        kind,
      });
      if (imdbByWikiId?.poster) {
        await tryAcceptOfficialPosterServer(imdbByWikiId.poster, imdbByWikiId.pw, imdbByWikiId.ph, 'imdb');
      }
    }
  }

  // Cinemeta + Metahub (16:9 Backdrops + Official Posters)
  if ((needsOfficialPoster || needsOfficialBackdrop) && (resolvedImdbId || expandedQueries.length > 0)) {
    const cmRes = await queryCinemetaImagesServer({
      queries: buildCandidateSearchQueriesServer(title, searchEng, extraEngTitle),
      imdbId: resolvedImdbId,
      title,
      englishTitle: searchEng,
      year: extraYear,
      kind,
    });
    if (cmRes) {
      if (cmRes.poster && (preferOfficial || posterIsLowTrust || !poster_url || poster_width < 700)) {
        await tryAcceptOfficialPosterServer(cmRes.poster, cmRes.pw, cmRes.ph, cmRes.source);
      }
      if (cmRes.backdrop) {
        await tryAcceptOfficialBackdropServer(cmRes.backdrop, cmRes.bw, cmRes.bh, cmRes.source);
      }
    }
  }

  // TVmaze fallback ONLY for TV series, strictly verified by title + year via /search/shows
  const primaryQuery = expandedQueries[0] || '';
  if (primaryQuery && kind === 'series' && (!backdrop_url || poster_width < 800 || posterIsLowTrust)) {
    try {
      const searchRes = await fetch(
        `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(primaryQuery)}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (searchRes.ok) {
        const candidates = (await searchRes.json()) as Array<{
          show?: { id?: number; name?: string; premiered?: string };
        }>;
        let bestId = 0;
        let bestScore = 0;
        for (const entry of (candidates || []).slice(0, 8)) {
          const show = entry.show;
          if (!show?.id || !show.name) continue;
          const check = scoreExternalTitleMatch({
            queryTitle: title,
            englishTitle: searchEng,
            expectedYear: extraYear,
            expectedYearExplicit: Boolean(extraYear && extraYear !== '2026'),
            candidateTitles: [show.name],
            candidateYear: show.premiered?.slice(0, 4),
          });
          if (check.matched && check.score > bestScore) {
            bestScore = check.score;
            bestId = show.id;
          }
        }

        if (bestId) {
          const tvmRes = await fetch(
            `https://api.tvmaze.com/shows/${bestId}?embed=images`,
            { signal: AbortSignal.timeout(6000) }
          );
          if (tvmRes.ok) {
            const tvm = (await tvmRes.json()) as {
              image?: { original?: string };
              _embedded?: {
                images?: Array<{
                  type?: string;
                  resolutions?: { original?: { url?: string; width?: number; height?: number } };
                }>;
              };
            };
            const imgs = tvm._embedded?.images || [];
            const pBest = imgs
              .filter((i) => i.type === 'poster' && i.resolutions?.original?.url)
              .sort((a, b) => (b.resolutions?.original?.width || 0) - (a.resolutions?.original?.width || 0))[0]
              ?.resolutions?.original;
            const bBest = imgs
              .filter(
                (i) =>
                  (i.type === 'background' || i.type === 'banner') &&
                  i.resolutions?.original?.url &&
                  (i.resolutions?.original?.width || 0) > (i.resolutions?.original?.height || 0)
              )
              .sort((a, b) => (b.resolutions?.original?.width || 0) - (a.resolutions?.original?.width || 0))[0]
              ?.resolutions?.original;

            if (pBest?.url) {
              await tryAcceptOfficialPosterServer(pBest.url, pBest.width || 0, pBest.height || 0, 'tvmaze');
            }
            if (bBest?.url) {
              await tryAcceptOfficialBackdropServer(bBest.url, bBest.width || 0, bBest.height || 0, 'tvmaze');
            }
          }
        }
      }
    } catch {
      // ignore TVmaze network errors
    }
  }

  // iTunes fallback ONLY for movies, verified strictly against movie title & year
  if (primaryQuery && kind === 'movie' && (poster_width < 800 || posterIsLowTrust) && image_source !== 'imdb' && image_source !== 'tmdb') {
    try {
      const itRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(primaryQuery)}&media=movie&entity=movie&limit=8`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (itRes.ok) {
        const itJson = (await itRes.json()) as {
          results?: Array<{
            trackName?: string;
            collectionName?: string;
            releaseDate?: string;
            artworkUrl100?: string;
          }>;
        };
        let bestArt = '';
        let bestScore = 0;
        for (const r of itJson.results || []) {
          if (!r.artworkUrl100) continue;
          const check = scoreExternalTitleMatch({
            queryTitle: title,
            englishTitle: searchEng,
            expectedYear: extraYear,
            expectedYearExplicit: Boolean(extraYear && extraYear !== '2026'),
            candidateTitles: [r.trackName, r.collectionName],
            candidateYear: r.releaseDate?.slice(0, 4),
          });
          if (check.matched && check.score > bestScore) {
            bestScore = check.score;
            bestArt = upgradeKnownImageUrlServer(r.artworkUrl100);
          }
        }
        if (bestArt) {
          await tryAcceptOfficialPosterServer(bestArt, 0, 0, 'itunes');
        }
      }
    } catch {
      // ignore iTunes errors
    }
  }

  const image_quality_status = evaluateImageQualityServer({
    posterUrl: poster_url,
    backdropUrl: backdrop_url,
    posterWidth: poster_width,
    posterHeight: poster_height,
    backdropWidth: backdrop_width,
    backdropHeight: backdrop_height,
  });

  return {
    poster_url,
    poster_width,
    poster_height,
    backdrop_url,
    backdrop_width,
    backdrop_height,
    image_source,
    image_quality_status,
  };
}

function isYoutubeUrl(rawUrl: string): boolean {
  return /(?:youtube\.com\/(?:watch|embed|shorts|v\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)/i.test(
    rawUrl
  );
}

function normalizeTrailerUrlServer(rawUrl: string | undefined | null): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  const resolved = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  if (!/^https?:\/\//i.test(resolved)) return '';
  const ytMatch = resolved.match(
    /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|v\/|shorts\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/i
  );
  if (ytMatch?.[1]) {
    return `https://www.youtube.com/watch?v=${ytMatch[1]}`;
  }
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(resolved) || /vimeo\.com|dailymotion\.com/i.test(resolved)) {
    return resolved;
  }
  return '';
}

const IGNORED_EMBED_HOSTS_REGEX =
  /googlesyndication|doubleclick|googletagmanager|facebook\.com\/plugins|recaptcha|cloudflare|ads|histats|yandex|analytics|disqus\.com|gravatar\.com|addtoany|sharethis|twitter\.com\/widgets|instagram\.com\/embed/i;

function normalizeArabicDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function isLikelyNonVideoWebsiteUrl(rawUrl: string, sourceOrigin?: string): boolean {
  if (!rawUrl) return true;
  if (IGNORED_EMBED_HOSTS_REGEX.test(rawUrl)) return true;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return true;
  }
  if (!['http:', 'https:'].includes(u.protocol) || isBlockedHost(u.hostname)) return true;

  const p = u.pathname.toLowerCase();
  const search = u.search.toLowerCase();
  const hasVideoQueryParam = /[?&](?:v|vid|id|embed|file|stream|play|hash|key|token)=/i.test(search);

  // Reject bare root website homepages (e.g. https://www.larooza.tv/ or https://example.com)
  if ((p === '' || p === '/') && !hasVideoQueryParam) {
    return true;
  }

  // Reject full PHP Melody / Arabic streaming site webpage URLs masquerading as video servers
  if (/\/(?:play|watch|download)\.php$/i.test(p) && /[?&](?:vid|v|id)=/i.test(search)) {
    return true;
  }

  // Reject homepage & portal section URLs (e.g. /home, /home.24, /index.php, /movies, /series)
  if (
    !hasVideoQueryParam &&
    (/^\/(?:home(?:\.[a-z0-9]+)?|index(?:\.[a-z0-9]+)?|main|start)\/?$/i.test(p) ||
      /^\/(?:movies|series|shows|episodes|seasons|recent|trends|latest|popular|ramadan|wrestling|tv-channels|actors|collections|requests|news)\/?$/i.test(
        p
      ) ||
      /^\/(?:category|categories|genre|genres|tag|tags|actor|search|login|register|signup|account|profile|contact|about|privacy|terms|dmca|faq)(?:\/|$)/i.test(
        p
      ))
  ) {
    return true;
  }

  // Reject same-origin full site pages inside watch servers unless they are explicit player/embed endpoints or video files
  if (
    sourceOrigin &&
    u.origin === sourceOrigin &&
    !/(?:\/embed|\/player|\/e\/|jwplayer|videojs)/i.test(p + search) &&
    !/\.(mp4|m3u8|webm|ogg)(\?|$)/i.test(p)
  ) {
    return true;
  }

  return false;
}

function hasRealVideoPlayerMarkup(snippet: string): boolean {
  if (!snippet) return false;
  return /<video\b|<source\b[^>]+src=|\.mp4\b|\.m3u8\b|\.mpd\b|jwplayer\s*\(|videojs\s*\(|new\s+Plyr\b|Hls\.isSupported|Clappr\.Player|Artplayer|DPlayer|FluidPlayer|flowplayer|sources\s*:\s*\[|eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k/i.test(
    snippet
  );
}

function isWebsiteHomepageHtml(finalUrl: string, snippet: string): boolean {
  if (finalUrl && isLikelyNonVideoWebsiteUrl(finalUrl)) return true;
  if (!snippet) return false;
  if (hasRealVideoPlayerMarkup(snippet)) return false;

  const hasPortalNavOrHomeTitle =
    /<title>[^<]*(?:الصفحة\s*الرئيسية|الرئيسية\s*[-|–]|لاروزا|Larooza|موقع\s*فيديو|ماي\s*سيما|اكوام|أكوام|أفلام\s*و?مسلسلات|قائمة\s*الأفلام|قائمة\s*المسلسلات)[^<]*<\/title>/i.test(
      snippet
    ) ||
    /الصفحة\s*الرئيسية/i.test(snippet) ||
    (/<nav\b/i.test(snippet) &&
      /(?:أضيف\s*حديث[اًا]|اضيف\s*حديث[اًا]|مسلسلات\s*رمضان|برامج\s*تلفزيونية|جميع\s*الأفلام|جميع\s*المسلسلات)/i.test(
        snippet
      )) ||
    (/placeholder=["'][^"']*(?:ابحث|بحث|search)[^"']*["']/i.test(snippet) &&
      /(?:مسلسلات|أفلام|افلام)/i.test(snippet));

  if (hasPortalNavOrHomeTitle) return true;

  // Detect any generic multi-link website page with nav/header/footer and no embedded video iframe or player
  const hasFullSiteChrome =
    /<(header|nav|footer)\b/i.test(snippet) &&
    (snippet.match(/<a\b[^>]+href=/gi)?.length || 0) >= 12;
  const hasNestedVideoIframe =
    /<iframe[^>]+src=["'][^"']*(?:embed|player|vid|stream|mp4|m3u8|dood|uqload|filemoon|streamtape|vidmoly|ok\.ru|vk\.com|mail\.ru)[^"']*["']/i.test(
      snippet
    );

  if (hasFullSiteChrome && !hasNestedVideoIframe) {
    return true;
  }

  return false;
}

interface SubpageHints {
  watchSubpageUrl?: string;
  downloadSubpageUrl?: string;
  ajaxEmbedIds: { id: string; label: string }[];
  candidateOrigins: string[];
  seasonPageUrls?: { seasonNumber: number; label: string; url: string }[];
  hasExplicitImdbRating?: boolean;
}

function parseBaselineSeasonNumber(label: string, fallbackIdx: number): number {
  const norm = normalizeArabicDigits(String(label || '').replace(/\s+/g, ' ').trim());
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

function extractBaselineEpisodeId(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl.trim());
    for (const p of ['vid', 'ep', 'episode', 'id', 'e']) {
      const val = u.searchParams.get(p);
      if (val && val.trim()) return val.trim();
    }
    const pathMatch = u.pathname.match(
      /(?:\/watch|\/play|\/player|\/episode|\/ep)[\/\-_](\d+|[A-Za-z0-9]{4,24})(?:[./]|$)/i
    );
    if (pathMatch?.[1]) return pathMatch[1];
  } catch {
    const m = rawUrl.match(/[?&](?:vid|ep|episode|id|e)=([^&#]+)/i);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

function extractBaselineServerQuality(label: string, fallbackQuality: string): string {
  const norm = normalizeArabicDigits(String(label || '').replace(/\s+/g, ' ').trim());
  const qMatch = norm.match(/\b(4K\s*UHD|4K|2160p|1080p|720p|480p|360p|FHD|HD)\b/i);
  return qMatch ? qMatch[1].toUpperCase().replace(/\s+/g, ' ') : fallbackQuality;
}

function cleanBaselineServerName(rawName: string | undefined, _url: string, idx: number): string {
  const trimmed = String(rawName || '').replace(/\s+/g, ' ').trim();
  if (
    !trimmed ||
    trimmed.length > 45 ||
    /^(?:سيرفر\s*\d*|server\s*\d*|embed|مستورد|مشاهدة|watch|play)$/i.test(trimmed)
  ) {
    return `سيرفر ${idx + 1}`;
  }
  return trimmed;
}

function extractBaselineEpisodeNumber(label: string, href: string): number | null {
  const normLabel = normalizeArabicDigits(String(label || '').replace(/\s+/g, ' ').trim());
  if (!normLabel && !href) return null;
  if (/أحدث\s*الحلقات|جميع\s*الحلقات|كل\s*الحلقات|اختر\s*الحلقة|الموسم\s*\d+$/i.test(normLabel)) {
    return null;
  }
  const epMatch =
    normLabel.match(/(?:الحلقة|حلقة|Episode|Ep\.?)\s*#?(\d{1,3})/i) ||
    normLabel.match(/^(\d{1,3})\s*(?:حلقة|الحلقة)\b/i) ||
    normLabel.match(/\bE(\d{1,3})\b/i) ||
    (/(?:vid=|ep=|episode|watch|play|حلقة)/i.test(href) ? normLabel.match(/^(\d{1,3})$/) : null);
  if (epMatch?.[1]) {
    const num = Number(epMatch[1]);
    if (num > 0 && num <= 999) return num;
  }
  return null;
}

export function parseHtmlToMediaWithHints(
  html: string,
  sourceUrl: string,
  options?: { isDownloadPage?: boolean; forcedSeasonNumber?: number }
) {
  const $ = cheerio.load(html);

  // 1. JSON-LD extraction if available
  let jsonLdTitle = '';
  let jsonLdDesc = '';
  let jsonLdImage = '';
  let jsonLdTrailer = '';
  let jsonLdImdb = 0;
  let jsonLdType = '';
  let jsonLdImdbId = '';
  const jsonLdCast: { name: string; role: string; initials: string }[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const nodes = extractJsonLdNodes($(el).text());
    for (const obj of nodes) {
      const typeVal = String(obj['@type'] || '');
      if (typeVal === 'Movie' || typeVal === 'TVSeries') {
        jsonLdType = typeVal;
        if (obj.sameAs && !jsonLdImdbId) {
          const sameAsStr = Array.isArray(obj.sameAs) ? obj.sameAs.join(' ') : String(obj.sameAs);
          const foundId = extractImdbIdFromText(sameAsStr);
          if (foundId) jsonLdImdbId = foundId;
        }
        if (obj.name && !jsonLdTitle) jsonLdTitle = cleanText(String(obj.name));
        if (obj.description && !jsonLdDesc) jsonLdDesc = cleanText(String(obj.description));
        if (obj.image && !jsonLdImage) {
          const imgUrl = extractJsonLdImageUrl(obj.image);
          if (imgUrl) jsonLdImage = resolveUrl(sourceUrl, imgUrl);
        }
        if (obj.trailer && !jsonLdTrailer) {
          const trObj = obj.trailer as Record<string, unknown>;
          const rawTr =
            typeof obj.trailer === 'string'
              ? obj.trailer
              : String(trObj?.embedUrl || trObj?.url || trObj?.contentUrl || '');
          const normTr = normalizeTrailerUrlServer(rawTr);
          if (normTr) jsonLdTrailer = normTr;
        }
        const aggRating = obj.aggregateRating as Record<string, unknown> | undefined;
        if (aggRating?.ratingValue) {
          const val = parseFloat(String(aggRating.ratingValue));
          if (!Number.isNaN(val) && val > 0 && val <= 10) jsonLdImdb = val;
        }
        if (Array.isArray(obj.actor)) {
          for (const act of obj.actor.slice(0, 10)) {
            const actObj = act as Record<string, unknown> | null;
            const nm = cleanText(
              typeof act === 'string' ? act : String(actObj?.name || '')
            );
            if (nm) {
              jsonLdCast.push({
                name: nm,
                role: 'ممثل',
                initials: nm.slice(0, 2).toUpperCase(),
              });
            }
          }
        }
      }
    }
  });

  // 2. Title extraction
  const ogTitle = cleanText($('meta[property="og:title"]').attr('content'));
  const h1Title = cleanText($('h1').first().text());
  const docTitle = cleanText($('title').first().text());
  const rawTitle = jsonLdTitle || h1Title || ogTitle || docTitle || 'عمل مستورد جديد';
  const title = rawTitle
    .replace(/\s*[-|–]\s*(مشاهدة|تحميل|أون لاين|اون لاين|بجودة عالية|مترجم).*$/i, '')
    .trim()
    .slice(0, 200);

  const cleanEnglish = extractCleanEnglishTitleCandidate(rawTitle);
  const englishTitle = cleanEnglish || title;

  // 3. Separate Poster (2:3) & Landscape Backdrop (16:9) extraction (upgrade known thumbnails & never force portrait into backdrop)
  const rawOgImage = upgradeKnownImageUrlServer(
    resolveUrl(
      sourceUrl,
      $('meta[property="og:image:secure_url"]').attr('content') ||
        $('meta[property="og:image"]').attr('content') ||
        $('meta[property="og:image:url"]').attr('content') ||
        $('link[rel="image_src"]').attr('href')
    )
  );
  const ogImage = isJunkImageCandidate(rawOgImage) ? '' : rawOgImage;

  const rawTwitterImage = upgradeKnownImageUrlServer(
    resolveUrl(
      sourceUrl,
      $('meta[name="twitter:image:src"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content')
    )
  );
  const twitterImage = isJunkImageCandidate(rawTwitterImage) ? '' : rawTwitterImage;

  const safeJsonLdImage = isJunkImageCandidate(jsonLdImage)
    ? ''
    : upgradeKnownImageUrlServer(jsonLdImage);

  const strictSinglePoster =
    pickFirstValidImageFromSelectorsServer(
      $,
      '.single-poster img, .single-right img, .movie-poster img, .film-poster img, .entry-poster img, img[itemprop="image"], meta[itemprop="image"], link[rel="image_src"]',
      sourceUrl,
      true
    ) ||
    pickFirstValidImageFromSelectorsServer(
      $,
      '.single-poster, .single-right, .movie-poster, .film-poster, .entry-poster, [data-poster]',
      sourceUrl,
      true
    );

  const genericPoster =
    strictSinglePoster ||
    pickFirstValidImageFromSelectorsServer(
      $,
      '.poster img, .pm-video-thumb img, .video-thumb img, .Thumb--GridItem img, .Poster--Block img',
      sourceUrl,
      true
    ) ||
    pickFirstValidImageFromSelectorsServer(
      $,
      '.poster, .Thumb--GridItem, .Poster--Block, [data-bg]',
      sourceUrl,
      true
    );

  const singlePoster = strictSinglePoster || genericPoster;

  const fallbackBodyPoster =
    singlePoster || ogImage || safeJsonLdImage || twitterImage
      ? ''
      : pickFirstValidImageFromSelectorsServer(
          $,
          '.post-body img, .entry-content img, main img, article img',
          sourceUrl,
          true
        );

  const explicitBackdrop =
    pickFirstValidImageFromSelectorsServer(
      $,
      '.backdrop img, .hero img, .hero-bg img, .cover img, .single-cover img, .movie-backdrop img, .single-cover, .movie-backdrop',
      sourceUrl,
      true
    ) ||
    upgradeKnownImageUrlServer(resolveUrl(sourceUrl, $('video').first().attr('poster')));

  const cleanCandidates = [
    strictSinglePoster,
    safeJsonLdImage,
    ogImage,
    genericPoster,
    twitterImage,
    fallbackBodyPoster,
  ].filter(Boolean);
  const preferredCleanPoster = cleanCandidates.find((u) => !isLowTrustScrapedPosterUrl(u));
  const poster = preferredCleanPoster || cleanCandidates[0] || '';

  const cleanExplicitBackdrop = isJunkImageCandidate(explicitBackdrop) ? '' : explicitBackdrop;
  const distinctBackdropCandidate =
    cleanExplicitBackdrop && cleanExplicitBackdrop !== poster
      ? cleanExplicitBackdrop
      : twitterImage && twitterImage !== poster
        ? twitterImage
        : ogImage && ogImage !== poster
          ? ogImage
          : '';
  const backdrop = distinctBackdropCandidate;
  const extractedImdbId = jsonLdImdbId || extractImdbIdFromText(html);

  // 4. Story / Description
  const storySelector = cleanText(
    $('.single-story, .story, .post-story, .description, [itemprop="description"]').first().text()
  );
  const ogDesc = cleanText(
    $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content')
  );
  const story = (storySelector || jsonLdDesc || ogDesc || title).slice(0, 2500);

  // 5. Taxonomy & Metadata
  const categories: string[] = [];
  const genres: string[] = [];
  let year = '';
  let country = '';
  let language = '';
  let quality = '';
  let duration = '';

  const allTagsText: string[] = [];
  $('a[rel="tag"], .labels a, .single-details a, .single-info a, .tags a').each((_, el) => {
    const t = cleanText($(el).text());
    if (t) allTagsText.push(t);
  });

  for (const tag of allTagsText) {
    if (tag.startsWith('categories:')) {
      categories.push(tag.replace('categories:', '').trim());
    } else if (tag.startsWith('type:')) {
      genres.push(tag.replace('type:', '').trim());
    } else if (tag.startsWith('year:')) {
      year = tag.replace('year:', '').trim();
    } else if (tag.startsWith('country:')) {
      country = tag.replace('country:', '').trim();
    } else if (tag.startsWith('language:')) {
      language = tag.replace('language:', '').trim();
    } else if (tag.startsWith('quality:')) {
      quality = tag.replace('quality:', '').trim();
    } else if (
      /^(افلام|مسلسلات|رمضان|مصارعة|عروض|برامج|المسرحيات)/.test(tag) &&
      !categories.includes(tag)
    ) {
      categories.push(tag);
    } else if (
      /^(اكشن|دراما|كوميديا|رعب|خيال|مغامرة|فانتازيا|جريمة|غموض|إثارة|تشويق|تاريخي|رومانسي)/.test(
        tag
      ) &&
      !genres.includes(tag)
    ) {
      genres.push(tag);
    }
  }

  // PHP Melody pm_video_data duration extraction
  const allScriptsText = $('script')
    .map((_, el) => $(el).html() || '')
    .get()
    .join('\n');

  const pmDurationMatch = allScriptsText.match(/duration_str\s*:\s*["']([^"']+)["']/i);
  if (pmDurationMatch) {
    const parts = pmDurationMatch[1].split(':').map((n) => parseInt(n, 10));
    if (parts.length === 3 && !parts.some(Number.isNaN)) {
      const mins = parts[0] * 60 + parts[1];
      if (mins > 0) duration = `${mins} دقيقة`;
    } else if (parts.length === 2 && !parts.some(Number.isNaN) && parts[0] > 0) {
      duration = `${parts[0]} دقيقة`;
    }
  }

  const bodyText = cleanText($.text());
  if (!year) {
    const yMatch = (rawTitle + ' ' + bodyText.slice(0, 2500)).match(/\b(20[1-3]\d|19\d\d)\b/);
    year = yMatch ? yMatch[1] : '2026';
  }
  if (!quality) {
    const qMatch = (rawTitle + ' ' + bodyText.slice(0, 2500)).match(
      /\b(4K UHD|4K|2160p|BluRay|WEB-DL|WEBRip|HDTV|Full HD|1080p|720p|HDCAM|HD)\b/i
    );
    quality = qMatch ? qMatch[1].toUpperCase() : 'WEB-DL';
  }
  if (!duration) {
    const dMatch = bodyText.match(/(\d{2,3})\s*(?:دقيقة|min|m\b)/i);
    duration = dMatch ? `${dMatch[1]} دقيقة` : '120 دقيقة';
  }

  // IMDb rating extraction
  let imdb = jsonLdImdb;
  if (!imdb) {
    const imdbText = cleanText($('.single-imdb, .imdb, [class*="imdb"]').text());
    const m = (imdbText + ' ' + bodyText.slice(0, 3000)).match(
      /(?:IMDb[^\d]{0,15}|تقييم[^\d]{0,15})([1-9](?:\.\d)?)/i
    );
    if (m) imdb = parseFloat(m[1]);
  }
  const hasExplicitImdbRating = Boolean(imdb && imdb > 0 && imdb <= 10);
  if (!hasExplicitImdbRating) imdb = 7.8;

  // Kind inference
  let kind: 'movie' | 'series' | 'tv' | 'wrestling' = 'movie';
  if (/مصارعة|wwe|wrestlemania|raw|smackdown/i.test(rawTitle + ' ' + categories.join(' '))) {
    kind = 'wrestling';
  } else if (
    jsonLdType === 'TVSeries' ||
    /مسلسل|الموسم|الحلقة|حلقات/.test(rawTitle + ' ' + categories.join(' '))
  ) {
    kind = 'series';
  } else if (/مسرحية|برنامج/.test(rawTitle + ' ' + categories.join(' '))) {
    kind = 'tv';
  }

  if (categories.length === 0) {
    categories.push(
      kind === 'series'
        ? 'مسلسلات'
        : kind === 'wrestling'
          ? 'مصارعة حرة'
          : kind === 'tv'
            ? 'عروض تلفزيونية'
            : 'افلام'
    );
  }
  const combinedHints = `${rawTitle} ${sourceUrl} ${categories.join(' ')} ${genres.join(' ')} ${country} ${language}`;
  if (kind === 'movie') {
    if (!categories.some((c) => /افلام|أفلام/.test(c))) categories.unshift('افلام');
    if (/كرتون|انمي|انيميشن|animation|anime/i.test(combinedHints)) {
      if (!categories.includes('افلام كرتون')) categories.push('افلام كرتون');
    } else if (/عربي|مصري|سعودي|خليجي/i.test(combinedHints)) {
      if (!categories.includes('افلام عربية')) categories.push('افلام عربية');
    } else if (/هند|بوليوود|hindi/i.test(combinedHints)) {
      if (!categories.includes('افلام هندية')) categories.push('افلام هندية');
    } else if (/ترك|turk/i.test(combinedHints)) {
      if (!categories.includes('افلام تركية')) categories.push('افلام تركية');
    } else if (!categories.some((c) => /اجنبي|أجنبي/.test(c))) {
      categories.push('افلام اجنبية');
    }
  } else if (kind === 'series') {
    if (!categories.some((c) => /مسلسلات/.test(c))) categories.unshift('مسلسلات');
    if (/رمضان/.test(combinedHints) && !categories.includes('رمضان 2026')) {
      categories.push('رمضان 2026');
    } else if (/عربي|مصري|سعودي|خليجي/i.test(combinedHints)) {
      if (!categories.includes('مسلسلات عربية')) categories.push('مسلسلات عربية');
    } else if (/ترك|turk/i.test(combinedHints)) {
      if (!categories.includes('مسلسلات تركية')) categories.push('مسلسلات تركية');
    } else if (!categories.some((c) => /اجنبي|أجنبي/.test(c))) {
      categories.push('مسلسلات اجنبية');
    }
  }
  if (genres.length === 0) {
    genres.push('دراما', 'إثارة');
  }

  let sourceOrigin = '';
  try {
    if (sourceUrl) sourceOrigin = new URL(sourceUrl).origin;
  } catch {
    // ignore
  }

  // 5b. Trailer extraction (JSON-LD, DOM trailer containers, YouTube links/embeds, script blocks)
  let trailerUrl = jsonLdTrailer || '';
  const trySetTrailer = (rawCandidate: string | undefined | null) => {
    if (trailerUrl || !rawCandidate) return;
    const resolved = resolveUrl(sourceUrl, rawCandidate) || rawCandidate.trim();
    const norm = normalizeTrailerUrlServer(resolved);
    if (norm) trailerUrl = norm;
  };

  $(
    '[data-trailer], [data-youtube], .trailer iframe, #trailer iframe, .trailer a, #trailer a, a[href*="youtube.com/watch"], a[href*="youtu.be/"], iframe[src*="youtube.com"], iframe[src*="youtube-nocookie.com"], iframe[data-src*="youtube"]'
  ).each((_, el) => {
    if (trailerUrl) return;
    trySetTrailer($(el).attr('data-trailer'));
    trySetTrailer($(el).attr('data-youtube'));
    trySetTrailer($(el).attr('href'));
    trySetTrailer($(el).attr('src'));
    trySetTrailer($(el).attr('data-src'));
  });

  if (!trailerUrl && allScriptsText) {
    const ytScriptMatch = allScriptsText.match(
      /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)[A-Za-z0-9_-]{11}/i
    );
    if (ytScriptMatch?.[0]) trySetTrailer(ytScriptMatch[0]);
  }

  // 6. Watch Servers (<iframe> embeds + data-* attributes + inline JS var servers arrays + <video>)
  const serversMap = new Map<
    string,
    {
      id: string;
      name: string;
      mode: 'url' | 'embed';
      url: string;
      embedCode: string;
      quality: string;
      speed: string;
      tag: string;
    }
  >();

  const pushEmbedServer = (rawCandidate: string, preferredName?: string) => {
    const src = resolveUrl(sourceUrl, rawCandidate);
    if (!src) return;

    // Route YouTube embeds/links to trailerUrl instead of Watch Servers
    if (isYoutubeUrl(src)) {
      trySetTrailer(src);
      return;
    }

    if (isLikelyNonVideoWebsiteUrl(src, sourceOrigin)) return;

    const existing = serversMap.get(src);
    if (existing) {
      if (preferredName && /^سيرفر\s*\d+$/i.test(existing.name)) {
        existing.name = cleanBaselineServerName(preferredName, src, serversMap.size - 1);
        const srvQuality = extractBaselineServerQuality(preferredName, existing.quality || quality);
        existing.quality = srvQuality;
        if (existing.mode === 'embed') existing.tag = srvQuality;
      }
      return;
    }

    const seqNum = serversMap.size + 1;
    const isDirectStream = /\.(mp4|m3u8|webm|ogg)(\?|$)/i.test(src);
    const srvQuality = extractBaselineServerQuality(preferredName || '', quality);
    serversMap.set(src, {
      id: `srv-ext-${seqNum}`,
      name: cleanBaselineServerName(preferredName, src, seqNum - 1),
      mode: isDirectStream ? 'url' : 'embed',
      url: src,
      embedCode: isDirectStream ? '' : `<iframe src="${src}" frameborder="0" allowfullscreen></iframe>`,
      quality: srvQuality,
      speed: 'سريع',
      tag: isDirectStream ? 'MP4' : srvQuality,
    });
  };

  const ajaxEmbedIds: { id: string; label: string }[] = [];
  const seenAjaxIds = new Set<string>();

  const decodeMaybeBase64Embed = (val: string): string => {
    const trimmed = val.trim();
    if (/^(https?:)?\/\//i.test(trimmed) || /<iframe/i.test(trimmed)) return trimmed;
    if (/^[A-Za-z0-9+/=]{16,}$/.test(trimmed)) {
      try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf-8').trim();
        if (/https?:\/\/|<iframe/i.test(decoded)) return decoded;
      } catch {
        // Not valid base64 text
      }
    }
    return trimmed;
  };

  // Check clickable server buttons FIRST so real names, order, and qualities are preserved cleanly
  $(
    '[data-embed-url], [data-embed], [data-iframe], [data-server], [data-video], [data-url], [data-watch], [data-link], [data-play], li[data-src], button[data-src], a[data-src], .WatchList li[href], .WatchList li a[href], .servers li a[href]'
  ).each((_, el) => {
    if (el.tagName?.toLowerCase() === 'img') return;
    if ($(el).closest('header, nav, footer, .ads, .banner, .pm-ads-banner, .trailer, #trailer').length > 0) return;
    const attrVal =
      $(el).attr('data-embed-url') ||
      $(el).attr('data-embed') ||
      $(el).attr('data-iframe') ||
      $(el).attr('data-server') ||
      $(el).attr('data-video') ||
      $(el).attr('data-url') ||
      $(el).attr('data-watch') ||
      $(el).attr('data-link') ||
      $(el).attr('data-play') ||
      $(el).attr('data-src') ||
      $(el).attr('href');
    if (!attrVal) return;

    let candidateUrl = decodeMaybeBase64Embed(attrVal);
    const iframeMatch = candidateUrl.match(/src=["']([^"']+)["']/i);
    if (iframeMatch) candidateUrl = iframeMatch[1];

    const btnText =
      cleanText($(el).find('.name, span').first().text()) ||
      cleanText($(el).text()) ||
      cleanText($(el).attr('title'));

    // Pure numeric/short ID (e.g. FaselHD `data-embed="173411"`) -> resolve via /ajax/embed, never as a URL
    if (/^[0-9a-zA-Z_-]{1,24}$/.test(candidateUrl) && !/[./:?]/.test(candidateUrl)) {
      if (!seenAjaxIds.has(candidateUrl)) {
        seenAjaxIds.add(candidateUrl);
        ajaxEmbedIds.push({ id: candidateUrl, label: btnText || `سيرفر ${ajaxEmbedIds.length + 1}` });
      }
      return;
    }

    pushEmbedServer(candidateUrl, btnText || undefined);
  });

  $('iframe').each((_, el) => {
    if ($(el).closest('header, nav, footer, .ads, .banner, .pm-ads-banner, .trailer, #trailer').length > 0) return;
    const rawSrc = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || '';
    const titleAttr = cleanText($(el).attr('title'));
    pushEmbedServer(rawSrc, titleAttr || undefined);
  });

  // Inline <script> extraction (handles JS arrays, escaped HTML, and atob() base64 embeds)
  const serverButtonLabels = $(
    '.server-btn, .WatchList li, .servers li, .watch-servers button, .servers-list button, .server-item, .btn-service'
  )
    .map((_, el) => cleanText($(el).find('.name').first().text()) || cleanText($(el).text()))
    .get()
    .filter(Boolean);

  $('script').each((_, el) => {
    const scriptText = $(el).html() || '';
    if (!scriptText || scriptText.length < 15) return;

    // Unescape JSON/PHP-escaped HTML inside script blocks
    const unescaped = scriptText
      .replace(/\\\//g, '/')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\n|\\r|\\t/g, ' ');

    // Find all iframe src URLs inside script
    const iframeSrcRegex = /<iframe[^>]+src=["'](https?:\/\/[^"'\s<>]+)["']/gi;
    let match: RegExpExecArray | null;
    let scriptServerIdx = 0;
    while ((match = iframeSrcRegex.exec(unescaped)) !== null) {
      const label = serverButtonLabels[scriptServerIdx] || undefined;
      pushEmbedServer(match[1], label);
      scriptServerIdx++;
    }

    // Decode atob("...") base64 snippets that hold an iframe or embed URL (skipping ad trackers)
    const atobRegex = /atob\(\s*["']([A-Za-z0-9+/=]{20,})["']\s*\)/gi;
    let b64Match: RegExpExecArray | null;
    while ((b64Match = atobRegex.exec(scriptText)) !== null) {
      const decoded = decodeMaybeBase64Embed(b64Match[1]);
      if (/<script/i.test(decoded)) continue;
      const srcInDecoded = decoded.match(/src=["'](https?:\/\/[^"'\s<>]+)["']/i)?.[1] || decoded;
      if (/^https?:\/\//i.test(srcInDecoded) && !IGNORED_EMBED_HOSTS_REGEX.test(srcInDecoded)) {
        pushEmbedServer(srcInDecoded);
      }
    }

    // Also inspect JS server arrays holding bare embed URLs
    const jsArrayVarRegex = /(?:var|let|const)\s+(?:servers|embeds|players|watchLinks)\s*=\s*\[([\s\S]{5,8000}?)\]/gi;
    let arrMatch: RegExpExecArray | null;
    while ((arrMatch = jsArrayVarRegex.exec(unescaped)) !== null) {
      const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
      let uMatch: RegExpExecArray | null;
      let arrIdx = 0;
      while ((uMatch = urlRegex.exec(arrMatch[1])) !== null) {
        if (!IGNORED_EMBED_HOSTS_REGEX.test(uMatch[0])) {
          const label = serverButtonLabels[arrIdx] || undefined;
          pushEmbedServer(uMatch[0], label);
          arrIdx++;
        }
      }
    }
  });

  $('video source, video').each((_, el) => {
    const src = resolveUrl(sourceUrl, $(el).attr('src'));
    if (!src || serversMap.has(src) || isLikelyNonVideoWebsiteUrl(src, sourceOrigin)) return;
    const seqNum = serversMap.size + 1;
    const label = cleanText($(el).attr('title') || $(el).attr('data-label'));
    serversMap.set(src, {
      id: `srv-vid-${seqNum}`,
      name: cleanBaselineServerName(label || undefined, src, seqNum - 1),
      mode: 'url',
      url: src,
      embedCode: '',
      quality: extractBaselineServerQuality(label || '', quality),
      speed: 'فائق',
      tag: 'MP4',
    });
  });

  // 7. Download Links & Subpage Hints (play.php / download.php)
  const downloadsMap = new Map<
    string,
    { id: string; host: string; quality: string; size: string; format: string; url: string }
  >();

  const candidateOriginsSet = new Set<string>();
  const addOriginCandidate = (maybeUrl: string | undefined | null) => {
    if (!maybeUrl) return;
    try {
      const u = new URL(maybeUrl.trim());
      if (['http:', 'https:'].includes(u.protocol) && u.hostname !== 'example.com' && !isBlockedHost(u.hostname)) {
        candidateOriginsSet.add(u.origin);
      }
    } catch {
      // ignore
    }
  };

  addOriginCandidate($('link[rel="canonical"]').attr('href'));
  addOriginCandidate($('meta[property="og:url"]').attr('content'));
  const varUrlMatch = allScriptsText.match(/\}\)\(\s*["'](https?:\/\/[^"']+)["']\s*\)/);
  if (varUrlMatch) addOriginCandidate(varUrlMatch[1]);
  if (sourceOrigin && !sourceOrigin.includes('example.com')) {
    candidateOriginsSet.add(sourceOrigin);
  }

  const hints: SubpageHints = {
    ajaxEmbedIds,
    candidateOrigins: Array.from(candidateOriginsSet),
    hasExplicitImdbRating,
  };
  const ignoredDownloadHosts =
    /facebook\.com|twitter\.com|x\.com|t\.me|telegram|whatsapp|instagram|youtube\.com|tiktok\.com|pinterest|linkedin|plus\.google\.com|google\.com\/search|sharer\.php|\/share\?/i;
  const knownMirrorRegex =
    /(mediafire|mega\.nz|drive\.google|gofile|1fichier|pixeldrain|uqload|streamtape|dood|filemoon|liiivideo|vidmoly|vidspeed|anafast|vidoba|abyssplayer|mp4plus|bysetayico|filelions|streamwish|earnvids|voe\.sx|mixdrop|krakenfiles|turbobit|rapidgator|nitroflare)/i;

  const watchCandidates: { url: string; score: number }[] = [];
  const sourceIdVal = extractBaselineEpisodeId(sourceUrl);
  const canonicalSourceUrl = canonicalizeCompareUrl(sourceUrl);

  $('a[href]').each((idx, el) => {
    const rawHref = $(el).attr('href');
    const href = resolveUrl(sourceUrl, rawHref);
    const text = cleanText($(el).text());
    const cls = cleanText($(el).attr('class'));
    if (!href || canonicalizeCompareUrl(href) === canonicalSourceUrl) return;

    let hrefOrigin = '';
    try {
      hrefOrigin = new URL(href).origin;
    } catch {
      return;
    }

    const sameOrigin = Boolean(sourceOrigin && hrefOrigin === sourceOrigin);

    // Detect 1-hop watch/player subpage (e.g. watch.php?vid=ID -> play.php?vid=ID, <a class="xtgo">)
    // Exclude ads/episode-lists/sidebars so Season 1 list links on an episode page never hijack watchSubpageUrl!
    const inIgnoredWatchParent =
      $(el).closest(
        'header, nav, footer, .navbar, .ads, .banner, .pm-ads-banner, .ad-box, .sidebar, .widget, .related, .recommended, .comments, .tabcontent, .SeasonsEpisodes, .SeasonsList, .episodes-list, .episodes, [id^="Season"]'
      ).length > 0 && !/\b(xtgo|btnplay|watch-btn)\b/i.test(cls);

    if (
      sameOrigin &&
      !inIgnoredWatchParent &&
      (/play\.php|\/watch\/|\/player\/|\/embed\//i.test(href) ||
        /\b(xtgo|btnplay|watch-btn)\b/i.test(cls) ||
        (/مشاهدة|شاهد/i.test(text) && /\b(play|watch|vid=)\b/i.test(href)))
    ) {
      const candIdVal = extractBaselineEpisodeId(href);
      // Never follow a subpage whose episode ID conflicts with the current page's ID
      if (!(sourceIdVal && candIdVal && candIdVal !== sourceIdVal)) {
        let score = 0;
        if (sourceIdVal && candIdVal && candIdVal === sourceIdVal) score += 50;
        if (/\b(xtgo|btnplay|watch-btn)\b/i.test(cls)) score += 35;
        if (/play\.php/i.test(href)) score += 20;
        if (/\/watch\/|\/player\/|\/embed\//i.test(href)) score += 12;
        if (/مشاهدة|شاهد|watch|play/i.test(text)) score += 8;
        if (!sourceIdVal && !candIdVal && /الموسم|الحلقة/i.test(text)) score -= 20;
        if (score > 0) watchCandidates.push({ url: href, score });
      }
    }

    // Detect 1-hop download subpage (e.g. PHP Melody `download.php?vid=...`)
    if (
      sameOrigin &&
      !hints.downloadSubpageUrl &&
      $(el).closest('.pm-ads-banner, .ads, .banner').length === 0 &&
      (/download\.php|\/downloads?\//i.test(href) ||
        (/تحميل/i.test(text) && /vid=|download/i.test(href)))
    ) {
      const candIdVal = extractBaselineEpisodeId(href);
      if (!(sourceIdVal && candIdVal && candIdVal !== sourceIdVal)) {
        hints.downloadSubpageUrl = href;
      }
    }

    if (downloadsMap.has(href)) return;

    const isFileOrMirrorPath =
      /\.(mp4|mkv|avi|zip)(\?|$)/i.test(href) ||
      /\/(d|dl|download)\/[a-z0-9_-]+/i.test(href) ||
      /op=download/i.test(href);

    const looksLikeExternalMirror =
      !sameOrigin &&
      !ignoredDownloadHosts.test(href) &&
      (knownMirrorRegex.test(href) ||
        isFileOrMirrorPath ||
        Boolean(options?.isDownloadPage && $(el).closest('header, nav, footer, .navbar, .menu').length === 0));

    const looksLikeDirectButton =
      !sameOrigin &&
      !ignoredDownloadHosts.test(href) &&
      /تحميل|download|سيرفر/i.test(text);

    if (!looksLikeExternalMirror && !looksLikeDirectButton && !(sameOrigin && /\.(mp4|mkv|avi|zip)(\?|$)/i.test(href))) {
      return;
    }

    let host = 'رابط تحميل';
    try {
      host = new URL(href).hostname.replace(/^www\./, '');
    } catch {
      // ignore
    }

    const qMatch = (text + ' ' + href).match(/\b(4K|2160p|1080p|720p|480p|360p)\b/i);
    downloadsMap.set(href, {
      id: `dl-ext-${idx + 1}`,
      host: text && text.length < 40 && !/^(download|تحميل)$/i.test(text) ? `${text} (${host})` : host,
      quality: qMatch ? qMatch[1] : quality,
      size: 'حسب السيرفر',
      format: /\.mkv/i.test(href) ? 'MKV' : 'MP4',
      url: href,
    });
  });

  if (watchCandidates.length > 0) {
    watchCandidates.sort((a, b) => b.score - a.score);
    hints.watchSubpageUrl = watchCandidates[0].url;
  }

  if (!hints.watchSubpageUrl && allScriptsText) {
    const jsWatchMatch = allScriptsText.match(
      /["'](https?:\/\/[^"'\s<>]+\/+(?:watch|play|player)\/?)["']/i
    );
    if (jsWatchMatch?.[1]) hints.watchSubpageUrl = jsWatchMatch[1];
  }
  if (!hints.downloadSubpageUrl && allScriptsText) {
    const jsDlMatch = allScriptsText.match(/["'](https?:\/\/[^"'\s<>]+\/+download\/?)["']/i);
    if (jsDlMatch?.[1]) hints.downloadSubpageUrl = jsDlMatch[1];
  }

  // 8. Multi-Season & Episodes detection (preserves seasonNumber, episodeNumber, and each episode's original sourceUrl)
  type BaselineEpisode = {
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
  };

  const seasonsAccumulator = new Map<
    number,
    { seasonNumber: number; label: string; episodes: Map<number, BaselineEpisode> }
  >();
  const seasonPageLinksMap = new Map<string, { seasonNumber: number; label: string; url: string }>();
  const forcedSeasonNum = options?.forcedSeasonNumber;

  const ensureSeasonBucket = (seasonNum: number, label?: string) => {
    const cleanNum = Number.isFinite(seasonNum) && seasonNum > 0 ? seasonNum : 1;
    let bucket = seasonsAccumulator.get(cleanNum);
    if (!bucket) {
      bucket = {
        seasonNumber: cleanNum,
        label: label || `الموسم ${String(cleanNum).padStart(2, '0')}`,
        episodes: new Map(),
      };
      seasonsAccumulator.set(cleanNum, bucket);
    } else if (label && /^الموسم\s+\d+$/.test(bucket.label) && !/^الموسم\s+\d+$/.test(label)) {
      bucket.label = label;
    }
    return bucket;
  };

  const totalExtractedCount = () => {
    let n = 0;
    for (const s of seasonsAccumulator.values()) n += s.episodes.size;
    return n;
  };

  const addEpisodeToSeason = (
    seasonNum: number,
    seasonLabel: string | undefined,
    epNum: number,
    epTitle: string,
    epHref: string
  ) => {
    if (!epNum || epNum <= 0 || !epHref || totalExtractedCount() >= 250) return;
    const targetSeason = forcedSeasonNum || seasonNum || 1;
    const bucket = ensureSeasonBucket(targetSeason, seasonLabel);
    if (!bucket.episodes.has(epNum)) {
      bucket.episodes.set(epNum, {
        number: epNum,
        title: (epTitle || `الحلقة ${epNum}`).slice(0, 80),
        duration: '45 دقيقة',
        quality,
        watchUrl: epHref,
        sourceUrl: epHref,
      });
    }
  };

  const recordSeasonPageLink = (seasonNum: number, label: string, rawHref: string | undefined) => {
    const resolved = resolveUrl(sourceUrl, rawHref);
    if (!resolved) return;
    const canon = canonicalizeCompareUrl(resolved);
    if (!canon || canon === canonicalSourceUrl) return;
    if (!seasonPageLinksMap.has(canon)) {
      seasonPageLinksMap.set(canon, {
        seasonNumber: seasonNum,
        label: label || `الموسم ${String(seasonNum).padStart(2, '0')}`,
        url: resolved,
      });
    }
  };

  // 8a. Season links & <select> dropdowns (e.g. distributed season URLs /season-2, .TabS / .TabE)
  $('.SeasonsList a[href], .seasons-sec a[href], .seasons-list a[href], .TabS a[href], a[data-season][href], a[href*="season"]').each(
    (idx, el) => {
      if ($(el).closest('header nav, .navbar, footer, .ads, .pm-ads-banner').length > 0) return;
      const href = $(el).attr('href');
      const txt = cleanText($(el).text()) || cleanText($(el).attr('title'));
      const dataS = Number($(el).attr('data-season'));
      if (!href || (!/موسم|season/i.test(txt) && !Number.isFinite(dataS) && !/season[-_=]?\d+/i.test(href))) {
        return;
      }
      const sNum =
        Number.isFinite(dataS) && dataS > 0
          ? dataS
          : parseBaselineSeasonNumber(`${txt} ${href}`, idx + 1);
      recordSeasonPageLink(sNum, txt || `الموسم ${sNum}`, href);
    }
  );

  $('select.TabS option, select[name*="season"] option').each((idx, el) => {
    const val = $(el).attr('value') || $(el).attr('data-url') || '';
    const txt = cleanText($(el).text());
    const sNum = parseBaselineSeasonNumber(txt || val, idx + 1);
    if (val && (/^https?:\/\//i.test(val) || val.startsWith('/'))) {
      recordSeasonPageLink(sNum, txt || `الموسم ${sNum}`, val);
    }
  });

  $('select.TabE option, select.episodeoption option, select[name*="episode"] option').each((_, el) => {
    if ($(el).closest('header nav, .navbar, footer').length > 0) return;
    const rawHref = resolveUrl(sourceUrl, $(el).attr('value') || $(el).attr('data-url'));
    if (!rawHref) return;
    const text = cleanText($(el).text());
    const epNum = extractBaselineEpisodeNumber(text, rawHref);
    if (epNum) {
      const sNum = forcedSeasonNum || parseBaselineSeasonNumber(text, 1);
      addEpisodeToSeason(sNum, undefined, epNum, text, rawHref);
    }
  });

  // 8b. Paired Multi-Season Tabs & Panels (.SeasonsList .tablinks + .tabcontent, [data-season])
  const tabLabels = $('.SeasonsList .tablinks, .SeasonsList [data-season], .seasons-tabs .tablinks, [role="tab"][data-season]')
    .map((idx, el) => ({
      num:
        Number($(el).attr('data-season')) ||
        parseBaselineSeasonNumber(cleanText($(el).text()), idx + 1),
      label: cleanText($(el).text()) || `الموسم ${idx + 1}`,
    }))
    .get();

  let foundMultiSeasonPanels = false;
  const seasonPanels = $('.tabcontent, .SeasonsEpisodes, .season-episodes, [data-season-panel], [id^="Season"]');
  if (seasonPanels.length > 0) {
    seasonPanels.each((idx, panel) => {
      const $panel = $(panel);
      const idAttr = $panel.attr('id') || '';
      const dataS = Number($panel.attr('data-season') || $panel.attr('data-season-panel'));
      const matchedTab = tabLabels[idx];
      const headingText = cleanText($panel.find('h2, h3, h4, .season-title').first().text());
      const sNum =
        forcedSeasonNum ||
        (Number.isFinite(dataS) && dataS > 0 ? dataS : 0) ||
        parseBaselineSeasonNumber(headingText || matchedTab?.label || idAttr, matchedTab?.num || idx + 1);
      const sLabel = matchedTab?.label || headingText || `الموسم ${String(sNum).padStart(2, '0')}`;

      const beforeCount = seasonsAccumulator.get(sNum)?.episodes.size || 0;
      $panel.find('a[href]').each((_, aEl) => {
        if ($(aEl).closest('header nav, .navbar, footer, .ads, .pm-ads-banner').length > 0) return;
        const rawHref = resolveUrl(sourceUrl, $(aEl).attr('href'));
        if (!rawHref) return;
        const text = cleanText($(aEl).text());
        const titleAttr = cleanText($(aEl).attr('title'));
        const combinedLabel = text || titleAttr;
        const epNum = extractBaselineEpisodeNumber(combinedLabel, rawHref);
        if (epNum) {
          addEpisodeToSeason(sNum, sLabel, epNum, text || titleAttr || `الحلقة ${epNum}`, rawHref);
        }
      });
      if ((seasonsAccumulator.get(sNum)?.episodes.size || 0) > beforeCount) {
        foundMultiSeasonPanels = true;
      }
    });
  }

  // 8c. General fallback for single-season / non-panel episode lists
  if (!foundMultiSeasonPanels) {
    $('a[href]').each((_, el) => {
      if ($(el).closest('header nav, .navbar, footer, .ads, .banner, .pm-ads-banner').length > 0) return;
      const rawHref = resolveUrl(sourceUrl, $(el).attr('href'));
      if (!rawHref) return;
      const text = cleanText($(el).text());
      const titleAttr = cleanText($(el).attr('title'));
      const combinedLabel = text || titleAttr;
      const epNum = extractBaselineEpisodeNumber(combinedLabel, rawHref);
      if (epNum) {
        const nearestSeasonAttr = $(el).closest('[data-season]').attr('data-season');
        const nearestPanelHeading = cleanText(
          $(el).closest('.season, .season-block, section, .tabcontent').find('h2, h3, h4, .season-title').first().text()
        );
        const sNum =
          forcedSeasonNum ||
          (nearestSeasonAttr ? Number(nearestSeasonAttr) || 1 : parseBaselineSeasonNumber(nearestPanelHeading || combinedLabel, 1));
        addEpisodeToSeason(sNum, nearestPanelHeading || undefined, epNum, text || titleAttr || `الحلقة ${epNum}`, rawHref);
      }
    });
  }

  // If current page itself looks like Episode N and wasn't linked in the list (common on PHP Melody active episode), include it
  const currentEpMatch = normalizeArabicDigits(`${rawTitle} ${h1Title}`).match(
    /(?:الحلقة|حلقة|Episode|Ep\.?)\s*#?(\d{1,3})/i
  );
  if (currentEpMatch && sourceUrl) {
    const currNum = Number(currentEpMatch[1]);
    const currSeasonNum = forcedSeasonNum || parseBaselineSeasonNumber(`${rawTitle} ${h1Title}`, 1);
    const bucket = seasonsAccumulator.get(currSeasonNum);
    if (currNum > 0 && bucket && bucket.episodes.size > 0 && !bucket.episodes.has(currNum)) {
      addEpisodeToSeason(
        currSeasonNum,
        bucket.label,
        currNum,
        `الحلقة ${String(currNum).padStart(2, '0')}`,
        sourceUrl
      );
    }
  }

  if (seasonPageLinksMap.size > 0) {
    hints.seasonPageUrls = Array.from(seasonPageLinksMap.values()).sort((a, b) => a.seasonNumber - b.seasonNumber);
  }

  const parsedSeasons = Array.from(seasonsAccumulator.values())
    .sort((a, b) => a.seasonNumber - b.seasonNumber)
    .map((s) => ({
      seasonNumber: s.seasonNumber,
      label: s.label,
      year,
      episodes: Array.from(s.episodes.values()).sort((a, b) => a.number - b.number),
    }))
    .filter((s) => s.episodes.length > 0);

  // 9. Cast fallback
  if (jsonLdCast.length === 0) {
    $('.single-actor-name, [itemprop="actor"] [itemprop="name"]').each((_, el) => {
      const nm = cleanText($(el).text());
      if (nm && jsonLdCast.length < 10) {
        jsonLdCast.push({
          name: nm,
          role: 'فريق العمل',
          initials: nm.slice(0, 2).toUpperCase(),
        });
      }
    });
  }

  const normalizedServers = Array.from(serversMap.values())
    .slice(0, 12)
    .map((srv, idx) => ({
      ...srv,
      id: srv.id || `srv-ext-${idx + 1}`,
      name: cleanBaselineServerName(srv.name, srv.url, idx),
    }));

  const media = {
    title,
    englishTitle,
    kind,
    categories: categories.slice(0, 8),
    genres: genres.slice(0, 8),
    year,
    country: country || 'الولايات المتحدة',
    language: language || 'مترجم للعربية',
    quality,
    duration,
    imdb,
    votes: '10,500',
    poster,
    backdrop,
    poster_url: poster,
    backdrop_url: backdrop,
    poster_width: 0,
    poster_height: 0,
    backdrop_width: 0,
    backdrop_height: 0,
    image_source: poster ? 'scraped' : 'none',
    image_quality_status: (backdrop ? 'unknown' : 'missing_backdrop') as ServerImageQualityStatus,
    tagline: story.slice(0, 140),
    story,
    sourceUrl: sourceUrl || '',
    imdbId: extractedImdbId || '',
    shortUrl: '',
    trailerUrl,
    cast: jsonLdCast,
    servers: normalizedServers,
    downloads: Array.from(downloadsMap.values()).slice(0, 12),
    seasons: parsedSeasons,
  };

  return { media, hints };
}

function parseHtmlToMedia(html: string, sourceUrl: string) {
  return parseHtmlToMediaWithHints(html, sourceUrl).media;
}

type ScrapedMediaItem = ReturnType<typeof parseHtmlToMedia>;

const DEFAULT_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
  'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
};

async function fetchRemoteText(
  targetUrl: string,
  timeoutMs = 12000
): Promise<{ ok: boolean; status: number; text: string; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: DEFAULT_FETCH_HEADERS,
    });
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    return { ok: response.ok, status: response.status, text, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

function isLikelyContentUrl(candidateUrl: string, allowedOrigins: string | string[]): boolean {
  try {
    const u = new URL(candidateUrl);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const originsList = Array.isArray(allowedOrigins) ? allowedOrigins : [allowedOrigins];
    if (!originsList.includes(u.origin)) return false;
    const p = u.pathname.toLowerCase();
    if (
      p === '/' ||
      p === '' ||
      /\.(jpg|jpeg|png|gif|webp|svg|css|js|ico|xml|pdf|zip|mp4|mkv)$/i.test(p) ||
      /^\/(movies|series|shows|mix|one|recent|trends|discovery|actors|tv-channels|collections|requests|modal)\/?$/i.test(
        p
      ) ||
      /\/(index|rss|feed|tag|tags|label|category|categories|genre|search|author|page|login|register|admin|wp-admin|wp-content|comments|contact|about|privacy|terms|play|download|actor|collection|modal)(\.php)?(\/|$)/i.test(
        p
      ) ||
      p.includes('/cdn-cgi/') ||
      u.search.includes('cat=') ||
      u.search.includes('q=') ||
      u.search.includes('updated-max=')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function extractListingLinksAndPagination(html: string, pageUrl: string) {
  const $ = cheerio.load(html);
  const baseOrigin = new URL(pageUrl).origin;
  const canonicalHref = $('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content') || '';
  const allowedOrigins = [baseOrigin];
  try {
    if (canonicalHref) {
      const co = new URL(canonicalHref).origin;
      if (!allowedOrigins.includes(co)) allowedOrigins.push(co);
    }
  } catch {
    // ignore
  }
  const siteTitle = cleanText($('title').first().text()) || new URL(pageUrl).hostname;

  const cards = new Map<string, { url: string; title: string; poster: string }>();
  const cardSelectors = [
    '.entry-box a[href]',
    '.cinema-poster-slide a[href]',
    '.cinema-card a[href]',
    '.pm-video-thumb a[href]',
    '.pm-li-video a[href]',
    'a[href*="watch.php?vid="]',
    'article a[href]',
    '.post a[href]',
    '.movie a[href]',
    '.card a[href]',
    '.item a[href]',
    '.block a[href]',
    '.grid a[href]',
    'a[href]',
  ];

  for (const selector of cardSelectors) {
    $(selector).each((_, el) => {
      if ($(el).closest('header, nav, footer, .navbar, .cinema-topbar').length > 0) return;
      const href = resolveUrl(pageUrl, $(el).attr('href'));
      if (!href || !isLikelyContentUrl(href, allowedOrigins)) return;

      const cleanHref = href.split('#')[0];
      if (cards.has(cleanHref)) return;

      const parentCard = $(el).closest('.entry-box, .cinema-poster-slide, .cinema-card, .pm-li-video, .pm-video-thumb, article, .post, .movie, .card, .item, .block');
      let poster = '';
      let matchedAlt = '';

      $(el)
        .find('img')
        .add(parentCard.find('img'))
        .each((_, imgNode) => {
          if (poster) return;
          const candidate = extractBestImageFromElementServer($, $(imgNode), pageUrl);
          if (candidate) {
            poster = candidate;
            matchedAlt = cleanText($(imgNode).attr('alt'));
          }
        });

      if (!poster) {
        $(el)
          .add($(el).find('[style*="background-image"], [data-bg], [data-poster]'))
          .add(parentCard)
          .add(parentCard.find('[style*="background-image"], [data-bg], [data-poster]'))
          .each((_, bgNode) => {
            if (poster) return;
            const candidate = extractBestImageFromElementServer($, $(bgNode), pageUrl);
            if (candidate) poster = candidate;
          });
      }

      const cardTitle =
        cleanText($(el).attr('title')) ||
        cleanText($(el).find('h2, h3, h4, .title').first().text()) ||
        cleanText(parentCard.find('h2, h3, h4, .title, .ellipsis').first().text()) ||
        matchedAlt ||
        cleanText($(el).text());

      // Prioritize elements that look like actual media cards
      const looksLikeCard =
        selector !== 'a[href]' || Boolean(poster) || (cardTitle.length >= 4 && cardTitle.length <= 160);
      if (!looksLikeCard) return;

      cards.set(cleanHref, {
        url: cleanHref,
        title: (cardTitle || 'عمل مستورد').slice(0, 180),
        poster,
      });
    });

    if (cards.size >= 40 && selector !== 'a[href]') {
      break;
    }
  }

  // Next pagination links (prefer rel="next" / "التالي" / lower sequential page numbers)
  const prioritizedNext: string[] = [];
  const otherNext: string[] = [];
  $('a[rel="next"], .next a, a.next, .pagination a, a.blog-pager-older-link, .nav-previous a').each(
    (_, el) => {
      const nextHref = resolveUrl(pageUrl, $(el).attr('href'));
      if (!nextHref || !nextHref.startsWith(baseOrigin) || nextHref === pageUrl) return;
      const label = cleanText($(el).text());
      const isExplicitNext =
        $(el).attr('rel') === 'next' || /التالي|next|›|»/i.test(label) || /\/page\/[2-9]\//.test(nextHref);
      const targetList = isExplicitNext ? prioritizedNext : otherNext;
      if (!prioritizedNext.includes(nextHref) && !otherNext.includes(nextHref)) {
        targetList.push(nextHref);
      }
    }
  );

  return { siteTitle, cards: Array.from(cards.values()), nextUrls: [...prioritizedNext, ...otherNext] };
}

async function resolveAjaxEmbedsFromOrigins(
  ajaxEmbedIds: { id: string; label: string }[],
  candidateOrigins: string[],
  refererUrl: string,
  quality: string
) {
  const resolved: {
    id: string;
    name: string;
    mode: 'url' | 'embed';
    url: string;
    embedCode: string;
    quality: string;
    speed: string;
    tag: string;
  }[] = [];

  if (ajaxEmbedIds.length === 0 || candidateOrigins.length === 0) return resolved;

  for (const origin of candidateOrigins) {
    try {
      const host = new URL(origin).hostname;
      if (isBlockedHost(host) || host === 'example.com') continue;

      // Obtain an active PHP session + matching CSRF token (prefer /login which bypasses Cloudflare edge cache)
      let cookieHeader = '';
      let csrfToken = '';

      for (const probePath of ['/login', '/']) {
        const probeRes = await fetch(`${origin}${probePath}`, {
          headers: DEFAULT_FETCH_HEADERS,
          signal: AbortSignal.timeout(8000),
        });
        if (!probeRes.ok) continue;
        const probeHtml = await probeRes.text();
        const setCookies =
          typeof probeRes.headers.getSetCookie === 'function' ? probeRes.headers.getSetCookie() : [];
        const joinedCookies = setCookies.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
        const tokenMatch =
          probeHtml.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i) ||
          probeHtml.match(/name=["']_TOKEN["'][^>]*value=["']([^"']+)["']/i);

        if (joinedCookies && tokenMatch?.[1]) {
          cookieHeader = joinedCookies;
          csrfToken = tokenMatch[1];
          break;
        }
      }

      if (!cookieHeader || !csrfToken) continue;

      const postSingleEmbed = async (item: { id: string; label: string }) => {
        const embRes = await fetch(`${origin}/ajax/embed`, {
          method: 'POST',
          headers: {
            ...DEFAULT_FETCH_HEADERS,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-TOKEN': csrfToken,
            Origin: origin,
            Referer: refererUrl || `${origin}/`,
            Cookie: cookieHeader,
          },
          body: `id=${encodeURIComponent(item.id)}`,
          signal: AbortSignal.timeout(8000),
        });
        if (!embRes.ok) return null;
        const body = await embRes.text();
        const iframeSrcMatch = body.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        const videoSrcMatch = body.match(/<(?:video|source)[^>]+src=["']([^"']+)["']/i);
        const rawSrc = iframeSrcMatch?.[1] || videoSrcMatch?.[1] || '';
        const src = resolveUrl(origin, rawSrc);
        if (!src) return null;

        let hostLabel = '';
        try {
          hostLabel = new URL(src).hostname.replace(/^www\./, '');
        } catch {
          hostLabel = 'embed';
        }
        const cleanLabel = cleanText(item.label).replace(/^\d+\s*/, '').replace(/✓$/, '').replace(/مستورد|embed/gi, '').trim();
        const name = cleanLabel ? cleanLabel.slice(0, 40) : `سيرفر ${resolved.length + 1}`;

        return {
          id: `srv-ajax-${item.id}`,
          name,
          mode: (iframeSrcMatch ? 'embed' : 'url') as 'url' | 'embed',
          url: src,
          embedCode: iframeSrcMatch ? `<iframe src="${src}" frameborder="0" allowfullscreen></iframe>` : '',
          quality,
          speed: 'سريع',
          tag: iframeSrcMatch ? quality : 'MP4',
        };
      };

      // Probe first ID before fetching remaining servers in parallel
      const limitedIds = ajaxEmbedIds.slice(0, 12);
      const firstSrv = await postSingleEmbed(limitedIds[0]);
      if (!firstSrv) continue; // Try next origin (e.g. canonical domain if mirror drops sessions)

      resolved.push(firstSrv);
      if (limitedIds.length > 1) {
        const rest = await Promise.all(limitedIds.slice(1).map((item) => postSingleEmbed(item).catch(() => null)));
        for (const srv of rest) {
          if (srv && !resolved.some((existing) => existing.url === srv.url)) {
            resolved.push(srv);
          }
        }
      }

      if (resolved.length > 0) break;
    } catch {
      // Try next origin candidate
    }
  }

  return resolved;
}

async function findYoutubeTrailerFallback(
  title: string,
  englishTitle: string,
  year: string,
  kind: 'movie' | 'series' | 'tv' | 'wrestling'
): Promise<string> {
  const cleanEn = cleanText(englishTitle)
    .replace(/\b(20[1-3]\d|19\d\d)\b/g, '')
    .replace(/\b(HD|FHD|UHD|4K|WEB-?DL|BluRay|HDRip|CAM)\b/gi, '')
    .replace(/[()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanAr = cleanText(title)
    .replace(/\b(20[1-3]\d|19\d\d)\b/g, '')
    .replace(/\b(HD|FHD|UHD|4K|WEB-?DL|BluRay|HDRip|CAM)\b/gi, '')
    .replace(/^(فيلم|مسلسل|برنامج|عرض)\s+/i, '')
    .replace(/\s+(مترجم|مدبلج|كامل|اون\s*لاين|أون\s*لاين).*$/i, '')
    .replace(/[()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const useEn = cleanEn.length >= 3 && /[A-Za-z]{3,}/.test(cleanEn);
  const baseQuery = useEn ? cleanEn : cleanAr;
  if (!baseQuery) return '';

  const kindSuffix = kind === 'series' ? 'series official trailer' : 'official trailer';
  const queries = [
    `${baseQuery} ${year || ''} ${kindSuffix}`.replace(/\s+/g, ' ').trim(),
  ];
  if (!useEn && cleanAr) {
    const arKind = kind === 'series' ? 'برومو مسلسل' : 'إعلان فيلم';
    queries.push(`${arKind} ${cleanAr} ${year || ''}`.replace(/\s+/g, ' ').trim());
  }

  for (const query of queries) {
    try {
      const res = await fetchRemoteText(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        4800
      );
      if (!res.ok || !res.text) continue;
      const match = res.text.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
      if (match?.[1]) {
        return `https://www.youtube.com/watch?v=${match[1]}`;
      }
    } catch {
      // Try next query
    }
  }
  return '';
}

async function verifyScrapedServers(
  servers: ScrapedMediaItem['servers'],
  sourceOrigin: string
): Promise<ScrapedMediaItem['servers']> {
  if (!servers.length) return [];

  const checkOne = async (srv: ScrapedMediaItem['servers'][number]) => {
    const target = srv.url;
    if (!target || isLikelyNonVideoWebsiteUrl(target, sourceOrigin)) return false;
    if (/\.(mp4|m3u8|webm|ogg)(\?|$)/i.test(target)) return true;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(target, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          ...DEFAULT_FETCH_HEADERS,
          Referer: sourceOrigin ? `${sourceOrigin}/` : new URL(target).origin + '/',
          Range: 'bytes=0-24576',
        },
      });
      const finalUrl = response.url || target;
      if (isLikelyNonVideoWebsiteUrl(finalUrl, sourceOrigin)) return false;
      if (!response.ok && response.status !== 206) return false;

      const xFrame = (response.headers.get('x-frame-options') || '').toLowerCase();
      const csp = (response.headers.get('content-security-policy') || '').toLowerCase();
      const cfMitigated = (response.headers.get('cf-mitigated') || '').toLowerCase();
      if (cfMitigated === 'challenge') return false;

      const ct = (response.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('video/') || ct.includes('mpegurl')) return true;

      let snippet = '';
      if (ct.includes('text/html') || ct.includes('text/plain') || !ct) {
        snippet = (await response.text().catch(() => '')).slice(0, 28000);
        if (isWebsiteHomepageHtml(finalUrl, snippet)) return false;
        if (
          /<title>\s*(?:403\s+Forbidden|Access\s+Denied|Just\s+a\s+moment|Attention\s+Required|404\s+Not\s+Found)/i.test(
            snippet
          ) ||
          /file\s*(?:was|has been)?\s*(?:deleted|removed)|video\s*(?:was|has been)?\s*(?:deleted|removed|not found)|file\s*not\s*found|404\s*not\s*found|no\s*longer\s*available|تم\s*حذف\s*(?:الملف|الفيديو)|الفيديو\s*غير\s*موجود|الملف\s*غير\s*موجود/i.test(
            snippet
          )
        ) {
          return false;
        }
        const frameBlocked =
          xFrame.includes('deny') ||
          xFrame.includes('sameorigin') ||
          /frame-ancestors\s+[^;]*'none'|frame-ancestors\s+'self'/.test(csp) ||
          /sandboxed\s+embed\s+is\s+not\s+allowed|please\s+disable\s+sandbox/i.test(snippet);
        if (frameBlocked && !/\.(mp4|m3u8)(\?|"|')/i.test(snippet)) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  const keptFlags = await Promise.all(servers.map((srv) => checkOne(srv)));
  return servers
    .filter((_, idx) => keptFlags[idx])
    .slice(0, 12)
    .map((srv, idx) => ({
      ...srv,
      id: srv.id || `srv-ext-${idx + 1}`,
      name: cleanBaselineServerName(srv.name, srv.url, idx),
    }));
}

function canonicalizeCompareUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl.trim());
    u.hash = '';
    return u.toString().replace(/\/+$/, '');
  } catch {
    return rawUrl.trim().replace(/\/+$/, '');
  }
}

export async function scrapeFullItemWithSubpages(
  mainUrl: string,
  mainHtml: string,
  options?: { skipEpisodeCrawl?: boolean }
): Promise<ScrapedMediaItem> {
  const { media, hints } = parseHtmlToMediaWithHints(mainHtml, mainUrl);

  let watchUrl = hints.watchSubpageUrl;
  let downloadUrl = hints.downloadSubpageUrl;

  // Step 1: If an ID-compatible watch/player subpage exists (e.g. watch.php?vid=X -> play.php?vid=X), fetch it
  if (watchUrl && canonicalizeCompareUrl(watchUrl) !== canonicalizeCompareUrl(mainUrl)) {
    try {
      const u = new URL(watchUrl);
      if (!isBlockedHost(u.hostname)) {
        const watchRes = await fetchRemoteText(watchUrl, 8500);
        if (watchRes.ok && watchRes.text.length > 100) {
          const watchParsed = parseHtmlToMediaWithHints(watchRes.text, watchUrl);
          if (!media.trailerUrl && watchParsed.media.trailerUrl) {
            media.trailerUrl = watchParsed.media.trailerUrl;
          }
          if (watchParsed.media.servers.length > 0) {
            // Prefer watch subpage's actual player servers while keeping any unique servers from current page
            const merged = [...watchParsed.media.servers];
            const seen = new Set(merged.map((s) => s.url));
            for (const srv of media.servers) {
              if (!seen.has(srv.url)) {
                merged.push(srv);
                seen.add(srv.url);
              }
            }
            media.servers = merged;
          }
          if (watchParsed.media.downloads.length > 0) {
            const seenDl = new Set(media.downloads.map((d) => d.url));
            for (const dl of watchParsed.media.downloads) {
              if (!seenDl.has(dl.url)) {
                media.downloads.push(dl);
                seenDl.add(dl.url);
              }
            }
          }
          if (!downloadUrl && watchParsed.hints.downloadSubpageUrl) {
            downloadUrl = watchParsed.hints.downloadSubpageUrl;
          }
        }
      }
    } catch {
      // Non-fatal: continue with main page data
    }
  }

  // Step 2: If a separate download subpage exists (e.g. download.php?vid=...), fetch it for real download mirrors
  if (downloadUrl && downloadUrl !== mainUrl && downloadUrl !== watchUrl) {
    try {
      const u = new URL(downloadUrl);
      if (!isBlockedHost(u.hostname)) {
        const dlRes = await fetchRemoteText(downloadUrl, 8500);
        if (dlRes.ok && dlRes.text.length > 100) {
          const dlParsed = parseHtmlToMediaWithHints(dlRes.text, downloadUrl, {
            isDownloadPage: true,
          });
          if (dlParsed.media.downloads.length > 0) {
            const seenDl = new Set(media.downloads.map((d) => d.url));
            for (const dl of dlParsed.media.downloads) {
              if (!seenDl.has(dl.url)) {
                media.downloads.push(dl);
                seenDl.add(dl.url);
              }
            }
          }
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // Step 3: If servers are loaded dynamically via AJAX embed IDs (e.g. FaselHD `data-embed="173411"`), resolve them via /ajax/embed
  if (media.servers.length === 0 && hints.ajaxEmbedIds.length > 0) {
    const ajaxServers = await resolveAjaxEmbedsFromOrigins(
      hints.ajaxEmbedIds,
      hints.candidateOrigins,
      mainUrl,
      media.quality
    );
    const seen = new Set(media.servers.map((s) => s.url));
    for (const srv of ajaxServers) {
      if (!seen.has(srv.url) && !isLikelyNonVideoWebsiteUrl(srv.url)) {
        media.servers.push(srv);
        seen.add(srv.url);
      }
    }
  }

  let mainOrigin = '';
  try {
    if (mainUrl) mainOrigin = new URL(mainUrl).origin;
  } catch {
    // ignore
  }

  // Step 4: Verify scraped servers aren't website homepages / broken while preserving real names & qualities
  // Step 5: Fallback trailer search + independent High-Res Poster (2:3) & Backdrop (16:9) enrichment + real IMDb/TMDb rating
  const [filteredServers, fallbackTrailer, resolvedImages, resolvedRating] = await Promise.all([
    verifyScrapedServers(media.servers, mainOrigin),
    media.trailerUrl || options?.skipEpisodeCrawl
      ? Promise.resolve(media.trailerUrl)
      : findYoutubeTrailerFallback(media.title, media.englishTitle, media.year, media.kind),
    options?.skipEpisodeCrawl
      ? Promise.resolve(null)
      : resolveHighResImagesServer({
          title: media.title,
          englishTitle: media.englishTitle,
          year: media.year,
          kind: media.kind,
          imdbId: media.imdbId,
          currentPoster: media.poster,
          currentBackdrop: media.backdrop,
          preferOfficial: true,
        }),
    options?.skipEpisodeCrawl || (hints.hasExplicitImdbRating && media.imdb !== 7.8)
      ? Promise.resolve(null)
      : resolveMediaRatingServer({
          title: media.title,
          englishTitle: media.englishTitle,
          year: media.year,
          kind: media.kind,
          imdbId: media.imdbId,
        }),
  ]);

  media.servers = filteredServers;
  media.trailerUrl = fallbackTrailer || '';
  if (resolvedRating && resolvedRating.imdb > 0) {
    media.imdb = resolvedRating.imdb;
    if (!media.imdbId && resolvedRating.imdbId) {
      media.imdbId = resolvedRating.imdbId;
    }
    if (resolvedRating.votes) {
      media.votes = resolvedRating.votes;
    }
    if (
      (!media.year || media.year === '2026') &&
      resolvedRating.year &&
      /^(?:19|20)\d{2}$/.test(resolvedRating.year)
    ) {
      media.year = resolvedRating.year;
    }
  }
  if (resolvedImages) {
    if (resolvedImages.poster_url) {
      media.poster = resolvedImages.poster_url;
      media.poster_url = resolvedImages.poster_url;
    }
    media.poster_width = resolvedImages.poster_width;
    media.poster_height = resolvedImages.poster_height;
    media.backdrop = resolvedImages.backdrop_url;
    media.backdrop_url = resolvedImages.backdrop_url;
    media.backdrop_width = resolvedImages.backdrop_width;
    media.backdrop_height = resolvedImages.backdrop_height;
    media.image_source = resolvedImages.image_source;
    media.image_quality_status = resolvedImages.image_quality_status;
  }
  media.downloads = media.downloads.slice(0, 12);

  // Step 5b: If distributed multi-season page links exist (e.g. /season-2, /season-3), fetch all season pages FIRST
  if (!options?.skipEpisodeCrawl && hints.seasonPageUrls && hints.seasonPageUrls.length > 0) {
    const canonicalMain = canonicalizeCompareUrl(mainUrl);
    const visitedSeasonUrls = new Set<string>([canonicalMain]);
    for (const sLink of hints.seasonPageUrls) {
      const canonSeasonUrl = canonicalizeCompareUrl(sLink.url);
      if (!canonSeasonUrl || visitedSeasonUrls.has(canonSeasonUrl)) continue;
      visitedSeasonUrls.add(canonSeasonUrl);
      try {
        const parsedS = new URL(sLink.url);
        if (isBlockedHost(parsedS.hostname)) continue;
        const sRes = await fetchRemoteText(sLink.url, 8500);
        if (!sRes.ok || sRes.text.length < 100) continue;
        const sParsed = parseHtmlToMediaWithHints(sRes.text, sLink.url, {
          forcedSeasonNumber: sLink.seasonNumber,
        });
        for (const nextSeason of sParsed.media.seasons) {
          const existing = media.seasons.find((s) => s.seasonNumber === nextSeason.seasonNumber);
          if (!existing) {
            media.seasons.push(nextSeason);
          } else {
            for (const ep of nextSeason.episodes) {
              if (!existing.episodes.some((e) => e.number === ep.number)) {
                existing.episodes.push(ep);
              }
            }
            existing.episodes.sort((a, b) => a.number - b.number);
          }
        }
      } catch {
        // Non-fatal
      }
    }
    media.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
  }

  // Step 6: Per-Episode Independent Server Extraction across ALL Seasons (never clone across episodes or from series root)
  if (!options?.skipEpisodeCrawl && media.seasons.length > 0) {
    const canonicalMain = canonicalizeCompareUrl(mainUrl);
    const allTargets = media.seasons.flatMap((s) =>
      s.episodes.map((ep) => ({ seasonNumber: s.seasonNumber, ep }))
    );

    if (allTargets.length > 0) {
      if (media.kind !== 'wrestling') media.kind = 'series';

      // Count how many episodes claim canonicalMain (must be <= 1 to prevent cloning series root onto all episodes)
      const matchingMainCount = allTargets.filter(
        ({ ep }) => canonicalizeCompareUrl(ep.sourceUrl || ep.watchUrl || '') === canonicalMain
      ).length;

      // Strict per-canonical-URL cache within this series crawl
      const epFetchCache = new Map<string, { ok: boolean; text: string }>();
      const fetchEpisodeCached = async (targetUrl: string) => {
        const canon = canonicalizeCompareUrl(targetUrl);
        const cached = epFetchCache.get(canon);
        if (cached) return cached;
        const res = await fetchRemoteText(targetUrl, 8500);
        const entry = { ok: res.ok, text: res.text };
        epFetchCache.set(canon, entry);
        return entry;
      };

      const EP_CONCURRENCY = 4;
      for (let i = 0; i < allTargets.length; i += EP_CONCURRENCY) {
        const chunk = allTargets.slice(i, i + EP_CONCURRENCY);
        await Promise.all(
          chunk.map(async ({ seasonNumber, ep }) => {
            const epPageUrl = (ep.sourceUrl || ep.watchUrl || '').trim();
            ep.sourceUrl = epPageUrl;
            const canonicalEp = canonicalizeCompareUrl(epPageUrl);

            if (!canonicalEp) {
              ep.servers = [];
              ep.watchUrl = '';
              return;
            }

            // Never reuse mainUrl servers if more than one episode points to canonicalMain, and NEVER skip on canonicalWatch!
            if (canonicalEp === canonicalMain) {
              if (matchingMainCount > 1) {
                ep.servers = [];
                ep.watchUrl = '';
                return;
              }
              ep.servers = filteredServers
                .filter((s) => s.url && !isLikelyNonVideoWebsiteUrl(s.url, mainOrigin))
                .map((s, sIdx) => ({
                  ...s,
                  id: `ep-s${seasonNumber}-e${ep.number}-srv-${sIdx + 1}`,
                  name: cleanBaselineServerName(s.name, s.url, sIdx),
                }));
              if (watchUrl) ep.watchSubpageUrl = watchUrl;
              ep.watchUrl = ep.servers[0]?.url || '';
              return;
            }

            try {
              const parsedEpUrl = new URL(epPageUrl);
              if (isBlockedHost(parsedEpUrl.hostname)) {
                ep.servers = [];
                ep.watchUrl = '';
                return;
              }
              const epRes = await fetchEpisodeCached(epPageUrl);
              if (epRes.ok && epRes.text.length > 100) {
                const epHintsCheck = parseHtmlToMediaWithHints(epRes.text, epPageUrl).hints;
                const epData = await scrapeFullItemWithSubpages(epPageUrl, epRes.text, {
                  skipEpisodeCrawl: true,
                });
                ep.servers = epData.servers
                  .filter((s) => s.url && !isLikelyNonVideoWebsiteUrl(s.url, mainOrigin))
                  .map((s, sIdx) => ({
                    ...s,
                    id: `ep-s${seasonNumber}-e${ep.number}-srv-${sIdx + 1}`,
                    name: cleanBaselineServerName(s.name, s.url, sIdx),
                  }));
                if (epHintsCheck.watchSubpageUrl) {
                  ep.watchSubpageUrl = epHintsCheck.watchSubpageUrl;
                }
                ep.watchUrl = ep.servers[0]?.url || '';
                return;
              }
            } catch {
              // Fall through and clear raw website URL
            }
            ep.servers = [];
            ep.watchUrl = '';
          })
        );
      }

      // If root media servers were empty (e.g., series overview page), mirror first populated episode at root display ONLY
      if (media.servers.length === 0) {
        const firstEpWithServers = allTargets.find((t) => t.ep.servers && t.ep.servers.length > 0)?.ep;
        if (firstEpWithServers?.servers) {
          media.servers = firstEpWithServers.servers.map((s, idx) => ({
            ...s,
            id: `srv-ext-${idx + 1}`,
            name: cleanBaselineServerName(s.name, s.url, idx),
          }));
        }
      }
    }
  }

  return media;
}

async function tryBloggerFeedScrape(
  origin: string,
  maxItems: number
): Promise<{ siteTitle: string; items: ScrapedMediaItem[] } | null> {
  try {
    const feedUrl = `${origin}/feeds/posts/default?alt=json&max-results=${maxItems}`;
    const res = await fetchRemoteText(feedUrl, 10000);
    if (!res.ok || !res.text.trim().startsWith('{')) return null;

    const json = JSON.parse(res.text) as {
      feed?: {
        title?: { $t?: string };
        entry?: {
          title?: { $t?: string };
          content?: { $t?: string };
          summary?: { $t?: string };
          category?: { term?: string }[];
          media$thumbnail?: { url?: string };
          link?: { rel?: string; href?: string }[];
        }[];
      };
    };

    const entries = json.feed?.entry;
    if (!Array.isArray(entries) || entries.length === 0) return null;

    const siteTitle = cleanText(json.feed?.title?.$t) || new URL(origin).hostname;
    const items: ScrapedMediaItem[] = entries.slice(0, maxItems).map((entry) => {
      const altLink = entry.link?.find((l) => l.rel === 'alternate')?.href || origin;
      const contentHtml = entry.content?.$t || entry.summary?.$t || '';
      const parsed = parseHtmlToMedia(contentHtml, altLink);

      const rawTitle = cleanText(entry.title?.$t);
      if (rawTitle) {
        parsed.title = rawTitle
          .replace(/\s*[-|–]\s*(مشاهدة|تحميل|أون لاين|اون لاين|بجودة عالية|مترجم).*$/i, '')
          .trim()
          .slice(0, 200);
      }

      if (!parsed.poster && entry.media$thumbnail?.url) {
        parsed.poster = upgradeKnownImageUrlServer(entry.media$thumbnail.url);
        parsed.poster_url = parsed.poster;
        parsed.backdrop = '';
        parsed.backdrop_url = '';
        parsed.image_quality_status = 'missing_backdrop';
      }

      const categories: string[] = [];
      const genres: string[] = [];
      for (const cat of entry.category || []) {
        const term = cleanText(cat.term);
        if (!term) continue;
        if (term.startsWith('categories:')) categories.push(term.replace('categories:', '').trim());
        else if (term.startsWith('type:')) genres.push(term.replace('type:', '').trim());
        else if (term.startsWith('year:')) parsed.year = term.replace('year:', '').trim();
        else if (term.startsWith('quality:')) parsed.quality = term.replace('quality:', '').trim();
        else if (term.startsWith('country:')) parsed.country = term.replace('country:', '').trim();
        else if (term.startsWith('language:')) parsed.language = term.replace('language:', '').trim();
      }
      if (categories.length) parsed.categories = categories.slice(0, 8);
      if (genres.length) parsed.genres = genres.slice(0, 8);

      return parsed;
    });

    return { siteTitle, items };
  } catch {
    return null;
  }
}

async function tryWordPressApiScrape(
  origin: string,
  maxItems: number
): Promise<{ siteTitle: string; items: ScrapedMediaItem[] } | null> {
  try {
    const wpUrl = `${origin}/wp-json/wp/v2/posts?per_page=${Math.min(maxItems, 50)}&_embed`;
    const res = await fetchRemoteText(wpUrl, 10000);
    if (!res.ok || !res.text.trim().startsWith('[')) return null;

    const posts = JSON.parse(res.text) as {
      link?: string;
      title?: { rendered?: string };
      content?: { rendered?: string };
      excerpt?: { rendered?: string };
      _embedded?: {
        'wp:featuredmedia'?: { source_url?: string }[];
      };
    }[];

    if (!Array.isArray(posts) || posts.length === 0) return null;

    const items: ScrapedMediaItem[] = posts.slice(0, maxItems).map((post) => {
      const postUrl = post.link || origin;
      const htmlBody = `${post.content?.rendered || ''} ${post.excerpt?.rendered || ''}`;
      const parsed = parseHtmlToMedia(htmlBody, postUrl);
      const rawTitle = cleanText(cheerio.load(post.title?.rendered || '').text());
      if (rawTitle) parsed.title = rawTitle.slice(0, 200);
      const featured = post._embedded?.['wp:featuredmedia']?.[0]?.source_url;
      if (featured && !parsed.poster && !isJunkImageCandidate(featured)) {
        parsed.poster = upgradeKnownImageUrlServer(featured);
        parsed.poster_url = parsed.poster;
        parsed.backdrop = '';
        parsed.backdrop_url = '';
        parsed.image_quality_status = 'missing_backdrop';
      }
      return parsed;
    });

    return { siteTitle: new URL(origin).hostname, items };
  } catch {
    return null;
  }
}

async function trySitemapDiscovery(origin: string, maxItems: number): Promise<string[]> {
  const candidates = [`${origin}/sitemap.xml`, `${origin}/post-sitemap.xml`];
  const discovered: string[] = [];

  for (const smUrl of candidates) {
    try {
      const res = await fetchRemoteText(smUrl, 8000);
      if (!res.ok || !res.text.includes('<loc>')) continue;
      const $ = cheerio.load(res.text, { xmlMode: true });
      const nestedSitemaps: string[] = [];

      $('sitemap loc').each((_, el) => {
        const loc = cleanText($(el).text());
        if (loc && !loc.includes('page-sitemap') && !loc.includes('category-sitemap')) {
          nestedSitemaps.push(loc);
        }
      });

      $('url loc').each((_, el) => {
        const loc = cleanText($(el).text());
        if (loc && isLikelyContentUrl(loc, origin) && !discovered.includes(loc)) {
          discovered.push(loc);
        }
      });

      for (const childSm of nestedSitemaps.slice(0, 2)) {
        if (discovered.length >= maxItems) break;
        const subRes = await fetchRemoteText(childSm, 8000);
        if (!subRes.ok) continue;
        const $sub = cheerio.load(subRes.text, { xmlMode: true });
        $sub('url loc').each((_, el) => {
          const loc = cleanText($sub(el).text());
          if (loc && isLikelyContentUrl(loc, origin) && !discovered.includes(loc)) {
            discovered.push(loc);
          }
        });
      }

      if (discovered.length > 0) break;
    } catch {
      // Ignore sitemap fetch failure
    }
  }

  return discovered.slice(0, maxItems);
}

async function enrichScrapedMediaFromAdapter(
  baseMedia: BaselineScrapedMedia
): Promise<ScrapedMediaItem> {
  const full: ScrapedMediaItem = {
    ...baseMedia,
    poster_url: baseMedia.poster_url || baseMedia.poster || '',
    backdrop_url: baseMedia.backdrop_url || baseMedia.backdrop || '',
    votes: '10,500',
    poster_width: 0,
    poster_height: 0,
    backdrop_width: 0,
    backdrop_height: 0,
    image_source: baseMedia.poster ? 'scraped' : 'none',
    image_quality_status: (baseMedia.backdrop ? 'unknown' : 'missing_backdrop') as ServerImageQualityStatus,
    tagline: baseMedia.story?.slice(0, 140) || '',
    shortUrl: '',
    imdbId: baseMedia.imdbId || '',
  };

  const [fallbackTrailer, resolvedImages, resolvedRating] = await Promise.all([
    full.trailerUrl
      ? Promise.resolve(full.trailerUrl)
      : findYoutubeTrailerFallback(full.title, full.englishTitle, full.year, full.kind),
    resolveHighResImagesServer({
      title: full.title,
      englishTitle: full.englishTitle,
      year: full.year,
      kind: full.kind,
      imdbId: full.imdbId,
      currentPoster: full.poster,
      currentBackdrop: full.backdrop,
      preferOfficial: true,
    }),
    !full.imdb || full.imdb === 7.8
      ? resolveMediaRatingServer({
          title: full.title,
          englishTitle: full.englishTitle,
          year: full.year,
          kind: full.kind,
          imdbId: full.imdbId,
        })
      : Promise.resolve(null),
  ]);

  full.trailerUrl = fallbackTrailer || '';
  if (resolvedRating && resolvedRating.imdb > 0) {
    full.imdb = resolvedRating.imdb;
    if (!full.imdbId && resolvedRating.imdbId) {
      full.imdbId = resolvedRating.imdbId;
    }
    if (resolvedRating.votes) {
      full.votes = resolvedRating.votes;
    }
    if (
      (!full.year || full.year === '2026') &&
      resolvedRating.year &&
      /^(?:19|20)\d{2}$/.test(resolvedRating.year)
    ) {
      full.year = resolvedRating.year;
    }
  }
  if (resolvedImages) {
    if (resolvedImages.poster_url) {
      full.poster = resolvedImages.poster_url;
      full.poster_url = resolvedImages.poster_url;
    }
    full.poster_width = resolvedImages.poster_width;
    full.poster_height = resolvedImages.poster_height;
    full.backdrop = resolvedImages.backdrop_url;
    full.backdrop_url = resolvedImages.backdrop_url;
    full.backdrop_width = resolvedImages.backdrop_width;
    full.backdrop_height = resolvedImages.backdrop_height;
    full.image_source = resolvedImages.image_source;
    full.image_quality_status = resolvedImages.image_quality_status;
  }
  return full;
}

function extractListingWithOptionalAdapter(
  html: string,
  pageUrl: string,
  adapter: ScraperAdapter | null
) {
  const generic = extractListingLinksAndPagination(html, pageUrl);
  if (!adapter || !adapter.enabled) return generic;

  const cardSel = (adapter.navigationRules.listingCardSelector || '').trim();
  const linkSel = (adapter.navigationRules.listingLinkSelector || 'a[href]').trim();
  const pagSel = (adapter.navigationRules.paginationSelector || '').trim();
  if (!cardSel && !pagSel) return generic;

  try {
    const $ = cheerio.load(html);
    const baseOrigin = new URL(pageUrl).origin;
    const customCards = new Map<string, { url: string; title: string; poster: string }>();

    if (cardSel) {
      const targetSel = `${cardSel} ${linkSel}, ${cardSel} a[href]`;
      $(targetSel).each((_, el) => {
        if ($(el).closest('header, nav, footer, .navbar').length > 0) return;
        const href = resolveUrl(pageUrl, $(el).attr('href'));
        if (!href || !isLikelyContentUrl(href, [baseOrigin])) return;
        const cleanHref = href.split('#')[0];
        if (customCards.has(cleanHref)) return;
        const cardParent = $(el).closest(cardSel);
        let poster = '';
        cardParent
          .find('img')
          .add($(el).find('img'))
          .each((_, imgNode) => {
            if (poster) return;
            const candidate = extractBestImageFromElementServer($, $(imgNode), pageUrl);
            if (candidate) poster = candidate;
          });
        const cardTitle =
          cleanText($(el).attr('title')) ||
          cleanText(cardParent.find('h2, h3, h4, .title, .ellipsis').first().text()) ||
          cleanText($(el).text()) ||
          'عمل مستورد';
        customCards.set(cleanHref, {
          url: cleanHref,
          title: cardTitle.slice(0, 180),
          poster,
        });
      });
    }

    const customNextUrls: string[] = [];
    if (pagSel) {
      $(pagSel).each((_, el) => {
        const nextHref = resolveUrl(pageUrl, $(el).attr('href'));
        if (nextHref && nextHref.startsWith(baseOrigin) && nextHref !== pageUrl && !customNextUrls.includes(nextHref)) {
          customNextUrls.push(nextHref);
        }
      });
    }

    return {
      siteTitle: generic.siteTitle,
      cards: customCards.size > 0 ? Array.from(customCards.values()) : generic.cards,
      nextUrls: customNextUrls.length > 0 ? customNextUrls : generic.nextUrls,
    };
  } catch {
    return generic;
  }
}

async function startServer() {
  loadCachedAdaptersFromDisk();
  const app = express();
  app.use(express.json({ limit: '6mb' }));
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  const brandingUploadsDir = path.join(uploadsDir, 'branding');
  try {
    fs.mkdirSync(brandingUploadsDir, { recursive: true });
  } catch {
    // Ignore directory creation errors
  }
  app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return next();
  });

  // Smart Scraper Adapter Builder Endpoints
  app.get('/api/adapters', (_req, res) => {
    return res.json({ ok: true, adapters: getCachedAdapters() });
  });

  app.post('/api/adapters/sync', (req, res) => {
    try {
      const { adapters } = (req.body || {}) as { adapters?: unknown };
      if (!Array.isArray(adapters)) {
        return res.status(400).json({ ok: false, error: 'يجب إرسال مصفوفة adapters.' });
      }
      const synced = syncCachedAdapters(adapters as Partial<ScraperAdapter>[]);
      return res.json({ ok: true, count: synced.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطأ غير متوقع';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/api/adapters/analyze', async (req, res) => {
    try {
      const {
        url,
        rawHtml,
        contentTypeHint = 'auto',
        existingAdapters,
      } = (req.body || {}) as {
        url?: string;
        rawHtml?: string;
        contentTypeHint?: AdapterContentTypeHint;
        existingAdapters?: Partial<ScraperAdapter>[];
      };

      const cleanUrl = typeof url === 'string' ? url.trim() : '';
      const hasRawHtml = typeof rawHtml === 'string' && rawHtml.trim().length > 30;

      if (!cleanUrl && !hasRawHtml) {
        return res.status(400).json({ ok: false, error: 'يرجى إدخال رابط الموقع أو لصق كود HTML.' });
      }

      if (cleanUrl) {
        let parsed: URL;
        try {
          parsed = new URL(cleanUrl);
        } catch {
          return res.status(400).json({ ok: false, error: 'صيغة الرابط غير صالحة. يجب أن يبدأ بـ http:// أو https://' });
        }
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return res.status(400).json({ ok: false, error: 'البروتوكول المسموح HTTP أو HTTPS فقط.' });
        }
        if (isBlockedHostEnhanced(parsed.hostname)) {
          return res.status(403).json({ ok: false, error: 'لا يُسمح بفحص النطاقات الداخلية أو المحلية (SSRF guard).' });
        }
      }

      const pool = Array.isArray(existingAdapters)
        ? existingAdapters.map((a) => normalizeScraperAdapter(a))
        : getCachedAdapters();

      const report = await analyzeSiteStructure({
        url: cleanUrl,
        rawHtml: hasRawHtml ? rawHtml : undefined,
        contentTypeHint,
        existingAdapters: pool,
        baselineParseFn: parseHtmlToMediaWithHints,
      });

      return res.status(report.ok ? 200 : 502).json(report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطأ غير متوقع أثناء التحليل';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/api/adapters/test', async (req, res) => {
    try {
      const {
        url,
        rawHtml,
        adapter,
        previousAdapter,
        contentTypeHint,
      } = (req.body || {}) as {
        url?: string;
        rawHtml?: string;
        adapter?: Partial<ScraperAdapter>;
        previousAdapter?: Partial<ScraperAdapter> | null;
        contentTypeHint?: AdapterContentTypeHint;
      };

      const cleanUrl = typeof url === 'string' ? url.trim() : '';
      const hasRawHtml = typeof rawHtml === 'string' && rawHtml.trim().length > 30;
      if (!cleanUrl && !hasRawHtml) {
        return res.status(400).json({ ok: false, error: 'يرجى إدخال رابط الاختبار أو لصق كود HTML.' });
      }
      if (!adapter || typeof adapter !== 'object') {
        return res.status(400).json({ ok: false, error: 'بيانات الـ Adapter المرشح غير موجودة.' });
      }
      if (cleanUrl) {
        let parsed: URL;
        try {
          parsed = new URL(cleanUrl);
        } catch {
          return res.status(400).json({ ok: false, error: 'صيغة رابط الاختبار غير صحيحة.' });
        }
        if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHostEnhanced(parsed.hostname)) {
          return res.status(403).json({ ok: false, error: 'الرابط محظور لأسباب أمنية.' });
        }
      }

      const normalizedCandidate = normalizeScraperAdapter(adapter);
      const normalizedPrevious = previousAdapter ? normalizeScraperAdapter(previousAdapter) : null;

      const testResult = await testAdapterCandidate({
        url: cleanUrl || normalizedCandidate.sampleUrl || 'https://example.com',
        rawHtml: hasRawHtml ? rawHtml : undefined,
        adapter: normalizedCandidate,
        previousAdapter: normalizedPrevious,
        contentTypeHint: contentTypeHint || normalizedCandidate.contentTypeHint,
        baselineParseFn: parseHtmlToMediaWithHints,
        ajaxEmbedResolverFn: resolveAjaxEmbedsFromOrigins,
      });

      return res.json(testResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطأ غير متوقع أثناء الاختبار';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // Single Item Content Scraper Endpoint (URL or Raw HTML)
  app.post('/api/scrape', async (req, res) => {
    try {
      const { url, rawHtml, adapter } = req.body as {
        url?: string;
        rawHtml?: string;
        adapter?: Partial<ScraperAdapter>;
      };

      if (rawHtml && typeof rawHtml === 'string' && rawHtml.trim().length > 20) {
        const canonicalInHtml =
          rawHtml.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
          rawHtml.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
          '';
        const effectiveUrl = (url && url.trim()) || canonicalInHtml || '';
        const matchedAdapter = effectiveUrl ? resolveActiveAdapterForUrl(effectiveUrl, adapter) : null;
        if (matchedAdapter) {
          const adpRes = await executeAdapterScrape({
            url: effectiveUrl || matchedAdapter.sampleUrl || 'https://example.com',
            rawHtml,
            adapter: matchedAdapter,
            baselineParseFn: parseHtmlToMediaWithHints,
            ajaxEmbedResolverFn: resolveAjaxEmbedsFromOrigins,
            deepEpisodeCrawl: Boolean(effectiveUrl),
          });
          if (adpRes.ok) {
            const enriched = await enrichScrapedMediaFromAdapter(adpRes.media);
            return res.json({
              ok: true,
              source: 'html',
              extracted: enriched,
              adapterUsed: {
                id: matchedAdapter.id,
                name: matchedAdapter.name,
                version: matchedAdapter.version,
              },
            });
          }
        }
        const extracted = await scrapeFullItemWithSubpages(effectiveUrl, rawHtml);
        return res.json({ ok: true, source: 'html', extracted });
      }

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ ok: false, error: 'يرجى إدخال رابط صفحة صالح أو لصق كود HTML.' });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url.trim());
      } catch {
        return res.status(400).json({ ok: false, error: 'صيغة الرابط غير صحيحة. يجب أن يبدأ بـ https://' });
      }

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return res.status(400).json({ ok: false, error: 'البروتوكول المسموح هو HTTP أو HTTPS فقط.' });
      }

      if (isBlockedHost(parsedUrl.hostname) || isBlockedHostEnhanced(parsedUrl.hostname)) {
        return res.status(403).json({ ok: false, error: 'لا يُسمح بجلب الروابط الداخلية أو المحلية.' });
      }

      const matchedAdapter = resolveActiveAdapterForUrl(parsedUrl.toString(), adapter);
      if (matchedAdapter) {
        const adpRes = await executeAdapterScrape({
          url: parsedUrl.toString(),
          adapter: matchedAdapter,
          baselineParseFn: parseHtmlToMediaWithHints,
          ajaxEmbedResolverFn: resolveAjaxEmbedsFromOrigins,
          deepEpisodeCrawl: true,
        });
        if (adpRes.ok) {
          const enriched = await enrichScrapedMediaFromAdapter(adpRes.media);
          return res.json({
            ok: true,
            source: 'url',
            extracted: enriched,
            adapterUsed: {
              id: matchedAdapter.id,
              name: matchedAdapter.name,
              version: matchedAdapter.version,
            },
          });
        }
      }

      const fetched = await fetchRemoteText(parsedUrl.toString(), 12000);

      if (!fetched.ok) {
        return res.status(502).json({
          ok: false,
          error: `الموقع المصدر رفض الاتصال (رمز الحالة ${fetched.status}). يمكنك نسخ View-Source ولصقه في خانة HTML البديلة.`,
        });
      }

      if (!fetched.text || fetched.text.length < 100) {
        return res.status(502).json({
          ok: false,
          error: 'استجاب الموقع بصفحة فارغة. جرّب استخدام وضع لصق كود HTML.',
        });
      }

      const extracted = await scrapeFullItemWithSubpages(parsedUrl.toString(), fetched.text);
      return res.json({ ok: true, source: 'url', extracted });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطأ غير متوقع';
      return res.status(500).json({
        ok: false,
        error: `تعذر سحب الصفحة تلقائيًا (${msg}). جرّب لصق كود HTML للموقع المستهدف في التبويب المخصص.`,
      });
    }
  });

  // Site-Wide Bulk Crawler Endpoint (Entire Website Scraper)
  app.post('/api/scrape-site', async (req, res) => {
    try {
      const {
        siteUrl,
        rawHtml,
        maxItems = 30,
        maxPages = 3,
        deepScrape = true,
        adapter: explicitSiteAdapter,
      } = req.body as {
        siteUrl?: string;
        rawHtml?: string;
        maxItems?: number;
        maxPages?: number;
        deepScrape?: boolean;
        adapter?: Partial<ScraperAdapter>;
      };

      const itemLimit = Math.min(80, Math.max(1, Number(maxItems) || 30));
      const pageLimit = Math.min(8, Math.max(1, Number(maxPages) || 3));

      let parsedSiteUrl: URL | null = null;
      if (siteUrl && typeof siteUrl === 'string' && siteUrl.trim()) {
        try {
          parsedSiteUrl = new URL(siteUrl.trim());
        } catch {
          return res.status(400).json({ ok: false, error: 'رابط الموقع غير صالح. يجب أن يبدأ بـ https://' });
        }
        if (!['http:', 'https:'].includes(parsedSiteUrl.protocol)) {
          return res.status(400).json({ ok: false, error: 'البروتوكول المسموح هو HTTP أو HTTPS فقط.' });
        }
        if (isBlockedHost(parsedSiteUrl.hostname) || isBlockedHostEnhanced(parsedSiteUrl.hostname)) {
          return res.status(403).json({ ok: false, error: 'لا يُسمح بجلب الروابط الداخلية أو المحلية.' });
        }
      }

      if (!parsedSiteUrl && (!rawHtml || rawHtml.trim().length < 50)) {
        return res.status(400).json({
          ok: false,
          error: 'يرجى إدخال رابط الموقع المستهدف أو لصق سورس الصفحة الرئيسية.',
        });
      }

      const matchedSiteAdapter = parsedSiteUrl
        ? resolveActiveAdapterForUrl(parsedSiteUrl.toString(), explicitSiteAdapter)
        : explicitSiteAdapter
          ? normalizeScraperAdapter(explicitSiteAdapter)
          : null;

      // If URL mode (no rawHtml override) and no custom adapter overriding Blogger: try Blogger JSON Feed first
      if (parsedSiteUrl && (!rawHtml || rawHtml.trim().length < 50) && !matchedSiteAdapter) {
        const origin = parsedSiteUrl.origin;

        const bloggerRes = await tryBloggerFeedScrape(origin, itemLimit);
        if (bloggerRes && bloggerRes.items.length > 0) {
          return res.json({
            ok: true,
            strategy: 'Blogger JSON Feed',
            siteTitle: bloggerRes.siteTitle,
            totalDiscovered: bloggerRes.items.length,
            items: bloggerRes.items,
          });
        }
      }

      // General HTML Crawler (with Adapter selectors when available, multi-page pagination, or rawHtml)
      const discoveredMap = new Map<string, { url: string; title: string; poster: string }>();
      let siteTitle = parsedSiteUrl ? parsedSiteUrl.hostname : 'موقع مستورد';
      let strategy = matchedSiteAdapter
        ? `Adapter: ${matchedSiteAdapter.name} (v${matchedSiteAdapter.version})`
        : rawHtml
          ? 'HTML Source Crawler'
          : 'HTML Multi-Page Crawler';

      if (rawHtml && rawHtml.trim().length >= 50) {
        const baseForHtml = parsedSiteUrl ? parsedSiteUrl.toString() : 'https://example.com';
        const resHtml = extractListingWithOptionalAdapter(rawHtml, baseForHtml, matchedSiteAdapter);
        siteTitle = resHtml.siteTitle;
        for (const c of resHtml.cards) {
          if (discoveredMap.size < itemLimit) discoveredMap.set(c.url, c);
        }
      } else if (parsedSiteUrl) {
        const visitedPages = new Set<string>();
        const queue: string[] = [parsedSiteUrl.toString()];

        while (queue.length > 0 && visitedPages.size < pageLimit && discoveredMap.size < itemLimit) {
          const currentUrl = queue.shift()!;
          if (visitedPages.has(currentUrl)) continue;
          visitedPages.add(currentUrl);

          const pageRes = await fetchRemoteText(currentUrl, 12000).catch(() => null);
          if (!pageRes || !pageRes.ok || pageRes.text.length < 100) {
            if (visitedPages.size === 1) {
              // First page blocked: try WordPress API + Sitemap fallbacks before failing
              const wpFallback = await tryWordPressApiScrape(parsedSiteUrl.origin, itemLimit);
              if (wpFallback && wpFallback.items.length > 0) {
                if (deepScrape) {
                  const enrichedItems: ScrapedMediaItem[] = [];
                  for (let i = 0; i < wpFallback.items.length; i += 4) {
                    const chunk = wpFallback.items.slice(i, i + 4);
                    const updated = await Promise.all(
                      chunk.map(async (item) => {
                        const wpUrl = item.sourceUrl || '';
                        if (item.servers.length === 0 && wpUrl) {
                          try {
                            const detailRes = await fetchRemoteText(wpUrl, 9000);
                            if (detailRes.ok && detailRes.text.length > 150) {
                              const full = await scrapeFullItemWithSubpages(wpUrl, detailRes.text);
                              if (!full.poster && item.poster) {
                                full.poster = upgradeKnownImageUrlServer(item.poster);
                                full.poster_url = full.poster;
                                full.backdrop = '';
                                full.backdrop_url = '';
                                full.image_quality_status = 'missing_backdrop';
                              }
                              return full;
                            }
                          } catch {
                            // Keep WP API item if detail page fails
                          }
                        }
                        return item;
                      })
                    );
                    enrichedItems.push(...updated);
                  }
                  wpFallback.items = enrichedItems;
                }
                return res.json({
                  ok: true,
                  strategy: 'WordPress REST API + Deep Scrape',
                  siteTitle: wpFallback.siteTitle,
                  totalDiscovered: wpFallback.items.length,
                  items: wpFallback.items,
                });
              }

              const smUrls = await trySitemapDiscovery(parsedSiteUrl.origin, itemLimit);
              if (smUrls.length > 0) {
                strategy = 'XML Sitemap Crawler';
                for (const u of smUrls) {
                  discoveredMap.set(u, { url: u, title: decodeURIComponent(u.split('/').pop() || u), poster: '' });
                }
                break;
              }
              return res.status(502).json({
                ok: false,
                error: `رفض الموقع الوصول للصفحة الرئيسية (حماية أو رمز ${pageRes?.status || 'اتصال'}). انسخ سورس الصفحة الرئيسية (Ctrl+U) واستخدم وضع "لصق HTML الموقع".`,
              });
            }
            continue;
          }

          const extractedPage = extractListingWithOptionalAdapter(
            pageRes.text,
            currentUrl,
            matchedSiteAdapter
          );
          if (visitedPages.size === 1) siteTitle = extractedPage.siteTitle;

          for (const card of extractedPage.cards) {
            if (discoveredMap.size < itemLimit && !discoveredMap.has(card.url)) {
              discoveredMap.set(card.url, card);
            }
          }

          for (const nextUrl of extractedPage.nextUrls) {
            if (!visitedPages.has(nextUrl) && !queue.includes(nextUrl)) {
              queue.push(nextUrl);
            }
          }
        }

        if (discoveredMap.size === 0) {
          const wpFallback = await tryWordPressApiScrape(parsedSiteUrl.origin, itemLimit);
          if (wpFallback && wpFallback.items.length > 0) {
            return res.json({
              ok: true,
              strategy: 'WordPress REST API',
              siteTitle: wpFallback.siteTitle,
              totalDiscovered: wpFallback.items.length,
              items: wpFallback.items,
            });
          }

          const smUrls = await trySitemapDiscovery(parsedSiteUrl.origin, itemLimit);
          if (smUrls.length > 0) {
            strategy = 'XML Sitemap Crawler';
            for (const u of smUrls) {
              discoveredMap.set(u, { url: u, title: decodeURIComponent(u.split('/').pop() || u), poster: '' });
            }
          }
        }
      }

      const candidates = Array.from(discoveredMap.values()).slice(0, itemLimit);
      if (candidates.length === 0) {
        return res.status(404).json({
          ok: false,
          error: 'لم يتم العثور على بطاقات أفلام أو مسلسلات في الرابط المحدد. جرّب وضع رابط قسم الأفلام أو لصق HTML الصفحة.',
        });
      }

      const finalItems: ScrapedMediaItem[] = [];
      if (deepScrape) {
        const CONCURRENCY = matchedSiteAdapter ? 2 : 4;
        for (let i = 0; i < candidates.length; i += CONCURRENCY) {
          const chunk = candidates.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            chunk.map(async (card) => {
              try {
                if (matchedSiteAdapter) {
                  const adpRes = await executeAdapterScrape({
                    url: card.url,
                    adapter: matchedSiteAdapter,
                    baselineParseFn: parseHtmlToMediaWithHints,
                    ajaxEmbedResolverFn: resolveAjaxEmbedsFromOrigins,
                    deepEpisodeCrawl: true,
                    maxEpisodesForCrawl: 30,
                  });
                  if (adpRes.ok) {
                    const parsed = await enrichScrapedMediaFromAdapter(adpRes.media);
                    if (!parsed.poster && card.poster) {
                      parsed.poster = upgradeKnownImageUrlServer(card.poster);
                      parsed.poster_url = parsed.poster;
                      if (!parsed.backdrop_url) {
                        parsed.image_quality_status = 'missing_backdrop';
                      }
                    }
                    if ((!parsed.title || parsed.title === 'عمل مستورد جديد') && card.title) {
                      parsed.title = card.title;
                    }
                    return parsed;
                  }
                }
                const detailRes = await fetchRemoteText(card.url, 9000);
                if (detailRes.ok && detailRes.text.length > 150) {
                  const parsed = await scrapeFullItemWithSubpages(card.url, detailRes.text);
                  if (!parsed.poster && card.poster) {
                    parsed.poster = upgradeKnownImageUrlServer(card.poster);
                    parsed.poster_url = parsed.poster;
                    if (!parsed.backdrop_url) {
                      parsed.image_quality_status = 'missing_backdrop';
                    }
                  }
                  if ((!parsed.title || parsed.title === 'عمل مستورد جديد') && card.title) {
                    parsed.title = card.title;
                  }
                  return parsed;
                }
              } catch {
                // Fall back to card metadata if single detail page fails
              }
              const upgradedPoster = upgradeKnownImageUrlServer(card.poster);
              const inferredCardYear = inferEffectiveYear(card.title).year;
              const fallbackKind: ScrapedMediaItem['kind'] = /مسلسل|حلقات/.test(card.title)
                ? 'series'
                : 'movie';
              const cardRating = await resolveMediaRatingServer({
                title: card.title || '',
                englishTitle: extractCleanEnglishTitleCandidate(card.title || '') || card.title || '',
                year: inferredCardYear,
                kind: fallbackKind,
              }).catch(() => null);
              return {
                title: card.title || 'عمل مستورد',
                englishTitle: card.title || 'Imported Title',
                kind: fallbackKind,
                categories:
                  fallbackKind === 'series'
                    ? ['مسلسلات', /عربي|مصري/.test(card.title) ? 'مسلسلات عربية' : 'مسلسلات اجنبية']
                    : ['افلام', /عربي|مصري/.test(card.title) ? 'افلام عربية' : 'افلام اجنبية'],
                genres: ['دراما'],
                year: inferredCardYear || '2026',
                country: 'الولايات المتحدة',
                language: 'مترجم للعربية',
                quality: 'WEB-DL',
                duration: '120 دقيقة',
                imdb: cardRating?.imdb ?? 7.8,
                votes: cardRating?.votes || '10,000',
                poster: upgradedPoster,
                backdrop: '',
                poster_url: upgradedPoster,
                backdrop_url: '',
                poster_width: 0,
                poster_height: 0,
                backdrop_width: 0,
                backdrop_height: 0,
                image_source: 'card_fallback',
                image_quality_status: 'missing_backdrop' as ServerImageQualityStatus,
                tagline: card.title,
                story: card.title,
                sourceUrl: card.url,
                imdbId: cardRating?.imdbId || '',
                shortUrl: '',
                trailerUrl: '',
                cast: [],
                servers: [],
                downloads: [],
                seasons: [],
              };
            })
          );
          finalItems.push(...results);
        }
      } else {
        const FALLBACK_CONC = 5;
        for (let i = 0; i < candidates.length; i += FALLBACK_CONC) {
          const chunk = candidates.slice(i, i + FALLBACK_CONC);
          const resolvedChunk = await Promise.all(
            chunk.map(async (card) => {
              const upgradedPoster = upgradeKnownImageUrlServer(card.poster);
              const inferredCardYear = inferEffectiveYear(card.title).year;
              const fallbackKind: ScrapedMediaItem['kind'] = /مسلسل|حلقات/.test(card.title)
                ? 'series'
                : 'movie';
              const cardRating = await resolveMediaRatingServer({
                title: card.title || '',
                englishTitle: extractCleanEnglishTitleCandidate(card.title || '') || card.title || '',
                year: inferredCardYear,
                kind: fallbackKind,
              }).catch(() => null);
              return {
                title: card.title || 'عمل مستورد',
                englishTitle: card.title || 'Imported Title',
                kind: fallbackKind,
                categories:
                  fallbackKind === 'series'
                    ? ['مسلسلات', /عربي|مصري/.test(card.title) ? 'مسلسلات عربية' : 'مسلسلات اجنبية']
                    : ['افلام', /عربي|مصري/.test(card.title) ? 'افلام عربية' : 'افلام اجنبية'],
                genres: ['دراما'],
                year: inferredCardYear || '2026',
                country: 'الولايات المتحدة',
                language: 'مترجم للعربية',
                quality: 'WEB-DL',
                duration: '120 دقيقة',
                imdb: cardRating?.imdb ?? 7.8,
                votes: cardRating?.votes || '10,000',
                poster: upgradedPoster,
                backdrop: '',
                poster_url: upgradedPoster,
                backdrop_url: '',
                poster_width: 0,
                poster_height: 0,
                backdrop_width: 0,
                backdrop_height: 0,
                image_source: 'card_fallback',
                image_quality_status: 'missing_backdrop' as ServerImageQualityStatus,
                tagline: card.title,
                story: card.title,
                sourceUrl: card.url,
                imdbId: cardRating?.imdbId || '',
                shortUrl: '',
                trailerUrl: '',
                cast: [],
                servers: [],
                downloads: [],
                seasons: [],
              };
            })
          );
          finalItems.push(...resolvedChunk);
        }
      }

      return res.json({
        ok: true,
        strategy,
        siteTitle,
        totalDiscovered: finalItems.length,
        items: finalItems,
        ...(matchedSiteAdapter
          ? {
              adapterUsed: {
                id: matchedSiteAdapter.id,
                name: matchedSiteAdapter.name,
                version: matchedSiteAdapter.version,
              },
            }
          : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطأ غير متوقع';
      return res.status(500).json({
        ok: false,
        error: `حدث خطأ أثناء سحب الموقع (${msg}).`,
      });
    }
  });

  // Server Link Health Check Endpoint (Admin Dashboard Server Status)
  app.post('/api/check-servers', async (req, res) => {
    try {
      const { urls } = req.body as { urls?: unknown };
      if (!Array.isArray(urls)) {
        return res.status(400).json({ ok: false, error: 'يجب إرسال مصفوفة روابط (urls).' });
      }

      const uniqueUrls = Array.from(
        new Set(
          urls
            .map((u) => String(u || '').trim())
            .filter(Boolean)
            .slice(0, 40)
        )
      );

      interface CheckResult {
        status: 'working' | 'warning' | 'broken';
        httpStatus: number;
        label: string;
        detail: string;
        sandboxBlocked?: boolean;
      }

      const results: Record<string, CheckResult> = {};

      const checkSingleUrl = async (targetUrl: string): Promise<CheckResult> => {
        let parsed: URL;
        try {
          parsed = new URL(targetUrl);
        } catch {
          return {
            status: 'broken',
            httpStatus: 0,
            label: 'رابط غير صالح',
            detail: 'صيغة الرابط غير صحيحة',
          };
        }

        if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
          return {
            status: 'broken',
            httpStatus: 0,
            label: 'رابط محظور',
            detail: 'بروتوكول أو نطاق غير مسموح',
          };
        }

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6500);
          let response: Response;
          try {
            response = await fetch(parsed.toString(), {
              method: 'GET',
              redirect: 'follow',
              signal: controller.signal,
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                Accept: 'text/html,video/*,application/xhtml+xml,*/*;q=0.8',
                Range: 'bytes=0-16384',
              },
            });
          } finally {
            clearTimeout(timer);
          }

          const httpStatus = response.status;
          const contentType = (response.headers.get('content-type') || '').toLowerCase();
          const xFrame = (response.headers.get('x-frame-options') || '').toLowerCase();
          const csp = (response.headers.get('content-security-policy') || '').toLowerCase();
          const cfMitigated = (response.headers.get('cf-mitigated') || '').toLowerCase();

          let snippet = '';
          if (contentType.includes('text/html') || contentType.includes('text/plain') || !contentType) {
            try {
              const txt = await response.text();
              snippet = txt.slice(0, 16000);
            } catch {
              snippet = '';
            }
          }

          if (httpStatus === 404 || httpStatus === 410) {
            return {
              status: 'broken',
              httpStatus,
              label: `معطل (${httpStatus})`,
              detail: 'الصفحة أو الملف غير موجود (Not Found)',
            };
          }

          if (httpStatus >= 500) {
            return {
              status: 'broken',
              httpStatus,
              label: `معطل (${httpStatus})`,
              detail: 'خطأ داخلي من السيرفر المستضيف',
            };
          }

          if (!response.ok && httpStatus !== 206) {
            return {
              status: 'broken',
              httpStatus,
              label: `معطل (${httpStatus})`,
              detail:
                httpStatus === 403
                  ? 'تم رفض الوصول أو محمي (403)'
                  : `رمز حالة غير ناجح (${httpStatus})`,
            };
          }

          // Inspect HTML body for soft-404 / removed video pages
          if (
            snippet &&
            /file\s*(?:was|has been)?\s*(?:deleted|removed)|video\s*(?:was|has been)?\s*(?:deleted|removed|not found)|file\s*not\s*found|404\s*not\s*found|no\s*longer\s*available|تم\s*حذف\s*(?:الملف|الفيديو)|الفيديو\s*غير\s*موجود|الملف\s*غير\s*موجود/i.test(
              snippet
            )
          ) {
            return {
              status: 'broken',
              httpStatus: 404,
              label: 'معطل (404)',
              detail: 'الملف أو الفيديو محذوف أو غير موجود',
            };
          }

          return {
            status: 'working',
            httpStatus,
            label: `يعمل (${httpStatus})`,
            detail: contentType.includes('video')
              ? 'ملف بث مباشر يعمل بنجاح'
              : 'الرابط مستجيب ويعمل بنجاح',
          };
        } catch (err) {
          const isTimeout = err instanceof Error && err.name === 'AbortError';
          return {
            status: 'broken',
            httpStatus: 0,
            label: isTimeout ? 'معطل (مهلة انتهت)' : 'معطل (خطأ اتصال)',
            detail: isTimeout ? 'انتهت مهلة استجابة السيرفر' : 'تعذر الوصول إلى النطاق',
          };
        }
      };

      const CONCURRENCY = 6;
      for (let i = 0; i < uniqueUrls.length; i += CONCURRENCY) {
        const chunk = uniqueUrls.slice(i, i + CONCURRENCY);
        const checked = await Promise.all(chunk.map(async (u) => [u, await checkSingleUrl(u)] as const));
        for (const [u, result] of checked) {
          results[u] = result;
        }
      }

      return res.json({ ok: true, results });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطأ غير متوقع';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // Resolve Direct MP4/Video Stream or Detect Frame Block for Embed URLs
  app.get('/api/resolve-stream', async (req, res) => {
    try {
      const targetUrl = String(req.query.url || '').trim();
      if (!targetUrl) {
        return res.status(400).json({ ok: false, error: 'Missing url' });
      }
      let parsed: URL;
      try {
        parsed = new URL(targetUrl);
      } catch {
        return res.status(400).json({ ok: false, error: 'Invalid url' });
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
        return res.status(403).json({ ok: false, error: 'Blocked url' });
      }

      if (/\.(mp4|webm|ogg)(\?|$)/i.test(parsed.toString())) {
        return res.json({ ok: true, directUrl: parsed.toString(), kind: 'mp4', frameBlocked: false });
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      let response: Response;
      try {
        response = await fetch(parsed.toString(), {
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            Referer: parsed.origin + '/',
            Accept: 'text/html,application/xhtml+xml,*/*',
          },
        });
      } finally {
        clearTimeout(timer);
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('video/')) {
        return res.json({ ok: true, directUrl: response.url || parsed.toString(), kind: 'mp4', frameBlocked: false });
      }

      const xFrame = (response.headers.get('x-frame-options') || '').toLowerCase();
      const csp = (response.headers.get('content-security-policy') || '').toLowerCase();
      const html = await response.text();

      const frameBlocked =
        xFrame.includes('deny') ||
        xFrame.includes('sameorigin') ||
        /frame-ancestors\s+[^;]*'none'|frame-ancestors\s+'self'/.test(csp) ||
        /sandboxed\s+embed\s+is\s+not\s+allowed/i.test(html);

      // Try extracting direct MP4 source from embed HTML
      const mp4Match =
        html.match(/<(?:video|source)[^>]+src=["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i) ||
        html.match(/(?:file|src|video_url|mp4_url)\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i) ||
        html.match(/["'](https?:\/\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?)["']/i);

      if (mp4Match?.[1]) {
        return res.json({
          ok: true,
          directUrl: mp4Match[1].replace(/\\\//g, '/'),
          kind: 'mp4',
          frameBlocked,
        });
      }

      return res.json({ ok: true, directUrl: null, frameBlocked });
    } catch {
      return res.json({ ok: true, directUrl: null, frameBlocked: false });
    }
  });

  // Automatic Official Trailer Lookup Endpoint
  app.post('/api/find-trailer', async (req, res) => {
    try {
      const { title = '', englishTitle = '', year = '', kind = 'movie' } = req.body as {
        title?: string;
        englishTitle?: string;
        year?: string;
        kind?: 'movie' | 'series' | 'tv' | 'wrestling';
      };
      const trailerUrl = await findYoutubeTrailerFallback(title, englishTitle, year, kind);
      return res.json({ ok: true, trailerUrl });
    } catch {
      return res.json({ ok: false, trailerUrl: '' });
    }
  });

  // Auto Server Filtering Endpoint (detects 403, Sandboxed embed, 404, X-Frame-Options/CSP blocks, and website homepages)
  app.post('/api/filter-servers', async (req, res) => {
    try {
      const { urls } = req.body as { urls?: unknown };
      if (!Array.isArray(urls)) {
        return res.status(400).json({ ok: false, error: 'يجب إرسال قائمة الروابط (urls).' });
      }

      const targetUrls = urls.map((u) => String(u || '').trim()).slice(0, 60);

      interface FilterCheckResult {
        url: string;
        ok: boolean;
        faultType: '403' | 'sandboxed_embed' | '404' | 'frame_blocked' | 'not_video' | 'error' | null;
        httpStatus: number;
        reason: string;
        directStreamUrl?: string | null;
      }

      const inspectServerUrl = async (rawUrl: string): Promise<FilterCheckResult> => {
        if (!rawUrl) {
          return {
            url: rawUrl,
            ok: false,
            faultType: 'error',
            httpStatus: 0,
            reason: 'لا يوجد رابط تشغيل',
          };
        }

        let parsed: URL;
        try {
          parsed = new URL(rawUrl);
        } catch {
          return {
            url: rawUrl,
            ok: false,
            faultType: 'error',
            httpStatus: 0,
            reason: 'صيغة الرابط غير صالحة',
          };
        }

        if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
          return {
            url: rawUrl,
            ok: false,
            faultType: 'error',
            httpStatus: 0,
            reason: 'رابط غير مسموح به',
          };
        }

        if (isLikelyNonVideoWebsiteUrl(parsed.toString())) {
          return {
            url: rawUrl,
            ok: false,
            faultType: 'not_video',
            httpStatus: 200,
            reason: 'الرابط يفتح صفحة موقع وليس مشغل فيديو',
          };
        }

        const isDirectMedia = /\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(parsed.toString());
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5500);

        try {
          const response = await fetch(parsed.toString(), {
            method: isDirectMedia ? 'HEAD' : 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
              Referer: parsed.origin + '/',
              Accept: 'text/html,video/*,application/xhtml+xml,*/*;q=0.8',
              ...(isDirectMedia ? {} : { Range: 'bytes=0-32768' }),
            },
          });

          const finalUrl = response.url || parsed.toString();
          const httpStatus = response.status;
          const contentType = (response.headers.get('content-type') || '').toLowerCase();
          const xFrame = (response.headers.get('x-frame-options') || '').toLowerCase();
          const csp = (response.headers.get('content-security-policy') || '').toLowerCase();
          const cfMitigated = (response.headers.get('cf-mitigated') || '').toLowerCase();

          let snippet = '';
          if (!isDirectMedia && (contentType.includes('text/html') || contentType.includes('text/plain') || !contentType)) {
            try {
              const txt = await response.text();
              snippet = txt.slice(0, 32768);
            } catch {
              snippet = '';
            }
          }

          // 0. Detect non-video website homepages / redirects (e.g. larooza.tv/, laroza1.bond/home.24)
          if (!isDirectMedia && isWebsiteHomepageHtml(finalUrl, snippet)) {
            return {
              url: rawUrl,
              ok: false,
              faultType: 'not_video',
              httpStatus,
              reason: 'الرابط يفتح الصفحة الرئيسية لموقع وليس فيديو',
            };
          }

          // 1. Detect Sandboxed embed messages explicitly
          const hasSandboxedMsg =
            /sandboxed\s+embed\s+is\s+not\s+allowed|sandboxed\s+embed|please\s+disable\s+sandbox|embedding\s+in\s+sandbox\s+is\s+not\s+allowed/i.test(
              snippet
            );

          if (hasSandboxedMsg) {
            const mp4Fallback =
              snippet.match(/<(?:video|source)[^>]+src=["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i)?.[1] ||
              snippet.match(/(?:file|src|video_url|mp4_url)\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i)?.[1];
            if (mp4Fallback) {
              return {
                url: rawUrl,
                ok: true,
                faultType: null,
                httpStatus,
                reason: 'تم استخراج البث المباشر بنجاح',
                directStreamUrl: mp4Fallback.replace(/\\\//g, '/'),
              };
            }
            return {
              url: rawUrl,
              ok: false,
              faultType: 'sandboxed_embed',
              httpStatus,
              reason: 'رسالة Sandboxed embed (يمنع التشغيل المدمج)',
            };
          }

          // 2. Detect HTTP 403 Forbidden / Cloudflare block
          const is403Body =
            httpStatus === 403 ||
            cfMitigated === 'challenge' ||
            (snippet &&
              /<title>\s*(?:403\s+Forbidden|Access\s+Denied|Just\s+a\s+moment|Attention\s+Required)/i.test(snippet));

          if (is403Body) {
            return {
              url: rawUrl,
              ok: false,
              faultType: '403',
              httpStatus: httpStatus === 200 ? 403 : httpStatus,
              reason: 'خطأ 403 (رفض الوصول من السيرفر)',
            };
          }

          // 3. Detect 404 / Soft-404
          const is404Body =
            httpStatus === 404 ||
            httpStatus === 410 ||
            (snippet &&
              /file\s*(?:was|has been)?\s*(?:deleted|removed)|video\s*(?:was|has been)?\s*(?:deleted|removed|not found)|file\s*not\s*found|404\s*not\s*found|no\s*longer\s*available|تم\s*حذف\s*(?:الملف|الفيديو)|الفيديو\s*غير\s*موجود/i.test(
                snippet
              ));

          if (is404Body) {
            return {
              url: rawUrl,
              ok: false,
              faultType: '404',
              httpStatus: 404,
              reason: 'الملف غير موجود (404)',
            };
          }

          if (!response.ok && httpStatus !== 206) {
            return {
              url: rawUrl,
              ok: false,
              faultType: 'error',
              httpStatus,
              reason: `عطل في استجابة السيرفر (${httpStatus})`,
            };
          }

          // 4. Detect Frame Blocking headers (X-Frame-Options / CSP frame-ancestors)
          const frameBlocked =
            xFrame.includes('deny') ||
            xFrame.includes('sameorigin') ||
            /frame-ancestors\s+[^;]*'none'|frame-ancestors\s+'self'/.test(csp);

          const mp4Fallback = snippet
            ? snippet.match(/<(?:video|source)[^>]+src=["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i)?.[1] ||
              snippet.match(/(?:file|src|video_url|mp4_url)\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i)?.[1]
            : null;

          if (frameBlocked) {
            if (mp4Fallback) {
              return {
                url: rawUrl,
                ok: true,
                faultType: null,
                httpStatus,
                reason: 'بث مباشر متاح',
                directStreamUrl: mp4Fallback.replace(/\\\//g, '/'),
              };
            }
            return {
              url: rawUrl,
              ok: false,
              faultType: 'frame_blocked',
              httpStatus,
              reason: 'السيرفر يمنع التضمين المدمج (X-Frame)',
            };
          }

          return {
            url: rawUrl,
            ok: true,
            faultType: null,
            httpStatus,
            reason: 'السيرفر يعمل بنجاح',
            directStreamUrl: mp4Fallback ? mp4Fallback.replace(/\\\//g, '/') : null,
          };
        } catch (err) {
          const isTimeout = err instanceof Error && err.name === 'AbortError';
          return {
            url: rawUrl,
            ok: false,
            faultType: 'error',
            httpStatus: 0,
            reason: isTimeout ? 'انتهت مهلة استجابة السيرفر' : 'تعذر الاتصال بالسيرفر',
          };
        } finally {
          clearTimeout(timer);
        }
      };

      const checked = await Promise.all(targetUrls.map((u) => inspectServerUrl(u)));
      return res.json({ ok: true, results: checked });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطأ غير متوقع';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // Smart Popup Shield Probe Endpoint (inspects embed headers, anti-sandbox JS checks, ad/popunder scripts, and direct streams)
  app.post('/api/shield-probe', async (req, res) => {
    try {
      const { url } = (req.body || {}) as { url?: unknown };
      const rawUrl = String(url || '').trim();
      const testedAt = new Date().toISOString();

      if (!rawUrl) {
        return res.status(400).json({ ok: false, error: 'يجب إرسال رابط السيرفر (url).' });
      }

      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return res.status(400).json({ ok: false, error: 'صيغة الرابط غير صالحة.' });
      }

      const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
        return res.status(400).json({ ok: false, error: 'رابط غير مسموح به للفحص.' });
      }

      const isDirectMedia = /\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(parsed.toString());
      if (isDirectMedia) {
        return res.json({
          ok: true,
          inspection: {
            hostname,
            url: rawUrl,
            reachable: true,
            compatibility: 'compatible',
            recommendedMode: 'direct_media',
            antiSandboxDetected: false,
            adScriptDetected: false,
            adSignals: [],
            directStreamUrl: rawUrl,
            reason: 'رابط فيديو مباشر (.mp4 / .m3u8) لا يحتاج iframe ولا يفتح نوافذ إعلانية.',
            testedAt,
          },
        });
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6500);

      try {
        const response = await fetch(parsed.toString(), {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            Referer: parsed.origin + '/',
            Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
            Range: 'bytes=0-49152',
          },
        });

        const finalUrl = response.url || parsed.toString();
        const xFrame = (response.headers.get('x-frame-options') || '').toLowerCase();
        const csp = (response.headers.get('content-security-policy') || '').toLowerCase();
        const contentType = (response.headers.get('content-type') || '').toLowerCase();

        let html = '';
        if (contentType.includes('text/html') || contentType.includes('text/plain') || !contentType) {
          try {
            html = (await response.text()).slice(0, 49152);
          } catch {
            html = '';
          }
        }

        const adSignals: string[] = [];
        const matchers: Array<{ label: string; rx: RegExp }> = [
          { label: 'popads', rx: /popads\.net|popads/i },
          { label: 'popcash', rx: /popcash\.net|popcash/i },
          { label: 'adsterra', rx: /adsterra|highcpmgate|profitablecpmrate/i },
          { label: 'propellerads / monetag', rx: /propellerads|monetag|aclib/i },
          { label: 'clickadu / hilltopads', rx: /clickadu|hilltopads|admaven/i },
          { label: 'window.open', rx: /window\.open\s*\(/i },
          { label: 'target=_blank', rx: /target\s*=\s*["']_blank["']/i },
          { label: 'popunder', rx: /popunder|openPop|triggerPop/i },
        ];
        for (const m of matchers) {
          if (m.rx.test(html)) adSignals.push(m.label);
        }

        const antiSandboxDetected =
          /sandboxed\s+embed|please\s+disable\s+sandbox|embedding\s+in\s+sandbox\s+is\s+not\s+allowed|no[-_\s]?sandbox/i.test(
            html
          ) ||
          /window\.frameElement|top\s*!==?\s*self|self\s*!==?\s*top|top\.location\s*!=\s*self\.location/i.test(
            html
          );

        const knownNoSandbox =
          /(vidmoly|dood|ds2play|do0od|streamwish|wishfast|filemoon|streamtape|voe|earnvids|mixdrop|vidhide|luluvdo|lulustream|filelions|rpmshare|upns)/i.test(
            hostname
          );
        const knownRedirectGuard = /(vidsrc|2embed|superembed|megacloud|rabbitstream|dokicloud|fembed|sendvid)/i.test(
          hostname
        );

        const mp4Match = html
          ? html.match(/<(?:video|source)[^>]+src=["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i)?.[1] ||
            html.match(/(?:file|src|video_url|mp4_url)\s*:\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i)?.[1] ||
            null
          : null;

        const frameBlocked =
          xFrame.includes('deny') ||
          xFrame.includes('sameorigin') ||
          /frame-ancestors\s+[^;]*'none'|frame-ancestors\s+'self'/i.test(csp);

        if (isWebsiteHomepageHtml(finalUrl, html)) {
          return res.json({
            ok: true,
            inspection: {
              hostname,
              url: rawUrl,
              reachable: true,
              compatibility: 'incompatible',
              recommendedMode: 'direct_unrestricted',
              antiSandboxDetected: true,
              adScriptDetected: adSignals.length > 0,
              adSignals,
              reason: 'الرابط يفتح صفحة موقع رئيسية وليس مشغلاً فعلياً.',
              testedAt,
            },
          });
        }

        if (mp4Match) {
          return res.json({
            ok: true,
            inspection: {
              hostname,
              url: rawUrl,
              reachable: response.ok,
              compatibility: 'compatible',
              recommendedMode: 'direct_media',
              antiSandboxDetected,
              adScriptDetected: adSignals.length > 0,
              adSignals,
              directStreamUrl: mp4Match.replace(/\\\//g, '/'),
              reason: 'تم العثور على رابط بث مباشر داخل السيرفر (بدون نوافذ منبثقة).',
              testedAt,
            },
          });
        }

        if (frameBlocked || antiSandboxDetected || knownNoSandbox) {
          return res.json({
            ok: true,
            inspection: {
              hostname,
              url: rawUrl,
              reachable: response.status > 0,
              compatibility: 'incompatible',
              recommendedMode: 'direct_unrestricted',
              antiSandboxDetected: true,
              adScriptDetected: adSignals.length > 0,
              adSignals,
              reason: frameBlocked
                ? 'السيرفر يرسل قيود X-Frame-Options أو CSP قد تمنع التشغيل المقيد.'
                : antiSandboxDetected
                  ? 'تم رصد فحص رفض Sandbox داخل مصدر السيرفر — يُنصح بوضع التوافق المباشر لعدم إيقاف الفيديو.'
                  : 'هذا النطاق معروف برفضه لـ iframe sandbox — يُنصح بالتشغيل المباشر للحفاظ على الفيديو.',
              testedAt,
            },
          });
        }

        if (knownRedirectGuard) {
          return res.json({
            ok: true,
            inspection: {
              hostname,
              url: rawUrl,
              reachable: response.ok,
              compatibility: 'partial',
              recommendedMode: 'redirect_guard',
              antiSandboxDetected: false,
              adScriptDetected: adSignals.length > 0,
              adSignals,
              reason: 'متوافق جزئياً مع وضع منع تحويل الصفحة الرئيسية (redirect_guard).',
              testedAt,
            },
          });
        }

        return res.json({
          ok: true,
          inspection: {
            hostname,
            url: rawUrl,
            reachable: response.ok,
            compatibility: 'compatible',
            recommendedMode: 'strict_sandbox',
            antiSandboxDetected: false,
            adScriptDetected: adSignals.length > 0,
            adSignals,
            reason:
              adSignals.length > 0
                ? `تم رصد إشارات نوافذ منبثقة (${adSignals.slice(0, 3).join('، ')}) ولم يُرصد رفض لـ Sandbox — مناسب للحماية الصارمة.`
                : 'السيرفر متوافق مع العزل الصارم (strict_sandbox) بدون مؤشرات تعطيل.',
            testedAt,
          },
        });
      } catch {
        const knownNoSandbox =
          /(vidmoly|dood|ds2play|do0od|streamwish|wishfast|filemoon|streamtape|voe|earnvids|mixdrop|vidhide|luluvdo|lulustream|filelions|rpmshare|upns)/i.test(
            hostname
          );
        return res.json({
          ok: true,
          inspection: {
            hostname,
            url: rawUrl,
            reachable: false,
            compatibility: knownNoSandbox ? 'incompatible' : 'untested',
            recommendedMode: knownNoSandbox ? 'direct_unrestricted' : 'strict_sandbox',
            antiSandboxDetected: knownNoSandbox,
            adScriptDetected: false,
            adSignals: [],
            reason: knownNoSandbox
              ? 'تعذر الجلب المباشر، وتم اعتماد قاعدة التوافق المباشر المعروفة لهذا السيرفر.'
              : 'تعذر الوصول إلى استجابة HTML كاملة من السيرفر — يتم تطبيق وضع الاختبار الآمن.',
            testedAt,
          },
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطأ غير متوقع';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // Measure real pixel dimensions of candidate image URLs server-side
  app.post('/api/images/probe', async (req, res) => {
    try {
      const { urls } = (req.body || {}) as { urls?: unknown };
      if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ ok: false, error: 'urls array required' });
      }
      const uniqueUrls = Array.from(
        new Set(urls.map((u) => String(u || '').trim()).filter((u) => /^https?:\/\//i.test(u)))
      ).slice(0, 25);
      const probed = await Promise.all(
        uniqueUrls.map(async (u) => {
          const upgraded = upgradeKnownImageUrlServer(u);
          const origResult = await probeRemoteImageDimensions(u);
          const upgradedResult =
            upgraded !== u ? await probeRemoteImageDimensions(upgraded) : origResult;
          const best =
            upgradedResult.ok && upgradedResult.width >= origResult.width ? upgradedResult : origResult;
          return [u, { ...best, upgradedUrl: upgraded }] as const;
        })
      );
      return res.json({ ok: true, results: Object.fromEntries(probed) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Probe failed';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // Resolve independent high-res 2:3 Portrait Poster & 16:9 Landscape Backdrop (server-side TMDB + IMDb + Cinemeta + Wikidata + dimension verification)
  app.post('/api/images/resolve', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        title?: string;
        englishTitle?: string;
        year?: string;
        kind?: string;
        imdbId?: string;
        currentPoster?: string;
        currentBackdrop?: string;
        preferOfficial?: boolean;
      };
      if (!body.title && !body.englishTitle && !body.currentPoster && !body.imdbId) {
        return res.status(400).json({ ok: false, error: 'title or currentPoster required' });
      }
      const result = await resolveHighResImagesServer({
        title: String(body.title || ''),
        englishTitle: String(body.englishTitle || ''),
        year: String(body.year || ''),
        kind: String(body.kind || 'movie'),
        imdbId: String(body.imdbId || ''),
        currentPoster: String(body.currentPoster || ''),
        currentBackdrop: String(body.currentBackdrop || ''),
        preferOfficial: Boolean(body.preferOfficial),
      });
      return res.json({ ok: true, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Image resolution failed';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/api/ratings/resolve', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        items?: ServerRatingLookupInput[];
        id?: string;
        title?: string;
        englishTitle?: string;
        year?: string;
        kind?: string;
        imdbId?: string;
      };

      if (Array.isArray(body.items)) {
        const batch = body.items.slice(0, 40);
        const results: Record<string, ServerResolvedMediaRating | null> = {};
        const CONCURRENCY = 5;
        for (let i = 0; i < batch.length; i += CONCURRENCY) {
          const chunk = batch.slice(i, i + CONCURRENCY);
          const resolvedChunk = await Promise.all(
            chunk.map(async (it, idx) => {
              const key = String(it?.id || `idx_${i + idx}`);
              if (!it || (!it.title && !it.englishTitle && !it.imdbId)) {
                return { key, res: null };
              }
              const r = await resolveMediaRatingServer({
                id: key,
                title: String(it.title || ''),
                englishTitle: String(it.englishTitle || ''),
                year: String(it.year || ''),
                kind: String(it.kind || 'movie'),
                imdbId: String(it.imdbId || ''),
              }).catch(() => null);
              return { key, res: r };
            })
          );
          for (const entry of resolvedChunk) {
            results[entry.key] = entry.res;
          }
        }
        return res.json({ ok: true, results });
      }

      if (!body.title && !body.englishTitle && !body.imdbId) {
        return res.status(400).json({ ok: false, error: 'title, englishTitle, or imdbId required' });
      }

      const result = await resolveMediaRatingServer({
        id: body.id ? String(body.id) : undefined,
        title: String(body.title || ''),
        englishTitle: String(body.englishTitle || ''),
        year: String(body.year || ''),
        kind: String(body.kind || 'movie'),
        imdbId: String(body.imdbId || ''),
      });
      return res.json({ ok: true, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rating resolution failed';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/api/client-logs', (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const level = body.level === 'warn' || body.level === 'fatal' ? body.level : 'error';
      const record = {
        tag: 'RAHALTV_CLIENT_LOG',
        level,
        timestamp: new Date().toISOString(),
        source: String(body.source || 'window').slice(0, 80),
        message: String(body.message || 'Unknown frontend error').slice(0, 600),
        stack: String(body.stack || '').slice(0, 1500),
        route: String(body.route || '/').slice(0, 250),
        host: String(body.host || '').slice(0, 120),
        release: String(body.release || 'web').slice(0, 60),
      };
      if (level === 'warn') {
        console.warn(JSON.stringify(record));
      } else {
        console.error(JSON.stringify(record));
      }
      return res.status(202).json({ ok: true, logged: true });
    } catch {
      return res.status(400).json({ ok: false });
    }
  });

  // Database Connection Manager: Authenticated Server Secret Vault & Endpoint Probe
  app.get('/api/db/secrets/status', verifyOwnerAdminMiddleware, (_req, res) => {
    return res.json({
      ok: true,
      source: 'node_vault',
      statuses: getMaskedSecretStatuses(),
    });
  });

  app.post('/api/db/secrets', verifyOwnerAdminMiddleware, (req, res) => {
    try {
      const adminAuth = (req as express.Request & { adminAuth?: VerifiedAdminContext }).adminAuth;
      const body = (req.body || {}) as {
        connectionId?: string;
        serviceAccountJson?: string;
        privateKey?: string;
        apiSecret?: string;
        cloudflareToken?: string;
      };
      if (!body.connectionId) {
        return res.status(400).json({ ok: false, error: 'معرّف الاتصال connectionId مطلوب.' });
      }
      const status = upsertSecretRecord({
        connectionId: String(body.connectionId),
        serviceAccountJson: body.serviceAccountJson,
        privateKey: body.privateKey,
        apiSecret: body.apiSecret,
        cloudflareToken: body.cloudflareToken,
        updatedBy: adminAuth?.email || adminAuth?.uid || 'owner',
      });
      return res.json({ ok: true, status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر حفظ المفاتيح السرية.';
      return res.status(400).json({ ok: false, error: msg });
    }
  });

  app.delete('/api/db/secrets/:connectionId', verifyOwnerAdminMiddleware, (req, res) => {
    const deleted = deleteSecretRecord(String(req.params.connectionId || ''));
    return res.json({ ok: true, deleted });
  });

  app.post('/api/db/test-endpoint', verifyOwnerAdminMiddleware, async (req, res) => {
    const { url } = (req.body || {}) as { url?: string };
    const cleanUrl = typeof url === 'string' ? url.trim() : '';
    if (!cleanUrl) {
      return res.status(400).json({ ok: false, error: 'يرجى تحديد رابط الفحص.' });
    }
    let parsed: URL;
    try {
      parsed = new URL(cleanUrl);
    } catch {
      return res.status(400).json({ ok: false, error: 'صيغة الرابط غير صالحة.' });
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHostEnhanced(parsed.hostname)) {
      return res.status(403).json({ ok: false, error: 'نطاق غير مسموح به (SSRF guard).' });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const start = Date.now();
    try {
      const upstream = await fetch(parsed.toString(), {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.json({
        ok: upstream.ok,
        status: upstream.status,
        latencyMs: Date.now() - start,
      });
    } catch (err) {
      clearTimeout(timer);
      return res.status(502).json({
        ok: false,
        error: err instanceof Error ? err.message : 'تعذر الوصول إلى النقطة.',
        latencyMs: Date.now() - start,
      });
    }
  });

  async function verifyBrandingAuthHeader(authHeader: string): Promise<{ uid: string } | null> {
    const match = String(authHeader || '').match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) return null;
    const idToken = match[1].trim();
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    let apiKey = '';
    try {
      if (fs.existsSync(cfgPath)) {
        const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { apiKey?: string };
        apiKey = String(parsed.apiKey || '').trim();
      }
    } catch {
      apiKey = '';
    }
    if (!apiKey) return null;
    try {
      const lookupResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );
      if (!lookupResp.ok) return null;
      const data = (await lookupResp.json()) as {
        users?: Array<{ localId?: string }>;
      };
      const uid = data.users?.[0]?.localId;
      return uid ? { uid } : null;
    } catch {
      return null;
    }
  }

  app.post('/api/branding/upload', async (req, res) => {
    try {
      const authCtx = await verifyBrandingAuthHeader(req.headers.authorization || '');
      if (!authCtx) {
        return res.status(401).json({ ok: false, error: 'مطلوب تسجيل الدخول لرفع ملفات الهوية.' });
      }
      const body = (req.body || {}) as {
        kind?: unknown;
        dataUrl?: unknown;
        extension?: unknown;
      };
      const kind = body.kind === 'favicon' ? 'favicon' : body.kind === 'logo' ? 'logo' : '';
      if (!kind) {
        return res.status(400).json({ ok: false, error: 'نوع الملف (kind) غير صالح.' });
      }
      const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl.trim() : '';
      const match = dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) {
        return res.status(400).json({ ok: false, error: 'صيغة بيانات الملف غير صالحة.' });
      }
      const mime = match[1].toLowerCase();
      const base64Data = match[2];
      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: 'حجم الملف يجب ألا يتجاوز 2 ميغابايت.' });
      }

      const allowedExts: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'image/x-icon': 'ico',
        'image/vnd.microsoft.icon': 'ico',
      };
      const ext = allowedExts[mime];
      if (!ext) {
        return res.status(400).json({ ok: false, error: 'صيغة الصورة غير مدعومة.' });
      }
      if (kind === 'favicon' && !['png', 'ico', 'svg'].includes(ext)) {
        return res.status(400).json({ ok: false, error: 'Favicon يدعم PNG و ICO و SVG فقط.' });
      }

      let writeBuf = buffer;
      if (ext === 'svg') {
        const cleanSvg = buffer
          .toString('utf8')
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
          .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
          .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
          .replace(/javascript\s*:/gi, '');
        if (!/<svg[\s>]/i.test(cleanSvg)) {
          return res.status(400).json({ ok: false, error: 'ملف SVG غير صالح.' });
        }
        writeBuf = Buffer.from(cleanSvg, 'utf8');
      }

      fs.mkdirSync(brandingUploadsDir, { recursive: true });
      const fileName = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const targetPath = path.join(brandingUploadsDir, fileName);
      fs.writeFileSync(targetPath, writeBuf);
      return res.json({
        ok: true,
        url: `/uploads/branding/${fileName}`,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'تعذر حفظ ملف الهوية.',
      });
    }
  });

  app.delete('/api/branding/asset', async (req, res) => {
    try {
      const authCtx = await verifyBrandingAuthHeader(req.headers.authorization || '');
      if (!authCtx) {
        return res.status(401).json({ ok: false, error: 'مطلوب مصادقة المسؤول.' });
      }
      const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      if (!rawUrl.startsWith('/uploads/branding/')) {
        return res.json({ ok: true, deleted: false });
      }
      const baseName = path.basename(rawUrl);
      if (!/^[a-zA-Z0-9_.-]+$/.test(baseName)) {
        return res.status(400).json({ ok: false, error: 'اسم الملف غير صالح.' });
      }
      const targetPath = path.resolve(brandingUploadsDir, baseName);
      if (!targetPath.startsWith(brandingUploadsDir + path.sep)) {
        return res.status(403).json({ ok: false, error: 'مسار غير مسموح به.' });
      }
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
        return res.json({ ok: true, deleted: true });
      }
      return res.json({ ok: true, deleted: false });
    } catch {
      return res.status(500).json({ ok: false, error: 'تعذر حذف الملف.' });
    }
  });

  app.post('/api/images/upload', async (req, res) => {
    try {
      const authCtx = await verifyBrandingAuthHeader(req.headers.authorization || '');
      if (!authCtx) {
        return res.status(401).json({ ok: false, error: 'مطلوب تسجيل الدخول لرفع الصور.' });
      }
      const body = (req.body || {}) as {
        slot?: unknown;
        dataUrl?: unknown;
      };
      const allowedSlots = new Set([
        'poster',
        'backdrop',
        'cast',
        'placeholder',
        'fallback',
        'logo',
        'favicon',
      ]);
      const rawSlot = typeof body.slot === 'string' ? body.slot.trim() : 'poster';
      const slot = allowedSlots.has(rawSlot) ? rawSlot : 'poster';

      const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl.trim() : '';
      const match = dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) {
        return res.status(400).json({ ok: false, error: 'صيغة بيانات الصورة غير صالحة.' });
      }

      const mime = match[1].toLowerCase();
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: 'حجم الصورة يجب ألا يتجاوز 2 ميغابايت.' });
      }

      const allowedExts: Record<string, string> = {
        'image/avif': 'avif',
        'image/webp': 'webp',
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/svg+xml': 'svg',
        'image/x-icon': 'ico',
        'image/vnd.microsoft.icon': 'ico',
      };
      const ext = allowedExts[mime];
      if (!ext) {
        return res.status(400).json({ ok: false, error: 'صيغة الصورة غير مدعومة.' });
      }

      let writeBuf = buffer;
      if (ext === 'svg') {
        const cleanSvg = buffer
          .toString('utf8')
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
          .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
          .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
          .replace(/javascript\s*:/gi, '');
        if (!/<svg[\s>]/i.test(cleanSvg)) {
          return res.status(400).json({ ok: false, error: 'ملف SVG غير صالح.' });
        }
        writeBuf = Buffer.from(cleanSvg, 'utf8');
      }

      const imagesUploadsDir = path.join(uploadsDir, 'images');
      fs.mkdirSync(imagesUploadsDir, { recursive: true });
      const fileName = `${slot}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const targetPath = path.join(imagesUploadsDir, fileName);
      fs.writeFileSync(targetPath, writeBuf);

      return res.json({
        ok: true,
        url: `/uploads/images/${fileName}`,
        bytes: writeBuf.length,
        mimeType: mime,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'تعذر حفظ الصورة المضغوطة.',
      });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      if (
        /\.(?:png|jpe?g|webp|gif|svg|ico|avif|woff2?|css|js|map)$/i.test(req.path) ||
        req.path.startsWith('/assets/') ||
        req.path.startsWith('/uploads/')
      ) {
        res.status(404).end();
        return;
      }
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`RahaL TV server running on http://0.0.0.0:${PORT}`);
  });
}

const isDirectServerRun = Boolean(
  process.argv[1] && /(?:^|[/\\])server\.[cm]?[jt]s$/i.test(process.argv[1])
);
if (isDirectServerRun && process.env.RAHALTV_NO_LISTEN !== '1') {
  void startServer();
}
