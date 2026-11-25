import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMobileDedicatedSliderVariant,
  loadHeroSliderDeviceVariants,
  loadMobileHeroSliderVariant,
  normalizeHeroSliderVariant,
  saveHeroSliderDeviceVariants,
  saveHeroSliderVariant,
  saveMobileHeroSliderVariant,
} from '../src/lib/heroSliderMode';
import {
  countDroppedStreamV4Logos,
  sanitizeStreamV4SliderConfigForFirestore,
} from '../src/lib/streamV4SliderConfig';
import {
  DEFAULT_MODERATOR_SUB_PERMS,
  normalizeModeratorSubPermissions,
} from '../src/lib/adminPreferences';

test('normalizeHeroSliderVariant validates active variants and falls back removed/unknown modes to original', () => {
  assert.equal(normalizeHeroSliderVariant('original'), 'original');
  assert.equal(normalizeHeroSliderVariant('cinematic'), 'cinematic');
  assert.equal(normalizeHeroSliderVariant('stream_v4'), 'stream_v4');
  assert.equal(normalizeHeroSliderVariant('mobile_stories'), 'mobile_stories');
  assert.equal(normalizeHeroSliderVariant('mobile_cards'), 'mobile_cards');
  assert.equal(normalizeHeroSliderVariant('mobile_spotlight'), 'mobile_spotlight');
  assert.equal(normalizeHeroSliderVariant('showcase'), 'original');
  assert.equal(normalizeHeroSliderVariant('unknown_mode'), 'original');
  assert.equal(normalizeHeroSliderVariant(null), 'original');
  assert.equal(normalizeHeroSliderVariant(undefined), 'original');
  assert.equal(normalizeHeroSliderVariant(42), 'original');

  assert.equal(isMobileDedicatedSliderVariant('original'), false);
  assert.equal(isMobileDedicatedSliderVariant('cinematic'), false);
  assert.equal(isMobileDedicatedSliderVariant('stream_v4'), false);
  assert.equal(isMobileDedicatedSliderVariant('mobile_stories'), true);
  assert.equal(isMobileDedicatedSliderVariant('mobile_cards'), true);
  assert.equal(isMobileDedicatedSliderVariant('mobile_spotlight'), true);
});

test('saveHeroSliderDeviceVariants persists desktop and mobile slider selections independently', () => {
  const store = new Map<string, string>();
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => {
        store.set(key, String(val));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
    dispatchEvent: () => true,
  };

  try {
    // Initially unset mobile falls back to desktop variant
    saveHeroSliderVariant('cinematic');
    assert.equal(loadMobileHeroSliderVariant(), 'cinematic');

    // Setting explicit mobile variant does not overwrite desktop variant
    saveMobileHeroSliderVariant('mobile_stories');
    assert.deepEqual(loadHeroSliderDeviceVariants(), {
      desktop: 'cinematic',
      mobile: 'mobile_stories',
    });

    // Updating both variants preserves distinct desktop and mobile choices
    const saved = saveHeroSliderDeviceVariants('stream_v4', 'mobile_cards');
    assert.deepEqual(saved, {
      desktop: 'stream_v4',
      mobile: 'mobile_cards',
    });
    assert.deepEqual(loadHeroSliderDeviceVariants(), {
      desktop: 'stream_v4',
      mobile: 'mobile_cards',
    });

    // Desktop-only update keeps the chosen mobile style intact
    saveHeroSliderVariant('original');
    assert.deepEqual(loadHeroSliderDeviceVariants(), {
      desktop: 'original',
      mobile: 'mobile_cards',
    });
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  }
});

test('sanitizeStreamV4SliderConfigForFirestore enforces caps on titleLogos, payload size, and clamps slideDurations', () => {
  const manyLogos: Record<string, string> = {};
  const manyDurations: Record<string, number> = {};
  for (let i = 0; i < 75; i++) {
    manyLogos[`item-${i}`] = `https://cdn.example.com/v4/logo-${i}.png`;
    manyDurations[`item-${i}`] = i === 0 ? 1 : i === 1 ? 120 : 12;
  }
  manyDurations['clamped-high'] = 999;
  manyDurations['too-short'] = 1;

  const sanitized = sanitizeStreamV4SliderConfigForFirestore({
    titleLogos: manyLogos,
    slideDurations: manyDurations,
    defaultSlideDurationSec: 95,
    colorMode: 'custom',
    customAccentColor: '#12AB34',
  });

  assert.equal(Object.keys(sanitized.titleLogos).length, 60);
  assert.equal(Object.keys(sanitized.slideDurations).length, 60);
  assert.equal(sanitized.defaultSlideDurationSec, 60);
  assert.equal(sanitized.colorMode, 'custom');
  assert.equal(sanitized.customAccentColor, '#12AB34');
  assert.equal('too-short' in sanitized.slideDurations, false);
  assert.equal(sanitized.slideDurations['item-1'], 60);

  const clampedHighCheck = sanitizeStreamV4SliderConfigForFirestore({
    slideDurations: {
      fast: 2,
      slow: 180,
    },
  });
  assert.equal(clampedHighCheck.slideDurations['fast'], 2);
  assert.equal(clampedHighCheck.slideDurations['slow'], 60);

  const tooBigSingle = 'data:image/png;base64,' + 'A'.repeat(260000);
  const mediumChunk = 'data:image/png;base64,' + 'B'.repeat(200000);
  const budgetRes = sanitizeStreamV4SliderConfigForFirestore({
    titleLogos: {
      'too-big': tooBigSingle,
      'm-1': mediumChunk,
      'm-2': mediumChunk,
      'm-3': mediumChunk,
      'm-4': mediumChunk,
    },
  });
  assert.equal('too-big' in budgetRes.titleLogos, false);
  assert.equal('m-1' in budgetRes.titleLogos, true);
  assert.equal('m-2' in budgetRes.titleLogos, true);
  assert.equal('m-3' in budgetRes.titleLogos, true);
  assert.equal('m-4' in budgetRes.titleLogos, false);
});

test('normalizeModeratorSubPermissions enforces strict 7-key boolean normalization and defaults', () => {
  const defaults = normalizeModeratorSubPermissions(undefined);
  assert.deepEqual(defaults, DEFAULT_MODERATOR_SUB_PERMS);

  const normalized = normalizeModeratorSubPermissions({
    allowBulkEditor: false,
    allowContentAudit: 'invalid' as unknown as boolean,
    allowWatchServers: false,
    allowAnalyticsRead: 1 as unknown as boolean,
    allowCrawlOperations: false,
    allowSiteScraper: true,
    allowAdapters: false,
    extraUnknownKey: true,
  } as Record<string, unknown>);

  assert.deepEqual(normalized, {
    allowBulkEditor: false,
    allowContentAudit: true,
    allowWatchServers: false,
    allowAnalyticsRead: true,
    allowCrawlOperations: false,
    allowSiteScraper: true,
    allowAdapters: false,
  });
  assert.equal(Object.keys(normalized).length, 7);
  assert.equal('extraUnknownKey' in normalized, false);
});

test('countDroppedStreamV4Logos reports 0 for valid compact logos and flags oversized ones', () => {
  assert.equal(
    countDroppedStreamV4Logos({
      titleLogos: {
        m1: 'data:image/webp;base64,' + 'A'.repeat(12000),
        m2: 'https://cdn.example.com/logo.png',
      },
    }),
    0
  );
  assert.equal(
    countDroppedStreamV4Logos({
      titleLogos: {
        m1: 'data:image/png;base64,' + 'A'.repeat(260000),
      },
    }),
    1
  );
});

