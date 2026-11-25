import {
  CSSProperties,
  TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Play,
  Sparkles,
  Star,
} from 'lucide-react';
import { MobileOnlyHeroSliderVariant } from '../lib/heroSliderMode';
import { FALLBACK_BACKDROP, FALLBACK_POSTER } from '../lib/mediaFilters';
import { getBackdropInfo, getPosterUrl } from '../lib/mediaImages';
import { HomeLayoutConfig, MediaItem } from '../types/media';
import { OptimizedImage } from './OptimizedImage';
import './MobileHeroSlider.css';

interface MobileHeroSliderProps {
  variant: MobileOnlyHeroSliderVariant;
  slides: MediaItem[];
  homeConfig: HomeLayoutConfig;
  autoPlayEnabled: boolean;
  slideIntervalSec: number;
  pauseOnHover: boolean;
  watchlistIds: string[];
  onSelectMedia: (item: MediaItem) => void;
  onPlayNow: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
}

function getKindArabicLabel(item: MediaItem): string {
  if (item.categories?.length) {
    const first = item.categories.find(Boolean);
    if (first) return first;
  }
  if (item.kind === 'series') return 'مسلسل';
  if (item.kind === 'wrestling') return 'مصارعة حرة';
  if (item.kind === 'tv') return 'برنامج';
  return 'فيلم';
}

function resolvePortraitPoster(item: MediaItem): {
  src: string;
  fallbackSrc: string;
} {
  const poster = getPosterUrl(item, 'detail_poster');
  const backdropInfo = getBackdropInfo(item);
  if (poster && poster !== FALLBACK_POSTER) {
    return {
      src: poster,
      fallbackSrc: backdropInfo.hasDedicatedBackdrop
        ? backdropInfo.url
        : FALLBACK_POSTER,
    };
  }
  if (backdropInfo.hasDedicatedBackdrop) {
    return {
      src: backdropInfo.url,
      fallbackSrc: FALLBACK_POSTER,
    };
  }
  return {
    src: FALLBACK_POSTER,
    fallbackSrc: FALLBACK_BACKDROP,
  };
}

function resolveLandscapeBackdrop(item: MediaItem): {
  src: string;
  fallbackSrc: string;
  hasDedicated: boolean;
} {
  const backdropInfo = getBackdropInfo(item);
  const poster = getPosterUrl(item, 'detail_poster');
  if (backdropInfo.hasDedicatedBackdrop) {
    return {
      src: backdropInfo.url,
      fallbackSrc: poster || FALLBACK_BACKDROP,
      hasDedicated: true,
    };
  }
  if (poster && poster !== FALLBACK_POSTER) {
    return {
      src: poster,
      fallbackSrc: FALLBACK_BACKDROP,
      hasDedicated: false,
    };
  }
  return {
    src: FALLBACK_BACKDROP,
    fallbackSrc: FALLBACK_BACKDROP,
    hasDedicated: false,
  };
}

