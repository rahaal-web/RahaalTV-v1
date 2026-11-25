import { KeyboardEvent, TouchEvent, useCallback, useEffect, useRef, useState } from 'react';
import { FALLBACK_BACKDROP, FALLBACK_POSTER } from '../lib/mediaFilters';
import { getBackdropInfo, getPosterUrl } from '../lib/mediaImages';
import { MediaItem } from '../types/media';
import { OptimizedImage } from './OptimizedImage';
import './CinematicHeroSlider.css';

interface CinematicHeroSliderProps {
  slides: MediaItem[];
  autoPlayEnabled: boolean;
  slideIntervalSec: number;
  pauseOnHover: boolean;
  onSelectMedia: (item: MediaItem) => void;
}

type SlideDirection = 'next' | 'prev';

const TRANSITION_DURATION_MS = 1150;
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/;

function resolveCinematicSlideArtwork(item: MediaItem): {
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

function resolveDisplayTitle(item: MediaItem): string {
  return (item.title || item.englishTitle || '').trim();
}

export function CinematicHeroSlider({
  slides,
  autoPlayEnabled,
  slideIntervalSec,
  pauseOnHover,
  onSelectMedia,
}: CinematicHeroSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [exitingSlide, setExitingSlide] = useState<{
    index: number;
    direction: SlideDirection;
    transitionId: number;
  } | null>(null);
  const [activeTransition, setActiveTransition] = useState<{
    direction: SlideDirection;
    transitionId: number;
  } | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const didSwipeRef = useRef(false);
  const transitionCounterRef = useRef(0);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slideCount = slides.length;
  const safeActiveIndex = slideCount > 0 ? activeIndex % slideCount : 0;

  useEffect(() => {
    if (slideCount > 0 && activeIndex >= slideCount) {
      setActiveIndex(0);
      setExitingSlide(null);
      setActiveTransition(null);
    }
  }, [slideCount, activeIndex]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  const goToSlide = useCallback(
    (delta: 1 | -1) => {
      if (slideCount <= 1) return;
      const currentIdx = activeIndex % slideCount;
      const nextIdx = (currentIdx + delta + slideCount) % slideCount;
      if (nextIdx === currentIdx) return;

      const direction: SlideDirection = delta > 0 ? 'next' : 'prev';
      const nextTransitionId = transitionCounterRef.current + 1;
      transitionCounterRef.current = nextTransitionId;

      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }

      setExitingSlide({
        index: currentIdx,
        direction,
        transitionId: nextTransitionId,
      });
      setActiveTransition({
        direction,
        transitionId: nextTransitionId,
      });
      setActiveIndex(nextIdx);

      transitionTimerRef.current = setTimeout(() => {
        setExitingSlide((prev) =>
          prev && prev.transitionId === nextTransitionId ? null : prev
        );
        setActiveTransition((prev) =>
          prev && prev.transitionId === nextTransitionId ? null : prev
        );
      }, TRANSITION_DURATION_MS);
    },
    [activeIndex, slideCount]
  );

  // Automatic continuous playback
  useEffect(() => {
    if (!autoPlayEnabled || slideCount <= 1) return undefined;
    if (pauseOnHover && isHovered) return undefined;

    const intervalMs = Math.max(2, slideIntervalSec) * 1000;
    const timer = setTimeout(() => {
      goToSlide(1);
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [autoPlayEnabled, slideCount, pauseOnHover, isHovered, slideIntervalSec, goToSlide]);

  // Silently warm browser cache for the upcoming slide so transitions feel instantaneous
  useEffect(() => {
    if (slideCount <= 1 || typeof window === 'undefined') return;
    const upcoming = slides[(safeActiveIndex + 1) % slideCount];
    if (!upcoming) return;
    const { src } = resolveCinematicSlideArtwork(upcoming);
    if (!src) return;
    const img = new window.Image();
    img.referrerPolicy = 'no-referrer';
    img.src = src;
  }, [slides, slideCount, safeActiveIndex]);

  if (slideCount === 0) return null;

  const currentSlide = slides[safeActiveIndex];
  const outgoingSlide =
    exitingSlide && slides[exitingSlide.index] && exitingSlide.index !== safeActiveIndex
      ? slides[exitingSlide.index]
      : null;

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    didSwipeRef.current = false;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || slideCount <= 1) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      didSwipeRef.current = true;
      goToSlide(dx < 0 ? 1 : -1);
    }
  };

  const handleStageClick = () => {
    if (didSwipeRef.current) {
      didSwipeRef.current = false;
      return;
    }
    if (currentSlide) {
      onSelectMedia(currentSlide);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (currentSlide) onSelectMedia(currentSlide);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goToSlide(1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goToSlide(-1);
    }
  };

  const renderSlideLayer = (
    item: MediaItem,
    roleClass: string,
    keySuffix: string,
    isPrimary: boolean
  ) => {
    const { src, fallbackSrc } = resolveCinematicSlideArtwork(item);
    const title = resolveDisplayTitle(item);
    const hasArabic = ARABIC_CHAR_REGEX.test(title);

    return (
      <div
        key={`${item.id}::${keySuffix}`}
        className={`rtv-cinematic-slide ${roleClass}`}
        aria-hidden={!isPrimary}
      >
        <div className="rtv-cinematic-media-frame">
          <OptimizedImage
            src={src}
            fallbackSrc={fallbackSrc}
            alt={title}
            slot="slider_backdrop"
            priority
            disablePlaceholder
            className="rtv-cinematic-img-shell"
            imgClassName="rtv-cinematic-img"
            sizes="100vw"
          />
        </div>

        <div className="rtv-cinematic-scrim" aria-hidden="true" />

        {title && (
          <div className="rtv-cinematic-title-layer">
            <div className="rtv-cinematic-title-mask">
              <h2
                className={`rtv-cinematic-title ${
                  hasArabic ? 'rtv-cinematic-title--arabic' : 'rtv-cinematic-title--latin'
                }`}
                dir="auto"
              >
                {title}
              </h2>
            </div>
          </div>
        )}
      </div>
    );
  };

  const enterRoleClass = activeTransition
    ? activeTransition.direction === 'next'
      ? 'rtv-cinematic-slide--enter-next'
      : 'rtv-cinematic-slide--enter-prev'
    : 'rtv-cinematic-slide--idle';

  const exitRoleClass = exitingSlide
    ? exitingSlide.direction === 'next'
      ? 'rtv-cinematic-slide--exit-next'
      : 'rtv-cinematic-slide--exit-prev'
    : '';

  return (
    <section
      className="rtv-cinematic-slider"
      aria-roledescription="carousel"
      aria-label="السلايدر السينمائي"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="rtv-cinematic-stage"
        role="link"
        tabIndex={0}
        aria-label={resolveDisplayTitle(currentSlide)}
        onClick={handleStageClick}
        onKeyDown={handleKeyDown}
      >
        {outgoingSlide &&
          renderSlideLayer(
            outgoingSlide,
            exitRoleClass,
            `out-${exitingSlide?.transitionId ?? 0}`,
            false
          )}

        {currentSlide &&
          renderSlideLayer(
            currentSlide,
            enterRoleClass,
            `in-${activeTransition?.transitionId ?? 'idle'}`,
            true
          )}
      </div>
    </section>
  );
}
