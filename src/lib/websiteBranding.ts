import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import type {
  FaviconMode,
  HeaderLogoAlign,
  LogoDisplayMode,
  LogoPlacement,
  WebsiteBrandingConfig,
} from '../types/media';
import { getActiveFirebaseApp } from './dbConnectionManager';
import { compressImageForUpload } from './imageCompressor';

export const WEBSITE_BRANDING_STORAGE_KEY = 'rahaltv_website_branding_v1';
export const WEBSITE_BRANDING_LOCAL_ASSETS_KEY = 'rahaltv_website_branding_local_assets_v1';

export interface WebsiteBrandingFontPreset {
  id: string;
  label: string;
  cssFamily: string;
  googleSpec?: string;
  directionHint: 'ar' | 'en' | 'both';
}

export const WEBSITE_BRANDING_FONT_PRESETS: WebsiteBrandingFontPreset[] = [
  {
    id: 'Cairo',
    label: 'Cairo (افتراضي — عربي وإنجليزي متوازن)',
    cssFamily: 'Cairo',
    googleSpec: 'Cairo:wght@400;500;600;700;800;900',
    directionHint: 'both',
  },
  {
    id: 'Tajawal',
    label: 'Tajawal (عربي أنيق)',
    cssFamily: 'Tajawal',
    googleSpec: 'Tajawal:wght@400;500;700;800;900',
    directionHint: 'ar',
  },
  {
    id: 'Almarai',
    label: 'Almarai (هندسي عصري)',
    cssFamily: 'Almarai',
    googleSpec: 'Almarai:wght@400;700;800',
    directionHint: 'ar',
  },
  {
    id: 'IBM Plex Sans Arabic',
    label: 'IBM Plex Sans Arabic (احترافي تقني)',
    cssFamily: 'IBM Plex Sans Arabic',
    googleSpec: 'IBM+Plex+Sans+Arabic:wght@400;500;600;700',
    directionHint: 'both',
  },
  {
    id: 'Alexandria',
    label: 'Alexandria (قوي وعريض)',
    cssFamily: 'Alexandria',
    googleSpec: 'Alexandria:wght@400;500;600;700;800;900',
    directionHint: 'both',
  },
  {
    id: 'Changa',
    label: 'Changa (عناوين سينمائية)',
    cssFamily: 'Changa',
    googleSpec: 'Changa:wght@400;500;600;700;800',
    directionHint: 'ar',
  },
  {
    id: 'Readex Pro',
    label: 'Readex Pro (حديث ودقيق)',
    cssFamily: 'Readex Pro',
    googleSpec: 'Readex+Pro:wght@400;500;600;700',
    directionHint: 'both',
  },
  {
    id: 'Inter',
    label: 'Inter (إنجليزي قياسي)',
    cssFamily: 'Inter',
    googleSpec: 'Inter:wght@400;500;600;700;800;900',
    directionHint: 'en',
  },
  {
    id: 'Poppins',
    label: 'Poppins (إنجليزي هندسي)',
    cssFamily: 'Poppins',
    googleSpec: 'Poppins:wght@400;500;600;700;800;900',
    directionHint: 'en',
  },
  {
    id: 'Outfit',
    label: 'Outfit (إنجليزي بارز)',
    cssFamily: 'Outfit',
    googleSpec: 'Outfit:wght@400;500;600;700;800;900',
    directionHint: 'en',
  },
  {
    id: 'Montserrat',
    label: 'Montserrat (إنجليزي كلاسيكي)',
    cssFamily: 'Montserrat',
    googleSpec: 'Montserrat:wght@400;500;600;700;800;900',
    directionHint: 'en',
  },
];

export const DEFAULT_WEBSITE_BRANDING: WebsiteBrandingConfig = {
  logoMode: 'image_and_text',
  logoUrl: '',
  logoWidthPx: 40,
  logoHeightPx: 40,
  logoPlacement: 'before_text',
  headerAlign: 'start',
  logoTextGapPx: 12,
  siteName: 'RahaL TV',
  siteNameColor: '#ffffff',
  siteNameFont: 'Cairo',
  siteNameSizePx: 22,
  siteNameWeight: 900,
  siteNameLetterSpacingPx: 0,
  faviconMode: 'default',
  faviconUrl: '',
  faviconMimeType: '',
};

