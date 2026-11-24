import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  EyeOff,
  History,
  Info,
  Play,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type {
  MediaItem,
  RecentlyWatchedDeviceKey,
  RecentlyWatchedRecord,
  RecentlyWatchedUiConfig,
} from '../types/media';
import { FALLBACK_BACKDROP, FALLBACK_POSTER } from '../lib/mediaFilters';
import { optimizeTmdbUrl } from '../lib/mediaImages';
import { formatRelativeArabicTime } from '../lib/recentlyWatched';
import { normalizeRecentlyWatchedCardStyle } from '../lib/cardStyles';
import {
  DEFAULT_RECENTLY_WATCHED_UI_CONFIG,
  normalizeRecentlyWatchedUiConfig,
  resolveAspectRatioCssValue,
  resolveImageSlotForCarouselCard,
  resolveRecentlyWatchedLayoutForViewport,
} from '../lib/recentlyWatchedConfig';
import { OptimizedImage } from './OptimizedImage';

interface RecentlyWatchedSectionProps {
  items: RecentlyWatchedRecord[];
  catalog: MediaItem[];
  isSignedIn: boolean;
  hideCompleted: boolean;
  uiConfig?: RecentlyWatchedUiConfig;
  forcedDevicePreview?: RecentlyWatchedDeviceKey;
  isPreviewMode?: boolean;
  onToggleHideCompleted: (next: boolean) => void;
  onResumeItem: (record: RecentlyWatchedRecord, matchedMedia?: MediaItem) => void;
  onOpenDetails: (record: RecentlyWatchedRecord, matchedMedia?: MediaItem) => void;
  onRemoveItem: (record: RecentlyWatchedRecord) => void;
  onOpenManager: () => void;
}

function getHorizontalMetrics(
  el: HTMLElement,
  direction: 'rtl' | 'ltr'
): { progressPx: number; maxScrollPx: number } {
  const maxScrollPx = Math.max(0, el.scrollWidth - el.clientWidth);
  if (maxScrollPx <= 0) return { progressPx: 0, maxScrollPx: 0 };
  if (direction === 'ltr') {
    return {
      progressPx: Math.min(maxScrollPx, Math.max(0, el.scrollLeft)),
      maxScrollPx,
    };
  }
  // Modern browsers (Chrome/Firefox/Safari 15+) use 0 at start and negative scrollLeft in RTL.
  // Fallback guard handles legacy positive RTL scrollLeft if encountered.
  const rawLeft = el.scrollLeft;
  const progressPx = rawLeft <= 0 ? -rawLeft : maxScrollPx - rawLeft;
  return {
    progressPx: Math.min(maxScrollPx, Math.max(0, progressPx)),
    maxScrollPx,
  };
}

