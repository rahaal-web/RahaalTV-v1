import {
  CSSProperties,
  KeyboardEvent,
  TouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Check, ChevronLeft, ChevronRight, Play, Plus } from 'lucide-react';
import { FALLBACK_BACKDROP, FALLBACK_POSTER } from '../lib/mediaFilters';
import { getBackdropInfo, getPosterUrl } from '../lib/mediaImages';
import { useStreamV4SliderConfig } from '../lib/streamV4SliderConfig';
import { MediaItem } from '../types/media';
import { OptimizedImage } from './OptimizedImage';
import './StreamV4HeroSlider.css';

interface StreamV4HeroSliderProps {
  slides: MediaItem[];
  autoPlayEnabled: boolean;
  slideIntervalSec: number;
  pauseOnHover: boolean;
  watchlistIds: string[];
  onSelectMedia: (item: MediaItem) => void;
  onPlayNow: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
}

const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/;

function resolveBackdropSrc(item: MediaItem): {
  src: string;
  fallbackSrc: string;
} {
  const backdropInfo = getBackdropInfo(item);
  const posterUrl = getPosterUrl(item, 'detail_poster');
  const hasRealPoster = Boolean(posterUrl && posterUrl !== FALLBACK_POSTER);

  if (backdropInfo.hasDedicatedBackdrop) {
    return {
      src: backdropInfo.url,
      fallbackSrc: hasRealPoster ? posterUrl : FALLBACK_BACKDROP,
    };
  }
  if (hasRealPoster) {
    return {
      src: posterUrl,
      fallbackSrc: FALLBACK_BACKDROP,
    };
  }
  return {
    src: FALLBACK_BACKDROP,
    fallbackSrc: FALLBACK_BACKDROP,
  };
}

function resolveKindLabel(item: MediaItem): string {
  if (item.categories?.length) {
    const primaryCat = item.categories.find(Boolean);
    if (primaryCat) return primaryCat;
  }
  if (item.kind === 'series') return 'مسلسلات';
  if (item.kind === 'wrestling') return 'مصارعة حرة';
  if (item.kind === 'tv') return 'برامج تلفزيونية';
  return 'افلام';
}

function buildMetadataParts(item: MediaItem): string[] {
  const parts: string[] = [];
  const kindLabel = resolveKindLabel(item);
  if (kindLabel) parts.push(kindLabel);

  if (item.kind === 'series' && item.duration) {
    parts.push(item.duration);
  } else if (item.language) {
    parts.push(item.language);
  } else if (item.duration) {
    parts.push(item.duration);
  }

  if (item.genres?.length) {
    parts.push(item.genres.slice(0, 2).join(' ، '));
  }

  if (item.year) {
    parts.push(String(item.year));
  }
  return parts;
}

