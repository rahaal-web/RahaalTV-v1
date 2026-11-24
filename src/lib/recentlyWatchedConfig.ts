import type {
  ImageSlotType,
  RecentlyWatchedAspectRatio,
  RecentlyWatchedCardSizePreset,
  RecentlyWatchedCardStyle,
  RecentlyWatchedDeviceKey,
  RecentlyWatchedDeviceLayoutConfig,
  RecentlyWatchedSortOrder,
  RecentlyWatchedUiConfig,
} from '../types/media';
import { normalizeRecentlyWatchedCardStyle } from './cardStyles';

export const RECENTLY_WATCHED_UI_STORAGE_KEY = 'rahaltv_recently_watched_ui_v1';

export const CARD_SIZE_PRESET_WIDTHS: Record<
  Exclude<RecentlyWatchedCardSizePreset, 'custom'>,
  number
> = {
  small: 144,
  medium: 176,
  large: 214,
};

export const RECENTLY_WATCHED_DEVICE_LABELS: Record<RecentlyWatchedDeviceKey, string> = {
  mobile: 'الهاتف المحمول',
  tablet: 'التابلت',
  desktop: 'الكمبيوتر',
  tv: 'Android TV',
};

export const DEFAULT_DEVICE_SETTINGS: Record<
  RecentlyWatchedDeviceKey,
  RecentlyWatchedDeviceLayoutConfig
> = {
  mobile: {
    cardWidthPx: 146,
    cardGapPx: 12,
    initialVisibleCount: 8,
  },
  tablet: {
    cardWidthPx: 168,
    cardGapPx: 14,
    initialVisibleCount: 10,
  },
  desktop: {
    cardWidthPx: 184,
    cardGapPx: 16,
    initialVisibleCount: 12,
  },
  tv: {
    cardWidthPx: 224,
    cardGapPx: 20,
    initialVisibleCount: 14,
  },
};

export const DEFAULT_RECENTLY_WATCHED_UI_CONFIG: RecentlyWatchedUiConfig = {
  enabled: true,
  showTitle: true,
  showViewAllButton: true,
  showArrows: true,
  enableDrag: true,
  autoScroll: false,
  autoScrollIntervalSec: 5,
  scrollDirection: 'rtl',
  enableWheelScroll: true,

  cardStyle: 'rw-3d-tilt',
  cardSizePreset: 'medium',
  cardWidthPx: CARD_SIZE_PRESET_WIDTHS.medium,
  cardGapPx: 14,
  aspectRatio: '2/3',
  showMediaTitle: true,
  showWatchedAt: true,
  showProgressBar: true,
  showEpisodeInfo: true,

  maxStoredItems: 24,
  initialVisibleCount: 10,
  loadMoreOnScrollEnd: true,
  loadMoreBatchSize: 6,

  sortOrder: 'newest_first',
  customOrderIds: [],
  hideCompleted: false,
  deduplicateItems: true,

  deviceMode: 'unified',
  deviceSettings: {
    mobile: { ...DEFAULT_DEVICE_SETTINGS.mobile },
    tablet: { ...DEFAULT_DEVICE_SETTINGS.tablet },
    desktop: { ...DEFAULT_DEVICE_SETTINGS.desktop },
    tv: { ...DEFAULT_DEVICE_SETTINGS.tv },
  },
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function getCardWidthForPreset(
  preset: RecentlyWatchedCardSizePreset,
  customWidthPx?: number
): number {
  if (preset === 'custom') {
    return clampInt(customWidthPx, 110, 360, CARD_SIZE_PRESET_WIDTHS.medium);
  }
  return CARD_SIZE_PRESET_WIDTHS[preset];
}

function normalizeDeviceEntry(
  raw: Partial<RecentlyWatchedDeviceLayoutConfig> | undefined | null,
  fallback: RecentlyWatchedDeviceLayoutConfig
): RecentlyWatchedDeviceLayoutConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...fallback };
  }
  return {
    cardWidthPx: clampInt(raw.cardWidthPx, 110, 360, fallback.cardWidthPx),
    cardGapPx: clampInt(raw.cardGapPx, 4, 40, fallback.cardGapPx),
    initialVisibleCount: clampInt(
      raw.initialVisibleCount,
      2,
      40,
      fallback.initialVisibleCount
    ),
  };
}

