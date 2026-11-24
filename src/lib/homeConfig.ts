import {
  HeroImageFitMode,
  HeroInfoPosition,
  HeroTextAlign,
  HomeCardStyle,
  HomeHeroMode,
  HomeLayoutConfig,
  HomeSectionConfig,
  HomeSectionSource,
  MediaItem,
} from '../types/media';
import { matchesCategoryFilter } from './categoryMatcher';

export const HOME_CONFIG_STORAGE_KEY = 'rahaltv_home_config_v1';
const HERO_FIT_DEFAULT_RESTORED_KEY = 'rahaltv_hero_fit_cover_restored_v1';

export const DEFAULT_HOME_SECTIONS: HomeSectionConfig[] = [
  {
    id: 'sec-latest',
    title: 'أحدث الإضافات',
    subtitle: 'أجدد الأفلام والمسلسلات المرفوعة بجودة عالية',
    enabled: true,
    source: 'latest',
    limit: 10,
    layout: 'grid',
  },
  {
    id: 'sec-movies',
    title: 'أفلام مختارة',
    subtitle: 'أقوى إنتاجات السينما العالمية والعربية',
    enabled: true,
    source: 'movies',
    limit: 10,
    layout: 'row',
  },
  {
    id: 'sec-series',
    title: 'مسلسلات وعروض مميزة',
    subtitle: 'حلقات محدثة ومواسم كاملة بدون تقطيع',
    enabled: true,
    source: 'series',
    limit: 10,
    layout: 'grid',
  },
];

export const DEFAULT_HOME_CONFIG: HomeLayoutConfig = {
  showHero: true,
  heroMode: 'auto',
  heroMediaId: '',
  heroBadgeText: 'اختيار المحررين',
  heroHeadline: '',
  heroDescription: '',
  heroPrimaryCta: 'مشاهدة الآن',
  heroShowHighlights: true,
  heroAutoPlay: true,
  heroSlideIntervalSec: 6,
  heroShowProgressBar: true,
  heroShowThumbnails: true,
  heroShowArrows: true,
  heroPauseOnHover: true,
  heroMaxSlides: 8,
  heroSlideIds: [],
  heroImageFit: 'cover',
  heroBackdropBlurPx: 24,
  heroBackdropDimPct: 45,
  heroShowDescription: true,
  heroTitleSizePx: 26,
  heroDescriptionSizePx: 13,
  heroDescriptionLines: 2,
  heroTextAlign: 'right',
  heroInfoPosition: 'bottom-right',
  heroTextMaxWidthPx: 540,
  heroShowBadge: true,
  heroShowRating: true,
  heroShowYear: true,
  heroShowDuration: true,
  heroShowGenres: false,
  heroShowQuality: true,
  heroShowWatchBtn: true,
  heroShowDetailsBtn: true,
  heroShowWatchlistBtn: true,
  showQuickFilters: true,
  showCategoryBar: false,
  showFullLibrary: false,
  showRequestBanner: true,
  cardsPerRow: 5,
  cardStyle: 'clean',
  sections: DEFAULT_HOME_SECTIONS,
};

const VALID_HERO_MODES: HomeHeroMode[] = ['auto', 'manual', 'brand'];
const VALID_HERO_IMAGE_FITS: HeroImageFitMode[] = ['contain', 'cover', 'contain_blur'];
const VALID_HERO_ALIGNS: HeroTextAlign[] = ['right', 'center', 'left'];
const VALID_HERO_POSITIONS: HeroInfoPosition[] = [
  'bottom-right',
  'bottom-center',
  'bottom-left',
  'middle-right',
  'middle-center',
  'middle-left',
];
const VALID_SOURCES: HomeSectionSource[] = [
  'latest',
  'movies',
  'series',
  'top_rated',
  'trending',
  'ramadan',
  'wrestling',
  'category',
  'custom',
];

