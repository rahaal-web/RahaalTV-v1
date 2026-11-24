import type { AdminTab } from '../components/admin/adminNavigation';
import type { CatalogFilterState } from '../types/media';

export const DEFAULT_CATALOG_FILTERS: CatalogFilterState = {
  query: '',
  category: '',
  genre: '',
  year: '',
  country: '',
  language: '',
  quality: '',
  minImdb: 0,
  preset: '',
};

export type ArchiveSortOption = 'latest' | 'year' | 'rating' | 'views' | 'likes' | 'pinned';

export type ActiveOverlayName =
  | 'player'
  | 'trailer'
  | 'search'
  | 'watchlist'
  | 'watch_history'
  | 'login'
  | 'footer_topic'
  | 'mobile_menu'
  | 'ios_guide';

export type AppRoute =
  | { view: 'home' }
  | {
      view: 'archive';
      filters: CatalogFilterState;
      sort: ArchiveSortOption;
      page: number;
      pageSize: number;
    }
  | {
      view: 'single';
      watchKey: string;
      episode?: number;
      openDownloads?: boolean;
    }
  | {
      view: 'admin';
      adminTab?: AdminTab;
    }
  | {
      view: 'not_found';
      rawPath?: string;
    };

export interface RouterHistoryState {
  __rtv: true;
  navKey: string;
  routeHash: string;
  internalDepth: number;
  overlay: ActiveOverlayName | null;
}

const VALID_SORT_OPTIONS = new Set<ArchiveSortOption>([
  'latest',
  'year',
  'rating',
  'views',
  'likes',
  'pinned',
]);

const KNOWN_ANCHOR_HASHES = new Set([
  '#watch-download-tabs',
  '#member-star-rating-card',
]);

function normalizePrefix(basePrefix: string): string {
  if (!basePrefix || basePrefix === '/') return '';
  return basePrefix.startsWith('/') ? basePrefix.replace(/\/+$/, '') : `/${basePrefix.replace(/\/+$/, '')}`;
}

export function normalizeArchiveFilters(partial?: Partial<CatalogFilterState>): CatalogFilterState {
  return {
    ...DEFAULT_CATALOG_FILTERS,
    ...(partial || {}),
    minImdb: Number(partial?.minImdb || 0) || 0,
  };
}

export function buildRouteHash(route: AppRoute): string {
  if (route.view === 'home') {
    return '#/';
  }

  if (route.view === 'archive') {
    const params = new URLSearchParams();
    const f = route.filters;
    if (f.query.trim()) params.set('q', f.query.trim());
    if (f.category.trim()) params.set('cat', f.category.trim());
    if (f.genre.trim()) params.set('genre', f.genre.trim());
    if (f.year.trim()) params.set('year', f.year.trim());
    if (f.country.trim()) params.set('country', f.country.trim());
    if (f.language.trim()) params.set('lang', f.language.trim());
    if (f.quality.trim()) params.set('qual', f.quality.trim());
    if (f.minImdb > 0) params.set('imdb', String(f.minImdb));
    if (f.preset && f.preset !== 'latest') params.set('preset', f.preset);
    if (route.sort && route.sort !== 'latest' && route.sort !== f.preset) {
      params.set('sort', route.sort);
    }
    if (route.page > 1) params.set('p', String(route.page));
    if (route.pageSize !== 24) params.set('ps', String(route.pageSize));
    const qs = params.toString();
    return qs ? `#/browse?${qs}` : '#/browse';
  }

  if (route.view === 'single') {
    const cleanKey = encodeURIComponent(route.watchKey.trim() || 'work');
    const params = new URLSearchParams();
    if (route.episode && route.episode > 1) {
      params.set('ep', String(Math.floor(route.episode)));
    }
    if (route.openDownloads) {
      params.set('dl', '1');
    }
    const qs = params.toString();
    return qs ? `#/watch/${cleanKey}?${qs}` : `#/watch/${cleanKey}`;
  }

  if (route.view === 'admin') {
    if (route.adminTab && route.adminTab !== 'overview') {
      return `#/admin/${encodeURIComponent(route.adminTab)}`;
    }
    return '#/admin';
  }

  return '#/not-found';
}

