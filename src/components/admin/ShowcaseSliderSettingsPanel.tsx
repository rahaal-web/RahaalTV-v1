import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Layers,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import { HomeLayoutConfig, MediaItem } from '../../types/media';
import { saveShowcaseSliderConfigToFirestore } from '../../lib/firebase';
import {
  DEFAULT_SHOWCASE_SLIDER_CONFIG,
  normalizeShowcaseSliderConfig,
  ShowcaseSliderConfig,
  uploadShowcaseTransparentPng,
  useShowcaseSliderConfig,
} from '../../lib/showcaseSliderConfig';

interface ShowcaseSliderSettingsPanelProps {
  homeConfig: HomeLayoutConfig;
  catalog: MediaItem[];
  actorUid?: string;
  hasActor?: boolean;
  isOwner?: boolean;
  onGetAuthToken?: () => Promise<string | undefined>;
  onNotify: (msg: string) => void;
}

const VISIBILITY_CONTROLS: Array<{
  key: keyof Pick<
    ShowcaseSliderConfig,
    | 'showTitle'
    | 'showEnglishSubtitle'
    | 'showMetadata'
    | 'showStory'
    | 'showCast'
    | 'showWatchBtn'
    | 'showWatchlistBtn'
    | 'showTagline'
    | 'showBottomStrip'
  >;
  label: string;
  desc: string;
}> = [
  { key: 'showTitle', label: 'العنوان / صورة PNG للفيلم', desc: 'إظهار شعار PNG أو عنوان العمل الرئيسي' },
  { key: 'showEnglishSubtitle', label: 'العنوان الإنجليزي الفرعي', desc: 'يظهر أسفل العنوان العربي عند توفره' },
  { key: 'showMetadata', label: 'سطر التفاصيل (النوع • السنة)', desc: 'التصنيف واللغة/المدة والأنواع وسنة الإصدار' },
  { key: 'showStory', label: 'نبذة وقصة العمل', desc: 'السطر التعريفي المختصر لقصة الفيلم أو المسلسل' },
  { key: 'showCast', label: 'أسماء الممثلين (طاقم العمل)', desc: 'أبرز 3 ممثلين مفصولين بنقاط' },
  { key: 'showWatchBtn', label: 'زر المشاهدة بلون الموقع', desc: 'الزر الرئيسي بلون RahaL TV الأحمر (#E50914)' },
  { key: 'showWatchlistBtn', label: 'زر القائمة الدائري (+)', desc: 'زر الإضافة السريعة لقائمة المشاهدة' },
  { key: 'showTagline', label: 'العبارة الجانبية أسفل الزر', desc: 'السطر المميز بخط أحمر عمودي أسفل أزرار التحكم' },
  { key: 'showBottomStrip', label: 'الشريط السفلي لأسماء/شعارات الأعمال', desc: 'شريط التنقل السريع أسفل السلايدر' },
];

