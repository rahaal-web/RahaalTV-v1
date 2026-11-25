import { type CSSProperties, type PointerEvent } from 'react';
import {
  ArrowUpLeft,
  Bookmark,
  Check,
  Clock,
  Crown,
  Download,
  Film,
  Play,
  RotateCw,
  Star,
  Ticket,
} from 'lucide-react';
import { FALLBACK_BACKDROP, FALLBACK_POSTER } from '../lib/mediaFilters';
import { getBackdropInfo } from '../lib/mediaImages';
import { HomeCardStyle3D, MediaItem } from '../types/media';
import { OptimizedImage } from './OptimizedImage';

export interface MovieCardVariantProps {
  item: MediaItem;
  variant: Exclude<HomeCardStyle3D, 'classic' | 'showcase'>;
  posterSrc: string;
  primaryCat: string;
  genresText: string;
  viewerAvg: string | null;
  isInWatchlist: boolean;
  priority: boolean;
  isFlipped: boolean;
  setIsFlipped: (next: boolean) => void;
  cardRef: (node: HTMLElement | null) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
  onResetTilt: () => void;
  onSelect: (item: MediaItem, openDownloads?: boolean) => void;
  onToggleWatchlist: (item: MediaItem) => void;
}

function WatchlistBtn({
  isInWatchlist,
  onToggle,
  item,
  className = '',
  iconClass = 'w-3.5 h-3.5',
}: {
  isInWatchlist: boolean;
  onToggle: (item: MediaItem) => void;
  item: MediaItem;
  className?: string;
  iconClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(item);
      }}
      aria-label={isInWatchlist ? 'إزالة من قائمتي' : 'إضافة إلى قائمتي'}
      className={`inline-flex items-center justify-center transition-colors cursor-pointer ${className}`}
    >
      {isInWatchlist ? (
        <Check className={`${iconClass} stroke-[2.5]`} />
      ) : (
        <Bookmark className={iconClass} />
      )}
    </button>
  );
}

