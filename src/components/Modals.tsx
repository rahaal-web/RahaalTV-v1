import { CSSProperties, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Captions,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Film,
  Globe,
  History,
  LayoutDashboard,
  LogOut,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  RotateCw,
  Send,
  Server,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Tv,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  findTrailerInBrowser,
  isLikelyNonVideoWebsiteUrl,
} from '../lib/clientScraper';
import {
  buildTrailerSearchQueryUrl,
  parseTrailerPlaybackUrl,
} from '../lib/trailerUtils';
import { resolveDisplayShortUrl } from '../lib/permalink';
import {
  getFirebaseAuthErrorMessage,
  registerMemberWithEmailPassword,
  signInWithEmailPassword,
  signInWithGoogle,
} from '../lib/firebase';
import {
  buildPlayerThemeVars,
  formatShortServerName,
  loadStoredPlayerTheme,
  normalizePlayerTheme,
} from '../lib/playerTheme';
import {
  appendPopupShieldLog,
  loadStoredPopupShieldConfig,
  normalizePopupShieldConfig,
  resolveEffectiveShieldDecision,
  setActiveShieldPlayerContext,
} from '../lib/popupShield';
import {
  classifyAutoplayPlayError,
  computeFaultFailoverTransition,
  findNextAvailableServerIndex,
  LOAD_TIMEOUT_DIRECT_MS,
  LOAD_TIMEOUT_IFRAME_MS,
} from '../lib/serverFailover';
import { FALLBACK_BACKDROP, FALLBACK_POSTER } from '../lib/mediaFilters';
import {
  detectClientCapabilities,
  exitAnyFullscreen,
  getFullscreenElement,
  requestElementFullscreen,
  safeCopyToClipboard,
} from '../lib/browserCompat';
import { getBackdropUrl, getPosterUrl } from '../lib/mediaImages';
import { PlaybackRecordReason, recordRecentlyWatchedPlayback } from '../lib/recentlyWatched';
import {
  AdminPrivilegeRole,
  MediaItem,
  PlayerThemeConfig,
  PopupShieldConfig,
  PopupShieldHostRule,
  PopupShieldProfileMode,
  VisitorRequest,
} from '../types/media';
import { FooterTopic } from './Footer';
import { OptimizedImage } from './OptimizedImage';
import { RunningRabbitLoader } from './RunningRabbitLoader';

function useDialogAccessibility(
  active: boolean,
  onClose: () => void,
  allowEscape = true
) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (allowEscape && e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function') {
        window.setTimeout(() => prev.focus(), 0);
      }
    };
  }, [active, onClose, allowEscape]);
}

/* ---------------- Watchlist Modal ---------------- */
interface WatchlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: MediaItem[];
  onSelectMedia: (item: MediaItem) => void;
  onRemove: (item: MediaItem) => void;
  onOpenWatchHistory?: () => void;
}