const VALID_LOGO_MODES: LogoDisplayMode[] = ['image_and_text', 'image_only', 'text_only', 'hidden'];
const VALID_LOGO_PLACEMENTS: LogoPlacement[] = ['before_text', 'after_text', 'above_text'];
const VALID_HEADER_ALIGNS: HeaderLogoAlign[] = ['start', 'center'];
const VALID_FAVICON_MODES: FaviconMode[] = ['default', 'custom', 'none'];
const VALID_WEIGHTS = [400, 500, 600, 700, 800, 900] as const;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Number(num.toFixed(1))));
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed.split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function normalizeAssetUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length > 600 && !trimmed.startsWith('local-asset://')) return '';
  if (/^(https?:\/\/|\/uploads\/|\/|local-asset:\/\/)/i.test(trimmed)) {
    return trimmed.slice(0, 600);
  }
  return '';
}

export function normalizeWebsiteBranding(
  raw?: Partial<WebsiteBrandingConfig> | null,
  fallbackSiteName?: string
): WebsiteBrandingConfig {
  const safeFallbackName =
    typeof fallbackSiteName === 'string' && fallbackSiteName.trim()
      ? fallbackSiteName.trim().slice(0, 80)
      : DEFAULT_WEBSITE_BRANDING.siteName;

  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_WEBSITE_BRANDING, siteName: safeFallbackName };
  }

  const logoMode: LogoDisplayMode = VALID_LOGO_MODES.includes(raw.logoMode as LogoDisplayMode)
    ? (raw.logoMode as LogoDisplayMode)
    : DEFAULT_WEBSITE_BRANDING.logoMode;

  const logoPlacement: LogoPlacement = VALID_LOGO_PLACEMENTS.includes(
    raw.logoPlacement as LogoPlacement
  )
    ? (raw.logoPlacement as LogoPlacement)
    : DEFAULT_WEBSITE_BRANDING.logoPlacement;

  const headerAlign: HeaderLogoAlign = VALID_HEADER_ALIGNS.includes(
    raw.headerAlign as HeaderLogoAlign
  )
    ? (raw.headerAlign as HeaderLogoAlign)
    : DEFAULT_WEBSITE_BRANDING.headerAlign;

  const faviconMode: FaviconMode = VALID_FAVICON_MODES.includes(raw.faviconMode as FaviconMode)
    ? (raw.faviconMode as FaviconMode)
    : DEFAULT_WEBSITE_BRANDING.faviconMode;

  const fontIds = new Set(WEBSITE_BRANDING_FONT_PRESETS.map((f) => f.id));
  const siteNameFont =
    typeof raw.siteNameFont === 'string' && fontIds.has(raw.siteNameFont.trim())
      ? raw.siteNameFont.trim()
      : DEFAULT_WEBSITE_BRANDING.siteNameFont;

  const rawWeight = Number(raw.siteNameWeight);
  const siteNameWeight = (VALID_WEIGHTS as readonly number[]).includes(rawWeight)
    ? (rawWeight as WebsiteBrandingConfig['siteNameWeight'])
    : DEFAULT_WEBSITE_BRANDING.siteNameWeight;

  const siteName =
    typeof raw.siteName === 'string' && raw.siteName.trim()
      ? raw.siteName.trim().slice(0, 80)
      : safeFallbackName;

  const faviconUrl = faviconMode === 'custom' ? normalizeAssetUrl(raw.faviconUrl) : '';

  return {
    logoMode,
    logoUrl: normalizeAssetUrl(raw.logoUrl),
    logoWidthPx: clampInt(raw.logoWidthPx, 20, 260, DEFAULT_WEBSITE_BRANDING.logoWidthPx),
    logoHeightPx: clampInt(raw.logoHeightPx, 20, 120, DEFAULT_WEBSITE_BRANDING.logoHeightPx),
    logoPlacement,
    headerAlign,
    logoTextGapPx: clampInt(raw.logoTextGapPx, 0, 40, DEFAULT_WEBSITE_BRANDING.logoTextGapPx),
    siteName,
    siteNameColor: normalizeHexColor(raw.siteNameColor, DEFAULT_WEBSITE_BRANDING.siteNameColor),
    siteNameFont,
    siteNameSizePx: clampInt(raw.siteNameSizePx, 14, 48, DEFAULT_WEBSITE_BRANDING.siteNameSizePx),
    siteNameWeight,
    siteNameLetterSpacingPx: clampFloat(
      raw.siteNameLetterSpacingPx,
      -2,
      10,
      DEFAULT_WEBSITE_BRANDING.siteNameLetterSpacingPx
    ),
    faviconMode: faviconMode === 'custom' && !faviconUrl ? 'default' : faviconMode,
    faviconUrl,
    faviconMimeType:
      typeof raw.faviconMimeType === 'string' ? raw.faviconMimeType.trim().slice(0, 80) : '',
  };
}

