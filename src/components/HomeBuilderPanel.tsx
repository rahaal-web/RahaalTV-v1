import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Eye,
  Film,
  LayoutGrid,
  Monitor,
  Palette,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  getMainCardStyleMeta,
  MAIN_3D_CARD_STYLES,
  MAIN_CARD_STYLE_CLEAN_META,
} from '../lib/cardStyles';
import {
  DEFAULT_HOME_CONFIG,
  normalizeHomeConfig,
  saveStoredHomeConfig,
} from '../lib/homeConfig';
import {
  loadStoredRecentlyWatchedUiConfig,
  normalizeRecentlyWatchedUiConfig,
  saveStoredRecentlyWatchedUiConfig,
} from '../lib/recentlyWatchedConfig';
import { HeroSliderVariant, useHeroSliderVariant } from '../lib/heroSliderMode';
import {
  HomeHeroMode,
  HomeLayoutConfig,
  HomeSectionConfig,
  HomeSectionSource,
  MediaItem,
  RecentlyWatchedRecord,
  RecentlyWatchedUiConfig,
} from '../types/media';
import { RecentlyWatchedSettingsPanel } from './admin/RecentlyWatchedSettingsPanel';

interface HomeBuilderPanelProps {
  catalog: MediaItem[];
  homeConfig: HomeLayoutConfig;
  tickerEnabled: boolean;
  recentlyWatchedUiConfig?: RecentlyWatchedUiConfig;
  recentlyWatchedItems?: RecentlyWatchedRecord[];
  busyAction: boolean;
  onChangeHomeConfig: (next: HomeLayoutConfig) => void;
  onChangeTickerEnabled: (enabled: boolean) => void;
  onChangeRecentlyWatchedUiConfig?: (next: RecentlyWatchedUiConfig) => void;
  onSaveRecentlyWatchedUiConfig?: (next: RecentlyWatchedUiConfig) => Promise<void>;
  onSaveHomeConfig: (next: HomeLayoutConfig) => Promise<void>;
  onPreviewHome: () => void;
  onOpenTypographyTab?: () => void;
  onOpenSliderCustomization?: () => void;
  onOpenCardsAndThemesTab?: () => void;
  onNotify: (msg: string) => void;
}

const SOURCE_OPTIONS: Array<{ value: HomeSectionSource; label: string }> = [
  { value: 'latest', label: 'أحدث الإضافات' },
  { value: 'movies', label: 'الأفلام' },
  { value: 'series', label: 'المسلسلات والبرامج' },
  { value: 'top_rated', label: 'الأعلى تقييماً (تقييم المشاهدين)' },
  { value: 'trending', label: 'الأكثر مشاهدة' },
  { value: 'ramadan', label: 'رمضان 2026' },
  { value: 'wrestling', label: 'مصارعة حرة' },
  { value: 'category', label: 'تصنيف مخصص (Category)' },
  { value: 'custom', label: 'اختيار أعمال يدوياً' },
];

