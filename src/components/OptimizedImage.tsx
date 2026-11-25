import {
  CSSProperties,
  SyntheticEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Film, ImageOff, Tv, User as UserIcon } from 'lucide-react';
import type { ImagePlaceholderConfig, ImageSlotType } from '../types/media';
import { useLazyImageInView } from '../hooks/useLazyImageInView';
import { reportClientError } from '../lib/clientLogger';
import {
  buildSlotSrcSet,
  clearFailedImageUrl,
  getSlotSizesAttr,
  isImageUrlFailed,
  markImageUrlFailed,
  markImageUrlLoaded,
  resolveImageForSlot,
} from '../lib/imageOptimizer';
import {
  buildPlaceholderSurfaceBackground,
  getPlaceholderConfig,
  resolveEffectivePlaceholderForSlot,
  subscribePlaceholderConfig,
} from '../lib/placeholderConfig';

export interface OptimizedImageProps {
  src?: string | null;
  fallbackSrc?: string | null;
  alt: string;
  slot?: ImageSlotType;
  priority?: boolean;
  loading?: 'lazy' | 'eager';
  className?: string;
  imgClassName?: string;
  style?: CSSProperties;
  width?: number;
  height?: number;
  sizes?: string;
  useSrcSet?: boolean;
  draggable?: boolean;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  ariaHidden?: boolean;
  disablePlaceholder?: boolean;
  /** Used strictly by the Admin Placeholder Preview cards to inspect loading/error/loaded states */
  forcePreviewState?: 'loading' | 'loaded' | 'error';
  /** Optional explicit config override used by admin draft previews */
  configOverride?: ImagePlaceholderConfig;
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void;
}

const MAX_TRANSIENT_RETRIES = 1;
const RETRY_DELAY_MS = 350;
const DECODE_SAFETY_TIMEOUT_MS = 140;
const REMOTE_LOAD_TIMEOUT_MS = 12_000;
const LOCAL_LOAD_TIMEOUT_MS = 4_500;

function isRemoteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function computeInitialTargetState(
  primaryUrl: string,
  secondaryFallbackUrl: string,
  forcePreviewState?: 'loading' | 'loaded' | 'error'
): { loadState: 'loading' | 'loaded' | 'error'; usedFallbackSrc: boolean } {
  if (forcePreviewState) {
    return { loadState: forcePreviewState, usedFallbackSrc: false };
  }
  if (!primaryUrl || isImageUrlFailed(primaryUrl)) {
    if (secondaryFallbackUrl && secondaryFallbackUrl !== primaryUrl && !isImageUrlFailed(secondaryFallbackUrl)) {
      return { loadState: 'loading', usedFallbackSrc: true };
    }
    return { loadState: 'error', usedFallbackSrc: false };
  }
  return { loadState: 'loading', usedFallbackSrc: false };
}

