import { useMemo, useState } from 'react';
import { ArrowRight, Clapperboard, Film, Sparkles, Tv, Users } from 'lucide-react';
import { normalizeArabicText } from '../lib/mediaFilters';
import { HomeCardStyle, MediaItem } from '../types/media';
import { MovieCard } from './MovieCard';
import { OptimizedImage } from './OptimizedImage';

interface ActorProfileViewProps {
  actorName: string;
  catalog: MediaItem[];
  cardStyle?: HomeCardStyle;
  watchlistIds: string[];
  onToggleWatchlist: (item: MediaItem) => void;
  onSelectMedia: (item: MediaItem, openDownloads?: boolean) => void;
  onNavigateBack: () => void;
  onNavigateHome: () => void;
}

type KindFilter = 'all' | 'movie' | 'series' | 'other';

function matchesActorName(candidateName: string, targetNormalized: string): boolean {
  const norm = normalizeArabicText(candidateName || '').trim().toLowerCase();
  if (!norm || !targetNormalized) return false;
  return norm === targetNormalized;
}

export function ActorProfileView({
  actorName,
  catalog,
  cardStyle = 'clean',
  watchlistIds,
  onToggleWatchlist,
  onSelectMedia,
  onNavigateBack,
  onNavigateHome,
}: ActorProfileViewProps) {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');

  const cleanActorName = actorName.trim();
  const normalizedTarget = useMemo(
    () => normalizeArabicText(cleanActorName).trim().toLowerCase(),
    [cleanActorName]
  );

  const actorWorks = useMemo(() => {
    if (!normalizedTarget) return [];
    return catalog.filter((item) =>
      (item.cast || []).some((member) => matchesActorName(member.name, normalizedTarget))
    );
  }, [catalog, normalizedTarget]);

  const actorMeta = useMemo(() => {
    let avatarUrl = '';
    let role = 'ممثل / فنان';
    let initials = cleanActorName.slice(0, 2).toUpperCase() || 'AC';
    for (const item of actorWorks) {
      const match = (item.cast || []).find((m) => matchesActorName(m.name, normalizedTarget));
      if (match) {
        if (!avatarUrl && match.avatarUrl) avatarUrl = match.avatarUrl;
        if (match.role && match.role !== 'فريق العمل') role = match.role;
        if (match.initials) initials = match.initials;
      }
    }
    return { avatarUrl, role, initials };
  }, [actorWorks, normalizedTarget, cleanActorName]);

  const counts = useMemo(() => {
    let movies = 0;
    let series = 0;
    let other = 0;
    for (const item of actorWorks) {
      if (item.kind === 'movie') movies++;
      else if (item.kind === 'series') series++;
      else other++;
    }
    return { total: actorWorks.length, movies, series, other };
  }, [actorWorks]);

  const filteredWorks = useMemo(() => {
    if (kindFilter === 'movie') return actorWorks.filter((i) => i.kind === 'movie');
    if (kindFilter === 'series') return actorWorks.filter((i) => i.kind === 'series');
    if (kindFilter === 'other') return actorWorks.filter((i) => i.kind !== 'movie' && i.kind !== 'series');
    return actorWorks;
  }, [actorWorks, kindFilter]);

  const topGenres = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of actorWorks) {
      for (const g of item.genres || []) {
        if (!g) continue;
        map.set(g, (map.get(g) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g]) => g);
  }, [actorWorks]);

  return (
    <div className="mx-auto max-w-[1440px] px-3.5 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-16 space-y-6 sm:space-y-8 rtv-fade-in">
      {/* Top Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onNavigateBack}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#181818] hover:bg-[#E50914] border border-white/10 px-4 py-2 text-xs font-extrabold text-white transition-colors cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>رجوع</span>
        </button>

        <button
          type="button"
          onClick={onNavigateHome}
          className="text-xs font-bold text-[#a3a3a3] hover:text-white transition-colors cursor-pointer"
        >
          الرئيسية / الممثلين / {cleanActorName}
        </button>
      </div>

      {/* Actor Profile Header Card */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-[#181818] via-[#121923] to-[#0c1821] border border-white/10 p-5 sm:p-8 shadow-2xl">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-7">
          {actorMeta.avatarUrl ? (
            <div className="h-24 w-24 sm:h-32 sm:w-32 rounded-3xl overflow-hidden border-2 border-[#f9c400]/45 shadow-2xl shrink-0 bg-[#0f0f0f]">
              <OptimizedImage
                src={actorMeta.avatarUrl}
                alt={cleanActorName}
                slot="cast_avatar"
                className="h-full w-full"
                imgClassName="object-cover object-top"
              />
            </div>
          ) : (
            <div className="flex h-24 w-24 sm:h-32 sm:w-32 items-center justify-center rounded-3xl bg-gradient-to-br from-[#E50914] to-[#1a242e] border-2 border-white/20 text-3xl sm:text-4xl font-black text-white shadow-2xl shrink-0">
              {actorMeta.initials}
            </div>
          )}

          <div className="flex-1 min-w-0 text-center sm:text-right space-y-3">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#f9c400]">
                <Users className="w-3.5 h-3.5" />
                <span>صفحة أعمال الفنان</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-tight">
                {cleanActorName}
              </h1>
              <p className="text-xs sm:text-sm text-[#b7c9ef]">
                {actorMeta.role} · إجمالي الأعمال المتوفرة على الموقع:{' '}
                <strong className="font-latin text-white">{counts.total}</strong>
              </p>
            </div>

            {topGenres.length > 0 && (
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[11px] font-bold text-[#b7c9ef]">
                {topGenres.map((genre) => (
                  <span
                    key={genre}
                    className="rounded-lg bg-white/[0.06] border border-white/10 px-2.5 py-1 text-white/90"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      {counts.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#f9c400]" />
            <h2 className="font-display text-base sm:text-xl font-extrabold text-white">
              أعمال {cleanActorName} ({filteredWorks.length})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all' as const, label: `الكل (${counts.total})`, icon: Clapperboard, show: true },
              { id: 'movie' as const, label: `أفلام (${counts.movies})`, icon: Film, show: counts.movies > 0 },
              { id: 'series' as const, label: `مسلسلات (${counts.series})`, icon: Tv, show: counts.series > 0 },
              { id: 'other' as const, label: `عروض أخرى (${counts.other})`, icon: Sparkles, show: counts.other > 0 },
            ]
              .filter((t) => t.show)
              .map((tab) => {
                const Icon = tab.icon;
                const active = kindFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setKindFilter(tab.id)}
                    className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-extrabold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#E50914] border-[#E50914] text-white'
                        : 'bg-[#181818] border-white/10 text-[#b7c9ef] hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Results Grid */}
      {filteredWorks.length === 0 ? (
        <div className="rounded-3xl bg-[#181818] border border-white/10 p-10 text-center space-y-4">
          <Users className="w-10 h-10 text-[#f9c400] mx-auto" />
          <div className="space-y-1">
            <h3 className="font-display text-lg font-extrabold text-white">
              لا توجد أعمال مسجلة حالياً باسم «{cleanActorName}»
            </h3>
            <p className="text-xs sm:text-sm text-[#b7c9ef]">
              عند جلب أو إضافة أفلام أو مسلسلات جديدة يشارك فيها هذا الممثل ستظهر هنا تلقائياً.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-5 py-2 text-xs font-extrabold text-white cursor-pointer"
          >
            العودة إلى الرئيسية
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4">
          {filteredWorks.map((item) => (
            <MovieCard
              key={`${item.id}::${item.poster_url || item.poster || ''}`}
              item={item}
              onSelect={onSelectMedia}
              isInWatchlist={watchlistIds.includes(item.id)}
              onToggleWatchlist={onToggleWatchlist}
              variant={cardStyle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
