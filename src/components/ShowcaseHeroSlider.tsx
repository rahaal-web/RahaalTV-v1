import { TouchEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Play, Plus } from 'lucide-react';
import { FALLBACK_BACKDROP, FALLBACK_POSTER } from '../lib/mediaFilters';
import { getBackdropInfo, getPosterUrl } from '../lib/mediaImages';
import { MediaItem } from '../types/media';
import { OptimizedImage } from './OptimizedImage';
import './ShowcaseHeroSlider.css';

interface ShowcaseHeroSliderProps {
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

function resolveShowcaseImage(item: MediaItem): {
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

export function ShowcaseHeroSlider({
  slides,
  autoPlayEnabled,
  slideIntervalSec,
  pauseOnHover,
  watchlistIds,
  onSelectMedia,
  onPlayNow,
  onToggleWatchlist,
}: ShowcaseHeroSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const wordmarkRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const slideCount = slides.length;
  const safeActiveIndex = slideCount > 0 ? activeIndex % slideCount : 0;

  useEffect(() => {
    if (slideCount > 0 && activeIndex >= slideCount) {
      setActiveIndex(0);
    }
  }, [slideCount, activeIndex]);

  // Automatic continuous playback
  useEffect(() => {
    if (!autoPlayEnabled || slideCount <= 1) return undefined;
    if (pauseOnHover && isHovered) return undefined;

    const intervalMs = Math.max(2, slideIntervalSec) * 1000;
    const timer = setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % slideCount);
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [autoPlayEnabled, slideCount, pauseOnHover, isHovered, slideIntervalSec, safeActiveIndex]);

  // Keep active wordmark centered inside horizontal strip without scrolling the page
  useEffect(() => {
    const container = stripRef.current;
    const btn = wordmarkRefs.current[safeActiveIndex];
    if (!container || !btn) return;
    if (container.scrollWidth <= container.clientWidth + 4) return;

    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const offsetDelta =
      btnRect.left - containerRect.left - (containerRect.width / 2 - btnRect.width / 2);

    container.scrollBy({
      left: offsetDelta,
      behavior: 'smooth',
    });
  }, [safeActiveIndex]);

  // Preload next slide image cleanly
  useEffect(() => {
    if (slideCount <= 1 || typeof window === 'undefined') return;
    const nextItem = slides[(safeActiveIndex + 1) % slideCount];
    if (!nextItem) return;
    const { src } = resolveShowcaseImage(nextItem);
    if (!src) return;
    const img = new window.Image();
    img.referrerPolicy = 'no-referrer';
    img.src = src;
  }, [slides, slideCount, safeActiveIndex]);

  const activeItem = slides[safeActiveIndex];

  const metadataParts = useMemo(() => {
    if (!activeItem) return [];
    const parts: string[] = [];
    const catLabel = resolveKindLabel(activeItem);
    if (catLabel) parts.push(catLabel);

    if (activeItem.kind === 'series' && activeItem.duration) {
      parts.push(activeItem.duration);
    } else if (activeItem.language) {
      parts.push(activeItem.language);
    } else if (activeItem.duration) {
      parts.push(activeItem.duration);
    }

    if (activeItem.genres?.length) {
      parts.push(activeItem.genres.slice(0, 2).join(' ، '));
    }

    if (activeItem.year) {
      parts.push(String(activeItem.year));
    }
    return parts;
  }, [activeItem]);

  const castNames = useMemo(() => {
    if (!activeItem?.cast?.length) return [];
    return activeItem.cast
      .map((c) => c.name?.trim())
      .filter((name): name is string => Boolean(name))
      .slice(0, 3);
  }, [activeItem]);

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
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        if (dx < 0) {
          setActiveIndex((prev) => (prev + 1) % slideCount);
        } else {
          setActiveIndex((prev) => (prev - 1 + slideCount) % slideCount);
        }
      }
    },
    [slideCount]
  );

  if (!activeItem) return null;

  const { src: bgSrc, fallbackSrc: bgFallback } = resolveShowcaseImage(activeItem);
  const displayTitle = (activeItem.title || activeItem.englishTitle || '').trim();
  const isArabicTitle = ARABIC_CHAR_REGEX.test(displayTitle);
  const hasSeparateEnglishTitle =
    Boolean(activeItem.englishTitle?.trim()) &&
    activeItem.englishTitle.trim().toLowerCase() !== displayTitle.toLowerCase();
  const isInWatchlist = watchlistIds.includes(activeItem.id);
  const wordmarkSlides = slides.slice(0, 8);

  return (
    <section
      className="rtv-showcase-slider"
      aria-roledescription="carousel"
      aria-label="السلايدر الاستعراضي"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Full-Bleed Backdrop Stage */}
      <div className="rtv-showcase-bg-layer">
        <div key={activeItem.id} className="rtv-showcase-bg-slide">
          <OptimizedImage
            src={bgSrc}
            fallbackSrc={bgFallback}
            alt={displayTitle}
            slot="slider_backdrop"
            priority
            disablePlaceholder
            className="rtv-showcase-bg-shell"
            imgClassName="rtv-showcase-bg-img"
            sizes="100vw"
          />
        </div>
      </div>

      {/* Multi-Directional Editorial Scrim */}
      <div className="rtv-showcase-scrim" aria-hidden="true" />

      {/* Main Layout Container */}
      <div className="rtv-showcase-inner">
        {/* Right-Aligned Editorial Content Column (RTL) */}
        <div className="rtv-showcase-content-wrap">
          <div key={`info-${activeItem.id}`} className="rtv-showcase-editorial">
            <h1
              onClick={() => onSelectMedia(activeItem)}
              className={`rtv-showcase-title ${
                isArabicTitle ? 'rtv-showcase-title--arabic' : 'rtv-showcase-title--latin'
              }`}
              dir="auto"
            >
              {displayTitle}
            </h1>

            {hasSeparateEnglishTitle && isArabicTitle && (
              <p className="rtv-showcase-subtitle font-latin" dir="ltr">
                {activeItem.englishTitle}
              </p>
            )}

            {/* Unboxed Dot-Separated Metadata Line */}
            {metadataParts.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-[13px] font-bold text-white/90">
                {metadataParts.map((part, idx) => (
                  <span key={`${part}-${idx}`} className="inline-flex items-center gap-2">
                    {idx > 0 && (
                      <span aria-hidden="true" className="text-white/55 text-[10px]">
                        •
                      </span>
                    )}
                    <span>{part}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Concise 2-Line Story Synopsis */}
            {activeItem.story && (
              <p className="mt-2.5 text-xs sm:text-sm text-[#e2e2e8]/90 leading-relaxed line-clamp-2 max-w-[460px]">
                {activeItem.story}
              </p>
            )}

            {/* Cast Names Row */}
            {castNames.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs font-bold text-white/85">
                {castNames.map((actor, idx) => (
                  <span key={`${actor}-${idx}`} className="inline-flex items-center gap-2">
                    {idx > 0 && (
                      <span aria-hidden="true" className="text-white/50 text-[10px]">
                        •
                      </span>
                    )}
                    <span>{actor}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Coral-Crimson Watch CTA + Circular Watchlist Button */}
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => onPlayNow(activeItem)}
                className="rtv-showcase-watch-btn inline-flex items-center justify-center gap-2.5 rounded-full px-6 sm:px-8 py-3 min-h-[44px] text-xs sm:text-sm font-extrabold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4 fill-current shrink-0" />
                <span>شاهد وحمل الان</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleWatchlist(activeItem)}
                aria-label={isInWatchlist ? 'إزالة من قائمتي' : 'إضافة إلى قائمتي'}
                title={isInWatchlist ? 'مضاف إلى قائمتي' : 'إضافة إلى قائمتي'}
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all cursor-pointer ${
                  isInWatchlist
                    ? 'bg-[#f44336] border-[#f44336] text-white shadow-lg'
                    : 'bg-white/12 hover:bg-white/22 border-white/20 text-white backdrop-blur-sm'
                }`}
              >
                {isInWatchlist ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Subtle Tagline / Episode Accent Line under CTA (matches Screenshot 2) */}
            {activeItem.tagline && activeItem.tagline.trim() !== displayTitle && (
              <p className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-white/90">
                <span
                  aria-hidden="true"
                  className="inline-block h-3.5 w-[3px] rounded-full bg-[#f44336]"
                />
                <span>{activeItem.tagline}</span>
              </p>
            )}
          </div>
        </div>

        {/* Bottom Horizontal Wordmark / Title Navigation Strip */}
        {wordmarkSlides.length > 1 && (
          <div className="rtv-showcase-strip-bar">
            <div
              ref={stripRef}
              className="rtv-showcase-strip no-scrollbar"
              role="tablist"
              aria-label="اختيار العمل من السلايدر"
            >
              {wordmarkSlides.map((slideItem, idx) => {
                const isActive = idx === safeActiveIndex;
                const wordmarkTitle = (
                  slideItem.englishTitle ||
                  slideItem.title ||
                  ''
                ).trim();
                const isArabicWordmark = ARABIC_CHAR_REGEX.test(wordmarkTitle);

                return (
                  <button
                    key={slideItem.id}
                    ref={(el) => {
                      wordmarkRefs.current[idx] = el;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    data-active={isActive}
                    onClick={() => setActiveIndex(idx)}
                    className="rtv-showcase-wordmark-btn"
                  >
                    <span
                      dir="auto"
                      className={`rtv-showcase-wordmark-text ${
                        isArabicWordmark
                          ? 'rtv-showcase-wordmark-text--arabic'
                          : 'rtv-showcase-wordmark-text--latin'
                      }`}
                    >
                      {wordmarkTitle}
                    </span>
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="rtv-showcase-wordmark-indicator"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