export function RecentlyWatchedSection({
  items,
  catalog,
  isSignedIn,
  hideCompleted,
  uiConfig: propUiConfig,
  forcedDevicePreview,
  isPreviewMode = false,
  onToggleHideCompleted,
  onResumeItem,
  onOpenDetails,
  onRemoveItem,
  onOpenManager,
}: RecentlyWatchedSectionProps) {
  const uiConfig = useMemo(
    () =>
      propUiConfig
        ? normalizeRecentlyWatchedUiConfig(propUiConfig)
        : DEFAULT_RECENTLY_WATCHED_UI_CONFIG,
    [propUiConfig]
  );

  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  useEffect(() => {
    if (typeof window === 'undefined' || forcedDevicePreview) return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, [forcedDevicePreview]);

  const layout = useMemo(
    () =>
      resolveRecentlyWatchedLayoutForViewport(
        uiConfig,
        viewportWidth,
        forcedDevicePreview
      ),
    [uiConfig, viewportWidth, forcedDevicePreview]
  );

  const [visibleCount, setVisibleCount] = useState<number>(layout.initialVisibleCount);
  const [isDragging, setIsDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [canScrollBackward, setCanScrollBackward] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pointerStateRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });
  const suppressClickRef = useRef(false);

  // Sync visibleCount when admin updates initialVisibleCount or device overrides
  useEffect(() => {
    setVisibleCount(layout.initialVisibleCount);
  }, [layout.initialVisibleCount]);

  const catalogById = useMemo(() => {
    const map = new Map<string, MediaItem>();
    for (const m of catalog) {
      map.set(m.id, m);
    }
    return map;
  }, [catalog]);

  const displayedItems = useMemo(() => {
    if (!items || items.length === 0) return [];
    const safeCount = Math.max(layout.initialVisibleCount, visibleCount);
    return items.slice(0, safeCount);
  }, [items, layout.initialVisibleCount, visibleCount]);

  const hasMoreBatches = items.length > displayedItems.length;

  const syncScrollBoundaries = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { progressPx, maxScrollPx } = getHorizontalMetrics(el, uiConfig.scrollDirection);
    const hasOverflow = maxScrollPx > 4;
    setCanScrollBackward(hasOverflow && progressPx > 4);
    setCanScrollForward((hasOverflow && progressPx < maxScrollPx - 4) || hasMoreBatches);

    if (uiConfig.loadMoreOnScrollEnd && hasMoreBatches) {
      const remaining = maxScrollPx - progressPx;
      const threshold = Math.max(120, layout.cardWidthPx * 1.15);
      if (remaining <= threshold) {
        const prevLeft = el.scrollLeft;
        setVisibleCount((prev) => Math.min(items.length, prev + uiConfig.loadMoreBatchSize));
        requestAnimationFrame(() => {
          if (scrollerRef.current) {
            scrollerRef.current.scrollLeft = prevLeft;
          }
        });
      }
    }
  }, [
    uiConfig.scrollDirection,
    uiConfig.loadMoreOnScrollEnd,
    uiConfig.loadMoreBatchSize,
    hasMoreBatches,
    layout.cardWidthPx,
    items.length,
  ]);

  useEffect(() => {
    syncScrollBoundaries();
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => syncScrollBoundaries());
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncScrollBoundaries, displayedItems.length, layout.cardWidthPx, layout.cardGapPx]);

  const scrollStep = useCallback(
    (dir: 'forward' | 'backward') => {
      const el = scrollerRef.current;
      if (!el) return;

      if (dir === 'forward' && hasMoreBatches) {
        const { progressPx, maxScrollPx } = getHorizontalMetrics(el, uiConfig.scrollDirection);
        if (maxScrollPx - progressPx < layout.cardWidthPx * 1.5) {
          const prevLeft = el.scrollLeft;
          setVisibleCount((prev) => Math.min(items.length, prev + uiConfig.loadMoreBatchSize));
          requestAnimationFrame(() => {
            if (scrollerRef.current) {
              scrollerRef.current.scrollLeft = prevLeft;
            }
          });
        }
      }

      const stepSize = Math.max(
        layout.cardWidthPx + layout.cardGapPx,
        Math.round(el.clientWidth * 0.72)
      );
      const sign =
        uiConfig.scrollDirection === 'rtl'
          ? dir === 'forward'
            ? -1
            : 1
          : dir === 'forward'
            ? 1
            : -1;

      el.scrollBy({
        left: sign * stepSize,
        behavior: 'smooth',
      });
    },
    [
      hasMoreBatches,
      items.length,
      layout.cardWidthPx,
      layout.cardGapPx,
      uiConfig.loadMoreBatchSize,
      uiConfig.scrollDirection,
    ]
  );

  // Non-intrusive horizontal wheel support on Desktop
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      const wantsHorizontal = e.shiftKey || uiConfig.enableWheelScroll;
      if (!wantsHorizontal) return;

      // Let trackpads that already emit horizontal deltaX scroll natively
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      if (Math.abs(e.deltaY) < 1) return;

      const { progressPx, maxScrollPx } = getHorizontalMetrics(el, uiConfig.scrollDirection);
      if (maxScrollPx <= 4) return;

      const goingForward = e.deltaY > 0;
      const atStart = progressPx <= 2;
      const atEnd = progressPx >= maxScrollPx - 2;

      // Never trap vertical page scrolling once user reaches horizontal edge
      if ((goingForward && atEnd) || (!goingForward && atStart)) {
        return;
      }

      e.preventDefault();
      const deltaSign =
        uiConfig.scrollDirection === 'rtl'
          ? goingForward
            ? -1
            : 1
          : goingForward
            ? 1
            : -1;
      el.scrollLeft += deltaSign * Math.abs(e.deltaY);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [uiConfig.enableWheelScroll, uiConfig.scrollDirection]);

  // Gentle auto-scroll with automatic pause on hover/focus/drag/touch/reduced-motion
  useEffect(() => {
    if (!uiConfig.autoScroll || displayedItems.length <= 1 || isPaused || isDragging) {
      return;
    }
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const { progressPx, maxScrollPx } = getHorizontalMetrics(el, uiConfig.scrollDirection);
      if (maxScrollPx <= 4) return;

      if (progressPx >= maxScrollPx - 6 && !hasMoreBatches) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        scrollStep('forward');
      }
    }, Math.max(2, uiConfig.autoScrollIntervalSec) * 1000);

    return () => window.clearInterval(timer);
  }, [
    uiConfig.autoScroll,
    uiConfig.autoScrollIntervalSec,
    uiConfig.scrollDirection,
    displayedItems.length,
    isPaused,
    isDragging,
    hasMoreBatches,
    scrollStep,
  ]);

  // Mouse click-and-drag panning (mobile keeps pure native touch momentum)
  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!uiConfig.enableDrag || e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;

    pointerStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      moved: false,
    };
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (!state.active) return;
    const el = scrollerRef.current;
    if (!el) return;

    const dx = e.clientX - state.startX;
    if (!state.moved && Math.abs(dx) > 6) {
      state.moved = true;
      setIsDragging(true);
      try {
        el.setPointerCapture(state.pointerId);
      } catch {
        // Ignore capture failure on synthetic events
      }
    }

    if (state.moved) {
      el.scrollLeft = state.startScrollLeft - dx;
    }
  };

  const finishPointerDrag = (e: PointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (!state.active) return;
    const el = scrollerRef.current;

    if (state.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 120);
      if (el) {
        try {
          if (el.hasPointerCapture(e.pointerId)) {
            el.releasePointerCapture(e.pointerId);
          }
        } catch {
          // Ignore
        }
      }
    }

    pointerStateRef.current.active = false;
    pointerStateRef.current.moved = false;
    setIsDragging(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      scrollStep(uiConfig.scrollDirection === 'rtl' ? 'forward' : 'backward');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      scrollStep(uiConfig.scrollDirection === 'rtl' ? 'backward' : 'forward');
    } else if (e.key === 'Home') {
      e.preventDefault();
      el.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (e.key === 'End') {
      e.preventDefault();
      const maxScrollPx = Math.max(0, el.scrollWidth - el.clientWidth);
      el.scrollTo({
        left: uiConfig.scrollDirection === 'rtl' ? -maxScrollPx : maxScrollPx,
        behavior: 'smooth',
      });
    }
  };

  if (!uiConfig.enabled && !isPreviewMode) {
    return null;
  }

  if (!items || items.length === 0) {
    return null;
  }

  const aspectRatioCss = resolveAspectRatioCssValue(uiConfig.aspectRatio);
  const imgSpec = resolveImageSlotForCarouselCard(uiConfig.aspectRatio, layout.cardWidthPx);
  const showHeaderBar = uiConfig.showTitle || uiConfig.showViewAllButton;
  const activeCardStyle = normalizeRecentlyWatchedCardStyle(uiConfig.cardStyle);

  return (
    <section
      aria-label="شاهدته مؤخراً"
      className="mx-auto max-w-[1440px] px-3.5 sm:px-6 lg:px-8 space-y-3 sm:space-y-4 overflow-hidden"
    >
      {/* Header Row */}
      {showHeaderBar && (
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            {uiConfig.showTitle && (
              <div className="flex items-center gap-2 min-w-0">
                <History className="w-5 h-5 text-[#E50914] shrink-0" />
                <h2
                  style={{ fontSize: 'var(--rtv-section-title-size, 22px)' }}
                  className="font-display font-extrabold text-white leading-snug truncate"
                >
                  شاهدته مؤخراً
                </h2>
                <span className="font-latin rounded-lg bg-white/[0.06] border border-white/10 px-2 py-0.5 text-[11px] font-bold text-[#b7c9ef] tabular-nums">
                  {items.length}
                </span>
              </div>
            )}

            {!isSignedIn && uiConfig.showTitle && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#f9c400]/10 border border-[#f9c400]/25 px-2.5 py-1 text-[10.5px] font-bold text-[#fde68a]">
                <Clock className="w-3 h-3 text-[#f9c400] shrink-0" />
                <span>محفوظ محلياً على هذا الجهاز — سجّل الدخول لمزامنته</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {uiConfig.showArrows && (
              <div className="hidden sm:flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => scrollStep('backward')}
                  disabled={!canScrollBackward}
                  aria-label="السابق في شاهدته مؤخراً"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#181818] hover:bg-[#E50914] disabled:opacity-35 disabled:hover:bg-[#181818] border border-white/[0.08] text-white transition-colors cursor-pointer"
                >
                  {uiConfig.scrollDirection === 'rtl' ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronLeft className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => scrollStep('forward')}
                  disabled={!canScrollForward}
                  aria-label="التالي في شاهدته مؤخراً"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#181818] hover:bg-[#E50914] disabled:opacity-35 disabled:hover:bg-[#181818] border border-white/[0.08] text-white transition-colors cursor-pointer"
                >
                  {uiConfig.scrollDirection === 'rtl' ? (
                    <ChevronLeft className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => onToggleHideCompleted(!hideCompleted)}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                hideCompleted
                  ? 'bg-[#4CAF50]/20 border-[#4CAF50]/50 text-[#4CAF50]'
                  : 'bg-[#181818] border-white/[0.08] text-[#b7c9ef] hover:text-white'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">إخفاء المكتملة</span>
            </button>

            {uiConfig.showViewAllButton && (
              <button
                type="button"
                onClick={onOpenManager}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#181818] hover:bg-[#E50914] border border-white/[0.08] px-3 sm:px-3.5 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                <span>عرض الكل</span>
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Single-Row Horizontal Carousel Track */}
      <div
        className="relative group/carousel"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* Floating Side Arrows (Desktop & TV) */}
        {uiConfig.showArrows && canScrollBackward && (
          <button
            type="button"
            onClick={() => scrollStep('backward')}
            aria-label="التمرير للخلف"
            className={`hidden md:flex absolute top-[42%] -translate-y-1/2 z-30 h-11 w-11 items-center justify-center rounded-full bg-black/80 hover:bg-[#E50914] border border-white/15 text-white opacity-0 group-hover/carousel:opacity-100 focus:opacity-100 transition-all cursor-pointer shadow-2xl ${
              uiConfig.scrollDirection === 'rtl' ? 'right-2' : 'left-2'
            }`}
          >
            {uiConfig.scrollDirection === 'rtl' ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        )}

        <div
          ref={scrollerRef}
          dir={uiConfig.scrollDirection}
          role="region"
          aria-label="شريط الأعمال المشاهدة مؤخراً"
          tabIndex={0}
          onScroll={syncScrollBoundaries}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerDrag}
          onPointerCancel={finishPointerDrag}
          onClickCapture={(e) => {
            if (suppressClickRef.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          style={{
            gap: `${layout.cardGapPx}px`,
            touchAction: 'pan-y pan-x',
          }}
          className={`flex flex-nowrap overflow-x-auto no-scrollbar pt-2 pb-3 px-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914]/75 rounded-2xl ${
            isDragging
              ? 'cursor-grabbing select-none snap-none'
              : uiConfig.enableDrag
                ? 'cursor-grab snap-x snap-mandatory scroll-smooth'
                : 'snap-x snap-mandatory scroll-smooth'
          }`}
        >
          {displayedItems.map((rec) => {
            const matchedMedia = catalogById.get(rec.mediaId);
            const rawImage = imgSpec.preferBackdrop
              ? matchedMedia?.backdrop_url ||
                matchedMedia?.backdrop ||
                rec.backdrop ||
                matchedMedia?.poster_url ||
                matchedMedia?.poster ||
                rec.poster ||
                FALLBACK_BACKDROP
              : matchedMedia?.poster_url ||
                matchedMedia?.poster ||
                rec.poster ||
                FALLBACK_POSTER;

            const posterSrc = optimizeTmdbUrl(rawImage, imgSpec.tmdbSize);
            const title = matchedMedia?.title || rec.title;
            const pct = Math.min(100, Math.max(0, rec.progressPct || 0));
            const hasMetaFooter =
              uiConfig.showMediaTitle || uiConfig.showWatchedAt || uiConfig.showEpisodeInfo;
            const isGlassOverlay = activeCardStyle === 'rw-3d-glass';
            const isNeonBevel = activeCardStyle === 'rw-3d-neon-bevel';
            const isFloatingStage = activeCardStyle === 'rw-3d-floating-stage';
            const isVelvetArch = activeCardStyle === 'rw-3d-velvet-arch';

            return (
              <article
                key={`${rec.id}::${posterSrc}`}
                style={{
                  width: `${layout.cardWidthPx}px`,
                  minWidth: `${layout.cardWidthPx}px`,
                  flex: '0 0 auto',
                }}
                className={`rtv-rw-3d-card rtv-rw-3d--${activeCardStyle} group snap-start relative flex flex-col`}
              >
                <div className="rtv-rw-3d-shell relative flex flex-1 flex-col overflow-hidden">
                  {/* Fixed-Aspect Media Image (Zero CLS) */}
                  <div
                    onClick={() => onResumeItem(rec, matchedMedia)}
                    style={{ aspectRatio: aspectRatioCss }}
                    className={`relative w-full overflow-hidden bg-[#111] cursor-pointer ${
                      isFloatingStage ? 'rounded-xl' : isVelvetArch ? 'rounded-t-[24px]' : ''
                    }`}
                  >
                    <OptimizedImage
                      src={posterSrc}
                      fallbackSrc={imgSpec.preferBackdrop ? FALLBACK_BACKDROP : FALLBACK_POSTER}
                      alt={title}
                      slot={imgSpec.slot}
                      loading="lazy"
                      className="h-full w-full"
                      imgClassName="object-cover object-top transition-transform duration-500 group-hover:scale-105 pointer-events-none"
                    />

                    <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/15 to-black/45" />

                    {/* Top-Right 3D Elevated Episode / Completion Badge */}
                    {uiConfig.showEpisodeInfo && (
                      <div className="rtv-card-3d-z-md absolute top-2 right-2 z-20 flex flex-col items-end gap-1">
                        {rec.completed ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-[#4CAF50]/95 px-2 py-0.5 text-[10px] font-black text-white shadow-lg">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>مكتمل</span>
                          </span>
                        ) : rec.episodeNumber ? (
                          <span
                            className={`font-latin rounded-lg px-2 py-0.5 text-[10px] font-black text-white shadow-lg ${
                              isNeonBevel ? 'bg-purple-600/95' : 'bg-[#E50914]/95'
                            }`}
                          >
                            {rec.seasonNumber ? `S${rec.seasonNumber} · ` : ''}E{rec.episodeNumber}
                          </span>
                        ) : (
                          <span className="font-latin rounded-lg bg-black/75 border border-white/15 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                            {rec.quality || matchedMedia?.quality || 'HD'}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Quick Remove Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveItem(rec);
                      }}
                      aria-label={`إزالة ${title} من سجل المشاهدة`}
                      title="إزالة من السجل"
                      className="rtv-card-3d-z-lg absolute top-2 left-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black/75 border border-white/15 text-white/85 hover:bg-[#D92321] hover:border-[#D92321] hover:text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Center Resume Play Icon (Elevated in Z-Space) */}
                    <div className="rtv-card-3d-z-lg pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-full text-white shadow-[0_10px_24px_rgba(229,9,20,0.55)] scale-95 sm:scale-90 sm:opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100 ${
                          isNeonBevel ? 'bg-purple-600' : 'bg-[#E50914]/95'
                        }`}
                      >
                        <Play className="w-4.5 h-4.5 fill-current mr-[-2px]" />
                      </div>
                    </div>

                    {/* Bottom Progress Bar */}
                    {uiConfig.showProgressBar && (
                      <div className="absolute inset-x-0 bottom-0 z-20 h-1.5 bg-white/15">
                        <div
                          className={`h-full transition-all duration-300 ${
                            rec.completed
                              ? 'bg-[#4CAF50]'
                              : isNeonBevel
                                ? 'bg-gradient-to-l from-purple-400 to-fuchsia-500 shadow-[0_0_8px_rgba(192,38,211,0.8)]'
                                : 'bg-[#E50914]'
                          }`}
                          style={{ width: `${Math.max(pct, 6)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div
                    className={`rtv-card-3d-z-sm flex flex-1 flex-col justify-between gap-2 p-2.5 text-right ${
                      isGlassOverlay
                        ? '-mt-5 mx-2 mb-2 rounded-xl bg-black/65 backdrop-blur-md border border-sky-300/25 shadow-lg'
                        : ''
                    }`}
                  >
                    {hasMetaFooter && (
                      <div
                        onClick={() => onResumeItem(rec, matchedMedia)}
                        className="cursor-pointer min-w-0"
                      >
                        {uiConfig.showMediaTitle && (
                          <h3
                            style={{ fontSize: 'var(--rtv-card-title-size, 13px)' }}
                            className="font-display font-bold text-white leading-snug line-clamp-1 group-hover:text-[#E50914] transition-colors"
                          >
                            {title}
                          </h3>
                        )}
                        {(uiConfig.showEpisodeInfo || uiConfig.showWatchedAt) && (
                          <div className="mt-1 flex items-center justify-between gap-1 text-[10.5px] font-medium text-[#a3a3a3]">
                            {uiConfig.showEpisodeInfo ? (
                              <span className="truncate">
                                {rec.episodeNumber
                                  ? `الحلقة ${rec.episodeNumber}`
                                  : rec.year || matchedMedia?.year || '2026'}
                              </span>
                            ) : (
                              <span />
                            )}
                            {uiConfig.showWatchedAt && (
                              <span className="shrink-0 text-[#b7c9ef]/80">
                                {formatRelativeArabicTime(rec.lastWatchedAtMs)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 pt-1 border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => onResumeItem(rec, matchedMedia)}
                        className={`flex-1 inline-flex min-h-[34px] items-center justify-center gap-1 rounded-xl border py-1.5 text-[11px] font-extrabold text-white transition-colors cursor-pointer ${
                          isVelvetArch
                            ? 'bg-pink-600/25 hover:bg-pink-600 border-pink-400/40'
                            : 'bg-[#E50914]/20 hover:bg-[#E50914] border-[#E50914]/40'
                        }`}
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>{rec.completed ? 'إعادة' : 'متابعة'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenDetails(rec, matchedMedia)}
                        aria-label={`تفاصيل ${title}`}
                        title="صفحة التفاصيل"
                        className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-xl bg-white/[0.06] hover:bg-white/15 border border-white/10 text-[#b7c9ef] hover:text-white transition-colors cursor-pointer shrink-0"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Floating Forward Arrow */}
        {uiConfig.showArrows && canScrollForward && (
          <button
            type="button"
            onClick={() => scrollStep('forward')}
            aria-label="التمرير للأمام"
            className={`hidden md:flex absolute top-[42%] -translate-y-1/2 z-30 h-11 w-11 items-center justify-center rounded-full bg-black/80 hover:bg-[#E50914] border border-white/15 text-white opacity-0 group-hover/carousel:opacity-100 focus:opacity-100 transition-all cursor-pointer shadow-2xl ${
              uiConfig.scrollDirection === 'rtl' ? 'left-2' : 'right-2'
            }`}
          >
            {uiConfig.scrollDirection === 'rtl' ? (
              <ChevronLeft className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
    </section>
  );
}