export function StreamV4HeroSlider({
  slides,
  autoPlayEnabled,
  slideIntervalSec,
  pauseOnHover,
  watchlistIds,
  onSelectMedia,
  onPlayNow,
  onToggleWatchlist,
}: StreamV4HeroSliderProps) {
  const [cfg] = useStreamV4SliderConfig();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [brokenLogos, setBrokenLogos] = useState<Record<string, true>>({});
  const [isRtlDoc, setIsRtlDoc] = useState(true);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const dotsContainerRef = useRef<HTMLDivElement | null>(null);
  const dotButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const visibleSlides = slides.slice(0, Math.max(1, cfg.maxStripItems || 8));
  const slideCount = visibleSlides.length;
  const safeActiveIndex = slideCount > 0 ? activeIndex % slideCount : 0;
  const activeSlide = visibleSlides[safeActiveIndex];
  const customDurationSec = activeSlide ? cfg.slideDurations[activeSlide.id] : undefined;
  const fallbackDurationSec = Math.max(
    2,
    cfg.defaultSlideDurationSec || slideIntervalSec || 6
  );
  const currentSlideDurationSec =
    customDurationSec && customDurationSec >= 2
      ? customDurationSec
      : fallbackDurationSec;
  const isPaused = Boolean(pauseOnHover && isHovered);

  const cycleSignature = `${activeSlide?.id || ''}:${safeActiveIndex}:${currentSlideDurationSec}`;
  const remainingMsRef = useRef<number>(currentSlideDurationSec * 1000);
  const lastCycleSigRef = useRef<string>(cycleSignature);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const dir =
      document.documentElement.getAttribute('dir') ||
      getComputedStyle(document.documentElement).direction ||
      'rtl';
    setIsRtlDoc(dir !== 'ltr');
  }, []);

  useEffect(() => {
    if (slideCount > 0 && activeIndex >= slideCount) {
      setActiveIndex(0);
    }
  }, [slideCount, activeIndex]);

  useEffect(() => {
    setBrokenLogos({});
  }, [cfg.titleLogos]);

  // Continuous autoplay with per-movie duration and hover-pause sync
  useEffect(() => {
    if (lastCycleSigRef.current !== cycleSignature) {
      lastCycleSigRef.current = cycleSignature;
      remainingMsRef.current = currentSlideDurationSec * 1000;
    }

    if (!autoPlayEnabled || slideCount <= 1 || isPaused) {
      return undefined;
    }

    const startedAt = Date.now();
    const waitMs = Math.max(120, remainingMsRef.current);
    const timer = setTimeout(() => {
      remainingMsRef.current = currentSlideDurationSec * 1000;
      setActiveIndex((prev) => (prev + 1) % slideCount);
    }, waitMs);

    return () => {
      clearTimeout(timer);
      const elapsed = Date.now() - startedAt;
      remainingMsRef.current = Math.max(120, remainingMsRef.current - elapsed);
    };
  }, [autoPlayEnabled, slideCount, isPaused, currentSlideDurationSec, cycleSignature]);

  // Keep active PNG dot centered in horizontal bottom bar without scrolling the page
  useEffect(() => {
    const container = dotsContainerRef.current;
    const btn = dotButtonRefs.current[safeActiveIndex];
    if (!container || !btn) return;
    if (container.scrollWidth <= container.clientWidth + 4) return;

    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const delta =
      btnRect.left - containerRect.left - (containerRect.width / 2 - btnRect.width / 2);

    container.scrollBy({
      left: delta,
      behavior: 'smooth',
    });
  }, [safeActiveIndex]);

  // Preload upcoming backdrop & PNG logo
  useEffect(() => {
    if (slideCount <= 1 || typeof window === 'undefined') return;
    const upcoming = visibleSlides[(safeActiveIndex + 1) % slideCount];
    if (!upcoming) return;
    const { src } = resolveBackdropSrc(upcoming);
    if (src) {
      const img = new window.Image();
      img.referrerPolicy = 'no-referrer';
      img.src = src;
    }
    const nextLogo = cfg.titleLogos[upcoming.id];
    if (nextLogo && !brokenLogos[nextLogo]) {
      const logoImg = new window.Image();
      logoImg.referrerPolicy = 'no-referrer';
      logoImg.src = nextLogo;
    }
  }, [visibleSlides, slideCount, safeActiveIndex, cfg.titleLogos, brokenLogos]);

  const goStep = useCallback(
    (delta: 1 | -1) => {
      if (slideCount <= 1) return;
      setActiveIndex((prev) => (prev + delta + slideCount) % slideCount);
    },
    [slideCount]
  );

  const handleTouchStart = useCallback((event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (event: TouchEvent<HTMLElement>) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || slideCount <= 1) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        if (isRtlDoc) {
          goStep(dx > 0 ? 1 : -1);
        } else {
          goStep(dx < 0 ? 1 : -1);
        }
      }
    },
    [slideCount, isRtlDoc, goStep]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (slideCount <= 1) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goStep(isRtlDoc ? 1 : -1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goStep(isRtlDoc ? -1 : 1);
      }
    },
    [slideCount, isRtlDoc, goStep]
  );

  if (slideCount === 0) return null;

  const trackTranslateX = isRtlDoc
    ? `${safeActiveIndex * 100}%`
    : `-${safeActiveIndex * 100}%`;

  const dynamicStyleVars = {
    '--rtv-v4-height': `${cfg.sliderHeightDesktopPx}px`,
    '--rtv-v4-logo-h': `${cfg.logoMaxHeightPx}px`,
    '--rtv-v4-logo-w': `${cfg.logoMaxWidthPx}px`,
    '--rtv-v4-title-size': `${cfg.titleSizePx}px`,
    '--rtv-v4-meta-size': `${cfg.metaSizePx}px`,
    '--rtv-v4-story-size': `${cfg.storySizePx}px`,
    '--rtv-v4-cast-size': `${cfg.castSizePx}px`,
    '--rtv-v4-strip-logo-h': `${cfg.stripLogoHeightPx}px`,
    '--rtv-v4-strip-text-size': `${cfg.stripTextSizePx}px`,
    '--rtv-v4-progress-h': `${cfg.progressBarHeightPx}px`,
    '--rtv-v4-blend-h': `${cfg.bottomBlendHeightPx}px`,
    '--rtv-v4-bottom-blur': `${cfg.bottomBlurPx}px`,
    '--rtv-v4-bottom-overlap': `${cfg.bottomOverlapPx}px`,
    '--rtv-v4-article-bottom': `${cfg.articleBottomOffsetPx}px`,
    '--rtv-v4-article-top': `${cfg.articleTopOffsetPx}px`,
    '--rtv-v4-article-side': `${cfg.articleSideOffsetPx}px`,
    '--rtv-v4-article-max-w': `${cfg.articleMaxWidthPx}px`,
    '--rtv-v4-dots-bottom': `${cfg.dotsBottomOffsetPx}px`,
    '--rtv-v4-scrim-opacity': String(Math.max(0.35, Math.min(1, cfg.scrimIntensityPct / 100))),
    ...(cfg.colorMode === 'custom'
      ? {
          '--rtv-v4-accent': cfg.customAccentColor,
          '--rtv-v4-accent-hover': cfg.customAccentColor,
          '--rtv-v4-glow': `${cfg.customAccentColor}73`,
        }
      : {
          '--rtv-v4-accent': 'var(--rtv-site-accent, #E50914)',
          '--rtv-v4-accent-hover': 'var(--rtv-site-accent-hover, #F6121D)',
          '--rtv-v4-glow': 'var(--rtv-site-glow, rgba(229, 9, 20, 0.45))',
        }),
  } as CSSProperties;

  return (
    <section
      className="rtv-v4-slider"
      data-strip={cfg.showBottomStrip && slideCount > 1}
      data-valign={cfg.articleVerticalAlign}
      data-halign={cfg.articleHorizontalAlign}
      style={dynamicStyleVars}
      aria-roledescription="carousel"
      aria-label="السلايدر الرابع الاستعراضي"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Owl-Head Equivalent Horizontal Sliding Track */}
      <div className="rtv-v4-stage-outer">
        <div
          className="rtv-v4-stage-track"
          style={{ transform: `translate3d(${trackTranslateX}, 0, 0)` }}
        >
          {visibleSlides.map((slideItem, idx) => {
            const isActive = idx === safeActiveIndex;
            const { src: bgSrc, fallbackSrc: bgFallback } = resolveBackdropSrc(slideItem);
            const displayTitle = (slideItem.title || slideItem.englishTitle || '').trim();
            const isArabicTitle = ARABIC_CHAR_REGEX.test(displayTitle);
            const metaParts = buildMetadataParts(slideItem);
            const castNames = (slideItem.cast || [])
              .map((c) => c.name?.trim())
              .filter((n): n is string => Boolean(n))
              .slice(0, 3);
            const isInWatchlist = watchlistIds.includes(slideItem.id);
            const heroLogoUrl = cfg.titleLogos[slideItem.id];
            const renderHeroPng =
              cfg.showTitle &&
              cfg.usePngLogoInHero &&
              Boolean(heroLogoUrl) &&
              !brokenLogos[heroLogoUrl];

            // Only load eager imagery for active or immediate neighbors for snappy scrolling
            const shouldMountImage =
              Math.abs(idx - safeActiveIndex) <= 1 ||
              (safeActiveIndex === 0 && idx === slideCount - 1) ||
              (safeActiveIndex === slideCount - 1 && idx === 0);

            return (
              <div
                key={slideItem.id}
                className="rtv-v4-slide"
                data-active={isActive}
                aria-hidden={!isActive}
              >
                <figure className="rtv-v4-figure">
                  {shouldMountImage && (
                    <OptimizedImage
                      src={bgSrc}
                      fallbackSrc={bgFallback}
                      alt={displayTitle}
                      slot="slider_backdrop"
                      priority={isActive}
                      disablePlaceholder
                      className="rtv-v4-bg-shell"
                      imgClassName="rtv-v4-bg-img"
                      sizes="100vw"
                    />
                  )}
                </figure>

                <div className="rtv-v4-scrim" aria-hidden="true" />

                <article className="rtv-v4-article">
                  <div className="rtv-v4-article-inner">
                    {/* <picture> PNG Title Logo (replaces title ONLY in slider) or Text Fallback */}
                    {cfg.showTitle &&
                      (renderHeroPng ? (
                        <picture
                          className="rtv-v4-picture"
                          onClick={() => onSelectMedia(slideItem)}
                          role="button"
                          tabIndex={isActive ? 0 : -1}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectMedia(slideItem);
                            }
                          }}
                        >
                          <img
                            src={heroLogoUrl}
                            alt={displayTitle}
                            referrerPolicy="no-referrer"
                            decoding="async"
                            onError={() =>
                              setBrokenLogos((prev) => ({
                                ...prev,
                                [heroLogoUrl]: true,
                              }))
                            }
                            className="rtv-v4-logo-img"
                          />
                        </picture>
                      ) : (
                        <h2
                          onClick={() => onSelectMedia(slideItem)}
                          className={`rtv-v4-title-fallback ${
                            !isArabicTitle ? 'rtv-v4-title-fallback--latin' : ''
                          }`}
                          dir="auto"
                        >
                          {displayTitle}
                        </h2>
                      ))}

                    {/* Category • Duration/Language • Genres • Year */}
                    {cfg.showMetadata && metaParts.length > 0 && (
                      <ul className="rtv-v4-meta flex flex-wrap items-center gap-x-2 gap-y-1 list-none p-0 m-0">
                        {metaParts.map((part, partIdx) => (
                          <li
                            key={`${part}-${partIdx}`}
                            className="inline-flex items-center gap-2"
                          >
                            {partIdx > 0 && (
                              <span
                                aria-hidden="true"
                                className="text-white/55 text-[10px]"
                              >
                                •
                              </span>
                            )}
                            <span>{part}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Story Synopsis */}
                    {cfg.showStory && slideItem.story && (
                      <p
                        className="rtv-v4-story mt-2.5"
                        style={{
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: cfg.storyLines,
                          overflow: 'hidden',
                        }}
                      >
                        {slideItem.story}
                      </p>
                    )}

                    {/* Cast Names */}
                    {cfg.showCast && castNames.length > 0 && (
                      <ul className="rtv-v4-cast mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 list-none p-0 m-0">
                        {castNames.map((actor, actorIdx) => (
                          <li
                            key={`${actor}-${actorIdx}`}
                            className="inline-flex items-center gap-2"
                          >
                            {actorIdx > 0 && (
                              <span
                                aria-hidden="true"
                                className="text-white/55 text-[10px]"
                              >
                                •
                              </span>
                            )}
                            <span>{actor}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Action Buttons Row */}
                    {(cfg.showWatchBtn || cfg.showWatchlistBtn) && (
                      <div className="rtv-v4-btns">
                        {cfg.showWatchBtn && (
                          <button
                            type="button"
                            tabIndex={isActive ? 0 : -1}
                            onClick={() => onPlayNow(slideItem)}
                            className={`rtv-v4-watch-btn ${
                              cfg.enableShineEffect ? 'rtv-v4-shine' : ''
                            }`}
                          >
                            <Play className="w-4 h-4 fill-current shrink-0" />
                            <span>{cfg.watchBtnText || 'شاهد وحمل الان'}</span>
                          </button>
                        )}

                        {cfg.showWatchlistBtn && (
                          <button
                            type="button"
                            tabIndex={isActive ? 0 : -1}
                            data-saved={isInWatchlist}
                            onClick={() => onToggleWatchlist(slideItem)}
                            aria-label={
                              isInWatchlist ? 'إزالة من قائمتي' : 'إضافة إلى قائمتي'
                            }
                            title={
                              isInWatchlist ? 'مضاف إلى قائمتي' : 'إضافة إلى قائمتي'
                            }
                            className="rtv-v4-watchlist-btn"
                          >
                            {isInWatchlist ? (
                              <Check className="w-5 h-5" />
                            ) : (
                              <Plus className="w-5 h-5" />
                            )}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Optional Tagline / Comment Accent */}
                    {cfg.showTagline &&
                      slideItem.tagline &&
                      slideItem.tagline.trim() !== displayTitle && (
                        <span aria-label="comment" className="rtv-v4-comment">
                          <span aria-hidden="true" className="rtv-v4-comment-bar" />
                          <em>{slideItem.tagline}</em>
                        </span>
                      )}
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      </div>

      {/* Seamless Bottom Blur Mist + Page Background Dissolve */}
      {cfg.bottomBlurPx > 0 && (
        <div className="rtv-v4-bottom-mist" aria-hidden="true" />
      )}
      <div className="rtv-v4-bottom-fade" aria-hidden="true" />

      {/* Optional Prev/Next Owl Arrows */}
      {cfg.showNavArrows && slideCount > 1 && (
        <>
          <button
            type="button"
            onClick={() => goStep(-1)}
            aria-label="السابق"
            className="rtv-v4-nav-btn rtv-v4-nav-prev"
          >
            {isRtlDoc ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => goStep(1)}
            aria-label="التالي"
            className="rtv-v4-nav-btn rtv-v4-nav-next"
          >
            {isRtlDoc ? (
              <ChevronLeft className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </button>
        </>
      )}

      {/* Bottom Borderless .owl-dots PNG Logo Selector Strip */}
      {cfg.showBottomStrip && slideCount > 1 && (
        <div className="rtv-v4-dots-wrap">
          <div
            ref={dotsContainerRef}
            className="rtv-v4-dots no-scrollbar"
            role="tablist"
            aria-label="أعمال السلايدر"
          >
            {visibleSlides.map((slideItem, idx) => {
              const isActive = idx === safeActiveIndex;
              const dotTitle = (
                slideItem.englishTitle ||
                slideItem.title ||
                ''
              ).trim();
              const isArabicDot = ARABIC_CHAR_REGEX.test(dotTitle);
              const dotLogoUrl = cfg.titleLogos[slideItem.id];
              const showDotLogo =
                cfg.usePngLogoInStrip &&
                Boolean(dotLogoUrl) &&
                !brokenLogos[dotLogoUrl];

              return (
                <button
                  key={slideItem.id}
                  ref={(el) => {
                    dotButtonRefs.current[idx] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  data-active={isActive}
                  onClick={() => setActiveIndex(idx)}
                  className="rtv-v4-dot"
                >
                  {showDotLogo ? (
                    <img
                      src={dotLogoUrl}
                      alt={dotTitle}
                      referrerPolicy="no-referrer"
                      decoding="async"
                      onError={() =>
                        setBrokenLogos((prev) => ({
                          ...prev,
                          [dotLogoUrl]: true,
                        }))
                      }
                      className="rtv-v4-dot-logo"
                    />
                  ) : (
                    <span
                      dir="auto"
                      className={`rtv-v4-dot-text ${
                        !isArabicDot ? 'rtv-v4-dot-text--latin' : ''
                      }`}
                    >
                      {dotTitle}
                    </span>
                  )}

                  {isActive && (
                    <span aria-hidden="true" className="rtv-v4-dot-indicator" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Progress Bar Reflecting Active Movie's Display Time */}
      {cfg.showProgressBar && (
        <div className="rtv-v4-progress-wrap" aria-hidden="true">
          <div className="rtv-v4-progress-track">
            <div
              key={`rtv-v4-bar-${cycleSignature}-${autoPlayEnabled}`}
              className="rtv-v4-progress-fill"
              style={
                autoPlayEnabled && slideCount > 1
                  ? {
                      animationDuration: `${currentSlideDurationSec}s`,
                      animationPlayState: isPaused ? 'paused' : 'running',
                    }
                  : {
                      animation: 'none',
                      transform: `scaleX(${slideCount > 1 ? (safeActiveIndex + 1) / slideCount : 1})`,
                    }
              }
            />
          </div>
        </div>
      )}
    </section>
  );
}
