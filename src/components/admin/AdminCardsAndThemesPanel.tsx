import { useMemo, useState, type CSSProperties } from 'react';
import {
  Check,
  ExternalLink,
  History,
  Layers,
  LayoutGrid,
  Monitor,
  Palette,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import {
  getMainCardStyleMeta,
  getRecentlyWatchedStyleMeta,
  MAIN_3D_CARD_STYLES,
  MAIN_CARD_STYLE_CLEAN_META,
  RECENTLY_WATCHED_3D_STYLES,
} from '../../lib/cardStyles';
import { normalizeHomeConfig } from '../../lib/homeConfig';
import { normalizeRecentlyWatchedUiConfig } from '../../lib/recentlyWatchedConfig';
import {
  buildSiteThemeCssVars,
  getSiteThemeDefinition,
  SITE_THEMES,
  SiteThemeCategory,
} from '../../lib/siteThemes';
import type {
  HomeCardStyle,
  HomeLayoutConfig,
  MediaItem,
  RecentlyWatchedCardStyle,
  RecentlyWatchedUiConfig,
  SiteThemeId,
} from '../../types/media';
import { MovieCard } from '../MovieCard';

interface AdminCardsAndThemesPanelProps {
  catalog: MediaItem[];
  homeConfig: HomeLayoutConfig;
  recentlyWatchedUiConfig: RecentlyWatchedUiConfig;
  siteThemeId: SiteThemeId;
  busyAction: boolean;
  onChangeHomeConfig: (next: HomeLayoutConfig) => void;
  onSaveHomeConfig: (next: HomeLayoutConfig) => Promise<void>;
  onChangeRecentlyWatchedUiConfig: (next: RecentlyWatchedUiConfig) => void;
  onSaveRecentlyWatchedUiConfig: (next: RecentlyWatchedUiConfig) => Promise<void>;
  onSaveSiteTheme: (themeId: SiteThemeId) => Promise<void>;
  onPreviewOnSite: () => void;
  onNotify: (msg: string) => void;
}

type StudioSubTab = 'main_cards' | 'recently_watched' | 'site_themes';

const SAMPLE_PREVIEW_ITEM: MediaItem = {
  id: 'preview-studio-1',
  slug: 'preview-studio',
  title: 'مهمة الظل الأخيرة',
  englishTitle: 'The Last Shadow Mission',
  kind: 'movie',
  categories: ['افلام اجنبية', 'افلام'],
  genres: ['أكشن', 'إثارة', 'خيال علمي'],
  year: '2026',
  country: 'الولايات المتحدة',
  language: 'مترجم للعربية',
  quality: '4K',
  duration: '128 دقيقة',
  imdb: 8.6,
  votes: '45,200',
  views: 15400,
  likes: 920,
  pinned: true,
  isNew: true,
  poster: 'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg',
  poster_url: 'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg',
  backdrop: 'https://image.tmdb.org/t/p/w780/yDHYTfA3R0jFYba16jBB1ef8oIt.jpg',
  backdrop_url: 'https://image.tmdb.org/t/p/w780/yDHYTfA3R0jFYba16jBB1ef8oIt.jpg',
  tagline: 'معاينة شكل البطاقة ثلاثية الأبعاد',
  story: 'عمل تشويقي سينمائي بتقنية 3D لمعاينة شكل البطاقات والتفاصيل السريعة.',
  shortUrl: 'https://rahal.tv/watch/preview-studio',
  trailerLabel: 'التريلر الرسمي',
  trailerDuration: '02:15',
  cast: [{ name: 'نجم العرض', role: 'بطولة', initials: 'ST' }],
  servers: [],
  downloads: [],
};

export function AdminCardsAndThemesPanel({
  catalog,
  homeConfig,
  recentlyWatchedUiConfig,
  siteThemeId,
  busyAction,
  onChangeHomeConfig,
  onSaveHomeConfig,
  onChangeRecentlyWatchedUiConfig,
  onSaveRecentlyWatchedUiConfig,
  onSaveSiteTheme,
  onPreviewOnSite,
  onNotify,
}: AdminCardsAndThemesPanelProps) {
  const [subTab, setSubTab] = useState<StudioSubTab>('main_cards');
  const [themeCategoryFilter, setThemeCategoryFilter] = useState<'all' | SiteThemeCategory>('all');
  const [rwPreviewDevice, setRwPreviewDevice] = useState<'mobile' | 'desktop'>('mobile');

  const cfg = useMemo(() => normalizeHomeConfig(homeConfig), [homeConfig]);
  const rwCfg = useMemo(
    () => normalizeRecentlyWatchedUiConfig(recentlyWatchedUiConfig),
    [recentlyWatchedUiConfig]
  );
  const previewItem = catalog[0] || SAMPLE_PREVIEW_ITEM;
  const currentMainMeta = getMainCardStyleMeta(cfg.cardStyle);
  const currentRwMeta = getRecentlyWatchedStyleMeta(rwCfg.cardStyle || 'rw-3d-tilt');
  const currentThemeDef = getSiteThemeDefinition(siteThemeId);

  const filteredThemes = useMemo(() => {
    if (themeCategoryFilter === 'all') return SITE_THEMES;
    return SITE_THEMES.filter((t) => t.category === themeCategoryFilter);
  }, [themeCategoryFilter]);

  const handleSelectMainCardStyle = async (styleId: HomeCardStyle, autoSave = false) => {
    const next = normalizeHomeConfig({ ...cfg, cardStyle: styleId });
    onChangeHomeConfig(next);
    if (autoSave) {
      await onSaveHomeConfig(next);
    }
  };

  const handleSelectRwCardStyle = async (styleId: RecentlyWatchedCardStyle, autoSave = false) => {
    const next = normalizeRecentlyWatchedUiConfig({ ...rwCfg, cardStyle: styleId });
    onChangeRecentlyWatchedUiConfig(next);
    if (autoSave) {
      await onSaveRecentlyWatchedUiConfig(next);
    }
  };

  return (
    <div className="space-y-5 rtv-fade-in">
      {/* Studio Header Banner */}
      <div className="rounded-3xl bg-gradient-to-l from-[#0c1821] via-[#131d2b] to-[#0c1821] border border-white/10 p-4 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Palette className="w-5 h-5 text-[#f9c400]" />
              <h2 className="font-display text-lg sm:text-2xl font-extrabold text-white">
                استوديو تصميم البطاقات وأشكال الموقع
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#b7c9ef]">
              اختر من بين 20 شكل 3D للبطاقات الرئيسية، 7 أشكال 3D لبطاقة شاهدته مؤخراً، و25 مظهر كامل للموقع مع الحفاظ على التصميم الأصلي.
            </p>
          </div>

          <button
            type="button"
            onClick={onPreviewOnSite}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/15 border border-white/15 px-4 py-2 text-xs font-extrabold text-white cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#f9c400]" />
            <span>معاينة على الموقع</span>
          </button>
        </div>

        {/* Active Selections Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => setSubTab('main_cards')}
            className={`flex items-center justify-between gap-2 rounded-2xl border p-3 text-right transition-colors cursor-pointer ${
              subTab === 'main_cards'
                ? 'bg-[#E50914]/15 border-[#E50914] text-white'
                : 'bg-[#1a242e]/60 border-white/10 text-[#b7c9ef] hover:text-white'
            }`}
          >
            <div className="min-w-0">
              <p className="text-[10px] font-bold opacity-80">البطاقات الرئيسية (20 شكل 3D)</p>
              <p className="text-xs font-extrabold text-white truncate mt-0.5">{currentMainMeta.name}</p>
            </div>
            <LayoutGrid className="w-4 h-4 text-[#f9c400] shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setSubTab('recently_watched')}
            className={`flex items-center justify-between gap-2 rounded-2xl border p-3 text-right transition-colors cursor-pointer ${
              subTab === 'recently_watched'
                ? 'bg-[#E50914]/15 border-[#E50914] text-white'
                : 'bg-[#1a242e]/60 border-white/10 text-[#b7c9ef] hover:text-white'
            }`}
          >
            <div className="min-w-0">
              <p className="text-[10px] font-bold opacity-80">شاهدته مؤخراً (7 أشكال 3D)</p>
              <p className="text-xs font-extrabold text-white truncate mt-0.5">{currentRwMeta.name}</p>
            </div>
            <History className="w-4 h-4 text-sky-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setSubTab('site_themes')}
            className={`flex items-center justify-between gap-2 rounded-2xl border p-3 text-right transition-colors cursor-pointer ${
              subTab === 'site_themes'
                ? 'bg-[#E50914]/15 border-[#E50914] text-white'
                : 'bg-[#1a242e]/60 border-white/10 text-[#b7c9ef] hover:text-white'
            }`}
          >
            <div className="min-w-0">
              <p className="text-[10px] font-bold opacity-80">شكل الموقع العام (25 + الأصلي)</p>
              <p className="text-xs font-extrabold text-white truncate mt-0.5">{currentThemeDef.name}</p>
            </div>
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          </button>
        </div>
      </div>

      {/* =====================================================
          SUB-TAB 1: 20 Main Catalog 3D Card Styles (+ Clean)
          ===================================================== */}
      {subTab === 'main_cards' && (
        <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-4 sm:p-6 space-y-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <h3 className="font-display text-base sm:text-lg font-extrabold text-white">
                أشكال البطاقات الأساسية (20 تصميم 3D احترافي + الشكل الافتراضي)
              </h3>
              <p className="text-xs text-[#b7c9ef] mt-0.5">
                اختر شكل البطاقة المفضل لمكتبة الأفلام والمسلسلات مع ضبط عدد البطاقات في الصف.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl bg-[#1a242e] border border-white/10 p-1">
                {([4, 5, 6] as const).map((cols) => (
                  <button
                    key={cols}
                    type="button"
                    onClick={() => onChangeHomeConfig(normalizeHomeConfig({ ...cfg, cardsPerRow: cols }))}
                    className={`font-latin rounded-lg px-2.5 py-1 text-[11px] font-black cursor-pointer ${
                      cfg.cardsPerRow === cols
                        ? 'bg-[#f9c400] text-[#06131c]'
                        : 'text-[#b7c9ef] hover:text-white'
                    }`}
                  >
                    {cols} أعمدة
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={busyAction}
                onClick={() => void onSaveHomeConfig(cfg)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#4CAF50] hover:bg-emerald-600 disabled:opacity-50 px-5 py-2 text-xs font-black text-white shadow-lg cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{busyAction ? 'جاري الحفظ...' : 'حفظ شكل البطاقة'}</span>
              </button>
            </div>
          </div>

          {/* Live Interactive Selected Preview + Clean Default Option */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center rounded-2xl bg-[#111c27] border border-white/10 p-4">
            <div className="lg:col-span-4 flex justify-center">
              <div className="w-44 sm:w-48">
                <MovieCard
                  item={previewItem}
                  onSelect={() => undefined}
                  isInWatchlist={true}
                  onToggleWatchlist={() => undefined}
                  variant={cfg.cardStyle}
                />
              </div>
            </div>

            <div className="lg:col-span-8 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-[#f9c400]/15 border border-[#f9c400]/35 px-2.5 py-1 text-[11px] font-black text-[#f9c400]">
                  الشكل النشط حالياً: {currentMainMeta.badgeText}
                </span>
                <span className="font-latin text-xs font-bold text-[#b7c9ef]">
                  {currentMainMeta.englishName}
                </span>
              </div>
              <h4 className="font-display text-lg font-extrabold text-white">{currentMainMeta.name}</h4>
              <p className="text-xs sm:text-sm text-[#b7c9ef]">{currentMainMeta.description}</p>

              <div className="pt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSelectMainCardStyle('clean', true)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-extrabold cursor-pointer ${
                    cfg.cardStyle === 'clean'
                      ? 'bg-[#D92321] border-[#D92321] text-white'
                      : 'bg-[#1a242e] border-white/15 text-[#b7c9ef] hover:text-white'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>العودة إلى {MAIN_CARD_STYLE_CLEAN_META.name}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Grid of All 20 Professional 3D Card Styles (Live Visual Previews) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {MAIN_3D_CARD_STYLES.map((styleMeta) => {
              const selected = cfg.cardStyle === styleMeta.id;
              return (
                <div
                  key={styleMeta.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void handleSelectMainCardStyle(styleMeta.id, false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void handleSelectMainCardStyle(styleMeta.id, false);
                    }
                  }}
                  className={`relative flex flex-col rounded-2xl border p-2.5 text-right transition-all cursor-pointer ${
                    selected
                      ? 'bg-[#D92321]/15 border-[#f9c400] ring-2 ring-[#f9c400]/40 shadow-xl'
                      : 'bg-[#1a242e]/60 border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 mb-2">
                    <span
                      className="font-latin rounded-md px-1.5 py-0.5 text-[10px] font-black text-white"
                      style={{ backgroundColor: styleMeta.accentHex }}
                    >
                      {styleMeta.badgeText}
                    </span>
                    {selected && (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#4CAF50] text-white">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>

                  {/* Live Interactive Card Preview */}
                  <div className="mb-2.5 flex-1">
                    <MovieCard
                      item={previewItem}
                      onSelect={() => {
                        void handleSelectMainCardStyle(styleMeta.id, false);
                      }}
                      isInWatchlist={true}
                      onToggleWatchlist={() => {
                        void handleSelectMainCardStyle(styleMeta.id, false);
                      }}
                      variant={styleMeta.id}
                    />
                  </div>

                  <p className="text-xs font-extrabold text-white line-clamp-1">{styleMeta.name}</p>
                  <p className="font-latin text-[10px] text-[#b7c9ef]/75 truncate mt-0.5">
                    {styleMeta.englishName}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================
          SUB-TAB 2: 7 Recently Watched 3D Card Styles
          ===================================================== */}
      {subTab === 'recently_watched' && (
        <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-4 sm:p-6 space-y-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <h3 className="font-display text-base sm:text-lg font-extrabold text-white">
                بطاقة «شاهدته مؤخراً» ثلاثية الأبعاد (7 أشكال احترافية)
              </h3>
              <p className="text-xs text-[#b7c9ef] mt-0.5">
                تصميمات 3D متوافقة بسلاسة مع التمرير باللمس على الهاتف وشاشات الكمبيوتر.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl bg-[#1a242e] border border-white/10 p-1">
                <button
                  type="button"
                  onClick={() => setRwPreviewDevice('mobile')}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-pointer ${
                    rwPreviewDevice === 'mobile' ? 'bg-[#D92321] text-white' : 'text-[#b7c9ef]'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>الهاتف</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRwPreviewDevice('desktop')}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-pointer ${
                    rwPreviewDevice === 'desktop' ? 'bg-[#D92321] text-white' : 'text-[#b7c9ef]'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>الموقع</span>
                </button>
              </div>

              <button
                type="button"
                disabled={busyAction}
                onClick={() => void onSaveRecentlyWatchedUiConfig(rwCfg)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#4CAF50] hover:bg-emerald-600 disabled:opacity-50 px-5 py-2 text-xs font-black text-white shadow-lg cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{busyAction ? 'جاري الحفظ...' : 'حفظ شكل شاهدته مؤخراً'}</span>
              </button>
            </div>
          </div>

          {/* 7 Interactive 3D RW Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {RECENTLY_WATCHED_3D_STYLES.map((styleMeta) => {
              const selected = rwCfg.cardStyle === styleMeta.id;
              return (
                <div
                  key={styleMeta.id}
                  onClick={() => void handleSelectRwCardStyle(styleMeta.id, false)}
                  className={`rounded-2xl border p-3.5 transition-all cursor-pointer space-y-3 ${
                    selected
                      ? 'bg-[#D92321]/15 border-[#f9c400] ring-2 ring-[#f9c400]/35 shadow-xl'
                      : 'bg-[#1a242e]/50 border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="font-latin rounded-md px-2 py-0.5 text-[10px] font-black text-white"
                      style={{ backgroundColor: styleMeta.accentHex }}
                    >
                      3D #{styleMeta.index}
                    </span>
                    {selected && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#4CAF50] px-2 py-0.5 text-[10px] font-black text-white">
                        <Check className="w-3 h-3" />
                        <span>مفعّل</span>
                      </span>
                    )}
                  </div>

                  {/* Live 3D Card Mockup Matching Exact RW Styling */}
                  <div className={`mx-auto ${rwPreviewDevice === 'mobile' ? 'w-40' : 'w-48'}`}>
                    <div className={`rtv-rw-3d-card rtv-rw-3d--${styleMeta.id} relative flex flex-col`}>
                      <div className="rtv-rw-3d-shell overflow-hidden">
                        <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#101620]">
                          <img
                            src={previewItem.backdrop_url || previewItem.poster_url || previewItem.poster}
                            alt={styleMeta.name}
                            className="h-full w-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                          <span
                            className="font-latin absolute top-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[9px] font-black text-white"
                            style={{ backgroundColor: styleMeta.accentHex }}
                          >
                            S1 · E4
                          </span>
                          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/20">
                            <div
                              className="h-full"
                              style={{ width: '68%', backgroundColor: styleMeta.accentHex }}
                            />
                          </div>
                        </div>
                        <div className="p-2.5 text-right space-y-1.5">
                          <p className="text-xs font-extrabold text-white truncate">{previewItem.title}</p>
                          <div className="flex items-center justify-between text-[10px] text-[#b7c9ef]">
                            <span>الحلقة 4</span>
                            <span>منذ ساعتين</span>
                          </div>
                          <div
                            className="rounded-lg py-1 text-center text-[10px] font-black text-white"
                            style={{ backgroundColor: styleMeta.accentHex }}
                          >
                            متابعة المشاهدة
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-right space-y-0.5">
                    <h4 className="text-xs font-extrabold text-white">{styleMeta.name}</h4>
                    <p className="text-[11px] text-[#b7c9ef] line-clamp-2">{styleMeta.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================
          SUB-TAB 3: 25 Full-Site Themes + Preserved Default
          ===================================================== */}
      {subTab === 'site_themes' && (
        <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-4 sm:p-6 space-y-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <h3 className="font-display text-base sm:text-lg font-extrabold text-white">
                25 شكلاً مختلفاً للموقع بالكامل (+ الحفاظ على الشكل الحالي)
              </h3>
              <p className="text-xs text-[#b7c9ef] mt-0.5">
                بدّل المظهر العام للموقع بنقرة واحدة لتخصيص كل نسخة أو اسم موقع بمظهره الخاص.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `الكل (${SITE_THEMES.length})` },
                  { id: 'default', label: 'الأصلي' },
                  { id: 'dark', label: 'داكنة' },
                  { id: 'neon', label: 'نيون' },
                  { id: 'luxury', label: 'فاخرة' },
                  { id: 'light', label: 'فاتحة' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setThemeCategoryFilter(cat.id)}
                  className={`rounded-xl px-3 py-1.5 text-[11px] font-extrabold border cursor-pointer ${
                    themeCategoryFilter === cat.id
                      ? 'bg-[#D92321] border-[#D92321] text-white'
                      : 'bg-[#1a242e] border-white/10 text-[#b7c9ef] hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredThemes.map((theme) => {
              const selected = siteThemeId === theme.id;
              const previewCssVars = buildSiteThemeCssVars(theme.id) as CSSProperties;
              return (
                <div
                  key={theme.id}
                  className={`flex flex-col justify-between rounded-2xl border p-3.5 transition-all space-y-3 ${
                    selected
                      ? 'bg-[#D92321]/12 border-[#f9c400] ring-2 ring-[#f9c400]/35 shadow-xl'
                      : 'bg-[#1a242e]/50 border-white/10 hover:border-white/25'
                  }`}
                >
                  {/* Mini Site Mockup in Real Theme Palette */}
                  <div
                    data-site-theme={theme.id}
                    data-site-light={theme.isLight ? 'true' : undefined}
                    style={{
                      ...previewCssVars,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      borderColor: theme.border,
                    }}
                    className="rtv-site-preview rounded-xl border p-2.5 space-y-2 overflow-hidden"
                  >
                    <div
                      className="flex items-center justify-between rounded-lg px-2 py-1"
                      style={{ backgroundColor: theme.header }}
                    >
                      <span
                        className="font-latin text-[10px] font-black"
                        style={{ color: theme.accent }}
                      >
                        {theme.index === 0 ? 'ORIGINAL' : `#${String(theme.index).padStart(2, '0')}`}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.accent }} />
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.gold }} />
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.success }} />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {[0, 1, 2].map((box) => (
                        <div
                          key={box}
                          className="rounded-lg p-1.5 space-y-1 border"
                          style={{
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                            borderRadius: `${Math.max(6, Math.round(theme.radiusPx * 0.6))}px`,
                          }}
                        >
                          <div
                            className="aspect-[2/2.2] rounded"
                            style={{ backgroundColor: theme.surface2 }}
                          />
                          <div
                            className="h-1.5 w-4/5 rounded"
                            style={{ backgroundColor: theme.text, opacity: 0.85 }}
                          />
                        </div>
                      ))}
                    </div>

                    <div
                      className="rounded-lg py-1 text-center text-[10px] font-black text-white rtv-keep-white"
                      style={{ backgroundColor: theme.accent }}
                    >
                      مشاهدة الآن
                    </div>
                  </div>

                  <div className="space-y-1 text-right">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-extrabold text-white truncate">{theme.name}</h4>
                      {theme.isLight && (
                        <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-black text-sky-300 shrink-0">
                          فاتح
                        </span>
                      )}
                    </div>
                    <p className="font-latin text-[10px] text-[#b7c9ef]/80 truncate">
                      {theme.englishName}
                    </p>
                    <p className="text-[11px] text-[#b7c9ef] line-clamp-2">{theme.description}</p>
                  </div>

                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => {
                      void onSaveSiteTheme(theme.id).then(() =>
                        onNotify(`تم تفعيل المظهر: ${theme.name}`)
                      );
                    }}
                    className={`w-full inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#4CAF50] text-white'
                        : 'bg-[#1a242e] hover:bg-[#D92321] border border-white/15 text-white'
                    }`}
                  >
                    {selected ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>مفعّل حالياً</span>
                      </>
                    ) : (
                      <>
                        <Layers className="w-3.5 h-3.5" />
                        <span>تفعيل وحفظ المظهر</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
