import { useCallback, useEffect, useState } from 'react';
import { sanitizeSvgContent } from './imageCompressor';

export interface ShowcaseSliderConfig {
  /** Per-media transparent PNG logo URLs (or compressed transparent data URLs), keyed by MediaItem.id */
  titleLogos: Record<string, string>;
  usePngLogoInHero: boolean;
  usePngLogoInStrip: boolean;
  showTitle: boolean;
  showEnglishSubtitle: boolean;
  showMetadata: boolean;
  showStory: boolean;
  storyLines: 1 | 2 | 3 | 4;
  showCast: boolean;
  showWatchBtn: boolean;
  watchBtnText: string;
  showWatchlistBtn: boolean;
  showTagline: boolean;
  showBottomStrip: boolean;
  logoMaxHeightPx: number;
  logoMaxWidthPx: number;
  titleSizePx: number;
  metaSizePx: number;
  storySizePx: number;
  stripLogoHeightPx: number;
  stripTextSizePx: number;
}

export const SHOWCASE_SLIDER_CONFIG_STORAGE_KEY = 'rahaltv_showcase_slider_config_v1';
const SHOWCASE_SLIDER_CONFIG_EVENT = 'rahaltv:showcase-slider-config-change';

export const DEFAULT_SHOWCASE_SLIDER_CONFIG: ShowcaseSliderConfig = {
  titleLogos: {},
  usePngLogoInHero: true,
  usePngLogoInStrip: true,
  showTitle: true,
  showEnglishSubtitle: false,
  showMetadata: true,
  showStory: true,
  storyLines: 2,
  showCast: true,
  showWatchBtn: true,
  watchBtnText: 'شاهد وحمل الان',
  showWatchlistBtn: true,
  showTagline: true,
  showBottomStrip: true,
  logoMaxHeightPx: 112,
  logoMaxWidthPx: 340,
  titleSizePx: 46,
  metaSizePx: 13,
  storySizePx: 14,
  stripLogoHeightPx: 38,
  stripTextSizePx: 15,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function normalizeShowcaseSliderConfig(
  raw: Partial<ShowcaseSliderConfig> | null | undefined
): ShowcaseSliderConfig {
  const src = raw || {};
  const rawLogos = src.titleLogos && typeof src.titleLogos === 'object' ? src.titleLogos : {};
  const titleLogos: Record<string, string> = {};
  for (const [id, url] of Object.entries(rawLogos)) {
    const cleanId = String(id || '').trim();
    const cleanUrl = String(url || '').trim();
    if (cleanId && cleanUrl) {
      titleLogos[cleanId] = cleanUrl;
    }
  }

  const linesRaw = clampInt(src.storyLines, 1, 4, DEFAULT_SHOWCASE_SLIDER_CONFIG.storyLines);

  return {
    titleLogos,
    usePngLogoInHero:
      typeof src.usePngLogoInHero === 'boolean'
        ? src.usePngLogoInHero
        : DEFAULT_SHOWCASE_SLIDER_CONFIG.usePngLogoInHero,
    usePngLogoInStrip:
      typeof src.usePngLogoInStrip === 'boolean'
        ? src.usePngLogoInStrip
        : DEFAULT_SHOWCASE_SLIDER_CONFIG.usePngLogoInStrip,
    showTitle:
      typeof src.showTitle === 'boolean'
        ? src.showTitle
        : DEFAULT_SHOWCASE_SLIDER_CONFIG.showTitle,
    showEnglishSubtitle:
      typeof src.showEnglishSubtitle === 'boolean'
        ? src.showEnglishSubtitle
        : DEFAULT_SHOWCASE_SLIDER_CONFIG.showEnglishSubtitle,
    showMetadata:
      typeof src.showMetadata === 'boolean'
        ? src.showMetadata
        : DEFAULT_SHOWCASE_SLIDER_CONFIG.showMetadata,
    showStory:
      typeof src.showStory === 'boolean'
        ? src.showStory
        : DEFAULT_SHOWCASE_SLIDER_CONFIG.showStory,
    storyLines: linesRaw as 1 | 2 | 3 | 4,
    showCast:
      typeof src.showCast === 'boolean'
        ? src.showCast
        : DEFAULT_SHOWCASE_SLIDER_CONFIG.showCast,
    showWatchBtn:
      typeof src.showWatchBtn === 'boolean'
        ? src.showWatchBtn
        : DEFAULT_SHOWCASE_SLIDER_CONFIG.showWatchBtn,
    watchBtnText:
      typeof src.watchBtnText === 'string' && src.watchBtnText.trim()
        ? src.watchBtnText.trim().slice(0, 40)
        : DEFAULT_SHOWCASE_SLIDER_CONFIG.watchBtnText,
    showWatchlistBtn:
      typeof src.showWatchlistBtn === 'boolean'
        ? src.showWatchlistBtn
        : DEFAULT_SHOWCASE_SLIDER_CONFIG.showWatchlistBtn,
    showTagline:
      typeof src.showTagline === 'boolean'
        ? src.showTagline
        : DEFAULT_SHOWCASE_SLIDER_CONFIG.showTagline,
    showBottomStrip:
      typeof src.showBottomStrip === 'boolean'
        ? src.showBottomStrip
        : DEFAULT_SHOWCASE_SLIDER_CONFIG.showBottomStrip,
    logoMaxHeightPx: clampInt(
      src.logoMaxHeightPx,
      48,
      200,
      DEFAULT_SHOWCASE_SLIDER_CONFIG.logoMaxHeightPx
    ),
    logoMaxWidthPx: clampInt(
      src.logoMaxWidthPx,
      160,
      500,
      DEFAULT_SHOWCASE_SLIDER_CONFIG.logoMaxWidthPx
    ),
    titleSizePx: clampInt(
      src.titleSizePx,
      22,
      72,
      DEFAULT_SHOWCASE_SLIDER_CONFIG.titleSizePx
    ),
    metaSizePx: clampInt(
      src.metaSizePx,
      10,
      18,
      DEFAULT_SHOWCASE_SLIDER_CONFIG.metaSizePx
    ),
    storySizePx: clampInt(
      src.storySizePx,
      11,
      20,
      DEFAULT_SHOWCASE_SLIDER_CONFIG.storySizePx
    ),
    stripLogoHeightPx: clampInt(
      src.stripLogoHeightPx,
      20,
      64,
      DEFAULT_SHOWCASE_SLIDER_CONFIG.stripLogoHeightPx
    ),
    stripTextSizePx: clampInt(
      src.stripTextSizePx,
      11,
      24,
      DEFAULT_SHOWCASE_SLIDER_CONFIG.stripTextSizePx
    ),
  };
}

const listeners = new Set<(cfg: ShowcaseSliderConfig) => void>();

export function loadShowcaseSliderConfig(): ShowcaseSliderConfig {
  if (typeof window === 'undefined') return DEFAULT_SHOWCASE_SLIDER_CONFIG;
  try {
    const raw = window.localStorage.getItem(SHOWCASE_SLIDER_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_SHOWCASE_SLIDER_CONFIG;
    return normalizeShowcaseSliderConfig(JSON.parse(raw) as Partial<ShowcaseSliderConfig>);
  } catch {
    return DEFAULT_SHOWCASE_SLIDER_CONFIG;
  }
}

export function saveShowcaseSliderConfig(
  next: Partial<ShowcaseSliderConfig>
): ShowcaseSliderConfig {
  const normalized = normalizeShowcaseSliderConfig(next);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        SHOWCASE_SLIDER_CONFIG_STORAGE_KEY,
        JSON.stringify(normalized)
      );
    } catch {
      // Ignore storage quota errors
    }
    try {
      window.dispatchEvent(
        new CustomEvent<ShowcaseSliderConfig>(SHOWCASE_SLIDER_CONFIG_EVENT, {
          detail: normalized,
        })
      );
    } catch {
      // Ignore CustomEvent issues
    }
  }
  listeners.forEach((cb) => {
    try {
      cb(normalized);
    } catch {
      // Ignore listener errors
    }
  });
  return normalized;
}

