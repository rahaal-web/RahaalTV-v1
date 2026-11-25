import { useCallback, useEffect, useState } from 'react';
import { shouldSkipBackendApiCalls } from './clientScraper';
import { sanitizeSvgContent } from './imageCompressor';

export type StreamV4ColorMode = 'site_theme' | 'custom';

export interface StreamV4SliderConfig {
  /** Per-media transparent PNG logo URLs (shown ONLY inside the slider), keyed by MediaItem.id */
  titleLogos: Record<string, string>;
  /** Global default display duration in seconds (2..60) for ALL movies in the 4th slider */
  defaultSlideDurationSec: number;
  /** Per-media custom display duration in seconds (2..60) for the 4th slider only */
  slideDurations: Record<string, number>;
  usePngLogoInHero: boolean;
  usePngLogoInStrip: boolean;
  showTitle: boolean;
  showMetadata: boolean;
  showStory: boolean;
  storyLines: 1 | 2 | 3 | 4;
  showCast: boolean;
  showWatchBtn: boolean;
  watchBtnText: string;
  showWatchlistBtn: boolean;
  showTagline: boolean;
  showBottomStrip: boolean;
  showProgressBar: boolean;
  progressBarHeightPx: number;
  showNavArrows: boolean;
  enableShineEffect: boolean;
  colorMode: StreamV4ColorMode;
  customAccentColor: string;
  scrimIntensityPct: number;
  bottomBlendHeightPx: number;
  bottomBlurPx: number;
  bottomOverlapPx: number;
  articleVerticalAlign: 'top' | 'center' | 'bottom';
  articleHorizontalAlign: 'right' | 'center' | 'left';
  articleBottomOffsetPx: number;
  articleTopOffsetPx: number;
  articleSideOffsetPx: number;
  articleMaxWidthPx: number;
  dotsBottomOffsetPx: number;
  sliderHeightDesktopPx: number;
  logoMaxHeightPx: number;
  logoMaxWidthPx: number;
  titleSizePx: number;
  metaSizePx: number;
  storySizePx: number;
  castSizePx: number;
  stripLogoHeightPx: number;
  stripTextSizePx: number;
  maxStripItems: number;
}

export const STREAM_V4_SLIDER_CONFIG_STORAGE_KEY = 'rahaltv_stream_v4_slider_config_v1';
const STREAM_V4_SLIDER_CONFIG_EVENT = 'rahaltv:stream-v4-slider-config-change';

