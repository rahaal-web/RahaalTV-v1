import type { CSSProperties } from 'react';
import {
  normalizeWebsiteBranding,
  resolveBrandingAssetUrl,
  resolveWebsiteBrandingFontStack,
} from '../lib/websiteBranding';
import type { WebsiteBrandingConfig } from '../types/media';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  branding?: WebsiteBrandingConfig;
  fallbackSiteName?: string;
}

export function Logo({
  size = 'md',
  showSubtitle = false,
  branding,
  fallbackSiteName = 'RahaL TV',
}: LogoProps) {
  const cfg = normalizeWebsiteBranding(branding, fallbackSiteName);
  if (cfg.logoMode === 'hidden') {
    return null;
  }

  const scale = size === 'lg' ? 1.15 : size === 'sm' ? 0.82 : 1;
  const logoSrc = resolveBrandingAssetUrl(cfg.logoUrl);
  const showImage = cfg.logoMode === 'image_and_text' || cfg.logoMode === 'image_only';
  const showText = cfg.logoMode === 'image_and_text' || cfg.logoMode === 'text_only';

  const scaledWidth = Math.max(20, Math.round(cfg.logoWidthPx * scale));
  const scaledHeight = Math.max(20, Math.round(cfg.logoHeightPx * scale));
  const scaledFontSize = Math.max(13, Math.round(cfg.siteNameSizePx * scale));

  const layoutClass =
    cfg.logoPlacement === 'above_text'
      ? 'flex-col items-center text-center'
      : cfg.logoPlacement === 'after_text'
        ? 'flex-row-reverse items-center'
        : 'flex-row items-center';

  const textStyle: CSSProperties = {
    color: cfg.siteNameColor,
    fontFamily: resolveWebsiteBrandingFontStack(cfg.siteNameFont),
    fontSize: `${scaledFontSize}px`,
    fontWeight: cfg.siteNameWeight,
    letterSpacing: `${cfg.siteNameLetterSpacingPx}px`,
    lineHeight: 1.15,
  };

  const isDefaultBrandSplit =
    cfg.siteName === 'RahaL TV' && cfg.siteNameColor.toLowerCase() === '#ffffff';

  return (
    <div
      className={`inline-flex ${layoutClass} max-w-full min-w-0 select-none whitespace-nowrap shrink-0`}
      style={{ gap: `${Math.round(cfg.logoTextGapPx)}px` }}
    >
      {showImage && (
        <img
          src={logoSrc || '/brand-logo.png'}
          alt={cfg.siteName || 'Logo'}
          loading="eager"
          decoding="async"
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}
          className={`pointer-events-none select-none object-contain shrink-0 ${
            logoSrc ? 'rounded-lg' : 'drop-shadow-[0_2px_10px_rgba(229,9,20,0.3)]'
          }`}
        />
      )}

      {showText && (
        <div
          className={`flex flex-col leading-none justify-center min-w-0 max-w-full ${
            cfg.logoPlacement === 'above_text' ? 'items-center' : ''
          }`}
          dir="auto"
        >
          <span style={textStyle} className="truncate">
            {isDefaultBrandSplit ? (
              <>
                RahaL <span className="text-[#E50914]">TV</span>
              </>
            ) : (
              cfg.siteName
            )}
          </span>
          {showSubtitle && (
            <span
              className="text-[10px] font-semibold tracking-wide text-[#a3a3a3] mt-1"
              dir="rtl"
            >
              سينما بلا حدود
            </span>
          )}
        </div>
      )}
    </div>
  );
}