export function MovieCard3DVariant({
  item,
  variant,
  posterSrc,
  primaryCat,
  genresText,
  viewerAvg,
  isInWatchlist,
  priority,
  isFlipped,
  setIsFlipped,
  cardRef,
  onPointerMove,
  onPointerLeave,
  onResetTilt,
  onSelect,
  onToggleWatchlist,
}: MovieCardVariantProps) {
  const yearText = String(item.year || '2026');
  const qualityText = item.quality || 'HD';
  const ratingText =
    viewerAvg || (item.imdb && item.imdb > 0 ? item.imdb.toFixed(1) : null);
  const backdropInfo = getBackdropInfo(item);
  const widescreenSrc = backdropInfo.hasDedicatedBackdrop
    ? backdropInfo.url
    : posterSrc;
  const durationOrCat = item.duration || primaryCat;

  const baseTitleStyle: CSSProperties = {
    fontSize: 'var(--rtv-card-title-size, 13px)',
  };

  /* 1. 3d-obsidian-tilt — Full-Bleed Poster + Bottom Slide-Up Story Curtain */
  if (variant === '3d-obsidian-tilt') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-obsidian-tilt group relative h-full w-full cursor-pointer select-none"
      >
        <div className="rtv-card-3d-inner relative aspect-[2/3.35] w-full overflow-hidden rounded-[20px] bg-[#0f0f0f]">
          <OptimizedImage
            src={posterSrc}
            fallbackSrc={FALLBACK_POSTER}
            alt={item.title}
            slot="card_grid"
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
            className="h-full w-full"
            imgClassName="object-cover object-top transition-transform duration-700 ease-out group-hover:scale-110"
          />

          <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/35 via-45% to-black/35" />
          <div className="rtv-card-3d-sheen pointer-events-none absolute inset-0 z-20" />

          {/* Top Left Quality Ribbon + Right Watchlist */}
          <div className="absolute top-2.5 inset-x-2.5 z-30 flex items-center justify-between gap-2">
            <span className="font-latin rounded-md bg-[#E50914] px-2 py-0.5 text-[10px] font-black tracking-wide text-white shadow-md">
              {qualityText}
            </span>
            <WatchlistBtn
              isInWatchlist={isInWatchlist}
              onToggle={onToggleWatchlist}
              item={item}
              className={`h-8 w-8 rounded-full border backdrop-blur-md ${
                isInWatchlist
                  ? 'bg-[#f9c400] border-[#f9c400] text-[#0f0f0f]'
                  : 'bg-black/60 border-white/20 text-white hover:bg-[#E50914] hover:border-[#E50914]'
              }`}
            />
          </div>

          {/* Slide-Up Curtain Drawer */}
          <div className="rtv-curtain-drawer absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end p-3 text-right transition-all duration-300 ease-out">
            <div className="flex items-center gap-2 text-[10.5px] font-bold text-[#a3a3a3] mb-1">
              <span className="font-latin text-[#f9c400]">{yearText}</span>
              {ratingText && (
                <span dir="ltr" className="font-latin inline-flex items-center gap-0.5 text-white">
                  <Star className="w-2.5 h-2.5 text-[#f9c400] fill-[#f9c400]" />
                  {ratingText}
                </span>
              )}
              <span className="truncate">{primaryCat}</span>
            </div>

            <h3
              style={baseTitleStyle}
              className="font-display font-extrabold text-white leading-snug line-clamp-1 group-hover:text-[#f9c400] transition-colors"
            >
              {item.title}
            </h3>

            {/* Expands smoothly on hover */}
            <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-300 ease-out group-hover:grid-rows-[1fr] group-hover:opacity-100">
              <div className="overflow-hidden">
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#d4d4d4] line-clamp-2">
                  {item.story || genresText}
                </p>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(item, false);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-[#E50914] hover:bg-[#D92321] py-1.5 text-[11px] font-extrabold text-white cursor-pointer"
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
                    aria-label="تحميل"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  }

  /* 2. 3d-cinema-stage — Widescreen Backdrop Top + Overlapping Mini-Poster + Full Details */
  if (variant === '3d-cinema-stage') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-cinema-stage group relative h-full w-full cursor-pointer select-none"
      >
        <div className="rtv-card-3d-inner flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[#141414]">
          {/* Widescreen Backdrop Screen */}
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#0c1821]">
            <OptimizedImage
              src={widescreenSrc}
              fallbackSrc={FALLBACK_BACKDROP}
              alt={item.title}
              slot="card_grid"
              priority={priority}
              loading={priority ? 'eager' : 'lazy'}
              className="h-full w-full"
              imgClassName="object-cover object-center transition-transform duration-500 group-hover:scale-105"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#141414] via-black/25 to-black/40" />

            <div className="absolute top-2 inset-x-2 flex items-center justify-between z-20">
              <span className="font-latin rounded bg-black/75 border border-white/15 px-1.5 py-0.5 text-[10px] font-bold text-[#f9c400]">
                {qualityText}
              </span>
              <WatchlistBtn
                isInWatchlist={isInWatchlist}
                onToggle={onToggleWatchlist}
                item={item}
                className={`h-7 w-7 rounded-lg border ${
                  isInWatchlist
                    ? 'bg-[#E50914] border-[#E50914] text-white'
                    : 'bg-black/70 border-white/15 text-white hover:bg-[#E50914]'
                }`}
              />
            </div>
          </div>

          {/* Overlapping Mini-Poster + Title/Stats */}
          <div className="relative z-20 -mt-8 flex items-end gap-2.5 px-3">
            <div className="w-14 sm:w-16 aspect-[2/3] shrink-0 overflow-hidden rounded-lg border-2 border-[#141414] shadow-[0_8px_20px_rgba(0,0,0,0.8)] ring-1 ring-white/15">
              <OptimizedImage
                src={posterSrc}
                fallbackSrc={FALLBACK_POSTER}
                alt={item.title}
                slot="card_grid"
                priority={priority}
                loading={priority ? 'eager' : 'lazy'}
                className="h-full w-full"
                imgClassName="object-cover object-top"
              />
            </div>

            <div className="min-w-0 flex-1 pb-0.5 text-right">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#a3a3a3] mb-0.5">
                <span className="font-latin text-[#f9c400]">{yearText}</span>
                {ratingText && (
                  <>
                    <span>·</span>
                    <span dir="ltr" className="font-latin text-white">★ {ratingText}</span>
                  </>
                )}
              </div>
              <h3
                style={baseTitleStyle}
                className="font-display font-extrabold text-white leading-snug line-clamp-2 group-hover:text-[#E50914] transition-colors"
              >
                {item.title}
              </h3>
            </div>
          </div>

          {/* Genre + Story + Action Bar */}
          <div className="flex flex-1 flex-col justify-between px-3 pt-2.5 pb-3 text-right">
            <p className="text-[11px] leading-relaxed text-[#a3a3a3] line-clamp-2">
              {item.story || `${primaryCat} — ${genresText}`}
            </p>

            <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-white/[0.07]">
              <span className="text-[10.5px] font-semibold text-[#b7c9ef] truncate">
                {durationOrCat}
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-[#E50914] group-hover:bg-[#D92321] px-2.5 py-1 text-[10.5px] font-extrabold text-white shrink-0 transition-colors">
                <Play className="w-2.5 h-2.5 fill-current" />
                <span>شاهد</span>
              </span>
            </div>
          </div>
        </div>
      </article>
    );
  }

  /* 3. 3d-neon-prism — Chamfered Diagonal Cut Corners + Title Header ABOVE Poster */
  if (variant === '3d-neon-prism') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-neon-prism group relative h-full w-full cursor-pointer select-none"
      >
        <div className="rtv-card-3d-inner rtv-chamfer-frame flex h-full w-full flex-col justify-between bg-[#121212] p-2.5">
          {/* Top Header Above Poster */}
          <div className="flex items-start justify-between gap-2 pb-2 border-b border-white/[0.08] text-right">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#a3a3a3]">
                <span className="font-latin text-[#E50914]">{yearText}</span>
                <span>/</span>
                <span className="truncate">{primaryCat}</span>
              </div>
              <h3
                style={baseTitleStyle}
                className="mt-0.5 font-display font-extrabold text-white leading-snug line-clamp-1 group-hover:text-[#f9c400] transition-colors"
              >
                {item.title}
              </h3>
            </div>
            <WatchlistBtn
              isInWatchlist={isInWatchlist}
              onToggle={onToggleWatchlist}
              item={item}
              className={`h-7 w-7 shrink-0 rounded-md border ${
                isInWatchlist
                  ? 'bg-[#f9c400] border-[#f9c400] text-[#0f0f0f]'
                  : 'bg-[#1a1a1a] border-white/10 text-[#a3a3a3] hover:text-white'
              }`}
            />
          </div>

          {/* Center Poster */}
          <div className="relative my-2 aspect-[3/3.7] w-full overflow-hidden rounded-lg bg-[#0a0a0a]">
            <OptimizedImage
              src={posterSrc}
              fallbackSrc={FALLBACK_POSTER}
              alt={item.title}
              slot="card_grid"
              priority={priority}
              loading={priority ? 'eager' : 'lazy'}
              className="h-full w-full"
              imgClassName="object-cover object-top scale-105 transition-transform duration-500 group-hover:scale-100"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E50914] text-white shadow-lg">
                <Play className="w-4 h-4 fill-current mr-[-2px]" />
              </span>
            </div>
          </div>

          {/* Bottom Score + Action Footer */}
          <div className="flex items-center justify-between gap-2 pt-1 text-[10.5px]">
            <div className="flex items-center gap-1.5">
              <span className="font-latin font-black text-white bg-[#1f1f1f] px-1.5 py-0.5 rounded">
                {qualityText}
              </span>
              {ratingText && (
                <span dir="ltr" className="font-latin font-bold text-[#f9c400]">
                  ★ {ratingText}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item, true);
              }}
              className="inline-flex items-center gap-1 font-bold text-[#a3a3a3] hover:text-white cursor-pointer"
            >
              <Download className="w-3 h-3 text-[#E50914]" />
              <span>تحميل</span>
            </button>
          </div>
        </div>
      </article>
    );
  }

  /* 4. 3d-glass-float — Full-Bleed Rounded Card + Detached Floating Frosted Dock Inside */
  if (variant === '3d-glass-float') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-glass-float group relative h-full w-full cursor-pointer select-none"
      >
        <div className="rtv-card-3d-inner relative aspect-[2/3.35] w-full overflow-hidden rounded-[26px] bg-[#0c1821]">
          <OptimizedImage
            src={posterSrc}
            fallbackSrc={FALLBACK_POSTER}
            alt={item.title}
            slot="card_grid"
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
            className="h-full w-full"
            imgClassName="object-cover object-top transition-all duration-500 group-hover:scale-105 group-hover:brightness-75"
          />

          <div className="rtv-card-3d-sheen pointer-events-none absolute inset-0 z-10" />

          {/* Top Floating Bookmark Pill */}
          <div className="absolute top-3 left-3 z-30">
            <WatchlistBtn
              isInWatchlist={isInWatchlist}
              onToggle={onToggleWatchlist}
              item={item}
              className={`h-8 w-8 rounded-full border backdrop-blur-md ${
                isInWatchlist
                  ? 'bg-[#f9c400] border-[#f9c400] text-[#0c1821]'
                  : 'bg-[#0c1821]/65 border-white/20 text-white hover:bg-[#E50914] hover:border-[#E50914]'
              }`}
            />
          </div>

          {ratingText && (
            <div className="absolute top-3 right-3 z-30 rounded-full bg-[#0c1821]/75 backdrop-blur-md border border-white/15 px-2.5 py-0.5 text-[10px] font-black text-[#f9c400]">
              <span dir="ltr" className="font-latin">★ {ratingText}</span>
            </div>
          )}

          {/* Detached Floating Frosted Dock */}
          <div className="rtv-card-3d-z-lg absolute inset-x-2.5 bottom-2.5 z-30 rounded-2xl bg-[#0f0f0f]/82 backdrop-blur-xl border border-white/15 p-2.5 text-right shadow-[0_14px_30px_rgba(0,0,0,0.75)] transition-transform duration-300 group-hover:-translate-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3
                  style={baseTitleStyle}
                  className="font-display font-extrabold text-white leading-snug line-clamp-1"
                >
                  {item.title}
                </h3>
                <p className="mt-0.5 text-[10px] font-medium text-[#b7c9ef] truncate">
                  <span className="font-latin text-[#f9c400]">{yearText}</span> · {primaryCat} ·{' '}
                  <span className="font-latin text-white">{qualityText}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(item, false);
                }}
                aria-label="تشغيل"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#E50914] hover:bg-[#D92321] text-white shadow-md cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current mr-[-1px]" />
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  /* 5. 3d-gold-bevel — Royal Gold Awards Plaque (Double Frame + Top Crown + Centered Plaque Text) */
  if (variant === '3d-gold-bevel') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-gold-bevel group relative h-full w-full cursor-pointer select-none"
      >
        <div className="rtv-card-3d-inner flex h-full w-full flex-col justify-between rounded-2xl bg-[#181510] p-2.5 text-center">
          {/* Top Gold Crown Crest */}
          <div className="flex items-center justify-between gap-1 pb-2">
            <span className="font-latin text-[10px] font-black text-[#f9c400]">
              {qualityText}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#f9c400]/45 bg-[#f9c400]/10 px-2 py-0.5 text-[10px] font-black text-[#f9c400]">
              <Crown className="w-3 h-3" />
              <span dir="ltr" className="font-latin">{ratingText || yearText}</span>
            </span>
            <WatchlistBtn
              isInWatchlist={isInWatchlist}
              onToggle={onToggleWatchlist}
              item={item}
              className={`h-6 w-6 rounded-full ${
                isInWatchlist ? 'text-[#f9c400]' : 'text-[#a3a3a3] hover:text-white'
              }`}
            />
          </div>

          {/* Matte Inset Poster */}
          <div className="relative aspect-[2/2.85] w-full overflow-hidden rounded-xl border border-[#f9c400]/35 bg-[#0f0d0a]">
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
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#181510]/80 via-transparent to-transparent" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#f9c400] bg-[#181510]/90 text-[#f9c400] shadow-xl">
                <Play className="w-4 h-4 fill-current mr-[-1px]" />
              </span>
            </div>
          </div>

          {/* Centered Classic Plaque Typography */}
          <div className="pt-2.5 pb-1 px-1">
            <h3
              style={baseTitleStyle}
              className="font-display font-extrabold text-white leading-snug line-clamp-1 group-hover:text-[#f9c400] transition-colors"
            >
              {item.title}
            </h3>
            <div className="mx-auto my-1.5 h-px w-12 bg-gradient-to-r from-transparent via-[#f9c400]/60 to-transparent" />
            <p className="text-[10.5px] font-semibold text-[#a3a3a3] truncate">
              {yearText} · {primaryCat}
            </p>
          </div>
        </div>
      </article>
    );
  }

  /* 6. 3d-stacked-deck — Dynamic Fan-Out Multi-Card Deck */
  if (variant === '3d-stacked-deck') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-stacked-deck group relative h-full w-full cursor-pointer select-none py-1.5 px-1"
      >
        {/* Back Fanned Card Layers */}
        <div className="rtv-deck-back-left pointer-events-none absolute inset-2 rounded-2xl bg-[#202020] border border-white/10 transition-transform duration-300" />
        <div className="rtv-deck-back-right pointer-events-none absolute inset-2 rounded-2xl bg-[#181818] border border-[#E50914]/35 transition-transform duration-300" />

        <div className="rtv-card-3d-inner relative z-10 flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[#181818]">
          <div className="relative aspect-[2/2.9] w-full overflow-hidden bg-[#0f0f0f]">
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
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-black/35" />

            <div className="absolute top-2.5 right-2.5 flex items-center gap-1 z-20">
              <span className="font-latin rounded-md bg-[#E50914] px-2 py-0.5 text-[10px] font-black text-white">
                {yearText}
              </span>
            </div>

            <div className="absolute top-2.5 left-2.5 z-20">
              <WatchlistBtn
                isInWatchlist={isInWatchlist}
                onToggle={onToggleWatchlist}
                item={item}
                className={`h-8 w-8 rounded-lg border ${
                  isInWatchlist
                    ? 'bg-[#4CAF50] border-[#4CAF50] text-white'
                    : 'bg-black/70 border-white/15 text-white hover:bg-[#E50914]'
                }`}
              />
            </div>
          </div>

          {/* Crimson Top Hairline Accent + Footer */}
          <div className="relative flex flex-1 flex-col justify-between border-t-2 border-[#E50914] bg-[#181818] p-2.5 text-right">
            <h3
              style={baseTitleStyle}
              className="font-display font-extrabold text-white leading-snug line-clamp-1 group-hover:text-[#E50914] transition-colors"
            >
              {item.title}
            </h3>
            <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-[#a3a3a3]">
              <span className="truncate">{primaryCat}</span>
              <span className="font-latin font-bold text-[#f9c400] shrink-0">
                {qualityText} {ratingText ? `· ★ ${ratingText}` : ''}
              </span>
            </div>
          </div>
        </div>
      </article>
    );
  }

  /* 7. 3d-hologram-edge — Vertical Side-Spine Metadata Rail + Poster Split */
  if (variant === '3d-hologram-edge') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-hologram-edge group relative h-full w-full cursor-pointer select-none"
      >
        <div className="rtv-card-3d-inner flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[#141414]">
          {/* Upper Split: Vertical Metadata Spine + Poster */}
          <div className="flex flex-1 min-h-0">
            {/* Vertical Side Rail */}
            <div className="flex w-9 sm:w-10 shrink-0 flex-col items-center justify-between border-l border-[#E50914]/45 bg-[#0f0f0f] py-2.5 px-1">
              <WatchlistBtn
                isInWatchlist={isInWatchlist}
                onToggle={onToggleWatchlist}
                item={item}
                className={`h-7 w-7 rounded-lg border ${
                  isInWatchlist
                    ? 'bg-[#f9c400] border-[#f9c400] text-[#0f0f0f]'
                    : 'bg-[#181818] border-white/10 text-white hover:bg-[#E50914]'
                }`}
                iconClass="w-3.5 h-3.5"
              />

              <div className="my-auto flex flex-col items-center gap-2">
                <span className="font-latin text-[10px] font-black text-[#E50914] [writing-mode:vertical-rl] rotate-180 tracking-widest">
                  {qualityText}
                </span>
                <span className="h-3 w-px bg-white/15" />
                <span className="font-latin text-[10px] font-bold text-white/80 [writing-mode:vertical-rl] rotate-180">
                  {yearText}
                </span>
              </div>

              {ratingText ? (
                <span className="font-latin text-[9.5px] font-black text-[#f9c400]">
                  ★{ratingText}
                </span>
              ) : (
                <Film className="w-3.5 h-3.5 text-[#a3a3a3]" />
              )}
            </div>

            {/* Poster Pane */}
            <div className="relative flex-1 aspect-[2/3] overflow-hidden bg-[#121212]">
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
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E50914] text-white shadow-xl">
                  <Play className="w-4 h-4 fill-current mr-[-1px]" />
                </span>
              </div>
            </div>
          </div>

          {/* Connected Footer Bar */}
          <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-[#181818] px-3 py-2.5 text-right">
            <div className="min-w-0 flex-1">
              <h3
                style={baseTitleStyle}
                className="font-display font-extrabold text-white leading-snug line-clamp-1 group-hover:text-[#f9c400] transition-colors"
              >
                {item.title}
              </h3>
              <p className="text-[10px] text-[#a3a3a3] truncate">{primaryCat}</p>
            </div>
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#E50914]/15 text-[#E50914] group-hover:bg-[#E50914] group-hover:text-white transition-colors">
              <Play className="w-3.5 h-3.5 fill-current" />
            </span>
          </div>
        </div>
      </article>
    );
  }

  /* 8. 3d-theater-curtain — Velvet Side Curtains That Part Open on Hover + Gold Marquee */
  if (variant === '3d-theater-curtain') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-theater-curtain group relative h-full w-full cursor-pointer select-none"
      >
        <div className="rtv-card-3d-inner relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[#180c0e]">
          {/* Stage Valence Arch */}
          <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#0e0708]">
            <OptimizedImage
              src={posterSrc}
              fallbackSrc={FALLBACK_POSTER}
              alt={item.title}
              slot="card_grid"
              priority={priority}
              loading={priority ? 'eager' : 'lazy'}
              className="h-full w-full"
              imgClassName="object-cover object-top transition-transform duration-700 group-hover:scale-105"
            />

            {/* Parting Left & Right Velvet Curtains */}
            <div className="rtv-curtain-panel-left pointer-events-none absolute inset-y-0 left-0 z-20 w-4 sm:w-5 transition-all duration-500 ease-out group-hover:-translate-x-full" />
            <div className="rtv-curtain-panel-right pointer-events-none absolute inset-y-0 right-0 z-20 w-4 sm:w-5 transition-all duration-500 ease-out group-hover:translate-x-full" />

            {/* Top Theater Valence */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-7 bg-gradient-to-b from-[#450a0a]/90 to-transparent" />

            <div className="absolute top-2.5 inset-x-3 z-30 flex items-center justify-between">
              <WatchlistBtn
                isInWatchlist={isInWatchlist}
                onToggle={onToggleWatchlist}
                item={item}
                className={`h-7 w-7 rounded-full border ${
                  isInWatchlist
                    ? 'bg-[#f9c400] border-[#f9c400] text-[#180c0e]'
                    : 'bg-black/70 border-white/20 text-white hover:bg-[#E50914]'
                }`}
              />
              {ratingText && (
                <span dir="ltr" className="font-latin rounded-full bg-black/75 border border-[#f9c400]/45 px-2 py-0.5 text-[10px] font-black text-[#f9c400]">
                  ★ {ratingText}
                </span>
              )}
            </div>

            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E50914] text-white shadow-[0_0_28px_rgba(229,9,20,0.65)]">
                <Play className="w-5 h-5 fill-current mr-[-2px]" />
              </span>
            </div>
          </div>

          {/* Marquee Plaque */}
          <div className="flex flex-1 flex-col justify-center border-t border-[#f9c400]/35 bg-gradient-to-b from-[#241014] to-[#14090b] px-3 py-2.5 text-center">
            <h3
              style={baseTitleStyle}
              className="font-display font-extrabold text-white leading-snug line-clamp-1 group-hover:text-[#f9c400] transition-colors"
            >
              {item.title}
            </h3>
            <p className="mt-1 text-[10px] font-bold text-[#f9c400]/85 truncate">
              {yearText} • {primaryCat} • <span className="font-latin">{qualityText}</span>
            </p>
          </div>
        </div>
      </article>
    );
  }

  /* 9. 3d-poster-lift — Floating Detached Poster Leaping Above Dark Pedestal Base */
  if (variant === '3d-poster-lift') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-poster-lift group relative flex h-full w-full flex-col cursor-pointer select-none pt-1"
      >
        {/* Detached Floating Poster */}
        <div className="rtv-card-3d-poster-pop relative z-20 mx-2 aspect-[2/3] overflow-hidden rounded-2xl border border-white/15 bg-[#121212] shadow-[0_18px_32px_rgba(0,0,0,0.85)] transition-all duration-300 ease-out">
          <OptimizedImage
            src={posterSrc}
            fallbackSrc={FALLBACK_POSTER}
            alt={item.title}
            slot="card_grid"
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
            className="h-full w-full"
            imgClassName="object-cover object-top"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />

          <div className="absolute top-2 left-2 z-20">
            <WatchlistBtn
              isInWatchlist={isInWatchlist}
              onToggle={onToggleWatchlist}
              item={item}
              className={`h-8 w-8 rounded-xl border ${
                isInWatchlist
                  ? 'bg-[#4CAF50] border-[#4CAF50] text-white'
                  : 'bg-black/70 border-white/20 text-white hover:bg-[#E50914]'
              }`}
            />
          </div>

          <span className="font-latin absolute bottom-2 right-2 rounded-md bg-[#E50914] px-2 py-0.5 text-[10px] font-black text-white">
            {qualityText}
          </span>
        </div>

        {/* Recessed Stationary Pedestal Base */}
        <div className="rtv-card-3d-inner relative z-10 -mt-5 flex flex-1 flex-col justify-end rounded-2xl bg-[#181818] px-3 pt-7 pb-3 text-right">
          <div className="h-0.5 w-0 bg-[#E50914] transition-all duration-300 group-hover:w-full mb-2 rounded-full" />
          <h3
            style={baseTitleStyle}
            className="font-display font-extrabold text-white leading-snug line-clamp-1 group-hover:text-[#f9c400] transition-colors"
          >
            {item.title}
          </h3>
          <div className="mt-1.5 flex items-center justify-between gap-1 text-[10.5px] font-semibold text-[#a3a3a3]">
            <span>{yearText} · {primaryCat}</span>
            {ratingText && (
              <span dir="ltr" className="font-latin text-[#4CAF50] font-extrabold">
                ★ {ratingText}
              </span>
            )}
          </div>
        </div>
      </article>
    );
  }

  /* 10. 3d-dual-flip — Interactive 180° Two-Sided Flip Book Card */
  if (variant === '3d-dual-flip') {
    const flipStyle = {
      '--rtv-flip': isFlipped ? '180deg' : '0deg',
    } as CSSProperties;

    return (
      <article
        ref={cardRef}
        style={flipStyle}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className="rtv-showcase-3d-wrap rtv-card-3d--3d-dual-flip group relative h-full w-full select-none"
      >
        <div className="rtv-showcase-3d-inner relative flex aspect-[2/3.4] w-full flex-col rounded-2xl">
          {/* FRONT FACE */}
          <div
            onClick={() => onSelect(item)}
            className={`rtv-showcase-3d-face relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[#141824] border border-white/10 cursor-pointer ${
              isFlipped ? 'pointer-events-none' : 'pointer-events-auto'
            }`}
          >
            <div className="relative flex-1 overflow-hidden bg-[#0c1821]">
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
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#141824] via-transparent to-black/35" />

              {/* Top Interactive Flip Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onResetTilt();
                  setIsFlipped(true);
                }}
                aria-label="قلب البطاقة"
                className="absolute top-2.5 right-2.5 z-30 inline-flex items-center gap-1 rounded-full bg-[#141824]/90 hover:bg-[#E50914] border border-white/20 px-2.5 py-1 text-[10px] font-extrabold text-white shadow-lg transition-colors cursor-pointer"
              >
                <RotateCw className="w-3 h-3" />
                <span>التفاصيل</span>
              </button>

              <div className="absolute top-2.5 left-2.5 z-30">
                <WatchlistBtn
                  isInWatchlist={isInWatchlist}
                  onToggle={onToggleWatchlist}
                  item={item}
                  className={`h-8 w-8 rounded-full border ${
                    isInWatchlist
                      ? 'bg-[#f9c400] border-[#f9c400] text-[#0c1821]'
                      : 'bg-black/65 border-white/20 text-white hover:bg-[#E50914]'
                  }`}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 bg-[#141824] p-3 text-right">
              <h3
                style={baseTitleStyle}
                className="font-display font-extrabold text-white leading-snug line-clamp-1"
              >
                {item.title}
              </h3>
              <div className="flex items-center justify-between text-[10.5px] text-[#b7c9ef]">
                <span className="truncate">{yearText} · {primaryCat}</span>
                <span className="font-latin font-black text-[#f9c400]">{qualityText}</span>
              </div>
            </div>
          </div>

          {/* BACK FACE */}
          <div
            className={`rtv-showcase-3d-back absolute inset-0 flex flex-col justify-between rounded-2xl bg-[#141824] border border-[#E50914]/45 p-3.5 text-right overflow-hidden ${
              isFlipped ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFlipped(false);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2 py-1 text-[10px] font-bold text-white cursor-pointer"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>الواجهة</span>
                </button>
                {ratingText && (
                  <span dir="ltr" className="font-latin text-xs font-black text-[#f9c400]">
                    ★ {ratingText}
                  </span>
                )}
              </div>

              <h3
                onClick={() => onSelect(item)}
                style={baseTitleStyle}
                className="mt-2.5 font-display font-extrabold text-white line-clamp-2 cursor-pointer hover:text-[#f9c400]"
              >
                {item.title}
              </h3>

              <p className="mt-1.5 text-[10.5px] font-bold text-[#b7c9ef]">
                {genresText} • {item.language || 'مترجم'}
              </p>

              <p className="mt-2 text-[11px] leading-relaxed text-white/80 line-clamp-4">
                {item.story || `${primaryCat} — جودة ${qualityText}`}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-2">
              <button
                type="button"
                onClick={() => onSelect(item, false)}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#E50914] hover:bg-[#D92321] py-2 text-[11px] font-extrabold text-white cursor-pointer"
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
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-white/10 hover:bg-white/20 py-2 text-[11px] font-extrabold text-white cursor-pointer"
              >
                <Download className="w-3 h-3" />
                <span>تحميل</span>
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  /* 11. 3d-corner-fold — Perforated Cinema Ticket with Side Notches & Tear-Off Stub */
  if (variant === '3d-corner-fold') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-corner-fold group relative h-full w-full cursor-pointer select-none"
      >
        <div className="rtv-card-3d-inner flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[#1a1a1a]">
          {/* Upper Ticket Poster Body */}
          <div className="relative aspect-[2/2.75] w-full overflow-hidden bg-[#121212]">
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
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/90 via-transparent to-black/35" />

            <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-20">
              <span className="inline-flex items-center gap-1 rounded bg-[#E50914] px-2 py-0.5 text-[10px] font-black text-white shadow">
                <Ticket className="w-3 h-3" />
                <span className="font-latin">{qualityText}</span>
              </span>
              <WatchlistBtn
                isInWatchlist={isInWatchlist}
                onToggle={onToggleWatchlist}
                item={item}
                className={`h-7 w-7 rounded-md border ${
                  isInWatchlist
                    ? 'bg-[#f9c400] border-[#f9c400] text-[#0f0f0f]'
                    : 'bg-black/70 border-white/20 text-white hover:bg-[#E50914]'
                }`}
              />
            </div>
          </div>

          {/* Perforation Divider with Semicircular Ticket Notches */}
          <div className="relative flex items-center justify-center bg-[#1a1a1a] px-3 py-1">
            <span className="absolute -left-2.5 h-5 w-5 rounded-full bg-[#0f0f0f] border-r border-white/10" />
            <div className="w-full border-t-2 border-dashed border-white/20" />
            <span className="absolute -right-2.5 h-5 w-5 rounded-full bg-[#0f0f0f] border-l border-white/10" />
          </div>

          {/* Tear-Off Ticket Stub */}
          <div className="flex flex-1 flex-col justify-between bg-[#1a1a1a] px-3 pb-3 pt-1 text-right transition-transform duration-300 group-hover:translate-y-0.5">
            <h3
              style={baseTitleStyle}
              className="font-display font-extrabold text-white leading-snug line-clamp-1 group-hover:text-[#f9c400] transition-colors"
            >
              {item.title}
            </h3>

            <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
              <span className="font-latin font-bold text-[#a3a3a3] tracking-wider">
                NO.{yearText} · {primaryCat}
              </span>
              <span className="rounded bg-[#E50914] px-2 py-0.5 font-extrabold text-white">
                تذكرة دخول
              </span>
            </div>
          </div>
        </div>
      </article>
    );
  }

  /* 12. 3d-cyber-frame — Cinema Camera Viewfinder HUD (4 Expanding L-Brackets + Crosshair) */
  if (variant === '3d-cyber-frame') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-cyber-frame group relative h-full w-full cursor-pointer select-none"
      >
        <div className="rtv-card-3d-inner flex h-full w-full flex-col overflow-hidden rounded-lg bg-[#0f0f0f] p-2">
          {/* Top Monospaced HUD Strip */}
          <div className="flex items-center justify-between gap-2 pb-1.5 text-[10px] font-latin font-bold text-[#a3a3a3]">
            <span className="text-[#E50914] tracking-wider">REC ● {yearText}</span>
            <span>{qualityText}</span>
            {ratingText && <span className="text-[#f9c400]">IMDb {ratingText}</span>}
          </div>

          {/* Viewfinder Frame */}
          <div className="relative aspect-[2/2.8] w-full overflow-hidden rounded bg-black">
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
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />

            {/* Four Animated Corner L-Brackets */}
            <span className="pointer-events-none absolute top-2 left-2 h-4 w-4 border-t-2 border-l-2 border-[#E50914] transition-all duration-300 group-hover:top-1 group-hover:left-1 group-hover:h-5 group-hover:w-5" />
            <span className="pointer-events-none absolute top-2 right-2 h-4 w-4 border-t-2 border-r-2 border-[#E50914] transition-all duration-300 group-hover:top-1 group-hover:right-1 group-hover:h-5 group-hover:w-5" />
            <span className="pointer-events-none absolute bottom-2 left-2 h-4 w-4 border-b-2 border-l-2 border-white/80 transition-all duration-300 group-hover:bottom-1 group-hover:left-1 group-hover:border-[#E50914]" />
            <span className="pointer-events-none absolute bottom-2 right-2 h-4 w-4 border-b-2 border-r-2 border-white/80 transition-all duration-300 group-hover:bottom-1 group-hover:right-1 group-hover:border-[#E50914]" />

            {/* Viewfinder Center Reticle */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-[#f9c400] bg-black/55 backdrop-blur-sm">
                <Play className="w-4 h-4 fill-current text-white mr-[-1px]" />
              </div>
            </div>
          </div>

          {/* Bottom Viewfinder Caption + Bookmark */}
          <div className="mt-2 flex items-center justify-between gap-2 text-right">
            <div className="min-w-0 flex-1">
              <h3
                style={baseTitleStyle}
                className="font-display font-extrabold text-white leading-snug line-clamp-1 group-hover:text-[#E50914] transition-colors"
              >
                {item.title}
              </h3>
              <p className="text-[10px] text-[#a3a3a3] truncate">{primaryCat}</p>
            </div>
            <WatchlistBtn
              isInWatchlist={isInWatchlist}
              onToggle={onToggleWatchlist}
              item={item}
              className={`h-7 w-7 shrink-0 rounded border ${
                isInWatchlist
                  ? 'bg-[#E50914] border-[#E50914] text-white'
                  : 'bg-[#181818] border-white/15 text-[#a3a3a3] hover:text-white'
              }`}
            />
          </div>
        </div>
      </article>
    );
  }

  /* 13. 3d-velvet-depth — Arched Marquee Dome Silhouette */
  if (variant === '3d-velvet-depth') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-velvet-depth group relative h-full w-full cursor-pointer select-none"
      >
        <div className="rtv-card-3d-inner flex h-full w-full flex-col justify-between rounded-t-[999px] rounded-b-2xl bg-[#161418] p-2.5 text-center">
          {/* Arched Poster Dome */}
          <div className="relative aspect-[2/2.85] w-full overflow-hidden rounded-t-[999px] rounded-b-lg border border-white/15 bg-[#0f0f0f]">
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
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#161418] via-transparent to-black/30" />

            <WatchlistBtn
              isInWatchlist={isInWatchlist}
              onToggle={onToggleWatchlist}
              item={item}
              className={`absolute bottom-2.5 left-2.5 z-20 h-7 w-7 rounded-full border ${
                isInWatchlist
                  ? 'bg-[#f9c400] border-[#f9c400] text-[#0f0f0f]'
                  : 'bg-black/70 border-white/20 text-white hover:bg-[#E50914]'
              }`}
            />

            <span className="font-latin absolute bottom-2.5 right-2.5 z-20 rounded-full bg-[#E50914] px-2 py-0.5 text-[9.5px] font-black text-white">
              {qualityText}
            </span>
          </div>

          <div className="pt-2.5 pb-1 px-1">
            <h3
              style={baseTitleStyle}
              className="font-display font-extrabold text-white leading-snug line-clamp-1 group-hover:text-[#f9c400] transition-colors"
            >
              {item.title}
            </h3>
            <p className="mt-1 text-[10.5px] font-medium text-[#a3a3a3] truncate">
              {yearText} · {primaryCat} {ratingText ? `· ★ ${ratingText}` : ''}
            </p>
          </div>
        </div>
      </article>
    );
  }

  /* 14. 3d-chrome-plate — 35mm Cinema Filmstrip Reel with Sprocket Holes */
  if (variant === '3d-chrome-plate') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-chrome-plate group relative h-full w-full cursor-pointer select-none"
      >
        <div className="rtv-card-3d-inner flex h-full w-full flex-col overflow-hidden rounded-xl bg-[#121212]">
          {/* Top Clapper Slate Header */}
          <div className="flex items-center justify-between bg-[#1b1b1b] border-b border-white/10 px-2.5 py-1.5 text-[10px]">
            <span className="font-latin font-black text-[#f9c400]">SCENE {yearText}</span>
            <span className="font-latin font-bold text-white/80">{qualityText}</span>
          </div>

          {/* Center Poster Framed by Vertical 35mm Sprocket Strips */}
          <div className="relative flex flex-1 min-h-0 bg-[#0d0d0d]">
            <div className="rtv-film-sprocket w-3.5 shrink-0" />
            <div className="relative flex-1 aspect-[2/2.8] overflow-hidden border-x border-white/10">
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
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f9c400] text-[#121212] shadow-lg">
                  <Play className="w-4 h-4 fill-current mr-[-1px]" />
                </span>
              </div>
            </div>
            <div className="rtv-film-sprocket w-3.5 shrink-0" />
          </div>

          {/* Bottom Film Reel Title Bar */}
          <div className="flex items-center justify-between gap-2 bg-[#1b1b1b] border-t border-white/10 px-2.5 py-2 text-right">
            <div className="min-w-0 flex-1">
              <h3
                style={baseTitleStyle}
                className="font-display font-extrabold text-white leading-snug line-clamp-1 group-hover:text-[#f9c400] transition-colors"
              >
                {item.title}
              </h3>
              <p className="text-[10px] text-[#a3a3a3] truncate">{primaryCat}</p>
            </div>
            <WatchlistBtn
              isInWatchlist={isInWatchlist}
              onToggle={onToggleWatchlist}
              item={item}
              className={`h-7 w-7 shrink-0 rounded-md border ${
                isInWatchlist
                  ? 'bg-[#f9c400] border-[#f9c400] text-[#121212]'
                  : 'bg-[#121212] border-white/15 text-white hover:bg-[#E50914]'
              }`}
            />
          </div>
        </div>
      </article>
    );
  }

  /* 15. 3d-spotlight-arc — Circular Portrait Medallion Under Spotlight Cone */
  if (variant === '3d-spotlight-arc') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-spotlight-arc group relative h-full w-full cursor-pointer select-none"
      >
        <div className="rtv-card-3d-inner flex h-full w-full flex-col items-center justify-between rounded-3xl bg-[#141414] px-3 pt-4 pb-3 text-center">
          {/* Circular Portal Image */}
          <div className="relative mx-auto aspect-square w-[84%] max-w-[180px] overflow-hidden rounded-full ring-2 ring-[#E50914]/65 ring-offset-4 ring-offset-[#141414] bg-[#0f0f0f] transition-transform duration-300 group-hover:scale-105 group-hover:ring-[#f9c400]">
            <OptimizedImage
              src={posterSrc}
              fallbackSrc={FALLBACK_POSTER}
              alt={item.title}
              slot="card_grid"
              priority={priority}
              loading={priority ? 'eager' : 'lazy'}
              className="h-full w-full"
              imgClassName="object-cover object-top"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E50914] text-white shadow-xl">
                <Play className="w-4 h-4 fill-current mr-[-1px]" />
              </span>
            </div>
          </div>

          {/* Sculpted Pedestal Info */}
          <div className="mt-3.5 w-full space-y-1.5">
            <div className="flex items-center justify-center gap-2 text-[10px] font-black">
              <span className="font-latin rounded-full bg-[#E50914]/20 text-[#E50914] px-2 py-0.5">
                {qualityText}
              </span>
              {ratingText && (
                <span dir="ltr" className="font-latin text-[#f9c400]">
                  ★ {ratingText}
                </span>
              )}
            </div>

            <h3
              style={baseTitleStyle}
              className="font-display font-extrabold text-white leading-snug line-clamp-1 group-hover:text-[#f9c400] transition-colors"
            >
              {item.title}
            </h3>

            <p className="text-[10.5px] text-[#a3a3a3] truncate">
              {yearText} · {primaryCat}
            </p>

            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(item, false);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-[#E50914] hover:bg-[#D92321] py-1.5 text-[10.5px] font-extrabold text-white cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>تشغيل</span>
              </button>
              <WatchlistBtn
                isInWatchlist={isInWatchlist}
                onToggle={onToggleWatchlist}
                item={item}
                className={`h-7 w-7 rounded-full border ${
                  isInWatchlist
                    ? 'bg-[#f9c400] border-[#f9c400] text-[#141414]'
                    : 'bg-[#202020] border-white/15 text-white hover:border-white/40'
                }`}
              />
            </div>
          </div>
        </div>
      </article>
    );
  }

  /* 16. 3d-polaroid-slab — Tilted Instant Cinema Photo Print That Straightens on Hover */
  if (variant === '3d-polaroid-slab') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-polaroid-slab group relative h-full w-full cursor-pointer select-none py-1"
      >
        <div className="rtv-card-3d-inner flex h-full w-full flex-col rounded-xl bg-[#202020] p-2.5 pb-3.5 text-right transition-transform duration-300 -rotate-2 group-hover:rotate-0">
          {/* Square-ish Matte Photo Frame */}
          <div className="relative aspect-[4/4.6] w-full overflow-hidden rounded bg-[#121212]">
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
            <div className="absolute top-2 left-2 z-20">
              <WatchlistBtn
                isInWatchlist={isInWatchlist}
                onToggle={onToggleWatchlist}
                item={item}
                className={`h-7 w-7 rounded border ${
                  isInWatchlist
                    ? 'bg-[#f9c400] border-[#f9c400] text-[#202020]'
                    : 'bg-black/65 border-white/20 text-white hover:bg-[#E50914]'
                }`}
              />
            </div>
          </div>

          {/* Wide Polaroid Chin with Crimson Stamp */}
          <div className="mt-3 flex items-end justify-between gap-2 px-0.5">
            <div className="min-w-0 flex-1">
              <h3
                style={baseTitleStyle}
                className="font-display font-black text-white leading-snug line-clamp-1 group-hover:text-[#f9c400] transition-colors"
              >
                {item.title}
              </h3>
              <p className="mt-1 text-[10.5px] font-semibold text-[#a3a3a3] truncate">
                {yearText} — {primaryCat}
              </p>
            </div>
            <span className="font-latin -rotate-6 shrink-0 rounded border-2 border-[#E50914] px-1.5 py-0.5 text-[10px] font-black text-[#E50914]">
              {qualityText}
            </span>
          </div>
        </div>
      </article>
    );
  }

  /* 17. 3d-split-slice — Diagonal Angled Cut Between Poster & Sliding Info Wedge */
  if (variant === '3d-split-slice') {
    return (
      <article
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => onSelect(item)}
        className="rtv-card-3d-wrap rtv-card-3d--3d-split-slice group relative h-full w-full cursor-pointer select-none"
      >
        <div className="rtv-card-3d-inner relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[#141414]">
          {/* Poster with Diagonal Bottom Slice */}
          <div className="relative aspect-[2/2.85] w-full overflow-hidden bg-[#0f0f0f]">
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
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-black/35" />

            {/* Diagonal Crimson Slice Divider */}
            <div
              className="pointer-events-none absolute -bottom-1 inset-x-0 z-20 h-11 bg-[#E50914]/90 transition-transform duration-300 group-hover:-translate-y-1"
              style={{ clipPath: 'polygon(0 78%, 100% 10%, 100% 100%, 0% 100%)' }}
            />
            <div
              className="pointer-events-none absolute -bottom-1 inset-x-0 z-20 h-10 bg-[#141414]"
              style={{ clipPath: 'polygon(0 78%, 100% 10%, 100% 100%, 0% 100%)' }}
            />

            <div className="absolute top-2.5 inset-x-2.5 z-30 flex items-center justify-between">
              {ratingText ? (
                <span dir="ltr" className="font-latin rounded bg-black/75 border border-white/15 px-2 py-0.5 text-[10px] font-black text-[#f9c400]">
                  ★ {ratingText}
                </span>
              ) : (
                <span />
              )}
              <WatchlistBtn
                isInWatchlist={isInWatchlist}
                onToggle={onToggleWatchlist}
                item={item}
                className={`h-8 w-8 rounded-lg border ${
                  isInWatchlist
                    ? 'bg-[#f9c400] border-[#f9c400] text-[#0f0f0f]'
                    : 'bg-black/65 border-white/20 text-white hover:bg-[#E50914]'
                }`}
              />
            </div>
          </div>

          {/* Info Wedge */}
          <div className="relative z-30 -mt-2 flex flex-1 flex-col justify-between bg-[#141414] px-3 pb-3 pt-1 text-right">
            <h3
              style={baseTitleStyle}
              className="font-display font-extrabold text-white leading-snug line-clamp-1 group-hover:text-[#E50914] transition-colors"
            >
              {item.title}
            </h3>
            <div className="mt-1.5 flex items-center justify-between text-[10.5px] font-semibold text-[#a3a3a3]">
              <span className="truncate">{primaryCat}</span>
              <span className="font-latin font-black text-white shrink-0">
                {yearText} · {qualityText}
              </span>
            </div>
          </div>
        </div>
      </article>
    );
  }

  /* 18. 3d-metallic-crest — Sharp Editorial Magazine Broadsheet */
  return (
    <article
      ref={cardRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={() => onSelect(item)}
      className="rtv-card-3d-wrap rtv-card-3d--3d-metallic-crest group relative h-full w-full cursor-pointer select-none"
    >
      <div className="rtv-card-3d-inner flex h-full w-full flex-col justify-between rounded-sm bg-[#141414] p-2.5 text-right">
        {/* Sharp Editorial Masthead */}
        <div className="flex items-center justify-between border-b border-white/15 pb-1.5 text-[10px] font-bold text-[#a3a3a3]">
          <span className="truncate text-white/90">{primaryCat}</span>
          <span className="font-latin text-[#E50914] shrink-0">
            {yearText} · {qualityText}
          </span>
        </div>

        {/* Clean Badge-Free Image */}
        <div className="relative my-2 aspect-[4/4.3] w-full overflow-hidden bg-[#0f0f0f]">
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
        </div>

        {/* Magazine Headline + Excerpt + Split Action Row */}
        <div className="flex flex-1 flex-col justify-between">
          <div>
            <h3
              style={baseTitleStyle}
              className="font-display font-black text-white leading-snug line-clamp-1 group-hover:text-[#f9c400] transition-colors"
            >
              {item.title}
            </h3>
            <p className="mt-1 text-[10.5px] leading-relaxed text-[#a3a3a3] line-clamp-2">
              {item.story || `${genresText}${item.duration ? ` • ${item.duration}` : ''}`}
            </p>
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2">
            <span className="inline-flex items-center gap-1 text-[10.5px] font-black text-[#E50914] group-hover:text-white transition-colors">
              <span>شاهد العمل</span>
              <ArrowUpLeft className="w-3.5 h-3.5" />
            </span>

            <div className="flex items-center gap-1.5">
              {ratingText && (
                <span dir="ltr" className="font-latin text-[10px] font-bold text-[#f9c400]">
                  ★ {ratingText}
                </span>
              )}
              {item.duration && (
                <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-[#a3a3a3]">
                  <Clock className="w-2.5 h-2.5" />
                </span>
              )}
              <WatchlistBtn
                isInWatchlist={isInWatchlist}
                onToggle={onToggleWatchlist}
                item={item}
                className={`h-6 w-6 rounded-sm border ${
                  isInWatchlist
                    ? 'bg-[#4CAF50] border-[#4CAF50] text-white'
                    : 'bg-[#1f1f1f] border-white/15 text-[#a3a3a3] hover:text-white'
                }`}
                iconClass="w-3 h-3"
              />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
