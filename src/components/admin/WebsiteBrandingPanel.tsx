import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  FileUp,
  Globe,
  Image as ImageIcon,
  RotateCcw,
  Trash2,
  Type,
} from 'lucide-react';
import {
  FaviconMode,
  HeaderLogoAlign,
  LogoDisplayMode,
  LogoPlacement,
  WebsiteBrandingConfig,
} from '../../types/media';
import {
  applyWebsiteFaviconToDocument,
  DEFAULT_WEBSITE_BRANDING,
  ensureWebsiteBrandingFontLoaded,
  normalizeWebsiteBranding,
  optimizeAndUploadBrandingAsset,
  resolveBrandingAssetUrl,
  resolveWebsiteBrandingFontStack,
  WEBSITE_BRANDING_FONT_PRESETS,
} from '../../lib/websiteBranding';
import { getActiveAuthInstance } from '../../lib/dbConnectionManager';

interface WebsiteBrandingPanelProps {
  branding: WebsiteBrandingConfig;
  siteNameFallback: string;
  busy?: boolean;
  onSaveBranding: (next: WebsiteBrandingConfig) => Promise<void>;
  onNotify: (msg: string) => void;
}

const LOGO_MODES: Array<{ id: LogoDisplayMode; label: string; desc: string }> = [
  { id: 'image_and_text', label: 'الشعار + اسم الموقع', desc: 'يعرض الصورة وبجانبها أو أسفلها الاسم' },
  { id: 'image_only', label: 'الشعار فقط', desc: 'يعرض صورة الشعار بدون نص' },
  { id: 'text_only', label: 'الاسم النصي فقط', desc: 'استخدام اسم نصي أنيق بدلاً من الصورة' },
  { id: 'hidden', label: 'إخفاء الشعار', desc: 'إخفاء كامل للشعار والاسم في الهيدر' },
];

const PLACEMENT_OPTIONS: Array<{ id: LogoPlacement; label: string }> = [
  { id: 'before_text', label: 'قبل الاسم (بجانبه)' },
  { id: 'after_text', label: 'بعد الاسم (بجانبه)' },
  { id: 'above_text', label: 'أعلى الاسم (عمودي)' },
];

const HEADER_ALIGN_OPTIONS: Array<{ id: HeaderLogoAlign; label: string }> = [
  { id: 'start', label: 'يمين الهيدر (الافتراضي)' },
  { id: 'center', label: 'توسيط الهيدر (الكمبيوتر)' },
];

const WEIGHT_OPTIONS: Array<WebsiteBrandingConfig['siteNameWeight']> = [
  400, 500, 600, 700, 800, 900,
];

const FAVICON_MODES: Array<{ id: FaviconMode; label: string; desc: string }> = [
  { id: 'default', label: 'الأيقونة الافتراضية', desc: 'أيقونة RahaL TV القياسية' },
  { id: 'custom', label: 'أيقونة مخصصة', desc: 'رفع ملف PNG أو ICO أو SVG من الجهاز' },
  { id: 'none', label: 'إخفاء / بدون أيقونة', desc: 'عدم استخدام أي أيقونة متصفح نهائياً' },
];