export function loadStoredWebsiteBranding(fallbackSiteName?: string): WebsiteBrandingConfig {
  if (typeof window === 'undefined') {
    return normalizeWebsiteBranding(undefined, fallbackSiteName);
  }
  try {
    const raw = window.localStorage.getItem(WEBSITE_BRANDING_STORAGE_KEY);
    if (!raw) return normalizeWebsiteBranding(undefined, fallbackSiteName);
    return normalizeWebsiteBranding(
      JSON.parse(raw) as Partial<WebsiteBrandingConfig>,
      fallbackSiteName
    );
  } catch {
    return normalizeWebsiteBranding(undefined, fallbackSiteName);
  }
}

export function saveStoredWebsiteBranding(
  branding: Partial<WebsiteBrandingConfig>,
  fallbackSiteName?: string
): WebsiteBrandingConfig {
  const clean = normalizeWebsiteBranding(branding, fallbackSiteName);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(WEBSITE_BRANDING_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Ignore storage quota errors
    }
  }
  return clean;
}

export function sanitizeSvgContent(rawSvg: string): string {
  const stripped = String(rawSvg || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .trim();
  if (!/<svg[\s>]/i.test(stripped) || !/<\/svg>/i.test(stripped)) {
    throw new Error('ملف SVG غير صالح أو لا يحتوي على عنصر <svg> صحيح.');
  }
  return stripped;
}

function readLocalAssetCache(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(WEBSITE_BRANDING_LOCAL_ASSETS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalAssetCache(kind: 'logo' | 'favicon', dataUrl: string): string {
  if (typeof window === 'undefined') return dataUrl;
  try {
    const map = readLocalAssetCache();
    map[kind] = dataUrl;
    window.localStorage.setItem(WEBSITE_BRANDING_LOCAL_ASSETS_KEY, JSON.stringify(map));
    return `local-asset://${kind}`;
  } catch {
    return '';
  }
}

export function resolveBrandingAssetUrl(url: string | undefined | null): string {
  const clean = String(url || '').trim();
  if (!clean) return '';
  if (clean.startsWith('local-asset://')) {
    const key = clean.slice('local-asset://'.length).trim();
    const map = readLocalAssetCache();
    return map[key] || '';
  }
  return clean;
}

export function sanitizeBrandingForFirestore(
  raw: Partial<WebsiteBrandingConfig> | undefined,
  fallbackSiteName?: string
): WebsiteBrandingConfig {
  const normalized = normalizeWebsiteBranding(raw, fallbackSiteName);
  return {
    ...normalized,
    logoUrl: normalized.logoUrl.startsWith('local-asset://') ? '' : normalized.logoUrl,
    faviconUrl: normalized.faviconUrl.startsWith('local-asset://') ? '' : normalized.faviconUrl,
    faviconMode:
      normalized.faviconMode === 'custom' && normalized.faviconUrl.startsWith('local-asset://')
        ? 'default'
        : normalized.faviconMode,
  };
}

export function resolveWebsiteBrandingFontStack(fontId: string): string {
  const preset = WEBSITE_BRANDING_FONT_PRESETS.find((p) => p.id === fontId);
  const chosen = preset?.cssFamily || 'Cairo';
  return `"${chosen}", "Cairo", "Tajawal", system-ui, sans-serif`;
}

export function ensureWebsiteBrandingFontLoaded(fontId: string): void {
  if (typeof document === 'undefined') return;
  const preset = WEBSITE_BRANDING_FONT_PRESETS.find((p) => p.id === fontId);
  const linkId = 'rahaltv-site-branding-font';
  let linkEl = document.getElementById(linkId) as HTMLLinkElement | null;
  if (!preset?.googleSpec) {
    if (linkEl) linkEl.remove();
    return;
  }
  const href = `https://fonts.googleapis.com/css2?family=${preset.googleSpec}&display=swap`;
  if (!linkEl) {
    linkEl = document.createElement('link');
    linkEl.id = linkId;
    linkEl.rel = 'stylesheet';
    document.head.appendChild(linkEl);
  }
  if (linkEl.href !== href) {
    linkEl.href = href;
  }
}

export function applyWebsiteFaviconToDocument(rawBranding?: Partial<WebsiteBrandingConfig> | null): void {
  if (typeof document === 'undefined') return;
  const branding = normalizeWebsiteBranding(rawBranding);
  const head = document.head;
  if (!head) return;

  const existingIcons = Array.from(
    head.querySelectorAll('link[rel*="icon"], link[rel="apple-touch-icon"]')
  );
  for (const el of existingIcons) {
    el.remove();
  }

  if (branding.faviconMode === 'none') {
    const blankIcon = document.createElement('link');
    blankIcon.rel = 'icon';
    blankIcon.href = 'data:,';
    blankIcon.setAttribute('data-rtv-disabled-favicon', 'true');
    head.appendChild(blankIcon);
    return;
  }

  if (branding.faviconMode === 'custom') {
    const resolvedUrl = resolveBrandingAssetUrl(branding.faviconUrl);
    if (resolvedUrl) {
      const iconLink = document.createElement('link');
      iconLink.rel = 'icon';
      if (branding.faviconMimeType) {
        iconLink.type = branding.faviconMimeType;
      } else if (resolvedUrl.endsWith('.svg') || resolvedUrl.startsWith('data:image/svg+xml')) {
        iconLink.type = 'image/svg+xml';
      } else if (resolvedUrl.endsWith('.ico') || resolvedUrl.startsWith('data:image/x-icon')) {
        iconLink.type = 'image/x-icon';
      } else {
        iconLink.type = 'image/png';
      }
      iconLink.href = resolvedUrl;
      head.appendChild(iconLink);

      const appleLink = document.createElement('link');
      appleLink.rel = 'apple-touch-icon';
      appleLink.href = resolvedUrl;
      head.appendChild(appleLink);
      return;
    }
  }

  // Default fallback icon (circular emblem for browser & external app)
  const appleDefault = document.createElement('link');
  appleDefault.rel = 'apple-touch-icon';
  appleDefault.setAttribute('sizes', '180x180');
  appleDefault.href = '/apple-touch-icon.png';
  head.appendChild(appleDefault);

  const png192Default = document.createElement('link');
  png192Default.rel = 'icon';
  png192Default.type = 'image/png';
  png192Default.setAttribute('sizes', '192x192');
  png192Default.href = '/pwa-192x192.png';
  head.appendChild(png192Default);

  const png64Default = document.createElement('link');
  png64Default.rel = 'icon';
  png64Default.type = 'image/png';
  png64Default.setAttribute('sizes', '64x64');
  png64Default.href = '/favicon.png';
  head.appendChild(png64Default);

  const svgDefault = document.createElement('link');
  svgDefault.rel = 'icon';
  svgDefault.type = 'image/svg+xml';
  svgDefault.href = '/icon.svg';
  head.appendChild(svgDefault);
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة الملف من الجهاز.'));
    reader.readAsDataURL(file);
  });
}

async function optimizeRasterImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  outputMime: 'image/webp' | 'image/png'
): Promise<{ blob: Blob; mimeType: string; extension: string }> {
  const srcUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذر معالجة الصورة المختارة.'));
      el.src = srcUrl;
    });
    const scale = Math.min(1, maxWidth / (img.naturalWidth || maxWidth), maxHeight / (img.naturalHeight || maxHeight));
    const width = Math.max(16, Math.round((img.naturalWidth || maxWidth) * scale));
    const height = Math.max(16, Math.round((img.naturalHeight || maxHeight) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { blob: file, mimeType: file.type || 'image/png', extension: 'png' };
    }
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('فشل ضغط الصورة'))),
        outputMime,
        0.92
      );
    });
    return {
      blob,
      mimeType: outputMime,
      extension: outputMime === 'image/webp' ? 'webp' : 'png',
    };
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}

