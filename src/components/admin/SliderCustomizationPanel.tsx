import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clapperboard,
  Eye,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Minimize2,
  Monitor,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star,
} from 'lucide-react';
import {
  HeroImageFitMode,
  HeroInfoPosition,
  HeroTextAlign,
  HomeLayoutConfig,
  MediaItem,
} from '../../types/media';
import { DEFAULT_HOME_CONFIG, normalizeHomeConfig } from '../../lib/homeConfig';
import { optimizeTmdbUrl } from '../../lib/mediaImages';
import { HeroSliderVariant, useHeroSliderVariant } from '../../lib/heroSliderMode';
import { useShowcaseSliderConfig } from '../../lib/showcaseSliderConfig';
import { useStreamV4SliderConfig } from '../../lib/streamV4SliderConfig';
import { ShowcaseSliderSettingsPanel } from './ShowcaseSliderSettingsPanel';
import { StreamV4SliderSettingsPanel } from './StreamV4SliderSettingsPanel';

interface SliderCustomizationPanelProps {
  homeConfig: HomeLayoutConfig;
  catalog: MediaItem[];
  busy?: boolean;
  onGetAuthToken?: () => Promise<string | undefined>;
  onSaveHomeConfig: (next: HomeLayoutConfig) => Promise<void>;
  onNotify: (msg: string) => void;
}

const ALIGN_OPTIONS: Array<{ id: HeroTextAlign; label: string }> = [
  { id: 'right', label: 'يمين (RTL)' },
  { id: 'center', label: 'توسيط' },
  { id: 'left', label: 'يسار' },
];

const POSITION_OPTIONS: Array<{ id: HeroInfoPosition; label: string }> = [
  { id: 'middle-right', label: 'وسط يمين' },
  { id: 'middle-center', label: 'وسط منتصف' },
  { id: 'middle-left', label: 'وسط يسار' },
  { id: 'bottom-right', label: 'أسفل يمين' },
  { id: 'bottom-center', label: 'أسفل منتصف' },
  { id: 'bottom-left', label: 'أسفل يسار' },
];

const IMAGE_FIT_OPTIONS: Array<{
  id: HeroImageFitMode;
  label: string;
  badge?: string;
  desc: string;
}> = [
  {
    id: 'cover',
    label: 'ملء عرض الشاشة بالكامل (Full Width Cover)',
    badge: 'الافتراضي',
    desc: 'يمدد الصورة بعرض السلايدر الكامل 100vw دون أي هوامش جانبية مع الحفاظ على التناسق.',
  },
  {
    id: 'contain',
    label: 'إظهار الصورة كاملة (Contain)',
    desc: 'يعرض الصورة الأصلية كاملة مع الحفاظ على نسبة الأبعاد دون أي قص.',
  },
  {
    id: 'contain_blur',
    label: 'خلفية مموهة مكبرة + الصورة كاملة',
    desc: 'يملأ الفراغات بنسخة مكبرة ومموهة مع طبقة تعتيم ويُظهر الصورة الأصلية كاملة وواضحة.',
  },
];

const ELEMENT_TOGGLES: Array<{
  key: keyof Pick<
    HomeLayoutConfig,
    | 'heroShowBadge'
    | 'heroShowRating'
    | 'heroShowYear'
    | 'heroShowDuration'
    | 'heroShowGenres'
    | 'heroShowQuality'
    | 'heroShowWatchBtn'
    | 'heroShowDetailsBtn'
    | 'heroShowWatchlistBtn'
    | 'heroShowHighlights'
  >;
  label: string;
  desc: string;
}> = [
  { key: 'heroShowBadge', label: 'شارة السلايدر العلوية', desc: 'مثال: اختيار المحررين' },
  { key: 'heroShowRating', label: 'تقييم المشاهدين', desc: 'عرض نجمة تقييم المشاهدين والدرجة من 5' },
  { key: 'heroShowYear', label: 'سنة الإنتاج', desc: 'عرض سنة الإصدار في السطر التعريفي' },
  { key: 'heroShowDuration', label: 'مدة العرض / الحلقات', desc: 'المدة الزمنية أو عدد الحلقات' },
  { key: 'heroShowQuality', label: 'شارة الجودة (4K / WEB-DL)', desc: 'عرض شارة جودة النسخة' },
  { key: 'heroShowGenres', label: 'التصنيفات والنوع', desc: 'وسوم الدراما/الأكشن أسفل السلايدر' },
  { key: 'heroShowWatchBtn', label: 'زر المشاهدة الرئيسي', desc: 'زر التشغيل المباشر' },
  { key: 'heroShowDetailsBtn', label: 'زر التفاصيل', desc: 'زر فتح صفحة العمل' },
  { key: 'heroShowWatchlistBtn', label: 'زر قائمة المشاهدة', desc: 'زر الإضافة للمفضلة' },
  { key: 'heroShowHighlights', label: 'شريط مؤشرات المكتبة السفلي', desc: 'الأعمال والمنصات أسفل السلايدر' },
];

