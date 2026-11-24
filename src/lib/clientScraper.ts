import {
  CastMember,
  DownloadMirror,
  EpisodeItem,
  ImageQualityStatus,
  MediaItem,
  MediaKind,
  ScraperAdapter,
  SeasonItem,
  StreamServer,
} from '../types/media';
import {
  extractBackgroundImageUrl,
  extractCleanEnglishTitleCandidate,
  extractImdbIdFromText,
  extractJsonLdImageUrl,
  extractJsonLdNodes,
  inferEffectiveYear,
  isJunkImageCandidate,
  isLowTrustScrapedPosterUrl,
  parseSrcsetBestUrl,
} from './imageMatching';

function upgradeKnownImageUrlScraper(rawUrl: string | undefined | null): string {
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

export interface ScrapedPayload {
  title: string;
  englishTitle: string;
  kind: MediaKind;
  categories: string[];
  genres: string[];
  year: string;
  country: string;
  language: string;
  quality: string;
  duration: string;
  imdb: number;
  votes: string;
  poster: string;
  backdrop: string;
  poster_url?: string;
  backdrop_url?: string;
  poster_width?: number;
  poster_height?: number;
  backdrop_width?: number;
  backdrop_height?: number;
  image_source?: string;
  image_quality_status?: ImageQualityStatus;
  tagline: string;
  story: string;
  sourceUrl?: string;
  imdbId?: string;
  shortUrl: string;
  trailerUrl: string;
  cast: CastMember[];
  servers: StreamServer[];
  downloads: DownloadMirror[];
  seasons: SeasonItem[];
}

const STORAGE_API_BASE_URL = 'rahaltv_api_base_url';

export function normalizeCustomApiBaseUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

export function isProxyWorkerUrl(url: string): boolean {
  const clean = (url || '').trim().toLowerCase();
  if (!clean) return false;
  return /\.workers\.dev(?:\/|$)/i.test(clean);
}

export function getCustomApiBaseUrl(): string {
  try {
    const saved = localStorage.getItem(STORAGE_API_BASE_URL) || '';
    if (saved.trim()) return normalizeCustomApiBaseUrl(saved);
  } catch {
    // Ignore storage access issues
  }
  const envBase = (import.meta.env?.VITE_API_BASE_URL as string | undefined) || '';
  const normalizedEnv = normalizeCustomApiBaseUrl(envBase);
  if (normalizedEnv) return normalizedEnv;
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.workers.dev')) {
    return window.location.origin;
  }
  return '';
}

export function setCustomApiBaseUrl(url: string): string {
  const cleaned = normalizeCustomApiBaseUrl(url);
  try {
    if (cleaned) {
      localStorage.setItem(STORAGE_API_BASE_URL, cleaned);
    } else {
      localStorage.removeItem(STORAGE_API_BASE_URL);
    }
  } catch {
    // Ignore storage access issues
  }
  return cleaned;
}

export function shouldSkipBackendApiCalls(): boolean {
  const customBase = getCustomApiBaseUrl();
  if (customBase && isProxyWorkerUrl(customBase)) {
    return true;
  }
  if (
    !customBase &&
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('.github.io') ||
      window.location.hostname.endsWith('.workers.dev'))
  ) {
    return true;
  }
  return false;
}

export function resolveApiEndpoint(endpointPath: string): string {
  const base = getCustomApiBaseUrl();
  const normalized = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  return base ? `${base}${normalized}` : normalized;
}

export async function testCloudflareWorkerConnection(rawInput: string): Promise<{
  ok: boolean;
  normalizedUrl: string;
  workerDetected: boolean;
  proxyFetchOk: boolean;
  status?: number;
  message: string;
}> {
  const normalizedUrl = normalizeCustomApiBaseUrl(rawInput);
  if (!normalizedUrl) {
    return {
      ok: false,
      normalizedUrl: '',
      workerDetected: false,
      proxyFetchOk: false,
      message: 'يرجى إدخال رابط Cloudflare Worker أولاً (مثال: https://rahaltv-proxy.yourname.workers.dev).',
    };
  }

  let workerDetected = false;
  let pingStatus = 0;
  try {
    const pingRes = await fetchWithTimeout(`${normalizedUrl}/?ping=1`, 8000);
    pingStatus = pingRes.status;
    const ct = pingRes.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const json = (await pingRes.json().catch(() => null)) as {
        ok?: boolean;
        service?: string;
      } | null;
      if (json?.service === 'RahaL TV Proxy Worker') {
        workerDetected = true;
      } else {
        return {
          ok: false,
          normalizedUrl,
          workerDetected: false,
          proxyFetchOk: false,
          status: pingStatus,
          message:
            'الرابط يستجيب لكنه لا يعمل بكود RahaL TV Proxy Worker الصحيح (ربما ما زال بالكود الافتراضي Hello World). انسخ كود Cloudflare Worker من الزر أعلاه والصقه في Worker ثم اضغط Deploy.',
        };
      }
    } else {
      const txt = await pingRes.text().catch(() => '');
      return {
        ok: false,
        normalizedUrl,
        workerDetected: false,
        proxyFetchOk: false,
        status: pingStatus,
        message: txt.toLowerCase().includes('hello world')
          ? 'الـ Worker ما زال يعمل بكود Hello World الافتراضي. استبدل الكود بالكود المنسوخ أعلاه ثم اضغط Deploy.'
          : `الرابط استجاب بحالة HTTP ${pingStatus} لكنه لم يُرجع استجابة RahaL TV Proxy Worker. تأكد من لصق كود cloudflare-worker.js بالكامل ونشره.`,
      };
    }
  } catch {
    return {
      ok: false,
      normalizedUrl,
      workerDetected: false,
      proxyFetchOk: false,
      message:
        'تعذر الاتصال برابط Cloudflare Worker من متصفحك (فشل الشبكة أو CORS أو حجب نطاق workers.dev في شبكتك). تأكد من صحة الرابط، وإذا كان نطاق workers.dev محجوباً في منطقتك اربط الـ Worker بـ Custom Domain من لوحة Cloudflare أو امسح الرابط لاستخدام السحب المدمج.',
    };
  }

  try {
    const proxyRes = await fetchWithTimeout(
      `${normalizedUrl}/?url=${encodeURIComponent('https://example.com')}`,
      9000
    );
    const body = await proxyRes.text().catch(() => '');
    const proxyFetchOk = proxyRes.ok && body.toLowerCase().includes('example domain');
    if (proxyFetchOk) {
      return {
        ok: true,
        normalizedUrl,
        workerDetected,
        proxyFetchOk: true,
        status: proxyRes.status,
        message: 'الرابط متصل ويعمل بنجاح 100% لجلب صفحات المواقع وفحص السيرفرات!',
      };
    }
    return {
      ok: true,
      normalizedUrl,
      workerDetected,
      proxyFetchOk: proxyRes.ok,
      status: proxyRes.status,
      message: `الـ Worker متصل (HTTP ${proxyRes.status}) وجاهز للاستخدام.`,
    };
  } catch {
    return {
      ok: false,
      normalizedUrl,
      workerDetected,
      proxyFetchOk: false,
      status: pingStatus,
      message: 'الـ Worker يستجيب للفحص الأولي لكنه تعذر عليه جلب صفحة خارجية الاختبارية.',
    };
  }
}

export const CLOUDFLARE_WORKER_SOURCE = `// RahaL TV — Free Cloudflare Worker CORS Proxy & Client Error Logger (v3)
// Deploy for free at https://dash.cloudflare.com (Workers & Pages -> Create Worker)
// Free tier: 100,000 requests/day, zero sleep/cold-start, works permanently with GitHub Pages & Workers Hosting.

function isBlockedHost(hostname) {
  const h = (hostname || '').toLowerCase();
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
  const m172 = h.match(/^172\\.(\\d+)\\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Expose-Headers':
    'X-Final-Url, X-Upstream-Status, X-Upstream-X-Frame-Options, X-Upstream-CSP, X-Proxy-Worker',
  'X-Proxy-Worker': 'rahaltv-v3',
};

function sanitizeLogString(val, maxLen = 400) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/Bearer\\s+[A-Za-z0-9\\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .slice(0, maxLen);
}

async function handleClientErrorLog(request) {
  try {
    const rawText = await request.text();
    if (!rawText || rawText.length > 16384) {
      return new Response(JSON.stringify({ ok: false, error: 'Payload too large or empty' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
    const payload = JSON.parse(rawText);
    const level = ['warn', 'error', 'fatal'].includes(payload.level) ? payload.level : 'error';
    const logRecord = {
      tag: 'RAHALTV_CLIENT_LOG',
      level,
      timestamp: new Date().toISOString(),
      source: sanitizeLogString(payload.source || 'window', 80),
      message: sanitizeLogString(payload.message || 'Unknown frontend error', 600),
      stack: sanitizeLogString(payload.stack || '', 1500),
      route: sanitizeLogString(payload.route || '/', 250),
      host: sanitizeLogString(payload.host || '', 120),
      release: sanitizeLogString(payload.release || 'web', 60),
      online: typeof payload.online === 'boolean' ? payload.online : undefined,
      cfRay: request.headers.get('cf-ray') || undefined,
      colo: request.cf && request.cf.colo ? request.cf.colo : undefined,
      country: request.cf && request.cf.country ? request.cf.country : undefined,
    };
    const serialized = JSON.stringify(logRecord);
    if (level === 'warn') console.warn(serialized);
    else console.error(serialized);
    return new Response(JSON.stringify({ ok: true, logged: true }), {
      status: 202,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('RAHALTV_LOGGER_FAILURE:', String(err));
    return new Response(JSON.stringify({ ok: false, error: 'Log processing failed' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const reqUrl = new URL(request.url);
    if (reqUrl.pathname === '/api/client-logs' && request.method === 'POST') {
      return handleClientErrorLog(request);
    }

    let target = (reqUrl.searchParams.get('url') || '').trim();
    const isPing = reqUrl.searchParams.has('ping');

    if (!target && request.method === 'POST') {
      try {
        const ct = request.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const body = await request.json();
          if (body && typeof body.url === 'string') {
            target = body.url.trim();
          }
        }
      } catch {
        // Ignore invalid POST body
      }
    }

    if (!target && !isPing && env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    if (!target) {
      return new Response(
        JSON.stringify({
          ok: true,
          service: 'RahaL TV Proxy Worker',
          version: 3,
          usage: '?url=https://...',
          logsEndpoint: '/api/client-logs',
          note: 'هذا رابط بروكسي السحب وتسجيل الأخطاء الخاص بـ RahaL TV. الصقه في لوحة الإدارة -> الإعدادات -> رابط بروكسي السحب.',
        }),
        {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    let parsedTarget;
    try {
      parsedTarget = new URL(target);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid target url' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    if (!['http:', 'https:'].includes(parsedTarget.protocol) || isBlockedHost(parsedTarget.hostname)) {
      return new Response(JSON.stringify({ ok: false, error: 'Blocked host or protocol' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    try {
      const upstream = await fetch(parsedTarget.toString(), {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
          'Upgrade-Insecure-Requests': '1',
          Referer: \`\${parsedTarget.origin}/\`,
        },
      });

      const body = request.method === 'HEAD' ? null : await upstream.arrayBuffer();
      const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
      const upstreamXFrame = upstream.headers.get('x-frame-options') || '';
      const upstreamCsp = upstream.headers.get('content-security-policy') || '';
      return new Response(body, {
        status: upstream.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'public, max-age=120, stale-while-revalidate=300',
          'X-Final-Url': upstream.url || parsedTarget.toString(),
          'X-Upstream-Status': String(upstream.status),
          ...(upstreamXFrame ? { 'X-Upstream-X-Frame-Options': upstreamXFrame } : {}),
          ...(upstreamCsp ? { 'X-Upstream-CSP': upstreamCsp } : {}),
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  },
};`;