const VALID_PRESETS: RecentlyWatchedCardSizePreset[] = [
  'small',
  'medium',
  'large',
  'custom',
];
const VALID_ASPECT_RATIOS: RecentlyWatchedAspectRatio[] = [
  '2/3',
  '3/4',
  '16/9',
  '4/3',
  '1/1',
];
const VALID_SORT_ORDERS: RecentlyWatchedSortOrder[] = [
  'newest_first',
  'oldest_first',
  'custom',
];

export function normalizeRecentlyWatchedUiConfig(
  raw?: Partial<RecentlyWatchedUiConfig> | null
): RecentlyWatchedUiConfig {
  const def = DEFAULT_RECENTLY_WATCHED_UI_CONFIG;
  if (!raw || typeof raw !== 'object') {
    return {
      ...def,
      customOrderIds: [],
      deviceSettings: {
        mobile: { ...DEFAULT_DEVICE_SETTINGS.mobile },
        tablet: { ...DEFAULT_DEVICE_SETTINGS.tablet },
        desktop: { ...DEFAULT_DEVICE_SETTINGS.desktop },
        tv: { ...DEFAULT_DEVICE_SETTINGS.tv },
      },
    };
  }

  const cardSizePreset = VALID_PRESETS.includes(
    raw.cardSizePreset as RecentlyWatchedCardSizePreset
  )
    ? (raw.cardSizePreset as RecentlyWatchedCardSizePreset)
    : def.cardSizePreset;

  const cardWidthPx =
    cardSizePreset === 'custom'
      ? clampInt(raw.cardWidthPx, 110, 360, def.cardWidthPx)
      : CARD_SIZE_PRESET_WIDTHS[cardSizePreset];

  const aspectRatio = VALID_ASPECT_RATIOS.includes(
    raw.aspectRatio as RecentlyWatchedAspectRatio
  )
    ? (raw.aspectRatio as RecentlyWatchedAspectRatio)
    : def.aspectRatio;

  const sortOrder = VALID_SORT_ORDERS.includes(raw.sortOrder as RecentlyWatchedSortOrder)
    ? (raw.sortOrder as RecentlyWatchedSortOrder)
    : def.sortOrder;

  const scrollDirection = raw.scrollDirection === 'ltr' ? 'ltr' : 'rtl';
  const deviceMode = raw.deviceMode === 'per_device' ? 'per_device' : 'unified';

  const seenCustomIds = new Set<string>();
  const customOrderIds: string[] = [];
  if (Array.isArray(raw.customOrderIds)) {
    for (const id of raw.customOrderIds) {
      if (typeof id !== 'string') continue;
      const clean = id.trim().slice(0, 128);
      if (!clean || seenCustomIds.has(clean)) continue;
      seenCustomIds.add(clean);
      customOrderIds.push(clean);
      if (customOrderIds.length >= 100) break;
    }
  }

  const rawDev = raw.deviceSettings || ({} as Partial<RecentlyWatchedUiConfig['deviceSettings']>);

  return {
    enabled: raw.enabled !== false,
    showTitle: raw.showTitle !== false,
    showViewAllButton: raw.showViewAllButton !== false,
    showArrows: raw.showArrows !== false,
    enableDrag: raw.enableDrag !== false,
    autoScroll: Boolean(raw.autoScroll),
    autoScrollIntervalSec: clampInt(
      raw.autoScrollIntervalSec,
      2,
      20,
      def.autoScrollIntervalSec
    ),
    scrollDirection,
    enableWheelScroll: raw.enableWheelScroll !== false,

    cardStyle: normalizeRecentlyWatchedCardStyle(raw.cardStyle) as RecentlyWatchedCardStyle,
    cardSizePreset,
    cardWidthPx,
    cardGapPx: clampInt(raw.cardGapPx, 4, 40, def.cardGapPx),
    aspectRatio,
    showMediaTitle: raw.showMediaTitle !== false,
    showWatchedAt: raw.showWatchedAt !== false,
    showProgressBar: raw.showProgressBar !== false,
    showEpisodeInfo: raw.showEpisodeInfo !== false,

    maxStoredItems: clampInt(raw.maxStoredItems, 6, 60, def.maxStoredItems),
    initialVisibleCount: clampInt(
      raw.initialVisibleCount,
      2,
      40,
      def.initialVisibleCount
    ),
    loadMoreOnScrollEnd: raw.loadMoreOnScrollEnd !== false,
    loadMoreBatchSize: clampInt(raw.loadMoreBatchSize, 2, 20, def.loadMoreBatchSize),

    sortOrder,
    customOrderIds,
    hideCompleted: Boolean(raw.hideCompleted),
    deduplicateItems: raw.deduplicateItems !== false,

    deviceMode,
    deviceSettings: {
      mobile: normalizeDeviceEntry(rawDev.mobile, DEFAULT_DEVICE_SETTINGS.mobile),
      tablet: normalizeDeviceEntry(rawDev.tablet, DEFAULT_DEVICE_SETTINGS.tablet),
      desktop: normalizeDeviceEntry(rawDev.desktop, DEFAULT_DEVICE_SETTINGS.desktop),
      tv: normalizeDeviceEntry(rawDev.tv, DEFAULT_DEVICE_SETTINGS.tv),
    },
  };
}

