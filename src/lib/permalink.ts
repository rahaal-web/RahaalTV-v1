import { MediaItem } from '../types/media';

export function getAppBasePrefix(): string {
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  return base === '/' ? '' : base.replace(/\/+$/, '');
}

export function generateCleanSlug(
  englishTitle?: string,
  title?: string,
  fallbackId?: string
): string {
  const asciiSource = String(englishTitle || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);

  const fallbackClean = String(fallbackId || `work-${Date.now()}`)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);

  if (asciiSource.length >= 3) {
    const suffix = fallbackClean.slice(-6).replace(/^-+/, '') || Date.now().toString(36).slice(-5);
    return `${asciiSource}-${suffix}`.slice(0, 120);
  }

  const titleSafe = String(title || '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim();
  if (fallbackClean) return fallbackClean;
  return `work-${titleSafe ? Date.now().toString(36) : Date.now()}`;
}

export function buildDedicatedMediaUrl(
  target: { id: string; slug?: string },
  episodeNumber?: number
): string {
  const slugOrId = encodeURIComponent((target.slug || target.id || '').trim() || 'work');
  const epSuffix = episodeNumber && episodeNumber > 1 ? `?ep=${episodeNumber}` : '';

  if (typeof window !== 'undefined' && window.location?.origin) {
    const prefix = getAppBasePrefix();
    return `${window.location.origin}${prefix}/#/watch/${slugOrId}${epSuffix}`;
  }
  return `https://rahaltv.com/#/watch/${slugOrId}${epSuffix}`;
}

const KNOWN_THIRD_PARTY_SCRAPE_HINTS =
  /(q-drama|akwam|larooza|laroza|mycima|wecima|cimawbas|cimaclub|faselhd|egybest|arabseed|shahed4u|cima4u|tuktukcinema|play\.php\?vid=|watch\.php\?vid=)/i;

export function isDedicatedAppShortUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (KNOWN_THIRD_PARTY_SCRAPE_HINTS.test(trimmed)) return false;

  try {
    const parsed = new URL(trimmed);
    const hasWatchRoute =
      parsed.searchParams.has('watch') ||
      parsed.pathname.includes('/watch/') ||
      parsed.hash.includes('/watch/');
    if (!hasWatchRoute) return false;
    if (typeof window !== 'undefined' && window.location?.origin) {
      return parsed.origin === window.location.origin;
    }
    return parsed.hostname.includes('rahaltv');
  } catch {
    return false;
  }
}

export function resolveDisplayShortUrl(
  item: { id: string; slug?: string; shortUrl?: string },
  episodeNumber?: number
): string {
  if (!episodeNumber || episodeNumber <= 1) {
    if (isDedicatedAppShortUrl(item.shortUrl)) {
      return item.shortUrl!.trim();
    }
  }
  return buildDedicatedMediaUrl(item, episodeNumber);
}

export function readWatchRouteFromLocation(): {
  watchKey: string | null;
  episode: number | null;
  openDownloads?: boolean;
} {
  if (typeof window === 'undefined') {
    return { watchKey: null, episode: null, openDownloads: false };
  }

  const { pathname, search, hash } = window.location;
  const params = new URLSearchParams(search);
  const hashQIdx = hash.indexOf('?');
  const hashParams = new URLSearchParams(hashQIdx >= 0 ? hash.slice(hashQIdx + 1) : '');

  const epRaw = Number(hashParams.get('ep') || params.get('ep') || '0');
  const episode = Number.isFinite(epRaw) && epRaw >= 1 ? Math.floor(epRaw) : null;
  const openDownloads = hashParams.get('dl') === '1' || params.get('dl') === '1';

  const hashPath = hashQIdx >= 0 ? hash.slice(0, hashQIdx) : hash;
  const hashMatch = hashPath.match(/^#\/?watch\/([^/?#]+)/i);
  if (hashMatch?.[1]) {
    try {
      return { watchKey: decodeURIComponent(hashMatch[1]), episode, openDownloads };
    } catch {
      return { watchKey: hashMatch[1], episode, openDownloads };
    }
  }

  const queryWatch = params.get('watch') || params.get('v');
  if (queryWatch && queryWatch.trim()) {
    return { watchKey: queryWatch.trim(), episode, openDownloads };
  }

  const prefix = getAppBasePrefix();
  const relPath = prefix && pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
  const pathMatch = relPath.match(/^\/?watch\/([^/?#]+)/i);
  if (pathMatch?.[1]) {
    try {
      return { watchKey: decodeURIComponent(pathMatch[1]), episode, openDownloads };
    } catch {
      return { watchKey: pathMatch[1], episode, openDownloads };
    }
  }

  return { watchKey: null, episode: null, openDownloads: false };
}

export function findMediaByRouteKey(catalog: MediaItem[], routeKey: string): MediaItem | undefined {
  const clean = routeKey.trim().toLowerCase();
  if (!clean) return undefined;
  return catalog.find(
    (item) =>
      (item.slug || '').toLowerCase() === clean ||
      (item.id || '').toLowerCase() === clean
  );
}
