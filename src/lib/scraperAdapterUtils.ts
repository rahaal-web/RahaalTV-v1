import type {
  AdapterContentTypeHint,
  AdapterStatus,
  AdapterVerifyMode,
  ScraperAdapter,
  ScraperAdapterEpisodeRules,
  ScraperAdapterNavigationRules,
  ScraperAdapterPageDetection,
  ScraperAdapterServerRules,
  ScraperAdapterSiteSettings,
  ScraperAdapterTestSummary,
} from '../types/scraperAdapter.ts';

export function normalizeAdapterDomain(rawUrlOrDomain: string): string {
  const input = String(rawUrlOrDomain || '').trim();
  if (!input) return '';
  let host = '';
  if (/^https?:\/\//i.test(input)) {
    try {
      host = new URL(input).hostname;
    } catch {
      host = input;
    }
  } else if (input.includes('/')) {
    try {
      host = new URL(`https://${input}`).hostname;
    } catch {
      host = input.split('/')[0];
    }
  } else {
    host = input;
  }
  return host
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/:\d+$/, '')
    .replace(/[^a-z0-9.\-]/g, '')
    .slice(0, 160);
}

export function buildAdapterIdFromDomain(domainOrUrl: string): string {
  const cleanDomain = normalizeAdapterDomain(domainOrUrl) || 'custom-site';
  const slug = cleanDomain
    .replace(/\./g, '-')
    .replace(/[^a-zA-Z0-9_\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return slug || `adapter-${Date.now()}`;
}

export const DEFAULT_SERVER_URL_ATTRIBUTES = [
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

export function createDefaultScraperAdapter(
  domainOrUrl: string,
  sampleUrl = '',
  contentTypeHint: AdapterContentTypeHint = 'auto'
): ScraperAdapter {
  const domain = normalizeAdapterDomain(domainOrUrl) || 'example.com';
  const id = buildAdapterIdFromDomain(domain);
  return {
    id,
    name: domain,
    domain,
    domainAliases: [],
    enabled: true,
    status: 'needs_fix',
    contentTypeHint,
    sampleUrl: String(sampleUrl || '').trim().slice(0, 500),
    version: 1,
    pageDetection: {
      seriesUrlPattern: '',
      movieUrlPattern: '',
      episodeUrlPattern: '',
      watchSubpageSelector: 'a.xtgo, a.btnplay, a[href*="play.php"], a[href*="/watch/"]',
      watchSubpageUrlPattern: 'play\\.php\\?vid=|/watch/',
      downloadSubpageSelector: 'a[href*="download.php"], a[href*="/download"]',
    },
    episodeRules: {
      containerSelector: '.tabcontent, .SeasonsEpisodes, .episodes-list, .pm-ul-playlist',
      linkSelector: 'a[href]',
      seasonTabSelector: '.tablinks, .seasons-sec > li, [data-season]',
      seasonPanelSelector: '.tabcontent, .SeasonsEpisodes',
      selectSeasonSelector: 'select#mobileselect, .TabS select',
      selectEpisodeOptionSelector: 'select.episodeoption option, .TabE select option',
      episodeNumberRegex: '(?:الحلقة|حلقة|Episode|Ep\\.?)\\s*#?(\\d{1,3})|^(\\d{1,3})\\s*(?:حلقة|الحلقة)',
      episodeIdParam: 'vid',
      preserveMultiSeason: true,
      maxEpisodes: 120,
    },
    serverRules: {
      itemSelector: '.WatchList li, .servers-list li, .servers button, .nav-tabs li, [role="tab"], [data-embed-url], [data-embed]',
      urlAttributes: [...DEFAULT_SERVER_URL_ATTRIBUTES],
      nameSelector: '.name, span, a',
      preserveServerNames: true,
      onclickUrlRegex: '',
      scriptUrlRegex: '',
      ajaxEndpointPattern: '',
      ajaxMethod: 'POST',
      ajaxIdAttribute: 'data-embed-id',
      maxServersPerEpisode: 15,
    },
    navigationRules: {
      paginationSelector: 'a[rel="next"], .pagination a, .next a, a.next',
      loadMoreSelector: '.load-more, [data-load-more]',
      followPagination: true,
      maxPaginationPages: 6,
      followWatchSubpage: true,
      followDownloadSubpage: true,
      listingCardSelector: '.entry-box, .pm-video-thumb, article, .post, .movie, .card',
      listingLinkSelector: 'a[href]',
    },
    siteSettings: {
      requestDelayMs: 250,
      verifyMode: 'relaxed_headers',
      refererMode: 'source_url',
      cmsFingerprint: 'custom',
      notes: '',
    },
  };
}

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const num = Math.round(Number(val));
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function clampFloat(val: unknown, min: number, max: number, fallback: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function normalizeScraperAdapter(raw: Partial<ScraperAdapter>): ScraperAdapter {
  const base = createDefaultScraperAdapter(
    raw.domain || raw.sampleUrl || raw.id || 'custom-site',
    raw.sampleUrl || '',
    raw.contentTypeHint || 'auto'
  );
  const domain = normalizeAdapterDomain(raw.domain || raw.sampleUrl || base.domain) || base.domain;
  const cleanId =
    String(raw.id || buildAdapterIdFromDomain(domain))
      .trim()
      .replace(/[^a-zA-Z0-9_\-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 128) || base.id;

  const status: AdapterStatus =
    raw.status === 'supported' || raw.status === 'needs_fix' || raw.status === 'failed'
      ? raw.status
      : base.status;
  const contentTypeHint: AdapterContentTypeHint =
    raw.contentTypeHint === 'series' ||
    raw.contentTypeHint === 'movie' ||
    raw.contentTypeHint === 'episode' ||
    raw.contentTypeHint === 'auto'
      ? raw.contentTypeHint
      : 'auto';

  const domainAliases = Array.from(
    new Set(
      (Array.isArray(raw.domainAliases) ? raw.domainAliases : [])
        .map((d) => normalizeAdapterDomain(String(d || '')))
        .filter((d) => d && d !== domain)
    )
  ).slice(0, 20);

  const pd = (raw.pageDetection || {}) as Partial<ScraperAdapterPageDetection>;
  const pageDetection: ScraperAdapterPageDetection = {
    seriesUrlPattern: String(pd.seriesUrlPattern ?? base.pageDetection.seriesUrlPattern).trim().slice(0, 240),
    movieUrlPattern: String(pd.movieUrlPattern ?? base.pageDetection.movieUrlPattern).trim().slice(0, 240),
    episodeUrlPattern: String(pd.episodeUrlPattern ?? base.pageDetection.episodeUrlPattern).trim().slice(0, 240),
    watchSubpageSelector: String(pd.watchSubpageSelector ?? base.pageDetection.watchSubpageSelector).trim().slice(0, 240),
    watchSubpageUrlPattern: String(pd.watchSubpageUrlPattern ?? base.pageDetection.watchSubpageUrlPattern).trim().slice(0, 240),
    downloadSubpageSelector: String(pd.downloadSubpageSelector ?? base.pageDetection.downloadSubpageSelector).trim().slice(0, 240),
  };

  const er = (raw.episodeRules || {}) as Partial<ScraperAdapterEpisodeRules>;
  const episodeRules: ScraperAdapterEpisodeRules = {
    containerSelector: String(er.containerSelector ?? base.episodeRules.containerSelector).trim().slice(0, 240),
    linkSelector: String(er.linkSelector ?? base.episodeRules.linkSelector).trim().slice(0, 240),
    seasonTabSelector: String(er.seasonTabSelector ?? base.episodeRules.seasonTabSelector).trim().slice(0, 240),
    seasonPanelSelector: String(er.seasonPanelSelector ?? base.episodeRules.seasonPanelSelector).trim().slice(0, 240),
    selectSeasonSelector: String(er.selectSeasonSelector ?? base.episodeRules.selectSeasonSelector).trim().slice(0, 240),
    selectEpisodeOptionSelector: String(er.selectEpisodeOptionSelector ?? base.episodeRules.selectEpisodeOptionSelector).trim().slice(0, 240),
    episodeNumberRegex: String(er.episodeNumberRegex ?? base.episodeRules.episodeNumberRegex).trim().slice(0, 240),
    episodeIdParam: String(er.episodeIdParam ?? base.episodeRules.episodeIdParam).trim().slice(0, 60),
    preserveMultiSeason:
      typeof er.preserveMultiSeason === 'boolean' ? er.preserveMultiSeason : base.episodeRules.preserveMultiSeason,
    maxEpisodes: clampInt(er.maxEpisodes, 1, 250, base.episodeRules.maxEpisodes),
  };

  const sr = (raw.serverRules || {}) as Partial<ScraperAdapterServerRules>;
  const urlAttributes = Array.from(
    new Set(
      (Array.isArray(sr.urlAttributes) && sr.urlAttributes.length > 0
        ? sr.urlAttributes
        : base.serverRules.urlAttributes
      )
        .map((a) => String(a || '').trim().slice(0, 60))
        .filter(Boolean)
    )
  ).slice(0, 20);
  const serverRules: ScraperAdapterServerRules = {
    itemSelector: String(sr.itemSelector ?? base.serverRules.itemSelector).trim().slice(0, 240),
    urlAttributes,
    nameSelector: String(sr.nameSelector ?? base.serverRules.nameSelector).trim().slice(0, 240),
    preserveServerNames:
      typeof sr.preserveServerNames === 'boolean' ? sr.preserveServerNames : base.serverRules.preserveServerNames,
    onclickUrlRegex: String(sr.onclickUrlRegex ?? base.serverRules.onclickUrlRegex).trim().slice(0, 240),
    scriptUrlRegex: String(sr.scriptUrlRegex ?? base.serverRules.scriptUrlRegex).trim().slice(0, 240),
    ajaxEndpointPattern: String(sr.ajaxEndpointPattern ?? base.serverRules.ajaxEndpointPattern).trim().slice(0, 240),
    ajaxMethod: sr.ajaxMethod === 'GET' ? 'GET' : 'POST',
    ajaxIdAttribute: String(sr.ajaxIdAttribute ?? base.serverRules.ajaxIdAttribute).trim().slice(0, 80),
    maxServersPerEpisode: clampInt(sr.maxServersPerEpisode, 1, 30, base.serverRules.maxServersPerEpisode),
  };

  const nr = (raw.navigationRules || {}) as Partial<ScraperAdapterNavigationRules>;
  const navigationRules: ScraperAdapterNavigationRules = {
    paginationSelector: String(nr.paginationSelector ?? base.navigationRules.paginationSelector).trim().slice(0, 240),
    loadMoreSelector: String(nr.loadMoreSelector ?? base.navigationRules.loadMoreSelector).trim().slice(0, 240),
    followPagination:
      typeof nr.followPagination === 'boolean' ? nr.followPagination : base.navigationRules.followPagination,
    maxPaginationPages: clampInt(nr.maxPaginationPages, 1, 25, base.navigationRules.maxPaginationPages),
    followWatchSubpage:
      typeof nr.followWatchSubpage === 'boolean' ? nr.followWatchSubpage : base.navigationRules.followWatchSubpage,
    followDownloadSubpage:
      typeof nr.followDownloadSubpage === 'boolean'
        ? nr.followDownloadSubpage
        : base.navigationRules.followDownloadSubpage,
    listingCardSelector: String(nr.listingCardSelector ?? base.navigationRules.listingCardSelector).trim().slice(0, 240),
    listingLinkSelector: String(nr.listingLinkSelector ?? base.navigationRules.listingLinkSelector).trim().slice(0, 240),
  };

  const ss = (raw.siteSettings || {}) as Partial<ScraperAdapterSiteSettings>;
  const verifyMode: AdapterVerifyMode =
    ss.verifyMode === 'strict' || ss.verifyMode === 'relaxed_headers' || ss.verifyMode === 'none'
      ? ss.verifyMode
      : base.siteSettings.verifyMode;
  const siteSettings: ScraperAdapterSiteSettings = {
    requestDelayMs: clampInt(ss.requestDelayMs, 0, 10000, base.siteSettings.requestDelayMs),
    verifyMode,
    refererMode:
      ss.refererMode === 'origin' || ss.refererMode === 'none' || ss.refererMode === 'source_url'
        ? ss.refererMode
        : base.siteSettings.refererMode,
    cmsFingerprint: String(ss.cmsFingerprint ?? base.siteSettings.cmsFingerprint).trim().slice(0, 120) || 'custom',
    notes: String(ss.notes ?? base.siteSettings.notes).trim().slice(0, 600),
  };

  let lastTestSummary: ScraperAdapterTestSummary | undefined;
  if (raw.lastTestSummary && typeof raw.lastTestSummary === 'object') {
    const ts = raw.lastTestSummary as Partial<ScraperAdapterTestSummary>;
    lastTestSummary = {
      testedUrl: String(ts.testedUrl || raw.sampleUrl || '').trim().slice(0, 500),
      contentTypeTested:
        ts.contentTypeTested === 'series' ||
        ts.contentTypeTested === 'movie' ||
        ts.contentTypeTested === 'episode' ||
        ts.contentTypeTested === 'auto'
          ? ts.contentTypeTested
          : contentTypeHint,
      episodesDiscovered: clampInt(ts.episodesDiscovered, 0, 10000, 0),
      totalServersExtracted: clampInt(ts.totalServersExtracted, 0, 100000, 0),
      avgServersPerEpisode: clampFloat(ts.avgServersPerEpisode, 0, 1000, 0),
      minServersPerEpisode: clampInt(ts.minServersPerEpisode, 0, 1000, 0),
      maxServersPerEpisode: clampInt(ts.maxServersPerEpisode, 0, 1000, 0),
      missingEpisodesCount: clampInt(ts.missingEpisodesCount, 0, 10000, 0),
      failedServersCount: clampInt(ts.failedServersCount, 0, 10000, 0),
      visibleEpisodesHint: clampInt(ts.visibleEpisodesHint, 0, 10000, 0),
      visibleServersHint: clampInt(ts.visibleServersHint, 0, 1000, 0),
      recommendedStatus:
        ts.recommendedStatus === 'supported' || ts.recommendedStatus === 'needs_fix' || ts.recommendedStatus === 'failed'
          ? ts.recommendedStatus
          : status,
      summaryText: String(ts.summaryText || '').trim().slice(0, 500),
      testedAt: String(ts.testedAt || new Date().toISOString()).trim().slice(0, 60),
    };
  }

  return {
    id: cleanId,
    name: String(raw.name || domain).trim().slice(0, 120) || domain,
    domain,
    domainAliases,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    status,
    contentTypeHint,
    sampleUrl: String(raw.sampleUrl || '').trim().slice(0, 500),
    version: clampInt(raw.version, 1, 10000, 1),
    pageDetection,
    episodeRules,
    serverRules,
    navigationRules,
    siteSettings,
    ...(lastTestSummary ? { lastTestSummary } : {}),
    ...(raw.updatedBy ? { updatedBy: String(raw.updatedBy).trim().slice(0, 128) } : {}),
    ...(typeof raw.createdAtMs === 'number' ? { createdAtMs: raw.createdAtMs } : {}),
    ...(typeof raw.updatedAtMs === 'number' ? { updatedAtMs: raw.updatedAtMs } : {}),
  };
}

export function matchAdapterForUrl(
  targetUrl: string,
  adapters: ScraperAdapter[],
  options?: { includeDisabled?: boolean }
): ScraperAdapter | null {
  const host = normalizeAdapterDomain(targetUrl);
  if (!host || !adapters.length) return null;

  const candidates = options?.includeDisabled ? adapters : adapters.filter((a) => a.enabled);
  if (!candidates.length) return null;

  const scoreMatch = (adapter: ScraperAdapter): number => {
    const primary = normalizeAdapterDomain(adapter.domain);
    const aliases = (adapter.domainAliases || []).map(normalizeAdapterDomain).filter(Boolean);
    if (host === primary) return 100;
    if (aliases.includes(host)) return 90;
    if (primary && host.endsWith(`.${primary}`)) return 70;
    if (aliases.some((a) => host.endsWith(`.${a}`))) return 60;
    return 0;
  };

  let best: ScraperAdapter | null = null;
  let bestScore = 0;
  for (const adapter of candidates) {
    const score = scoreMatch(adapter);
    if (score > bestScore) {
      bestScore = score;
      best = adapter;
    } else if (score === bestScore && score > 0 && best && adapter.version > best.version) {
      best = adapter;
    }
  }
  return best;
}

export function exportAdaptersBundleJson(adapters: ScraperAdapter[]): string {
  return JSON.stringify(
    {
      schema: 'rahaltv-scraper-adapters-v1',
      exportedAt: new Date().toISOString(),
      count: adapters.length,
      adapters: adapters.map((a) => normalizeScraperAdapter(a)),
    },
    null,
    2
  );
}

export function parseImportedAdaptersJson(rawJson: string): {
  adapters: ScraperAdapter[];
  errors: string[];
} {
  const errors: string[] = [];
  if (!rawJson || !rawJson.trim()) {
    return { adapters: [], errors: ['ملف JSON فارغ.'] };
  }
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    let list: unknown[] = [];
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.adapters)) {
        list = obj.adapters;
      } else if (obj.domain || obj.id) {
        list = [obj];
      } else {
        return { adapters: [], errors: ['صيغة JSON غير مطابقة لبنية الـ Adapters.'] };
      }
    } else {
      return { adapters: [], errors: ['صيغة JSON غير صالحة.'] };
    }

    const valid: ScraperAdapter[] = [];
    for (let i = 0; i < Math.min(list.length, 100); i++) {
      const item = list[i];
      if (!item || typeof item !== 'object') {
        errors.push(`العنصر رقم ${i + 1} ليس كائناً صالحاً.`);
        continue;
      }
      const rec = item as Partial<ScraperAdapter>;
      if (!rec.domain && !rec.sampleUrl) {
        errors.push(`العنصر رقم ${i + 1} يفتقد إلى حقل domain.`);
        continue;
      }
      valid.push(normalizeScraperAdapter(rec));
    }
    return { adapters: valid, errors };
  } catch (err) {
    return {
      adapters: [],
      errors: [`تعذر قراءة JSON: ${err instanceof Error ? err.message : 'صيغة غير صالحة'}`],
    };
  }
}

export const STORAGE_ADAPTERS_KEY = 'rahaltv_scraper_adapters_v1';

export function loadLocalScraperAdapters(): ScraperAdapter[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_ADAPTERS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map((item) => normalizeScraperAdapter(item as Partial<ScraperAdapter>));
  } catch {
    return [];
  }
}
