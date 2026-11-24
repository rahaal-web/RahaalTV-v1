import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Bookmark, Check, ChevronDown, ChevronUp, Download, Film, Globe, Languages, Play, Star, Tag } from 'lucide-react';
import { FALLBACK_POSTER } from '../lib/mediaFilters';
import { getPosterUrl } from '../lib/mediaImages';
import { HomeCardStyle, MediaItem } from '../types/media';
import { OptimizedImage } from './OptimizedImage';

interface MovieCardProps {
  item: MediaItem;
  onSelect: (item: MediaItem, openDownloads?: boolean) => void;
  isInWatchlist: boolean;
  onToggleWatchlist: (item: MediaItem) => void;
  variant?: HomeCardStyle;
  priority?: boolean;
}

export function MovieCardSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl bg-[#181818] border border-white/[0.06] overflow-hidden">
      <div className="aspect-[2/3] w-full rtv-skeleton" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-4/5 rounded rtv-skeleton" />
        <div className="h-3 w-1/2 rounded rtv-skeleton" />
      </div>
    </div>
  );
}

export function MovieCard({
  item,
  onSelect,
  isInWatchlist,
  onToggleWatchlist,
  variant = 'clean',
  priority = false,
}: MovieCardProps) {
  const [isShowcaseFlipped, setIsShowcaseFlipped] = useState(false);
  const showcaseCardRef = useRef<HTMLElement | null>(null);

  const handleShowcasePointerMove = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse' || isShowcaseFlipped) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const el = showcaseCardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const rx = (0.5 - py) * 18; // -9deg .. +9deg
    const ry = (px - 0.5) * 20; // -10deg .. +10deg
    el.setAttribute('data-tilting', 'true');
    el.style.setProperty('--rtv-rx', `${rx.toFixed(2)}deg`);
    el.style.setProperty('--rtv-ry', `${ry.toFixed(2)}deg`);
    el.style.setProperty('--rtv-gx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--rtv-gy', `${(py * 100).toFixed(1)}%`);
  };

  const resetShowcaseTilt = () => {
    const el = showcaseCardRef.current;
    if (!el) return;
    el.removeAttribute('data-tilting');
    el.style.setProperty('--rtv-rx', '0deg');
    el.style.setProperty('--rtv-ry', '0deg');
    el.style.setProperty('--rtv-gx', '50%');
    el.style.setProperty('--rtv-gy', '30%');
  };

  const viewerAvg =
    item.communityRating && item.communityRating.count > 0
      ? item.communityRating.average.toFixed(1)
      : null;
  const primaryCat =
    item.categories?.[1] ||
    item.categories?.[0] ||
    (item.kind === 'series' ? 'مسلسلات' : item.kind === 'wrestling' ? 'مصارعة حرة' : 'افلام');
  const genresText = item.genres?.length ? item.genres.slice(0, 2).join('، ') : 'دراما';
  const posterSrc = getPosterUrl(item, 'card_grid');

  if (variant === 'classic') {
    return (
      <article className="moov-card moov-card-perspective group relative aspect-[2/3] w-full rounded-[20px] border border-white/[0.08] bg-[#181818] overflow-hidden shadow-lg">
        {/* Front Face */}
        <div
          onClick={() => onSelect(item)}
          className="moov-card-front absolute inset-0 cursor-pointer overflow-hidden rounded-[20px]"
        >
          <OptimizedImage
            src={posterSrc}
            fallbackSrc={FALLBACK_POSTER}
            alt={item.title}
            slot="card_grid"
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
            className="h-full w-full"
            imgClassName="object-cover object-top transition-transform duration-500 group-hover:scale-105"
          />
          <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/35 to-transparent" />

          <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5 z-20">
            <span className="font-latin rounded-md bg-[#E50914] px-2 py-0.5 text-[11px] font-bold text-white shadow-md">
              {item.year || '2026'}
            </span>
            <span className="font-latin rounded-md bg-black/75 backdrop-blur-sm px-2 py-0.5 text-[10px] font-extrabold text-white border border-white/15">
              {item.quality || 'HD'}
            </span>
          </div>

          {viewerAvg && (
            <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-1">
              <div className="flex items-center gap-1 rounded-md bg-[#4CAF50]/85 px-2 py-0.5 text-[10px] font-extrabold text-white backdrop-blur-sm border border-white/15">
                <Star className="w-3 h-3 text-[#f9c400] fill-[#f9c400]" />
                <span dir="ltr" className="font-latin tabular-nums">{viewerAvg}/5</span>
              </div>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 z-20 p-2.5 sm:p-3.5 text-right">
            <p className="text-[10.5px] sm:text-[11px] font-semibold text-[#a3a3a3] truncate mb-0.5">
              {primaryCat}
            </p>
            <h3
              style={{ fontSize: 'var(--rtv-card-title-size, 13px)' }}
              className="font-display font-bold text-white leading-snug line-clamp-2"
            >
              {item.title}
            </h3>
          </div>
        </div>

        {/* Back Face */}
        <div className="moov-card-back absolute inset-0 flex flex-col justify-between rounded-[20px] bg-gradient-to-b from-[#202020] via-[#161616] to-[#0f0f0f] p-3 border border-white/10 overflow-hidden">
          <div className="min-h-0">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-latin text-xs font-bold text-[#f9c400] flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-[#f9c400]" />
                {viewerAvg ? <span dir="ltr">{viewerAvg}/5</span> : <span className="font-sans text-[11px] text-[#b7c9ef]">بدون تقييم</span>}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleWatchlist(item);
                }}
                aria-label={isInWatchlist ? 'إزالة من قائمتي' : 'إضافة إلى قائمتي'}
                className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors cursor-pointer ${
                  isInWatchlist
                    ? 'bg-[#4CAF50]/20 border-[#4CAF50] text-[#4CAF50]'
                    : 'bg-white/5 border-white/10 text-[#a3a3a3] hover:text-white hover:border-white/30'
                }`}
              >
                {isInWatchlist ? <Check className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
              </button>
            </div>

            <h3
              onClick={() => onSelect(item)}
              style={{ fontSize: 'calc(var(--rtv-card-title-size, 13px) - 1px)' }}
              className="font-display font-extrabold text-white leading-snug mb-2 cursor-pointer hover:text-[#E50914] transition-colors line-clamp-2"
            >
              {item.title}
            </h3>

            <ul className="space-y-1 text-[11px]">
              <li className="flex items-center justify-between gap-1.5 text-[#a3a3a3] border-b border-white/[0.06] py-1">
                <span className="flex items-center gap-1 text-white/60 shrink-0">
                  <Film className="w-3 h-3 text-[#E50914]" />
                  التصنيف
                </span>
                <span className="font-semibold text-white truncate max-w-[95px]">
                  {primaryCat}
                </span>
              </li>
              <li className="flex items-center justify-between gap-1.5 text-[#a3a3a3] border-b border-white/[0.06] py-1">
                <span className="flex items-center gap-1 text-white/60 shrink-0">
                  <Tag className="w-3 h-3 text-[#E50914]" />
                  النوع
                </span>
                <span className="font-semibold text-white truncate max-w-[95px]">
                  {genresText}
                </span>
              </li>
              <li className="flex items-center justify-between gap-1.5 text-[#a3a3a3] border-b border-white/[0.06] py-1">
                <span className="flex items-center gap-1 text-white/60 shrink-0">
                  <Globe className="w-3 h-3 text-[#E50914]" />
                  البلد
                </span>
                <span className="font-semibold text-white truncate max-w-[95px]">
                  {item.country || 'غير محدد'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-1.5 text-[#a3a3a3] py-1">
                <span className="flex items-center gap-1 text-white/60 shrink-0">
                  <Languages className="w-3 h-3 text-[#E50914]" />
                  اللغة
                </span>
                <span className="font-semibold text-white truncate max-w-[95px]">
                  {item.language || 'مترجم'}
                </span>
              </li>
            </ul>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onSelect(item, false)}
              className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-2 py-2 text-[11px] font-extrabold text-white transition-colors shadow-md cursor-pointer"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>مشاهدة</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item, true);
              }}
              className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] px-2 py-2 text-[11px] font-extrabold text-white transition-colors shadow-md cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>تحميل</span>
            </button>
          </div>
        </div>
      </article>
    );
  }

  if (variant === 'showcase') {
    const fiveStarScore =
      item.communityRating && item.communityRating.count > 0
        ? item.communityRating.average
        : item.imdb && item.imdb > 0
          ? Math.min(5, Math.max(0, item.imdb / 2))
          : 0;
    const filledStars = Math.round(fiveStarScore);
    const showcaseTags = (item.genres?.length ? item.genres : [primaryCat]).slice(0, 3);
    const subtitleMeta = [item.year || '2026', primaryCat].filter(Boolean).join(' • ');
    const showcaseStyle = {
      '--rtv-flip': isShowcaseFlipped ? '180deg' : '0deg',
    } as CSSProperties;

    return (
      <article
        ref={showcaseCardRef}
        style={showcaseStyle}
        onPointerMove={handleShowcasePointerMove}
        onPointerLeave={resetShowcaseTilt}
        className="rtv-showcase-3d-wrap group relative h-full w-full select-none"
      >
        <div className="rtv-showcase-3d-inner relative flex h-full w-full flex-col rounded-[24px] shadow-[0_18px_40px_rgba(0,0,0,0.68)] group-hover:shadow-[0_28px_58px_rgba(0,0,0,0.86)]">
          {/* FRONT 3D FACE */}
          <div
            onClick={() => onSelect(item)}
            className={`rtv-showcase-3d-face relative flex h-full flex-col rounded-[24px] bg-[#141824] cursor-pointer ${
              isShowcaseFlipped ? 'pointer-events-none' : 'pointer-events-auto'
            }`}
          >
            {/* Clipped Specular 3D Glare & Outer Border */}
            <div className="pointer-events-none absolute inset-0 z-30 rounded-[24px] border border-white/[0.09] group-hover:border-white/25 overflow-hidden transition-colors">
              <div className="rtv-showcase-3d-glare absolute inset-0" />
            </div>

            {/* Top Corner Floating White Rounded-Square Watchlist Button (Popped in 3D Z-Space) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleWatchlist(item);
              }}
              aria-label={isInWatchlist ? 'إزالة من قائمتي' : 'إضافة إلى قائمتي'}
              className={`rtv-showcase-3d-layer-lg absolute top-2.5 left-2.5 sm:top-3 sm:left-3 z-40 inline-flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-xl shadow-[0_8px_18px_rgba(0,0,0,0.45)] transition-colors cursor-pointer ${
                isInWatchlist
                  ? 'bg-[#f9c400] text-[#141824]'
                  : 'bg-white/95 text-[#141824] hover:bg-[#f9c400]'
              }`}
            >
              {isInWatchlist ? (
                <Check className="w-4 h-4 stroke-[2.5]" />
              ) : (
                <Bookmark className="w-4 h-4 stroke-[2.2]" />
              )}
            </button>

            {/* Poster Image (Clipped to Top Rounded Corners) */}
            <div className="relative aspect-[4/4.3] w-full rounded-t-[24px] overflow-hidden bg-[#0e121b]">
              <OptimizedImage
                src={posterSrc}
                fallbackSrc={FALLBACK_POSTER}
                alt={item.title}
                slot="card_grid"
                priority={priority}
                loading={priority ? 'eager' : 'lazy'}
                className="h-full w-full"
                imgClassName="object-cover object-top transition-transform duration-500 ease-out group-hover:scale-105"
              />
              <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-[#141824] via-[#141824]/45 via-35% to-transparent" />
            </div>

            {/* Top Dark Info Panel with Curved Bottom Cutout */}
            <div className="relative z-10 -mt-5 flex flex-1 flex-col justify-between bg-[#141824] rounded-b-[26px] px-3 sm:px-4 pt-0.5 pb-2.5 text-right [transform-style:preserve-3d]">
              <div className="rtv-showcase-3d-layer-md space-y-1">
                <h3
                  style={{ fontSize: 'calc(var(--rtv-card-title-size, 13px) + 2px)' }}
                  className="font-display font-extrabold text-white leading-snug line-clamp-1 group-hover:text-[#f9c400] transition-colors"
                >
                  {item.title}
                </h3>

                <p className="text-[10.5px] sm:text-[11px] font-medium text-[#b7c9ef]/75 truncate tabular-nums">
                  {subtitleMeta}
                </p>

                <p className="text-[11px] font-bold text-white/90 truncate tabular-nums">
                  {item.duration || item.quality || 'HD'}
                </p>

                {/* 5-Star Rating Row */}
                <div className="pt-0.5 flex items-center gap-1.5">
                  <div className="flex items-center gap-0.5" aria-label={`التقييم ${fiveStarScore.toFixed(1)} من 5`}>
                    {[1, 2, 3, 4, 5].map((starIdx) => (
                      <Star
                        key={starIdx}
                        className={`w-3 h-3 ${
                          starIdx <= filledStars
                            ? 'text-[#f9c400] fill-[#f9c400]'
                            : 'text-white/20 fill-white/10'
                        }`}
                      />
                    ))}
                  </div>
                  {fiveStarScore > 0 && (
                    <span dir="ltr" className="font-latin text-[10px] font-bold text-white/65 tabular-nums">
                      {fiveStarScore.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>

              {/* Hashtag Genre Row & Interactive 3D Flip Chevron */}
              <div className="rtv-showcase-3d-layer-md mt-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  {showcaseTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold text-white/85 whitespace-nowrap truncate max-w-[92px]"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetShowcaseTilt();
                      setIsShowcaseFlipped(true);
                    }}
                    aria-label="قلب البطاقة لعرض التفاصيل"
                    title="التفاصيل السريعة"
                    className="inline-flex h-6 w-10 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  >
                    <ChevronUp className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Curved Crimson CTA Bar */}
            <div className="relative z-0 -mt-5 pt-7 pb-3 px-3 rounded-b-[24px] flex items-center justify-center bg-[#E50914] group-hover:bg-[#f40612] text-white transition-colors [transform-style:preserve-3d]">
              <span className="rtv-showcase-3d-layer-sm text-[11px] sm:text-xs font-black tracking-wide">
                مشاهدة الآن
              </span>
            </div>
          </div>

          {/* BACK 3D FACE (Revealed on 3D Flip via ^ button) */}
          <div
            className={`rtv-showcase-3d-back absolute inset-0 flex flex-col justify-between rounded-[24px] bg-gradient-to-b from-[#1a2030] via-[#141824] to-[#0d1018] border border-white/15 p-3.5 sm:p-4 text-right overflow-hidden ${
              isShowcaseFlipped ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            <div className="space-y-2.5 min-h-0">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsShowcaseFlipped(false);
                  }}
                  aria-label="العودة لواجهة البطاقة"
                  className="inline-flex items-center gap-1 rounded-xl bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[10px] font-bold text-white transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>رجوع</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleWatchlist(item);
                  }}
                  aria-label={isInWatchlist ? 'إزالة من قائمتي' : 'إضافة إلى قائمتي'}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-colors cursor-pointer ${
                    isInWatchlist
                      ? 'bg-[#f9c400] text-[#141824]'
                      : 'bg-white text-[#141824] hover:bg-[#f9c400]'
                  }`}
                >
                  {isInWatchlist ? <Check className="w-4 h-4 stroke-[2.5]" /> : <Bookmark className="w-4 h-4 stroke-[2.2]" />}
                </button>
              </div>

              <h3
                onClick={() => onSelect(item)}
                style={{ fontSize: 'calc(var(--rtv-card-title-size, 13px) + 1px)' }}
                className="font-display font-extrabold text-white leading-snug line-clamp-2 cursor-pointer hover:text-[#f9c400] transition-colors"
              >
                {item.title}
              </h3>

              <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-[#b7c9ef]/85">
                <span className="font-latin font-bold text-[#f9c400]">{item.year || '2026'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-latin text-white">{item.quality || 'HD'}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{item.country || primaryCat}</span>
              </div>

              {item.story && (
                <p className="text-[11px] leading-relaxed text-white/75 line-clamp-4">
                  {item.story}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 shrink-0">
              <button
                type="button"
                onClick={() => onSelect(item, false)}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-2.5 py-2.5 text-[11px] font-black text-white shadow-md transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>مشاهدة الآن</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(item, true);
                }}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-2.5 py-2.5 text-[11px] font-extrabold text-white transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تحميل</span>
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  /* Default: Modern Clean Dark Card (Netflix / YouTube inspired, zero clutter) */
  return (
    <article className="group relative flex flex-col rounded-2xl bg-[#181818] border border-white/[0.07] overflow-hidden transition-all duration-300 ease-out hover:-translate-y-1 hover:border-white/20 hover:bg-[#202020] hover:shadow-[0_20px_42px_rgba(0,0,0,0.72)]">
      {/* Poster Container */}
      <div
        onClick={() => onSelect(item)}
        className="relative aspect-[2/3] w-full overflow-hidden bg-[#121212] cursor-pointer"
      >
        <OptimizedImage
          src={posterSrc}
          fallbackSrc={FALLBACK_POSTER}
          alt={item.title}
          slot="card_grid"
          priority={priority}
          loading={priority ? 'eager' : 'lazy'}
          className="h-full w-full"
          imgClassName="object-cover object-top transition-transform duration-500 ease-out group-hover:scale-105"
        />

        {/* Measured Contrast Scrim */}
        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-[#181818] via-transparent to-black/45 opacity-90" />

        {/* Subtle Top-Right Viewer Rating */}
        {viewerAvg && (
          <div className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 z-20 flex flex-col items-end gap-1">
            <div className="inline-flex items-center gap-1 rounded-lg bg-[#0c1821]/85 backdrop-blur-md px-2 py-0.5 text-[10px] font-extrabold text-[#4CAF50] border border-[#4CAF50]/40">
              <Star className="w-2.5 h-2.5 text-[#f9c400] fill-[#f9c400]" />
              <span dir="ltr" className="font-latin tabular-nums">{viewerAvg}/5</span>
            </div>
          </div>
        )}

        {/* Top-Left Watchlist Quick Action */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleWatchlist(item);
          }}
          aria-label={isInWatchlist ? 'إزالة من قائمتي' : 'إضافة إلى قائمتي'}
          className={`absolute top-2 left-2 sm:top-2.5 sm:left-2.5 z-20 inline-flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-xl sm:rounded-lg backdrop-blur-md border transition-all cursor-pointer ${
            isInWatchlist
              ? 'bg-[#E50914] border-[#E50914] text-white opacity-100'
              : 'bg-black/65 border-white/15 text-white/85 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-[#E50914] hover:border-[#E50914] hover:text-white'
          }`}
        >
          {isInWatchlist ? <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> : <Bookmark className="w-4 h-4 sm:w-3.5 sm:h-3.5" />}
        </button>

        {/* Center Hover Play Button */}
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E50914]/95 text-white shadow-[0_8px_24px_rgba(229,9,20,0.5)] scale-90 opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
            <Play className="w-5 h-5 fill-current mr-[-2px]" />
          </div>
        </div>
      </div>

      {/* Clean Card Footer (Unboxed Metadata) */}
      <div
        onClick={() => onSelect(item)}
        className="flex flex-1 flex-col justify-between p-2.5 sm:p-3 text-right cursor-pointer"
      >
        <h3
          style={{ fontSize: 'var(--rtv-card-title-size, 13px)' }}
          className="font-display font-bold text-white leading-snug line-clamp-1 group-hover:text-[#E50914] transition-colors"
        >
          {item.title}
        </h3>
        <div className="mt-1 sm:mt-1.5 flex items-center gap-1.5 text-[10.5px] sm:text-[11px] font-medium text-[#a3a3a3] truncate tabular-nums">
          <span>{item.year || '2026'}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{primaryCat}</span>
          <span aria-hidden="true">·</span>
          <span className="font-latin text-white/80 shrink-0">{item.quality || 'HD'}</span>
        </div>
      </div>
    </article>
  );
}
