import { getActiveFirebaseConfig } from './dbConnectionManager';
import { MediaItem } from '../types/media';

const CATALOG_CACHE_PREFIX = 'rahaltv_catalog_cache_v1';
const MAX_CACHED_ITEMS = 60;
const MAX_CACHE_JSON_BYTES = 220_000;

let defaultFallbackPoster = '/og-cover.jpg';
let defaultFallbackBackdrop = '/og-cover.jpg';

export function configureCatalogCacheFallbacks(poster: string, backdrop: string): void {
  if (poster) defaultFallbackPoster = poster;
  if (backdrop) defaultFallbackBackdrop = backdrop;
}

function resolveMediaAssetUrlLocal(url: unknown, fallback = ''): string {
  const clean = String(url || '').trim();
  if (!clean) return fallback;
  if (clean.startsWith('/src/assets/')) {
    const metaEnv = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
    const base = metaEnv?.BASE_URL || '/';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    return `${normalizedBase}${clean.slice(1)}`;
  }
  return clean;
}

export function normalizeFirestoreMediaRecord(
  docId: string,
  rawInput: Record<string, unknown>,
  fallbacks?: { poster?: string; backdrop?: string }
): MediaItem {
  const fallbackPoster = fallbacks?.poster || defaultFallbackPoster;
  const fallbackBackdrop = fallbacks?.backdrop || defaultFallbackBackdrop;
  const raw = rawInput as Partial<MediaItem> & {
    createdAt?: { toMillis?: () => number };
    updatedAt?: { toMillis?: () => number };
  };
  const createdAtMs =
    raw.createdAt && typeof raw.createdAt.toMillis === 'function'
      ? raw.createdAt.toMillis()
      : typeof raw.createdAtMs === 'number'
        ? raw.createdAtMs
        : 0;
  const updatedAtMs =
    raw.updatedAt && typeof raw.updatedAt.toMillis === 'function'
      ? raw.updatedAt.toMillis()
      : typeof raw.updatedAtMs === 'number'
        ? raw.updatedAtMs
        : createdAtMs;
  const poster = resolveMediaAssetUrlLocal(raw.poster_url || raw.poster, fallbackPoster);
  const rawDistinctBackdrop =
    raw.backdrop_url !== undefined
      ? resolveMediaAssetUrlLocal(raw.backdrop_url, '')
      : resolveMediaAssetUrlLocal(raw.backdrop, '');
  const backdropUrlNormalized =
    rawDistinctBackdrop && rawDistinctBackdrop !== poster ? rawDistinctBackdrop : '';
  const backdrop = rawDistinctBackdrop || fallbackBackdrop;
  const parsedImdb = Number(raw.imdb);
  return {
    ...raw,
    id: String(raw.id || docId),
    slug: raw.slug || String(raw.id || docId),
    title: raw.title || raw.englishTitle || 'عمل بدون عنوان',
    englishTitle: raw.englishTitle || raw.title || 'Untitled',
    kind: raw.kind || 'movie',
    categories:
      Array.isArray(raw.categories) && raw.categories.length > 0 ? raw.categories : ['افلام'],
    genres: Array.isArray(raw.genres) ? raw.genres : [],
    year: String(raw.year || '2026'),
    country: raw.country || 'غير محدد',
    language: raw.language || 'مترجم للعربية',
    quality: raw.quality || 'HD',
    duration: raw.duration || '',
    imdb: Number.isFinite(parsedImdb) ? parsedImdb : 0,
    votes: raw.votes || '0',
    story: raw.story || '',
    cast: Array.isArray(raw.cast) ? raw.cast : [],
    servers: Array.isArray(raw.servers) ? raw.servers : [],
    downloads: Array.isArray(raw.downloads) ? raw.downloads : [],
    seasons: Array.isArray(raw.seasons) ? raw.seasons : [],
    franchiseIds: Array.isArray(raw.franchiseIds) ? raw.franchiseIds : [],
    poster,
    backdrop,
    poster_url: poster,
    backdrop_url: backdropUrlNormalized,
    createdAtMs,
    updatedAtMs,
  } as MediaItem;
}

export function sortMediaCatalog(items: MediaItem[]): MediaItem[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    const tDiff = (b.updatedAtMs || b.createdAtMs || 0) - (a.updatedAtMs || a.createdAtMs || 0);
    if (tDiff !== 0) return tDiff;
    return (parseInt(b.year || '0', 10) || 0) - (parseInt(a.year || '0', 10) || 0);
  });
  return sorted;
}

