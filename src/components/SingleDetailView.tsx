import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  ArrowRight,
  Bookmark,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Copy,
  Download,
  Film,
  Globe,
  Languages,
  Layers,
  LogIn,
  Play,
  Server,
  Share2,
  Star,
  Trash2,
  Tv,
  Users,
} from 'lucide-react';
import { subscribeActiveDatabaseChange } from '../lib/dbConnectionManager';
import {
  deleteMediaRatingFromFirestore,
  getActiveDatabase,
  handleFirestoreError,
  OperationType,
  sanitizeRatingMediaId,
  submitMediaRatingToFirestore,
} from '../lib/firebase';
import { FALLBACK_BACKDROP, FALLBACK_POSTER } from '../lib/mediaFilters';
import { getBackdropUrl, getPosterUrl } from '../lib/mediaImages';
import { resolveDisplayShortUrl } from '../lib/permalink';
import { formatShortServerName } from '../lib/playerTheme';
import { MediaItem, CatalogFilterState, HomeCardStyle, MediaRatingRecord } from '../types/media';
import { MovieCard } from './MovieCard';
import { OptimizedImage } from './OptimizedImage';
import { RunningRabbitLoader } from './RunningRabbitLoader';

interface SingleDetailViewProps {
  catalog: MediaItem[];
  item: MediaItem;
  initialEpisode?: number;
  initialOpenDownloads?: boolean;
  cardStyle?: HomeCardStyle;
  currentUser: User | null;
  isGuest?: boolean;
  onOpenLogin: () => void;
  onSelectMedia: (item: MediaItem, openDownloads?: boolean) => void;
  onApplyFilter: (partial: Partial<CatalogFilterState>) => void;
  onNavigateHome: () => void;
  onNavigateBack?: () => void;
  onSelectEpisode?: (episode: number) => void;
  onOpenTrailer: (item: MediaItem) => void;
  onOpenPlayer: (item: MediaItem, episodeNumber?: number, serverIndex?: number) => void;
  isInWatchlist: boolean;
  onToggleWatchlist: (item: MediaItem) => void;
  onNotify: (message: string) => void;
  watchlistIds: string[];
}

type DetailTab = 'watch' | 'seasons' | 'franchise' | 'cast';

const STAR_LABELS: Record<number, string> = {
  1: 'ضعيف',
  2: 'مقبول',
  3: 'جيد — ممتع',
  4: 'جيد جداً — يستحق المشاهدة',
  5: 'ممتاز — عمل رائع',
};

