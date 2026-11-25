import { useCallback, useEffect, useState } from 'react';

export type HeroSliderVariant = 'original' | 'cinematic';

export const HERO_SLIDER_VARIANT_STORAGE_KEY = 'rahaltv_hero_slider_variant_v1';
const HERO_SLIDER_VARIANT_EVENT = 'rahaltv:hero-slider-variant-change';

const listeners = new Set<(variant: HeroSliderVariant) => void>();

export function normalizeHeroSliderVariant(value: unknown): HeroSliderVariant {
  return value === 'cinematic' ? 'cinematic' : 'original';
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

export function saveHeroSliderVariant(variant: HeroSliderVariant): HeroSliderVariant {
  const normalized = normalizeHeroSliderVariant(variant);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(HERO_SLIDER_VARIANT_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage quota / privacy mode errors
    }
    try {
      window.dispatchEvent(
        new CustomEvent<HeroSliderVariant>(HERO_SLIDER_VARIANT_EVENT, {
          detail: normalized,
        })
      );
    } catch {
      // Ignore CustomEvent issues on legacy browsers
    }
  }
  listeners.forEach((cb) => {
    try {
      cb(normalized);
    } catch {
      // Ignore subscriber errors
    }
  });
  return normalized;
}

export function subscribeHeroSliderVariant(
  listener: (variant: HeroSliderVariant) => void
): () => void {
  listeners.add(listener);
  if (typeof window === 'undefined') {
    return () => {
      listeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === HERO_SLIDER_VARIANT_STORAGE_KEY) {
      listener(normalizeHeroSliderVariant(event.newValue));
    }
  };

  const handleCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<HeroSliderVariant>;
    listener(normalizeHeroSliderVariant(customEvent.detail));
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(HERO_SLIDER_VARIANT_EVENT, handleCustomEvent);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(HERO_SLIDER_VARIANT_EVENT, handleCustomEvent);
  };
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