export function mergeProgressiveMediaItems(
  primary: MediaItem[],
  secondary: MediaItem[]
): MediaItem[] {
  if (secondary.length === 0) return sortMediaCatalog(primary);
  if (primary.length === 0) return sortMediaCatalog(secondary);

  const byId = new Map<string, MediaItem>();
  for (const item of secondary) {
    if (item && item.id) {
      byId.set(item.id, item);
    }
  }
  for (const item of primary) {
    if (item && item.id) {
      byId.set(item.id, item);
    }
  }
  return sortMediaCatalog(Array.from(byId.values()));
}

export function compactMediaItemForCache(item: MediaItem): MediaItem {
  const seasonsJsonSize =
    Array.isArray(item.seasons) && item.seasons.length > 0
      ? JSON.stringify(item.seasons).length
      : 0;

  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    englishTitle: item.englishTitle,
    kind: item.kind,
    categories: Array.isArray(item.categories) ? item.categories.slice(0, 6) : ['افلام'],
    genres: Array.isArray(item.genres) ? item.genres.slice(0, 6) : [],
    year: item.year,
    country: item.country,
    language: item.language,
    quality: item.quality,
    duration: item.duration,
    imdb: item.imdb,
    votes: item.votes,
    views: item.views,
    likes: item.likes,
    pinned: Boolean(item.pinned),
    isNew: Boolean(item.isNew),
    comingSoon: Boolean(item.comingSoon),
    poster: item.poster,
    backdrop: item.backdrop,
    poster_url: item.poster_url,
    backdrop_url: item.backdrop_url,
    tagline: item.tagline || '',
    story: typeof item.story === 'string' ? item.story.slice(0, 420) : '',
    shortUrl: item.shortUrl || '',
    trailerUrl: item.trailerUrl || '',
    trailerLabel: item.trailerLabel || '',
    trailerDuration: item.trailerDuration || '',
    cast: Array.isArray(item.cast) ? item.cast.slice(0, 6) : [],
    seasons: seasonsJsonSize > 0 && seasonsJsonSize <= 3500 ? item.seasons : [],
    franchiseIds: Array.isArray(item.franchiseIds) ? item.franchiseIds.slice(0, 6) : [],
    servers: Array.isArray(item.servers) ? item.servers.slice(0, 6) : [],
    downloads: Array.isArray(item.downloads) ? item.downloads.slice(0, 3) : [],
    createdAtMs: item.createdAtMs || 0,
    updatedAtMs: item.updatedAtMs || 0,
  };
}

export function getActiveCatalogCacheKey(): string {
  try {
    const cfg = getActiveFirebaseConfig();
    const proj = (cfg.projectId || 'default').trim() || 'default';
    const dbId = (cfg.firestoreDatabaseId || '(default)').trim() || '(default)';
    return `${CATALOG_CACHE_PREFIX}::${proj}::${dbId}`;
  } catch {
    return `${CATALOG_CACHE_PREFIX}::default`;
  }
}

export function loadCachedCatalogSnapshot(
  storageKey: string = getActiveCatalogCacheKey()
): MediaItem[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const items = parsed
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
      .map((entry) => normalizeFirestoreMediaRecord(String(entry.id || ''), entry))
      .filter((item) => Boolean(item.id));
    return sortMediaCatalog(items);
  } catch {
    return [];
  }
}

export function saveCachedCatalogSnapshot(
  items: MediaItem[],
  options?: {
    storageKey?: string;
    priorityIds?: string[];
  }
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const storageKey = options?.storageKey || getActiveCatalogCacheKey();
  if (!Array.isArray(items) || items.length === 0) return;

  try {
    const prioritySet = new Set(options?.priorityIds || []);
    const chosen: MediaItem[] = [];
    const seenIds = new Set<string>();

    // First keep pinned and explicitly prioritized hero items
    for (const item of items) {
      if (chosen.length >= MAX_CACHED_ITEMS) break;
      if ((item.pinned || prioritySet.has(item.id)) && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        chosen.push(compactMediaItemForCache(item));
      }
    }

    // Fill the remainder with the newest sorted items
    for (const item of sortMediaCatalog(items)) {
      if (chosen.length >= MAX_CACHED_ITEMS) break;
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        chosen.push(compactMediaItemForCache(item));
      }
    }

    let payload = chosen;
    let serialized = JSON.stringify(payload);
    while (serialized.length > MAX_CACHE_JSON_BYTES && payload.length > 12) {
      payload = payload.slice(0, Math.max(12, Math.floor(payload.length * 0.75)));
      serialized = JSON.stringify(payload);
    }

    window.localStorage.setItem(storageKey, serialized);
  } catch {
    // Ignore storage quota errors
  }
}

export function clearCachedCatalogSnapshot(
  storageKey: string = getActiveCatalogCacheKey()
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore
  }
}