export function sanitizeRecentlyWatchedUiForFirestore(
  cfg: RecentlyWatchedUiConfig
): RecentlyWatchedUiConfig {
  const n = normalizeRecentlyWatchedUiConfig(cfg);
  return {
    enabled: Boolean(n.enabled),
    showTitle: Boolean(n.showTitle),
    showViewAllButton: Boolean(n.showViewAllButton),
    showArrows: Boolean(n.showArrows),
    enableDrag: Boolean(n.enableDrag),
    autoScroll: Boolean(n.autoScroll),
    autoScrollIntervalSec: n.autoScrollIntervalSec,
    scrollDirection: n.scrollDirection,
    enableWheelScroll: Boolean(n.enableWheelScroll),
    cardStyle: normalizeRecentlyWatchedCardStyle(n.cardStyle),
    cardSizePreset: n.cardSizePreset,
    cardWidthPx: n.cardWidthPx,
    cardGapPx: n.cardGapPx,
    aspectRatio: n.aspectRatio,
    showMediaTitle: Boolean(n.showMediaTitle),
    showWatchedAt: Boolean(n.showWatchedAt),
    showProgressBar: Boolean(n.showProgressBar),
    showEpisodeInfo: Boolean(n.showEpisodeInfo),
    maxStoredItems: n.maxStoredItems,
    initialVisibleCount: n.initialVisibleCount,
    loadMoreOnScrollEnd: Boolean(n.loadMoreOnScrollEnd),
    loadMoreBatchSize: n.loadMoreBatchSize,
    sortOrder: n.sortOrder,
    customOrderIds: [...n.customOrderIds].slice(0, 100),
    hideCompleted: Boolean(n.hideCompleted),
    deduplicateItems: Boolean(n.deduplicateItems),
    deviceMode: n.deviceMode,
    deviceSettings: {
      mobile: { ...n.deviceSettings.mobile },
      tablet: { ...n.deviceSettings.tablet },
      desktop: { ...n.deviceSettings.desktop },
      tv: { ...n.deviceSettings.tv },
    },
  };
}

export function detectRecentlyWatchedDeviceKey(
  viewportWidth: number,
  isTvDevice = false
): RecentlyWatchedDeviceKey {
  if (isTvDevice) return 'tv';
  if (viewportWidth < 640) return 'mobile';
  if (viewportWidth < 1024) return 'tablet';
  if (viewportWidth >= 1680) return 'tv';
  return 'desktop';
}

export interface ResolvedRecentlyWatchedLayout extends RecentlyWatchedDeviceLayoutConfig {
  deviceKey: RecentlyWatchedDeviceKey;
}