export function SliderCustomizationPanel({
  homeConfig,
  catalog,
  busy = false,
  onGetAuthToken,
  onSaveHomeConfig,
  onNotify,
}: SliderCustomizationPanelProps) {
  const [draft, setDraft] = useState<HomeLayoutConfig>(() => normalizeHomeConfig(homeConfig));
  const [heroSliderVariant, setHeroSliderVariant] = useHeroSliderVariant();
  const [showcaseConfig] = useShowcaseSliderConfig();
  const [v4Config] = useStreamV4SliderConfig();
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewSlideIdx, setPreviewSlideIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleSelectSliderVariant = (variant: HeroSliderVariant) => {
    setHeroSliderVariant(variant);
    onNotify(
      variant === 'cinematic'
        ? 'تم تفعيل السلايدر السينمائي 3D (Cinematic Slider) على الرئيسية فوراً'
        : variant === 'showcase'
          ? 'تم تفعيل السلايدر الاستعراضي الثالث (Showcase Slider) على الرئيسية فوراً'
          : variant === 'stream_v4'
            ? 'تم تفعيل السلايدر الرابع (Cinema Logo Hero) بألوان وهوية الموقع فوراً'
            : 'تم الرجوع إلى السلايدر الأساسي (Original Slider) كما هو تماماً'
    );
  };

  useEffect(() => {
    setDraft(normalizeHomeConfig(homeConfig));
  }, [homeConfig]);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(normalizeHomeConfig(homeConfig)),
    [draft, homeConfig]
  );

  const previewSlides = useMemo(() => {
    const withMedia = catalog.filter((item) => item.backdrop || item.poster);
    if (withMedia.length > 0) return withMedia.slice(0, 5);
    return catalog.slice(0, 5);
  }, [catalog]);

  const activeSlide =
    previewSlides[previewSlideIdx % Math.max(1, previewSlides.length)] || catalog[0];

  const updateDraft = (patch: Partial<HomeLayoutConfig>) => {
    setDraft((prev) => normalizeHomeConfig({ ...prev, ...patch }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveHomeConfig(draft);
    } finally {
      setSaving(false);
    }
  };

  const handleResetSliderOnly = async () => {
    const resetConfig = normalizeHomeConfig({
      ...draft,
      heroImageFit: DEFAULT_HOME_CONFIG.heroImageFit,
      heroBackdropBlurPx: DEFAULT_HOME_CONFIG.heroBackdropBlurPx,
      heroBackdropDimPct: DEFAULT_HOME_CONFIG.heroBackdropDimPct,
      heroShowDescription: DEFAULT_HOME_CONFIG.heroShowDescription,
      heroTitleSizePx: DEFAULT_HOME_CONFIG.heroTitleSizePx,
      heroDescriptionSizePx: DEFAULT_HOME_CONFIG.heroDescriptionSizePx,
      heroDescriptionLines: DEFAULT_HOME_CONFIG.heroDescriptionLines,
      heroTextAlign: DEFAULT_HOME_CONFIG.heroTextAlign,
      heroInfoPosition: DEFAULT_HOME_CONFIG.heroInfoPosition,
      heroTextMaxWidthPx: DEFAULT_HOME_CONFIG.heroTextMaxWidthPx,
      heroShowBadge: DEFAULT_HOME_CONFIG.heroShowBadge,
      heroShowRating: DEFAULT_HOME_CONFIG.heroShowRating,
      heroShowYear: DEFAULT_HOME_CONFIG.heroShowYear,
      heroShowDuration: DEFAULT_HOME_CONFIG.heroShowDuration,
      heroShowGenres: DEFAULT_HOME_CONFIG.heroShowGenres,
      heroShowQuality: DEFAULT_HOME_CONFIG.heroShowQuality,
      heroShowWatchBtn: DEFAULT_HOME_CONFIG.heroShowWatchBtn,
      heroShowDetailsBtn: DEFAULT_HOME_CONFIG.heroShowDetailsBtn,
      heroShowWatchlistBtn: DEFAULT_HOME_CONFIG.heroShowWatchlistBtn,
      heroShowHighlights: DEFAULT_HOME_CONFIG.heroShowHighlights,
    });
    setDraft(resetConfig);
    onNotify('تمت استعادة الإعدادات الافتراضية للسلايدر في المسودة — اضغط حفظ لتطبيقها.');
  };

  const posVerticalClass = draft.heroInfoPosition?.startsWith('middle-')
    ? 'justify-center'
    : 'justify-end';
  const posHorizontalClass = draft.heroInfoPosition?.endsWith('-left')
    ? 'items-end'
    : draft.heroInfoPosition?.endsWith('-center')
      ? 'items-center'
      : 'items-start';
  const textAlignClass =
    draft.heroTextAlign === 'center'
      ? 'text-center'
      : draft.heroTextAlign === 'left'
        ? 'text-left'
        : 'text-right';

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl rtv-admin-accent-soft border rtv-admin-accent-text">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg sm:text-xl font-extrabold text-white">
                إعدادات السلايدر الرئيسي (Hero Slider Customization)
              </h2>
              <span className="rounded-lg bg-teal-500/15 border border-teal-400/35 px-2.5 py-0.5 text-[10px] font-extrabold text-teal-300">
                تأثير فوري بعد الحفظ
              </span>
            </div>
            <p className="text-xs text-[#b7c9ef] mt-1">
              تحكم مستقل في إظهار أو إخفاء وصف الفيلم، أحجام الخطوط، التموضع، التقييمات، والأزرار داخل السلايدر الرئيسي.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={busy || saving}
            onClick={() => void handleResetSliderOnly()}
            className="rtv-admin-btn-height inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الافتراضي</span>
          </button>

          {isDirty && (
            <button
              type="button"
              disabled={busy || saving}
              onClick={() => setDraft(normalizeHomeConfig(homeConfig))}
              className="rtv-admin-btn-height inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-amber-300 cursor-pointer"
            >
              <span>تراجع</span>
            </button>
          )}

          <button
            type="button"
            disabled={busy || saving}
            onClick={() => void handleSave()}
            className="rtv-admin-btn-height inline-flex items-center gap-2 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-50 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{saving ? 'جاري الحفظ...' : 'حفظ إعدادات السلايدر'}</span>
          </button>
        </div>
      </div>

      {/* Slider Design Mode Switcher (Original vs Cinematic) */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Clapperboard className="w-5 h-5 rtv-admin-accent-text" />
            <h3 className="font-display text-base font-extrabold text-white">
              اختيار تصميم السلايدر (Slider Design Style)
            </h3>
          </div>
          <span className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
            تبديل فوري ومستقل
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
          <button
            type="button"
            onClick={() => handleSelectSliderVariant('original')}
            className={`rounded-2xl border p-4 text-right transition-all cursor-pointer flex flex-col gap-2 ${
              heroSliderVariant === 'original'
                ? 'rtv-admin-accent-soft border-sky-400/50 shadow-md'
                : 'bg-[#1a242e]/65 border-white/[0.08] hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-white">
                1. السلايدر الأساسي (Original)
              </span>
              {heroSliderVariant === 'original' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold text-white shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  مفعّل الآن
                </span>
              )}
            </div>
            <p className="text-xs text-[#b7c9ef] leading-relaxed">
              السلايدر الأصلي الكامل للموقع بكل تصميمه وألوانه وأزراره وعناصر التحكم والمصغرات دون أي تغيير.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleSelectSliderVariant('cinematic')}
            className={`rounded-2xl border p-4 text-right transition-all cursor-pointer flex flex-col gap-2 ${
              heroSliderVariant === 'cinematic'
                ? 'rtv-admin-accent-soft border-sky-400/50 shadow-md'
                : 'bg-[#1a242e]/65 border-white/[0.08] hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-white">
                2. السلايدر السينمائي 3D
              </span>
              {heroSliderVariant === 'cinematic' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold text-white shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  مفعّل الآن
                </span>
              )}
            </div>
            <p className="text-xs text-[#b7c9ef] leading-relaxed">
              تصميم سينمائي فاخر ثلاثي الأبعاد (Premium 3D) بعمق بصري وحركة Zoom ناعمة، يعرض الصورة واسم العمل فقط بدون أزرار.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleSelectSliderVariant('showcase')}
            className={`rounded-2xl border p-4 text-right transition-all cursor-pointer flex flex-col gap-2 ${
              heroSliderVariant === 'showcase'
                ? 'rtv-admin-accent-soft border-sky-400/50 shadow-md'
                : 'bg-[#1a242e]/65 border-white/[0.08] hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-white">
                3. السلايدر الاستعراضي (Showcase)
              </span>
              {heroSliderVariant === 'showcase' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold text-white shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  مفعّل الآن
                </span>
              )}
            </div>
            <p className="text-xs text-[#b7c9ef] leading-relaxed">
              تصميم استعراضي بواجهة ثابتة وشريط أسماء الأعمال وشعارات PNG مستقلة في الأسفل.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleSelectSliderVariant('stream_v4')}
            className={`rounded-2xl border p-4 text-right transition-all cursor-pointer flex flex-col gap-2 ${
              heroSliderVariant === 'stream_v4'
                ? 'rtv-admin-accent-soft border-sky-400/50 shadow-md'
                : 'bg-[#1a242e]/65 border-white/[0.08] hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-white">
                4. سلايدر الشعارات (Cinema V4)
              </span>
              {heroSliderVariant === 'stream_v4' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold text-white shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  مفعّل الآن
                </span>
              )}
            </div>
            <p className="text-xs text-[#b7c9ef] leading-relaxed">
              التصميم المرجعي (Owl Stage) بألوان وهوية موقعك، حركة تمرير أفقية ناعمة، وشعارات PNG للأفلام في السلايدر والشريط السفلي.
            </p>
          </button>
        </div>
      </div>

      {/* Live Preview Box */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 rtv-admin-accent-text" />
            <h3 className="font-display text-base font-extrabold text-white">
              المعاينة المباشرة للسلايدر الرئيسي
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {previewSlides.length > 1 && (
              <div className="flex items-center gap-1 rounded-xl bg-[#1a242e] p-1 border border-white/10">
                {previewSlides.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setPreviewSlideIdx(idx)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-pointer ${
                      previewSlideIdx === idx
                        ? 'rtv-admin-accent-bg'
                        : 'text-[#b7c9ef] hover:text-white'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1 rounded-xl bg-[#1a242e] p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setPreviewDevice('desktop')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-pointer ${
                  previewDevice === 'desktop'
                    ? 'rtv-admin-accent-bg'
                    : 'text-[#b7c9ef] hover:text-white'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>كمبيوتر</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewDevice('mobile')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-pointer ${
                  previewDevice === 'mobile'
                    ? 'rtv-admin-accent-bg'
                    : 'text-[#b7c9ef] hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>موبايل</span>
              </button>
            </div>
          </div>
        </div>

        {/* Isolated Cinema Site Preview */}
        {heroSliderVariant === 'cinematic' ? (
          <div
            className={`rtv-site-preview mx-auto rounded-2xl overflow-hidden border border-white/15 bg-[#08080a] relative transition-all ${
              previewDevice === 'mobile' ? 'max-w-[360px] h-[440px]' : 'w-full h-[390px]'
            }`}
          >
            {activeSlide && (
              <img
                src={optimizeTmdbUrl(
                  previewDevice === 'mobile'
                    ? activeSlide.poster || activeSlide.backdrop
                    : activeSlide.backdrop || activeSlide.poster,
                  'w780'
                )}
                alt={activeSlide.title}
                loading="lazy"
                decoding="async"
                className={`pointer-events-none absolute inset-0 h-full w-full object-cover scale-[1.03] ${
                  previewDevice === 'mobile' ? 'object-[50%_18%]' : 'object-[50%_22%]'
                }`}
              />
            )}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(to bottom, rgba(8,8,10,0.48) 0%, transparent 32%), linear-gradient(to top, #0f0f0f 0%, rgba(12,12,14,0.9) 14%, rgba(10,10,12,0.52) 30%, transparent 72%), radial-gradient(ellipse 56% 24% at 50% 90%, rgba(229,9,20,0.14) 0%, transparent 78%), radial-gradient(ellipse 90% 78% at 50% 42%, transparent 54%, rgba(0,0,0,0.44) 100%)',
              }}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-6">
              {(() => {
                const title = activeSlide?.title || 'Naruto';
                const isArabic = /[\u0600-\u06FF]/.test(title);
                return (
                  <h4
                    dir="auto"
                    className={`text-center font-bold text-white drop-shadow ${
                      isArabic
                        ? 'font-display text-sm sm:text-base tracking-normal'
                        : 'font-latin uppercase text-xs sm:text-sm tracking-[0.3em]'
                    }`}
                  >
                    {title}
                  </h4>
                );
              })()}
            </div>
          </div>
        ) : heroSliderVariant === 'showcase' ? (
          <div
            className={`rtv-site-preview mx-auto rounded-2xl overflow-hidden border border-white/15 bg-[#0b0a10] relative transition-all flex flex-col justify-end ${
              previewDevice === 'mobile' ? 'max-w-[360px] h-[440px]' : 'w-full h-[390px]'
            }`}
          >
            {activeSlide && (
              <img
                src={optimizeTmdbUrl(activeSlide.backdrop || activeSlide.poster, 'w780')}
                alt={activeSlide.title}
                loading="lazy"
                decoding="async"
                className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
                  previewDevice === 'mobile' ? 'object-[50%_18%]' : 'object-[28%_20%]'
                }`}
              />
            )}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(to left, rgba(11,9,22,0.94) 0%, rgba(13,10,26,0.78) 32%, rgba(13,10,26,0.34) 60%, transparent 82%), linear-gradient(to top, #0f0f0f 0%, rgba(12,10,22,0.92) 20%, transparent 56%)',
              }}
            />
            <div className="relative z-10 p-5 sm:p-7 space-y-3">
              <div className="max-w-[340px] space-y-2 text-right">
                {showcaseConfig.showTitle &&
                  (() => {
                    const pngUrl = activeSlide ? showcaseConfig.titleLogos[activeSlide.id] : '';
                    if (showcaseConfig.usePngLogoInHero && pngUrl) {
                      return (
                        <img
                          src={pngUrl}
                          alt={activeSlide?.title || ''}
                          referrerPolicy="no-referrer"
                          style={{
                            maxHeight: `${
                              previewDevice === 'mobile'
                                ? Math.round(showcaseConfig.logoMaxHeightPx * 0.65)
                                : Math.round(showcaseConfig.logoMaxHeightPx * 0.85)
                            }px`,
                            maxWidth: `${
                              previewDevice === 'mobile'
                                ? Math.min(240, showcaseConfig.logoMaxWidthPx)
                                : showcaseConfig.logoMaxWidthPx
                            }px`,
                          }}
                          className="object-contain object-right drop-shadow"
                        />
                      );
                    }
                    return (
                      <h4
                        style={{
                          fontSize: `${
                            previewDevice === 'mobile'
                              ? Math.max(20, Math.round(showcaseConfig.titleSizePx * 0.65))
                              : Math.round(showcaseConfig.titleSizePx * 0.85)
                          }px`,
                        }}
                        className="font-display font-black text-white leading-tight drop-shadow"
                      >
                        {activeSlide?.title || 'Heart of the Beast'}
                      </h4>
                    );
                  })()}

                {showcaseConfig.showEnglishSubtitle && activeSlide?.englishTitle && (
                  <p className="font-latin text-[11px] font-bold text-white/75" dir="ltr">
                    {activeSlide.englishTitle}
                  </p>
                )}

                {showcaseConfig.showMetadata && (
                  <p
                    style={{
                      fontSize: `${
                        previewDevice === 'mobile'
                          ? Math.max(10, showcaseConfig.metaSizePx - 1)
                          : showcaseConfig.metaSizePx
                      }px`,
                    }}
                    className="font-bold text-white/90"
                  >
                    {activeSlide?.kind === 'series' ? 'مسلسلات' : 'افلام'} •{' '}
                    {activeSlide?.genres?.slice(0, 2).join(' ، ') || 'اكشن ، اثارة'} •{' '}
                    {activeSlide?.year || '2026'}
                  </p>
                )}

                {showcaseConfig.showStory && (
                  <p
                    style={{
                      fontSize: `${
                        previewDevice === 'mobile'
                          ? Math.max(11, showcaseConfig.storySizePx - 1)
                          : showcaseConfig.storySizePx
                      }px`,
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: showcaseConfig.storyLines,
                      overflow: 'hidden',
                    }}
                    className="text-[#e2e2e8]/90 leading-relaxed"
                  >
                    {activeSlide?.story ||
                      'عرض سينمائي مباشر بجودة عالية وتفاصيل واضحة.'}
                  </p>
                )}

                {showcaseConfig.showCast && (activeSlide?.cast?.length || 0) > 0 && (
                  <p
                    style={{ fontSize: `${Math.max(10, showcaseConfig.metaSizePx - 1)}px` }}
                    className="font-bold text-white/80"
                  >
                    {activeSlide!.cast
                      .slice(0, 3)
                      .map((c) => c.name)
                      .join(' • ')}
                  </p>
                )}

                {(showcaseConfig.showWatchBtn || showcaseConfig.showWatchlistBtn) && (
                  <div className="flex items-center gap-2 pt-1">
                    {showcaseConfig.showWatchBtn && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E50914] px-4 py-1.5 text-[11px] font-extrabold text-white shadow-[0_8px_20px_rgba(229,9,20,0.45)]">
                        <Play className="w-3 h-3 fill-current" />
                        <span>{showcaseConfig.watchBtnText || 'شاهد وحمل الان'}</span>
                      </span>
                    )}
                    {showcaseConfig.showWatchlistBtn && (
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 border border-white/20 text-xs font-bold text-white">
                        +
                      </span>
                    )}
                  </div>
                )}

                {showcaseConfig.showTagline && activeSlide?.tagline && (
                  <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white/90">
                    <span className="inline-block h-3 w-[3px] rounded-full bg-[#E50914]" />
                    <span>{activeSlide.tagline}</span>
                  </p>
                )}
              </div>

              {showcaseConfig.showBottomStrip && (
                <div className="border-t border-white/10 pt-2.5 flex items-center justify-between gap-3 overflow-hidden">
                  {previewSlides.slice(0, previewDevice === 'mobile' ? 3 : 5).map((s, idx) => {
                    const isAct = idx === previewSlideIdx % previewSlides.length;
                    const stripPng = showcaseConfig.titleLogos[s.id];
                    return (
                      <div key={s.id} className="relative pb-1.5 text-center truncate">
                        {showcaseConfig.usePngLogoInStrip && stripPng ? (
                          <img
                            src={stripPng}
                            alt={s.title}
                            referrerPolicy="no-referrer"
                            style={{
                              height: `${Math.min(34, showcaseConfig.stripLogoHeightPx)}px`,
                            }}
                            className={`mx-auto object-contain ${
                              isAct ? 'opacity-100' : 'opacity-60'
                            }`}
                          />
                        ) : (
                          <span
                            style={{
                              fontSize: `${Math.min(16, showcaseConfig.stripTextSizePx)}px`,
                            }}
                            className={`font-black truncate ${
                              isAct ? 'text-white' : 'text-white/55'
                            }`}
                          >
                            {s.englishTitle || s.title}
                          </span>
                        )}
                        {isAct && (
                          <span className="block mx-auto mt-1 h-[2.5px] w-7 rounded-full bg-[#E50914]" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : heroSliderVariant === 'stream_v4' ? (
          <div
            className={`rtv-site-preview mx-auto rounded-2xl overflow-hidden border border-white/15 bg-[var(--rtv-site-bg,#0f0f0f)] relative transition-all flex flex-col justify-end ${
              previewDevice === 'mobile' ? 'max-w-[360px] h-[440px]' : 'w-full h-[395px]'
            }`}
          >
            {activeSlide && (
              <img
                src={optimizeTmdbUrl(activeSlide.backdrop || activeSlide.poster, 'w780')}
                alt={activeSlide.title}
                loading="lazy"
                decoding="async"
                className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
                  previewDevice === 'mobile' ? 'object-[50%_18%]' : 'object-[24%_20%]'
                }`}
              />
            )}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                opacity: v4Config.scrimIntensityPct / 100,
                background:
                  'linear-gradient(to left, color-mix(in srgb, var(--rtv-site-bg, #0f0f0f) 96%, transparent) 0%, color-mix(in srgb, var(--rtv-site-bg, #0f0f0f) 82%, transparent) 28%, color-mix(in srgb, var(--rtv-site-bg, #0f0f0f) 38%, transparent) 56%, transparent 82%), linear-gradient(to top, var(--rtv-site-bg, #0f0f0f) 0%, color-mix(in srgb, var(--rtv-site-bg, #0f0f0f) 90%, transparent) 20%, transparent 58%)',
              }}
            />
            {v4Config.bottomBlurPx > 0 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0"
                style={{
                  height: `${Math.round(v4Config.bottomBlendHeightPx * 0.72)}px`,
                  backdropFilter: `blur(${v4Config.bottomBlurPx}px)`,
                  WebkitBackdropFilter: `blur(${v4Config.bottomBlurPx}px)`,
                  maskImage:
                    'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 40%, transparent 100%)',
                  WebkitMaskImage:
                    'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 40%, transparent 100%)',
                }}
              />
            )}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0"
              style={{
                height: `${Math.round(v4Config.bottomBlendHeightPx * 0.75)}px`,
                background:
                  'linear-gradient(to top, var(--rtv-site-bg, #0f0f0f) 0%, color-mix(in srgb, var(--rtv-site-bg, #0f0f0f) 88%, transparent) 42%, transparent 100%)',
              }}
            />
            {(() => {
              const previewAccent =
                v4Config.colorMode === 'custom'
                  ? v4Config.customAccentColor
                  : 'var(--rtv-site-accent, #E50914)';
              const activePng = activeSlide ? v4Config.titleLogos[activeSlide.id] : '';
              const activeSlideDuration =
                (activeSlide && v4Config.slideDurations[activeSlide.id]) ||
                v4Config.defaultSlideDurationSec ||
                Number(draft.heroSlideIntervalSec) ||
                6;
              return (
                <div className="relative z-10 p-5 sm:p-7 pb-4 space-y-2.5">
                  <div className="max-w-[340px] space-y-2 text-right">
                    {v4Config.showTitle &&
                      (v4Config.usePngLogoInHero && activePng ? (
                        <img
                          src={activePng}
                          alt={activeSlide?.title || ''}
                          referrerPolicy="no-referrer"
                          style={{
                            maxHeight: `${
                              previewDevice === 'mobile'
                                ? Math.round(v4Config.logoMaxHeightPx * 0.6)
                                : Math.round(v4Config.logoMaxHeightPx * 0.78)
                            }px`,
                            maxWidth: `${
                              previewDevice === 'mobile'
                                ? Math.min(230, v4Config.logoMaxWidthPx)
                                : Math.min(300, v4Config.logoMaxWidthPx)
                            }px`,
                          }}
                          className="object-contain object-right drop-shadow"
                        />
                      ) : (
                        <h4
                          style={{
                            fontSize: `${
                              previewDevice === 'mobile'
                                ? Math.max(20, Math.round(v4Config.titleSizePx * 0.65))
                                : Math.round(v4Config.titleSizePx * 0.8)
                            }px`,
                          }}
                          className="font-display font-black text-white leading-tight drop-shadow"
                        >
                          {activeSlide?.title || 'Heart of the Beast'}
                        </h4>
                      ))}

                    {v4Config.showMetadata && (
                      <p
                        style={{ fontSize: `${v4Config.metaSizePx}px` }}
                        className="font-bold text-white/90"
                      >
                        {activeSlide?.kind === 'series' ? 'مسلسلات' : 'افلام'} •{' '}
                        {activeSlide?.genres?.slice(0, 2).join(' ، ') || 'اكشن ، اثارة'} •{' '}
                        {activeSlide?.year || '2026'}
                      </p>
                    )}

                    {v4Config.showStory && (
                      <p
                        style={{
                          fontSize: `${v4Config.storySizePx}px`,
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: v4Config.storyLines,
                          overflow: 'hidden',
                        }}
                        className="text-white/80 leading-relaxed"
                      >
                        {activeSlide?.story ||
                          'تصميم السلايدر الرابع مطابق للمرجع مع شعارات PNG وألوان موقع Rahaal TV.'}
                      </p>
                    )}

                    {v4Config.showCast && (activeSlide?.cast?.length || 0) > 0 && (
                      <p
                        style={{ fontSize: `${v4Config.castSizePx}px` }}
                        className="font-bold text-white/90"
                      >
                        {activeSlide!.cast
                          .slice(0, 3)
                          .map((c) => c.name)
                          .join(' • ')}
                      </p>
                    )}

                    {(v4Config.showWatchBtn || v4Config.showWatchlistBtn) && (
                      <div className="flex items-center gap-2 pt-1">
                        {v4Config.showWatchBtn && (
                          <span
                            style={{ backgroundColor: previewAccent }}
                            className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-extrabold text-white shadow-lg"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>{v4Config.watchBtnText || 'شاهد وحمل الان'}</span>
                          </span>
                        )}
                        {v4Config.showWatchlistBtn && (
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 border border-white/20 text-xs font-bold text-white">
                            +
                          </span>
                        )}
                      </div>
                    )}

                    {v4Config.showTagline && activeSlide?.tagline && (
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white/90">
                        <span
                          style={{ backgroundColor: previewAccent }}
                          className="inline-block h-3 w-[3px] rounded-full"
                        />
                        <span>{activeSlide.tagline}</span>
                      </p>
                    )}
                  </div>

                  {v4Config.showBottomStrip && (
                    <div className="pt-2 flex items-center justify-between gap-3 overflow-hidden">
                      {previewSlides
                        .slice(0, previewDevice === 'mobile' ? 3 : 5)
                        .map((s, idx) => {
                          const isAct = idx === previewSlideIdx % previewSlides.length;
                          const stripPng = v4Config.titleLogos[s.id];
                          return (
                            <div key={s.id} className="relative pb-1.5 text-center truncate">
                              {v4Config.usePngLogoInStrip && stripPng ? (
                                <img
                                  src={stripPng}
                                  alt={s.title}
                                  referrerPolicy="no-referrer"
                                  style={{
                                    height: `${Math.min(34, v4Config.stripLogoHeightPx)}px`,
                                  }}
                                  className={`mx-auto object-contain ${
                                    isAct ? 'opacity-100' : 'opacity-70'
                                  }`}
                                />
                              ) : (
                                <span
                                  style={{
                                    fontSize: `${Math.min(16, v4Config.stripTextSizePx)}px`,
                                  }}
                                  className={`font-black truncate ${
                                    isAct ? 'text-white' : 'text-white/65'
                                  }`}
                                >
                                  {s.englishTitle || s.title}
                                </span>
                              )}
                              {isAct && (
                                <span
                                  style={{ backgroundColor: previewAccent }}
                                  className="block mx-auto mt-1 h-[2.5px] w-8 rounded-full"
                                />
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}

                  {v4Config.showProgressBar && (
                    <div className="space-y-1 pt-0.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-white/70 font-latin tabular-nums">
                        <span>مدة ظهور العمل: {activeSlideDuration}s</span>
                        <span>
                          {(previewSlideIdx % Math.max(1, previewSlides.length)) + 1} /{' '}
                          {Math.max(1, previewSlides.length)}
                        </span>
                      </div>
                      <div
                        className="w-full rounded-full bg-white/15 overflow-hidden"
                        style={{ height: `${v4Config.progressBarHeightPx}px` }}
                      >
                        <div
                          className="h-full w-3/5 rounded-full"
                          style={{ backgroundColor: previewAccent }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
        <div
          className={`rtv-site-preview mx-auto rounded-2xl overflow-hidden border border-white/15 bg-[#0a0b0e] relative transition-all ${
            previewDevice === 'mobile' ? 'max-w-[360px] h-[420px]' : 'w-full h-[380px]'
          }`}
        >
          {activeSlide && (() => {
            const fitMode = draft.heroImageFit || 'cover';
            const previewImg = optimizeTmdbUrl(activeSlide.backdrop || activeSlide.poster, 'w780');
            const blurPx = draft.heroBackdropBlurPx ?? 24;
            const dimOpacity = Math.min(0.85, Math.max(0, (draft.heroBackdropDimPct ?? 45) / 100));
            return (
              <>
                {fitMode === 'contain_blur' && (
                  <>
                    <img
                      src={optimizeTmdbUrl(activeSlide.backdrop || activeSlide.poster, 'w300')}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      style={{ filter: `blur(${blurPx}px)` }}
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center scale-[1.14]"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-[#07080c]"
                      style={{ opacity: dimOpacity }}
                    />
                  </>
                )}
                <img
                  src={previewImg}
                  alt={activeSlide.title}
                  loading="lazy"
                  decoding="async"
                  className={
                    fitMode === 'cover'
                      ? 'absolute inset-0 h-full w-full object-cover object-center opacity-80'
                      : 'pointer-events-none absolute inset-0 z-[1] h-full w-full object-contain object-center'
                  }
                />
              </>
            );
          })()}
          <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/45 to-black/20" />
          <div
            className={`relative z-10 h-full w-full p-6 flex flex-col ${posVerticalClass} ${posHorizontalClass}`}
          >
            <div
              style={{ maxWidth: `${draft.heroTextMaxWidthPx || 540}px` }}
              className={`w-full space-y-2.5 ${textAlignClass}`}
            >
              {(draft.heroShowBadge || draft.heroShowQuality) && (
                <div
                  className={`flex flex-wrap items-center gap-2 ${
                    draft.heroTextAlign === 'center'
                      ? 'justify-center'
                      : draft.heroTextAlign === 'left'
                        ? 'justify-end'
                        : 'justify-start'
                  }`}
                >
                  {draft.heroShowBadge && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#E50914] px-2.5 py-0.5 text-[10px] font-extrabold text-white">
                      {draft.heroBadgeText || 'اختيار المحررين'}
                    </span>
                  )}
                  {draft.heroShowQuality && (
                    <span className="rounded-md bg-black/70 border border-white/20 px-2 py-0.5 font-latin text-[10px] font-bold text-white">
                      {activeSlide?.quality || '4K UHD'}
                    </span>
                  )}
                </div>
              )}

              <h4
                style={{
                  fontSize: `${
                    previewDevice === 'mobile'
                      ? Math.max(16, Math.round((draft.heroTitleSizePx || 26) * 0.78))
                      : draft.heroTitleSizePx || 26
                  }px`,
                }}
                className="font-display font-black text-white leading-tight drop-shadow"
              >
                {activeSlide?.title || 'The Matrix Resurrections'}
              </h4>

              {(draft.heroShowRating || draft.heroShowYear || draft.heroShowDuration) && (
                <div
                  className={`flex flex-wrap items-center gap-3 text-xs text-white/85 ${
                    draft.heroTextAlign === 'center'
                      ? 'justify-center'
                      : draft.heroTextAlign === 'left'
                        ? 'justify-end'
                        : 'justify-start'
                  }`}
                >
                  {draft.heroShowRating && (
                    <span className="inline-flex items-center gap-1 font-latin font-bold text-[#f9c400]">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span dir="ltr">
                        {activeSlide?.communityRating && activeSlide.communityRating.count > 0
                          ? `${activeSlide.communityRating.average.toFixed(1)}/5`
                          : '5.0/5'}
                      </span>
                    </span>
                  )}
                  {draft.heroShowYear && (
                    <span className="font-latin font-bold">{activeSlide?.year || 2026}</span>
                  )}
                  {draft.heroShowDuration && (
                    <span>{activeSlide?.duration || '128 دقيقة'}</span>
                  )}
                </div>
              )}

              {draft.heroShowGenres && (activeSlide?.genres?.length || 0) > 0 && (
                <div
                  className={`flex flex-wrap items-center gap-1.5 ${
                    draft.heroTextAlign === 'center'
                      ? 'justify-center'
                      : draft.heroTextAlign === 'left'
                        ? 'justify-end'
                        : 'justify-start'
                  }`}
                >
                  {(activeSlide?.genres || ['أكشن', 'خيال علمي']).slice(0, 3).map((g) => (
                    <span
                      key={g}
                      className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/90"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* ZERO reserved space when heroShowDescription is false */}
              {draft.heroShowDescription !== false && (
                <p
                  style={{
                    fontSize: `${draft.heroDescriptionSizePx || 13}px`,
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: draft.heroDescriptionLines || 2,
                    overflow: 'hidden',
                  }}
                  className="text-white/85 leading-relaxed"
                >
                  {activeSlide?.story ||
                    'قصة سينمائية مشوقة بجودة عرض فائقة وترجمة احترافية وسيرفرات مشاهدة فورية.'}
                </p>
              )}

              {(draft.heroShowWatchBtn || draft.heroShowDetailsBtn || draft.heroShowWatchlistBtn) && (
                <div
                  className={`flex flex-wrap items-center gap-2 pt-1 ${
                    draft.heroTextAlign === 'center'
                      ? 'justify-center'
                      : draft.heroTextAlign === 'left'
                        ? 'justify-end'
                        : 'justify-start'
                  }`}
                >
                  {draft.heroShowWatchBtn && (
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#E50914] px-4 py-2 text-xs font-extrabold text-white">
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{draft.heroPrimaryCta || 'مشاهدة الآن'}</span>
                    </span>
                  )}
                  {draft.heroShowDetailsBtn && (
                    <span className="inline-flex items-center rounded-xl bg-white/15 border border-white/20 px-3.5 py-2 text-xs font-bold text-white">
                      التفاصيل
                    </span>
                  )}
                  {draft.heroShowWatchlistBtn && (
                    <span className="inline-flex items-center rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-xs font-bold text-white">
                      + قائمتي
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      {heroSliderVariant === 'showcase' && (
        <ShowcaseSliderSettingsPanel
          homeConfig={draft}
          catalog={catalog}
          onNotify={onNotify}
        />
      )}

      {heroSliderVariant === 'stream_v4' && (
        <StreamV4SliderSettingsPanel
          homeConfig={draft}
          catalog={catalog}
          onGetAuthToken={onGetAuthToken}
          onNotify={onNotify}
        />
      )}

      {heroSliderVariant !== 'original' && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-400/25 px-4 py-3 text-xs text-amber-200 leading-relaxed">
          ملاحظة:{' '}
          {heroSliderVariant === 'cinematic'
            ? 'التصميم السينمائي 3D يعرض الصورة واسم العمل فقط دون أي أزرار أو تفاصيل.'
            : heroSliderVariant === 'showcase'
              ? 'أدوات السلايدر الثالث (صور PNG + العناصر + الأحجام) موجودة أعلاه وتعمل باستقلال كامل.'
              : 'أدوات السلايدر الرابع (صور PNG + ألوان هوية الموقع + العناصر + الأحجام) موجودة أعلاه وتعمل باستقلال كامل.'}{' '}
          الإعدادات أدناه خاصة بتخصيص <strong className="text-white">السلايدر الأساسي</strong> وتظل محفوظة كما هي عند الرجوع إليه.
        </div>
      )}

      {/* Section 0: Hero Image Display Mode & Ambient Backdrop */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 rtv-admin-accent-text" />
            <h3 className="font-display text-base font-extrabold text-white">
              1. طريقة عرض صورة السلايدر والخلفية
            </h3>
          </div>
          <span className="text-[11px] font-bold text-[#b7c9ef]">
            الوضع الافتراضي يعرض السلايدر بعرض الشاشة الكامل (Full Bleed) دون هوامش جانبية
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {IMAGE_FIT_OPTIONS.map((opt) => {
            const active = (draft.heroImageFit || 'cover') === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateDraft({ heroImageFit: opt.id })}
                className={`rounded-2xl border p-4 text-right transition-all cursor-pointer flex flex-col gap-2 ${
                  active
                    ? 'rtv-admin-accent-soft'
                    : 'bg-[#1a242e]/65 border-white/[0.08] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {opt.id === 'contain' ? (
                      <Minimize2 className="w-4 h-4 rtv-admin-accent-text shrink-0" />
                    ) : opt.id === 'contain_blur' ? (
                      <Layers className="w-4 h-4 rtv-admin-accent-text shrink-0" />
                    ) : (
                      <Maximize2 className="w-4 h-4 rtv-admin-accent-text shrink-0" />
                    )}
                    <span className="text-xs font-extrabold text-white">{opt.label}</span>
                  </div>
                  {opt.badge && (
                    <span className="shrink-0 rounded-md bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-extrabold text-emerald-300">
                      {opt.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#b7c9ef] leading-relaxed">{opt.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Backdrop Blur & Dim Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">درجة Blur للخلفية المموهة</span>
              <span className="font-latin font-black rtv-admin-accent-text">
                {draft.heroBackdropBlurPx ?? 24}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={48}
              step={2}
              value={draft.heroBackdropBlurPx ?? 24}
              onChange={(e) => {
                const nextBlur = Number(e.target.value);
                updateDraft({
                  heroBackdropBlurPx: nextBlur,
                  heroImageFit:
                    draft.heroImageFit === 'contain_blur' ? 'contain_blur' : draft.heroImageFit,
                });
              }}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
            <p className="text-[11px] text-[#b7c9ef]/75">
              يُطبّق عند اختيار وضع «خلفية مموهة مكبرة + الصورة كاملة» لمنع أي تشتيت عن الصورة الأصلية.
            </p>
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">درجة تعتيم الخلفية المموهة</span>
              <span className="font-latin font-black rtv-admin-accent-text">
                {draft.heroBackdropDimPct ?? 45}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={85}
              step={1}
              value={draft.heroBackdropDimPct ?? 45}
              onChange={(e) => updateDraft({ heroBackdropDimPct: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
            <p className="text-[11px] text-[#b7c9ef]/75">
              يتحكم في تعتيم الخلفية المموهة فقط، مع إبقاء الصورة الأصلية في المقدمة واضحة بالكامل.
            </p>
          </div>
        </div>
      </div>

      {/* Section 2: Description Visibility & Typography */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-sky-400" />
            <h3 className="font-display text-base font-extrabold text-white">
              2. التحكم في وصف الفيلم والخطوط والمحاذاة
            </h3>
          </div>
        </div>

        {/* Prominent Description ON/OFF Toggle */}
        <div className="rounded-2xl bg-[#1a242e]/80 border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-white">
              إظهار وصف الفيلم داخل السلايدر (Show Movie Description)
            </p>
            <p className="text-xs text-[#b7c9ef] mt-0.5">
              عند إيقاف هذا الخيار يتم إخفاء الوصف تماماً وإعادة ترتيب العناصر تلقائياً دون حجز أي مساحة فارغة.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.heroShowDescription !== false}
            onClick={() => updateDraft({ heroShowDescription: !(draft.heroShowDescription !== false) })}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold cursor-pointer shrink-0 transition-all ${
              draft.heroShowDescription !== false
                ? 'bg-emerald-600 text-white shadow'
                : 'bg-[#0c1821] border border-white/15 text-[#b7c9ef]'
            }`}
          >
            <span>{draft.heroShowDescription !== false ? 'مفعّل — الوصف ظاهر' : 'معطّل — الوصف مخفي'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">حجم عنوان العمل</span>
              <span className="font-latin font-black rtv-admin-accent-text">{draft.heroTitleSizePx}px</span>
            </div>
            <input
              type="range"
              min={16}
              max={54}
              value={draft.heroTitleSizePx || 26}
              onChange={(e) => updateDraft({ heroTitleSizePx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">حجم نص الوصف</span>
              <span className="font-latin font-black rtv-admin-accent-text">
                {draft.heroDescriptionSizePx}px
              </span>
            </div>
            <input
              type="range"
              min={11}
              max={22}
              disabled={draft.heroShowDescription === false}
              value={draft.heroDescriptionSizePx || 13}
              onChange={(e) => updateDraft({ heroDescriptionSizePx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer disabled:opacity-40"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">أقصى عدد أسطر للوصف</span>
              <span className="font-latin font-black rtv-admin-accent-text">
                {draft.heroDescriptionLines} سطور
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              disabled={draft.heroShowDescription === false}
              value={draft.heroDescriptionLines || 2}
              onChange={(e) =>
                updateDraft({
                  heroDescriptionLines: Number(e.target.value) as 1 | 2 | 3 | 4 | 5,
                })
              }
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer disabled:opacity-40"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">أقصى عرض لمنطقة النص</span>
              <span className="font-latin font-black rtv-admin-accent-text">
                {draft.heroTextMaxWidthPx}px
              </span>
            </div>
            <input
              type="range"
              min={320}
              max={860}
              step={10}
              value={draft.heroTextMaxWidthPx || 540}
              onChange={(e) => updateDraft({ heroTextMaxWidthPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2.5">
            <p className="text-xs font-extrabold text-white">محاذاة النصوص</p>
            <div className="grid grid-cols-3 gap-2">
              {ALIGN_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updateDraft({ heroTextAlign: opt.id })}
                  className={`rounded-xl border py-2 text-xs font-bold cursor-pointer ${
                    draft.heroTextAlign === opt.id
                      ? 'rtv-admin-accent-bg border-transparent'
                      : 'bg-[#0c1821] border-white/10 text-[#b7c9ef] hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2.5">
            <p className="text-xs font-extrabold text-white">موقع منطقة المعلومات داخل السلايدر</p>
            <div className="grid grid-cols-3 gap-2">
              {POSITION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updateDraft({ heroInfoPosition: opt.id })}
                  className={`rounded-xl border py-2 text-[11px] font-bold cursor-pointer ${
                    draft.heroInfoPosition === opt.id
                      ? 'rtv-admin-accent-bg border-transparent'
                      : 'bg-[#0c1821] border-white/10 text-[#b7c9ef] hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Elements Visibility */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <h3 className="font-display text-base font-extrabold text-white">
            3. إظهار وإخفاء عناصر السلايدر بشكل مستقل
          </h3>
          <span className="text-[11px] font-bold text-[#b7c9ef]">
            كل خيار يعمل باستقلال كامل
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ELEMENT_TOGGLES.map((item) => {
            const active = draft[item.key] !== false;
            return (
              <button
                key={item.key}
                type="button"
                role="switch"
                aria-checked={active}
                onClick={() => updateDraft({ [item.key]: !active } as Partial<HomeLayoutConfig>)}
                className={`rounded-2xl border p-4 flex items-center justify-between gap-3 text-right transition-all cursor-pointer ${
                  active
                    ? 'rtv-admin-accent-soft'
                    : 'bg-[#1a242e]/50 border-white/[0.07] opacity-75'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-white">{item.label}</p>
                  <p className="text-[11px] text-[#b7c9ef] mt-0.5">{item.desc}</p>
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-extrabold ${
                    active ? 'bg-emerald-600 text-white' : 'bg-[#0c1821] text-[#b7c9ef]'
                  }`}
                >
                  {active ? 'ظاهر' : 'مخفي'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