export function OptimizedImage({
  src,
  fallbackSrc,
  alt,
  slot = 'card_grid',
  priority = false,
  loading,
  className = '',
  imgClassName = '',
  style,
  width,
  height,
  sizes,
  useSrcSet = true,
  draggable,
  referrerPolicy = 'no-referrer',
  ariaHidden,
  disablePlaceholder = false,
  forcePreviewState,
  configOverride,
  onLoad,
  onError,
}: OptimizedImageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const mountedRef = useRef(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRenderKeyRef = useRef<string | null>(null);

  const [configVersion, setConfigVersion] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (configOverride) return undefined;
    return subscribePlaceholderConfig(() => {
      setConfigVersion((v) => v + 1);
    });
  }, [configOverride]);

  const placeholderConfig = useMemo(() => {
    if (configOverride) return configOverride;
    void configVersion;
    return getPlaceholderConfig();
  }, [configOverride, configVersion]);

  const appearance = useMemo(
    () => resolveEffectivePlaceholderForSlot(placeholderConfig, slot),
    [placeholderConfig, slot]
  );

  const primaryUrl = useMemo(() => resolveImageForSlot(src, slot), [src, slot]);
  const secondaryFallbackUrl = useMemo(
    () => (fallbackSrc ? resolveImageForSlot(fallbackSrc, slot) : ''),
    [fallbackSrc, slot]
  );

  const initialTarget = computeInitialTargetState(
    primaryUrl,
    secondaryFallbackUrl,
    forcePreviewState
  );

  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>(
    initialTarget.loadState
  );
  const [usedFallbackSrc, setUsedFallbackSrc] = useState<boolean>(
    initialTarget.usedFallbackSrc
  );
  const [retryAttempt, setRetryAttempt] = useState<number>(0);
  const [errorFallbackFailed, setErrorFallbackFailed] = useState<boolean>(false);

  const prevInputsRef = useRef({
    primaryUrl,
    secondaryFallbackUrl,
    forcePreviewState,
  });

  useEffect(() => {
    const prev = prevInputsRef.current;
    if (
      prev.primaryUrl === primaryUrl &&
      prev.secondaryFallbackUrl === secondaryFallbackUrl &&
      prev.forcePreviewState === forcePreviewState
    ) {
      return;
    }
    prevInputsRef.current = { primaryUrl, secondaryFallbackUrl, forcePreviewState };

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    completedRenderKeyRef.current = null;
    setRetryAttempt(0);
    setErrorFallbackFailed(false);

    const next = computeInitialTargetState(primaryUrl, secondaryFallbackUrl, forcePreviewState);
    setUsedFallbackSrc(next.usedFallbackSrc);
    setLoadState(next.loadState);
  }, [primaryUrl, secondaryFallbackUrl, forcePreviewState]);

  const effectiveState = forcePreviewState || loadState;

  const activeUrl = useMemo(() => {
    if (effectiveState === 'error') {
      return appearance.errorFallbackImageUrl || '';
    }
    if (usedFallbackSrc && secondaryFallbackUrl) {
      return secondaryFallbackUrl;
    }
    return primaryUrl;
  }, [
    effectiveState,
    usedFallbackSrc,
    secondaryFallbackUrl,
    primaryUrl,
    appearance.errorFallbackImageUrl,
  ]);

  const eagerLoad = Boolean(
    priority || loading === 'eager' || forcePreviewState === 'loaded'
  );
  const shouldObserve =
    forcePreviewState !== 'loading' && forcePreviewState !== 'error';

  const inView = useLazyImageInView(containerRef, {
    eager: eagerLoad,
    enabled: shouldObserve,
    verticalMarginPx: 320,
    horizontalMarginPx: 340,
  });

  const shouldLoadImage =
    shouldObserve &&
    effectiveState !== 'error' &&
    Boolean(activeUrl) &&
    (eagerLoad || inView);

  // Bypass srcSet on retryAttempt > 0 so a flaky srcSet candidate doesn't block loading the default URL
  const activeSrcSet = useMemo(() => {
    if (!useSrcSet || retryAttempt > 0 || effectiveState === 'error' || !activeUrl) {
      return undefined;
    }
    return buildSlotSrcSet(activeUrl, slot);
  }, [useSrcSet, retryAttempt, effectiveState, activeUrl, slot]);

  const resolvedSizes = sizes || getSlotSizesAttr(slot);
  const imgRenderKey = `${activeUrl}::${retryAttempt}`;

  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const markLoaded = useCallback(
    (url: string, renderKey: string, event?: SyntheticEvent<HTMLImageElement>) => {
      if (!mountedRef.current || forcePreviewState) return;
      if (completedRenderKeyRef.current === renderKey) {
        setLoadState('loaded');
        return;
      }
      completedRenderKeyRef.current = renderKey;
      clearFailedImageUrl(url);
      markImageUrlLoaded(url);
      setLoadState('loaded');
      if (event) {
        onLoadRef.current?.(event);
      }
    },
    [forcePreviewState]
  );

  const handleLoadFailure = useCallback(
    (event?: SyntheticEvent<HTMLImageElement>) => {
      if (!mountedRef.current || forcePreviewState) return;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      const failingUrl = usedFallbackSrc ? secondaryFallbackUrl : primaryUrl;

      // One bounded transient retry for remote HTTP(S) images before marking as failed
      if (
        retryAttempt < MAX_TRANSIENT_RETRIES &&
        failingUrl &&
        isRemoteHttpUrl(failingUrl)
      ) {
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          if (!mountedRef.current) return;
          setRetryAttempt((prev) => prev + 1);
          setLoadState('loading');
        }, RETRY_DELAY_MS);
        return;
      }

      if (failingUrl) {
        markImageUrlFailed(failingUrl);
      }

      if (
        !usedFallbackSrc &&
        secondaryFallbackUrl &&
        secondaryFallbackUrl !== primaryUrl &&
        !isImageUrlFailed(secondaryFallbackUrl)
      ) {
        console.warn('[OptimizedImage] Primary image failed; switching to fallback', {
          slot,
          url: primaryUrl,
        });
        completedRenderKeyRef.current = null;
        setRetryAttempt(0);
        setUsedFallbackSrc(true);
        setLoadState('loading');
        return;
      }

      console.warn('[OptimizedImage] Image failed permanently after retry/fallback', {
        slot,
        url: failingUrl || src || '',
      });
      reportClientError({
        source: 'OptimizedImage',
        level: 'warn',
        message: `Failed to load image for slot "${slot}"`,
        context: {
          slot,
          url: failingUrl || String(src || ''),
        },
      });

      setLoadState('error');
      if (event) {
        onErrorRef.current?.(event);
      }
    },
    [
      forcePreviewState,
      primaryUrl,
      retryAttempt,
      secondaryFallbackUrl,
      slot,
      src,
      usedFallbackSrc,
    ]
  );

  const handleLoadFailureRef = useRef(handleLoadFailure);
  handleLoadFailureRef.current = handleLoadFailure;

  // Detect images already satisfied from browser cache synchronously after commit
  useLayoutEffect(() => {
    if (forcePreviewState) return;
    if (!shouldLoadImage || !activeUrl || effectiveState !== 'loading') return;

    const img = imgRef.current;
    if (!img) return;

    if (img.complete) {
      if (img.naturalWidth > 0) {
        markLoaded(activeUrl, imgRenderKey);
      } else {
        const rafId = requestAnimationFrame(() => {
          if (!mountedRef.current) return;
          if (imgRef.current === img && img.complete && img.naturalWidth === 0) {
            handleLoadFailureRef.current();
          }
        });
        return () => cancelAnimationFrame(rafId);
      }
    }
    return undefined;
  }, [
    activeUrl,
    effectiveState,
    forcePreviewState,
    imgRenderKey,
    markLoaded,
    shouldLoadImage,
  ]);

  // Stall watchdog: ensure a visible image never remains stuck on loading placeholder indefinitely
  useEffect(() => {
    if (forcePreviewState) return undefined;
    if (!shouldLoadImage || effectiveState !== 'loading' || !activeUrl) {
      return undefined;
    }

    const timeoutMs = isRemoteHttpUrl(activeUrl)
      ? REMOTE_LOAD_TIMEOUT_MS
      : LOCAL_LOAD_TIMEOUT_MS;

    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      const img = imgRef.current;
      if (img && img.complete && img.naturalWidth > 0) {
        markLoaded(activeUrl, imgRenderKey);
        return;
      }
      handleLoadFailureRef.current();
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [activeUrl, effectiveState, forcePreviewState, imgRenderKey, markLoaded, shouldLoadImage]);

  const handleImgLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth === 0) {
      handleLoadFailure(e);
      return;
    }
    if (forcePreviewState) {
      onLoad?.(e);
      return;
    }

    const currentRenderKey = imgRenderKey;
    const currentActiveUrl = activeUrl;

    if (typeof img.decode === 'function') {
      let settled = false;
      const finish = () => {
        if (settled || !mountedRef.current) return;
        settled = true;
        if (img.naturalWidth > 0) {
          markLoaded(currentActiveUrl, currentRenderKey, e);
        }
      };
      const safetyTimer = setTimeout(finish, DECODE_SAFETY_TIMEOUT_MS);
      void img
        .decode()
        .catch(() => undefined)
        .finally(() => {
          clearTimeout(safetyTimer);
          finish();
        });
      return;
    }

    markLoaded(currentActiveUrl, currentRenderKey, e);
  };

  const handleImgError = (e: SyntheticEvent<HTMLImageElement>) => {
    if (forcePreviewState) return;
    handleLoadFailure(e);
  };

  const surfaceStyle: CSSProperties = useMemo(
    () =>
      ({
        background: buildPlaceholderSurfaceBackground(appearance),
        '--rtv-shimmer-duration': appearance.shimmerDurationSec,
        ...style,
      }) as CSSProperties,
    [appearance, style]
  );

  const hasValidErrorFallbackImg =
    effectiveState === 'error' &&
    Boolean(appearance.errorFallbackImageUrl) &&
    !errorFallbackFailed;

  const renderSlotIcon = () => {
    if (effectiveState === 'error' && !hasValidErrorFallbackImg) {
      return <ImageOff className="w-6 h-6 text-white/35" />;
    }
    if (!appearance.showFallbackIcon) return null;
    if (slot === 'cast_avatar') return <UserIcon className="w-6 h-6 text-white/30" />;
    if (slot === 'episode_thumb') return <Tv className="w-6 h-6 text-white/30" />;
    return <Film className="w-6 h-6 text-white/30" />;
  };

  const showPlaceholderLayer =
    !disablePlaceholder &&
    (effectiveState === 'loading' || (effectiveState === 'error' && !hasValidErrorFallbackImg));

  return (
    <div
      ref={containerRef}
      data-image-state={effectiveState}
      data-rtv-no-img-menu="true"
      onContextMenu={(e) => e.preventDefault()}
      className={`relative isolate overflow-hidden select-none ${className}`}
      style={disablePlaceholder ? style : surfaceStyle}
    >
      {/* Loading / Error Placeholder Layer */}
      {showPlaceholderLayer && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none ${
            effectiveState === 'loading' && appearance.shimmerEnabled ? 'rtv-placeholder-shimmer' : ''
          }`}
        >
          {/* Optional Custom Loading Placeholder Image */}
          {effectiveState === 'loading' &&
            appearance.mode === 'custom_image' &&
            appearance.customImageUrl && (
              <img
                src={appearance.customImageUrl}
                alt=""
                aria-hidden="true"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                className="pointer-events-none select-none absolute inset-0 h-full w-full object-cover"
              />
            )}

          {/* Dimming scrim over placeholder background/image */}
          {appearance.dimOpacity > 0 && (
            <div
              className="absolute inset-0"
              style={{ backgroundColor: `rgba(0, 0, 0, ${appearance.dimOpacity})` }}
            />
          )}

          {/* Centered Emblem / Watermark / Fallback Icon */}
          <div className="relative z-10 flex flex-col items-center justify-center gap-1.5 px-2 text-center">
            {renderSlotIcon()}
            {appearance.showLogoOverlay && (
              <span
                className="font-display text-[11px] sm:text-xs font-black tracking-wide text-white"
                style={{ opacity: appearance.logoOverlayOpacity }}
              >
                RahaL <span className="text-[#E50914]">TV</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Custom Error Fallback Image (falls back cleanly to icon if broken) */}
      {hasValidErrorFallbackImg ? (
        <img
          src={appearance.errorFallbackImageUrl}
          alt={alt}
          width={width}
          height={height}
          loading="eager"
          decoding="async"
          draggable={draggable ?? false}
          aria-hidden={ariaHidden}
          referrerPolicy={referrerPolicy}
          onContextMenu={(e) => e.preventDefault()}
          onError={() => setErrorFallbackFailed(true)}
          className={`pointer-events-none select-none relative z-10 block h-full w-full transition-opacity ${imgClassName}`}
          style={{ transitionDuration: `${appearance.fadeInDurationMs}ms` }}
        />
      ) : null}

      {/* Actual Image Element (mounted only once priority/eager/IntersectionObserver allows loading) */}
      {shouldLoadImage ? (
        <img
          key={imgRenderKey}
          ref={imgRef}
          src={activeUrl}
          srcSet={activeSrcSet}
          sizes={activeSrcSet ? resolvedSizes : undefined}
          alt={alt}
          width={width}
          height={height}
          loading="eager"
          decoding="async"
          {...(priority ? { fetchPriority: 'high' as const } : {})}
          draggable={draggable ?? false}
          aria-hidden={ariaHidden}
          referrerPolicy={referrerPolicy}
          onContextMenu={(e) => e.preventDefault()}
          onLoad={handleImgLoad}
          onError={handleImgError}
          className={`pointer-events-none select-none relative z-10 block h-full w-full transition-opacity ${
            effectiveState === 'loaded' ? 'opacity-100' : 'opacity-0'
          } ${imgClassName}`}
          style={{ transitionDuration: `${appearance.fadeInDurationMs}ms` }}
        />
      ) : null}
    </div>
  );
}
