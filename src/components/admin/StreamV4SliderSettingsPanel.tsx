import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cloud,
  Image as ImageIcon,
  Loader2,
  Move,
  Palette,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import { HomeLayoutConfig, MediaItem } from '../../types/media';
import { saveStreamV4SliderConfigToFirestore } from '../../lib/firebase';
import {
  countDroppedStreamV4Logos,
  DEFAULT_STREAM_V4_SLIDER_CONFIG,
  normalizeStreamV4SliderConfig,
  StreamV4SliderConfig,
  uploadTransparentSliderPng,
  useStreamV4SliderConfig,
} from '../../lib/streamV4SliderConfig';

interface StreamV4SliderSettingsPanelProps {
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
    StreamV4SliderConfig,
    | 'showTitle'
    | 'showMetadata'
    | 'showStory'
    | 'showCast'
    | 'showWatchBtn'
    | 'showWatchlistBtn'
    | 'showTagline'
    | 'showBottomStrip'
    | 'showProgressBar'
    | 'showNavArrows'
    | 'enableShineEffect'
  >;
  label: string;
  desc: string;
}> = [
  { key: 'showTitle', label: 'شعار PNG / عنوان العمل', desc: 'يستبدل اسم العمل بصورة PNG في السلايدر فقط' },
  { key: 'showMetadata', label: 'سطر التصنيف والسنة والمدة', desc: 'التصنيف • اللغة/المدة • الأنواع • السنة' },
  { key: 'showStory', label: 'وصف وقصة العمل', desc: 'عرض نبذة مختصرة عن الفيلم أو المسلسل' },
  { key: 'showCast', label: 'أسماء طاقم التمثيل', desc: 'أبرز 3 ممثلين مفصولين بنقاط' },
  { key: 'showWatchBtn', label: 'زر المشاهدة الرئيسي', desc: 'الزر العريض بهوية وألوان موقع Rahaal TV' },
  { key: 'enableShineEffect', label: 'لمعة زر المشاهدة (Shine)', desc: 'إضاءة متحركة تمر على الزر عند التمرير عليه' },
  { key: 'showWatchlistBtn', label: 'زر قائمة المشاهدة الدائري (+)', desc: 'أيقونة الإضافة السريعة لقائمتي' },
  { key: 'showTagline', label: 'الملاحظة الجانبية أسفل الزر', desc: 'السطر المميز بخط ملون بهوية الموقع أسفل الأزرار' },
  { key: 'showBottomStrip', label: 'الشريط السفلي لشعارات PNG', desc: 'شريط أسماء وشعارات الأعمال أسفل السلايدر' },
  { key: 'showProgressBar', label: 'بار التقدم أسفل الصورة', desc: 'شريط أسفل السلايدر يعرض مدة وتقدم عرض كل فيلم' },
  { key: 'showNavArrows', label: 'أسهم التنقل الجانبية', desc: 'أزرار التالي والسابق على جانبي السلايدر' },
];

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export function StreamV4SliderSettingsPanel({
  homeConfig,
  catalog,
  actorUid = '',
  hasActor = false,
  isOwner = false,
  onGetAuthToken,
  onNotify,
}: StreamV4SliderSettingsPanelProps) {
  const [cfg, updateCfg, resetCfg] = useStreamV4SliderConfig();
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncErrorMsg, setSyncErrorMsg] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState('');

  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const actorRef = useRef({ actorUid, hasActor, isOwner });
  actorRef.current = { actorUid, hasActor, isOwner };
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingSyncRef = useRef(false);
  const isMountedRef = useRef(true);

  const pushConfigToCloud = async (
    nextCfg: StreamV4SliderConfig,
    silentError = false
  ): Promise<boolean> => {
    const actor = actorRef.current;
    if (!actor.hasActor || !actor.actorUid) {
      const msg =
        'تم الحفظ محلياً فقط — يجب تسجيل الدخول بحساب المالك لمزامنة السلايدر الرابع مع الموبايل';
      if (isMountedRef.current) {
        setSyncStatus('error');
        setSyncErrorMsg(msg);
      }
      if (!silentError) onNotify(msg);
      return false;
    }
    if (!actor.isOwner) {
      const msg =
        'تم الحفظ محلياً فقط — يلزم صلاحية المالك (Owner) لحفظ إعدادات السلايدر الرابع على السحابة للموبايل';
      if (isMountedRef.current) {
        setSyncStatus('error');
        setSyncErrorMsg(msg);
      }
      if (!silentError) onNotify(msg);
      return false;
    }

    const droppedLogos = countDroppedStreamV4Logos(nextCfg);
    if (isMountedRef.current) {
      setSyncStatus('syncing');
      setSyncErrorMsg('');
    }

    try {
      const res = await saveStreamV4SliderConfigToFirestore(nextCfg, actor.actorUid);
      if (!res.ok) {
        const msg = `تعذرت المزامنة مع السحابة (${res.projectId}/${res.databaseId}): قواعد Firestore رفضت الكتابة إلى settings/stream_v4_slider. انسخ firestore.rules من إدارة قاعدة البيانات واضغط Publish في Firebase Console.`;
        if (isMountedRef.current) {
          setSyncStatus('error');
          setSyncErrorMsg(msg);
        }
        if (!silentError) {
          onNotify(msg);
        }
        return false;
      }

      if (isMountedRef.current) {
        setSyncStatus('synced');
        setLastSyncedAt(
          new Date().toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
        if (droppedLogos > 0) {
          const warnMsg = `تمت مزامنة الإعدادات، لكن ${droppedLogos} شعاراً تجاوز الحد الأقصى للحجم وتم استبعاده من السحابة`;
          setSyncErrorMsg(warnMsg);
          if (!silentError) onNotify(warnMsg);
        } else {
          setSyncErrorMsg('');
        }
      }
      return true;
    } catch {
      const msg = 'تم حفظ إعدادات السلايدر الرابع محلياً — تعذرت المزامنة مع Firestore';
      if (isMountedRef.current) {
        setSyncStatus('error');
        setSyncErrorMsg(msg);
      }
      if (!silentError) {
        onNotify(msg);
      }
      return false;
    }
  };

  const triggerImmediateSync = (nextCfg: StreamV4SliderConfig, notifyOnSuccess = false) => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    hasPendingSyncRef.current = false;
    void pushConfigToCloud(nextCfg, false).then((ok) => {
      if (ok && notifyOnSuccess) {
        onNotify('تم حفظ إعدادات السلايدر الرابع ومزامنتها مع الموبايل وجميع الأجهزة بنجاح');
      }
    });
  };

  const scheduleDebouncedSync = (nextCfg: StreamV4SliderConfig) => {
    cfgRef.current = nextCfg;
    hasPendingSyncRef.current = true;
    if (isMountedRef.current) {
      setSyncStatus('syncing');
    }
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
    isMountedRef.current = true;
    const flushPendingSync = (silentError: boolean) => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      if (hasPendingSyncRef.current) {
        hasPendingSyncRef.current = false;
        void pushConfigToCloud(cfgRef.current, silentError);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSync(true);
      }
    };
    const handlePageHide = () => {
      flushPendingSync(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      isMountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      flushPendingSync(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyCfgPatch = (patch: Partial<StreamV4SliderConfig>, immediate = false) => {
    const nextCfg = normalizeStreamV4SliderConfig({ ...cfgRef.current, ...patch });
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
      .slice(0, 16);
  }, [catalog, searchQuery, sliderMovies]);

  const defaultIntervalSec = Math.max(
    2,
    Number(cfg.defaultSlideDurationSec) || Number(homeConfig.heroSlideIntervalSec) || 6
  );

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

  const setMovieDuration = (
    mediaId: string,
    durationSec?: number | null,
    immediate = false
  ) => {
    const nextDurations = { ...cfgRef.current.slideDurations };
    const num = Number(durationSec);
    if (durationSec != null && Number.isFinite(num) && num >= 2) {
      nextDurations[mediaId] = Math.min(60, Math.max(2, Math.round(num)));
    } else {
      delete nextDurations[mediaId];
    }
    applyCfgPatch({ slideDurations: nextDurations }, immediate);
  };

  const handleUploadPng = async (mediaId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadingId(mediaId);
    try {
      const idToken = onGetAuthToken ? await onGetAuthToken().catch(() => undefined) : undefined;
      const result = await uploadTransparentSliderPng(file, idToken);
      setMovieLogo(mediaId, result.url, true);
      onNotify(
        result.storage === 'server'
          ? 'تم رفع صورة الشعار (PNG) على الخادم للسلايدر الرابع ومزامنتها'
          : 'تم تجهيز صورة الشعار (PNG) ومزامنتها سحابياً لجميع الأجهزة'
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر معالجة صورة PNG المختارة.'
      );
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Reset */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl rtv-admin-accent-soft border rtv-admin-accent-text">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base sm:text-lg font-extrabold text-white">
                  إعدادات السلايدر الرابع (Cinema Logo Hero) — تحكم كامل ومستقل
                </h3>
                {syncStatus === 'syncing' && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 border border-sky-400/35 px-2.5 py-0.5 text-[10px] font-extrabold text-sky-300">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    جاري المزامنة السحابية...
                  </span>
                )}
                {syncStatus === 'synced' && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-400/35 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
                    <CheckCircle2 className="w-3 h-3" />
                    متزامن لجميع الأجهزة {lastSyncedAt ? `(${lastSyncedAt})` : ''}
                  </span>
                )}
                {syncStatus === 'error' && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 border border-rose-400/35 px-2.5 py-0.5 text-[10px] font-extrabold text-rose-300">
                    <AlertTriangle className="w-3 h-3" />
                    محفوظ محلياً فقط
                  </span>
                )}
              </div>
              <p className="text-xs text-[#b7c9ef] mt-1">
                مبني على تصميم السلايدر المرفق بألوان وهوية موقع Rahaal TV، مع مزامنة فورية لـ PNG والأحجام والألوان بين الكمبيوتر والموبايل.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={syncStatus === 'syncing'}
              onClick={() => triggerImmediateSync(cfgRef.current, true)}
              className="rtv-admin-btn-height inline-flex items-center gap-1.5 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-50 px-4 py-2 text-xs font-extrabold text-white shadow cursor-pointer"
            >
              {syncStatus === 'syncing' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Cloud className="w-3.5 h-3.5" />
              )}
              <span>حفظ ومزامنة لجميع الأجهزة</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const nextCfg = normalizeStreamV4SliderConfig({
                  ...DEFAULT_STREAM_V4_SLIDER_CONFIG,
                  titleLogos: cfgRef.current.titleLogos,
                  slideDurations: cfgRef.current.slideDurations,
                });
                cfgRef.current = nextCfg;
                resetCfg();
                triggerImmediateSync(nextCfg, true);
              }}
              className="rtv-admin-btn-height inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-[#b7c9ef] hover:text-white cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>استعادة الافتراضي</span>
            </button>
          </div>
        </div>

        {syncErrorMsg && (
          <div className="rounded-2xl bg-rose-500/10 border border-rose-400/35 px-4 py-3 text-xs text-rose-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{syncErrorMsg}</span>
          </div>
        )}
      </div>

      {/* A. Per-Movie PNG Logo Manager (Slider-Only Replacement) */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 rtv-admin-accent-text" />
            <div>
              <h4 className="font-display text-base font-extrabold text-white">
                1. شعارات PNG ووقت ظهور كل فيلم في السلايدر الرابع
              </h4>
              <p className="text-[11px] text-[#b7c9ef] mt-0.5">
                ارفع صورة PNG تظهر حصرياً داخل السلايدر، وحدد مدة ظهور كل فيلم بالثواني بشكل مستقل عن باقي الأفلام.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.usePngLogoInHero}
                onChange={(e) => applyCfgPatch({ usePngLogoInHero: e.target.checked }, true)}
                className="h-4 w-4 accent-[var(--rtv-admin-accent)]"
              />
              <span>في الواجهة الرئيسية</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.usePngLogoInStrip}
                onChange={(e) => applyCfgPatch({ usePngLogoInStrip: e.target.checked }, true)}
                className="h-4 w-4 accent-[var(--rtv-admin-accent)]"
              />
              <span>في الشريط السفلي</span>
            </label>
          </div>
        </div>

        {/* Global Auto-Flip Interval for ALL Movies in the 4th Slider */}
        <div className="rounded-2xl bg-[#1a242e]/90 border border-white/10 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 rtv-admin-accent-text" />
              <span className="text-xs sm:text-sm font-extrabold text-white">
                وقت ظهور الأفلام كلها (كل كام ثانية يقلب السلايدر)
              </span>
              <span className="font-latin text-xs font-black rtv-admin-accent-text tabular-nums">
                {defaultIntervalSec}s
              </span>
            </div>
            <p className="text-[11px] text-[#b7c9ef]">
              يطبق على جميع الأفلام في السلايدر الرابع، ويمكنك تخصيص مدة مستقلة لأي فيلم بالأسفل أو توحيد الوقت للكل بضغطة واحدة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <input
              type="range"
              min={2}
              max={60}
              step={1}
              value={defaultIntervalSec}
              onChange={(e) =>
                applyCfgPatch({ defaultSlideDurationSec: Number(e.target.value) })
              }
              className="w-36 sm:w-44 accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  applyCfgPatch({ defaultSlideDurationSec: Math.max(2, defaultIntervalSec - 1) }, true)
                }
                aria-label="تقليل الوقت العام"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0c1821] hover:bg-white/10 border border-white/10 text-xs font-extrabold text-white cursor-pointer"
              >
                -
              </button>
              <input
                type="number"
                min={2}
                max={60}
                value={defaultIntervalSec}
                onChange={(e) =>
                  applyCfgPatch({
                    defaultSlideDurationSec: Math.min(60, Math.max(2, Number(e.target.value) || 2)),
                  })
                }
                className="w-14 rounded-lg bg-[#0c1821] border border-white/10 px-2 py-1 text-center font-latin text-xs font-bold text-white tabular-nums focus:border-[var(--rtv-admin-accent)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  applyCfgPatch({ defaultSlideDurationSec: Math.min(60, defaultIntervalSec + 1) }, true)
                }
                aria-label="زيادة الوقت العام"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0c1821] hover:bg-white/10 border border-white/10 text-xs font-extrabold text-white cursor-pointer"
              >
                +
              </button>
            </div>

            {Object.keys(cfg.slideDurations).length > 0 && (
              <button
                type="button"
                onClick={() => {
                  applyCfgPatch({ slideDurations: {} }, true);
                  onNotify(`تم توحيد وقت التقليب إلى ${defaultIntervalSec} ثوانٍ لجميع الأفلام`);
                }}
                className="rounded-xl bg-[#E50914] hover:bg-[#f40612] px-3 py-1.5 text-[11px] font-extrabold text-white cursor-pointer"
              >
                تطبيق على كل الأفلام ({defaultIntervalSec}ث)
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[#b7c9ef] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن أي فيلم أو مسلسل لإضافة صورة PNG له..."
            className="w-full rounded-xl bg-[#1a242e] border border-white/10 pr-10 pl-4 py-2.5 text-xs text-white placeholder:text-[#b7c9ef]/60 focus:border-[var(--rtv-admin-accent)] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
          {displayedLogoItems.map((item) => {
            const logoUrl = cfg.titleLogos[item.id] || '';
            const customDuration = cfg.slideDurations[item.id];
            const effectiveDuration = customDuration || defaultIntervalSec;
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

                  <div className="h-12 w-32 shrink-0 rounded-xl bg-[#070709] border border-white/15 flex items-center justify-center p-1.5 overflow-hidden">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-[10px] font-bold text-white/40">بدون PNG</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="url"
                    dir="ltr"
                    value={logoUrl.startsWith('data:') ? '' : logoUrl}
                    onChange={(e) => setMovieLogo(item.id, e.target.value)}
                    placeholder={
                      logoUrl.startsWith('data:')
                        ? 'تم رفع صورة PNG محلياً — أو الصق رابطاً جديداً'
                        : 'https://.../movie-logo.png'
                    }
                    className="flex-1 min-w-[160px] rounded-xl bg-[#0c1821] border border-white/10 px-3 py-1.5 font-latin text-[11px] text-white placeholder:text-[#b7c9ef]/50 focus:border-[var(--rtv-admin-accent)] focus:outline-none"
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
                      title="إزالة شعار PNG"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#0c1821] hover:bg-red-600/25 border border-white/10 text-red-400 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Per-Movie Display Duration Control */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#b7c9ef]">
                    <Clock className="w-3.5 h-3.5 rtv-admin-accent-text" />
                    <span>وقت ظهور الفيلم:</span>
                    <span className="text-white font-extrabold tabular-nums">
                      {customDuration ? `${customDuration} ثانية` : `افتراضي (${defaultIntervalSec} ث)`}
                    </span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setMovieDuration(item.id, Math.max(2, effectiveDuration - 1), true)
                      }
                      aria-label="تقليل مدة الظهور"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#0c1821] hover:bg-white/10 border border-white/10 text-xs font-extrabold text-white cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={2}
                      max={60}
                      value={customDuration ?? ''}
                      placeholder={String(defaultIntervalSec)}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        if (!raw) {
                          setMovieDuration(item.id, null);
                        } else {
                          setMovieDuration(item.id, Number(raw));
                        }
                      }}
                      className="w-14 rounded-lg bg-[#0c1821] border border-white/10 px-2 py-1 text-center font-latin text-xs font-bold text-white tabular-nums focus:border-[var(--rtv-admin-accent)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setMovieDuration(item.id, Math.min(60, effectiveDuration + 1), true)
                      }
                      aria-label="زيادة مدة الظهور"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#0c1821] hover:bg-white/10 border border-white/10 text-xs font-extrabold text-white cursor-pointer"
                    >
                      +
                    </button>
                    {customDuration && (
                      <button
                        type="button"
                        onClick={() => setMovieDuration(item.id, null, true)}
                        className="rounded-lg bg-[#0c1821] hover:bg-white/10 border border-white/10 px-2 py-1 text-[10px] font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
                      >
                        افتراضي
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* B. Theme Colors & Identity Integration */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <Palette className="w-5 h-5 rtv-admin-accent-text" />
          <h4 className="font-display text-base font-extrabold text-white">
            2. ألوان وهوية الموقع في السلايدر الرابع
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => applyCfgPatch({ colorMode: 'site_theme' }, true)}
            className={`rounded-2xl border p-4 text-right transition-all cursor-pointer ${
              cfg.colorMode === 'site_theme'
                ? 'rtv-admin-accent-soft border-sky-400/50'
                : 'bg-[#1a242e]/65 border-white/[0.08]'
            }`}
          >
            <p className="text-xs font-extrabold text-white">
              أ. متابعة ألوان وهوية الموقع تلقائياً (افتراضي)
            </p>
            <p className="text-[11px] text-[#b7c9ef] mt-1">
              يأخذ اللون الرئيسي ولون الخلفية وتدرجات القوالب مباشرة من ثيم موقع Rahaal TV النشط.
            </p>
          </button>

          <div
            className={`rounded-2xl border p-4 space-y-2 transition-all ${
              cfg.colorMode === 'custom'
                ? 'rtv-admin-accent-soft border-sky-400/50'
                : 'bg-[#1a242e]/65 border-white/[0.08]'
            }`}
          >
            <button
              type="button"
              onClick={() => applyCfgPatch({ colorMode: 'custom' }, true)}
              className="w-full text-right cursor-pointer"
            >
              <p className="text-xs font-extrabold text-white">ب. لون أزرار ومؤشر مخصص</p>
            </button>
            <div className="flex items-center gap-2.5 pt-1">
              <input
                type="color"
                value={cfg.customAccentColor}
                onChange={(e) =>
                  applyCfgPatch({ colorMode: 'custom', customAccentColor: e.target.value })
                }
                className="h-8 w-12 rounded-lg bg-transparent border border-white/20 cursor-pointer"
              />
              <span className="font-latin text-xs font-bold text-white uppercase">
                {cfg.customAccentColor}
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">شدة التدرج الداكن فوق الخلفية</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.scrimIntensityPct}%
              </span>
            </div>
            <input
              type="range"
              min={35}
              max={100}
              step={5}
              value={cfg.scrimIntensityPct}
              onChange={(e) => applyCfgPatch({ scrimIntensityPct: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* C. Element Visibility & Button Text */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <Sparkles className="w-5 h-5 rtv-admin-accent-text" />
          <h4 className="font-display text-base font-extrabold text-white">
            3. التحكم في ظهور وإخفاء عناصر السلايدر الرابع
          </h4>
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
                  applyCfgPatch({ [ctrl.key]: !active } as Partial<StreamV4SliderConfig>, true)
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
          <span className="text-xs font-extrabold text-white">نص زر المشاهدة الرئيسي:</span>
          <input
            type="text"
            value={cfg.watchBtnText}
            onChange={(e) => applyCfgPatch({ watchBtnText: e.target.value })}
            placeholder="شاهد وحمل الان"
            className="sm:w-72 rounded-xl bg-[#0c1821] border border-white/10 px-3.5 py-2 text-xs font-bold text-white focus:border-[var(--rtv-admin-accent)] focus:outline-none"
          />
        </div>
      </div>

      {/* D. Sizes, Dimensions & Typography Sliders */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <Type className="w-5 h-5 rtv-admin-accent-text" />
          <h4 className="font-display text-base font-extrabold text-white">
            4. أبعاد السلايدر وأحجام شعارات PNG والنصوص
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">ارتفاع السلايدر (كمبيوتر)</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.sliderHeightDesktopPx}px
              </span>
            </div>
            <input
              type="range"
              min={480}
              max={860}
              step={10}
              value={cfg.sliderHeightDesktopPx}
              onChange={(e) => applyCfgPatch({ sliderHeightDesktopPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">أقصى ارتفاع لشعار PNG</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.logoMaxHeightPx}px
              </span>
            </div>
            <input
              type="range"
              min={48}
              max={240}
              step={2}
              value={cfg.logoMaxHeightPx}
              onChange={(e) => applyCfgPatch({ logoMaxHeightPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">أقصى عرض لشعار PNG</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.logoMaxWidthPx}px
              </span>
            </div>
            <input
              type="range"
              min={160}
              max={540}
              step={10}
              value={cfg.logoMaxWidthPx}
              onChange={(e) => applyCfgPatch({ logoMaxWidthPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">حجم العنوان النصي البديل</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
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
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">حجم سطر التفاصيل</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
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
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">حجم نص القصة</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
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
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">عدد أسطر القصة</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
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
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">حجم أسماء الممثلين</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.castSizePx}px
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={18}
              step={1}
              value={cfg.castSizePx}
              onChange={(e) => applyCfgPatch({ castSizePx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">ارتفاع PNG بالشريط السفلي</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.stripLogoHeightPx}px
              </span>
            </div>
            <input
              type="range"
              min={22}
              max={72}
              step={2}
              value={cfg.stripLogoHeightPx}
              onChange={(e) => applyCfgPatch({ stripLogoHeightPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">حجم نص الشريط السفلي</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
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
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">عدد الشعارات بالشريط السفلي</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.maxStripItems} أعمال
              </span>
            </div>
            <input
              type="range"
              min={3}
              max={10}
              step={1}
              value={cfg.maxStripItems}
              onChange={(e) => applyCfgPatch({ maxStripItems: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">سمك بار التقدم أسفل الصورة</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.progressBarHeightPx}px
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={8}
              step={1}
              value={cfg.progressBarHeightPx}
              onChange={(e) => applyCfgPatch({ progressBarHeightPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">ارتفاع التمويه والتدرج السفلي</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.bottomBlendHeightPx}px
              </span>
            </div>
            <input
              type="range"
              min={60}
              max={280}
              step={5}
              value={cfg.bottomBlendHeightPx}
              onChange={(e) => applyCfgPatch({ bottomBlendHeightPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">درجة تمويه الحافة السفلية (Blur)</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.bottomBlurPx}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={22}
              step={1}
              value={cfg.bottomBlurPx}
              onChange={(e) => applyCfgPatch({ bottomBlurPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">ترابط وتداخل السلايدر مع الموقع</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.bottomOverlapPx}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={96}
              step={2}
              value={cfg.bottomOverlapPx}
              onChange={(e) => applyCfgPatch({ bottomOverlapPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

        </div>
      </div>

      {/* E. Exact 2D & Vertical Positioning Controls for Movie Info & Strip */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <Move className="w-5 h-5 rtv-admin-accent-text" />
          <div>
            <h4 className="font-display text-base font-extrabold text-white">
              5. التحكم الدقيق في مكان بيانات الفيلم والشريط السفلي
            </h4>
            <p className="text-[11px] text-[#b7c9ef] mt-0.5">
              حرّك شعار الفيلم والتفاصيل والوصف والأزرار لأعلى أو لأسفل أو يميناً ويساراً بالبكسل لتناسب كل خلفية.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2.5">
            <span className="block text-xs font-extrabold text-white">التموضع العمودي لبيانات الفيلم:</span>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'top', label: 'أعلى' },
                { id: 'center', label: 'وسط' },
                { id: 'bottom', label: 'أسفل (فوق الشريط)' },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => applyCfgPatch({ articleVerticalAlign: opt.id }, true)}
                  className={`rounded-xl border px-2.5 py-2 text-[11px] font-extrabold transition-all cursor-pointer ${
                    cfg.articleVerticalAlign === opt.id
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
            <span className="block text-xs font-extrabold text-white">المحاذاة الأفقية لبيانات الفيلم:</span>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'right', label: 'يمين (RTL)' },
                { id: 'center', label: 'منتصف' },
                { id: 'left', label: 'يسار' },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => applyCfgPatch({ articleHorizontalAlign: opt.id }, true)}
                  className={`rounded-xl border px-2.5 py-2 text-[11px] font-extrabold transition-all cursor-pointer ${
                    cfg.articleHorizontalAlign === opt.id
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">رفع البيانات عن الأسفل</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.articleBottomOffsetPx}px
              </span>
            </div>
            <input
              type="range"
              min={64}
              max={320}
              step={4}
              value={cfg.articleBottomOffsetPx}
              onChange={(e) => applyCfgPatch({ articleBottomOffsetPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">المسافة من الأعلى</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.articleTopOffsetPx}px
              </span>
            </div>
            <input
              type="range"
              min={64}
              max={260}
              step={4}
              value={cfg.articleTopOffsetPx}
              onChange={(e) => applyCfgPatch({ articleTopOffsetPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">المسافة الجانبية من الحافة</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.articleSideOffsetPx}px
              </span>
            </div>
            <input
              type="range"
              min={12}
              max={220}
              step={4}
              value={cfg.articleSideOffsetPx}
              onChange={(e) => applyCfgPatch({ articleSideOffsetPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">عرض كتلة البيانات</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.articleMaxWidthPx}px
              </span>
            </div>
            <input
              type="range"
              min={320}
              max={720}
              step={10}
              value={cfg.articleMaxWidthPx}
              onChange={(e) => applyCfgPatch({ articleMaxWidthPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">ارتفاع شريط الشعارات السفلي</span>
              <span className="font-latin font-black rtv-admin-accent-text tabular-nums">
                {cfg.dotsBottomOffsetPx}px
              </span>
            </div>
            <input
              type="range"
              min={16}
              max={100}
              step={2}
              value={cfg.dotsBottomOffsetPx}
              onChange={(e) => applyCfgPatch({ dotsBottomOffsetPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
