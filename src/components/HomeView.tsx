import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clock,
  Film,
  Flame,
  Grid2x2,
  Info,
  Layers,
  MessageSquarePlus,
  Pause,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tags,
  Trophy,
  Tv,
  Zap,
} from 'lucide-react';
import { CATEGORY_TAGS } from '../data/catalog';
import { normalizeHomeConfig, resolveSectionMediaItems } from '../lib/homeConfig';
import {
  FALLBACK_BACKDROP,
  FALLBACK_POSTER,
  matchesCategoryFilter,
} from '../lib/mediaFilters';
import {
  getBackdropInfo,
  getHeroThumbUrl,
  getPosterUrl,
} from '../lib/mediaImages';
import {
  CatalogFilterState,
  HomeCardStyle,
  HomeSectionConfig,
  HomeSectionSource,
  MediaItem,
  SiteSettings,
} from '../types/media';
import { MovieCard } from './MovieCard';
import { OptimizedImage } from './OptimizedImage';
import { RunningRabbitLoader } from './RunningRabbitLoader';
import { CinematicHeroSlider } from './CinematicHeroSlider';
import { ShowcaseHeroSlider } from './ShowcaseHeroSlider';
import { useHeroSliderVariant } from '../lib/heroSliderMode';

interface HomeViewProps {
  catalog: MediaItem[];
  siteSettings: SiteSettings;
  isAdmin?: boolean;
  loading?: boolean;
  loadError?: string | null;
  onRetryLoad?: () => void;
  onSelectMedia: (item: MediaItem, openDownloads?: boolean) => void;
  onApplyFilter: (partial: Partial<CatalogFilterState>) => void;
  onPlayNow: (item: MediaItem) => void;
  onOpenContact: () => void;
  onOpenHomeBuilder?: () => void;
  watchlistIds: string[];
  onToggleWatchlist: (item: MediaItem) => void;
  recentlyWatchedSection?: ReactNode;
}

const QUICK_FILTER_TABS: Array<{
  id: string;
  label: string;
  filter: Partial<CatalogFilterState>;
}> = [
  { id: 'all', label: 'كل الأعمال', filter: {} },
  { id: 'movies', label: 'الأفلام', filter: { category: 'افلام' } },
  { id: 'foreign-movies', label: 'أفلام أجنبية', filter: { category: 'افلام اجنبية' } },
  { id: 'arabic-movies', label: 'أفلام عربية', filter: { category: 'افلام عربية' } },
  { id: 'series', label: 'المسلسلات', filter: { category: 'مسلسلات' } },
  { id: 'ramadan', label: 'رمضان 2026', filter: { category: 'رمضان 2026' } },
  { id: 'wrestling', label: 'مصارعة حرة', filter: { category: 'مصارعة حرة' } },
  { id: 'top-rated', label: 'الأعلى تقييماً', filter: { preset: 'rating' } },
];

function getSectionIcon(source: HomeSectionSource) {
  switch (source) {
    case 'movies':
      return <Film className="w-5 h-5 text-[#E50914]" />;
    case 'series':
      return <Tv className="w-5 h-5 text-[#E50914]" />;
    case 'top_rated':
      return <Star className="w-5 h-5 text-[#f9c400]" />;
    case 'trending':
      return <Flame className="w-5 h-5 text-[#E50914]" />;
    case 'wrestling':
      return <Trophy className="w-5 h-5 text-[#f9c400]" />;
    case 'ramadan':
      return <Sparkles className="w-5 h-5 text-[#f9c400]" />;
    case 'category':
    case 'custom':
      return <Layers className="w-5 h-5 text-[#E50914]" />;
    case 'latest':
    default:
      return <Clapperboard className="w-5 h-5 text-[#E50914]" />;
  }
}

function getSectionViewAllFilter(section: HomeSectionConfig): Partial<CatalogFilterState> {
  switch (section.source) {
    case 'movies':
      return { category: 'افلام' };
    case 'series':
      return { category: 'مسلسلات' };
    case 'top_rated':
      return { preset: 'rating' };
    case 'trending':
      return { preset: 'views' };
    case 'ramadan':
      return { category: 'رمضان 2026' };
    case 'wrestling':
      return { category: 'مصارعة حرة' };
    case 'category':
      return section.categoryFilter ? { category: section.categoryFilter } : {};
    case 'latest':
    default:
      return { preset: 'latest' };
  }
}

function getGridColumnClass(cardsPerRow: 4 | 5 | 6): string {
  if (cardsPerRow === 4) {
    return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
  }
  if (cardsPerRow === 6) {
    return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';
  }
  return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5';
}