export function normalizeHomeSection(
  raw: Partial<HomeSectionConfig> | null | undefined,
  index: number
): HomeSectionConfig {
  const id =
    typeof raw?.id === 'string' && /^[a-zA-Z0-9_\-]+$/.test(raw.id.trim())
      ? raw.id.trim().slice(0, 64)
      : `sec-${index + 1}`;
  const title =
    typeof raw?.title === 'string' && raw.title.trim()
      ? raw.title.trim().slice(0, 100)
      : `قسم ${index + 1}`;
  const subtitle =
    typeof raw?.subtitle === 'string' ? raw.subtitle.trim().slice(0, 180) : '';
  const source: HomeSectionSource = VALID_SOURCES.includes(raw?.source as HomeSectionSource)
    ? (raw!.source as HomeSectionSource)
    : 'latest';
  const categoryFilter =
    typeof raw?.categoryFilter === 'string' ? raw.categoryFilter.trim().slice(0, 80) : '';
  const customMediaIds = Array.isArray(raw?.customMediaIds)
    ? raw!.customMediaIds
        .map((m) => String(m || '').trim().slice(0, 128))
        .filter(Boolean)
        .slice(0, 24)
    : [];
  const limitNum = Number(raw?.limit);
  const limit = Number.isFinite(limitNum) ? Math.min(24, Math.max(2, Math.round(limitNum))) : 10;
  const layout = raw?.layout === 'row' ? 'row' : 'grid';

  return {
    id,
    title,
    subtitle,
    enabled: Boolean(raw?.enabled ?? true),
    source,
    categoryFilter,
    customMediaIds,
    limit,
    layout,
  };
}

