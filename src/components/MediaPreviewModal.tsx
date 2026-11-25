import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Eye,
  Film,
  Globe,
  Languages,
  Layers,
  LayoutGrid,
  Link2,
  Play,
  Server,
  Star,
  Tv,
  Users,
  X,
} from 'lucide-react';
import { isLikelyNonVideoWebsiteUrl } from '../lib/clientScraper';
import {
  FALLBACK_BACKDROP,
  FALLBACK_POSTER,
} from '../lib/mediaFilters';
import { getBackdropUrl, getPosterUrl } from '../lib/mediaImages';
import { OptimizedImage } from './OptimizedImage';
import { resolveDisplayShortUrl } from '../lib/permalink';
import {
  buildPlayerThemeVars,
  loadStoredPlayerTheme,
  normalizePlayerTheme,
} from '../lib/playerTheme';
import {
  loadStoredPopupShieldConfig,
  resolveEffectiveShieldDecision,
} from '../lib/popupShield';
import { HomeCardStyle, MediaItem, PlayerThemeConfig, PopupShieldConfig } from '../types/media';
import { MovieCard } from './MovieCard';

interface MediaPreviewModalProps {
  item: MediaItem | null;
  onClose: () => void;
  onConfirmPublish?: () => void;
  publishLabel?: string;
  busy?: boolean;
  playerTheme?: PlayerThemeConfig;
  popupShieldConfig?: PopupShieldConfig;
  cardStyle?: HomeCardStyle;
}

