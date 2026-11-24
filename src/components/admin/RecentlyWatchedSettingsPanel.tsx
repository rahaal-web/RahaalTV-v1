import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  History,
  Laptop,
  Monitor,
  Plus,
  RotateCcw,
  Save,
  Smartphone,
  Tablet,
  Trash2,
  Tv,
} from 'lucide-react';
import type {
  MediaItem,
  RecentlyWatchedAspectRatio,
  RecentlyWatchedCardSizePreset,
  RecentlyWatchedCardStyle,
  RecentlyWatchedDeviceKey,
  RecentlyWatchedRecord,
  RecentlyWatchedSortOrder,
  RecentlyWatchedUiConfig,
} from '../../types/media';
import { RECENTLY_WATCHED_3D_STYLES } from '../../lib/cardStyles';
import {
  CARD_SIZE_PRESET_WIDTHS,
  DEFAULT_RECENTLY_WATCHED_UI_CONFIG,
  RECENTLY_WATCHED_DEVICE_LABELS,
  getCardWidthForPreset,
  normalizeRecentlyWatchedUiConfig,
  saveStoredRecentlyWatchedUiConfig,
  setRecentlyWatchedPreviewOverride,
} from '../../lib/recentlyWatchedConfig';
import { listRecentlyWatchedItems } from '../../lib/recentlyWatched';
import { RecentlyWatchedSection } from '../RecentlyWatchedSection';

interface RecentlyWatchedSettingsPanelProps {
  catalog: MediaItem[];
  uiConfig: RecentlyWatchedUiConfig;
  recentlyWatchedItems?: RecentlyWatchedRecord[];
  busyAction: boolean;
  onChangeUiConfig: (next: RecentlyWatchedUiConfig) => void;
  onSaveUiConfig: (next: RecentlyWatchedUiConfig) => Promise<void>;
  onPreviewOnSite: () => void;
  onNotify: (msg: string) => void;
}

const PREVIEW_FRAME_CLASSES: Record<RecentlyWatchedDeviceKey, string> = {
  mobile: 'max-w-[390px] mx-auto border-[#f9c400]/40',
  tablet: 'max-w-[768px] mx-auto border-white/20',
  desktop: 'w-full border-white/15',
  tv: 'w-full border-[#4CAF50]/40 ring-1 ring-[#4CAF50]/20',
};

const ASPECT_RATIO_OPTIONS: Array<{
  value: RecentlyWatchedAspectRatio;
  label: string;
}> = [
  { value: '2/3', label: '2:3 (بوستر قياسي)' },
  { value: '3/4', label: '3:4 (طولي مدمج)' },
  { value: '16/9', label: '16:9 (عرض سينمائي)' },
  { value: '4/3', label: '4:3 (تلفزيوني)' },
  { value: '1/1', label: '1:1 (مربع)' },
];