export function WebsiteBrandingPanel({
  branding,
  siteNameFallback,
  busy = false,
  onSaveBranding,
  onNotify,
}: WebsiteBrandingPanelProps) {
  const [draft, setDraft] = useState<WebsiteBrandingConfig>(() =>
    normalizeWebsiteBranding(branding, siteNameFallback)
  );
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(normalizeWebsiteBranding(branding, siteNameFallback));
  }, [branding, siteNameFallback]);

  useEffect(() => {
    ensureWebsiteBrandingFontLoaded(draft.siteNameFont);
  }, [draft.siteNameFont]);

  const isDirty = useMemo(
    () =>
      JSON.stringify(draft) !==
      JSON.stringify(normalizeWebsiteBranding(branding, siteNameFallback)),
    [draft, branding, siteNameFallback]
  );

  const resolvedLogoSrc = useMemo(() => resolveBrandingAssetUrl(draft.logoUrl), [draft.logoUrl]);
  const resolvedFaviconSrc = useMemo(
    () => resolveBrandingAssetUrl(draft.faviconUrl),
    [draft.faviconUrl]
  );

  const updateDraft = (patch: Partial<WebsiteBrandingConfig>) => {
    setDraft((prev) => normalizeWebsiteBranding({ ...prev, ...patch }, siteNameFallback));
  };

  const getToken = async (): Promise<string | undefined> => {
    try {
      const user = getActiveAuthInstance().currentUser;
      return user ? await user.getIdToken() : undefined;
    } catch {
      return undefined;
    }
  };

  const handleUploadLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingLogo(true);
    try {
      const idToken = await getToken();
      const uploaded = await optimizeAndUploadBrandingAsset({
        file,
        kind: 'logo',
        idToken,
      });
      updateDraft({
        logoUrl: uploaded.url,
        logoMode: draft.logoMode === 'hidden' || draft.logoMode === 'text_only' ? 'image_and_text' : draft.logoMode,
      });
      const savingsNote =
        uploaded.savedPct && uploaded.savedPct > 0
          ? ` (تم ضغط الحجم بنسبة ${uploaded.savedPct}%)`
          : '';
      onNotify(`تم رفع الشعار وتجهيزه للمعاينة${savingsNote} — اضغط حفظ الهوية لتثبيته في الموقع.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر رفع الشعار');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDeleteLogo = async () => {
    const prevUrl = draft.logoUrl;
    updateDraft({ logoUrl: '' });
    if (prevUrl.startsWith('/uploads/branding/')) {
      const idToken = await getToken();
      if (idToken) {
        fetch('/api/branding/asset', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ url: prevUrl }),
        }).catch(() => undefined);
      }
    }
    onNotify('تمت إزالة صورة الشعار من المسودة.');
  };

  const handleUploadFavicon = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingFavicon(true);
    try {
      const idToken = await getToken();
      const uploaded = await optimizeAndUploadBrandingAsset({
        file,
        kind: 'favicon',
        idToken,
      });
      updateDraft({
        faviconMode: 'custom',
        faviconUrl: uploaded.url,
        faviconMimeType: uploaded.mimeType,
      });
      const savingsNote =
        uploaded.savedPct && uploaded.savedPct > 0
          ? ` (توفير ${uploaded.savedPct}% من الحجم)`
          : '';
      onNotify(`تم رفع أيقونة المتصفح (Favicon)${savingsNote} — اضغط حفظ الهوية لتحديث المتصفح.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر رفع الأيقونة');
    } finally {
      setUploadingFavicon(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveBranding(draft);
      applyWebsiteFaviconToDocument(draft);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const def = normalizeWebsiteBranding(DEFAULT_WEBSITE_BRANDING, 'RahaL TV');
    setDraft(def);
    setSaving(true);
    try {
      await onSaveBranding(def);
      applyWebsiteFaviconToDocument(def);
    } finally {
      setSaving(false);
    }
  };

  const nameFontStack = useMemo(
    () => resolveWebsiteBrandingFontStack(draft.siteNameFont),
    [draft.siteNameFont]
  );

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl rtv-admin-accent-soft border rtv-admin-accent-text">
            <BadgeCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg sm:text-xl font-extrabold text-white">
                إعدادات هوية الموقع (Website Branding)
              </h2>
              <span className="rounded-lg bg-teal-500/15 border border-teal-400/35 px-2.5 py-0.5 text-[10px] font-extrabold text-teal-300">
                خاص بواجهة الموقع للزوار فقط
              </span>
            </div>
            <p className="text-xs text-[#b7c9ef] mt-1">
              تحكم كامل في الشعار (اللوجو)، اسم الموقع وخطه ولونه، وأيقونة المتصفح Favicon مع معاينة حية لا تتأثر بمظهر لوحة الإدارة.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={busy || saving}
            onClick={() => void handleReset()}
            className="rtv-admin-btn-height inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الافتراضي</span>
          </button>

          {isDirty && (
            <button
              type="button"
              disabled={busy || saving}
              onClick={() => setDraft(normalizeWebsiteBranding(branding, siteNameFallback))}
              className="rtv-admin-btn-height inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-amber-300 cursor-pointer"
            >
              <span>تراجع عن المسودة</span>
            </button>
          )}

          <button
            type="button"
            disabled={busy || saving}
            onClick={() => void handleSave()}
            className="rtv-admin-btn-height inline-flex items-center gap-2 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-50 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{saving ? 'جاري الحفظ...' : 'حفظ هوية الموقع وتطبيقها'}</span>
          </button>
        </div>
      </div>

      {/* Live Preview Banner (Public Site Isolation Scope) */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 rtv-admin-accent-text" />
            <h3 className="font-display text-base font-extrabold text-white">
              معاينة الهوية الحية في الهيدر وتبويب المتصفح
            </h3>
          </div>
          <span className="text-[11px] font-bold text-emerald-400">
            {isDirty ? 'تعديلات قيد المعاينة (غير محفوظة بعد)' : 'مطابقة للهوية المنشورة'}
          </span>
        </div>

        {/* Simulated Browser Tab + Header Preview */}
        <div className="rtv-site-preview rounded-2xl border border-white/15 overflow-hidden bg-[#0f0f0f]">
          {/* Browser Tab Strip */}
          <div className="flex items-center gap-2 bg-[#161a20] px-4 py-2 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center gap-2 rounded-t-lg bg-[#0f0f0f] border border-b-0 border-white/10 px-3 py-1.5 max-w-xs">
              {draft.faviconMode === 'none' ? null : draft.faviconMode === 'custom' && resolvedFaviconSrc ? (
                <img
                  src={resolvedFaviconSrc}
                  alt="Favicon Preview"
                  className="h-4 w-4 object-contain shrink-0"
                />
              ) : (
                <img
                  src="/favicon.png"
                  alt="Default Favicon"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  className="pointer-events-none select-none h-4 w-4 rounded-full object-contain shrink-0"
                />
              )}
              <span className="text-[11px] font-bold text-white truncate">
                {draft.siteName} — مشاهدة أحدث الأفلام والمسلسلات
              </span>
            </div>
          </div>

          {/* Public Header Preview */}
          <div className="px-6 py-4 flex items-center justify-between gap-4 border-b border-white/10 bg-[#0f0f0f]">
            <div
              className={`flex-1 flex items-center ${
                draft.headerAlign === 'center' ? 'justify-center' : 'justify-start'
              }`}
            >
              {draft.logoMode === 'hidden' ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-xs text-white/50">
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>تم إخفاء الشعار والاسم من الهيدر</span>
                </span>
              ) : (
                <div
                  className={`inline-flex items-center ${
                    draft.logoPlacement === 'above_text'
                      ? 'flex-col text-center'
                      : draft.logoPlacement === 'after_text'
                        ? 'flex-row-reverse'
                        : 'flex-row'
                  }`}
                  style={{ gap: `${draft.logoTextGapPx}px` }}
                >
                  {(draft.logoMode === 'image_and_text' || draft.logoMode === 'image_only') && (
                    <img
                      src={resolvedLogoSrc || '/brand-logo.png'}
                      alt={draft.siteName}
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                      style={{
                        width: `${draft.logoWidthPx}px`,
                        height: `${draft.logoHeightPx}px`,
                      }}
                      className="pointer-events-none select-none object-contain shrink-0"
                    />
                  )}

                  {(draft.logoMode === 'image_and_text' || draft.logoMode === 'text_only') && (
                    <span
                      style={{
                        color: draft.siteNameColor,
                        fontFamily: nameFontStack,
                        fontSize: `${draft.siteNameSizePx}px`,
                        fontWeight: draft.siteNameWeight,
                        letterSpacing: `${draft.siteNameLetterSpacingPx}px`,
                      }}
                      className="leading-none"
                    >
                      {draft.siteName}
                    </span>
                  )}
                </div>
              )}
            </div>

            {draft.headerAlign !== 'center' && (
              <div className="hidden sm:flex items-center gap-3 text-xs text-white/60">
                <span>الرئيسية</span>
                <span>أفلام</span>
                <span>مسلسلات</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 1: Logo Settings */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-sky-400" />
            <h3 className="font-display text-base font-extrabold text-white">
              1. إعدادات اللوجو (الشعار)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-xl rtv-admin-accent-bg px-3.5 py-2 text-xs font-extrabold shadow cursor-pointer">
              <FileUp className="w-3.5 h-3.5" />
              <span>
                {uploadingLogo
                  ? 'جاري الرفع...'
                  : resolvedLogoSrc
                    ? 'استبدال اللوجو'
                    : 'رفع لوجو من الجهاز'}
              </span>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                disabled={uploadingLogo}
                onChange={(e) => void handleUploadLogo(e)}
                className="hidden"
              />
            </label>
            {resolvedLogoSrc && (
              <button
                type="button"
                onClick={() => void handleDeleteLogo()}
                className="inline-flex items-center gap-1 rounded-xl bg-[#D92321]/15 hover:bg-[#D92321] border border-[#D92321]/35 px-3 py-2 text-xs font-bold text-[#ff8a88] hover:text-white cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف اللوجو</span>
              </button>
            )}
          </div>
        </div>

        {/* Display Mode Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {LOGO_MODES.map((m) => {
            const active = draft.logoMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => updateDraft({ logoMode: m.id })}
                className={`rounded-2xl border p-3.5 text-right transition-all cursor-pointer ${
                  active
                    ? 'rtv-admin-accent-soft ring-2 ring-[var(--rtv-admin-accent)]'
                    : 'bg-[#1a242e]/65 border-white/10 hover:border-white/25'
                }`}
              >
                <p className="text-xs font-extrabold text-white">{m.label}</p>
                <p className="text-[11px] text-[#b7c9ef] mt-1">{m.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Dimensions, Placement & Gap */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">عرض اللوجو</span>
              <span className="font-latin font-black rtv-admin-accent-text">{draft.logoWidthPx}px</span>
            </div>
            <input
              type="range"
              min={20}
              max={260}
              value={draft.logoWidthPx}
              onChange={(e) => updateDraft({ logoWidthPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">ارتفاع اللوجو</span>
              <span className="font-latin font-black rtv-admin-accent-text">{draft.logoHeightPx}px</span>
            </div>
            <input
              type="range"
              min={20}
              max={120}
              value={draft.logoHeightPx}
              onChange={(e) => updateDraft({ logoHeightPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">المسافة بين اللوجو والاسم</span>
              <span className="font-latin font-black rtv-admin-accent-text">{draft.logoTextGapPx}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={40}
              value={draft.logoTextGapPx}
              onChange={(e) => updateDraft({ logoTextGapPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.07] p-4 space-y-2.5">
            <p className="text-xs font-extrabold text-white">ترتيب اللوجو بالنسبة للاسم</p>
            <div className="grid grid-cols-3 gap-2">
              {PLACEMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updateDraft({ logoPlacement: opt.id })}
                  className={`rounded-xl border px-2.5 py-2 text-[11px] font-bold cursor-pointer ${
                    draft.logoPlacement === opt.id
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
            <p className="text-xs font-extrabold text-white">مكان ظهور الهوية في الهيدر</p>
            <div className="grid grid-cols-2 gap-2">
              {HEADER_ALIGN_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updateDraft({ headerAlign: opt.id })}
                  className={`rounded-xl border px-3 py-2 text-[11px] font-bold cursor-pointer ${
                    draft.headerAlign === opt.id
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

      {/* Section 2: Site Name Settings */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Type className="w-5 h-5 text-emerald-400" />
            <h3 className="font-display text-base font-extrabold text-white">
              2. إعدادات اسم الموقع (يدعم العربية والإنجليزية)
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-xs font-bold text-[#b7c9ef]">اسم الموقع الظاهر للزوار</label>
            <input
              type="text"
              value={draft.siteName}
              onChange={(e) => updateDraft({ siteName: e.target.value })}
              placeholder="مثال: RahaL TV أو رحال تي في"
              className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-4 py-2.5 text-sm font-bold text-white focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#b7c9ef]">لون اسم الموقع</label>
            <div className="flex items-center gap-3 rounded-xl bg-[#1a242e] border border-white/10 px-3 py-1.5">
              <input
                type="color"
                aria-label="لون اسم الموقع"
                value={draft.siteNameColor}
                onChange={(e) => updateDraft({ siteNameColor: e.target.value })}
                className="h-8 w-11 rounded border-0 bg-transparent cursor-pointer"
              />
              <span className="font-latin text-xs font-bold text-white uppercase">
                {draft.siteNameColor}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#b7c9ef]">نوع خط الاسم</label>
            <select
              value={draft.siteNameFont}
              onChange={(e) => updateDraft({ siteNameFont: e.target.value })}
              className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none"
            >
              {WEBSITE_BRANDING_FONT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#b7c9ef]">حجم الخط</span>
              <span className="font-latin font-black rtv-admin-accent-text">{draft.siteNameSizePx}px</span>
            </div>
            <input
              type="range"
              min={14}
              max={48}
              value={draft.siteNameSizePx}
              onChange={(e) => updateDraft({ siteNameSizePx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer mt-2"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#b7c9ef]">سماكة الخط (Weight)</label>
            <select
              value={draft.siteNameWeight}
              onChange={(e) =>
                updateDraft({
                  siteNameWeight: Number(e.target.value) as WebsiteBrandingConfig['siteNameWeight'],
                })
              }
              className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none"
            >
              {WEIGHT_OPTIONS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#b7c9ef]">المسافة بين الحروف</span>
              <span className="font-latin font-black rtv-admin-accent-text">
                {draft.siteNameLetterSpacingPx}px
              </span>
            </div>
            <input
              type="range"
              min={-2}
              max={10}
              step={0.5}
              value={draft.siteNameLetterSpacingPx}
              onChange={(e) => updateDraft({ siteNameLetterSpacingPx: Number(e.target.value) })}
              className="w-full accent-[var(--rtv-admin-accent)] cursor-pointer mt-2"
            />
          </div>
        </div>
      </div>

      {/* Section 3: Favicon Settings */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-violet-400" />
            <h3 className="font-display text-base font-extrabold text-white">
              3. إعدادات أيقونة المتصفح (Favicon)
            </h3>
          </div>
          <label className="inline-flex items-center gap-1.5 rounded-xl rtv-admin-accent-bg px-3.5 py-2 text-xs font-extrabold shadow cursor-pointer">
            <FileUp className="w-3.5 h-3.5" />
            <span>{uploadingFavicon ? 'جاري الرفع...' : 'رفع Favicon (PNG / ICO / SVG)'}</span>
            <input
              type="file"
              accept=".png,.ico,.svg,image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
              disabled={uploadingFavicon}
              onChange={(e) => void handleUploadFavicon(e)}
              className="hidden"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {FAVICON_MODES.map((m) => {
            const active = draft.faviconMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  if (m.id === 'custom' && !resolvedFaviconSrc) {
                    onNotify('ارفع أيقونة مخصصة (PNG / ICO / SVG) أولاً لتفعيلها.');
                    return;
                  }
                  updateDraft({ faviconMode: m.id });
                }}
                className={`rounded-2xl border p-4 text-right transition-all cursor-pointer ${
                  active
                    ? 'rtv-admin-accent-soft ring-2 ring-[var(--rtv-admin-accent)]'
                    : 'bg-[#1a242e]/65 border-white/10 hover:border-white/25'
                }`}
              >
                <p className="text-xs font-extrabold text-white">{m.label}</p>
                <p className="text-[11px] text-[#b7c9ef] mt-1">{m.desc}</p>
              </button>
            );
          })}
        </div>

        {draft.faviconMode === 'none' && (
          <div className="rounded-2xl bg-sky-500/10 border border-sky-500/25 p-3.5 text-xs text-[#b7c9ef]">
            وضع <strong className="text-white">بدون أيقونة</strong> نشط: عند الحفظ سيتم مسح روابط الأيقونة الافتراضية من الصفحة وعدم فرض أي أيقونة بديلة في المتصفح.
          </div>
        )}
      </div>
    </div>
  );
}
