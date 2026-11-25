import { useCallback, useEffect, useState } from 'react';

export type DesktopHeroSliderVariant = 'original' | 'cinematic' | 'stream_v4';
export type MobileOnlyHeroSliderVariant =
  | 'mobile_stories'
  | 'mobile_cards'
  | 'mobile_spotlight';
export type HeroSliderVariant =
  | DesktopHeroSliderVariant
  | MobileOnlyHeroSliderVariant;

export interface HeroSliderDeviceVariants {
  desktop: HeroSliderVariant;
  mobile: HeroSliderVariant;
}

export const HERO_SLIDER_VARIANT_STORAGE_KEY = 'rahaltv_hero_slider_variant_v1';
export const HERO_SLIDER_MOBILE_VARIANT_STORAGE_KEY =
  'rahaltv_hero_slider_mobile_variant_v1';
const HERO_SLIDER_VARIANT_EVENT = 'rahaltv:hero-slider-variant-change';

const VALID_VARIANTS = new Set<HeroSliderVariant>([
  'original',
  'cinematic',
  'stream_v4',
  'mobile_stories',
  'mobile_cards',
  'mobile_spotlight',
]);

const listeners = new Set<(variants: HeroSliderDeviceVariants) => void>();

export function normalizeHeroSliderVariant(value: unknown): HeroSliderVariant {
  if (typeof value === 'string' && VALID_VARIANTS.has(value as HeroSliderVariant)) {
    return value as HeroSliderVariant;
  }
  return 'original';
}

export function isMobileDedicatedSliderVariant(
  variant: HeroSliderVariant
): variant is MobileOnlyHeroSliderVariant {
  return (
    variant === 'mobile_stories' ||
    variant === 'mobile_cards' ||
    variant === 'mobile_spotlight'
  );
}

export function loadHeroSliderVariant(): HeroSliderVariant {
  if (typeof window === 'undefined') return 'original';
  try {
    const raw = window.localStorage.getItem(HERO_SLIDER_VARIANT_STORAGE_KEY);
    return normalizeHeroSliderVariant(raw);
  } catch {
    return 'original';
  }
}

export function loadMobileHeroSliderVariant(): HeroSliderVariant {
  if (typeof window === 'undefined') return 'original';
  try {
    const raw = window.localStorage.getItem(HERO_SLIDER_MOBILE_VARIANT_STORAGE_KEY);
    if (raw === null || raw === '') {
      return loadHeroSliderVariant();
    }
    return normalizeHeroSliderVariant(raw);
  } catch {
    return loadHeroSliderVariant();
  }
}

export function loadHeroSliderDeviceVariants(): HeroSliderDeviceVariants {
  return {
    desktop: loadHeroSliderVariant(),
    mobile: loadMobileHeroSliderVariant(),
  };
}

function notifyAllVariantListeners(variants: HeroSliderDeviceVariants) {
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent<HeroSliderDeviceVariants>(HERO_SLIDER_VARIANT_EVENT, {
          detail: variants,
        })
      );
    } catch {
      // Ignore CustomEvent issues on legacy browsers
    }
  }
  listeners.forEach((cb) => {
    try {
      cb(variants);
    } catch {
      // Ignore subscriber errors
    }
  });
}

export function saveHeroSliderDeviceVariants(
  desktop: HeroSliderVariant,
  mobile: HeroSliderVariant
): HeroSliderDeviceVariants {
  const normalized: HeroSliderDeviceVariants = {
    desktop: normalizeHeroSliderVariant(desktop),
    mobile: normalizeHeroSliderVariant(mobile),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        HERO_SLIDER_VARIANT_STORAGE_KEY,
        normalized.desktop
      );
      window.localStorage.setItem(
        HERO_SLIDER_MOBILE_VARIANT_STORAGE_KEY,
        normalized.mobile
      );
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }
  notifyAllVariantListeners(normalized);
  return normalized;
}

export function saveHeroSliderVariant(variant: HeroSliderVariant): HeroSliderVariant {
  const normalized = normalizeHeroSliderVariant(variant);
  const currentMobile = loadMobileHeroSliderVariant();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(HERO_SLIDER_VARIANT_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }
  notifyAllVariantListeners({
    desktop: normalized,
    mobile: currentMobile,
  });
  return normalized;
}