export function HomeBuilderPanel({
  catalog,
  homeConfig,
  tickerEnabled,
  recentlyWatchedUiConfig,
  recentlyWatchedItems,
  busyAction,
  onChangeHomeConfig,
  onChangeTickerEnabled,
  onChangeRecentlyWatchedUiConfig,
  onSaveRecentlyWatchedUiConfig,
  onSaveHomeConfig,
  onPreviewHome,
  onOpenTypographyTab,
  onOpenSliderCustomization,
  onOpenCardsAndThemesTab,
  onNotify,
}: HomeBuilderPanelProps) {
  const cfg = useMemo(() => normalizeHomeConfig(homeConfig), [homeConfig]);
  const [heroSliderVariant, setHeroSliderVariant] = useHeroSliderVariant();
  const [sliderSearch, setSliderSearch] = useState('');
  const [fallbackRwUi, setFallbackRwUi] = useState<RecentlyWatchedUiConfig>(() =>
    loadStoredRecentlyWatchedUiConfig()
  );
  const activeRwUi = useMemo(
    () =>
      recentlyWatchedUiConfig
        ? normalizeRecentlyWatchedUiConfig(recentlyWatchedUiConfig)
        : fallbackRwUi,
    [recentlyWatchedUiConfig, fallbackRwUi]
  );

  const handleRwUiChange = (next: RecentlyWatchedUiConfig) => {
    const normalized = normalizeRecentlyWatchedUiConfig(next);
    if (onChangeRecentlyWatchedUiConfig) {
      onChangeRecentlyWatchedUiConfig(normalized);
    } else {
      setFallbackRwUi(saveStoredRecentlyWatchedUiConfig(normalized));
    }
  };

  const handleRwUiSave = async (next: RecentlyWatchedUiConfig) => {
    const normalized = saveStoredRecentlyWatchedUiConfig(next);
    if (onSaveRecentlyWatchedUiConfig) {
      await onSaveRecentlyWatchedUiConfig(normalized);
    } else {
      setFallbackRwUi(normalized);
      onNotify('تم حفظ إعدادات قسم شاهدته مؤخراً محلياً');
    }
  };

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((item) => {
      (item.categories || []).forEach((c) => {
        if (c.trim()) set.add(c.trim());
      });
    });
    return Array.from(set);
  }, [catalog]);

  const updateCfg = (patch: Partial<HomeLayoutConfig>) => {
    const next = normalizeHomeConfig({ ...cfg, ...patch });
    saveStoredHomeConfig(next);
    onChangeHomeConfig(next);
  };

  const updateSection = (id: string, patch: Partial<HomeSectionConfig>) => {
    const nextSections = cfg.sections.map((sec) =>
      sec.id === id ? { ...sec, ...patch } : sec
    );
    updateCfg({ sections: nextSections });
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= cfg.sections.length) return;
    const copy = [...cfg.sections];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    updateCfg({ sections: copy });
  };

  const deleteSection = (id: string) => {
    if (cfg.sections.length <= 1) {
      onNotify('يجب الإبقاء على قسم واحد على الأقل في الصفحة الرئيسية');
      return;
    }
    updateCfg({ sections: cfg.sections.filter((s) => s.id !== id) });
  };

  const addNewSection = () => {
    if (cfg.sections.length >= 12) {
      onNotify('الحد الأقصى هو 12 قسماً للحفاظ على سرعة الصفحة');
      return;
    }
    const newSec: HomeSectionConfig = {
      id: `sec-${Date.now()}`,
      title: 'قسم مخصص جديد',
      subtitle: 'أعمال مختارة بعناية',
      enabled: true,
      source: 'top_rated',
      categoryFilter: '',
      customMediaIds: [],
      limit: 10,
      layout: 'grid',
    };
    updateCfg({ sections: [...cfg.sections, newSec] });
  };

  const applyPreset = (preset: 'clean' | 'netflix' | 'minimal') => {
    if (preset === 'clean') {
      const next = normalizeHomeConfig(DEFAULT_HOME_CONFIG);
      saveStoredHomeConfig(next);
      onChangeHomeConfig(next);
      onChangeTickerEnabled(false);
      onNotify('تم تطبيق التصميم النظيف المتوازن — اضغط حفظ لتعميمه');
      return;
    }
    if (preset === 'netflix') {
      const next = normalizeHomeConfig({
        ...DEFAULT_HOME_CONFIG,
        showQuickFilters: true,
        showCategoryBar: false,
        showFullLibrary: false,
        cardStyle: 'clean',
        cardsPerRow: 5,
        sections: [
          {
            id: 'sec-latest',
            title: 'أحدث الإضافات',
            subtitle: 'أجدد ما تم رفعه اليوم',
            enabled: true,
            source: 'latest',
            limit: 12,
            layout: 'row',
          },
          {
            id: 'sec-trending',
            title: 'الأكثر مشاهدة الآن',
            subtitle: 'الأعمال الرائجة بين الزوار',
            enabled: true,
            source: 'trending',
            limit: 12,
            layout: 'row',
          },
          {
            id: 'sec-movies',
            title: 'أفلام سينمائية',
            subtitle: 'جودة 4K و BluRay',
            enabled: true,
            source: 'movies',
            limit: 12,
            layout: 'row',
          },
          {
            id: 'sec-series',
            title: 'مسلسلات كاملة',
            subtitle: 'حلقات ومواسم محدثة',
            enabled: true,
            source: 'series',
            limit: 12,
            layout: 'row',
          },
        ],
      });
      saveStoredHomeConfig(next);
      onChangeHomeConfig(next);
      onChangeTickerEnabled(false);
      onNotify('تم تطبيق أسلوب الصفوف الأفقية (Netflix Style) — اضغط حفظ لتعميمه');
      return;
    }
    // minimal
    const next = normalizeHomeConfig({
      ...DEFAULT_HOME_CONFIG,
      showQuickFilters: true,
      showCategoryBar: false,
      showFullLibrary: false,
      showRequestBanner: true,
      heroShowHighlights: false,
      cardsPerRow: 5,
      sections: [
        {
          id: 'sec-latest',
          title: 'أحدث الأعمال المضافة',
          subtitle: '',
          enabled: true,
          source: 'latest',
          limit: 15,
          layout: 'grid',
        },
      ],
    });
    saveStoredHomeConfig(next);
    onChangeHomeConfig(next);
    onChangeTickerEnabled(false);
    onNotify('تم تطبيق الواجهة المصغرة السريعة — اضغط حفظ لتعميمه');
  };

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl rtv-admin-accent-soft border border-white/15 rtv-admin-accent-text">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-white">
              إدارة وتخصيص الصفحة الرئيسية بالكامل
            </h2>
            <p className="text-xs text-[#b7c9ef] mt-1">
              تحكم في قسم البطل (Hero)، شكل البطاقات، ترتيب الأقسام، إظهار أو إخفاء أي عنصر، وتغيير أسلوب العرض فوراً.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onOpenSliderCustomization && (
            <button
              type="button"
              onClick={onOpenSliderCustomization}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/15 px-4 py-2.5 text-xs font-bold text-white cursor-pointer"
            >
              <Monitor className="w-4 h-4 rtv-admin-accent-text" />
              <span>تخصيص عناصر السلايدر الرئيسي</span>
            </button>
          )}

          {onOpenTypographyTab && (
            <button
              type="button"
              onClick={onOpenTypographyTab}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/15 px-4 py-2.5 text-xs font-bold text-white cursor-pointer"
            >
              <Type className="w-4 h-4 rtv-admin-accent-text" />
              <span>الخطوط وحجم النصوص</span>
            </button>
          )}

          <button
            type="button"
            onClick={onPreviewHome}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-4 py-2.5 text-xs font-bold text-white cursor-pointer"
          >
            <Eye className="w-4 h-4 rtv-admin-accent-text" />
            <span>معاينة الرئيسية</span>
          </button>

          <button
            type="button"
            disabled={busyAction}
            onClick={() => void onSaveHomeConfig(cfg)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] px-5 py-2.5 text-xs font-extrabold text-white shadow-lg cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{busyAction ? 'جاري الحفظ...' : 'حفظ وتطبيق التصميم الآن'}</span>
          </button>
        </div>
      </div>

      {/* Quick Layout Presets */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-extrabold text-[#f9c400]">
          <Sparkles className="w-4 h-4" />
          <span>قوالب جاهزة بضغطة زر</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => applyPreset('clean')}
            className="rounded-2xl bg-[#1a242e] hover:border-[#D92321] border border-white/10 p-4 text-right transition-colors cursor-pointer"
          >
            <p className="text-sm font-extrabold text-white">متوازن ونظيف (الافتراضي)</p>
            <p className="text-[11px] text-[#b7c9ef] mt-1">
              بطل سينمائي + فلاتر سريعة + 3 أقسام مرتبة بدون زحمة.
            </p>
          </button>
          <button
            type="button"
            onClick={() => applyPreset('netflix')}
            className="rounded-2xl bg-[#1a242e] hover:border-[#D92321] border border-white/10 p-4 text-right transition-colors cursor-pointer"
          >
            <p className="text-sm font-extrabold text-white">صفوف أفقية (Netflix Style)</p>
            <p className="text-[11px] text-[#b7c9ef] mt-1">
              سلايدر بطل كبير مع صفوف تمرير أفقية ناعمة لكل قسم.
            </p>
          </button>
          <button
            type="button"
            onClick={() => applyPreset('minimal')}
            className="rounded-2xl bg-[#1a242e] hover:border-[#D92321] border border-white/10 p-4 text-right transition-colors cursor-pointer"
          >
            <p className="text-sm font-extrabold text-white">واجهة فائقة البساطة</p>
            <p className="text-[11px] text-[#b7c9ef] mt-1">
              بطل رئيسي + شبكة واحدة لأحدث الأعمال بأسرع تحميل ممكن.
            </p>
          </button>
        </div>
      </div>

      {/* Grid: Hero Control + Visual Layout Toggles */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Hero Slider Full Controller */}
        <div className="xl:col-span-7 rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Monitor className="w-5 h-5 rtv-admin-accent-text" />
              <h3 className="font-display text-base font-extrabold text-white">
                التحكم الكامل في السلايدر الرئيسي (Hero Slider)
              </h3>
            </div>
            <div className="flex items-center gap-3">
              {onOpenSliderCustomization && (
                <button
                  type="button"
                  onClick={onOpenSliderCustomization}
                  className="rounded-lg rtv-admin-accent-soft border border-white/15 px-2.5 py-1 text-[11px] font-extrabold rtv-admin-accent-text hover:opacity-90 cursor-pointer"
                >
                  إعدادات إظهار/إخفاء الوصف والعناصر ↗
                </button>
              )}
              <label className="inline-flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.showHero}
                  onChange={(e) => updateCfg({ showHero: e.target.checked })}
                  className="h-4 w-4 accent-sky-500"
                />
                <span>إظهار السلايدر</span>
              </label>
            </div>
          </div>

          {/* Independent Slider Style Switcher (Original vs Cinematic) */}
          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.08] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-white">
                تصميم السلايدر المعروض (Slider Style)
              </span>
              <span className="text-[10px] font-bold text-[#b7c9ef]">
                تبديل فوري مع إبقاء الأساسي كما هو
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(
                [
                  {
                    id: 'original',
                    label: 'السلايدر الأساسي (Original Slider)',
                  },
                  {
                    id: 'cinematic',
                    label: 'السلايدر السينمائي الجديد (Cinematic Slider)',
                  },
                ] as Array<{ id: HeroSliderVariant; label: string }>
              ).map((styleOpt) => (
                <button
                  key={styleOpt.id}
                  type="button"
                  onClick={() => {
                    setHeroSliderVariant(styleOpt.id);
                    onNotify(
                      styleOpt.id === 'cinematic'
                        ? 'تم التبديل إلى السلايدر السينمائي الجديد'
                        : 'تم الرجوع إلى السلايدر الأساسي'
                    );
                  }}
                  className={`rounded-xl border px-3 py-2 text-xs font-extrabold transition-colors cursor-pointer text-right flex items-center justify-between gap-2 ${
                    heroSliderVariant === styleOpt.id
                      ? 'rtv-admin-accent-bg border-transparent text-white'
                      : 'bg-[#0c1821] border-white/10 text-[#b7c9ef] hover:text-white'
                  }`}
                >
                  <span className="truncate">{styleOpt.label}</span>
                  {heroSliderVariant === styleOpt.id && (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                { id: 'auto', label: 'تلقائي (المثبتة والأحدث)' },
                { id: 'manual', label: 'اختيار الأفلام يدوياً' },
                { id: 'brand', label: 'تعريف الموقع + عمل' },
              ] as Array<{ id: HomeHeroMode; label: string }>
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => updateCfg({ heroMode: mode.id })}
                className={`rounded-xl border px-3 py-2.5 text-xs font-extrabold transition-colors cursor-pointer ${
                  cfg.heroMode === mode.id
                    ? 'rtv-admin-accent-bg border-transparent text-white'
                    : 'bg-[#1a242e] border-white/10 text-[#b7c9ef] hover:text-white'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Timing, Progress Bar & Slider Display Controls */}
          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.08] p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#f9c400]">
                <Clock className="w-4 h-4" />
                <span>توقيت التقليب وشريط التقدم المتحرك</span>
              </span>
              <label className="inline-flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.heroAutoPlay ?? true}
                  onChange={(e) => updateCfg({ heroAutoPlay: e.target.checked })}
                  className="h-4 w-4 accent-[#4CAF50]"
                />
                <span>تشغيل التقليب التلقائي</span>
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#b7c9ef]">مدة بقاء كل فيلم قبل التقليب:</span>
                <span className="font-latin rounded-lg bg-[#0c1821] border border-white/10 px-2.5 py-0.5 font-black text-white tabular-nums">
                  {cfg.heroSlideIntervalSec ?? 6} ثوانٍ
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={2}
                  max={30}
                  step={1}
                  value={cfg.heroSlideIntervalSec ?? 6}
                  onChange={(e) => updateCfg({ heroSlideIntervalSec: Number(e.target.value) })}
                  className="flex-1 accent-[#D92321] cursor-pointer"
                />
                <div className="flex items-center gap-1 shrink-0">
                  {[3, 5, 7, 10, 15].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => updateCfg({ heroSlideIntervalSec: sec })}
                      className={`font-latin rounded-lg px-2 py-1 text-[10px] font-black border cursor-pointer ${
                        (cfg.heroSlideIntervalSec ?? 6) === sec
                          ? 'bg-[#D92321] border-[#D92321] text-white'
                          : 'bg-[#0c1821] border-white/10 text-[#b7c9ef] hover:text-white'
                      }`}
                    >
                      {sec}ث
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <label className="flex items-center justify-between rounded-xl bg-[#0c1821]/80 border border-white/[0.06] px-3 py-2 text-[11px] font-bold text-white cursor-pointer">
                <span>شريط التقدم المتحرك حتى يقلب الفيلم</span>
                <input
                  type="checkbox"
                  checked={cfg.heroShowProgressBar ?? true}
                  onChange={(e) => updateCfg({ heroShowProgressBar: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[#D92321]"
                />
              </label>

              <label className="flex items-center justify-between rounded-xl bg-[#0c1821]/80 border border-white/[0.06] px-3 py-2 text-[11px] font-bold text-white cursor-pointer">
                <span>إيقاف مؤقت عند الوقوف بالماوس</span>
                <input
                  type="checkbox"
                  checked={cfg.heroPauseOnHover ?? true}
                  onChange={(e) => updateCfg({ heroPauseOnHover: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[#D92321]"
                />
              </label>

              <label className="flex items-center justify-between rounded-xl bg-[#0c1821]/80 border border-white/[0.06] px-3 py-2 text-[11px] font-bold text-white cursor-pointer">
                <span>إظهار المصغرات السفلية للصور</span>
                <input
                  type="checkbox"
                  checked={cfg.heroShowThumbnails ?? true}
                  onChange={(e) => updateCfg({ heroShowThumbnails: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[#D92321]"
                />
              </label>

              <label className="flex items-center justify-between rounded-xl bg-[#0c1821]/80 border border-white/[0.06] px-3 py-2 text-[11px] font-bold text-white cursor-pointer">
                <span>إظهار أسهم التنقل والنقاط</span>
                <input
                  type="checkbox"
                  checked={cfg.heroShowArrows ?? true}
                  onChange={(e) => updateCfg({ heroShowArrows: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[#D92321]"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-[11px] font-bold text-[#b7c9ef]">
                أقصى عدد للأفلام في السلايدر:
              </span>
              <select
                value={cfg.heroMaxSlides ?? 8}
                onChange={(e) => updateCfg({ heroMaxSlides: Number(e.target.value) || 8 })}
                className="font-latin rounded-xl bg-[#0c1821] border border-white/10 px-3 py-1.5 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
              >
                {[3, 4, 5, 6, 8, 10, 12].map((count) => (
                  <option key={count} value={count}>
                    {count} شرائح
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Ordered Slider Movies Picker (works in manual mode & prioritizes selected movies) */}
          {(() => {
            const byId = new Map(catalog.map((i) => [i.id, i]));
            const selectedIds = cfg.heroSlideIds || [];
            const selectedItems = selectedIds
              .map((id) => byId.get(id))
              .filter((x): x is MediaItem => Boolean(x));

            const q = sliderSearch.trim().toLowerCase();
            const filteredCatalog = catalog
              .filter((item) => {
                if (!q) return true;
                return (
                  item.title.toLowerCase().includes(q) ||
                  item.englishTitle.toLowerCase().includes(q) ||
                  String(item.year || '').includes(q)
                );
              })
              .slice(0, 45);

            const moveSlide = (index: number, dir: -1 | 1) => {
              const target = index + dir;
              if (target < 0 || target >= selectedIds.length) return;
              const copy = [...selectedIds];
              const [moved] = copy.splice(index, 1);
              copy.splice(target, 0, moved);
              updateCfg({ heroSlideIds: copy });
            };

            const toggleSlideItem = (id: string) => {
              if (selectedIds.includes(id)) {
                updateCfg({ heroSlideIds: selectedIds.filter((x) => x !== id) });
              } else {
                if (selectedIds.length >= 12) {
                  onNotify('الحد الأقصى لأفلام السلايدر هو 12 عملاً');
                  return;
                }
                updateCfg({
                  heroMode: 'manual',
                  heroSlideIds: [...selectedIds, id],
                });
              }
            };

            return (
              <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.08] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-extrabold text-white flex items-center gap-1.5">
                      <Film className="w-4 h-4 text-[#D92321]" />
                      <span>اختيار وترتيب أفلام السلايدر ({selectedItems.length} محدد)</span>
                    </p>
                    <p className="text-[11px] text-[#b7c9ef] mt-0.5">
                      اختر الأعمال التي تريد عرضها في السلايدر ورتّب أولوية ظهورها.
                    </p>
                  </div>
                  {selectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => updateCfg({ heroSlideIds: [] })}
                      className="rounded-lg bg-[#D92321]/15 hover:bg-[#D92321] border border-[#D92321]/30 px-2.5 py-1 text-[11px] font-bold text-[#ff8a88] hover:text-white cursor-pointer"
                    >
                      مسح القائمة
                    </button>
                  )}
                </div>

                {selectedItems.length > 0 && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {selectedItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-[#0c1821] border border-white/10 px-3 py-1.5"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-latin inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#D92321] text-[10px] font-black text-white">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-white truncate">
                            {item.title}
                          </span>
                          <span className="font-latin text-[10px] text-[#b7c9ef] shrink-0">
                            ({item.year})
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveSlide(idx, -1)}
                            title="تقديم للأعلى"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#1a242e] text-white disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === selectedItems.length - 1}
                            onClick={() => moveSlide(idx, 1)}
                            title="تأخير للأسفل"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#1a242e] text-white disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleSlideItem(item.id)}
                            title="إزالة من السلايدر"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#D92321]/15 text-[#ff8a88] hover:bg-[#D92321] hover:text-white cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#b7c9ef] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={sliderSearch}
                    onChange={(e) => setSliderSearch(e.target.value)}
                    placeholder="ابحث باسم الفيلم أو المسلسل لإضافته إلى السلايدر..."
                    className="w-full rounded-xl bg-[#0c1821] border border-white/10 pr-8 pl-3 py-2 text-xs text-white focus:border-[#D92321] focus:outline-none"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {filteredCatalog.map((item) => {
                    const picked = selectedIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleSlideItem(item.id)}
                        className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-right text-[11px] font-bold border transition-colors cursor-pointer ${
                          picked
                            ? 'bg-[#D92321]/20 border-[#D92321] text-white'
                            : 'bg-[#0c1821]/70 border-white/5 text-[#b7c9ef] hover:text-white hover:border-white/20'
                        }`}
                      >
                        <span className="truncate">{item.title}</span>
                        <span className="shrink-0 font-latin text-[10px] text-[#f9c400]">
                          {picked ? '✓ مضاف' : '+ إضافة'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {cfg.heroMode === 'brand' && (
            <div>
              <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                اختر العمل الأساسي بجانب تعريف الموقع
              </label>
              <select
                value={cfg.heroMediaId}
                onChange={(e) => updateCfg({ heroMediaId: e.target.value })}
                className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
              >
                <option value="">الأحدث تلقائياً ({catalog[0]?.title || '—'})</option>
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} ({item.year})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#b7c9ef] mb-1">شارة البطل</label>
              <input
                type="text"
                maxLength={50}
                value={cfg.heroBadgeText}
                onChange={(e) => updateCfg({ heroBadgeText: e.target.value })}
                placeholder="اختيار المحررين"
                className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#D92321] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#b7c9ef] mb-1">نص زر التشغيل</label>
              <input
                type="text"
                maxLength={40}
                value={cfg.heroPrimaryCta}
                onChange={(e) => updateCfg({ heroPrimaryCta: e.target.value })}
                placeholder="مشاهدة الآن"
                className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#D92321] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#b7c9ef] mb-1">
              عنوان رئيسي مخصص (اتركه فارغاً لاستخدام عنوان العمل)
            </label>
            <input
              type="text"
              maxLength={160}
              value={cfg.heroHeadline}
              onChange={(e) => updateCfg({ heroHeadline: e.target.value })}
              placeholder="مثال: استمتع بأحدث الأفلام والمسلسلات بدقة 4K"
              className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#D92321] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#b7c9ef] mb-1">
              وصف مخصص (اتركه فارغاً لاستخدام قصة العمل)
            </label>
            <textarea
              rows={2}
              maxLength={320}
              value={cfg.heroDescription}
              onChange={(e) => updateCfg({ heroDescription: e.target.value })}
              placeholder="وصف مختصر وجذاب يظهر تحت العنوان..."
              className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#D92321] focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs font-bold text-white cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.heroShowHighlights}
              onChange={(e) => updateCfg({ heroShowHighlights: e.target.checked })}
              className="h-4 w-4 accent-[#D92321]"
            />
            <span>إظهار مميزات المنصة السريعة أسفل البطل (سيرفرات سريعة · 4K · تحديث يومي)</span>
          </label>
        </div>

        {/* Visual Density & Elements Toggles */}
        <div className="xl:col-span-5 rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-white/10 pb-3">
            <LayoutGrid className="w-5 h-5 text-[#f9c400]" />
            <h3 className="font-display text-base font-extrabold text-white">
              شكل البطاقات وعناصر الصفحة
            </h3>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="block text-xs font-bold text-[#b7c9ef]">تصميم البطاقة</span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-[#1a242e] border border-white/10 px-2 py-0.5 text-[10px] font-extrabold text-[#f9c400]">
                {getMainCardStyleMeta(cfg.cardStyle).name}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => updateCfg({ cardStyle: 'clean' })}
                className={`rounded-xl border px-3 py-2.5 text-center transition-colors cursor-pointer ${
                  cfg.cardStyle === 'clean'
                    ? 'bg-[#D92321] border-[#D92321] text-white shadow-md'
                    : 'bg-[#1a242e] border-white/10 text-[#b7c9ef] hover:text-white'
                }`}
              >
                <span className="block text-xs font-extrabold">حديث نظيف</span>
                <span className="block text-[10px] opacity-80 mt-0.5">Netflix Style</span>
              </button>
              <button
                type="button"
                onClick={() => updateCfg({ cardStyle: 'classic' })}
                className={`rounded-xl border px-3 py-2.5 text-center transition-colors cursor-pointer ${
                  cfg.cardStyle === 'classic'
                    ? 'bg-[#D92321] border-[#D92321] text-white shadow-md'
                    : 'bg-[#1a242e] border-white/10 text-[#b7c9ef] hover:text-white'
                }`}
              >
                <span className="block text-xs font-extrabold">كلاسيكي</span>
                <span className="block text-[10px] opacity-80 mt-0.5">قلب ثلاثي 3D</span>
              </button>
              <button
                type="button"
                onClick={() => updateCfg({ cardStyle: 'showcase' })}
                className={`rounded-xl border px-3 py-2.5 text-center transition-colors cursor-pointer ${
                  cfg.cardStyle === 'showcase'
                    ? 'bg-[#D92321] border-[#D92321] text-white shadow-md'
                    : 'bg-[#1a242e] border-white/10 text-[#b7c9ef] hover:text-white'
                }`}
              >
                <span className="block text-xs font-extrabold">عرض سينمائي 3D</span>
                <span className="block text-[10px] opacity-80 mt-0.5">عمق ثلاثي الأبعاد + قلب</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <select
                aria-label="اختيار شكل البطاقة من 20 نمطاً ثلاثي الأبعاد"
                value={cfg.cardStyle}
                onChange={(e) =>
                  updateCfg({ cardStyle: e.target.value as HomeLayoutConfig['cardStyle'] })
                }
                className="flex-1 rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 text-xs font-bold text-white"
              >
                <option value={MAIN_CARD_STYLE_CLEAN_META.id}>
                  00 — {MAIN_CARD_STYLE_CLEAN_META.name} (Netflix)
                </option>
                {MAIN_3D_CARD_STYLES.map((styleMeta, idx) => (
                  <option key={styleMeta.id} value={styleMeta.id}>
                    {String(idx + 1).padStart(2, '0')} — {styleMeta.name}
                  </option>
                ))}
              </select>
              {onOpenCardsAndThemesTab && (
                <button
                  type="button"
                  onClick={onOpenCardsAndThemesTab}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-[#f9c400]/35 px-3 py-2 text-[11px] font-extrabold text-[#f9c400] cursor-pointer whitespace-nowrap"
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span>استوديو البطاقات (20 شكل 3D)</span>
                </button>
              )}
            </div>
          </div>

          <div>
            <span className="block text-xs font-bold text-[#b7c9ef] mb-2">
              عدد البطاقات في الصف (على الشاشات الكبيرة)
            </span>
            <div className="grid grid-cols-3 gap-2">
              {([4, 5, 6] as const).map((cols) => (
                <button
                  key={cols}
                  type="button"
                  onClick={() => updateCfg({ cardsPerRow: cols })}
                  className={`font-latin rounded-xl border py-2 text-xs font-black cursor-pointer ${
                    cfg.cardsPerRow === cols
                      ? 'bg-[#f9c400] border-[#f9c400] text-[#06131c]'
                      : 'bg-[#1a242e] border-white/10 text-white'
                  }`}
                >
                  {cols} بطاقات
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <span className="block text-xs font-bold text-[#b7c9ef]">إظهار / إخفاء العناصر</span>
            {[
              {
                label: 'شريط الفلاتر السريعة أعلى الرئيسية',
                checked: cfg.showQuickFilters,
                onChange: (v: boolean) => updateCfg({ showQuickFilters: v }),
              },
              {
                label: 'شريط التصنيفات الكامل بالأسفل',
                checked: cfg.showCategoryBar,
                onChange: (v: boolean) => updateCfg({ showCategoryBar: v }),
              },
              {
                label: 'جدول المكتبة الكاملة بصفحات بالرئيسية',
                checked: cfg.showFullLibrary,
                onChange: (v: boolean) => updateCfg({ showFullLibrary: v }),
              },
              {
                label: 'قسم "اطلب عملاً أو تواصل معنا"',
                checked: cfg.showRequestBanner,
                onChange: (v: boolean) => updateCfg({ showRequestBanner: v }),
              },
              {
                label: 'شريط الأخبار المتحرك (Ticker)',
                checked: tickerEnabled,
                onChange: (v: boolean) => onChangeTickerEnabled(v),
              },
            ].map((item) => (
              <label
                key={item.label}
                className="flex items-center justify-between rounded-xl bg-[#1a242e]/80 border border-white/[0.06] px-3.5 py-2.5 text-xs font-bold text-white cursor-pointer"
              >
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.onChange(e.target.checked)}
                  className="h-4 w-4 accent-[#D92321]"
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Sections Order & Content Builder */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h3 className="font-display text-base font-extrabold text-white">
              أقسام الصفحة الرئيسية وترتيبها ({cfg.sections.length})
            </h3>
            <p className="text-xs text-[#b7c9ef] mt-0.5">
              رتّب الأقسام للأعلى والأسفل، اختر مصدر المحتوى، غيّر نمط العرض (شبكة أو صف أفقي)، أو أنشئ قسماً يدوياً.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => applyPreset('clean')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>استعادة الافتراضي</span>
            </button>
            <button
              type="button"
              onClick={addNewSection}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#D92321] hover:bg-[#dc0e30] px-4 py-2 text-xs font-extrabold text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة قسم</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {cfg.sections.map((section, idx) => (
            <div
              key={section.id}
              className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                section.enabled
                  ? 'bg-[#1a242e]/80 border-white/10'
                  : 'bg-[#111820]/50 border-white/5 opacity-65'
              }`}
            >
              {/* Section Top Row */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-latin inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#0c1821] text-xs font-black text-[#f9c400]">
                    {idx + 1}
                  </span>
                  <label className="inline-flex items-center gap-2 text-xs font-extrabold text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={section.enabled}
                      onChange={(e) => updateSection(section.id, { enabled: e.target.checked })}
                      className="h-4 w-4 accent-[#4CAF50]"
                    />
                    <span>{section.enabled ? 'مُفعّل' : 'مخفي'}</span>
                  </label>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveSection(idx, -1)}
                    title="تحريك للأعلى"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0c1821] border border-white/10 text-white disabled:opacity-30 hover:border-white/30 cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === cfg.sections.length - 1}
                    onClick={() => moveSection(idx, 1)}
                    title="تحريك للأسفل"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0c1821] border border-white/10 text-white disabled:opacity-30 hover:border-white/30 cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSection(section.id)}
                    title="حذف القسم"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#D92321]/15 border border-[#D92321]/30 text-[#ff8a88] hover:bg-[#D92321] hover:text-white cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Section Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                    عنوان القسم
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={section.title}
                    onChange={(e) => updateSection(section.id, { title: e.target.value })}
                    className="w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                    وصف فرعي (اختياري)
                  </label>
                  <input
                    type="text"
                    maxLength={180}
                    value={section.subtitle}
                    onChange={(e) => updateSection(section.id, { subtitle: e.target.value })}
                    className="w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#D92321] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                    مصدر المحتوى
                  </label>
                  <select
                    value={section.source}
                    onChange={(e) =>
                      updateSection(section.id, {
                        source: e.target.value as HomeSectionSource,
                      })
                    }
                    className="w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
                  >
                    {SOURCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                      طريقة العرض
                    </label>
                    <select
                      value={section.layout}
                      onChange={(e) =>
                        updateSection(section.id, {
                          layout: e.target.value === 'row' ? 'row' : 'grid',
                        })
                      }
                      className="w-full rounded-xl bg-[#0c1821] border border-white/10 px-2.5 py-2 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
                    >
                      <option value="grid">شبكة (Grid)</option>
                      <option value="row">صف أفقي (Row)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                      عدد العناصر
                    </label>
                    <select
                      value={section.limit}
                      onChange={(e) =>
                        updateSection(section.id, { limit: Number(e.target.value) || 10 })
                      }
                      className="font-latin w-full rounded-xl bg-[#0c1821] border border-white/10 px-2.5 py-2 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
                    >
                      {[4, 5, 6, 8, 10, 12, 15, 20].map((num) => (
                        <option key={num} value={num}>
                          {num}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Conditional Category Filter Picker */}
              {section.source === 'category' && (
                <div>
                  <label className="block text-[11px] font-bold text-[#f9c400] mb-1">
                    اختر التصنيف المطلوب لهذا القسم
                  </label>
                  <select
                    value={section.categoryFilter || ''}
                    onChange={(e) =>
                      updateSection(section.id, { categoryFilter: e.target.value })
                    }
                    className="w-full sm:w-72 rounded-xl bg-[#0c1821] border border-[#f9c400]/40 px-3 py-2 text-xs font-bold text-white focus:outline-none"
                  >
                    <option value="">-- اختر تصنيفاً --</option>
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conditional Manual Media Picker */}
              {section.source === 'custom' && (
                <div className="rounded-xl bg-[#0c1821] border border-white/10 p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#f9c400]">
                    <span>
                      اختر الأعمال يدوياً ({(section.customMediaIds || []).length} محدد)
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5">
                    {catalog.slice(0, 60).map((item) => {
                      const picked = (section.customMediaIds || []).includes(item.id);
                      return (
                        <label
                          key={item.id}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer border ${
                            picked
                              ? 'bg-[#D92321]/20 border-[#D92321] text-white'
                              : 'bg-[#1a242e]/60 border-white/5 text-[#b7c9ef]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={picked}
                            onChange={(e) => {
                              const current = section.customMediaIds || [];
                              const nextIds = e.target.checked
                                ? [...current, item.id]
                                : current.filter((id) => id !== item.id);
                              updateSection(section.id, { customMediaIds: nextIds });
                            }}
                            className="h-3.5 w-3.5 accent-[#D92321] shrink-0"
                          />
                          <span className="truncate">{item.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recently Watched Settings Section */}
      <div id="recently-watched-settings">
        <RecentlyWatchedSettingsPanel
          catalog={catalog}
          uiConfig={activeRwUi}
          recentlyWatchedItems={recentlyWatchedItems}
          busyAction={busyAction}
          onChangeUiConfig={handleRwUiChange}
          onSaveUiConfig={handleRwUiSave}
          onPreviewOnSite={onPreviewHome}
          onNotify={onNotify}
        />
      </div>
    </div>
  );
}