/* Lightweight Scroll Fade-In Wrapper (Zero-Latency Fallback) */
function RevealSection({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 120) {
      setVisible(true);
      return;
    }
    setVisible(false);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '220px 0px', threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-500 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* Horizontal Netflix-style Carousel Row */
function SectionHorizontalRow({
  items,
  cardStyle,
  watchlistIds,
  prioritizeInitialCount = 0,
  onSelectMedia,
  onToggleWatchlist,
}: {
  items: MediaItem[];
  cardStyle: HomeCardStyle;
  watchlistIds: string[];
  prioritizeInitialCount?: number;
  onSelectMedia: (item: MediaItem, openDownloads?: boolean) => void;
  onToggleWatchlist: (item: MediaItem) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const scrollByDir = (dir: 'next' | 'prev') => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.max(280, el.clientWidth * 0.72);
    // In RTL, negative scrollLeft moves toward left (next items)
    el.scrollBy({
      left: dir === 'next' ? -step : step,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative group/row">
      {items.length > 1 && (
        <button
          type="button"
          onClick={() => scrollByDir('prev')}
          aria-label="التمرير لليمين"
          className="flex absolute right-1.5 sm:right-2 top-[40%] sm:top-[42%] -translate-y-1/2 z-20 h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11 items-center justify-center rounded-full bg-black/80 backdrop-blur-sm border border-white/20 text-white opacity-95 md:opacity-0 md:group-hover/row:opacity-100 md:focus-visible:opacity-100 hover:bg-[#E50914] active:bg-[#E50914] active:scale-95 transition-all cursor-pointer shadow-xl"
        >
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      )}

      <div
        ref={scrollerRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory pt-2 pb-3"
      >
        {items.map((item, idx) => (
          <div
            key={`${item.id}::${item.poster_url || item.poster || ''}`}
            className="w-[46.5%] sm:w-[31%] md:w-[23.5%] lg:w-[19%] shrink-0 snap-start"
          >
            <MovieCard
              item={item}
              onSelect={onSelectMedia}
              isInWatchlist={watchlistIds.includes(item.id)}
              onToggleWatchlist={onToggleWatchlist}
              variant={cardStyle}
              priority={idx < prioritizeInitialCount}
            />
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <button
          type="button"
          onClick={() => scrollByDir('next')}
          aria-label="التمرير لليسار"
          className="flex absolute left-1.5 sm:left-2 top-[40%] sm:top-[42%] -translate-y-1/2 z-20 h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11 items-center justify-center rounded-full bg-black/80 backdrop-blur-sm border border-white/20 text-white opacity-95 md:opacity-0 md:group-hover/row:opacity-100 md:focus-visible:opacity-100 hover:bg-[#E50914] active:bg-[#E50914] active:scale-95 transition-all cursor-pointer shadow-xl"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      )}
    </div>
  );
}

export function HomeView({
  catalog,
  siteSettings,
  isAdmin = false,
  loading = false,
  loadError = null,
  onRetryLoad,
  onSelectMedia,
  onApplyFilter,
  onPlayNow,
  onOpenContact,
  onOpenHomeBuilder,
  watchlistIds,
  onToggleWatchlist,
  recentlyWatchedSection,
}: HomeViewProps) {
  const homeConfig = useMemo(
    () => normalizeHomeConfig(siteSettings.homeConfig),
    [siteSettings.homeConfig]
  );
  const [heroSliderVariant] = useHeroSliderVariant();

  const pinnedList = useMemo(() => catalog.filter((i) => i.pinned), [catalog]);
  const maxHeroSlides = Math.min(12, Math.max(1, Number(homeConfig.heroMaxSlides) || 8));
  const slideIntervalSec = Math.min(30, Math.max(2, Number(homeConfig.heroSlideIntervalSec) || 6));
  const autoPlayEnabled = homeConfig.heroAutoPlay ?? true;
  const showProgressBar = homeConfig.heroShowProgressBar ?? true;
  const showThumbnails = homeConfig.heroShowThumbnails ?? true;
  const showArrows = homeConfig.heroShowArrows ?? true;
  const pauseOnHover = homeConfig.heroPauseOnHover ?? true;

  const heroSlides = useMemo(() => {
    if (catalog.length === 0) return [];
    const byId = new Map(catalog.map((i) => [i.id, i]));
    const customSelected = (homeConfig.heroSlideIds || [])
      .map((id) => byId.get(id))
      .filter((item): item is MediaItem => Boolean(item));

    // When admin explicitly picked movies for the slider in manual mode, show strictly those in order
    if (homeConfig.heroMode === 'manual' && customSelected.length > 0) {
      return customSelected.slice(0, maxHeroSlides);
    }

    const ordered: MediaItem[] = [];
    const seen = new Set<string>();

    if ((homeConfig.heroMode === 'manual' || homeConfig.heroMode === 'brand') && homeConfig.heroMediaId) {
      const manualItem = byId.get(homeConfig.heroMediaId);
      if (manualItem) {
        ordered.push(manualItem);
        seen.add(manualItem.id);
      }
    }

    for (const item of customSelected) {
      if (ordered.length >= maxHeroSlides) break;
      if (!seen.has(item.id)) {
        ordered.push(item);
        seen.add(item.id);
      }
    }

    for (const item of pinnedList) {
      if (ordered.length >= maxHeroSlides) break;
      if (!seen.has(item.id)) {
        ordered.push(item);
        seen.add(item.id);
      }
    }
    for (const item of catalog) {
      if (ordered.length >= maxHeroSlides) break;
      if (!seen.has(item.id)) {
        ordered.push(item);
        seen.add(item.id);
      }
    }
    return ordered.slice(0, maxHeroSlides);
  }, [
    pinnedList,
    catalog,
    homeConfig.heroMode,
    homeConfig.heroMediaId,
    homeConfig.heroSlideIds,
    maxHeroSlides,
  ]);

  const [heroIndex, setHeroIndex] = useState(0);
  const [heroHovered, setHeroHovered] = useState(false);
  const [heroPausedManual, setHeroPausedManual] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const heroTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Full Paginated Library (optional when toggled on by admin)
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'movie' | 'series' | 'other'>('all');
  const [libraryPage, setLibraryPage] = useState(1);

  const activeSlideIndex = heroSlides.length ? heroIndex % heroSlides.length : 0;
  const isTimerPaused = heroPausedManual || (pauseOnHover && heroHovered);

  useEffect(() => {
    if (heroSlides.length > 0 && heroIndex >= heroSlides.length) {
      setHeroIndex(0);
    }
  }, [heroSlides.length, heroIndex]);

  useEffect(() => {
    if (!autoPlayEnabled || heroSlides.length <= 1 || isTimerPaused) return;
    const timer = setTimeout(() => {
      setHeroIndex((prev) => (prev + 1) % heroSlides.length);
    }, slideIntervalSec * 1000);
    return () => clearTimeout(timer);
  }, [autoPlayEnabled, heroSlides.length, isTimerPaused, slideIntervalSec, activeSlideIndex]);

  useEffect(() => {
    setLibraryPage(1);
  }, [libraryFilter, catalog.length]);

  const activeHero = useMemo(() => {
    if (catalog.length === 0) return null;
    if (heroSlides.length > 0) {
      return heroSlides[activeSlideIndex] || catalog[0];
    }
    return catalog[0];
  }, [catalog, heroSlides, activeSlideIndex]);

  const tickerBase = catalog.slice(0, 10);
  const tickerItems = [...tickerBase, ...tickerBase];

  const quickCategoryChips = useMemo(() => {
    const seen = new Set<string>();
    return CATEGORY_TAGS.filter((tag) => {
      if (seen.has(tag.category)) return false;
      seen.add(tag.category);
      return true;
    }).map((tag) => ({
      ...tag,
      count: catalog.filter((item) => matchesCategoryFilter(item, tag.category)).length,
    }));
  }, [catalog]);

  const filteredLibraryItems = useMemo(() => {
    if (libraryFilter === 'movie') {
      return catalog.filter((i) => matchesCategoryFilter(i, 'افلام') || i.kind === 'movie');
    }
    if (libraryFilter === 'series') {
      return catalog.filter((i) => matchesCategoryFilter(i, 'مسلسلات') || i.kind === 'series');
    }
    if (libraryFilter === 'other') {
      return catalog.filter((i) => i.kind === 'tv' || i.kind === 'wrestling');
    }
    return catalog;
  }, [catalog, libraryFilter]);

  const LIBRARY_PAGE_SIZE = 15;
  const totalLibraryPages = Math.max(1, Math.ceil(filteredLibraryItems.length / LIBRARY_PAGE_SIZE));
  const safeLibraryPage = Math.min(libraryPage, totalLibraryPages);
  const paginatedLibraryItems = filteredLibraryItems.slice(
    (safeLibraryPage - 1) * LIBRARY_PAGE_SIZE,
    safeLibraryPage * LIBRARY_PAGE_SIZE
  );

  /* Loading State */
  if (loading && catalog.length === 0) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-16">
        <RunningRabbitLoader
          variant="section"
          size="lg"
          label="جاري تحميل أحدث الأفلام والمسلسلات..."
          delayMs={120}
        />
      </div>
    );
  }

  /* Error State when catalog failed to load */
  if (!loading && loadError && catalog.length === 0) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-16">
        <RunningRabbitLoader
          variant="section"
          error={loadError}
          onRetry={onRetryLoad}
          className="mt-6"
        />
      </div>
    );
  }

  /* Empty State */
  if (!activeHero) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-36 pb-20 text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E50914]/15 border border-[#E50914]/30 text-[#E50914]">
          <Clapperboard className="w-8 h-8" />
        </div>
        <h2 className="font-display text-2xl font-extrabold text-white">
          لا يوجد محتوى منشور حاليًا
        </h2>
        <p className="text-sm text-[#a3a3a3] leading-relaxed">
          المكتبة فارغة في الوقت الحالي. يمكنك إضافة أفلام ومسلسلات أو تخصيص الصفحة الرئيسية من لوحة التحكم.
        </p>
        {isAdmin && onOpenHomeBuilder && (
          <button
            type="button"
            onClick={onOpenHomeBuilder}
            className="inline-flex items-center gap-2 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-5 py-2.5 text-xs font-extrabold text-white cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>إدارة الصفحة الرئيسية</span>
          </button>
        )}
      </div>
    );
  }

  const heroTitle =
    homeConfig.heroHeadline ||
    (homeConfig.heroMode === 'brand'
      ? `${siteSettings.siteName} — سينما عالية الجودة بلا تقطيع`
      : activeHero.title);

  const heroDescription =
    homeConfig.heroDescription ||
    (homeConfig.heroMode === 'brand' ? siteSettings.tagline || activeHero.story : activeHero.story);

  const heroInWatchlist = watchlistIds.includes(activeHero.id);
  const gridColClass = getGridColumnClass(homeConfig.cardsPerRow);
  const enabledSections = homeConfig.sections.filter((sec) => sec.enabled);

  return (
    <div className="space-y-6 sm:space-y-9 md:space-y-12 pb-10 sm:pb-14">
      {/* Optional Admin Announcement Bar */}
      {siteSettings.announcementText && !dismissedBanner && (
        <div className="bg-[#E50914] pt-20 pb-2.5 px-4 text-center text-xs font-extrabold text-white relative">
          <span>{siteSettings.announcementText}</span>
          <button
            type="button"
            onClick={() => setDismissedBanner(true)}
            className="absolute left-4 bottom-2 text-white/80 hover:text-white cursor-pointer"
            aria-label="إخفاء التنبيه"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. Full-Bleed Cinematic Hero Section (100vw Cover Default / Optional Contain & Ambient Blur) */}
      {homeConfig.showHero &&
        (heroSliderVariant === 'cinematic' ? (
          <CinematicHeroSlider
            slides={heroSlides}
            autoPlayEnabled={autoPlayEnabled}
            slideIntervalSec={slideIntervalSec}
            pauseOnHover={pauseOnHover}
            onSelectMedia={onSelectMedia}
          />
        ) : heroSliderVariant === 'showcase' ? (
          <ShowcaseHeroSlider
            slides={heroSlides}
            autoPlayEnabled={autoPlayEnabled}
            slideIntervalSec={slideIntervalSec}
            pauseOnHover={pauseOnHover}
            watchlistIds={watchlistIds}
            onSelectMedia={onSelectMedia}
            onPlayNow={onPlayNow}
            onToggleWatchlist={onToggleWatchlist}
          />
        ) : (() => {
        const backdropInfo = getBackdropInfo(activeHero);
        const heroBgSrc = backdropInfo.hasDedicatedBackdrop
          ? backdropInfo.url
          : FALLBACK_BACKDROP;
        const ambientPoster = getPosterUrl(activeHero, 'card_small');
        const imageFitMode = homeConfig.heroImageFit || 'cover';
        const blurPx = homeConfig.heroBackdropBlurPx ?? 24;
        const dimPct = homeConfig.heroBackdropDimPct ?? 45;
        const isCoverMode = imageFitMode === 'cover';
        const isAmbientBlurMode = imageFitMode === 'contain_blur';

        return (
          <section
            className="relative rtv-hero-fullbleed overflow-hidden bg-[#0f0f0f]"
            onMouseEnter={() => setHeroHovered(true)}
            onMouseLeave={() => setHeroHovered(false)}
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (!t) return;
              heroTouchStartRef.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={(e) => {
              const start = heroTouchStartRef.current;
              heroTouchStartRef.current = null;
              if (!start || heroSlides.length <= 1) return;
              const t = e.changedTouches[0];
              if (!t) return;
              const dx = t.clientX - start.x;
              const dy = t.clientY - start.y;
              if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                if (dx < 0) {
                  setHeroIndex((prev) => (prev + 1) % heroSlides.length);
                } else {
                  setHeroIndex((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);
                }
              }
            }}
          >
            <div
              className={`relative min-h-[430px] sm:min-h-[470px] max-md:landscape:min-h-[330px] md:min-h-[560px] lg:min-h-[620px] xl:min-h-[660px] flex flex-col ${
                (homeConfig.heroInfoPosition || 'bottom-right').startsWith('middle-')
                  ? 'md:justify-center justify-end'
                  : 'justify-end'
              }`}
            >
              {/* Layer 1: Optional Ambient Scaled + Blurred Background Copy (when heroImageFit === 'contain_blur') */}
              {isAmbientBlurMode && (
                <>
                  <OptimizedImage
                    key={`hero-blur-bg-${activeHero.id}::${heroBgSrc}`}
                    src={heroBgSrc}
                    fallbackSrc={FALLBACK_BACKDROP}
                    alt=""
                    ariaHidden
                    slot="backdrop_card"
                    loading="eager"
                    disablePlaceholder
                    style={{ filter: `blur(${blurPx}px)` }}
                    className="pointer-events-none select-none !absolute inset-0 h-full w-full scale-[1.14]"
                    imgClassName="object-cover object-center"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[#07080c] transition-opacity duration-300"
                    style={{ opacity: Math.min(0.85, Math.max(0, dimPct / 100)) }}
                  />
                </>
              )}

              {/* Layer 2: Foreground Hero Image (Contain Default / Cover / Sharp Contain over Blur) */}
              <OptimizedImage
                key={`${activeHero.id}::${heroBgSrc}`}
                src={heroBgSrc}
                fallbackSrc={FALLBACK_BACKDROP}
                alt={activeHero.title}
                slot="slider_backdrop"
                priority
                loading="eager"
                className={
                  isCoverMode
                    ? 'rtv-hero-cinematic-in !absolute inset-0 h-full w-full'
                    : 'rtv-hero-contain-in pointer-events-none !absolute inset-0 z-[1] h-full w-full'
                }
                imgClassName={
                  isCoverMode
                    ? 'object-cover object-center transition-opacity duration-700'
                    : 'object-contain object-center transition-opacity duration-500'
                }
              />

              {/* Subtle blurred poster accent overlay in Cover mode when item lacks a dedicated backdrop */}
              {isCoverMode && !backdropInfo.hasDedicatedBackdrop && (
                <OptimizedImage
                  key={`hero-ambient-${activeHero.id}::${ambientPoster}`}
                  src={ambientPoster}
                  fallbackSrc={FALLBACK_POSTER}
                  alt=""
                  ariaHidden
                  slot="card_small"
                  loading="lazy"
                  disablePlaceholder
                  className="pointer-events-none !absolute inset-0 h-full w-full opacity-25 blur-2xl scale-110"
                  imgClassName="object-cover object-center"
                />
              )}

              {/* Mobile Cinematic Edge Vignette & Clean Bottom Scrim (< 768px) */}
              <div className="md:hidden pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-[#0f0f0f]/55 via-transparent via-28% to-transparent" />
              <div className="md:hidden pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/80 via-42% to-transparent" />

              {/* Desktop & Tablet Edge Scrims (>= 768px) */}
              <div className="hidden md:block pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/25 via-transparent via-20% to-transparent" />
              <div className="hidden md:block pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/25 via-30% to-transparent" />
              <div className="hidden md:block pointer-events-none absolute inset-0 z-[2] bg-gradient-to-l from-[#0f0f0f]/65 via-[#0f0f0f]/15 via-38% to-transparent" />

              {/* Mobile Cinematic Hero Foreground (< 768px): Minimalist Netflix/Shahid Style */}
              <div
                key={`mobile-hero-${activeHero.id}`}
                className="md:hidden rtv-hero-content-in relative z-10 mx-auto w-full px-3.5 sm:px-4 pt-20 pb-4 flex flex-col gap-3 text-right"
              >
                <div className="space-y-1.5">
                  <h1 className="font-display text-[21px] sm:text-2xl font-extrabold text-white leading-tight line-clamp-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
                    {heroTitle}
                  </h1>

                  {((homeConfig.heroShowRating &&
                    activeHero.communityRating &&
                    activeHero.communityRating.count > 0) ||
                    homeConfig.heroShowYear ||
                    homeConfig.heroShowQuality) && (
                    <div className="flex items-center gap-2 text-xs font-bold text-[#e5e5e5] tabular-nums">
                      {homeConfig.heroShowRating &&
                        activeHero.communityRating &&
                        activeHero.communityRating.count > 0 && (
                          <span className="inline-flex items-center gap-1 text-[#f9c400] font-extrabold font-latin">
                            <Star className="w-3.5 h-3.5 fill-current" />
                            <span dir="ltr">
                              {activeHero.communityRating.average.toFixed(1)}/5
                            </span>
                          </span>
                        )}
                      {homeConfig.heroShowRating &&
                        activeHero.communityRating &&
                        activeHero.communityRating.count > 0 &&
                        homeConfig.heroShowYear && (
                          <span aria-hidden="true" className="text-white/30">•</span>
                        )}
                      {homeConfig.heroShowYear && (
                        <span className="font-latin text-white/90">{activeHero.year || '2026'}</span>
                      )}
                      {((homeConfig.heroShowRating &&
                        activeHero.communityRating &&
                        activeHero.communityRating.count > 0) ||
                        homeConfig.heroShowYear) &&
                        homeConfig.heroShowQuality && (
                          <span aria-hidden="true" className="text-white/30">•</span>
                        )}
                      {homeConfig.heroShowQuality && (
                        <span className="font-latin text-white/95 truncate">
                          {activeHero.quality || 'WEB-DL'}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Primary Actions on Mobile */}
                {(homeConfig.heroShowWatchBtn || homeConfig.heroShowDetailsBtn) && (
                  <div
                    className={`grid gap-2.5 pt-0.5 ${
                      homeConfig.heroShowWatchBtn && homeConfig.heroShowDetailsBtn
                        ? 'grid-cols-2'
                        : 'grid-cols-1'
                    }`}
                  >
                    {homeConfig.heroShowWatchBtn && (
                      <button
                        type="button"
                        onClick={() => onPlayNow(activeHero)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E50914] hover:bg-[#f40612] active:scale-[0.98] min-h-[44px] px-4 py-2.5 text-xs sm:text-sm font-extrabold text-white transition-all cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current shrink-0" />
                        <span className="truncate">{homeConfig.heroPrimaryCta || 'مشاهدة الآن'}</span>
                      </button>
                    )}

                    {homeConfig.heroShowDetailsBtn && (
                      <button
                        type="button"
                        onClick={() => onSelectMedia(activeHero)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#181818]/85 hover:bg-[#262626] active:scale-[0.98] border border-white/15 min-h-[44px] px-4 py-2.5 text-xs sm:text-sm font-bold text-white backdrop-blur-md transition-all cursor-pointer"
                      >
                        <Info className="w-4 h-4 shrink-0" />
                        <span>التفاصيل</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Sleek Pagination Dots + Discreet Prev/Next Controls */}
                {heroSlides.length > 1 && (
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    {showArrows ? (
                      <button
                        type="button"
                        onClick={() =>
                          setHeroIndex((prev) => (prev - 1 + heroSlides.length) % heroSlides.length)
                        }
                        aria-label="العرض السابق"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 border border-white/10 text-white/85 hover:text-white active:scale-95 transition-all cursor-pointer shrink-0"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="w-10 shrink-0" />
                    )}

                    <div
                      className="flex flex-wrap items-center justify-center gap-1 flex-1 min-w-0"
                      role="tablist"
                      aria-label="الأعمال المميزة في السلايدر"
                    >
                      {heroSlides.map((item, idx) => {
                        const isActiveDot = idx === activeSlideIndex;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={isActiveDot}
                            aria-label={`عرض ${item.title}`}
                            onClick={() => setHeroIndex(idx)}
                            className="py-2 px-1 flex items-center justify-center cursor-pointer focus:outline-none"
                          >
                            <span
                              className={`block h-1.5 rounded-full transition-all duration-300 ${
                                isActiveDot
                                  ? 'w-6 bg-[#E50914]'
                                  : 'w-1.5 bg-white/35 hover:bg-white/60'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>

                    {showArrows ? (
                      <button
                        type="button"
                        onClick={() => setHeroIndex((prev) => (prev + 1) % heroSlides.length)}
                        aria-label="العرض التالي"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 border border-white/10 text-white/85 hover:text-white active:scale-95 transition-all cursor-pointer shrink-0"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="w-10 shrink-0" />
                    )}
                  </div>
                )}
              </div>

              {/* Desktop & Tablet Foreground (>= 768px — Controlled via Slider Customization) */}
              {(() => {
                const pos = homeConfig.heroInfoPosition || 'bottom-right';
                const align = homeConfig.heroTextAlign || 'right';
                const isCenterPos = pos.endsWith('-center');
                const isLeftPos = pos.endsWith('-left');
                const justifyContentClass =
                  align === 'center'
                    ? 'justify-center'
                    : align === 'left'
                      ? 'justify-end'
                      : 'justify-start';
                const textAlignClass =
                  align === 'center'
                    ? 'text-center'
                    : align === 'left'
                      ? 'text-left'
                      : 'text-right';

                const metaChips: ReactNode[] = [];
                if (homeConfig.heroShowDuration && activeHero.duration) {
                  metaChips.push(
                    <span key="dur" className="inline-flex items-center gap-1 text-white/90">
                      <Clock className="w-3.5 h-3.5 text-white/75" />
                      <span>{activeHero.duration}</span>
                    </span>
                  );
                }
                if (homeConfig.heroShowQuality) {
                  metaChips.push(
                    <span key="qual" className="font-latin text-white">
                      {activeHero.quality || 'WEB-DL'}
                    </span>
                  );
                }
                if (homeConfig.heroShowYear) {
                  metaChips.push(
                    <span key="year" className="font-latin">
                      {activeHero.year || '2026'}
                    </span>
                  );
                }
                if (
                  homeConfig.heroShowRating &&
                  activeHero.communityRating &&
                  activeHero.communityRating.count > 0
                ) {
                  metaChips.push(
                    <span
                      key="viewer-rating"
                      className="inline-flex items-center gap-1 text-[#f9c400] font-extrabold font-latin"
                    >
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span dir="ltr">{activeHero.communityRating.average.toFixed(1)}/5</span>
                    </span>
                  );
                }

                return (
                  <div className="hidden md:flex relative z-10 mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10 pt-28 pb-6 sm:pb-8 flex-col gap-6 sm:gap-7">
                    <div
                      className={`flex flex-col lg:items-end justify-between gap-6 ${
                        isLeftPos
                          ? 'lg:flex-row-reverse'
                          : isCenterPos
                            ? 'lg:flex-col lg:items-center'
                            : 'lg:flex-row'
                      }`}
                    >
                      <div
                        style={{ maxWidth: `${homeConfig.heroTextMaxWidthPx || 560}px` }}
                        className={`w-full space-y-3 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] ${textAlignClass} ${
                          isCenterPos ? 'mx-auto' : ''
                        }`}
                      >
                        {/* Compact Status Badge */}
                        {homeConfig.heroShowBadge && (
                          <div className={`flex ${justifyContentClass}`}>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E50914] px-3 py-1 text-[11px] font-extrabold text-white shadow-[0_6px_18px_rgba(229,9,20,0.45)]">
                              <Flame className="w-3.5 h-3.5 fill-current" />
                              <span>{homeConfig.heroBadgeText || 'الأكثر مشاهدة'}</span>
                            </span>
                          </div>
                        )}

                        {/* Balanced Compact Headline */}
                        <h1
                          style={{
                            fontSize: `${homeConfig.heroTitleSizePx || 26}px`,
                          }}
                          className="font-display font-extrabold text-white leading-[1.3] line-clamp-2"
                        >
                          {heroTitle}
                        </h1>

                        {/* Single Compact Metadata Line */}
                        {metaChips.length > 0 && (
                          <div
                            className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-bold text-[#d4d4d4] tabular-nums ${justifyContentClass}`}
                          >
                            {metaChips.map((chip, idx) => (
                              <span key={idx} className="inline-flex items-center gap-2.5">
                                {idx > 0 && (
                                  <span aria-hidden="true" className="text-white/25">
                                    |
                                  </span>
                                )}
                                {chip}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Optional Genre Chips */}
                        {homeConfig.heroShowGenres && (activeHero.genres || []).length > 0 && (
                          <div className={`flex flex-wrap items-center gap-1.5 ${justifyContentClass}`}>
                            {(activeHero.genres || []).slice(0, 4).map((g) => (
                              <span
                                key={g}
                                className="rounded-lg bg-white/10 border border-white/15 px-2 py-0.5 text-[11px] font-bold text-white/90 backdrop-blur-sm"
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Movie Description — Completely removed when heroShowDescription is OFF (zero reserved space) */}
                        {homeConfig.heroShowDescription && heroDescription && (
                          <p
                            style={{
                              fontSize: `${homeConfig.heroDescriptionSizePx || 14}px`,
                              display: '-webkit-box',
                              WebkitBoxOrient: 'vertical',
                              WebkitLineClamp: homeConfig.heroDescriptionLines || 2,
                              overflow: 'hidden',
                            }}
                            className="text-[#d4d4d4]/90 leading-relaxed"
                          >
                            {heroDescription}
                          </p>
                        )}

                        {/* Primary & Secondary Action Buttons */}
                        {(homeConfig.heroShowWatchBtn ||
                          homeConfig.heroShowDetailsBtn ||
                          homeConfig.heroShowWatchlistBtn ||
                          (isAdmin && onOpenHomeBuilder)) && (
                          <div className={`pt-1 flex flex-wrap items-center gap-2.5 ${justifyContentClass}`}>
                            {homeConfig.heroShowWatchBtn && (
                              <button
                                type="button"
                                onClick={() => onPlayNow(activeHero)}
                                className="inline-flex items-center gap-2 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-extrabold text-white shadow-[0_10px_28px_rgba(229,9,20,0.45)] transition-transform hover:-translate-y-0.5 cursor-pointer"
                              >
                                <Play className="w-4 h-4 fill-current" />
                                <span>{homeConfig.heroPrimaryCta || 'مشاهدة الآن'}</span>
                              </button>
                            )}

                            {homeConfig.heroShowDetailsBtn && (
                              <button
                                type="button"
                                onClick={() => onSelectMedia(activeHero)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-[#1f242b]/85 hover:bg-white/20 border border-white/15 px-4 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white backdrop-blur-md transition-colors cursor-pointer"
                              >
                                <Info className="w-4 h-4" />
                                <span>التفاصيل</span>
                              </button>
                            )}

                            {homeConfig.heroShowWatchlistBtn && (
                              <button
                                type="button"
                                onClick={() => onToggleWatchlist(activeHero)}
                                aria-label={heroInWatchlist ? 'إزالة من قائمتي' : 'إضافة لقائمتي'}
                                className={`inline-flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl border backdrop-blur-md transition-colors cursor-pointer ${
                                  heroInWatchlist
                                    ? 'bg-[#4CAF50]/20 border-[#4CAF50] text-[#4CAF50]'
                                    : 'bg-[#1f242b]/80 border-white/15 text-white hover:bg-white/20'
                                }`}
                              >
                                {heroInWatchlist ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Bookmark className="w-4 h-4" />
                                )}
                              </button>
                            )}

                            {isAdmin && onOpenHomeBuilder && (
                              <button
                                type="button"
                                onClick={onOpenHomeBuilder}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-[#f9c400] hover:bg-[#eab308] px-3.5 py-2.5 sm:py-3 text-xs font-black text-[#0f0f0f] transition-colors cursor-pointer"
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                <span>تخصيص الرئيسية</span>
                              </button>
                            )}
                          </div>
                        )}

                        {homeConfig.heroShowHighlights && (
                          <div
                            className={`pt-1 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] font-medium text-[#a3a3a3] ${justifyContentClass}`}
                          >
                            <span className="inline-flex items-center gap-1">
                              <Zap className="w-3 h-3 text-[#E50914]" />
                              <span>سيرفرات سريعة بدون تقطيع</span>
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Film className="w-3 h-3 text-[#f9c400]" />
                              <span>دقة 4K UHD</span>
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-[#4CAF50]" />
                              <span>تحديث يومي</span>
                            </span>
                          </div>
                        )}
                      </div>

                  {/* Left Controls: Circular Prev/Next Arrows + Play/Pause + Animated Progress Bar + Dots */}
                  {heroSlides.length > 1 && (showArrows || showProgressBar) && (
                    <div className="flex flex-col items-start lg:items-end gap-2.5 shrink-0">
                      {showArrows && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setHeroIndex(
                                (prev) => (prev - 1 + heroSlides.length) % heroSlides.length
                              )
                            }
                            aria-label="العرض السابق"
                            className="inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-black/65 border border-white/15 text-white hover:bg-[#E50914] hover:border-[#E50914] transition-colors cursor-pointer"
                          >
                            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                          {autoPlayEnabled && (
                            <button
                              type="button"
                              onClick={() => setHeroPausedManual((p) => !p)}
                              aria-label={heroPausedManual ? 'تشغيل السلايدر التلقائي' : 'إيقاف السلايدر مؤقتاً'}
                              title={heroPausedManual ? 'استئناف التقليب التلقائي' : 'إيقاف مؤقت'}
                              className="inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-black/65 border border-white/15 text-white hover:bg-white/20 transition-colors cursor-pointer"
                            >
                              {heroPausedManual ? (
                                <Play className="w-3.5 h-3.5 fill-current" />
                              ) : (
                                <Pause className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setHeroIndex((prev) => (prev + 1) % heroSlides.length)}
                            aria-label="العرض التالي"
                            className="inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-black/65 border border-white/15 text-white hover:bg-[#E50914] hover:border-[#E50914] transition-colors cursor-pointer"
                          >
                            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        </div>
                      )}

                      {showProgressBar && autoPlayEnabled && (
                        <div className="w-44 sm:w-56 space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-bold text-white/80 font-latin tabular-nums">
                            <span>
                              {activeSlideIndex + 1} / {heroSlides.length}
                            </span>
                            <span>
                              {isTimerPaused ? 'متوقف مؤقتاً' : `كل ${slideIntervalSec} ث`}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden shadow-inner">
                            <div
                              key={`hero-bar-${activeSlideIndex}-${slideIntervalSec}-${autoPlayEnabled}`}
                              className="rtv-slider-progress-fill h-full w-full rounded-full bg-gradient-to-l from-[#E50914] via-[#ff3b30] to-[#f9c400]"
                              style={{
                                animationName: 'rtv-slider-progress',
                                animationDuration: `${slideIntervalSec}s`,
                                animationTimingFunction: 'linear',
                                animationFillMode: 'forwards',
                                animationPlayState: isTimerPaused ? 'paused' : 'running',
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {showArrows && (
                        <div className="flex items-center gap-1.5">
                          {heroSlides.map((item, idx) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setHeroIndex(idx)}
                              aria-label={`عرض ${item.title}`}
                              className={`h-1 rounded-full transition-all cursor-pointer ${
                                idx === activeSlideIndex
                                  ? 'w-6 bg-[#E50914]'
                                  : 'w-1.5 bg-white/35 hover:bg-white/65'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Square Poster Thumbnails Strip */}
                {heroSlides.length > 1 && showThumbnails && (
                  <div className="flex items-center justify-center pt-1">
                    <div
                      className="flex items-center justify-center gap-[12px] overflow-x-auto no-scrollbar px-2 py-1.5 max-w-full"
                      role="tablist"
                      aria-label="الأعمال المميزة في السلايدر"
                    >
                      {heroSlides.map((item, idx) => {
                        const isActiveThumb = idx === activeSlideIndex;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={isActiveThumb}
                            aria-label={item.title}
                            onClick={() => setHeroIndex(idx)}
                            className={`relative aspect-square w-[52px] h-[52px] sm:w-[64px] sm:h-[64px] shrink-0 rounded-[8px] overflow-hidden p-0 bg-[#181818] transition-all duration-200 cursor-pointer focus:outline-none ${
                              isActiveThumb
                                ? 'border-2 border-[#E50914] shadow-[0_0_20px_rgba(229,9,20,0.65)] scale-[1.04] opacity-100'
                                : 'border-2 border-white/20 opacity-75 hover:opacity-100 hover:border-white/55'
                            }`}
                          >
                            <OptimizedImage
                              src={getHeroThumbUrl(item)}
                              fallbackSrc={FALLBACK_POSTER}
                              alt={item.title}
                              slot="hero_thumb"
                              priority={isActiveThumb || Math.abs(idx - activeSlideIndex) <= 1}
                              loading={isActiveThumb || Math.abs(idx - activeSlideIndex) <= 1 ? 'eager' : 'lazy'}
                              className="h-full w-full"
                              imgClassName="object-cover object-top"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
                );
              })()}

              {/* Full-Width Moving Slider Progress Bar along the bottom edge */}
              {heroSlides.length > 1 && showProgressBar && autoPlayEnabled && (
                <div className="relative z-20 h-[3px] w-full bg-white/10 overflow-hidden">
                  <div
                    key={`hero-bottom-bar-${activeSlideIndex}-${slideIntervalSec}-${autoPlayEnabled}`}
                    className="rtv-slider-progress-fill h-full w-full bg-gradient-to-l from-[#E50914] via-[#ff453a] to-[#f9c400] shadow-[0_0_12px_rgba(229,9,20,0.75)]"
                    style={{
                      animationName: 'rtv-slider-progress',
                      animationDuration: `${slideIntervalSec}s`,
                      animationTimingFunction: 'linear',
                      animationFillMode: 'forwards',
                      animationPlayState: isTimerPaused ? 'paused' : 'running',
                    }}
                  />
                </div>
              )}
            </div>
          </section>
        );
      })())}

      {/* Admin Quick Customize Banner when Hero is hidden */}
      {!homeConfig.showHero && (
        <div className="pt-20 mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 flex justify-end">
          {isAdmin && onOpenHomeBuilder && (
            <button
              type="button"
              onClick={onOpenHomeBuilder}
              className="inline-flex items-center gap-2 rounded-xl bg-[#f9c400] px-4 py-2 text-xs font-black text-[#0f0f0f] cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>تخصيص الصفحة الرئيسية</span>
            </button>
          )}
        </div>
      )}

      {/* 2. Clean Single-Row Quick Filter Strip */}
      {homeConfig.showQuickFilters && (
        <section className="mx-auto max-w-[1440px] px-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar py-1">
            <div className="flex items-center gap-2 shrink-0">
              {QUICK_FILTER_TABS.map((tab, idx) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onApplyFilter(tab.filter)}
                  className={`min-h-[42px] sm:min-h-0 rounded-xl px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer border ${
                    idx === 0
                      ? 'bg-[#E50914] border-[#E50914] text-white'
                      : 'bg-[#181818] border-white/[0.08] text-[#d4d4d4] hover:bg-[#242424] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onApplyFilter({})}
              className="inline-flex min-h-[42px] sm:min-h-0 items-center gap-1.5 rounded-xl bg-[#181818] border border-white/[0.08] px-3.5 py-2 text-xs font-bold text-[#a3a3a3] hover:text-white hover:border-white/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#E50914]" />
              <span>تصفية متقدمة</span>
            </button>
          </div>
        </section>
      )}

      {/* Optional Smooth News Ticker (Only if enabled in Settings) */}
      {siteSettings.tickerEnabled && tickerItems.length > 0 && (
        <section className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <div className="moov-ticker rounded-2xl bg-[#161616] border border-white/[0.07] py-2.5 overflow-hidden">
            <div className="moov-ticker-track items-center gap-3 px-4">
              {tickerItems.map((item, idx) => (
                <button
                  key={`${item.id}-${idx}`}
                  type="button"
                  onClick={() => onSelectMedia(item)}
                  className="inline-flex items-center gap-2.5 rounded-xl bg-[#202020] border border-white/[0.06] px-3 py-1.5 hover:border-[#E50914] transition-colors shrink-0 cursor-pointer"
                >
                  <OptimizedImage
                    src={getPosterUrl(item, 'card_small')}
                    fallbackSrc={FALLBACK_POSTER}
                    alt={item.title}
                    slot="card_small"
                    loading="lazy"
                    className="h-9 w-7 rounded shrink-0"
                    imgClassName="object-cover"
                  />
                  <div className="text-right">
                    <p className="text-xs font-bold text-white whitespace-nowrap">{item.title}</p>
                    <p className="font-latin text-[10px] font-bold text-[#f9c400] tabular-nums">
                      {item.quality}
                      {item.communityRating && item.communityRating.count > 0
                        ? ` · ★ ${item.communityRating.average.toFixed(1)}/5`
                        : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 2B. Independent Recently Watched Section (Hidden automatically when empty) */}
      {recentlyWatchedSection}

      {/* 3. Dynamic Admin-Controlled Content Sections */}
      {enabledSections.map((section, sectionIdx) => {
        const items = resolveSectionMediaItems(catalog, section);
        if (items.length === 0) return null;

        return (
          <RevealSection
            key={section.id}
            className="mx-auto max-w-[1440px] px-3.5 sm:px-6 lg:px-8 space-y-3.5 sm:space-y-4"
          >
            <div className="flex items-center sm:items-end justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {getSectionIcon(section.source)}
                  <h2
                    style={{ fontSize: 'var(--rtv-section-title-size, 22px)' }}
                    className="font-display font-extrabold text-white leading-snug truncate"
                  >
                    {section.title}
                  </h2>
                </div>
                {section.subtitle && (
                  <p className="text-xs sm:text-sm text-[#a3a3a3] line-clamp-1">{section.subtitle}</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => onApplyFilter(getSectionViewAllFilter(section))}
                className="inline-flex min-h-[40px] sm:min-h-0 items-center gap-1 rounded-xl bg-[#181818] hover:bg-[#E50914] border border-white/[0.08] px-3 sm:px-3.5 py-2 text-xs font-bold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>عرض الكل</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {section.layout === 'row' ? (
              <SectionHorizontalRow
                items={items}
                cardStyle={homeConfig.cardStyle}
                watchlistIds={watchlistIds}
                prioritizeInitialCount={sectionIdx === 0 ? 4 : 0}
                onSelectMedia={onSelectMedia}
                onToggleWatchlist={onToggleWatchlist}
              />
            ) : (
              <div className={`grid ${gridColClass} gap-3 sm:gap-4`}>
                {items.map((item, idx) => (
                  <MovieCard
                    key={`${item.id}::${item.poster_url || item.poster || ''}`}
                    item={item}
                    onSelect={onSelectMedia}
                    isInWatchlist={watchlistIds.includes(item.id)}
                    onToggleWatchlist={onToggleWatchlist}
                    variant={homeConfig.cardStyle}
                    priority={sectionIdx === 0 && idx < 4}
                  />
                ))}
              </div>
            )}
          </RevealSection>
        );
      })}

      {/* 4. Optional Category Tag Strip (Admin Toggleable) */}
      {homeConfig.showCategoryBar && (
        <RevealSection className="mx-auto max-w-[1440px] px-3.5 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-[#141414] border border-white/[0.07] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Tags className="w-4 h-4 text-[#E50914]" />
                <h2 className="font-display text-base font-extrabold text-white">الأقسام السريعة</h2>
              </div>
              <button
                type="button"
                onClick={() => onApplyFilter({})}
                className="min-h-[36px] text-xs font-bold text-[#E50914] hover:text-white transition-colors cursor-pointer"
              >
                كل الأقسام ({catalog.length})
              </button>
            </div>

            <div className="flex flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar sm:overflow-visible gap-2 pb-1 sm:pb-0">
              {quickCategoryChips.map((tag) => (
                <button
                  key={tag.category}
                  type="button"
                  onClick={() => onApplyFilter({ category: tag.category })}
                  className="inline-flex min-h-[40px] sm:min-h-0 shrink-0 items-center gap-2 rounded-xl bg-[#1c1c1c] border border-white/[0.07] px-3 py-1.5 text-xs font-bold text-[#d4d4d4] hover:bg-[#E50914] hover:border-[#E50914] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>{tag.label}</span>
                  <span className="font-latin text-[11px] opacity-70 tabular-nums">{tag.count}</span>
                </button>
              ))}
            </div>
          </div>
        </RevealSection>
      )}

      {/* 5. Optional Full Paginated Library (Admin Toggleable) */}
      {homeConfig.showFullLibrary && (
        <RevealSection className="mx-auto max-w-[1440px] px-3.5 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-[#141414] border border-white/[0.08] p-4 sm:p-6 space-y-4 sm:space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2.5">
                <Grid2x2 className="w-5 h-5 text-[#E50914]" />
                <div>
                  <h2 className="font-display text-lg sm:text-xl font-extrabold text-white">
                    المكتبة الكاملة ({filteredLibraryItems.length})
                  </h2>
                </div>
              </div>

              <div className="flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap items-center gap-2 pb-0.5 sm:pb-0">
                {[
                  { id: 'all' as const, label: 'الكل' },
                  { id: 'movie' as const, label: 'أفلام' },
                  { id: 'series' as const, label: 'مسلسلات' },
                  { id: 'other' as const, label: 'برامج ومصارعة' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setLibraryFilter(tab.id)}
                    className={`min-h-[40px] sm:min-h-0 shrink-0 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                      libraryFilter === tab.id
                        ? 'bg-[#E50914] border-[#E50914] text-white'
                        : 'bg-[#1c1c1c] border-white/10 text-[#a3a3a3] hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={`grid ${gridColClass} gap-3 sm:gap-4`}>
              {paginatedLibraryItems.map((item) => (
                <MovieCard
                  key={`${item.id}::${item.poster_url || item.poster || ''}`}
                  item={item}
                  onSelect={onSelectMedia}
                  isInWatchlist={watchlistIds.includes(item.id)}
                  onToggleWatchlist={onToggleWatchlist}
                  variant={homeConfig.cardStyle}
                />
              ))}
            </div>

            {totalLibraryPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={safeLibraryPage <= 1}
                  onClick={() => setLibraryPage((p) => Math.max(1, p - 1))}
                  className="min-h-[42px] sm:min-h-0 rounded-xl bg-[#1c1c1c] border border-white/10 px-4 sm:px-3 py-2 sm:py-1.5 text-xs font-bold text-white disabled:opacity-40 cursor-pointer"
                >
                  السابق
                </button>
                <span className="font-latin text-xs font-bold text-[#a3a3a3] tabular-nums px-2">
                  {safeLibraryPage} / {totalLibraryPages}
                </span>
                <button
                  type="button"
                  disabled={safeLibraryPage >= totalLibraryPages}
                  onClick={() => setLibraryPage((p) => Math.min(totalLibraryPages, p + 1))}
                  className="min-h-[42px] sm:min-h-0 rounded-xl bg-[#1c1c1c] border border-white/10 px-4 sm:px-3 py-2 sm:py-1.5 text-xs font-bold text-white disabled:opacity-40 cursor-pointer"
                >
                  التالي
                </button>
              </div>
            )}
          </div>
        </RevealSection>
      )}

      {/* 6. Clean Request / Contact CTA Banner */}
      {homeConfig.showRequestBanner && (
        <RevealSection className="mx-auto max-w-[1440px] px-3.5 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-gradient-to-l from-[#1c1c1c] via-[#161616] to-[#141414] border border-white/[0.08] p-5 sm:p-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 sm:gap-5">
            <div className="space-y-1.5">
              <h2 className="font-display text-lg sm:text-xl font-extrabold text-white">
                تبحث عن فيلم أو مسلسل غير موجود؟
              </h2>
              <p className="text-xs sm:text-sm text-[#a3a3a3] leading-relaxed">
                أرسل طلبك مباشرة لفريق الموقع وسنقوم بتوفيره بأعلى جودة متاحة.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenContact}
              className="inline-flex w-full sm:w-auto min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-5 py-3 text-xs sm:text-sm font-extrabold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>اطلب عملاً أو تواصل معنا</span>
            </button>
          </div>
        </RevealSection>
      )}
    </div>
  );
}