export function isBlockedHostBrowser(hostname: string): boolean {
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

const isBlockedHost = isBlockedHostBrowser;

export function cleanTextBrowser(val: string | undefined | null): string {
  return (val || '').replace(/\s+/g, ' ').trim();
}

const cleanText = cleanTextBrowser;

export function normalizeArabicDigitsBrowser(val: string): string {
  return val
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

const normalizeArabicDigits = normalizeArabicDigitsBrowser;

export function resolveUrlBrowser(baseUrl: string, maybeRelative: string | undefined | null): string {
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

const resolveUrl = resolveUrlBrowser;

export function decodeBase64SafeBrowser(val: string): string {
  const trimmed = val.trim();
  if (/^(https?:)?\/\//i.test(trimmed) || /<iframe/i.test(trimmed)) return trimmed;
  if (/^[A-Za-z0-9+/=]{16,}$/.test(trimmed)) {
    try {
      const binary = atob(trimmed);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const decoded = new TextDecoder('utf-8').decode(bytes).trim();
      if (/https?:\/\/|<iframe/i.test(decoded)) return decoded;
    } catch {
      // Not valid base64 text
    }
  }
  return trimmed;
}

const decodeBase64Safe = decodeBase64SafeBrowser;

function isYoutubeUrlBrowser(rawUrl: string): boolean {
  return /(?:youtube\.com\/(?:watch|embed|shorts|v\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)/i.test(
    rawUrl
  );
}

function normalizeTrailerUrlBrowser(rawUrl: string | undefined | null): string {
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

const IGNORED_EMBED_HOSTS_BROWSER_REGEX =
  /googlesyndication|doubleclick|googletagmanager|facebook\.com\/plugins|recaptcha|cloudflare|ads|histats|yandex|analytics|disqus\.com|gravatar\.com|addtoany|sharethis|twitter\.com\/widgets|instagram\.com\/embed/i;

export function isLikelyNonVideoWebsiteUrl(rawUrl: string, sourceOrigin?: string): boolean {
  if (!rawUrl) return true;
  if (IGNORED_EMBED_HOSTS_BROWSER_REGEX.test(rawUrl)) return true;
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

  if ((p === '' || p === '/') && !hasVideoQueryParam) {
    return true;
  }

  // PHP Melody / streaming portal full pages (play.php?vid=..., watch.php?vid=...) are web pages, NOT iframe video sources
  if (hasVideoQueryParam && /\/(?:play|watch|download)\.php$/i.test(p)) {
    return true;
  }

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

  if (
    sourceOrigin &&
    u.origin === sourceOrigin &&
    !/(?:embed|player|jwplayer|videojs)/i.test(p + search) &&
    !/\.(mp4|m3u8|webm|ogg)(\?|$)/i.test(p)
  ) {
    return true;
  }

  return false;
}

function hasRealVideoPlayerMarkupBrowser(snippet: string): boolean {
  if (!snippet) return false;
  if (
    /<video\b|<source\b[^>]+src=|\.mp4\b|\.m3u8\b|jwplayer\s*\(|videojs\s*\(|new\s+Plyr\b|Hls\.isSupported|Clappr\.Player|Artplayer|DPlayer|sources\s*:\s*\[/i.test(
      snippet
    )
  ) {
    return true;
  }
  const nestedIframeSrc = snippet.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i)?.[1];
  if (nestedIframeSrc && !isLikelyNonVideoWebsiteUrl(nestedIframeSrc)) {
    return true;
  }
  return false;
}

function isWebsiteHomepageHtmlBrowser(finalUrl: string, snippet: string): boolean {
  if (finalUrl && isLikelyNonVideoWebsiteUrl(finalUrl)) return true;
  if (!snippet || hasRealVideoPlayerMarkupBrowser(snippet)) return false;

  if (
    /<title>[^<]*(?:الصفحة\s*الرئيسية|الرئيسية\s*[-|–]|لاروزا|Larooza|موقع\s*فيديو|ماي\s*سيما|اكوام|أكوام|أفلام\s*و?مسلسلات)[^<]*<\/title>/i.test(
      snippet
    ) ||
    /الصفحة\s*الرئيسية/i.test(snippet) ||
    (/<nav\b/i.test(snippet) &&
      /(?:أضيف\s*حديث[اًا]|اضيف\s*حديث[اًا]|مسلسلات\s*رمضان|برامج\s*تلفزيونية)/i.test(snippet)) ||
    (/placeholder=["'][^"']*(?:ابحث|بحث|search)[^"']*["']/i.test(snippet) &&
      /(?:مسلسلات|أفلام|افلام)/i.test(snippet))
  ) {
    return true;
  }

  // Full web pages with nav/header/footer + multiple navigation links and zero video markup
  const hasFullChrome = /<header\b/i.test(snippet) && /<footer\b/i.test(snippet);
  const navLinksCount = (snippet.match(/<a\b[^>]+href=/gi) || []).length;
  if (hasFullChrome && navLinksCount >= 10) {
    return true;
  }

  return false;
}

interface SubpageHints {
  watchSubpageUrl?: string;
  downloadSubpageUrl?: string;
  seasonPageUrls?: { seasonNumber: number; label: string; url: string }[];
  hasExplicitImdbRating?: boolean;
}

function parseBrowserSeasonNumber(label: string, fallbackIdx: number): number {
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

function extractBrowserEpisodeId(rawUrl: string): string {
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

function extractBrowserServerQuality(label: string, fallbackQuality: string): string {
  const norm = normalizeArabicDigits(String(label || '').replace(/\s+/g, ' ').trim());
  const qMatch = norm.match(/\b(4K\s*UHD|4K|2160p|1080p|720p|480p|360p|FHD|HD)\b/i);
  return qMatch ? qMatch[1].toUpperCase().replace(/\s+/g, ' ') : fallbackQuality;
}

function cleanBrowserServerName(rawName: string | undefined, _url: string | undefined, idx: number): string {
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

function extractBrowserEpisodeNumber(label: string, href: string): number | null {
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

function extractBestImageFromElementBrowser(el: Element | null, baseUrl: string): string {
  if (!el) return '';
  const hintText = [
    el.getAttribute('alt') || '',
    el.getAttribute('class') || '',
    el.getAttribute('id') || '',
  ].join(' ');

  const attrWidth = Number(el.getAttribute('width') || 0);
  const attrHeight = Number(el.getAttribute('height') || 0);
  if ((attrWidth > 0 && attrWidth < 80) || (attrHeight > 0 && attrHeight < 80)) {
    return '';
  }

  const pictureSrcsets: string[] = [];
  if (el.parentElement && el.parentElement.tagName === 'PICTURE') {
    el.parentElement.querySelectorAll('source').forEach((srcEl) => {
      const s = srcEl.getAttribute('data-srcset') || srcEl.getAttribute('srcset') || '';
      if (s) pictureSrcsets.push(s);
    });
  }

  const rawCandidates = [
    el.getAttribute('data-original'),
    el.getAttribute('data-full-src'),
    el.getAttribute('data-lazy-src'),
    el.getAttribute('data-src'),
    el.getAttribute('data-lazy'),
    el.getAttribute('data-echo'),
    el.getAttribute('data-bg'),
    el.getAttribute('data-background'),
    el.getAttribute('data-background-image'),
    el.getAttribute('data-poster'),
    el.getAttribute('data-image'),
    el.getAttribute('data-thumb'),
    el.getAttribute('data-url'),
    parseSrcsetBestUrl(el.getAttribute('data-srcset') || el.getAttribute('srcset')),
    ...pictureSrcsets.map((s) => parseSrcsetBestUrl(s)),
    extractBackgroundImageUrl(el.getAttribute('style')),
    el.getAttribute('src'),
    el.getAttribute('content'),
  ];

  for (const raw of rawCandidates) {
    if (!raw) continue;
    const resolved = resolveUrl(baseUrl, raw);
    if (!resolved || isJunkImageCandidate(resolved, hintText)) continue;
    return upgradeKnownImageUrlScraper(resolved);
  }
  return '';
}

const EXCLUDED_POSTER_CONTAINERS_SELECTOR =
  'header, nav, footer, aside, .navbar, .related, .related-videos, .similar, .recommended, .suggest, .comments, .sidebar, .widget, .carousel, .owl-carousel, .swiper, .pm-ul-carousel-videos, [class*="related"], [class*="similar"], [class*="widget"], [id*="related"], [id*="sidebar"]';

function pickFirstValidImageFromSelectorsBrowser(
  doc: Document,
  selectors: string,
  baseUrl: string,
  skipChromeAndRelated = true
): string {
  const els = doc.querySelectorAll(selectors);
  let lowTrustFallback = '';
  for (const el of Array.from(els)) {
    if (skipChromeAndRelated && el.closest(EXCLUDED_POSTER_CONTAINERS_SELECTOR)) {
      continue;
    }
    const found = extractBestImageFromElementBrowser(el, baseUrl);
    if (!found) continue;
    if (isLowTrustScrapedPosterUrl(found)) {
      if (!lowTrustFallback) lowTrustFallback = found;
      continue;
    }
    return found;
  }
  return lowTrustFallback;
}

export function parseHtmlToMediaWithHintsBrowser(
  html: string,
  sourceUrl: string,
  options?: { isDownloadPage?: boolean; forcedSeasonNumber?: number }
): { media: ScrapedPayload; hints: SubpageHints } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 1. JSON-LD extraction
  let jsonLdTitle = '';
  let jsonLdDesc = '';
  let jsonLdImage = '';
  let jsonLdTrailer = '';
  let jsonLdImdb = 0;
  let jsonLdType = '';
  let jsonLdImdbId = '';
  const jsonLdCast: CastMember[] = [];

  doc.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    const nodes = extractJsonLdNodes(el.textContent || '');
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
          const normTr = normalizeTrailerUrlBrowser(rawTr);
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

  // 2. Title
  const ogTitle = cleanText(doc.querySelector('meta[property="og:title"]')?.getAttribute('content'));
  const h1Title = cleanText(doc.querySelector('h1')?.textContent);
  const docTitle = cleanText(doc.querySelector('title')?.textContent);
  const rawTitle = jsonLdTitle || h1Title || ogTitle || docTitle || 'عمل مستورد جديد';
  const title = rawTitle
    .replace(/\s*[-|–]\s*(مشاهدة|تحميل|أون لاين|اون لاين|بجودة عالية|مترجم).*$/i, '')
    .trim()
    .slice(0, 200);

  const cleanEnglish = extractCleanEnglishTitleCandidate(rawTitle);
  const englishTitle = cleanEnglish || title;

  // 3. Separate Poster (2:3) & Landscape Backdrop (16:9)
  const rawOgImage = upgradeKnownImageUrlScraper(
    resolveUrl(
      sourceUrl,
      doc.querySelector('meta[property="og:image:secure_url"]')?.getAttribute('content') ||
        doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
        doc.querySelector('meta[property="og:image:url"]')?.getAttribute('content') ||
        doc.querySelector('link[rel="image_src"]')?.getAttribute('href')
    )
  );
  const ogImage = isJunkImageCandidate(rawOgImage) ? '' : rawOgImage;

  const rawTwitterImage = upgradeKnownImageUrlScraper(
    resolveUrl(
      sourceUrl,
      doc.querySelector('meta[name="twitter:image:src"]')?.getAttribute('content') ||
        doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')
    )
  );
  const twitterImage = isJunkImageCandidate(rawTwitterImage) ? '' : rawTwitterImage;

  const safeJsonLdImage = isJunkImageCandidate(jsonLdImage)
    ? ''
    : upgradeKnownImageUrlScraper(jsonLdImage);

  const strictSinglePoster =
    pickFirstValidImageFromSelectorsBrowser(
      doc,
      '.single-poster img, .single-right img, .movie-poster img, .film-poster img, .entry-poster img, img[itemprop="image"], meta[itemprop="image"], link[rel="image_src"]',
      sourceUrl,
      true
    ) ||
    pickFirstValidImageFromSelectorsBrowser(
      doc,
      '.single-poster, .single-right, .movie-poster, .film-poster, .entry-poster, [data-poster]',
      sourceUrl,
      true
    );

  const genericPoster =
    strictSinglePoster ||
    pickFirstValidImageFromSelectorsBrowser(
      doc,
      '.poster img, .pm-video-thumb img, .video-thumb img, .Thumb--GridItem img, .Poster--Block img',
      sourceUrl,
      true
    ) ||
    pickFirstValidImageFromSelectorsBrowser(
      doc,
      '.poster, .Thumb--GridItem, .Poster--Block, [data-bg]',
      sourceUrl,
      true
    );

  const singlePoster = strictSinglePoster || genericPoster;

  const fallbackBodyPoster =
    singlePoster || ogImage || safeJsonLdImage || twitterImage
      ? ''
      : pickFirstValidImageFromSelectorsBrowser(
          doc,
          '.post-body img, .entry-content img, main img, article img',
          sourceUrl,
          true
        );

  const explicitBackdrop =
    pickFirstValidImageFromSelectorsBrowser(
      doc,
      '.backdrop img, .hero img, .hero-bg img, .cover img, .single-cover img, .movie-backdrop img, .single-cover, .movie-backdrop',
      sourceUrl,
      true
    ) ||
    upgradeKnownImageUrlScraper(
      resolveUrl(sourceUrl, doc.querySelector('video')?.getAttribute('poster') || undefined)
    );

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
  const backdrop =
    cleanExplicitBackdrop && cleanExplicitBackdrop !== poster
      ? cleanExplicitBackdrop
      : twitterImage && twitterImage !== poster
        ? twitterImage
        : ogImage && ogImage !== poster
          ? ogImage
          : '';

  const extractedImdbId = jsonLdImdbId || extractImdbIdFromText(html);

  // 4. Story
  const storySelector = cleanText(
    doc.querySelector('.single-story, .story, .post-story, .description, [itemprop="description"]')
      ?.textContent
  );
  const ogDesc = cleanText(
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      doc.querySelector('meta[name="description"]')?.getAttribute('content')
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
  doc
    .querySelectorAll('a[rel="tag"], .labels a, .single-details a, .single-info a, .tags a')
    .forEach((el) => {
      const t = cleanText(el.textContent);
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

  const allScriptsText = Array.from(doc.querySelectorAll('script'))
    .map((el) => el.textContent || '')
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

  const bodyText = cleanText(doc.body?.textContent || '');
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

  let imdb = jsonLdImdb;
  if (!imdb) {
    const imdbText = cleanText(
      doc.querySelector('.single-imdb, .imdb, [class*="imdb"]')?.textContent
    );
    const m = (imdbText + ' ' + bodyText.slice(0, 3000)).match(
      /(?:IMDb[^\d]{0,15}|تقييم[^\d]{0,15})([1-9](?:\.\d)?)/i
    );
    if (m) imdb = parseFloat(m[1]);
  }
  const hasExplicitImdbRating = Boolean(imdb && imdb > 0 && imdb <= 10);
  if (!hasExplicitImdbRating) imdb = 7.8;

  let kind: MediaKind = 'movie';
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

  // 5b. Trailer extraction
  let trailerUrl = jsonLdTrailer || '';
  const trySetTrailer = (rawCandidate: string | undefined | null) => {
    if (trailerUrl || !rawCandidate) return;
    const resolved = resolveUrl(sourceUrl, rawCandidate) || rawCandidate.trim();
    const norm = normalizeTrailerUrlBrowser(resolved);
    if (norm) trailerUrl = norm;
  };

  doc
    .querySelectorAll(
      '[data-trailer], [data-youtube], .trailer iframe, #trailer iframe, .trailer a, #trailer a, a[href*="youtube.com/watch"], a[href*="youtu.be/"], iframe[src*="youtube.com"], iframe[src*="youtube-nocookie.com"], iframe[data-src*="youtube"]'
    )
    .forEach((el) => {
      if (trailerUrl) return;
      trySetTrailer(el.getAttribute('data-trailer'));
      trySetTrailer(el.getAttribute('data-youtube'));
      trySetTrailer(el.getAttribute('href'));
      trySetTrailer(el.getAttribute('src'));
      trySetTrailer(el.getAttribute('data-src'));
    });

  if (!trailerUrl && allScriptsText) {
    const ytScriptMatch = allScriptsText.match(
      /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)[A-Za-z0-9_-]{11}/i
    );
    if (ytScriptMatch?.[0]) trySetTrailer(ytScriptMatch[0]);
  }

  // 6. Watch Servers
  const serversMap = new Map<string, StreamServer>();

  const pushEmbedServer = (rawCandidate: string, preferredName?: string) => {
    const src = resolveUrl(sourceUrl, rawCandidate);
    if (!src) return;
    if (isYoutubeUrlBrowser(src)) {
      trySetTrailer(src);
      return;
    }
    if (isLikelyNonVideoWebsiteUrl(src, sourceOrigin)) return;

    const existing = serversMap.get(src);
    if (existing) {
      if (preferredName && /^سيرفر\s*\d+$/i.test(existing.name)) {
        existing.name = cleanBrowserServerName(preferredName, src, serversMap.size - 1);
        const srvQuality = extractBrowserServerQuality(preferredName, existing.quality || quality);
        existing.quality = srvQuality;
        if (existing.mode === 'embed') existing.tag = srvQuality;
      }
      return;
    }

    const seqNum = serversMap.size + 1;
    const isDirectStream = /\.(mp4|m3u8|webm|ogg)(\?|$)/i.test(src);
    const srvQuality = extractBrowserServerQuality(preferredName || '', quality);
    serversMap.set(src, {
      id: `srv-ext-${seqNum}`,
      name: cleanBrowserServerName(preferredName, src, seqNum - 1),
      mode: isDirectStream ? 'url' : 'embed',
      url: src,
      embedCode: isDirectStream ? '' : `<iframe src="${src}" frameborder="0" allowfullscreen></iframe>`,
      quality: srvQuality,
      speed: 'سريع',
      tag: isDirectStream ? 'MP4' : srvQuality,
    });
  };

  // Scan clickable server buttons FIRST so real names, order, and qualities are preserved cleanly
  doc
    .querySelectorAll(
      '[data-embed-url], [data-embed], [data-iframe], [data-server], [data-video], [data-url], [data-watch], [data-link], [data-play], li[data-src], button[data-src], a[data-src], .WatchList li[href], .WatchList li a[href], .servers li a[href]'
    )
    .forEach((el) => {
      if (el.tagName.toLowerCase() === 'img') return;
      if (el.closest('header, nav, footer, .ads, .banner, .pm-ads-banner, .trailer, #trailer')) return;
      const attrVal =
        el.getAttribute('data-embed-url') ||
        el.getAttribute('data-embed') ||
        el.getAttribute('data-iframe') ||
        el.getAttribute('data-server') ||
        el.getAttribute('data-video') ||
        el.getAttribute('data-url') ||
        el.getAttribute('data-watch') ||
        el.getAttribute('data-link') ||
        el.getAttribute('data-play') ||
        el.getAttribute('data-src') ||
        el.getAttribute('href');
      if (!attrVal) return;

      let candidateUrl = decodeBase64Safe(attrVal);
      const iframeMatch = candidateUrl.match(/src=["']([^"']+)["']/i);
      if (iframeMatch) candidateUrl = iframeMatch[1];

      const btnText =
        cleanText(el.querySelector('.name, span')?.textContent) ||
        cleanText(el.textContent) ||
        cleanText(el.getAttribute('title'));

      if (/^[0-9a-zA-Z_-]{1,24}$/.test(candidateUrl) && !/[./:?]/.test(candidateUrl)) {
        return;
      }
      pushEmbedServer(candidateUrl, btnText || undefined);
    });

  doc.querySelectorAll('iframe').forEach((el) => {
    if (el.closest('header, nav, footer, .ads, .banner, .pm-ads-banner, .trailer, #trailer')) return;
    const rawSrc =
      el.getAttribute('src') ||
      el.getAttribute('data-src') ||
      el.getAttribute('data-lazy-src') ||
      '';
    const titleAttr = cleanText(el.getAttribute('title'));
    pushEmbedServer(rawSrc, titleAttr || undefined);
  });

  const serverButtonLabels = Array.from(
    doc.querySelectorAll(
      '.server-btn, .WatchList li, .servers li, .watch-servers button, .servers-list button, .server-item, .btn-service'
    )
  )
    .map((el) => cleanText(el.querySelector('.name')?.textContent) || cleanText(el.textContent))
    .filter(Boolean);

  doc.querySelectorAll('script').forEach((el) => {
    const scriptText = el.textContent || '';
    if (!scriptText || scriptText.length < 15) return;

    const unescaped = scriptText
      .replace(/\\\//g, '/')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\n|\\r|\\t/g, ' ');

    const iframeSrcRegex = /<iframe[^>]+src=["'](https?:\/\/[^"'\s<>]+)["']/gi;
    let match: RegExpExecArray | null;
    let scriptServerIdx = 0;
    while ((match = iframeSrcRegex.exec(unescaped)) !== null) {
      const label = serverButtonLabels[scriptServerIdx] || undefined;
      pushEmbedServer(match[1], label);
      scriptServerIdx++;
    }

    const atobRegex = /atob\(\s*["']([A-Za-z0-9+/=]{20,})["']\s*\)/gi;
    let b64Match: RegExpExecArray | null;
    while ((b64Match = atobRegex.exec(scriptText)) !== null) {
      const decoded = decodeBase64Safe(b64Match[1]);
      if (/<script/i.test(decoded)) continue;
      const srcInDecoded = decoded.match(/src=["'](https?:\/\/[^"'\s<>]+)["']/i)?.[1] || decoded;
      if (/^https?:\/\//i.test(srcInDecoded) && !IGNORED_EMBED_HOSTS_BROWSER_REGEX.test(srcInDecoded)) {
        pushEmbedServer(srcInDecoded);
      }
    }

    const jsArrayVarRegex =
      /(?:var|let|const)\s+(?:servers|embeds|players|watchLinks)\s*=\s*\[([\s\S]{5,8000}?)\]/gi;
    let arrMatch: RegExpExecArray | null;
    while ((arrMatch = jsArrayVarRegex.exec(unescaped)) !== null) {
      const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
      let uMatch: RegExpExecArray | null;
      let arrIdx = 0;
      while ((uMatch = urlRegex.exec(arrMatch[1])) !== null) {
        if (!IGNORED_EMBED_HOSTS_BROWSER_REGEX.test(uMatch[0])) {
          const label = serverButtonLabels[arrIdx] || undefined;
          pushEmbedServer(uMatch[0], label);
          arrIdx++;
        }
      }
    }
  });

  doc.querySelectorAll('video source, video').forEach((el) => {
    const src = resolveUrl(sourceUrl, el.getAttribute('src'));
    if (!src || serversMap.has(src) || isLikelyNonVideoWebsiteUrl(src, sourceOrigin)) return;
    const seqNum = serversMap.size + 1;
    const label = cleanText(el.getAttribute('title') || el.getAttribute('data-label'));
    serversMap.set(src, {
      id: `srv-vid-${seqNum}`,
      name: cleanBrowserServerName(label || undefined, src, seqNum - 1),
      mode: 'url',
      url: src,
      embedCode: '',
      quality: extractBrowserServerQuality(label || '', quality),
      speed: 'فائق',
      tag: 'MP4',
    });
  });

  // 7. Downloads & Subpage Hints
  const downloadsMap = new Map<string, DownloadMirror>();
  const hints: SubpageHints = { hasExplicitImdbRating };

  const ignoredDownloadHosts =
    /facebook\.com|twitter\.com|x\.com|t\.me|telegram|whatsapp|instagram|youtube\.com|tiktok\.com|pinterest|linkedin|plus\.google\.com|google\.com\/search|sharer\.php|\/share\?/i;
  const knownMirrorRegex =
    /(mediafire|mega\.nz|drive\.google|gofile|1fichier|pixeldrain|uqload|streamtape|dood|filemoon|liiivideo|vidmoly|vidspeed|anafast|vidoba|abyssplayer|mp4plus|bysetayico|filelions|streamwish|earnvids|voe\.sx|mixdrop|krakenfiles|turbobit|rapidgator|nitroflare)/i;

  const watchCandidates: { url: string; score: number }[] = [];
  const sourceIdVal = extractBrowserEpisodeId(sourceUrl);
  const canonicalSourceUrl = canonicalizeCompareUrlBrowser(sourceUrl);

  doc.querySelectorAll('a[href]').forEach((el, idx) => {
    const rawHref = el.getAttribute('href');
    const href = resolveUrl(sourceUrl, rawHref);
    const text = cleanText(el.textContent);
    const cls = cleanText(el.getAttribute('class'));
    if (!href || canonicalizeCompareUrlBrowser(href) === canonicalSourceUrl) return;

    let hrefOrigin = '';
    try {
      hrefOrigin = new URL(href).origin;
    } catch {
      return;
    }

    const sameOrigin = Boolean(sourceOrigin && hrefOrigin === sourceOrigin);

    const inIgnoredWatchParent =
      Boolean(
        el.closest(
          'header, nav, footer, .navbar, .ads, .banner, .pm-ads-banner, .ad-box, .sidebar, .widget, .related, .recommended, .comments, .tabcontent, .SeasonsEpisodes, .SeasonsList, .episodes-list, .episodes, [id^="Season"]'
        )
      ) && !/\b(xtgo|btnplay|watch-btn)\b/i.test(cls);

    if (
      sameOrigin &&
      !inIgnoredWatchParent &&
      (/play\.php|\/watch\/|\/player\/|\/embed\//i.test(href) ||
        /\b(xtgo|btnplay|watch-btn)\b/i.test(cls) ||
        (/مشاهدة|شاهد/i.test(text) && /\b(play|watch|vid=)\b/i.test(href)))
    ) {
      const candIdVal = extractBrowserEpisodeId(href);
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

    if (
      sameOrigin &&
      !hints.downloadSubpageUrl &&
      !el.closest('.pm-ads-banner, .ads, .banner') &&
      (/download\.php|\/downloads?\//i.test(href) ||
        (/تحميل/i.test(text) && /vid=|download/i.test(href)))
    ) {
      const candIdVal = extractBrowserEpisodeId(href);
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
        Boolean(
          options?.isDownloadPage && !el.closest('header, nav, footer, .navbar, .menu')
        ));

    const looksLikeDirectButton =
      !sameOrigin && !ignoredDownloadHosts.test(href) && /تحميل|download|سيرفر/i.test(text);

    if (
      !looksLikeExternalMirror &&
      !looksLikeDirectButton &&
      !(sameOrigin && /\.(mp4|mkv|avi|zip)(\?|$)/i.test(href))
    ) {
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
      host:
        text && text.length < 40 && !/^(download|تحميل)$/i.test(text)
          ? `${text} (${host})`
          : host,
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

  // 8. Multi-Season & Episodes (preserves seasonNumber, episode number, and original sourceUrl)
  const seasonsAccumulator = new Map<
    number,
    { seasonNumber: number; label: string; episodes: Map<number, EpisodeItem> }
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
    const canon = canonicalizeCompareUrlBrowser(resolved);
    if (!canon || canon === canonicalSourceUrl) return;
    if (!seasonPageLinksMap.has(canon)) {
      seasonPageLinksMap.set(canon, {
        seasonNumber: seasonNum,
        label: label || `الموسم ${String(seasonNum).padStart(2, '0')}`,
        url: resolved,
      });
    }
  };

  doc
    .querySelectorAll(
      '.SeasonsList a[href], .seasons-sec a[href], .seasons-list a[href], .TabS a[href], a[data-season][href], a[href*="season"]'
    )
    .forEach((el, idx) => {
      if (el.closest('header nav, .navbar, footer, .ads, .pm-ads-banner')) return;
      const href = el.getAttribute('href') || '';
      const txt = cleanText(el.textContent) || cleanText(el.getAttribute('title'));
      const dataS = Number(el.getAttribute('data-season'));
      if (!href || (!/موسم|season/i.test(txt) && !Number.isFinite(dataS) && !/season[-_=]?\d+/i.test(href))) {
        return;
      }
      const sNum =
        Number.isFinite(dataS) && dataS > 0
          ? dataS
          : parseBrowserSeasonNumber(`${txt} ${href}`, idx + 1);
      recordSeasonPageLink(sNum, txt || `الموسم ${sNum}`, href);
    });

  doc.querySelectorAll('select.TabS option, select[name*="season"] option').forEach((el, idx) => {
    const val = el.getAttribute('value') || el.getAttribute('data-url') || '';
    const txt = cleanText(el.textContent);
    const sNum = parseBrowserSeasonNumber(txt || val, idx + 1);
    if (val && (/^https?:\/\//i.test(val) || val.startsWith('/'))) {
      recordSeasonPageLink(sNum, txt || `الموسم ${sNum}`, val);
    }
  });

  doc
    .querySelectorAll('select.TabE option, select.episodeoption option, select[name*="episode"] option')
    .forEach((el) => {
      if (el.closest('header nav, .navbar, footer')) return;
      const rawHref = resolveUrl(
        sourceUrl,
        el.getAttribute('value') || el.getAttribute('data-url')
      );
      if (!rawHref) return;
      const text = cleanText(el.textContent);
      const epNum = extractBrowserEpisodeNumber(text, rawHref);
      if (epNum) {
        const sNum = forcedSeasonNum || parseBrowserSeasonNumber(text, 1);
        addEpisodeToSeason(sNum, undefined, epNum, text, rawHref);
      }
    });

  const tabLabels = Array.from(
    doc.querySelectorAll(
      '.SeasonsList .tablinks, .SeasonsList [data-season], .seasons-tabs .tablinks, [role="tab"][data-season]'
    )
  ).map((el, idx) => ({
    num:
      Number(el.getAttribute('data-season')) ||
      parseBrowserSeasonNumber(cleanText(el.textContent), idx + 1),
    label: cleanText(el.textContent) || `الموسم ${idx + 1}`,
  }));

  let foundMultiSeasonPanels = false;
  const seasonPanels = Array.from(
    doc.querySelectorAll('.tabcontent, .SeasonsEpisodes, .season-episodes, [data-season-panel], [id^="Season"]')
  );
  if (seasonPanels.length > 0) {
    seasonPanels.forEach((panel, idx) => {
      const idAttr = panel.getAttribute('id') || '';
      const dataS = Number(
        panel.getAttribute('data-season') || panel.getAttribute('data-season-panel')
      );
      const matchedTab = tabLabels[idx];
      const headingText = cleanText(panel.querySelector('h2, h3, h4, .season-title')?.textContent);
      const sNum =
        forcedSeasonNum ||
        (Number.isFinite(dataS) && dataS > 0 ? dataS : 0) ||
        parseBrowserSeasonNumber(headingText || matchedTab?.label || idAttr, matchedTab?.num || idx + 1);
      const sLabel = matchedTab?.label || headingText || `الموسم ${String(sNum).padStart(2, '0')}`;

      const beforeCount = seasonsAccumulator.get(sNum)?.episodes.size || 0;
      panel.querySelectorAll('a[href]').forEach((aEl) => {
        if (aEl.closest('header nav, .navbar, footer, .ads, .pm-ads-banner')) return;
        const rawHref = resolveUrl(sourceUrl, aEl.getAttribute('href'));
        if (!rawHref) return;
        const text = cleanText(aEl.textContent);
        const titleAttr = cleanText(aEl.getAttribute('title'));
        const epNum = extractBrowserEpisodeNumber(text || titleAttr, rawHref);
        if (epNum) {
          addEpisodeToSeason(sNum, sLabel, epNum, text || titleAttr || `الحلقة ${epNum}`, rawHref);
        }
      });
      if ((seasonsAccumulator.get(sNum)?.episodes.size || 0) > beforeCount) {
        foundMultiSeasonPanels = true;
      }
    });
  }

  if (!foundMultiSeasonPanels) {
    doc.querySelectorAll('a[href]').forEach((el) => {
      if (el.closest('header nav, .navbar, footer, .ads, .banner, .pm-ads-banner')) return;
      const rawHref = resolveUrl(sourceUrl, el.getAttribute('href'));
      if (!rawHref) return;
      const text = cleanText(el.textContent);
      const titleAttr = cleanText(el.getAttribute('title'));
      const combinedLabel = text || titleAttr;
      const epNum = extractBrowserEpisodeNumber(combinedLabel, rawHref);
      if (epNum) {
        const nearestSeasonAttr = el.closest('[data-season]')?.getAttribute('data-season');
        const nearestHeading = cleanText(
          el.closest('.season, .season-block, section, .tabcontent')?.querySelector('h2, h3, h4, .season-title')
            ?.textContent
        );
        const sNum =
          forcedSeasonNum ||
          (nearestSeasonAttr ? Number(nearestSeasonAttr) || 1 : parseBrowserSeasonNumber(nearestHeading || combinedLabel, 1));
        addEpisodeToSeason(sNum, nearestHeading || undefined, epNum, text || titleAttr || `الحلقة ${epNum}`, rawHref);
      }
    });
  }

  const currentEpMatch = normalizeArabicDigits(`${rawTitle} ${h1Title}`).match(
    /(?:الحلقة|حلقة|Episode|Ep\.?)\s*#?(\d{1,3})/i
  );
  if (currentEpMatch && sourceUrl) {
    const currNum = Number(currentEpMatch[1]);
    const currSeasonNum = forcedSeasonNum || parseBrowserSeasonNumber(`${rawTitle} ${h1Title}`, 1);
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
    doc
      .querySelectorAll('.single-actor-name, [itemprop="actor"] [itemprop="name"]')
      .forEach((el) => {
        const nm = cleanText(el.textContent);
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
      name: cleanBrowserServerName(srv.name, srv.url, idx),
    }));

  return {
    media: {
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
      image_quality_status: backdrop ? 'unknown' : 'missing_backdrop',
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
    },
    hints,
  };
}

function isLikelyContentUrl(candidateUrl: string, allowedOrigins: string[]): boolean {
  try {
    const u = new URL(candidateUrl);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    if (!allowedOrigins.includes(u.origin)) return false;
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

function extractListingLinksAndPaginationBrowser(html: string, pageUrl: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const baseOrigin = new URL(pageUrl).origin;
  const canonicalHref =
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
    doc.querySelector('meta[property="og:url"]')?.getAttribute('content') ||
    '';
  const allowedOrigins = [baseOrigin];
  try {
    if (canonicalHref) {
      const co = new URL(canonicalHref).origin;
      if (!allowedOrigins.includes(co)) allowedOrigins.push(co);
    }
  } catch {
    // ignore
  }
  const siteTitle = cleanText(doc.querySelector('title')?.textContent) || new URL(pageUrl).hostname;

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
    doc.querySelectorAll(selector).forEach((el) => {
      if (el.closest('header, nav, footer, .navbar, .cinema-topbar')) return;
      const href = resolveUrl(pageUrl, el.getAttribute('href'));
      if (!href || !isLikelyContentUrl(href, allowedOrigins)) return;

      const cleanHref = href.split('#')[0];
      if (cards.has(cleanHref)) return;

      const parentCard = el.closest(
        '.entry-box, .cinema-poster-slide, .cinema-card, .pm-li-video, .pm-video-thumb, article, .post, .movie, .card, .item, .block'
      );
      const imgEls = [
        ...Array.from(el.querySelectorAll('img')),
        ...Array.from(parentCard?.querySelectorAll('img') || []),
      ];
      let poster = '';
      let matchedImgEl: Element | null = null;
      for (const candidateImg of imgEls) {
        const extracted = extractBestImageFromElementBrowser(candidateImg, pageUrl);
        if (extracted) {
          poster = extracted;
          matchedImgEl = candidateImg;
          break;
        }
      }
      if (!poster) {
        const bgCandidates = [
          el,
          ...Array.from(el.querySelectorAll('[style*="background-image"], [data-bg], [data-poster]')),
          ...(parentCard ? [parentCard, ...Array.from(parentCard.querySelectorAll('[style*="background-image"], [data-bg], [data-poster]'))] : []),
        ];
        for (const bgEl of bgCandidates) {
          const extracted = extractBestImageFromElementBrowser(bgEl, pageUrl);
          if (extracted) {
            poster = extracted;
            break;
          }
        }
      }

      const cardTitle =
        cleanText(el.getAttribute('title')) ||
        cleanText(el.querySelector('h2, h3, h4, .title')?.textContent) ||
        cleanText(parentCard?.querySelector('h2, h3, h4, .title, .ellipsis')?.textContent) ||
        cleanText(matchedImgEl?.getAttribute('alt')) ||
        cleanText(el.textContent);

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

  const prioritizedNext: string[] = [];
  const otherNext: string[] = [];
  doc
    .querySelectorAll(
      'a[rel="next"], .next a, a.next, .pagination a, a.blog-pager-older-link, .nav-previous a'
    )
    .forEach((el) => {
      const nextHref = resolveUrl(pageUrl, el.getAttribute('href'));
      if (!nextHref || !nextHref.startsWith(baseOrigin) || nextHref === pageUrl) return;
      const label = cleanText(el.textContent);
      const isExplicitNext =
        el.getAttribute('rel') === 'next' || /التالي|next|›|»/i.test(label) || /\/page\/[2-9]\//.test(nextHref);
      const targetList = isExplicitNext ? prioritizedNext : otherNext;
      if (!prioritizedNext.includes(nextHref) && !otherNext.includes(nextHref)) {
        targetList.push(nextHref);
      }
    });

  return { siteTitle, cards: Array.from(cards.values()), nextUrls: [...prioritizedNext, ...otherNext] };
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isChallengeOrErrorHtml(text: string): boolean {
  if (!text || text.length < 40) return true;
  if (
    text.length < 25000 &&
    /<title>\s*(?:Just a moment\.\.\.|Attention Required!\s*\|\s*Cloudflare|Access denied|403 Forbidden|429 Too Many Requests)/i.test(
      text
    )
  ) {
    return true;
  }
  if (
    text.length < 25000 &&
    /cf-browser-verification|challenge-platform|__cf_chl_opt|cf_chl_prog/i.test(text)
  ) {
    return true;
  }
  return false;
}

export async function fetchViaBrowserOrCorsRelay(
  targetUrl: string,
  timeoutMs = 11000
): Promise<{ ok: boolean; status: number; text: string; finalUrl?: string }> {
  const customBase = getCustomApiBaseUrl();
  if (customBase) {
    try {
      const workerUrl = `${customBase}/?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetchWithTimeout(workerUrl, timeoutMs);
      if (res.ok) {
        const text = await res.text();
        const finalUrl = res.headers.get('X-Final-Url') || targetUrl;
        if (!isChallengeOrErrorHtml(text)) {
          return { ok: true, status: res.status, text, finalUrl };
        }
      }
    } catch {
      // Fall back to direct/public relays if custom proxy did not answer
    }
  }

  const isMixedContent =
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    targetUrl.startsWith('http://');

  if (!isMixedContent) {
    try {
      const directRes = await fetchWithTimeout(targetUrl, Math.min(timeoutMs, 6500));
      if (directRes.ok) {
        const text = await directRes.text();
        if (!isChallengeOrErrorHtml(text)) {
          return { ok: true, status: directRes.status, text };
        }
      }
    } catch {
      // Expected for cross-origin targets without CORS headers; continue to CORS relays
    }
  }

  const relays: { kind: 'raw' | 'allorigins_json'; build: (u: string) => string }[] = [
    {
      kind: 'allorigins_json',
      build: (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    },
    {
      kind: 'raw',
      build: (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    },
    {
      kind: 'raw',
      build: (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    },
  ];

  let lastStatus = 0;
  for (const relay of relays) {
    try {
      const relayUrl = relay.build(targetUrl);
      const res = await fetchWithTimeout(relayUrl, timeoutMs);
      lastStatus = res.status;
      if (!res.ok) continue;

      if (relay.kind === 'allorigins_json') {
        const json = (await res.json()) as {
          contents?: string;
          status?: { http_code?: number };
        };
        const contents = json?.contents || '';
        const upstreamCode = Number(json?.status?.http_code || 200);
        if (upstreamCode < 400 && !isChallengeOrErrorHtml(contents)) {
          return { ok: true, status: upstreamCode, text: contents };
        }
        continue;
      }

      const text = await res.text();
      if (!isChallengeOrErrorHtml(text)) {
        return { ok: true, status: res.status, text };
      }
    } catch {
      // Try next relay
    }
  }

  return { ok: false, status: lastStatus || 502, text: '' };
}

interface BloggerFeedJson {
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
}

function parseBloggerJsonEntries(json: BloggerFeedJson, origin: string, maxItems: number) {
  const entries = json.feed?.entry;
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const siteTitle = cleanText(json.feed?.title?.$t) || new URL(origin).hostname;
  const items: ScrapedPayload[] = entries.slice(0, maxItems).map((entry) => {
    const altLink = entry.link?.find((l) => l.rel === 'alternate')?.href || origin;
    const contentHtml = entry.content?.$t || entry.summary?.$t || '';
    const parsed = parseHtmlToMediaWithHintsBrowser(contentHtml, altLink).media;

    const rawTitle = cleanText(entry.title?.$t);
    if (rawTitle) {
      parsed.title = rawTitle
        .replace(/\s*[-|–]\s*(مشاهدة|تحميل|أون لاين|اون لاين|بجودة عالية|مترجم).*$/i, '')
        .trim()
        .slice(0, 200);
    }

    if (!parsed.poster && entry.media$thumbnail?.url) {
      parsed.poster = upgradeKnownImageUrlScraper(entry.media$thumbnail.url);
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
}

async function tryBloggerFeedBrowser(
  origin: string,
  maxItems: number
): Promise<{ siteTitle: string; items: ScrapedPayload[] } | null> {
  // 1. JSONP (zero CORS issues directly in browser)
  const jsonpResult = await new Promise<BloggerFeedJson | null>((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const cbName = `__rahaltv_blogger_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      try {
        delete (window as unknown as Record<string, unknown>)[cbName];
      } catch {
        // ignore
      }
      script.remove();
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(null);
      }
    }, 6000);

    (window as unknown as Record<string, unknown>)[cbName] = (data: BloggerFeedJson) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(data);
      }
    };

    script.src = `${origin}/feeds/posts/default?alt=json-in-script&max-results=${maxItems}&callback=${cbName}`;
    script.async = true;
    script.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(null);
      }
    };
    document.head.appendChild(script);
  });

  if (jsonpResult) {
    const parsed = parseBloggerJsonEntries(jsonpResult, origin, maxItems);
    if (parsed && parsed.items.length > 0) return parsed;
  }

  // 2. Fallback via CORS relay
  try {
    const res = await fetchViaBrowserOrCorsRelay(
      `${origin}/feeds/posts/default?alt=json&max-results=${maxItems}`,
      9000
    );
    if (res.ok && res.text.trim().startsWith('{')) {
      const json = JSON.parse(res.text) as BloggerFeedJson;
      return parseBloggerJsonEntries(json, origin, maxItems);
    }
  } catch {
    // ignore
  }
  return null;
}

async function tryWordPressApiBrowser(
  origin: string,
  maxItems: number
): Promise<{ siteTitle: string; items: ScrapedPayload[] } | null> {
  try {
    const wpUrl = `${origin}/wp-json/wp/v2/posts?per_page=${Math.min(maxItems, 50)}&_embed`;
    const res = await fetchViaBrowserOrCorsRelay(wpUrl, 9000);
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

    const items: ScrapedPayload[] = posts.slice(0, maxItems).map((post) => {
      const postUrl = post.link || origin;
      const htmlBody = `${post.content?.rendered || ''} ${post.excerpt?.rendered || ''}`;
      const parsed = parseHtmlToMediaWithHintsBrowser(htmlBody, postUrl).media;
      const tmpDoc = new DOMParser().parseFromString(post.title?.rendered || '', 'text/html');
      const rawTitle = cleanText(tmpDoc.body?.textContent);
      if (rawTitle) parsed.title = rawTitle.slice(0, 200);
      const featured = post._embedded?.['wp:featuredmedia']?.[0]?.source_url;
      if (featured && !parsed.poster) {
        parsed.poster = upgradeKnownImageUrlScraper(featured);
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

async function trySitemapDiscoveryBrowser(origin: string, maxItems: number): Promise<string[]> {
  const candidates = [`${origin}/sitemap.xml`, `${origin}/post-sitemap.xml`];
  const discovered: string[] = [];

  for (const smUrl of candidates) {
    try {
      const res = await fetchViaBrowserOrCorsRelay(smUrl, 8000);
      if (!res.ok || !res.text.includes('<loc>')) continue;
      const xmlDoc = new DOMParser().parseFromString(res.text, 'text/xml');
      const nestedSitemaps: string[] = [];

      xmlDoc.querySelectorAll('sitemap loc').forEach((el) => {
        const loc = cleanText(el.textContent);
        if (loc && !loc.includes('page-sitemap') && !loc.includes('category-sitemap')) {
          nestedSitemaps.push(loc);
        }
      });

      xmlDoc.querySelectorAll('url loc').forEach((el) => {
        const loc = cleanText(el.textContent);
        if (loc && isLikelyContentUrl(loc, [origin]) && !discovered.includes(loc)) {
          discovered.push(loc);
        }
      });

      for (const childSm of nestedSitemaps.slice(0, 2)) {
        if (discovered.length >= maxItems) break;
        const subRes = await fetchViaBrowserOrCorsRelay(childSm, 8000);
        if (!subRes.ok) continue;
        const subXml = new DOMParser().parseFromString(subRes.text, 'text/xml');
        subXml.querySelectorAll('url loc').forEach((el) => {
          const loc = cleanText(el.textContent);
          if (loc && isLikelyContentUrl(loc, [origin]) && !discovered.includes(loc)) {
            discovered.push(loc);
          }
        });
      }

      if (discovered.length > 0) break;
    } catch {
      // ignore
    }
  }

  return discovered.slice(0, maxItems);
}

export async function findTrailerInBrowser(params: {
  title?: string;
  englishTitle?: string;
  year?: string;
  kind?: MediaKind;
}): Promise<string> {
  const { title = '', englishTitle = '', year = '', kind = 'movie' } = params;

  if (!shouldSkipBackendApiCalls()) {
    try {
      const res = await fetch(resolveApiEndpoint('/api/find-trailer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, englishTitle, year, kind }),
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const json = (await res.json()) as { ok?: boolean; trailerUrl?: string };
        if (json.ok && json.trailerUrl) return json.trailerUrl;
      }
    } catch {
      // Static hosting fallback below
    }
  }

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
      const ytRes = await fetchViaBrowserOrCorsRelay(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        6500
      );
      if (ytRes.ok && ytRes.text) {
        const m = ytRes.text.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
        if (m?.[1]) return `https://www.youtube.com/watch?v=${m[1]}`;
      }
    } catch {
      // Try next query
    }
  }

  return '';
}

export type ServerFilterEntryResult = {
  url: string;
  ok: boolean;
  faultType: '403' | 'sandboxed_embed' | '404' | 'frame_blocked' | 'not_video' | 'error' | null;
  httpStatus: number;
  reason: string;
  directStreamUrl?: string | null;
};

function evaluateFetchedServerResponse(
  rawUrl: string,
  finalUrl: string,
  status: number,
  xFrame: string,
  csp: string,
  snippet: string
): ServerFilterEntryResult {
  if (isLikelyNonVideoWebsiteUrl(finalUrl)) {
    return {
      url: rawUrl,
      ok: false,
      faultType: 'not_video',
      httpStatus: status,
      reason: 'الرابط يعيد توجيهه لصفحة موقع وليس مشغل فيديو',
    };
  }
  if (status === 404 || status === 410) {
    return {
      url: rawUrl,
      ok: false,
      faultType: '404',
      httpStatus: status,
      reason: 'الملف غير موجود (404)',
    };
  }
  if (status === 403 || status === 401 || status >= 500) {
    return {
      url: rawUrl,
      ok: false,
      faultType: status === 403 ? '403' : 'error',
      httpStatus: status,
      reason: status === 403 ? 'ممنوع الوصول (403)' : `خطأ من الخادم (${status})`,
    };
  }
  if (isWebsiteHomepageHtmlBrowser(finalUrl, snippet)) {
    return {
      url: rawUrl,
      ok: false,
      faultType: 'not_video',
      httpStatus: status,
      reason: 'الرابط يفتح صفحة موقع وليست مشغل فيديو',
    };
  }
  if (
    /<title>\s*(?:403\s+Forbidden|Access\s+Denied|Just\s+a\s+moment|Attention\s+Required|404\s+Not\s+Found)/i.test(
      snippet
    ) ||
    /file\s*(?:was|has been)?\s*(?:deleted|removed)|video\s*(?:was|has been|is)?\s*(?:deleted|removed|not found|unavailable|blocked)|file\s*(?:not\s*found|does\s*not\s*exist)|404\s*not\s*found|no\s*longer\s*available|no\s*video\s*found|this\s*video\s*does\s*not\s*exist|embed\s*(?:is\s*)?(?:disabled|unavailable)|account\s*(?:has been\s*)?suspended|تم\s*حذف\s*(?:الملف|الفيديو)|الفيديو\s*غير\s*موجود|الملف\s*غير\s*موجود/i.test(
      snippet
    )
  ) {
    return {
      url: rawUrl,
      ok: false,
      faultType: '404',
      httpStatus: status,
      reason: 'الفيديو محذوف أو غير موجود داخل السيرفر',
    };
  }
  if (/sandboxed\s+embed/i.test(snippet)) {
    return {
      url: rawUrl,
      ok: false,
      faultType: 'sandboxed_embed',
      httpStatus: status,
      reason: 'رسالة Sandboxed embed',
    };
  }
  const directMp4 = snippet.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)(?:\?[^\s"'<>]*)?/i)?.[0] || null;
  const frameBlocked =
    xFrame.toLowerCase().includes('deny') ||
    xFrame.toLowerCase().includes('sameorigin') ||
    /frame-ancestors\s+[^;]*'none'|frame-ancestors\s+'self'/i.test(csp);
  if (frameBlocked && !directMp4) {
    return {
      url: rawUrl,
      ok: false,
      faultType: 'frame_blocked',
      httpStatus: status,
      reason: 'السيرفر يمنع التضمين داخل إطار (X-Frame-Options)',
    };
  }

  return {
    url: rawUrl,
    ok: true,
    faultType: null,
    httpStatus: status || 200,
    reason: 'السيرفر يعمل بنجاح',
    directStreamUrl: directMp4,
  };
}

export async function filterServersInBrowser(urls: string[]): Promise<ServerFilterEntryResult[]> {
  const customBase = getCustomApiBaseUrl();
  return Promise.all(
    urls.map(async (rawUrl) => {
      if (!rawUrl || isLikelyNonVideoWebsiteUrl(rawUrl)) {
        return {
          url: rawUrl,
          ok: false,
          faultType: 'not_video' as const,
          httpStatus: 200,
          reason: 'الرابط يفتح صفحة موقع وليس مشغل فيديو',
        };
      }

      if (/\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(rawUrl)) {
        return {
          url: rawUrl,
          ok: true,
          faultType: null,
          httpStatus: 200,
          reason: 'ملف فيديو مباشر جاهز للتشغيل',
        };
      }

      if (customBase) {
        try {
          const workerUrl = `${customBase}/?url=${encodeURIComponent(rawUrl)}`;
          const res = await fetchWithTimeout(workerUrl, 5500);
          const finalUrl = res.headers.get('X-Final-Url') || rawUrl;
          const xFrame = res.headers.get('X-Upstream-X-Frame-Options') || '';
          const csp = res.headers.get('X-Upstream-CSP') || '';
          const text = await res.text().catch(() => '');
          const isWorkerTransportError =
            (res.status === 502 || res.status === 403 || res.status === 400) &&
            text.includes('"ok":false');
          if (!isWorkerTransportError) {
            return evaluateFetchedServerResponse(
              rawUrl,
              finalUrl,
              res.status,
              xFrame,
              csp,
              text.slice(0, 28000)
            );
          }
        } catch {
          // Worker unreachable or blocked -> fall through to public CORS relays / no-cors fallback below
        }
      }

      // No Cloudflare Worker configured: probe via AllOrigins JSON or secondary CodeTabs relay
      try {
        const relayRes = await fetchWithTimeout(
          `https://api.allorigins.win/get?url=${encodeURIComponent(rawUrl)}`,
          4000
        );
        if (relayRes.ok) {
          const json = (await relayRes.json()) as {
            contents?: string;
            status?: { http_code?: number; url?: string };
          };
          const upstreamStatus = Number(json?.status?.http_code || 200);
          const finalUrl = json?.status?.url || rawUrl;
          const snippet = String(json?.contents || '').slice(0, 28000);
          return evaluateFetchedServerResponse(rawUrl, finalUrl, upstreamStatus, '', '', snippet);
        }
      } catch {
        // Try secondary CORS relay below
      }

      try {
        const secondaryRes = await fetchWithTimeout(
          `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rawUrl)}`,
          4000
        );
        if (secondaryRes.ok) {
          const snippet = (await secondaryRes.text().catch(() => '')).slice(0, 28000);
          if (snippet) {
            return evaluateFetchedServerResponse(rawUrl, rawUrl, secondaryRes.status, '', '', snippet);
          }
        }
      } catch {
        // Fall through to network reachability check
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        try {
          await fetch(rawUrl, { mode: 'no-cors', signal: controller.signal });
          return {
            url: rawUrl,
            ok: true,
            faultType: null,
            httpStatus: 200,
            reason: 'متاح عبر المتصفح',
          };
        } finally {
          clearTimeout(timer);
        }
      } catch {
        return {
          url: rawUrl,
          ok: false,
          faultType: 'error' as const,
          httpStatus: 0,
          reason: 'الرابط معطل أو لا يستجيب',
        };
      }
    })
  );
}

async function verifyScrapedServersInBrowser(
  servers: StreamServer[],
  sourceOrigin: string
): Promise<StreamServer[]> {
  const preFiltered = servers.filter((s) => {
    const u = s.url || '';
    return u && !isLikelyNonVideoWebsiteUrl(u, sourceOrigin);
  });

  if (preFiltered.length === 0) return [];

  const urls = preFiltered.map((s) => s.url || '');
  const results = await filterServersInBrowser(urls);

  return preFiltered
    .filter((_, idx) => results[idx]?.ok !== false)
    .slice(0, 12)
    .map((srv, idx) => ({
      ...srv,
      id: srv.id || `srv-ext-${idx + 1}`,
      name: cleanBrowserServerName(srv.name, srv.url, idx),
    }));
}

function canonicalizeCompareUrlBrowser(rawUrl?: string): string {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl.trim());
    u.hash = '';
    return u.toString().replace(/\/+$/, '');
  } catch {
    return rawUrl.trim().replace(/\/+$/, '');
  }
}

async function scrapeFullItemInBrowser(
  mainUrl: string,
  mainHtml: string,
  options?: { skipEpisodeCrawl?: boolean }
): Promise<ScrapedPayload> {
  const { media, hints } = parseHtmlToMediaWithHintsBrowser(mainHtml, mainUrl);

  let watchUrl = hints.watchSubpageUrl;
  let downloadUrl = hints.downloadSubpageUrl;

  if (watchUrl && canonicalizeCompareUrlBrowser(watchUrl) !== canonicalizeCompareUrlBrowser(mainUrl)) {
    try {
      const u = new URL(watchUrl);
      if (!isBlockedHost(u.hostname)) {
        const watchRes = await fetchViaBrowserOrCorsRelay(watchUrl, 8000);
        if (watchRes.ok && watchRes.text.length > 100) {
          const watchParsed = parseHtmlToMediaWithHintsBrowser(watchRes.text, watchUrl);
          if (!media.trailerUrl && watchParsed.media.trailerUrl) {
            media.trailerUrl = watchParsed.media.trailerUrl;
          }
          if (watchParsed.media.servers.length > 0) {
            const merged = [...watchParsed.media.servers];
            const seen = new Set(merged.map((s) => s.url));
            for (const srv of media.servers) {
              if (srv.url && !seen.has(srv.url)) {
                merged.push(srv);
                seen.add(srv.url);
              }
            }
            media.servers = merged;
          }
          if (watchParsed.media.downloads.length > 0) {
            const seenDl = new Set(media.downloads.map((d) => d.url));
            for (const dl of watchParsed.media.downloads) {
              if (dl.url && !seenDl.has(dl.url)) {
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
      // non-fatal
    }
  }

  if (downloadUrl && downloadUrl !== mainUrl && downloadUrl !== watchUrl) {
    try {
      const u = new URL(downloadUrl);
      if (!isBlockedHost(u.hostname)) {
        const dlRes = await fetchViaBrowserOrCorsRelay(downloadUrl, 8000);
        if (dlRes.ok && dlRes.text.length > 100) {
          const dlParsed = parseHtmlToMediaWithHintsBrowser(dlRes.text, downloadUrl, {
            isDownloadPage: true,
          });
          if (dlParsed.media.downloads.length > 0) {
            const seenDl = new Set(media.downloads.map((d) => d.url));
            for (const dl of dlParsed.media.downloads) {
              if (dl.url && !seenDl.has(dl.url)) {
                media.downloads.push(dl);
                seenDl.add(dl.url);
              }
            }
          }
        }
      }
    } catch {
      // non-fatal
    }
  }

  let mainOrigin = '';
  try {
    if (mainUrl) mainOrigin = new URL(mainUrl).origin;
  } catch {
    // ignore
  }

  const [filteredServers, fallbackTrailer, resolvedImages, resolvedRating] = await Promise.all([
    verifyScrapedServersInBrowser(media.servers, mainOrigin),
    media.trailerUrl || options?.skipEpisodeCrawl
      ? Promise.resolve(media.trailerUrl)
      : findTrailerInBrowser({
          title: media.title,
          englishTitle: media.englishTitle,
          year: media.year,
          kind: media.kind,
        }),
    options?.skipEpisodeCrawl
      ? Promise.resolve(null)
      : import('./mediaImages')
          .then(({ resolveHighResImagesClient }) =>
            resolveHighResImagesClient({
              title: media.title,
              englishTitle: media.englishTitle,
              year: media.year,
              kind: media.kind,
              imdbId: media.imdbId,
              currentPoster: media.poster,
              currentBackdrop: media.backdrop,
              preferOfficial: true,
            })
          )
          .catch(() => null),
    options?.skipEpisodeCrawl || (hints.hasExplicitImdbRating && media.imdb !== 7.8)
      ? Promise.resolve(null)
      : import('./mediaRatings')
          .then(({ resolveSingleMediaRating }) =>
            resolveSingleMediaRating({
              title: media.title,
              englishTitle: media.englishTitle,
              year: media.year,
              kind: media.kind,
              imdbId: media.imdbId,
            })
          )
          .catch(() => null),
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

  // Follow distributed multi-season page links FIRST (/season-2, /season-3)
  if (!options?.skipEpisodeCrawl && hints.seasonPageUrls && hints.seasonPageUrls.length > 0) {
    const canonicalMain = canonicalizeCompareUrlBrowser(mainUrl);
    const visitedSeasonUrls = new Set<string>([canonicalMain]);
    for (const sLink of hints.seasonPageUrls) {
      const canonSeasonUrl = canonicalizeCompareUrlBrowser(sLink.url);
      if (!canonSeasonUrl || visitedSeasonUrls.has(canonSeasonUrl)) continue;
      visitedSeasonUrls.add(canonSeasonUrl);
      try {
        const parsedS = new URL(sLink.url);
        if (isBlockedHost(parsedS.hostname)) continue;
        const sRes = await fetchViaBrowserOrCorsRelay(sLink.url, 8500);
        if (!sRes.ok || sRes.text.length < 100) continue;
        const sParsed = parseHtmlToMediaWithHintsBrowser(sRes.text, sLink.url, {
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

  // Per-Episode Independent Server Extraction across ALL Seasons (never clone from root or other episodes)
  if (!options?.skipEpisodeCrawl && media.seasons.length > 0) {
    const canonicalMain = canonicalizeCompareUrlBrowser(mainUrl);
    const allTargets = media.seasons.flatMap((s) =>
      s.episodes.map((ep) => ({ seasonNumber: s.seasonNumber, ep }))
    );

    if (allTargets.length > 0) {
      if (media.kind !== 'wrestling') media.kind = 'series';

      const matchingMainCount = allTargets.filter(
        ({ ep }) => canonicalizeCompareUrlBrowser(ep.sourceUrl || ep.watchUrl || '') === canonicalMain
      ).length;

      const epFetchCache = new Map<string, { ok: boolean; text: string }>();
      const fetchEpisodeCached = async (targetUrl: string) => {
        const canon = canonicalizeCompareUrlBrowser(targetUrl);
        const cached = epFetchCache.get(canon);
        if (cached) return cached;
        const res = await fetchViaBrowserOrCorsRelay(targetUrl, 8500);
        const entry = { ok: res.ok, text: res.text };
        epFetchCache.set(canon, entry);
        return entry;
      };

      const EP_CONCURRENCY = getCustomApiBaseUrl() ? 4 : 3;
      for (let i = 0; i < allTargets.length; i += EP_CONCURRENCY) {
        const chunk = allTargets.slice(i, i + EP_CONCURRENCY);
        await Promise.all(
          chunk.map(async ({ seasonNumber, ep }) => {
            const epPageUrl = (ep.sourceUrl || ep.watchUrl || '').trim();
            ep.sourceUrl = epPageUrl;
            const canonicalEp = canonicalizeCompareUrlBrowser(epPageUrl);

            if (!canonicalEp) {
              ep.servers = [];
              ep.watchUrl = '';
              return;
            }

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
                  name: cleanBrowserServerName(s.name, s.url, sIdx),
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
                const epHintsCheck = parseHtmlToMediaWithHintsBrowser(epRes.text, epPageUrl).hints;
                const epData = await scrapeFullItemInBrowser(epPageUrl, epRes.text, {
                  skipEpisodeCrawl: true,
                });
                ep.servers = epData.servers
                  .filter((s) => s.url && !isLikelyNonVideoWebsiteUrl(s.url, mainOrigin))
                  .map((s, sIdx) => ({
                    ...s,
                    id: `ep-s${seasonNumber}-e${ep.number}-srv-${sIdx + 1}`,
                    name: cleanBrowserServerName(s.name, s.url, sIdx),
                  }));
                if (epHintsCheck.watchSubpageUrl) {
                  ep.watchSubpageUrl = epHintsCheck.watchSubpageUrl;
                }
                ep.watchUrl = ep.servers[0]?.url || '';
                return;
              }
            } catch {
              // Fall through cleanly
            }
            ep.servers = [];
            ep.watchUrl = '';
          })
        );
      }

      if (media.servers.length === 0) {
        const firstPopulatedEp = allTargets.find((t) => t.ep.servers && t.ep.servers.length > 0)?.ep;
        if (firstPopulatedEp?.servers) {
          media.servers = firstPopulatedEp.servers.map((s, sIdx) => ({
            ...s,
            id: `srv-ext-${sIdx + 1}`,
            name: cleanBrowserServerName(s.name, s.url, sIdx),
          }));
        }
      }
    }
  }

  return media;
}

async function tryWordPressSinglePostBrowser(
  parsedUrl: URL
): Promise<ScrapedPayload | null> {
  try {
    const rawSeg = parsedUrl.pathname.replace(/^\/+|\/+$/g, '').split('/').pop() || '';
    if (!rawSeg) return null;
    const decodedSlug = decodeURIComponent(rawSeg);
    const wpEndpoint = `${parsedUrl.origin}/wp-json/wp/v2/posts?slug=${encodeURIComponent(decodedSlug)}&_embed`;

    const res = await fetchWithTimeout(wpEndpoint, 8000);
    if (!res.ok) return null;
    const posts = (await res.json()) as {
      link?: string;
      title?: { rendered?: string };
      content?: { rendered?: string };
      excerpt?: { rendered?: string };
      _embedded?: {
        'wp:featuredmedia'?: { source_url?: string }[];
        'wp:term'?: { name?: string; taxonomy?: string }[][];
      };
    }[];

    if (!Array.isArray(posts) || posts.length === 0) return null;
    const post = posts[0];
    const postUrl = post.link || parsedUrl.toString();
    const htmlBody = `${post.content?.rendered || ''} ${post.excerpt?.rendered || ''}`;
    const parsed = parseHtmlToMediaWithHintsBrowser(htmlBody, postUrl).media;
    const tmpDoc = new DOMParser().parseFromString(post.title?.rendered || '', 'text/html');
    const rawTitle = cleanText(tmpDoc.body?.textContent);
    if (rawTitle) {
      parsed.title = rawTitle
        .replace(/\s*[-|–]\s*(مشاهدة|تحميل|أون لاين|اون لاين|بجودة عالية|مترجم).*$/i, '')
        .trim()
        .slice(0, 200);
      const enMatch = rawTitle.match(/[A-Za-z][A-Za-z0-9\s:'\-&]{2,}/);
      if (enMatch) parsed.englishTitle = cleanText(enMatch[0]);
    }
    const featured = post._embedded?.['wp:featuredmedia']?.[0]?.source_url;
    if (featured) {
      parsed.poster = upgradeKnownImageUrlScraper(featured);
      parsed.poster_url = parsed.poster;
      parsed.backdrop = '';
      parsed.backdrop_url = '';
      parsed.image_quality_status = 'missing_backdrop';
    }
    const termGroups = post._embedded?.['wp:term'] || [];
    for (const group of termGroups) {
      if (!Array.isArray(group)) continue;
      for (const term of group) {
        const nm = cleanText(term?.name);
        if (!nm) continue;
        if (term.taxonomy === 'category' && !parsed.categories.includes(nm) && parsed.categories.length < 8) {
          parsed.categories.push(nm);
        } else if (
          term.taxonomy === 'post_tag' &&
          !parsed.genres.includes(nm) &&
          parsed.genres.length < 8
        ) {
          parsed.genres.push(nm);
        }
      }
    }
    try {
      const { resolveHighResImagesClient } = await import('./mediaImages');
      const resolved = await resolveHighResImagesClient({
        title: parsed.title,
        englishTitle: parsed.englishTitle,
        year: parsed.year,
        kind: parsed.kind,
        imdbId: parsed.imdbId,
        currentPoster: parsed.poster,
        currentBackdrop: parsed.backdrop,
        preferOfficial: true,
      });
      if (resolved.poster_url) {
        parsed.poster = resolved.poster_url;
        parsed.poster_url = resolved.poster_url;
      }
      parsed.poster_width = resolved.poster_width;
      parsed.poster_height = resolved.poster_height;
      parsed.backdrop = resolved.backdrop_url;
      parsed.backdrop_url = resolved.backdrop_url;
      parsed.backdrop_width = resolved.backdrop_width;
      parsed.backdrop_height = resolved.backdrop_height;
      parsed.image_source = resolved.image_source;
      parsed.image_quality_status = resolved.image_quality_status;
    } catch {
      // non-fatal
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function scrapeSingleInBrowser(params: {
  url?: string;
  rawHtml?: string;
  adapter?: ScraperAdapter;
}): Promise<{
  ok: boolean;
  error?: string;
  extracted?: ScrapedPayload;
  adapterUsed?: { id: string; name: string; version: number };
}> {
  const { url, rawHtml, adapter } = params;

  if (adapter && adapter.enabled) {
    try {
      const { scrapeSingleWithAdapterInBrowser } = await import('./clientAdapterEngine');
      return await scrapeSingleWithAdapterInBrowser({ url, rawHtml, adapter });
    } catch {
      // Fall back to generic browser extraction if dynamic import fails
    }
  }

  if (rawHtml && rawHtml.trim().length > 20) {
    const canonicalInHtml =
      rawHtml.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
      rawHtml.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      '';
    const effectiveUrl = (url && url.trim()) || canonicalInHtml || '';
    const parsedHtml = parseHtmlToMediaWithHintsBrowser(rawHtml, effectiveUrl);
    const extracted = parsedHtml.media;
    extracted.servers = extracted.servers.filter((s) => s.url && !isLikelyNonVideoWebsiteUrl(s.url));
    const [trailer, resolvedImgs, resolvedRating] = await Promise.all([
      extracted.trailerUrl
        ? Promise.resolve(extracted.trailerUrl)
        : findTrailerInBrowser({
            title: extracted.title,
            englishTitle: extracted.englishTitle,
            year: extracted.year,
            kind: extracted.kind,
          }),
      import('./mediaImages')
        .then(({ resolveHighResImagesClient }) =>
          resolveHighResImagesClient({
            title: extracted.title,
            englishTitle: extracted.englishTitle,
            year: extracted.year,
            kind: extracted.kind,
            imdbId: extracted.imdbId,
            currentPoster: extracted.poster,
            currentBackdrop: extracted.backdrop,
            preferOfficial: true,
          })
        )
        .catch(() => null),
      parsedHtml.hints.hasExplicitImdbRating && extracted.imdb !== 7.8
        ? Promise.resolve(null)
        : import('./mediaRatings')
            .then(({ resolveSingleMediaRating }) =>
              resolveSingleMediaRating({
                title: extracted.title,
                englishTitle: extracted.englishTitle,
                year: extracted.year,
                kind: extracted.kind,
                imdbId: extracted.imdbId,
              })
            )
            .catch(() => null),
    ]);
    extracted.trailerUrl = trailer || '';
    if (resolvedRating && resolvedRating.imdb > 0) {
      extracted.imdb = resolvedRating.imdb;
      if (!extracted.imdbId && resolvedRating.imdbId) {
        extracted.imdbId = resolvedRating.imdbId;
      }
      if (resolvedRating.votes) {
        extracted.votes = resolvedRating.votes;
      }
      if (
        (!extracted.year || extracted.year === '2026') &&
        resolvedRating.year &&
        /^(?:19|20)\d{2}$/.test(resolvedRating.year)
      ) {
        extracted.year = resolvedRating.year;
      }
    }
    if (resolvedImgs) {
      if (resolvedImgs.poster_url) {
        extracted.poster = resolvedImgs.poster_url;
        extracted.poster_url = resolvedImgs.poster_url;
      }
      extracted.poster_width = resolvedImgs.poster_width;
      extracted.poster_height = resolvedImgs.poster_height;
      extracted.backdrop = resolvedImgs.backdrop_url;
      extracted.backdrop_url = resolvedImgs.backdrop_url;
      extracted.backdrop_width = resolvedImgs.backdrop_width;
      extracted.backdrop_height = resolvedImgs.backdrop_height;
      extracted.image_source = resolvedImgs.image_source;
      extracted.image_quality_status = resolvedImgs.image_quality_status;
    }
    return { ok: true, extracted };
  }

  if (!url || !url.trim()) {
    return { ok: false, error: 'يرجى إدخال رابط صفحة صالح أو لصق كود HTML.' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    return { ok: false, error: 'صيغة الرابط غير صحيحة. يجب أن يبدأ بـ https://' };
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { ok: false, error: 'البروتوكول المسموح هو HTTP أو HTTPS فقط.' };
  }
  if (isBlockedHost(parsedUrl.hostname)) {
    return { ok: false, error: 'لا يُسمح بجلب الروابط الداخلية أو المحلية.' };
  }

  const fetched = await fetchViaBrowserOrCorsRelay(parsedUrl.toString(), 12000);
  if (fetched.ok && fetched.text.length >= 100) {
    const extracted = await scrapeFullItemInBrowser(parsedUrl.toString(), fetched.text);
    return { ok: true, extracted };
  }

  const wpSingle = await tryWordPressSinglePostBrowser(parsedUrl);
  if (wpSingle) {
    return { ok: true, extracted: wpSingle };
  }

  return {
    ok: false,
    error:
      'منع هذا الموقع الجلب المباشر من المتصفح (CORS/Cloudflare) وتعذرت مرحّلات البروكسي العامة. الحل الأسرع: افتح تبويب "لصق كود HTML" (Ctrl+U)، أو أنشئ Cloudflare Worker مجاني في الإعدادات ليصبح الجلب بنفس كفاءة المعاينة على GitHub Pages.',
  };
}

export async function scrapeSiteInBrowser(params: {
  siteUrl?: string;
  rawHtml?: string;
  maxItems?: number;
  maxPages?: number;
  deepScrape?: boolean;
  adapter?: ScraperAdapter;
}): Promise<{
  ok: boolean;
  error?: string;
  strategy?: string;
  siteTitle?: string;
  totalDiscovered?: number;
  items?: ScrapedPayload[];
  adapterUsed?: { id: string; name: string; version: number };
}> {
  const { siteUrl, rawHtml, maxItems = 30, maxPages = 3, deepScrape = true, adapter } = params;
  const itemLimit = Math.min(80, Math.max(1, Number(maxItems) || 30));
  const pageLimit = Math.min(8, Math.max(1, Number(maxPages) || 3));

  let parsedSiteUrl: URL | null = null;
  if (siteUrl && siteUrl.trim()) {
    try {
      parsedSiteUrl = new URL(siteUrl.trim());
    } catch {
      return { ok: false, error: 'رابط الموقع غير صالح. يجب أن يبدأ بـ https://' };
    }
    if (!['http:', 'https:'].includes(parsedSiteUrl.protocol)) {
      return { ok: false, error: 'البروتوكول المسموح هو HTTP أو HTTPS فقط.' };
    }
    if (isBlockedHost(parsedSiteUrl.hostname)) {
      return { ok: false, error: 'لا يُسمح بجلب الروابط الداخلية أو المحلية.' };
    }
  }

  if (!parsedSiteUrl && (!rawHtml || rawHtml.trim().length < 50)) {
    return { ok: false, error: 'يرجى إدخال رابط الموقع المستهدف أو لصق سورس الصفحة الرئيسية.' };
  }

  if (parsedSiteUrl && (!rawHtml || rawHtml.trim().length < 50)) {
    const origin = parsedSiteUrl.origin;

    const bloggerRes = await tryBloggerFeedBrowser(origin, itemLimit);
    if (bloggerRes && bloggerRes.items.length > 0) {
      return {
        ok: true,
        strategy: 'Blogger JSONP Feed (بدون خادم)',
        siteTitle: bloggerRes.siteTitle,
        totalDiscovered: bloggerRes.items.length,
        items: bloggerRes.items,
      };
    }
  }

  const discoveredMap = new Map<string, { url: string; title: string; poster: string }>();
  let siteTitle = parsedSiteUrl ? parsedSiteUrl.hostname : 'موقع مستورد';
  let strategy = rawHtml ? 'HTML Source Crawler (بدون خادم)' : 'Browser Crawler + Subpages';

  if (rawHtml && rawHtml.trim().length >= 50) {
    const baseForHtml = parsedSiteUrl ? parsedSiteUrl.toString() : 'https://example.com';
    const resHtml = extractListingLinksAndPaginationBrowser(rawHtml, baseForHtml);
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

      const pageRes = await fetchViaBrowserOrCorsRelay(currentUrl, 12000).catch(() => null);
      if (!pageRes || !pageRes.ok || pageRes.text.length < 100) {
        if (visitedPages.size === 1) {
          const wpFallback = await tryWordPressApiBrowser(parsedSiteUrl.origin, itemLimit);
          if (wpFallback && wpFallback.items.length > 0) {
            return {
              ok: true,
              strategy: getCustomApiBaseUrl()
                ? 'WordPress REST API'
                : 'WordPress REST API (فعّل Cloudflare Worker لجلب السيرفرات)',
              siteTitle: wpFallback.siteTitle,
              totalDiscovered: wpFallback.items.length,
              items: wpFallback.items,
            };
          }

          const smUrls = await trySitemapDiscoveryBrowser(parsedSiteUrl.origin, itemLimit);
          if (smUrls.length > 0) {
            strategy = 'XML Sitemap Crawler (بدون خادم)';
            for (const u of smUrls) {
              discoveredMap.set(u, {
                url: u,
                title: decodeURIComponent(u.split('/').pop() || u),
                poster: '',
              });
            }
            break;
          }
          return {
            ok: false,
            error:
              'رفض الموقع الوصول التلقائي عبر المتصفح (حماية Cloudflare أو CORS). افتح تبويب الإعدادات لإضافة Cloudflare Worker المجاني، أو استخدم وضع "لصق HTML الموقع".',
          };
        }
        continue;
      }

      const extractedPage = extractListingLinksAndPaginationBrowser(pageRes.text, currentUrl);
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
      const wpFallback = await tryWordPressApiBrowser(parsedSiteUrl.origin, itemLimit);
      if (wpFallback && wpFallback.items.length > 0) {
        return {
          ok: true,
          strategy: 'WordPress REST API',
          siteTitle: wpFallback.siteTitle,
          totalDiscovered: wpFallback.items.length,
          items: wpFallback.items,
        };
      }

      const smUrls = await trySitemapDiscoveryBrowser(parsedSiteUrl.origin, itemLimit);
      if (smUrls.length > 0) {
        strategy = 'XML Sitemap Crawler (بدون خادم)';
        for (const u of smUrls) {
          discoveredMap.set(u, {
            url: u,
            title: decodeURIComponent(u.split('/').pop() || u),
            poster: '',
          });
        }
      }
    }
  }

  const candidates = Array.from(discoveredMap.values()).slice(0, itemLimit);
  if (candidates.length === 0) {
    return {
      ok: false,
      error:
        'لم يتم العثور على بطاقات أفلام أو مسلسلات في الرابط المحدد. جرّب لصق كود HTML للصفحة في وضع "لصق HTML الموقع".',
    };
  }

  const finalItems: ScrapedPayload[] = [];
  if (deepScrape) {
    const CONCURRENCY = getCustomApiBaseUrl() ? 4 : 3;
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const chunk = candidates.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (card) => {
          try {
            if (adapter && adapter.enabled) {
              const { scrapeSingleWithAdapterInBrowser } = await import('./clientAdapterEngine');
              const adpRes = await scrapeSingleWithAdapterInBrowser({ url: card.url, adapter });
              if (adpRes.ok && adpRes.extracted) {
                const parsed = adpRes.extracted;
                if (!parsed.poster && card.poster) {
                  parsed.poster = upgradeKnownImageUrlScraper(card.poster);
                  parsed.poster_url = parsed.poster;
                }
                if ((!parsed.title || parsed.title === 'عمل مستورد جديد') && card.title) {
                  parsed.title = card.title;
                }
                return parsed;
              }
            }
            const detailRes = await fetchViaBrowserOrCorsRelay(card.url, 9000);
            if (detailRes.ok && detailRes.text.length > 150) {
              const parsed = await scrapeFullItemInBrowser(card.url, detailRes.text);
              if (!parsed.poster && card.poster) {
                parsed.poster = upgradeKnownImageUrlScraper(card.poster);
                parsed.poster_url = parsed.poster;
                parsed.backdrop = '';
                parsed.backdrop_url = '';
                parsed.image_quality_status = 'missing_backdrop';
              }
              if ((!parsed.title || parsed.title === 'عمل مستورد جديد') && card.title) {
                parsed.title = card.title;
              }
              return parsed;
            }
          } catch {
            // Fall back to card summary
          }
          return buildFallbackCardItem(card);
        })
      );
      finalItems.push(...results);
    }
  } else {
    for (const card of candidates) {
      finalItems.push(buildFallbackCardItem(card));
    }
  }

  const needsRating = finalItems
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => !it.imdb || it.imdb === 7.8);
  if (needsRating.length > 0) {
    try {
      const { resolveMediaRatingsBatch } = await import('./mediaRatings');
      const resolvedMap = await resolveMediaRatingsBatch(
        needsRating.map(({ it, idx }) => ({
          id: String(idx),
          title: it.title,
          englishTitle: it.englishTitle,
          year: it.year,
          kind: it.kind,
          imdbId: it.imdbId,
        }))
      );
      for (const { it, idx } of needsRating) {
        const found = resolvedMap[String(idx)];
        if (found && found.imdb > 0) {
          it.imdb = found.imdb;
          if (!it.imdbId && found.imdbId) it.imdbId = found.imdbId;
          if (found.votes) it.votes = found.votes;
          if ((!it.year || it.year === '2026') && found.year && /^(?:19|20)\d{2}$/.test(found.year)) {
            it.year = found.year;
          }
        }
      }
    } catch {
      // non-fatal
    }
  }

  return {
    ok: true,
    strategy,
    siteTitle,
    totalDiscovered: finalItems.length,
    items: finalItems,
    ...(adapter && adapter.enabled
      ? { adapterUsed: { id: adapter.id, name: adapter.name, version: adapter.version } }
      : {}),
  };
}

function buildFallbackCardItem(card: { url: string; title: string; poster: string }): ScrapedPayload {
  const isSeries = /مسلسل|حلقات/.test(card.title);
  const inferredYear = inferEffectiveYear(card.title).year;
  return {
    title: card.title || 'عمل مستورد',
    englishTitle: extractCleanEnglishTitleCandidate(card.title) || card.title || 'Imported Title',
    kind: isSeries ? 'series' : 'movie',
    categories: isSeries
      ? ['مسلسلات', /عربي|مصري/.test(card.title) ? 'مسلسلات عربية' : 'مسلسلات اجنبية']
      : ['افلام', /عربي|مصري/.test(card.title) ? 'افلام عربية' : 'افلام اجنبية'],
    genres: ['دراما'],
    year: inferredYear || '2026',
    country: 'الولايات المتحدة',
    language: 'مترجم للعربية',
    quality: 'WEB-DL',
    duration: '120 دقيقة',
    imdb: 7.8,
    votes: '10,000',
    poster: upgradeKnownImageUrlScraper(card.poster),
    backdrop: '',
    poster_url: upgradeKnownImageUrlScraper(card.poster),
    backdrop_url: '',
    poster_width: 0,
    poster_height: 0,
    backdrop_width: 0,
    backdrop_height: 0,
    image_source: card.poster ? 'scraped' : 'none',
    image_quality_status: 'missing_backdrop',
    tagline: card.title,
    story: card.title,
    sourceUrl: card.url,
    shortUrl: '',
    trailerUrl: '',
    cast: [],
    servers: [],
    downloads: [],
    seasons: [],
  };
}

export async function checkServerUrlsInBrowser(
  urls: string[]
): Promise<Record<string, { status: 'working' | 'warning' | 'broken'; label: string; detail: string }>> {
  const results: Record<
    string,
    { status: 'working' | 'warning' | 'broken'; label: string; detail: string }
  > = {};

  const filtered = await filterServersInBrowser(urls);
  filtered.forEach((entry) => {
    if (entry.ok) {
      results[entry.url] = {
        status: 'working',
        label: 'يعمل بشكل سليم',
        detail: entry.reason || 'السيرفر صالح للتشغيل',
      };
    } else if (entry.faultType === 'frame_blocked') {
      results[entry.url] = {
        status: 'warning',
        label: 'تحذير تضمين',
        detail: entry.reason,
      };
    } else {
      results[entry.url] = {
        status: 'broken',
        label: entry.faultType === 'not_video' ? 'صفحة موقع وليست فيديو' : 'سيرفر معطل',
        detail: entry.reason,
      };
    }
  });

  return results;
}

function extractUrlFromServerCandidate(srv?: { url?: string; embedCode?: string; watchUrl?: string }): string {
  if (!srv) return '';
  if (srv.embedCode) {
    const match = srv.embedCode.match(/src\s*=\s*["']([^"']+)["']/i);
    if (match?.[1] && /^https?:\/\//i.test(match[1].trim())) return match[1].trim();
    if (/^https?:\/\//i.test(srv.embedCode.trim())) return srv.embedCode.trim();
  }
  if (srv.url && /^https?:\/\//i.test(srv.url.trim())) return srv.url.trim();
  if (srv.watchUrl && /^https?:\/\//i.test(srv.watchUrl.trim())) return srv.watchUrl.trim();
  return '';
}

async function runFilterServersUnified(urls: string[]): Promise<Record<string, ServerFilterEntryResult>> {
  const uniqueUrls = Array.from(new Set(urls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u))));
  const resultMap: Record<string, ServerFilterEntryResult> = {};
  if (uniqueUrls.length === 0) return resultMap;

  for (let i = 0; i < uniqueUrls.length; i += 45) {
    const chunk = uniqueUrls.slice(i, i + 45);
    let backendResults: ServerFilterEntryResult[] | null = null;
    if (!shouldSkipBackendApiCalls()) {
      try {
        const response = await fetch(resolveApiEndpoint('/api/filter-servers'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: chunk }),
        });
        const ct = response.headers.get('content-type') || '';
        if (response.ok && ct.includes('application/json')) {
          const json = (await response.json()) as {
            ok?: boolean;
            results?: ServerFilterEntryResult[];
          };
          if (json.ok && Array.isArray(json.results)) {
            backendResults = json.results;
          }
        }
      } catch {
        // Static hosting -> fall back to browser/Worker filter
      }
    }

    const entries = backendResults || (await filterServersInBrowser(chunk));
    entries.forEach((entry) => {
      if (entry && entry.url) {
        resultMap[entry.url] = entry;
      }
    });
  }

  return resultMap;
}

export async function verifyAndFilterItemServers(item: MediaItem): Promise<{
  cleanedItem: MediaItem;
  removedCount: number;
  removedReasons: string[];
  totalValidServers: number;
}> {
  const allUrls: string[] = [];

  (item.servers || []).forEach((s) => {
    const u = extractUrlFromServerCandidate(s);
    if (u) allUrls.push(u);
  });

  (item.seasons || []).forEach((season) => {
    (season.episodes || []).forEach((ep) => {
      (ep.servers || []).forEach((s) => {
        const u = extractUrlFromServerCandidate(s);
        if (u) allUrls.push(u);
      });
      const epU = extractUrlFromServerCandidate(ep);
      if (epU) allUrls.push(epU);
    });
  });

  const filterMap = await runFilterServersUnified(allUrls);
  let removedCount = 0;
  const removedReasons: string[] = [];

  const isHealthyServer = (srv: { url?: string; embedCode?: string; watchUrl?: string }): boolean => {
    const u = extractUrlFromServerCandidate(srv);
    if (!u || isLikelyNonVideoWebsiteUrl(u)) {
      if (u || srv.url || srv.embedCode || srv.watchUrl) {
        removedCount++;
        removedReasons.push('رابط موقع أو فارغ');
      }
      return false;
    }
    const status = filterMap[u];
    if (status && !status.ok) {
      removedCount++;
      if (status.reason && !removedReasons.includes(status.reason)) {
        removedReasons.push(status.reason);
      }
      return false;
    }
    return true;
  };

  const resolveCleanedServerName = (rawName: string | undefined, idx: number): string => {
    const trimmed = String(rawName || '').trim();
    if (!trimmed || /^سيرفر\s*\d*$/i.test(trimmed) || /^(?:مستورد|embed|server\s*\d*)$/i.test(trimmed)) {
      return `سيرفر ${idx + 1}`;
    }
    return trimmed;
  };

  let cleanedRootServers = (item.servers || [])
    .filter((s) => isHealthyServer(s))
    .map((s, idx) => ({
      ...s,
      id: s.id || `srv-${Date.now()}-${idx + 1}`,
      name: resolveCleanedServerName(s.name, idx),
    }));

  const cleanedSeasons = (item.seasons || []).map((season) => ({
    ...season,
    episodes: (season.episodes || []).map((ep) => {
      const validEpServers = (ep.servers || [])
        .filter((s) => isHealthyServer(s))
        .map((s, idx) => ({
          ...s,
          id: s.id || `ep-s${season.seasonNumber}-e${ep.number}-srv-${idx + 1}`,
          name: resolveCleanedServerName(s.name, idx),
        }));

      let validWatchUrl = ep.watchUrl || '';
      let validEmbedCode = ep.embedCode || '';
      const epSingleUrl = extractUrlFromServerCandidate({ watchUrl: validWatchUrl, embedCode: validEmbedCode });
      if (epSingleUrl && (isLikelyNonVideoWebsiteUrl(epSingleUrl) || (filterMap[epSingleUrl] && !filterMap[epSingleUrl].ok))) {
        if (validEpServers.length === 0) {
          removedCount++;
        }
        validWatchUrl = '';
        validEmbedCode = '';
      }

      if (!validWatchUrl && validEpServers[0]?.url) {
        validWatchUrl = validEpServers[0].url;
      }

      return {
        ...ep,
        watchUrl: validWatchUrl,
        embedCode: validEmbedCode,
        servers: validEpServers,
      };
    }),
  }));

  if (cleanedRootServers.length === 0 && cleanedSeasons.length > 0) {
    const firstValidEp = cleanedSeasons
      .flatMap((s) => s.episodes)
      .find((ep) => ep.servers && ep.servers.length > 0);
    if (firstValidEp?.servers) {
      cleanedRootServers = firstValidEp.servers.map((s, idx) => ({
        ...s,
        id: `srv-${Date.now()}-${idx + 1}`,
        name: resolveCleanedServerName(s.name, idx),
      }));
    }
  }

  const totalEpServers = cleanedSeasons.reduce(
    (sum, season) =>
      sum +
      season.episodes.reduce(
        (eSum, ep) =>
          eSum +
          (ep.servers?.length || (extractUrlFromServerCandidate({ watchUrl: ep.watchUrl, embedCode: ep.embedCode }) ? 1 : 0)),
        0
      ),
    0
  );

  return {
    cleanedItem: {
      ...item,
      servers: cleanedRootServers,
      seasons: cleanedSeasons,
    },
    removedCount,
    removedReasons,
    totalValidServers: cleanedRootServers.length + totalEpServers,
  };
}