export function SingleDetailView({
  catalog,
  item,
  initialEpisode,
  initialOpenDownloads = false,
  cardStyle = 'clean',
  currentUser,
  isGuest = false,
  onOpenLogin,
  onSelectMedia,
  onApplyFilter,
  onNavigateHome,
  onNavigateBack,
  onSelectEpisode,
  onOpenTrailer,
  onOpenPlayer,
  isInWatchlist,
  onToggleWatchlist,
  onNotify,
  watchlistIds,
}: SingleDetailViewProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('watch');
  const [showDownloads, setShowDownloads] = useState(initialOpenDownloads);
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);
  const [selectedEpisodeNumber, setSelectedEpisodeNumber] = useState<number>(
    initialEpisode || item.seasons?.[0]?.episodes?.[0]?.number || 1
  );
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showMobileSecondaryDetails, setShowMobileSecondaryDetails] = useState(false);

  // Firestore Star Rating State
  const [ratingsList, setRatingsList] = useState<MediaRatingRecord[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(true);
  const [ratingsPermissionError, setRatingsPermissionError] = useState(false);
  const [hoverStar, setHoverStar] = useState<number | null>(null);
  const [savingRating, setSavingRating] = useState(false);

  const cleanMediaId = sanitizeRatingMediaId(item.id);

  useEffect(() => {
    setActiveTab('watch');
    setShowDownloads(initialOpenDownloads);
    setSelectedSeasonIdx(0);
    setSelectedEpisodeNumber(initialEpisode || item.seasons?.[0]?.episodes?.[0]?.number || 1);
    setHoverStar(null);
    setShowMobileSecondaryDetails(false);
    if (initialOpenDownloads) {
      setTimeout(() => {
        document.getElementById('watch-download-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  }, [item.id, initialEpisode, initialOpenDownloads]);

  const [dbRevision, setDbRevision] = useState(0);

  useEffect(() => {
    return subscribeActiveDatabaseChange(() => {
      setDbRevision((n) => n + 1);
    });
  }, []);

  // Real-time Firestore listener for media star ratings
  useEffect(() => {
    setRatingsLoading(true);
    setRatingsPermissionError(false);
    const ratingsPath = 'ratings';
    const q = query(collection(getActiveDatabase(), ratingsPath), where('mediaId', '==', cleanMediaId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => {
            const raw = d.data() as Partial<MediaRatingRecord> & {
              createdAt?: { toMillis?: () => number };
              updatedAt?: { toMillis?: () => number };
            };
            return {
              id: String(raw.id || d.id),
              mediaId: String(raw.mediaId || cleanMediaId),
              userId: String(raw.userId || ''),
              stars: Math.min(5, Math.max(1, Math.round(Number(raw.stars) || 0))),
              createdAtMs:
                raw.createdAt && typeof raw.createdAt.toMillis === 'function'
                  ? raw.createdAt.toMillis()
                  : 0,
              updatedAtMs:
                raw.updatedAt && typeof raw.updatedAt.toMillis === 'function'
                  ? raw.updatedAt.toMillis()
                  : 0,
            } as MediaRatingRecord;
          })
          .filter((r) => r.stars >= 1 && r.stars <= 5);
        setRatingsList(list);
        setRatingsLoading(false);
      },
      (error) => {
        setRatingsLoading(false);
        const msg = error instanceof Error ? error.message.toLowerCase() : '';
        if (msg.includes('permission')) {
          setRatingsPermissionError(true);
        }
        try {
          handleFirestoreError(error, OperationType.LIST, ratingsPath);
        } catch {
          // Keep page interactive if rules are not yet deployed or offline
        }
      }
    );

    return () => unsubscribe();
  }, [cleanMediaId, dbRevision]);

  const ratingCount =
    ratingsList.length > 0 ? ratingsList.length : ratingsLoading ? item.communityRating?.count || 0 : 0;
  const averageStars =
    ratingsList.length > 0
      ? ratingsList.reduce((sum, r) => sum + r.stars, 0) / ratingsList.length
      : ratingsLoading
      ? item.communityRating?.average || 0
      : 0;
  const userRatingRecord = currentUser
    ? ratingsList.find((r) => r.userId === currentUser.uid)
    : undefined;
  const userStars = userRatingRecord?.stars || 0;
  const displayedStarValue = hoverStar ?? userStars;

  const seasons = item.seasons || [];
  const activeSeason = seasons[selectedSeasonIdx];
  const allEpisodes = activeSeason?.episodes || seasons[0]?.episodes || [];
  const activeEpisodeObj = allEpisodes.find((e) => e.number === selectedEpisodeNumber);
  const itemServers = Array.isArray(item.servers) ? item.servers : [];
  const itemGenres = Array.isArray(item.genres) ? item.genres : [];
  const itemCategories = Array.isArray(item.categories) ? item.categories : [];
  const itemDownloads = Array.isArray(item.downloads) ? item.downloads : [];
  const activeServers =
    activeEpisodeObj?.servers && activeEpisodeObj.servers.length > 0
      ? activeEpisodeObj.servers
      : itemServers;
  const dedicatedShortUrl = resolveDisplayShortUrl(
    item,
    allEpisodes.length > 0 ? selectedEpisodeNumber : undefined
  );

  const franchiseItems = (item.franchiseIds || [])
    .map((id) => catalog.find((c) => c.id === id))
    .filter((c): c is MediaItem => Boolean(c));

  const relatedItems = catalog
    .filter(
      (c) =>
        c.id !== item.id &&
        (c.kind === item.kind || (c.genres || []).some((g) => itemGenres.includes(g)))
    )
    .slice(0, 6);

  const handleCopyShortUrl = async () => {
    try {
      await navigator.clipboard.writeText(dedicatedShortUrl);
    } catch {
      // Clipboard fallback ignored cleanly in sandboxed frames
    }
    setCopiedUrl(true);
    onNotify('تم نسخ الرابط المخصص بنجاح');
    setTimeout(() => setCopiedUrl(false), 2400);
  };

  const handleWebShare = async () => {
    const shareUrl =
      dedicatedShortUrl || (typeof window !== 'undefined' ? window.location.href : '');
    const shareTitle =
      allEpisodes.length > 0 && activeEpisodeObj
        ? `${item.title} — الحلقة ${String(selectedEpisodeNumber).padStart(2, '0')}`
        : item.title;
    const shareText = `${shareTitle} — شاهد الآن على RahaL TV`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        onNotify('تمت مشاركة العمل بنجاح');
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        // Fallback to clipboard when Web Share is unavailable or restricted in embedded frames
      }
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${shareTitle}\n${shareUrl}`);
      }
    } catch {
      // Clipboard fallback ignored
    }
    onNotify('تم نسخ عنوان ورابط العمل للمشاركة');
  };

  const handleSocialShare = async (platform: string) => {
    const shareText = `${item.title} — شاهد الآن على RahaL TV: ${dedicatedShortUrl}`;
    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      // Clipboard fallback ignored
    }
    onNotify(`تم نسخ رابط المشاركة لـ ${platform}`);
  };

  const handleDownload = (quality: string, host: string) => {
    onNotify(`بدأ تجهيز رابط التحميل (${quality}) عبر ${host}`);
  };

  const handleRateStars = async (stars: number) => {
    if (!currentUser) {
      onNotify(
        isGuest
          ? 'أنت تتصفح كضيف — سجّل الدخول بحسابك لحفظ تقييمك ومشاركته'
          : 'يرجى تسجيل الدخول أولاً لتقييم العمل وحفظ تقييمك'
      );
      onOpenLogin();
      return;
    }
    if (savingRating) return;
    setSavingRating(true);
    try {
      const saved = await submitMediaRatingToFirestore(item.id, currentUser.uid, stars);
      setRatingsPermissionError(false);
      onNotify(`تم حفظ تقييمك (${saved} من 5 نجوم) وتحديث متوسط تقييم العرض`);
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('permission')) {
        setRatingsPermissionError(true);
        onNotify(
          'تعذر حفظ التقييم: يلزم نشر قواعد firestore.rules لمجموعة ratings في Firebase Console (يمكنك نسخها من لوحة التحكم → إعدادات المنصة).'
        );
      } else {
        onNotify('تعذر حفظ التقييم حالياً، يرجى المحاولة لاحقاً');
      }
    } finally {
      setSavingRating(false);
    }
  };

  const handleClearMyRating = async () => {
    if (!currentUser || !userStars || savingRating) return;
    setSavingRating(true);
    try {
      await deleteMediaRatingFromFirestore(item.id, currentUser.uid);
      onNotify('تم إزالة تقييمك وتحديث متوسط التقييم');
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('permission')) {
        onNotify('تعذر حذف التقييم: صلاحيات Firestore لمجموعة ratings غير منشورة بعد.');
      } else {
        onNotify('تعذر إزالة التقييم حالياً');
      }
    } finally {
      setSavingRating(false);
    }
  };

  return (
    <div className="pb-10 overflow-x-hidden">
      {/* 1. Compact Single Hero Head */}
      <section className="relative overflow-hidden border-b border-white/[0.08] bg-[#0c1821]">
        <OptimizedImage
          key={`${item.id}::${getBackdropUrl(item, 'backdrop_detail')}`}
          src={getBackdropUrl(item, 'backdrop_detail')}
          fallbackSrc={FALLBACK_BACKDROP}
          alt={item.title}
          slot="backdrop_detail"
          priority
          loading="eager"
          className="!absolute inset-0 h-full w-full opacity-90"
          imgClassName="object-cover object-center"
        />
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-[#06131c] via-[#06131c]/30 to-black/15" />
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-l from-[#06131c]/70 via-[#06131c]/20 to-transparent" />

        <div className="relative z-10 mx-auto max-w-[1440px] px-3.5 sm:px-6 lg:px-8 pt-20 pb-5 md:pt-24 md:pb-7">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            {/* Breadcrumb & Page Title */}
            <div className="min-w-0 flex-1 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                {onNavigateBack && (
                  <button
                    type="button"
                    onClick={onNavigateBack}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e]/90 hover:bg-[#D92321] border border-white/15 px-3 py-1.5 text-xs font-extrabold text-white transition-colors cursor-pointer shrink-0"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>رجوع</span>
                  </button>
                )}
                <nav className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-[#b7c9ef]">
                  <button
                    type="button"
                    onClick={onNavigateHome}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    RahaL TV
                  </button>
                {itemCategories[0] && (
                  <>
                    <ChevronLeft className="w-3.5 h-3.5 text-white/40" />
                    <button
                      type="button"
                      onClick={() => onApplyFilter({ category: itemCategories[0] })}
                      className="hover:text-white transition-colors cursor-pointer"
                    >
                      {itemCategories[0]}
                    </button>
                  </>
                )}
                {itemCategories[1] && (
                  <>
                    <ChevronLeft className="w-3.5 h-3.5 text-white/40" />
                    <button
                      type="button"
                      onClick={() => onApplyFilter({ category: itemCategories[1] })}
                      className="hover:text-white transition-colors cursor-pointer"
                    >
                      {itemCategories[1]}
                    </button>
                  </>
                )}
                <ChevronLeft className="w-3.5 h-3.5 text-white/40" />
                <span className="text-white">{item.title}</span>
              </nav>
              </div>

              <h1
                style={{ fontSize: 'var(--rtv-detail-title-size, 20px)' }}
                className="font-display font-extrabold text-white leading-snug"
              >
                {item.title} بجودة عالية
              </h1>
              {item.tagline && (
                <p className="mt-1.5 max-w-3xl text-xs sm:text-sm font-medium text-[#b7c9ef] line-clamp-2 leading-relaxed">
                  {item.tagline}
                </p>
              )}
            </div>

            {/* Live Site Viewer Rating Badge */}
            <div className="w-full md:w-auto flex items-center md:self-center shrink-0">
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById('member-star-rating-card')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
                className="flex w-full md:w-auto items-center justify-between md:justify-start gap-3 rounded-2xl bg-[#1a242e]/95 border border-[#4CAF50]/35 hover:border-[#f9c400]/60 px-3.5 py-2.5 md:px-4 md:py-3 shadow-xl backdrop-blur-md transition-colors text-right cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 md:h-11 md:w-11 shrink-0 items-center justify-center rounded-xl bg-[#4CAF50]/20 border border-[#4CAF50]/40 text-[#f9c400]">
                    <Star className="w-5 h-5 md:w-6 md:h-6 fill-current" />
                  </div>
                  <div className="min-w-0">
                    <div dir="ltr" className="inline-flex items-baseline gap-1">
                      <span className="font-latin text-xl md:text-2xl font-black text-white tabular-nums">
                        {ratingCount > 0 ? averageStars.toFixed(1) : '—'}
                      </span>
                      <span className="font-latin text-xs font-bold text-[#b7c9ef]">/ 5</span>
                    </div>
                    <p className="text-[11px] font-bold text-[#b7c9ef] truncate">
                      {ratingCount > 0
                        ? `${ratingCount} ${ratingCount === 1 ? 'تقييم المشاهدين' : 'تقييمات المشاهدين'}`
                        : 'تقييم المشاهدين'}
                    </p>
                  </div>
                </div>
                <span className="md:hidden inline-flex items-center gap-1 rounded-xl bg-[#4CAF50]/15 border border-[#4CAF50]/35 px-2.5 py-1.5 text-[11px] font-extrabold text-[#4CAF50] shrink-0">
                  <Star className="w-3.5 h-3.5 fill-current text-[#f9c400]" />
                  <span>{userStars > 0 ? 'تقييمك ✓' : 'قيّم الآن'}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Balanced Equal-Height 3-Column Layout (RTL: Right Poster | Center Story & Details | Left Watch, Download & Rating) */}
      <section className="relative z-20 mx-auto max-w-[1440px] px-3.5 sm:px-6 lg:px-8 mt-5 sm:mt-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5 lg:gap-6 items-stretch">
          {/* Right Column: Poster Rectangle + Watchlist inside a full-height matching frame */}
          <div className="md:col-span-4 lg:col-span-3 order-1 flex flex-col">
            <div className="flex flex-1 flex-col justify-between gap-3.5 rounded-2xl sm:rounded-3xl bg-[#0c1821] border border-white/[0.08] p-3.5 shadow-xl">
              <div className="relative aspect-[2/3] w-full max-w-[240px] sm:max-w-[270px] mx-auto md:max-w-none overflow-hidden rounded-2xl border border-white/15 bg-[#08121a] shadow-[0_18px_40px_rgba(0,0,0,0.6)]">
                {/* Diagonal Quality Ribbon */}
                <div className="moov-ribbon bg-[#D92321] py-1 text-[11px] font-black tracking-wider text-white font-latin uppercase">
                  {item.quality}
                </div>

                <OptimizedImage
                  key={`${item.id}::${getPosterUrl(item, 'detail_poster')}`}
                  src={getPosterUrl(item, 'detail_poster')}
                  fallbackSrc={FALLBACK_POSTER}
                  alt={item.title}
                  slot="detail_poster"
                  priority
                  loading="eager"
                  className="h-full w-full"
                  imgClassName="object-cover object-top"
                />
                <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-[#06131c]/85 via-transparent to-black/15" />

                {/* Centered Frosted Trailer Button (.single-trailer-button) */}
                <button
                  type="button"
                  onClick={() => onOpenTrailer(item)}
                  className="group absolute inset-0 z-20 m-auto flex h-14 w-14 flex-col items-center justify-center rounded-full bg-white/20 border border-white/40 text-white backdrop-blur-md shadow-2xl hover:bg-[#D92321] hover:border-[#D92321] hover:scale-110 transition-all cursor-pointer"
                  aria-label="تشغيل الإعلان الرسمي"
                >
                  <Play className="w-6 h-6 fill-current translate-x-0.5" />
                </button>

                <button
                  type="button"
                  onClick={() => onOpenTrailer(item)}
                  className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/15 px-3.5 py-1.5 text-xs font-bold text-white/95 hover:bg-[#D92321] hover:border-[#D92321] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>تشغيل الإعلان</span>
                </button>
              </div>

              {/* Watchlist & Web Share Buttons */}
              <div className="w-full max-w-[240px] sm:max-w-[270px] mx-auto md:max-w-none flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => onToggleWatchlist(item)}
                  className={`w-full min-h-[46px] flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold border transition-all cursor-pointer ${
                    isInWatchlist
                      ? 'bg-[#4CAF50]/20 border-[#4CAF50] text-[#4CAF50] shadow-[0_8px_20px_rgba(76,175,80,0.18)]'
                      : 'bg-[#15222d] border-white/10 text-white hover:border-[#4CAF50] hover:text-[#4CAF50] hover:bg-[#1a2a36]'
                  }`}
                >
                  {isInWatchlist ? <Check className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                  <span>{isInWatchlist ? 'مُضاف إلى قائمتي' : 'إضافة إلى قائمتي'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleWebShare()}
                  aria-label={`مشاركة ${item.title}`}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-2xl bg-[#15222d] border border-white/10 px-4 py-2.5 text-sm font-extrabold text-white hover:border-[#D92321] hover:bg-[#D92321]/15 transition-all cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-[#D92321]" />
                  <span>مشاركة</span>
                </button>
              </div>
            </div>
          </div>

          {/* Center Column: Story & Symmetrical 8-Tile Details */}
          <div className="md:col-span-8 lg:col-span-6 order-3 lg:order-2 flex flex-col gap-4">
            {/* Story Block (.single-story) */}
            <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 shadow-xl">
              <h2 className="font-display text-lg font-extrabold text-white mb-2.5 flex items-center gap-2">
                <span className="h-5 w-1.5 rounded-full bg-[#D92321]" />
                قصة العرض
              </h2>
              <p className="text-sm sm:text-base leading-relaxed text-[#b7c9ef]">{item.story}</p>
            </div>

            {/* Clickable Details Grid (.single-details) - Collapsible on mobile, full grid on md+ */}
            <div className="flex-1 flex flex-col justify-between rounded-3xl bg-[#0c1821] border border-white/[0.08] p-4 md:p-5 shadow-xl">
              <div>
                <div className="flex items-center justify-between gap-2 md:mb-4">
                  <h2 className="font-display text-base md:text-lg font-extrabold text-white flex items-center gap-2">
                    <span className="h-5 w-1.5 rounded-full bg-[#f9c400]" />
                    <span>تفاصيل العرض</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowMobileSecondaryDetails((prev) => !prev)}
                    className="md:hidden inline-flex items-center gap-1.5 rounded-xl bg-[#15222d] border border-white/10 px-3 min-h-[40px] py-1.5 text-xs font-extrabold text-[#b7c9ef] cursor-pointer"
                  >
                    <span>{showMobileSecondaryDetails ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}</span>
                    {showMobileSecondaryDetails ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className={`${showMobileSecondaryDetails ? 'grid mt-3' : 'hidden'} md:grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm`}>
                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#15222d]/85 border border-white/[0.05] px-3.5 py-3">
                    <span className="flex items-center gap-2 text-xs text-[#b7c9ef] shrink-0">
                      <Layers className="w-4 h-4 text-[#D92321]" />
                      تصنيف العرض
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onApplyFilter({ category: itemCategories[1] || itemCategories[0] || '' })
                      }
                      className="font-bold text-xs sm:text-sm text-white hover:text-[#D92321] truncate cursor-pointer"
                    >
                      {itemCategories[1] || itemCategories[0] || 'غير محدد'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#15222d]/85 border border-white/[0.05] px-3.5 py-3">
                    <span className="flex items-center gap-2 text-xs text-[#b7c9ef] shrink-0">
                      <Film className="w-4 h-4 text-[#D92321]" />
                      نوع العرض
                    </span>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {itemGenres.slice(0, 3).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => onApplyFilter({ genre: g })}
                          className="font-bold text-xs sm:text-sm text-white hover:text-[#D92321] cursor-pointer"
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#15222d]/85 border border-white/[0.05] px-3.5 py-3">
                    <span className="flex items-center gap-2 text-xs text-[#b7c9ef] shrink-0">
                      <Calendar className="w-4 h-4 text-[#D92321]" />
                      سنة العرض
                    </span>
                    <button
                      type="button"
                      onClick={() => onApplyFilter({ year: item.year })}
                      className="font-latin font-bold text-xs sm:text-sm text-white hover:text-[#D92321] cursor-pointer"
                    >
                      {item.year}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#15222d]/85 border border-white/[0.05] px-3.5 py-3">
                    <span className="flex items-center gap-2 text-xs text-[#b7c9ef] shrink-0">
                      <Languages className="w-4 h-4 text-[#D92321]" />
                      لغة العرض
                    </span>
                    <button
                      type="button"
                      onClick={() => onApplyFilter({ language: item.language })}
                      className="font-bold text-xs sm:text-sm text-white hover:text-[#D92321] truncate cursor-pointer"
                    >
                      {item.language}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#15222d]/85 border border-white/[0.05] px-3.5 py-3">
                    <span className="flex items-center gap-2 text-xs text-[#b7c9ef] shrink-0">
                      <Tv className="w-4 h-4 text-[#D92321]" />
                      جودة العرض
                    </span>
                    <button
                      type="button"
                      onClick={() => onApplyFilter({ quality: item.quality })}
                      className="font-latin font-bold text-xs sm:text-sm text-[#f9c400] hover:underline cursor-pointer"
                    >
                      {item.quality}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#15222d]/85 border border-white/[0.05] px-3.5 py-3">
                    <span className="flex items-center gap-2 text-xs text-[#b7c9ef] shrink-0">
                      <Globe className="w-4 h-4 text-[#D92321]" />
                      بلد العرض
                    </span>
                    <button
                      type="button"
                      onClick={() => onApplyFilter({ country: item.country })}
                      className="font-bold text-xs sm:text-sm text-white hover:text-[#D92321] truncate cursor-pointer"
                    >
                      {item.country}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#15222d]/85 border border-white/[0.05] px-3.5 py-3">
                    <span className="flex items-center gap-2 text-xs text-[#b7c9ef] shrink-0">
                      <Clock className="w-4 h-4 text-[#D92321]" />
                      مدة العرض
                    </span>
                    <span className="font-bold text-xs sm:text-sm text-white">{item.duration}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById('member-star-rating-card')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }
                    className="flex items-center justify-between gap-2 rounded-2xl bg-[#15222d]/85 border border-white/[0.05] hover:border-[#f9c400]/40 px-3.5 py-3 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2 text-xs text-[#b7c9ef] shrink-0">
                      <Star className="w-4 h-4 text-[#f9c400] fill-[#f9c400]" />
                      تقييم الأعضاء
                    </span>
                    <span className="font-bold text-xs sm:text-sm text-[#f9c400]">
                      {ratingCount > 0 ? (
                        <span dir="ltr" className="font-latin inline-block">
                          {averageStars.toFixed(1)} / 5 ({ratingCount})
                        </span>
                      ) : (
                        'قيّم الآن'
                      )}
                    </span>
                  </button>
                </div>
              </div>

              {/* Balanced Bottom Info Bar inside Details Card */}
              <div className={`${showMobileSecondaryDetails ? 'flex' : 'hidden'} md:flex mt-4 pt-3 border-t border-white/[0.06] flex-wrap items-center justify-between gap-2 text-xs text-[#b7c9ef]`}>
                <span className="font-latin font-bold text-white/80 truncate">{item.englishTitle}</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold">
                  <span className="h-2 w-2 rounded-full bg-[#4CAF50]" />
                  <span>متوفر للمشاهدة المباشرة والتحميل</span>
                </span>
              </div>
            </div>
          </div>

          {/* Left Side Column: Upgraded Watch & Download Box + Interactive Firestore Star Rating Card */}
          <aside className="md:col-span-12 lg:col-span-3 order-2 lg:order-3 flex flex-col gap-4">
            {/* Watch & Download Professional Action Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#10202c] to-[#0b1620] border border-white/[0.1] p-4 sm:p-5 space-y-3.5 shadow-[0_20px_45px_rgba(0,0,0,0.5)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#D92321] via-[#f9c400] to-[#4CAF50]" />

              <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.07]">
                <h2 className="font-display text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                  <span className="h-4 w-1.5 rounded-full bg-[#D92321]" />
                  <span>المشاهدة والتحميل</span>
                </h2>
                <span className="font-latin rounded-lg bg-[#162531] border border-white/10 px-2.5 py-0.5 text-[11px] font-extrabold text-[#f9c400]">
                  {activeServers.length} سيرفر
                </span>
              </div>

              {/* Polished Primary Watch & Download Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpenPlayer(item, selectedEpisodeNumber)}
                  className="group relative flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-l from-[#E50914] via-[#d91e23] to-[#b30c14] border border-white/20 px-3.5 py-3 text-right text-white shadow-[0_12px_28px_rgba(229,9,20,0.35)] hover:shadow-[0_14px_34px_rgba(229,9,20,0.5)] hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 border border-white/20 shadow-inner group-hover:scale-105 transition-transform">
                      <Play className="w-5 h-5 fill-current translate-x-0.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-black leading-tight truncate">
                        {allEpisodes.length > 0
                          ? `مشاهدة الحلقة ${String(selectedEpisodeNumber).padStart(2, '0')}`
                          : 'مشاهدة الآن'}
                      </p>
                      <p className="text-[11px] font-bold text-white/85 truncate mt-0.5">
                        سيرفرات متعددة • تشغيل فوري
                      </p>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 shrink-0 text-white/85 group-hover:-translate-x-0.5 transition-transform" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowDownloads((prev) => !prev)}
                  className="group relative flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-l from-[#10b981] via-[#16a34a] to-[#15803d] border border-white/20 px-3.5 py-3 text-right text-white shadow-[0_12px_28px_rgba(16,185,129,0.28)] hover:shadow-[0_14px_34px_rgba(16,185,129,0.42)] hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 border border-white/20 shadow-inner group-hover:scale-105 transition-transform">
                      <Download className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-black leading-tight truncate">
                        {showDownloads ? 'إخفاء روابط التحميل' : 'تحميل الآن'}
                      </p>
                      <p className="text-[11px] font-bold text-white/85 truncate mt-0.5">
                        {itemDownloads.length > 0
                          ? `${itemDownloads.length} روابط مباشرة • HD`
                          : 'روابط تحميل سريعة ومباشرة'}
                      </p>
                    </div>
                  </div>
                  {showDownloads ? (
                    <ChevronUp className="w-4 h-4 shrink-0 text-white/90" />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0 text-white/90" />
                  )}
                </button>
              </div>

              {/* Official Trailer Quick-Launch Button */}
              <button
                type="button"
                onClick={() => onOpenTrailer(item)}
                className="group flex w-full items-center justify-between gap-2.5 rounded-2xl bg-[#15222d] hover:bg-[#1b2c39] border border-white/10 hover:border-[#f9c400]/50 px-3.5 py-2.5 text-right text-white transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f9c400]/15 border border-[#f9c400]/30 text-[#f9c400] group-hover:bg-[#f9c400] group-hover:text-[#06131c] transition-colors">
                    <Film className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-extrabold truncate">تشغيل الإعلان الرسمي</span>
                    <span className="block text-[10px] font-bold text-[#b7c9ef] truncate">
                      {item.trailerDuration ? `تريلر • ${item.trailerDuration}` : 'مشاهدة العرض الترويجي'}
                    </span>
                  </span>
                </span>
                <Play className="w-3.5 h-3.5 fill-current text-[#f9c400] shrink-0" />
              </button>

              {/* Inline Download Links Panel inside Left Column */}
              {showDownloads && (
                <div className="rounded-2xl bg-[#15222d] border border-[#10b981]/35 p-3 space-y-2">
                  <p className="text-xs font-extrabold text-white">روابط التحميل المباشرة:</p>
                  {itemDownloads.length === 0 ? (
                    <p className="text-[11px] text-[#b7c9ef]">لا توجد روابط تحميل متاحة حاليًا.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pl-0.5">
                      {itemDownloads.map((dl) =>
                        dl.url && /^https?:\/\//i.test(dl.url) ? (
                          <a
                            key={dl.id}
                            href={dl.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-shield-allow="true"
                            onClick={() => handleDownload(dl.quality, dl.host)}
                            className="flex items-center justify-between gap-2 rounded-xl bg-[#0b1620] border border-white/10 px-3 py-2 text-right hover:border-[#10b981] transition-colors cursor-pointer"
                          >
                            <div className="min-w-0">
                              <p className="font-latin text-xs font-extrabold text-white truncate">
                                {dl.quality}
                              </p>
                              <p className="text-[10px] text-[#b7c9ef] truncate">
                                {dl.host} • {dl.format}
                              </p>
                            </div>
                            <Download className="w-3.5 h-3.5 text-[#10b981] shrink-0" />
                          </a>
                        ) : (
                          <button
                            key={dl.id}
                            type="button"
                            onClick={() => handleDownload(dl.quality, dl.host)}
                            className="flex w-full items-center justify-between gap-2 rounded-xl bg-[#0b1620] border border-white/10 px-3 py-2 text-right hover:border-[#10b981] transition-colors cursor-pointer"
                          >
                            <div className="min-w-0">
                              <p className="font-latin text-xs font-extrabold text-white truncate">
                                {dl.quality}
                              </p>
                              <p className="text-[10px] text-[#b7c9ef] truncate">
                                {dl.host} • {dl.format}
                              </p>
                            </div>
                            <Download className="w-3.5 h-3.5 text-[#10b981] shrink-0" />
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Quick Server Launchers inside Left Side Panel */}
              {activeServers.length > 0 && (
                <div className="pt-2.5 border-t border-white/[0.07] space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#b7c9ef]">
                    <span className="flex items-center gap-1.5 text-white">
                      <Server className="w-3.5 h-3.5 text-[#D92321]" />
                      سيرفرات سريعة
                    </span>
                    <span className="text-[#b7c9ef]">تشغيل مباشر</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {activeServers.slice(0, 4).map((srv, idx) => {
                      const cleanQ =
                        String(srv.quality || item.quality || 'HD')
                          .replace(/مستورد|embed/gi, '')
                          .trim() || 'HD';
                      const shortName = formatShortServerName(srv.name, idx, srv.url);
                      return (
                        <button
                          key={srv.id || idx}
                          type="button"
                          onClick={() => onOpenPlayer(item, selectedEpisodeNumber, idx)}
                          className="group flex items-center justify-between gap-1.5 rounded-xl bg-[#15222d] border border-white/[0.08] px-2.5 min-h-[44px] md:min-h-0 py-2 text-[11px] font-bold text-white hover:border-[#D92321]/80 hover:bg-[#D92321]/15 transition-all cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5 min-w-0 truncate">
                            <Play className="w-2.5 h-2.5 text-[#D92321] fill-current shrink-0" />
                            <span className="truncate">{shortName}</span>
                          </span>
                          <span className="font-latin text-[10px] font-black text-[#f9c400] shrink-0">
                            {cleanQ}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Firestore Star Rating Card (Fills remaining height to match Right & Center columns) */}
            <div
              id="member-star-rating-card"
              className="flex-1 flex flex-col justify-between rounded-3xl bg-[#0c1821] border border-white/[0.08] p-4 sm:p-5 shadow-xl gap-3"
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
                <h2 className="font-display text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                  <span className="h-4 w-1.5 rounded-full bg-[#f9c400]" />
                  <span>تقييم المشاهدين</span>
                </h2>
                <div className="inline-flex items-center gap-1 rounded-lg bg-[#15222d] border border-[#f9c400]/25 px-2.5 py-1">
                  <Star className="w-3.5 h-3.5 text-[#f9c400] fill-[#f9c400]" />
                  <span dir="ltr" className="inline-flex items-baseline gap-1">
                    <span className="font-latin text-xs font-black text-white">
                      {ratingCount > 0 ? averageStars.toFixed(1) : '—'}
                    </span>
                    <span className="font-latin text-[10px] font-bold text-[#b7c9ef]">/ 5</span>
                  </span>
                </div>
              </div>

              {/* Interactive 5-Star Picker */}
              <div className="flex flex-col items-center justify-center gap-2 py-1">
                <div
                  dir="ltr"
                  onMouseLeave={() => setHoverStar(null)}
                  className="flex items-center justify-center gap-1.5"
                >
                  {[1, 2, 3, 4, 5].map((starValue) => {
                    const isActive = displayedStarValue >= starValue;
                    return (
                      <button
                        key={starValue}
                        type="button"
                        disabled={savingRating}
                        onMouseEnter={() => setHoverStar(starValue)}
                        onClick={() => void handleRateStars(starValue)}
                        aria-label={`تقييم ${starValue} من 5 نجوم`}
                        className={`flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-xl border transition-all cursor-pointer disabled:opacity-60 ${
                          isActive
                            ? 'bg-[#f9c400]/15 border-[#f9c400]/50 scale-105 shadow-[0_0_14px_rgba(249,196,0,0.22)]'
                            : 'bg-[#15222d] border-white/[0.08] hover:border-[#f9c400]/40'
                        }`}
                      >
                        <Star
                          className={`w-5 h-5 transition-colors ${
                            isActive ? 'text-[#f9c400] fill-[#f9c400]' : 'text-white/30'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>

                <p className="text-[11px] font-bold text-[#b7c9ef] text-center min-h-[16px]">
                  {savingRating
                    ? 'جارٍ حفظ تقييمك...'
                    : hoverStar
                    ? STAR_LABELS[hoverStar]
                    : userStars > 0
                    ? `تقييمك المحفوظ: ${userStars} / 5 (${STAR_LABELS[userStars]})`
                    : 'اختر عدد النجوم لتقييم هذا العرض'}
                </p>

                {/* Thin Average Score Bar */}
                <div className="w-full space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#15222d]">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-[#f9c400] to-[#f59e0b] transition-all duration-500"
                      style={{ width: `${ratingCount > 0 ? (averageStars / 5) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-[#b7c9ef]">
                    <span>
                      {ratingsLoading ? (
                        <RunningRabbitLoader
                          variant="inline"
                          size="sm"
                          delayMs={120}
                          label="جارٍ تحميل التقييمات..."
                        />
                      ) : ratingsPermissionError ? (
                        'يلزم نشر قواعد مجموعة ratings في Firestore'
                      ) : ratingCount > 0 ? (
                        `مبني على ${ratingCount} ${ratingCount === 1 ? 'تقييم' : 'تقييمات'}`
                      ) : (
                        'كن أول من يقيّم هذا العرض'
                      )}
                    </span>
                    {ratingCount > 0 && (
                      <span className="font-latin text-[#f9c400]">
                        {Math.round((averageStars / 5) * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Auth Prompt or Remove Rating Action */}
              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                {!currentUser ? (
                  <button
                    type="button"
                    onClick={onOpenLogin}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#15222d] hover:bg-[#1c2c3a] border border-white/10 hover:border-[#f9c400]/45 px-3 py-2 text-xs font-extrabold text-white transition-colors cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5 text-[#f9c400]" />
                    <span>
                      {isGuest ? 'وضع الضيف: سجّل الدخول لحفظ تقييمك' : 'سجّل الدخول لحفظ تقييمك'}
                    </span>
                  </button>
                ) : userStars > 0 ? (
                  <div className="flex w-full items-center justify-between gap-2 text-[11px]">
                    <span className="font-bold text-[#4CAF50] flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      تم تسجيل تقييمك
                    </span>
                    <button
                      type="button"
                      disabled={savingRating}
                      onClick={() => void handleClearMyRating()}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#15222d] hover:bg-[#D92321]/20 border border-white/10 hover:border-[#D92321]/50 px-2.5 py-1 font-bold text-[#b7c9ef] hover:text-white transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>حذف</span>
                    </button>
                  </div>
                ) : (
                  <p className="w-full text-center text-[11px] font-bold text-[#b7c9ef]">
                    اضغط على أي نجمة لحفظ تقييمك في حسابك
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* 3. Interactive Single Tabs (.single-tab) */}
      <section id="watch-download-tabs" className="mx-auto max-w-[1440px] px-3.5 sm:px-6 lg:px-8 mt-6 sm:mt-8">
        <div className="rounded-2xl sm:rounded-3xl bg-[#0c1821] border border-white/[0.08] overflow-hidden">
          {/* Tab Switcher */}
          <div className="flex flex-nowrap overflow-x-auto no-scrollbar md:flex-wrap border-b border-white/[0.08] bg-[#1a242e]">
            <button
              type="button"
              onClick={() => setActiveTab('watch')}
              className={`inline-flex min-h-[46px] items-center gap-1.5 md:gap-2 px-4 py-3 md:px-6 md:py-4 text-xs md:text-sm font-extrabold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === 'watch'
                  ? 'bg-[#D92321] text-white'
                  : 'text-[#b7c9ef] hover:text-white hover:bg-white/5'
              }`}
            >
              <Play className="w-4 h-4" />
              <span>المشاهدة والتحميل</span>
            </button>

            {seasons.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('seasons')}
                className={`inline-flex min-h-[46px] items-center gap-1.5 md:gap-2 px-4 py-3 md:px-6 md:py-4 text-xs md:text-sm font-extrabold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeTab === 'seasons'
                    ? 'bg-[#D92321] text-white'
                    : 'text-[#b7c9ef] hover:text-white hover:bg-white/5'
                }`}
              >
                <Tv className="w-4 h-4" />
                <span>المواسم والحلقات</span>
              </button>
            )}

            {franchiseItems.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('franchise')}
                className={`inline-flex min-h-[46px] items-center gap-1.5 md:gap-2 px-4 py-3 md:px-6 md:py-4 text-xs md:text-sm font-extrabold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeTab === 'franchise'
                    ? 'bg-[#D92321] text-white'
                    : 'text-[#b7c9ef] hover:text-white hover:bg-white/5'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>سلاسل وأعمال مرتبطة</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('cast')}
              className={`inline-flex min-h-[46px] items-center gap-1.5 md:gap-2 px-4 py-3 md:px-6 md:py-4 text-xs md:text-sm font-extrabold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === 'cast'
                  ? 'bg-[#D92321] text-white'
                  : 'text-[#b7c9ef] hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>فريق العمل</span>
            </button>
          </div>

          {/* Tab Panel Content */}
          <div className="p-4 sm:p-6">
            {activeTab === 'watch' && (
              <div className="space-y-5">
                {/* Per-Episode Quick Selector Strip for Series */}
                {allEpisodes.length > 0 && (
                  <div className="rounded-2xl bg-[#101e29] border border-white/[0.08] p-3.5 sm:p-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-2">
                        <Tv className="w-4 h-4 text-[#f9c400]" />
                        <span>الحلقات المتاحة ({allEpisodes.length})</span>
                      </h3>
                      <span className="text-[11px] font-bold text-[#b7c9ef]">
                        اختر الحلقة لعرض سيرفرات المشاهدة الخاصة بها
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto md:max-h-none md:overflow-visible">
                      {allEpisodes.map((ep) => {
                        const isEpActive = ep.number === selectedEpisodeNumber;
                        const epSrvCount = ep.servers?.length || 0;
                        return (
                          <button
                            key={ep.number}
                            type="button"
                            onClick={() => {
                              setSelectedEpisodeNumber(ep.number);
                              onSelectEpisode?.(ep.number);
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 min-h-[42px] md:min-h-0 py-2 text-xs font-extrabold transition-all cursor-pointer ${
                              isEpActive
                                ? 'bg-[#D92321] border-[#ff5a58] text-white shadow-md'
                                : 'bg-[#1a242e] border-white/[0.08] text-[#b7c9ef] hover:text-white hover:border-[#D92321]/60'
                            }`}
                          >
                            <span>الحلقة {String(ep.number).padStart(2, '0')}</span>
                            {epSrvCount > 0 && (
                              <span
                                className={`font-latin rounded px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                                  isEpActive ? 'bg-black/25 text-white' : 'bg-[#0c1821] text-[#f9c400]'
                                }`}
                              >
                                {epSrvCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Compact Number + Quality Server Strip */}
                {activeServers.length > 0 && (
                  <div className="rounded-2xl bg-[#101e29] border border-white/[0.08] p-3.5 sm:p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-2">
                        <Server className="w-4 h-4 text-[#D92321]" />
                        <span>
                          سيرفرات المشاهدة
                          {allEpisodes.length > 0
                            ? ` — الحلقة ${String(selectedEpisodeNumber).padStart(2, '0')}`
                            : ''}{' '}
                          ({activeServers.length})
                        </span>
                      </h3>
                      <span className="text-[11px] font-bold text-[#b7c9ef]">اختر السيرفر للتشغيل</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                      {activeServers.map((srv, idx) => {
                        const cleanQ =
                          String(srv.quality || item.quality || 'HD')
                            .replace(/مستورد|embed/gi, '')
                            .trim() || 'HD';
                        const shortName = formatShortServerName(srv.name, idx, srv.url);
                        return (
                          <button
                            key={srv.id || idx}
                            type="button"
                            onClick={() => onOpenPlayer(item, selectedEpisodeNumber, idx)}
                            style={{ animationDelay: `${idx * 35}ms` }}
                            className="moov-server-card moov-server-enter group flex items-center justify-between gap-2 rounded-xl bg-[#1a242e]/90 border border-white/[0.08] px-3 min-h-[44px] md:min-h-0 py-2.5 transition-all duration-300 hover:border-[#D92321]/80 hover:bg-gradient-to-l hover:from-[#D92321]/25 hover:to-[#1a242e] hover:-translate-y-0.5 cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="font-latin flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#0c1821] border border-white/10 text-[11px] font-black text-white tabular-nums group-hover:bg-[#D92321] group-hover:border-[#D92321] transition-colors">
                                {idx + 1}
                              </span>
                              <span className="text-xs font-extrabold text-white truncate">
                                {shortName}
                              </span>
                            </span>

                            <span className="font-latin shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black text-[#f9c400]">
                              {cleanQ}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Expandable Download Quality Selector */}
                {showDownloads && (
                  <div className="rounded-2xl bg-[#1a242e] border border-[#4CAF50]/30 p-5 space-y-3">
                    <h3 className="text-sm font-extrabold text-white mb-2">
                      اختر جودة التحميل المناسبة لجهازك:
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {item.downloads.map((dl) =>
                        dl.url && /^https?:\/\//i.test(dl.url) ? (
                          <a
                            key={dl.id}
                            href={dl.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-shield-allow="true"
                            onClick={() => handleDownload(dl.quality, dl.host)}
                            className="flex items-center justify-between rounded-xl bg-[#0c1821] border border-white/10 px-4 py-3 text-right hover:border-[#4CAF50] transition-colors cursor-pointer"
                          >
                            <div>
                              <p className="font-latin text-sm font-extrabold text-white">
                                {dl.quality}
                              </p>
                              <p className="text-[11px] text-[#b7c9ef]">
                                {dl.host} • {dl.format}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-latin rounded-md bg-white/10 px-2 py-1 text-xs font-bold text-[#4CAF50]">
                                {dl.size}
                              </span>
                              <Download className="w-4 h-4 text-[#4CAF50]" />
                            </div>
                          </a>
                        ) : (
                          <button
                            key={dl.id}
                            type="button"
                            onClick={() => handleDownload(dl.quality, dl.host)}
                            className="flex items-center justify-between rounded-xl bg-[#0c1821] border border-white/10 px-4 py-3 text-right hover:border-[#4CAF50] transition-colors cursor-pointer"
                          >
                            <div>
                              <p className="font-latin text-sm font-extrabold text-white">
                                {dl.quality}
                              </p>
                              <p className="text-[11px] text-[#b7c9ef]">
                                {dl.host} • {dl.format}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-latin rounded-md bg-white/10 px-2 py-1 text-xs font-bold text-[#4CAF50]">
                                {dl.size}
                              </span>
                              <Download className="w-4 h-4 text-[#4CAF50]" />
                            </div>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Short URL & Social Share Row */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl bg-[#1a242e]/60 border border-white/[0.08] p-3.5 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
                    <span className="text-xs font-extrabold text-[#b7c9ef] whitespace-nowrap">
                      الرابط المختصر:
                    </span>
                    <div className="flex flex-1 min-w-0 items-center gap-2 rounded-xl bg-[#06131c] border border-white/10 px-3 py-1.5 sm:py-2">
                      <input
                        type="text"
                        readOnly
                        dir="ltr"
                        value={dedicatedShortUrl}
                        aria-label="الرابط المختصر للعرض"
                        className="font-latin w-full min-w-0 bg-transparent text-xs text-white/90 focus:outline-none text-left"
                      />
                      <button
                        type="button"
                        onClick={handleCopyShortUrl}
                        className={`inline-flex min-h-[38px] sm:min-h-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors shrink-0 cursor-pointer ${
                          copiedUrl
                            ? 'bg-[#4CAF50] text-white'
                            : 'bg-[#D92321] hover:bg-[#dc0e30] text-white'
                        }`}
                      >
                        {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedUrl ? 'تم النسخ' : 'نسخ'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                    <button
                      type="button"
                      onClick={() => void handleWebShare()}
                      className="inline-flex min-h-[40px] sm:min-h-0 items-center justify-center gap-1.5 rounded-xl bg-[#D92321] hover:bg-[#dc0e30] px-3.5 py-2 sm:py-1.5 text-xs font-extrabold text-white transition-colors cursor-pointer sm:ml-1"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>مشاركة</span>
                    </button>
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                      {['فيسبوك', 'إكس', 'تيليجرام', 'واتساب'].map((platform) => (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => handleSocialShare(platform)}
                          className="min-h-[40px] sm:min-h-0 rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 sm:py-1.5 text-xs font-bold text-[#b7c9ef] hover:border-[#D92321] hover:text-white transition-colors cursor-pointer"
                        >
                          {platform}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'seasons' && activeSeason && (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  {seasons.map((season, idx) => (
                    <button
                      key={season.seasonNumber}
                      type="button"
                      onClick={() => setSelectedSeasonIdx(idx)}
                      className={`rounded-xl px-4 py-2.5 text-xs font-extrabold transition-colors cursor-pointer ${
                        selectedSeasonIdx === idx
                          ? 'bg-[#D92321] text-white'
                          : 'bg-[#1a242e] text-[#b7c9ef] border border-white/10 hover:text-white'
                      }`}
                    >
                      {season.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {activeSeason.episodes.map((ep) => {
                    const epSrvCount = ep.servers?.length || 0;
                    return (
                      <button
                        key={ep.number}
                        type="button"
                        onClick={() => {
                          setSelectedEpisodeNumber(ep.number);
                          onSelectEpisode?.(ep.number);
                          onOpenPlayer(item, ep.number, 0);
                        }}
                        className="group flex items-center justify-between gap-3 rounded-2xl bg-[#1a242e] border border-white/[0.08] p-3.5 text-right hover:border-[#D92321] transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {ep.thumbnailUrl ? (
                            <div className="aspect-video w-16 shrink-0 rounded-lg overflow-hidden border border-white/10">
                              <OptimizedImage
                                src={ep.thumbnailUrl}
                                fallbackSrc={FALLBACK_BACKDROP}
                                alt={`الحلقة ${ep.number}`}
                                slot="episode_thumb"
                                loading="lazy"
                                className="h-full w-full"
                                imgClassName="object-cover"
                              />
                            </div>
                          ) : null}
                          <div className="min-w-0">
                            <p className="text-sm font-extrabold text-white group-hover:text-[#D92321] truncate">
                              الحلقة {String(ep.number).padStart(2, '0')}
                            </p>
                            <p className="text-[11px] text-[#b7c9ef] mt-0.5 truncate">
                              {ep.duration} • {ep.quality}
                              {epSrvCount > 0 ? ` • ${epSrvCount} سيرفر` : ''}
                            </p>
                          </div>
                        </div>
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0c1821] text-[#D92321] group-hover:bg-[#D92321] group-hover:text-white transition-colors">
                          <Play className="w-4 h-4 fill-current" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'franchise' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                {franchiseItems.map((rel) => (
                  <MovieCard
                    key={`${rel.id}::${rel.poster_url || rel.poster || ''}`}
                    item={rel}
                    onSelect={onSelectMedia}
                    isInWatchlist={watchlistIds.includes(rel.id)}
                    onToggleWatchlist={onToggleWatchlist}
                    variant={cardStyle}
                  />
                ))}
              </div>
            )}

            {activeTab === 'cast' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                {item.cast.map((actor) => (
                  <div
                    key={actor.name}
                    className="flex flex-col items-center rounded-2xl bg-[#1a242e]/70 border border-white/[0.07] p-3.5 sm:p-4 text-center"
                  >
                    {actor.avatarUrl ? (
                      <div className="mb-3 h-14 w-14 sm:h-16 sm:w-16 rounded-full overflow-hidden border-2 border-white/20 shadow-lg shrink-0">
                        <OptimizedImage
                          src={actor.avatarUrl}
                          alt={actor.name}
                          slot="cast_avatar"
                          loading="lazy"
                          className="h-full w-full"
                          imgClassName="object-cover object-top"
                        />
                      </div>
                    ) : (
                      <div className="mb-3 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#D92321] to-[#1a242e] border-2 border-white/20 text-base sm:text-lg font-black text-white shadow-lg">
                        {actor.initials}
                      </div>
                    )}
                    <p className="text-xs sm:text-sm font-extrabold text-white leading-snug">{actor.name}</p>
                    <p className="text-[11px] sm:text-xs text-[#b7c9ef] mt-1">{actor.role}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. Related Shows Grid (عروض ذات صلة) */}
      <section className="mx-auto max-w-[1440px] px-3.5 sm:px-6 lg:px-8 mt-10 sm:mt-12">
        <div className="mb-4 sm:mb-5">
          <h2 className="font-display text-lg sm:text-2xl font-extrabold text-white">عروض ذات صلة</h2>
          <p className="text-xs text-[#b7c9ef] mt-1">أعمال مشابهة قد تنال إعجابك</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {relatedItems.map((rel) => (
            <MovieCard
              key={`${rel.id}::${rel.poster_url || rel.poster || ''}`}
              item={rel}
              onSelect={onSelectMedia}
              isInWatchlist={watchlistIds.includes(rel.id)}
              onToggleWatchlist={onToggleWatchlist}
              variant={cardStyle}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