export const DEFAULT_STREAM_V4_SLIDER_CONFIG: StreamV4SliderConfig = {
  titleLogos: {},
  defaultSlideDurationSec: 6,
  slideDurations: {},
  usePngLogoInHero: true,
  usePngLogoInStrip: true,
  showTitle: true,
  showMetadata: true,
  showStory: true,
  storyLines: 2,
  showCast: true,
  showWatchBtn: true,
  watchBtnText: 'شاهد وحمل الان',
  showWatchlistBtn: true,
  showTagline: true,
  showBottomStrip: true,
  showProgressBar: true,
  progressBarHeightPx: 3,
  showNavArrows: false,
  enableShineEffect: true,
  colorMode: 'site_theme',
  customAccentColor: '#E50914',
  scrimIntensityPct: 92,
  bottomBlendHeightPx: 175,
  bottomBlurPx: 10,
  bottomOverlapPx: 26,
  articleVerticalAlign: 'bottom',
  articleHorizontalAlign: 'right',
  articleBottomOffsetPx: 134,
  articleTopOffsetPx: 84,
  articleSideOffsetPx: 40,
  articleMaxWidthPx: 500,
  dotsBottomOffsetPx: 28,
  sliderHeightDesktopPx: 680,
  logoMaxHeightPx: 130,
  logoMaxWidthPx: 360,
  titleSizePx: 44,
  metaSizePx: 13,
  storySizePx: 14,
  castSizePx: 13,
  stripLogoHeightPx: 44,
  stripTextSizePx: 15,
  maxStripItems: 8,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function normalizeHexColor(value: unknown, fallback: string): string {
  const raw = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
}

export function normalizeStreamV4SliderConfig(
  raw: Partial<StreamV4SliderConfig> | null | undefined
): StreamV4SliderConfig {
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

  const rawDurations =
    src.slideDurations && typeof src.slideDurations === 'object' ? src.slideDurations : {};
  const slideDurations: Record<string, number> = {};
  for (const [id, sec] of Object.entries(rawDurations)) {
    const cleanId = String(id || '').trim();
    const num = Number(sec);
    if (cleanId && Number.isFinite(num) && num >= 2) {
      slideDurations[cleanId] = Math.min(60, Math.max(2, Math.round(num)));
    }
  }

  return {
    titleLogos,
    defaultSlideDurationSec: clampInt(
      src.defaultSlideDurationSec,
      2,
      60,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.defaultSlideDurationSec
    ),
    slideDurations,
    usePngLogoInHero:
      typeof src.usePngLogoInHero === 'boolean'
        ? src.usePngLogoInHero
        : DEFAULT_STREAM_V4_SLIDER_CONFIG.usePngLogoInHero,
    usePngLogoInStrip:
      typeof src.usePngLogoInStrip === 'boolean'
        ? src.usePngLogoInStrip
        : DEFAULT_STREAM_V4_SLIDER_CONFIG.usePngLogoInStrip,
    showTitle:
      typeof src.showTitle === 'boolean'
        ? src.showTitle
        : DEFAULT_STREAM_V4_SLIDER_CONFIG.showTitle,
    showMetadata:
      typeof src.showMetadata === 'boolean'
        ? src.showMetadata
        : DEFAULT_STREAM_V4_SLIDER_CONFIG.showMetadata,
    showStory:
      typeof src.showStory === 'boolean'
        ? src.showStory
        : DEFAULT_STREAM_V4_SLIDER_CONFIG.showStory,
    storyLines: clampInt(
      src.storyLines,
      1,
      4,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.storyLines
    ) as 1 | 2 | 3 | 4,
    showCast:
      typeof src.showCast === 'boolean'
        ? src.showCast
        : DEFAULT_STREAM_V4_SLIDER_CONFIG.showCast,
    showWatchBtn:
      typeof src.showWatchBtn === 'boolean'
        ? src.showWatchBtn
        : DEFAULT_STREAM_V4_SLIDER_CONFIG.showWatchBtn,
    watchBtnText:
      typeof src.watchBtnText === 'string' && src.watchBtnText.trim()
        ? src.watchBtnText.trim().slice(0, 40)
        : DEFAULT_STREAM_V4_SLIDER_CONFIG.watchBtnText,
    showWatchlistBtn:
      typeof src.showWatchlistBtn === 'boolean'
        ? src.showWatchlistBtn
        : DEFAULT_STREAM_V4_SLIDER_CONFIG.showWatchlistBtn,
    showTagline:
      typeof src.showTagline === 'boolean'
        ? src.showTagline
        : DEFAULT_STREAM_V4_SLIDER_CONFIG.showTagline,
    showBottomStrip:
      typeof src.showBottomStrip === 'boolean'
        ? src.showBottomStrip
        : DEFAULT_STREAM_V4_SLIDER_CONFIG.showBottomStrip,
    showProgressBar:
      typeof src.showProgressBar === 'boolean'
        ? src.showProgressBar
        : DEFAULT_STREAM_V4_SLIDER_CONFIG.showProgressBar,
    progressBarHeightPx: clampInt(
      src.progressBarHeightPx,
      2,
      8,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.progressBarHeightPx
    ),
    showNavArrows:
      typeof src.showNavArrows === 'boolean'
        ? src.showNavArrows
        : DEFAULT_STREAM_V4_SLIDER_CONFIG.showNavArrows,
    enableShineEffect:
      typeof src.enableShineEffect === 'boolean'
        ? src.enableShineEffect
        : DEFAULT_STREAM_V4_SLIDER_CONFIG.enableShineEffect,
    colorMode: src.colorMode === 'custom' ? 'custom' : 'site_theme',
    customAccentColor: normalizeHexColor(
      src.customAccentColor,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.customAccentColor
    ),
    scrimIntensityPct: clampInt(
      src.scrimIntensityPct,
      35,
      100,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.scrimIntensityPct
    ),
    bottomBlendHeightPx: clampInt(
      src.bottomBlendHeightPx,
      60,
      280,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.bottomBlendHeightPx
    ),
    bottomBlurPx: clampInt(
      src.bottomBlurPx,
      0,
      22,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.bottomBlurPx
    ),
    bottomOverlapPx: clampInt(
      src.bottomOverlapPx,
      0,
      96,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.bottomOverlapPx
    ),
    articleVerticalAlign:
      src.articleVerticalAlign === 'top' || src.articleVerticalAlign === 'center'
        ? src.articleVerticalAlign
        : 'bottom',
    articleHorizontalAlign:
      src.articleHorizontalAlign === 'center' || src.articleHorizontalAlign === 'left'
        ? src.articleHorizontalAlign
        : 'right',
    articleBottomOffsetPx: clampInt(
      src.articleBottomOffsetPx,
      64,
      320,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.articleBottomOffsetPx
    ),
    articleTopOffsetPx: clampInt(
      src.articleTopOffsetPx,
      64,
      260,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.articleTopOffsetPx
    ),
    articleSideOffsetPx: clampInt(
      src.articleSideOffsetPx,
      12,
      220,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.articleSideOffsetPx
    ),
    articleMaxWidthPx: clampInt(
      src.articleMaxWidthPx,
      320,
      720,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.articleMaxWidthPx
    ),
    dotsBottomOffsetPx: clampInt(
      src.dotsBottomOffsetPx,
      16,
      100,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.dotsBottomOffsetPx
    ),
    sliderHeightDesktopPx: clampInt(
      src.sliderHeightDesktopPx,
      480,
      860,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.sliderHeightDesktopPx
    ),
    logoMaxHeightPx: clampInt(
      src.logoMaxHeightPx,
      48,
      240,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.logoMaxHeightPx
    ),
    logoMaxWidthPx: clampInt(
      src.logoMaxWidthPx,
      160,
      540,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.logoMaxWidthPx
    ),
    titleSizePx: clampInt(
      src.titleSizePx,
      22,
      72,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.titleSizePx
    ),
    metaSizePx: clampInt(
      src.metaSizePx,
      10,
      18,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.metaSizePx
    ),
    storySizePx: clampInt(
      src.storySizePx,
      11,
      20,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.storySizePx
    ),
    castSizePx: clampInt(
      src.castSizePx,
      10,
      18,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.castSizePx
    ),
    stripLogoHeightPx: clampInt(
      src.stripLogoHeightPx,
      22,
      72,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.stripLogoHeightPx
    ),
    stripTextSizePx: clampInt(
      src.stripTextSizePx,
      11,
      24,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.stripTextSizePx
    ),
    maxStripItems: clampInt(
      src.maxStripItems,
      3,
      10,
      DEFAULT_STREAM_V4_SLIDER_CONFIG.maxStripItems
    ),
  };
}

const listeners = new Set<(cfg: StreamV4SliderConfig) => void>();

export function loadStreamV4SliderConfig(): StreamV4SliderConfig {
  if (typeof window === 'undefined') return DEFAULT_STREAM_V4_SLIDER_CONFIG;
  try {
    const raw = window.localStorage.getItem(STREAM_V4_SLIDER_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_STREAM_V4_SLIDER_CONFIG;
    return normalizeStreamV4SliderConfig(JSON.parse(raw) as Partial<StreamV4SliderConfig>);
  } catch {
    return DEFAULT_STREAM_V4_SLIDER_CONFIG;
  }
}

export function saveStreamV4SliderConfig(
  next: Partial<StreamV4SliderConfig>
): StreamV4SliderConfig {
  const normalized = normalizeStreamV4SliderConfig(next);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        STREAM_V4_SLIDER_CONFIG_STORAGE_KEY,
        JSON.stringify(normalized)
      );
    } catch {
      // Ignore storage quota errors
    }
    try {
      window.dispatchEvent(
        new CustomEvent<StreamV4SliderConfig>(STREAM_V4_SLIDER_CONFIG_EVENT, {
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

export function getStreamV4MoviePngLogo(mediaId: string): string {
  const cleanId = String(mediaId || '').trim();
  if (!cleanId) return '';
  return loadStreamV4SliderConfig().titleLogos[cleanId] || '';
}

export function setStreamV4MoviePngLogo(mediaId: string, url: string): StreamV4SliderConfig {
  const cleanId = String(mediaId || '').trim();
  const current = loadStreamV4SliderConfig();
  if (!cleanId) return current;
  const nextLogos = { ...current.titleLogos };
  const cleanUrl = String(url || '').trim();
  if (cleanUrl) {
    nextLogos[cleanId] = cleanUrl;
  } else {
    delete nextLogos[cleanId];
  }
  return saveStreamV4SliderConfig({ ...current, titleLogos: nextLogos });
}

export function getStreamV4MovieDuration(mediaId: string): number | undefined {
  const cleanId = String(mediaId || '').trim();
  if (!cleanId) return undefined;
  return loadStreamV4SliderConfig().slideDurations[cleanId];
}

export function setStreamV4MovieDuration(
  mediaId: string,
  durationSec?: number | null
): StreamV4SliderConfig {
  const cleanId = String(mediaId || '').trim();
  const current = loadStreamV4SliderConfig();
  if (!cleanId) return current;
  const nextDurations = { ...current.slideDurations };
  const num = Number(durationSec);
  if (durationSec != null && Number.isFinite(num) && num >= 2) {
    nextDurations[cleanId] = Math.min(60, Math.max(2, Math.round(num)));
  } else {
    delete nextDurations[cleanId];
  }
  return saveStreamV4SliderConfig({ ...current, slideDurations: nextDurations });
}

export function subscribeStreamV4SliderConfig(
  listener: (cfg: StreamV4SliderConfig) => void
): () => void {
  listeners.add(listener);
  if (typeof window === 'undefined') {
    return () => {
      listeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STREAM_V4_SLIDER_CONFIG_STORAGE_KEY) {
      listener(loadStreamV4SliderConfig());
    }
  };

  const handleCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<StreamV4SliderConfig>;
    listener(normalizeStreamV4SliderConfig(customEvent.detail));
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(STREAM_V4_SLIDER_CONFIG_EVENT, handleCustomEvent);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(STREAM_V4_SLIDER_CONFIG_EVENT, handleCustomEvent);
  };
}

export function useStreamV4SliderConfig(): [
  StreamV4SliderConfig,
  (patch: Partial<StreamV4SliderConfig>) => void,
  () => void,
] {
  const [config, setConfig] = useState<StreamV4SliderConfig>(() =>
    loadStreamV4SliderConfig()
  );

  useEffect(() => {
    setConfig(loadStreamV4SliderConfig());
    return subscribeStreamV4SliderConfig((next) => {
      setConfig(next);
    });
  }, []);

  const updateConfig = useCallback((patch: Partial<StreamV4SliderConfig>) => {
    setConfig((prev) => saveStreamV4SliderConfig({ ...prev, ...patch }));
  }, []);

  const resetConfig = useCallback(() => {
    setConfig((prev) =>
      saveStreamV4SliderConfig({
        ...DEFAULT_STREAM_V4_SLIDER_CONFIG,
        titleLogos: prev.titleLogos,
        slideDurations: prev.slideDurations,
      })
    );
  }, []);

  return [config, updateConfig, resetConfig];
}

const MAX_COMPACT_LOGO_DATA_URL_CHARS = 210000;
const FIRESTORE_LOGO_URL_LIMIT_CHARS = 250000;

async function encodeTransparentLogoDataUrl(file: File): Promise<string> {
  const mime = (file.type || '').toLowerCase();
  const isSvg = mime.includes('svg') || file.name.toLowerCase().endsWith('.svg');

  if (isSvg) {
    const rawSvg = await file.text();
    const cleanSvg = sanitizeSvgContent(rawSvg);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}`;
  }

  if (
    file.size <= 145 * 1024 &&
    (mime === 'image/png' || mime === 'image/webp')
  ) {
    const directDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('تعذر قراءة بيانات ملف PNG.'));
      reader.readAsDataURL(file);
    });
    if (directDataUrl.length <= MAX_COMPACT_LOGO_DATA_URL_CHARS) {
      return directDataUrl;
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذر قراءة ملف الصورة المختار.'));
      el.src = objectUrl;
    });

    const srcW = img.naturalWidth || 360;
    const srcH = img.naturalHeight || 140;
    const dimensionCandidates: Array<[number, number]> = [
      [720, 280],
      [560, 220],
      [440, 172],
      [340, 134],
      [260, 104],
    ];

    let smallestCandidate = '';
    for (const [maxW, maxH] of dimensionCandidates) {
      const scale = Math.min(maxW / srcW, maxH / srcH, 1);
      const targetW = Math.max(1, Math.round(srcW * scale));
      const targetH = Math.max(1, Math.round(srcH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('متصفحك لا يدعم معالجة الصور.');
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const pngData = canvas.toDataURL('image/png');
      if (!smallestCandidate || pngData.length < smallestCandidate.length) {
        smallestCandidate = pngData;
      }
      if (pngData.length <= MAX_COMPACT_LOGO_DATA_URL_CHARS) {
        return pngData;
      }

      for (const quality of [0.9, 0.8, 0.7]) {
        const webpData = canvas.toDataURL('image/webp', quality);
        if (webpData.startsWith('data:image/webp')) {
          if (webpData.length < smallestCandidate.length) {
            smallestCandidate = webpData;
          }
          if (webpData.length <= MAX_COMPACT_LOGO_DATA_URL_CHARS) {
            return webpData;
          }
        }
      }
    }

    return smallestCandidate;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Processes an uploaded transparent PNG/WebP/SVG title logo for the 4th Slider.
 * Compact logos (<= 210KB data URL) are stored self-contained directly in Firestore
 * so PC, mobile, and hosted deployments all render them without depending on ephemeral
 * local server uploads; larger images fall back to `/api/images/upload` when reachable.
 */
export async function uploadTransparentSliderPng(
  file: File,
  idToken?: string
): Promise<{ url: string; storage: 'server' | 'local' }> {
  const dataUrl = await encodeTransparentLogoDataUrl(file);

  if (dataUrl.length <= MAX_COMPACT_LOGO_DATA_URL_CHARS) {
    return { url: dataUrl, storage: 'local' };
  }

  if (
    idToken &&
    !shouldSkipBackendApiCalls() &&
    dataUrl.startsWith('data:image/') &&
    !dataUrl.startsWith('data:image/svg+xml;charset=')
  ) {
    try {
      const res = await fetch('/api/images/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          slot: 'logo',
          dataUrl,
        }),
      });
      if (res.ok) {
        const payload = (await res.json()) as { ok?: boolean; url?: string };
        if (payload.ok && payload.url) {
          return { url: payload.url, storage: 'server' };
        }
      }
    } catch {
      // Graceful fallback check below
    }
  }

  if (dataUrl.length > FIRESTORE_LOGO_URL_LIMIT_CHARS) {
    throw new Error(
      'حجم شعار PNG كبير جداً للمزامنة السحابية عبر الأجهزة — استخدم صورة أقل حجماً أو رابطاً مباشراً.'
    );
  }

  return { url: dataUrl, storage: 'local' };
}

export function sanitizeStreamV4SliderConfigForFirestore(
  raw: Partial<StreamV4SliderConfig> | null | undefined
): StreamV4SliderConfig {
  const normalized = normalizeStreamV4SliderConfig(raw);
  const titleLogos: Record<string, string> = {};
  let totalChars = 0;
  for (const [id, url] of Object.entries(normalized.titleLogos)) {
    if (Object.keys(titleLogos).length >= 60) break;
    const cleanId = id.trim().slice(0, 128);
    const cleanUrl = url.trim();
    if (!cleanId || !cleanUrl || cleanUrl.length > FIRESTORE_LOGO_URL_LIMIT_CHARS) continue;
    if (totalChars + cleanUrl.length > 750000) break;
    titleLogos[cleanId] = cleanUrl;
    totalChars += cleanUrl.length;
  }

  const slideDurations: Record<string, number> = {};
  for (const [id, sec] of Object.entries(normalized.slideDurations)) {
    if (Object.keys(slideDurations).length >= 60) break;
    const cleanId = id.trim().slice(0, 128);
    const num = Math.min(60, Math.max(2, Math.round(Number(sec) || 6)));
    if (cleanId) {
      slideDurations[cleanId] = num;
    }
  }

  return {
    ...normalized,
    titleLogos,
    slideDurations,
  };
}

export function countDroppedStreamV4Logos(
  raw: Partial<StreamV4SliderConfig> | null | undefined
): number {
  const normalized = normalizeStreamV4SliderConfig(raw);
  const sanitized = sanitizeStreamV4SliderConfigForFirestore(normalized);
  return Math.max(
    0,
    Object.keys(normalized.titleLogos).length - Object.keys(sanitized.titleLogos).length
  );
}