export function normalizeHomeConfig(
  raw?: Partial<HomeLayoutConfig> | null
): HomeLayoutConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_HOME_CONFIG,
      sections: DEFAULT_HOME_SECTIONS.map((s) => ({ ...s })),
    };
  }

  const heroMode: HomeHeroMode = VALID_HERO_MODES.includes(raw.heroMode as HomeHeroMode)
    ? (raw.heroMode as HomeHeroMode)
    : 'auto';

  const cardsPerRow =
    raw.cardsPerRow === 4 || raw.cardsPerRow === 5 || raw.cardsPerRow === 6
      ? raw.cardsPerRow
      : 5;

  const rawSections = Array.isArray(raw.sections) && raw.sections.length > 0
    ? raw.sections.slice(0, 12).map((sec, idx) => normalizeHomeSection(sec, idx))
    : DEFAULT_HOME_SECTIONS.map((s) => ({ ...s }));

  const intervalNum = Number(raw.heroSlideIntervalSec);
  const heroSlideIntervalSec = Number.isFinite(intervalNum)
    ? Math.min(30, Math.max(2, Math.round(intervalNum)))
    : DEFAULT_HOME_CONFIG.heroSlideIntervalSec!;

  const maxSlidesNum = Number(raw.heroMaxSlides);
  const heroMaxSlides = Number.isFinite(maxSlidesNum)
    ? Math.min(12, Math.max(1, Math.round(maxSlidesNum)))
    : DEFAULT_HOME_CONFIG.heroMaxSlides!;

  const heroSlideIds = Array.isArray(raw.heroSlideIds)
    ? Array.from(
        new Set(
          raw.heroSlideIds
            .map((id) => String(id || '').trim().slice(0, 128))
            .filter(Boolean)
        )
      ).slice(0, 12)
    : [];

  const titleSizeNum = Number(raw.heroTitleSizePx);
  const heroTitleSizePx = Number.isFinite(titleSizeNum)
    ? Math.min(54, Math.max(16, Math.round(titleSizeNum)))
    : DEFAULT_HOME_CONFIG.heroTitleSizePx!;

  const descSizeNum = Number(raw.heroDescriptionSizePx);
  const heroDescriptionSizePx = Number.isFinite(descSizeNum)
    ? Math.min(22, Math.max(11, Math.round(descSizeNum)))
    : DEFAULT_HOME_CONFIG.heroDescriptionSizePx!;

  const descLinesNum = Number(raw.heroDescriptionLines);
  const heroDescriptionLines = (
    Number.isFinite(descLinesNum)
      ? Math.min(5, Math.max(1, Math.round(descLinesNum)))
      : DEFAULT_HOME_CONFIG.heroDescriptionLines!
  ) as 1 | 2 | 3 | 4 | 5;

  const heroTextAlign: HeroTextAlign = VALID_HERO_ALIGNS.includes(raw.heroTextAlign as HeroTextAlign)
    ? (raw.heroTextAlign as HeroTextAlign)
    : DEFAULT_HOME_CONFIG.heroTextAlign!;

  const heroInfoPosition: HeroInfoPosition = VALID_HERO_POSITIONS.includes(
    raw.heroInfoPosition as HeroInfoPosition
  )
    ? (raw.heroInfoPosition as HeroInfoPosition)
    : DEFAULT_HOME_CONFIG.heroInfoPosition!;

  const maxWidthNum = Number(raw.heroTextMaxWidthPx);
  const heroTextMaxWidthPx = Number.isFinite(maxWidthNum)
    ? Math.min(860, Math.max(320, Math.round(maxWidthNum)))
    : DEFAULT_HOME_CONFIG.heroTextMaxWidthPx!;

  const heroImageFit: HeroImageFitMode = VALID_HERO_IMAGE_FITS.includes(
    raw.heroImageFit as HeroImageFitMode
  )
    ? (raw.heroImageFit as HeroImageFitMode)
    : DEFAULT_HOME_CONFIG.heroImageFit!;

  const blurNum = Number(raw.heroBackdropBlurPx);
  const heroBackdropBlurPx = Number.isFinite(blurNum)
    ? Math.min(48, Math.max(0, Math.round(blurNum)))
    : DEFAULT_HOME_CONFIG.heroBackdropBlurPx!;

  const dimNum = Number(raw.heroBackdropDimPct);
  const heroBackdropDimPct = Number.isFinite(dimNum)
    ? Math.min(85, Math.max(0, Math.round(dimNum)))
    : DEFAULT_HOME_CONFIG.heroBackdropDimPct!;

  return {
    showHero: Boolean(raw.showHero ?? true),
    heroMode,
    heroMediaId: typeof raw.heroMediaId === 'string' ? raw.heroMediaId.trim().slice(0, 128) : '',
    heroBadgeText:
      typeof raw.heroBadgeText === 'string' && raw.heroBadgeText.trim()
        ? raw.heroBadgeText.trim().slice(0, 50)
        : DEFAULT_HOME_CONFIG.heroBadgeText,
    heroHeadline:
      typeof raw.heroHeadline === 'string' ? raw.heroHeadline.trim().slice(0, 160) : '',
    heroDescription:
      typeof raw.heroDescription === 'string' ? raw.heroDescription.trim().slice(0, 320) : '',
    heroPrimaryCta:
      typeof raw.heroPrimaryCta === 'string' && raw.heroPrimaryCta.trim()
        ? raw.heroPrimaryCta.trim().slice(0, 40)
        : DEFAULT_HOME_CONFIG.heroPrimaryCta,
    heroShowHighlights: Boolean(raw.heroShowHighlights ?? true),
    heroAutoPlay: Boolean(raw.heroAutoPlay ?? true),
    heroSlideIntervalSec,
    heroShowProgressBar: Boolean(raw.heroShowProgressBar ?? true),
    heroShowThumbnails: Boolean(raw.heroShowThumbnails ?? true),
    heroShowArrows: Boolean(raw.heroShowArrows ?? true),
    heroPauseOnHover: Boolean(raw.heroPauseOnHover ?? true),
    heroMaxSlides,
    heroSlideIds,
    heroImageFit,
    heroBackdropBlurPx,
    heroBackdropDimPct,
    heroShowDescription: Boolean(raw.heroShowDescription ?? true),
    heroTitleSizePx,
    heroDescriptionSizePx,
    heroDescriptionLines,
    heroTextAlign,
    heroInfoPosition,
    heroTextMaxWidthPx,
    heroShowBadge: Boolean(raw.heroShowBadge ?? true),
    heroShowRating: Boolean(raw.heroShowRating ?? true),
    heroShowYear: Boolean(raw.heroShowYear ?? true),
    heroShowDuration: Boolean(raw.heroShowDuration ?? true),
    heroShowGenres: Boolean(raw.heroShowGenres ?? false),
    heroShowQuality: Boolean(raw.heroShowQuality ?? true),
    heroShowWatchBtn: Boolean(raw.heroShowWatchBtn ?? true),
    heroShowDetailsBtn: Boolean(raw.heroShowDetailsBtn ?? true),
    heroShowWatchlistBtn: Boolean(raw.heroShowWatchlistBtn ?? true),
    showQuickFilters: Boolean(raw.showQuickFilters ?? true),
    showCategoryBar: Boolean(raw.showCategoryBar ?? false),
    showFullLibrary: Boolean(raw.showFullLibrary ?? false),
    showRequestBanner: Boolean(raw.showRequestBanner ?? true),
    cardsPerRow,
    cardStyle: (
      raw.cardStyle === 'classic' || raw.cardStyle === 'showcase' ? raw.cardStyle : 'clean'
    ) as HomeCardStyle,
    sections: rawSections,
  };
}