export function buildFullHashUrl(
  route: AppRoute,
  origin = typeof window !== 'undefined' ? window.location.origin : 'https://rahaltv.com',
  basePrefix = ''
): string {
  const cleanPrefix = normalizePrefix(basePrefix);
  return `${origin.replace(/\/+$/, '')}${cleanPrefix}/${buildRouteHash(route)}`;
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

export function parseRouteFromLocationParts(input: {
  pathname: string;
  search: string;
  hash: string;
  basePrefix?: string;
}): { route: AppRoute; needsCanonicalReplace: boolean } {
  const cleanPrefix = normalizePrefix(input.basePrefix || '');
  let relPath = input.pathname || '/';
  if (cleanPrefix && relPath.startsWith(cleanPrefix)) {
    relPath = relPath.slice(cleanPrefix.length) || '/';
  }
  const normalizedRelPath = relPath === '/index.html' ? '/' : relPath.replace(/\/+$/, '') || '/';
  const searchParams = new URLSearchParams(input.search || '');
  const rawHash = (input.hash || '').trim();

  // 1. Explicit hash routes (primary unified router format)
  if (rawHash && rawHash !== '#' && !KNOWN_ANCHOR_HASHES.has(rawHash)) {
    const cleanHash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
    const hashWithSlash = cleanHash.startsWith('/') ? cleanHash : `/${cleanHash}`;
    const qIdx = hashWithSlash.indexOf('?');
    const hashPath = (qIdx >= 0 ? hashWithSlash.slice(0, qIdx) : hashWithSlash).replace(/\/+$/, '') || '/';
    const hashQuery = new URLSearchParams(qIdx >= 0 ? hashWithSlash.slice(qIdx + 1) : '');

    if (hashPath === '/' || hashPath === '/home') {
      return {
        route: { view: 'home' },
        needsCanonicalReplace: rawHash !== '#/' || normalizedRelPath !== '/' || Boolean(input.search),
      };
    }

    if (hashPath === '/browse' || hashPath === '/archive') {
      const presetRaw = hashQuery.get('preset') || '';
      const preset = VALID_SORT_OPTIONS.has(presetRaw as ArchiveSortOption) && presetRaw !== 'year'
        ? (presetRaw as CatalogFilterState['preset'])
        : '';
      const sortRaw = hashQuery.get('sort') || preset || 'latest';
      const sort: ArchiveSortOption = VALID_SORT_OPTIONS.has(sortRaw as ArchiveSortOption)
        ? (sortRaw as ArchiveSortOption)
        : 'latest';
      const psRaw = hashQuery.get('ps');
      const parsedPs = psRaw === '0' ? 0 : psRaw === '48' ? 48 : 24;
      return {
        route: {
          view: 'archive',
          filters: {
            query: hashQuery.get('q') || '',
            category: hashQuery.get('cat') || '',
            genre: hashQuery.get('genre') || '',
            year: hashQuery.get('year') || '',
            country: hashQuery.get('country') || '',
            language: hashQuery.get('lang') || '',
            quality: hashQuery.get('qual') || '',
            minImdb: Math.max(0, Number(hashQuery.get('imdb') || '0') || 0),
            preset,
          },
          sort,
          page: parsePositiveInt(hashQuery.get('p'), 1),
          pageSize: parsedPs,
        },
        needsCanonicalReplace: false,
      };
    }

    const watchMatch = hashPath.match(/^\/watch\/([^/]+)$/i);
    if (watchMatch?.[1]) {
      let watchKey = watchMatch[1];
      try {
        watchKey = decodeURIComponent(watchKey);
      } catch {
        // Keep raw key if malformed
      }
      const epVal = hashQuery.get('ep') || searchParams.get('ep');
      const episode = epVal ? parsePositiveInt(epVal, 1) : undefined;
      const openDownloads = hashQuery.get('dl') === '1' || searchParams.get('dl') === '1';
      return {
        route: {
          view: 'single',
          watchKey,
          ...(episode && episode > 1 ? { episode } : {}),
          ...(openDownloads ? { openDownloads: true } : {}),
        },
        needsCanonicalReplace: Boolean(searchParams.get('watch') || searchParams.get('ep')),
      };
    }

    if (hashPath === '/admin' || hashPath.startsWith('/admin/')) {
      const tabPart = hashPath.slice('/admin'.length).replace(/^\/+/, '');
      let adminTab: AdminTab | undefined;
      if (tabPart && !tabPart.includes('/')) {
        try {
          adminTab = decodeURIComponent(tabPart) as AdminTab;
        } catch {
          adminTab = tabPart as AdminTab;
        }
      }
      return {
        route: { view: 'admin', ...(adminTab ? { adminTab } : {}) },
        needsCanonicalReplace: false,
      };
    }

    return {
      route: { view: 'not_found', rawPath: hashPath },
      needsCanonicalReplace: false,
    };
  }

  // 2. Legacy query / path routes normalized onto hash routes
  const queryWatch = searchParams.get('watch') || searchParams.get('v');
  if (queryWatch && queryWatch.trim()) {
    const epVal = searchParams.get('ep');
    const episode = epVal ? parsePositiveInt(epVal, 1) : undefined;
    const openDownloads = searchParams.get('dl') === '1';
    return {
      route: {
        view: 'single',
        watchKey: queryWatch.trim(),
        ...(episode && episode > 1 ? { episode } : {}),
        ...(openDownloads ? { openDownloads: true } : {}),
      },
      needsCanonicalReplace: true,
    };
  }

  const pathWatchMatch = normalizedRelPath.match(/^\/watch\/([^/]+)$/i);
  if (pathWatchMatch?.[1]) {
    let watchKey = pathWatchMatch[1];
    try {
      watchKey = decodeURIComponent(watchKey);
    } catch {
      // Keep raw key
    }
    const epVal = searchParams.get('ep');
    const episode = epVal ? parsePositiveInt(epVal, 1) : undefined;
    return {
      route: {
        view: 'single',
        watchKey,
        ...(episode && episode > 1 ? { episode } : {}),
      },
      needsCanonicalReplace: true,
    };
  }

  if (normalizedRelPath === '/admin' || normalizedRelPath.startsWith('/admin/')) {
    const tabPart = normalizedRelPath.slice('/admin'.length).replace(/^\/+/, '');
    return {
      route: {
        view: 'admin',
        ...(tabPart && !tabPart.includes('/') ? { adminTab: tabPart as AdminTab } : {}),
      },
      needsCanonicalReplace: true,
    };
  }

  if (normalizedRelPath === '/browse' || normalizedRelPath === '/archive') {
    return {
      route: {
        view: 'archive',
        filters: { ...DEFAULT_CATALOG_FILTERS },
        sort: 'latest',
        page: 1,
        pageSize: 24,
      },
      needsCanonicalReplace: true,
    };
  }

  if (normalizedRelPath !== '/') {
    return {
      route: { view: 'not_found', rawPath: normalizedRelPath },
      needsCanonicalReplace: true,
    };
  }

  return {
    route: { view: 'home' },
    needsCanonicalReplace: rawHash === '',
  };
}

export function sanitizeInternalRouteUrl(rawUrl: string | undefined | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return '#/';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '#/';
  if (/[\r\n\\]/.test(trimmed)) return null;
  if (trimmed.length > 300) return null;

  // Reject any explicit protocol, protocol-relative URL, or dangerous scheme
  if (/^(?:https?:|javascript:|data:|vbscript:|file:|mailto:|tel:|\/\/)/i.test(trimmed)) {
    return null;
  }

  if (trimmed.startsWith('#/')) {
    return trimmed;
  }
  if (trimmed === '#' || trimmed === '/') {
    return '#/';
  }
  if (trimmed.startsWith('/')) {
    const parsed = parseRouteFromLocationParts({
      pathname: trimmed.split('?')[0] || '/',
      search: trimmed.includes('?') ? `?${trimmed.split('?').slice(1).join('?')}` : '',
      hash: '',
    });
    if (parsed.route.view === 'not_found') return null;
    return buildRouteHash(parsed.route);
  }
  return null;
}

export function createNavKey(): string {
  return `rtv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function readRouterHistoryState(raw: unknown): RouterHistoryState | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<RouterHistoryState>;
  if (candidate.__rtv !== true || typeof candidate.routeHash !== 'string') return null;
  return {
    __rtv: true,
    navKey: typeof candidate.navKey === 'string' && candidate.navKey ? candidate.navKey : createNavKey(),
    routeHash: candidate.routeHash,
    internalDepth:
      typeof candidate.internalDepth === 'number' && Number.isFinite(candidate.internalDepth)
        ? Math.max(0, Math.floor(candidate.internalDepth))
        : 0,
    overlay: (candidate.overlay as ActiveOverlayName | null | undefined) ?? null,
  };
}

export class ScrollPositionStore {
  private positions = new Map<string, number>();
  private maxEntries = 50;

  save(navKey: string | undefined | null, y: number): void {
    if (!navKey) return;
    const cleanY = Math.max(0, Math.round(Number(y) || 0));
    if (this.positions.has(navKey)) {
      this.positions.delete(navKey);
    }
    this.positions.set(navKey, cleanY);
    while (this.positions.size > this.maxEntries) {
      const oldestKey = this.positions.keys().next().value;
      if (oldestKey) this.positions.delete(oldestKey);
      else break;
    }
  }

  get(navKey: string | undefined | null): number | undefined {
    if (!navKey) return undefined;
    return this.positions.get(navKey);
  }

  clear(): void {
    this.positions.clear();
  }
}