export function WatchlistModal({
  isOpen,
  onClose,
  items,
  onSelectMedia,
  onRemove,
  onOpenWatchHistory,
}: WatchlistModalProps) {
  useDialogAccessibility(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="قائمتي للمشاهدة لاحقاً"
      data-rtv-focus-trap="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
    >
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl sm:rounded-3xl bg-[#0c1821] border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 bg-[#1a242e] px-4 py-3.5 sm:px-6 sm:py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <Bookmark className="w-5 h-5 text-[#4CAF50] shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-extrabold text-white truncate">
              قائمتي للمشاهدة لاحقًا ({items.length})
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenWatchHistory && (
              <button
                type="button"
                onClick={onOpenWatchHistory}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.06] hover:bg-[#E50914] border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors cursor-pointer"
              >
                <History className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">سجل المشاهدة</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-white/5 text-white hover:bg-[#D92321] cursor-pointer shrink-0"
              aria-label="إغلاق قائمتي"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[72vh] sm:max-h-[65vh] overflow-y-auto p-3.5 sm:p-5">
          {items.length === 0 ? (
            <div className="py-12 text-center">
              <Film className="w-12 h-12 mx-auto text-[#b7c9ef]/30 mb-3" />
              <p className="text-sm font-bold text-white mb-1">قائمتك فارغة حاليًا</p>
              <p className="text-xs text-[#b7c9ef]">
                اضغط على زر "أضافة الي قائمتي" داخل أي فيلم أو مسلسل لحفظه هنا.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2.5 sm:gap-4 rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-2.5 sm:p-3"
                >
                  <button
                    type="button"
                    onClick={() => onSelectMedia(item)}
                    className="flex items-center gap-3 sm:gap-3.5 text-right flex-1 min-w-0 cursor-pointer group"
                  >
                    <OptimizedImage
                      src={getPosterUrl(item, 'card_small')}
                      fallbackSrc={FALLBACK_POSTER}
                      alt={item.title}
                      slot="card_small"
                      loading="lazy"
                      className="h-18 w-14 rounded-xl shrink-0"
                      imgClassName="object-cover object-top"
                    />
                    <div className="min-w-0">
                      <h3 className="font-display text-sm font-bold text-white group-hover:text-[#D92321] truncate">
                        {item.title}
                      </h3>
                      <p className="text-[11px] sm:text-xs text-[#b7c9ef] mt-1 truncate">
                        {item.year} • {item.quality} • {item.duration}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(item)}
                    aria-label="إزالة من قائمتي"
                    className="inline-flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-white/5 text-[#b7c9ef] hover:bg-[#D92321] hover:text-white transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Trailer Modal ---------------- */
interface TrailerModalProps {
  item: MediaItem | null;
  playerTheme?: PlayerThemeConfig;
  popupShieldConfig?: PopupShieldConfig;
  onClose: () => void;
  onWatchFull: (item: MediaItem) => void;
}

const resolvedTrailerCache = new Map<string, string>();

export function TrailerModal({
  item,
  playerTheme,
  popupShieldConfig,
  onClose,
  onWatchFull,
}: TrailerModalProps) {
  const [playing, setPlaying] = useState(true);
  const [autoResolvedUrl, setAutoResolvedUrl] = useState<string>('');
  const [resolvingTrailer, setResolvingTrailer] = useState(false);

  const directParsed = item ? parseTrailerPlaybackUrl(item.trailerUrl) : null;
  const cachedOrAutoUrl = item
    ? autoResolvedUrl || resolvedTrailerCache.get(item.id) || ''
    : '';
  const parsedTrailer = directParsed || parseTrailerPlaybackUrl(cachedOrAutoUrl);

  const trailerShieldDecision = resolveEffectiveShieldDecision(
    parsedTrailer?.src,
    popupShieldConfig || loadStoredPopupShieldConfig()
  );

  useDialogAccessibility(Boolean(item), onClose);

  useEffect(() => {
    if (!item) {
      setAutoResolvedUrl('');
      setResolvingTrailer(false);
      return;
    }

    setPlaying(true);

    if (parseTrailerPlaybackUrl(item.trailerUrl)) {
      setAutoResolvedUrl('');
      setResolvingTrailer(false);
      return;
    }

    const cached = resolvedTrailerCache.get(item.id);
    if (cached) {
      setAutoResolvedUrl(cached);
      setResolvingTrailer(false);
      return;
    }

    let cancelled = false;
    setAutoResolvedUrl('');
    setResolvingTrailer(true);

    void findTrailerInBrowser({
      title: item.title,
      englishTitle: item.englishTitle,
      year: item.year,
      kind: item.kind,
    })
      .then((foundUrl) => {
        if (cancelled) return;
        const clean = String(foundUrl || '').trim();
        if (clean) {
          resolvedTrailerCache.set(item.id, clean);
          setAutoResolvedUrl(clean);
        }
      })
      .catch(() => {
        // Non-fatal; fallback preview stage remains active
      })
      .finally(() => {
        if (!cancelled) {
          setResolvingTrailer(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [item?.id, item?.trailerUrl, item?.title, item?.englishTitle, item?.year, item?.kind]);

  useEffect(() => {
    if (!item) return;
    setActiveShieldPlayerContext({
      serverHost: trailerShieldDecision.hostname || 'trailer',
      serverName: 'الإعلان الرسمي',
      mediaTitle: item.title,
      mode: trailerShieldDecision.mode,
    });
    return () => {
      setActiveShieldPlayerContext(null);
    };
  }, [item?.id, item?.title, trailerShieldDecision.hostname, trailerShieldDecision.mode]);

  if (!item) return null;

  const theme = normalizePlayerTheme(playerTheme || loadStoredPlayerTheme());
  const themeVars = buildPlayerThemeVars(theme);
  const externalTrailerHref =
    parsedTrailer?.watchUrl ||
    buildTrailerSearchQueryUrl({
      title: item.title,
      englishTitle: item.englishTitle,
      year: item.year,
      kind: item.kind,
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`الإعلان الرسمي: ${item.title}`}
      data-rtv-focus-trap="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
      style={themeVars}
    >
      <div className="fixed inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-4xl max-h-[94vh] max-h-[94dvh] flex flex-col border overflow-hidden"
        style={{
          backgroundColor: 'var(--pt-frame)',
          borderColor: 'var(--pt-accent-35)',
          borderRadius: 'var(--pt-radius)',
          boxShadow: 'var(--pt-shadow)',
        }}
      >
        <div
          className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-white/[0.08] shrink-0"
          style={{ backgroundColor: 'var(--pt-modal)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
              style={{
                backgroundColor: 'var(--pt-accent)',
                color: 'var(--pt-accent-contrast)',
              }}
            >
              <Film className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <span
                className="text-[10px] font-black tracking-wide block uppercase"
                style={{ color: 'var(--pt-accent)' }}
              >
                {theme.brandLabel} · TRAILER
              </span>
              <h3 className="font-display text-sm sm:text-base font-bold text-white truncate">
                {item.trailerLabel || `الإعلان الرسمي — ${item.title}`}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={externalTrailerHref}
              target="_blank"
              rel="noopener noreferrer"
              data-shield-allow="true"
              className="hidden md:inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 px-3 py-2 text-xs font-bold text-white/90 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{parsedTrailer ? 'فتح في يوتيوب' : 'بحث في يوتيوب'}</span>
            </a>
            <button
              type="button"
              onClick={() => onWatchFull(item)}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-extrabold transition-opacity hover:opacity-90 cursor-pointer"
              style={{
                backgroundColor: 'var(--pt-accent)',
                color: 'var(--pt-accent-contrast)',
              }}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>مشاهدة العمل كامل</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-white/[0.06] border border-white/10 text-white/85 hover:bg-white/15 hover:text-white transition-colors cursor-pointer shrink-0"
              aria-label="إغلاق الإعلان"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Clean Cinema 16:9 Trailer Stage */}
        <div className="w-full bg-black overflow-hidden">
          <div className="rtv-trailer-stage relative aspect-video w-full bg-black overflow-hidden">
          {parsedTrailer ? (
            parsedTrailer.kind === 'video' ? (
              <video
                src={parsedTrailer.src}
                controls
                autoPlay
                playsInline
                className="h-full w-full bg-black"
              />
            ) : (
              <iframe
                key={`${parsedTrailer.src}-${trailerShieldDecision.mode}`}
                src={parsedTrailer.src}
                title={item.trailerLabel || `الإعلان الرسمي: ${item.title}`}
                sandbox={trailerShieldDecision.sandboxAttr}
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope"
                className="h-full w-full border-0 bg-black"
              />
            )
          ) : resolvingTrailer ? (
            <div className="relative h-full w-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <OptimizedImage
                src={getBackdropUrl(item, 'backdrop_detail')}
                fallbackSrc={FALLBACK_BACKDROP}
                alt={item.title}
                slot="backdrop_detail"
                priority
                loading="eager"
                className="!absolute inset-0 h-full w-full opacity-35"
                imgClassName="object-cover"
              />
              <div className="relative z-10 flex flex-col items-center gap-3">
                <RunningRabbitLoader
                  variant="section"
                  size="md"
                  delayMs={100}
                  label="جاري جلب الإعلان الرسمي..."
                  sublabel={item.title}
                />
              </div>
            </div>
          ) : (
            <>
              <OptimizedImage
                src={getBackdropUrl(item, 'backdrop_detail')}
                fallbackSrc={FALLBACK_BACKDROP}
                alt={item.title}
                slot="backdrop_detail"
                priority
                loading="eager"
                className="h-full w-full"
                imgClassName={`object-cover transition-transform duration-[6000ms] ${
                  playing ? 'scale-110' : 'scale-100'
                }`}
              />
              <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black via-black/35 to-transparent" />

              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center">
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full shadow-2xl hover:scale-105 transition-transform cursor-pointer"
                  style={{
                    backgroundColor: 'var(--pt-accent)',
                    color: 'var(--pt-accent-contrast)',
                  }}
                  aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
                >
                  {playing ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 fill-current" />}
                </button>
                <p className="font-display text-xl sm:text-2xl font-extrabold text-white drop-shadow">
                  {item.title}
                </p>
                <p className="mt-1 max-w-xl text-xs sm:text-sm text-[#b7c9ef]">{item.tagline}</p>
                <a
                  href={externalTrailerHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-shield-allow="true"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 px-4 py-2 text-xs font-extrabold text-white backdrop-blur-md transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>البحث عن الإعلان على يوتيوب</span>
                </a>
              </div>

              <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 bg-black/75 px-3.5 sm:px-5 py-2.5 sm:py-3 backdrop-blur-sm border-t border-white/10">
                <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs font-bold text-white min-w-0">
                  <Volume2 className="w-4 h-4 shrink-0" style={{ color: 'var(--pt-accent)' }} />
                  <span className="truncate">معاينة الإعلان الرسمي</span>
                  <div className="hidden sm:block h-1.5 w-44 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-700 ${
                        playing ? 'w-2/5' : 'w-0'
                      }`}
                      style={{ backgroundColor: 'var(--pt-accent)' }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onWatchFull(item);
                  }}
                  className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg px-3.5 sm:px-4 min-h-[40px] sm:min-h-0 py-2 text-xs font-extrabold transition-opacity hover:opacity-90 cursor-pointer whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: 'var(--pt-accent)',
                    color: 'var(--pt-accent-contrast)',
                  }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>مشاهدة العمل كامل</span>
                </button>
              </div>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Interactive Multi-Server Stream Player Modal ---------------- */
interface PlayerModalProps {
  item: MediaItem | null;
  initialEpisode?: number;
  initialServerIndex?: number;
  playerTheme?: PlayerThemeConfig;
  popupShieldConfig?: PopupShieldConfig;
  onUpdateHostRule?: (rule: PopupShieldHostRule) => void;
  isInWatchlist?: boolean;
  onToggleWatchlist?: (item: MediaItem) => void;
  userId?: string;
  isSignedIn?: boolean;
  onRecentlyWatchedUpdated?: () => void;
  onNotify?: (message: string) => void;
  onClose: () => void;
}

interface ServerFilterEntry {
  url: string;
  ok: boolean;
  faultType: '403' | 'sandboxed_embed' | '404' | 'frame_blocked' | 'not_video' | 'error' | null;
  httpStatus: number;
  reason: string;
  directStreamUrl?: string | null;
}

function getFriendlyServerError(entry?: ServerFilterEntry | null): {
  title: string;
  subtitle: string;
  shortStatus: string;
} {
  if (!entry) {
    return {
      title: 'تعذر تشغيل هذا السيرفر',
      subtitle: 'حدث انقطاع مؤقت في السيرفر. يمكنك تجربة سيرفر آخر.',
      shortStatus: 'غير متاح',
    };
  }
  if (entry.faultType === '403' || entry.httpStatus === 403) {
    return {
      title: 'السيرفر غير متاح حالياً',
      subtitle: 'تعذر الوصول إلى مصدر البث في هذا السيرفر. جرّب سيرفراً آخر للمشاهدة.',
      shortStatus: 'غير متاح',
    };
  }
  if (entry.faultType === '404' || entry.httpStatus === 404 || entry.httpStatus === 410) {
    return {
      title: 'الفيديو غير متوفر على هذا السيرفر',
      subtitle: 'لم يتم العثور على ملف المشاهدة هنا. اختر سيرفراً بديلاً للمتابعة.',
      shortStatus: 'غير متوفر',
    };
  }
  if (entry.faultType === 'frame_blocked' || entry.faultType === 'sandboxed_embed') {
    return {
      title: 'تعذر تشغيل هذا السيرفر هنا',
      subtitle: 'هذا السيرفر لا يدعم التشغيل داخل المشغل الحالي. جرّب سيرفراً آخر.',
      shortStatus: 'غير متوافق',
    };
  }
  if (entry.faultType === 'not_video') {
    return {
      title: 'الرابط لا يحتوي على فيديو مباشر',
      subtitle: 'تم إيقاف هذا الرابط لأنه لا يفتح مشغل فيديو. جرّب سيرفراً آخر.',
      shortStatus: 'غير متاح',
    };
  }
  return {
    title: 'تعذر الاتصال بالسيرفر',
    subtitle: 'قد يكون السيرفر مشغولاً حالياً. يمكنك تجربة سيرفر آخر أو إعادة المحاولة.',
    shortStatus: 'متعطل',
  };
}

function cleanQualityIdentifier(quality?: string, fallback?: string): string {
  const cleaned = String(quality || fallback || 'HD')
    .replace(/مستورد|embed/gi, '')
    .trim();
  return cleaned || String(fallback || 'HD').replace(/مستورد|embed/gi, '').trim() || 'HD';
}

function extractSafeStreamSrc(embedCode?: string, url?: string): string | null {
  if (embedCode) {
    const match = embedCode.match(/src\s*=\s*["']([^"']+)["']/i);
    if (match && /^https?:\/\//i.test(match[1].trim())) {
      return match[1].trim();
    }
    if (/^https?:\/\//i.test(embedCode.trim())) {
      return embedCode.trim();
    }
  }
  if (url && /^https?:\/\//i.test(url.trim())) {
    return url.trim();
  }
  return null;
}

export function PlayerModal({
  item,
  initialEpisode = 1,
  initialServerIndex = 0,
  playerTheme,
  popupShieldConfig,
  onUpdateHostRule,
  isInWatchlist = false,
  onToggleWatchlist,
  userId = 'guest',
  isSignedIn = false,
  onRecentlyWatchedUpdated,
  onNotify,
  onClose,
}: PlayerModalProps) {
  const [selectedServer, setSelectedServer] = useState(initialServerIndex);
  const [seasonIdx, setSeasonIdx] = useState(0);
  const [episodeNum, setEpisodeNum] = useState(initialEpisode);

  // Server runtime fault tracking states (no background probing)
  const [filterMap, setFilterMap] = useState<Record<number, ServerFilterEntry>>({});
  const [bypassEpisodeSrc, setBypassEpisodeSrc] = useState(false);
  const [manualBypassFault, setManualBypassFault] = useState<Record<number, boolean>>({});
  const [playerReloadKey, setPlayerReloadKey] = useState(0);
  const [allServersFailed, setAllServersFailed] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [shieldSessionOverrides, setShieldSessionOverrides] = useState<
    Record<number, Exclude<PopupShieldProfileMode, 'direct_media'>>
  >({});
  const [showMobileDetails, setShowMobileDetails] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobileCinemaFill, setIsMobileCinemaFill] = useState(false);
  const [hlsLevels, setHlsLevels] = useState<Array<{ index: number; label: string }>>([]);
  const [selectedHlsLevel, setSelectedHlsLevel] = useState<number>(-1);
  const [hlsSubtitles, setHlsSubtitles] = useState<Array<{ index: number; label: string }>>([]);
  const [selectedHlsSubtitle, setSelectedHlsSubtitle] = useState<number>(-1);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isMuted, setIsMuted] = useState(false);
  const [customVttUrl, setCustomVttUrl] = useState('');
  const [showSubtitleInput, setShowSubtitleInput] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<'forward' | 'backward' | null>(null);
  const playerBoxRef = useRef<HTMLDivElement | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const hlsInstanceRef = useRef<{
    currentLevel: number;
    subtitleTracks?: Array<{ id?: number; name?: string; lang?: string }>;
    subtitleTrack?: number;
    destroy: () => void;
  } | null>(null);
  const lastBlurObservedRef = useRef<number>(0);
  const selectedServerRef = useRef<number>(initialServerIndex);
  const triedServersRef = useRef<Set<number>>(new Set([initialServerIndex]));
  const attemptTokenRef = useRef<number>(0);
  const playbackConfirmedRef = useRef<boolean>(false);
  const hasStartedPlayingRef = useRef<boolean>(false);
  const iframeLoadedRef = useRef<boolean>(false);
  const filterMapRef = useRef<Record<number, ServerFilterEntry>>({});
  const userPausedRef = useRef<boolean>(false);
  const loadTimeoutRef = useRef<number | null>(null);
  const doubleTapRef = useRef<{ lastTime: number; side: 'left' | 'right' | null }>({
    lastTime: 0,
    side: null,
  });
  const startedPlaybackKeyRef = useRef<string | null>(null);
  const lastLocalHeartbeatMsRef = useRef<number>(0);
  const latestPlaybackContextRef = useRef<{
    item: MediaItem | null;
    seasonIdx: number;
    episodeNum: number;
    selectedServer: number;
    streamUrl: string;
    userId: string;
    isSignedIn: boolean;
  }>({
    item,
    seasonIdx: 0,
    episodeNum: initialEpisode,
    selectedServer: initialServerIndex,
    streamUrl: '',
    userId,
    isSignedIn,
  });

  useDialogAccessibility(Boolean(item), onClose);
  const canUsePiP = detectClientCapabilities().supportsPictureInPicture;

  // Lock background page scroll while Watch Modal is open (prevents iOS/Android bleed)
  useEffect(() => {
    if (!item) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [item]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(getFullscreenElement()));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    const el = playerBoxRef.current;
    const vid = videoElementRef.current;

    if (getFullscreenElement()) {
      const exited = await exitAnyFullscreen();
      if (!exited) setIsMobileCinemaFill(false);
      return;
    }

    if (await requestElementFullscreen(el)) {
      return;
    }

    if (await requestElementFullscreen(vid)) {
      return;
    }

    setIsMobileCinemaFill((prev) => !prev);
  }, []);

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current !== null) {
      window.clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const onRecentlyWatchedUpdatedRef = useRef(onRecentlyWatchedUpdated);
  onRecentlyWatchedUpdatedRef.current = onRecentlyWatchedUpdated;

  const flushRecentlyWatched = useCallback((reason: PlaybackRecordReason) => {
    const ctx = latestPlaybackContextRef.current;
    if (!ctx.item) return;

    const attemptKey = `${ctx.item.id}::s${ctx.seasonIdx}::e${ctx.episodeNum}::srv${ctx.selectedServer}`;
    if (reason === 'start') {
      if (startedPlaybackKeyRef.current === attemptKey) return;
      startedPlaybackKeyRef.current = attemptKey;
    } else if (!startedPlaybackKeyRef.current) {
      // Never record heartbeat/episode_switch/close if genuine playback never started
      return;
    }

    const now = Date.now();
    if (reason === 'heartbeat' && now - lastLocalHeartbeatMsRef.current < 8000) {
      return;
    }
    lastLocalHeartbeatMsRef.current = now;

    const vid = videoElementRef.current;
    const positionSec =
      vid && Number.isFinite(vid.currentTime) ? Math.max(0, vid.currentTime) : 0;
    const durationSec =
      vid && Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 0;

    const seasonObj = ctx.item.seasons?.[ctx.seasonIdx];
    const epObj = (seasonObj?.episodes || []).find((e) => e.number === ctx.episodeNum);
    const hasEpisodes = Boolean(ctx.item.seasons && ctx.item.seasons.length > 0);

    void recordRecentlyWatchedPlayback({
      userId: ctx.userId || 'guest',
      isSignedIn: Boolean(ctx.isSignedIn),
      media: ctx.item,
      seasonNumber: hasEpisodes ? seasonObj?.seasonNumber || ctx.seasonIdx + 1 : undefined,
      episodeNumber: hasEpisodes ? ctx.episodeNum : undefined,
      episodeTitle: epObj?.title,
      positionSec,
      durationSec,
      lastServerIndex: ctx.selectedServer,
      lastServerUrl: ctx.streamUrl || undefined,
      reason,
    })
      .then(() => {
        onRecentlyWatchedUpdatedRef.current?.();
      })
      .catch(() => {
        // Silent safeguard
      });
  }, []);

  const confirmServerLoadReady = useCallback(
    (serverIdx: number, expectedToken?: number) => {
      if (expectedToken !== undefined && attemptTokenRef.current !== expectedToken) return;
      playbackConfirmedRef.current = true;
      clearLoadTimeout();
      setAllServersFailed(false);
      const existing = filterMapRef.current[serverIdx];
      if (!existing || !existing.ok) {
        const nextMap: Record<number, ServerFilterEntry> = {
          ...filterMapRef.current,
          [serverIdx]: {
            url: existing?.url || '',
            ok: true,
            faultType: null,
            httpStatus: existing?.httpStatus || 200,
            reason: 'السيرفر يعمل بنجاح',
            directStreamUrl: existing?.directStreamUrl,
          },
        };
        filterMapRef.current = nextMap;
        setFilterMap(nextMap);
      }

      // For embedded iframes, confirmation that frame loaded cleanly without fault means genuine playback session began.
      // For direct <video> streams, onPlaying handles 'start' once frames actually begin playing.
      const streamUrl = latestPlaybackContextRef.current.streamUrl || existing?.url || '';
      const isDirectStream = /\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(streamUrl);
      if (!isDirectStream) {
        flushRecentlyWatched('start');
      }
    },
    [clearLoadTimeout, flushRecentlyWatched]
  );

  // Reset selections when media item or initial props change
  useEffect(() => {
    const seasons = item?.seasons || [];
    const matchingSeason = seasons.findIndex((s) =>
      (s.episodes || []).some((e) => e.number === initialEpisode)
    );
    clearLoadTimeout();
    attemptTokenRef.current += 1;
    selectedServerRef.current = initialServerIndex;
    triedServersRef.current = new Set([initialServerIndex]);
    playbackConfirmedRef.current = false;
    hasStartedPlayingRef.current = false;
    iframeLoadedRef.current = false;
    filterMapRef.current = {};
    userPausedRef.current = false;
    setSeasonIdx(matchingSeason >= 0 ? matchingSeason : 0);
    setEpisodeNum(initialEpisode);
    setSelectedServer(initialServerIndex);
    setFilterMap({});
    setBypassEpisodeSrc(initialServerIndex > 0);
    setManualBypassFault({});
    setAllServersFailed(false);
    setAutoplayBlocked(false);
    setPlayerReloadKey(0);
    setShieldSessionOverrides({});
    setShowMobileDetails(false);
    setIsMobileCinemaFill(false);
    startedPlaybackKeyRef.current = null;
    lastLocalHeartbeatMsRef.current = 0;
  }, [item?.id, initialEpisode, initialServerIndex, clearLoadTimeout]);

  // Keep selectedServerRef synchronized
  useEffect(() => {
    selectedServerRef.current = selectedServer;
  }, [selectedServer]);

  // Cleanup load timer and flush close watch position on modal close / media switch
  useEffect(() => {
    return () => {
      clearLoadTimeout();
      if (startedPlaybackKeyRef.current) {
        flushRecentlyWatched('close');
        startedPlaybackKeyRef.current = null;
      }
    };
  }, [item?.id, clearLoadTimeout, flushRecentlyWatched]);

  // Helper to mark a server faulty at runtime and auto-switch to next untried healthy server in order
  const handleServerFaultFailover = useCallback(
    (faultIdx: number, reason: string, expectedToken?: number) => {
      if (!item) return;
      if (expectedToken !== undefined && attemptTokenRef.current !== expectedToken) return;
      if (playbackConfirmedRef.current && hasStartedPlayingRef.current) return;

      clearLoadTimeout();

      const epList = item.seasons?.[seasonIdx]?.episodes || item.seasons?.[0]?.episodes || [];
      const activeEp = epList.find((e) => e.number === episodeNum);
      const itemServers = Array.isArray(item.servers) ? item.servers : [];
      const effectiveServers =
        activeEp?.servers && activeEp.servers.length > 0 ? activeEp.servers : itemServers;
      const total = effectiveServers.length;

      const prevMap = filterMapRef.current;
      const nextMap: Record<number, ServerFilterEntry> = {
        ...prevMap,
        [faultIdx]: {
          url: prevMap[faultIdx]?.url || '',
          ok: false,
          faultType: reason.includes('403')
            ? '403'
            : reason.includes('404')
              ? '404'
              : /sandbox/i.test(reason)
                ? 'sandboxed_embed'
                : 'error',
          httpStatus: reason.includes('403') ? 403 : reason.includes('404') ? 404 : 0,
          reason,
        },
      };
      filterMapRef.current = nextMap;
      setFilterMap(nextMap);

      const transition = computeFaultFailoverTransition({
        faultIndex: faultIdx,
        totalServers: total,
        triedIndices: triedServersRef.current,
        filterMap: nextMap,
      });
      triedServersRef.current = new Set(transition.nextTriedIndices);

      if (transition.action === 'switch') {
        const candidateIdx = transition.nextIndex;
        attemptTokenRef.current += 1;
        selectedServerRef.current = candidateIdx;
        playbackConfirmedRef.current = false;
        hasStartedPlayingRef.current = false;
        iframeLoadedRef.current = false;
        userPausedRef.current = false;
        setAutoplayBlocked(false);
        setAllServersFailed(false);
        setBypassEpisodeSrc(true);
        setSelectedServer(candidateIdx);

        const faultName = formatShortServerName(
          effectiveServers[faultIdx]?.name,
          faultIdx,
          effectiveServers[faultIdx]?.url
        );
        const nextName = formatShortServerName(
          effectiveServers[candidateIdx]?.name,
          candidateIdx,
          effectiveServers[candidateIdx]?.url
        );
        onNotify?.(`${faultName} غير متاح حالياً — تم التبديل تلقائياً إلى ${nextName}.`);
      } else {
        setAllServersFailed(true);
        onNotify?.('تعذر تشغيل المحتوى حاليًا — لم تستجب السيرفرات المتاحة.');
      }
    },
    [item, seasonIdx, episodeNum, clearLoadTimeout, onNotify]
  );

  // Mark iframe frame load ready immediately without background server probing
  const markIframeLoaded = useCallback(
    (serverIdx: number, expectedToken?: number) => {
      if (expectedToken !== undefined && attemptTokenRef.current !== expectedToken) return;
      iframeLoadedRef.current = true;
      clearLoadTimeout();
      setAllServersFailed(false);
      confirmServerLoadReady(serverIdx, expectedToken);
    },
    [clearLoadTimeout, confirmServerLoadReady]
  );

  const effectiveShieldConfig = normalizePopupShieldConfig(
    popupShieldConfig || loadStoredPopupShieldConfig()
  );

  // Derive active stream URL cleanly before runtime Shield effects
  const activeMediaEpisodes = item?.seasons?.[seasonIdx]?.episodes || item?.seasons?.[0]?.episodes || [];
  const activeEpPreview = activeMediaEpisodes.find((e) => e.number === episodeNum);
  const effectivePreviewServers =
    activeEpPreview?.servers && activeEpPreview.servers.length > 0
      ? activeEpPreview.servers
      : item?.servers || [];
  const previewServerIndex =
    selectedServer < effectivePreviewServers.length ? selectedServer : 0;
  const previewServerObj = effectivePreviewServers[previewServerIndex];
  const rawPreviewEpSrc =
    activeEpPreview?.servers && activeEpPreview.servers.length > 0
      ? null
      : bypassEpisodeSrc
        ? null
        : extractSafeStreamSrc(activeEpPreview?.embedCode, activeEpPreview?.watchUrl);
  const previewEpSrc =
    rawPreviewEpSrc && !isLikelyNonVideoWebsiteUrl(rawPreviewEpSrc) ? rawPreviewEpSrc : null;
  const previewServerSrc =
    filterMap[previewServerIndex]?.directStreamUrl ||
    extractSafeStreamSrc(previewServerObj?.embedCode, previewServerObj?.url);
  const currentActiveStreamSrc = previewEpSrc || previewServerSrc;
  latestPlaybackContextRef.current = {
    item,
    seasonIdx,
    episodeNum,
    selectedServer: previewServerIndex,
    streamUrl: currentActiveStreamSrc || '',
    userId,
    isSignedIn,
  };
  const currentShieldDecision = resolveEffectiveShieldDecision(
    currentActiveStreamSrc,
    effectiveShieldConfig,
    shieldSessionOverrides[previewServerIndex] || null
  );

  // Sync active Shield player context for parent window guards (window.open / target=_blank)
  useEffect(() => {
    if (!item) return;
    setActiveShieldPlayerContext({
      serverHost: currentShieldDecision.hostname || 'player',
      serverName: `سيرفر ${previewServerIndex + 1}`,
      mediaTitle: item.title,
      mode: currentShieldDecision.mode,
    });
    return () => {
      setActiveShieldPlayerContext(null);
    };
  }, [
    item?.id,
    item?.title,
    previewServerIndex,
    currentShieldDecision.hostname,
    currentShieldDecision.mode,
  ]);

  // Passive cross-origin blur observation: NEVER pretends external unsandboxed popups were blocked
  useEffect(() => {
    if (!item || !currentActiveStreamSrc) return;
    if (
      currentShieldDecision.mode === 'direct_media' ||
      currentShieldDecision.mode === 'strict_sandbox' ||
      !effectiveShieldConfig.enabled
    ) {
      return;
    }

    const onWindowBlur = () => {
      const now = Date.now();
      if (now - lastBlurObservedRef.current < 4000) return;
      window.setTimeout(() => {
        if (document.activeElement?.tagName === 'IFRAME') {
          lastBlurObservedRef.current = Date.now();
          appendPopupShieldLog({
            kind: 'observed_external_blur',
            prevented: false,
            serverHost: currentShieldDecision.hostname || 'external-embed',
            serverName: `سيرفر ${previewServerIndex + 1}`,
            mediaTitle: item.title,
            targetUrl: currentActiveStreamSrc,
            detail:
              'رُصد انتقال التركيز خارج المشغل (السيرفر يعمل في وضع التوافق المباشر لرفضه العزل، وقد يفتح تبويباً خارج نطاق Cross-Origin).',
          });
        }
      }, 65);
    };

    window.addEventListener('blur', onWindowBlur);
    return () => window.removeEventListener('blur', onWindowBlur);
  }, [
    item?.id,
    item?.title,
    currentActiveStreamSrc,
    currentShieldDecision.mode,
    currentShieldDecision.hostname,
    effectiveShieldConfig.enabled,
    previewServerIndex,
  ]);

  // Listen for postMessage cues from embedded players reporting sandboxed embed or 403 errors
  useEffect(() => {
    if (!item) return;
    const onMessage = (event: MessageEvent) => {
      const payload = typeof event.data === 'string' ? event.data : JSON.stringify(event.data || '');
      const isSandboxRejection =
        /sandboxed\s*embed|please\s*disable\s+sandbox|embedding\s+in\s+sandbox/i.test(payload);
      if (
        isSandboxRejection &&
        effectiveShieldConfig.autoFallbackOnReject &&
        currentShieldDecision.mode !== 'direct_unrestricted' &&
        currentShieldDecision.mode !== 'direct_media'
      ) {
        setShieldSessionOverrides((prev) => ({
          ...prev,
          [previewServerIndex]: 'direct_unrestricted',
        }));
        if (currentShieldDecision.hostname && onUpdateHostRule) {
          onUpdateHostRule({
            hostname: currentShieldDecision.hostname,
            mode: 'direct_unrestricted',
            compatibility: 'incompatible',
            note: 'تم التحويل التلقائي لوضع التوافق المباشر بعد رفض السيرفر لـ sandbox.',
            lastTestedAt: new Date().toISOString(),
          });
        }
        appendPopupShieldLog({
          kind: 'sandbox_rejected_fallback',
          prevented: false,
          serverHost: currentShieldDecision.hostname || 'external-embed',
          serverName: `سيرفر ${previewServerIndex + 1}`,
          mediaTitle: item.title,
          targetUrl: currentActiveStreamSrc || '',
          detail: 'رفض السيرفر قيود sandbox — تم تبديله فوراً إلى التشغيل المتوافق دون تعطيل الفيديو.',
        });
        const resolvedShortName = formatShortServerName(
          previewServerObj?.name,
          previewServerIndex,
          currentActiveStreamSrc || previewServerObj?.url
        );
        onNotify?.(`تم ضبط التوافق لـ ${resolvedShortName} تلقائياً لضمان التشغيل.`);
        return;
      }

      if (/error\s*403|403\s*forbidden/i.test(payload)) {
        handleServerFaultFailover(previewServerIndex, 'خطأ 403', attemptTokenRef.current);
      } else if (isSandboxRejection) {
        handleServerFaultFailover(previewServerIndex, 'رسالة Sandboxed embed', attemptTokenRef.current);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [
    item?.id,
    item?.title,
    selectedServer,
    previewServerIndex,
    currentActiveStreamSrc,
    currentShieldDecision.mode,
    currentShieldDecision.hostname,
    effectiveShieldConfig.autoFallbackOnReject,
    onUpdateHostRule,
    handleServerFaultFailover,
  ]);

  const seasons = item?.seasons || [];
  const episodes = activeMediaEpisodes;
  const activeEpisodeObj = episodes.find((e) => e.number === episodeNum);
  const itemServersFallback = Array.isArray(item?.servers) ? item.servers : [];
  const perEpisodeServers =
    activeEpisodeObj?.servers && activeEpisodeObj.servers.length > 0
      ? activeEpisodeObj.servers
      : itemServersFallback;

  const fallbackQuality = item?.quality || 'HD';
  const serversList =
    perEpisodeServers.length > 0
      ? perEpisodeServers
      : [
          {
            id: 'default',
            name: 'سيرفر 1',
            quality: fallbackQuality,
            speed: 'سريع',
            tag: fallbackQuality,
          },
        ];

  const safeServerIndex = selectedServer < serversList.length ? selectedServer : 0;
  const activeServer = serversList[safeServerIndex] || serversList[0];
  const activeQuality = cleanQualityIdentifier(activeServer.quality, fallbackQuality);

  const rawEpFallbackSrc =
    activeEpisodeObj?.servers && activeEpisodeObj.servers.length > 0
      ? null
      : bypassEpisodeSrc
        ? null
        : extractSafeStreamSrc(activeEpisodeObj?.embedCode, activeEpisodeObj?.watchUrl);
  const episodeSpecificSrc =
    rawEpFallbackSrc && !isLikelyNonVideoWebsiteUrl(rawEpFallbackSrc) ? rawEpFallbackSrc : null;

  const activeFilterEntry = filterMap[safeServerIndex];
  const serverSrc =
    activeFilterEntry?.directStreamUrl || extractSafeStreamSrc(activeServer.embedCode, activeServer.url);
  const finalStreamSrc = episodeSpecificSrc || serverSrc;
  const isBlockedHomepageUrl = Boolean(
    finalStreamSrc &&
      (isLikelyNonVideoWebsiteUrl(finalStreamSrc) || activeFilterEntry?.faultType === 'not_video')
  );
  const isActiveServerFaulty = Boolean(
    activeFilterEntry && !activeFilterEntry.ok && !manualBypassFault[safeServerIndex]
  );
  const friendlyServerError = getFriendlyServerError(activeFilterEntry);
  const isDashStream = Boolean(finalStreamSrc && /\.mpd(\?|$)/i.test(finalStreamSrc));
  const isHlsVideoStream = Boolean(finalStreamSrc && /\.m3u8(\?|$)/i.test(finalStreamSrc));
  const isDirectVideoFile = Boolean(finalStreamSrc && /\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(finalStreamSrc));

  const attemptVideoAutoplay = useCallback(
    (videoEl: HTMLVideoElement | null, expectedToken: number, serverIdx: number) => {
      if (!videoEl || attemptTokenRef.current !== expectedToken) return;
      if (userPausedRef.current || !videoEl.paused) return;

      const playResult = videoEl.play();
      if (playResult && typeof playResult.then === 'function') {
        playResult
          .then(() => {
            if (attemptTokenRef.current !== expectedToken) return;
            setAutoplayBlocked(false);
            confirmServerLoadReady(serverIdx, expectedToken);
          })
          .catch((err) => {
            if (attemptTokenRef.current !== expectedToken) return;
            const kind = classifyAutoplayPlayError(err);
            if (kind === 'autoplay_blocked') {
              // Browser blocked unmuted autoplay: keep server ready & show standard play button
              setAutoplayBlocked(true);
              confirmServerLoadReady(serverIdx, expectedToken);
            } else if (kind === 'playback_error') {
              handleServerFaultFailover(serverIdx, 'تعذر تشغيل ملف الفيديو', expectedToken);
            }
          });
      }
    },
    [confirmServerLoadReady, handleServerFaultFailover]
  );

  // Ensure direct <video> triggers autoplay immediately if media metadata/frames are already ready
  useEffect(() => {
    if (!item || !isDirectVideoFile || isHlsVideoStream || allServersFailed) return;
    if (isBlockedHomepageUrl || isActiveServerFaulty) return;
    const vid = videoElementRef.current;
    if (vid && vid.readyState >= 2) {
      attemptVideoAutoplay(vid, attemptTokenRef.current, safeServerIndex);
    }
  }, [
    item?.id,
    safeServerIndex,
    finalStreamSrc,
    playerReloadKey,
    isDirectVideoFile,
    isHlsVideoStream,
    isBlockedHomepageUrl,
    isActiveServerFaulty,
    allServersFailed,
    attemptVideoAutoplay,
  ]);

  // Automatic load timeout & invalid/DASH/faulty source failover for current server
  useEffect(() => {
    clearLoadTimeout();
    if (!item || allServersFailed) return;

    const currentToken = attemptTokenRef.current;
    triedServersRef.current.add(safeServerIndex);

    if (!finalStreamSrc || isBlockedHomepageUrl || isDashStream || isActiveServerFaulty) {
      const reason = !finalStreamSrc
        ? 'رابط التشغيل غير متوفر في السيرفر'
        : isBlockedHomepageUrl
          ? 'الرابط لا يحتوي على مشغل فيديو مباشر'
          : isDashStream
            ? 'صيغة البث غير مدعومة مباشرة'
            : activeFilterEntry?.reason || 'السيرفر غير متاح';
      const immediateTimer = window.setTimeout(() => {
        handleServerFaultFailover(safeServerIndex, reason, currentToken);
      }, 60);
      loadTimeoutRef.current = immediateTimer;
      return () => {
        window.clearTimeout(immediateTimer);
        if (loadTimeoutRef.current === immediateTimer) {
          loadTimeoutRef.current = null;
        }
      };
    }

    if (playbackConfirmedRef.current || iframeLoadedRef.current) return;

    const timeoutMs = isDirectVideoFile ? LOAD_TIMEOUT_DIRECT_MS : LOAD_TIMEOUT_IFRAME_MS;
    const timerId = window.setTimeout(() => {
      if (
        attemptTokenRef.current !== currentToken ||
        playbackConfirmedRef.current ||
        iframeLoadedRef.current
      ) {
        return;
      }
      handleServerFaultFailover(
        safeServerIndex,
        'انتهت مهلة انتظار استجابة السيرفر',
        currentToken
      );
    }, timeoutMs);
    loadTimeoutRef.current = timerId;

    return () => {
      window.clearTimeout(timerId);
      if (loadTimeoutRef.current === timerId) {
        loadTimeoutRef.current = null;
      }
    };
  }, [
    item?.id,
    seasonIdx,
    episodeNum,
    safeServerIndex,
    finalStreamSrc,
    isBlockedHomepageUrl,
    isDashStream,
    isActiveServerFaulty,
    isDirectVideoFile,
    playerReloadKey,
    allServersFailed,
    activeFilterEntry?.reason,
    clearLoadTimeout,
    handleServerFaultFailover,
  ]);

  // Dynamic HLS (.m3u8) Engine Loader — only fetched when playing an .m3u8 stream on non-native browsers
  useEffect(() => {
    const videoEl = videoElementRef.current;
    setHlsLevels([]);
    setSelectedHlsLevel(-1);
    setHlsSubtitles([]);
    setSelectedHlsSubtitle(-1);

    if (hlsInstanceRef.current) {
      try {
        hlsInstanceRef.current.destroy();
      } catch {
        // Ignore cleanup errors
      }
      hlsInstanceRef.current = null;
    }

    if (!item || !finalStreamSrc || !isHlsVideoStream || !videoEl) return;
    if (isBlockedHomepageUrl || isActiveServerFaulty || allServersFailed) return;

    const expectedToken = attemptTokenRef.current;
    const currentIdx = safeServerIndex;

    // Safari / iOS supports HLS natively
    if (
      videoEl.canPlayType('application/vnd.apple.mpegurl') !== '' ||
      videoEl.canPlayType('application/x-mpegURL') !== ''
    ) {
      videoEl.src = finalStreamSrc;
      return;
    }

    let cancelled = false;
    let networkRecoveryCount = 0;
    let mediaRecoveryCount = 0;

    void (async () => {
      try {
        const { default: Hls } = await import('hls.js');
        if (cancelled || !videoElementRef.current || attemptTokenRef.current !== expectedToken) return;
        if (!Hls.isSupported()) {
          videoElementRef.current.src = finalStreamSrc;
          return;
        }
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        });
        hlsInstanceRef.current = hls;
        hls.loadSource(finalStreamSrc);
        hls.attachMedia(videoElementRef.current);

        hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
          if (cancelled || attemptTokenRef.current !== expectedToken) return;
          const lvls = (data.levels || []).map((lvl, idx) => ({
            index: idx,
            label: lvl.height ? `${lvl.height}p` : `جودة ${idx + 1}`,
          }));
          setHlsLevels(lvls);
          const subs = (hls.subtitleTracks || []).map((tr, idx) => ({
            index: idx,
            label: tr.name || tr.lang || `ترجمة ${idx + 1}`,
          }));
          setHlsSubtitles(subs);
          confirmServerLoadReady(currentIdx, expectedToken);
          attemptVideoAutoplay(videoElementRef.current, expectedToken, currentIdx);
        });

        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_evt, data) => {
          if (cancelled) return;
          const subs = (data.subtitleTracks || []).map((tr, idx) => ({
            index: idx,
            label: tr.name || tr.lang || `ترجمة ${idx + 1}`,
          }));
          setHlsSubtitles(subs);
        });

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (cancelled || !data.fatal || attemptTokenRef.current !== expectedToken) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveryCount < 1) {
            networkRecoveryCount += 1;
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveryCount < 1) {
            mediaRecoveryCount += 1;
            hls.recoverMediaError();
          } else {
            hls.destroy();
            handleServerFaultFailover(currentIdx, 'تعذر تشغيل بث HLS', expectedToken);
          }
        });
      } catch {
        if (!cancelled && videoElementRef.current && attemptTokenRef.current === expectedToken) {
          videoElementRef.current.src = finalStreamSrc;
        }
      }
    })();

    return () => {
      cancelled = true;
      if (hlsInstanceRef.current) {
        try {
          hlsInstanceRef.current.destroy();
        } catch {
          // Ignore
        }
        hlsInstanceRef.current = null;
      }
    };
  }, [
    item?.id,
    finalStreamSrc,
    isHlsVideoStream,
    isBlockedHomepageUrl,
    isActiveServerFaulty,
    allServersFailed,
    playerReloadKey,
    safeServerIndex,
    confirmServerLoadReady,
    attemptVideoAutoplay,
    handleServerFaultFailover,
  ]);

  // Keyboard & Remote Control Player Shortcuts (f = Fullscreen, Space/k = Play/Pause, Arrows = Seek ±10s)
  useEffect(() => {
    if (!item) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        void handleToggleFullscreen();
        return;
      }

      const vid = videoElementRef.current;
      if (!vid || !isDirectVideoFile) return;

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        vid.muted = !vid.muted;
        setIsMuted(vid.muted);
        return;
      }

      if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        if (target === vid || target?.closest('[data-rtv-player-stage="true"]')) {
          e.preventDefault();
          if (vid.paused) void vid.play();
          else vid.pause();
        }
      } else if (e.key === 'ArrowRight') {
        if (target === vid || target?.closest('[data-rtv-player-stage="true"]')) {
          e.preventDefault();
          vid.currentTime = Math.min(vid.duration || vid.currentTime + 10, vid.currentTime + 10);
        }
      } else if (e.key === 'ArrowLeft') {
        if (target === vid || target?.closest('[data-rtv-player-stage="true"]')) {
          e.preventDefault();
          vid.currentTime = Math.max(0, vid.currentTime - 10);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [item, isDirectVideoFile, handleToggleFullscreen]);

  // Keep playbackRate synced cleanly on the direct <video> element
  useEffect(() => {
    if (videoElementRef.current) {
      videoElementRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, finalStreamSrc, playerReloadKey]);

  if (!item) return null;

  const handleDirectDoubleTap = (side: 'left' | 'right') => {
    const vid = videoElementRef.current;
    if (!vid || !isDirectVideoFile) return;
    const now = Date.now();
    if (
      doubleTapRef.current.side === side &&
      now - doubleTapRef.current.lastTime < 350
    ) {
      const delta = side === 'left' ? -10 : 10;
      vid.currentTime = Math.max(0, Math.min(vid.duration || vid.currentTime + 10, vid.currentTime + delta));
      setSeekFeedback(delta > 0 ? 'forward' : 'backward');
      window.setTimeout(() => setSeekFeedback(null), 650);
      doubleTapRef.current = { lastTime: 0, side: null };
    } else {
      doubleTapRef.current = { lastTime: now, side };
    }
  };

  const handleTogglePiP = async () => {
    const vid = videoElementRef.current as (HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<unknown>;
    }) | null;
    if (!vid || !canUsePiP) return;
    try {
      const doc = document as Document & {
        pictureInPictureElement?: Element | null;
        exitPictureInPicture?: () => Promise<void>;
      };
      if (doc.pictureInPictureElement && typeof doc.exitPictureInPicture === 'function') {
        await doc.exitPictureInPicture();
      } else if (typeof vid.requestPictureInPicture === 'function') {
        await vid.requestPictureInPicture();
      }
    } catch {
      // Browser declined PiP (e.g., audio-only or gesture restriction)
    }
  };

  const shieldDecision = resolveEffectiveShieldDecision(
    finalStreamSrc,
    effectiveShieldConfig,
    shieldSessionOverrides[safeServerIndex] || null
  );

  const handleCycleShieldMode = () => {
    if (shieldDecision.mode === 'direct_media') return;
    const nextMode: Exclude<PopupShieldProfileMode, 'direct_media'> =
      shieldDecision.mode === 'strict_sandbox'
        ? 'redirect_guard'
        : shieldDecision.mode === 'redirect_guard'
          ? 'direct_unrestricted'
          : 'strict_sandbox';
    setShieldSessionOverrides((prev) => ({ ...prev, [safeServerIndex]: nextMode }));
    if (shieldDecision.hostname && onUpdateHostRule) {
      onUpdateHostRule({
        hostname: shieldDecision.hostname,
        mode: nextMode,
        compatibility:
          nextMode === 'strict_sandbox'
            ? 'compatible'
            : nextMode === 'redirect_guard'
              ? 'partial'
              : 'incompatible',
        note: 'تم تعديله من شريط المشغّل',
        lastTestedAt: new Date().toISOString(),
      });
    }
  };

  const handleManualServerSelect = (idx: number) => {
    clearLoadTimeout();
    attemptTokenRef.current += 1;
    triedServersRef.current = new Set([idx]);
    selectedServerRef.current = idx;
    playbackConfirmedRef.current = false;
    hasStartedPlayingRef.current = false;
    iframeLoadedRef.current = false;
    userPausedRef.current = false;
    setAutoplayBlocked(false);
    setAllServersFailed(false);
    setBypassEpisodeSrc(idx > 0);
    if (filterMapRef.current[idx] && !filterMapRef.current[idx].ok) {
      setManualBypassFault((prev) => ({ ...prev, [idx]: true }));
    }
    setSelectedServer(idx);
    setPlayerReloadKey((k) => k + 1);
  };

  const handleSwitchToNextServer = () => {
    if (serversList.length <= 1) {
      handleRetryAllServers();
      return;
    }
    const nextHealthy = findNextAvailableServerIndex({
      currentIndex: safeServerIndex,
      totalServers: serversList.length,
      triedIndices: new Set([safeServerIndex]),
      filterMap: filterMapRef.current,
    });
    const targetIdx = nextHealthy !== -1 ? nextHealthy : (safeServerIndex + 1) % serversList.length;
    handleManualServerSelect(targetIdx);
  };

  const handleRetryAllServers = () => {
    clearLoadTimeout();
    attemptTokenRef.current += 1;
    const startIdx = initialServerIndex < serversList.length ? initialServerIndex : 0;
    triedServersRef.current = new Set([startIdx]);
    selectedServerRef.current = startIdx;
    playbackConfirmedRef.current = false;
    hasStartedPlayingRef.current = false;
    iframeLoadedRef.current = false;
    filterMapRef.current = {};
    userPausedRef.current = false;
    setAutoplayBlocked(false);
    setAllServersFailed(false);
    setBypassEpisodeSrc(startIdx > 0);
    setManualBypassFault({});
    setFilterMap({});
    setSelectedServer(startIdx);
    setPlayerReloadKey((k) => k + 1);
  };

  const handleSelectEpisodeOrSeason = (nextSeasonIdx: number, nextEpisodeNum: number) => {
    if (startedPlaybackKeyRef.current) {
      flushRecentlyWatched('episode_switch');
    }
    startedPlaybackKeyRef.current = null;
    lastLocalHeartbeatMsRef.current = 0;
    clearLoadTimeout();
    attemptTokenRef.current += 1;
    triedServersRef.current = new Set([0]);
    selectedServerRef.current = 0;
    playbackConfirmedRef.current = false;
    hasStartedPlayingRef.current = false;
    iframeLoadedRef.current = false;
    filterMapRef.current = {};
    userPausedRef.current = false;
    setAutoplayBlocked(false);
    setAllServersFailed(false);
    setBypassEpisodeSrc(false);
    setSeasonIdx(nextSeasonIdx);
    setEpisodeNum(nextEpisodeNum);
    setSelectedServer(0);
    setFilterMap({});
    setManualBypassFault({});
    setPlayerReloadKey((k) => k + 1);
  };

  const handleReloadCurrentServer = () => {
    if (allServersFailed) {
      handleRetryAllServers();
      return;
    }
    clearLoadTimeout();
    attemptTokenRef.current += 1;
    playbackConfirmedRef.current = false;
    hasStartedPlayingRef.current = false;
    iframeLoadedRef.current = false;
    userPausedRef.current = false;
    setAutoplayBlocked(false);
    setPlayerReloadKey((k) => k + 1);
  };

  const handleShareMedia = async () => {
    const urlToShare = resolveDisplayShortUrl(
      item,
      episodes.length > 0 ? episodeNum : undefined
    );
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: item.title,
          text: `${item.title} — شاهد الآن على RahaL TV`,
          url: urlToShare,
        });
        return;
      } catch {
        // User cancelled or share unsupported in embedded frame -> fallback to copy
      }
    }
    await safeCopyToClipboard(urlToShare);
    onNotify?.('تم نسخ رابط المشاهدة بنجاح');
  };

  const theme = normalizePlayerTheme(playerTheme || loadStoredPlayerTheme());
  const themeVars = buildPlayerThemeVars(theme);
  const playerChromeOffsetPx =
    108 + (theme.showHeaderBar ? 46 : 0) + (theme.showFooterBar ? 42 : 0);
  const playerFullscreenOffsetPx =
    12 + (theme.showHeaderBar ? 46 : 0) + (theme.showFooterBar ? 42 : 0);
  const playerModalStyle = {
    ...themeVars,
    '--rtv-player-chrome-offset': `${playerChromeOffsetPx}px`,
    '--rtv-player-fs-offset': `${playerFullscreenOffsetPx}px`,
  } as CSSProperties;

  const healthyNextIdx = serversList.findIndex(
    (_, idx) => idx !== safeServerIndex && filterMap[idx]?.ok !== false
  );

  const activeServerLabel = formatShortServerName(
    activeServer.name,
    safeServerIndex,
    finalStreamSrc || activeServer.url
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`مشغل ${item.title}`}
      data-rtv-focus-trap="true"
      className="fixed inset-0 z-[55] flex items-stretch lg:items-center justify-center p-0 lg:p-3 overflow-x-hidden"
      style={playerModalStyle}
    >
      <div className="fixed inset-0 bg-black/95 lg:bg-black/90 lg:backdrop-blur-md" onClick={onClose} />
      <div
        className="rtv-mobile-watch-modal relative z-10 w-full lg:w-[96vw] lg:max-w-[1340px] border-0 lg:border border-white/[0.09] shadow-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--pt-modal)',
          borderRadius: 'var(--pt-radius)',
        }}
      >
        {/* Mobile Slim Watch Header (< 1024px) */}
        <div
          className="rtv-mobile-watch-header flex lg:hidden items-center justify-between gap-2 px-2 h-11 border-b border-white/[0.08] shrink-0"
          style={{ backgroundColor: 'var(--pt-frame)' }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[44px] min-w-[44px] max-lg:landscape:min-h-[36px] max-lg:landscape:min-w-[36px] items-center justify-center rounded-lg text-white active:scale-95 transition-transform cursor-pointer shrink-0"
              aria-label="إغلاق المشغل"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex items-center gap-1.5 text-xs">
              <span className="font-display font-extrabold text-white truncate">
                {item.title}
              </span>
              {episodes.length > 0 && (
                <span className="font-latin text-[11px] font-bold text-[#f9c400] shrink-0 tabular-nums">
                  · ح {String(episodeNum).padStart(2, '0')}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleReloadCurrentServer}
              title="إعادة تحميل المشغل"
              aria-label="إعادة تحميل المشغل"
              className="inline-flex min-h-[44px] min-w-[44px] max-lg:landscape:min-h-[36px] max-lg:landscape:min-w-[36px] items-center justify-center rounded-lg text-white/90 hover:bg-white/10 active:scale-95 transition-transform cursor-pointer"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleToggleFullscreen()}
              title="ملء الشاشة"
              aria-label="ملء الشاشة"
              className="inline-flex min-h-[44px] min-w-[44px] max-lg:landscape:min-h-[36px] max-lg:landscape:min-w-[36px] items-center justify-center rounded-lg active:scale-95 transition-transform cursor-pointer"
              style={{
                backgroundColor: 'var(--pt-accent)',
                color: 'var(--pt-accent-contrast)',
              }}
            >
              {isFullscreen || isMobileCinemaFill ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Desktop & TV Unified Modal Top Bar (>= 1024px) */}
        <div
          className="hidden lg:flex items-center justify-between gap-3 px-4 py-2 border-b border-white/[0.08] shrink-0"
          style={{ backgroundColor: 'var(--pt-frame)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 shadow-md"
              style={{
                backgroundColor: 'var(--pt-accent)',
                color: 'var(--pt-accent-contrast)',
              }}
            >
              <Tv className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-sm font-extrabold text-white truncate">
                {item.title}
                {item.kind === 'series' ? ` — الحلقة ${String(episodeNum).padStart(2, '0')}` : ''}
              </h3>
              <p className="text-[11px] text-[#9fb2d4] flex items-center gap-1.5 tabular-nums">
                <span className="font-extrabold text-white">سيرفر {safeServerIndex + 1}</span>
                <span>·</span>
                <span className="font-latin font-black text-[#f9c400]">{activeQuality}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] border border-white/10 text-white/85 hover:bg-white/15 hover:text-white transition-colors cursor-pointer shrink-0"
            aria-label="إغلاق المشغل"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Body: Mobile Edge-to-Edge Watch First | Desktop Server Rail + Video Stage */}
        <div className="rtv-mobile-watch-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-0 lg:p-3">
          <div
            className={`flex flex-col lg:grid gap-0 lg:gap-3.5 lg:items-start ${
              isTheaterMode ? 'lg:grid-cols-1' : 'lg:grid-cols-[200px_minmax(0,1fr)]'
            }`}
          >
            {/* Right Sidebar on Desktop / Placed Below Player on Mobile */}
            {!isTheaterMode && (
              <aside
                id="mobile-server-selector"
                className="order-2 lg:order-1 mx-3 mt-3 lg:mx-0 lg:mt-0 rounded-2xl lg:rounded-xl border border-white/[0.08] p-3 lg:p-2.5 space-y-2.5 lg:space-y-2"
                style={{ backgroundColor: 'var(--pt-frame)' }}
              >
                <div className="flex items-center justify-between px-0.5 pb-1.5 border-b border-white/[0.06]">
                  <span className="inline-flex items-center gap-1.5 text-xs lg:text-[11px] font-extrabold text-white">
                    <Server className="w-3.5 h-3.5" style={{ color: 'var(--pt-accent)' }} />
                    <span>سيرفرات المشاهدة</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-latin tabular-nums text-[11px] font-black text-[#b7c9ef]">
                      {serversList.length}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 min-[480px]:grid-cols-3 lg:grid-cols-1 gap-2 lg:gap-1.5 lg:max-h-[calc(100dvh-200px)] lg:overflow-y-auto">
                  {serversList.map((srv, idx) => {
                    const isActive = safeServerIndex === idx;
                    const srvFilter = filterMap[idx];
                    const isBroken = Boolean(srvFilter && !srvFilter.ok);
                    const isVerifiedOk = Boolean(srvFilter && srvFilter.ok);
                    const qualityLabel = cleanQualityIdentifier(srv.quality, item.quality);
                    const shortLabel = formatShortServerName(srv.name, idx, srv.url);

                    return (
                      <button
                        key={srv.id || idx}
                        type="button"
                        onClick={() => handleManualServerSelect(idx)}
                        title={
                          isBroken
                            ? `${shortLabel} غير متاح حالياً`
                            : `${shortLabel} · ${qualityLabel}`
                        }
                        style={{
                          animationDelay: `${idx * 35}ms`,
                          ...(isActive
                            ? {
                                backgroundColor: 'var(--pt-accent)',
                                color: 'var(--pt-accent-contrast)',
                                borderColor: 'transparent',
                              }
                            : {}),
                        }}
                        className={`moov-server-enter group flex items-center justify-between gap-1.5 rounded-xl lg:rounded-lg border px-2.5 min-h-[46px] lg:min-h-0 py-2 transition-all duration-200 cursor-pointer ${
                          isActive
                            ? 'shadow-lg font-black ring-2 ring-white/30 lg:ring-0'
                            : isBroken
                              ? 'bg-[#D92321]/10 border-[#D92321]/25 text-[#ff9d9b] opacity-75 hover:opacity-100'
                              : 'bg-white/[0.04] border-white/[0.07] text-white/90 hover:bg-white/[0.09] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors ${
                              isActive
                                ? 'bg-black/20 text-current'
                                : isBroken
                                  ? 'bg-[#D92321]/20 text-[#ff8a88]'
                                  : 'bg-white/[0.07] text-white/80'
                            }`}
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                          </span>

                          <span className="text-xs font-extrabold truncate">
                            {shortLabel}
                          </span>

                          {isBroken ? (
                            <AlertTriangle className="w-3 h-3 text-[#f9c400] shrink-0" />
                          ) : isVerifiedOk && !isActive ? (
                            <CheckCircle2 className="w-3 h-3 text-[#4CAF50] shrink-0" />
                          ) : null}
                        </div>

                        <span
                          className={`font-latin shrink-0 text-[10px] font-black ${
                            isActive ? 'text-current opacity-90' : 'text-[#b7c9ef]'
                          }`}
                        >
                          {qualityLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </aside>
            )}

            {/* Main Area: Edge-to-Edge Video Stage + Desktop Episodes */}
            <div className="order-1 lg:order-2 min-w-0 w-full lg:space-y-3">
              <div
                ref={playerBoxRef}
                className="rtv-mobile-player-box border-0 lg:border overflow-hidden transition-all"
                style={{
                  backgroundColor: '#000000',
                  borderColor: 'var(--pt-accent-35)',
                  borderRadius: 'var(--pt-radius)',
                  boxShadow: 'var(--pt-shadow)',
                }}
              >
                {/* Desktop Video Box Header Bar */}
                {theme.showHeaderBar && (
                  <div
                    className="hidden lg:flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b border-white/[0.08]"
                    style={{ backgroundColor: 'var(--pt-frame)' }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {theme.showBrandBadge && (
                        <span
                          className="inline-flex h-6 px-2 items-center gap-1.5 rounded-md text-[11px] font-black tracking-wide shrink-0 shadow-sm"
                          style={{
                            backgroundColor: 'var(--pt-accent)',
                            color: 'var(--pt-accent-contrast)',
                          }}
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span className="font-latin">{theme.brandLabel}</span>
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 text-xs min-w-0">
                        <span className="font-extrabold text-white/95 tabular-nums">
                          سيرفر {safeServerIndex + 1}
                        </span>
                        <span className="text-white/25">·</span>
                        <span className="font-latin font-bold text-[#f9c400] text-[11px]">
                          {activeQuality}
                        </span>
                      </div>
                    </div>

                    {/* Sleek Unified Controls */}
                    <div className="flex items-center gap-1.5">
                      {effectiveShieldConfig.showPlayerBadge && finalStreamSrc && (
                        <button
                          type="button"
                          onClick={handleCycleShieldMode}
                          disabled={shieldDecision.mode === 'direct_media'}
                          title={`${shieldDecision.label} — ${shieldDecision.description}${
                            shieldDecision.mode !== 'direct_media'
                              ? ' (اضغط لتبديل وضع التوافق لهذا السيرفر)'
                              : ''
                          }`}
                          className={`hidden sm:inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-extrabold transition-colors cursor-pointer disabled:cursor-default ${
                            shieldDecision.mode === 'strict_sandbox' ||
                            shieldDecision.mode === 'direct_media'
                              ? 'bg-[#4CAF50]/15 border-[#4CAF50]/35 text-[#4CAF50] hover:bg-[#4CAF50]/25'
                              : shieldDecision.mode === 'redirect_guard'
                                ? 'bg-[#f9c400]/15 border-[#f9c400]/35 text-[#f9c400] hover:bg-[#f9c400]/25'
                                : 'bg-sky-500/15 border-sky-400/35 text-sky-300 hover:bg-sky-500/25'
                          }`}
                        >
                          {shieldDecision.mode === 'direct_unrestricted' ? (
                            <ShieldAlert className="w-3 h-3 shrink-0" />
                          ) : (
                            <ShieldCheck className="w-3 h-3 shrink-0" />
                          )}
                          <span>{shieldDecision.shortLabel}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={safeServerIndex <= 0}
                        onClick={() => handleManualServerSelect(Math.max(0, safeServerIndex - 1))}
                        title="السيرفر السابق"
                        aria-label="السيرفر السابق"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.06] border border-white/[0.08] text-white/85 hover:bg-white/[0.14] hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={safeServerIndex >= serversList.length - 1}
                        onClick={() =>
                          handleManualServerSelect(Math.min(serversList.length - 1, safeServerIndex + 1))
                        }
                        title="السيرفر التالي"
                        aria-label="السيرفر التالي"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.06] border border-white/[0.08] text-white/85 hover:bg-white/[0.14] hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={handleReloadCurrentServer}
                        title="إعادة تحميل المشغل"
                        aria-label="إعادة تحميل المشغل"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.06] border border-white/[0.08] text-white/85 hover:bg-white/[0.14] hover:text-white transition-colors cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsTheaterMode((t) => !t)}
                        title={isTheaterMode ? 'إظهار قائمة السيرفرات' : 'توسيع العرض'}
                        aria-label={isTheaterMode ? 'إظهار قائمة السيرفرات' : 'توسيع العرض'}
                        className={`hidden lg:inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-bold transition-colors cursor-pointer ${
                          isTheaterMode
                            ? 'border-transparent'
                            : 'bg-white/[0.06] border-white/[0.08] text-white/85 hover:bg-white/[0.14] hover:text-white'
                        }`}
                        style={
                          isTheaterMode
                            ? {
                                backgroundColor: 'var(--pt-accent)',
                                color: 'var(--pt-accent-contrast)',
                              }
                            : undefined
                        }
                      >
                        <MonitorPlay className="w-3.5 h-3.5" />
                        <span>{isTheaterMode ? 'السيرفرات' : 'تكبير'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleToggleFullscreen()}
                        title="ملء الشاشة"
                        aria-label="ملء الشاشة"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-opacity hover:opacity-90 cursor-pointer"
                        style={{
                          backgroundColor: 'var(--pt-accent)',
                          color: 'var(--pt-accent-contrast)',
                        }}
                      >
                        {isFullscreen ? (
                          <Minimize2 className="w-3.5 h-3.5" />
                        ) : (
                          <Maximize2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Pure Edge-to-Edge 16:9 Video Stage (Landscape-Safe on Mobile) */}
                <div className="rtv-mobile-player-shell w-full bg-black">
                  <div
                    className={`rtv-mobile-player-stage relative aspect-video w-full bg-black overflow-hidden ${
                      isMobileCinemaFill ? 'rtv-mobile-cinema-fill' : ''
                    }`}
                  >
                    {allServersFailed ? (
                      <div className="h-full w-full flex flex-col items-center justify-center p-4 sm:p-6 text-center bg-[#090d14] gap-2.5">
                        <div
                          className="inline-flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border shrink-0"
                          style={{
                            backgroundColor: 'var(--pt-accent-12)',
                            borderColor: 'var(--pt-accent-35)',
                            color: 'var(--pt-accent)',
                          }}
                        >
                          <AlertTriangle className="w-6 h-6 sm:w-7 sm:h-7" />
                        </div>
                        <h4 className="font-display text-sm sm:text-base font-extrabold text-white">
                          تعذر تشغيل المحتوى حاليًا
                        </h4>
                        <p className="max-w-md text-xs text-[#b7c9ef] leading-relaxed">
                          لم تستجب سيرفرات المشاهدة المتاحة حاليًا. يمكنك إعادة المحاولة مرة أخرى.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleRetryAllServers}
                            className="inline-flex items-center gap-1.5 rounded-xl px-4 min-h-[42px] py-2 text-xs font-extrabold cursor-pointer"
                            style={{
                              backgroundColor: 'var(--pt-accent)',
                              color: 'var(--pt-accent-contrast)',
                            }}
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>إعادة المحاولة</span>
                          </button>
                        </div>
                      </div>
                    ) : isBlockedHomepageUrl || isActiveServerFaulty ? (
                      <div className="h-full w-full flex flex-col items-center justify-center p-2.5 sm:p-6 text-center bg-[#090d14] gap-1.5 sm:gap-3">
                        <div
                          className="inline-flex h-8 w-8 sm:h-14 sm:w-14 items-center justify-center rounded-xl sm:rounded-2xl border shrink-0"
                          style={{
                            backgroundColor: 'var(--pt-accent-12)',
                            borderColor: 'var(--pt-accent-35)',
                            color: 'var(--pt-accent)',
                          }}
                        >
                          <AlertTriangle className="w-4 h-4 sm:w-7 sm:h-7" />
                        </div>
                        <h4 className="font-display text-xs sm:text-base font-extrabold text-white leading-tight">
                          {isBlockedHomepageUrl
                            ? 'الرابط غير صالح للمشاهدة'
                            : friendlyServerError.title}
                        </h4>
                        <p className="max-w-md text-[11px] sm:text-xs text-[#b7c9ef] leading-snug line-clamp-2">
                          {isBlockedHomepageUrl
                            ? `${activeServerLabel} لا يعرض فيديو مباشراً. يمكنك تجربة سيرفر آخر.`
                            : friendlyServerError.subtitle}
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5 sm:pt-1">
                          {serversList.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                handleManualServerSelect(
                                  healthyNextIdx !== -1
                                    ? healthyNextIdx
                                    : (safeServerIndex + 1) % serversList.length
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 sm:px-4 min-h-[38px] sm:min-h-[44px] py-1.5 text-[11px] sm:text-xs font-extrabold cursor-pointer"
                              style={{
                                backgroundColor: 'var(--pt-accent)',
                                color: 'var(--pt-accent-contrast)',
                              }}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>تجربة سيرفر آخر</span>
                            </button>
                          )}
                          {!isBlockedHomepageUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setManualBypassFault((prev) => ({
                                  ...prev,
                                  [safeServerIndex]: true,
                                }));
                                setPlayerReloadKey((k) => k + 1);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.08] border border-white/15 px-3 sm:px-3.5 min-h-[38px] sm:min-h-[44px] py-1.5 text-[11px] sm:text-xs font-bold text-white/90 hover:bg-white/15 cursor-pointer"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                              <span>إعادة المحاولة</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : finalStreamSrc ? (
                      isDashStream ? (
                        <div className="h-full w-full flex flex-col items-center justify-center p-4 sm:p-6 text-center bg-[#090d14] gap-2.5">
                          <div
                            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border shrink-0"
                            style={{
                              backgroundColor: 'var(--pt-accent-12)',
                              borderColor: 'var(--pt-accent-35)',
                              color: 'var(--pt-accent)',
                            }}
                          >
                            <AlertTriangle className="w-6 h-6" />
                          </div>
                          <h4 className="font-display text-sm sm:text-base font-extrabold text-white">
                            بث MPEG-DASH (.mpd) يتطلب سيرفراً بديلاً
                          </h4>
                          <p className="max-w-md text-xs text-[#b7c9ef] leading-relaxed">
                            المشغل المدمج يدعم HLS (.m3u8) و MP4/WebM مباشرة. اختر سيرفراً آخر للمتابعة فوراً.
                          </p>
                          {serversList.length > 1 && (
                            <button
                              type="button"
                              onClick={handleSwitchToNextServer}
                              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold cursor-pointer"
                              style={{
                                backgroundColor: 'var(--pt-accent)',
                                color: 'var(--pt-accent-contrast)',
                              }}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>الانتقال للسيرفر التالي</span>
                            </button>
                          )}
                        </div>
                      ) : isDirectVideoFile ? (
                        <div data-rtv-player-stage="true" data-rtv-player-controls="true" className="relative h-full w-full bg-black">
                          <video
                            ref={videoElementRef}
                            key={`${safeServerIndex}-${finalStreamSrc}-${playerReloadKey}`}
                            src={isHlsVideoStream ? undefined : finalStreamSrc}
                            controls
                            autoPlay
                            playsInline
                            muted={isMuted}
                            crossOrigin={customVttUrl ? 'anonymous' : undefined}
                            onVolumeChange={(e) => setIsMuted(e.currentTarget.muted)}
                            onLoadedData={() => {
                              confirmServerLoadReady(safeServerIndex, attemptTokenRef.current);
                            }}
                            onCanPlay={(e) => {
                              const expectedToken = attemptTokenRef.current;
                              confirmServerLoadReady(safeServerIndex, expectedToken);
                              attemptVideoAutoplay(e.currentTarget, expectedToken, safeServerIndex);
                            }}
                            onPlay={() => {
                              setAutoplayBlocked(false);
                              confirmServerLoadReady(safeServerIndex, attemptTokenRef.current);
                            }}
                            onPlaying={() => {
                              hasStartedPlayingRef.current = true;
                              setAutoplayBlocked(false);
                              confirmServerLoadReady(safeServerIndex, attemptTokenRef.current);
                              flushRecentlyWatched('start');
                            }}
                            onTimeUpdate={() => {
                              if (hasStartedPlayingRef.current) {
                                flushRecentlyWatched('heartbeat');
                              }
                            }}
                            onPause={() => {
                              if (hasStartedPlayingRef.current) {
                                userPausedRef.current = true;
                                flushRecentlyWatched('heartbeat');
                              }
                            }}
                            onError={() =>
                              handleServerFaultFailover(
                                safeServerIndex,
                                'تعذر تحميل ملف الفيديو',
                                attemptTokenRef.current
                              )
                            }
                            className="h-full w-full max-w-full block bg-black"
                          >
                            {customVttUrl && /^https?:\/\//i.test(customVttUrl.trim()) && (
                              <track
                                kind="subtitles"
                                label="ترجمة مخصصة"
                                src={customVttUrl.trim()}
                                default
                              />
                            )}
                          </video>

                          {autoplayBlocked && (
                            <button
                              type="button"
                              aria-label="تشغيل الفيديو"
                              onClick={() => {
                                const vid = videoElementRef.current;
                                if (!vid) return;
                                userPausedRef.current = false;
                                setAutoplayBlocked(false);
                                void vid.play().catch(() => {
                                  setAutoplayBlocked(true);
                                });
                              }}
                              className="absolute inset-0 z-20 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/75 border border-white/30 text-white shadow-2xl backdrop-blur-md hover:scale-105 transition-transform cursor-pointer"
                            >
                              <Play className="w-7 h-7 fill-current translate-x-0.5" />
                            </button>
                          )}

                          {/* Mobile Double-Tap ±10s Seek Hotzones */}
                          <div
                            aria-hidden="true"
                            onClick={() => handleDirectDoubleTap('left')}
                            className="lg:hidden absolute inset-y-12 left-0 w-1/4 z-10"
                          />
                          <div
                            aria-hidden="true"
                            onClick={() => handleDirectDoubleTap('right')}
                            className="lg:hidden absolute inset-y-12 right-0 w-1/4 z-10"
                          />

                          {seekFeedback && (
                            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                              <span className="rounded-xl bg-black/80 border border-white/20 px-4 py-2 font-latin text-sm font-black text-[#f9c400]">
                                {seekFeedback === 'forward' ? '+10s' : '-10s'}
                              </span>
                            </div>
                          )}

                          {/* Direct Video Controls Strip (Speed, HLS Quality, Subtitles, Mute, PiP) */}
                          <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                            <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
                              {hlsLevels.length > 1 && (
                                <div className="flex items-center gap-1 rounded-lg bg-black/80 border border-white/15 px-2 py-1 text-[10px] font-bold text-white">
                                  <span>الجودة:</span>
                                  <select
                                    value={selectedHlsLevel}
                                    onChange={(e) => {
                                      const lvl = Number(e.target.value);
                                      setSelectedHlsLevel(lvl);
                                      if (hlsInstanceRef.current) {
                                        hlsInstanceRef.current.currentLevel = lvl;
                                      }
                                    }}
                                    aria-label="تغيير جودة البث"
                                    className="bg-transparent text-[#f9c400] font-latin font-black focus:outline-none cursor-pointer"
                                  >
                                    <option value={-1} className="bg-[#0c1821] text-white">Auto</option>
                                    {hlsLevels.map((l) => (
                                      <option key={l.index} value={l.index} className="bg-[#0c1821] text-white">
                                        {l.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {hlsSubtitles.length > 0 && (
                                <div className="flex items-center gap-1 rounded-lg bg-black/80 border border-white/15 px-2 py-1 text-[10px] font-bold text-white">
                                  <Captions className="w-3 h-3 text-[#f9c400]" />
                                  <select
                                    value={selectedHlsSubtitle}
                                    onChange={(e) => {
                                      const idx = Number(e.target.value);
                                      setSelectedHlsSubtitle(idx);
                                      if (hlsInstanceRef.current) {
                                        hlsInstanceRef.current.subtitleTrack = idx;
                                      }
                                    }}
                                    aria-label="ترجمة HLS"
                                    className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
                                  >
                                    <option value={-1} className="bg-[#0c1821] text-white">بدون ترجمة</option>
                                    {hlsSubtitles.map((s) => (
                                      <option key={s.index} value={s.index} className="bg-[#0c1821] text-white">
                                        {s.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              <div className="flex items-center gap-1 rounded-lg bg-black/80 border border-white/15 px-2 py-1 text-[10px] font-bold text-white">
                                <span>السرعة:</span>
                                <select
                                  value={playbackRate}
                                  onChange={(e) => setPlaybackRate(Number(e.target.value))}
                                  aria-label="سرعة التشغيل"
                                  className="bg-transparent text-[#f9c400] font-latin font-black focus:outline-none cursor-pointer"
                                >
                                  {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                                    <option key={rate} value={rate} className="bg-[#0c1821] text-white">
                                      {rate}x
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 pointer-events-auto">
                              <button
                                type="button"
                                onClick={() => setShowSubtitleInput((v) => !v)}
                                title="إضافة ملف ترجمة VTT"
                                aria-label="إضافة ملف ترجمة VTT"
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-white cursor-pointer ${
                                  showSubtitleInput || customVttUrl
                                    ? 'bg-[#D92321] border-[#ff5a58]'
                                    : 'bg-black/80 border-white/15 hover:bg-white/15'
                                }`}
                              >
                                <Captions className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  const vid = videoElementRef.current;
                                  const nextMuted = !isMuted;
                                  setIsMuted(nextMuted);
                                  if (vid) vid.muted = nextMuted;
                                }}
                                title={isMuted ? 'إلغاء كتم الصوت (M)' : 'كتم الصوت (M)'}
                                aria-label={isMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/80 border border-white/15 text-white hover:bg-white/15 cursor-pointer"
                              >
                                {isMuted ? (
                                  <VolumeX className="w-3.5 h-3.5 text-[#ff8a88]" />
                                ) : (
                                  <Volume2 className="w-3.5 h-3.5" />
                                )}
                              </button>

                              {canUsePiP && (
                                <button
                                  type="button"
                                  onClick={() => void handleTogglePiP()}
                                  title="نافذة عائمة (Picture-in-Picture)"
                                  aria-label="نافذة عائمة"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/80 border border-white/15 text-white hover:bg-white/15 cursor-pointer"
                                >
                                  <PictureInPicture2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {showSubtitleInput && (
                            <div className="absolute top-12 left-2.5 right-2.5 sm:left-auto sm:w-80 z-30 rounded-xl bg-[#0c1821]/95 border border-white/15 p-2.5 shadow-2xl space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] font-bold text-white">
                                <span>رابط ترجمة WebVTT (.vtt)</span>
                                <button
                                  type="button"
                                  onClick={() => setShowSubtitleInput(false)}
                                  className="text-[#b7c9ef] hover:text-white cursor-pointer"
                                  aria-label="إغلاق نافذة الترجمة"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <input
                                type="url"
                                dir="ltr"
                                value={customVttUrl}
                                onChange={(e) => setCustomVttUrl(e.target.value)}
                                placeholder="https://example.com/subtitles.vtt"
                                className="w-full rounded-lg bg-[#06131c] border border-white/15 px-2.5 py-1.5 font-latin text-[11px] text-white focus:border-[#f9c400] focus:outline-none"
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <iframe
                          key={`${safeServerIndex}-${finalStreamSrc}-${shieldDecision.mode}-${playerReloadKey}`}
                          src={finalStreamSrc}
                          title={`${item.title} - ${activeServerLabel}`}
                          sandbox={shieldDecision.sandboxAttr}
                          allowFullScreen
                          referrerPolicy="no-referrer"
                          onLoad={(e) => {
                            const expectedToken = attemptTokenRef.current;
                            let sameOriginError = false;
                            try {
                              const doc = e.currentTarget.contentDocument;
                              if (doc) {
                                const text = (doc.body?.innerText || '').trim();
                                if (!text || /\b(404|403|502|503)\b|not found|forbidden/i.test(text)) {
                                  sameOriginError = true;
                                }
                              }
                            } catch {
                              // Cross-origin frame loaded normally
                            }
                            if (sameOriginError) {
                              handleServerFaultFailover(safeServerIndex, 'تعذر تحميل محتوى الإطار', expectedToken);
                            } else {
                              markIframeLoaded(safeServerIndex, expectedToken);
                            }
                          }}
                          onError={() =>
                            handleServerFaultFailover(
                              safeServerIndex,
                              'تعذر تحميل المشغل المدمج',
                              attemptTokenRef.current
                            )
                          }
                          allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope"
                          className="h-full w-full max-w-full block border-0 bg-black"
                        />
                      )
                    ) : (
                      <div className="h-full w-full flex flex-col items-center justify-center p-4 sm:p-6 text-center bg-[#090d14] gap-2.5">
                        <div
                          className="inline-flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border shrink-0"
                          style={{
                            backgroundColor: 'var(--pt-accent-12)',
                            borderColor: 'var(--pt-accent-35)',
                            color: 'var(--pt-accent)',
                          }}
                        >
                          <Server className="w-6 h-6 sm:w-7 sm:h-7" />
                        </div>
                        <h4 className="font-display text-sm sm:text-base font-extrabold text-white">
                          لا توجد روابط تشغيل صالحة متوفرة لهذا العرض حالياً
                        </h4>
                        <p className="max-w-md text-xs text-[#b7c9ef] leading-relaxed">
                          لم يتم العثور على رابط فيديو أو كود تضمين صالح في السيرفر المحدد. جرّب التبديل إلى سيرفر آخر أو إعادة التحميل.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                          {serversList.length > 1 && (
                            <button
                              type="button"
                              onClick={handleSwitchToNextServer}
                              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold cursor-pointer"
                              style={{
                                backgroundColor: 'var(--pt-accent)',
                                color: 'var(--pt-accent-contrast)',
                              }}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>تجربة سيرفر آخر</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleRetryAllServers}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.08] border border-white/15 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/15 cursor-pointer"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>إعادة المحاولة</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Desktop Video Box Footer Bar */}
                {theme.showFooterBar && (
                  <div
                    className="hidden lg:flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-t border-white/[0.08] text-[11px]"
                    style={{ backgroundColor: 'var(--pt-frame)' }}
                  >
                    <div className="flex items-center gap-2 text-[#9fb2d4]">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--pt-accent)' }} />
                      <span>
                        مشغّل <strong className="text-white">{theme.brandLabel}</strong> المحمي — إذا تعذر التحميل بدّل للسيرفر التالي
                      </span>
                    </div>
                    {serversList.length > 1 && (
                      <button
                        type="button"
                        onClick={handleSwitchToNextServer}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-extrabold transition-opacity hover:opacity-90 cursor-pointer"
                        style={{
                          backgroundColor: 'var(--pt-accent)',
                          color: 'var(--pt-accent-contrast)',
                        }}
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>السيرفر التالي</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Mobile Prominent "تغيير السيرفر" Bar Directly Below Player */}
              <div
                className="flex lg:hidden items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.08]"
                style={{ backgroundColor: 'var(--pt-frame)' }}
              >
                <div className="flex items-center gap-2 min-w-0 text-xs">
                  <span className="font-extrabold text-white truncate">
                    {activeServerLabel}
                  </span>
                  <span className="text-white/30">·</span>
                  <span className="font-latin font-black text-[#f9c400] text-[11px] shrink-0">
                    {activeQuality}
                  </span>
                  {activeFilterEntry && (
                    <>
                      <span className="text-white/30">·</span>
                      <span
                        className={`text-[11px] font-bold shrink-0 ${
                          activeFilterEntry.ok ? 'text-[#4CAF50]' : 'text-[#ff8a88]'
                        }`}
                      >
                        {activeFilterEntry.ok ? 'متاح' : friendlyServerError.shortStatus}
                      </span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSwitchToNextServer}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 min-h-[44px] py-2 text-xs font-extrabold transition-opacity active:scale-95 shrink-0 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--pt-accent)',
                    color: 'var(--pt-accent-contrast)',
                  }}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{serversList.length > 1 ? 'تغيير السيرفر' : 'إعادة التحميل'}</span>
                </button>
              </div>

              {/* Desktop Series Episodes Switcher */}
              {episodes.length > 0 && (
                <div
                  className="hidden lg:block rounded-xl border border-white/[0.08] p-3"
                  style={{ backgroundColor: 'var(--pt-frame)' }}
                >
                  <p className="text-xs font-extrabold text-white mb-2">التنقل السريع بين الحلقات:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {episodes.map((ep) => {
                      const epSrvCount = ep.servers?.length || 0;
                      return (
                        <button
                          key={ep.number}
                          type="button"
                          onClick={() => handleSelectEpisodeOrSeason(seasonIdx, ep.number)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                            episodeNum === ep.number
                              ? ''
                              : 'bg-white/[0.05] text-[#b7c9ef] border border-white/10 hover:text-white'
                          }`}
                          style={
                            episodeNum === ep.number
                              ? {
                                  backgroundColor: 'var(--pt-accent)',
                                  color: 'var(--pt-accent-contrast)',
                                }
                              : undefined
                          }
                        >
                          <span>الحلقة {String(ep.number).padStart(2, '0')}</span>
                          {epSrvCount > 0 && (
                            <span className="font-latin rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-black tabular-nums">
                              {epSrvCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Movie Info, Watchlist & Share, Seasons/Episodes, & Collapsible Details */}
            <div className="order-3 lg:hidden px-3 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))] space-y-3">
              {/* Movie Title + Concise Year & Rating */}
              <div
                className="rounded-2xl border border-white/[0.08] p-3.5 space-y-3"
                style={{ backgroundColor: 'var(--pt-frame)' }}
              >
                <div className="space-y-1">
                  <h2 className="font-display text-base font-extrabold text-white leading-snug">
                    {item.title}
                    {episodes.length > 0 ? ` — الحلقة ${String(episodeNum).padStart(2, '0')}` : ''}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-[#b7c9ef]">
                    <span className="font-latin tabular-nums text-white/90">{item.year}</span>
                    {item.communityRating && item.communityRating.count > 0 && (
                      <>
                        <span className="text-white/30">·</span>
                        <span className="inline-flex items-center gap-1 font-latin tabular-nums text-[#f9c400]">
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <span dir="ltr">{item.communityRating.average.toFixed(1)}/5</span>
                        </span>
                      </>
                    )}
                    <span className="text-white/30">·</span>
                    <span className="font-latin text-white/90">{item.quality}</span>
                    {item.duration && (
                      <>
                        <span className="text-white/30">·</span>
                        <span>{item.duration}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Organized Favorites & Share Row */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onToggleWatchlist?.(item)}
                    className={`flex items-center justify-center gap-2 rounded-xl border min-h-[44px] px-3 py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                      isInWatchlist
                        ? 'bg-[#4CAF50]/20 border-[#4CAF50]/60 text-[#4CAF50]'
                        : 'bg-white/[0.05] border-white/10 text-white hover:bg-white/10'
                    }`}
                  >
                    {isInWatchlist ? <Check className="w-4 h-4 shrink-0" /> : <Bookmark className="w-4 h-4 shrink-0" />}
                    <span>{isInWatchlist ? 'في المفضلة' : 'إضافة للمفضلة'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleShareMedia()}
                    className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.05] border border-white/10 min-h-[44px] px-3 py-2 text-xs font-extrabold text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Share2 className="w-4 h-4 shrink-0" />
                    <span>مشاركة</span>
                  </button>
                </div>
              </div>

              {/* Mobile Seasons & Episodes Organization */}
              {episodes.length > 0 && (
                <div
                  className="rounded-2xl border border-white/[0.08] p-3 space-y-2.5"
                  style={{ backgroundColor: 'var(--pt-frame)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-white">
                      <Tv className="w-3.5 h-3.5 text-[#f9c400]" />
                      <span>الحلقات ({episodes.length})</span>
                    </span>
                    {seasons.length > 1 && (
                      <span className="text-[11px] font-bold text-[#9fb2d4]">
                        {seasons[seasonIdx]?.label}
                      </span>
                    )}
                  </div>

                  {seasons.length > 1 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                      {seasons.map((s, sIdx) => (
                        <button
                          key={s.seasonNumber}
                          type="button"
                          onClick={() => {
                            const firstEp = s.episodes?.[0]?.number || 1;
                            handleSelectEpisodeOrSeason(sIdx, firstEp);
                          }}
                          className={`shrink-0 rounded-xl px-3.5 min-h-[44px] py-1.5 text-xs font-extrabold border transition-colors cursor-pointer ${
                            seasonIdx === sIdx
                              ? 'border-transparent'
                              : 'bg-white/[0.04] border-white/10 text-[#b7c9ef]'
                          }`}
                          style={
                            seasonIdx === sIdx
                              ? {
                                  backgroundColor: 'var(--pt-accent)',
                                  color: 'var(--pt-accent-contrast)',
                                }
                              : undefined
                          }
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-3 min-[390px]:grid-cols-4 gap-2 max-h-52 overflow-y-auto">
                    {episodes.map((ep) => {
                      const isEpActive = episodeNum === ep.number;
                      return (
                        <button
                          key={ep.number}
                          type="button"
                          onClick={() => handleSelectEpisodeOrSeason(seasonIdx, ep.number)}
                          className={`flex items-center justify-center rounded-xl border min-h-[44px] px-2 py-2 text-xs font-extrabold transition-colors cursor-pointer tabular-nums ${
                            isEpActive
                              ? 'border-transparent shadow-md'
                              : 'bg-white/[0.04] border-white/10 text-[#b7c9ef]'
                          }`}
                          style={
                            isEpActive
                              ? {
                                  backgroundColor: 'var(--pt-accent)',
                                  color: 'var(--pt-accent-contrast)',
                                }
                              : undefined
                          }
                        >
                          حلقة {String(ep.number).padStart(2, '0')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Collapsible Secondary Details */}
              <div
                className="rounded-2xl border border-white/[0.08] overflow-hidden"
                style={{ backgroundColor: 'var(--pt-frame)' }}
              >
                <button
                  type="button"
                  onClick={() => setShowMobileDetails((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-3.5 min-h-[46px] py-2.5 text-xs font-extrabold text-white cursor-pointer"
                >
                  <span>تفاصيل القصة والعمل</span>
                  {showMobileDetails ? (
                    <ChevronUp className="w-4 h-4 text-[#9fb2d4]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#9fb2d4]" />
                  )}
                </button>

                {showMobileDetails && (
                  <div className="px-3.5 pb-3.5 pt-1 space-y-3 border-t border-white/[0.06] text-xs">
                    {item.story && (
                      <p className="text-[#b7c9ef] leading-relaxed">{item.story}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-xl bg-black/25 px-3 py-2">
                        <span className="block text-[#9fb2d4] mb-0.5">التصنيف</span>
                        <span className="font-bold text-white">{(item.categories || [])[0] || 'غير محدد'}</span>
                      </div>
                      <div className="rounded-xl bg-black/25 px-3 py-2">
                        <span className="block text-[#9fb2d4] mb-0.5">النوع</span>
                        <span className="font-bold text-white">{(item.genres || []).slice(0, 2).join(' · ') || 'عام'}</span>
                      </div>
                      <div className="rounded-xl bg-black/25 px-3 py-2">
                        <span className="block text-[#9fb2d4] mb-0.5">اللغة</span>
                        <span className="font-bold text-white">{item.language}</span>
                      </div>
                      <div className="rounded-xl bg-black/25 px-3 py-2">
                        <span className="block text-[#9fb2d4] mb-0.5">الدولة</span>
                        <span className="font-bold text-white">{item.country}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Email/Password Auth Login Modal ---------------- */
interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  firebaseUser: User | null;
  isGuest?: boolean;
  isAdmin: boolean;
  adminRole?: AdminPrivilegeRole | null;
  onLogout: () => Promise<void>;
  onContinueAsGuest?: () => void;
  onExitGuest?: () => void;
  onOpenWatchHistory?: () => void;
  onOpenAdmin: () => void;
  onNotify?: (msg: string) => void;
}

export function LoginModal({
  isOpen,
  onClose,
  firebaseUser,
  isGuest = false,
  isAdmin,
  adminRole,
  onLogout,
  onContinueAsGuest,
  onExitGuest,
  onOpenWatchHistory,
  onOpenAdmin,
  onNotify,
}: LoginModalProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [showAuthInGuest, setShowAuthInGuest] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  useDialogAccessibility(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) {
      setShowAuthInGuest(false);
      setAuthError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setAuthError('يرجى إدخال اسم المستخدم أو البريد الإلكتروني وكلمة المرور.');
      return;
    }
    setAuthError(null);
    setSigningIn(true);
    try {
      if (mode === 'login') {
        const cred = await signInWithEmailPassword(identifier, password);
        onNotify?.(`مرحبًا بك يا ${cred.user.displayName || cred.user.email || 'مستخدم'} في RahaL TV`);
      } else {
        const cred = await registerMemberWithEmailPassword(identifier, password, displayName);
        onNotify?.(`تم إنشاء حسابك بنجاح، أهلاً بك ${cred.user.displayName || ''}`);
      }
      setPassword('');
      onClose();
    } catch (err: unknown) {
      setAuthError(getFirebaseAuthErrorMessage(err));
    } finally {
      setSigningIn(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      const cred = await signInWithGoogle();
      onNotify?.(`مرحبًا بك يا ${cred.user.displayName || cred.user.email || 'مستخدم'} في RahaL TV`);
      onClose();
    } catch (err: unknown) {
      setAuthError(getFirebaseAuthErrorMessage(err));
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="حسابي على RahaL TV"
      data-rtv-focus-trap="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
    >
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl sm:rounded-3xl bg-[#0c1821] border border-white/10 p-4 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3 mb-4 sm:mb-5">
          <h2 className="font-display text-base sm:text-lg font-extrabold text-white truncate">
            {firebaseUser
              ? 'حسابي على RahaL TV'
              : isGuest && !showAuthInGuest
                ? 'وضع الضيف — RahaL TV'
                : mode === 'login'
                  ? 'تسجيل الدخول إلى RahaL TV'
                  : 'إنشاء حساب جديد'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-white/5 text-white hover:bg-[#D92321] cursor-pointer shrink-0"
            aria-label="إغلاق نافذة الحساب"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {firebaseUser ? (
          <div className="space-y-4 text-center">
            {firebaseUser.photoURL ? (
              <img
                src={firebaseUser.photoURL}
                alt={firebaseUser.displayName || 'User'}
                loading="lazy"
                decoding="async"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                referrerPolicy="no-referrer"
                className="mx-auto h-16 w-16 rounded-2xl object-cover border-2 border-[#D92321] pointer-events-none select-none"
              />
            ) : (
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D92321]/20 border border-[#D92321] text-xl font-black text-white">
                {(firebaseUser.displayName || firebaseUser.email || 'RT')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}

            <div>
              <p className="text-base font-extrabold text-white">
                أهلاً بك، {firebaseUser.displayName || 'عضو RahaL TV'}
              </p>
              <p className="text-xs text-[#b7c9ef] mt-1">{firebaseUser.email}</p>
              {isAdmin && (
                <span
                  className={`mt-2 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-black border ${
                    adminRole === 'moderator'
                      ? 'bg-sky-500/15 border-sky-400/40 text-sky-300'
                      : 'bg-[#f9c400]/15 border-[#f9c400]/40 text-[#f9c400]'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {adminRole === 'moderator'
                    ? 'مشرف — النشر والتعديل والجلب'
                    : 'مسؤول — صلاحيات كاملة'}
                </span>
              )}
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] py-3 text-xs font-black text-[#06131c] transition-colors cursor-pointer"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>فتح لوحة تحكم الإدارة</span>
              </button>
            )}

            {onOpenWatchHistory && (
              <button
                type="button"
                onClick={onOpenWatchHistory}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] hover:bg-white/15 border border-white/10 py-3 text-xs font-extrabold text-white transition-colors cursor-pointer"
              >
                <History className="w-4 h-4 text-[#E50914]" />
                <span>سجل المشاهدة (شاهدته مؤخراً)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                void onLogout();
                onClose();
              }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-[#D92321] py-3 text-xs font-extrabold text-white transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        ) : isGuest && !showAuthInGuest ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f9c400]/15 border border-[#f9c400]/40 text-xl font-black text-[#f9c400]">
              ضيف
            </div>

            <div className="space-y-1.5">
              <p className="text-base font-extrabold text-white">أنت تتصفح حالياً كضيف</p>
              <p className="text-xs text-[#b7c9ef] leading-relaxed">
                يمكنك تصفح جميع الأقسام والتصنيفات، البحث، ومشاهدة الأفلام والمسلسلات وحفظ قائمتك محلياً على هذا الجهاز دون الحاجة لحساب.
              </p>
            </div>

            <div className="rounded-2xl bg-[#1a242e]/80 border border-white/10 p-3.5 text-right text-[11px] text-[#b7c9ef] leading-relaxed">
              المزايا التي تتطلب حساباً (مثل حفظ تقييم النجوم السحابي أو إرسال طلبات المحتوى ومتابعتها) ستطلب منك تسجيل الدخول عند استخدامها دون منعك من التصفح.
            </div>

            <button
              type="button"
              onClick={() => setShowAuthInGuest(true)}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#D92321] hover:bg-[#dc0e30] py-3 text-xs font-extrabold text-white shadow-lg transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>تسجيل الدخول بحساب أو إنشاء حساب</span>
            </button>

            {onOpenWatchHistory && (
              <button
                type="button"
                onClick={onOpenWatchHistory}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] hover:bg-white/15 border border-white/10 py-3 text-xs font-extrabold text-white transition-colors cursor-pointer"
              >
                <History className="w-4 h-4 text-[#E50914]" />
                <span>سجل المشاهدة (شاهدته مؤخراً)</span>
              </button>
            )}

            {onExitGuest && (
              <button
                type="button"
                onClick={() => {
                  onExitGuest();
                  onClose();
                }}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 py-3 text-xs font-extrabold text-white transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج من وضع الضيف</span>
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <p className="text-xs text-[#b7c9ef] leading-relaxed">
              {mode === 'login'
                ? 'أدخل البريد الإلكتروني (أو اسم المستخدم) وكلمة المرور للدخول إلى حسابك أو لوحة الإدارة.'
                : 'أنشئ حسابًا جديدًا بالبريد الإلكتروني وكلمة المرور لحفظ قائمتك ومتابعة طلباتك.'}
            </p>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-[#b7c9ef] mb-1">الاسم</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="مثال: رحال أحمد"
                  className="w-full min-h-[44px] rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#D92321] focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#b7c9ef] mb-1">
                البريد الإلكتروني أو اسم المستخدم
              </label>
              <input
                type="text"
                required
                dir="ltr"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="admin@rahaltv.com أو admin"
                className="w-full min-h-[44px] rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#D92321] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#b7c9ef] mb-1">كلمة المرور</label>
              <input
                type="password"
                required
                minLength={6}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full min-h-[44px] rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#D92321] focus:outline-none"
              />
            </div>

            {authError && (
              <div className="rounded-xl bg-[#D92321]/15 border border-[#D92321]/40 p-3 text-xs text-red-200 leading-relaxed">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={signingIn}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#D92321] hover:bg-[#dc0e30] disabled:opacity-60 py-3.5 text-sm font-extrabold text-white shadow-lg transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>
                {signingIn
                  ? 'جاري المعالجة...'
                  : mode === 'login'
                    ? 'تسجيل الدخول'
                    : 'إنشاء الحساب'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthError(null);
                setMode((m) => (m === 'login' ? 'register' : 'login'));
              }}
              className="w-full min-h-[40px] text-center text-xs font-bold text-[#b7c9ef] hover:text-white pt-1 cursor-pointer"
            >
              {mode === 'login'
                ? 'ليس لديك حساب؟ إنشاء حساب عضو جديد'
                : 'لديك حساب بالفعل؟ العودة لتسجيل الدخول'}
            </button>

            <div className="flex items-center gap-3 pt-1">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[11px] font-bold text-[#b7c9ef]/60">أو</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <button
              type="button"
              disabled={signingIn}
              onClick={() => void handleGoogleSignIn()}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1a242e] hover:bg-[#23313f] border border-white/15 disabled:opacity-60 py-3 text-xs font-extrabold text-white transition-colors cursor-pointer"
            >
              <Globe className="w-4 h-4 text-[#f9c400]" />
              <span>تسجيل الدخول بحساب Google</span>
            </button>

            {onContinueAsGuest && (
              <div className="pt-1 space-y-1.5">
                <button
                  type="button"
                  disabled={signingIn}
                  onClick={() => {
                    if (isGuest) {
                      setShowAuthInGuest(false);
                    } else {
                      onContinueAsGuest();
                      onClose();
                    }
                  }}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 py-3 text-xs font-extrabold text-[#f9c400] transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isGuest ? 'العودة إلى وضع الضيف' : 'المتابعة كضيف'}</span>
                </button>
                <p className="text-[11px] text-center text-[#b7c9ef]/75">
                  شاهد وتصفح الأقسام والبحث فوراً دون إنشاء حساب أو ربط قاعدة بيانات.
                </p>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

/* ---------------- Footer Topics & Visitor Requests Modal ---------------- */
interface FooterInfoModalProps {
  topic: FooterTopic | null;
  onClose: () => void;
  firebaseUser: User | null;
  isGuest?: boolean;
  onOpenLogin: () => void;
  requests: VisitorRequest[];
  onAddRequest: (req: { title: string; type: VisitorRequest['type']; notes: string }) => Promise<void>;
}

export function FooterInfoModal({
  topic,
  onClose,
  firebaseUser,
  isGuest = false,
  onOpenLogin,
  requests,
  onAddRequest,
}: FooterInfoModalProps) {
  const [reqTitle, setReqTitle] = useState('');
  const [reqType, setReqType] = useState<VisitorRequest['type']>('فيلم');
  const [reqNotes, setReqNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useDialogAccessibility(Boolean(topic), onClose);

  if (!topic) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reqTitle.trim() || !firebaseUser) return;
    setSubmitting(true);
    try {
      await onAddRequest({ title: reqTitle.trim(), type: reqType, notes: reqNotes.trim() });
      setReqTitle('');
      setReqNotes('');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="معلومات وطلبات RahaL TV"
      data-rtv-focus-trap="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
    >
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl rounded-2xl sm:rounded-3xl bg-[#0c1821] border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 bg-[#1a242e] px-4 py-3.5 sm:px-6 sm:py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            {topic === 'requests' ? (
              <Sparkles className="w-5 h-5 text-[#4CAF50] shrink-0" />
            ) : topic === 'community' ? (
              <Users className="w-5 h-5 text-[#D92321] shrink-0" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-[#f9c400] shrink-0" />
            )}
            <h2 className="font-display text-base sm:text-lg font-extrabold text-white truncate">
              {topic === 'terms' && 'سياسة الاستخدام'}
              {topic === 'privacy' && 'سياسة الخصوصية'}
              {topic === 'community' && 'مجتمع RahaL TV'}
              {topic === 'requests' && 'اتصل بنا وطلبات الزوار — اطلب فيلمك أو مسلسلك'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-white/5 text-white hover:bg-[#D92321] cursor-pointer shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 max-h-[75vh] sm:max-h-[70vh] overflow-y-auto space-y-4 text-sm leading-relaxed text-[#b7c9ef]">
          {topic === 'terms' && (
            <>
              <p className="text-white font-bold">مرحبًا بك في منصة RahaL TV الترفيهية.</p>
              <p>
                تتيح المنصة فهرسة واستعراض أحدث الأفلام والمسلسلات العربية والعالمية وعروض
                المصارعة بجودات متعددة، مع مراعاة قواعد الاستخدام الآمن وعدم إعادة نشر المحتوى
                لأغراض تجارية.
              </p>
              <p>
                يتم تحديث السيرفرات يوميًا لضمان استقرار المشاهدة وتوفير روابط تحميل مباشرة خالية
                من الأعطال.
              </p>
            </>
          )}

          {topic === 'privacy' && (
            <>
              <p className="text-white font-bold">حماية خصوصية الزوار أولوية أساسية لدينا.</p>
              <p>
                تُحفظ قائمة المشاهدة (قائمتي) وتفضيلات البحث محليًا على جهازك فقط دون تتبع بيانات
                حساسة أو مشاركتها مع أي طرف خارجي.
              </p>
            </>
          )}

          {topic === 'community' && (
            <>
              <p className="text-white font-bold">انضم إلى مجتمع عشاق السينما والدراما على RahaL TV.</p>
              <p>
                يمكنك متابعة أحدث إصدارات رمضان 2026، وتقييمات المشاهدين المباشرة، وترشيح الأعمال
                المفضلة ليتم إضافتها في قائمة العروض المثبتة.
              </p>
            </>
          )}

          {topic === 'requests' && (
            <div className="space-y-5">
              {!firebaseUser ? (
                <div className="rounded-2xl bg-[#1a242e] border border-white/10 p-5 text-center space-y-3">
                  <p className="text-sm font-bold text-white leading-relaxed">
                    {isGuest
                      ? 'أنت تتصفح حالياً كضيف — يمكنك المشاهدة والتصفح بحرية، ولإرسال طلب عمل ومتابعة حالة تنفيذه يرجى تسجيل الدخول بحسابك.'
                      : 'سجّل الدخول بحسابك لإرسال طلبك ومتابعة حالة تنفيذه في قاعدة البيانات'}
                  </p>
                  <button
                    type="button"
                    onClick={onOpenLogin}
                    className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#D92321] hover:bg-[#dc0e30] px-5 py-2.5 text-xs font-extrabold text-white cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>تسجيل الدخول بحساب</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-white mb-1">اسم العمل المطلوب</label>
                      <input
                        type="text"
                        required
                        value={reqTitle}
                        onChange={(e) => setReqTitle(e.target.value)}
                        placeholder="مثال: فيلم Dune Part Three"
                        className="w-full min-h-[44px] rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#4CAF50] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-white mb-1">النوع</label>
                      <select
                        value={reqType}
                        onChange={(e) => setReqType(e.target.value as VisitorRequest['type'])}
                        className="w-full min-h-[44px] rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-sm text-white focus:border-[#4CAF50] focus:outline-none"
                      >
                        <option value="فيلم">فيلم</option>
                        <option value="مسلسل">مسلسل</option>
                        <option value="عرض مصارعة">عرض مصارعة</option>
                        <option value="مسرحية">مسرحية</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white mb-1">
                      ملاحظات أو سنة الإصدار (اختياري)
                    </label>
                    <input
                      type="text"
                      value={reqNotes}
                      onChange={(e) => setReqNotes(e.target.value)}
                      placeholder="يفضل جودة BluRay 1080p مترجم"
                      className="w-full min-h-[44px] rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#4CAF50] focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] px-5 py-2.5 text-xs font-extrabold text-white transition-colors cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>{submitting ? 'جاري الإرسال...' : 'إرسال الطلب لإدارة RahaL TV'}</span>
                  </button>
                  {submitted && (
                    <p className="inline-flex items-center gap-1.5 mr-3 text-xs font-bold text-[#4CAF50]">
                      <CheckCircle2 className="w-4 h-4" />
                      تم حفظ طلبك في قاعدة البيانات!
                    </p>
                  )}
                </form>
              )}

              {requests.length > 0 && (
                <div className="border-t border-white/10 pt-4">
                  <p className="text-xs font-extrabold text-white mb-2.5">
                    طلباتك المسجلة ({requests.length}):
                  </p>
                  <div className="space-y-2">
                    {requests.map((req) => (
                      <div
                        key={req.id}
                        className="rounded-xl bg-[#1a242e] px-3.5 py-2.5 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="font-bold text-white">{req.title}</span>
                            {req.notes && <span className="text-[#b7c9ef] mr-2">— {req.notes}</span>}
                          </div>
                          <span className="rounded-md bg-[#4CAF50]/20 px-2 py-0.5 font-bold text-[#4CAF50] shrink-0">
                            {req.status === 'completed'
                              ? 'تمت الإضافة'
                              : req.status === 'approved'
                                ? 'موافق عليه'
                                : req.status === 'rejected'
                                  ? 'مرفوض'
                                  : 'قيد المراجعة'}
                          </span>
                        </div>
                        {req.adminNote && (
                          <p className="text-[11px] text-[#f9c400]">رد الإدارة: {req.adminNote}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