export function loadStoredHomeConfig(): HomeLayoutConfig {
  if (typeof window === 'undefined') return normalizeHomeConfig();
  try {
    const raw = localStorage.getItem(HOME_CONFIG_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(HERO_FIT_DEFAULT_RESTORED_KEY, '1');
      return normalizeHomeConfig();
    }
    const parsed = JSON.parse(raw) as Partial<HomeLayoutConfig>;
    if (!localStorage.getItem(HERO_FIT_DEFAULT_RESTORED_KEY)) {
      localStorage.setItem(HERO_FIT_DEFAULT_RESTORED_KEY, '1');
      if (parsed && parsed.heroImageFit === 'contain') {
        const migrated = normalizeHomeConfig({ ...parsed, heroImageFit: 'cover' });
        localStorage.setItem(HOME_CONFIG_STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
    return normalizeHomeConfig(parsed);
  } catch {
    return normalizeHomeConfig();
  }
}

export function saveStoredHomeConfig(config: HomeLayoutConfig): HomeLayoutConfig {
  const clean = normalizeHomeConfig(config);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(HERO_FIT_DEFAULT_RESTORED_KEY, '1');
      localStorage.setItem(HOME_CONFIG_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Ignore storage quota errors
    }
  }
  return clean;
}

export function resolveSectionMediaItems(
  catalog: MediaItem[],
  section: HomeSectionConfig
): MediaItem[] {
  const limit = Math.max(1, section.limit || 10);

  switch (section.source) {
    case 'movies':
      return catalog.filter((i) => matchesCategoryFilter(i, 'افلام') || i.kind === 'movie').slice(0, limit);
    case 'series':
      return catalog
        .filter((i) => matchesCategoryFilter(i, 'مسلسلات') || i.kind === 'series' || i.kind === 'tv')
        .slice(0, limit);
    case 'top_rated':
      return [...catalog]
        .sort((a, b) => {
          const avgDiff = (b.communityRating?.average || 0) - (a.communityRating?.average || 0);
          if (avgDiff !== 0) return avgDiff;
          return (b.communityRating?.count || 0) - (a.communityRating?.count || 0);
        })
        .slice(0, limit);
    case 'trending':
      return [...catalog].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, limit);
    case 'ramadan':
      return catalog.filter((i) => matchesCategoryFilter(i, 'رمضان 2026')).slice(0, limit);
    case 'wrestling':
      return catalog
        .filter((i) => i.kind === 'wrestling' || matchesCategoryFilter(i, 'مصارعة حرة'))
        .slice(0, limit);
    case 'category':
      return (section.categoryFilter
        ? catalog.filter((i) => matchesCategoryFilter(i, section.categoryFilter!))
        : catalog
      ).slice(0, limit);
    case 'custom': {
      const ids = section.customMediaIds || [];
      const byId = new Map(catalog.map((item) => [item.id, item]));
      const picked = ids.map((id) => byId.get(id)).filter((x): x is MediaItem => Boolean(x));
      return picked.slice(0, limit);
    }
    case 'latest':
    default:
      return catalog.slice(0, limit);
  }
}

export const HOME_CONFIG_CORE_KEYS = [
  'showHero',
  'heroMode',
  'heroMediaId',
  'heroBadgeText',
  'heroHeadline',
  'heroDescription',
  'heroPrimaryCta',
  'heroShowHighlights',
  'showQuickFilters',
  'showCategoryBar',
  'showFullLibrary',
  'showRequestBanner',
  'cardsPerRow',
  'cardStyle',
  'sections',
] as const;

export const HOME_CONFIG_AUTOPLAY_KEYS = [
  'heroAutoPlay',
  'heroSlideIntervalSec',
  'heroShowProgressBar',
  'heroShowThumbnails',
  'heroShowArrows',
  'heroPauseOnHover',
  'heroMaxSlides',
  'heroSlideIds',
] as const;

export const HOME_CONFIG_SLIDER_STYLE_KEYS = [
  'heroShowDescription',
  'heroTitleSizePx',
  'heroDescriptionSizePx',
  'heroDescriptionLines',
  'heroTextAlign',
  'heroInfoPosition',
  'heroTextMaxWidthPx',
  'heroImageFit',
  'heroBackdropBlurPx',
  'heroBackdropDimPct',
  'heroShowBadge',
  'heroShowRating',
  'heroShowYear',
  'heroShowDuration',
  'heroShowGenres',
  'heroShowQuality',
  'heroShowWatchBtn',
  'heroShowDetailsBtn',
  'heroShowWatchlistBtn',
] as const;

export function pickLegacyCoreHomeConfig(cfg: HomeLayoutConfig): Record<string, unknown> {
  const normalized = normalizeHomeConfig(cfg);
  const out: Record<string, unknown> = {};
  for (const key of HOME_CONFIG_CORE_KEYS) {
    out[key] = normalized[key];
  }
  return out;
}

export function pickLegacyAutoplayHomeConfig(cfg: HomeLayoutConfig): Record<string, unknown> {
  const normalized = normalizeHomeConfig(cfg);
  const out = pickLegacyCoreHomeConfig(normalized);
  for (const key of HOME_CONFIG_AUTOPLAY_KEYS) {
    out[key] = normalized[key];
  }
  return out;
}

export function pickSliderStyleHomeConfig(cfg: HomeLayoutConfig): Record<string, unknown> {
  const normalized = normalizeHomeConfig(cfg);
  const out: Record<string, unknown> = {};
  for (const key of HOME_CONFIG_SLIDER_STYLE_KEYS) {
    out[key] = normalized[key];
  }
  return out;
}

export function extractHomeBaseFromRecord(raw: unknown): Partial<HomeLayoutConfig> {
  if (!raw || typeof raw !== 'object') return {};
  const rec = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of [...HOME_CONFIG_CORE_KEYS, ...HOME_CONFIG_AUTOPLAY_KEYS]) {
    if (key in rec && rec[key] !== undefined) {
      out[key] = rec[key];
    }
  }
  return out as Partial<HomeLayoutConfig>;
}

export function extractSliderStyleFromRecord(raw: unknown): Partial<HomeLayoutConfig> {
  if (!raw || typeof raw !== 'object') return {};
  const rec = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of HOME_CONFIG_SLIDER_STYLE_KEYS) {
    if (key in rec && rec[key] !== undefined) {
      out[key] = rec[key];
    }
  }
  return out as Partial<HomeLayoutConfig>;
}

export function homeConfigHasAllSliderStyleKeys(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const rec = raw as Record<string, unknown>;
  return HOME_CONFIG_SLIDER_STYLE_KEYS.every((key) => key in rec && rec[key] !== undefined);
}