export function MobileHeroSlider({
  variant,
  slides,
  homeConfig,
  autoPlayEnabled,
  slideIntervalSec,
  pauseOnHover,
  watchlistIds,
  onSelectMedia,
  onPlayNow,
  onToggleWatchlist,
}: MobileHeroSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const count = slides.length;
  const safeIndex = count > 0 ? activeIndex % count : 0;

  useEffect(() => {
    if (count > 0 && activeIndex >= count) {
      setActiveIndex(0);
    }
  }, [count, activeIndex]);

  useEffect(() => {
    if (!autoPlayEnabled || count <= 1 || isPaused) return undefined;
    const timer = window.setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % count);
    }, slideIntervalSec * 1000);
    return () => window.clearTimeout(timer);
  }, [autoPlayEnabled, count, isPaused, slideIntervalSec, safeIndex]);

  const goNext = useCallback(() => {
    if (count <= 1) return;
    setActiveIndex((prev) => (prev + 1) % count);
  }, [count]);

  const goPrev = useCallback(() => {
    if (count <= 1) return;
    setActiveIndex((prev) => (prev - 1 + count) % count);
  }, [count]);

  const handleTouchStart = (e: TouchEvent<HTMLElement>) => {
    if (pauseOnHover) setIsPaused(true);
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: TouchEvent<HTMLElement>) => {
    if (pauseOnHover) setIsPaused(false);
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || count <= 1) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      // RTL swipe: swiping right-to-left (dx < 0) advances, left-to-right goes previous
      if (dx < 0) {
        goNext();
      } else {
        goPrev();
      }
    }
  };

  const activeItem = useMemo(() => {
    if (!count) return null;
    return slides[safeIndex] || slides[0];
  }, [slides, count, safeIndex]);

  if (!activeItem) return null;

  const isInWatchlist = watchlistIds.includes(activeItem.id);
  const showRating =
    homeConfig.heroShowRating &&
    Boolean(activeItem.communityRating && activeItem.communityRating.count > 0);
  const ratingVal = activeItem.communityRating?.average ?? 0;
  const durationLabel =
    activeItem.duration || (activeItem.kind === 'series' ? 'حلقات متجددة' : '');
  const genresList = (activeItem.genres || []).slice(0, 3);
  const badgeText =
    homeConfig.heroBadgeText?.trim() || getKindArabicLabel(activeItem);

  /* ============================================================================
     STYLE 1: mobile_stories — ستوري عمودي سينمائي (Mobile Stories Reel)
     ============================================================================ */
  if (variant === 'mobile_stories') {
    const artwork = resolvePortraitPoster(activeItem);
    const progressStyle = {
      '--rtv-story-duration': `${slideIntervalSec * 1000}ms`,
    } as CSSProperties;

    return (
      <section
        aria-label="سلايدر الموبايل — ستوري سينمائي"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={() => pauseOnHover && setIsPaused(true)}
        onMouseLeave={() => pauseOnHover && setIsPaused(false)}
        className="relative rtv-hero-fullbleed overflow-hidden bg-[var(--rtv-site-bg,#0f0f0f)] select-none"
      >
        <div className="relative min-h-[520px] h-[74svh] max-h-[660px] w-full flex flex-col justify-between">
          {/* Full-bleed Vertical Poster */}
          <OptimizedImage
            key={`mob-story-img-${activeItem.id}-${safeIndex}`}
            src={artwork.src}
            fallbackSrc={artwork.fallbackSrc}
            alt={activeItem.title}
            slot="detail_poster"
            priority
            loading="eager"
            className="rtv-mobile-ken-burns !absolute inset-0 h-full w-full pointer-events-none"
            imgClassName="object-cover object-[50%_18%]"
          />

          {/* Cinematic Top & Bottom Vignettes */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              background:
                'linear-gradient(to bottom, rgba(8,8,12,0.82) 0%, rgba(8,8,12,0.22) 22%, transparent 45%), linear-gradient(to top, var(--rtv-site-bg, #0f0f0f) 0%, color-mix(in srgb, var(--rtv-site-bg, #0f0f0f) 92%, transparent) 22%, color-mix(in srgb, var(--rtv-site-bg, #0f0f0f) 55%, transparent) 44%, transparent 72%)',
            }}
          />

          {/* Top Story Progress Segments (below fixed header) */}
          <div className="relative z-10 pt-[70px] px-3.5 space-y-2.5">
            {count > 1 && (
              <div
                className="flex items-center gap-1.5"
                role="tablist"
                aria-label="شرائح الستوري"
              >
                {slides.map((slide, idx) => {
                  const isDone = idx < safeIndex;
                  const isCurrent = idx === safeIndex;
                  return (
                    <button
                      key={slide.id}
                      type="button"
                      role="tab"
                      aria-selected={isCurrent}
                      aria-label={`عرض ${slide.title}`}
                      onClick={() => setActiveIndex(idx)}
                      className="flex-1 py-1.5 cursor-pointer focus:outline-none"
                    >
                      <span className="block h-[3px] w-full overflow-hidden rounded-full bg-white/25">
                        {isDone ? (
                          <span className="block h-full w-full bg-white" />
                        ) : isCurrent ? (
                          <span
                            key={`prog-${safeIndex}-${autoPlayEnabled}`}
                            style={progressStyle}
                            className={`block h-full w-full rounded-full bg-[var(--rtv-site-accent,#E50914)] ${
                              autoPlayEnabled
                                ? `rtv-mobile-story-progress ${isPaused ? 'is-paused' : ''}`
                                : ''
                            }`}
                          />
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Top Floating Story Header Meta */}
            <div className="flex items-center justify-between gap-2">
              {homeConfig.heroShowBadge ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/15 px-3 py-1 text-[11px] font-extrabold text-white">
                  <Sparkles className="w-3 h-3 text-[var(--rtv-site-accent,#E50914)]" />
                  <span>{badgeText}</span>
                </span>
              ) : (
                <span />
              )}

              {count > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label="السابق"
                    className="h-8 w-8 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-white/90 active:scale-95 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label="التالي"
                    className="h-8 w-8 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-white/90 active:scale-95 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Frosted Story Glass Dock */}
          <div
            key={`mob-story-meta-${activeItem.id}-${safeIndex}`}
            className="rtv-mobile-fade-up relative z-10 px-4 pb-5 pt-4 text-right space-y-3"
          >
            {/* Badges & Rating Line */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              {homeConfig.heroShowQuality && (
                <span className="rounded-md bg-[var(--rtv-site-accent,#E50914)] px-2 py-0.5 font-latin text-[10px] font-black text-white shadow">
                  {activeItem.quality || 'HD'}
                </span>
              )}
              {showRating && (
                <span className="inline-flex items-center gap-1 rounded-md bg-black/60 backdrop-blur-md border border-white/15 px-2 py-0.5 text-[#f9c400] font-latin font-extrabold">
                  <Star className="w-3 h-3 fill-current" />
                  <span dir="ltr">{ratingVal.toFixed(1)}</span>
                </span>
              )}
              {homeConfig.heroShowYear && (
                <span className="rounded-md bg-white/10 backdrop-blur-md px-2 py-0.5 font-latin text-white/90">
                  {activeItem.year || '2026'}
                </span>
              )}
              {homeConfig.heroShowDuration && durationLabel && (
                <span className="inline-flex items-center gap-1 text-white/80">
                  <Clock className="w-3 h-3" />
                  <span>{durationLabel}</span>
                </span>
              )}
            </div>

            {/* Title & Teaser */}
            <div className="space-y-1">
              <h1
                onClick={() => onSelectMedia(activeItem)}
                className="font-display text-2xl font-black text-white leading-tight line-clamp-2 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] cursor-pointer"
              >
                {activeItem.title}
              </h1>
              {homeConfig.heroShowGenres && genresList.length > 0 && (
                <p className="text-xs font-medium text-white/75 line-clamp-1">
                  {genresList.join(' • ')}
                </p>
              )}
            </div>

            {/* Thumb-Zone Action Row */}
            {(homeConfig.heroShowWatchBtn ||
              homeConfig.heroShowDetailsBtn ||
              homeConfig.heroShowWatchlistBtn) && (
              <div className="flex items-center gap-2 pt-0.5">
                {homeConfig.heroShowWatchBtn && (
                  <button
                    type="button"
                    onClick={() => onPlayNow(activeItem)}
                    className="flex-1 min-h-[46px] inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--rtv-site-accent,#E50914)] hover:brightness-110 active:scale-[0.98] px-4 text-sm font-extrabold text-white shadow-[0_8px_24px_rgba(229,9,20,0.42)] transition-all cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current shrink-0" />
                    <span className="truncate">
                      {homeConfig.heroPrimaryCta || 'مشاهدة الآن'}
                    </span>
                  </button>
                )}

                {homeConfig.heroShowDetailsBtn && (
                  <button
                    type="button"
                    onClick={() => onSelectMedia(activeItem)}
                    className="min-h-[46px] inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white/12 hover:bg-white/20 active:scale-[0.98] border border-white/20 backdrop-blur-md px-4 text-xs font-extrabold text-white transition-all cursor-pointer"
                  >
                    <Info className="w-4 h-4 shrink-0" />
                    <span>التفاصيل</span>
                  </button>
                )}

                {homeConfig.heroShowWatchlistBtn && (
                  <button
                    type="button"
                    onClick={() => onToggleWatchlist(activeItem)}
                    aria-label={isInWatchlist ? 'إزالة من قائمتي' : 'إضافة إلى قائمتي'}
                    className={`h-[46px] w-[46px] shrink-0 rounded-2xl border backdrop-blur-md flex items-center justify-center active:scale-95 transition-all cursor-pointer ${
                      isInWatchlist
                        ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-300'
                        : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                    }`}
                  >
                    {isInWatchlist ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Bookmark className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  /* ============================================================================
     STYLE 2: mobile_cards — كروت سينمائية عائمة (3D Coverflow Cards)
     ============================================================================ */
  if (variant === 'mobile_cards') {
    const prevIdx = (safeIndex - 1 + count) % count;
    const nextIdx = (safeIndex + 1) % count;
    const prevItem = count > 1 ? slides[prevIdx] : null;
    const nextItem = count > 2 ? slides[nextIdx] : count === 2 ? slides[nextIdx] : null;
    const activePoster = resolvePortraitPoster(activeItem);
    const ambientBg = resolveLandscapeBackdrop(activeItem);

    return (
      <section
        aria-label="سلايدر الموبايل — كروت سينمائية عائمة"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={() => pauseOnHover && setIsPaused(true)}
        onMouseLeave={() => pauseOnHover && setIsPaused(false)}
        className="relative rtv-hero-fullbleed overflow-hidden bg-[var(--rtv-site-bg,#0f0f0f)] pt-[76px] pb-5 select-none"
      >
        {/* Ambient Blurred Backdrop Layer */}
        <OptimizedImage
          key={`mob-cards-bg-${activeItem.id}`}
          src={ambientBg.src}
          fallbackSrc={ambientBg.fallbackSrc}
          alt=""
          ariaHidden
          slot="backdrop_card"
          loading="eager"
          disablePlaceholder
          className="pointer-events-none !absolute inset-0 h-full w-full scale-110 opacity-45 blur-2xl transition-opacity duration-700"
          imgClassName="object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(10,10,14,0.65) 0%, rgba(10,10,14,0.3) 40%, var(--rtv-site-bg, #0f0f0f) 96%)',
          }}
        />

        {/* Coverflow 3-Card Stage */}
        <div className="relative z-10 flex items-center justify-center px-3 pt-2 pb-3 min-h-[295px]">
          {/* Previous Peek Card (Right in RTL) */}
          {prevItem && (
            <button
              type="button"
              onClick={goPrev}
              aria-label={`السابق: ${prevItem.title}`}
              className="relative -ml-7 w-[34vw] max-w-[145px] aspect-[2/3] shrink-0 rounded-2xl overflow-hidden border border-white/15 opacity-55 scale-[0.86] -rotate-[4deg] shadow-xl transition-all duration-300 cursor-pointer"
            >
              <OptimizedImage
                src={resolvePortraitPoster(prevItem).src}
                fallbackSrc={resolvePortraitPoster(prevItem).fallbackSrc}
                alt={prevItem.title}
                slot="card_small"
                loading="lazy"
                className="h-full w-full"
                imgClassName="object-cover"
              />
              <div className="absolute inset-0 bg-black/35" />
            </button>
          )}

          {/* Active Center Featured Card */}
          <div
            key={`mob-card-active-${activeItem.id}`}
            onClick={() => onSelectMedia(activeItem)}
            className="rtv-mobile-card-pop relative z-20 w-[56vw] max-w-[232px] aspect-[2/3] shrink-0 rounded-[22px] overflow-hidden border border-white/25 shadow-[0_22px_50px_rgba(0,0,0,0.85)] ring-1 ring-[var(--rtv-site-accent,#E50914)]/40 cursor-pointer"
          >
            <OptimizedImage
              src={activePoster.src}
              fallbackSrc={activePoster.fallbackSrc}
              alt={activeItem.title}
              slot="detail_poster"
              priority
              loading="eager"
              className="h-full w-full"
              imgClassName="object-cover object-center"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/30" />

            {/* Top Floating Badges on Card */}
            <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-1">
              {homeConfig.heroShowQuality ? (
                <span className="rounded-lg bg-[var(--rtv-site-accent,#E50914)] px-2 py-0.5 font-latin text-[10px] font-black text-white shadow">
                  {activeItem.quality || 'HD'}
                </span>
              ) : (
                <span />
              )}
              {showRating && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/15 px-2 py-0.5 text-[10px] font-latin font-extrabold text-[#f9c400]">
                  <Star className="w-3 h-3 fill-current" />
                  <span dir="ltr">{ratingVal.toFixed(1)}</span>
                </span>
              )}
            </div>

            {/* Bottom Subtle Play Pill inside Card */}
            <div className="absolute bottom-2.5 inset-x-2.5 flex items-center justify-between gap-2">
              <span className="rounded-lg bg-black/65 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white/95 truncate">
                {getKindArabicLabel(activeItem)}
              </span>
              {homeConfig.heroShowYear && (
                <span className="rounded-lg bg-black/65 backdrop-blur-md px-2 py-0.5 font-latin text-[10px] font-bold text-white/90">
                  {activeItem.year || '2026'}
                </span>
              )}
            </div>
          </div>

          {/* Next Peek Card (Left in RTL) */}
          {nextItem && (
            <button
              type="button"
              onClick={goNext}
              aria-label={`التالي: ${nextItem.title}`}
              className="relative -mr-7 w-[34vw] max-w-[145px] aspect-[2/3] shrink-0 rounded-2xl overflow-hidden border border-white/15 opacity-55 scale-[0.86] rotate-[4deg] shadow-xl transition-all duration-300 cursor-pointer"
            >
              <OptimizedImage
                src={resolvePortraitPoster(nextItem).src}
                fallbackSrc={resolvePortraitPoster(nextItem).fallbackSrc}
                alt={nextItem.title}
                slot="card_small"
                loading="lazy"
                className="h-full w-full"
                imgClassName="object-cover"
              />
              <div className="absolute inset-0 bg-black/35" />
            </button>
          )}
        </div>

        {/* Centered Title, Genres & Pill Action Buttons */}
        <div
          key={`mob-cards-info-${activeItem.id}`}
          className="rtv-mobile-fade-up relative z-10 px-4 text-center space-y-3"
        >
          <div className="space-y-1">
            <h1 className="font-display text-xl font-black text-white leading-snug line-clamp-1">
              {activeItem.title}
            </h1>
            {homeConfig.heroShowGenres && genresList.length > 0 && (
              <p className="text-[11px] font-semibold text-white/70">
                {genresList.join(' • ')}
                {homeConfig.heroShowDuration && durationLabel
                  ? ` • ${durationLabel}`
                  : ''}
              </p>
            )}
          </div>

          {(homeConfig.heroShowWatchBtn ||
            homeConfig.heroShowDetailsBtn ||
            homeConfig.heroShowWatchlistBtn) && (
            <div className="flex items-center justify-center gap-2">
              {homeConfig.heroShowWatchBtn && (
                <button
                  type="button"
                  onClick={() => onPlayNow(activeItem)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--rtv-site-accent,#E50914)] hover:brightness-110 active:scale-95 min-h-[42px] px-5 text-xs font-extrabold text-white shadow-lg cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{homeConfig.heroPrimaryCta || 'مشاهدة الآن'}</span>
                </button>
              )}

              {homeConfig.heroShowDetailsBtn && (
                <button
                  type="button"
                  onClick={() => onSelectMedia(activeItem)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/12 border border-white/15 min-h-[42px] px-4 text-xs font-bold text-white backdrop-blur-md active:scale-95 cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>التفاصيل</span>
                </button>
              )}

              {homeConfig.heroShowWatchlistBtn && (
                <button
                  type="button"
                  onClick={() => onToggleWatchlist(activeItem)}
                  aria-label="قائمة المشاهدة"
                  className={`h-[42px] w-[42px] rounded-full border flex items-center justify-center active:scale-95 cursor-pointer ${
                    isInWatchlist
                      ? 'bg-emerald-500/25 border-emerald-400/45 text-emerald-300'
                      : 'bg-white/10 border-white/15 text-white'
                  }`}
                >
                  {isInWatchlist ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Bookmark className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          )}

          {/* Pill Pagination Dots */}
          {count > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-1">
              {slides.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  aria-label={`عرض ${s.title}`}
                  className="py-1 px-0.5 cursor-pointer"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-all duration-300 ${
                      idx === safeIndex
                        ? 'w-6 bg-[var(--rtv-site-accent,#E50914)]'
                        : 'w-1.5 bg-white/30'
                    }`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  /* ============================================================================
     STYLE 3: mobile_spotlight — سبوت لايت مدمج ببطاقة جانبية (Compact Spotlight)
     ============================================================================ */
  const backdrop = resolveLandscapeBackdrop(activeItem);
  const thumbPoster = resolvePortraitPoster(activeItem);

  return (
    <section
      aria-label="سلايدر الموبايل — سبوت لايت مدمج"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseEnter={() => pauseOnHover && setIsPaused(true)}
      onMouseLeave={() => pauseOnHover && setIsPaused(false)}
      className="relative rtv-hero-fullbleed overflow-hidden bg-[var(--rtv-site-bg,#0f0f0f)] pb-3 select-none"
    >
      {/* Top Cinema Backdrop Window */}
      <div className="relative h-[245px] w-full overflow-hidden">
        <OptimizedImage
          key={`mob-spot-bg-${activeItem.id}`}
          src={backdrop.src}
          fallbackSrc={backdrop.fallbackSrc}
          alt={activeItem.title}
          slot="slider_backdrop"
          priority
          loading="eager"
          className="rtv-mobile-ken-burns !absolute inset-0 h-full w-full pointer-events-none"
          imgClassName="object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(10,10,14,0.72) 0%, transparent 40%, var(--rtv-site-bg, #0f0f0f) 100%)',
          }}
        />

        {/* Top Slide Counter & Quick Controls */}
        <div className="relative z-10 flex items-center justify-between px-3.5 pt-[70px]">
          {homeConfig.heroShowBadge ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/15 px-2.5 py-1 text-[10px] font-extrabold text-white">
              <Sparkles className="w-3 h-3 text-[var(--rtv-site-accent,#E50914)]" />
              <span>{badgeText}</span>
            </span>
          ) : (
            <span />
          )}

          {count > 1 && (
            <span className="rounded-lg bg-black/60 backdrop-blur-md border border-white/15 px-2.5 py-1 font-latin text-[10px] font-extrabold text-white/90 tabular-nums">
              {safeIndex + 1} / {count}
            </span>
          )}
        </div>
      </div>

      {/* Overlapping Floating Split Poster + Info Card */}
      <div
        key={`mob-spot-card-${activeItem.id}`}
        className="rtv-mobile-fade-up relative z-20 mx-3.5 -mt-14 rounded-2xl bg-[color-mix(in_srgb,var(--rtv-site-surface,#18181c)_92%,transparent)] backdrop-blur-xl border border-white/12 p-3.5 shadow-[0_18px_40px_rgba(0,0,0,0.65)] space-y-3"
      >
        <div className="flex items-start gap-3">
          {/* Small Floating Poster Thumbnail */}
          <button
            type="button"
            onClick={() => onSelectMedia(activeItem)}
            className="relative -mt-9 w-[82px] aspect-[2/3] shrink-0 rounded-xl overflow-hidden border border-white/20 shadow-xl cursor-pointer"
          >
            <OptimizedImage
              src={thumbPoster.src}
              fallbackSrc={thumbPoster.fallbackSrc}
              alt={activeItem.title}
              slot="card_small"
              loading="eager"
              className="h-full w-full"
              imgClassName="object-cover"
            />
          </button>

          {/* Compact Metadata */}
          <div className="min-w-0 flex-1 text-right space-y-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
              {homeConfig.heroShowQuality && (
                <span className="rounded bg-[var(--rtv-site-accent,#E50914)] px-1.5 py-0.5 font-latin font-black text-white">
                  {activeItem.quality || 'HD'}
                </span>
              )}
              {showRating && (
                <span className="inline-flex items-center gap-0.5 text-[#f9c400] font-latin font-extrabold">
                  <Star className="w-3 h-3 fill-current" />
                  <span dir="ltr">{ratingVal.toFixed(1)}</span>
                </span>
              )}
              {homeConfig.heroShowYear && (
                <span className="font-latin text-white/75">{activeItem.year || '2026'}</span>
              )}
              {homeConfig.heroShowDuration && durationLabel && (
                <span className="text-white/65 truncate">{durationLabel}</span>
              )}
            </div>

            <h1
              onClick={() => onSelectMedia(activeItem)}
              className="font-display text-base font-black text-white leading-snug line-clamp-2 cursor-pointer"
            >
              {activeItem.title}
            </h1>

            {homeConfig.heroShowDescription && activeItem.story && (
              <p className="text-[11px] text-white/70 line-clamp-2 leading-relaxed">
                {activeItem.story}
              </p>
            )}
          </div>
        </div>

        {/* Action Row inside Card */}
        {(homeConfig.heroShowWatchBtn ||
          homeConfig.heroShowDetailsBtn ||
          homeConfig.heroShowWatchlistBtn) && (
          <div className="flex items-center gap-2">
            {homeConfig.heroShowWatchBtn && (
              <button
                type="button"
                onClick={() => onPlayNow(activeItem)}
                className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--rtv-site-accent,#E50914)] hover:brightness-110 active:scale-[0.98] px-3 text-xs font-extrabold text-white shadow-md cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span className="truncate">
                  {homeConfig.heroPrimaryCta || 'مشاهدة الآن'}
                </span>
              </button>
            )}
            {homeConfig.heroShowDetailsBtn && (
              <button
                type="button"
                onClick={() => onSelectMedia(activeItem)}
                className="min-h-[42px] inline-flex items-center justify-center gap-1 rounded-xl bg-white/8 hover:bg-white/15 border border-white/15 px-3.5 text-xs font-bold text-white cursor-pointer"
              >
                <Info className="w-3.5 h-3.5" />
                <span>التفاصيل</span>
              </button>
            )}
            {homeConfig.heroShowWatchlistBtn && (
              <button
                type="button"
                onClick={() => onToggleWatchlist(activeItem)}
                aria-label="قائمة المشاهدة"
                className={`h-[42px] w-[42px] shrink-0 rounded-xl border flex items-center justify-center cursor-pointer ${
                  isInWatchlist
                    ? 'bg-emerald-500/20 border-emerald-400/45 text-emerald-300'
                    : 'bg-white/8 border-white/15 text-white'
                }`}
              >
                {isInWatchlist ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Bookmark className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Compact Bottom Navigation Strip */}
      {count > 1 && (
        <div className="mt-2.5 px-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={goPrev}
            aria-label="السابق"
            className="h-8 w-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white/80 active:scale-95 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="flex items-center justify-center gap-1.5">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveIndex(idx)}
                aria-label={`عرض ${s.title}`}
                className="py-1 px-0.5 cursor-pointer"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all duration-300 ${
                    idx === safeIndex
                      ? 'w-6 bg-[var(--rtv-site-accent,#E50914)]'
                      : 'w-1.5 bg-white/25'
                  }`}
                />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={goNext}
            aria-label="التالي"
            className="h-8 w-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white/80 active:scale-95 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  );
}