export function ShowcaseSliderSettingsPanel({
  homeConfig,
  catalog,
  actorUid = '',
  hasActor = false,
  isOwner = false,
  onGetAuthToken,
  onNotify,
}: ShowcaseSliderSettingsPanelProps) {
  const [cfg, updateCfg, resetCfg] = useShowcaseSliderConfig();
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const actorRef = useRef({ actorUid, hasActor, isOwner });
  actorRef.current = { actorUid, hasActor, isOwner };
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingSyncRef = useRef(false);

  const pushConfigToCloud = async (nextCfg: ShowcaseSliderConfig, silentError = false) => {
    const actor = actorRef.current;
    if (!actor.isOwner || !actor.hasActor || !actor.actorUid) return;
    try {
      const res = await saveShowcaseSliderConfigToFirestore(nextCfg, actor.actorUid);
      if (!res.ok && !silentError) {
        onNotify(
          `تم حفظ إعدادات السلايدر الثالث محلياً — تعذرت المزامنة السحابية (${res.projectId}/${res.databaseId})`
        );
      }
    } catch {
      if (!silentError) {
        onNotify('تم حفظ إعدادات السلايدر الثالث محلياً — تعذرت المزامنة مع Firestore');
      }
    }
  };

  const triggerImmediateSync = (nextCfg: ShowcaseSliderConfig) => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    hasPendingSyncRef.current = false;
    void pushConfigToCloud(nextCfg);
  };

  const scheduleDebouncedSync = (nextCfg: ShowcaseSliderConfig) => {
    cfgRef.current = nextCfg;
    hasPendingSyncRef.current = true;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      hasPendingSyncRef.current = false;
      void pushConfigToCloud(cfgRef.current);
    }, 450);
  };

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      if (hasPendingSyncRef.current) {
        hasPendingSyncRef.current = false;
        void pushConfigToCloud(cfgRef.current, true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyCfgPatch = (patch: Partial<ShowcaseSliderConfig>, immediate = false) => {
    const nextCfg = normalizeShowcaseSliderConfig({ ...cfgRef.current, ...patch });
    cfgRef.current = nextCfg;
    updateCfg(patch);
    if (immediate) {
      triggerImmediateSync(nextCfg);
    } else {
      scheduleDebouncedSync(nextCfg);
    }
  };

  const sliderMovies = useMemo(() => {
    const byId = new Map(catalog.map((i) => [i.id, i]));
    const maxSlides = Math.min(12, Math.max(1, Number(homeConfig.heroMaxSlides) || 8));
    const customSelected = (homeConfig.heroSlideIds || [])
      .map((id) => byId.get(id))
      .filter((x): x is MediaItem => Boolean(x));

    if (homeConfig.heroMode === 'manual' && customSelected.length > 0) {
      return customSelected.slice(0, maxSlides);
    }

    const ordered: MediaItem[] = [];
    const seen = new Set<string>();
    for (const item of customSelected) {
      if (ordered.length >= maxSlides) break;
      if (!seen.has(item.id)) {
        ordered.push(item);
        seen.add(item.id);
      }
    }
    for (const item of catalog.filter((i) => i.pinned)) {
      if (ordered.length >= maxSlides) break;
      if (!seen.has(item.id)) {
        ordered.push(item);
        seen.add(item.id);
      }
    }
    for (const item of catalog) {
      if (ordered.length >= maxSlides) break;
      if (!seen.has(item.id)) {
        ordered.push(item);
        seen.add(item.id);
      }
    }
    return ordered.slice(0, maxSlides);
  }, [catalog, homeConfig.heroMaxSlides, homeConfig.heroMode, homeConfig.heroSlideIds]);

  const displayedLogoItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sliderMovies;
    return catalog
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.englishTitle.toLowerCase().includes(q) ||
          String(item.year || '').includes(q)
      )
      .slice(0, 15);
  }, [catalog, searchQuery, sliderMovies]);

  const setMovieLogo = (mediaId: string, url: string, immediate = false) => {
    const nextLogos = { ...cfgRef.current.titleLogos };
    const clean = url.trim();
    if (clean) {
      nextLogos[mediaId] = clean;
    } else {
      delete nextLogos[mediaId];
    }
    applyCfgPatch({ titleLogos: nextLogos }, immediate);
  };

  const handleUploadPng = async (mediaId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadingId(mediaId);
    try {
      const idToken = onGetAuthToken ? await onGetAuthToken().catch(() => undefined) : undefined;
      const result = await uploadShowcaseTransparentPng(file, idToken);
      setMovieLogo(mediaId, result.url, true);
      onNotify(
        result.storage === 'server'
          ? 'تم رفع صورة الشعار (PNG) على الخادم ومزامنتها للسلايدر الثالث'
          : 'تم رفع صورة الشعار (PNG) وحفظها للسلايدر الثالث فوراً'
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر معالجة ملف الصورة، تأكد أنه بصيغة PNG صالحة.'
      );
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Reset */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E50914]/15 border border-[#E50914]/35 text-[#ff6b6b]">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display text-base sm:text-lg font-extrabold text-white">
              إعدادات السلايدر الاستعراضي الثالث (صور PNG + العناصر + الأحجام)
            </h3>
            <p className="text-xs text-[#b7c9ef] mt-1">
              تحكم كامل ومستقل في السلايدر الثالث: أضف شعارات PNG شفافة لكل فيلم، تحكم في إظهار/إخفاء أي عنصر، واضبط أحجام النصوص والصور فوراً بلون هوية الموقع (#E50914).
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            const resetSnapshot = normalizeShowcaseSliderConfig({
              ...DEFAULT_SHOWCASE_SLIDER_CONFIG,
              titleLogos: cfgRef.current.titleLogos,
            });
            cfgRef.current = resetSnapshot;
            resetCfg();
            triggerImmediateSync(resetSnapshot);
            onNotify('تمت استعادة الإعدادات الافتراضية لعناصر وأحجام السلايدر الثالث');
          }}
          className="rtv-admin-btn-height inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-[#b7c9ef] hover:text-white cursor-pointer shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>استعادة الافتراضي</span>
        </button>
      </div>

      {/* A. Per-Movie PNG Title Logos Manager */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-[#E50914]" />
            <h4 className="font-display text-base font-extrabold text-white">
              1. صور الشعارات الشفافة (PNG) بدلاً من اسم الفيلم
            </h4>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.usePngLogoInHero}
                onChange={(e) => applyCfgPatch({ usePngLogoInHero: e.target.checked }, true)}
                className="h-4 w-4 accent-[#E50914]"
              />
              <span>في العنوان الرئيسي</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.usePngLogoInStrip}
                onChange={(e) => applyCfgPatch({ usePngLogoInStrip: e.target.checked }, true)}
                className="h-4 w-4 accent-[#E50914]"
              />
              <span>في الشريط السفلي</span>
            </label>
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[#b7c9ef] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن أي فيلم أو مسلسل لإضافة صورة شعار PNG له (الافتراضي يعرض أعمال السلايدر الحالية)..."
            className="w-full rounded-xl bg-[#1a242e] border border-white/10 pr-10 pl-4 py-2.5 text-xs text-white placeholder:text-[#b7c9ef]/60 focus:border-[#E50914] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
          {displayedLogoItems.map((item) => {
            const logoUrl = cfg.titleLogos[item.id] || '';
            const isUploading = uploadingId === item.id;
            return (
              <div
                key={item.id}
                className="rounded-2xl bg-[#1a242e]/85 border border-white/[0.08] p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-white truncate">{item.title}</p>
                    <p className="font-latin text-[10px] text-[#b7c9ef] truncate">
                      {item.englishTitle || item.year}
                    </p>
                  </div>

                  {/* Dark Canvas Preview for White/Transparent PNG Logos */}
                  <div className="h-12 w-32 shrink-0 rounded-xl bg-[#070709] border border-white/15 flex items-center justify-center p-1.5 overflow-hidden">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-[10px] font-bold text-white/40">نص تلقائي</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="url"
                    dir="ltr"
                    value={logoUrl.startsWith('data:') ? '' : logoUrl}
                    onChange={(e) => setMovieLogo(item.id, e.target.value, false)}
                    placeholder={
                      logoUrl.startsWith('data:')
                        ? 'تم رفع صورة PNG محلياً — أو الصق رابطاً جديداً'
                        : 'https://.../title-logo.png'
                    }
                    className="flex-1 min-w-[160px] rounded-xl bg-[#0c1821] border border-white/10 px-3 py-1.5 font-latin text-[11px] text-white placeholder:text-[#b7c9ef]/50 focus:border-[#E50914] focus:outline-none"
                  />

                  <label className="inline-flex items-center gap-1.5 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-3 py-1.5 text-[11px] font-extrabold text-white cursor-pointer shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploading ? 'جاري الرفع...' : 'رفع PNG'}</span>
                    <input
                      type="file"
                      accept="image/png,image/webp,image/svg+xml"
                      onChange={(e) => void handleUploadPng(item.id, e)}
                      className="hidden"
                    />
                  </label>

                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setMovieLogo(item.id, '', true);
                        onNotify(`تمت إزالة شعار PNG لـ "${item.title}"`);
                      }}
                      title="إزالة صورة PNG والعودة للنص"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#0c1821] hover:bg-red-600/25 border border-white/10 text-red-400 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* B. Element Visibility & Button Text */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#E50914]" />
            <h4 className="font-display text-base font-extrabold text-white">
              2. التحكم في ما يظهر وما يختفي داخل السلايدر الثالث
            </h4>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {VISIBILITY_CONTROLS.map((ctrl) => {
            const active = cfg[ctrl.key];
            return (
              <button
                key={ctrl.key}
                type="button"
                role="switch"
                aria-checked={active}
                onClick={() =>
                  applyCfgPatch({ [ctrl.key]: !active } as Partial<ShowcaseSliderConfig>, true)
                }
                className={`rounded-2xl border p-3.5 flex items-center justify-between gap-3 text-right transition-all cursor-pointer ${
                  active
                    ? 'rtv-admin-accent-soft'
                    : 'bg-[#1a242e]/50 border-white/[0.07] opacity-75'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-white">{ctrl.label}</p>
                  <p className="text-[11px] text-[#b7c9ef] mt-0.5">{ctrl.desc}</p>
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

        <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.08] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-xs font-extrabold text-white">
            نص زر المشاهدة الرئيسي:
          </span>
          <input
            type="text"
            value={cfg.watchBtnText}
            onChange={(e) => applyCfgPatch({ watchBtnText: e.target.value }, false)}
            placeholder="شاهد وحمل الان"
            className="sm:w-72 rounded-xl bg-[#0c1821] border border-white/10 px-3.5 py-2 text-xs font-bold text-white focus:border-[#E50914] focus:outline-none"
          />
        </div>
      </div>

      {/* C. Typography & PNG Sizes */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <Type className="w-5 h-5 text-[#E50914]" />
          <h4 className="font-display text-base font-extrabold text-white">
            3. أحجام النصوص وصور الشعارات PNG في السلايدر الثالث
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">أقصى ارتفاع لشعار PNG</span>
              <span className="font-latin font-black text-[#ff6b6b] tabular-nums">
                {cfg.logoMaxHeightPx}px
              </span>
            </div>
            <input
              type="range"
              min={48}
              max={200}
              step={2}
              value={cfg.logoMaxHeightPx}
              onChange={(e) => applyCfgPatch({ logoMaxHeightPx: Number(e.target.value) })}
              className="w-full accent-[#E50914] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">أقصى عرض لشعار PNG</span>
              <span className="font-latin font-black text-[#ff6b6b] tabular-nums">
                {cfg.logoMaxWidthPx}px
              </span>
            </div>
            <input
              type="range"
              min={160}
              max={500}
              step={10}
              value={cfg.logoMaxWidthPx}
              onChange={(e) => applyCfgPatch({ logoMaxWidthPx: Number(e.target.value) })}
              className="w-full accent-[#E50914] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">حجم العنوان النصي</span>
              <span className="font-latin font-black text-[#ff6b6b] tabular-nums">
                {cfg.titleSizePx}px
              </span>
            </div>
            <input
              type="range"
              min={22}
              max={72}
              step={1}
              value={cfg.titleSizePx}
              onChange={(e) => applyCfgPatch({ titleSizePx: Number(e.target.value) })}
              className="w-full accent-[#E50914] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">حجم التفاصيل والممثلين</span>
              <span className="font-latin font-black text-[#ff6b6b] tabular-nums">
                {cfg.metaSizePx}px
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={18}
              step={1}
              value={cfg.metaSizePx}
              onChange={(e) => applyCfgPatch({ metaSizePx: Number(e.target.value) })}
              className="w-full accent-[#E50914] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">حجم نص القصة</span>
              <span className="font-latin font-black text-[#ff6b6b] tabular-nums">
                {cfg.storySizePx}px
              </span>
            </div>
            <input
              type="range"
              min={11}
              max={20}
              step={1}
              value={cfg.storySizePx}
              onChange={(e) => applyCfgPatch({ storySizePx: Number(e.target.value) })}
              className="w-full accent-[#E50914] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">عدد أسطر القصة</span>
              <span className="font-latin font-black text-[#ff6b6b] tabular-nums">
                {cfg.storyLines} سطور
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={4}
              step={1}
              value={cfg.storyLines}
              onChange={(e) =>
                applyCfgPatch({ storyLines: Number(e.target.value) as 1 | 2 | 3 | 4 })
              }
              className="w-full accent-[#E50914] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">ارتفاع PNG بالشريط السفلي</span>
              <span className="font-latin font-black text-[#ff6b6b] tabular-nums">
                {cfg.stripLogoHeightPx}px
              </span>
            </div>
            <input
              type="range"
              min={20}
              max={64}
              step={2}
              value={cfg.stripLogoHeightPx}
              onChange={(e) => applyCfgPatch({ stripLogoHeightPx: Number(e.target.value) })}
              className="w-full accent-[#E50914] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">حجم نص الشريط السفلي</span>
              <span className="font-latin font-black text-[#ff6b6b] tabular-nums">
                {cfg.stripTextSizePx}px
              </span>
            </div>
            <input
              type="range"
              min={11}
              max={24}
              step={1}
              value={cfg.stripTextSizePx}
              onChange={(e) => applyCfgPatch({ stripTextSizePx: Number(e.target.value) })}
              className="w-full accent-[#E50914] cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
