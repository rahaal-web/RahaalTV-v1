import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  HardDrive,
  History,
  Info,
  LogIn,
  Play,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {
  MediaItem,
  RecentlyWatchedPreferences,
  RecentlyWatchedRecord,
} from '../types/media';
import { FALLBACK_POSTER } from '../lib/mediaFilters';
import { optimizeTmdbUrl } from '../lib/mediaImages';
import { formatRelativeArabicTime } from '../lib/recentlyWatched';
import { OptimizedImage } from './OptimizedImage';

interface WatchHistoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: RecentlyWatchedRecord[];
  catalog: MediaItem[];
  isSignedIn: boolean;
  prefs: RecentlyWatchedPreferences;
  onUpdatePrefs: (patch: Partial<RecentlyWatchedPreferences>) => void;
  onResumeItem: (record: RecentlyWatchedRecord, matchedMedia?: MediaItem) => void;
  onOpenDetails: (record: RecentlyWatchedRecord, matchedMedia?: MediaItem) => void;
  onRemoveItem: (record: RecentlyWatchedRecord) => Promise<void> | void;
  onClearAll: () => Promise<void> | void;
  onOpenLogin: () => void;
}

export function WatchHistoryManagerModal({
  isOpen,
  onClose,
  items,
  catalog,
  isSignedIn,
  prefs,
  onUpdatePrefs,
  onResumeItem,
  onOpenDetails,
  onRemoveItem,
  onClearAll,
  onOpenLogin,
}: WatchHistoryManagerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const catalogById = useMemo(() => {
    const map = new Map<string, MediaItem>();
    for (const m of catalog) {
      map.set(m.id, m);
    }
    return map;
  }, [catalog]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((rec) => {
      if (prefs.hideCompleted && rec.completed) return false;
      if (!q) return true;
      const matched = catalogById.get(rec.mediaId);
      const text = `${matched?.title || rec.title} ${matched?.englishTitle || rec.englishTitle || ''}`.toLowerCase();
      return text.includes(q);
    });
  }, [items, searchQuery, prefs.hideCompleted, catalogById]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConfirmClear = async () => {
    setClearingAll(true);
    try {
      await onClearAll();
      setConfirmClearAll(false);
    } finally {
      setClearingAll(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="إدارة سجل المشاهدة"
      data-rtv-focus-trap="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
    >
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl sm:rounded-3xl bg-[#0c1821] border border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 bg-[#1a242e] px-4 py-3.5 sm:px-6 sm:py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <History className="w-5 h-5 text-[#E50914] shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-extrabold text-white truncate">
                سجل المشاهدة — شاهدته مؤخراً ({items.length})
              </h2>
              <p className="text-[11px] text-[#b7c9ef] flex items-center gap-1.5 mt-0.5">
                {isSignedIn ? (
                  <>
                    <Cloud className="w-3.5 h-3.5 text-[#4CAF50] shrink-0" />
                    <span>متزامن سحابياً مع حسابك على جميع أجهزتك</span>
                  </>
                ) : (
                  <>
                    <HardDrive className="w-3.5 h-3.5 text-[#f9c400] shrink-0" />
                    <span>محفوظ محلياً في هذا المتصفح (وضع الضيف)</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق سجل المشاهدة"
            className="inline-flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-white/5 text-white hover:bg-[#D92321] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sync Banner for Guest + Controls */}
        <div className="p-4 border-b border-white/[0.08] bg-[#101c26] space-y-3">
          {!isSignedIn && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f9c400]/10 border border-[#f9c400]/30 px-3.5 py-2.5 text-xs">
              <span className="text-[#fde68a] font-bold">
                سجّل الدخول لحفظ سجل مشاهداتك على السحابة ودمج سجل هذا الجهاز مع حسابك تلقائياً.
              </span>
              <button
                type="button"
                onClick={onOpenLogin}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] px-3 py-1.5 text-[11px] font-black text-[#06131c] cursor-pointer shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>تسجيل الدخول</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
            <div className="sm:col-span-6 relative">
              <Search className="w-4 h-4 text-[#b7c9ef]/60 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث داخل سجل المشاهدة..."
                className="w-full rounded-xl bg-[#0c1821] border border-white/10 pr-9 pl-3 py-2 text-xs text-white focus:border-[#E50914] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-3 flex items-center gap-2">
              <label className="text-[11px] font-bold text-[#b7c9ef] whitespace-nowrap">
                الحد الأقصى:
              </label>
              <select
                value={prefs.maxItems}
                onChange={(e) => onUpdatePrefs({ maxItems: Number(e.target.value) })}
                className="w-full rounded-xl bg-[#0c1821] border border-white/10 px-2.5 py-2 text-xs font-bold text-white cursor-pointer"
              >
                <option value={12}>12 عنصر</option>
                <option value={24}>24 عنصر</option>
                <option value={40}>40 عنصر</option>
                <option value={60}>60 عنصر</option>
              </select>
            </div>

            <div className="sm:col-span-3 flex items-center justify-end">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.hideCompleted}
                  onChange={(e) => onUpdatePrefs({ hideCompleted: e.target.checked })}
                  className="h-4 w-4 accent-[#4CAF50] cursor-pointer"
                />
                <span>إخفاء المكتملة</span>
              </label>
            </div>
          </div>

          {items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-[#b7c9ef]">
                يعرض {filteredItems.length} من أصل {items.length} عمل
              </span>

              {!confirmClearAll ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#D92321]/15 hover:bg-[#D92321] border border-[#D92321]/40 px-3 py-1.5 text-xs font-extrabold text-[#ff9ea0] hover:text-white transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>مسح السجل بالكامل</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#D92321]/15 border border-[#D92321]/45 px-3 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#f9c400] shrink-0" />
                  <span className="text-[11px] font-bold text-white">تأكيد مسح السجل؟</span>
                  <button
                    type="button"
                    disabled={clearingAll}
                    onClick={() => void handleConfirmClear()}
                    className="rounded-lg bg-[#D92321] hover:bg-[#b71c1c] px-2.5 py-1 text-[11px] font-black text-white cursor-pointer disabled:opacity-50"
                  >
                    {clearingAll ? 'جاري المسح...' : 'نعم، امسح الكل'}
                  </button>
                  <button
                    type="button"
                    disabled={clearingAll}
                    onClick={() => setConfirmClearAll(false)}
                    className="rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* List Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <History className="w-12 h-12 mx-auto text-[#b7c9ef]/25" />
              <p className="text-sm font-bold text-white">
                {items.length === 0
                  ? 'لم تشاهد أي عمل بعد'
                  : 'لا توجد نتائج مطابقة لبحثك في السجل'}
              </p>
              <p className="text-xs text-[#b7c9ef]">
                سيُضاف أي فيلم أو مسلسل هنا فور بدء التشغيل داخل المشغّل.
              </p>
            </div>
          ) : (
            filteredItems.map((rec) => {
              const matched = catalogById.get(rec.mediaId);
              const poster = optimizeTmdbUrl(
                matched?.poster_url || matched?.poster || rec.poster || FALLBACK_POSTER,
                'w185'
              );
              const title = matched?.title || rec.title;
              const pct = Math.min(100, Math.max(0, rec.progressPct || 0));

              return (
                <div
                  key={rec.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-[#1a242e]/75 border border-white/[0.07] p-2.5 sm:p-3 hover:border-white/20 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      onClick={() => onResumeItem(rec, matched)}
                      className="h-18 w-13 rounded-xl overflow-hidden shrink-0 cursor-pointer border border-white/10"
                    >
                      <OptimizedImage
                        src={poster}
                        fallbackSrc={FALLBACK_POSTER}
                        alt={title}
                        slot="card_small"
                        loading="lazy"
                        className="h-full w-full"
                        imgClassName="object-cover object-top"
                      />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="font-display text-sm font-bold text-white truncate">
                          {title}
                        </h3>
                        {rec.completed ? (
                          <span className="inline-flex items-center gap-1 rounded bg-[#4CAF50]/20 border border-[#4CAF50]/40 px-1.5 py-0.5 text-[10px] font-bold text-[#4CAF50]">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            مكتمل
                          </span>
                        ) : null}
                      </div>

                      <p className="text-[11px] text-[#b7c9ef] truncate">
                        {rec.episodeNumber
                          ? `${rec.seasonNumber ? `الموسم ${rec.seasonNumber} • ` : ''}الحلقة ${rec.episodeNumber}`
                          : rec.kind === 'series'
                            ? 'مسلسل'
                            : 'فيلم'}{' '}
                        • {formatRelativeArabicTime(rec.lastWatchedAtMs)}
                      </p>

                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 max-w-[160px] rounded-full bg-white/10 overflow-hidden">
                          <div
                            className={`h-full ${rec.completed ? 'bg-[#4CAF50]' : 'bg-[#E50914]'}`}
                            style={{ width: `${Math.max(pct, 5)}%` }}
                          />
                        </div>
                        {rec.durationSec > 0 && (
                          <span className="font-latin text-[10px] text-[#b7c9ef] tabular-nums">
                            {pct}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onResumeItem(rec, matched)}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-3 py-2 text-xs font-extrabold text-white cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span className="hidden sm:inline">{rec.completed ? 'إعادة' : 'متابعة'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenDetails(rec, matched)}
                      aria-label={`صفحة تفاصيل ${title}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] hover:bg-white/15 text-[#b7c9ef] hover:text-white cursor-pointer"
                    >
                      <Info className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => void onRemoveItem(rec)}
                      aria-label={`حذف ${title} من السجل`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-[#b7c9ef] hover:bg-[#D92321] hover:text-white cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