export function RecentlyWatchedSettingsPanel({
  catalog,
  uiConfig,
  recentlyWatchedItems = [],
  busyAction,
  onChangeUiConfig,
  onSaveUiConfig,
  onPreviewOnSite,
  onNotify,
}: RecentlyWatchedSettingsPanelProps) {
  const cfg = useMemo(() => normalizeRecentlyWatchedUiConfig(uiConfig), [uiConfig]);
  const [previewDevice, setPreviewDevice] = useState<RecentlyWatchedDeviceKey>('desktop');
  const [selectedDeviceTab, setSelectedDeviceTab] =
    useState<RecentlyWatchedDeviceKey>('mobile');
  const [previewHideCompleted, setPreviewHideCompleted] = useState(cfg.hideCompleted);
  const [customAddMediaId, setCustomAddMediaId] = useState('');

  const updateCfg = (patch: Partial<RecentlyWatchedUiConfig>) => {
    const next = normalizeRecentlyWatchedUiConfig({ ...cfg, ...patch });
    onChangeUiConfig(next);
  };

  const updateDeviceEntry = (
    device: RecentlyWatchedDeviceKey,
    patch: Partial<RecentlyWatchedUiConfig['deviceSettings'][RecentlyWatchedDeviceKey]>
  ) => {
    updateCfg({
      deviceSettings: {
        ...cfg.deviceSettings,
        [device]: {
          ...cfg.deviceSettings[device],
          ...patch,
        },
      },
    });
  };

  const handlePresetClick = (preset: RecentlyWatchedCardSizePreset) => {
    const width = getCardWidthForPreset(preset, cfg.cardWidthPx);
    updateCfg({ cardSizePreset: preset, cardWidthPx: width });
  };

  const handleMoveCustomId = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= cfg.customOrderIds.length) return;
    const copy = [...cfg.customOrderIds];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    updateCfg({ customOrderIds: copy });
  };

  const handleAddCustomOrderMedia = () => {
    const clean = customAddMediaId.trim();
    if (!clean) return;
    if (cfg.customOrderIds.includes(clean)) {
      onNotify('هذا العمل موجود بالفعل في الترتيب المخصص');
      return;
    }
    updateCfg({ customOrderIds: [...cfg.customOrderIds, clean] });
    setCustomAddMediaId('');
  };

  // Sample items for Live Preview (uses actual user records if present, otherwise builds realistic sample items from catalog)
  const previewRecords = useMemo<RecentlyWatchedRecord[]>(() => {
    const real =
      recentlyWatchedItems.length > 0
        ? recentlyWatchedItems
        : listRecentlyWatchedItems({
            userId: 'guest',
            isSignedIn: false,
            maxItems: cfg.maxStoredItems,
            hideCompleted: false,
            sortOrder: cfg.sortOrder,
            customOrderIds: cfg.customOrderIds,
            deduplicateItems: cfg.deduplicateItems,
          });

    let baseList: RecentlyWatchedRecord[] = real;
    if (baseList.length === 0) {
      const now = Date.now();
      baseList = catalog.slice(0, 12).map((item, idx) => ({
        id: `preview__${item.id}`,
        userId: 'preview',
        mediaId: item.id,
        slug: item.slug,
        title: item.title,
        englishTitle: item.englishTitle,
        kind: item.kind,
        year: item.year,
        quality: item.quality,
        poster: item.poster_url || item.poster,
        backdrop: item.backdrop_url || item.backdrop,
        seasonNumber: item.kind === 'series' ? 1 : undefined,
        episodeNumber: item.kind === 'series' ? (idx % 6) + 1 : undefined,
        positionSec: (idx + 2) * 420,
        durationSec: 3600,
        progressPct: idx === 3 ? 100 : Math.min(88, 18 + idx * 11),
        completed: idx === 3,
        lastWatchedAtMs: now - idx * 3600 * 1000,
        createdAtMs: now - idx * 7200 * 1000,
      }));
    }

    let ordered = [...baseList];
    if (cfg.sortOrder === 'oldest_first') {
      ordered.sort((a, b) => (a.lastWatchedAtMs || 0) - (b.lastWatchedAtMs || 0));
    } else if (cfg.sortOrder === 'custom' && cfg.customOrderIds.length > 0) {
      const rank = new Map(cfg.customOrderIds.map((id, i) => [id, i]));
      ordered.sort((a, b) => {
        const ra = rank.get(a.mediaId);
        const rb = rank.get(b.mediaId);
        if (ra !== undefined && rb !== undefined) return ra - rb;
        if (ra !== undefined) return -1;
        if (rb !== undefined) return 1;
        return (b.lastWatchedAtMs || 0) - (a.lastWatchedAtMs || 0);
      });
    } else {
      ordered.sort((a, b) => (b.lastWatchedAtMs || 0) - (a.lastWatchedAtMs || 0));
    }

    if (previewHideCompleted) {
      ordered = ordered.filter((r) => !r.completed);
    }

    return ordered.slice(0, cfg.maxStoredItems);
  }, [
    recentlyWatchedItems,
    catalog,
    cfg.maxStoredItems,
    cfg.sortOrder,
    cfg.customOrderIds,
    cfg.deduplicateItems,
    previewHideCompleted,
  ]);

  const catalogTitleById = useMemo(
    () => new Map(catalog.map((m) => [m.id, m.title])),
    [catalog]
  );

  const activeDeviceSpec = cfg.deviceSettings[selectedDeviceTab];

  return (
    <div className="rounded-3xl bg-[#0c1821] border border-white/[0.1] p-6 space-y-6">
      {/* Header + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="space-y-1">
          <h3 className="font-display text-lg font-extrabold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-[#E50914]" />
            <span>إعدادات قسم شاهدته مؤخراً – Recently Watched Settings</span>
          </h3>
          <p className="text-xs text-[#b7c9ef]">
            تحكم كامل في الشريط الأفقي الواحد (Horizontal Carousel) عبر الهاتف، التابلت، الكمبيوتر و Android TV دون تعديل بقية أقسام الصفحة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const reset = normalizeRecentlyWatchedUiConfig(
                DEFAULT_RECENTLY_WATCHED_UI_CONFIG
              );
              saveStoredRecentlyWatchedUiConfig(reset);
              onChangeUiConfig(reset);
              setPreviewHideCompleted(reset.hideCompleted);
              onNotify('تمت استعادة الإعدادات الافتراضية لقسم شاهدته مؤخراً');
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الافتراضي</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRecentlyWatchedPreviewOverride(cfg);
              onPreviewOnSite();
              onNotify('تم تفعيل المعاينة المباشرة لشريط شاهدته مؤخراً على الموقع');
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2 text-xs font-bold text-white cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-[#f9c400]" />
            <span>معاينة</span>
          </button>

          <button
            type="button"
            disabled={busyAction}
            onClick={() => void onSaveUiConfig(cfg)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4CAF50] hover:bg-emerald-600 disabled:opacity-50 px-5 py-2 text-xs font-black text-white shadow-lg shadow-[#4CAF50]/20 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{busyAction ? 'جاري الحفظ...' : 'حفظ'}</span>
          </button>
        </div>
      </div>

      {/* 5 Control Groups */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* أولاً: العرض */}
        <div className="rounded-2xl bg-[#1a242e]/65 border border-white/[0.08] p-4 space-y-3">
          <h4 className="font-display text-sm font-extrabold text-[#f9c400] border-b border-white/10 pb-2">
            أولاً: العرض والتنقل الأفقي
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              {
                key: 'enabled' as const,
                label: 'تفعيل القسم بالرئيسية',
                checked: cfg.enabled,
              },
              {
                key: 'showTitle' as const,
                label: 'إظهار عنوان القسم',
                checked: cfg.showTitle,
              },
              {
                key: 'showViewAllButton' as const,
                label: 'إظهار زر «عرض الكل»',
                checked: cfg.showViewAllButton,
              },
              {
                key: 'showArrows' as const,
                label: 'تفعيل أسهم التنقل (يمين / يسار)',
                checked: cfg.showArrows,
              },
              {
                key: 'enableDrag' as const,
                label: 'تفعيل السحب بالماوس واللمس',
                checked: cfg.enableDrag,
              },
              {
                key: 'enableWheelScroll' as const,
                label: 'دعم عجلة الماوس أفقياً عند الوقوف',
                checked: cfg.enableWheelScroll,
              },
              {
                key: 'autoScroll' as const,
                label: 'تفعيل التحريك التلقائي (Auto Scroll)',
                checked: cfg.autoScroll,
              },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between gap-2 rounded-xl bg-[#0c1821]/90 border border-white/[0.06] px-3 py-2 text-xs font-bold text-white cursor-pointer"
              >
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => updateCfg({ [item.key]: e.target.checked })}
                  className="h-4 w-4 accent-[#E50914]"
                />
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <span className="block text-[11px] font-bold text-[#b7c9ef] mb-1.5">
                اتجاه التمرير الافتراضي
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { value: 'rtl' as const, label: 'يمين إلى يسار (RTL)' },
                  { value: 'ltr' as const, label: 'يسار إلى يمين (LTR)' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateCfg({ scrollDirection: opt.value })}
                    className={`rounded-xl border py-2 px-2 text-[11px] font-extrabold cursor-pointer ${
                      cfg.scrollDirection === opt.value
                        ? 'bg-[#D92321] border-[#D92321] text-white'
                        : 'bg-[#0c1821] border-white/10 text-[#b7c9ef]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] font-bold text-[#b7c9ef] mb-1.5">
                <span>فاصل التحريك التلقائي</span>
                <span className="font-latin text-[#f9c400]">{cfg.autoScrollIntervalSec}s</span>
              </div>
              <input
                type="range"
                min={2}
                max={20}
                value={cfg.autoScrollIntervalSec}
                disabled={!cfg.autoScroll}
                onChange={(e) =>
                  updateCfg({ autoScrollIntervalSec: Number(e.target.value) || 5 })
                }
                className="w-full accent-[#E50914] disabled:opacity-40"
              />
            </div>
          </div>
        </div>

        {/* ثانياً: حجم البطاقات */}
        <div className="rounded-2xl bg-[#1a242e]/65 border border-white/[0.08] p-4 space-y-3">
          <h4 className="font-display text-sm font-extrabold text-[#f9c400] border-b border-white/10 pb-2">
            ثانياً: حجم البطاقات وعناصرها
          </h4>

          <div>
            <span className="block text-[11px] font-bold text-[#b7c9ef] mb-1.5">
              تصميم البطاقة ثلاثي الأبعاد (7 أشكال احترافية)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {RECENTLY_WATCHED_3D_STYLES.map((styleMeta, idx) => (
                <button
                  key={styleMeta.id}
                  type="button"
                  onClick={() =>
                    updateCfg({ cardStyle: styleMeta.id as RecentlyWatchedCardStyle })
                  }
                  className={`rounded-xl border py-2 px-2 text-right transition-colors cursor-pointer ${
                    cfg.cardStyle === styleMeta.id
                      ? 'bg-[#D92321] border-[#D92321] text-white shadow-md'
                      : 'bg-[#0c1821] border-white/10 text-[#b7c9ef] hover:text-white'
                  }`}
                >
                  <span className="block text-[10px] font-black opacity-75">
                    0{idx + 1} • 3D
                  </span>
                  <span className="block text-[11px] font-extrabold truncate">
                    {styleMeta.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-[11px] font-bold text-[#b7c9ef] mb-1.5">
              حجم البطاقة (Preset)
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'small', label: `صغير (${CARD_SIZE_PRESET_WIDTHS.small}px)` },
                  { id: 'medium', label: `متوسط (${CARD_SIZE_PRESET_WIDTHS.medium}px)` },
                  { id: 'large', label: `كبير (${CARD_SIZE_PRESET_WIDTHS.large}px)` },
                  { id: 'custom', label: 'مخصص' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePresetClick(p.id)}
                  className={`rounded-xl border py-2 px-1.5 text-[11px] font-extrabold cursor-pointer ${
                    cfg.cardSizePreset === p.id
                      ? 'bg-[#D92321] border-[#D92321] text-white'
                      : 'bg-[#0c1821] border-white/10 text-[#b7c9ef]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center justify-between text-[11px] font-bold text-[#b7c9ef] mb-1">
                <span>عرض البطاقة</span>
                <span className="font-latin text-white">{cfg.cardWidthPx} px</span>
              </div>
              <input
                type="number"
                min={110}
                max={360}
                value={cfg.cardWidthPx}
                onChange={(e) =>
                  updateCfg({
                    cardSizePreset: 'custom',
                    cardWidthPx: Number(e.target.value) || 176,
                  })
                }
                className="font-latin w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-1.5 text-xs font-bold text-white"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] font-bold text-[#b7c9ef] mb-1">
                <span>المسافة بين البطاقات</span>
                <span className="font-latin text-white">{cfg.cardGapPx} px</span>
              </div>
              <input
                type="number"
                min={4}
                max={40}
                value={cfg.cardGapPx}
                onChange={(e) => updateCfg({ cardGapPx: Number(e.target.value) || 14 })}
                className="font-latin w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-1.5 text-xs font-bold text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                نسبة أبعاد الصور
              </label>
              <select
                value={cfg.aspectRatio}
                onChange={(e) =>
                  updateCfg({ aspectRatio: e.target.value as RecentlyWatchedAspectRatio })
                }
                className="w-full rounded-xl bg-[#0c1821] border border-white/10 px-2.5 py-1.5 text-xs font-bold text-white"
              >
                {ASPECT_RATIO_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            {[
              {
                key: 'showMediaTitle' as const,
                label: 'إظهار اسم الفيلم/المسلسل',
                checked: cfg.showMediaTitle,
              },
              {
                key: 'showWatchedAt' as const,
                label: 'إظهار تاريخ المشاهدة',
                checked: cfg.showWatchedAt,
              },
              {
                key: 'showProgressBar' as const,
                label: 'إظهار شريط التقدم',
                checked: cfg.showProgressBar,
              },
              {
                key: 'showEpisodeInfo' as const,
                label: 'إظهار رقم الحلقة / الجودة',
                checked: cfg.showEpisodeInfo,
              },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between gap-2 rounded-xl bg-[#0c1821]/90 border border-white/[0.06] px-3 py-2 text-xs font-bold text-white cursor-pointer"
              >
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => updateCfg({ [item.key]: e.target.checked })}
                  className="h-4 w-4 accent-[#E50914]"
                />
              </label>
            ))}
          </div>
        </div>

        {/* ثالثاً: عدد الأعمال */}
        <div className="rounded-2xl bg-[#1a242e]/65 border border-white/[0.08] p-4 space-y-3">
          <h4 className="font-display text-sm font-extrabold text-[#f9c400] border-b border-white/10 pb-2">
            ثالثاً: عدد الأعمال والتحميل التدريجي
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                الحد الأقصى للأعمال المعروضة
              </label>
              <input
                type="number"
                min={6}
                max={60}
                value={cfg.maxStoredItems}
                onChange={(e) => updateCfg({ maxStoredItems: Number(e.target.value) || 24 })}
                className="font-latin w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs font-bold text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                عدد الأعمال الظاهرة في البداية
              </label>
              <input
                type="number"
                min={2}
                max={40}
                value={cfg.initialVisibleCount}
                onChange={(e) =>
                  updateCfg({ initialVisibleCount: Number(e.target.value) || 10 })
                }
                className="font-latin w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs font-bold text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                حجم الدفعة عند التمرير
              </label>
              <input
                type="number"
                min={2}
                max={20}
                disabled={!cfg.loadMoreOnScrollEnd}
                value={cfg.loadMoreBatchSize}
                onChange={(e) =>
                  updateCfg({ loadMoreBatchSize: Number(e.target.value) || 6 })
                }
                className="font-latin w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
              />
            </div>
          </div>

          <label className="flex items-center justify-between rounded-xl bg-[#0c1821]/90 border border-white/[0.06] px-3.5 py-2.5 text-xs font-bold text-white cursor-pointer">
            <span>تحميل دفعات إضافية تلقائياً عند الوصول لنهاية الشريط الأفقي</span>
            <input
              type="checkbox"
              checked={cfg.loadMoreOnScrollEnd}
              onChange={(e) => updateCfg({ loadMoreOnScrollEnd: e.target.checked })}
              className="h-4 w-4 accent-[#4CAF50]"
            />
          </label>
        </div>

        {/* رابعاً: ترتيب الأعمال */}
        <div className="rounded-2xl bg-[#1a242e]/65 border border-white/[0.08] p-4 space-y-3">
          <h4 className="font-display text-sm font-extrabold text-[#f9c400] border-b border-white/10 pb-2">
            رابعاً: ترتيب الأعمال والتصفية
          </h4>

          <div>
            <span className="block text-[11px] font-bold text-[#b7c9ef] mb-1.5">
              طريقة ترتيب السجل
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'newest_first', label: 'الأحدث مشاهدة أولاً' },
                  { id: 'oldest_first', label: 'الأقدم أولاً' },
                  { id: 'custom', label: 'ترتيب مخصص' },
                ] as Array<{ id: RecentlyWatchedSortOrder; label: string }>
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updateCfg({ sortOrder: opt.id })}
                  className={`rounded-xl border py-2 px-2 text-[11px] font-extrabold cursor-pointer ${
                    cfg.sortOrder === opt.id
                      ? 'bg-[#D92321] border-[#D92321] text-white'
                      : 'bg-[#0c1821] border-white/10 text-[#b7c9ef]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex items-center justify-between gap-2 rounded-xl bg-[#0c1821]/90 border border-white/[0.06] px-3 py-2 text-xs font-bold text-white cursor-pointer">
              <span>إخفاء الأعمال المكتملة تلقائياً</span>
              <input
                type="checkbox"
                checked={cfg.hideCompleted}
                onChange={(e) => {
                  updateCfg({ hideCompleted: e.target.checked });
                  setPreviewHideCompleted(e.target.checked);
                }}
                className="h-4 w-4 accent-[#4CAF50]"
              />
            </label>

            <label className="flex items-center justify-between gap-2 rounded-xl bg-[#0c1821]/90 border border-white/[0.06] px-3 py-2 text-xs font-bold text-white cursor-pointer">
              <span>منع تكرار الأعمال</span>
              <input
                type="checkbox"
                checked={cfg.deduplicateItems}
                onChange={(e) => updateCfg({ deduplicateItems: e.target.checked })}
                className="h-4 w-4 accent-[#4CAF50]"
              />
            </label>
          </div>

          {cfg.sortOrder === 'custom' && (
            <div className="rounded-xl bg-[#0c1821] border border-[#f9c400]/25 p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <select
                  value={customAddMediaId}
                  onChange={(e) => setCustomAddMediaId(e.target.value)}
                  className="flex-1 rounded-lg bg-[#1a242e] border border-white/10 px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="">اختر عملاً لتقديمه في الأولوية...</option>
                  {catalog.slice(0, 80).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddCustomOrderMedia}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#f9c400] px-3 py-1.5 text-xs font-black text-[#06131c] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة</span>
                </button>
              </div>

              {cfg.customOrderIds.length > 0 ? (
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {cfg.customOrderIds.map((id, idx) => (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[#1a242e]/80 px-2.5 py-1.5 text-xs"
                    >
                      <span className="text-white font-bold truncate">
                        <span className="font-latin text-[#f9c400] ml-1.5">#{idx + 1}</span>
                        {catalogTitleById.get(id) || id}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveCustomId(idx, -1)}
                          className="p-1 rounded bg-white/10 text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === cfg.customOrderIds.length - 1}
                          onClick={() => handleMoveCustomId(idx, 1)}
                          className="p-1 rounded bg-white/10 text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateCfg({
                              customOrderIds: cfg.customOrderIds.filter((x) => x !== id),
                            })
                          }
                          className="p-1 rounded bg-[#D92321]/20 text-[#ff8a88] hover:bg-[#D92321] hover:text-white cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[#b7c9ef]">
                  أضف أعمالاً أعلاه لترتيب أولوية ظهورها أولاً في الشريط (وتظهر باقي الأعمال بعدها حسب الأحدث).
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* خامساً: إعدادات كل جهاز */}
      <div className="rounded-2xl bg-[#1a242e]/65 border border-white/[0.08] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <h4 className="font-display text-sm font-extrabold text-[#f9c400]">
              خامساً: إعدادات كل جهاز (موحّد أم مخصص لكل شاشة)
            </h4>
            <p className="text-[11px] text-[#b7c9ef]">
              حدّد عرض البطاقة والمسافة وعدد البطاقات المبدئي لكل جهاز على حدة، أو اعتمد قيماً موحدة لجميع الشاشات.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#0c1821] p-1 border border-white/10">
            {[
              { id: 'unified' as const, label: 'موحد لكل الأجهزة' },
              { id: 'per_device' as const, label: 'مخصص لكل جهاز' },
            ].map((modeOpt) => (
              <button
                key={modeOpt.id}
                type="button"
                onClick={() => updateCfg({ deviceMode: modeOpt.id })}
                className={`rounded-lg px-3 py-1.5 text-xs font-extrabold cursor-pointer ${
                  cfg.deviceMode === modeOpt.id
                    ? 'bg-[#E50914] text-white'
                    : 'text-[#b7c9ef] hover:text-white'
                }`}
              >
                {modeOpt.label}
              </button>
            ))}
          </div>
        </div>

        {cfg.deviceMode === 'per_device' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: 'mobile', label: 'الهاتف', Icon: Smartphone },
                  { id: 'tablet', label: 'التابلت', Icon: Tablet },
                  { id: 'desktop', label: 'الكمبيوتر', Icon: Laptop },
                  { id: 'tv', label: 'Android TV', Icon: Tv },
                ] as Array<{
                  id: RecentlyWatchedDeviceKey;
                  label: string;
                  Icon: typeof Smartphone;
                }>
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setSelectedDeviceTab(id);
                    setPreviewDevice(id);
                  }}
                  className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 px-3 text-xs font-extrabold cursor-pointer ${
                    selectedDeviceTab === id
                      ? 'bg-[#D92321] border-[#D92321] text-white'
                      : 'bg-[#0c1821] border-white/10 text-[#b7c9ef] hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-[#0c1821] border border-white/10 p-3.5">
              <div>
                <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                  عرض البطاقة على {RECENTLY_WATCHED_DEVICE_LABELS[selectedDeviceTab]} (px)
                </label>
                <input
                  type="number"
                  min={110}
                  max={360}
                  value={activeDeviceSpec.cardWidthPx}
                  onChange={(e) =>
                    updateDeviceEntry(selectedDeviceTab, {
                      cardWidthPx: Number(e.target.value) || 150,
                    })
                  }
                  className="font-latin w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 text-xs font-bold text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                  المسافة بين البطاقات (px)
                </label>
                <input
                  type="number"
                  min={4}
                  max={40}
                  value={activeDeviceSpec.cardGapPx}
                  onChange={(e) =>
                    updateDeviceEntry(selectedDeviceTab, {
                      cardGapPx: Number(e.target.value) || 12,
                    })
                  }
                  className="font-latin w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 text-xs font-bold text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                  عدد البطاقات المبدئي
                </label>
                <input
                  type="number"
                  min={2}
                  max={40}
                  value={activeDeviceSpec.initialVisibleCount}
                  onChange={(e) =>
                    updateDeviceEntry(selectedDeviceTab, {
                      initialVisibleCount: Number(e.target.value) || 8,
                    })
                  }
                  className="font-latin w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 text-xs font-bold text-white"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-[#0c1821] border border-white/10 px-3.5 py-2.5 text-xs text-[#b7c9ef]">
            <CheckCircle2 className="w-4 h-4 text-[#4CAF50] shrink-0" />
            <span>
              الوضع الموحد مُفعّل: جميع الأجهزة تستخدم نفس عرض البطاقة ({cfg.cardWidthPx}px)، المسافة ({cfg.cardGapPx}px)، وعدد البداية ({cfg.initialVisibleCount} أعمال) في صف أفقي واحد.
            </span>
          </div>
        )}
      </div>

      {/* Live Preview Box */}
      <div className="rounded-2xl bg-[#06131c] border border-white/15 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-[#f9c400]" />
            <span className="font-display text-sm font-extrabold text-white">
              معاينة مباشرة للشريط الأفقي (Live Preview)
            </span>
            {recentlyWatchedItems.length === 0 && (
              <span className="rounded-lg bg-white/10 px-2 py-0.5 text-[10px] font-bold text-[#b7c9ef]">
                يعرض عينة من الكتالوج لعدم وجود سجل شخصي
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-[#0c1821] p-1 border border-white/10">
            {(
              [
                { id: 'mobile', label: 'هاتف', Icon: Smartphone },
                { id: 'tablet', label: 'تابلت', Icon: Tablet },
                { id: 'desktop', label: 'كمبيوتر', Icon: Laptop },
                { id: 'tv', label: 'TV', Icon: Tv },
              ] as Array<{
                id: RecentlyWatchedDeviceKey;
                label: string;
                Icon: typeof Smartphone;
              }>
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPreviewDevice(id)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-extrabold cursor-pointer ${
                  previewDevice === id
                    ? 'bg-[#E50914] text-white'
                    : 'text-[#b7c9ef] hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div
          className={`rtv-site-preview rounded-2xl bg-[#0f0f0f] border p-3 sm:p-4 transition-all duration-300 ${
            PREVIEW_FRAME_CLASSES[previewDevice]
          } ${!cfg.enabled ? 'opacity-45' : ''}`}
        >
          {!cfg.enabled && (
            <p className="mb-2 text-center text-[11px] font-bold text-[#f9c400]">
              ملاحظة: القسم مخفي حالياً للزوار (وضع التفعيل مغلق)
            </p>
          )}
          <RecentlyWatchedSection
            items={previewRecords}
            catalog={catalog}
            isSignedIn={true}
            hideCompleted={previewHideCompleted}
            uiConfig={cfg}
            forcedDevicePreview={previewDevice}
            isPreviewMode={true}
            onToggleHideCompleted={setPreviewHideCompleted}
            onResumeItem={(rec) => onNotify(`معاينة تشغيل: ${rec.title}`)}
            onOpenDetails={(rec) => onNotify(`معاينة تفاصيل: ${rec.title}`)}
            onRemoveItem={(rec) => onNotify(`معاينة إزالة: ${rec.title}`)}
            onOpenManager={() => onNotify('معاينة زر عرض الكل / إدارة السجل')}
          />
        </div>
      </div>
    </div>
  );
}