function extractSafePreviewSrc(embedCode?: string, url?: string): string | null {
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

export function MediaPreviewModal({
  item,
  onClose,
  onConfirmPublish,
  publishLabel = 'تأكيد النشر في قاعدة البيانات',
  busy = false,
  playerTheme,
  popupShieldConfig,
  cardStyle = 'clean',
}: MediaPreviewModalProps) {
  const [previewMode, setPreviewMode] = useState<'page' | 'card'>('page');
  const [previewWatchlist, setPreviewWatchlist] = useState(false);
  const [testServerIdx, setTestServerIdx] = useState<number | null>(null);
  const [selectedEpNum, setSelectedEpNum] = useState<number>(
    item?.seasons?.[0]?.episodes?.[0]?.number || 1
  );
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setTestServerIdx(null);
    setPreviewWatchlist(false);
    setSelectedEpNum(item?.seasons?.[0]?.episodes?.[0]?.number || 1);
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function') {
        window.setTimeout(() => prev.focus(), 0);
      }
    };
  }, [item, onClose]);

  if (!item) return null;

  const activeTheme = normalizePlayerTheme(playerTheme || loadStoredPlayerTheme());
  const themeVars = buildPlayerThemeVars(activeTheme);

  const episodes = item.seasons?.[0]?.episodes || [];
  const activeEp = episodes.find((e) => e.number === selectedEpNum);
  const displayedServers =
    activeEp?.servers && activeEp.servers.length > 0 ? activeEp.servers : item.servers;
  const dedicatedUrl = resolveDisplayShortUrl(
    item,
    episodes.length > 0 ? selectedEpNum : undefined
  );

  const activeTestServer = testServerIdx !== null ? displayedServers[testServerIdx] : null;
  const activeTestSrc = activeTestServer
    ? extractSafePreviewSrc(activeTestServer.embedCode, activeTestServer.url)
    : null;
  const activeTestIsPortal = Boolean(activeTestSrc && isLikelyNonVideoWebsiteUrl(activeTestSrc));
  const isDashStream = Boolean(activeTestSrc && /\.mpd(\?|$)/i.test(activeTestSrc));
  const isDirectVideo = Boolean(activeTestSrc && /\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(activeTestSrc));
  const shieldDecision = resolveEffectiveShieldDecision(
    activeTestSrc,
    popupShieldConfig || loadStoredPopupShieldConfig()
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.title ? `معاينة ${item.title}` : 'معاينة العمل'}
      data-rtv-focus-trap="true"
      className="fixed inset-0 z-[55] flex items-center justify-center p-2 sm:p-4"
    >
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      <div className="rtv-site-preview relative z-10 w-[96vw] sm:w-[95vw] max-w-6xl max-h-[94vh] flex flex-col rounded-2xl sm:rounded-3xl bg-[#06131c] border border-[#f9c400]/35 shadow-2xl overflow-hidden">
        {/* Top Preview Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 bg-[#1a242e] px-3.5 py-3 sm:px-5 border-b border-white/10">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#f9c400] px-2.5 py-1 text-[11px] font-black text-[#06131c] shrink-0">
              <Eye className="w-3.5 h-3.5" />
              <span>معاينة قبل النشر</span>
            </span>
            <h3 className="font-display text-sm sm:text-base font-extrabold text-white truncate">
              {item.title || 'بدون عنوان'}
            </h3>
            <span className="text-[11px] font-bold text-[#b7c9ef] hidden md:inline">
              — لم يتم الحفظ في قاعدة البيانات بعد
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
            {/* Switch between Page Preview and Card Preview */}
            <div className="flex flex-1 sm:flex-none rounded-xl bg-[#0c1821] p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setPreviewMode('page')}
                className={`flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 rounded-lg px-3 min-h-[36px] sm:min-h-0 py-1 text-xs font-extrabold cursor-pointer whitespace-nowrap ${
                  previewMode === 'page'
                    ? 'bg-[#D92321] text-white'
                    : 'text-[#b7c9ef] hover:text-white'
                }`}
              >
                <Tv className="w-3.5 h-3.5" />
                <span>صفحة العمل</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('card')}
                className={`flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 rounded-lg px-3 min-h-[36px] sm:min-h-0 py-1 text-xs font-extrabold cursor-pointer whitespace-nowrap ${
                  previewMode === 'card'
                    ? 'bg-[#D92321] text-white'
                    : 'text-[#b7c9ef] hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>البطاقة في الرئيسية</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-[#D92321] cursor-pointer shrink-0"
              aria-label="إغلاق المعاينة"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Live Preview Body */}
        <div className="flex-1 overflow-y-auto">
          {previewMode === 'card' ? (
            <div className="p-6 sm:p-10 space-y-6">
              <div className="text-center space-y-1">
                <p className="text-sm font-extrabold text-white">
                  هكذا ستظهر بطاقة العمل في الصفحة الرئيسية والأقسام ونتائج البحث:
                </p>
                <p className="text-xs text-[#b7c9ef]">
                  مرّر المؤشر فوق البطاقة لاختبار تأثير الانقلاب ثلاثي الأبعاد والبيانات السريعة
                </p>
              </div>
              <div className="mx-auto max-w-[230px]">
                <MovieCard
                  item={item}
                  onSelect={() => setPreviewMode('page')}
                  isInWatchlist={previewWatchlist}
                  onToggleWatchlist={() => setPreviewWatchlist((v) => !v)}
                  variant={cardStyle}
                />
              </div>
            </div>
          ) : (
            <div className="pb-6">
              {/* Hero Head Preview */}
              <div className="relative min-h-[250px] overflow-hidden border-b border-white/[0.08] bg-[#0c1821]">
                <OptimizedImage
                  src={getBackdropUrl(item, 'backdrop_card')}
                  fallbackSrc={FALLBACK_BACKDROP}
                  alt={item.title}
                  slot="backdrop_card"
                  loading="eager"
                  className="!absolute inset-0 h-full w-full opacity-90"
                  imgClassName="object-cover object-center"
                />
                <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-[#06131c] via-[#06131c]/30 to-black/15" />
                <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-l from-[#06131c]/70 via-[#06131c]/20 to-transparent" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4 p-6 pt-16 min-h-[250px]">
                  <div className="space-y-2 max-w-2xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                    <div className="flex flex-wrap gap-1.5">
                      {item.categories.map((cat) => (
                        <span
                          key={cat}
                          className="rounded-lg bg-[#D92321]/20 border border-[#D92321]/40 px-2.5 py-0.5 text-[11px] font-bold text-white"
                        >
                          {cat}
                        </span>
                      ))}
                      {item.pinned && (
                        <span className="rounded-lg bg-[#f9c400] px-2.5 py-0.5 text-[11px] font-black text-[#06131c]">
                          مثبت في الرئيسية
                        </span>
                      )}
                    </div>
                    <h1
                      style={{ fontSize: 'var(--rtv-detail-title-size, 20px)' }}
                      className="font-display font-extrabold text-white leading-snug"
                    >
                      {item.title} بجودة عالية
                    </h1>
                    <p className="text-xs sm:text-sm text-[#b7c9ef]">
                      {item.tagline || item.story.slice(0, 140)}
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-3 self-start md:self-end rounded-2xl bg-[#1a242e]/95 border border-[#4CAF50]/35 px-4 py-2.5 shadow-xl">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4CAF50]/20 border border-[#4CAF50]/40 text-[#f9c400]">
                      <Star className="w-5 h-5 fill-current" />
                    </div>
                    <div>
                      <div dir="ltr" className="inline-flex items-baseline gap-1">
                        <span className="font-latin text-xl font-black text-white tabular-nums">
                          {item.communityRating && item.communityRating.count > 0
                            ? item.communityRating.average.toFixed(1)
                            : '—'}
                        </span>
                        <span className="font-latin text-xs font-bold text-[#b7c9ef]">/ 5</span>
                      </div>
                      <p className="text-[10px] font-bold text-[#b7c9ef]">
                        {item.communityRating && item.communityRating.count > 0
                          ? `${item.communityRating.count} تقييم المشاهدين`
                          : 'تقييم المشاهدين'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Poster & Details Grid */}
              <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                <div className="md:col-span-4 lg:col-span-3">
                  <div className="relative aspect-[3/4] w-full max-w-[240px] mx-auto md:max-w-none overflow-hidden rounded-3xl border-4 border-[#1a242e] bg-[#0c1821] shadow-2xl">
                    <div className="moov-ribbon bg-[#D92321] py-1 text-[11px] font-black tracking-wider text-white font-latin uppercase">
                      {item.quality}
                    </div>
                    <OptimizedImage
                      src={getPosterUrl(item, 'detail_poster')}
                      fallbackSrc={FALLBACK_POSTER}
                      alt={item.title}
                      slot="detail_poster"
                      loading="eager"
                      className="h-full w-full"
                      imgClassName="object-cover object-top"
                    />
                  </div>
                </div>

                <div className="md:col-span-8 lg:col-span-9 space-y-5">
                  {/* Story */}
                  <div className="rounded-2xl bg-[#0c1821] border border-white/[0.08] p-5">
                    <h4 className="font-display text-base font-extrabold text-white mb-2 flex items-center gap-2">
                      <span className="h-4 w-1.5 rounded-full bg-[#D92321]" />
                      قصة العرض
                    </h4>
                    <p className="text-xs sm:text-sm leading-relaxed text-[#b7c9ef]">{item.story}</p>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <div className="rounded-xl bg-[#1a242e]/70 px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <span className="text-[#b7c9ef] flex items-center gap-1.5">
                        <Film className="w-3.5 h-3.5 text-[#D92321]" />
                        النوع
                      </span>
                      <span className="font-bold text-white truncate">{item.genres.join('، ')}</span>
                    </div>
                    <div className="rounded-xl bg-[#1a242e]/70 px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <span className="text-[#b7c9ef] flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#D92321]" />
                        السنة
                      </span>
                      <span className="font-latin font-bold text-white">{item.year}</span>
                    </div>
                    <div className="rounded-xl bg-[#1a242e]/70 px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <span className="text-[#b7c9ef] flex items-center gap-1.5">
                        <Languages className="w-3.5 h-3.5 text-[#D92321]" />
                        اللغة
                      </span>
                      <span className="font-bold text-white truncate">{item.language}</span>
                    </div>
                    <div className="rounded-xl bg-[#1a242e]/70 px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <span className="text-[#b7c9ef] flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-[#D92321]" />
                        البلد
                      </span>
                      <span className="font-bold text-white truncate">{item.country}</span>
                    </div>
                    <div className="rounded-xl bg-[#1a242e]/70 px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <span className="text-[#b7c9ef] flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#D92321]" />
                        المدة
                      </span>
                      <span className="font-bold text-white">{item.duration}</span>
                    </div>
                    <div className="rounded-xl bg-[#1a242e]/70 px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <span className="text-[#b7c9ef] flex items-center gap-1.5">
                        <Tv className="w-3.5 h-3.5 text-[#D92321]" />
                        الجودة
                      </span>
                      <span className="font-latin font-black text-[#f9c400]">{item.quality}</span>
                    </div>
                  </div>

                  {/* Watch Servers Preview (Compact Number + Quality + Per-Episode Switcher) */}
                  <div className="rounded-2xl bg-[#0c1821] border border-white/[0.08] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-2">
                        <Server className="w-4 h-4 text-[#D92321]" />
                        <span>
                          سيرفرات المشاهدة
                          {episodes.length > 0 ? ` — الحلقة ${String(selectedEpNum).padStart(2, '0')}` : ''} ({displayedServers.length})
                        </span>
                      </h4>
                      <span className="text-[11px] text-[#b7c9ef]">اضغط على رقم السيرفر لتجربة تشغيله الآن</span>
                    </div>

                    {episodes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pb-1">
                        {episodes.map((ep) => {
                          const isEp = ep.number === selectedEpNum;
                          return (
                            <button
                              key={ep.number}
                              type="button"
                              onClick={() => {
                                setSelectedEpNum(ep.number);
                                setTestServerIdx(null);
                              }}
                              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-extrabold cursor-pointer ${
                                isEp
                                  ? 'bg-[#D92321] border-[#ff5a58] text-white'
                                  : 'bg-[#1a242e] border-white/10 text-[#b7c9ef] hover:text-white'
                              }`}
                            >
                              <span>الحلقة {String(ep.number).padStart(2, '0')}</span>
                              {ep.servers && ep.servers.length > 0 && (
                                <span className="font-latin rounded bg-black/25 px-1 text-[10px] text-[#f9c400]">
                                  {ep.servers.length}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {displayedServers.length === 0 ? (
                      <p className="text-xs text-[#f9c400]">لم تُضف سيرفرات مشاهدة صالحة لهذه الحلقة/العمل بعد.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {displayedServers.map((srv, idx) => {
                          const cleanQ =
                            String(srv.quality || item.quality || 'HD')
                              .replace(/مستورد|embed/gi, '')
                              .trim() || 'HD';
                          const isTesting = testServerIdx === idx;
                          return (
                            <button
                              key={srv.id || idx}
                              type="button"
                              onClick={() => setTestServerIdx(isTesting ? null : idx)}
                              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 cursor-pointer transition-all ${
                                isTesting
                                  ? 'bg-[#D92321] border-[#ff5a58] text-white shadow-[0_6px_18px_rgba(217,35,33,0.4)]'
                                  : 'bg-[#1a242e] border-white/10 text-white hover:border-[#D92321]'
                              }`}
                            >
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span className="font-latin flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-black/30 text-[11px] font-black tabular-nums">
                                  {idx + 1}
                                </span>
                                <span className="text-xs font-extrabold truncate">
                                  سيرفر {idx + 1}
                                </span>
                              </span>
                              <span className="font-latin text-[10px] font-black text-[#f9c400] shrink-0">
                                {cleanQ}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Inline Test Player inside Preview (Themed Cinema Frame) */}
                    {testServerIdx !== null && (
                      <div
                        style={{
                          ...themeVars,
                          backgroundColor: 'var(--pt-frame)',
                          borderColor: 'var(--pt-accent-35)',
                          borderRadius: 'var(--pt-radius)',
                          boxShadow: 'var(--pt-shadow)',
                        }}
                        className="mt-3 border overflow-hidden"
                      >
                        {activeTheme.showHeaderBar && (
                          <div
                            style={{ backgroundColor: 'var(--pt-frame)' }}
                            className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-white/[0.08] text-xs"
                          >
                            <span className="font-extrabold text-white flex items-center gap-2 min-w-0">
                              {activeTheme.showBrandBadge && (
                                <span
                                  style={{
                                    backgroundColor: 'var(--pt-accent)',
                                    color: 'var(--pt-accent-contrast)',
                                  }}
                                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                </span>
                              )}
                              <span className="truncate">
                                سيرفر {testServerIdx + 1} — {activeTheme.brandLabel}
                              </span>
                              {activeTestSrc && (
                                <span className="hidden sm:inline-flex items-center rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-[#b7c9ef]">
                                  {shieldDecision.shortLabel}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => setTestServerIdx(null)}
                              className="inline-flex items-center gap-1 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.08] px-2.5 py-1 text-[11px] font-bold text-white/85 hover:text-white transition-colors cursor-pointer shrink-0"
                            >
                              <X className="w-3 h-3" />
                              <span>إغلاق</span>
                            </button>
                          </div>
                        )}
                        <div className="relative aspect-video w-full bg-black overflow-hidden">
                          {activeTestSrc && !activeTestIsPortal ? (
                            isDashStream ? (
                              <div className="h-full flex flex-col items-center justify-center gap-2 p-4 text-center">
                                <AlertTriangle className="w-8 h-8" style={{ color: 'var(--pt-accent)' }} />
                                <p className="text-xs font-extrabold text-white">
                                  بث MPEG-DASH (.mpd) غير مدعوم مباشرة في هذا المشغل المدمج
                                </p>
                                <p className="font-latin text-[11px] text-[#b7c9ef]/70 truncate max-w-full" dir="ltr">
                                  {activeTestSrc}
                                </p>
                              </div>
                            ) : isDirectVideo ? (
                              <video src={activeTestSrc} controls autoPlay playsInline className="w-full h-full" />
                            ) : (
                              <iframe
                                key={`${activeTestSrc}-${shieldDecision.mode}`}
                                src={activeTestSrc}
                                title={`Preview Server ${testServerIdx + 1}`}
                                sandbox={shieldDecision.sandboxAttr}
                                allowFullScreen
                                allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope"
                                referrerPolicy="no-referrer"
                                className="w-full h-full border-0"
                              />
                            )
                          ) : activeTestIsPortal ? (
                            <div className="h-full flex flex-col items-center justify-center gap-2 p-4 text-center">
                              <AlertTriangle className="w-8 h-8" style={{ color: 'var(--pt-accent)' }} />
                              <p className="text-xs font-extrabold text-white">
                                تم حجب هذا الرابط لأنه صفحة موقع رئيسية وليس مشغل فيديو
                              </p>
                              <p className="font-latin text-[11px] text-[#b7c9ef]/70 truncate max-w-full" dir="ltr">
                                {activeTestSrc}
                              </p>
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center text-xs text-[#b7c9ef]">
                              لا يوجد رابط تشغيل صالح في هذا السيرفر
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dedicated Permalink & Downloads/Episodes/Cast summary */}
                  <div className="rounded-xl bg-[#0c1821] border border-white/[0.08] px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                    <span className="text-[#b7c9ef] flex items-center gap-1.5 shrink-0">
                      <Link2 className="w-3.5 h-3.5 text-[#4CAF50]" />
                      <span>الرابط المخصص للنشر:</span>
                    </span>
                    <span className="font-latin text-[#4CAF50] font-bold truncate" dir="ltr">
                      {dedicatedUrl}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="rounded-xl bg-[#0c1821] border border-white/[0.08] p-3.5">
                      <p className="font-extrabold text-white flex items-center gap-1.5 mb-1">
                        <Download className="w-3.5 h-3.5 text-[#4CAF50]" />
                        روابط التحميل
                      </p>
                      <p className="text-[#b7c9ef]">{item.downloads.length} رابط متاح</p>
                    </div>
                    <div className="rounded-xl bg-[#0c1821] border border-white/[0.08] p-3.5">
                      <p className="font-extrabold text-white flex items-center gap-1.5 mb-1">
                        <Layers className="w-3.5 h-3.5 text-[#f9c400]" />
                        المواسم والحلقات
                      </p>
                      <p className="text-[#b7c9ef]">
                        {item.seasons?.[0]?.episodes.length || 0} حلقة مضافة
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#0c1821] border border-white/[0.08] p-3.5">
                      <p className="font-extrabold text-white flex items-center gap-1.5 mb-1">
                        <Users className="w-3.5 h-3.5 text-[#D92321]" />
                        فريق العمل
                      </p>
                      <p className="text-[#b7c9ef]">{item.cast.length} ممثل</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#1a242e] px-3.5 py-3 sm:px-5 sm:py-3.5 border-t border-white/10">
          <p className="text-xs text-[#b7c9ef]">
            راجع البيانات والصورة والسيرفرات قبل اعتماد النشر النهائي.
          </p>
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2.5 text-xs font-extrabold text-white cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>العودة للتعديل</span>
            </button>
            {onConfirmPublish && (
              <button
                type="button"
                disabled={busy}
                onClick={onConfirmPublish}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-50 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{busy ? 'جاري النشر...' : publishLabel}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