export function resolveRecentlyWatchedLayoutForViewport(
  cfg: RecentlyWatchedUiConfig,
  viewportWidth: number,
  forcedDevice?: RecentlyWatchedDeviceKey,
  isTvDevice = false
): ResolvedRecentlyWatchedLayout {
  const deviceKey = forcedDevice || detectRecentlyWatchedDeviceKey(viewportWidth, isTvDevice);
  if (cfg.deviceMode === 'per_device') {
    const dev = cfg.deviceSettings[deviceKey] || DEFAULT_DEVICE_SETTINGS[deviceKey];
    return {
      deviceKey,
      cardWidthPx: clampInt(dev.cardWidthPx, 110, 360, cfg.cardWidthPx),
      cardGapPx: clampInt(dev.cardGapPx, 4, 40, cfg.cardGapPx),
      initialVisibleCount: clampInt(
        dev.initialVisibleCount,
        2,
        40,
        cfg.initialVisibleCount
      ),
    };
  }

  return {
    deviceKey,
    cardWidthPx: cfg.cardWidthPx,
    cardGapPx: cfg.cardGapPx,
    initialVisibleCount: cfg.initialVisibleCount,
  };
}

export function resolveAspectRatioCssValue(ratio: RecentlyWatchedAspectRatio): string {
  switch (ratio) {
    case '3/4':
      return '3 / 4';
    case '16/9':
      return '16 / 9';
    case '4/3':
      return '4 / 3';
    case '1/1':
      return '1 / 1';
    default:
      return '2 / 3';
  }
}

export function resolveImageSlotForCarouselCard(
  ratio: RecentlyWatchedAspectRatio,
  widthPx: number
): { slot: ImageSlotType; tmdbSize: 'w185' | 'w300' | 'w342' | 'w500'; preferBackdrop: boolean } {
  const isLandscape = ratio === '16/9' || ratio === '4/3';
  if (isLandscape) {
    return {
      slot: 'backdrop_card',
      tmdbSize: widthPx >= 260 ? 'w500' : 'w300',
      preferBackdrop: true,
    };
  }
  return {
    slot: widthPx <= 160 ? 'card_small' : 'card_grid',
    tmdbSize: widthPx <= 150 ? 'w185' : 'w342',
    preferBackdrop: false,
  };
}

/* ---------------- Persistence & Live Site Preview Pub/Sub ---------------- */
let previewOverrideConfig: RecentlyWatchedUiConfig | null = null;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Ignore subscriber errors
    }
  });
}

export function loadStoredRecentlyWatchedUiConfig(): RecentlyWatchedUiConfig {
  if (typeof window === 'undefined') {
    return normalizeRecentlyWatchedUiConfig(DEFAULT_RECENTLY_WATCHED_UI_CONFIG);
  }
  try {
    const raw = window.localStorage.getItem(RECENTLY_WATCHED_UI_STORAGE_KEY);
    if (!raw) return normalizeRecentlyWatchedUiConfig(DEFAULT_RECENTLY_WATCHED_UI_CONFIG);
    return normalizeRecentlyWatchedUiConfig(
      JSON.parse(raw) as Partial<RecentlyWatchedUiConfig>
    );
  } catch {
    return normalizeRecentlyWatchedUiConfig(DEFAULT_RECENTLY_WATCHED_UI_CONFIG);
  }
}

export function saveStoredRecentlyWatchedUiConfig(
  cfg: Partial<RecentlyWatchedUiConfig>
): RecentlyWatchedUiConfig {
  const normalized = normalizeRecentlyWatchedUiConfig(cfg);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        RECENTLY_WATCHED_UI_STORAGE_KEY,
        JSON.stringify(normalized)
      );
    } catch {
      // Ignore quota errors
    }
  }
  notifyListeners();
  return normalized;
}

export function setRecentlyWatchedPreviewOverride(
  cfg: RecentlyWatchedUiConfig | null
): void {
  previewOverrideConfig = cfg ? normalizeRecentlyWatchedUiConfig(cfg) : null;
  notifyListeners();
}

export function getRecentlyWatchedPreviewOverride(): RecentlyWatchedUiConfig | null {
  return previewOverrideConfig;
}

export function subscribeRecentlyWatchedUiChanges(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