export function subscribeShowcaseSliderConfig(
  listener: (cfg: ShowcaseSliderConfig) => void
): () => void {
  listeners.add(listener);
  if (typeof window === 'undefined') {
    return () => {
      listeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === SHOWCASE_SLIDER_CONFIG_STORAGE_KEY) {
      listener(loadShowcaseSliderConfig());
    }
  };

  const handleCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<ShowcaseSliderConfig>;
    listener(normalizeShowcaseSliderConfig(customEvent.detail));
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(SHOWCASE_SLIDER_CONFIG_EVENT, handleCustomEvent);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(SHOWCASE_SLIDER_CONFIG_EVENT, handleCustomEvent);
  };
}

export function useShowcaseSliderConfig(): [
  ShowcaseSliderConfig,
  (patch: Partial<ShowcaseSliderConfig>) => void,
  () => void,
] {
  const [config, setConfig] = useState<ShowcaseSliderConfig>(() =>
    loadShowcaseSliderConfig()
  );

  useEffect(() => {
    setConfig(loadShowcaseSliderConfig());
    return subscribeShowcaseSliderConfig((next) => {
      setConfig(next);
    });
  }, []);

  const updateConfig = useCallback((patch: Partial<ShowcaseSliderConfig>) => {
    setConfig((prev) => {
      const merged = saveShowcaseSliderConfig({ ...prev, ...patch });
      return merged;
    });
  }, []);

  const resetConfig = useCallback(() => {
    setConfig((prev) =>
      saveShowcaseSliderConfig({
        ...DEFAULT_SHOWCASE_SLIDER_CONFIG,
        titleLogos: prev.titleLogos,
      })
    );
  }, []);

  return [config, updateConfig, resetConfig];
}

/**
 * Resizes and encodes an uploaded PNG/WebP/SVG logo file while strictly preserving transparency.
 * Keeps output lightweight so multiple movie logos fit cleanly without bloating storage.
 */
export async function processTransparentLogoUpload(file: File): Promise<string> {
  const mime = (file.type || '').toLowerCase();
  const isSvg = mime.includes('svg') || file.name.toLowerCase().endsWith('.svg');

  if (isSvg) {
    const rawSvg = await file.text();
    const cleanSvg = sanitizeSvgContent(rawSvg);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}`;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذر قراءة ملف الصورة المختار.'));
      el.src = objectUrl;
    });

    const maxW = 680;
    const maxH = 260;
    const srcW = img.naturalWidth || 320;
    const srcH = img.naturalHeight || 120;
    const scale = Math.min(maxW / srcW, maxH / srcH, 1);
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    // If file is already compact PNG/WebP and doesn't need downscaling, read directly
    if (scale >= 0.99 && file.size <= 160 * 1024 && (mime === 'image/png' || mime === 'image/webp')) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('تعذر قراءة بيانات ملف PNG.'));
        reader.readAsDataURL(file);
      });
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('متصفحك لا يدعم معالجة الصور.');
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Prefer transparent WebP if smaller & supported, otherwise PNG (always lossless alpha)
    const pngData = canvas.toDataURL('image/png');
    const webpData = canvas.toDataURL('image/webp', 0.9);
    if (webpData.startsWith('data:image/webp') && webpData.length < pngData.length) {
      return webpData;
    }
    return pngData;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