export async function optimizeAndUploadBrandingAsset(params: {
  file: File;
  kind: 'logo' | 'favicon';
  idToken?: string;
}): Promise<{
  url: string;
  mimeType: string;
  storageProvider: 'backend' | 'firebase_storage' | 'local_cache';
  beforeBytes?: number;
  afterBytes?: number;
  savedPct?: number;
}> {
  const { file, kind, idToken } = params;
  const lowerName = file.name.toLowerCase();
  const isSvg = lowerName.endsWith('.svg') || file.type === 'image/svg+xml';
  const isIco =
    lowerName.endsWith('.ico') ||
    file.type === 'image/x-icon' ||
    file.type === 'image/vnd.microsoft.icon';
  const isRaster =
    /\.(png|jpe?g|webp|avif)$/i.test(lowerName) ||
    ['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type);

  if (kind === 'favicon' && !isSvg && !isIco && !/\.(png)$/i.test(lowerName) && file.type !== 'image/png') {
    throw new Error('صيغ Favicon المدعومة هي PNG و ICO و SVG فقط.');
  }
  if (kind === 'logo' && !isSvg && !isRaster) {
    throw new Error('صيغ الشعار المدعومة هي PNG و JPG و WEBP و AVIF و SVG فقط.');
  }
  if (file.size > 4 * 1024 * 1024) {
    throw new Error('الحد الأقصى لحجم الملف قبل الضغط هو 4 ميغابايت.');
  }

  let preparedBlob: Blob = file;
  let mimeType = file.type || 'image/png';
  let extension = lowerName.split('.').pop() || 'png';
  let dataUrl = '';
  let beforeBytes = file.size;
  let afterBytes = file.size;
  let savedPct = 0;

  if (isSvg) {
    const rawText = await file.text();
    const cleanSvg = sanitizeSvgContent(rawText);
    preparedBlob = new Blob([cleanSvg], { type: 'image/svg+xml' });
    mimeType = 'image/svg+xml';
    extension = 'svg';
    afterBytes = preparedBlob.size;
    dataUrl = await fileToDataUrl(preparedBlob);
  } else if (isIco) {
    mimeType = 'image/x-icon';
    extension = 'ico';
    dataUrl = await fileToDataUrl(preparedBlob);
  } else {
    const compressed = await compressImageForUpload(file, kind === 'favicon' ? 'favicon' : 'logo');
    preparedBlob = compressed.blob;
    mimeType = compressed.mimeType;
    extension = compressed.extension;
    dataUrl = compressed.dataUrl;
    beforeBytes = compressed.beforeBytes;
    afterBytes = compressed.afterBytes;
    savedPct = compressed.savedPct;
  }

  // 1) Try Express Backend Upload Endpoint (/api/branding/upload)
  if (idToken) {
    try {
      const resp = await fetch('/api/branding/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          kind,
          mimeType,
          extension,
          dataUrl,
        }),
      });
      if (resp.ok) {
        const json = (await resp.json()) as { ok?: boolean; url?: string };
        if (json.ok && json.url) {
          return {
            url: json.url,
            mimeType,
            storageProvider: 'backend',
            beforeBytes,
            afterBytes,
            savedPct,
          };
        }
      }
    } catch {
      // Fall through to Firebase Storage / Local cache
    }
  }

  // 2) Try Firebase Storage fallback (e.g. static deployments)
  try {
    const storage = getStorage(getActiveFirebaseApp());
    const storageRef = ref(storage, `branding/${kind}-${Date.now()}.${extension}`);
    await uploadBytes(storageRef, preparedBlob, { contentType: mimeType });
    const downloadUrl = await getDownloadURL(storageRef);
    return {
      url: downloadUrl,
      mimeType,
      storageProvider: 'firebase_storage',
      beforeBytes,
      afterBytes,
      savedPct,
    };
  } catch {
    // Fall through to compact local cache
  }

  // 3) Offline local cache fallback (never writes large Base64 into Firestore)
  const localRef = writeLocalAssetCache(kind, dataUrl);
  if (!localRef) {
    throw new Error('تعذر رفع الملف إلى الخادم أو حفظه محلياً.');
  }
  return {
    url: localRef,
    mimeType,
    storageProvider: 'local_cache',
    beforeBytes,
    afterBytes,
    savedPct,
  };
}