export function saveMobileHeroSliderVariant(
  variant: HeroSliderVariant
): HeroSliderVariant {
  const normalized = normalizeHeroSliderVariant(variant);
  const currentDesktop = loadHeroSliderVariant();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        HERO_SLIDER_MOBILE_VARIANT_STORAGE_KEY,
        normalized
      );
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }
  notifyAllVariantListeners({
    desktop: currentDesktop,
    mobile: normalized,
  });
  return normalized;
}

export function subscribeHeroSliderDeviceVariants(
  listener: (variants: HeroSliderDeviceVariants) => void
): () => void {
  listeners.add(listener);
  if (typeof window === 'undefined') {
    return () => {
      listeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === HERO_SLIDER_VARIANT_STORAGE_KEY ||
      event.key === HERO_SLIDER_MOBILE_VARIANT_STORAGE_KEY
    ) {
      listener(loadHeroSliderDeviceVariants());
    }
  };

  const handleCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<HeroSliderDeviceVariants>;
    if (customEvent.detail && typeof customEvent.detail === 'object') {
      listener({
        desktop: normalizeHeroSliderVariant(customEvent.detail.desktop),
        mobile: normalizeHeroSliderVariant(customEvent.detail.mobile),
      });
    } else {
      listener(loadHeroSliderDeviceVariants());
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(HERO_SLIDER_VARIANT_EVENT, handleCustomEvent);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(HERO_SLIDER_VARIANT_EVENT, handleCustomEvent);
  };
}

export function subscribeHeroSliderVariant(
  listener: (variant: HeroSliderVariant) => void
): () => void {
  return subscribeHeroSliderDeviceVariants((variants) => {
    listener(variants.desktop);
  });
}

export function useHeroSliderVariant(): [
  HeroSliderVariant,
  (next: HeroSliderVariant) => void,
] {
  const [variant, setVariantState] = useState<HeroSliderVariant>(() =>
    loadHeroSliderVariant()
  );

  useEffect(() => {
    setVariantState(loadHeroSliderVariant());
    return subscribeHeroSliderVariant((next) => {
      setVariantState(next);
    });
  }, []);

  const setVariant = useCallback((next: HeroSliderVariant) => {
    const saved = saveHeroSliderVariant(next);
    setVariantState(saved);
  }, []);

  return [variant, setVariant];
}

export function useHeroSliderDeviceVariants(): {
  variants: HeroSliderDeviceVariants;
  setDesktopVariant: (next: HeroSliderVariant) => HeroSliderDeviceVariants;
  setMobileVariant: (next: HeroSliderVariant) => HeroSliderDeviceVariants;
  setBothVariants: (
    desktop: HeroSliderVariant,
    mobile: HeroSliderVariant
  ) => HeroSliderDeviceVariants;
} {
  const [variants, setVariantsState] = useState<HeroSliderDeviceVariants>(() =>
    loadHeroSliderDeviceVariants()
  );

  useEffect(() => {
    setVariantsState(loadHeroSliderDeviceVariants());
    return subscribeHeroSliderDeviceVariants((next) => {
      setVariantsState(next);
    });
  }, []);

  const setDesktopVariant = useCallback((next: HeroSliderVariant) => {
    const savedDesktop = saveHeroSliderVariant(next);
    const updated: HeroSliderDeviceVariants = {
      desktop: savedDesktop,
      mobile: loadMobileHeroSliderVariant(),
    };
    setVariantsState(updated);
    return updated;
  }, []);

  const setMobileVariant = useCallback((next: HeroSliderVariant) => {
    const savedMobile = saveMobileHeroSliderVariant(next);
    const updated: HeroSliderDeviceVariants = {
      desktop: loadHeroSliderVariant(),
      mobile: savedMobile,
    };
    setVariantsState(updated);
    return updated;
  }, []);

  const setBothVariants = useCallback(
    (desktop: HeroSliderVariant, mobile: HeroSliderVariant) => {
      const updated = saveHeroSliderDeviceVariants(desktop, mobile);
      setVariantsState(updated);
      return updated;
    },
    []
  );

  return {
    variants,
    setDesktopVariant,
    setMobileVariant,
    setBothVariants,
  };
}

export function useIsMobileHeroViewport(maxWidthPx = 767): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const sync = () => setIsMobile(mq.matches);
    sync();

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, [maxWidthPx]);

  return isMobile;
}
